# Browse the TBR List (S-02) Implementation Plan

## Overview

Build the first read path into the TBR. A signed-in user opens `/books` and sees their entire persisted book collection — title, author, trope tags, and description — rendered as a list by the server, newest first, with no search, filter, edit, or delete controls.

This is roadmap slice **S-02** (FR-005), the prerequisite for S-03 (edit/delete) and S-04 (search/filter). S-01 deliberately declined to read persisted books so as not to borrow this scope, which means this slice establishes the read convention that S-03 and S-04 inherit. FR-005's contract is intentionally narrow — "just the rendered list" — because the PRD's own Socratic resolution split the "a flat list of 100+ books is unusable" concern out into FR-012 / S-04.

## Current State Analysis

The data layer and the route gating are already in place. Everything that reads from them is missing.

**What exists:**

- The `books` table with the full FR-004 shape and a btree index `books_user_id_idx` on `user_id` (`supabase/migrations/20260705084406_create_books.sql`), so owner-scoped reads are index-backed.
- RLS enabled with `"Users can select own books"` using `(select auth.uid()) = user_id`, plus `grant select ... to authenticated` and `revoke all ... from anon`. Isolation is proven by the committed, re-runnable `supabase/tests/rls.sql`.
- `createClient(requestHeaders, cookies)` in `src/lib/supabase.ts:6-25` — cookie-scoped via `@supabase/ssr`, typed with `Database`, returning `null` when `SUPABASE_URL` / `SUPABASE_KEY` are unset. Because it is cookie-scoped, a query issued from Astro frontmatter runs as the signed-in user and RLS applies with no extra filtering.
- `src/middleware.ts:4` already has `"/books"` in `PROTECTED_ROUTES`, prefix-matched — so a new `/books` page is gated with no middleware change, and `context.locals.user` is populated on every request (`src/middleware.ts:7-16`).
- `astro.config.mjs:11` sets `output: "server"`, so pages are server-rendered per request; `src/pages/dashboard.astro:4` is the working precedent for a protected page reading `Astro.locals`.
- `src/components/books/SavedBooksList.tsx:19-33` already renders the exact card shape this slice needs — title, author, optional description, trope chips — as part of the add-book island's session list.
- Generated types in `src/lib/database.types.ts` with the `Tables<"books">` helper; the file is excluded from ESLint (`eslint.config.js:73-75`).
- Local fixtures in `supabase/seed.sql`: two users (`user-a@example.test`, `user-b@example.test`, password `password123`) with six books each and deliberately overlapping tropes. Enough to prove isolation, but too small and too uniform to exercise a browsable list — hence the additional fixture this slice adds.
- The cosmic glass visual language: the `bg-cosmic` utility (`src/styles/global.css:113`) plus the bordered translucent card used by `dashboard.astro:8-9` and `books/new.astro:7-8`.

**What's missing / constrains this slice:**

- No read of `books` anywhere in `src/`. `src/pages/api/books.ts` exports `POST` only, and no page or component queries the table.
- No page under `src/pages/books/` except `new.astro`; there is no `/books` route at all.
- No `.astro` component precedent under `src/components/books/` — that directory holds only React files today.
- No navigation shell. `Layout.astro:38` is a bare `<slot />` with no header; `Topbar.astro` is used by the landing page only. Links are hand-rolled per page (`dashboard.astro:18-23`, `books/new.astro:13-18`), so this slice adds links in the same ad-hoc style rather than inventing a nav component.
- Only `button.tsx` is installed from shadcn — no card, badge, table, or skeleton primitive.
- No test framework anywhere (`AGENTS.md`); verification is `npx astro sync`, `npm run lint`, `npm run build`, manual steps, and the committed SQL isolation script.
- `eslint.config.js` runs `strictTypeChecked` + `stylisticTypeChecked` with `no-console: warn`.
- The PRD specifies **no** ordering, pagination, or empty-state copy for FR-005, while targeting a 100+ book backlog and declaring `target_scale: { data_volume: small }`. Those gaps were closed by decision during planning, not lifted from the PRD.

### Key Discoveries:

