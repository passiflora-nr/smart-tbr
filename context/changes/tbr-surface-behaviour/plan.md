# TBR Surface Behaviour Implementation Plan

## Overview

Add the missing automated net for test-plan Phase 2: prove Your TBR search, trope filters, clears, add, edit, and delete change the **set of books**, primarily by asserting titles and the empty / no-match sentences. For native filter controls, assert only behaviour-bearing form and link attributes — never visual markup — so the suite still protects behaviour after the S-07 theme rewrite.

## Current State Analysis

Phase 1 proves add/edit persistence at the API and an independent Supabase read-back, plus mood HTML titles. There is no `GET /books` test. `src/lib/book-filters.ts` is a pure module with no unit tests.

Filter state lives only in the URL (`q`, repeated `trope`). The browse page parses it in frontmatter, fetches every owned row, then applies `matchesBookFilters`. Delete is a form POST that redirects; add and edit save are React islands (`client:load`) that talk JSON — integration can still prove their **data path** (POST/PUT, then `GET /books`) without clicking Save.

Mood uses the same `trope` query key with **any-match OR**. Browse is **all-match AND**. Copying mood fixtures or helpers would green-light the wrong rule.

## Desired End State

- A unit suite locks FR-012 parse + match (title/author substring, all-match tropes, combined AND, stale → zero, 26-cap, description not searched).
- An integration suite, signed in as user D, seeds a few `[integration-test]` books and asserts which titles appear or disappear on `GET /books` for search, tropes, combined AND, both clears, empty vs no-match, add→list, edit→list, and delete→title gone. One filtered response also proves the native GET form and both clear links emit the required filter transport.
- Cookbook §6.6 tells the next author how to add a list-surface test without asserting layout.
- You can walk search, tropes, clears, and delete on Your TBR with JavaScript turned off and see the same set changes.

### Key Discoveries:

- `src/pages/books/index.astro:45-46` and `:110-113` — page parses the URL, then filters in process. Unit tests on the matcher do not prove the page still calls it; HTTP smokes must.
- `src/lib/book-filters.ts:59-77` — all-match AND, case-insensitive `q` on title or author only.
- `tests/integration/support/http-session.ts:62-75` — `postFormWithManualRedirect` cannot repeat `trope`. This plan does **not** need that: delete proof is an independent `GET /books`, so leave the helper unchanged.
- `tests/integration/books-persistence.test.ts:132-152` — the only HTML fetch today is `/mood` (inline `fetch` + `toContain(title)`). Reuse that assertion style, not a DOM parser.
- Flash `?notice=deleted` is consumed by a cookie + redirect (`index.astro:48-69`). Do not follow that hop; it is not this plan's delete oracle.
- Archived search-filter _research_ inferred any-match; the _plan_ and live code are all-match. Oracle is FR-012 + `context/archive/2026-08-14-search-filter-tbr/plan.md`, not mood and not that research inference.

## What We're NOT Doing

- Product behaviour changes (no feature work on `/books` or the APIs).
- Re-proving Phase 1 raw POST/PUT storage read-back or "edit one field, siblings intact."
- Island Save / Add-to-TBR button clicks (Phase 4 e2e).
- Ownership, forged-origin delete, or route gating (Phase 3).
- Sort or pagination tests (no user controls on Your TBR).
- Asserting CSS classes, DOM structure, element counts, `(N of M)` heading counts, snapshots, or visual filter-bar markup. Phase 2 may inspect only the filter form's method/action/field names and the two clear-link destinations.
- Asserting the "Book deleted." flash sentence or the failed-load sentence.
- `GET /books/{id}/edit` page HTML (Save is island-only).
- Extending `postFormWithManualRedirect` for repeated fields, or following the flash-cookie redirect.
- Unit tests for `serializeBookFilters`, `buildBooksHref`, `buildEditHref`, or `collectTropeVocabulary` (those would either become a circular oracle or assert filter-bar UI).
- Exporting or testing `mergePendingTrope`.

## Implementation Approach

Three phases, cheapest layer first:

