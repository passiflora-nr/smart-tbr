# Critical-Path E2E Net and CI Gates Implementation Plan

## Overview

Stand up a thin Playwright net over the real user path — Sign in → Add a book → Your TBR → Pick by mood — plus a short Save changes case, on Chromium, Firefox, and WebKit. Wire it as a required step in the existing GitHub `ci` job so a broken island or nav hop blocks merge before the Café Romance restyle (S-07) starts.

## Current State Analysis

Phase 2 already proves filter, search, and delete change the **set of books** through server HTML (`tests/unit/book-filters.test.ts`, `tests/integration/books-surface.test.ts`). Mood result sets are proven by `GET /mood` in `tests/integration/books-persistence.test.ts`. Repeating those matrices in a browser would violate cost × signal.

What is still unproven is the **island hops** and the **stitch** between hops:

- Sign in is a React island wrapping a native `POST /api/auth/signin`. Integration posts the API and never clicks **Sign in**. Success lands on `/`, not Your TBR.
- **Add to TBR** and **Save changes** are React 19 form actions that `fetch` JSON. Without JavaScript they do nothing. After add, the page stays on Add a book; the book only appears on Your TBR after **View your TBR**.
- S-07 will rewrite markup on every surface, including a cover-forward list rebuild. Tests that assert classes, structure, counts, or `Edit ${title}` as the only list proof will be deleted by the rewrite instead of protecting it.

Playwright is already a devDependency (`@playwright/test` ^1.63.0). Phase 1 made the harness runnable (three engines, `auth.setup.ts`, local-stack global setup, `npm run test:e2e`). The old seed file was kept as a tagged skip (`tests/e2e/seed.spec.ts` with `@seed`; `"test:e2e": "playwright test --grep-invert @seed"`) instead of being deleted. Progress 1.2 is therefore stale. The seed has working helper patterns (`page.request` delete, Origin, `body.book.id`, hydration `toPass`) but its list oracle (`getByRole("paragraph")`) is unsafe for S-07. Phase 2 must extract the helper bits, delete the file, and drop `--grep-invert`.

`startLocalServices` / `stopLocalServices` in `tests/integration/support/local-services.ts` are plain Node and can be imported from Playwright. They pin Astro on `http://127.0.0.1:14567`, refuse non-loopback Supabase, and blank `SUPABASE_SERVICE_ROLE_KEY`. Playwright cannot use Vitest `inject()`. Port 14567 is exclusive — integration teardown stops Astro, so a later e2e start in the same CI job is safe if it is sequential.

User D (`user-d@example.test` / `password123`) is the only mutation account. Integration hygiene (`assertUserDHasOnlyReservedFixtures`) currently treats any title that does not start with `[integration-test]` as stray — leftover `[e2e]` books would fail `npm test`.

## Desired End State

- One Playwright setup clicks **Sign in** as user D, lands on `/`, and writes `playwright/.auth/user.json`. Later cases start already signed in via `storageState`, each in a fresh browser context.
- One journey: Add to TBR (commit a trope) → **View your TBR** (title text) → **Pick by mood** → **Find my next read** (same title).
- One short case: open the edit page by URL → change the title → **Save changes** → new title on Your TBR, old title gone.
- Cleanup uses the app API / form delete and the reserved `[e2e]` title prefix. Integration hygiene accepts both `[integration-test]` and `[e2e]`.
- `npm run test:e2e` runs the net on Chromium, Firefox, and WebKit against the local stack. The existing `ci` job installs browsers and runs that script after `npm test`, before build. Deploy still waits on one green `ci` job.
- Cookbook §6.3 tells the next author how to add an e2e case. §4 no longer says “e2e none yet”. Infrastructure and command tables mention the new step.

### Key Discoveries:

