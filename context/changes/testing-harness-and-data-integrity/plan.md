# Testing Harness and Data-Integrity Core Implementation Plan

## Overview

Establish the first automated test harness for SmartTBR. The change adds a fast Vitest unit tier for the
shared book and mood contracts, plus a production-safe HTTP integration tier that runs the real Astro
development server against local Supabase and proves add/edit data survives persistence and read-back.

The plan also reconciles the recommendation contract before tests freeze it: SmartTBR initially shows up
to three deterministic matches, can reveal further matches in groups of three when the reader explicitly
asks, and resets to three for a new mood selection.

## Current State Analysis

No JavaScript test runner, test script, runner configuration, or CI test step exists. The repository does
have one hand-run SQL isolation suite, `supabase/tests/rls.sql`, but it belongs to the later access-control
rollout and is coupled to user A owning exactly six seeded books.

The code is well-shaped for a two-tier harness:

- `src/lib/book-schema.ts` and `src/lib/mood-selection.ts` are pure TypeScript modules with no
  `astro:env/server` or runtime Supabase dependency.
- `POST /api/books` and `PUT /api/books/[id]` are real JSON routes that can be exercised over HTTP while
  Astro runs in Workerd.
- Local Supabase provides seeded, loginable accounts and a real PostgREST boundary.
- The current `.env` points at hosted Supabase while `.dev.vars` points at local Supabase. Any integration
  setup that inherits ambient file precedence could mutate production.
- The PRD describes a hard three-result maximum, while the shipped mood flow deliberately supports
  progressive expansion and deterministic title-then-id ordering.

## Desired End State

Contributors can run one command to execute the complete Phase 1 test gate and focused commands for unit
or integration tests. Unit tests lock the book validation/normalisation contract and the agreed FR-010
mood behavior. Integration tests start or reuse only the expected local Supabase stack, run Astro on
loopback with explicit local credentials, authenticate through the real app, and prove raw add/edit
payloads persist intact.

Pull requests run the complete test gate between lint and build. The integration harness refuses any
non-loopback Supabase target, does not receive hosted Supabase secrets in CI, mutates only uniquely named
user-D fixtures, and removes those fixtures even after a failed assertion.

The PRD and test plan describe the same recommendation behavior the product and tests enforce.

### Key Discoveries:

- `src/lib/book-schema.ts:4-55` is the one shared client/server contract; only a raw HTTP request can prove
  its server-side transformations still run because browser islands post already-transformed output.
- `src/lib/mood-selection.ts:64-109` contains all FR-010 decision logic as pure functions: any-match,
  deterministic ordering, initial slicing, and progressive expansion.
- `src/pages/api/books.ts:20-77` and `src/pages/api/books/[id].ts:26-84` expose the honest
  request-to-persistence path without requiring test-only application seams.
- `supabase/seed.sql:139-182` provides user D as the safe mutation account; users A and B must remain
  untouched because `supabase/tests/rls.sql:115-118` hard-asserts user A's six-book count.
- `supabase status --output json` exposes the local API URL, database URL, and local publishable/anon key;
  these values can be validated before Astro or a test client starts.
- Vitest 4.1 supports named `test.projects`, project-specific `globalSetup`, and typed
  `project.provide`/`inject`, so unit and integration tiers can share one config without sharing lifecycle.
- `.github/workflows/ci.yml:19-25` has the required insertion seam between lint and build.

## What We're NOT Doing

- No React DOM, jsdom, happy-dom, or island-rendering tier. Pending-trope and paste interaction coverage
  remains in the later TBR-surface/browser phases.
- No Playwright or browser-engine matrix. That remains rollout Phase 4.
- No automation or expansion of `supabase/tests/rls.sql`. Access-control automation remains rollout
  Phase 3.
- No snapshots, CSS-class assertions, DOM-structure assertions, element-count assertions, or visual
  regression testing.
- No test against hosted Supabase, no production credentials in test configuration, and no service-role
  client in the integration suite.
- No database migration, seed-data rewrite, or changes to RLS policies.
- No product fix for PUT requests that omit `description`. PUT remains a full-replacement contract for
  the four editable fields; the integration client sends `description` explicitly.
- No refactor or export of `mergePendingTrope`, and no application-source changes solely to make private
  functions importable.
- No coverage threshold in the first harness. Risk-based behavior is the gate.
- No automatic `supabase db reset` on a contributor's existing local stack. The suite cleans up only its
  own namespaced rows.

## Implementation Approach

Use Vitest 4 with two named Node projects.

