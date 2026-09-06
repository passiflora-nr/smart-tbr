<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Café Romance UI Theme Implementation Plan

- **Plan**: context/changes/ui-theme-cafe-romance/plan.md
- **Scope**: Phase 1–3 of 3
- **Date**: 2026-09-06
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 2 warnings 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — Page background hex does not match locked palette

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/styles/global.css:8
- **Detail**: Plan and change.md lock `--background` to `#F7F3EE` (warm linen). Implementation uses `#e9e1d4` (darker oat). Banner info also hardcodes `#e9e1d4` (`src/components/Banner.astro:28`) instead of the token. Every other planned hex matches. The owner already walked the wide-screen pages with this darker page color.
- **Fix A ⭐ Recommended**: Restore `--background: #F7F3EE` and point the Banner info surface at that token
  - Strength: Matches the locked palette in change.md and the Phase 1 contract; Banner stays in sync if the token moves again.
  - Tradeoff: The page will look a little lighter than the walk that was already signed off.
  - Confidence: HIGH — the hex is written in both the plan and change.md with no addendum.
  - Blind spot: Whether the darker oat was an intentional tweak during the walk (not written down).
- **Fix B**: Keep `#e9e1d4` and update change.md plus the plan token table to lock that hex
  - Strength: Preserves the look already accepted in Phase 2 manual checks.
  - Tradeoff: The written palette and the live app stay out of date until the docs move.
  - Confidence: MEDIUM — the walk passed, but nothing records why the hex changed.
  - Blind spot: Other leftover hardcodes that assumed `#F7F3EE`.
- **Decision**: FIXED via Fix B

### F2 — Shared nav can hide Account and Sign out on a phone

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/SignedInNav.astro:15
- **Detail**: The shared nav is one non-wrapping row (`flex … justify-between`) and every link is `shrink-0`. Six labels plus padding will not fit a ~375px screen, so Account and Sign out sit off the right edge with no horizontal scroll. The old per-page rows used `flex-wrap`. Signed-in Home also pins this nav with `absolute` (`Welcome.astro:22–24`), so a second row would overlap the title unless Home gets extra top space. The plan’s owner walk was wide-screen only, so this was not in the written pass criteria.
- **Fix A ⭐ Recommended**: Add wrap plus a consistent gap, and give signed-in Home extra top padding so a second row does not cover the heading
  - Strength: Account and Sign out stay reachable without a hidden scroll. Matches the wrap behavior the old link rows already had.
  - Tradeoff: Home’s overlay layout needs a padding tweak; the bar may become two rows on phones.
  - Confidence: HIGH — the clip is visible from the classes; the old rows already wrapped.
  - Blind spot: Exact phone widths were not measured in a browser during this review.
- **Fix B**: Keep a single row and add horizontal scroll (`overflow-x-auto`)
  - Strength: Desktop stays one bar; Home’s overlay does not need extra padding.
  - Tradeoff: Sign out is still off-screen until the reader notices they can swipe. Easy to miss.
  - Confidence: MEDIUM — scrollable bars are easy to overlook on a phone.
  - Blind spot: Whether swipe-to-reveal is obvious enough next to the Home hero buttons.
- **Decision**: FIXED via Fix A