- Four `client:load` islands only: Sign in, Sign up, Add to TBR, Save changes (`src/pages/auth/signin.astro:16`, `signup.astro:16`, `src/pages/books/new.astro:36`, `src/pages/books/[id]/edit.astro:89-90`). Everything else on the critical path is server HTML.
- Add does not navigate (`AddBookForm.tsx:103-136`). The stitch is the page-shell **View your TBR** link (`new.astro:15-20`).
- Sign-in success redirects to `/` (`src/pages/api/auth/signin.ts:19`). Signed-in home CTAs are **Pick by mood**, **View your TBR**, **Add a book** (`Welcome.astro:54-71`). Your TBR also links to **Pick by mood** (`index.astro:185-188`).
- Mood matching is any-match OR (`matchesAnyTrope`). Browse is all-match AND. The journey must drive `/mood`, never `/books?trope=`. Empty-vocabulary and checkbox-driven no-match are not real e2e states.
- Tropes on Add commit via Enter / comma / `mergePendingTrope` on Save. Pressing Enter before **Add to TBR** is enough for the thin net (`TropeInput.tsx:70-74`).
- Official Playwright auth pattern (`/websites/playwright_dev`, checked 2026-09-06): a `setup` project matching `*.setup.ts` clicks sign-in, writes `storageState`, and browser projects depend on it. Each test still gets an isolated context. CI install is `npx playwright install --with-deps`.
- `local-services.ts` exports no Vitest APIs. Playwright `webServer: { command: "npm run dev" }` would skip the loopback and service-role guards and fight over port 14567 — do not use it as the server starter.
- `test-books.ts` helpers import `@/lib/*`. Playwright’s loader may not resolve that alias. E2e specs must not import `test-books.ts`; they delete through `page.request` (or `context.request`) plus the session cookies. Do not use the standalone `request` fixture — it has no `storageState`. Hygiene still changes in `test-books.ts` so a crashed e2e run cannot poison `npm test`.

## What We're NOT Doing

- Product behaviour changes (no feature work on auth, books, or mood).
- Re-e2e of FR-012 filter combinations, mood expansion math, delete-as-proof, ownership, origin checks, signup, or account delete.
- Empty-field sign-in validation, pending-trope-without-Enter, mood no-match via a listed checkbox, empty-TBR copy, the 2-second mood guardrail, or mobile projects.
- Snapshot tests; assertions on CSS classes, colours, layout, DOM structure, element counts, `Your TBR (N of M)`, or `Edit ${title}` as the **only** proof a book is on the list.
- Targeting production Workers.dev. A second coordinate parser. Putting e2e inside `npm test` (Vitest). Playwright on lint-staged / pre-commit.
- Skipping WebKit from day one. A separate CI job. A local-only net with no CI gate.
- Filling cookbook sections for later rollout phases. Rewriting frozen test-plan strategy (§1–§3, §5, §7) except the stale §4 e2e row and §6.3 TBD.

## Implementation Approach

Three phases, cheapest runnable layer first — same rhythm as prior test-rollout plans (harness → cases → cookbook/CI):

1. Make Playwright actually run against the local stack on three engines, with one Sign in click and reserved `[e2e]` hygiene.
2. Replace the seed spec with the thin journey and the Save changes case, using behaviour oracles and API cleanup.
3. Add the CI step and fill the docs that are now stale.

## Critical Implementation Details

**Server lifecycle.** Playwright `globalSetup` / `globalTeardown` must import `startLocalServices` / `stopLocalServices`. Playwright runs those files in separate processes, and `LocalServiceHandles.astroProcess` cannot be JSON-serialized — persist a pid (and `startedSupabase`) so teardown can stop the Astro child this run started. Do not add Playwright `webServer` for `npm run dev`. Hardcode `baseURL` to `http://127.0.0.1:14567`.

**CI order.** The `ci` job already starts Supabase, then `npm test` (which starts Astro and stops it). E2e must run **after** `npm test` and **before** build. A second `startLocalServices` will reuse healthy Supabase (`startedSupabase: false`) and start Astro again. Never run Vitest integration and Playwright in parallel — port 14567 is exclusive.

**Sign in once.** `tests/e2e/auth.setup.ts` is the only place that types email/password and clicks **Sign in**. Browser projects load `playwright/.auth/user.json`. Do not add a logged-out journey that retypes credentials. Wait for `/` and a signed-in home control (**Pick by mood**) before writing storage state — cookies are set across the redirect.

