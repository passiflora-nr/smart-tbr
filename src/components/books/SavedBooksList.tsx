import type { Tables } from "@/lib/database.types";

interface SavedBooksListProps {
  books: Tables<"books">[];
}

export function SavedBooksList({ books }: SavedBooksListProps) {
  return (
    <section className="mt-8 border-t border-white/10 pt-6">
      <h2 className="mb-1 text-lg font-semibold text-white">Added this session ({books.length})</h2>
      <p className="mb-4 text-sm text-blue-100/60">
        Books you add here appear below until you refresh.
        <br />
        Don&apos;t worry, the added ones are already saved to your TBR.
      </p>
      {books.length > 0 ? (
        <ul className="space-y-4">
          {books.map((book) => (
            <li key={book.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
              <p className="font-medium text-white">{book.title}</p>
              <p className="text-sm text-blue-100/70">{book.author}</p>
              {book.description ? <p className="mt-1 text-sm text-blue-100/60">{book.description}</p> : null}
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {book.tropes.map((trope, index) => (
                  <li
                    key={`${book.id}-${trope}-${String(index)}`}
                    className="rounded-md bg-white/15 px-2 py-0.5 text-xs text-white"
                  >
                    {trope}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
