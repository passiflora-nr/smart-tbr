# Access Control and Abuse Test Coverage Implementation Plan

## Overview

Complete rollout Phase 3 of the test plan by adding real-HTTP integration coverage for ownership, cross-site
form abuse, signed-out API behavior, and protected-page gating. The work extends the existing Vitest integration
harness and makes the protected-route prefixes a shared app contract so the test cannot drift from middleware.

## Current State Analysis

The production defenses already exist, but no integration test currently exercises them. Book mutations use the
cookie-scoped anonymous Supabase client, authenticate with `getUser()`, and constrain writes by the signed-in user.
Astro's global origin check protects form posts, while middleware redirects signed-out visitors for three protected
prefixes. JSON API handlers authenticate themselves and return JSON rather than inheriting page redirects.

The existing integration project already provides real local Supabase and Astro services, parameterized sign-in,
manual-redirect form posts, user-D fixture creation and cleanup, and an independently authenticated verification
client. The missing pieces are a second read-only attacker session, an optional-Origin form helper, a shared
protected-route list, and the Phase 3 scenarios.

## Desired End State

- A signed-in user cannot update, delete, or open the Edit Book page for another user's temporary book.
- A cross-site or origin-less permanent-delete form submission receives 403 and does not delete the book.
- The same origin barrier is proven for account deletion without deleting a test account.
- Signed-out JSON book mutations return 401 JSON, while signed-out form mutations redirect to sign-in.
- Every current protected page redirects a signed-out visitor, while the home and sign-in pages remain public.
- The protected-page sweep imports the same route prefixes middleware uses.
- Test-plan cookbook sections 6.4, 6.5, and 6.7 describe the patterns that shipped.

### Key Discoveries:

- `src/middleware.ts:4-22` keeps `PROTECTED_ROUTES` private and applies prefix matching with `startsWith`; extracting
  the array is required for a non-duplicated test source.
- `tests/integration/support/http-session.ts:16-34` already signs in any supplied account, so user A needs no new
  authentication helper.
- `tests/integration/support/http-session.ts:74-93` always sends an Origin header; making that argument optional is
  the only helper change needed for the missing-Origin case.
- `tests/integration/support/test-books.ts:84-169` already creates, independently verifies, and cleans up temporary
  user-D books.
- `src/pages/api/books/[id].ts:67-81` and `src/pages/api/books/[id]/delete.ts:41-51` deliberately report a
  wrong-owner id as not found, not forbidden.
- `tests/integration/support/local-services.ts:256` starts Astro with an empty service-role key, but
  `@astrojs/cloudflare` can copy a real `SUPABASE_SERVICE_ROLE_KEY` from `.dev.vars` over that pin. The existing
  `assertDevVarsDoNotOverrideLocalCoordinates` guard only watches `SUPABASE_URL`. Phase 1 must refuse a set
  service-role key before Astro starts, or a skipped origin check can delete user D.
- `astro.config.mjs:17-21` pins `security.checkOrigin: true`; this is the real form-post defense and can only be
  verified through HTTP.

## What We're NOT Doing

- Changing authentication, authorization, ownership, redirect, or account-deletion behavior.
- Adding a shared ownership helper or refactoring the book API handlers.
- Testing Supabase's own Row-Level Security policies or automating `supabase/tests/rls.sql`.
- Proving that the application owner filter works independently while database RLS is also active; the HTTP
  contract is status plus an untouched victim row.
- Adding Playwright, browser automation, a new test project, or npm dependencies.
- Testing cross-origin JSON requests; Astro's origin check applies to form-like content types, not JSON.
- Changing `security.checkOrigin`, cookie SameSite behavior, `assets.run_worker_first`, or production secrets.
- Testing a nonexistent `/bookshelf` route or changing prefix matching to segment matching.
- Asserting CSS, layout, DOM structure, element counts, or snapshots.
- Mutating or deleting user A's six seeded books, or successfully deleting any seeded account.
- Updating roadmap status; `context/foundation/roadmap.md` has no item with Change ID
  `access-controll-and-abuse`.

## Implementation Approach

Use two phases. First, extract the protected-route prefixes, make the existing form helper able to omit Origin, and
add one integration suite that signs in user D as the temporary-book owner and user A as a read-only attacker. Each
blocked action must assert both the response contract and that user D's independent client can still read the same
book. Then update the test-plan cookbook with only the patterns proven by the completed suite.

## Critical Implementation Details

