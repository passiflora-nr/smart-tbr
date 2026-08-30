import { afterAll, beforeAll, describe, expect, it, inject } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { fetchAuthedHtml, fetchUnknownJson, signInWithForm } from "./support/http-session";
import {
  assertUserDHasOnlyReservedFixtures,
  cleanupBooksWithTitlePrefix,
  createAuthenticatedVerificationClient,
  createBookViaApi,
  createRunTitlePrefix,
  deleteBookViaAstroForm,
  INTEGRATION_TEST_TITLE_PREFIX,
  listBooksWithTitlePrefix,
  USER_D_EMAIL,
  USER_D_PASSWORD,
} from "./support/test-books";

const EMPTY_SENTENCE = "Your TBR is empty — add your first book to get started.";
const NO_MATCH_PREFIX = "No books match your";

type FixtureRole = "both" | "searchOnly" | "tropeOnly" | "neither";

interface FourBookLibrary {
  both: string;
  searchOnly: string;
  tropeOnly: string;
  neither: string;
}

function fixtureTitles(prefix: string): FourBookLibrary {
  return {
    both: `${prefix}Alpha River`,
    searchOnly: `${prefix}Alpha Woods`,
    tropeOnly: `${prefix}Beta Harbor`,
    neither: `${prefix}Gamma Vale`,
  };
}

function booksUrl(astroBaseUrl: string, params: URLSearchParams): string {
  const query = params.toString();
  return query.length > 0 ? `${astroBaseUrl}/books?${query}` : `${astroBaseUrl}/books`;
}

