# Search and Filter the TBR (S-04) Implementation Plan

## Overview

Let a signed-in user narrow `/books` by a case-insensitive substring match on title or author, and/or by selecting one or more of their own trope tags. Filter state lives in URL query params (`q`, repeated `trope`), so filtered views are shareable, bookmarkable, and survive a page reload. Narrowing happens server-side in Astro frontmatter over the rows the page already fetches — no new npm dependencies, and no client-side JavaScript added to the list page.

Implements FR-012 / roadmap slice S-04.

## Current State Analysis

`src/pages/books/index.astro` fetches every book the user owns in a single query (`index.astro:82-85`), sorts it via `sortBooksForBrowse`, and renders it through `BookList.astro`, which ships zero client JavaScript — disclosure uses `<details>`, navigation uses anchors, delete uses a form POST plus redirect.

The page runs a three-state machine (`failed` / `empty` / `populated`, `index.astro:76-96`) and a heading that shows the total count (`index.astro:98`).

Three constraints discovered while reading the code:

1. **Mutation redirects strip all query params.** `/books?notice=…` and `/books?error=…` are converted to a flash cookie and then redirected to a hardcoded bare `/books` (`index.astro:42` and `index.astro:53`). Every mutation arrives that way: delete posts and redirects to `/books?notice=deleted` (`api/books/[id]/delete.ts:41`), edit navigates to `/books?notice=duplicate&highlight=…` or `/books#book-…` (`EditBookForm.tsx:229-231`). Filters cannot survive a mutation unless this round-trip is threaded through.
2. **The delete API never reads its request body.** It only uses `context.params.id` (`api/books/[id]/delete.ts:19`), so carrying filter state back through a delete requires reading form data it currently ignores.
3. **Trope values are user-authored free text, never normalized.** The PRD lists "global curated trope vocabulary / canonical normalization" as a permanent non-goal ("user wording IS the data"), so `Enemies to Lovers` and `enemies to lovers` are two distinct tags and must remain so.

No test framework is wired up (`package.json:5-14`); automated verification is `npx astro sync`, `npm run lint`, `npm run build`.

## Desired End State

A user viewing `/books` sees a filter bar above their list containing a search box and a checkbox per distinct trope in their TBR. Typing a fragment of a title or author and/or ticking tropes and submitting reloads the page at a URL like `/books?q=hairpin&trope=Grumpy%20Sunshine`, showing only matching books, with the heading reading `Your TBR (12 of 143)`. A "Clear filters" link returns to the full list. When nothing matches, the filter bar stays populated and a distinct message explains that no books matched — not the "your TBR is empty" copy. Editing or deleting a book from a filtered view returns the user to that same filtered view.

Verify by loading `/books?q=…&trope=…` directly in a fresh tab with JavaScript disabled and confirming the filtered list renders correctly.

### Key Discoveries:

- Extension point is a single query at `src/pages/books/index.astro:82-85`; the render contract of `BookList.astro` does not need to change for filtering itself.
- `context/foundation/lessons.md:47-52` names S-04 explicitly and mandates native HTML (URL query params for filtering) over React islands on this page.
- The page must fetch all the user's rows regardless, because both the trope checkbox vocabulary and the `12 of 143` total require the unfiltered set — which is why filtering in frontmatter costs one query instead of two.
- `sortBooksForBrowse` (`src/lib/sort-books-for-browse.ts:8-21`) drops `created_at` when mapping to `BookListRow`, so filtering must run on the raw query rows before sorting.
- `security.checkOrigin` is pinned `true` and the delete form relies on it (`AGENTS.md`); adding hidden inputs to that form does not affect it.

## What We're NOT Doing