**Oracles that survive S-07.** Assert book title (and author when useful) as visible text, fixed product copy, URL, and button/link names that are product copy: Sign in, Add to TBR, Save changes, Find my next read, View your TBR, Pick by mood, Add a book. Reach the edit island via `/books/{id}/edit` from the create-response id — do not use `Edit ${title}` as the list oracle. Cleanup must not use `toHaveCount(0)`.

**Mood hop.** Open the tropes disclosure with a role locator on **Tropes** (regex `/^Tropes/` so **Tropes · N selected** still matches). Do not use `getByText("Tropes")` — that also matches the “Pick 1 to 3 tropes” paragraph. Tick `getByRole("checkbox", { name: uniqueTrope })`. Click **Find my next read**. Assert the book title is present. Do not try to produce “No matches — try different tropes.” by ticking a listed trope.

**Island hydration.** Sign in, Add to TBR, and Save changes are `client:load` React islands. Filling before hydration is overwritten (already proven in `auth.setup.ts`). Journey and edit cases must retry with `toPass()` until committed tropes show a Remove-chip and Title/Author `.toHaveValue` matches — do not one-shot fill+Enter.

**WebKit quarantine hook.** Ship all three engines in CI. If WebKit-on-Linux becomes noisy for non-product reasons, skip only that project when `CI` is set (document the reason in config). Do not drop Firefox or local WebKit.

---

## Phase 1: Make Playwright actually run

### Overview

Rewrite the unfinished harness so `npm run test:e2e` starts the local stack, clicks **Sign in** once, and runs a tiny signed-in smoke on Chromium, Firefox, and WebKit. Teach user-D hygiene that `[e2e]` titles are reserved. Retire the seed spec so it cannot fail the new config.

**Behaviour asserted:** the Sign in button submits a valid user-D session and lands on `/`; a later test in a new context is already signed in.
**Regression caught:** a restyle that drops `client:load` on Sign in, or a harness that cannot start the local app.
**Research source:** `research.md` Playwright / CI / Auth for e2e; Open Questions (harness first).
**Boundary cases:** port 14567 already taken; `.dev.vars` service-role key set (existing refuse); leftover `[e2e]` books vs integration hygiene.
**Anti-pattern avoided:** happy-path-only sign-in via `storageState` with no click; Playwright `webServer` that bypasses local-service guards.

### Changes Required:

#### 1. Playwright config

**File**: `playwright.config.ts`

**Intent**: Replace the Chromium-only sketch with three desktop engines, a setup project, `baseURL`, and global setup/teardown that reuse the integration local stack.

**Contract**: `testDir` is `tests/e2e`. `use.baseURL` is `http://127.0.0.1:14567`. Projects: `setup` (`testMatch: /.*\.setup\.ts/`), then `chromium` / `firefox` / `webkit` using `devices['Desktop Chrome' | 'Desktop Firefox' | 'Desktop Safari']`, each with `storageState: "playwright/.auth/user.json"` and `dependencies: ["setup"]`. `forbidOnly` and CI retries/workers follow Playwright’s CI defaults (`retries: process.env.CI ? 2 : 0`, `workers: process.env.CI ? 1 : undefined`). Include a one-line WebKit-on-CI skip hook (off by default). No `webServer` block.

#### 2. Local-stack lifecycle for Playwright

**File**: `tests/e2e/global-setup.ts` (new), `tests/e2e/global-teardown.ts` (new)

**Intent**: Start and stop the same loopback Astro + Supabase stack integration tests use, without Vitest `provide` / `inject`.

**Contract**: Import `startLocalServices` / `stopLocalServices` from `tests/integration/support/local-services.ts`. Persist enough state for teardown across Playwright’s separate processes (Astro pid + `startedSupabase`). Do not parse `.env` / `.dev.vars` for coordinates. Do not target production.

#### 3. Sign-in setup (the only Sign in click)

**File**: `tests/e2e/auth.setup.ts` (new)

**Intent**: Prove the Sign in button with user D and save cookies for later cases.

**Contract**: Open `/auth/signin`. Fill **Email** / **Password** with `user-d@example.test` / `password123` (same constants as the product seed; duplicate the two strings here — do not import `test-books.ts`). Click **Sign in**. Wait until the URL is `/` and **Pick by mood** is visible. Then `page.context().storageState({ path: "playwright/.auth/user.json" })`. Credentials stay the seeded test account only.

