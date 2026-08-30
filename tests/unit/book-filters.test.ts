import { describe, expect, it } from "vitest";
import { matchesBookFilters, parseBookFilters, type BookFilters } from "@/lib/book-filters";

function qParams(value: string): URLSearchParams {
  const params = new URLSearchParams();
  params.set("q", value);
  return params;
}

function tropesParams(values: readonly string[]): URLSearchParams {
  const params = new URLSearchParams();
  for (const value of values) {
    params.append("trope", value);
  }
  return params;
}

function book(overrides: { title?: string; author?: string; tropes?: string[]; description?: string | null }): {
  title: string;
  author: string;
  tropes: string[];
  description: string | null;
} {
  return {
    title: "Alpha River",
    author: "Smith",
    tropes: ["enemies-to-lovers", "fake-dating"],
    description: "A hidden-in-blurb romance.",
    ...overrides,
  };
}

describe("parseBookFilters", () => {
  it.each([
    {
      name: "treats a missing q as empty",
      params: new URLSearchParams(),
      expected: { q: "", tropes: [] } satisfies BookFilters,
    },
    {
      name: "treats a blank q as empty",
      params: qParams(""),
      expected: { q: "", tropes: [] } satisfies BookFilters,
    },
    {
      name: "treats a whitespace-only q as empty",
      params: qParams("   "),
      expected: { q: "", tropes: [] } satisfies BookFilters,
    },
    {
      name: "trims leading and trailing spaces from q",
      params: qParams("  Alpha River  "),
      expected: { q: "Alpha River", tropes: [] } satisfies BookFilters,
    },
    {
      name: "keeps the first 300 code points of an overlong q",
      params: qParams("a".repeat(301)),
      expected: { q: "a".repeat(300), tropes: [] } satisfies BookFilters,
    },
    {
      name: "clamps q by Unicode code points, not UTF-16 units",
      params: qParams("📚".repeat(301)),
      expected: { q: "📚".repeat(300), tropes: [] } satisfies BookFilters,
    },
  ])("$name", ({ params, expected }) => {
    expect(parseBookFilters(params)).toEqual(expected);
  });

  it("drops empty tropes and exact duplicates while keeping first-seen order", () => {
    const params = tropesParams(["  fake-dating  ", "", "enemies-to-lovers", "fake-dating", "   ", "grumpy-sunshine"]);

    expect(parseBookFilters(params)).toEqual({
      q: "",
      tropes: ["fake-dating", "enemies-to-lovers", "grumpy-sunshine"],
    } satisfies BookFilters);
  });

  it("keeps the first 26 distinct tropes and drops the 27th", () => {
    const values = Array.from({ length: 27 }, (_, index) => `trope-${String(index)}`);
    const filters = parseBookFilters(tropesParams(values));

    expect(filters.tropes).toEqual(Array.from({ length: 26 }, (_, index) => `trope-${String(index)}`));
    expect(filters.tropes).not.toContain("trope-26");
  });
});

describe("matchesBookFilters", () => {
  const emptyFilters: BookFilters = { q: "", tropes: [] };

  it.each([
    {
      name: "matches a book with tropes when filters are empty",
      candidate: book({}),
    },
    {
      name: "matches a book with no tropes when filters are empty",
      candidate: book({ tropes: [] }),
    },
    {
      name: "matches a book whose title and author would miss any search when filters are empty",
      candidate: book({ title: "Gamma Vale", author: "Lee", tropes: ["grumpy-sunshine"] }),
    },
  ])("$name", ({ candidate }) => {
    expect(matchesBookFilters(candidate, emptyFilters)).toBe(true);
  });

  it.each([
    {
      name: "matches a case-different title substring",
      candidate: book({ title: "Alpha River", author: "Smith" }),
      filters: { q: "alpha", tropes: [] } satisfies BookFilters,
      expected: true,
    },
    {
      name: "matches a case-different author substring",
      candidate: book({ title: "Gamma Vale", author: "Jones" }),
      filters: { q: "JONES", tropes: [] } satisfies BookFilters,
      expected: true,
    },
    {
      name: "does not match text that appears only in the description",
      candidate: book({
        title: "Alpha River",
        author: "Smith",
        description: "hidden-in-blurb appears only here",
      }),
      filters: { q: "hidden-in-blurb", tropes: [] } satisfies BookFilters,
      expected: false,
    },
    {
      name: "matches one exact trope",
      candidate: book({ tropes: ["enemies-to-lovers", "fake-dating"] }),
      filters: { q: "", tropes: ["fake-dating"] } satisfies BookFilters,
      expected: true,
    },
    {
      name: "does not match a trope that differs only by case",
      candidate: book({ tropes: ["fake-dating"] }),
      filters: { q: "", tropes: ["Fake-Dating"] } satisfies BookFilters,
      expected: false,
    },
    {
      name: "matches a book that includes both selected tropes",
      candidate: book({ tropes: ["enemies-to-lovers", "fake-dating"] }),
      filters: { q: "", tropes: ["enemies-to-lovers", "fake-dating"] } satisfies BookFilters,
      expected: true,
    },
    {
      name: "does not match a book that has only one of two selected tropes",
      candidate: book({ tropes: ["enemies-to-lovers"] }),
      filters: { q: "", tropes: ["enemies-to-lovers", "fake-dating"] } satisfies BookFilters,
      expected: false,
    },
    {
      name: "does not match when the title hits q but the book lacks a selected trope",
      candidate: book({ title: "Alpha Woods", tropes: ["enemies-to-lovers"] }),
      filters: { q: "Alpha", tropes: ["fake-dating"] } satisfies BookFilters,
      expected: false,
    },
    {
      name: "does not match a stale trope the book does not have",
      candidate: book({ tropes: ["enemies-to-lovers", "fake-dating"] }),
      filters: { q: "", tropes: ["second-chance"] } satisfies BookFilters,
      expected: false,
    },
  ])("$name", ({ candidate, filters, expected }) => {
    expect(matchesBookFilters(candidate, filters)).toBe(expected);
  });
});
