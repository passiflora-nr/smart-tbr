import { afterAll, beforeAll, describe, expect, it, inject } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { isBookMutationSuccess } from "@/lib/book-schema";
import { fetchUnknownJson, signInWithForm } from "./support/http-session";
import {
  cleanupBooksWithTitlePrefix,
  createAuthenticatedVerificationClient,
  createRunTitlePrefix,
  deleteBookViaAstroForm,
  INTEGRATION_TEST_TITLE_PREFIX,
  listBooksWithTitlePrefix,
  USER_D_EMAIL,
  USER_D_PASSWORD,
} from "./support/test-books";

describe("books persistence over HTTP", () => {
  const astroBaseUrl = inject("astroBaseUrl");
  const supabaseUrl = inject("supabaseUrl");
  const supabaseKey = inject("supabaseKey");
  const supabaseDbUrl = inject("supabaseDbUrl");

  let astroCookieHeader = "";
  let verificationClient: SupabaseClient<Database>;
  let runTitlePrefix = "";

  beforeAll(async () => {
    astroCookieHeader = await signInWithForm(astroBaseUrl, USER_D_EMAIL, USER_D_PASSWORD);
    verificationClient = await createAuthenticatedVerificationClient(supabaseUrl, supabaseKey, supabaseDbUrl);
    runTitlePrefix = createRunTitlePrefix();
    await cleanupBooksWithTitlePrefix(verificationClient, INTEGRATION_TEST_TITLE_PREFIX);
  });

  afterAll(async () => {
    await cleanupBooksWithTitlePrefix(verificationClient, INTEGRATION_TEST_TITLE_PREFIX);
    await verificationClient.auth.signOut();
  });

  it("persists raw add/edit data, mood usage, and cleanup", async () => {
    const rawTitle = `  ${runTitlePrefix}Beach Read  `;
    const rawAuthor = "  Emily Henry  ";
    const rawDescription = "  A writer and a writer.  ";
    const matchingTrope = "contemporary";
    const duplicateTrope = "  contemporary  ";
    const distinctTrope = "Romance";
    let createdBookId: string | undefined;

    try {
      const createResult = await fetchUnknownJson(`${astroBaseUrl}/api/books`, {
        method: "POST",
        origin: astroBaseUrl,
        cookieHeader: astroCookieHeader,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: rawTitle,
          author: rawAuthor,
          description: rawDescription,
          tropes: [duplicateTrope, "  ", distinctTrope, duplicateTrope],
          user_id: "forged-user-id",
        }),
      });

      expect(createResult.response.status).toBe(201);
      expect(isBookMutationSuccess(createResult.body)).toBe(true);
      if (!isBookMutationSuccess(createResult.body)) {
        throw new Error("Expected a successful book mutation response");
      }

      createdBookId = createResult.body.book.id;
      const normalizedTitle = `${runTitlePrefix}Beach Read`;
      expect(createResult.body.book.title).toBe(normalizedTitle);
      expect(createResult.body.book.tropes).toEqual([matchingTrope, distinctTrope]);

      const { data: persistedAfterCreate, error: readAfterCreateError } = await verificationClient
        .from("books")
        .select("id, user_id, title, author, description, tropes, created_at, updated_at")
        .eq("id", createdBookId)
        .maybeSingle();

      if (readAfterCreateError || !persistedAfterCreate) {
        await deleteBookViaAstroForm(astroBaseUrl, astroCookieHeader, createdBookId);
        throw new Error(
          "Split-brain safety failure: Astro returned 201 but the local verification client could not read the row",
        );
      }

      expect(persistedAfterCreate.title).toBe(normalizedTitle);
      expect(persistedAfterCreate.author).toBe("Emily Henry");
      expect(persistedAfterCreate.description).toBe("A writer and a writer.");
      expect(persistedAfterCreate.tropes).toEqual([matchingTrope, distinctTrope]);

      const editedDescription = "Updated description for integration coverage.";
      const updateResult = await fetchUnknownJson(`${astroBaseUrl}/api/books/${createdBookId}`, {
        method: "PUT",
        origin: astroBaseUrl,
        cookieHeader: astroCookieHeader,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: normalizedTitle,
          author: "Emily Henry",
          description: editedDescription,
          tropes: [matchingTrope, distinctTrope],
        }),
      });

      expect(updateResult.response.status).toBe(200);
      expect(isBookMutationSuccess(updateResult.body)).toBe(true);

      const { data: persistedAfterEdit, error: readAfterEditError } = await verificationClient
        .from("books")
        .select("id, user_id, title, author, description, tropes, created_at, updated_at")
        .eq("id", createdBookId)
        .maybeSingle();

      expect(readAfterEditError).toBeNull();
      expect(persistedAfterEdit).not.toBeNull();
      if (!persistedAfterEdit) {
        throw new Error("Expected edited book to exist");
      }

      expect(persistedAfterEdit.description).toBe(editedDescription);
      expect(persistedAfterEdit.title).toBe(normalizedTitle);
      expect(persistedAfterEdit.author).toBe("Emily Henry");
      expect(persistedAfterEdit.tropes).toEqual([matchingTrope, distinctTrope]);
      expect(persistedAfterEdit.user_id).toBe(persistedAfterCreate.user_id);
      expect(persistedAfterEdit.id).toBe(createdBookId);
      expect(persistedAfterEdit.created_at).toBe(persistedAfterCreate.created_at);
      expect(Date.parse(persistedAfterEdit.updated_at)).toBeGreaterThanOrEqual(
        Date.parse(persistedAfterCreate.updated_at),
      );

      const moodMatchResponse = await fetch(
        `${astroBaseUrl}/mood?${new URLSearchParams({ trope: matchingTrope, submitted: "1" }).toString()}`,
        {
          headers: { Cookie: astroCookieHeader },
          redirect: "manual",
        },
      );
      expect(moodMatchResponse.status).toBe(200);
      const moodMatchHtml = await moodMatchResponse.text();
      expect(moodMatchHtml).toContain(normalizedTitle);

      const moodNoMatchResponse = await fetch(
        `${astroBaseUrl}/mood?${new URLSearchParams({ trope: "__integration-no-match__", submitted: "1" }).toString()}`,
        {
          headers: { Cookie: astroCookieHeader },
          redirect: "manual",
        },
      );
      expect(moodNoMatchResponse.status).toBe(200);
      const moodNoMatchHtml = await moodNoMatchResponse.text();
      expect(moodNoMatchHtml).toContain("No matches — try different tropes.");
    } finally {
      if (createdBookId) {
        await deleteBookViaAstroForm(astroBaseUrl, astroCookieHeader, createdBookId);
      }
      await cleanupBooksWithTitlePrefix(verificationClient, runTitlePrefix);
      const remaining = await listBooksWithTitlePrefix(verificationClient, runTitlePrefix);
      expect(remaining).toHaveLength(0);
    }
  });

  it("cleans up fixtures after a deliberately thrown scenario error", async () => {
    const prefix = createRunTitlePrefix();
    let createdBookId: string | undefined;

    try {
      try {
        const createResult = await fetchUnknownJson(`${astroBaseUrl}/api/books`, {
          method: "POST",
          origin: astroBaseUrl,
          cookieHeader: astroCookieHeader,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: `${prefix}Cleanup Probe`,
            author: "Test Author",
            description: "Cleanup probe",
            tropes: ["contemporary"],
          }),
        });

        expect(createResult.response.status).toBe(201);
        if (!isBookMutationSuccess(createResult.body)) {
          throw new Error("Expected a successful book mutation response");
        }
        createdBookId = createResult.body.book.id;
        throw new Error("Deliberate scenario failure to exercise finally cleanup");
      } finally {
        if (createdBookId) {
          await deleteBookViaAstroForm(astroBaseUrl, astroCookieHeader, createdBookId);
        }
        await cleanupBooksWithTitlePrefix(verificationClient, prefix);
      }
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("Deliberate scenario failure");
    }

    const remaining = await listBooksWithTitlePrefix(verificationClient, prefix);
    expect(remaining).toHaveLength(0);
  });
});