- **Ordering by `created_at` alone is nondeterministic against the seed data.** Postgres `now()` is transaction-scoped, so all six of a seed user's books in the single `insert ... values` statement (`supabase/seed.sql:62-112`) share one identical `created_at`. Order additionally by title and finally by unique id, or the list order can shuffle between renders and make manual verification unreliable.
- **The committed isolation test hardcodes user A's book count.** `supabase/tests/rls.sql:116` raises unless user A owns exactly six books, and `supabase/config.toml:65` auto-loads only `./seed.sql` on reset. A large test dataset therefore cannot live in `seed.sql` or be attached to user A — it belongs to a third account in an opt-in fixture file, which also keeps the RLS script runnable in any order.
- **RLS means the page needs no `where user_id = ...` to be safe** — but adding the explicit filter anyway keeps `books_user_id_idx` unambiguously usable and makes ownership legible at the call site. Both layers are cheap; use both.
- **A failed query and an empty TBR are the same shape if you only look at row count.** On error, Supabase returns `data: null` alongside `error`, so the branch order has to be error-first (see Critical Implementation Details). Rendering "your TBR is empty" after a failed read would tell a mid-migration user their 100 books are gone.
- **`line-clamp-2` is core in Tailwind v4** (confirmed against the Tailwind docs) — no plugin, no `@utility` addition needed for the clamped description.
- **The session list must stay clearly distinct from this page.** S-01's plan treated the "Added this session" wording as load-bearing: a user who believes their books were lost re-enters them, creating duplicates that cannot be removed until S-03 ships delete. Adding a real TBR view reduces that risk but does not remove it, so this slice must not blur the two surfaces.
- `context/foundation/lessons.md:12-17` forbids monolithic batch work in a single Workers request. One indexed select returning ~100 rows is trivially within budget; this plan adds no batching, import, or fan-out.

## Desired End State

A signed-in user reaches `/books` from the dashboard and sees every book in their TBR immediately on page load — no spinner, no second request — newest first, each showing title, author, trope chips, and a description clamped to two lines. A count tells them how many books they have. From that page they can go on to add a book or back to the dashboard, and from the add-book page they can jump to the list to review what they have entered so far. A user with no books sees an explanation and a prominent link to add their first one. If the post-auth database query fails, they see an explicit "couldn't load your list" panel with working navigation — never an empty state. An unauthenticated visitor to `/books` is redirected to sign-in, and one user's books are never visible to another.

Verified by: the phase-level automated checks below (`astro sync`, lint, build, the unauthenticated 302, and book titles present in the served HTML source), a re-run of `supabase/tests/rls.sql`, a 25-book fixture exercising ordering, missing descriptions, and description clamping, a cross-account check across all three local accounts, and a render check at 145 rows.

## What We're NOT Doing

- **No search, filter, or sort controls** — FR-012 is S-04. There is no search box, no trope filter widget, and no user-facing sort selector; the ordering is fixed.
- **No edit or delete controls** — FR-006 / FR-007 are S-03. No row navigates anywhere and there is no detail route. (Amended 2026-08-08: a long description may be expanded in place — see the Phase 1 amendment. This is a read affordance on the row, not a detail view or an edit control.)
- **No pagination, infinite scroll, or virtualisation.** Every row renders on one page (decided: `target_scale.data_volume` is small and S-04 is the real answer to a long list).
- **No `GET /api/books` endpoint.** The page reads the database directly in frontmatter; adding an unused JSON endpoint would be a second surface to test and keep in sync. S-04 can filter server-side via URL query params without one.
- **No React island on this page** and no client-side JavaScript for the list. Rendering is entirely server-side.
- **No shared card component between this page and `SavedBooksList`**, and no refactor of `SavedBooksList` — S-03 will add edit and delete controls to the browse card only, so forcing them to share now means unpicking it later.
- **No nav bar, header, or `Layout.astro` change.** Links are added per page in the existing ad-hoc style.
- **No schema migration, no new index, and no change to `supabase/seed.sql`, `supabase/tests/rls.sql`, or `supabase/config.toml`.** The table, its indexes, policies, and grants all ship from F-01 and are untouched. The 25-book test dataset lands in a new opt-in fixture file that nothing loads automatically.
- **No mood-trope recommendation** (S-05) and no reading of the distinct trope vocabulary.
- **No new dependency** and no shadcn primitive installation.
- **No test framework** — this slice does not wire Vitest or Playwright into CI.
- **No mobile layout commitment** — v1 is desktop-only per the PRD.

## Implementation Approach

One protected Astro page does the work. `src/pages/books/index.astro` creates the cookie-scoped Supabase client in frontmatter, reads the session user from `Astro.locals`, issues a single ordered select against `books`, and hands the resulting rows to a presentational `BookList.astro` component. Three mutually exclusive render branches — failed, empty, populated — are resolved in frontmatter so the template never has to guess which state it is in.

The list component is `.astro` rather than React because nothing on this page is interactive: server-rendering it ships zero JavaScript and keeps the page independent of the add-book island. Its card markup intentionally mirrors `SavedBooksList.tsx` visually while living in its own file, because S-03 will add edit and delete controls here and not there.

Navigation is four hand-rolled links in the existing per-page style, giving the user a loop between the dashboard, the list, and the add-book form.

## Critical Implementation Details