#### 4. Three-engine smoke

**File**: `tests/e2e/signed-in-home.spec.ts` (new)

**Intent**: Force Chromium, Firefox, and WebKit to actually run against a storageState session. Without a non-setup spec, the three engine projects would execute zero tests.

**Contract**: `page.goto("/")`. Assert `getByRole("link", { name: "Pick by mood" })` is visible. No book mutations in this file.

#### 5. Retire the seed spec

**File**: `tests/e2e/seed.spec.ts`

**Intent**: Remove the incomplete add/delete seed so it cannot run under the new config with unsafe oracles.

**Contract**: Delete the file. Do not keep `Edit ${title}` or `toHaveCount(0)` assertions.

#### 6. Reserved `[e2e]` hygiene

**File**: `tests/integration/support/test-books.ts`, `tests/unit/` (new or existing helper test)

**Intent**: Leftover e2e titles must not fail integration hygiene, and cleanup helpers must be allowed to delete `[e2e]` rows if a human or later helper calls them with that prefix.

**Contract**: Export a reserved-prefix check that accepts titles/prefixes starting with `[integration-test]` **or** `[e2e]`. `assertReservedTitlePrefix` / `cleanupBooksWithTitlePrefix` / `listBooksWithTitlePrefix` / `createBookViaApi` use that check. `assertUserDHasOnlyReservedFixtures` treats both prefixes as fixture-only; stray titles are anything else. `createRunTitlePrefix` stays `[integration-test]…`. Add a short unit test that `[e2e]…` and `[integration-test]…` pass and a normal title fails. Do not change user A.

#### 7. npm script

**File**: `package.json`

**Intent**: Give a focused command that does not go through Vitest.

**Contract**: Add `"test:e2e": "playwright test"`. Leave `"test": "vitest run"` unchanged.

### Success Criteria:

#### Automated Verification:

- `npx playwright install` (local, once per machine) then `npm run test:e2e` passes: setup clicks Sign in, smoke runs on Chromium, Firefox, and WebKit
- `tests/e2e/seed.spec.ts` is gone
- Unit test for the reserved-prefix helper passes: `npm run test:unit`
- `npm test` still passes (Docker + local Supabase)
- `npm run lint` passes

#### Manual Verification:

**1.9 — Watch the local browser net sign in**

**Setup:** Docker is running. You are in the project folder. Browsers are installed (`npx playwright install` once if this machine has never run Playwright).

**Steps:**

1. Run `npm run test:e2e` (headed if you want to watch: `npm run test:e2e -- --headed`).
2. Watch the Sign in page: email and password fill, **Sign in** is clicked, the home page appears with **Pick by mood**.
3. Confirm the report lists Chromium, Firefox, and WebKit (not Chromium only).

**Expected:** Sign in reaches home. The later smoke is already signed in (it does not type the password again). All three browsers pass.

**Pass if:** You saw a real Sign in click, home showed **Pick by mood**, and three browsers were green.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Thin journey + Save changes

### Overview

Replace the harness-only smoke story with the two cases Phase 4 must keep: the signed-in add → TBR → mood stitch, and Save changes after a title edit. Cleanup is API/form with `[e2e]` titles, never the Delete button. Finish retiring `tests/e2e/seed.spec.ts` (still in the tree as a tagged skip) so its paragraph-role oracle cannot be copied.

**Behaviour asserted:** US-01 + FR-002/FR-004/FR-005 — a signed-in user adds a book, sees it on Your TBR, picks it by mood; an edit save updates the list set.
**Regression caught:** Add/Save `fetch` URL or form `action` dying during S-07; **View your TBR** / **Pick by mood** href dropped; add succeeding only on the session list and never on Your TBR.
**Research source:** `research.md` Risk #2 remaining hops; Follow-up (seed delete is extra; mood empty-vocabulary not reachable).
**Boundary cases:** unique trope so the mood picker lists it; edit reached by URL, not Edit-link chrome.
**Anti-pattern avoided:** FR-012 matrix in the browser; `Edit ${title}` as the only list proof; UI delete as Risk #2 proof.

### Changes Required:

