<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Critical-Path E2E Net and CI Gates

- **Plan**: `context/changes/testing-critical-path-e2e-net-gates/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-06
- **Verdict**: SOUND (after triage; original REVISE)
- **Findings**: 1 critical 2 warnings 1 observation
- **Note**: Phase 1 was already implemented at review time. Findings targeted remaining Phase 2–3 work plus Phase 1 drift. All findings were triaged and applied to the plan the same day. This file was written after triage (the review originally ran in chat only).

## Verdicts

| Dimension             | Verdict                          |
| --------------------- | -------------------------------- |
| End-State Alignment   | PASS                             |
| Lean Execution        | PASS                             |
| Architectural Fitness | PASS                             |
| Blind Spots           | FAIL (PASS after F1/F3/F4 fixes) |
| Plan Completeness     | WARNING (PASS after F2 fix)      |

## Grounding

Grounding: 12/13 paths ✓ (`tests/e2e/support.ts` was Phase 2 new), 5/5 symbols ✓, brief↔plan ✓

## Findings

### F1 — Helpers named against Playwright’s empty `request` fixture

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — E2e request helper
- **Detail**: Phase 2 told helpers to take the Playwright `request` fixture and POST with the signed-in cookie jar. In `@playwright/test` 1.63 that fixture is `playwright.request.newContext()` with no storageState and no shared browser cookies. Create/delete would run logged out (401, or a sign-in redirect). Form delete also needs an explicit Origin header or Astro `checkOrigin` returns 403. The 201 body is `{ book, duplicate }`, not a top-level id, and create requires at least one trope. `tests/e2e/seed.spec.ts` already did this right with `page.request`, Origin, `maxRedirects: 0`, and `body.book.id`.
- **Fix A ⭐ Recommended**: Helpers take `page.request` (or `context.request`)
  - Strength: Same cookie jar as the browser; matches the working seed.
  - Tradeoff: Helper needs a Page/BrowserContext, not a standalone request.
  - Confidence: HIGH — seed cleanup already uses this and expects 302/303.
  - Blind spot: None significant.
- **Fix B**: Build a dedicated APIRequestContext from `playwright/.auth/user.json`
  - Strength: Cleanup can run without a Page (afterAll / crashed-run sweep).
  - Tradeoff: Cookies can drift from the live page if the session refreshes.
  - Confidence: MEDIUM — storageState file is written once in setup, not updated.
  - Blind spot: Have not run a helper this way against this app’s cookies.
- **Decision**: FIXED via Fix A

### F2 — Seed file still present; Progress 1.2 is false

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 1 Progress 1.2; Phase 2 Changes Required
- **Detail**: Phase 1 contracted to delete `tests/e2e/seed.spec.ts` and set `"test:e2e": "playwright test"`. Progress 1.2 was checked. The file was still there (`@seed` tag); the script was `playwright test --grep-invert @seed`. Phase 2 said “replace the seed” but listed no delete step, so the implementer would leave a skipped spec that asserts title via `getByRole("paragraph")` — the structure oracle this net is meant to avoid — and keep a grep that can hide a future `@seed`-tagged case.
- **Fix A ⭐ Recommended**: In Phase 2, extract the working helper bits from seed, delete the file, drop `--grep-invert`, and do not copy the paragraph-role oracle.
  - Strength: Matches the original Phase 1 contract and S-07-safe oracles.
  - Tradeoff: Seed is no longer a skipped exemplar in-tree.
  - Confidence: HIGH — Phase 2 already writes `support.ts` + two specs.
  - Blind spot: None significant.
- **Fix B**: Keep seed skipped and document it as a non-CI exemplar
  - Strength: Preserves the hydration / Origin snippets in-repo.
  - Tradeoff: Grep-invert stays a footgun; paragraph oracle can be copied.
  - Confidence: MEDIUM — cookbook would have to warn “do not copy this file.”
  - Blind spot: Future authors still find seed via glob of `tests/e2e/*.spec.ts`.
- **Decision**: FIXED via Fix A

### F3 — Phase 2 omits island hydration waits Phase 1 already needed

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Critical-path journey and Save changes case
- **Detail**: Sign in is `client:load`; `auth.setup.ts` already retries fill until values stick. Add and Save are the same class of island. Seed waits with `toPass()` until the trope chip appears before clicking Add to TBR. Phase 2’s journey contract was fill → Enter → click, with no hydration wait. A naïve fill can fail to commit the unique trope, so the mood picker never lists it. Edit Save can likewise lose the new title if filled before hydration.
- **Fix**: Specify the seed/`auth.setup.ts` `toPass()` wait: tropes until the Remove-chip is visible; Title/Author until `.toHaveValue`; edit title the same way before Save changes.
- **Decision**: FIXED

### F4 — `getByText("Tropes")` also matches “Pick 1 to 3 tropes”

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Mood hop / Critical Implementation Details
- **Detail**: The mood picker summary is labelled **Tropes** (or **Tropes · N selected**). The same form has a paragraph “Pick 1 to 3 tropes”. A substring `getByText("Tropes")` is ambiguous. The checkbox accessible name is the trope string — that part of the plan is fine.
- **Fix**: Open the disclosure with a role locator on **Tropes** (regex `/^Tropes/` covers the count suffix); tick `getByRole("checkbox", { name: uniqueTrope })`.
- **Decision**: FIXED