**State sequencing — branch on the error before the row count.** Supabase returns `data: null` together with a populated `error`, so a `data?.length` check reached first collapses "we could not read your TBR" into "you have no books". Resolve the state in frontmatter in this order: a returned query `error` (or, defensively, a `null` client if control reaches the page) means the failure branch; otherwise an empty array means the empty branch; otherwise the list. Because middleware authenticates before protected-page frontmatter runs, an unset client or full Supabase outage cannot be rendered as an authenticated page; test the query-error path instead. The empty and failure branches must not share copy, and the failure copy must not contain any phrasing that implies a book count.

**Timing & lifecycle — the ordering needs tiebreakers to be stable.** All rows inserted by one transaction share a single `now()`, which is exactly the case for the six-book seed fixtures (`supabase/seed.sql:62-112`). Order by `created_at` descending, then by `title` ascending, and finally by unique `id` ascending, so repeated renders and manual verification steps produce the same sequence even for duplicate titles.

**User experience spec — the empty state is a dead end unless it points somewhere.** The zero-book branch must carry the primary call to action into `/books/new`, and its wording must describe the persisted TBR rather than echoing the add-book page's session list. Do not label anything on this page "added this session".

## Phase 1: Browse page and list component

### Overview

Build the read path and all three of its render states, against a realistic dataset. At the end of this phase `/books` is fully functional and verifiable by direct URL, with no navigation into it yet.

### Changes Required:

#### 1. Populated TBR fixture

**File**: `supabase/fixtures/populated-tbr.sql` (new)

**Intent**: Give every manual verification step a realistic dataset to run against. The six-book isolation fixtures are too small to show what a browsable list feels like, and too uniform to expose ordering or clamping problems.

**Contract**: A local-only SQL file — never applied to production — following the header warning and `insert ... on conflict (id) do nothing` idempotency of `supabase/seed.sql:1-30`. It creates a **third** account, `user-c@example.test` with password `password123` and id `c0000000-0000-4000-8000-000000000001`, using the same `auth.users` insert shape as `supabase/seed.sql:4-30` (including `email_confirmed_at`, so local sign-in works without the confirmation step). It then inserts the 25 books tabulated under Testing Strategy with ids `c1000001-0000-4000-8000-000000000001` through `c1000025-0000-4000-8000-000000000025`, matching the table's row numbers.

Three rows carry no description at all (rows 7, 15, and 25) — omit the column or pass `null` rather than an empty string, since `bookSchema` normalises blank descriptions to `null` and the fixture should look like what the app writes. Row 25 is deliberately one of them so the last row on the page is a no-description row.

`created_at` is set explicitly per row as `now() - interval '1 day' * <row number>` rather than defaulted, so newest-first ordering is observable instead of every row sharing one transaction timestamp. Rows 11 and 12 deliberately share row 11's timestamp to exercise the `title` tiebreaker: with matching timestamps the list must show "Carry On" above "Winter's Orbit".

This file must **not** be added to `db.seed.sql_paths` in `supabase/config.toml:65` and must **not** be merged into `seed.sql`. `supabase/tests/rls.sql:116` asserts that user A owns exactly six books, so a large dataset attached to user A — or auto-loaded on every reset — would break the committed isolation proof. Putting it on a third account keeps the RLS script passing regardless of whether the fixture is loaded.

#### 1b. Amendment (approved 2026-08-08): expandable long descriptions

**File**: `src/components/books/BookList.astro`

**Why**: The two-line clamp made the full description unreadable anywhere in the product until S-03's edit form ships. FR-004 added description back as an optional field specifically so a user can recognise a book they added months ago, so a clamp with no escape hatch only half-serves that rationale. Approved as an S-02 amendment rather than a new slice: it is a property of this slice's render contract, and S-03 would otherwise touch this same component twice.

**Contract**: Descriptions longer than a fixed character threshold render inside a native `<details>` / `<summary>` disclosure whose clamp is released by Tailwind's `group-open:line-clamp-none`, with a "Show more" / "Show less" label. Descriptions at or under the threshold render as a plain `<p>` with no clamp and no affordance. Null descriptions are unchanged — no element, no affordance.

The threshold is a character count (~180, approximately two rendered lines at this card width and text size) because server rendering cannot measure whether text actually overflows. This keeps the plan's zero-JavaScript constraint intact: `<details>` is a native disclosure, so there is still **no React island and no client-side JavaScript on this page**, and still no detail route.

#### 2. Book list component

**File**: `src/components/books/BookList.astro` (new)

**Intent**: Render a collection of persisted books as a semantic list so the page file stays about data fetching and state selection rather than markup. This is the component S-03 will extend with edit and delete controls.

**Contract**: Astro component taking a single `books` prop typed as `Pick<Tables<"books">, "id" | "title" | "author" | "tropes" | "description">[]` — the narrowed row shape the page selects, imported from `src/lib/database.types.ts`. Renders a `<ul>` with one `<li>` per book, each showing title, author, the description when non-null, and trope tags as a nested list of chips. The description carries `line-clamp-2` so a 2000-character entry cannot dominate the page. Visual treatment matches `SavedBooksList.tsx:19-33` — bordered translucent rows, chip styling, and the same text hierarchy — so the two surfaces look consistent without sharing code. Assumes a non-empty array: the empty case is the page's decision, not this component's.