#### 1. E2e request helper

**File**: `tests/e2e/support.ts` (new)

**Intent**: Create and delete user-D books through the running app using the already-signed-in cookie jar, without importing `test-books.ts`.

**Contract**: Helpers take Playwright `page.request` (or `context.request`) — the `APIRequestContext` that shares the browser cookie jar — plus `baseURL`. Do not use the standalone `request` fixture; it has no `storageState` cookies. Create: `POST /api/books` JSON, expect 201, unwrap `body.book.id` (response is `{ book, duplicate }`), return id and title; payload must include title, author, and at least one trope. Delete: `POST /api/books/{id}/delete` as a form post with an explicit `Origin` header set to the app origin, `maxRedirects: 0`, expect 302 or 303. Titles used for create/delete must start with `[e2e]`. No Supabase JS client in this file.

#### 2. Critical-path journey

**File**: `tests/e2e/critical-path.spec.ts` (new)

**Intent**: Drive the island + navigation stitch a restyle can break, and assert the book title on Your TBR and on mood results.

**Contract**: Starts already signed in. Title prefix `[e2e]` plus a unique suffix; unique trope string (not reused from fixtures). Flow: `/` → **Add a book** → wait for the Add island to hydrate (same class of `toPass()` as `auth.setup.ts` / the leftover seed): fill Tropes, press Enter, retry until the Remove-chip is visible; fill Title and Author and retry until `.toHaveValue` matches → **Add to TBR** (wait for `POST /api/books` 201 and keep the id for cleanup) → **View your TBR** → URL `/books` → title text visible → **Pick by mood** → open Tropes disclosure (`getByRole` + `/^Tropes/`, not `getByText("Tropes")`) → tick `getByRole("checkbox", { name: uniqueTrope })` → **Find my next read** → title text visible. `finally`: delete by id via the helper. Do not click Delete. Do not assert session-list markup on Add a book as the journey oracle. Do not treat a single fill+Enter before hydration as enough.

#### 3. Save changes case

**File**: `tests/e2e/edit-save.spec.ts` (new)

**Intent**: Click **Save changes** (the remaining unproven island) and prove the list set changed.

**Contract**: Starts already signed in. Create a `[e2e]` book via the helper. `goto` `/books/{id}/edit`. Wait for the Save island to hydrate: change Title to a different `[e2e]` title and retry with `toPass()` until `.toHaveValue` matches. Click **Save changes**. Land on `/books`. Assert the new title is visible and the old title is not. `finally`: delete by id via the helper. Do not use `getByRole("link", { name: \`Edit ${title}\` })` as the presence/absence oracle.

#### 4. Keep or fold the home smoke

**File**: `tests/e2e/signed-in-home.spec.ts`

**Intent**: Avoid a redundant fourth case once the journey already opens `/` and clicks **Add a book**.

**Contract**: Delete `signed-in-home.spec.ts` if `critical-path.spec.ts` starts at `/` and uses **Add a book**. Keep it only if the journey is changed to start on `/books/new`.

#### 5. Retire the leftover seed

**File**: `tests/e2e/seed.spec.ts`, `package.json`

**Intent**: Phase 1 kept the seed behind `--grep-invert @seed` instead of deleting it. Finish that retirement so the skipped paragraph-role oracle cannot be copied into the S-07 net.

**Contract**: Lift the working bits into `support.ts` and the new specs: hydration `toPass`, wait for POST 201, unwrap `body.book.id`, `page.request` form-delete with Origin and `maxRedirects: 0`. Delete `tests/e2e/seed.spec.ts`. Set `"test:e2e": "playwright test"` (no `--grep-invert`). Do not copy `getByRole("paragraph")` as the list oracle — assert title text.

### Success Criteria:

#### Automated Verification:

- `npm run test:e2e` passes the journey and Save changes cases on Chromium, Firefox, and WebKit
- Journey asserts the book **title text** on Your TBR and on mood results after **Find my next read**
- Save changes asserts the new title is present and the old title is absent on Your TBR
- No spec asserts CSS classes, snapshots, element counts, or `Edit ${title}` as the only list proof
- Cleanup is helper/form delete with `[e2e]` titles, not the Delete / Permanently delete buttons
- `tests/e2e/seed.spec.ts` is gone; `"test:e2e"` is `playwright test` with no `--grep-invert`
- `npm test` still passes
- `npm run lint` passes

