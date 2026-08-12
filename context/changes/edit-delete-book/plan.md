# Edit and Delete a Book (S-03) Implementation Plan

## Overview

Give a signed-in user the two mutation paths their TBR is missing: change any field of a book they already saved, and permanently remove a book. Editing happens on a dedicated `/books/[id]/edit` page that prefills the existing values and returns the user to the exact row they changed. Deleting happens inline on the browse row (and on the edit page) behind a two-step confirmation, with no JavaScript on `/books`.

This is roadmap slice **S-03** (FR-006, FR-007), whose prerequisite S-02 shipped the read path. It is also the slice S-01 pointed at as the fix for a live hazard: the add-book plan noted that a mid-migration refresh can convince a user their books were lost, prompting them to re-enter books and create "duplicates that cannot be removed until S-03 ships delete."

## Current State Analysis

The database is already fully provisioned for this slice. Everything above it is missing.

**What exists:**

- **Update and delete are already permitted at the data layer.** `supabase/migrations/20260705084406_create_books.sql:45-56` ships `"Users can update own books"` (with both `using` and `with check` on `(select auth.uid()) = user_id`) and `"Users can delete own books"`, and line 58 grants `select, insert, update, delete` to `authenticated`. No migration is required by this slice.
- **Cross-account update and delete are already proven denied.** `supabase/tests/rls.sql:32-68` asserts that user B updating and deleting user A's books both affect zero rows, and lines 71-85 assert a cross-account insert is rejected outright.
- **`updated_at` maintains itself.** The `books_updated_at` trigger runs `extensions.moddatetime` before every update (`supabase/migrations/20260705084406_create_books.sql:26-29`), so no handler needs to set it.
- **A complete, reusable validation schema.** `src/lib/book-schema.ts:50-55` defines `bookSchema` over title, author, tropes, and description, with trimming, blank-to-null description normalisation, trope de-duplication, and length caps. It validates a whole book, which is exactly the shape a full-replace update needs.
- **A working JSON mutation endpoint to mirror.** `src/pages/api/books.ts:13-85` self-authenticates via `supabase.auth.getUser()`, validates with `bookSchema`, caps field errors to one message per field (lines 40-44), runs a duplicate title+author lookup (lines 52-65), and returns `{ book, duplicate }` at 201.
- **Reusable form primitives.** `FormField` (text and multiline, with icon, error, and `aria-describedby` wiring), `TropeInput` (chip input with Enter/comma commit, blur commit, backspace removal), `SubmitButton` (`useFormStatus`-driven pending state), and `ServerError` — all under `src/components/auth/` and `src/components/books/`.
- **Two established mutation conventions, not one.** `AddBookForm.tsx:103-110` uses a JSON `fetch` from a React island because it must stay on the page. `SignOutButton.astro:5-12` is a plain `<form method="POST" action="/api/auth/signout">` with no JavaScript, posting to a route that redirects (`src/pages/api/auth/signout.ts:9`). `src/pages/api/auth/signin.ts:11,16` shows the third piece of that pattern: failure redirects back with `?error=<encoded message>`.
- **The browse page and its list component.** `src/pages/books/index.astro` resolves one of three states (failed / empty / populated) in frontmatter and renders `BookList.astro`. `BookList.astro:24-32` already uses a native `<details>` disclosure for long descriptions, so the zero-JavaScript disclosure pattern is established on this exact component.
- **Stable ordering that an edit will not disturb.** `sortBooksForBrowse` (`src/lib/sort-books-for-browse.ts:8-21`) keys on `created_at` descending, then numeric-aware title, then `id`.
- **Route gating covers everything this slice adds.** `PROTECTED_ROUTES` in `src/middleware.ts:4` prefix-matches `"/books"`, so `/books/<id>/edit` is gated with no middleware change.
- **Worker routing covers the new API paths.** `wrangler.jsonc:12` sets `run_worker_first: ["/api/*"]`, and Cloudflare's asset-routing documentation confirms asterisks perform deep matching across path segments — so `/api/books/<id>` and `/api/books/<id>/delete` are both covered.
- **Four local accounts** (`supabase/seed.sql`, all password `password123`): `user-a` and `user-b` with six books each for isolation, `user-c` with 25 for browse behaviour, `user-d` with none for the empty state.

**What's missing / constrains this slice:**

- No route under `src/pages/api/` accepts anything but `POST`, and there is no dynamic `[id]` route anywhere in the project — neither for pages nor for endpoints.
- No page reads a single book by id; `src/pages/books/index.astro:22-25` is the only read and it is a whole-collection select.
- `BookList.astro` rows are inert — no links, no ids, no controls.
- `/books` currently has no query-parameter handling and no surface for a message that arrives from a redirect.
- No destructive action exists anywhere in the product yet, so there is no confirmation pattern to copy. (FR-013 account deletion, which the PRD *does* require a confirmation for, is S-06 and unbuilt.)
- Only `button.tsx` is installed from shadcn — no dialog, alert-dialog, or toast primitive.
- No test framework (`AGENTS.md`); verification is `npx astro sync`, `npm run lint`, `npm run build`, `curl`, the committed SQL isolation script, and manual steps.
- ESLint runs `strictTypeChecked` + `stylisticTypeChecked` with `no-console: warn`.

### Key Discoveries:

