import type { Tables } from "@/lib/database.types";

interface SavedBooksListProps {
  books: Tables<"books">[];
}

const tropePillClasses = ["bg-trope-blush", "bg-trope-oat", "bg-trope-stone"] as const;

export function SavedBooksList({ books }: SavedBooksListProps) {
  return (
    <section className="border-border mt-8 border-t pt-6">
      <h2 className="mb-1 text-lg font-semibold">Added this session ({books.length})</h2>
      <p className="text-muted-foreground mb-4 text-sm">
        Books you add here appear below until you refresh.
        <br />
        Don&apos;t worry, the added ones are already saved to your TBR.
      </p>
      {books.length > 0 ? (
        <ul className="space-y-4">
          {books.map((book) => (
            <li key={book.id} className="border-border bg-card rounded-lg border p-4 shadow-sm">
              <p className="text-foreground font-medium">{book.title}</p>
              <p className="text-muted-foreground text-sm">{book.author}</p>
              {book.description ? <p className="text-muted-foreground mt-1 text-sm">{book.description}</p> : null}
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {book.tropes.map((trope, index) => (
                  <li
                    key={`${book.id}-${trope}-${String(index)}`}
                    className={`text-trope-text rounded-md px-2 py-0.5 text-xs ${tropePillClasses[index % 3]}`}
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
