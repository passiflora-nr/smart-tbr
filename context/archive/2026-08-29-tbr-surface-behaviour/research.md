---
date: 2026-08-29T14:26:40+02:00
researcher: Cursor Agent
git_commit: 77d28d31eb224987face63ba54deb0f301d2c06f
branch: tbr-surface-behaviour
repository: passiflora-nr/smart-tbr
topic: "Ground rollout Phase 2 of the test plan: TBR surface behaviour"
tags: [research, codebase, books, book-filters, integration-tests, tbr]
status: complete
last_updated: 2026-08-29
last_updated_by: Cursor Agent
---

# Research: Grounding Test-Plan Phase 2 — TBR Surface Behaviour

**Date**: 2026-08-29 14:26 (UTC+2)
**Researcher**: Cursor Agent
**Git Commit**: `77d28d31eb224987face63ba54deb0f301d2c06f`
**Branch**: `tbr-surface-behaviour`
**Repository**: `passiflora-nr/smart-tbr`

> Branch is not pushed; references stay as local `path:line`.

## Research Question

Ground rollout Phase 2 of `context/foundation/test-plan.md` ("TBR surface behaviour"): prove every control on browse / search / filter / edit / delete produces the right set of books, asserting data not markup.

Risks to verify: #1, #2, #3.

Risk response guidance to verify, not blindly accept:

- **#1**: prove a book submitted with N tropes is readable back with those N tropes, and an edit that changes one field leaves the others intact; challenge "the form posted successfully"; avoid asserting redirect status only.
- **#2**: prove submitting a filter, search, delete, or edit produces the changed **set of books**; challenge "the control is present"; avoid CSS, DOM structure, or element counts.
- **#3**: prove critical flows still pass after a markup rewrite; challenge tests coupled to today's markup; ground which surfaces are zero-JS vs island-dependent.

## Summary

Risk #2 is real and untested. Search and trope filter travel as **GET query params** (`q`, repeated `trope`) on a native HTML form; the browse page applies them **server-side** in frontmatter. Delete is a **form POST** that redirects back to the same filtered `/books`. There is **no** `GET /books` test today — Phase 1 hits `/api/books` and `/mood` only.

Risk #1 is already proven at the API/storage boundary by Phase 1. Phase 2 should not re-prove schema normalisation. Its remaining #1 job is the **list surface**: after an edit or delete, `GET /books` HTML contains the expected titles (and does not contain the removed or old title).

Risk #3 is confirmed for `/books`: the list, filter bar, and delete modal are **zero-JS server HTML**. Tests that `toContain` book titles and fixed explanatory copy will survive S-07. Add-save and edit-save are **React islands** (`client:load`); integration cannot honestly prove those buttons without a browser — that stays Phase 4. Phase 2 can still prove the data path: JSON POST/PUT or form-delete, then `GET /books`.

The cheapest useful layer is still **integration** for control wiring (the "renders but does nothing" class). `src/lib/book-filters.ts` is a pure, importable module with **zero unit tests**; a small unit suite is the cheaper way to lock the matching **rule** (all-match AND, case-insensitive `q`, stale trope stays). Unit tests cannot replace the page GET — they would still pass if `index.astro` stopped calling `matchesBookFilters`.

**Do not invent sort or pagination tests.** `/books` has neither as a user control.

## Detailed Findings

### Filter and search state travel

State lives only in the URL. `BookFilterBar.astro` is `<form method="GET" action="/books">` (`src/components/books/BookFilterBar.astro:22`) with `name="q"` (`:27-31`) and checkboxes `name="trope"` (`:100-104`). Submit is the **Apply filters** button (`:120-125`). There is no live filtering, no React state on the list, and no client cache.

The page reads that URL here:

```45:46:src/pages/books/index.astro
const filters: BookFilters = parseBookFilters(Astro.url.searchParams);
const filterQuery = serializeBookFilters(filters);
```

Then fetches **every** owned row, builds vocabulary from the full set (unioned with requested tropes so a stale selection still renders), filters, then sorts:

```110:113:src/pages/books/index.astro
    totalBookCount = data.length;
    tropeVocabulary = collectTropeVocabulary(data, filters.tropes);
    const filtered = data.filter((book) => matchesBookFilters(book, filters));
    books = sortBooksForBrowse(filtered);
```