- **RLS gives back silence, not an error.** A Supabase `update` or `delete` targeting a row owned by another user returns no error and an empty result set — indistinguishable at the client from "that book does not exist." Both endpoints must chain `.select()` onto the mutation and branch on the returned row count; treating a missing `error` as proof of a write would let a cross-account attempt report success.
- **A malformed id becomes a 500, not a 404, unless it is caught first.** Comparing a non-UUID string against the `uuid` column raises Postgres `22P02 invalid input syntax for type uuid`. Every entry point that takes an id from the URL must validate it before querying.
- **The duplicate check inverts on edit.** `src/pages/api/books.ts:52-58` looks up title+author for the current user; run unchanged on update it always matches the row being saved, so every edit would report itself a duplicate. It needs `.neq("id", id)`.
- **HTML forms cannot issue a `DELETE`.** Forms support only `GET` and `POST`, so the zero-JavaScript delete has to be a `POST` to a dedicated sub-route rather than a `DELETE` verb. This is why delete and update do not share one endpoint file.
- **`supabase/tests/rls.sql:115-118` raises unless user A owns exactly six books.** Manual delete testing against user A or user B therefore breaks the committed isolation proof until `npx supabase db reset`. Destructive manual testing belongs on user C and user D.
- **An edit does not move the row.** `sortBooksForBrowse` reads `created_at`, which an update leaves untouched — only `updated_at` is bumped by the trigger. The user returns to the row where they left it, even if they retitled the book. This is what makes the post-save anchor worth building.
- **The two-step confirm can be zero-JavaScript because `BookList.astro` already proved the pattern.** S-02's amendment used `<details>` / `<summary>` with `group-open:` variants for "Show more"; the same element wrapped around a form gives a confirm step with no island.
- `context/foundation/lessons.md:12-17` forbids monolithic batch work in a single Workers request. Every request this slice adds touches exactly one row.

## Desired End State

A signed-in user browsing `/books` sees an **Edit** link and a **Delete** control on every row. Choosing Edit opens a page with the book's current title, author, trope chips, and description already filled in; saving returns them to `/books` scrolled to that book, briefly highlighted, showing the new values. If the edit makes the book a title-and-author twin of another book they own, they are told so but the save still succeeds. Choosing Delete expands a small "Yes, delete / Cancel" confirmation in place; confirming reloads the list without that book and with the count decremented, and deleting the last book leaves them on the empty state with its "Add your first book" call to action. The same delete control is available on the edit page. A book that no longer exists — or that belongs to someone else, with no distinction drawn between the two — sends the user back to `/books` with a plain message rather than an error page. No page in this flow requires JavaScript except the edit form itself, and one user can never read, change, or delete another user's book through any of it.

Verified by: the phase-level automated checks below (`astro sync`, lint, build, `curl` against every endpoint status path), a re-run of `supabase/tests/rls.sql`, URL-tampering attempts across all four local accounts, and a render check with controls on every row at 145 rows.

## What We're NOT Doing

- **No undo, restore, trash, or soft delete.** FR-007 is a hard delete and the PRD Non-Goals explicitly rule out a "read" / "archived" / "finished" state.
- **No bulk delete and no multi-select.** One row at a time.
- **No stale-edit or concurrency protection.** Two tabs editing the same book is last-write-wins, with no version column, no `If-Match`, and no conflict UI.
- **No read-only book detail page.** The only per-book surface is the edit form.
- **No edit or delete controls on the add-book page's "Added this session" list.** `SavedBooksList.tsx` is untouched, and the copy distinguishing it from the real TBR stays exactly as S-01 wrote it.
- **No refactor of `AddBookForm.tsx` into a shared form component.** The edit form reuses the primitives (`FormField`, `TropeInput`, `SubmitButton`, `ServerError`) and the `bookSchema`, but is its own component. The two diverge on initial values, post-save behaviour, reset-and-refocus, and the session list; merging them now would destabilise a form whose ≤30 s entry guardrail is already verified. This mirrors S-02's decision not to share a card between `BookList` and `SavedBooksList`.
- **No schema migration, no new index, and no change to RLS policies or grants.** All of it ships from F-01.
- **No change to `supabase/seed.sql`, `supabase/config.toml`, or the fixture accounts.** `supabase/tests/rls.sql` gains no new cases either — it already covers cross-account update and delete.
- **No `PATCH` / partial-update contract.** Update is full-replace `PUT`.
- **No JavaScript added to `/books`.** The Edit affordance is an anchor, the delete confirm is a native `<details>`, and the delete itself is a form post.
- **No shadcn primitive installation** (no dialog, alert-dialog, toast) and no new dependency.
- **No search, filter, or sort controls** — FR-012 is S-04.
- **No Café Romance restyle** — S-07. New markup matches the existing cosmic-glass language.
- **No test framework** — this slice does not wire Vitest or Playwright into CI.
- **No mobile layout commitment** — v1 is desktop-only per the PRD.

## Implementation Approach

Three new server routes and one new island, layered so each is verifiable before the next depends on it.

`PUT /api/books/[id]` is the JSON update endpoint, built as a close sibling of the existing `POST /api/books`: same self-authentication, same `bookSchema`, same capped field errors, same `{ book, duplicate }` success body — differing only in the owner-scoped `.eq("id", id)` filter, the `.neq("id", id)` on the duplicate lookup, and a 404 when the update returns no row.

`/books/[id]/edit` reads the book in frontmatter and hands it to `EditBookForm`, a React island. The form is an island for the same reason `/books/new` is one: the trope chip input is inherently interactive and client-side validation gives immediate feedback. On success it navigates to `/books#book-<id>`; when `duplicate` is true it navigates to `/books?notice=duplicate#book-<id>` so the browse page can show the notice without losing the anchored return.

`POST /api/books/[id]/delete` is the zero-JavaScript delete, following the `SignOutButton` → `signout.ts` pattern exactly: a plain form posts to it, it deletes, and it redirects. Because the response is a navigation rather than JSON, failure states travel as `?error=` query parameters in the `signin.ts` style rather than as status codes (`error=not_found`, `error=load_failed`, or `error=delete_failed` — see Phase 2 code table), and the redirect back to `/books` is itself the page reload that refreshes the count and reveals the empty state.

The browse list gains three things and no script: a stable `id` anchor per row so the post-save fragment can find it, an `Edit` anchor, and a `DeleteBookForm.astro` whose `<details>` wraps the confirm step.

## Critical Implementation Details

**State sequencing — validate the id before it reaches Postgres, and branch on rows rather than on `error`.** Both endpoints and the edit page take an id straight from the URL. Parse it with zod's `z.uuid()` first and return the not-found path immediately if it fails, otherwise a malformed id produces a `22P02` database error and a 500 where the contract promises a 404. Then, because RLS answers a cross-account mutation with silence rather than an error, chain `.select()` onto both the update and the delete and treat an empty result — not a populated `error` — as the not-found signal. A handler that only checks `error` will report a cross-account delete as a success.

