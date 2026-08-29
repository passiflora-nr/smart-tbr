import { describe, expect, it } from "vitest";
import {
  buildMoodHref,
  buildMoodMoreLabel,
  matchesAnyTrope,
  moodMoreCount,
  parseMoodSelection,
  parseMoodShowCount,
  sortBooksForMood,
  takeMoodMatches,
  validateMoodSelection,
} from "@/lib/mood-selection";

function tropesParams(values: readonly string[]): URLSearchParams {
  const params = new URLSearchParams();
  for (const value of values) {
    params.append("trope", value);
  }
  return params;
}

function moodHrefParams(href: string): URLSearchParams {
  return new URL(href, "https://smart-tbr.test").searchParams;
}

describe("parseMoodSelection", () => {
  it("trims values, drops empties, and dedupes exact repeats while preserving order", () => {
    const params = tropesParams(["  contemporary  ", "", "slow burn", "contemporary", "   ", "found family"]);

    expect(parseMoodSelection(params)).toEqual({
      tropes: ["contemporary", "slow burn", "found family"],
    });
  });

  it("stops at the defensive transport bound of 26 tropes", () => {
    const values = Array.from({ length: 27 }, (_, index) => `trope-${String(index)}`);
    const selection = parseMoodSelection(tropesParams(values));

    expect(selection.tropes).toHaveLength(26);
    expect(selection.tropes[0]).toBe("trope-0");
    expect(selection.tropes[25]).toBe("trope-25");
    expect(selection.tropes).not.toContain("trope-26");
  });
});

describe("validateMoodSelection", () => {
  it.each([
    {
      name: "treats an empty selection as empty",
      tropes: [],
      expected: { status: "empty" as const },
    },
    {
      name: "accepts a single trope",
      tropes: ["contemporary"],
      expected: { status: "ok" as const, tropes: ["contemporary"] },
    },
    {
      name: "accepts three tropes",
      tropes: ["contemporary", "enemies-to-lovers", "slow burn"],
      expected: {
        status: "ok" as const,
        tropes: ["contemporary", "enemies-to-lovers", "slow burn"],
      },
    },
    {
      name: "rejects four tropes as too-many without truncating the selection",
      tropes: ["contemporary", "enemies-to-lovers", "slow burn", "found family"],
      expected: {
        status: "too-many" as const,
        tropes: ["contemporary", "enemies-to-lovers", "slow burn", "found family"],
      },
    },
  ])("$name", ({ tropes, expected }) => {
    expect(validateMoodSelection({ tropes })).toEqual(expected);
  });
});

describe("matchesAnyTrope", () => {
  it("matches a book that shares only one of several selected tropes", () => {
    expect(
      matchesAnyTrope({ tropes: ["slow burn", "workplace"] }, ["found family", "slow burn", "grumpy-sunshine"]),
    ).toBe(true);
  });

  it("does not match a book that shares none of the selected tropes", () => {
    expect(matchesAnyTrope({ tropes: ["slow burn"] }, ["found family"])).toBe(false);
  });

  it("matches no book when the mood selection is empty", () => {
    expect(matchesAnyTrope({ tropes: ["slow burn", "contemporary"] }, [])).toBe(false);
  });

  it("matches tropes with exact, case-sensitive equality", () => {
    expect(matchesAnyTrope({ tropes: ["Slow Burn"] }, ["slow burn"])).toBe(false);
    expect(matchesAnyTrope({ tropes: ["slow burn"] }, ["slow burn"])).toBe(true);
  });
});

describe("sortBooksForMood", () => {
  it("orders by title then id without mutating the input array", () => {
    const input = [
      { id: "b", title: "The Hating Game" },
      { id: "a", title: "Beach Read" },
      { id: "c", title: "Fourth Wing" },
    ];
    const original = [...input];

    expect(sortBooksForMood(input).map((book) => book.title)).toEqual(["Beach Read", "Fourth Wing", "The Hating Game"]);
    expect(input).toEqual(original);
  });

  it("breaks an exact title tie with id order", () => {
    const input = [
      { id: "m-2", title: "Same Title" },
      { id: "m-1", title: "Same Title" },
    ];

    expect(sortBooksForMood(input).map((book) => book.id)).toEqual(["m-1", "m-2"]);
  });

  it("asserts membership rather than locale-dependent position for base-sensitive title ties", () => {
    const input = [
      { id: "accented", title: "Resume" },
      { id: "plain", title: "Résumé" },
    ];
    const sortedIds = sortBooksForMood(input).map((book) => book.id);

    expect(sortedIds).toHaveLength(2);
    expect(sortedIds).toEqual(expect.arrayContaining(["accented", "plain"]));
  });
});