- **No fuzzy or typo-tolerant search.** FR-012 specifies substring match. `fuzzysort` was evaluated in `research.md` and deferred.
- **No searching inside `description`.** FR-012 names title and author only; matches inside a 2000-character description are invisible on a collapsed row.
- **No diacritic folding or Unicode normalization** in the text match (`Étoile` will not match a search for `Etoile`). Straight case-insensitive substring only; revisit if it bites in real use.
- **No trope normalization, canonicalization, or case-merging** — permanent PRD non-goal.
- **No `pg_trgm` index or other DB-side optimization.** Not warranted at ~145 rows; deferred per `research.md`.
- **No shadcn combobox, `cmdk`, `nuqs`, or any new npm dependency.**
- **No sort controls, pagination, or saved filters.** Out of scope for FR-012.
- **No test framework.** The repo has none and wiring one in would require CI changes (`AGENTS.md`). The filter core in Phase 1 is deliberately shaped as a dependency-free pure module so tests can be added later without refactoring it.
- **No React island anywhere on `/books`.** Explicitly ruled out by `lessons.md`.

## Implementation Approach

One query fetches all the user's books, as today. Frontmatter then, in order, collects the trope vocabulary from the full set, applies the filters to the raw rows, and sorts the survivors. All of this runs on the Cloudflare Worker during SSR — the page remains zero-JS.

Filter state round-trips as individual `q` and `trope` values, never as a pre-built return URL. Every place that redirects back to `/books` re-serializes those values server-side, which keeps the feature free of open-redirect risk.

## Critical Implementation Details

**Ordering within frontmatter is load-bearing.** The sequence must be: fetch all rows → collect trope vocabulary from *all* rows → merge the requested tropes into that vocabulary for display → filter the raw rows → `sortBooksForBrowse(filtered)`. Collecting the vocabulary after filtering would make a checked trope disappear from the UI whenever it excluded everything else, stranding the user with a filter they can no longer untick. Sorting before filtering is impossible because `sortBooksForBrowse` discards `created_at` in its return type.

**The `notice` / `error` redirect at `index.astro:35-55` runs before any data is fetched and rebuilds its destination from scratch.** Phase 3 must reconstruct the filter query string at that point from `Astro.url.searchParams`, because at that moment the vocabulary is not yet known. Merging requested tropes into the display vocabulary is therefore a Phase 2 concern on the render path only — the redirect path passes the raw validated values straight through.

**Requested tropes absent from the user's vocabulary must be kept in the filter and rendered as checked.** A bookmarked URL can name a trope the user has since renamed, or whose last carrier they deleted. Because trope matching is all-match, silently dropping such a trope would *widen* the result set — the filter would quietly return books the user never asked for. The correct result is zero matches, so the trope stays in the filter; and because the checkbox list is derived from tropes that actually occur in the data, it must be explicitly unioned with the selected set so the stale entry still renders as a tickable box. Without that union the user lands on `0 of 143` with no visible cause and no way out but "Clear filters".

## Phase 1: Filter Core

### Overview

A standalone, dependency-free module holding all filter semantics: URL param validation, match logic, vocabulary collection, and URL serialization. No page or component changes — nothing is user-visible after this phase.

### Changes Required:

#### 1. Filter module

**File**: `src/lib/book-filters.ts` (new)

**Intent**: Own every decision about what a filter is, what matches it, and how it is written back into a URL, so the page, the components, and the API route all share one definition instead of re-implementing parsing in five places.

**Contract**: Exports the following. `BookFilters` is `{ q: string; tropes: string[] }`.

