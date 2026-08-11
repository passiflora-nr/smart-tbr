import type { Tables } from "@/lib/database.types";

type BrowseBookRow = Pick<Tables<"books">, "id" | "title" | "author" | "tropes" | "description" | "created_at">;

export type BookListRow = Pick<Tables<"books">, "id" | "title" | "author" | "tropes" | "description">;

/** Newest first; natural numeric order on title when `created_at` ties; then `id`. */
export function sortBooksForBrowse(books: BrowseBookRow[]): BookListRow[] {
  return [...books]
    .sort((a, b) => {
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      if (aTime !== bTime) return bTime - aTime;

      const titleCmp = a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" });
      if (titleCmp !== 0) return titleCmp;

      return a.id.localeCompare(b.id);
    })
    .map(({ id, title, author, tropes, description }) => ({ id, title, author, tropes, description }));
}