#### 3. The browse page

**File**: `src/pages/books/index.astro` (new)

**Intent**: Serve the user's whole TBR as a finished HTML page on first byte, and pick between the populated, empty, and failed-read states.

**Contract**: Astro page at route `/books`, already gated by the `"/books"` prefix in `PROTECTED_ROUTES`. In frontmatter: obtain the client via `createClient(Astro.request.headers, Astro.cookies)`; read `Astro.locals.user`. Because middleware gates this path, a missing user is unreachable in practice, but `locals.user` is typed `User | null` — treat the null case as a redirect to `/auth/signin` rather than a cast, so the page has no non-null assertion.

The query is one call selecting exactly `id, title, author, tropes, description`, filtered with `.eq("user_id", user.id)`, ordered by `created_at` descending, then `title` ascending, then `id` ascending. The explicit owner filter is defence in depth alongside the RLS select policy and keeps `books_user_id_idx` in play; the narrowed column list keeps `user_id` and the timestamps out of the render layer. Do not use `.single()` or `.maybeSingle()` — zero rows is a valid result.

Derive one of three states in frontmatter, error-first (see Critical Implementation Details), and render accordingly inside the shared `Layout` using the `bg-cosmic` wrapper and glass card from `dashboard.astro:8-9`, but with two critical CSS adjustments: use `items-start pt-12` (or similar top padding) on the flex container instead of `items-center` so the long list remains scrollable without top-overflow, and remove `text-center` from the card so the book list items align left naturally:

- **Failed** (the query returned an `error`, or defensively a client is `null` if the page is reached): a panel stating the list could not be loaded and suggesting a reload, visually consistent with `src/components/auth/ServerError.tsx:7-16`. No book count, no wording implying an empty TBR. Log the query error with `console.error`, mirroring `src/pages/api/books.ts:61` — `no-console` is a warning, not an error, and `wrangler tail` is the v1 observability story.
- **Empty** (no error, zero rows): copy explaining the TBR is empty plus a prominent link to `/books/new` as the primary action.
- **Populated**: a heading that names the surface as the user's TBR and states the book count, then `BookList`.

The heading must not use "added this session" phrasing in any state — that wording belongs to the add-book island and conflating them is the failure mode S-01 guarded against.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` completes clean
- Type-aware lint passes: `npm run lint`
- Production build passes: `npm run build`
- The fixture loads cleanly against the local stack, and re-running it a second time changes nothing (idempotent)
- `supabase/tests/rls.sql` still passes with the fixture loaded, proving it did not disturb the six-book assertion for user A
- Unauthenticated `GET /books` redirects to `/auth/signin` (302)
- Signed-in `GET /books` returns 200 and the response HTML source already contains the book titles, proving the list is server-rendered rather than fetched by the browser

#### Manual Verification:

- Signed in as `user-c@example.test` with the fixture loaded, all 25 books appear with their title, author, and tropes
- The heading count reads 25 and matches the number of rows actually rendered
- The three no-description rows (7, 15, and 25) render cleanly with no empty gap or stray separator — including row 25, which is the last row on the page
- The long-description row (18) is clamped to two lines rather than expanding to fill the page
- Row 18 shows a "Show more" affordance that expands its description in place and collapses again via "Show less"; the short-description rows show no affordance and no clamp
- Row 1 appears first and row 25 last, and repeated refreshes produce the same order
- Rows 11 and 12 share a timestamp, and "Carry On" appears above "Winter's Orbit" — confirming the title tiebreaker
- A book added from `/books/new` while signed in as user C appears above all 25 fixture rows
- Signed in as `user-a@example.test`, the six original seed books appear instead — confirming the page is not tied to one account
- With every row deleted for a test user, the page shows the empty state and its "Add your first book" link reaches `/books/new`
- With the local stack running, temporarily revoke `select` on `public.books` from `authenticated`, reload `/books`, and confirm the load-failure panel — explicitly not the empty state — and the page's links still work; then restore the grant with `grant select on public.books to authenticated`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding.

---

## Phase 2: Navigation wiring

### Overview

Connect the new page into the app so the user can move between the dashboard, their TBR, and the add-book form without typing URLs.

### Changes Required:

#### 1. Dashboard link to the TBR

**File**: `src/pages/dashboard.astro`

**Intent**: Make the list reachable; the dashboard currently offers only "Add a book" and "Sign out".

**Contract**: Add a link to `/books` in the existing button row (`dashboard.astro:17-32`), styled like the sibling "Add a book" anchor (`dashboard.astro:18-23`). Place it before "Add a book" so the row reads as view-then-add. No other dashboard change.

#### 2. Onward links from the TBR page

**File**: `src/pages/books/index.astro`

**Intent**: Give the list page the same escape routes the add-book page has, so it is not a leaf.

**Contract**: A link to `/books/new` and a link back to `/dashboard`, in the header row of the card, styled like the back-link on `books/new.astro:13-18`. Both must be present in all three render states — including the failure state, which is precisely when the user needs a way out. The empty state's primary "Add your first book" call to action is separate from this header link and both may coexist.

#### 3. Link from the add-book page to the TBR

**File**: `src/pages/books/new.astro`

**Intent**: Let the user check what they have already entered part-way through a migration session without losing their place.

**Contract**: Add a link to `/books` alongside the existing "Back to dashboard" anchor (`books/new.astro:13-18`), matching its styling. This is navigation only — do not change the form, do not redirect after save, and do not make the island's session list read from the database. Staying on the page after a save is the ≤30 s guardrail behaviour S-01 established.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` completes clean
- Type-aware lint passes: `npm run lint`
- Production build passes: `npm run build`

