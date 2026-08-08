import { z } from "zod";
import type { Tables } from "@/lib/database.types";

const trope = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().max(60, { error: "Keep each trope to 60 characters or fewer" }));

export const tropeListSchema = z
  .array(trope)
  .transform((raw) => {
    const seen = new Set<string>();
    return raw.filter((t) => {
      if (t.length === 0 || seen.has(t)) return false;
      seen.add(t);
      return true;
    });
  })
  .pipe(
    z.array(z.string()).min(1, { error: "Add at least one trope" }).max(25, { error: "Add no more than 25 tropes" }),
  );

const titleSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z.string().min(1, { error: "Title is required" }).max(300, { error: "Keep the title to 300 characters or fewer" }),
  );

const authorSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .min(1, { error: "Author is required" })
      .max(200, { error: "Keep the author to 200 characters or fewer" }),
  );

const descriptionSchema = z
  .string()
  .optional()
  .transform((value) => {
    if (value === undefined) return null;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  })
  .pipe(z.nullable(z.string().max(2000, { error: "Keep the description to 2000 characters or fewer" })));

export const bookSchema = z.object({
  title: titleSchema,
  author: authorSchema,
  tropes: tropeListSchema,
  description: descriptionSchema,
});

export type BookInput = z.input<typeof bookSchema>;
export type BookPayload = z.output<typeof bookSchema>;

export interface CreateBookSuccess {
  book: Tables<"books">;
  duplicate: boolean;
}

export interface CreateBookError {
  error: string;
  fieldErrors?: Record<string, string[]>;
}

function isBookRow(value: unknown): value is Tables<"books"> {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.user_id === "string" &&
    typeof row.title === "string" &&
    typeof row.author === "string" &&
    Array.isArray(row.tropes) &&
    row.tropes.every((t) => typeof t === "string") &&
    (row.description === null || typeof row.description === "string") &&
    typeof row.created_at === "string" &&
    typeof row.updated_at === "string"
  );
}

export function isCreateBookSuccess(value: unknown): value is CreateBookSuccess {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  return isBookRow(body.book) && typeof body.duplicate === "boolean";
}

export function isCreateBookError(value: unknown): value is CreateBookError {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  if (typeof body.error !== "string") return false;
  if (body.fieldErrors === undefined) return true;
  if (typeof body.fieldErrors !== "object" || body.fieldErrors === null) return false;
  return Object.values(body.fieldErrors).every(
    (messages) => Array.isArray(messages) && messages.every((m) => typeof m === "string"),
  );
}