1. Unit-test `parseBookFilters` + `matchesBookFilters` with expected sets spelled in the test, imported via `@/lib/book-filters`.
2. Add thin HTTP helpers, then one integration file that seeds a four-book fixture and drives the agreed `GET /books` cases. Build query strings with `URLSearchParams.append("trope", …)` — never with `serializeBookFilters`.
3. Replace cookbook §6.6 TBD with the pattern that actually shipped.

## Critical Implementation Details

**Oracle vs implementation.** Construct `GET /books?q=…&trope=…` by hand (`append` for each trope). Using `serializeBookFilters` / `buildBooksHref` to build the request would hide a broken serializer: the test would send the same wrong URL the page understands.

**Two `trope` languages.** Browse tests must never import mood helpers or copy mood any-match expectations. A book that shares _one_ of two selected tropes must be **absent** on Your TBR and would be **present** on Pick by mood.

**Delete and flash.** POST delete (existing empty-body helper is enough), then a **new** `GET /books` with the same session cookie. Assert the deleted title is gone. Do not `redirect: "follow"` the 302 and do not assert notice copy.

**Empty list is all of user D's rows.** `GET /books` renders every owned book, not only prefixed fixtures. Before the empty-state case: if user D has any title that does not start with `[integration-test]`, fail with a clear "user D must stay fixture-only" error. Then clean prefixed rows and expect the empty sentence.

**Shared seed vs empty.** Do not put the four-book library in `beforeAll` and also expect empty. Seed per case (or in cases that need books) and `finally`-clean the run prefix. The empty case runs against zero owned rows.

**Edit PUT body.** Omit `description` and the schema writes `null`. Always send the four fields, same as Phase 1.

## Phase 1: Browse-filter unit suite

### Overview

Lock the FR-012 matching **rule** in Node so AND / stale / 26-cap / "description is not searched" do not require Docker. This phase does not prove the browse page still calls the matcher.

**Behaviour asserted:** parse + match decisions from FR-012 (all-match AND, case-insensitive title/author `q`).
**Regression caught:** a matcher rewrite that switches browse to mood's any-match OR, or that starts searching description.
**Research source:** `research.md` Matching contract; test-plan §6.1; `context/archive/2026-08-14-search-filter-tbr/plan.md`.
**Boundary cases:** stale trope → no match; 27th trope dropped at parse (cap 26); `q` clamped to 300 code points; exact trope strings (no case fold).
**Anti-pattern avoided:** copying expected results out of `matchesBookFilters` internals; reusing `mood-selection` fixtures.

### Changes Required:

#### 1. Unit suite for parse + match

**File**: `tests/unit/book-filters.test.ts` (new)

**Intent**: Prove the browse filter rule independently of HTTP, in the same style as `tests/unit/mood-selection.test.ts` (named `describe` per function, `it.each` tables, `@/*` imports).

**Contract**: Import only from `@/lib/book-filters`. Build `URLSearchParams` with `append` for repeated `trope` (same pattern as `tropesParams` in `mood-selection.test.ts`). Spell expected `BookFilters` and boolean match results in the table — do not call the function under test to compute the expected value.

Cover at least:

| Area           | Input                                     | Expected                   |
| -------------- | ----------------------------------------- | -------------------------- |
| parse `q`      | missing / blank                           | `q === ""`                 |
| parse `q`      | leading/trailing spaces                   | trimmed                    |
| parse `q`      | more than 300 code points                 | first 300 kept             |
| parse tropes   | empties and duplicates                    | dropped; first-seen order  |
| parse tropes   | 27 distinct values                        | first 26 kept              |
| match          | empty filters                             | every book matches         |
| match `q`      | case-different title or author substring  | match                      |
| match `q`      | text only in description                  | no match                   |
| match tropes   | one exact trope                           | match; wrong case does not |
| match tropes   | two tropes                                | book must include **both** |
| match combined | title hits `q` but lacks a selected trope | no match                   |
| match stale    | filter trope the book does not have       | no match                   |

Do not add cases for serialize/href/vocabulary helpers.

### Success Criteria:

#### Automated Verification:

- Focused unit suite passes: `npm run test:unit`
- New file lives at `tests/unit/book-filters.test.ts` and is picked up by the unit project
- Type-aware lint passes: `npm run lint`