### Ownership oracle

A wrong-owner mutation is intentionally indistinguishable from a missing id. Expect 404 JSON for PUT and a
`not_found` redirect for form delete, then independently prove the user-D row remains. Do not expect 403 and do not
treat a redirect alone as proof.

### Account-delete origin safety

Post `confirmation=DELETE` — the real `ACCOUNT_DELETE_CONFIRMATION_FIELD` /
`ACCOUNT_DELETE_CONFIRMATION_WORD` from `src/lib/account-schema.ts` — so the request would reach account deletion
if the origin barrier regressed. If the response is not 403, fail that case immediately and stop further cases in
the file. Before Astro starts, extend `assertDevVarsDoNotOverrideLocalCoordinates` in
`tests/integration/support/local-coordinates.ts` (called from `local-services.ts:293`) so a set
`SUPABASE_SERVICE_ROLE_KEY` in `.dev.vars` refuses startup. Empty or missing remains allowed. Add the matching
case to `tests/unit/local-coordinates.test.ts`. The 403 still proves the request was stopped before the handler;
the harness guard keeps the fallback non-destructive if the origin check is skipped.

### Route derivation boundary

The table-driven roots must come from the shared production array. Add explicit checks for `/books/new` and a
syntactically valid `/books/<uuid>/edit` URL because those current pages rely on the `/books` prefix; keep home and
sign-in as public controls.

## Phase 1: Access-control integration net

### Overview

Create the shared route contract and one real-HTTP suite for signed-out behavior, two-account isolation, form-origin
abuse, and protected-page gating.

**Behaviour asserted:** blocked requests return the correct JSON, redirect, or 403 contract; the victim book remains
unchanged; protected and public pages separate correctly.

**Regression caught:** a route stops checking its user, treats an RLS-empty mutation as success, accepts a
cross-site delete form, returns HTML to a JSON caller, or falls out of the shared protected-route gate.

**Research source:** `context/changes/access-controll-and-abuse/research.md` Summary, oracle table, and Architecture
Insights.

**Boundary cases:** wrong-owner versus missing id, JSON versus form unauthenticated behavior, hostile versus absent
Origin, protected roots versus nested book pages, and public controls.

**Anti-pattern avoided:** hand-copying the middleware route list, mutating user-A seed data, testing vendor RLS, or
asserting visual markup.

### Changes Required:

#### 1. Share the protected-route prefixes

**Files**: `src/lib/protected-routes.ts` (new), `src/middleware.ts`

**Intent**: Give middleware and the integration sweep one authoritative list without importing Astro runtime modules
into Vitest.

**Contract**: Export the existing `"/books"`, `"/mood"`, and `"/account"` prefixes from a pure module. Middleware
must import that array and retain its current `startsWith` behavior and bare `/auth/signin` redirect. Do not add,
remove, or rename protected routes.

#### 2. Support requests with no Origin header

**File**: `tests/integration/support/http-session.ts`

**Intent**: Reuse the form-post helper for both hostile-Origin and missing-Origin abuse cases.

**Contract**: Make the helper's Origin argument optional and set the header only when a value is supplied. Preserve
the existing content type, cookie, body encoding, manual redirects, and compatibility with all current callers.

#### 3. Refuse a `.dev.vars` service-role key before Astro starts

**Files**: `tests/integration/support/local-coordinates.ts`, `tests/unit/local-coordinates.test.ts`

**Intent**: Keep the account-delete origin canary from deleting user D when `.dev.vars` supplies a real
service-role key and the origin check is skipped.

**Contract**: Extend `assertDevVarsDoNotOverrideLocalCoordinates` so a present, non-empty
`SUPABASE_SERVICE_ROLE_KEY` in the parsed `.dev.vars` map throws before Astro starts. Empty string and missing
key stay allowed. `local-services.ts` already calls this guard — do not add a second startup check. Cover the new
refusal in the existing unit file; do not add a new test project.

#### 4. Add the Phase 3 integration suite

**File**: `tests/integration/access-control.test.ts` (new)

**Intent**: Exercise the application's access boundaries over the same real HTTP path users and hostile form posts
reach.

**Contract**: Reuse the injected local service coordinates and current helpers. Sign in user D as owner and user A
as attacker once per file; user-A credentials may be local constants sourced from `supabase/seed.sql`. Create only
run-prefixed user-D books, pre-clean stale reserved fixtures, clean in `finally` and `afterAll`, sign out the
verification client, and never mutate user-A seed rows.