#### Manual Verification:

**2.9 — Add a book, see it on Your TBR, pick it by mood**

**Setup:** Local app running (`npm run dev`) with the usual local database. Sign in as `user-d@example.test` / `password123`.

**Steps:**

1. On the home page, click **Add a book**.
2. Type a title that starts with `[e2e]` (example: `[e2e] Manual journey`), an author, and one trope you will remember. Press Enter so the trope becomes a chip.
3. Click **Add to TBR**. Stay on Add a book.
4. Click **View your TBR**. Confirm that title is on the list.
5. Click **Pick by mood**. Open **Tropes**, tick the trope you just added, click **Find my next read**.
6. Confirm the same title appears in the results.
7. Delete that book (Account is not required — use the book’s Delete → Permanently delete on Your TBR) so user D does not keep leftover `[e2e]` rows.

**Expected:** The book appears on Your TBR after the View your TBR hop, then again in mood results for that trope. Add to TBR does not jump you to the list by itself.

**Pass if:** You saw the title on Your TBR and in mood results, and you removed the leftover book.

**2.10 — Save changes updates the list**

**Setup:** Still signed in as `user-d@example.test`. Add another `[e2e]` book (or reuse the form) so you have one book to edit.

**Steps:**

1. Open that book’s edit page (click **Edit** on Your TBR, or open `/books/…/edit` if you already have the link).
2. Change only the title to a different `[e2e]` name.
3. Click **Save changes**.
4. On Your TBR, confirm the new title is there and the old title is gone.
5. Delete the book.

**Expected:** Save returns you to Your TBR with the new title only.

**Pass if:** The list shows the new title and not the old one, and the leftover book is gone.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: CI gate + cookbook + stale docs

### Overview

Make the browser net a required PR gate in the existing `ci` job, and write down how to add the next e2e case. Refresh the docs that still describe CI as lint + build and e2e as “none yet”.

**Behaviour asserted:** none new in the product — this phase is gates and instructions.
**Regression caught:** a merge that never ran the three-engine net; a future author adding an e2e case that asserts markup.
**Research source:** `research.md` Playwright / CI / Cookbook §6.3; test-plan §5 e2e gate; infrastructure.md drift at `:78` and `:126`.
**Boundary cases:** `npx playwright install --with-deps` before the e2e step; WebKit skip hook stays off unless it goes noisy.
**Anti-pattern avoided:** a second CI job; putting e2e inside `npm test`; treating “full-suite before S-07” as a CI job (it stays a local-once owner run).

### Changes Required:

#### 1. Existing `ci` job

**File**: `.github/workflows/ci.yml`

**Intent**: Run the browser net on every PR and push that already runs `ci`, without changing deploy’s `needs: ci` wiring.

**Contract**: After `npm ci`, browsers are not required until e2e. After the existing `npm test` step and before `npm run build`, add `npx playwright install --with-deps` (or install earlier if you prefer fail-fast on browser download) and `npm run test:e2e`. Do not pass hosted `SUPABASE_URL` / `SUPABASE_KEY` into the e2e step. Do not add a second job. Leave `deploy` as `needs: ci`.

#### 2. Cookbook §6.3

**File**: `context/foundation/test-plan.md` (§6.3)

**Intent**: Replace the TBD with the pattern that actually shipped, so the next e2e case inherits the engine matrix and oracles.

**Contract**: State: files go in `tests/e2e/` as `*.spec.ts` (setup files `*.setup.ts`); run `npm run test:e2e`; reuse `storageState` (do not re-click Sign in except in `auth.setup.ts`); mutate only user D with `[e2e]` titles; clean via the `page.request` helper (explicit Origin on form delete); assert titles, URLs, and product control names; never classes, structure, counts, or snapshots; a new case is added once and inherits Chromium/Firefox/WebKit from config. Mention Docker + local Supabase, the same as integration. Mention the WebKit-on-CI quarantine hook. Do not rewrite §1–§3, §5, or §7.

#### 3. Stale §4 e2e row

