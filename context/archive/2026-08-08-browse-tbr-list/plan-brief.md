# Browse the TBR List (S-02) — Plan Brief

> Full plan: `context/changes/browse-tbr-list/plan.md`

## What & Why

Roadmap slice **S-02** (PRD FR-005): a signed-in user can view their full TBR as a browsable list. This is the first read path into the `books` table — S-01 built the write path and deliberately avoided reading persisted rows so as not to borrow this scope. It unblocks S-03 (edit/delete) and S-04 (search/filter), and it is what turns a pile of saved rows into something the user can actually see.

## Starting Point

The data layer and gating already exist: `books` with an owner index and an RLS select policy, a cookie-scoped Supabase client, and `"/books"` already listed in `PROTECTED_ROUTES`. What is missing is anything that reads from them — `src/pages/api/books.ts` is POST-only and no page or component queries the table. The closest existing UI is `SavedBooksList.tsx`, which draws the right card shape but only for books added in the current browser session.

## Desired End State

Opening `/books` shows the user's entire TBR immediately on page load — newest first, every row, no spinner — each book with its title, author, trope chips, and a description clamped to two lines, under a heading with the book count. The user can move between the dashboard, the list, and the add-book form in either direction. A user with no books gets an explanation and a link to add their first; a post-auth database query failure gets an explicit "couldn't load your list" panel that can never be mistaken for an empty TBR.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Render surface | Server-rendered Astro page, no island, no `GET /api/books` | Fewest states to test and no unused endpoint to keep in sync; S-04 can filter server-side via query params. |
| Ordering | `created_at` descending, then `title` and unique `id` ascending | Newest-first matches what a mid-migration user wants to confirm; the title and id tiebreakers keep shared timestamps and duplicate titles deterministic. |
| Scale handling | Render every row, no pagination | `target_scale.data_volume` is small and S-04's search/filter is the real answer to a long list. |
| Component structure | New `BookList.astro`; `SavedBooksList` untouched | S-03 adds edit/delete to the browse card only, so the two surfaces are about to genuinely diverge. |
| Empty state | Explanation plus a prominent "Add your first book" link | Turns a dead end into the next action, and satisfies the PRD's no-books empty-state requirement. |
| Failed query | Distinct error panel, navigation intact | Falling back to the empty state would tell a mid-migration user their 100 books are gone. |
| Description display | Clamped to two lines (`line-clamp-2`) | 2000 characters are allowed, so one long entry would otherwise dominate the page. |
| Navigation | All four links: dashboard ↔ list, list → add, add → list | Closes the loop so the user can review mid-migration without losing their place. |
| Test data | 25 gay romance books on a new third account, in an opt-in fixture file | `rls.sql` asserts user A owns exactly six books, so a big dataset cannot go in `seed.sql` or onto user A without breaking the committed isolation proof. |

## Scope

**In scope:** a protected `/books` page; a `BookList.astro` presentational component; populated, empty, and load-failure states; four navigation links; a 25-book local test fixture; isolation and scale verification.

**Out of scope:** search, filter, sort controls (S-04); edit and delete (S-03); pagination; a `GET /api/books` endpoint; any React island on this page; sharing or refactoring `SavedBooksList`; nav bar or `Layout.astro` changes; schema migration, new index, or any change to `seed.sql` / `rls.sql` / `config.toml`; new dependencies; a test framework; mobile layout.

## Architecture / Approach

`src/pages/books/index.astro` creates the cookie-scoped client in frontmatter, reads the session user from `Astro.locals`, and issues one narrowed select against `books` filtered by owner and ordered for stability. It resolves exactly one of three states — failed query, empty, populated — error-first, and passes rows to `BookList.astro`. RLS is the security boundary; the explicit owner filter is defence in depth that also keeps `books_user_id_idx` in play. Zero client-side JavaScript ships for the list.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Browse page and list component | `/books` working by direct URL, all three render states, plus the 25-book fixture | Collapsing a failed read into the empty state; unstable ordering against fixture rows |
| 2. Navigation wiring | Dashboard ↔ list ↔ add-book links | Blurring the TBR list with the add-book page's session list |
| 3. Isolation and scale verification | RLS re-run, cross-account check, 120-row render check, CI green | A 100+ row page proving unusable, which would push work back into Phase 1 |

**Prerequisites:** S-01 done (books exist to list); local Supabase stack running with the committed seed fixtures; `psql` access to the local database to load the test fixture; a feature branch `feat/browse-tbr-list`.
**Estimated effort:** ~1–2 sessions across 3 phases; Phase 1 carries nearly all of the work.

## Open Risks & Assumptions

- The un-paginated list is assumed usable at ~100 rows; Phase 3 tests that assumption at 120 rows rather than trusting it.
- The PRD specifies no ordering, pagination, or empty-state copy for FR-005 — those were decided during planning, so S-04 may revisit them when search and filter land.
- The session list on the add-book page remains a source of confusion until S-03 ships delete; this slice reduces the risk by giving the real TBR a home but relies on wording to keep the two apart.
- No automated test coverage exists in this repo, so every user-visible state is verified manually.

## Success Criteria (Summary)

- A signed-in user opens `/books` and sees every book in their TBR, newest first, with title, author, tropes, and description, on first paint.
- A user with no books, and a user whose read failed, each see a distinct and honest message — never each other's.
- One user's books never appear for another, re-proven with the two seeded accounts and the committed RLS script.
