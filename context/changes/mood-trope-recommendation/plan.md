# Mood-Trope Recommendation (S-05) Implementation Plan

## Overview

Build the north-star slice: a signed-in user opens `/mood`, ticks 1–3 tropes drawn from their own TBR, and receives up to 3 books whose tropes overlap at least one selection — with a "Show me 3 more" control that adds further suggestions beneath the ones already on screen. Server-rendered on the existing Astro + Supabase stack, zero new npm dependencies, zero client-side JavaScript.

## Current State Analysis

The prerequisites (F-01 data layer, S-01 add-book) are done and the browse stack (S-02/S-03/S-04) has already produced every building block this slice needs.

- `src/pages/books/index.astro` is a near-exact template: one `.eq("user_id", user.id)` query, `collectTropeVocabulary` over the result, in-memory filtering, and a four-way `failed / empty / no-match / populated` state machine rendered from Astro frontmatter.
- `src/components/books/BookFilterBar.astro:65-117` holds the zero-JS trope picker — a `<details>` disclosure wrapping `<input type="checkbox" name="trope">` inside a `method="GET"` form. Repeated `trope` params are the established selection wire format.
- `collectTropeVocabulary` (`src/lib/book-filters.ts:79-100`) already derives the per-user trope universe and takes an `alsoInclude` argument, which `/books` uses to keep a selected-but-absent trope visible as a ticked box.
- `src/lib/book-schema.ts:9-21` (`tropeListSchema`) is the zod style to follow for trope string validation, but the mood selection cap needs its own max-3 schema — do not reuse `tropeListSchema`'s 25-trope ceiling. The schema still requires **at least one trope on every book** — enforced on both add and edit.
- `sortBooksForBrowse` (`src/lib/sort-books-for-browse.ts`) sorts newest-first. That is *recency weighting*, which this slice must not use (see Non-Goals), so it is not reusable here.
- `PROTECTED_ROUTES` in `src/middleware.ts:4` is `["/dashboard", "/books"]`. A new top-level `/mood` route is public until added.
- No test framework is wired up (`AGENTS.md`). Automated verification is limited to `npx astro sync`, `npm run lint`, and `npm run build`; everything behavioural is manual.
- `supabase/seed.sql` was written with this slice in mind: User A (6 books, "overlapping tropes for downstream S-05 inspection"), User B (6 books, tropes deliberately overlapping User A's), User C (25 books), User D (empty TBR).

The one thing that genuinely does **not** exist is the matching rule. `matchesBookFilters` (`src/lib/book-filters.ts:70-74`) returns false unless a book carries **every** selected trope — AND semantics, correct for a filter. FR-010 requires **any**-match (OR). The two predicates read almost identically at a glance, which is the main correctness hazard in this slice.

## Desired End State

A signed-in user can reach "Pick by mood" from the dashboard or their TBR, land on `/mood`, see a checkbox list of only their own tropes, tick between one and three, submit, and get up to 3 of their own books — each showing title, author, description, and trope pills. When more than 3 match, a count states how many there are and a "Show me 3 more" link adds the next three underneath, leaving the earlier suggestions in place, until every match is on screen. Selecting a fourth trope produces a clear error with the ticks preserved rather than a wrong answer. An empty TBR and a no-match query each produce their own explanatory screen, never a blank one. Nothing on the page requires JavaScript, and no other account's books can appear.

Verified by: the manual test suites in each phase below, run against the local Supabase seed.

### Key Discoveries:

- **AND vs OR is the correctness hazard.** `matchesBookFilters` is all-match; S-05 needs any-match. New predicate in a new module, deliberately not co-located with the filter predicate.
- **One query serves both jobs.** The picker needs the user's whole trope vocabulary and the matcher needs the candidate books — both come from the same `select(...).eq("user_id", …)`. A DB-side `.overlaps()` would add a second round trip for no gain at ~100 rows, so matching happens in memory. (Research offered both; this plan picks in-memory for that reason.)
- **The "books but no tropes" state is unreachable.** `tropeListSchema` requires ≥1 trope on add and edit, so a book always carries one. Per decision, this is handled as a safe fallback, not a built-and-tested third empty state.
- **The "no matches" state is unreachable by clicking, but reachable by URL.** Every trope offered in the picker is, by construction, on at least one book — and any-match only widens results, so no combination of picked tropes can return zero. It *is* reachable through a stale bookmark or a hand-edited URL whose trope was since renamed or deleted. FR/US-01 require the state, so it ships and is tested via URL.
- **Stable ordering makes expansion coherent.** Because order is deterministic (title, then id), revealing matches 3 at a time is well-defined and repeatable: books already on screen never move or change when more are added beneath them. That is what makes "Show me 3 more" safe under a Non-Goal forbidding ranking, recency, and shuffling.
- **Seed data gives exact expected results.** User A picking `enemies-to-lovers` + `slow burn` + `contemporary` matches 5 books, which in stable order are: Beach Read, Fourth Wing, Red White and Royal Blue, then The Hating Game, The Seven Husbands of Evelyn Hugo. That is the expansion fixture — first three, then all five with the original three still in place.

## What We're NOT Doing

- No ranking, scoring, "best match first", recency weighting, or random shuffle (PRD Non-Goal).
- No new npm dependencies; no richer multi-select widget (`cmdk`, Base UI, Downshift, etc.) — deferred per research.
- No React island on this page; native HTML only, per `lessons.md`.
- No client-side script to grey out the fourth checkbox — the server error is the mechanism.
- No Edit or Delete buttons on result cards; `/mood` is a decision screen, not a management screen.
- No "show fewer" control and no ceiling on how many suggestions one mood can reveal — re-submitting the picker is the reset.
- No changes to the database schema, migrations, or RLS policies.
- No "read"/"finished" state, no saving or history of past mood queries.
- No changes to the visual theme — that is S-07's job; this slice matches the existing cosmic styling so S-07 restyles one consistent surface.
- No dedicated third empty state for "books but no tropes" (unreachable — see Key Discoveries).

## Implementation Approach

`/mood` is built as a variant of `/books`: a `method="GET"` form that submits to its own route, with all selection state in the URL. On each request the page loads the user's books once, derives the trope vocabulary, validates the selection, filters by any-match, sorts stably, and renders one slice of the matches.

All decision logic lives in a new `src/lib/mood-selection.ts` so the page frontmatter stays declarative and the AND-filter and OR-match rules never sit in the same file. Rendering reuses the existing card vocabulary, with the description disclosure extracted into a shared component so the browse list and the mood results cannot drift apart.

Work is phased so the refactor of a working surface is isolated from the new feature: Phase 1 changes only shared internals and is verified as a no-regression pass over `/books`; Phase 2 delivers the working north-star screen; Phase 3 adds the "show me more" expansion and runs the cross-cutting guardrail checks.

## Critical Implementation Details

**The submit form must not carry how many books are shown.** The expansion count travels only on the "Show me 3 more" link. If a hidden field carried it into the form, picking a fresh mood after expanding would silently return twelve books instead of three. A new selection always starts at three.

**The trope vocabulary must include selected-but-absent tropes.** `/books` passes `filters.tropes` as `collectTropeVocabulary`'s `alsoInclude` argument so a stale trope still renders as a ticked box the user can untick. `/mood` must do the same — otherwise a stale bookmarked URL shows a no-match screen with no visible way to clear the offending trope.

**Parsing and validation are separate steps.** The parser must return whatever the user submitted, including four or more tropes; validation then reports "too many". If the parser capped the list at 3, the page could not re-render the user's actual ticks alongside the error, and the cap would become silent truncation — the behaviour explicitly rejected during planning.

## Phase 1: Matching logic and shared description card

### Overview

Introduce the mood-selection module and extract the description disclosure out of the browse list. No new user-facing surface: this phase is verified as a no-regression change to `/books`.

### Changes Required:

#### 1. Mood selection module

**File**: `src/lib/mood-selection.ts` (new)

**Intent**: Hold every mood-selection rule in one place, kept apart from `book-filters.ts` so the all-match filter predicate and the any-match recommendation predicate cannot be confused for one another.

**Contract**: Exports `MOOD_MAX_TROPES = 3` and `MOOD_STEP_SIZE = 3`; a `MoodSelection` shape carrying the submitted tropes; `parseMoodSelection(params: URLSearchParams): MoodSelection`, which reads repeated `trope` params with trim/dedupe/drop-empty semantics matching `parseFilterTropes`, stops after 26 unique non-empty values to bound query-driven page amplification, and deliberately does **not** enforce the separate 3-trope product cap; `validateMoodSelection(selection)`, a zod-backed discriminated result of `empty` / `too-many` / `ok` validated by a dedicated max-3 schema (do **not** import or reuse `tropeListSchema`, whose ceiling is 25) so the page can branch without re-deriving counts; `matchesAnyTrope(book, tropes)` returning true when the intersection is non-empty; `sortBooksForMood(books)` sorting by title (`localeCompare` with `numeric` and `sensitivity: "base"`, matching the existing convention) then by `id` as the tiebreak; and `buildMoodHref(tropes, show?)` for constructing `/mood` links, building query strings with `URLSearchParams` the way `buildBooksHref` does in `book-filters.ts` (required for tropes containing spaces). Result expansion is added to this module in Phase 3.

The 60-character-per-trope and 25-tropes-per-book bounds already enforced at write time need no restating here. The parser's 26-value ceiling is a defensive transport bound; the user-facing validation rule remains a 1–3 selection size.

#### 2. Shared description disclosure

**File**: `src/components/books/BookDescription.astro` (new)

**Intent**: Move the description rendering — plain paragraph when short, `<details>` with "Show more"/"Show less" when long — out of the browse list so both the TBR list and the mood results apply one clamp rule.

**Contract**: Takes the book's `description` (nullable) and renders nothing when it is absent. Owns the `DESCRIPTION_CLAMP_CHARS = 180` constant and the existing markup and classes verbatim, so the browse list's rendered output is byte-identical after the swap.

#### 3. Browse list uses the shared component

**File**: `src/components/books/BookList.astro`

**Intent**: Replace the inline description block with the new component, removing the duplicated clamp constant.

**Contract**: Lines 39-53 (the description conditional) collapse to a single `<BookDescription>` usage. The card's structure, ordering, and classes are otherwise untouched — this is a pure extraction with no behavioural change.

### Success Criteria:

#### Automated Verification:

- Astro types regenerate cleanly: `npx astro sync`
- Linting passes: `npm run lint`
- Production build passes: `npm run build`

#### Manual Verification:

**1.4 — The TBR list still shows descriptions exactly as before**

**Setup:** Start the app locally (`npm run dev`). Sign in as `user-c@example.test` with password `password123`. Open `/books` — you should see a list of 25 books.

**Steps:**
1. Look at several books in the list and confirm each one still shows its short description under the author's name.
2. Click **Edit** on any book, and in the description box paste a long paragraph (roughly 3–4 sentences, at least 200 characters). Save.
3. Back on the TBR list, find that book.
4. Click **Show more** on it, then click **Show less**.

**Expected:** Short descriptions appear as plain text with no link. The long description you added is cut off after about two lines with a **Show more** link; clicking it reveals the full text and the link changes to **Show less**; clicking that collapses it again. Nothing else about the cards has moved or changed appearance.

**Pass if:** Descriptions look and behave exactly as they did before this change, for both short and long text.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: The `/mood` screen, end to end

### Overview

Deliver the working north-star flow: a gated `/mood` route with the trope picker, up to 3 result cards, the selection-cap error, the empty and no-match screens, and links to reach the page from the dashboard and the TBR.

### Changes Required:

#### 1. Route gating

**File**: `src/middleware.ts`

**Intent**: Require sign-in for the new route, in the one place the project designates for it.

**Contract**: `"/mood"` added to the `PROTECTED_ROUTES` array. No other change; the existing `startsWith` check covers it.

#### 2. Mood picker

**File**: `src/components/books/MoodPicker.astro` (new)

**Intent**: Let the user tick 1–3 of their own tropes and submit, with no JavaScript.

**Contract**: A `method="GET"` form with `action="/mood"`, containing a `<details>` disclosure of `<input type="checkbox" name="trope">` entries — one per trope in the vocabulary, ticked when currently selected — and a submit button labelled "Find my next read". Adapted from `BookFilterBar.astro:65-117`, dropping the search input and the filter-specific clear affordance. Props are the trope vocabulary, the currently selected tropes, and an optional error message rendered near the submit control. The summary label reflects how many tropes are ticked, mirroring the filter bar's pattern. The form contains no hidden field for the visible-count (see Critical Implementation Details).

#### 3. Result cards

**File**: `src/components/books/MoodResultList.astro` (new)

**Intent**: Present the recommended books as a decision space — enough to recognise a book, nothing to act on it with.

**Contract**: Renders a list of cards showing title, author, `<BookDescription>`, and the trope pills, reusing the card classes from `BookList.astro` minus the Edit link and the delete trigger. Takes the books currently to be displayed.

#### 4. The mood page

**File**: `src/pages/mood.astro` (new)

**Intent**: Wire the query, the validation, and the state machine together and render the right screen for each case.

**Contract**: Guards on `Astro.locals.user` and redirects to `/auth/signin` when absent, mirroring `src/pages/books/index.astro:35-39`. Creates the Supabase client and null-checks it. Issues one `select("id, title, author, tropes, description").eq("user_id", user.id)`. Derives the vocabulary with `collectTropeVocabulary(data, selectedTropes)` so stale selections stay visible and untickable. Branches over — in this order, so empty selection is decided before any matching runs: query failure; no books at all; a books-present-but-empty-vocabulary fallback that reuses the same guidance copy; nothing selected yet; more than three selected; zero matches; and results. The "nothing selected yet" branch renders the picker only — no result cards and no no-match copy. Do not fall through to `matchesAnyTrope` or slice results when the selection is empty; that shape mirrors `/books` (which shows every book with no filters) and would incorrectly show the no-match screen on first visit. Results are `data.filter(matchesAnyTrope)` sorted by `sortBooksForMood` and, in this phase, capped with a plain 3-item slice — Phase 3 replaces that fixed slice with the expansion helper. Copy follows US-01's acceptance criteria: "Add a book to your TBR first" for an empty TBR, paired with a link to `/books/new` (matching the empty-TBR pattern on `/books`), "No matches — try different tropes" for zero matches, and a "Pick 1 to 3 tropes" message for an oversized selection.

#### 5. Entry points

**Files**: `src/pages/dashboard.astro`, `src/pages/books/index.astro`

**Intent**: Make the ritual reachable by clicking rather than by typing a URL.

**Contract**: A "Pick by mood" link to `/mood` added to the dashboard's action row (alongside "View your TBR" and "Add a book") and to the TBR page's header button group, using the existing anchor classes in each file.

### Success Criteria:

#### Automated Verification:

- Astro types regenerate cleanly: `npx astro sync`
- Linting passes: `npm run lint`
- Production build passes: `npm run build`

#### Manual Verification:

**2.4 — Signed-out visitors are sent to sign in**

**Setup:** Sign out, or open a private/incognito browser window.

**Steps:**
1. Type the address `http://localhost:4321/mood` directly into the address bar and press Enter.

**Expected:** You land on the sign-in page instead of the mood screen. No book titles or trope names are visible at any point.

**Pass if:** You are redirected to sign-in and never see TBR content.

---

**2.5 — Pick one trope and get matching books**

**Setup:** Sign in as `user-a@example.test` with password `password123`. You should land on the dashboard.

**Steps:**
1. Click **Pick by mood**.
2. Before ticking anything, confirm the trope picker is visible and no book cards are listed — no results and no "no matches" message.
3. Open the tropes dropdown. Read the list of tropes offered.
4. Tick **enemies-to-lovers** only.
5. Click **Find my next read**.

**Expected:** The dropdown offers exactly nine tropes, all of them ones used on your own books: contemporary, cozy fantasy, enemies-to-lovers, forced proximity, found family, historical, romantasy, slow burn, workplace romance. After submitting, you see two books — *Beach Read* by Emily Henry and *The Hating Game* by Sally Thorne — each showing its author, its description, and its trope pills, and each visibly tagged with enemies-to-lovers. The picker stays on screen with enemies-to-lovers still ticked.

**Pass if:** Only your own tropes are offered, and exactly those two books come back, each showing title, author, description, and tropes.

---

**2.6 — No other account's books can appear**

**Setup:** Still signed in as `user-a@example.test`.

**Steps:**
1. On the mood screen, untick everything, then tick **historical** only, and submit.
2. Note the results.
3. Sign out and sign in as `user-b@example.test` with password `password123`.
4. Go to **Pick by mood**, tick **historical** only, and submit.

**Expected:** As user A you see exactly one book, *The Seven Husbands of Evelyn Hugo*. As user B you see two different books, *The Song of Achilles* and *The Invisible Life of Addie LaRue*. Neither account ever shows a book belonging to the other, even though both have books tagged historical.

**Pass if:** The two accounts return completely different books and there is no overlap between them.

---

**2.7 — Ticking a fourth trope is refused, not silently trimmed**

**Setup:** Sign in as `user-a@example.test`.

**Steps:**
1. Go to **Pick by mood** and open the tropes dropdown.
2. Tick four tropes: **contemporary**, **enemies-to-lovers**, **historical**, and **slow burn**.
3. Click **Find my next read**.

**Expected:** No books are recommended. A message tells you to pick 1 to 3 tropes. All four of your ticks are still ticked when the page comes back, so you can untick one and try again.

**Steps (continued):**
4. Untick **historical**, leaving three ticked, and submit again.

**Expected:** You now get books back.

**Pass if:** Four tropes produce a visible error with your ticks preserved and no book results, and reducing to three produces results.

---

**2.8 — An empty TBR explains itself**

**Setup:** Sign out and sign in as `user-d@example.test` with password `password123`. This account has no books.

**Steps:**
1. Click **Pick by mood**.

**Expected:** Instead of an empty checkbox list or a blank page, you see a short message telling you to add a book to your TBR first, along with a way to go add one.

**Pass if:** The page explains why there is nothing to pick and offers a route to adding a book.

---

**2.9 — A stale link shows the no-match message**

**Setup:** Sign in as `user-a@example.test`. This simulates a bookmark saved before a trope was renamed.

**Steps:**
1. Type this address directly into the address bar and press Enter: `http://localhost:4321/mood?trope=zzz-not-a-real-trope`
2. Look at the tropes dropdown.

**Expected:** You see a message saying there are no matches and suggesting you try different tropes — not a blank screen and not an error page. The unmatched trope still appears as a ticked box in the dropdown, so you can untick it and pick something real instead.

**Pass if:** The no-match message appears and you can recover by changing the selection without editing the address bar again.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Showing more suggestions, and guardrail verification

### Overview

Let the reader ask for more suggestions without losing the ones already on screen, state how many books matched, and run the cross-cutting checks the PRD guardrails demand.

A note on the cap, since this phase appears to stretch it: the PRD says the rule "never returns a long list", and results here can grow past three. That constraint is read as governing what the system volunteers, not what the reader may deliberately ask for. Each expansion is an explicit click, the starting answer is always three, and picking a new mood resets to three — so the product never dumps a pile on anyone unprompted.

### Changes Required:

#### 1. Expansion helper

**File**: `src/lib/mood-selection.ts`

**Intent**: Turn a full match list and a requested visible count into the books to render, with all the boundary handling in one testable place.

**Contract**: Adds `parseMoodShowCount(params)`, which reads the `show` query param and returns the number of books to display — falling back to `MOOD_STEP_SIZE` for anything missing, non-numeric, fractional, or smaller than one step, and rounding up to a whole multiple of the step so hand-edited values still behave; and `takeMoodMatches(matches, show)`, returning `{ visible, total, nextShow: number | null }` where `visible` is the leading slice to render, `total` is the full match count, and `nextShow` is the count to pass on the next "Show me 3 more" link or `null` when everything is already shown. The requested count is clamped to the total, so an out-of-range bookmark shows all matches rather than erroring. `buildMoodHref` gains an optional count argument and omits `show` entirely when it equals one step, keeping first-view URLs clean.

Because the visible set is always the leading slice of a stably-sorted list, expansion cannot reorder or replace what the reader is already looking at — the first three books stay first.

#### 2. Page wiring

**File**: `src/pages/mood.astro`

**Intent**: Replace the fixed 3-item slice from Phase 2 with the expansion helper and tell the reader where they stand.

**Contract**: Reads the visible count alongside the tropes, passes the sorted matches through `takeMoodMatches`, and renders the returned slice. Near the results, states how many of the total are on screen — "Showing 3 of 5 matches" — with wording that degrades sensibly when the total is 3 or fewer, in which case no count is needed. Renders a **Show me 3 more** link carrying the same tropes plus the next count while matches remain; once all are shown, replaces it with a line confirming there are no more for this mood. This is an anchor, not a button, so it works without JavaScript.

There is deliberately no "show fewer" control: re-submitting the picker returns to three, which is the natural reset and is already on screen.

### Success Criteria:

#### Automated Verification:

- Astro types regenerate cleanly: `npx astro sync`
- Linting passes: `npm run lint`
- Production build passes: `npm run build`

#### Manual Verification:

**3.4 — Ask for more suggestions without losing the first three**

**Setup:** Sign in as `user-a@example.test` with password `password123`. Go to **Pick by mood**.

**Steps:**
1. Tick exactly three tropes: **contemporary**, **enemies-to-lovers**, and **slow burn**. Submit.
2. Read the line stating how many books matched, and write down the three book titles you can see.
3. Click **Show me 3 more**.
4. Look at the whole list of books now on the page.
5. Look for the **Show me 3 more** link again.

**Expected:** The first screen says 5 books matched and shows 3 of them: *Beach Read*, *Fourth Wing*, and *Red White and Royal Blue*. After clicking **Show me 3 more**, all five books are on the page — those same three still at the top, in the same order, with *The Hating Game* and *The Seven Husbands of Evelyn Hugo* added underneath. The count line now says all 5 are showing. The **Show me 3 more** link is gone, replaced by a line telling you there are no more matches for this mood.

**Pass if:** The original three books are still on screen after asking for more, the two new ones appear below them, and the link disappears once all five are shown.

---

**3.5 — Repeating the same mood gives the same books**

**Setup:** Signed in as `user-a@example.test`.

**Steps:**
1. Tick **slow burn** only and submit. Note the books and their order.
2. Navigate away to the dashboard, then come back to **Pick by mood**.
3. Tick **slow burn** only and submit again.

**Expected:** Both times you get the same books listed in the same order.

**Pass if:** The results are identical on both attempts.

---

**3.6 — Picking a new mood goes back to three suggestions**

**Setup:** Signed in as `user-a@example.test`.

**Steps:**
1. Tick **contemporary**, **enemies-to-lovers**, and **slow burn**, and submit.
2. Click **Show me 3 more** so that all five books are on screen.
3. Open the dropdown, untick everything, tick **found family** only, and click **Find my next read**.

**Expected:** You get the books matching found family, shown three at a time from the start — the expanded list from your previous mood is gone, and you are not shown a long list carried over from the last query.

**Pass if:** A new mood selection starts fresh at three suggestions rather than staying expanded.

---

**3.7 — Results arrive in under 2 seconds**

**Setup:** Sign in as `user-c@example.test` with password `password123` — this account has 25 books, the largest seeded TBR.

**Steps:**
1. Go to **Pick by mood**.
2. Tick **slow burn** and two other tropes of your choice.
3. Click **Find my next read** and count how long the page takes to show results.
4. Click **Show me 3 more** and time that too.

**Expected:** Each page appears in well under 2 seconds.

**Pass if:** Both the initial results and the next page appear within 2 seconds.

---

**3.8 — The whole flow works with JavaScript turned off**

**Setup:** Turn JavaScript off for the site in your browser settings, then sign in as `user-a@example.test`.

**Steps:**
1. Go to **Pick by mood**.
2. Open the tropes dropdown.
3. Tick **contemporary**, **enemies-to-lovers**, and **slow burn**, then submit.
4. Click **Show me 3 more** and check the extra books appear below the first three.
5. Expand a book's description with **Show more** if one is long enough to be cut off.
6. Turn JavaScript back on when finished.

**Expected:** Every step behaves the same as with JavaScript on — the dropdown opens, ticks register, results appear, asking for more extends the list, and the description expands.

**Pass if:** The complete mood flow is usable with JavaScript disabled.

---

## Testing Strategy

No automated test framework exists in this project (`AGENTS.md`), so correctness rests on the manual suites above plus the type checker and linter. The manual tests are written against `supabase/seed.sql`, whose fixtures were authored for this slice: User A and User B carry deliberately overlapping tropes (the isolation test), User C has 25 books (the performance test), and User D is empty (the empty-state test).

If a test framework is added later, `src/lib/mood-selection.ts` is the unit under test — `matchesAnyTrope` for OR semantics, `sortBooksForMood` for determinism and tie-breaking, `validateMoodSelection` for the 0/1–3/4+ boundaries, and `takeMoodMatches` for the opening three, a partial final expansion, and out-of-range counts. It is written as pure functions over plain data specifically so this is possible without a browser. Wire any such framework into `.github/workflows/ci.yml` between `lint` and `build`.

### Manual Testing Steps:

See each phase's `#### Manual Verification:` block above — those are the source of truth, written as numbered steps against named seed accounts.

## Performance Considerations

One indexed query per page load returns at most a few hundred rows for a single user; vocabulary collection, filtering, sorting, and slicing are all linear passes over that array. At the PRD's ~100-book scale this is negligible and comfortably inside the ≤2s guardrail and the Workers per-request CPU budget flagged in `lessons.md`. Rendering is server-side with no hydration, so nothing client-side sits on the critical path.

The deliberate choice of in-memory matching over a DB-side `.overlaps()` costs nothing here: the picker needs every one of the user's tropes anyway, so the rows must be fetched regardless, and a second filtered query would only add a round trip.

## Migration Notes

None. No schema change, no migration, no data backfill, no configuration change. Every phase is revertible by reverting its commits — Phase 1 is a pure extraction, Phases 2 and 3 are additive apart from two link insertions and one middleware array entry.

## References

- Research: `context/changes/mood-trope-recommendation/research.md`
- Roadmap slice S-05: `context/foundation/roadmap.md:135-145`
- Requirements: `context/foundation/prd.md` — US-01, FR-008, FR-009, FR-010, FR-011, and the ranking Non-Goal
- Closest existing implementation: `src/pages/books/index.astro`
- Picker pattern to adapt: `src/components/books/BookFilterBar.astro:65-117`
- All-match predicate to contrast with: `src/lib/book-filters.ts:59-77`
- Manual test conventions: `context/foundation/manual-testing.md`
- Native-HTML rule: `context/foundation/lessons.md:47-52`
- Seed fixtures: `supabase/seed.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Matching logic and shared description card

#### Automated

- [x] 1.1 Astro types regenerate cleanly
- [x] 1.2 Linting passes
- [x] 1.3 Production build passes

#### Manual

- [x] 1.4 TBR list still shows descriptions exactly as before

### Phase 2: The `/mood` screen, end to end

#### Automated

- [ ] 2.1 Astro types regenerate cleanly
- [ ] 2.2 Linting passes
- [ ] 2.3 Production build passes

#### Manual

- [ ] 2.4 Signed-out visitors are sent to sign in
- [ ] 2.5 Pick one trope and get matching books
- [ ] 2.6 No other account's books can appear
- [ ] 2.7 Ticking a fourth trope is refused, not silently trimmed
- [ ] 2.8 An empty TBR explains itself
- [ ] 2.9 A stale link shows the no-match message

### Phase 3: Showing more suggestions, and guardrail verification

#### Automated

- [ ] 3.1 Astro types regenerate cleanly
- [ ] 3.2 Linting passes
- [ ] 3.3 Production build passes

#### Manual

- [ ] 3.4 Ask for more suggestions without losing the first three
- [ ] 3.5 Repeating the same mood gives the same books
- [ ] 3.6 Picking a new mood goes back to three suggestions
- [ ] 3.7 Results arrive in under 2 seconds
- [ ] 3.8 The whole flow works with JavaScript turned off