The unit project resolves the existing `@/*` alias directly and imports only pure modules. Its fixtures
are small typed objects, and its assertions are derived from the reconciled product contract rather than
copied from implementation branches.

The integration project owns one global lifecycle. It discovers the local stack through the Supabase
CLI, starts the stack only when necessary, verifies exact loopback API/database endpoints, starts Astro
with those values explicitly injected, waits for a health response, and shares serializable connection
details with tests through Vitest's provided context. Teardown stops only child processes the harness
started.

One integration flow uses user D and a unique per-run marker. It posts deliberately unnormalised data
through the real API, reads the stored row through an independently authenticated Supabase client, edits
one logical field through the full PUT contract, reads again, exercises the mood page by title/copy, and
deletes only the marked row in `finally`.

## Critical Implementation Details

### State sequencing

The integration lifecycle must fail closed before any mutation. Discover Supabase coordinates, verify
the API is exactly `http://127.0.0.1:54321` and the database is exactly the local port at
`127.0.0.1:54322`, then start Astro with the verified URL/key and an empty service-role value. Do not
accept an ambient Supabase URL override. Repeat the local-origin assertion before constructing the
independent verification client.

The harness may reuse a healthy local Supabase stack but must record process ownership. It stops
Supabase only when it started Supabase, always stops its Astro child, and preserves enough child output
to explain startup or readiness failures. Cleanup targets only rows owned by user D whose title carries
the suite's reserved prefix; it never resets the database or deletes all of user D's data.

If a mutation through Astro succeeds but the independent local read does not find that id, treat it as a
split-brain safety failure: delete that id through the same authenticated Astro session before failing.
Do not rely on the local client to remove a row the app created against a different Supabase target.

### Timing & lifecycle

Astro must bind to loopback on a test-owned port and pass a bounded readiness probe before tests run.
Authentication is shared within the integration file rather than repeated per test, respecting the
local auth rate limit. The test uses `try/finally` cleanup so a failed read-back assertion cannot leave a
fixture that poisons the next run.

### User experience spec

The tests lock behavior and data, not the current theme markup. Mood-page HTTP assertions may inspect
status, explanatory copy, and which book titles appear, but must not inspect classes, tag nesting,
element counts, or snapshots. This keeps the suite valid through the S-07 theme rewrite.

### Debug & observability

Startup failures must identify which boundary failed: Docker/Supabase unavailable, unsafe Supabase
coordinates, Astro exited early, or readiness timed out. CI logs must show service lifecycle and test
failure context without printing access tokens, cookie values, or database credentials.

## Phase 1: Contract Reconciliation and Unit Harness

### Overview

Make the product oracle unambiguous, install/configure Vitest, and lock the framework-independent book
and mood behavior. This phase deliberately avoids Astro, Docker, and Supabase runtime orchestration.

### Changes Required:

#### 1. Reconcile the mood recommendation requirements

**File**: `context/foundation/prd.md`

**Intent**: Make the requirements match the shipped, owner-approved recommendation flow before tests
turn it into a regression contract.

**Contract**: Update the MVP flow, included scope, US-01/FR-010 wording, recommendation NFR, Business
Logic, and ranking Non-Goal so they consistently state:

- a new mood query initially shows up to three any-match books;
- the reader may explicitly reveal the next three until all current matches are visible;
- submitting a new mood resets the visible result count to three;
- a large valid expansion request is clamped to the finite match total rather than rejected;
- deterministic title-then-id presentation is allowed for stable expansion, while relevance scoring,
  recency weighting, learned ranking, and random shuffling remain out of scope.

Do not alter the 1-3 selected-trope cap or the no-match/empty-state contracts.

#### 2. Reconcile the Phase 1 test oracle

**File**: `context/foundation/test-plan.md`

**Intent**: Remove the hard-cap contradiction from Risk #5 and record the behavior the unit suite must
prove.

**Contract**: Update Risk #5, its response guidance, Phase 1 goal/cookbook placeholder, and relevant
stack notes to distinguish "more than three without an explicit expansion" from valid user-requested
expansion. The oracle must cover opening at three, any-match semantics, deterministic ordering,
expansion in steps of three, reset on a new selection, invalid-count fallback, and finite-total
clamping. Keep the behavior/data-only constraint unchanged.

The detailed integration cookbook remains a Phase 2 edit after the pattern exists.

#### 3. Add the Vitest dependency and commands

**Files**: `package.json`, `package-lock.json`

**Intent**: Make the test harness installable and give contributors stable commands for the complete
gate and each tier.