**File**: `context/foundation/test-plan.md` (§4 Stack table, e2e row)

**Intent**: The line “e2e none yet — see Phase 4” is false once this change ships.

**Contract**: Point at Playwright (`@playwright/test`), `tests/e2e/`, three engines, and `npm run test:e2e`. Keep the WebKit-on-Linux caveat. Bump the test-plan “Last updated” header if that header is present. Leave §3 Status cells to the orchestrator / archive step.

#### 4. Infrastructure CI description

**File**: `context/foundation/infrastructure.md`

**Intent**: Stop describing CI as lint + build only.

**Contract**: Update the Operational Story deploy sentence (`:78`) and the Out of Scope CI bullet (`:126`) so they name lint, `npm test`, `npm run test:e2e`, and build, in that order. Do not rewrite the rest of the ops story.

#### 5. Command tables

**File**: `AGENTS.md`, `README.md`

**Intent**: Contributors can find `test:e2e` next to the existing test commands.

**Contract**: Add `npm run test:e2e` to the Testing / Scripts lists. Note Docker + `npx playwright install` (once locally). Do not put e2e inside the `npm test` description. README CI sentence should include the new step.

### Success Criteria:

#### Automated Verification:

- `.github/workflows/ci.yml` runs `npx playwright install --with-deps` and `npm run test:e2e` after `npm test` and before `npm run build`; `deploy` still `needs: ci`
- `context/foundation/test-plan.md` §6.3 is no longer TBD
- §4 e2e row no longer says “none yet”
- `infrastructure.md` CI sentences include test + e2e
- `AGENTS.md` and `README.md` list `npm run test:e2e`
- `npm run lint` passes (Prettier on touched `*.md`)

#### Manual Verification:

**3.7 — Confirm GitHub ran the browser net**

**Setup:** This phase is on a branch with a pull request (or the `ci` workflow has been pushed).

**Steps:**

1. Open the GitHub Actions run for this branch.
2. Open the `ci` job (not a new job).
3. Find the step that runs `npm run test:e2e`.
4. Confirm it is after the existing `npm test` step and before build, and that it passed.

**Expected:** One `ci` job. Browser net is in that job. Deploy is unchanged (still waits on `ci`, still only on push to `main`).

**Pass if:** You can point to a green `npm run test:e2e` step inside `ci`.

**3.8 — Cookbook matches what shipped**

**Setup:** Open `context/foundation/test-plan.md` at §6.3.

**Steps:**

1. Read §6.3.
2. Check it says where files go, which command to run, that Sign in is only in setup, that titles use `[e2e]`, and that assertions are titles / URLs / button names — not layout.

**Expected:** A future author could add one spec without copying the seed’s Edit-link oracle.

**Pass if:** §6.3 matches the files that actually landed and no longer says TBD.

**3.9 — Full suite once before the restyle**

**Setup:** Phase 3 is merged or about to merge. The Café Romance restyle has not started.

**Steps:**

1. On your machine, with Docker running, run `npm test`.
2. Run `npm run test:e2e`.
3. Keep that pair as the “full suite” you re-run immediately before starting the restyle, even if CI is already green.

**Expected:** Both commands pass locally. This is the test-plan “full-suite run before S-07” gate — it is not a second GitHub job.

**Pass if:** You have a passing local full-suite run recorded before S-07 work begins (this step may wait until you are ready to start the restyle).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- Reserved-prefix helper: `[integration-test]` and `[e2e]` are allowed; a normal title is not.
- No new product-module units. Filter and mood rules stay in the existing unit files.

### Integration Tests:

- No new integration cases. Phase 2 HTTP suites stay the cheapest proof of filter/search/delete/mood HTML.
- Hygiene must still pass after e2e runs: user D may only hold `[integration-test]` and `[e2e]` titles, and e2e `finally` should leave zero `[e2e]` rows.

### E2E Tests:

- `auth.setup.ts` — the only Sign in click.
- `critical-path.spec.ts` — add → View your TBR → mood.
- `edit-save.spec.ts` — Save changes updates the list set.
- Inherited matrix: Chromium, Firefox, WebKit. Do not duplicate specs per browser.

### Manual Testing Steps:

