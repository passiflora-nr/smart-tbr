# Edit and Delete a Book (S-03) — Plan Brief

> Full plan: `context/changes/edit-delete-book/plan.md`

## What & Why

A user migrating 100+ books into SmartTBR will mistype titles and trope tags, and will create duplicates — S-01's plan flagged that a mid-migration refresh can convince someone their books were lost, prompting them to re-enter books that "cannot be removed until S-03 ships delete." This slice adds the two mutation paths that make the TBR maintainable: edit any field of a saved book (FR-006) and permanently remove one (FR-007).

## Starting Point

The database has been ready for this since F-01: the `books` table already carries `"Users can update own books"` and `"Users can delete own books"` RLS policies plus the matching grants, a trigger that maintains `updated_at`, and a committed isolation script that already proves cross-account updates and deletes affect zero rows. S-02 shipped the read path — `/books` server-renders the full list with zero JavaScript. What is missing is everything above the database: no dynamic `[id]` route exists anywhere in the project, no endpoint accepts anything but `POST`, and the list rows are completely inert.

## Desired End State

Every row on `/books` carries an Edit link and a Delete control. Edit opens a prefilled form on its own page; saving returns the user to `/books` scrolled to that exact book, briefly highlighted, showing the new values. Delete expands a "Yes, delete / Cancel" confirmation in place; confirming reloads the list without that book and with the count decremented, and removing the last book reveals the empty state. A book that is gone, or that belongs to someone else — with no distinction drawn — sends the user back to `/books` with a plain message rather than an error page.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Edit surface | Dedicated `/books/[id]/edit` page | Mirrors the `/books/new` precedent and keeps the browse list free of hydrated form state at 145 rows. |
| Delete mechanism | Plain form post + redirect, zero JavaScript | The chosen "reload after delete" behaviour is what a form post does natively, and `SignOutButton` already uses this exact pattern on this exact page. |
| Delete confirmation | Two-step inline, via native `<details>` | Prevents a misclick from permanently destroying data with no undo, reusing the disclosure pattern `BookList.astro` already ships. |
| Delete placement | Browse row *and* edit page | Row delete is the fast duplicate-cleanup path; edit-page delete catches "I opened this to fix it and decided against it." |
| Update contract | `PUT` full replace on `/api/books/[id]` | The form always holds all four fields, so the existing `bookSchema` is reused untouched instead of growing a second partial-validation path. |
| Not-found semantics | 404 for both verbs, no "gone" vs "not yours" distinction | RLS returns silence for both cases anyway, and distinguishing them would confirm the existence of another user's book. |
| Delete failure transport | Redirect with `?error=` code, not a status | A bare status on a navigation strands the user on an error page; `src/pages/api/auth/signin.ts` already uses redirect-with-error. |
| Duplicate on edit | Non-blocking browse notice, excluding the edited row | The save still returns to its anchored row; the lookup needs `.neq("id", id)` or every save reports itself a duplicate. |
| Post-save return | `/books#book-<id>` with a finite CSS target animation | Losing scroll position in a 100+ row list is a real cost, and an edit never reorders the list so the anchor is stable. |
| Form code sharing | New `EditBookForm`, no refactor of `AddBookForm` | The two diverge on prefill, post-save behaviour, and the session list; merging would destabilise a form whose ≤30 s guardrail is already verified. |
| Response types | Rename `CreateBook*` → `BookMutation*` | Edit and add return identical shapes, so one shared contract beats a duplicate pair. |

## Scope

**In scope:** `PUT /api/books/[id]`; `POST /api/books/[id]/delete`; the `/books/[id]/edit` page and its form island; per-row Edit link, anchor, and highlight on `BookList.astro`; a shared delete control used on both surfaces; fixed `?error=` and `?notice=` message surfaces on `/books`.

**Out of scope:** undo/restore/soft delete; bulk or multi-select delete; stale-edit protection across tabs; a read-only detail page; edit/delete on the add-book session list; any refactor of `AddBookForm`; any schema, seed, RLS, or `wrangler.jsonc` change; search/filter (S-04); the Café Romance restyle (S-07); a test framework; mobile layout.

## Architecture / Approach

Three server routes and one island. The update endpoint is a close sibling of the existing `POST /api/books` — same auth, same schema, same capped field errors — differing only in the owner-scoped id filter, the self-excluding duplicate lookup, and a 404 when the update returns no row. The edit page reads the book in frontmatter and hands it to a React island, which exists only because the trope chip input is inherently interactive. Delete is deliberately *not* an island: a plain form posts to a route that deletes and redirects, so the browser's own navigation supplies the page reload that refreshes the count and reveals the empty state, and `/books` stays at zero JavaScript.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Update endpoint | `PUT /api/books/[id]`, curl-verifiable with no UI | RLS answers a cross-account update with silence, not an error — a handler that only checks `error` reports it as success |
| 2. Edit, end to end | Edit link, prefilled page, save, anchored return | The post-save highlight needs a row `id`, a redirect fragment, and a `target:` variant — miss one and the user lands at the top of a 100-row list |
| 3. Delete | Form-post route, `<details>` confirm, both surfaces | A `<button>` trigger instead of a `<summary>` would delete the book on the first click, before any confirmation |
| 4. Isolation, scale, CI | URL-tampering checks, 145-row render, deploy check | Deleting user A's books breaks `rls.sql`, which asserts they own exactly six |

**Prerequisites:** S-02 (`browse-tbr-list`) implemented; local Supabase stack with the four seeded accounts.
**Estimated effort:** ~2-3 sessions across 4 phases; no database work and no new dependencies.

## Open Risks & Assumptions

- Hard delete with no undo and no data export (both PRD Non-Goals) means a confirmed delete is unrecoverable — the two-step confirm is the only safety net.
- `run_worker_first: ["/api/*"]` is documented to deep-match nested paths, but a wrong answer surfaces only after deploy as a 403 on routes that work locally, so Phase 4 includes a post-deploy check.
- Last-write-wins across two tabs is accepted; a stale tab silently overwrites newer values with no warning.
- Every row gains markup, so the un-paginated list grows; Phase 4 re-tests scannability at 145 rows.

## Success Criteria (Summary)

- A user can fix a typo in a title or trope tag and immediately see the corrected book in its place in their list.
- A user can remove a duplicate they created during migration, in two clicks, without leaving the list.
- No user can read, change, or delete another user's book, including by pasting an id into a URL.
