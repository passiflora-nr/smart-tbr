<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Critical-Path E2E Net and CI Gates

- **Plan**: context/changes/testing-critical-path-e2e-net-gates/plan.md
- **Scope**: Phases 1–3 of 3
- **Date**: 2026-09-06
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 2 warnings 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — Mood hop opens Tropes with getByText, not the planned role locator

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: tests/e2e/critical-path.spec.ts:54
- **Detail**: The plan’s Critical Implementation Details and Phase 2 contract say to open the tropes disclosure with a role locator and `/^Tropes/` so **Tropes · N selected** still matches, and explicitly “Do not use `getByText("Tropes")`” because that also matches the “Pick 1 to 3 tropes” paragraph. The journey uses `page.getByText("Tropes", { exact: true }).click()`. `exact: true` avoids the paragraph today, and GitHub CI is green on Chromium, Firefox, and WebKit while the empty-state summary is still the word Tropes (`MoodPicker.astro` uses “Tropes” when nothing is ticked). The locator still fails the S-07 survival contract: a restyle that changes the closed-state label to “Tropes · 0 selected” (or any other “Tropes · …” form) will miss, and `getByText` is the class of oracle the plan wrote the net to avoid.
- **Fix A ⭐ Recommended**: Replace the click with `page.getByRole("button", { name: /^Tropes/ })`.
  - Strength: Matches the plan and `MoodPicker.astro`’s “Tropes · N selected” labels; same role style as every other hop in the spec.
  - Tradeoff: `<summary>` is not a real button in markup. Playwright usually exposes it as `button`, but that mapping is the untested part.
  - Confidence: MEDIUM — the planned locator was never landed, so WebKit’s accessibility tree for this summary is unverified.
  - Blind spot: Have not run the journey with the role locator on WebKit.
- **Fix B**: Keep `getByText` but switch to `/^Tropes/` (drop `exact: true`).
  - Strength: Survives “Tropes · N selected” without depending on the summary’s role; current three-engine click already works.
  - Tradeoff: Still the locator family the plan forbade; a restyle that adds another visible “Tropes…” string can make the click ambiguous.
  - Confidence: HIGH — same API as the passing line, only the match is wider.
  - Blind spot: “Pick 1 to 3 tropes” does not match `/^Tropes/`, but any new heading that starts with Tropes would.
- **Decision**: PENDING

### F2 — Unplanned Playwright cursor rule

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: .cursor/rules/e2e.mdc
- **Detail**: Added in Phase 2 (`43ba606`) with no Changes Required entry. The file is the only `.cursor/rules` rule in the repo. It is mostly aligned (storageState-only Sign in, no CSS/XPath, no `waitForTimeout`). Two lines drift from what shipped and from the plan: it lists `getByText` as a primary locator (which licenses F1), and it says clean up in `afterEach` while both specs use `try/finally`.
- **Fix A ⭐ Recommended**: Keep the rule and add the plan’s Tropes / cleanup lines (role + `/^Tropes/`; `finally` via the request helper is the cleanup pattern).
  - Strength: Next S-07 author will see the rule when editing `tests/e2e/**`; keeps useful defaults.
  - Tradeoff: A file the plan did not ask for stays in the tree.
  - Confidence: HIGH — small edit, no product risk.
  - Blind spot: None significant.
- **Fix B**: Delete `.cursor/rules/e2e.mdc` and rely on cookbook §6.3.
  - Strength: Restores plan scope; §6.3 already tells the next author where files go and what to assert.
  - Tradeoff: Loses the in-editor reminder on `tests/e2e/**`.
  - Confidence: HIGH — cookbook is already filled.
  - Blind spot: Authors who never open `test-plan.md` lose the prompt.
- **Decision**: PENDING