Clear-search is an `<a>` that drops `q` and keeps tropes (`BookFilterBar.astro:18`, `:38-39`). Clear-all is `<a href="/books">` when filters are active (`:128-136`).

Filter context is threaded through mutations, never as a caller-supplied return URL:

- Edit link: `buildEditHref` → `/books/{id}/edit?{filterQuery}` (`src/lib/book-filters.ts:131-133`, `BookList.astro:26`).
- Delete form: hidden `q` plus one hidden `trope` per selection (`DeleteBookModal.astro:55-57`).
- Delete handler reads `formData()` first, re-parses, rebuilds via `buildBooksHref` (`src/pages/api/books/[id]/delete.ts:7-14`, `:51`).

### Matching contract (oracle for tests)

Independent of the current implementation's internals, the shipped contract from `search-filter-tbr/plan.md` and the live module is:

| Input       | Rule                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `q`         | Trimmed, clamped to 300 code points. Case-insensitive substring of **title or author**. Empty `q` passes. Description is **not** searched. |
| `trope`     | Repeated param. Trim, drop empties, dedupe first-seen. Cap at 26 selected tropes (`MAX_FILTER_TROPES` in `book-filters.ts:16`).            |
| Combined    | Text AND tropes. Tropes are **all-match**: the book must include **every** selected trope, compared **exactly** (no case fold).            |
| Stale trope | Kept in the filter. Vocabulary is unioned with `filters.tropes`. Result is zero matches, not a silently wider list.                        |
| 26+ tropes  | Zero matches, not the unfiltered list.                                                                                                     |

```59:77:src/lib/book-filters.ts
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
```

**Main correctness hazard:** mood uses the same param name `trope` with **any-match OR** (`matchesAnyTrope`). A Phase 2 test that copies mood fixtures or mood helpers will green-light the wrong browse rule. Oracle is FR-012 + the search-filter plan, not mood.

Early search-filter _research_ inferred any-match via PostgREST `.overlaps()`; the _plan_ reversed that to all-match. Live code matches the plan. Tests must follow the plan, not the archived research inference.

### Page states (copy is a safe oracle)

| State       | Condition                       | Copy / behaviour                                                                 | Lines                           |
| ----------- | ------------------------------- | -------------------------------------------------------------------------------- | ------------------------------- |
| `failed`    | No client or query error        | "Couldn't load your list. Try reloading the page."                               | `index.astro:96-97`, `:213-233` |
| `empty`     | Zero owned rows                 | "Your TBR is empty — add your first book to get started." Filter bar **hidden**. | `:107-108`, `:234-243`          |
| `no-match`  | Rows exist, filter matches none | "No books match your {search / tropes}." Filter bar **stays**.                   | `:115-116`, `:244-248`          |
| `populated` | Matches exist                   | Filter bar + list + one delete modal per visible book                            | `:117-119`, `:249-263`          |

`empty` vs `no-match` is the distinction a markup-blind test can still prove: same user, zero fixtures → empty copy; fixtures plus a guaranteed-miss `q` → no-match copy.

Heading text `Your TBR (N of M)` (`index.astro:124-129`) encodes counts. Asserting those numbers is closer to the "element counts" anti-pattern than asserting titles. Prefer titles present/absent.

### Flash notices (test-harness trap)

`?error=` and `?notice=` are **not** rendered on the first response. `index.astro:48-69` writes an httpOnly cookie (`books_flash_error` / `books_flash_notice`) and **redirects** to the filtered `/books` (plus `#book-{id}` when `highlight` is a valid uuid). A `fetch` with `redirect: "manual"` that only reads that first 302 will never see "Book deleted."

Supported codes (`index.astro:21-30`):

- errors: `not_found`, `load_failed`, `delete_failed`
- notices: `duplicate`, `deleted` → "Book deleted."

There is no `?saved=` param.

`deleteBookViaAstroForm` today posts an empty body and only asserts 302/303 (`tests/integration/support/test-books.ts:84-94`). That is cleanup, not a surface proof.

`postFormWithManualRedirect` takes `Record<string, string>` (`http-session.ts:62-81`), so it **cannot** send repeated `trope` fields. Phase 2 needs `URLSearchParams` (or equivalent) for filter-preserving delete.

