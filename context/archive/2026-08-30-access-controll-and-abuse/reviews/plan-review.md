<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Access Control and Abuse Test Coverage Implementation Plan

- **Plan**: context/changes/access-controll-and-abuse/plan.md
- **Mode**: Deep
- **Date**: 2026-08-30
- **Verdict**: SOUND
- **Findings**: 0 critical 2 warnings 0 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

Grounding: 10/10 existing referenced paths ✓ (2 new files expected), 6/6 symbols ✓, brief↔plan ✓

## Findings

### F1 — Account-delete canary can wipe user D

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Account-delete origin safety / Critical Implementation Details
- **Detail**: The plan told the suite to post a fully valid account-delete form so a broken origin check would reach the delete handler, then treated an empty service-role key as the safety net. That pin is not reliable locally: `@astrojs/cloudflare` can copy `SUPABASE_SERVICE_ROLE_KEY` from `.dev.vars` over the blank spawn value. The existing `.dev.vars` guard only watched `SUPABASE_URL`. The confirmation field/value were also unnamed.
- **Fix A ⭐ Recommended**: Keep the real confirmation so the case stays a true canary. Name `confirmation=DELETE`. Fail immediately if the response is not 403. Extend `assertDevVarsDoNotOverrideLocalCoordinates` so a set service-role key refuses to start Astro.
  - Strength: Still proves a forged form would have reached delete if the origin check vanished, and closes the known local-secrets hole.
  - Tradeoff: A populated `.dev.vars` key will fail the suite until it is blanked or removed.
  - Confidence: HIGH — this overwrite is already documented in the Phase 1 impl-review, and the URL guard is the same pattern.
  - Blind spot: CI without `.dev.vars` stays safe either way; this mainly protects local runs.
- **Fix B**: Send a wrong confirmation value so even a skipped origin check plus a live service-role key cannot delete the account.
  - Strength: The test cannot delete user D, even if both defenses fail.
  - Tradeoff: A broken origin check would then show `confirm_mismatch`, not a near-delete — weaker proof.
  - Confidence: HIGH — the handler already redirects to `confirm_mismatch` before `createAdminClient`.
  - Blind spot: Someone could later “fix” the test to send `DELETE` without adding the harness guard.
- **Decision**: FIXED — Fixed via Fix A

### F2 — Request shapes left for the implementer to guess

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Add the Phase 3 integration suite
- **Detail**: Signed-out form deletes only return 302 when the local app Origin is sent; a missing or hostile Origin returns 403 first. Wrong-owner PUT only returns 404 when the body is a valid book payload; an empty body returns 400 before ownership is checked.
- **Fix**: Spell out those two request shapes in the Phase 1 case list. (Confirmation field was already named under F1.)
- **Decision**: FIXED — Fixed in plan