**Timing & lifecycle — `<details>` must wrap the form, and the trigger must be a `<summary>`.** In the delete control the outer element is the `<form>`, the `<details>`/`<summary>` sits inside it, and the "Delete" affordance is the `<summary>` itself. If the trigger is a `<button>` instead, it defaults to `type="submit"` and merely opening the confirmation deletes the book. Only the "Yes, delete" control carries `type="submit"`. The same `<summary>` is also the cancel control: its visible and accessible wording switches from "Delete <title>" while closed to "Cancel deletion of <title>" while open, using `group-open` variants. Activating it again closes the disclosure without submitting.

**User experience spec — the post-save highlight is pure CSS and has three separate requirements.** Each `<li>` in `BookList.astro` must carry `id={`book-${book.id}`}`, the redirect must include the `#book-<id>` fragment, and the targeted row must run a finite highlight animation defined in `src/styles/global.css`. All three are needed; miss any one and the user lands at the top of a 100-row list with no idea which row they changed. The animation runs once and returns the row to its normal style even though the fragment remains in the URL. Browsers scroll to the fragment natively, so no scroll code is written.

**Debug & observability — a duplicate on edit means something different than on add.** On add, a duplicate notice means "you have entered this twice." On edit it means "you have just turned this book into a twin of a different one," which during duplicate cleanup is the exact mistake the user is trying to undo. The browse page therefore shows fixed copy stating that another saved book already has the same title and author; it does not need the identity of the matching row.

## Phase 1: The update endpoint

### Overview

Ship `PUT /api/books/[id]` and the shared response types behind it, verifiable entirely with `curl` before any UI exists. This is the riskiest contract in the slice — it is where the RLS-returns-silence and malformed-id traps live — so it lands and is proven on its own.

### Changes Required:

#### 1. Shared mutation contract

**File**: `src/lib/book-schema.ts`

**Intent**: Give edit and add one response contract instead of a duplicate pair, and add the id validator all three new entry points need.

**Contract**: Rename `CreateBookSuccess` → `BookMutationSuccess`, `CreateBookError` → `BookMutationError`, `isCreateBookSuccess` → `isBookMutationSuccess`, `isCreateBookError` → `isBookMutationError`. The shapes are unchanged — `{ book: Tables<"books">; duplicate: boolean }` and `{ error: string; fieldErrors?: Record<string, string[]> }` — so the update endpoint reuses them as-is. The internal `isBookRow` helper stays private.

Export a new `bookIdSchema` built on zod v4's top-level `z.uuid()`, for reuse by both endpoints and the edit page.

Update the two existing call sites: `src/pages/api/books.ts:3,6` and `src/components/books/AddBookForm.tsx:11-12,125,146,163`. This is a mechanical rename; `npm run lint` catches any miss.

#### 2. The update endpoint

**File**: `src/pages/api/books/[id].ts` (new)

**Intent**: Persist an edited book, owner-scoped, and report the three ways it can fail distinctly enough for the form to act on them.

**Contract**: Exports `PUT` only. Route `/api/books/:id`, already covered by `run_worker_first: ["/api/*"]`. Coexists with the flat `src/pages/api/books.ts`, which continues to serve `/api/books` — the two resolve to different paths and do not collide.

Sequence, mirroring `src/pages/api/books.ts:13-85` step for step: create the cookie-scoped client and return 503 when it is `null`; `supabase.auth.getUser()` and return 401 when there is no user; parse `context.params.id` with `bookIdSchema` and return **404** when it fails; parse the JSON body and return 400 on malformed JSON; `bookSchema.safeParse` the body and return 400 with field errors capped at one message per field, exactly as lines 40-44 do.

Then run the duplicate lookup — same `user_id` / `title` / `author` filters as lines 52-58 — **plus `.neq("id", id)`**, so the row being saved cannot match itself. A lookup error is a 500.

Then `.update({ title, author, tropes, description })` filtered by `.eq("id", id).eq("user_id", user.id)`, with `.select().maybeSingle()`. Do not send `user_id` or `updated_at` in the payload: ownership comes from the session and the timestamp comes from the trigger. A returned `error` is a 500 with `console.error`, matching line 61. A `null` row — the RLS-silence case — is a **404** with a generic "Book not found" message that does not distinguish "deleted" from "not yours".

