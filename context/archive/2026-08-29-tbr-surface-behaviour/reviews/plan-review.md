<!-- PLAN-REVIEW-REPORT -->

# Plan Review: TBR Surface Behaviour

- **Plan**: `context/changes/tbr-surface-behaviour/plan.md`
- **Mode**: Deep
- **Date**: 2026-08-30
- **Verdict**: REVISE → SOUND after fixes
- **Findings**: 1 critical, 2 warnings, 1 observation (4 fixed, 0 outstanding)

## Verdicts

| Dimension             | Verdict | After fixes |
| --------------------- | ------- | ----------- |
| End-State Alignment   | PASS    | PASS        |
| Lean Execution        | WARNING | PASS        |
| Architectural Fitness | PASS    | PASS        |
| Blind Spots           | FAIL    | PASS        |
| Plan Completeness     | WARNING | PASS        |

## Grounding

9/9 paths ✓, 7/7 symbols ✓, brief↔plan ✓, Progress↔Phase consistency ✓ (12 criteria, 12 checkboxes, no stray checkboxes in phase blocks).

Verified against code: all-match AND and case-insensitive title/author search (`src/lib/book-filters.ts:59-77`), the 26-trope cap and 300-code-point clamp (`:14`, `:9`), the empty and no-match sentences (`src/pages/books/index.astro:236`, `:247`), the `method="GET" action="/books"` filter form and the `/books?trope=fake-dating` clear-search destination (`src/components/books/BookFilterBar.astro:22`, `:18`, `:39`), `Delete permanently` (`src/components/books/DeleteBookModal.astro:63`), and `mergePendingTrope` being module-private in both island forms.

Checked and found safe: two integration files both sweeping user-D rows cannot interleave, because the integration project is pinned to `fileParallelism: false, maxWorkers: 1` (`vitest.config.ts:31-32`).

## Findings

### F1 — Phase 2's manual walk breaks Phase 2's own automated suite

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Manual Verification 2.5, steps 3 and 9
- **Detail**: Step 3 has the tester add four books to `user-d@example.test` through the browser; those titles carry no `[integration-test]` prefix. Step 9 deletes only the fifth throwaway book, and no step returns the account to empty. The plan's own `assertUserDHasOnlyReservedFixtures` guard throws whenever user D holds a non-prefixed title, so the next local `npm run test:integration` or `npm test` fails on a fixture-hygiene error unrelated to the product. CI is unaffected — `.github/workflows/ci.yml:22` runs a fresh `npx supabase start` per job and `supabase/seed.sql` gives user D no books — so this lands only on the owner's persistent local stack.
- **Fix A ⭐ Recommended**: Add teardown steps to the manual walk.
  - Strength: Keeps the strict guard, which is what makes the empty-state case trustworthy.
  - Tradeoff: Relies on the tester finishing the walk.
  - Confidence: HIGH — trigger condition verified against seed.sql and the plan's Migration Notes.
  - Blind spot: The guard's error text wasn't specified, so it might not name the remedy.
- **Fix B**: Point the manual walk at `user-c@example.test`.
  - Strength: Structurally impossible to poison the automated account.
  - Tradeoff: Only works if user C also starts empty — unverified.
  - Confidence: MEDIUM.
  - Blind spot: Splits "the test account" into two, which Phase 3's cookbook would need to explain.
- **Decision**: FIXED via Fix A — added steps 10 and 11 (delete every hand-added book, confirm the list is empty), a matching expected result, a "Why step 10 matters" note in plain language, and a stricter pass criterion. Also closed the blind spot by requiring the guard's error to name the offending titles and state the remedy.

### F2 — Filter-transport contract can't be met with the repo's tooling

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Changes Required #3, "Filter transport" bullets
- **Detail**: The contract asked the implementer to locate the filter form "without depending on attribute order" and to locate the Clear search link "by its accessible name" — both require parsing HTML into elements. The integration project runs `environment: "node"` (`vitest.config.ts:26`) with no parser in dependencies or devDependencies, and Key Discoveries directs the implementer away from a DOM parser. In the real markup `href` precedes `aria-label="Clear search"` (`BookFilterBar.astro:38-41`), so any single-string check is exactly the attribute-order dependence the plan forbids, while two separate checks can't prove the values share an element. `Clear filters` compounds this: it renders as an `<a href="/books">` when filters are active and as a look-alike disabled `<span>` when they aren't (`:128-147`).
- **Fix A ⭐ Recommended**: Restate the contract as decoupled substring checks and write down the limits.
  - Strength: Matches available tooling and the established `books-persistence.test.ts` style; still catches the regressions that matter.
  - Tradeoff: Weaker than the plan promised, so the promise must be stated honestly.
  - Confidence: HIGH — markup order and absent parser both confirmed.
  - Blind spot: Can't distinguish the active Clear-filters anchor from the disabled span.
- **Fix B**: Add `linkedom` as a devDependency and parse properly.
  - Strength: Delivers the contract as written.
  - Tradeoff: Adds a dependency and invites drift toward the DOM assertions this change forbids.
  - Confidence: MEDIUM — interaction with the type-aware lint config unverified.
- **Decision**: FIXED via Fix A — rewrote the four bullets as substring checks, documented both limits (value-present vs element-owned; active link vs disabled look-alike) with a requirement to comment them in the test, noted that `href="/books"` won't collide with `/books/new`, and carried the same caveat into the Phase 3 cookbook bullet.

### F3 — "Unfiltered" and "Clear filters" are the identical request

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: Phase 2 — required cases table
- **Detail**: "Unfiltered | `GET /books` | all four titles" and "Clear filters | `GET /books` with no query | all four titles" are the same request with the same expectations. The Clear-filters control is already covered by the transport case, which requires its destination to be the literal `/books` — precisely what the Unfiltered case loads.
- **Fix**: Drop the "Clear filters" row and note that the transport case plus Unfiltered already prove it.
- **Decision**: FIXED — row removed; added a sentence explaining why there is no separate Clear-filters case.

### F4 — No case asserts the list GET returned 200

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Changes Required #1 and the cases table
- **Detail**: The HTML GET helper is specified to leave status checks to callers, but no case or success criterion asks a caller to do it. `/books` is protected, so a stale session returns a 302 with an empty body. Every case carries a positive assertion so the suite would still fail, but the message would read as a missing book title rather than a lost sign-in.
- **Fix**: Require `expect(response.status).toBe(200)` on every list GET.
- **Decision**: FIXED — added a sentence above the cases table requiring the status assertion before any title or copy assertion, with the reason.

## Notes

The plan was unusually well-grounded: every file path, line reference, and behavioural claim spot-checked during this review held up against the code. The mood-versus-browse trope distinction (any-match OR vs all-match AND) is a real trap and the plan catches it explicitly.

Unrelated pre-existing issue observed during review, not introduced by this plan: a direct `tsc --noEmit` reports a type error at `tests/integration/support/local-services.ts:262` (`ChildProcessByStdio` not assignable to `ChildProcessWithoutNullStreams`). This does **not** block the plan — `npm run lint` was run during this review and exits 0 (15 `no-console` warnings, 0 errors), so Phase 1's criterion 1.3 and Phase 2's 2.3 are safe as written. Worth cleaning up separately.
