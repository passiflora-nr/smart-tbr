<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: TBR Surface Behaviour Implementation Plan

- **Plan**: context/changes/tbr-surface-behaviour/plan.md
- **Scope**: Phase 1–3 of 3
- **Date**: 2026-08-30
- **Verdict**: APPROVED
- **Findings**: 0 critical 1 warning 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — Test-plan strategy and Phase 2 status were edited outside the cookbook-only contract

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/foundation/test-plan.md:44
- **Detail**: Phase 3 asked to fill §6.6 only, leave §1–§5 frozen, and leave §3 Phase 2 Status to the test-plan orchestrator. The Phase 3 commit did that. The Phase 1 commit also changed Risk #2's cheapest layer to "unit for the browse-filter rule, integration for which titles appear", set Phase 2 Status to `implementing` and Test types to `unit, integration`, added "browse-filter matching" to the unit gate, and added an FR-012 bullet under §6.1. Those edits match what shipped and help the next author, but they are extra work on a file the plan called frozen.
- **Fix A ⭐ Recommended**: Keep the strategy and cookbook extras. They describe the suite that actually landed.
  - Strength: The cheapest-layer line, unit-gate line, and §6.1 FR-012 bullet now match the new tests; future authors will not rediscover mood-vs-browse `trope` rules.
  - Tradeoff: Strategy is no longer a frozen snapshot of 2026-08-22.
  - Confidence: HIGH — the new wording matches the unit and integration files.
  - Blind spot: The test-plan orchestrator still owns moving Status from `implementing` to `implemented` on archive.
- **Fix B**: Revert §1–§5 and the Status cell; keep only the §6.6 replacement.
  - Strength: Honours the frozen-strategy rule exactly.
  - Tradeoff: Drops useful guidance already in §2 / §5 / §6.1; the next author would only see it in §6.6.
  - Confidence: HIGH — a docs revert is mechanical.
  - Blind spot: Whether `/10x-test-plan --refresh` would rewrite the same cells anyway.
- **Decision**: Fixed via Fix A (kept the extra strategy / §6.1 / Status lines)

### F2 — Unplanned type-only Astro helper fix and hook-check lesson

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: tests/integration/support/local-services.ts:22
- **Detail**: Commit `555b652` retouched `local-services.ts` so the spawned Astro process type matches ignored stdin (`ChildProcessByStdio<null, Readable, Readable>`), and added the "Always fix failed hook checks" lesson. Neither file was in Changes Required. The type change has no runtime behaviour; it unblocked `tsc --noEmit` during Phase 1.
- **Fix**: Keep both. The type fix is required for the hook; the lesson records why.
- **Decision**: FIXED (kept the type-only helper fix and the hook-check lesson)

### F3 — User-D hygiene scan stops at PostgREST's 1000-row cap

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/integration/support/test-books.ts:136
- **Detail**: `assertUserDHasOnlyReservedFixtures` selects every user-D title in one request with no paging. PostgREST `max_rows = 1000` would silently drop titles after that. The helper never deletes those rows, and the empty-page GET would still fail if a leftover title rendered. User D is meant to stay near zero rows, so this is a completeness gap, not a live data-loss path. The same uncapped select already exists on the older prefix-cleanup helpers.
- **Fix**: Fail if the select returns 1000 rows, or page with `.range()` until a short page.
- **Decision**: FIXED (fail closed when the title list hits the 1000-row page cap)