**Contract**: Add current Vitest as a development dependency. Add:

- `test` as the Phase 1 non-watch unit gate, expanded to the complete gate in Phase 2;
- `test:unit` for the unit project only.

The scripts must use non-interactive run mode and work on Node 22. Do not add a DOM environment,
coverage package, HTTP-mocking package, or process-orchestration dependency.

#### 4. Configure the Node unit project

**File**: `vitest.config.ts` (new)

**Intent**: Establish a type-checked configuration for fast pure-logic tests without loading Astro's
adapter or declaring a project whose tests do not exist yet.

**Contract**: Configure a named `unit` project under Vitest 4's `test.projects` with
`environment: "node"` and a unit-only include pattern. Resolve `@/*` from the repository root without
loading Astro's adapter config. Phase 2 extends this same config with a non-overlapping integration
project after its tests and global setup exist.

#### 5. Lock the shared book contract

**File**: `tests/unit/book-schema.test.ts` (new)

**Intent**: Prove the one shared browser/server schema accepts, rejects, and transforms the data shapes
that protect a 100-book migration.

**Contract**: Table-driven tests cover:

- trimming title, author, description, and each trope;
- blank description becoming `null`;
- empty/duplicate trope removal with first-occurrence order preserved;
- case-distinct trope values remaining distinct;
- required title/author/trope decisions;
- title, author, description, per-trope, and trope-count boundaries;
- unknown fields such as client-supplied `user_id` being stripped;
- response guard acceptance/rejection without unsafe access to `response.json()` values.

Assert accept/reject decisions and normalized values. Assert authored field messages only where the
message itself is a user-facing contract; do not freeze incidental raw Zod wording for wrong primitive
types.

#### 6. Lock the mood-selection contract

**File**: `tests/unit/mood-selection.test.ts` (new)

**Intent**: Protect FR-010's any-match rule and the approved deterministic progressive-expansion
behavior independently of page markup.

**Contract**: Tests cover:

- repeated query-param parsing with trim, empty removal, exact dedupe, and defensive transport bound;
- empty, valid 1-3, and too-many selection results;
- any-match OR semantics, including a book sharing only one of several selected tropes;
- an empty mood selection matching no book;
- case-sensitive exact trope matching;
- title-then-id deterministic ordering without mutating the input array;
- first slice of three, partial final expansion, and finite-total clamping;
- invalid/missing/fractional/small `show` values falling back to three;
- large valid `show` values revealing all finite matches;
- clean first-view URLs and expansion URLs preserving repeated trope values.

For titles tied under base-sensitive collation, assert membership rather than locale-dependent position.

### Success Criteria:

#### Automated Verification:

- Astro-generated types are current: `npx astro sync`
- Unit project passes in run mode: `npm run test:unit`
- Type-aware lint passes for config and tests: `npm run lint`
- Production build remains green: `npm run build`
- Test discovery reports only the intended unit files for the unit project

#### Manual Verification:

**1.6 — Recommendation wording matches the shipped flow**

**Setup:** Start the app locally and sign in as `user-a@example.test` with password `password123`. Open
the **Pick by mood** page.

**Steps:**

1. Select **contemporary**, **enemies-to-lovers**, and **slow burn**, then choose **Find my next read**.
2. Confirm the page initially shows three books.
3. Choose **Show me 3 more** and confirm the remaining matching books appear below the original three.
4. Change the selection to **found family** and choose **Find my next read** again.
5. Read the updated PRD recommendation wording alongside what the page did.

**Expected:** The first query starts with three stable results, asking for more adds the remaining
matches without moving the first three, and a new mood starts from at most three again. The PRD describes
that same behavior and does not describe relevance ranking.

**Pass if:** The written requirement and the visible recommendation flow agree on initial three,
explicit expansion, stable presentation, and reset for a new mood.

**Implementation Note**: After completing this phase and all automated verification passes, pause here
for manual confirmation from the human that the manual testing was successful before proceeding to the
next phase.

---

## Phase 2: Safe HTTP Integration and Required CI Gate

### Overview

Add the local-service lifecycle and the honest request-to-persistence tests, then make both test tiers a
required pull-request gate and document the resulting repository patterns.

### Changes Required:

#### 1. Add the fail-closed local integration lifecycle

**Files**: `tests/integration/global-setup.ts` (new), `tests/integration/support/local-services.ts` (new),
`tests/vitest.d.ts` (new), `tests/unit/local-coordinates.test.ts` (new)