#### Manual Verification:

None this phase — no screens change. The JavaScript-off walk is Phase 2.

**Implementation Note**: After automated verification passes, pause before Phase 2. Phase 2 needs Docker (local Supabase + Astro).

---

## Phase 2: TBR surface integration

### Overview

Prove the Your TBR **page** applies filters and shows the persisted add/edit/delete result. Helpers stay thin; cases assert titles and two fixed sentences, plus one narrow transport-contract check for the native filter form and clear links.

**Behaviour asserted:** the set of book titles (or empty / no-match copy) after each control.
**Regression caught:** Apply filters / Clear search / Clear filters emitting the wrong request; delete changing no rows; add or edit succeeding in the API but not showing on the list; browse combining text and tropes with OR.
**Research source:** `research.md` Controls table, page states, Architecture Insights 3–6.
**Boundary cases:** empty vs no-match; combined `q` AND tropes; Clear search keeps tropes; user-D hygiene before empty.
**Anti-pattern avoided:** CSS/DOM structure/element counts; flash-cookie hop; `serializeBookFilters` as the request or expected-link builder; duplicating Phase 1 storage assertions.

### Changes Required:

#### 1. Authed HTML GET helper

**File**: `tests/integration/support/http-session.ts`

**Intent**: Stop pasting raw `fetch` + `.text()` in every browse case, matching how `fetchUnknownJson` already centralizes JSON.

**Contract**: Export a function that GETs a URL with the session `Cookie` header and `redirect: "manual"`, and returns the `Response` plus the body string. It must not parse HTML, follow redirects, or assert status — callers do that.

#### 2. Create-via-API helper

**File**: `tests/integration/support/test-books.ts`

**Intent**: Seed several user-D books without pasting the Phase 1 POST + split-brain block into every case.

**Contract**: POST `/api/books` through the existing JSON helper, require `201` and `isBookMutationSuccess`, read the row back on the verification client, and on a missed local read delete through the Astro session and throw the same split-brain error Phase 1 uses. Always send `title`, `author`, `description`, and `tropes`. Titles must be accepted only when they start with the reserved `[integration-test]` prefix (reuse `assertReservedTitlePrefix` or equivalent). Return the created id and book payload. Do not change `deleteBookViaAstroForm` or `postFormWithManualRedirect`.

Also export `assertUserDHasOnlyReservedFixtures(client)`. It must select every user-D title, find any that do not start with `[integration-test]`, and throw a clear fixture-hygiene error before cleanup deletes anything. This guard must never delete a non-prefixed row. The error text must name the offending titles and state the remedy in plain language — sign in as user D and delete those books — because the likeliest way to reach this state is finishing the Phase 2 manual walk without its tidy-up step.

#### 3. Browse surface cases

**File**: `tests/integration/books-surface.test.ts` (new)

**Intent**: One integration file that signs in as user D once, uses a run-scoped title prefix, and proves each agreed control by titles or copy.

**Contract**: Follow `books-persistence.test.ts` for `inject`, `signInWithForm`, `beforeAll` sweep of the reserved prefix, `afterAll` cleanup, and per-case `finally`. Use the new HTML helper and create helper. Before the empty-state cleanup, call `assertUserDHasOnlyReservedFixtures`; only after that guard passes may the case remove reserved-prefix rows and request the empty page. Build list URLs as `${astroBaseUrl}/books` plus a hand-built query (`append` for each `trope`). Assert `toContain` / not `toContain` on **full titles** and these copy prefixes:

- empty: `Your TBR is empty — add your first book to get started.`
- no-match: `No books match your`

On one populated response to `GET /books?q=Alpha&trope=fake-dating`, also inspect only the controls' behaviour-bearing HTML:

- the response contains `method="GET"` and `action="/books"`;
- it contains a control named `q` and a control named `trope`;
- it contains the **Clear search** accessible name and the literal destination `href="/books?trope=fake-dating"`;
- it contains the **Clear filters** label and the literal destination `href="/books"`.

