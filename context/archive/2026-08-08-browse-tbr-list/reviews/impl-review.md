<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Browse the TBR List (S-02)

- **Plan**: context/changes/browse-tbr-list/plan.md
- **Scope**: Phases 1–3 of 3 (full plan)
- **Date**: 2026-08-11
- **Verdict**: APPROVED
- **Findings**: 0 critical 2 warnings 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Automated verification (re-run this review)

| Check | Result |
|-------|--------|
| `npx astro sync` | PASS |
| `npm run lint` | PASS (0 errors; expected `no-console` warnings on books paths) |
| `npm run build` | PASS |
| `supabase/tests/rls.sql` after `db reset` | PASS |
| CI on PR #16 | PASS (merged 2026-08-11; check run `ci` SUCCESS) |
| Live curl `/books` 302 / signed-in HTML | Not re-run (no `npm run dev` session); Progress 1.6–1.7 marked done at `28090d7`; middleware + page code reviewed |

## Manual Progress

All Phase 1–3 Manual items are `- [x]` with SHA suffixes. `change.md` records Phase 3 manual verification completed 2026-08-11 and documents post-plan UX amendments. No rubber-stamp signal beyond the usual inability to re-observe browser steps in this review.

## Findings

### F1 — Null user renders load-failure instead of sign-in redirect

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/pages/books/index.astro:16-18
- **Detail**: Plan Phase 1 contract requires treating `Astro.locals.user === null` as `Astro.redirect("/auth/signin")` (no non-null assertion). Implementation sets `state = "failed"` and shows “Couldn't load your list.” Middleware normally prevents this path, so production risk is low; if reached, an auth gap is mislabeled as a DB load failure.
- **Fix**: Replace the null-user failed branch with `return Astro.redirect("/auth/signin");`; keep `failed` only for null client / query error.
  - Strength: Matches plan and `dashboard`/`edit` conventions for protected pages.
  - Tradeoff: One-line behavioral change; dead path under current middleware.
  - Confidence: HIGH — plan text is explicit; middleware comment already acknowledges the redirect case.
  - Blind spot: None significant.
- **Decision**: FIXED — Applied redirect for null user

### F2 — Populated fixture merged into seed.sql vs original scope

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: supabase/seed.sql; plan Migration Notes / What We're NOT Doing
- **Detail**: Original plan forbade changing `supabase/seed.sql` and required opt-in `supabase/fixtures/populated-tbr.sql`. Implementation merged User C’s 25 books (and added User D) into `seed.sql`, deleted the fixture file, and documented this in `change.md` + Testing Strategy. Migration Notes and “What We're NOT Doing” still claim seed is untouched — plan docs disagree with reality.
- **Fix**: Update Migration Notes and “What We're NOT Doing” to record the intentional seed merge + User D; leave seed as-is (already shipped).
- **Decision**: FIXED — Updated Migration Notes and What We're NOT Doing to record seed merge

### F3 — Dashboard still inlines SignOut while TBR pages share SignOutButton

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/dashboard.astro:29-36
- **Detail**: Post-plan UX introduced `SignOutButton.astro` on `/books` and `/books/new`; dashboard still duplicates the form markup. Not a safety issue.
- **Fix**: Optional — swap dashboard to `SignOutButton` in a follow-up.
- **Decision**: FIXED — Dashboard now uses SignOutButton
