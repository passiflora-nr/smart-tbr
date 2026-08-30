import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isBookMutationSuccess } from "@/lib/book-schema";
import type { Database, Tables } from "@/lib/database.types";
import { fetchUnknownJson, postFormWithManualRedirect } from "./http-session";
import { assertLocalSupabaseCoordinates } from "./local-coordinates";

export const USER_D_EMAIL = "user-d@example.test";
export const USER_D_PASSWORD = "password123";
export const USER_D_ID = "d0000000-0000-4000-8000-000000000001";
export const INTEGRATION_TEST_TITLE_PREFIX = "[integration-test]";

export function createRunTitlePrefix(): string {
  return `${INTEGRATION_TEST_TITLE_PREFIX}${Date.now()}-`;
}

function assertReservedTitlePrefix(prefix: string): void {
  if (!prefix.startsWith(INTEGRATION_TEST_TITLE_PREFIX)) {
    throw new Error("Cleanup prefix must start with the reserved integration-test title prefix");
  }
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
  assertReservedTitlePrefix(prefix);
  const { data, error } = await client
    .from("books")
    .select("id, title")
    .eq("user_id", USER_D_ID)
    .like("title", `${prefix}%`);
  if (error) {
    throw new Error(`Failed to list user-D books for cleanup: ${error.message}`);
  }

  const matchingIds = data.map((row) => row.id);

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
  assertReservedTitlePrefix(prefix);
  const { data, error } = await client
    .from("books")
    .select("id, title")
    .eq("user_id", USER_D_ID)
    .like("title", `${prefix}%`);
  if (error) {
    throw new Error(`Failed to list user-D books: ${error.message}`);
  }
  return data;
}

export async function createBookViaApi(
  astroOrigin: string,
  cookieHeader: string,
  verificationClient: SupabaseClient<Database>,
  book: {
    title: string;
    author: string;
    description: string | null;
    tropes: string[];
  },
): Promise<{ id: string; book: Tables<"books"> }> {
  assertReservedTitlePrefix(book.title);

  const createResult = await fetchUnknownJson(`${astroOrigin}/api/books`, {
    method: "POST",
    origin: astroOrigin,
    cookieHeader,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: book.title,
      author: book.author,
      description: book.description,
      tropes: book.tropes,
    }),
  });

  if (createResult.response.status !== 201) {
    throw new Error(`Expected 201 creating book via API, got status ${createResult.response.status}`);
  }
  if (!isBookMutationSuccess(createResult.body)) {
    throw new Error("Expected a successful book mutation response");
  }

  const createdBookId = createResult.body.book.id;
  const { data: persisted, error: readError } = await verificationClient
    .from("books")
    .select("id, user_id, title, author, description, tropes, created_at, updated_at")
    .eq("id", createdBookId)
    .maybeSingle();

  if (readError || !persisted) {
    await deleteBookViaAstroForm(astroOrigin, cookieHeader, createdBookId);
    throw new Error(
      "Split-brain safety failure: Astro returned 201 but the local verification client could not read the row",
    );
  }

  return { id: createdBookId, book: createResult.body.book };
}

export async function assertUserDHasOnlyReservedFixtures(client: SupabaseClient<Database>): Promise<void> {
  const { data, error } = await client.from("books").select("title").eq("user_id", USER_D_ID);
  if (error) {
    throw new Error(`Failed to list user-D books for fixture hygiene: ${error.message}`);
  }

  const strayTitles = data.map((row) => row.title).filter((title) => !title.startsWith(INTEGRATION_TEST_TITLE_PREFIX));
  if (strayTitles.length === 0) {
    return;
  }

  throw new Error(
    `User D must stay fixture-only. These books do not start with "${INTEGRATION_TEST_TITLE_PREFIX}": ${strayTitles.join(", ")}. Sign in as user D and delete those books, then re-run the tests.`,
  );
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
