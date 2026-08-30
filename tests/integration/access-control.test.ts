import { afterAll, beforeAll, describe, expect, it, inject } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ACCOUNT_DELETE_CONFIRMATION_FIELD, ACCOUNT_DELETE_CONFIRMATION_WORD } from "@/lib/account-schema";
import { isBookMutationError } from "@/lib/book-schema";
import type { Database, Tables } from "@/lib/database.types";
import { PROTECTED_ROUTE_PREFIXES } from "@/lib/protected-routes";
import { fetchAuthedHtml, fetchUnknownJson, postFormWithManualRedirect, signInWithForm } from "./support/http-session";
import {
  cleanupBooksWithTitlePrefix,
  createAuthenticatedVerificationClient,
  createBookViaApi,
  createRunTitlePrefix,
  INTEGRATION_TEST_TITLE_PREFIX,
  USER_D_EMAIL,
  USER_D_PASSWORD,
} from "./support/test-books";

const USER_A_EMAIL = "user-a@example.test";
const USER_A_PASSWORD = "password123";
const HOSTILE_ORIGIN = "https://evil.example";

function expectSignInRedirect(response: Response): void {
  expect(response.status).toBe(302);
  const location = response.headers.get("location") ?? "";
  expect(location).toContain("/auth/signin");
}

async function readVictimBook(client: SupabaseClient<Database>, bookId: string): Promise<Tables<"books">> {
  const { data, error } = await client
    .from("books")
    .select("id, user_id, title, author, description, tropes, created_at, updated_at")
    .eq("id", bookId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(`Expected victim book ${bookId} to exist for verification`);
  }

  return data;
}