**Intent**: Give integration tests a deterministic Astro + local Supabase boundary without allowing
ambient hosted credentials or leaving child services behind.

**Contract**: The lifecycle must:

- inspect `supabase status --output json` and start the local stack only when it is not healthy;
- use the CLI-reported local publishable key, with the local anon-key field accepted only as the CLI's
  backwards-compatible equivalent;
- export a pure `assertLocalSupabaseCoordinates` (no I/O) that accepts the API and database URLs and
  throws before any client is constructed unless both are the exact configured loopback hosts/ports;
- require those coordinates via that helper before starting any test client;
- start Astro bound to loopback on a test-owned port with explicit `SUPABASE_URL`/`SUPABASE_KEY` and no
  usable service-role key;
- wait for bounded HTTP readiness and fail with captured, redacted child output if Astro exits or times
  out;
- provide the Astro base URL and verified local Supabase connection values through typed
  `project.provide`;
- stop Astro unconditionally and stop Supabase only if this run started it.

`tests/vitest.d.ts` augments Vitest's `ProvidedContext` with only the serializable values provided by
global setup. Do not place secrets in global variables or snapshots.

`tests/unit/local-coordinates.test.ts` imports only the pure helper and proves it rejects a hosted
`*.supabase.co` URL, a non-loopback host, and a wrong local port, without starting Astro or Supabase.

Service exclusions may reduce CI startup cost, but Auth, PostgREST, and Postgres must remain available.
Do not parse `.env` or `.dev.vars` as the source of test coordinates.

#### 2. Add HTTP/session and fixture helpers

**Files**: `tests/integration/support/http-session.ts` (new),
`tests/integration/support/test-books.ts` (new)

**Intent**: Centralize the small pieces that otherwise make an integration test unsafe or
strict-TypeScript-hostile: same-origin sign-in, cookie propagation, unknown JSON narrowing, namespaced
fixtures, independent reads, and cleanup.

**Contract**: The helpers:

- sign in through `POST /api/auth/signin` as `application/x-www-form-urlencoded` (or `FormData`) with
  `Origin` exactly equal to the Astro origin, `redirect: "manual"`, and every `Set-Cookie` collected
  from the 302 before following; reuse that full cookie header on later requests;
- expose JSON parsing as `unknown` and narrow through existing book mutation guards;
- create an authenticated Supabase verification client using only the verified local publishable/anon
  key and user-D credentials;
- generate a unique reserved title prefix per run;
- pre-clean and final-clean only user-D books carrying that reserved prefix;
- expose a same-origin form `POST /api/books/{id}/delete` (Origin header and form encoding, no
  redirect-follow until every `Set-Cookie` is captured) used only when Astro created a row the local
  client cannot see;
- never issue a broad delete, database reset, service-role request, or mutation against users A/B.

Cookie values, access tokens, and connection credentials must never appear in assertion output or logs.

#### 3. Prove add/edit persistence and mood behavior over HTTP

**File**: `tests/integration/books-persistence.test.ts` (new)

**Intent**: Protect the highest-risk path with one cohesive scenario: raw request, server
normalisation, persisted row, full-replacement edit, independent read-back, and recommendation use.

**Contract**: Against user D, the test:

1. Removes only stale rows carrying the reserved test prefix.
2. Sends a deliberately unnormalised JSON `POST /api/books` containing padded fields, blank and
   duplicate tropes, and case-distinct tropes.
3. Asserts the 201 response through the existing response guard.
4. Independently selects the returned id through the authenticated local Supabase client and verifies
   normalized title/author/description plus exact ordered tropes. If this local select misses after a
   201, delete that id through the Astro session, then fail as a safety error — do not continue.
5. Sends a full four-field raw `PUT /api/books/{id}` that changes one logical field while preserving the
   other values.
6. Independently reads again and verifies the edited field, unchanged fields, id, owner, and
   `created_at`; verifies `updated_at` does not move backwards.
7. Requests `/mood` with one stored trope and verifies the created book title appears.
8. Requests `/mood` with a stale non-matching trope and verifies the explanatory no-match copy.
9. Cleans the created row in `finally`, then verifies the reserved row is absent.

A second case in the same file inserts a namespaced row, throws, and then asserts the reserved prefix
is gone — so cleanup-after-error is a failing test if `finally` is omitted, not a comment.

Assertions target statuses, normalized data, ownership invariants, book titles, and explanatory copy
only. They do not target HTML structure or styling.

#### 4. Complete the project scripts and Vitest integration project

**Files**: `package.json`, `vitest.config.ts`

