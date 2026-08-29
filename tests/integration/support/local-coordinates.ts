export const LOCAL_SUPABASE_API_URL = "http://127.0.0.1:54321";
export const LOCAL_SUPABASE_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export function assertLocalSupabaseCoordinates(apiUrl: string, dbUrl: string): void {
  if (apiUrl.includes("supabase.co")) {
    throw new Error(`Refusing hosted Supabase API URL before any client is constructed`);
  }

  if (apiUrl !== LOCAL_SUPABASE_API_URL) {
    let host = "unknown";
    let port = "unknown";
    try {
      const parsed = new URL(apiUrl);
      host = parsed.hostname;
      port = parsed.port || parsed.protocol.replace(":", "");
    } catch {
      // keep defaults
    }
    if (host !== "127.0.0.1" && host !== "localhost") {
      throw new Error(`Refusing non-loopback Supabase API host: ${host}`);
    }
    throw new Error(`Refusing Supabase API URL on wrong local port: ${port} (expected 54321)`);
  }

  if (dbUrl !== LOCAL_SUPABASE_DB_URL) {
    if (dbUrl.includes("supabase.co")) {
      throw new Error(`Refusing hosted Supabase database URL before any client is constructed`);
    }
    let host = "unknown";
    let port = "unknown";
    try {
      const parsed = new URL(dbUrl.replace(/^postgresql:/, "http:"));
      host = parsed.hostname;
      port = parsed.port || "5432";
    } catch {
      // keep defaults
    }
    if (host !== "127.0.0.1" && host !== "localhost") {
      throw new Error(`Refusing non-loopback Supabase database host: ${host}`);
    }
    throw new Error(`Refusing Supabase database URL on wrong local port: ${port} (expected 54322)`);
  }
}
