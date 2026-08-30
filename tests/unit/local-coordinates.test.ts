import { describe, expect, it } from "vitest";
import {
  assertDevVarsDoNotOverrideLocalCoordinates,
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

describe("assertDevVarsDoNotOverrideLocalCoordinates", () => {
  it("accepts a missing or matching local URL", () => {
    expect(() => {
      assertDevVarsDoNotOverrideLocalCoordinates({}, LOCAL_SUPABASE_API_URL);
    }).not.toThrow();
    expect(() => {
      assertDevVarsDoNotOverrideLocalCoordinates({ SUPABASE_URL: LOCAL_SUPABASE_API_URL }, LOCAL_SUPABASE_API_URL);
    }).not.toThrow();
  });

  it("rejects a hosted URL before Astro starts", () => {
    expect(() => {
      assertDevVarsDoNotOverrideLocalCoordinates(
        { SUPABASE_URL: "https://kahvpxeygnmqpysrskok.supabase.co" },
        LOCAL_SUPABASE_API_URL,
      );
    }).toThrow(/not the verified local loopback URL/i);
  });

  it("accepts a missing or empty service-role key", () => {
    expect(() => {
      assertDevVarsDoNotOverrideLocalCoordinates({}, LOCAL_SUPABASE_API_URL);
    }).not.toThrow();
    expect(() => {
      assertDevVarsDoNotOverrideLocalCoordinates({ SUPABASE_SERVICE_ROLE_KEY: "" }, LOCAL_SUPABASE_API_URL);
    }).not.toThrow();
  });

  it("rejects a set service-role key before Astro starts", () => {
    expect(() => {
      assertDevVarsDoNotOverrideLocalCoordinates(
        { SUPABASE_SERVICE_ROLE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example" },
        LOCAL_SUPABASE_API_URL,
      );
    }).toThrow(/SUPABASE_SERVICE_ROLE_KEY is set/i);
  });
});