**Intent**: Make focused and complete test commands invoke the correct project lifecycle.

**Contract**: Add the named `integration` project with a non-overlapping include pattern,
`environment: "node"`, and its global setup. Add `test:integration` for that project and expand
`npm test` to run both named projects in non-watch mode. The integration project uses a timeout sized
for local Docker/Astro startup without weakening unit-test timeouts. Parallelism must not permit two
integration workers to mutate the same fixture namespace.

#### 5. Make the full suite a pull-request gate

**File**: `.github/workflows/ci.yml`

**Intent**: Catch pure-logic and real persistence regressions before merge.

**Contract**: Add `npm test` after `npm run lint` and before `npm run build`. The test step receives no
hosted `SUPABASE_URL`, `SUPABASE_KEY`, or service-role secret. It relies on the repository's Supabase CLI
dependency and the GitHub Ubuntu runner's Docker service. Existing build-only Supabase secrets remain
scoped to the build step.

The CI run must fail if local services cannot start, if safety validation rejects the coordinates, if
fixtures fail to load, or if either project fails.

#### 6. Publish the established testing cookbook

**Files**: `context/foundation/test-plan.md`, `AGENTS.md`, `README.md`

**Intent**: Replace Phase 1 placeholders with patterns future rollout phases can follow without
rediscovering setup, safety, or assertion boundaries. Keep the agent onboarding doc and README CI
chain in sync with the new scripts.

**Contract**: Update:

- the Stack table with the installed Vitest version and the chosen raw-HTTP/local-Supabase boundary;
- Quality Gates if command names need clarification, without weakening unit/integration requirements;
- **6.1 Adding a unit test** with project location, focused command, typed-fixture, and behavior-only
  guidance;
- **6.2 Adding an integration test** with local-service lifecycle, user-D namespacing, independent
  read-back, and cleanup requirements;
- **6.4 Adding a test for a new API endpoint** with real HTTP/session use and unknown JSON narrowing;
- **6.7 Per-rollout-phase notes** with the production-env hazard and the decision to keep RLS/DOM work
  in later phases;
- Phase 1 status to reflect implementation completion only when all plan criteria pass.
- `AGENTS.md` Testing section and CI command chain so they no longer say the repo has no runner;
- `README.md` command table and CI line so they include `npm test` / `test:unit` / `test:integration`
  between lint and build.

Do not fill the Phase 2-4 cookbook sections before their own patterns ship.

### Success Criteria:

#### Automated Verification:

- Astro-generated types are current: `npx astro sync`
- Focused unit suite passes: `npm run test:unit`
- Focused integration suite passes against local services: `npm run test:integration`
- Complete required gate passes: `npm test`
- Integration safety checks reject a hosted Supabase URL before any mutation
- Integration cleanup leaves no reserved user-D fixture after success or a deliberately thrown scenario error
- Type-aware lint passes: `npm run lint`
- Production build passes: `npm run build`
- CI runs `npm ci → npx astro sync → npm run lint → npm test → npm run build` successfully

#### Manual Verification:

**2.10 — Normal local add, edit, and mood flow still works**

**Setup:** Ensure the local Supabase stack is running. Start the app normally with `npm run dev`, sign in
as `user-d@example.test` with password `password123`, and open **Your TBR**.

**Steps:**

1. Confirm no book with a title beginning with the integration-test prefix is visible.
2. Choose **Add a book** and add a temporary book with a title you will recognize, an author, two
   tropes, and a description.
3. Open **Your TBR**, choose **Edit** for that book, change only its description, and save.
4. Confirm the title, author, and both tropes are unchanged while the new description is visible.
5. Open **Pick by mood**, select one of the temporary book's tropes, and submit.
6. Confirm the temporary book appears in the recommendations.
7. Return to **Your TBR** and delete the temporary book.

**Expected:** The normal development app signs in, adds, edits, recommends, and deletes as before. No
automated-test fixture is visible, and editing the description does not alter the other book fields.

**Pass if:** The complete temporary-book flow succeeds and user D is clean again after deletion.

**Implementation Note**: This is the final phase. After all automated verification passes, pause for the
human to complete the manual flow and confirm CI before marking the change implemented.

---

## Testing Strategy

### Unit Tests:

- `book-schema.test.ts` owns field acceptance, rejection, normalization, boundaries, and safe response
  narrowing.
- `mood-selection.test.ts` owns query parsing, 1-3 selection validation, exact any-match semantics,
  deterministic order, opening slice, expansion, reset-link construction, and count boundaries.
