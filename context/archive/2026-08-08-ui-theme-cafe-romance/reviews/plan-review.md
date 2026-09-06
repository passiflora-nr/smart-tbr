<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Café Romance UI Theme Implementation Plan

- **Plan**: context/changes/ui-theme-cafe-romance/plan.md
- **Mode**: Deep
- **Date**: 2026-09-06
- **Verdict**: SOUND (was REVISE; all findings fixed in triage)
- **Findings**: 1 critical 1 warning 3 observations

## Verdicts

| Dimension             | Verdict                            |
| --------------------- | ---------------------------------- |
| End-State Alignment   | PASS                               |
| Lean Execution        | PASS                               |
| Architectural Fitness | PASS                               |
| Blind Spots           | PASS (was FAIL; F1/F3/F4/F5 fixed) |
| Plan Completeness     | PASS (was WARNING; F2 fixed)       |

## Grounding

Grounding: 16/16 paths ✓, 6/6 existing symbols ✓, brief↔plan ✓. Astro Fonts API (`fontProviders.google()`, `<Font />` from `astro:assets`, `cssVariable` + `preload`) confirmed against current Astro 6 docs.

## Findings

### F1 — Home nav + hero reuse the same link names

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 §2 (wire nav) + Testing Strategy
- **Detail**: Signed-in Home will show **Add a book** / **View your TBR** / **Pick by mood** in both `SignedInNav` and the hero. Playwright strict locators in `tests/e2e/auth.setup.ts:21` and `tests/e2e/critical-path.spec.ts:15` expect one match and will fail, blocking the whole e2e net.
- **Fix A ⭐ Recommended**: Keep the same nav everywhere. Scope the two Home queries to a `<nav>` landmark. Do not use `.first()` / `.last()` / `.nth()`.
- **Fix B**: Omit those three links from the Home nav only.
- **Decision**: FIXED via Fix A, with the locator constraint: query through `getByRole("navigation")`, never first-match.

### F2 — Leftover-chrome search is too narrow

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 automated check 2.6
- **Detail**: The leftover search only listed `bg-cosmic`, `from-blue-200`, and `bg-purple-600`. Glass and purple/blue chrome could remain and still pass.
- **Fix**: Widen 2.6 to also search `bg-white/10`, `backdrop-blur`, `text-purple-`, `text-blue-100`, and `border-white/10`.
- **Decision**: FIXED

### F3 — Phase 1 already changes type and page color

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 tokens + manual check 1.5
- **Detail**: Phase 1 remaps `--background` and applies `font-sans` on `body` while pages stay cosmic. Check 1.5 said “look like the current cosmic app.”
- **Fix**: Clarify 1.5: purple cards stay; new typeface may already show; cream strip behind a config warning is fine.
- **Decision**: FIXED

### F4 — Font setup would also download italic

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 font registration
- **Detail**: Astro’s Google helper defaults to italic unless opted out. The plan already said not to add unused italic.
- **Fix**: Phase 1 font contract: `styles: ["normal"]` only.
- **Decision**: FIXED

### F5 — New Edit-page menu links also need the leave warning

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Testing Strategy extra checks
- **Detail**: Shared nav adds **Add a book** and **Pick by mood** on Edit. Extra check list only named Home / Account / Sign out.
- **Fix**: Add those two links to the dirty-form leave-warning list.
- **Decision**: FIXED
