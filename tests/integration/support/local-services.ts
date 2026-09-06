import { spawn, spawnSync, type ChildProcess, type ChildProcessByStdio } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import {
  assertDevVarsDoNotOverrideLocalCoordinates,
  assertLocalSupabaseCoordinates,
  LOCAL_SUPABASE_API_URL,
} from "./local-coordinates";

const REPO_ROOT = process.cwd();
const SUPABASE_BIN = path.join(REPO_ROOT, "node_modules", ".bin", "supabase");
const NPM_BIN = process.platform === "win32" ? "npm.cmd" : "npm";

const ASTRO_HOST = "127.0.0.1";
const ASTRO_PORT = 14567;
const READINESS_TIMEOUT_MS = 90_000;
const READINESS_INTERVAL_MS = 500;
const ASTRO_STOP_GRACE_MS = 5_000;

/** stdin ignored; stdout/stderr piped for readiness logs (integration default). */
type AstroDevProcess = ChildProcessByStdio<null, Readable, Readable>;

export interface LocalServiceHandles {
  astroBaseUrl: string;
  supabaseUrl: string;
  supabaseKey: string;
  supabaseDbUrl: string;
  startedSupabase: boolean;
  astroProcess: ChildProcess;
  astroOutput: string[];
}

export interface LocalServiceSnapshot {
  astroPid: number;
  startedSupabase: boolean;
}