#### Manual Verification:

- Dashboard → TBR list works, and the list → dashboard link returns
- TBR list → "Add a book" reaches `/books/new`
- Add-book page → TBR list works, and a book saved moments earlier is present in that list
- The header links are present and functional on the empty state and on the load-failure state, not just the populated one
- The add-book page's "Added this session" list still reads as distinct from the TBR list — no copy on either page suggests they are the same collection

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding.

---

## Phase 3: Isolation and scale verification

### Overview

Prove the two guardrails a read path can break — per-user isolation (FR-011) and usability of the un-paginated list at real backlog size — and get CI green. No feature code; a scale finding that fails comes back as an adjustment to Phase 1.

### Changes Required:

#### 1. Isolation re-verification for the read path

**File**: no code change; re-run `supabase/tests/rls.sql`

**Intent**: F-01 proved isolation against a schema with no application readers and S-01 added the first writer. This slice adds the first reader, so re-confirm the guardrail with the new code path in place.

**Contract**: Re-run the committed isolation script against the local stack, both with and without the populated fixture loaded, and confirm it exits clean each time. Then verify through the UI across all three accounts: user C sees its 25 books, user A sees exactly its six, user B sees exactly its six, and no account sees another's. The deliberate title collisions are the tell — user C's row 1 duplicates user A's "Red White and Royal Blue" and row 2 duplicates user B's "The Song of Achilles" (`supabase/seed.sql:62-165`), so any leak shows up as a repeated title rather than something a tester must hunt for. FR-011 requires that another account's books are never reachable through any interface, and this page is a new interface.

#### 2. Scale check at real backlog size

**File**: no code change; record the result in this plan's Progress notes

**Intent**: The decision to render every row without pagination assumes ~100 books stays usable. Test the assumption rather than trusting it, since the PRD's Primary success criterion is a 100+ book migration.

**Contract**: Insert 120 throwaway rows on top of user C's 25 (snippet in Testing Strategy), load `/books`, and confirm the page renders all 145, the count is correct, scrolling stays smooth, and the response arrives without a perceptible delay. Then reset the local database. If the page is unusable at that size, the fix belongs in Phase 1 — but note that a search or filter response is out of scope here and would be S-04.

#### 3. CI

**File**: no code change

**Intent**: The repo's merge gate (`.github/workflows/ci.yml` runs `npm ci → npx astro sync → npm run lint → npm run build`).

**Contract**: Push the branch and confirm CI passes. Per `AGENTS.md` this lands on `main` via PR from `feat/browse-tbr-list`; never commit to `main`, and never bypass the Husky pre-commit hook.

### Success Criteria:

#### Automated Verification:

- `supabase/tests/rls.sql` runs clean against the local stack
- CI passes on the branch (`npm ci`, `npx astro sync`, `npm run lint`, `npm run build`)

#### Manual Verification:

- Each of the three accounts sees only its own books, and neither deliberate title collision surfaces a row from another account
- With 145 rows for user C, the page renders every row with a correct count and no perceptible delay
- The page works on at least two of the four mainstream desktop browsers (per the PRD browser NFR)

**Implementation Note**: This is the final phase. Confirm the isolation and scale results with the human before opening the PR.

---

## Testing Strategy

No test framework is wired up in this repo (`AGENTS.md`), and this slice deliberately does not add one. Verification is three-legged.

### Static and build verification:

- `npx astro sync`, `npm run lint` (type-aware, `strictTypeChecked`), `npm run build` — after every phase, and enforced by CI.

### Route-level checks (against `npm run dev`):

Confirm the gate and the server-render claim:

```sh
curl -i http://localhost:4321/books
curl -s http://localhost:4321/books -H "Cookie: $SESSION_COOKIE" | grep -c "The Hating Game"
```