describe("parseMoodShowCount", () => {
  it.each([
    { name: "missing show falls back to three", query: "", expected: 3 },
    { name: "empty show falls back to three", query: "show=", expected: 3 },
    { name: "non-numeric show falls back to three", query: "show=abc", expected: 3 },
    { name: "fractional show falls back to three", query: "show=2.5", expected: 3 },
    { name: "small show falls back to three", query: "show=2", expected: 3 },
    { name: "negative show falls back to three", query: "show=-5", expected: 3 },
    { name: "exactly three is kept", query: "show=3", expected: 3 },
    { name: "a value between steps rounds up to the next three", query: "show=4", expected: 6 },
    { name: "a large valid show is accepted for later clamping", query: "show=999", expected: 999 },
  ])("$name", ({ query, expected }) => {
    expect(parseMoodShowCount(new URLSearchParams(query))).toBe(expected);
  });
});

describe("takeMoodMatches", () => {
  const matches = ["Beach Read", "Fourth Wing", "Red White and Royal Blue", "The Hating Game", "Evelyn Hugo"];

  it("returns the first slice of three and a next show count", () => {
    expect(takeMoodMatches(matches, 3)).toEqual({
      visible: ["Beach Read", "Fourth Wing", "Red White and Royal Blue"],
      total: 5,
      nextShow: 6,
    });
  });

  it("returns a partial final expansion when fewer than three remain", () => {
    expect(takeMoodMatches(matches, 6)).toEqual({
      visible: matches,
      total: 5,
      nextShow: null,
    });
  });

  it("clamps a large valid show to the finite match total", () => {
    expect(takeMoodMatches(matches, 999)).toEqual({
      visible: matches,
      total: 5,
      nextShow: null,
    });
  });
});

describe("buildMoodMoreLabel", () => {
  it.each([
    { name: "names two remaining books", visible: 3, total: 5, count: 2, label: "Show me 2 more" },
    { name: "names one remaining book", visible: 3, total: 4, count: 1, label: "Show me 1 more" },
    { name: "keeps a full step when more than three remain", visible: 3, total: 10, count: 3, label: "Show me 3 more" },
    {
      name: "names the last leftover after a later expansion",
      visible: 6,
      total: 7,
      count: 1,
      label: "Show me 1 more",
    },
  ])("$name", ({ visible, total, count, label }) => {
    expect(moodMoreCount(visible, total)).toBe(count);
    expect(buildMoodMoreLabel(visible, total)).toBe(label);
  });
});

describe("buildMoodHref", () => {
  it("builds a clean first-view URL without a show parameter", () => {
    const href = buildMoodHref(["contemporary", "slow burn"]);
    const params = moodHrefParams(href);

    expect(href.startsWith("/mood?")).toBe(true);
    expect(params.getAll("trope")).toEqual(["contemporary", "slow burn"]);
    expect(params.has("show")).toBe(false);
  });

  it("omits show when it equals the first-view step size", () => {
    const href = buildMoodHref(["contemporary"], 3);
    const params = moodHrefParams(href);

    expect(params.getAll("trope")).toEqual(["contemporary"]);
    expect(params.has("show")).toBe(false);
  });

  it("preserves repeated trope values on an expansion URL", () => {
    const href = buildMoodHref(["contemporary", "slow burn"], 6);
    const params = moodHrefParams(href);

    expect(params.getAll("trope")).toEqual(["contemporary", "slow burn"]);
    expect(params.get("show")).toBe("6");
  });

  it("returns the bare mood path when there are no tropes", () => {
    expect(buildMoodHref([])).toBe("/mood");
  });
});
