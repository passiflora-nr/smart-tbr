/**
 * Cookie-free service-role client. This client bypasses Row-Level Security,
 * must only be imported by `src/pages/api/account/delete.ts`, and must never
 * be imported by a React island or used for TBR queries.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "astro:env/server";
import type { Database } from "./database.types";

export function createAdminClient(): SupabaseClient<Database> | null {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