The first must be a 302 to `/auth/signin`. The second must print a non-zero count — the title appearing in the raw HTML is the evidence that the list is rendered by the server and not fetched by the browser. For the authenticated check, copy the complete `Cookie` request header from a signed-in browser session into `SESSION_COOKIE` and do not commit it.

### Database and isolation:

- `supabase/tests/rls.sql` against the local stack, re-run in Phase 3 now that a reader exists — and once with the populated fixture loaded, to confirm the fixture does not disturb it.
- Cross-account checks through the UI with all three accounts (`user-a@example.test`, `user-b@example.test`, `user-c@example.test`, password `password123` for each).

### Populated TBR fixture (local only)

Load it, and reset back to the committed fixtures when finished:

```sh
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/fixtures/populated-tbr.sql
npx supabase db reset
```

The dataset is 25 gay romance titles owned by `user-c@example.test`. Every row has a title, an author, and tropes; **22 have a description and 3 do not** (rows 7, 15, and 25). Trope wording deliberately repeats across rows — "slow burn", "found family", "enemies to lovers", "historical" — so the same fixture also serves S-04's filter work and S-05's overlap matching later.

Two titles deliberately collide with the existing seed data: row 1 is a punctuation variant of user A's "Red White and Royal Blue", and row 2 is the same title as user B's "The Song of Achilles". If owner scoping ever breaks, those collisions surface as duplicate rows rather than as something a tester has to go looking for.

| # | Title | Author | Tropes | Description |
| --- | --- | --- | --- | --- |
| 1 | Red, White & Royal Blue | Casey McQuiston | enemies to lovers, forced proximity, royalty, secret relationship | The First Son of the United States and the Prince of Wales stage a truce for the cameras and fall for each other off them. |
| 2 | The Song of Achilles | Madeline Miller | childhood friends to lovers, slow burn, mythology retelling, tragic ending | Patroclus narrates a lifetime beside Achilles, from exiled boyhood to the beach at Troy. |
| 3 | Call Me by Your Name | André Aciman | summer romance, first love, age gap, coming of age | A teenager and his father's visiting scholar circle each other through one Italian summer. |
| 4 | Boyfriend Material | Alexis Hall | fake dating, grumpy sunshine, opposites attract, British humour | A tabloid-battered disaster needs a respectable boyfriend, and the most respectable man in London agrees to pretend. |
| 5 | Husband Material | Alexis Hall | established couple, marriage plot, found family, wedding season | Three weddings later, a couple who never planned to marry has to work out what they actually want. |
| 6 | Heartstopper: Volume One | Alice Oseman | friends to lovers, coming out, sweet romance, school setting | A quiet sixth-former and the rugby player who sits next to him edge from friendship into something else. |
| 7 | Simon vs. the Homo Sapiens Agenda | Becky Albertalli | epistolary, secret identity, coming out, high school | *(none — leave null)* |
| 8 | They Both Die at the End | Adam Silvera | one-day romance, tragic ending, found family, insta-connection | Two strangers get the call that today is their last, and spend it together. |
| 9 | Cemetery Boys | Aiden Thomas | ghost romance, trans protagonist, magic, slow burn | A trans brujo summons the wrong ghost and can't bring himself to send him on. |
| 10 | The Charm Offensive | Alison Cochrun | reality TV, opposites attract, hurt/comfort, slow burn | The star of a dating show falls for the producer paid to make him fall for someone else. |
| 11 | Winter's Orbit | Everina Maxwell | arranged marriage, political intrigue, slow burn, sci-fi romance | A frivolous prince is married off to a grieving diplomat to hold a treaty together. |
| 12 | Carry On | Rainbow Rowell | enemies to lovers, chosen one, roommates, magic school | The worst Chosen One in history spends his last year at magic school sharing a room with his nemesis. |
| 13 | Wayward Son | Rainbow Rowell | road trip, established couple, hurt/comfort, post-canon | After the prophecy is over, a road trip across America goes badly wrong. |
| 14 | The Foxhole Court | Nora Sakavic | sports romance, enemies to lovers, found family, hurt/comfort | A runaway with a false name joins a college team built entirely out of other people's disasters. |
| 15 | Captive Prince | C. S. Pacat | enemies to lovers, slow burn, captivity, political intrigue | *(none — leave null)* |
| 16 | Prince's Gambit | C. S. Pacat | forced proximity, slow burn, war campaign, mutual pining | A campaign north puts a captive prince and his captor on the same side of a battlefield. |
| 17 | Kings Rising | C. S. Pacat | royalty, mutual pining, political intrigue, hidden identity | Two kings with every reason to destroy each other choose an alliance instead. |
| 18 | Aristotle and Dante Discover the Secrets of the Universe | Benjamin Alire Sáenz | friends to lovers, coming of age, slow burn, literary | **Long-description row** — pad a plausible blurb to roughly 1,900 characters, just under the 2,000-character cap in `bookSchema`, so the two-line clamp has something to clamp. |
| 19 | What If It's Us | Becky Albertalli and Adam Silvera | meet cute, missed connections, first love, dual POV | A New York post office meet-cute, then a whole summer spent trying to make a second chance work. |
| 20 | Under the Whispering Door | TJ Klune | grumpy sunshine, afterlife, found family, slow burn | A dead lawyer refuses to cross over and falls for the ferryman running the tea shop. |
| 21 | Wolfsong | TJ Klune | fated mates, werewolves, found family, slow burn | A boy with a stammer meets the wolf who becomes his whole vocabulary. |
| 22 | Him | Sarina Bowen and Elle Kennedy | sports romance, friends to lovers, bisexual awakening, summer camp | Two hockey players share a coaching job at the camp where everything went wrong between them. |
| 23 | Heated Rivalry | Rachel Reid | rivals to lovers, secret relationship, hockey, slow burn | Two rival NHL stars spend years pretending their hotel rooms mean nothing. |
| 24 | The Magpie Lord | K. J. Charles | historical, paranormal, class difference, magic | A reluctant earl hires a magician to work out who keeps trying to kill him. |
| 25 | The Gentleman's Guide to Vice and Virtue | Mackenzi Lee | historical, road trip, pining, disaster bisexual | *(none — leave null)* |