Success is **200** with `{ book, duplicate }`, the same body shape `POST` returns at 201.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` completes clean
- Type-aware lint passes: `npm run lint`
- Production build passes: `npm run build`
- `PUT /api/books/<own-book-id>` with a valid body returns 200 and a `book` reflecting the new values
- A second `PUT` of the same values returns 200 with `duplicate: false` — proving the self-match exclusion works
- `PUT` with a title that matches a *different* book of the same user returns 200 with `duplicate: true`
- `PUT /api/books/<other-users-book-id>` returns 404 and leaves that row unchanged in the database
- `PUT /api/books/<well-formed-but-unused-uuid>` returns 404
- `PUT /api/books/not-a-uuid` returns 404, not 500
- `PUT` with an empty title, zero tropes, or a 2001-character description returns 400 with one message per offending field
- `PUT` with no session cookie returns 401
- `supabase/tests/rls.sql` still passes

#### Manual Verification:

- The add-book form still saves, still shows its duplicate notice, and still reports field and session errors after the type rename

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Edit, end to end

### Overview

Build the surface the endpoint exists for: an entry point on each row, a prefilled form, and a return trip that lands the user back on the book they changed. Also add the shared redirect-message surface on `/books` that Phase 3 reuses.

### Changes Required:

#### 1. Redirect message surface on the browse page

**File**: `src/pages/books/index.astro`

**Intent**: Give redirects a place to say something. The edit form sends duplicate-save notices here, the edit page reports load/not-found failures here, and Phase 3's delete route reports delete failures here.

**Contract**: Read `error` and `notice` codes from `Astro.url.searchParams` in frontmatter and map them to fixed copy — unrecognised codes render nothing, so parameter values are never echoed back into the page. **Hoist the shared header row (heading + nav actions) and a single redirect-message slot above the failed / empty / populated ternary** so the message is written once and appears above the heading in every state. Keep the existing "Couldn't load your list" panel only inside the failed body, below the heading — it stays distinct from redirect errors. Style redirect errors like that panel (lines 65-84) and the duplicate notice with a non-error treatment. The message must not imply anything about the book count, and a redirect error must not be confused with the list-query failure state.

**Redirect code table** (literal query values — use these exact strings everywhere this slice writes or reads them):

| Param | Code | When | Fixed-copy intent |
| --- | --- | --- | --- |
| `error` | `not_found` | Book id invalid, missing, or not owned (edit load, delete empty result) | Book is not in the TBR — no "deleted" vs "not yours" distinction |
| `error` | `load_failed` | Client `null` or query error on the edit page | Book could not be loaded; return to TBR and try again — must not imply the book was removed |
| `error` | `delete_failed` | Client `null` or delete mutation error (Phase 3) | Delete could not be completed; try again |
| `notice` | `duplicate` | Edit save succeeded with `duplicate: true` | Another saved book already has the same title and author |

If both `error` and `notice` are present, the error takes precedence.

#### 2. Row anchors, highlight, and the Edit link

**Files**: `src/components/books/BookList.astro`, `src/styles/global.css`

**Intent**: Make each row addressable by URL fragment so a save can return to it, visibly, and give each row its entry point into the edit page.

**Contract**: Each `<li>` gains `id={`book-${book.id}`}` and a target-triggered class that runs a finite emphasis animation (a ring or brightened border consistent with the existing `border-white/10 bg-white/5` card) when it is the fragment target. Define the keyframes in `src/styles/global.css`; the animation must run once and finish at the row's normal card style rather than remaining highlighted while the fragment persists. Browsers handle the scroll natively; no script.

Each row gains an `Edit` anchor to `/books/${book.id}/edit`, styled like the small bordered links in the page header (`src/pages/books/index.astro:50-55`) and placed so it does not disturb the existing title / author / description / trope-chip hierarchy. Its accessible name must identify which book it edits — a bare "Edit" repeated 100 times is ambiguous to a screen reader — via `aria-label` naming the title.

The component's `Props` type is unchanged: `id` is already part of the row shape it receives.

#### 3. The edit form island

**File**: `src/components/books/EditBookForm.tsx` (new)

**Intent**: Let the user change any field with the same validation and feedback the add form gives, then hand them back to the list at the row they changed.

**Contract**: Default-exported React component taking the book's `id` plus its current `title`, `author`, `tropes`, and `description` as props, used as the initial state. Reuses `FormField`, `TropeInput`, `SubmitButton`, and `ServerError` unchanged, and submits through the React 19 `action` prop so `useFormStatus` drives the pending state — the same constraint S-01 recorded, since `onSubmit` + `fetch` leaves `useFormStatus` permanently `false`.

Copies three behaviours from `AddBookForm.tsx` verbatim, because they are correctness fixes rather than styling: `mergePendingTrope` (lines 27-36), so trope text still sitting uncommitted in the input is not silently dropped on save; the `AbortSignal.timeout(15000)` on the fetch (line 109); and the response handling ladder at lines 124-168, adapted to a 200 success and with 404 added as its own branch.

Diverges from `AddBookForm` in four ways. It targets `PUT /api/books/${id}`. On success it navigates to `/books#book-${id}` rather than resetting the fields — there is no reset-and-refocus and no session list. When `duplicate` is true, it navigates to `/books?notice=duplicate#book-${id}` instead, preserving the anchored return while telling the user that another saved book already has the same title and author. On 404 it shows a message stating the book is no longer in the TBR, with a link back to `/books`, and does not offer a retry.

A failed save must leave every typed value intact, as S-01 established.

#### 4. The edit page

**File**: `src/pages/books/[id]/edit.astro` (new)

**Intent**: Serve the form already filled in, and decide before rendering whether the book is even available to edit.

**Contract**: Astro page at `/books/:id/edit`, gated already by the `"/books"` prefix in `src/middleware.ts:4`. In frontmatter: read `Astro.locals.user` and redirect to `/auth/signin` if null rather than asserting non-null, matching `src/pages/books/index.astro:16-18`; create the client via `createClient(Astro.request.headers, Astro.cookies)` and redirect to `/books?error=load_failed` if it is `null`, before any query; validate `Astro.params.id` with `bookIdSchema`.

On an invalid id, or when the owner-scoped `.eq("id", id).eq("user_id", user.id)` select with `.maybeSingle()` succeeds but returns no row, redirect to `/books?error=not_found` — keeping the user inside the app rather than on a bare 404 page, and drawing no distinction between "deleted" and "not yours". A query error is logged with `console.error` and redirects to `/books?error=load_failed` so a temporary service failure never tells the user their book is gone.

On success, render `EditBookForm` with `client:load` inside the shared `Layout`, in the same cosmic-glass card and header-row shape as `src/pages/books/new.astro:7-32`, with links to `/books` and `/dashboard` and a `SignOutButton`. The heading should name the book being edited so the page is self-evidently scoped to one row.