These are substring checks on the response text, not element lookups. The integration project runs in `node` with no HTML parser available, and this change does not add one — so assert the strings and accept the limits rather than reaching for a regex that encodes attribute order. Record the two known limits in the test as a short comment, because Phase 3 must repeat them in the cookbook:

1. A passing check proves each value is present somewhere on the page, not that the destination and the label belong to the same element.
2. `Clear filters` renders as a link when filters are active and as a look-alike disabled element when they are not; a substring check cannot tell them apart. Running this case only against a filtered response is what keeps it meaningful.

Include the closing quote in every `href=` string. `href="/books"` will not collide with the `Add a book` link on the same page, whose destination is `/books/new`.

Write the expected destinations in the test; do not call `serializeBookFilters` or `buildBooksHref` to compute them. Do not assert heading counts, visual markup, element counts, checkbox state, classes, or snapshots.

There is no separate Clear-filters case. Its destination is the bare `/books`, which the Unfiltered case already loads and asserts — a second identical request would add a case without adding coverage.

**Four-book fixture** (each title starts with the run prefix). Tropes must be exact strings, distinct from mood's "any one overlapping trope" idea:

| Role        | Title token   | Author  | Tropes                             |
| ----------- | ------------- | ------- | ---------------------------------- |
| Both        | `Alpha River` | `Smith` | `enemies-to-lovers`, `fake-dating` |
| Search-only | `Alpha Woods` | `Jones` | `enemies-to-lovers`                |
| Trope-only  | `Beta Harbor` | `Smith` | `fake-dating`                      |
| Neither     | `Gamma Vale`  | `Lee`   | `grumpy-sunshine`                  |

Every `GET /books` in the table below must assert `status === 200` before asserting on titles or copy. `/books` is a protected route, so a stale session returns a 302 with an empty body; without the status check the failure reads as a missing book title instead of a lost sign-in.

Required cases (separate `it`s or an equivalent table — each must clean up):

| Case             | Request                                                                         | Must appear                                                                                               | Must not appear                                                                |
| ---------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Empty            | `GET /books` after hygiene + prefix clean                                       | empty sentence                                                                                            | any fixture title                                                              |
| No-match         | `GET /books?q={prefix}no-such-book` with the four books seeded                  | `No books match your`                                                                                     | the four titles                                                                |
| Unfiltered       | `GET /books`                                                                    | all four titles                                                                                           | —                                                                              |
| Search           | `GET /books?q=Alpha`                                                            | Alpha River, Alpha Woods                                                                                  | Beta Harbor, Gamma Vale                                                        |
| Trope AND        | `GET /books` with `trope=enemies-to-lovers` and `trope=fake-dating`             | Alpha River                                                                                               | the other three                                                                |
| Combined AND     | `GET /books?q=Alpha` plus `trope=fake-dating`                                   | Alpha River                                                                                               | Alpha Woods (title hits, missing trope), Beta Harbor (trope hits, missing `q`) |
| Clear search     | `GET /books` with only `trope=fake-dating` (q dropped, the selected trope kept) | Alpha River, Beta Harbor                                                                                  | Alpha Woods, Gamma Vale                                                        |
| Filter transport | Inspect the populated response for `q=Alpha` plus `trope=fake-dating`           | GET `/books` form with `q` / `trope`; Clear search → `/books?trope=fake-dating`; Clear filters → `/books` | CSS, layout, counts, or snapshots                                              |
| Add→list         | POST create, then `GET /books`                                                  | new title                                                                                                 | —                                                                              |
| Edit→list        | PUT a new title (send all four fields), then `GET /books`                       | new title                                                                                                 | old title                                                                      |
| Delete→list      | `deleteBookViaAstroForm`, then `GET /books`                                     | sibling titles                                                                                            | deleted title                                                                  |

Add→list / edit→list / delete→list may use one extra book instead of the four-book grid; they must still use the run prefix and `finally` cleanup. Do not assert redirect status as the only delete proof.

### Success Criteria:

#### Automated Verification:

- Focused integration suite passes: `npm run test:integration`
- Full gate passes: `npm test`
- Type-aware lint passes: `npm run lint`
- Existing `books-persistence` cases still pass (helpers stay backward compatible)

