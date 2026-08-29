import { describe, expect, it } from "vitest";
import {
  assertLocalSupabaseCoordinates,
  LOCAL_SUPABASE_API_URL,
  LOCAL_SUPABASE_DB_URL,
} from "../integration/support/local-coordinates";

describe("assertLocalSupabaseCoordinates", () => {
  it("accepts the configured local loopback coordinates", () => {
    expect(() => {
      assertLocalSupabaseCoordinates(LOCAL_SUPABASE_API_URL, LOCAL_SUPABASE_DB_URL);
    }).not.toThrow();
  });

  it("rejects a hosted Supabase API URL before any client is constructed", () => {
    expect(() => {
      assertLocalSupabaseCoordinates("https://kahvpxeygnmqpysrskok.supabase.co", LOCAL_SUPABASE_DB_URL);
    }).toThrow(/hosted Supabase API URL/i);
  });

  it("rejects a non-loopback API host", () => {
    expect(() => {
      assertLocalSupabaseCoordinates("http://192.168.1.10:54321", LOCAL_SUPABASE_DB_URL);
    }).toThrow(/non-loopback Supabase API host/i);
  });

  it("rejects a wrong local API port", () => {
    expect(() => {
      assertLocalSupabaseCoordinates("http://127.0.0.1:54320", LOCAL_SUPABASE_DB_URL);
    }).toThrow(/wrong local port/i);
  });

  it("rejects a wrong local database port", () => {
    expect(() => {
      assertLocalSupabaseCoordinates(LOCAL_SUPABASE_API_URL, "postgresql://postgres:postgres@127.0.0.1:54321/postgres");
    }).toThrow(/wrong local port/i);
  });
});