describe("books surface over HTTP", () => {
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

  async function getBooksHtml(url: string): Promise<string> {
    const { response, body } = await fetchAuthedHtml(url, astroCookieHeader);
    expect(response.status).toBe(200);
    return body;
  }

  async function seedFourBookLibrary(): Promise<FourBookLibrary> {
    const titles = fixtureTitles(runTitlePrefix);
    await createBookViaApi(astroBaseUrl, astroCookieHeader, verificationClient, {
      title: titles.both,
      author: "Smith",
      description: "Both tropes.",
      tropes: ["enemies-to-lovers", "fake-dating"],
    });
    await createBookViaApi(astroBaseUrl, astroCookieHeader, verificationClient, {
      title: titles.searchOnly,
      author: "Jones",
      description: "Search only.",
      tropes: ["enemies-to-lovers"],
    });
    await createBookViaApi(astroBaseUrl, astroCookieHeader, verificationClient, {
      title: titles.tropeOnly,
      author: "Smith",
      description: "Trope only.",
      tropes: ["fake-dating"],
    });
    await createBookViaApi(astroBaseUrl, astroCookieHeader, verificationClient, {
      title: titles.neither,
      author: "Lee",
      description: "Neither.",
      tropes: ["grumpy-sunshine"],
    });
    return titles;
  }

  async function withCleanRunPrefix(run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } finally {
      await cleanupBooksWithTitlePrefix(verificationClient, runTitlePrefix);
      const remaining = await listBooksWithTitlePrefix(verificationClient, runTitlePrefix);
      expect(remaining).toHaveLength(0);
    }
  }

  it("shows the empty sentence when user D has no books", async () => {
    await assertUserDHasOnlyReservedFixtures(verificationClient);
    try {
      await cleanupBooksWithTitlePrefix(verificationClient, INTEGRATION_TEST_TITLE_PREFIX);
      const html = await getBooksHtml(`${astroBaseUrl}/books`);
      const titles = fixtureTitles(runTitlePrefix);
      expect(html).toContain(EMPTY_SENTENCE);
      expect(html).not.toContain(titles.both);
      expect(html).not.toContain(titles.searchOnly);
      expect(html).not.toContain(titles.tropeOnly);
      expect(html).not.toContain(titles.neither);
    } finally {
      await cleanupBooksWithTitlePrefix(verificationClient, INTEGRATION_TEST_TITLE_PREFIX);
    }
  });

  it.each([
    {
      name: "unfiltered list shows all four titles",
      params: () => new URLSearchParams(),
      appear: ["both", "searchOnly", "tropeOnly", "neither"] as const satisfies readonly FixtureRole[],
      absent: [] as const satisfies readonly FixtureRole[],
    },
    {
      name: "search keeps Alpha titles and drops the rest",
      params: () => {
        const params = new URLSearchParams();
        params.set("q", "Alpha");
        return params;
      },
      appear: ["both", "searchOnly"] as const satisfies readonly FixtureRole[],
      absent: ["tropeOnly", "neither"] as const satisfies readonly FixtureRole[],
    },
    {
      name: "two tropes keep only the book that has both",
      params: () => {
        const params = new URLSearchParams();
        params.append("trope", "enemies-to-lovers");
        params.append("trope", "fake-dating");
        return params;
      },
      appear: ["both"] as const satisfies readonly FixtureRole[],
      absent: ["searchOnly", "tropeOnly", "neither"] as const satisfies readonly FixtureRole[],
    },
    {
      name: "combined search and trope keep only the book that matches both",
      params: () => {
        const params = new URLSearchParams();
        params.set("q", "Alpha");
        params.append("trope", "fake-dating");
        return params;
      },
      appear: ["both"] as const satisfies readonly FixtureRole[],
      absent: ["searchOnly", "tropeOnly", "neither"] as const satisfies readonly FixtureRole[],
    },
    {
      name: "clear-search destination keeps the selected trope",
      params: () => {
        const params = new URLSearchParams();
        params.append("trope", "fake-dating");
        return params;
      },
      appear: ["both", "tropeOnly"] as const satisfies readonly FixtureRole[],
      absent: ["searchOnly", "neither"] as const satisfies readonly FixtureRole[],
    },
  ])("$name", async ({ params, appear, absent }) => {
    await withCleanRunPrefix(async () => {
      const titles = await seedFourBookLibrary();
      const html = await getBooksHtml(booksUrl(astroBaseUrl, params()));
      for (const role of appear) {
        expect(html).toContain(titles[role]);
      }
      for (const role of absent) {
        expect(html).not.toContain(titles[role]);
      }
    });
  });

  it("shows no-match copy when search hits nothing", async () => {
    await withCleanRunPrefix(async () => {
      const titles = await seedFourBookLibrary();
      const params = new URLSearchParams();
      params.set("q", `${runTitlePrefix}no-such-book`);
      const html = await getBooksHtml(booksUrl(astroBaseUrl, params));
      expect(html).toContain(NO_MATCH_PREFIX);
      expect(html).not.toContain(titles.both);
      expect(html).not.toContain(titles.searchOnly);
      expect(html).not.toContain(titles.tropeOnly);
      expect(html).not.toContain(titles.neither);
    });
  });

  it("exposes GET filter transport on a populated filtered page", async () => {
    await withCleanRunPrefix(async () => {
      await seedFourBookLibrary();
      const params = new URLSearchParams();
      params.set("q", "Alpha");
      params.append("trope", "fake-dating");
      const html = await getBooksHtml(booksUrl(astroBaseUrl, params));

      // Substring checks only — there is no HTML parser in this suite.
      // 1. A passing check proves each value is present somewhere on the page, not that
      //    the destination and the label belong to the same element.
      // 2. "Clear filters" renders as a link when filters are active and as a look-alike
      //    disabled element when they are not; running this case only against a filtered
      //    response is what keeps it meaningful.
      expect(html).toContain('method="GET"');
      expect(html).toContain('action="/books"');
      expect(html).toContain('name="q"');
      expect(html).toContain('name="trope"');
      expect(html).toContain("Clear search");
      expect(html).toContain('href="/books?trope=fake-dating"');
      expect(html).toContain("Clear filters");
      expect(html).toContain('href="/books"');
    });
  });

  it("shows a newly created book on the list", async () => {
    await withCleanRunPrefix(async () => {
      const title = `${runTitlePrefix}New Arrival`;
      await createBookViaApi(astroBaseUrl, astroCookieHeader, verificationClient, {
        title,
        author: "Lee",
        description: "Added via API.",
        tropes: ["grumpy-sunshine"],
      });
      const html = await getBooksHtml(`${astroBaseUrl}/books`);
      expect(html).toContain(title);
    });
  });

  it("shows the renamed title after edit and drops the old title", async () => {
    await withCleanRunPrefix(async () => {
      const oldTitle = `${runTitlePrefix}Original Title`;
      const newTitle = `${runTitlePrefix}Renamed Title`;
      const created = await createBookViaApi(astroBaseUrl, astroCookieHeader, verificationClient, {
        title: oldTitle,
        author: "Smith",
        description: "To edit.",
        tropes: ["fake-dating"],
      });

      const updateResult = await fetchUnknownJson(`${astroBaseUrl}/api/books/${created.id}`, {
        method: "PUT",
        origin: astroBaseUrl,
        cookieHeader: astroCookieHeader,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle,
          author: "Smith",
          description: "To edit.",
          tropes: ["fake-dating"],
        }),
      });
      expect(updateResult.response.status).toBe(200);

      const html = await getBooksHtml(`${astroBaseUrl}/books`);
      expect(html).toContain(newTitle);
      expect(html).not.toContain(oldTitle);
    });
  });

  it("removes a deleted title from the list and keeps siblings", async () => {
    await withCleanRunPrefix(async () => {
      const keepTitle = `${runTitlePrefix}Keep Me`;
      const deleteTitle = `${runTitlePrefix}Delete Me`;
      await createBookViaApi(astroBaseUrl, astroCookieHeader, verificationClient, {
        title: keepTitle,
        author: "Jones",
        description: "Sibling.",
        tropes: ["enemies-to-lovers"],
      });
      const toDelete = await createBookViaApi(astroBaseUrl, astroCookieHeader, verificationClient, {
        title: deleteTitle,
        author: "Lee",
        description: "To delete.",
        tropes: ["grumpy-sunshine"],
      });

      await deleteBookViaAstroForm(astroBaseUrl, astroCookieHeader, toDelete.id);

      const html = await getBooksHtml(`${astroBaseUrl}/books`);
      expect(html).toContain(keepTitle);
      expect(html).not.toContain(deleteTitle);
    });
  });
});