- `local-coordinates.test.ts` owns the fail-closed loopback allowlist, including hosted and
  non-loopback rejection, without starting services.
- Unit fixtures remain independent of Supabase seeds so failures point to product logic rather than
  local-service state.

### Integration Tests:

- One HTTP scenario crosses the real Astro/Workerd JSON route and local Supabase persistence boundary.
- Independent reads verify storage rather than trusting route response bodies.
- The mood HTTP checks assert which title appears and the no-match explanation, never page structure.
- Local-target rejection lives in `local-coordinates.test.ts`; cleanup-after-error lives as a
  second case in `books-persistence.test.ts`. Both are failing tests if omitted, not comments.
- The integration file owns one session per channel and one namespaced fixture lifecycle to avoid auth
  rate limits and cross-test state.

### Manual Testing Steps:

1. After Phase 1, verify the mood page's opening three, expansion, and reset behavior match the amended
   PRD.
2. After Phase 2, run the user-D temporary-book add/edit/mood/delete flow.
3. Confirm no reserved automated-test title is visible in user D's TBR.
4. Confirm the pull request's CI job passes the new test step before build.

## Performance Considerations

Unit tests should complete in seconds. Integration startup is dominated by local Supabase Docker images;
the harness should reuse an already healthy local stack and may exclude services unrelated to Auth,
PostgREST, and Postgres. The test body signs in once per channel and uses one book fixture, so runtime
after readiness is small.

The CI cost is accepted because request-to-persistence is a required gate after rollout Phase 1. Keep the
integration project serialized and narrow rather than adding more server startups per test file.

No latency assertion is added for the product's two-second mood guardrail; wall-clock assertions in
shared CI are noisy and were deliberately excluded from the test strategy.

## Migration Notes

No application or database migration is required. The change adds development tooling, test files,
documentation, and a CI step.

Rollback is a normal code revert: remove the Vitest dependency/config/tests/scripts and the CI test
step, then restore the prior PRD/test-plan wording only if the product behavior is also reverted. Test
cleanup never changes committed seed files or production data.

## References

- Related research: `context/changes/testing-harness-and-data-integrity/research.md`
- Rollout strategy: `context/foundation/test-plan.md`
- Requirements to reconcile: `context/foundation/prd.md:53-89,118-150,158-173`
- Shared validation contract: `src/lib/book-schema.ts:4-110`
- Mood-selection contract: `src/lib/mood-selection.ts:4-125`
- Add route: `src/pages/api/books.ts:6-78`
- Edit route: `src/pages/api/books/[id].ts:6-85`
- Mood state machine: `src/pages/mood.astro:22-90,145-183`
- Local stack configuration: `supabase/config.toml:5-65,150-210`
- Seed fixtures: `supabase/seed.sql:4-182`
- Existing later-phase isolation proof: `supabase/tests/rls.sql:1-131`
- CI insertion seam: `.github/workflows/ci.yml:19-25`
- Manual testing format: `context/foundation/manual-testing.md`
- Vitest 4.1 projects/global setup/provided context: Context7 `/vitest-dev/vitest/v4.1.6`
- Astro 6 testing baseline: Context7 `/withastro/astro/astro_6.3.1`
- Supabase CLI local lifecycle/status output: Context7 `/supabase/cli`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Contract Reconciliation and Unit Harness

#### Automated

- [x] 1.1 Astro-generated types are current — 44362e2
- [x] 1.2 Unit project passes in run mode — 44362e2
- [x] 1.3 Type-aware lint passes for config and tests — 44362e2
- [x] 1.4 Production build remains green — 44362e2
- [x] 1.5 Unit project discovers only intended unit files — 44362e2

#### Manual

- [x] 1.6 Recommendation wording matches the shipped flow — 44362e2

### Phase 2: Safe HTTP Integration and Required CI Gate

#### Automated

- [x] 2.1 Astro-generated types are current — e692436
- [x] 2.2 Focused unit suite passes — e692436
- [x] 2.3 Focused integration suite passes against local services — e692436
- [x] 2.4 Complete required test gate passes — e692436
- [x] 2.5 Hosted Supabase coordinates are rejected before mutation — e692436
- [x] 2.6 Reserved fixtures are cleaned after success and scenario errors — e692436
- [x] 2.7 Type-aware lint passes — e692436
- [x] 2.8 Production build passes — e692436
- [ ] 2.9 CI passes with tests between lint and build

#### Manual

- [x] 2.10 Normal local add, edit, and mood flow still works — e692436