### Controls that change the book set

| Control                  | Transport                                     | JS?              | Observable set change                        |
| ------------------------ | --------------------------------------------- | ---------------- | -------------------------------------------- |
| Search + Apply filters   | GET `/books?q=&trope=`                        | No               | Titles narrow                                |
| Trope checkboxes + Apply | same GET                                      | No               | Titles narrow (AND)                          |
| Clear search             | GET, tropes kept                              | No               | `q` dropped                                  |
| Clear filters            | GET `/books`                                  | No               | Full set returns                             |
| Delete permanently       | POST `/api/books/{id}/delete`                 | No               | Title gone after redirect chain              |
| Edit save                | JSON `PUT` then `window.location` to `/books` | **Yes** (island) | New title on list; old title gone if renamed |
| Add to TBR               | JSON `POST`; **no** `/books` redirect         | **Yes** (island) | Title appears on later `GET /books` only     |

Not user controls on `/books` (do not add tests as if they were):

- Sort — fixed `created_at` desc, then title, then id (`sort-books-for-browse.ts:7-20`). No UI.
- Pagination — full library in one query (`index.astro:99-102`). "Show more" is mood-only.
- Row title — plain `<p>`, not a link (`BookList.astro:21`).
- Description "Show more" — `<details>`, does not change which books appear (`BookDescription.astro:17-24`).

Row **Edit** is an `<a>` (`BookList.astro:25-31`). Proving it "works" at the integration layer is: `GET /books/{id}/edit` returns 200 and the current title in the HTML; the Save button itself is island-only.

### Mutation persistence (Risk #1 remainder)

All three writes use the **anon SSR client** and RLS. Tropes are `books.tropes text[]`, not a join table.

| Op     | Route                         | Body                               | Success                   | Browse refresh                                                                                                                  |
| ------ | ----------------------------- | ---------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Add    | `POST /api/books`             | JSON, `bookSchema`                 | `201 { book, duplicate }` | None until user opens `/books`. Session list on `/books/new` is React state only (`AddBookForm.tsx:136`, `SavedBooksList.tsx`). |
| Edit   | `PUT /api/books/{id}`         | JSON, full four-field overwrite    | `200 { book, duplicate }` | `window.location.href = buildBooksHref(...)` (`EditBookForm.tsx:227-243`)                                                       |
| Delete | `POST /api/books/{id}/delete` | form `q` / `trope` (redirect only) | 302 `notice=deleted`      | Redirect → flash cookie → SSR re-query                                                                                          |

Ownership: `user_id` from `getUser()` on insert (`api/books.ts:67`); update/delete scoped `.eq("user_id", user.id)` (`[id].ts:71`, `delete.ts:39`). Service role is unused.

No success-redirect-without-write path found. Delete emits `notice=deleted` only when `.select()` after delete returns a row (`delete.ts:47-51`). Edit navigates only after `200` and a validated body.

Phase 1 already covers raw POST/PUT + independent Supabase read-back + "edit one field, siblings intact" (`tests/integration/books-persistence.test.ts:63-130`). **Do not duplicate that scenario.** Phase 2 adds the missing read: `GET /books` HTML titles.

Known caller contract (already in Phase 1 research): omit `description` on PUT → schema writes `null`. The browser always sends the key. Tests must too.

`mergePendingTrope` is still duplicated, unexported, island-only (`AddBookForm.tsx:27-36`, `EditBookForm.tsx:47-56`). Phase 1 deferred island coverage; Phase 2 integration still cannot import it. Leave pending-trope / paste to Phase 4.

### JavaScript vs server HTML (Risk #3)

`client:load` on book routes exists only on add and edit forms (`new.astro:36`, `[id]/edit.astro:89-90`). Browse, filter, delete modal (`:target` + form POST), description disclosure, and all list nav work with JavaScript disabled.

That matches `lessons.md` (prefer native HTML on per-row list surfaces) and the search-filter / browse / edit-delete plans.

Implication for Phase 2: a raw HTTP `GET /books?q=…` **is** the JS-disabled verification. Do not stand up jsdom or Playwright here. Island Save / Add-to-TBR buttons are Phase 4.

### Existing tests