#### Manual Verification:

**2.5 — Empty list, then filters, clears, and delete with JavaScript off**

Your TBR = the signed-in book list at `/books`.

**Setup:** Local app running (`npm run dev`). Use `user-d@example.test` / `password123` (this account should start with no books). You will turn JavaScript **off** for most steps. Add Book and Save need JavaScript — turn it **on** only for the add steps below, then off again.

**Steps:**

1. Turn JavaScript off. Sign in if needed. Open **Your TBR**.
2. Confirm the page says your list is empty and invites you to add a first book. You should not see search or trope filters yet.
3. Turn JavaScript on. Add four books you can recognise, with titles and tropes matching the idea of the table above (one book with both tropes, one with only the first trope and a shared word in the title, one with only the second trope, one with neither). Return to **Your TBR** and confirm all four titles are visible. Turn JavaScript off again.
4. In **Search title or author**, type the shared title word (e.g. `Alpha`). Choose **Apply filters**.
5. Open **Tropes**, tick only the trope shared by the "both" and "trope-only" books (e.g. `fake-dating`), then choose **Apply filters**.
6. Choose the **Clear search** control (the X in the search box). Leave the selected trope as it is.
7. Open **Tropes**, tick the other trope from the "both" book as well, then choose **Apply filters**.
8. Choose **Clear filters**.
9. Turn JavaScript on only if you still need to add a fifth throwaway book you are willing to delete. Turn JavaScript off. Open that book's delete confirm and choose **Delete permanently**.
10. **Tidy up — do not skip this.** Delete every remaining book you added during this walk, one at a time, using the same delete confirm and **Delete permanently**.
11. Reload **Your TBR** and check the list is empty again.

**Expected:**

- Step 2: empty sentence; no book titles.
- Step 4: only the two titles that contain that word remain.
- Step 5: only the "both" book remains because it is the only book that has the search word and the selected trope.
- Step 6: the search is cleared but the trope stays selected, so the "trope-only" book comes back alongside the "both" book.
- Step 7: only the book with **both** selected tropes remains; books with just one of them stay gone.
- Step 8: all four (or five) titles are visible again.
- Step 9: the deleted title is gone; the others remain. You do not need to look for a "Book deleted." banner.
- Step 11: the same empty sentence you saw at step 2, and no book titles.

**Pass if:** Each step changes which titles you see as described, with JavaScript off for search, tropes, both clears, and delete — **and the list is empty again at the end**.

**Why step 10 matters:** the automated tests refuse to run if this account is holding any book they did not create themselves. If you leave your hand-added books behind, the next test run stops with a housekeeping complaint instead of testing anything. Signing in and deleting them fixes it.

**Implementation Note**: After automated verification passes, pause here for the human to finish the JavaScript-off walk before Phase 3.

---

## Phase 3: Cookbook §6.6

### Overview

Replace the Phase 2 placeholder in the test plan with the pattern this change actually shipped, so the next list-surface test does not rediscover title-vs-markup or mood-vs-browse `trope` rules.

### Changes Required:

#### 1. Fill cookbook §6.6

**File**: `context/foundation/test-plan.md`

**Intent**: §6.6 is the waiting recipe for "a control on a list surface." Write down what Phase 1–2 of this change established.

**Contract**: Replace the TBD block under `### 6.6 Adding a test for a control on a list surface` with concrete bullets that state:

- Unit tests for the browse-filter **rule** live in `tests/unit/`, import `@/lib/book-filters`, and take expected results from FR-012 (all-match AND, case-insensitive title/author). They do not replace a page GET.
- Integration tests for wiring live in `tests/integration/`, sign in as user D, use the reserved title prefix, and assert titles or the empty / no-match sentences after `GET /books`.
- Build `q` / repeated `trope` query strings by hand; do not use the product serializer as the test oracle; do not reuse mood any-match helpers.
- For a native filter control, check only behaviour-bearing method/action/name/href values and write expected URLs literally. These are substring checks — there is no HTML parser in the suite — so they prove a value is on the page, not which control owns it; say so, and run them against a state where the control is actually active. Do not assert CSS, DOM structure, element counts, heading `(N of M)`, snapshots, checkbox state, or flash-notice text.
- Browse/filter/delete are server HTML — a raw HTTP GET is the JavaScript-off check. Island Save / Add stay Phase 4.
- Point at `lessons.md` (native HTML on the list) and this change's helpers (`fetch` HTML + create-via-API) by behaviour, not as a second copy of §6.2.

