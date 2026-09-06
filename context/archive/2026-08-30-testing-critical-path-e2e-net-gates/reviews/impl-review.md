<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Critical-Path E2E Net and CI Gates

- **Plan**: context/changes/testing-critical-path-e2e-net-gates/plan.md
- **Scope**: Phases 1–3 of 3
- **Date**: 2026-09-06
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 5 warnings 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
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
- **Decision**: DISMISSED — Tropes is a `<summary>` inside `<details>`. Playwright’s accessibility snapshot exposes it as a group with a generic child named “Tropes”, not a button; `getByRole("button", { name: "Tropes" })` hangs. `getByText("Tropes", { exact: true })` is the working click; `exact: true` is required so “Pick 1 to 3 tropes” is not also matched. Checkboxes after open correctly use `getByRole("checkbox")`.

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
- **Decision**: FIXED via Fix A — kept `.cursor/rules/e2e.mdc`; Tropes `getByText` + `exact: true` note and `finally` / `page.request` cleanup now match what shipped.

### F3 — Cleanup treats any 302 as a successful delete

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/support.ts:88
- **Detail**: `deleteBookViaForm` accepts any 302/303. The delete route also redirects 302 to `/auth/signin` when the session is missing, and to Your TBR with `error=not_found` or `error=delete_failed` when the row is not deleted. Specs pass `page.request` today, so the current call sites are fine; a future caller (or an expired storage state) can “pass” cleanup and leave the `[e2e]` row.
- **Fix**: Require `Location` to include `notice=deleted` (and not `/auth/signin` or `error=`).
- **Decision**: FIXED — `deleteBookViaForm` now requires `Location` `notice=deleted` and rejects `/auth/signin` or `error=`.

### F4 — Stale Playwright snapshot can stop the wrong Astro or Supabase process

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/global-teardown.ts:12
- **Detail**: Teardown reads `playwright/.auth/local-services.json`, unlinks it, then kills that `astroPid` and may `supabase stop` if `startedSupabase` is true. Global setup does not clear a leftover snapshot before `startLocalServices`. If this run’s setup fails before it overwrites the file, teardown can SIGKILL a reused PID from a previous crash and stop a Supabase stack this run did not start. Unlinking before stop also means a throw during parse/stop loses the only handle.
- **Fix A ⭐ Recommended**: Delete any stale snapshot at the start of global setup; in teardown parse → stop → then unlink.
  - Strength: Teardown can only act on a snapshot this run wrote (or a leftover that setup already discarded).
  - Tradeoff: A crashed setup that never wrote a new file will not try to clean the old one in teardown (setup already deleted it).
  - Confidence: HIGH — pid reuse and `startedSupabase` on a leftover file are the failure mode.
  - Blind spot: Have not reproduced a crashed-run leftover on this machine.
- **Fix B**: Keep teardown as-is; only stop Supabase when a this-run marker is present (e.g. write snapshot only after a successful start, and refuse to stop Supabase unless the snapshot mtime is from this process).
  - Strength: Narrower change in teardown alone.
  - Tradeoff: Still kills a stale `astroPid` if the file is leftover.
  - Confidence: MEDIUM — does not fix pid reuse.
  - Blind spot: Marker design is extra state to get wrong.
- **Decision**: FIXED via Fix A — setup deletes a leftover snapshot before start; teardown parses and stops, then unlinks.

### F5 — Leftover `[e2e]` books can fail the empty-TBR integration test

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/integration/books-surface.test.ts:114
- **Detail**: Hygiene now accepts `[e2e]` titles, but the empty-TBR case only deletes `[integration-test]` rows, then expects the empty sentence. A leftover `[e2e]` book from a crashed e2e run now passes hygiene, survives that cleanup, and fails `npm test`. CI hides this (fresh VM, `npm test` before e2e). Locally, `npm test` after a leaked e2e run will not.
- **Fix**: Also sweep `E2E_TEST_TITLE_PREFIX` in that empty-TBR cleanup (or in integration `beforeAll`).
- **Decision**: FIXED — empty-TBR try/finally now also deletes leftover `[e2e]` rows.

### F6 — Journey skips cleanup if the create-response body cannot be parsed

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/critical-path.spec.ts:43
- **Detail**: `bookId` is set only after `createdBookIdFrom(await createResponse.json())`. The book already exists at HTTP 201. If `json()` or the shape guard throws, `finally` sees `bookId === undefined` and skips delete. `edit-save.spec.ts` creates through the helper and always has an id.
- **Fix**: Capture the id as soon as the 201 arrives, or delete by the unique title if id extraction fails.
- **Decision**: FIXED — journey stores `bookId` from `tryCreatedBookId` before throwing, so `finally` can still delete when the id is in the 201 body.