| File                                          | What it proves                                                             | TBR surface?        |
| --------------------------------------------- | -------------------------------------------------------------------------- | ------------------- |
| `tests/unit/book-schema.test.ts`              | Shared schema accept/reject (Risk #6)                                      | No                  |
| `tests/unit/mood-selection.test.ts`           | FR-010 mood rule (Risk #5)                                                 | No — any-match      |
| `tests/unit/local-coordinates.test.ts`        | Loopback guards                                                            | Harness             |
| `tests/integration/books-persistence.test.ts` | POST/PUT persistence, mood HTML title + no-match copy, form-delete cleanup | **No `GET /books`** |

Grep of `tests/` finds no `q=`, no `parseBookFilters` / `matchesBookFilters`, no `GET /books` page. No `querySelector` / `innerHTML` / snapshots — the suite is already markup-clean.

Helpers Phase 2 should reuse: `signInWithForm`, `fetchUnknownJson`, `USER_D_*`, `createRunTitlePrefix`, `cleanupBooksWithTitlePrefix`, `createAuthenticatedVerificationClient`, `deleteBookViaAstroForm` (cleanup only).

Helpers Phase 2 will likely add:

- HTML GET with cookie header (mood test inlines this today at `books-persistence.test.ts:132-140`).
- Form POST that accepts repeated `trope` fields.
- Optional `createBookViaApi` to avoid pasting the JSON POST in every case.

Cookbook §6.2 rules still apply: user D only, `[integration-test]` title prefix, inject coordinates, same-origin `Origin`, pre-clean + `finally`, split-brain delete-and-fail if a 201 cannot be read locally.

### Risk verdicts vs response guidance

| Risk   | Verdict                                                                                                    | Guidance correction                                                                                                                                                                                                                                        |
| ------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#1** | Real at storage; **already covered** for API add/edit. Remaining gap is "list shows the persisted change." | Do not add another raw POST/PUT read-back. Assert titles on `GET /books` after PUT/delete. Redirect status alone still proves nothing.                                                                                                                     |
| **#2** | **Confirmed, uncovered.** Wiring is GET query + form POST; matching lives in `book-filters.ts`.            | Integration remains the layer that catches "control does nothing." Add a **unit** suite on `book-filters.ts` for the matching rule — cheaper than driving every AND/stale/26-cap case through HTTP. Test types in §3 ("integration" only) understate that. |
| **#3** | **Confirmed** for `/books` (zero-JS). Island save is out of Phase 2 reach.                                 | Same tests as #2, if they assert titles/copy not classes. No extra layer. Do not snapshot the filter bar.                                                                                                                                                  |

Hot-spot evidence in the test plan (`src/pages/books`, `src/components/books`) is valid for **wiring**. The matching rule that produces a wrong set lives in `src/lib/book-filters.ts`, which Phase 1 already listed as importable and which has no tests. That is not a reason to rewrite §2 as a file anchor; it is a reason for `/10x-plan` to include a unit sub-phase.

No speculative risk to drop.

## Code References

- `src/pages/books/index.astro:45-46` — parse filters from the request URL
- `src/pages/books/index.astro:48-69` — flash cookie + strip `error`/`notice` via redirect
- `src/pages/books/index.astro:99-119` — fetch all rows → vocabulary → filter → sort → state
- `src/pages/books/index.astro:234-248` — empty vs no-match copy
- `src/lib/book-filters.ts:48-77` — parse + all-match `matchesBookFilters`
- `src/lib/book-filters.ts:115-133` — `buildBooksHref` / `buildEditHref`
- `src/components/books/BookFilterBar.astro:22-125` — GET form, `q`, `trope`, Apply / Clear
- `src/components/books/BookList.astro:21-32` — title is not a link; Edit preserves filters
- `src/components/books/DeleteBookModal.astro:55-57` — hidden filter fields on delete POST
- `src/pages/api/books/[id]/delete.ts:7-51` — formData filters, ownership delete, redirect notices
- `src/pages/api/books.ts:6-77` — JSON add, `201 { book, duplicate }`
- `src/pages/api/books/[id].ts:6-84` — JSON full-field edit, `200 { book, duplicate }`
- `src/components/books/EditBookForm.tsx:208-243` — `fetch` PUT + `window.location` to `/books`
- `src/components/books/AddBookForm.tsx:103-136` — `fetch` POST; stays on `/books/new`
- `src/pages/books/new.astro:36` / `src/pages/books/[id]/edit.astro:89-90` — only `client:load` islands on book routes
- `src/lib/sort-books-for-browse.ts:7-20` — fixed sort, no UI
- `src/middleware.ts:4-21` — `/books` prefix gates new/edit too
- `tests/integration/books-persistence.test.ts:132-152` — only HTML fetch today (`/mood`)
- `tests/integration/support/http-session.ts:62-81` — form helper cannot repeat `trope`
- `tests/integration/support/test-books.ts:84-94` — delete helper asserts redirect only

## Architecture Insights

1. **List filtering is a server function over an already-fetched array**, not a Supabase `.or()` / `.overlaps()` query. Tests do not need PostgREST filter syntax; they need the page to run.
2. **Two `trope` languages.** Browse = all-match AND. Mood = any-match OR. Same query key, opposite set semantics.
3. **Add is not a browse mutation.** A passing add-API test does not prove the TBR list until someone `GET`s `/books`.
4. **Edit save is two hops the integration suite can split:** `PUT` (Phase 1) then `GET /books` (Phase 2). The island's `fetch` URL is unproven until Phase 4.
5. **Flash redirects consume cookies.** Title-absence after delete does not need the notice text. If a test wants "Book deleted.", it must follow the cookie hop.
6. **S-07 will rewrite classes on every surface.** `toContain(title)` and fixed sentences (`No books match your`, `Your TBR is empty`, `Book deleted.`) are the stable oracles. Do not assert `.book-row`, `details`, or `(N of M)` as a substitute for titles.

## Historical Context (from prior changes)

- `context/archive/2026-08-14-search-filter-tbr/plan.md` — `q` + repeated `trope`; all-match AND; stale trope stays; JS-disabled GET is the verification; filter round-trip must not accept a return URL.
- `context/archive/2026-08-14-search-filter-tbr/research.md` — inferred any-match; **superseded by the plan**. Do not treat that research as the oracle.
- `context/archive/2026-08-08-browse-tbr-list/plan.md` — newest-first sort; empty vs failed states; zero-JS list.
- `context/archive/2026-08-11-edit-delete-book/plan.md` — form POST delete (HTML cannot DELETE); flash codes; `:target` modal.
- `context/archive/2026-08-23-testing-harness-and-data-integrity/plan.md:61-79` — deferred island/jsdom, Playwright, RLS automation, snapshots, and `mergePendingTrope` export. Cookbook §6.6 left for this phase.
- `context/archive/2026-08-23-testing-harness-and-data-integrity/research.md` — `book-filters` is importable in Node; mood vs browse `trope` semantics called out as the main hazard; user D is the mutation account; user A is frozen at 6 rows.
- `context/foundation/lessons.md:47-52` — native HTML on per-row list surfaces; verify with JS disabled.
- `context/foundation/prd.md` — FR-005 browse, FR-006 edit, FR-007 delete, FR-012 search/filter, FR-011 own-books only; no trope normalisation (Non-Goals).
- `context/foundation/roadmap.md` — S-07 is a per-page class rewrite, next in queue.

## Related Research

- `context/archive/2026-08-23-testing-harness-and-data-integrity/research.md` — Phase 1 harness + Risks #1/#5/#6
- `context/archive/2026-08-14-search-filter-tbr/research.md` — filter transport (any-match inference is stale)
- `context/archive/2026-08-15-mood-trope-recommendation/research.md` — mood any-match; do not reuse as browse oracle

## Open Questions

None that block `/10x-plan`. Settled here:

- **Cheapest layer for wiring:** integration `GET /books` + title assertions (and form-delete + follow-up GET).
- **Cheapest layer for the matching rule:** unit tests on `book-filters.ts`, in addition to a few HTTP cases that prove `index.astro` still calls it.
- **Island Save / Add buttons:** out of Phase 2; Phase 4 e2e.
- **Ownership / forged-origin delete:** Phase 3.
- **Sort / pagination:** no user control; do not test as controls.

Plan should treat FR-012 + the search-filter plan as the oracle for expected sets, seed several user-D books with a run-scoped `[integration-test]` prefix, and fill cookbook §6.6 with "assert titles in the HTML body, never markup."
