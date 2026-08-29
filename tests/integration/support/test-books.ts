import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { assertLocalSupabaseCoordinates } from "./local-coordinates";
import { postFormWithManualRedirect } from "./http-session";

export const USER_D_EMAIL = "user-d@example.test";
export const USER_D_PASSWORD = "password123";
export const USER_D_ID = "d0000000-0000-4000-8000-000000000001";
export const INTEGRATION_TEST_TITLE_PREFIX = "[integration-test]";

export function createRunTitlePrefix(): string {
  return `${INTEGRATION_TEST_TITLE_PREFIX}${Date.now()}-`;
}

export async function createAuthenticatedVerificationClient(
  supabaseUrl: string,
  supabaseKey: string,
  supabaseDbUrl: string,
): Promise<SupabaseClient<Database>> {
  assertLocalSupabaseCoordinates(supabaseUrl, supabaseDbUrl);

  const client = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { error } = await client.auth.signInWithPassword({
    email: USER_D_EMAIL,
    password: USER_D_PASSWORD,
  });

  if (error) {
    throw new Error(`Verification client sign-in failed: ${error.message}`);
  }

  return client;
}

export async function cleanupBooksWithTitlePrefix(client: SupabaseClient<Database>, prefix: string): Promise<void> {
  const { data, error } = await client.from("books").select("id, title").eq("user_id", USER_D_ID);
  if (error) {
    throw new Error(`Failed to list user-D books for cleanup: ${error.message}`);
  }

  const matchingIds = data.filter((row) => row.title.startsWith(prefix)).map((row) => row.id);

  for (const id of matchingIds) {
    const { error: deleteError } = await client.from("books").delete().eq("id", id).eq("user_id", USER_D_ID);
    if (deleteError) {
      throw new Error(`Failed to delete fixture book ${id}: ${deleteError.message}`);
    }
  }
}

export async function listBooksWithTitlePrefix(
  client: SupabaseClient<Database>,
  prefix: string,
): Promise<{ id: string; title: string }[]> {
  const { data, error } = await client.from("books").select("id, title").eq("user_id", USER_D_ID);
  if (error) {
    throw new Error(`Failed to list user-D books: ${error.message}`);
  }
  return data.filter((row) => row.title.startsWith(prefix));
}

export async function deleteBookViaAstroForm(astroOrigin: string, cookieHeader: string, bookId: string): Promise<void> {
  const response = await postFormWithManualRedirect(
    `${astroOrigin}/api/books/${bookId}/delete`,
    {},
    cookieHeader,
    astroOrigin,
  );

  if (response.status !== 302 && response.status !== 303) {
    throw new Error(`Expected redirect after delete, got status ${response.status}`);
  }
}
