import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { createInterface } from "node:readline";
import { assertLocalSupabaseCoordinates, LOCAL_SUPABASE_API_URL } from "./local-coordinates";

const REPO_ROOT = process.cwd();
const SUPABASE_BIN = path.join(REPO_ROOT, "node_modules", ".bin", "supabase");
const NPM_BIN = process.platform === "win32" ? "npm.cmd" : "npm";

const ASTRO_HOST = "127.0.0.1";
const ASTRO_PORT = 14567;
const READINESS_TIMEOUT_MS = 90_000;
const READINESS_INTERVAL_MS = 500;

export interface LocalServiceHandles {
  astroBaseUrl: string;
  supabaseUrl: string;
  supabaseKey: string;
  supabaseDbUrl: string;
  startedSupabase: boolean;
  astroProcess: ChildProcessWithoutNullStreams;
  astroOutput: string[];
}

interface SupabaseStatusJson {
  API_URL?: string;
  DB_URL?: string;
  PUBLISHABLE_KEY?: string;
  ANON_KEY?: string;
}

function redactSensitiveOutput(text: string): string {
  return text
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_TOKEN]")
    .replace(/sb_publishable_[A-Za-z0-9_-]+/g, "[REDACTED_KEY]")
    .replace(/sb_secret_[A-Za-z0-9_-]+/g, "[REDACTED_KEY]");
}

function parseSupabaseStatusJson(raw: string): SupabaseStatusJson {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Supabase status did not return JSON output");
  }
  const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Supabase status JSON was not an object");
  }
  return parsed;
}

function readSupabaseStatus(): SupabaseStatusJson | null {
  const result = spawnSync(SUPABASE_BIN, ["status", "--output", "json"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const combined = `${result.stdout}\n${result.stderr}`.trim();
  if (result.error) {
    throw new Error(`Supabase status spawn failed: ${result.error.message}`);
  }
  if (!combined.includes("{")) {
    return null;
  }

  try {
    return parseSupabaseStatusJson(combined);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown parse error";
    throw new Error(`Supabase status JSON parse failed: ${message}`);
  }
}

function resolveLocalSupabaseKey(status: SupabaseStatusJson): string {
  const key = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
  if (!key) {
    throw new Error("Local Supabase status is missing publishable and anon keys");
  }
  return key;
}

async function waitForHttpOk(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status >= 200 && response.status < 500) {
        return;
      }
    } catch {
      // retry until timeout
    }
    await new Promise((resolve) => setTimeout(resolve, READINESS_INTERVAL_MS));
  }
  throw new Error(`Timed out waiting for HTTP readiness at ${url}`);
}

function captureProcessOutput(process: ChildProcessWithoutNullStreams, buffer: string[]): void {
  const attach = (stream: NodeJS.ReadableStream) => {
    const reader = createInterface({ input: stream });
    reader.on("line", (line) => {
      buffer.push(redactSensitiveOutput(line));
    });
  };
  attach(process.stdout);
  attach(process.stderr);
}

function isSupabaseHealthy(status: SupabaseStatusJson | null): status is SupabaseStatusJson & {
  API_URL: string;
  DB_URL: string;
} {
  if (!status?.API_URL || !status.DB_URL) {
    return false;
  }
  try {
    assertLocalSupabaseCoordinates(status.API_URL, status.DB_URL);
  } catch {
    return false;
  }
  return true;
}

function startSupabaseStack(): void {
  const result = spawnSync(
    SUPABASE_BIN,
    ["start", "--exclude", "studio,imgproxy,edge-runtime,supavisor,logflare,vector"],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 240_000,
    },
  );

  if (result.status !== 0) {
    const output = redactSensitiveOutput(`${result.stdout}\n${result.stderr}`);
    throw new Error(`Failed to start local Supabase stack:\n${output}`);
  }
}

function startAstroDev(supabaseUrl: string, supabaseKey: string): ChildProcessWithoutNullStreams {
  const child = spawn(NPM_BIN, ["run", "dev", "--", "--host", ASTRO_HOST, "--port", String(ASTRO_PORT)], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      SUPABASE_URL: supabaseUrl,
      SUPABASE_KEY: supabaseKey,
      SUPABASE_SERVICE_ROLE_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.on("error", (error) => {
    throw error;
  });

  return child;
}

export async function startLocalServices(): Promise<LocalServiceHandles> {
  let startedSupabase = false;
  let status = readSupabaseStatus();

  if (!isSupabaseHealthy(status)) {
    startSupabaseStack();
    startedSupabase = true;
    status = readSupabaseStatus();
  }

  if (!isSupabaseHealthy(status)) {
    throw new Error(
      `Local Supabase stack is unavailable after startup attempt (cwd=${process.cwd()}, status=${JSON.stringify(status)})`,
    );
  }

  const supabaseUrl = status.API_URL;
  const supabaseDbUrl = status.DB_URL;
  assertLocalSupabaseCoordinates(supabaseUrl, supabaseDbUrl);

  const supabaseKey = resolveLocalSupabaseKey(status);
  const astroOutput: string[] = [];
  const astroProcess = startAstroDev(supabaseUrl, supabaseKey);
  captureProcessOutput(astroProcess, astroOutput);

  const astroBaseUrl = `http://${ASTRO_HOST}:${ASTRO_PORT}`;

  try {
    await waitForHttpOk(`${astroBaseUrl}/`, READINESS_TIMEOUT_MS);
  } catch (error) {
    astroProcess.kill("SIGTERM");
    const tail = astroOutput.slice(-40).join("\n");
    const reason = error instanceof Error ? error.message : "Astro readiness probe failed";
    throw new Error(`${reason}\nRecent Astro output:\n${tail}`);
  }

  if (astroProcess.exitCode !== null) {
    const tail = astroOutput.slice(-40).join("\n");
    throw new Error(`Astro dev server exited before tests could run\nRecent Astro output:\n${tail}`);
  }

  if (supabaseUrl !== LOCAL_SUPABASE_API_URL) {
    throw new Error("Refusing to run integration tests against unexpected Supabase API URL");
  }

  return {
    astroBaseUrl,
    supabaseUrl,
    supabaseKey,
    supabaseDbUrl,
    startedSupabase,
    astroProcess,
    astroOutput,
  };
}

export async function stopLocalServices(handles: LocalServiceHandles): Promise<void> {
  handles.astroProcess.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  handles.astroProcess.kill("SIGKILL");

  if (handles.startedSupabase) {
    spawnSync(SUPABASE_BIN, ["stop"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: "ignore",
    });
  }
}