Note the route-file layout: `src/pages/books/[id]/edit.astro` coexists with the static `src/pages/books/new.astro` and `src/pages/books/index.astro` without collision.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` completes clean
- Type-aware lint passes: `npm run lint`
- Production build passes: `npm run build`
- Unauthenticated `GET /books/<id>/edit` redirects to `/auth/signin` (302)
- Signed-in `GET /books/<own-book-id>/edit` returns 200 and the served HTML already contains the book's current title and author, proving the prefill is server-rendered
- `GET /books/<other-users-book-id>/edit` redirects to `/books?error=not_found`
- `GET /books/not-a-uuid/edit` redirects to `/books?error=not_found` rather than erroring

#### Manual Verification:

- Every row on `/books` shows an Edit link that opens that book's form with all four fields prefilled, including trope chips and a null description rendering as an empty field
- Changing the title and saving returns to `/books` scrolled to that row, briefly highlighted, showing the new title
- The edited row stays in its original list position and the heading count is unchanged
- Editing tropes — adding, removing via the chip's ✕, and removing via backspace — persists exactly what the chips showed
- Trope text left uncommitted in the input when Save is pressed is included rather than silently dropped
- Clearing the description saves it as empty, and the row's description disappears from the list
- Submitting an empty title, or removing every trope, shows the same inline field messages the add-book form shows, and does not navigate
- A failed save leaves all typed values in the form
- Editing a book to exactly match another book's title and author still saves, returns to that row on `/books`, and shows a notice that another saved book has the same title and author
- Opening an edit page, deleting that book in a second tab, then saving shows the "no longer in your TBR" message with a working link back
- Signed in as user A, manually visiting a user C book's edit URL lands on `/books` with the message and never shows user C's data

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Delete

### Overview

Add the destructive path, with a confirmation step, without putting any JavaScript on `/books`. The redirect that follows a successful delete is also the page reload that refreshes the count and reveals the empty state, so no client-side list state exists to fall out of sync.

### Changes Required:

#### 1. The delete route

**File**: `src/pages/api/books/[id]/delete.ts` (new)

**Intent**: Remove one owned book and send the browser somewhere sensible. It is a `POST` sub-route rather than a `DELETE` verb on `/api/books/[id]` because HTML forms can only issue `GET` and `POST`, and the whole point of this design is that no JavaScript is required.

**Contract**: Exports `POST` only. Route `/api/books/:id/delete`, covered by `run_worker_first: ["/api/*"]`. Follows `src/pages/api/auth/signout.ts:4-10` in shape — do the work, return `context.redirect(...)` — and `src/pages/api/auth/signin.ts:11,16` in how failure travels, as a redirect carrying an `?error=` code rather than a status code, because a bare 404 status on a navigation strands the user on an error page with no way back.

Sequence: client `null` → redirect to `/books?error=delete_failed`; no authenticated user → redirect to `/auth/signin`; `bookIdSchema` rejects the param → redirect to `/books?error=not_found`. Then `.delete()` filtered by `.eq("id", id).eq("user_id", user.id)` with `.select()`; a returned `error` is logged with `console.error` and redirects to `/books?error=delete_failed`; an empty result — the RLS-silence case, covering both "already gone" and "not yours" — redirects to `/books?error=not_found`.

Success redirects to `/books` with no fragment and no query parameter. Deliberately *not* anchored to a neighbouring row: the deleted row is gone, and the honest signal is the shorter list and the lower count.

#### 2. The delete control

**File**: `src/components/books/DeleteBookForm.astro` (new)

**Intent**: One two-step confirm used identically on the browse row and the edit page, so there is a single destructive control to build, style, and verify.

**Contract**: Astro component taking the book's `id` and `title`. Renders a `<form method="POST" action={`/api/books/${id}/delete`}>` whose only child is a `<details>` disclosure. The `<summary>` is the open-and-cancel affordance: closed wording says "Delete <title>", while `group-open` wording says "Cancel deletion of <title>". Inside the open panel sit a short confirmation line naming the book and a `<button type="submit">` labelled to state the outcome (not a bare "Yes").

The submit button must be the **only** button in the form, and the open/cancel trigger must be the `<summary>` element rather than a button — a `<button>` inside a form defaults to `type="submit"`, so making the trigger a button would delete the book on the first click. Activating the summary while open is the zero-JavaScript cancel path and sends no request.

Styling follows the existing disclosure at `src/components/books/BookList.astro:24-32` for the open/closed mechanics (`group` plus `group-open:` variants, `list-none` and the hidden webkit marker) and the red panel treatment at `src/pages/books/index.astro:65-84` for the destructive emphasis. The confirmation copy must state that this is permanent, since there is no undo.

Accessible names on both the trigger and the submit must name the book, so 100 identical "Delete" controls are distinguishable.

#### 3. Mount the control on both surfaces

**Files**: `src/components/books/BookList.astro`, `src/pages/books/[id]/edit.astro`

**Intent**: Delete where the user notices the problem (the list, during duplicate cleanup) and where they went to fix it (the edit page).

**Contract**: In `BookList.astro`, place `DeleteBookForm` alongside the Phase 2 `Edit` link in each row's action area. Adding it must not change row height when collapsed, or a 145-row page grows by a screenful. On the edit page, place it below the form, visually separated so it cannot be mistaken for part of the save flow — and outside the `EditBookForm` island, since it is a plain form and nesting a form inside a form is invalid HTML.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` completes clean
- Type-aware lint passes: `npm run lint`
- Production build passes: `npm run build`
- `POST /api/books/<own-book-id>/delete` returns a 302 to `/books` and the row is gone from the database
- `POST /api/books/<other-users-book-id>/delete` returns a 302 to `/books?error=not_found` and that row still exists in the database
- `POST /api/books/<well-formed-but-unused-uuid>/delete` returns a 302 to `/books?error=not_found`
- `POST /api/books/not-a-uuid/delete` returns a 302 to `/books?error=not_found` rather than a 500
- `POST` to the delete route with no session cookie returns a 302 to `/auth/signin` and deletes nothing
- The served `/books` HTML contains no `<script>` tag for a delete island, confirming the page is still zero-JavaScript

#### Manual Verification:

- Clicking Delete on a row opens a confirmation in place and deletes nothing on its own
- Cancelling closes the confirmation and leaves the book present
- Confirming removes the book, returns to `/books`, and the heading count drops by exactly one
- Deleting with JavaScript disabled in the browser works identically
- Deleting the last remaining book (as user D, after adding one) shows the empty state and its "Add your first book" link
- The delete control on the edit page removes the book and returns to `/books`
- Two rows' confirmations can be opened at once without either one submitting the other
- Collapsed delete controls do not visibly change row height compared to before this phase
- Deleting a book that a second tab already deleted shows the not-found message rather than an error page
- The duplicate books S-01 warned about can be cleaned up: add the same book twice from `/books/new`, then delete one from the list

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Isolation, scale, and CI