Cover these cases:

- Signed-out `POST /api/books` and `PUT /api/books/<uuid>` return 401, have JSON content type, narrow through
  `isBookMutationError`, and do not return a sign-in page.
- Signed-out book-delete and account-delete form posts send the local app Origin and return 302 to
  `/auth/signin`, not 401. Do not omit Origin here — a missing or hostile Origin returns 403 before the handler
  can redirect.
- User A PUTs user D's temporary book with a valid title, author, tropes, and description body (reuse the same
  payload shape as `createBookViaApi`): 404 `{ "error": "Book not found" }`; title, author, description, tropes,
  owner, and id remain unchanged when read through user D's verification client. An empty or invalid body returns
  400 before ownership is checked — do not use that as the oracle.
- User A form-deletes user D's temporary book with the correct same-site Origin: redirect contains
  `error=not_found`, never `notice=deleted`, and the row remains.
- User A requests user D's Edit Book page: redirect contains `error=not_found`, response text does not expose the
  temporary title, and the row remains.
- User D submits book delete with `Origin: https://evil.example` and with no Origin: each returns 403, and the row
  remains.
- User D submits account delete with `confirmation=DELETE` and hostile or absent Origin: each returns 403. If the
  status is not 403, fail immediately. Confirm user D can still make an authenticated request afterward.
- Iterate over the imported protected roots and expect a signed-out 302 to `/auth/signin`; also check `/books/new`
  and `/books/<uuid>/edit`.
- Signed-out `GET /` and `GET /auth/signin` remain reachable and are not redirected back to sign-in.

Assertions are limited to status, content type, narrowed JSON, `Location`, selected explanatory text, and persisted
book data. Do not add an HTML parser.

### Success Criteria:

#### Automated Verification:

- Astro-generated types are current: `npx astro sync`
- Focused access-control integration suite passes:
  `npm run test:integration -- tests/integration/access-control.test.ts`
- Full unit and integration gate passes: `npm test`
- Type-aware lint passes: `npm run lint`
- Production build passes: `npm run build`

#### Manual Verification:

**1.6 — Signed-out pages lead to sign-in without blocking public pages**

**Setup:** Start the local app and open it in a private browser window so no account is signed in.

**Steps:**

1. Open the home page at `/`.
2. Open the sign-in page at `/auth/signin`.
3. Open Your TBR at `/books`.
4. Open Add Book at `/books/new`.
5. Open Pick by Mood at `/mood`.
6. Open Account at `/account`.
7. Use the browser Back button to return to the home page.

**Expected:** Home and Sign In open normally. Your TBR, Add Book, Pick by Mood, and Account each send you to Sign
In. Returning to Home still works.

**Pass if:** Every private page leads to Sign In, while Home and Sign In remain available without an account.

**Implementation Note**: After all automated checks pass, pause for the human to complete this safe signed-out walk
before Phase 2. Cross-account and forged-site cases remain automation-only.

---

## Phase 2: Phase 3 cookbook

### Overview

Replace the waiting guidance with the ownership, response-shape, origin, and route-sweep patterns that Phase 1
actually proves.

### Changes Required:

#### 1. Fill the API and route-testing cookbook

**File**: `context/foundation/test-plan.md`

**Intent**: Let future contributors add access-control coverage without rediscovering the two API response styles,
unsafe fixture choices, or the shared route list.

**Contract**:

- Update the document's Last updated date.
- Expand section 6.4 with the two-account pattern: user D owns a reserved temporary row, user A is read-only, wrong
  owner means not found, and a status assertion must be paired with independent proof that the victim row remains.
- In section 6.4, distinguish signed-out JSON mutations (401 JSON) from signed-out form routes (302 sign-in), and
  explain that form-origin checks require real HTTP with hostile and missing Origin values.
- Replace section 6.5's TBD with a table-driven sweep imported from the app's shared protected-route module, explicit
  nested `/books` checks, and public controls. Warn against maintaining a second copy of the protected roots.
- Add Phase 3 notes to section 6.7: do not mutate user-A seeds, do not automate vendor RLS, expect wrong-owner
  not-found behavior, and keep service-role credentials unavailable to integration tests.
- Preserve the frozen strategy in sections 1-5 and leave rollout status changes to the orchestrator/archive flow.

### Success Criteria:

#### Automated Verification:

- Test-plan sections 6.4 and 6.5 contain the shipped API and protected-page recipes, and section 6.5 no longer says
  TBD.