Do not rewrite §1–§5 strategy. Bump **Last updated** if the file's own header expects it. Leave §3 Phase 2 **Status** to the test-plan orchestrator / archive step.

### Success Criteria:

#### Automated Verification:

- `context/foundation/test-plan.md` §6.6 no longer says TBD
- Markdown format passes if staged: Prettier on `*.md`

#### Manual Verification:

**3.3 — Cookbook tells you what a new list check may look at**

**Setup:** Open the Test Plan and find the section "Adding a test for a control on a list surface."

**Steps:**

1. Read the bullets once.
2. Ask: if someone adds a check for a new button on Your TBR, does the section say to look at **which book titles remain**, not at colours or layout?
3. Ask: does it warn that Your TBR tropes mean "has every selected trope," which is the opposite of Pick by mood?

**Expected:** Both answers are yes, in plain language.

**Pass if:** You could hand the section to someone else and they would know not to snapshot the page or copy a mood test.

**Implementation Note**: This is the final phase. After automated checks pass, pause for the human to confirm the cookbook read.

---

## Testing Strategy

### Unit Tests:

- `parseBookFilters` and `matchesBookFilters` only, with FR-012 expected values in the test table.
- Edges: case-fold `q`, description miss, exact tropes, AND, stale, 26-cap, 300-code-point clamp.

### Integration Tests:

- `GET /books` title/copy cases listed in Phase 2.
- One filtered response proves the native GET form field names and both clear-link destinations without asserting visual markup.
- Reuse user-D namespacing, prefix cleanup, and split-brain create from Phase 1.
- Do not add `/mood` cases or a second persistence read-back.

### Manual Testing Steps:

Covered in Phase 2 (JavaScript-off Your TBR) and Phase 3 (cookbook read). Phase 1 has no browser walk.

## Performance Considerations

The browse page already loads every owned row. Tests seed a handful of prefixed books only. No new performance budget.

## Migration Notes

No schema or data migration. User D must remain the fixture-only mutation account; leftover non-prefixed rows fail the empty-state case on purpose.

## References

- Related research: `context/changes/tbr-surface-behaviour/research.md`
- Test plan Phase 2 and cookbook: `context/foundation/test-plan.md`
- Matching oracle: `context/archive/2026-08-14-search-filter-tbr/plan.md`
- Phase 1 harness pattern: `context/archive/2026-08-23-testing-harness-and-data-integrity/plan.md`
- Manual steps format: `context/foundation/manual-testing.md`
- List surfaces: `context/foundation/lessons.md` (prefer native HTML; verify with JavaScript disabled)
- Existing HTML fetch: `tests/integration/books-persistence.test.ts:132-152`
- Matcher: `src/lib/book-filters.ts:48-77`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Browse-filter unit suite

#### Automated

- [x] 1.1 Focused unit suite passes: `npm run test:unit`
- [x] 1.2 New file lives at `tests/unit/book-filters.test.ts` and is picked up by the unit project
- [x] 1.3 Type-aware lint passes: `npm run lint`

### Phase 2: TBR surface integration

#### Automated

- [ ] 2.1 Focused integration suite passes: `npm run test:integration`
- [ ] 2.2 Full gate passes: `npm test`
- [ ] 2.3 Type-aware lint passes: `npm run lint`
- [ ] 2.4 Existing `books-persistence` cases still pass (helpers stay backward compatible)

#### Manual

- [ ] 2.5 Empty list, then filters, clears, and delete with JavaScript off

### Phase 3: Cookbook §6.6

#### Automated

- [ ] 3.1 `context/foundation/test-plan.md` §6.6 no longer says TBD
- [ ] 3.2 Markdown format passes if staged: Prettier on `*.md`

#### Manual

- [ ] 3.3 Cookbook tells you what a new list check may look at