### Overview

Prove the two guardrails that mutation paths can break — per-user isolation (FR-011), now across write and destructive operations rather than just reads, and usability of the un-paginated list once every row carries controls. No feature code; a finding here comes back as an adjustment to the phase that owns it.

### Changes Required:

#### 1. Isolation re-verification for the mutation paths

**File**: no code change; re-run `supabase/tests/rls.sql`

**Intent**: F-01 proved the policies, S-02 added the first reader, and this slice adds the first updater and the first deleter. Re-confirm the guardrail with the new code paths in place, and confirm the *application* honours what the policies enforce.

**Contract**: Re-run the committed isolation script against a freshly reset local stack and confirm it exits clean. Then verify through the application across all four accounts by URL tampering, which is the realistic attack now that ids appear in URLs: signed in as user A, take a real book id belonging to user C (from the database) and attempt `GET /books/<id>/edit`, `PUT /api/books/<id>`, and `POST /api/books/<id>/delete`. Each must be refused without revealing any of user C's data, and user C's row must be byte-identical afterwards. Repeat in the other direction. FR-011 requires that another account's books are never reachable through any interface, and this slice adds three.

**Do destructive testing on user C and user D only.** `supabase/tests/rls.sql:115-118` raises unless user A owns exactly six books, so deleting one of user A's books breaks the committed proof until `npx supabase db reset`.

#### 2. Scale check with controls on every row

**File**: no code change; record the result in this plan's Progress notes

**Intent**: S-02 verified 145 rows of inert markup. Every row now carries an Edit link and a collapsed disclosure, so re-test the assumption that the un-paginated list stays usable.

**Contract**: Load the 120-row scale fixture from S-02's Testing Strategy on top of user C's 25 books, load `/books`, and confirm all 145 render with correct count, that the page is still scannable with the controls present, and that the response arrives without perceptible delay. Edit one book near the bottom and confirm the post-save anchor scrolls to it correctly in a long list. Delete one and confirm the count updates. Then `npx supabase db reset`.

#### 3. CI and deployment check

**File**: no code change

**Intent**: The repo's merge gate (`.github/workflows/ci.yml` runs `npm ci → npx astro sync → npm run lint → npm run build`), plus the one failure mode that cannot reproduce locally.

**Contract**: Push the branch and confirm CI passes. Per `AGENTS.md` this lands on `main` via PR from `feat/edit-delete-book`; never commit to `main`, and never bypass the Husky pre-commit hook.

After deployment, exercise both new API routes once against the production URL. The `run_worker_first: ["/api/*"]` deep-match behaviour that covers `/api/books/<id>` and `/api/books/<id>/delete` is confirmed by Cloudflare's documentation but is not exercised by local dev or by CI — a wrong answer surfaces as a 403 on a route that works perfectly on a developer machine, which is the failure `AGENTS.md` records.

### Success Criteria:

#### Automated Verification:

- `supabase/tests/rls.sql` runs clean against a freshly reset local stack
- CI passes on the branch (`npm ci`, `npx astro sync`, `npm run lint`, `npm run build`)

#### Manual Verification:

- URL tampering across accounts is refused on all three new surfaces in both directions, and the targeted rows are unchanged afterwards
- With 145 rows for user C, the page renders every row with its controls, the count is correct, and there is no perceptible delay
- The post-save anchor correctly scrolls to and highlights a row near the bottom of the 145-row list
- Edit and delete work on at least two of the four mainstream desktop browsers (per the PRD browser NFR)
- Both new API routes respond correctly on the deployed Worker, not with a 403

**Implementation Note**: This is the final phase. Confirm the isolation, scale, and post-deploy results with the human before closing out the change.

---

## Testing Strategy

No test framework is wired up in this repo (`AGENTS.md`), and this slice deliberately does not add one. Verification is four-legged.

### Static and build verification:

`npx astro sync`, `npm run lint` (type-aware, `strictTypeChecked`), `npm run build` — after every phase, and enforced by CI.

### Endpoint checks (against `npm run dev`):

Copy the complete `Cookie` request header from a signed-in browser session into `SESSION_COOKIE` and do not commit it. Take real book ids from the database.

```sh
# Successful update
curl -i -X PUT http://localhost:4321/api/books/$BOOK_ID \
  -H "Cookie: $SESSION_COOKIE" -H "Content-Type: application/json" \
  -d '{"title":"Edited Title","author":"Edited Author","tropes":["slow burn"],"description":null}'

# Not found: another user's book, an unused uuid, and a malformed id must all be 404
curl -s -o /dev/null -w '%{http_code}\n' -X PUT http://localhost:4321/api/books/$OTHER_USERS_BOOK_ID \
  -H "Cookie: $SESSION_COOKIE" -H "Content-Type: application/json" -d "$VALID_BODY"
curl -s -o /dev/null -w '%{http_code}\n' -X PUT http://localhost:4321/api/books/not-a-uuid \
  -H "Cookie: $SESSION_COOKIE" -H "Content-Type: application/json" -d "$VALID_BODY"

# Delete redirects rather than returning a status body
curl -i -X POST http://localhost:4321/api/books/$BOOK_ID/delete -H "Cookie: $SESSION_COOKIE"
```

The delete calls return 302; read the `Location` header to distinguish success (`/books`) from failure (`/books?error=...`). Confirm every "should have failed" case left the target row untouched by re-selecting it.

### Zero-JavaScript verification:

Disable JavaScript in the browser and confirm `/books` still lists books, the delete confirmation still opens, and a delete still completes. This is the property that keeps the browse page cheap at 145 rows, and it is easy to lose silently in a later slice.

### Database and isolation:

`supabase/tests/rls.sql` against a freshly reset local stack, plus URL-tampering checks through the application across all four accounts.