- Changed Markdown files pass formatting:
  `npx prettier --check context/foundation/test-plan.md context/changes/access-controll-and-abuse`

#### Manual Verification:

**2.3 — Cookbook clearly explains safe access-control tests**

**Setup:** Open the Test Plan and find “Adding a test for a new API endpoint,” “Adding a test for a new page or
route,” and “Per-rollout-phase notes.”

**Steps:**

1. Read the API section and check that it clearly separates JSON responses from browser form redirects.
2. Check that it says temporary books belong only to user D and user A is used only as the other signed-in account.
3. Check that a blocked edit or delete must be followed by proof that the original book still exists.
4. Read the page section and check that it tells the reader to use the app's protected-page list rather than typing a
   second list into the test.
5. Read the Phase 3 notes and check that they warn against testing the database provider's own security rules or
   using the service-role key.

**Expected:** The three sections explain what to test, what result to expect, and how to avoid damaging seeded data.

**Pass if:** You could hand these sections to another contributor and they could add a safe access-control check
without guessing which account, response type, or route list to use.

**Implementation Note**: This is the final phase. After formatting passes, pause for the human to confirm the
cookbook read.

---

## Testing Strategy

### Unit Tests:

No unit tests for ownership, origin, cookies, redirects, or middleware — those only exist on the real HTTP
boundary. The existing local-coordinates unit file gains one case: a set `.dev.vars` service-role key is refused.

### Integration Tests:

- One serialized suite using the existing local Supabase and Astro setup.
- User D owns every temporary row; user A acts only through an authenticated HTTP session.
- Every blocked book action checks both response behavior and persisted victim state.
- Signed-out API tests lock the JSON-versus-form split.
- Origin tests cover hostile and absent headers on both permanent-delete forms.
- Route tests import protected roots and add direct checks for current nested book pages.

### Manual Testing Steps:

Phase 1 contains the safe signed-out browser walk. Phase 2 contains the cookbook comprehension check. Deliberate
abuse and cross-account requests are automated so the tester does not need to craft requests or risk seeded data.

## Performance Considerations

The suite adds two sign-ins and a small number of serialized HTTP requests against one temporary book at a time. It
does not change production request work or introduce a performance budget.

## Migration Notes

No database or data migration. Moving the route array is behavior-preserving and must retain the same values and
prefix semantics. Test cleanup remains restricted to user-D titles beginning with `[integration-test]`.

## References

- Related research: `context/changes/access-controll-and-abuse/research.md`
- Test strategy and Phase 3 risk map: `context/foundation/test-plan.md`
- Manual testing format: `context/foundation/manual-testing.md`
- Shared gate today: `src/middleware.ts:4-22`
- JSON ownership behavior: `src/pages/api/books/[id].ts:67-81`
- Form ownership behavior: `src/pages/api/books/[id]/delete.ts:41-51`
- Account deletion fallback: `src/pages/api/account/delete.ts:29-43`
- Account-delete confirmation contract: `src/lib/account-schema.ts:3-4`
- `.dev.vars` startup guard: `tests/integration/support/local-coordinates.ts:46-52`
- Integration HTTP helpers: `tests/integration/support/http-session.ts:16-93`
- Temporary-book helpers: `tests/integration/support/test-books.ts:7-169`
- Existing fixture lifecycle: `tests/integration/books-persistence.test.ts:16-37,153-159`
- Previous rollout plan pattern: `context/archive/2026-08-29-tbr-surface-behaviour/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step
> titles. See `references/progress-format.md`.

### Phase 1: Access-control integration net

#### Automated

- [x] 1.1 Astro-generated types are current: `npx astro sync` — 8c68e91
- [x] 1.2 Focused access-control integration suite passes — 8c68e91
- [x] 1.3 Full unit and integration gate passes: `npm test` — 8c68e91
- [x] 1.4 Type-aware lint passes: `npm run lint` — 8c68e91
- [x] 1.5 Production build passes: `npm run build` — 8c68e91

#### Manual

- [x] 1.6 Signed-out pages lead to sign-in without blocking public pages — 8c68e91

### Phase 2: Phase 3 cookbook

#### Automated

- [x] 2.1 Test-plan sections 6.4 and 6.5 contain the shipped recipes, and section 6.5 no longer says TBD
- [x] 2.2 Changed Markdown files pass formatting

#### Manual

- [x] 2.3 Cookbook clearly explains safe access-control tests