1. Phase 1: watch `npm run test:e2e` sign in and list three browsers.
2. Phase 2: walk add → Your TBR → mood, then Save changes, as user D; delete leftovers.
3. Phase 3: confirm the GitHub `ci` job ran the browser net; read §6.3; run the local full suite before S-07.

## Performance Considerations

The net is two short cases plus setup, times three engines. CI should use one Playwright worker to avoid hammering one Astro process. Do not add retries beyond Playwright’s CI default of 2. Browser download (`playwright install --with-deps`) is the slow step — run it only in CI and once per local machine, not on every `npm test`.

## Migration Notes

No product data migration. Local user D may already hold leftover `[e2e]-Book-*` rows from the seed experiments — Phase 1 hygiene will stop treating them as illegal, but they can still clutter Your TBR. Delete those rows (or run the e2e helper cleanup against the `[e2e]` prefix) before trusting a mood result that should contain only the journey book.

`playwright/.auth/` stays gitignored. CI creates a fresh storage state every run.

The “full-suite run before S-07” remains a **local-once** owner gate after this change ships, not a GitHub job.

## References

- Related research: `context/changes/testing-critical-path-e2e-net-gates/research.md`
- Test plan: `context/foundation/test-plan.md` §3 Phase 4, §5 e2e gate, §6.3 TBD
- Prior rollout plans: `context/archive/2026-08-23-testing-harness-and-data-integrity/plan.md`, `context/archive/2026-08-29-tbr-surface-behaviour/plan.md`
- Playwright auth + CI (Context7 `/websites/playwright_dev`, 2026-09-06): setup project + `storageState`; `npx playwright install --with-deps`
- Local stack: `tests/integration/support/local-services.ts:16-20`, `:269-349`
- Lessons: `context/foundation/lessons.md` — native HTML on list surfaces; manual tests in tester language
- S-07 rewrite: `context/changes/ui-theme-cafe-romance/change.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Make Playwright actually run

#### Automated

- [x] 1.1 `npm run test:e2e` passes: setup clicks Sign in, smoke runs on Chromium, Firefox, and WebKit — 27b6b63
- [x] 1.2 `tests/e2e/seed.spec.ts` is gone — 27b6b63
- [x] 1.3 Reserved-prefix unit test passes (`npm run test:unit`) — 27b6b63
- [x] 1.4 `npm test` still passes — 27b6b63
- [x] 1.5 `npm run lint` passes — 27b6b63

#### Manual

- [x] 1.6 Watch the local browser net sign in — 27b6b63

### Phase 2: Thin journey + Save changes

#### Automated

- [x] 2.1 `npm run test:e2e` passes the journey and Save changes cases on three engines — 43ba606
- [x] 2.2 Journey asserts title text on Your TBR and on mood results — 43ba606
- [x] 2.3 Save changes asserts new title present and old title absent — 43ba606
- [x] 2.4 No class / snapshot / count / Edit-link-only oracles — 43ba606
- [x] 2.5 Cleanup is helper/form delete with `[e2e]` titles — 43ba606
- [x] 2.6 `tests/e2e/seed.spec.ts` is gone; `test:e2e` has no `--grep-invert` — 43ba606
- [x] 2.7 `npm test` still passes — 43ba606
- [x] 2.8 `npm run lint` passes — 43ba606

#### Manual

- [x] 2.9 Add a book, see it on Your TBR, pick it by mood — 43ba606
- [x] 2.10 Save changes updates the list — 43ba606

### Phase 3: CI gate + cookbook + stale docs

#### Automated

- [x] 3.1 `ci.yml` runs Playwright install + `test:e2e` after `npm test`, before build
- [x] 3.2 Cookbook §6.3 is no longer TBD
- [x] 3.3 §4 e2e row no longer says “none yet”
- [x] 3.4 `infrastructure.md` CI sentences include test + e2e
- [x] 3.5 `AGENTS.md` and `README.md` list `npm run test:e2e`
- [x] 3.6 `npm run lint` passes

#### Manual

- [x] 3.7 Confirm GitHub ran the browser net
- [x] 3.8 Cookbook matches what shipped
- [x] 3.9 Full suite once before the restyle
