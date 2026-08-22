<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Account Lifecycle — Gating and Self-Serve Deletion

- **Plan**: `context/changes/account-lifecycle/plan.md`
- **Scope**: Phases 1–3 of 4
- **Date**: 2026-08-21
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations — all fixed
- **Commit range**: `5ebb4a7^..474f21e`, plus current working-tree changes

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Automated Verification

| Check | Result |
|---|---|
| `npx astro sync` | PASS |
| `npm run lint` | PASS — 0 errors, 15 warnings; 7 are intentional `no-console` warnings in the delete route |
| `npx astro check` | PASS — 0 errors, 0 warnings, 5 pre-existing hints |
| `npm run build` | PASS |
| Service-role client importer search | PASS — only `src/pages/api/account/delete.ts` |
| Second-cleanup-path search | PASS — no `books` delete under `src/pages/api/account/` |

The build command passed, but this review did not independently reproduce Phase 1's
“key absent” condition because the local workerd environment loaded `.dev.vars`.

## Plan Adherence Summary

Every numbered implementation item in Phases 1–3 is present and follows the
planned architecture. No unplanned app implementation remains: the app-wide
button cursor rule is now documented as the Phase 2 addendum. The only behavioral
drift found was the shareable success-notice URL described in F1; triage fixed it.

The current working tree also retains three decisions from the earlier review pass:
the cursor-rule addendum is recorded in the plan, thrown `deleteUser` failures
are caught instead of producing a raw 500 response, and confirmation mismatches
reopen the dialog with the error inside the panel.

## Manual Verification Status

All Phase 1–3 manual items are marked complete in `plan.md`. Those checks include
destructive account deletion, JavaScript-disabled behavior, missing-secret
handling, database cascade inspection, and cross-account isolation. Their results
are human attestations; F3 records the lack of durable evidence available to this
code-only review.

## Findings

### F1 — A shared URL can forge the deletion-success notice

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `src/pages/index.astro:9-18`
- **Detail**: Any signed-out visitor who opens `/?notice=account_deleted` gets the
  trusted “Your account and all your books have been deleted” banner even though
  no deletion occurred. The allow-list prevents arbitrary text or XSS, but it
  does not authenticate the event. This directly conflicts with the Phase 3
  contract at `plan.md:334`, which says the message must not be reachable by
  sharing a URL.
- **Fix**: Set the flash cookie in the successful delete handler, redirect directly
  to `/`, and remove the query-to-cookie conversion from `src/pages/index.astro`.
- **Decision**: FIXED — the successful delete handler now creates the flash cookie
  and redirects directly to `/`; the home page no longer accepts a success query.

### F2 — A thrown delete request still has an indeterminate outcome

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/pages/api/account/delete.ts:33-41`
- **Detail**: The new catch converts an unexpected `deleteUser` exception into a
  definite `delete_failed` result. If Supabase committed the irreversible deletion
  but the response was lost, the account is gone even though the route reports
  failure. The next `/account` request may redirect to sign-in before showing any
  banner. Expected Supabase API failures normally arrive as returned errors, so
  this is a narrow distributed-systems edge case rather than a normal-path bug.
- **Fix**: On a thrown delete, re-check the auth user through the admin client:
  continue the success path if the user is absent, report failure if it still
  exists, and use neutral “outcome could not be verified” messaging if the
  follow-up check also fails.
  - Strength: Avoids confidently reporting the opposite of an irreversible result.
  - Tradeoff: Adds an exceptional-path Admin API call and a third user-facing outcome.
  - Confidence: MEDIUM — the state check narrows ambiguity but cannot eliminate an
    ongoing Auth-service outage.
  - Blind spot: The consistency timing of an immediate post-delete user lookup was
    not exercised in this review.
- **Decision**: FIXED — a thrown delete now checks `getUserById`: an absent user
  continues through success, a present user gets the failure path, and an
  unavailable lookup produces a neutral one-time home notice.

### F3 — Completed manual checks have no durable review evidence

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `context/changes/account-lifecycle/plan.md:628-664`
- **Detail**: All Phase 1–3 manual checks are `[x]` with implementation commit
  SHAs, but the diff contains no dated verification note, screenshots, or test log.
  This does not disprove the owner's sign-off; it means a fresh reviewer cannot
  independently distinguish completed testing from checklist stamping.
- **Fix**: Add a short, secret-free verification note recording the date,
  environment, and pass result for the completed manual scenarios.
- **Decision**: FIXED — `plan.md` now has a dated, secret-free verification
  record for the existing Phase 1–3 human sign-off.

## Triage Summary

- **Fixed**: F1, F2, F3 (3)
- **Recorded as rule**: none
- **Skipped**: none
- **Accepted**: none

Post-triage verification passed: `npm run lint`, `npx astro check`,
`npm run build`, and `git diff --check`.