export interface StartLocalServicesOptions {
  /** Keep Astro running after this process exits (Playwright globalSetup). */
  surviveParentExit?: boolean;
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
    .replace(/sb_secret_[A-Za-z0-9_-]+/g, "[REDACTED_KEY]")
    .replace(/Cookie: [^\n]*/gi, "Cookie: [REDACTED_COOKIE]")
    .replace(/postgresql:\/\/[^@\s]+@/g, "postgresql://[REDACTED_USERINFO]@");
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

function signalPidTree(pid: number, signal: NodeJS.Signals): void {
  try {
    if (process.platform !== "win32") {
      process.kill(-pid, signal);
      return;
    }
    process.kill(pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // already gone
    }
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForPidExit(pid: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) {
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }
}

async function stopAstroProcessByPid(pid: number): Promise<void> {
  signalPidTree(pid, "SIGTERM");
  await waitForPidExit(pid, ASTRO_STOP_GRACE_MS);
  if (isPidAlive(pid)) {
    signalPidTree(pid, "SIGKILL");
    await waitForPidExit(pid, 1_000);
  }
}

function signalAstroTree(child: ChildProcess, signal: NodeJS.Signals): void {
  const pid = child.pid;
  if (!pid) {
    return;
  }
  try {
    if (process.platform !== "win32") {
      process.kill(-pid, signal);
      return;
    }
    child.kill(signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // already gone
    }
  }
}

async function waitForProcessExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function stopAstroProcess(child: ChildProcess): Promise<void> {
  signalAstroTree(child, "SIGTERM");
  await waitForProcessExit(child, ASTRO_STOP_GRACE_MS);
  if (child.exitCode === null && child.signalCode === null) {
    signalAstroTree(child, "SIGKILL");
    await waitForProcessExit(child, 1_000);
  }
}

function stopSupabaseStack(): void {
  spawnSync(SUPABASE_BIN, ["stop"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: "ignore",
  });
}

async function assertLoopbackPortFree(host: string, port: number): Promise<void> {
  try {
    const response = await fetch(`http://${host}:${port}/`, { redirect: "manual" });
    await response.body?.cancel();
    throw new Error(`Refusing to start Astro: ${host}:${port} is already responding`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("already responding")) {
      throw error;
    }
  }
}

async function waitForHttpOk(url: string, timeoutMs: number, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Astro process exited during readiness (code ${child.exitCode})`);
    }
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

function captureProcessOutput(child: AstroDevProcess, buffer: string[]): void {
  const attach = (stream: Readable) => {
    const reader = createInterface({ input: stream });
    reader.on("line", (line) => {
      buffer.push(redactSensitiveOutput(line));
    });
  };
  attach(child.stdout);
  attach(child.stderr);
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

function parseDotEnv(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function readDevVarsIfPresent(): Record<string, string> {
  const devVarsPath = path.join(REPO_ROOT, ".dev.vars");
  if (!existsSync(devVarsPath)) {
    return {};
  }
  return parseDotEnv(readFileSync(devVarsPath, "utf8"));
}

function startAstroDev(supabaseUrl: string, supabaseKey: string, surviveParentExit?: false): AstroDevProcess;
function startAstroDev(supabaseUrl: string, supabaseKey: string, surviveParentExit: true): ChildProcess;
function startAstroDev(
  supabaseUrl: string,
  supabaseKey: string,
  surviveParentExit = false,
): ChildProcess | AstroDevProcess {
  const child = spawn(NPM_BIN, ["run", "dev", "--", "--host", ASTRO_HOST, "--port", String(ASTRO_PORT)], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      SUPABASE_URL: supabaseUrl,
      SUPABASE_KEY: supabaseKey,
      SUPABASE_SERVICE_ROLE_KEY: "",
    },
    stdio: surviveParentExit ? "ignore" : ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });

  child.on("error", (error) => {
    throw error;
  });

  return child;
}

export function toLocalServiceSnapshot(handles: LocalServiceHandles): LocalServiceSnapshot {
  const astroPid = handles.astroProcess.pid;
  if (typeof astroPid !== "number") {
    throw new Error("Astro process has no pid to persist for Playwright teardown");
  }
  return { astroPid, startedSupabase: handles.startedSupabase };
}

export function parseLocalServiceSnapshot(raw: string): LocalServiceSnapshot {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Invalid Playwright local-service snapshot");
  }
  if (!("astroPid" in parsed) || !("startedSupabase" in parsed)) {
    throw new Error("Invalid Playwright local-service snapshot");
  }
  if (typeof parsed.astroPid !== "number" || !Number.isInteger(parsed.astroPid) || parsed.astroPid <= 0) {
    throw new Error("Invalid Playwright local-service snapshot");
  }
  if (typeof parsed.startedSupabase !== "boolean") {
    throw new Error("Invalid Playwright local-service snapshot");
  }
  return { astroPid: parsed.astroPid, startedSupabase: parsed.startedSupabase };
}

export async function stopLocalServicesFromSnapshot(snapshot: LocalServiceSnapshot): Promise<void> {
  await stopAstroProcessByPid(snapshot.astroPid);
  if (snapshot.startedSupabase) {
    stopSupabaseStack();
  }
}

export async function startLocalServices(options: StartLocalServicesOptions = {}): Promise<LocalServiceHandles> {
  const surviveParentExit = options.surviveParentExit === true;
  let startedSupabase = false;
  let astroProcess: ChildProcess | undefined;

  try {
    let status = readSupabaseStatus();

    if (!isSupabaseHealthy(status)) {
      startSupabaseStack();
      startedSupabase = true;
      status = readSupabaseStatus();
    }

    if (!isSupabaseHealthy(status)) {
      throw new Error(
        `Local Supabase stack is unavailable after startup attempt (cwd=${process.cwd()}, status=${redactSensitiveOutput(JSON.stringify(status))})`,
      );
    }

    const supabaseUrl = status.API_URL;
    const supabaseDbUrl = status.DB_URL;
    assertLocalSupabaseCoordinates(supabaseUrl, supabaseDbUrl);

    const supabaseKey = resolveLocalSupabaseKey(status);
    assertDevVarsDoNotOverrideLocalCoordinates(readDevVarsIfPresent(), supabaseUrl);
    if (process.env.SUPABASE_URL && process.env.SUPABASE_URL !== supabaseUrl) {
      throw new Error("Refusing to start Astro because ambient SUPABASE_URL is not the verified local loopback URL");
    }

    await assertLoopbackPortFree(ASTRO_HOST, ASTRO_PORT);

    const astroOutput: string[] = [];
    if (surviveParentExit) {
      astroProcess = startAstroDev(supabaseUrl, supabaseKey, true);
    } else {
      const pipedAstroProcess = startAstroDev(supabaseUrl, supabaseKey);
      captureProcessOutput(pipedAstroProcess, astroOutput);
      astroProcess = pipedAstroProcess;
    }

    const astroBaseUrl = `http://${ASTRO_HOST}:${ASTRO_PORT}`;

    try {
      await waitForHttpOk(`${astroBaseUrl}/`, READINESS_TIMEOUT_MS, astroProcess);
    } catch (error) {
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

    if (surviveParentExit) {
      astroProcess.unref();
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
  } catch (error) {
    if (astroProcess) {
      await stopAstroProcess(astroProcess);
    }
    if (startedSupabase) {
      stopSupabaseStack();
    }
    throw error;
  }
}

export async function stopLocalServices(handles: LocalServiceHandles): Promise<void> {
  await stopAstroProcess(handles.astroProcess);

  if (handles.startedSupabase) {
    stopSupabaseStack();
  }
}