### Scale fixture (local only — do not commit to `supabase/seed.sql`):

```sql
insert into public.books (user_id, title, author, tropes)
select 'c0000000-0000-4000-8000-000000000001',
       'Scale Test ' || g,
       'Author ' || (g % 20),
       array['scale-test', 'trope-' || (g % 7)]
from generate_series(1, 120) as g;
```

Run it on top of the populated fixture for the Phase 3 scale check, which brings user C to 145 rows, then `npx supabase db reset` to return to the committed fixtures.

### Manual testing steps:

1. Load the populated fixture, sign in as `user-c@example.test`, and open `/books` from the dashboard; confirm all 25 books render with tropes and that the count reads 25.
2. Check rows 7, 15, and 25; confirm each renders cleanly without a description and that row 25 closes the list tidily.
3. Check row 18; confirm its long description clamps to two lines rather than dominating the page.
4. Refresh twice; confirm the order does not change, that row 1 leads and row 25 trails, and that "Carry On" sits above "Winter's Orbit".
5. Add a book from `/books/new`, then follow the link to `/books`; confirm the new book is above all 25 fixture rows.
6. Delete all rows for a test user; confirm the empty state and that its call to action reaches `/books/new`.
7. Run `revoke select on public.books from authenticated;` against the local database, reload `/books`, and confirm the load-failure panel appears, says nothing about having no books, and leaves the navigation usable. Then immediately run `grant select on public.books to authenticated;` to restore the committed schema state.
8. Sign out and visit `/books`; confirm the redirect to sign-in.
9. Sign in as `user-a@example.test`; confirm exactly six books, and that neither the "Red, White & Royal Blue" nor the "The Song of Achilles" collision produces a duplicate from another account.
10. Insert the 120-row scale fixture and reload as user C; confirm all 145 rows render and the page remains scannable.

## Performance Considerations

The read path is a single owner-index-filtered select per page load, returning ~100 rows of small text and then ordered by `created_at`, `title`, and `id` — far inside the Workers per-request CPU ceiling flagged in `context/foundation/lessons.md:12-17`, and consistent with `target_scale.data_volume: small`. No caching, streaming, pagination, or composite ordering index is warranted at single-digit users; the un-paginated render is a deliberate decision recorded above, and S-04's search and filter is the escape hatch if a real backlog ever outgrows one page. The clamped description is a layout decision rather than a performance one, but it also bounds the served HTML size against 2000-character entries.

## Migration Notes

No schema migration. The `books` table, its constraints, indexes, RLS policies, and grants all ship from F-01 and are untouched; `supabase/seed.sql`, `supabase/tests/rls.sql`, and `supabase/config.toml` are all unchanged. The new `supabase/fixtures/populated-tbr.sql` is a local development aid only — it creates an `auth.users` row and must never be run against the hosted project, which is why it stays out of `db.seed.sql_paths` and out of any deploy step. Nothing needs applying to production beyond the normal `npm run build` + `npx wrangler deploy`, so there is no database rollback to plan — reverting is a Worker rollback. No `wrangler.jsonc` change either: `assets.run_worker_first` covers `/api/*` and this slice adds a page route, not an API route.

## References