### Local accounts (password `password123` for all):

| Email | Books | Use in this slice |
| --- | --- | --- |
| `user-a@example.test` | 6 | Isolation source/target only — **do not delete their books** (`rls.sql:115-118` asserts exactly six) |
| `user-b@example.test` | 6 | Isolation source/target only — same caution |
| `user-c@example.test` | 25 | Primary account for edit and delete testing, ordering, and scale |
| `user-d@example.test` | 0 | Empty-state transition: add one book, delete it, confirm the empty state returns |

Reset to committed fixtures at any point with `npx supabase db reset`.

### Scale fixture (local only — do not commit):

Reuse the 120-row generator from S-02's plan (`context/changes/browse-tbr-list/plan.md`), which brings user C to 145 rows.

### Manual testing steps:

1. Sign in as `user-c@example.test` and open `/books`; confirm every row shows Edit and Delete.
2. Edit a book's title; confirm the return to `/books` scrolls to and highlights that row, showing the new title in its original position.
3. Edit tropes by adding, removing with ✕, and removing with backspace; confirm exactly what the chips showed is persisted.
4. Type a trope but do not press Enter, then Save; confirm it is included rather than dropped.
5. Clear a description and save; confirm the row loses its description.
6. Submit an empty title and zero tropes; confirm inline messages and no navigation.
7. Edit a book to match another book's title and author; confirm the save returns to that row on `/books` and shows a notice that another saved book has the same title and author.
8. Click Delete on a row; confirm nothing is deleted until the confirmation is submitted, and that Cancel closes it cleanly.
9. Confirm a delete; check the count drops by one and the book is gone.
10. Disable JavaScript and repeat steps 8-9.
11. As `user-d@example.test`, add one book, delete it, and confirm the empty state returns with a working "Add your first book" link.
12. Open a book's edit page in one tab, delete it in another, then save in the first; confirm the "no longer in your TBR" message and its link.
13. As `user-a@example.test`, attempt all three new surfaces against a user C book id; confirm refusal and that user C's row is unchanged.
14. Load the 120-row scale fixture and repeat an edit and a delete near the bottom of the list.
15. `npx supabase db reset`, then run `supabase/tests/rls.sql`.

## Performance Considerations

Every request this slice adds touches exactly one row, identified by primary key and filtered by the indexed `user_id` — trivially inside the Workers per-request CPU ceiling flagged in `context/foundation/lessons.md:12-17`. The update endpoint issues two queries (duplicate lookup, then update), matching what `POST /api/books` already does.

The browse page's cost is unchanged in kind but grows in markup: 145 rows now each carry an anchor, a link, and a collapsed `<details>`. Because the confirm panel is a native disclosure rather than an island, this adds bytes but **no JavaScript, no hydration, and no per-row runtime cost** — which is the main reason the form-post design was chosen over an island. The Phase 4 scale check exists to confirm the added markup does not make the list harder to scan.

## Migration Notes

No schema migration and no database change of any kind. The `books` table, its constraints, indexes, RLS policies, and grants all ship from F-01, and the update and delete policies this slice depends on have been present and tested since then. `supabase/seed.sql`, `supabase/tests/rls.sql`, and `supabase/config.toml` are untouched.

No `wrangler.jsonc` change: `run_worker_first: ["/api/*"]` already deep-matches the two new API paths. Deployment is the normal `npm run build` + `npx wrangler deploy`, so reverting is a Worker rollback with no data implications — except that books deleted by users before a rollback stay deleted, since the delete is hard.

## References

- Roadmap slice S-03: `context/foundation/roadmap.md:159-169`
- PRD FR-006 / FR-007 and their Socratic resolutions (hard delete, no archived state): `context/foundation/prd.md:111-114`
- PRD FR-011 isolation and Access Control: `context/foundation/prd.md:129-130,152-156`
- Prerequisite read path this slice extends: `context/changes/browse-tbr-list/plan.md`
- Session-list warning and the duplicate hazard delete resolves: `context/archive/2026-08-02-add-book-to-tbr/plan.md:257-261`
- Update and delete RLS policies and grants (already shipped): `supabase/migrations/20260705084406_create_books.sql:45-58`
- `updated_at` trigger: `supabase/migrations/20260705084406_create_books.sql:26-29`
- Cross-account update/delete already proven denied: `supabase/tests/rls.sql:32-68`
- The six-book assertion that constrains destructive manual testing: `supabase/tests/rls.sql:115-118`
- Endpoint shape to mirror, including the field-error cap and duplicate lookup: `src/pages/api/books.ts:13-85`
- Shared validation schema and response types: `src/lib/book-schema.ts`
- Form island conventions — React 19 `action`, pending trope merge, fetch timeout, response ladder: `src/components/books/AddBookForm.tsx:27-36,103-168`
- Zero-JavaScript form-post-and-redirect precedent: `src/components/auth/SignOutButton.astro:5-12`, `src/pages/api/auth/signout.ts:4-10`
- Redirect-with-`?error=` precedent: `src/pages/api/auth/signin.ts:11,16`
- `<details>` disclosure pattern to reuse: `src/components/books/BookList.astro:24-32`
- Error panel styling: `src/pages/books/index.astro:65-84`, `src/components/auth/ServerError.tsx:11-14`
- Page shell and header-row shape: `src/pages/books/new.astro:7-32`
- Route gating (already covers `/books/:id/edit`): `src/middleware.ts:4`
- Ordering that an edit leaves undisturbed: `src/lib/sort-books-for-browse.ts:8-21`
- Worker routing for the new API paths: `wrangler.jsonc:12`
- Workers per-request work constraint: `context/foundation/lessons.md:12-17`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: The update endpoint

#### Automated

