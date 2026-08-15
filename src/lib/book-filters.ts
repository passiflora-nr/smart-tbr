import { z } from "zod";
import type { Tables } from "@/lib/database.types";

export interface BookFilters {
  q: string;
  tropes: string[];
}

const filterQSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().max(300));

/** Trim only — no per-trope max; overlong values stay so all-match returns zero matches. */
const filterTropeSchema = z.string().transform((value) => value.trim());

function parseFilterQ(raw: string | null): string {
  const result = filterQSchema.safeParse(raw ?? "");
  if (result.success) return result.data;
  return (raw ?? "").trim().slice(0, 300);
}

function parseFilterTropes(params: URLSearchParams): string[] {
  const tropes: string[] = [];
  const seen = new Set<string>();

  for (const raw of params.getAll("trope")) {
    const result = filterTropeSchema.safeParse(raw);
    const trimmed = result.success ? result.data : raw.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    tropes.push(trimmed);
  }

  return tropes;
}

export function parseBookFilters(params: URLSearchParams): BookFilters {
  return {
    q: parseFilterQ(params.get("q")),
    tropes: parseFilterTropes(params),
  };
}

export function hasActiveFilters(filters: BookFilters): boolean {
  return filters.q.length > 0 || filters.tropes.length > 0;
}

export function matchesBookFilters(
  book: Pick<Tables<"books">, "title" | "author" | "tropes">,
  filters: BookFilters,
): boolean {
  if (filters.q.length > 0) {
    const q = filters.q.toLowerCase();
    const titleMatch = book.title.toLowerCase().includes(q);
    const authorMatch = book.author.toLowerCase().includes(q);
    if (!titleMatch && !authorMatch) return false;
  }

  if (filters.tropes.length > 0) {
    for (const trope of filters.tropes) {
      if (!book.tropes.includes(trope)) return false;
    }
  }

  return true;
}

export function collectTropeVocabulary(books: { tropes: string[] }[], alsoInclude?: string[]): string[] {
  const seen = new Set<string>();
  const tropes: string[] = [];

  for (const book of books) {
    for (const trope of book.tropes) {
      if (seen.has(trope)) continue;
      seen.add(trope);
      tropes.push(trope);
    }
  }

  if (alsoInclude) {
    for (const trope of alsoInclude) {
      if (seen.has(trope)) continue;
      seen.add(trope);
      tropes.push(trope);
    }
  }

  return tropes.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

export function serializeBookFilters(filters: BookFilters): string {
  if (!hasActiveFilters(filters)) return "";

  const params = new URLSearchParams();
  if (filters.q.length > 0) {
    params.set("q", filters.q);
  }
  for (const trope of filters.tropes) {
    params.append("trope", trope);
  }
  return params.toString();
}

export function buildBooksHref(
  filterQuery: string,
  options?: { notice?: string; error?: string; highlight?: string; hash?: string },
): string {
  const params = new URLSearchParams(filterQuery);

  if (options?.notice) params.set("notice", options.notice);
  if (options?.error) params.set("error", options.error);
  if (options?.highlight) params.set("highlight", options.highlight);

  const query = params.toString();
  const hash = options?.hash ? `#${options.hash}` : "";

  return query.length > 0 ? `/books?${query}${hash}` : `/books${hash}`;
}