- `parseBookFilters(params: URLSearchParams): BookFilters` — reads `q` (trimmed, clamped to 300 chars to match `titleSchema`'s ceiling in `book-schema.ts:23-28`) and every repeated `trope` value (each trimmed, empties dropped, deduped preserving first-seen order). Do **not** cap the selected-trope count at `tropeListSchema`'s per-book max of 25 — that ceiling is tropes on one book, not tropes in a filter. Validate with `zod`, reusing the trim-then-pipe style already in `book-schema.ts`, but **do not reuse `tropeListSchema` itself** (its `min(1)` / `max(25)` would reject a q-only search or a 26-trope filter). Never throws. Clamp or skip a bad *field*; never degrade a request that contained tropes into an empty filter — that would widen the result set, which Critical Implementation Details forbid. An overlong trope string stays in `filters.tropes` so all-match returns zero, matching stale-trope behaviour.
- `hasActiveFilters(filters: BookFilters): boolean` — true when `q` is non-empty or at least one trope is selected.
- `matchesBookFilters(book, filters): boolean` for `book: Pick<Tables<"books">, "title" | "author" | "tropes">` — text and trope conditions combine with AND. Text passes when the lowercased `q` is a substring of the lowercased `title` or `author`. Tropes pass when the book's `tropes` contain **every** entry in `filters.tropes`, compared exactly (all-match). An empty condition always passes.
- `collectTropeVocabulary(books: { tropes: string[] }[], alsoInclude?: string[]): string[]` — distinct trope strings across the input unioned with `alsoInclude`, compared exactly (no case folding), sorted with `localeCompare(…, { numeric: true, sensitivity: "base" })` to mirror the tie-break convention in `sort-books-for-browse.ts:15`. `alsoInclude` carries the selected tropes so a stale selection still renders a checkbox — see Critical Implementation Details.
- `serializeBookFilters(filters: BookFilters): string` — a query string with **no** leading `?`, empty when no filters are active. Emit `q` first, then each trope in array order, via `URLSearchParams` so encoding is handled.
- `buildBooksHref(filterQuery: string, options?: { notice?: string; error?: string; highlight?: string; hash?: string }): string` — composes a `/books` URL from a serialized filter string plus optional extras, merging query segments with `URLSearchParams` rather than string concatenation. This is the single place `?` versus `&` is decided; every redirect and link in Phases 2 and 3 goes through it. `error` covers the delete and edit-page load-failure flashes (`delete_failed`, `not_found`, `load_failed`); `notice` covers `deleted` / `duplicate`.

**Contract note**: `buildBooksHref` is imported by `EditBookForm.tsx`, which is client-side React. Keep this module free of `astro:*` imports and any server-only dependency.

### Success Criteria:

#### Automated Verification:

- Astro types regenerate: `npx astro sync`
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- `src/lib/book-filters.ts` imports nothing server-only, so it is safe to use from a React island

---

## Phase 2: Filter Bar and Page Wiring

### Overview

Adds the visible feature: a native GET form above the list, filtered results, the `12 of 143` heading, and the no-match state. After this phase the slice is usable end-to-end; only the mutation round-trip remains.

### Changes Required:

#### 1. Filter bar component

**File**: `src/components/books/BookFilterBar.astro` (new)

**Intent**: Render the search box and trope checkboxes as a plain HTML GET form so submitting updates the URL and re-renders server-side, with no hydration.

**Contract**: Props `{ filters: BookFilters; tropeVocabulary: string[] }`. Renders `<form method="GET" action="/books">` containing a labelled text input `name="q"` pre-filled from `filters.q`; a `<fieldset>` with a `<legend>` wrapping one `<input type="checkbox" name="trope">` per vocabulary entry, `value` set to the trope and `checked` when selected; a submit button; and — only when `hasActiveFilters(filters)` — a "Clear filters" anchor to `/books`. The form must not carry `error`, `notice`, or `highlight` inputs; those are transient and must not be re-submitted. Style with the existing glass-panel Tailwind classes used in `index.astro` (`border-white/10`, `bg-white/5`, `text-blue-100/*`) — the Café Romance restyle is S-07's job, not this slice's.

#### 2. List page wiring

**File**: `src/pages/books/index.astro`

**Intent**: Parse the filters, apply them in the correct order, expand the state machine to cover "no matches", and report both counts in the heading.

**Contract**: After the existing fetch succeeds, in this order: `parseBookFilters(Astro.url.searchParams)`; `collectTropeVocabulary(data, filters.tropes)` so any selected-but-absent trope still renders a checkbox; filter `data` with `matchesBookFilters` using the filters exactly as parsed (never a reduced set); pass the survivors to `sortBooksForBrowse`.

The `state` union gains a fourth member — `"failed" | "empty" | "no-match" | "populated"` — where `empty` still means the user owns zero books and the new `no-match` means they own books but none passed the filter. Both `no-match` and `populated` render `BookFilterBar`; `empty` and `failed` do not.

`headingText` becomes `Your TBR (${filtered.length} of ${data.length})` when filters are active and `Your TBR (${data.length})` when they are not.

The `no-match` branch renders copy distinct from the empty-TBR copy, naming what was filtered on and offering the same "Clear filters" link to `/books`. The `DeleteBookModal` loop at `index.astro:191-195` stays gated on `state === "populated"`.

### Success Criteria:

#### Automated Verification:

- Astro types regenerate: `npx astro sync`
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- Searching a title fragment narrows the list; searching an author fragment does too; search is case-insensitive
- Ticking one trope shows books carrying it; ticking a second narrows further to books carrying both (all-match), and combining a search term with tropes narrows correctly
- Selecting more tropes than any one book can hold (26+) returns zero matches with those tropes still ticked — not the unfiltered list
- A URL naming a trope no longer present in any book returns zero matches and still renders that trope as a ticked checkbox that can be unticked
- Heading reads `Your TBR (N of M)` while filtered and `Your TBR (M)` when cleared
- A filter matching nothing shows the no-match message, not the empty-TBR copy, and the filter bar keeps the submitted values
- "Clear filters" returns to the full unfiltered list
- Pasting a filtered URL into a fresh tab reproduces the same filtered view
- A search term containing punctuation (`O'Brien`, `Wait, What?`, `100%`, `a"b`) is treated as literal text and neither errors nor returns wrong rows
- **The page works with JavaScript disabled** — required by `lessons.md:51`

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Filter Persistence Across Edit and Delete

### Overview

Threads the active filters through every path that returns the user to `/books`, so editing or deleting from a filtered view lands back on that view.

### Changes Required:

#### 1. Edit link and delete form carry the filters

**File**: `src/components/books/BookList.astro`, `src/components/books/DeleteBookModal.astro`

**Intent**: Give each row's outbound edit link and each modal's delete POST enough information to reconstruct the current filtered view on the way back.

**Contract**: `BookList.astro` gains a `filterQuery: string` prop (the output of `serializeBookFilters`, no leading `?`). Its edit anchor at `BookList.astro:28` uses `/books/${book.id}/edit?${filterQuery}` when the query is non-empty and the existing bare edit URL otherwise. `DeleteBookModal.astro` gains a `filters: BookFilters` prop and renders, inside the existing `<form method="POST">` at `DeleteBookModal.astro:52`, a hidden `q` input when non-empty plus one hidden `trope` input per selected trope. In `index.astro`, pass `filterQuery` to the `BookList` call at `:187` and `filters` to every `DeleteBookModal` in the loop at `:191-195`. The `dismissHref` contract is unchanged.

#### 2. Delete API preserves filters on every redirect

**File**: `src/pages/api/books/[id]/delete.ts`

**Intent**: Read the filter values the form now posts and re-attach them to all five redirect targets, so a delete returns to the filtered list.

**Contract**: Call `await context.request.formData()` **before** the supabase null check at `:8` (same ordering as `src/pages/api/auth/signin.ts` / `signup.ts`). Copy each string entry into a new `URLSearchParams` with `append`, preserving every repeated `trope`, then feed those params through `parseBookFilters`; do not use `Object.fromEntries`, which would collapse repeated names. Build each redirect with `buildBooksHref`. This applies to the four error redirects (`:8`, `:21`, `:34`, `:38`) as well as the success redirect (`:41`). The `/auth/signin` redirect at `:16` is unchanged. **Do not** accept a caller-supplied return URL — only the individual `q` and `trope` values, re-serialized server-side.

#### 3. Flash-message redirects stop stripping filters

**File**: `src/pages/books/index.astro`

**Intent**: Stop the `notice` / `error` round-trip from discarding the filters it was handed.

**Contract**: The two redirect destinations built at `index.astro:42` and `index.astro:53` are constructed via `buildBooksHref` from `serializeBookFilters(parseBookFilters(Astro.url.searchParams))`, preserving the existing `#book-<id>` fragment behaviour for the `highlight` case. This runs before the fetch, so it passes the raw validated tropes straight through — the vocabulary union is a render-path concern only.

#### 4. Edit page and form return to the filtered view

**File**: `src/pages/books/[id]/edit.astro`, `src/components/books/EditBookForm.tsx`

**Intent**: Carry the filters across the edit detour so saving or cancelling lands back on the filtered list.

**Contract**: `edit.astro` derives `filterQuery` from its own `Astro.url.searchParams` (populated by the edit link from change #1) **before** any load-time redirect, and uses it for: the four load-failure redirects at `edit.astro:23`, `:29`, `:43`, `:47` via `buildBooksHref(filterQuery, { error: "load_failed" | "not_found" })`; the "View your TBR" anchor at `edit.astro:62`; the `filters` prop on its `DeleteBookModal` at `edit.astro:91-97`; and a new `filterQuery: string` prop on `EditBookForm`. The unauthenticated redirect at `:17` stays `/auth/signin`.

`EditBookForm.tsx` accepts that prop and replaces all three hardcoded `/books` destinations with `buildBooksHref` calls: the duplicate branch at `:229` passing `notice: "duplicate"`, `highlight: id`, and `hash: \`book-${id}\``; the normal save branch at `:231` passing only the hash; and the Cancel anchor at `:350-356` passing only the hash. Keep `data-unsaved-guard` on Cancel. This is the reason `buildBooksHref` must stay free of server-only imports.

**Contract note**: The `data-unsaved-guard` attribute on the "View your TBR" and Cancel anchors is read by `EditBookForm`'s document listeners (see the comment at `edit.astro:10-12`); changing either `href` must not disturb that attribute.

### Success Criteria:

#### Automated Verification:

- Astro types regenerate: `npx astro sync`
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- Deleting a book from a filtered list returns to the same filtered list with the deleted row gone and the "Book deleted." message shown
- Editing a book without changing whether it matches the active filters returns to the same filtered list, scrolled to that book
- Editing a book so it no longer matches the active filters preserves those filters and shows the correct remaining results or no-match state, without requiring a highlight target
- Saving an edit that triggers the duplicate notice returns to the filtered list with the duplicate message shown
- Cancelling out of the edit page via "View your TBR" **or** the form's Cancel control returns to the filtered list
- A load-time edit failure (`load_failed` / `not_found`) from a filtered edit URL returns to that filtered list with the error flash, not the bare `/books`
- The unsaved-changes guard on the edit page still fires when leaving with pending edits
- Deleting the last remaining match transitions to the no-match state, not the empty-TBR state
- Deleting from an unfiltered list behaves exactly as before
- Hand-editing the hidden form values to a foreign URL does not cause a redirect off-site
- **All of the above still work with JavaScript disabled**, except the edit form itself, which is already a React island

---

## Testing Strategy

No automated test framework exists in this repo, so verification is the build/lint pipeline plus manual browser testing.

### Manual Testing Steps:

1. Sign in with an account holding a realistic TBR (ideally 100+ books across many tropes).
2. Load `/books`, confirm the filter bar renders with a checkbox per distinct trope, sorted alphabetically, with case variants listed separately.
3. Search a title fragment, then an author fragment, then a mixed-case fragment; confirm each narrows correctly and the heading shows `N of M`.
4. Tick one trope, then a second; confirm results narrow to books carrying both (all-match). Combine with a search term and confirm the two conditions AND together. Tick two tropes no single book shares and confirm zero results.
4a. Copy a filtered URL, then edit the last book carrying one of its tropes so that trope disappears from your library. Reopen the URL: it should show zero matches with the now-absent trope still rendered as a ticked box you can untick.
5. Search for punctuation-heavy terms (`O'Brien`, `Wait, What?`, `100%`, `a"b`, `50_50`) and confirm they are matched literally with no errors.
6. Filter to zero results; confirm the no-match message, the retained filter values, and the working "Clear filters" link.
7. Copy the filtered URL into a new tab and confirm it reproduces the view.
8. From a filtered view, delete a book and confirm the filter survives. Edit a book without changing whether it matches and confirm the page returns at its highlighted row; then edit a filter-relevant field so the book no longer matches and confirm the filters remain active with the correct remaining results or no-match state. Repeat with an edit-triggering-duplicate, Cancel, and "View your TBR". From a filtered edit URL, confirm a load failure (`/books/<bogus-id>/edit?q=…`) returns to the filtered list with the error flash.
9. Filter to a single match and delete it; confirm the no-match state appears rather than the empty-TBR copy.
10. Disable JavaScript entirely and repeat steps 2–7 plus the native portions of steps 8–9: delete from a filtered list, delete the last match, use "View your TBR", and exercise a load-failure redirect. Edit-form interactions are excluded because that form is already a React island.
11. Sign in as a second account and confirm no cross-account rows are reachable through any filter (FR-011).

## Performance Considerations

The page already fetches every row the user owns, so this slice adds no query cost — filtering, vocabulary collection, and sorting are all O(N) passes over an array verified at 145 entries, well inside the Worker CPU budget noted in `context/foundation/lessons.md:12-17`. The design assumes low-hundreds of books per user; if a user ever reaches low thousands, revisit by moving the filter into the Supabase query, at which point the PostgREST escaping work described in `research.md` becomes necessary.

## Migration Notes

No database migration, no schema change, no new dependency. All URLs remain backward compatible: an unfiltered `/books` behaves exactly as it does today.

## References

- Library research: `context/changes/search-filter-tbr/research.md`
- Slice definition: `context/foundation/roadmap.md:171-181`
- Requirement: `context/foundation/prd.md` FR-012
- Binding lesson: `context/foundation/lessons.md:47-52`
- Prior list slice: `context/archive/2026-08-08-browse-tbr-list/plan.md`
- Prior mutation slice: `context/archive/2026-08-11-edit-delete-book/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Filter Core

#### Automated

- [ ] 1.1 Astro types regenerate: `npx astro sync`
- [ ] 1.2 Linting passes: `npm run lint`
- [ ] 1.3 Production build succeeds: `npm run build`

#### Manual

- [ ] 1.4 `book-filters.ts` imports nothing server-only, safe for use from a React island

### Phase 2: Filter Bar and Page Wiring

#### Automated

- [ ] 2.1 Astro types regenerate: `npx astro sync`
- [ ] 2.2 Linting passes: `npm run lint`
- [ ] 2.3 Production build succeeds: `npm run build`

#### Manual

- [ ] 2.4 Title, author, and case-insensitive search each narrow the list
- [ ] 2.5 Trope selection is all-match; text and tropes combine with AND
- [ ] 2.6 Selecting 26+ tropes returns zero matches, not the unfiltered list
- [ ] 2.7 A stale trope in the URL returns zero matches and still renders as a tickable checked box
- [ ] 2.8 Heading reads `N of M` when filtered and `M` when cleared
- [ ] 2.9 No-match state shows distinct copy and retains submitted filter values
- [ ] 2.10 "Clear filters" returns to the full list
- [ ] 2.11 A filtered URL pasted into a fresh tab reproduces the view
- [ ] 2.12 Punctuation-heavy search terms are matched literally without errors
- [ ] 2.13 Page works with JavaScript disabled

### Phase 3: Filter Persistence Across Edit and Delete

#### Automated

- [ ] 3.1 Astro types regenerate: `npx astro sync`
- [ ] 3.2 Linting passes: `npm run lint`
- [ ] 3.3 Production build succeeds: `npm run build`

#### Manual

- [ ] 3.4 Delete from a filtered list returns to that filtered list with the notice shown
- [ ] 3.5 A match-preserving edit returns to the filtered list at the highlighted row
- [ ] 3.6 A match-removing edit preserves filters and shows the correct remaining or no-match state
- [ ] 3.7 Duplicate-notice save returns to the filtered list with the message shown
- [ ] 3.8 "View your TBR" and Cancel from the edit page return to the filtered list
- [ ] 3.9 Unsaved-changes guard still fires on the edit page
- [ ] 3.10 Deleting the last match yields the no-match state, not the empty-TBR state
- [ ] 3.11 Deleting from an unfiltered list is unchanged
- [ ] 3.12 Tampered hidden form values cannot redirect off-site
- [ ] 3.13 Load-time edit errors return to the filtered list with the error flash
- [ ] 3.14 All of the above work with JavaScript disabled (except the edit form island)
