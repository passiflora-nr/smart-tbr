<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Mood-Trope Recommendation (S-05) Implementation Plan

- **Plan**: context/changes/mood-trope-recommendation/plan.md
- **Mode**: Deep
- **Date**: 2026-08-15
- **Verdict**: SOUND
- **Findings**: 0 critical 2 warnings 1 observation (all triaged — 3 fixed)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS |

## Grounding
8/8 existing paths ✓, 5 new files absent as claimed ✓, 7/7 symbols ✓, brief↔plan ✓

Existing paths verified: `src/components/books/BookList.astro`, `src/middleware.ts`, `src/pages/dashboard.astro`, `src/pages/books/index.astro`, `src/components/books/BookFilterBar.astro`, `src/lib/book-filters.ts`, `src/lib/book-schema.ts`, `src/lib/sort-books-for-browse.ts`. New files correctly absent: `src/lib/mood-selection.ts`, `src/components/books/BookDescription.astro`, `src/pages/mood.astro`, `src/components/books/MoodPicker.astro`, `src/components/books/MoodResultList.astro`.

Symbols confirmed: `collectTropeVocabulary`, `matchesBookFilters` (AND), `tropeListSchema`, `sortBooksForBrowse`, `PROTECTED_ROUTES`, `parseFilterTropes`, `DESCRIPTION_CLAMP_CHARS`. Line citations in the plan match the current files. Seed fixtures match every named manual-test expectation (User A 9 tropes and the 5-book expansion order; User B historical isolation; User C 25 books; User D empty). Progress section matches all three phases and every success-criteria item. `docs/reference/contract-surfaces.md` is not present — skipped.

## Findings

### F1 — Empty-selection branch can be implemented like `/books` and still pass every test

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — The mood page
- **Detail**: `/books` with no filters shows every book. `/mood` with no tropes selected must show the picker and no cards. `matchesAnyTrope(book, [])` is false for every row (empty intersection), so a filter-then-branch page — the `/books` shape — would render the no-match message on first visit. The opposite bug (`tropes.length === 0 || overlap`) would volunteer three books before anyone picks a mood. Phase 2 lists “nothing selected yet” as a branch but does not say what that branch renders, and no manual test covers the landing screen: 2.5 starts by ticking a trope, so either wrong implementation can ship green.
- **Fix**: In the Phase 2 mood-page contract, require this order: empty selection is checked before matching, and that branch renders the picker only — no result cards, no no-match copy. Add one landing-state check to 2.5 (or a short extra manual item): signed in with books, open `/mood` with no tropes ticked, confirm the picker is there and no books are listed yet.
- **Decision**: FIXED — landing-state contract + step 2 in manual test 2.5

### F2 — Empty-TBR contract omits the Add-a-book link that test 2.8 requires

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — The mood page / 2.8
- **Detail**: The Phase 2 contract specifies the US-01 copy (“Add a book to your TBR first”) but not a link. Manual test 2.8 requires “a way to go add one.” `/books` already pairs its empty copy with an “Add your first book” link to `/books/new`. An implementer following only the Contract can omit the link and fail 2.8.
- **Fix**: State in the Phase 2 empty-TBR branch that the message is paired with a link to `/books/new`, matching the existing empty-TBR pattern on `/books`.
- **Decision**: FIXED — empty-TBR contract now requires `/books/new` link

### F3 — Helper contracts leave encoding, schema reuse, and expansion return shape to guesswork

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Mood selection module / Phase 3 — Expansion helper
- **Detail**: Three small holes in otherwise precise helper contracts. (1) Current State says to “mirror” `tropeListSchema` for the 1–3 cap, but that schema allows up to 25 tropes — reusing it would treat 4–25 as `ok`. Phase 1 does say the module owns the 1–3 cap, so this is a wording trap, not a missing rule. (2) `buildMoodHref` does not say to use `URLSearchParams` the way `buildBooksHref` does; several seed tropes contain spaces (`slow burn`, `found family`), and the Phase 3 “Show me 3 more” link is the place a string-concat href would break. (3) `takeMoodMatches` is specified as “the leading slice … total … next count … or an indication that everything is already shown” without a concrete return shape.
- **Fix**: Spell out a new max-3 zod schema (do not import `tropeListSchema`); build hrefs with `URLSearchParams` like `buildBooksHref`; and give `takeMoodMatches` an explicit return shape such as `{ visible, total, nextShow: number | null }`.
- **Decision**: FIXED — max-3 schema, URLSearchParams hrefs, and explicit `takeMoodMatches` return shape added to plan