- Roadmap slice S-02: `context/foundation/roadmap.md:135-145`
- PRD FR-005 (browsable list) and FR-012 (search/filter, deferred to S-04): `context/foundation/prd.md`
- PRD FR-011 isolation across browse, search, and recommend: `context/foundation/prd.md`
- Prior slice conventions and the session-list warning: `context/archive/2026-08-02-add-book-to-tbr/plan.md`
- Data layer this slice reads: `supabase/migrations/20260705084406_create_books.sql:4-60`
- Client factory and its null case: `src/lib/supabase.ts:6-25`
- Route gating (already covers `/books`): `src/middleware.ts:4`
- Protected server-rendered page precedent: `src/pages/dashboard.astro:1-5`
- Card markup to mirror visually: `src/components/books/SavedBooksList.tsx:19-33`
- Error panel styling precedent: `src/components/auth/ServerError.tsx:7-16`
- Per-page link styling: `src/pages/books/new.astro:13-18`, `src/pages/dashboard.astro:18-23`
- Local fixtures for the two isolation accounts, and the `auth.users` insert shape the new fixture copies: `supabase/seed.sql:4-30`, `supabase/seed.sql:62-165`
- The six-book assertion that keeps the new dataset off user A: `supabase/tests/rls.sql:99-119`
- Seed loading config the new fixture stays out of: `supabase/config.toml:60-65`
- Description length cap the long-description row sits under: `src/lib/book-schema.ts`
- Workers batch-work constraint: `context/foundation/lessons.md:12-17`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Browse page and list component

#### Automated

- [x] 1.1 `npx astro sync` completes clean
- [x] 1.2 Type-aware lint passes: `npm run lint`
- [x] 1.3 Production build passes: `npm run build`
- [x] 1.4 The fixture loads cleanly against the local stack, and re-running it a second time changes nothing (idempotent)
- [x] 1.5 `supabase/tests/rls.sql` still passes with the fixture loaded, proving it did not disturb the six-book assertion for user A
- [x] 1.6 Unauthenticated `GET /books` redirects to `/auth/signin` (302)
- [x] 1.7 Signed-in `GET /books` returns 200 and the response HTML source already contains the book titles, proving the list is server-rendered rather than fetched by the browser

#### Manual

- [x] 1.8 Signed in as `user-c@example.test` with the fixture loaded, all 25 books appear with their title, author, and tropes
- [x] 1.9 The heading count reads 25 and matches the number of rows actually rendered
- [x] 1.10 The three no-description rows (7, 15, and 25) render cleanly with no empty gap or stray separator — including row 25, which is the last row on the page
- [x] 1.11 The long-description row (18) is clamped to two lines rather than expanding to fill the page
- [x] 1.12 Row 1 appears first and row 25 last, and repeated refreshes produce the same order
- [x] 1.13 Rows 11 and 12 share a timestamp, and "Carry On" appears above "Winter's Orbit" — confirming the title tiebreaker
- [x] 1.14 A book added from `/books/new` while signed in as user C appears above all 25 fixture rows
- [x] 1.15 Signed in as `user-a@example.test`, the six original seed books appear instead — confirming the page is not tied to one account
- [x] 1.16 With every row deleted for a test user, the page shows the empty state and its "Add your first book" link reaches `/books/new`
- [x] 1.17 With the local stack running, temporarily revoke `select` on `public.books` from `authenticated`, reload `/books`, and confirm the load-failure panel — explicitly not the empty state — and the page's links still work; then restore the grant with `grant select on public.books to authenticated`
- [x] 1.18 Row 18 shows a "Show more" affordance that expands its description in place and collapses again via "Show less" (amendment)
- [x] 1.19 Short-description rows show neither a clamp nor an affordance, and null-description rows are unchanged (amendment)

### Phase 2: Navigation wiring

#### Automated

- [ ] 2.1 `npx astro sync` completes clean
- [ ] 2.2 Type-aware lint passes: `npm run lint`
- [ ] 2.3 Production build passes: `npm run build`

#### Manual

- [ ] 2.4 Dashboard → TBR list works, and the list → dashboard link returns
- [ ] 2.5 TBR list → "Add a book" reaches `/books/new`
- [ ] 2.6 Add-book page → TBR list works, and a book saved moments earlier is present in that list
- [ ] 2.7 The header links are present and functional on the empty state and on the load-failure state, not just the populated one
- [ ] 2.8 The add-book page's "Added this session" list still reads as distinct from the TBR list — no copy on either page suggests they are the same collection

### Phase 3: Isolation and scale verification

#### Automated

- [ ] 3.1 `supabase/tests/rls.sql` runs clean against the local stack
- [ ] 3.2 CI passes on the branch (`npm ci`, `npx astro sync`, `npm run lint`, `npm run build`)

#### Manual

- [ ] 3.3 Each of the three accounts sees only its own books, and neither deliberate title collision surfaces a row from another account
- [ ] 3.4 With 145 rows for user C, the page renders every row with a correct count and no perceptible delay
- [ ] 3.5 The page works on at least two of the four mainstream desktop browsers (per the PRD browser NFR)
