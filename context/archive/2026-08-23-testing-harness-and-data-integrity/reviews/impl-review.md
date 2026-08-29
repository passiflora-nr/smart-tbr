<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Testing Harness and Data-Integrity Core Implementation Plan

- **Plan**: context/changes/testing-harness-and-data-integrity/plan.md
- **Scope**: Phase 1–2 of 2
- **Date**: 2026-08-29
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 5 warnings 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Spawn-env pin can lose to `.dev.vars` hosted coordinates

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: tests/integration/support/local-services.ts:146
- **Detail**: The plan required refusing an ambient Supabase URL override and starting Astro with verified loopback coordinates plus an unusable service-role key. The harness spreads `process.env` and overwrites `SUPABASE_URL` / `SUPABASE_KEY` / `SUPABASE_SERVICE_ROLE_KEY: ""` on the `npm run dev` child. `@astrojs/cloudflare` then `Object.assign(process.env, parsed)` from `.dev.vars` during `astro:config:done` (`node_modules/@astrojs/cloudflare/dist/index.js:292-297`), which overwrites those pins. Research called this the highest-consequence edge. The independent verification client stays on CLI loopback, so a hosted write should trip split-brain and fail — but a transient hosted mutation is still possible if a contributor's `.dev.vars` points at hosted Supabase and `user-d@example.test` exists there. CI is safe (no hosted secrets on `npm test`).
- **Fix A ⭐ Recommended**: Before spawn, fail closed if `.dev.vars` exists and its `SUPABASE_URL` / `SUPABASE_KEY` are not the exact verified loopback pair. Do not use that file as the source of test coordinates — only as a reject check. Keep the spawn pin and empty service-role.
  - Strength: Closes the hosted-`.dev.vars` hole with a small guard; matches the existing fail-closed helper style.
  - Tradeoff: Contributors with hosted keys in `.dev.vars` must keep a local copy or the suite refuses to start.
  - Confidence: HIGH — adapter overwrite is confirmed in installed `@astrojs/cloudflare`; current repo `.dev.vars` is local so the happy path stays green.
  - Blind spot: Have not probed a live Worker after startup to prove which URL it actually uses.
- **Fix B**: Isolate Astro from the contributor `.dev.vars` (harness-owned vars file or equivalent) so spawn pins always win.
  - Strength: Tests never inherit day-to-day hosted secrets, even accidentally.
  - Tradeoff: More moving parts (temp file / wrangler env strategy) and another lifecycle surface to tear down.
  - Confidence: MEDIUM — isolation approach depends on adapter/workerd precedence we have not re-verified end-to-end.
  - Blind spot: Whether workerd still reads a repo-root `.dev.vars` after a temp-file strategy.
- **Decision**: Fixed via Fix A (URL-only reject; key match dropped after a false positive against local publishable vs anon keys)

### F2 — Integration lifecycle does not reliably own or tear down child processes

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: tests/integration/support/local-services.ts:162
- **Detail**: `global-setup.ts` only calls `stopLocalServices` if `startLocalServices()` returns. If Supabase is started (`startedSupabase = true`) and the later status/readiness/exit checks throw, teardown is skipped. Astro is spawned as `npm run dev`; teardown SIGTERM/SIGKILL's that npm PID after 1s, which often orphans the workerd grandchild on `127.0.0.1:14567`. Readiness treats any HTTP status `< 500` as success and does not confirm the spawned PID is the listener, so a leftover human `npm run dev` (typical `.dev.vars` = whatever they use day-to-day) can answer the probe.
- **Fix**: Wrap startup in `try/finally` so Astro is always stopped and Supabase is stopped only if this run started it. Spawn the Astro/workerd process in a process group (or kill the tree), wait for the child `exit`, and fail readiness if the spawned process has already exited.
  - Strength: Matches the plan's "stop Astro unconditionally / stop Supabase only if we started it" contract and removes the leftover-port amplifier for F1.
  - Tradeoff: Process-group semantics differ on Windows; this repo's CI is Ubuntu and local is macOS.
  - Confidence: HIGH — current code assigns `handles` only after a successful return; npm-wrapper orphans are a known pattern.
  - Blind spot: Have not reproduced an orphaned workerd on this machine during the review run (local stack was already healthy; integration finished in ~6s).
- **Decision**: FIXED

