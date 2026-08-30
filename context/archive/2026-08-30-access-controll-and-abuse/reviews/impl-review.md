<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Access Control and Abuse Test Coverage

- **Plan**: context/changes/access-controll-and-abuse/plan.md
- **Scope**: Phase 1–2 of 2
- **Date**: 2026-08-30
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 2 warnings 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

## Findings

### F1 — Optional Origin defaults to the abuse case

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: tests/integration/support/http-session.ts:78
- **Detail**: `postFormWithManualRedirect` takes `origin?: string` and omits the Origin header unless a value is supplied. That matches the plan and the access-control call sites are correct (matching origin for signed-out and wrong-owner deletes; `https://evil.example` for hostile; omitted only for missing-Origin). The default is still the 403 abuse case. A later happy-path form test that copies `postFormWithManualRedirect(url, fields, cookie)` and forgets the fourth argument will get 403 instead of a handler result. That fails loudly in cleanup, but a new “CSRF” test could pass for the wrong reason (forgotten origin vs a real hostile origin).
- **Fix A ⭐ Recommended**: Change the argument to `origin: string | null` so every caller must choose matching, hostile, or omit.
  - Strength: Removes the silent default; current call sites already pass a value or omit on purpose and are easy to update.
  - Tradeoff: Breaks the “optional argument” shape the plan specified; every existing caller must be touched.
  - Confidence: HIGH — only `deleteBookViaAstroForm` and the access-control suite call this helper.
  - Blind spot: Have not searched for ad-hoc `fetch` form posts that bypass the helper.
- **Fix B**: Keep the optional argument and rely on the cookbook note in test-plan §6.4.
  - Strength: No code change; §6.4 already says Origin is set only when supplied.
  - Tradeoff: The footgun stays in the helper signature; cookbook text is easy to miss.
  - Confidence: MEDIUM — current suite is correct, but the next form test is the risk.
  - Blind spot: Whether future agents will read §6.4 before copying the helper.
- **Decision**: FIXED via Fix A

### F2 — `npm test` refuses to start when `.dev.vars` has a service-role key

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: tests/integration/support/local-coordinates.ts:54
- **Detail**: The Phase 1 guard works as planned: a present, non-empty `SUPABASE_SERVICE_ROLE_KEY` in `.dev.vars` throws before Astro starts. This review re-run of `npm run test:integration -- tests/integration/access-control.test.ts` and `npm test` both failed with that error. Because the throw happens in integration global setup, Vitest aborts the whole `npm test` process — unit tests never run either (`No test files found`). `npm run test:unit` still passes. CI has no `.dev.vars`, so the land-time SHAs on 1.2/1.3 remain plausible. An unplanned note at `tests/integration/known-issue-dev-vars-service-role-key.md` already records this and points at a harness-owned `.dev.vars` fix. A follow-up change folder `dev-vars-service-role-isolation` is already open. The owner previously rejected “comment out your key” as the permanent workflow; the current guard is that ritual.
- **Fix A ⭐ Recommended**: Keep the fail-closed guard and finish the already-opened harness-owned `.dev.vars` follow-up. Do not weaken this change’s canary.
  - Strength: Account-delete cannot destroy user D while the leak exists; the real fix is already scoped elsewhere.
  - Tradeoff: Local `npm test` stays blocked on a typical developer machine until the follow-up lands.
  - Confidence: HIGH — this review just reproduced the refusal; the known-issue note already recommends the harness fix.
  - Blind spot: Have not inspected the follow-up research for a different chosen design.
- **Fix B**: Weaken the account-delete origin cases (wrong confirmation word) so a skipped origin check cannot delete user D, then drop the startup refusal.
  - Strength: Local `npm test` works with a normal `.dev.vars`.
  - Tradeoff: The canary no longer proves “forged delete was stopped before the handler.”
  - Confidence: MEDIUM — the known-issue note lists this as a weaker alternative.
  - Blind spot: Whether any other test path still needs the empty service-role pin.
- **Decision**: ACCEPTED — owner removed the service-role key from local files, dropped the follow-up change, and kept the fail-closed guard. `npm test` now passes (7 files, 117 tests).

### F3 — Victim cleanup is `afterAll` only, not `finally`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: tests/integration/access-control.test.ts:72
- **Detail**: The plan required cleanup in `finally` and `afterAll`. The suite creates one shared victim in `beforeAll` and deletes it in `afterAll` (plus prefix pre-clean). That matches a shared read-only victim better than the persistence suite’s per-`it` `try/finally`. Vitest still runs `afterAll` when tests fail; the next run’s prefix cleanup covers a killed process. User-A seeds are never touched.
- **Fix**: Leave the suite-level `afterAll`. Add a `try/finally` around `createBookViaApi` in `beforeAll` only if a later test starts creating extra rows inside an `it`.
- **Decision**: FIXED — added try/finally around book creation in beforeAll; afterAll still cleans the shared victim on success.

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/protected-routes.ts:1
- **Detail**: The JSDoc says “keep in sync with `src/middleware.ts`.” Middleware now imports this array; tests do too. A later agent could put a private list back in middleware.
- **Fix**: Rewrite the comment to say this module is the single source of truth for prefix matching.
- **Decision**: FIXED

### F5 — Unplanned test-plan §3 status bump and known-issue note

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/foundation/test-plan.md:59
- **Detail**: Phase 2 said to preserve frozen strategy in §§1–5 and leave rollout status to the orchestrator. The cookbook commit also set Phase 2 TBR `implementing` → `implemented` and Phase 3 `not started` → `implemented` with this change folder. The Phase 2 catch-up matches an already-finished slice; Phase 3 status is factually correct for this implemented change. Separately, `tests/integration/known-issue-dev-vars-service-role-key.md` was not in the plan (justified addendum; see F2).
- **Fix**: Leave the §3 table as-is (status is accurate) and keep the known-issue note until the harness follow-up lands.
- **Decision**: FIXED differently — kept the §3 status table; removed `tests/integration/known-issue-dev-vars-service-role-key.md`
