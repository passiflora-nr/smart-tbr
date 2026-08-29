import { describe, expect, it } from "vitest";
import type { ZodError } from "zod";
import { bookSchema, isBookMutationError, isBookMutationSuccess, type BookPayload } from "@/lib/book-schema";

function validBookInput(overrides: Record<string, unknown> = {}): unknown {
  return {
    title: "Beach Read",
    author: "Emily Henry",
    tropes: ["contemporary", "romance"],
    description: "A writer and a writer.",
    ...overrides,
  };
}

function validBookRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    user_id: "d0000000-0000-4000-8000-000000000001",
    title: "Beach Read",
    author: "Emily Henry",
    tropes: ["contemporary", "romance"],
    description: "A writer and a writer.",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function firstFieldError(error: ZodError, field: string): string | undefined {
  const issue = error.issues.find((entry) => entry.path[0] === field);
  if (issue === undefined) {
    return undefined;
  }
  return issue.message;
}

interface AcceptedCase {
  name: string;
  input: unknown;
  expected: BookPayload;
}

interface RejectedCase {
  name: string;
  input: unknown;
  field: string;
  message: string;
}

describe("bookSchema", () => {
  it.each([
    {
      name: "trims title, author, description, and each trope",
      input: validBookInput({
        title: "  Beach Read  ",
        author: "  Emily Henry  ",
        tropes: ["  contemporary  ", "  romance  "],
        description: "  A writer and a writer.  ",
      }),
      expected: {
        title: "Beach Read",
        author: "Emily Henry",
        tropes: ["contemporary", "romance"],
        description: "A writer and a writer.",
      },
    },
    {
      name: "turns a blank description into null",
      input: validBookInput({ description: "   " }),
      expected: {
        title: "Beach Read",
        author: "Emily Henry",
        tropes: ["contemporary", "romance"],
        description: null,
      },
    },
    {
      name: "turns an omitted description into null",
      input: {
        title: "Beach Read",
        author: "Emily Henry",
        tropes: ["contemporary", "romance"],
      },
      expected: {
        title: "Beach Read",
        author: "Emily Henry",
        tropes: ["contemporary", "romance"],
        description: null,
      },
    },
    {
      name: "turns a null description into null",
      input: validBookInput({ description: null }),
      expected: {
        title: "Beach Read",
        author: "Emily Henry",
        tropes: ["contemporary", "romance"],
        description: null,
      },
    },
    {
      name: "drops empty and duplicate tropes while preserving first-occurrence order",
      input: validBookInput({
        tropes: ["romance", "  ", "contemporary", "romance", "", "slow burn", "contemporary"],
      }),
      expected: {
        title: "Beach Read",
        author: "Emily Henry",
        tropes: ["romance", "contemporary", "slow burn"],
        description: "A writer and a writer.",
      },
    },
    {
      name: "keeps case-distinct tropes as distinct values",
      input: validBookInput({ tropes: ["Fake Dating", "fake dating"] }),
      expected: {
        title: "Beach Read",
        author: "Emily Henry",
        tropes: ["Fake Dating", "fake dating"],
        description: "A writer and a writer.",
      },
    },
    {
      name: "accepts a title at the 300-character boundary",
      input: validBookInput({ title: "T".repeat(300) }),
      expected: {
        title: "T".repeat(300),
        author: "Emily Henry",
        tropes: ["contemporary", "romance"],
        description: "A writer and a writer.",
      },
    },
    {
      name: "accepts an author at the 200-character boundary",
      input: validBookInput({ author: "A".repeat(200) }),
      expected: {
        title: "Beach Read",
        author: "A".repeat(200),
        tropes: ["contemporary", "romance"],
        description: "A writer and a writer.",
      },
    },
    {
      name: "accepts a description at the 2000-character boundary",
      input: validBookInput({ description: "D".repeat(2000) }),
      expected: {
        title: "Beach Read",
        author: "Emily Henry",
        tropes: ["contemporary", "romance"],
        description: "D".repeat(2000),
      },
    },
    {
      name: "accepts a trope at the 60-character boundary",
      input: validBookInput({ tropes: ["x".repeat(60)] }),
      expected: {
        title: "Beach Read",
        author: "Emily Henry",
        tropes: ["x".repeat(60)],
        description: "A writer and a writer.",
      },
    },
    {
      name: "accepts exactly 25 tropes",
      input: validBookInput({
        tropes: Array.from({ length: 25 }, (_, index) => `trope-${String(index)}`),
      }),
      expected: {
        title: "Beach Read",
        author: "Emily Henry",
        tropes: Array.from({ length: 25 }, (_, index) => `trope-${String(index)}`),
        description: "A writer and a writer.",
      },
    },
    {
      name: "strips unknown fields such as a client-supplied user_id",
      input: validBookInput({ user_id: "forged-owner" }),
      expected: {
        title: "Beach Read",
        author: "Emily Henry",
        tropes: ["contemporary", "romance"],
        description: "A writer and a writer.",
      },
    },
  ] satisfies AcceptedCase[])("$name", ({ input, expected }) => {
    const result = bookSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.data).toEqual(expected);
    expect(result.data).not.toHaveProperty("user_id");
  });

  it.each([
    {
      name: "rejects a whitespace-only title with the authored required message",
      input: validBookInput({ title: "   " }),
      field: "title",
      message: "Title is required",
    },
    {
      name: "rejects a whitespace-only author with the authored required message",
      input: validBookInput({ author: "   " }),
      field: "author",
      message: "Author is required",
    },
    {
      name: "rejects an empty trope list with the authored message",
      input: validBookInput({ tropes: [] }),
      field: "tropes",
      message: "Add at least one trope",
    },
    {
      name: "rejects tropes that become empty after trim",
      input: validBookInput({ tropes: ["   "] }),
      field: "tropes",
      message: "Add at least one trope",
    },
    {
      name: "rejects a title over 300 characters with the authored message",
      input: validBookInput({ title: "T".repeat(301) }),
      field: "title",
      message: "Keep the title to 300 characters or fewer",
    },
    {
      name: "rejects an author over 200 characters with the authored message",
      input: validBookInput({ author: "A".repeat(201) }),
      field: "author",
      message: "Keep the author to 200 characters or fewer",
    },
    {
      name: "rejects a description over 2000 characters with the authored message",
      input: validBookInput({ description: "D".repeat(2001) }),
      field: "description",
      message: "Keep the description to 2000 characters or fewer",
    },
    {
      name: "rejects a trope over 60 characters with the authored message",
      input: validBookInput({ tropes: ["x".repeat(61)] }),
      field: "tropes",
      message: "Keep each trope to 60 characters or fewer",
    },
    {
      name: "rejects a 26th trope with the authored message",
      input: validBookInput({
        tropes: Array.from({ length: 26 }, (_, index) => `trope-${String(index)}`),
      }),
      field: "tropes",
      message: "Add no more than 25 tropes",
    },
  ] satisfies RejectedCase[])("$name", ({ input, field, message }) => {
    const result = bookSchema.safeParse(input);

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(firstFieldError(result.error, field)).toBe(message);
  });

  it.each([
    {
      name: "rejects a missing title",
      input: {
        author: "Emily Henry",
        tropes: ["contemporary"],
      },
    },
    {
      name: "rejects a missing author",
      input: {
        title: "Beach Read",
        tropes: ["contemporary"],
      },
    },
    {
      name: "rejects missing tropes",
      input: {
        title: "Beach Read",
        author: "Emily Henry",
      },
    },
    {
      name: "rejects a wrong primitive title type without freezing Zod wording",
      input: validBookInput({ title: 123 }),
    },
  ])("$name", ({ input }) => {
    const result = bookSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe("book mutation response guards", () => {
  it("accepts a well-formed success body without reading response.json() as any", () => {
    const body: unknown = {
      book: validBookRow(),
      duplicate: false,
    };

    expect(isBookMutationSuccess(body)).toBe(true);
    expect(isBookMutationError(body)).toBe(false);

    if (!isBookMutationSuccess(body)) {
      return;
    }

    expect(body.book.title).toBe("Beach Read");
    expect(body.duplicate).toBe(false);
  });

  it("accepts a well-formed error body with optional fieldErrors", () => {
    const body: unknown = {
      error: "Validation failed",
      fieldErrors: { title: ["Title is required"] },
    };

    expect(isBookMutationError(body)).toBe(true);
    expect(isBookMutationSuccess(body)).toBe(false);

    if (!isBookMutationError(body)) {
      return;
    }

    expect(body.error).toBe("Validation failed");
    expect(body.fieldErrors).toEqual({ title: ["Title is required"] });
  });

  it("accepts an error body with no fieldErrors", () => {
    const body: unknown = { error: "Unauthorized" };

    expect(isBookMutationError(body)).toBe(true);
  });

  it.each([
    {
      name: "rejects a success body whose book is missing required fields",
      body: { book: { title: "Beach Read" }, duplicate: false },
    },
    {
      name: "rejects a success body whose tropes are not all strings",
      body: { book: validBookRow({ tropes: ["romance", 1] }), duplicate: false },
    },
    {
      name: "rejects a success body whose duplicate flag is missing",
      body: { book: validBookRow() },
    },
    {
      name: "rejects an error body whose error is not a string",
      body: { error: 400 },
    },
    {
      name: "rejects an error body whose fieldErrors values are not string arrays",
      body: { error: "Validation failed", fieldErrors: { title: "Title is required" } },
    },
    {
      name: "rejects a non-object body",
      body: "not-json",
    },
  ] satisfies { name: string; body: unknown }[])("$name", ({ body }) => {
    expect(isBookMutationSuccess(body)).toBe(false);
    expect(isBookMutationError(body)).toBe(false);
  });
});