### F3 — Unredacted publishable/anon keys in a thrown Error

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/integration/support/local-services.ts:174
- **Detail**: After a failed start, the harness throws `status=${JSON.stringify(status)}`. `SupabaseStatusJson` includes `PUBLISHABLE_KEY` / `ANON_KEY`. That string bypasses `redactSensitiveOutput`, which also has no cookie or `postgresql://` userinfo patterns. Other failure paths (supabase start, Astro line capture) are redacted.
- **Fix**: Redact before stringify, or log only API/DB hosts. Extend redaction to cookies and `postgresql://` userinfo.
- **Decision**: FIXED

### F4 — README still says CI does not need Docker and only runs lint + build

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: README.md:26
- **Detail**: Phase 2 required the README command table and CI line to include `npm test` between lint and build. The command table (`README.md:62-64`) and CI section (`:176`) were updated. Two leftover sentences still contradict the new gate: Prerequisites say Docker is "Not required for … CI" (`:26`), and Deployment still says "CI runs lint + build" (`:166`).
- **Fix**: Update those two sentences so Docker is required for the CI test step and the deploy blurb lists lint → test → build.
- **Decision**: FIXED

### F5 — Unplanned mood "Show me N more" product change

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: src/lib/mood-selection.ts:112
- **Detail**: The plan was to reconcile the PRD to the already-shipped expansion flow (initial 3 / +3 / reset / clamp). Phase 1 commit `44362e2` also added `moodMoreCount` / `buildMoodMoreLabel` and switched `mood.astro` from the hardcoded "Show me 3 more" to a dynamic remaining-count label. The same extra sentence ("the expansion control names how many") was written into the PRD. Migration Notes said no application change was required. Manual step 1.6 still says "Choose **Show me 3 more**." Matching/ordering logic did not change. Unit tests for the new helpers exist.
- **Fix A ⭐ Recommended**: Keep the shipped label helpers and document them as a plan addendum (and update manual 1.6 to allow "Show me N more").
  - Strength: PRD, UI, and unit tests already agree; avoids reverting a small UX improvement.
  - Tradeoff: The plan's "no application change" note becomes historical.
  - Confidence: HIGH — the change is already in the Phase 1 commit and covered by tests.
  - Blind spot: None significant.
- **Fix B**: Revert the product helpers/label and drop the extra PRD sentence so the plan's "shipped behavior, no app change" boundary is restored.
  - Strength: Strict scope discipline.
  - Tradeoff: Throws away implemented UX and test coverage; PRD would no longer mention a named remaining count.
  - Confidence: MEDIUM — depends whether the owner wanted the label as part of reconciliation.
  - Blind spot: Whether anyone already relies on the dynamic copy in later manual scripts.
- **Decision**: Fixed via Fix A

### F6 — Cleanup helper can wipe all user-D books if prefix is empty

- **Severity**: 📎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/integration/support/test-books.ts:41
- **Detail**: `title.startsWith("")` matches every row. Current callers pass `[integration-test]` or a run prefix, and deletes are scoped to `USER_D_ID`. The helper is the cookbook cleanup API. No guard matches the plan's "never issue a broad delete."
- **Fix**: Throw if `prefix` is empty or does not start with `INTEGRATION_TEST_TITLE_PREFIX`. Prefer a title `like` filter so cleanup cannot see non-prefixed titles.
- **Decision**: FIXED

### F7 — CI installs Supabase CLI as `version: latest` instead of the lockfile package

- **Severity**: 📎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: .github/workflows/ci.yml:24
- **Detail**: The plan said the test step relies on the repository's Supabase CLI dependency (`supabase` `^2.101.0`). CI adds `supabase/setup-cli@v1` with `version: latest` and pre-starts the stack. Pre-start is an allowed cost reduction; pinning `latest` can drift from the lockfile CLI the harness invokes via `node_modules/.bin/supabase`.
- **Fix**: Pin `setup-cli` to the same version as `package.json` / the lockfile, or drop `setup-cli` and use `npx supabase` from `npm ci`.
- **Decision**: FIXED

### F8 — Integration `hookTimeout` is shorter than a cold `supabase start`

- **Severity**: 📎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: vitest.config.ts:30
- **Detail**: Integration `hookTimeout` is 120s. `supabase start` allows 240s and Astro readiness 90s. CI pre-starts Supabase, and this review's local run reused a healthy stack (~6s). A contributor's first-run cold start can hit the hook timeout after work has already begun (amplifies F2).
- **Fix**: Raise the integration `hookTimeout` above `240s + 90s`, or fail fast with a "start Supabase first" message when the stack is down.
- **Decision**: FIXED