describe("access control over HTTP", () => {
  const astroBaseUrl = inject("astroBaseUrl");
  const supabaseUrl = inject("supabaseUrl");
  const supabaseKey = inject("supabaseKey");
  const supabaseDbUrl = inject("supabaseDbUrl");

  let ownerCookieHeader = "";
  let attackerCookieHeader = "";
  let verificationClient: SupabaseClient<Database>;
  let runTitlePrefix = "";
  let victimBookId = "";
  let victimBook: Tables<"books">;

  beforeAll(async () => {
    ownerCookieHeader = await signInWithForm(astroBaseUrl, USER_D_EMAIL, USER_D_PASSWORD);
    attackerCookieHeader = await signInWithForm(astroBaseUrl, USER_A_EMAIL, USER_A_PASSWORD);
    verificationClient = await createAuthenticatedVerificationClient(supabaseUrl, supabaseKey, supabaseDbUrl);
    runTitlePrefix = createRunTitlePrefix();
    await cleanupBooksWithTitlePrefix(verificationClient, INTEGRATION_TEST_TITLE_PREFIX);

    let setupFailed = true;
    try {
      const created = await createBookViaApi(astroBaseUrl, ownerCookieHeader, verificationClient, {
        title: `${runTitlePrefix}Access Control Victim`,
        author: "Victim Author",
        description: "Owned by user D for access-control coverage.",
        tropes: ["contemporary", "romance"],
      });
      victimBookId = created.id;
      victimBook = created.book;
      setupFailed = false;
    } finally {
      if (setupFailed) {
        await cleanupBooksWithTitlePrefix(verificationClient, runTitlePrefix);
        await cleanupBooksWithTitlePrefix(verificationClient, INTEGRATION_TEST_TITLE_PREFIX);
      }
    }
  });

  afterAll(async () => {
    await cleanupBooksWithTitlePrefix(verificationClient, runTitlePrefix);
    await cleanupBooksWithTitlePrefix(verificationClient, INTEGRATION_TEST_TITLE_PREFIX);
    await verificationClient.auth.signOut();
  });

  it("returns 401 JSON for signed-out book JSON mutations", async () => {
    const createResult = await fetchUnknownJson(`${astroBaseUrl}/api/books`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `${runTitlePrefix}Should Not Create`,
        author: "Nobody",
        description: null,
        tropes: ["contemporary"],
      }),
    });

    expect(createResult.response.status).toBe(401);
    expect(createResult.response.headers.get("content-type") ?? "").toContain("application/json");
    expect(isBookMutationError(createResult.body)).toBe(true);
    if (!isBookMutationError(createResult.body)) {
      throw new Error("Expected a book mutation error response");
    }
    expect(createResult.body.error).toBe("Unauthorized");

    const updateResult = await fetchUnknownJson(`${astroBaseUrl}/api/books/${victimBookId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: victimBook.title,
        author: victimBook.author,
        description: victimBook.description,
        tropes: victimBook.tropes,
      }),
    });

    expect(updateResult.response.status).toBe(401);
    expect(updateResult.response.headers.get("content-type") ?? "").toContain("application/json");
    expect(isBookMutationError(updateResult.body)).toBe(true);
    if (!isBookMutationError(updateResult.body)) {
      throw new Error("Expected a book mutation error response");
    }
    expect(updateResult.body.error).toBe("Unauthorized");
  });

  it("redirects signed-out form deletes to sign-in when Origin matches the app", async () => {
    const bookDeleteResponse = await postFormWithManualRedirect(
      `${astroBaseUrl}/api/books/${victimBookId}/delete`,
      {},
      "",
      astroBaseUrl,
    );
    expectSignInRedirect(bookDeleteResponse);

    const accountDeleteResponse = await postFormWithManualRedirect(
      `${astroBaseUrl}/api/account/delete`,
      { [ACCOUNT_DELETE_CONFIRMATION_FIELD]: ACCOUNT_DELETE_CONFIRMATION_WORD },
      "",
      astroBaseUrl,
    );
    expectSignInRedirect(accountDeleteResponse);

    const unchanged = await readVictimBook(verificationClient, victimBookId);
    expect(unchanged.title).toBe(victimBook.title);
  });

  it("treats a wrong-owner JSON update as not found without mutating the victim row", async () => {
    const updateResult = await fetchUnknownJson(`${astroBaseUrl}/api/books/${victimBookId}`, {
      method: "PUT",
      origin: astroBaseUrl,
      cookieHeader: attackerCookieHeader,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `${runTitlePrefix}Stolen Title`,
        author: "Attacker Author",
        description: "Attempted takeover.",
        tropes: ["fantasy"],
      }),
    });

    expect(updateResult.response.status).toBe(404);
    expect(isBookMutationError(updateResult.body)).toBe(true);
    if (!isBookMutationError(updateResult.body)) {
      throw new Error("Expected a book mutation error response");
    }
    expect(updateResult.body.error).toBe("Book not found");

    const unchanged = await readVictimBook(verificationClient, victimBookId);
    expect(unchanged.title).toBe(victimBook.title);
    expect(unchanged.author).toBe(victimBook.author);
    expect(unchanged.description).toBe(victimBook.description);
    expect(unchanged.tropes).toEqual(victimBook.tropes);
    expect(unchanged.user_id).toBe(victimBook.user_id);
    expect(unchanged.id).toBe(victimBook.id);
  });

  it("treats a wrong-owner form delete as not found without deleting the victim row", async () => {
    const response = await postFormWithManualRedirect(
      `${astroBaseUrl}/api/books/${victimBookId}/delete`,
      {},
      attackerCookieHeader,
      astroBaseUrl,
    );

    expect(response.status).toBe(302);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("error=not_found");
    expect(location).not.toContain("notice=deleted");

    const unchanged = await readVictimBook(verificationClient, victimBookId);
    expect(unchanged.id).toBe(victimBookId);
  });

  it("blocks a wrong-owner edit page without exposing the victim title", async () => {
    const { response, body } = await fetchAuthedHtml(
      `${astroBaseUrl}/books/${victimBookId}/edit`,
      attackerCookieHeader,
    );

    expect(response.status).toBe(302);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("error=not_found");
    expect(body).not.toContain(victimBook.title);

    const unchanged = await readVictimBook(verificationClient, victimBookId);
    expect(unchanged.id).toBe(victimBookId);
  });

  it("rejects cross-site and origin-less book delete forms for the owner", async () => {
    const hostileResponse = await postFormWithManualRedirect(
      `${astroBaseUrl}/api/books/${victimBookId}/delete`,
      {},
      ownerCookieHeader,
      HOSTILE_ORIGIN,
    );
    expect(hostileResponse.status).toBe(403);

    const missingOriginResponse = await postFormWithManualRedirect(
      `${astroBaseUrl}/api/books/${victimBookId}/delete`,
      {},
      ownerCookieHeader,
      null,
    );
    expect(missingOriginResponse.status).toBe(403);

    const unchanged = await readVictimBook(verificationClient, victimBookId);
    expect(unchanged.id).toBe(victimBookId);
  });

  it("redirects signed-out visitors away from protected pages while leaving public pages reachable", async () => {
    for (const prefix of PROTECTED_ROUTE_PREFIXES) {
      const response = await fetch(`${astroBaseUrl}${prefix}`, { redirect: "manual" });
      expectSignInRedirect(response);
    }

    const nestedProtectedPaths = [`/books/new`, `/books/${victimBookId}/edit`];
    for (const path of nestedProtectedPaths) {
      const response = await fetch(`${astroBaseUrl}${path}`, { redirect: "manual" });
      expectSignInRedirect(response);
    }

    const homeResponse = await fetch(`${astroBaseUrl}/`, { redirect: "manual" });
    expect(homeResponse.status).toBe(200);
    expect(homeResponse.headers.get("location")).toBeNull();

    const signInResponse = await fetch(`${astroBaseUrl}/auth/signin`, { redirect: "manual" });
    expect(signInResponse.status).toBe(200);
    expect(signInResponse.headers.get("location")).toBeNull();
  });

  it("rejects forged account-delete forms before the handler and leaves the owner signed in", async () => {
    const fields = { [ACCOUNT_DELETE_CONFIRMATION_FIELD]: ACCOUNT_DELETE_CONFIRMATION_WORD };

    const hostileResponse = await postFormWithManualRedirect(
      `${astroBaseUrl}/api/account/delete`,
      fields,
      ownerCookieHeader,
      HOSTILE_ORIGIN,
    );
    if (hostileResponse.status !== 403) {
      throw new Error(
        `Account delete with hostile Origin must return 403 before the handler runs; got ${String(hostileResponse.status)}`,
      );
    }

    const missingOriginResponse = await postFormWithManualRedirect(
      `${astroBaseUrl}/api/account/delete`,
      fields,
      ownerCookieHeader,
      null,
    );
    if (missingOriginResponse.status !== 403) {
      throw new Error(
        `Account delete without Origin must return 403 before the handler runs; got ${String(missingOriginResponse.status)}`,
      );
    }

    const authedBooksResponse = await fetch(`${astroBaseUrl}/books`, {
      headers: { Cookie: ownerCookieHeader },
      redirect: "manual",
    });
    expect(authedBooksResponse.status).toBe(200);
  });
});
