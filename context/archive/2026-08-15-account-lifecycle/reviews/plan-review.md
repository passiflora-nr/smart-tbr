<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Account Lifecycle — Gating and Self-Serve Deletion

- **Plan**: context/changes/account-lifecycle/plan.md
- **Mode**: Deep
- **Date**: 2026-08-20
- **Verdict**: SOUND (after triage)
- **Findings**: 0 critical  3 warnings  1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding
Grounding: 5/5 paths ✓, 5/5 symbols ✓, brief↔plan ✓

## Findings

### F1 — Worker-secret check runs before the secret is set

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 1 Progress (1.3 vs 1.5)
- **Detail**: Progress order is what /10x-implement walks. Automated Worker-secret-list ran before the owner `wrangler secret put` step, and required a Cloudflare login the agent may not have.
- **Fix**: Fold “secret is listed” into the production manual check as a pass step after `wrangler secret put`. Drop the Progress Worker-secret-list row (leave a gap; do not renumber).
- **Decision**: FIXED — folded into 1.6; Progress 1.4 dropped (gap left)

### F2 — Phase 4 never updates AGENTS.md or the README routes table

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 4 — Setup and deployment documentation
- **Detail**: Phase 4 patched README env lines and infrastructure.md, but AGENTS.md still listed only SUPABASE_URL / SUPABASE_KEY, and the README Routes table had no `/account` row.
- **Fix**: In Phase 4, extend the AGENTS.md secrets Hard Rule and add a protected `/account` row to the README Routes table.
- **Decision**: FIXED — Phase 4 change 1 includes Routes row; new change 2 is AGENTS.md

### F3 — Home flash lists two files but not who redirects

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — Post-delete confirmation
- **Detail**: The books flash lives entirely in the page. Home is a thin `index.astro` wrapping `Welcome.astro` with no props. Cookie-set + redirect in the component would break the established pattern.
- **Fix**: `index.astro` does query→cookie→redirect (path `/`) and passes the message; `Welcome.astro` only renders it in the signed-out branch.
- **Decision**: FIXED — Phase 3 contract spells the page vs component split

### F4 — “Clear cookies directly” has no recipe and is likely unused

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details / Phase 3 delete route
- **Detail**: No auth-cookie helper in src/. supabase-js `signOut({ scope: "local" })` still removes the local session on 401/403/404 and network failure, returning `{ error }` more often than throwing.
- **Fix A ⭐ Recommended**: Swallow `{ error }` and throws; do not invent a cookie-name sweeper.
- **Decision**: FIXED via Fix A — swallow errors; no `sb-*` cookie sweeper
