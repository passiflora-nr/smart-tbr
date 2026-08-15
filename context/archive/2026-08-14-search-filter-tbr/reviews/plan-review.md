<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Search and Filter the TBR (S-04)

- **Plan**: context/changes/search-filter-tbr/plan.md
- **Mode**: Deep
- **Date**: 2026-08-14
- **Verdict**: SOUND (was REVISE; all findings fixed in triage)
- **Findings**: 0 critical 2 warnings 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS (was WARNING; F1 fixed) |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS (was WARNING; F2 fixed) |
| Plan Completeness | PASS (F3 fixed) |

## Grounding

Grounding: 8/8 existing paths ✓, 2 new files (not yet created) ✓, 6/6 symbols ✓, brief↔plan ✓

## Findings

### F1 — Incomplete edit return-path inventory

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 3, change #4 — EditBookForm.tsx / edit.astro
- **Detail**: Desired End State says editing from a filtered view returns to that view. Phase 3 only rewrote EditBookForm success navigations (lines 229–231) and the "View your TBR" anchor. It omitted the Cancel anchor at EditBookForm.tsx:350-356 and the four load-time redirects in edit.astro (lines 23, 29, 43, 47). Success criteria could pass while Cancel still dumped the user on the unfiltered list.
- **Fix A ⭐ Recommended**: Thread filters through Cancel and the four load-time error redirects. Extended `buildBooksHref` options with `error`.
- **Fix B**: Wire Cancel only; leave load-time error redirects as bare `/books?error=…`.
- **Decision**: FIXED via Fix A

### F2 — parseBookFilters can silently widen results

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 — parseBookFilters contract
- **Detail**: Critical Implementation Details forbid silently dropping a selected trope because that widens the result set. Phase 1 then copied tropeListSchema's per-book max of 25 onto the filter and said invalid input degrades to an empty filter. Ticking 26 checkboxes is UI-reachable and would show the full TBR if the whole parse failed closed-to-empty.
- **Fix A ⭐ Recommended**: Drop the 25 cap. Clamp q. Validate each trope on its own. Never replace a request that contained tropes with an empty filter. Overlong tropes stay in the filter so all-match returns zero.
- **Fix B**: Same per-value semantics, plus a high sanity cap (~100) for URL size.
- **Decision**: FIXED via Fix A

### F3 — Delete handler must read the body before the first redirect

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3, change #2 — delete.ts
- **Detail**: The plan required filters on the supabase-null redirect at delete.ts:8, but that return is the first line after createClient. Parsing formData after the null check would leave that redirect unfiltered.
- **Fix**: State explicitly that `await context.request.formData()` runs before the supabase null check, matching the auth POST routes.
- **Decision**: FIXED
