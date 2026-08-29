<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Testing Harness and Data-Integrity Core

- **Plan**: context/changes/testing-harness-and-data-integrity/plan.md
- **Mode**: Deep
- **Date**: 2026-08-29
- **Verdict**: SOUND
- **Findings**: 0 critical 3 warnings 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

Grounding: 5/5 existing modify-paths ✓, 8/8 symbols ✓, brief↔plan ✓

## Findings

### F1 — Split-brain write: Astro can hit hosted, cleanup hits local

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Blind Spots
- **Location**: Phase 2 — lifecycle + persistence cleanup
- **Detail**: If Astro writes to hosted Supabase but the verification client reads local, finally-cleanup misses the hosted row. Primary control (explicit loopback env) was already in the plan.
- **Fix A ⭐ Recommended**: If the API returns 201 but the local select-by-id misses, delete that id through the same Astro session before failing.
  - Strength: Cleans the row the app actually created, wherever it went.
  - Tradeoff: Extra delete path; only runs on the split-brain failure.
  - Confidence: HIGH — the 201 body already has the id.
  - Blind spot: Delete is form-urlencoded and origin-checked.
- **Fix B**: Spawn Astro with a stripped child env (no inherited SUPABASE_*) plus only the CLI-verified local URL/key.
  - Strength: Prevents the class of leak from a contributor’s shell/.env.
  - Tradeoff: Does not help if Vite still loads hosted .env from disk.
  - Confidence: MEDIUM — process.env overwrite is the documented fragility.
  - Blind spot: Still no cleanup if a write lands off-local.
- **Decision**: FIXED — Fixed via Fix A

### F2 — Criteria 2.5 and 2.6 have no test surface

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 2 success criteria + Testing Strategy
- **Detail**: Global setup only sees local `supabase status` JSON. 2.5 could pass without ever feeding a hosted URL to the allowlist. 2.6 had no throw-then-assert case.
- **Fix**: Extract `assertLocalSupabaseCoordinates`; add `tests/unit/local-coordinates.test.ts`; add a throw-then-assert case in `books-persistence.test.ts`.
- **Decision**: FIXED

### F3 — Sign-in helper omits form body and redirect: "manual"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — http-session.ts
- **Detail**: Sign-in is formData + 302. JSON POST fails silently; default fetch follow can drop Set-Cookie chunks.
- **Fix**: Specify form encoding, Origin = Astro origin, redirect: "manual", collect every Set-Cookie from the 302.
- **Decision**: FIXED

### F4 — AGENTS.md and README still describe a repo with no tests

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — cookbook
- **Detail**: Cookbook updates targeted test-plan.md only. AGENTS.md and README still omit the runner and `npm test` CI step.
- **Fix**: Add AGENTS.md and README.md to Phase 2 change 6.
- **Decision**: FIXED
