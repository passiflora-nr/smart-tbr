<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: TBR Data Layer (books + trope tags) with Per-User RLS Isolation

- **Plan**: context/changes/tbr-data-and-isolation/plan.md
- **Scope**: All phases (1–4 of 4)
- **Date**: 2026-07-05
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Unplanned `eslint.config.js` change to ignore generated types

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: eslint.config.js:73-75
- **Detail**: Phase 3's "Changes Required" lists only `package.json`, `src/lib/database.types.ts`, and `src/lib/supabase.ts`. The implementation also added an ESLint ignore block for `src/lib/database.types.ts`. The change is benign and sensible — the machine-generated types file would otherwise trip type-aware ESLint and block the "npm run lint passes" criterion — but it is unrecorded scope creep against the plan.
- **Fix**: Add a one-line addendum to the plan (Phase 3 or "What We're NOT Doing" boundary note) documenting that the generated `database.types.ts` is excluded from linting, so the plan stays the source of truth.
- **Decision**: FIXED — added Phase 3 change #4 addendum to plan.md documenting the eslint ignore

### F2 — Dead psql variables in `rls.sql`

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: supabase/tests/rls.sql:4-6
- **Detail**: `\set user_a`, `\set user_b`, and `\set user_a_book_count 6` are declared but never referenced; every UUID and the expected count (6) are hardcoded inline throughout the script. This is harmless today but misleading — a future editor updating `\set user_a` would reasonably expect it to propagate, and it won't. Either wire the variables in (`:'user_a'`, `:user_a_book_count`) or drop the unused `\set` lines.
- **Fix**: Remove the three unused `\set` lines, or substitute them into the assertions so the fixtures are defined once.
- **Decision**: FIXED — removed the dead `\set` lines and added a comment explaining why UUIDs stay inline (psql can't interpolate inside `do $$ ... $$` blocks). A true "define once" wire-in was rejected because psql variable interpolation does not reach into dollar-quoted blocks.

## Notes (positive deviations, no action needed)

- **RLS policies use `(select auth.uid())`** rather than a bare `auth.uid()`. This is Supabase's recommended init-plan optimization (evaluates the function once per statement instead of once per row) — better than the plan's literal `auth.uid() = user_id` text, and correct.
- **`revoke all on public.books from anon;`** was added beyond the plan's grant-only contract. This is defense-in-depth (ensures the anon role has no residual access) and aligns with the FR-011 guardrail. Positive.

## Success Criteria verification

- **Phase 3 (verified in this environment)**: `npx astro sync` clean, `npm run lint` passes (warnings only, no errors), `npm run build` passes, `database.types.ts` present with a typed `books` Row/Insert/Update. ✅
- **Phase 1 & 2 (not re-runnable here — no local `psql`/running stack)**: migration `20260705084406_create_books.sql`, `seed.sql`, and `rls.sql` reviewed statically and are sound; commit-attested (67b9e44, 47630e2). Isolation proof covers cross-account select/update/delete/insert denial + owner visibility, with a robust `insufficient_privilege`/42501 catch so `ON_ERROR_STOP=1` exits zero on success.
- **Phase 4 (production rollout)**: operator-attested via commit af8b39b; not verifiable from the repo. RLS-enabled production table + four policies is a human-gated manual check per `infrastructure.md`.
