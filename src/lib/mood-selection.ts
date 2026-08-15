import { z } from "zod";
import type { Tables } from "@/lib/database.types";

export const MOOD_MAX_TROPES = 3;
export const MOOD_STEP_SIZE = 3;

/** Defensive transport bound — a user-facing 1–3 cap is enforced separately in validation. */
const MAX_MOOD_TROPE_PARAMS = 26;

export interface MoodSelection {
  tropes: string[];
}

export type MoodSelectionValidation =
  | { status: "empty" }
  | { status: "too-many"; tropes: string[] }
  | { status: "ok"; tropes: string[] };

const moodTropeSchema = z.string().transform((value) => value.trim());

const moodSelectionSchema = z
  .array(moodTropeSchema)
  .pipe(
    z
      .array(z.string())
      .min(1, { error: "Pick at least one trope" })
      .max(MOOD_MAX_TROPES, { error: "Pick no more than 3 tropes" }),
  );

function parseMoodTropes(params: URLSearchParams): string[] {
  const tropes: string[] = [];
  const seen = new Set<string>();

  for (const raw of params.getAll("trope")) {
    const result = moodTropeSchema.safeParse(raw);
    const trimmed = result.success ? result.data : raw.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    tropes.push(trimmed);
    if (tropes.length >= MAX_MOOD_TROPE_PARAMS) break;
  }

  return tropes;
}

export function parseMoodSelection(params: URLSearchParams): MoodSelection {
  return { tropes: parseMoodTropes(params) };
}

export function validateMoodSelection(selection: MoodSelection): MoodSelectionValidation {
  if (selection.tropes.length === 0) {
    return { status: "empty" };
  }

  if (selection.tropes.length > MOOD_MAX_TROPES) {
    return { status: "too-many", tropes: selection.tropes };
  }

  const result = moodSelectionSchema.safeParse(selection.tropes);
  if (!result.success) {
    return { status: "too-many", tropes: selection.tropes };
  }

  return { status: "ok", tropes: result.data };
}

export function matchesAnyTrope(book: Pick<Tables<"books">, "tropes">, tropes: string[]): boolean {
  if (tropes.length === 0) return false;

  for (const trope of tropes) {
    if (book.tropes.includes(trope)) return true;
  }

  return false;
}

export function sortBooksForMood<T extends Pick<Tables<"books">, "id" | "title">>(books: T[]): T[] {
  return [...books].sort((a, b) => {
    const titleCmp = a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" });
    if (titleCmp !== 0) return titleCmp;

    return a.id.localeCompare(b.id);
  });
}

export function parseMoodShowCount(params: URLSearchParams): number {
  const raw = params.get("show");
  if (raw === null || raw.trim() === "") {
    return MOOD_STEP_SIZE;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < MOOD_STEP_SIZE) {
    return MOOD_STEP_SIZE;
  }

  return Math.ceil(parsed / MOOD_STEP_SIZE) * MOOD_STEP_SIZE;
}

export interface MoodMatchSlice<T> {
  visible: T[];
  total: number;
  nextShow: number | null;
}

export function takeMoodMatches<T>(matches: T[], show: number): MoodMatchSlice<T> {
  const total = matches.length;
  const clampedShow = Math.min(show, total);
  const visible = matches.slice(0, clampedShow);
  const nextShow = clampedShow < total ? clampedShow + MOOD_STEP_SIZE : null;

  return { visible, total, nextShow };
}

export function buildMoodHref(tropes: string[], show?: number): string {
  const params = new URLSearchParams();

  for (const trope of tropes) {
    params.append("trope", trope);
  }

  if (show !== undefined && show !== MOOD_STEP_SIZE) {
    params.set("show", String(show));
  }

  const query = params.toString();
  return query.length > 0 ? `/mood?${query}` : "/mood";
}