- [x] 1.1 `npx astro sync` completes clean — a0be6a7
- [x] 1.2 Type-aware lint passes: `npm run lint` — a0be6a7
- [x] 1.3 Production build passes: `npm run build` — a0be6a7
- [x] 1.4 `PUT /api/books/<own-book-id>` with a valid body returns 200 and a `book` reflecting the new values — a0be6a7
- [x] 1.5 A second `PUT` of the same values returns 200 with `duplicate: false` — proving the self-match exclusion works — a0be6a7
- [x] 1.6 `PUT` with a title that matches a *different* book of the same user returns 200 with `duplicate: true` — a0be6a7
- [x] 1.7 `PUT /api/books/<other-users-book-id>` returns 404 and leaves that row unchanged in the database — a0be6a7
- [x] 1.8 `PUT /api/books/<well-formed-but-unused-uuid>` returns 404 — a0be6a7
- [x] 1.9 `PUT /api/books/not-a-uuid` returns 404, not 500 — a0be6a7
- [x] 1.10 `PUT` with an empty title, zero tropes, or a 2001-character description returns 400 with one message per offending field — a0be6a7
- [x] 1.11 `PUT` with no session cookie returns 401 — a0be6a7
- [x] 1.12 `supabase/tests/rls.sql` still passes — a0be6a7

#### Manual

- [x] 1.13 The add-book form still saves, still shows its duplicate notice, and still reports field and session errors after the type rename — a0be6a7

### Phase 2: Edit, end to end

#### Automated

- [x] 2.1 `npx astro sync` completes clean
- [x] 2.2 Type-aware lint passes: `npm run lint`
- [x] 2.3 Production build passes: `npm run build`
- [x] 2.4 Unauthenticated `GET /books/<id>/edit` redirects to `/auth/signin` (302)
- [x] 2.5 Signed-in `GET /books/<own-book-id>/edit` returns 200 and the served HTML already contains the book's current title and author, proving the prefill is server-rendered
- [x] 2.6 `GET /books/<other-users-book-id>/edit` redirects to `/books?error=not_found`
- [x] 2.7 `GET /books/not-a-uuid/edit` redirects to `/books?error=not_found` rather than erroring

#### Manual

- [x] 2.8 Every row on `/books` shows an Edit link that opens that book's form with all four fields prefilled, including trope chips and a null description rendering as an empty field
- [x] 2.9 Changing the title and saving returns to `/books` scrolled to that row, briefly highlighted, showing the new title
- [x] 2.10 The edited row stays in its original list position and the heading count is unchanged
- [x] 2.11 Editing tropes — adding, removing via the chip's ✕, and removing via backspace — persists exactly what the chips showed
- [x] 2.12 Trope text left uncommitted in the input when Save is pressed is included rather than silently dropped
- [x] 2.13 Clearing the description saves it as empty, and the row's description disappears from the list
- [x] 2.14 Submitting an empty title, or removing every trope, shows the same inline field messages the add-book form shows, and does not navigate
- [x] 2.15 A failed save leaves all typed values in the form
- [x] 2.16 Editing a book to exactly match another book's title and author still saves, returns to that row on `/books`, and shows a notice that another saved book has the same title and author
- [ ] 2.17 Opening an edit page, deleting that book in a second tab, then saving shows the "no longer in your TBR" message with a working link back
- [x] 2.18 Signed in as user A, manually visiting a user C book's edit URL lands on `/books` with the message and never shows user C's data

### Phase 3: Delete

#### Automated

- [ ] 3.1 `npx astro sync` completes clean
- [ ] 3.2 Type-aware lint passes: `npm run lint`
- [ ] 3.3 Production build passes: `npm run build`
- [ ] 3.4 `POST /api/books/<own-book-id>/delete` returns a 302 to `/books` and the row is gone from the database
- [ ] 3.5 `POST /api/books/<other-users-book-id>/delete` returns a 302 to `/books?error=not_found` and that row still exists in the database
- [ ] 3.6 `POST /api/books/<well-formed-but-unused-uuid>/delete` returns a 302 to `/books?error=not_found`
- [ ] 3.7 `POST /api/books/not-a-uuid/delete` returns a 302 to `/books?error=not_found` rather than a 500
- [ ] 3.8 `POST` to the delete route with no session cookie returns a 302 to `/auth/signin` and deletes nothing
- [ ] 3.9 The served `/books` HTML contains no `<script>` tag for a delete island, confirming the page is still zero-JavaScript

#### Manual

- [ ] 3.10 Clicking Delete on a row opens a confirmation in place and deletes nothing on its own
- [ ] 3.11 Cancelling closes the confirmation and leaves the book present
- [ ] 3.12 Confirming removes the book, returns to `/books`, and the heading count drops by exactly one
- [ ] 3.13 Deleting with JavaScript disabled in the browser works identically
- [ ] 3.14 Deleting the last remaining book (as user D, after adding one) shows the empty state and its "Add your first book" link
- [ ] 3.15 The delete control on the edit page removes the book and returns to `/books`
- [ ] 3.16 Two rows' confirmations can be opened at once without either one submitting the other
- [ ] 3.17 Collapsed delete controls do not visibly change row height compared to before this phase
- [ ] 3.18 Deleting a book that a second tab already deleted shows the not-found message rather than an error page
- [ ] 3.19 The duplicate books S-01 warned about can be cleaned up: add the same book twice from `/books/new`, then delete one from the list

### Phase 4: Isolation, scale, and CI

#### Automated

- [ ] 4.1 `supabase/tests/rls.sql` runs clean against a freshly reset local stack
- [ ] 4.2 CI passes on the branch (`npm ci`, `npx astro sync`, `npm run lint`, `npm run build`)

#### Manual

- [ ] 4.3 URL tampering across accounts is refused on all three new surfaces in both directions, and the targeted rows are unchanged afterwards
- [ ] 4.4 With 145 rows for user C, the page renders every row with its controls, the count is correct, and there is no perceptible delay
- [ ] 4.5 The post-save anchor correctly scrolls to and highlights a row near the bottom of the 145-row list
- [ ] 4.6 Edit and delete work on at least two of the four mainstream desktop browsers (per the PRD browser NFR)
- [ ] 4.7 Both new API routes respond correctly on the deployed Worker, not with a 403
