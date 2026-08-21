# Account Lifecycle — Gating and Self-Serve Deletion Implementation Plan

## Overview

Deliver S-06: close the route-gating gap and ship a self-serve, irreversible account deletion. A signed-in user opens a new gated `/account` page, types a confirmation word into a dialog, and permanently deletes their auth user. Postgres' existing `on delete cascade` removes every book and trope tag they own, the session ends, and they land on the public home page with a one-time confirmation message.

This satisfies FR-013 (permanent self-serve delete + cascade + explicit confirmation + session end) and completes FR-003 / Access Control route gating.

## Current State Analysis

**Gating is already ~90% done.** `PROTECTED_ROUTES = ["/books", "/mood"]` (`src/middleware.ts:4`) covers every TBR surface via prefix match, so `/books/new` and `/books/[id]/edit` are gated too. `src/pages/books/index.astro:37-39` additionally self-redirects. F-01 deferred gating to S-06 on paper, but S-01 and S-05 did the work first. The only remaining gating gap is the new `/account` path this slice creates.

**The cascade is already decided.** `supabase/migrations/20260705084406_create_books.sql:6,9` declares `user_id uuid not null references auth.users (id) on delete cascade`, and tropes are a `text[]` column on `books` rather than a separate table. The roadmap's open unknown (`context/foundation/roadmap.md:193`, "FK cascade vs auth-user deletion hook") is **stale** — F-01 resolved it. Research is explicit that adding a second cleanup path (a trigger, or an application-level `books.delete()` alongside the cascade) has caused `Database error deleting user` when the two race.

**What genuinely does not exist yet:**

- No `/account`, `/settings`, or `/profile` route, and no link to one anywhere.
- No admin/service-role Supabase client. `src/lib/supabase.ts:6-24` builds one cookie-scoped `createServerClient` with the anon key and returns `null` when env is unset.
- No `SUPABASE_SERVICE_ROLE_KEY` — the Astro env schema (`astro.config.mjs:22-27`) declares only `SUPABASE_URL` and `SUPABASE_KEY`, both anon-tier.
- No message mechanism on the public home page. `src/components/Welcome.astro` renders a signed-out marketing view and a signed-in hub, neither of which can display a notice.

**Constraints discovered:**

- **No shared navigation.** `Topbar.astro` renders only on home (`Welcome.astro:30`). `/books`, `/mood`, `/books/new`, and `/books/[id]/edit` each hand-roll a `flex flex-wrap gap-2` row of anchors ending in a shared `SignOutButton.astro`. Five places to touch.
- **`security.checkOrigin: true` is pinned** (`astro.config.mjs:21`) specifically because cookie-authenticated HTML form POSTs are forgeable without it. The account-delete POST is the same class of request.
- **`assets.run_worker_first: ["/api/*"]`** (`wrangler.jsonc:12`) — the new route must live under `/api/` or it will be served by Static Assets and return 1003/403.
- **Human approval gate on Supabase keys.** `context/foundation/infrastructure.md:83` lists rotating Supabase keys as human-gated, and `context/foundation/lessons.md:26-30` requires asking for a secret immediately rather than marking the step blocked and moving on.

## Desired End State

A signed-in user sees an **Account** link in the navigation of every signed-in page. Opening it shows their email address and a clearly separated danger zone. Choosing to delete opens a confirmation dialog that requires typing `DELETE` before it will proceed. On confirmation, the account and every book and trope belonging to it are permanently gone, the session is over, and the public home page shows "Your account and all your books have been deleted." Signing in again with those credentials fails — the account no longer exists.

A signed-out visitor who types `/account` (or any TBR URL) directly into the address bar is redirected to the sign-in page.

**Verification:** manual deletion of a throwaway account, confirmed by (a) the books row count for that user dropping to zero in Supabase Studio, (b) sign-in with those credentials failing, and (c) a second account's TBR being completely unaffected.

### Key Discoveries:

- Cascade already guaranteed at the database layer — `supabase/migrations/20260705084406_create_books.sql:6,9`.
- **Do not** pass the service-role key into `createServerClient`. `@supabase/ssr` attaches the user's session JWT as the `Authorization` header, which overwrites the elevated token and produces `AuthApiError: User not allowed`. Admin work needs a plain `createClient` from `@supabase/supabase-js` with `auth: { autoRefreshToken: false, persistSession: false }` and no cookie plumbing (`research.md` Layer 1).
- `shouldSoftDelete` defaults to `false` on `auth.admin.deleteUser`, which is the hard delete FR-013 requires — no flag needed.
- Existing env vars are `optional: true` and null-checked at the call site (`astro.config.mjs:24-25`, `src/lib/supabase.ts:7-9`), which is why CI builds succeed without real values. Following that pattern means **no dummy value is needed in CI** for the new key.
- The flash-message pattern is established: API route redirects with a query param → page converts it to a short-lived `httpOnly` cookie and redirects again → next render reads and deletes the cookie (`src/pages/books/index.astro:21-87`). This keeps messages out of shareable URLs and out of refreshes.
- The confirm dialog is CSS-only: `.delete-modal`, `.delete-modal:target`, `.delete-modal-backdrop`, `.delete-modal-panel` in `src/styles/global.css:141-173`. Reusable with zero new CSS and zero JavaScript.
- `DeleteBookModal.astro:9-15` documents why `dismissHref` must point at a real element near the trigger: a `:target` panel is `display: none` the instant the fragment changes, so focus falls to the document and keyboard users restart tabbing from the top.
- `zod` v4 is installed and used with the `.transform().pipe()` idiom and custom `{ error: ... }` messages (`src/lib/book-schema.ts:4-48`).

## What We're NOT Doing

- **No new npm packages.** No shadcn Alert Dialog, no `radix-ui`, no `sonner`, no Better Auth, no GDPR/DSR package, no `@supabase/server`. Research surveyed all of these and ruled them out.
- **No second cleanup path.** No delete trigger, no `.from("books").delete()` before the auth delete. One mechanism only: delete the auth user, let Postgres cascade.
- **No Supabase Edge Function.** The Admin API call runs in the existing Astro `/api/*` Worker route.
- **No mitigation of the leftover-JWT window.** An already-issued access token stays valid until its `exp`. Deleting the user invalidates refresh tokens via the `auth.sessions` cascade, and `signOut()` clears this browser. Accepting that window is the documented Supabase position; adding short JWT expiry or a `session_id` check against `auth.sessions` is not worth it for v1.
- **No account recovery, undo, grace period, or soft delete.** FR-007 already set the precedent that deletion in this product is immediate and permanent.
- **No data export before deletion.** Explicit PRD Non-Goal.
- **No password change, email change, or any other account setting.** The Account page ships with email display and the danger zone only.
- **No "return to where you were" redirect after sign-in.** Not part of the S-06 outcome.
- **No theme work.** The Account page uses the current cosmic classes like every other page; S-07 restyles everything later.
- **No key rotation.** `SUPABASE_KEY` stays the anon key. We are adding a second secret, not changing the first.

## Implementation Approach

Two Supabase clients, two keys, strictly separated:

| Purpose | Client | Key |
| --- | --- | --- |
| Prove who is asking; end the session | existing cookie `createServerClient` (`src/lib/supabase.ts`) | anon `SUPABASE_KEY` |
| Delete the auth user | new cookie-free `createClient` (`src/lib/supabase-admin.ts`) | `SUPABASE_SERVICE_ROLE_KEY` |

The service-role client is only ever constructed inside the delete route. It never touches a TBR query, never enters a React island, and is never passed to `createServerClient`. Mixing the two is the documented primary failure mode for this feature.

The request flow: gated `/account` page → CSS `:target` confirm dialog with a text input → form POST to `/api/account/delete` → cookie client `getUser()` → zod-validate the typed word → admin client `deleteUser(user.id)` → Postgres cascades `books` → cookie client `signOut()` (failure tolerated) → flash cookie → redirect to `/`.

Phases are ordered so each one ends in something the tester can actually check: the key is in place before any code needs it, the page exists and is gated before it can delete anything, and the destructive path lands last.

## Critical Implementation Details

**Ordering and failure tolerance in the delete route.** Capture `user.id` before the admin delete — after it, the cookie client can no longer resolve a user. Then call `signOut({ scope: "local" })` so success does not depend on the server accepting a token for a deleted user. Swallow both a returned `{ error }` and a thrown exception: supabase-js still removes the local session on 401/403/404 (the usual post-delete responses) and on network failure. Do **not** add a fallback that deletes cookies by guessed `sb-*` names — there is no in-repo helper, and middleware `getUser()` still yields a signed-out UI if a cookie lingered. The route must redirect to the success confirmation regardless. Treating a failed post-delete `signOut()` as a failure would report a successful, irreversible deletion as an error.

**Confirmation is validated server-side, not in the browser.** The typed word is checked in the API route with zod, not by enabling/disabling a button with JavaScript. This keeps the page working with JavaScript off (consistent with the rest of the app) and means the confirmation cannot be bypassed by manipulating the client. A wrong or missing word is a redirect back to `/account` with an error banner, not a silent no-op.

**Focus management on the CSS dialog.** `dismissHref` must point at a real element id near the trigger on `/account`, for the reason documented in `DeleteBookModal.astro:9-15`. Do not use `#` or the bare page URL.

## Phase 1: Service-Role Key Provisioning

### Overview

Get `SUPABASE_SERVICE_ROLE_KEY` declared, documented, and present in all four environments (local dev, CI build, Worker runtime, GitHub) before any code depends on it. Nothing in later phases can silently stall on a missing secret.

**This phase requires the project owner.** Only they can read the key from the Supabase dashboard. Per `context/foundation/lessons.md:26-30`, ask for it immediately — do not mark this blocked and continue to Phase 2.

### Changes Required:

#### 1. Astro env schema

**File**: `astro.config.mjs`

**Intent**: Declare the new key so `astro:env/server` exposes it to Worker code and refuses to expose it to the client.

**Contract**: Add `SUPABASE_SERVICE_ROLE_KEY` to `env.schema` as `envField.string({ context: "server", access: "secret", optional: true })` — matching the two existing entries exactly. `optional: true` is load-bearing: it keeps `npm run build` and CI green without a dummy value, and shifts the missing-key case to a runtime null check, which is the convention already used for the anon client.

#### 2. Local secret placeholders

**File**: `.env.example`

**Intent**: Document the third variable so a fresh clone knows to supply it.

**Contract**: Add a `SUPABASE_SERVICE_ROLE_KEY=###` line alongside the two existing placeholders. The owner then copies the real value into `.dev.vars` (read by workerd for `npm run dev`) and, if using the Supabase CLI, `.env`. Both files are gitignored — never commit the real value.

#### 3. CI and deploy pipeline

**File**: `.github/workflows/ci.yml`

**Intent**: Make the key available to the Worker at runtime in production.

**Contract**: Add `SUPABASE_SERVICE_ROLE_KEY` to the `secrets:` list of the `cloudflare/wrangler-action@v3` step and to that step's `env:` block, mirroring how `SUPABASE_URL` / `SUPABASE_KEY` are handled at `.github/workflows/ci.yml:51-56`. The `npm run build` steps do **not** need it, because the env field is optional — do not add it there.

#### 4. Owner-run secret commands

**File**: — (dashboard and CLI actions, no repo file)

**Intent**: Put the real value where the running Worker and CI can read it.

**Contract**: Supabase dashboard → Settings → API → copy the secret / `service_role` key (either a legacy `service_role` JWT or a current `sb_secret_…` value works; both are valid until the end-of-2026 legacy deprecation). Then `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY` for the Worker, and add a GitHub repository secret of the same name. **Critical:** do not let the Cloudflare Supabase integration overwrite `SUPABASE_KEY` with the service-role value — that would bypass Row-Level Security on every TBR query in the app.

### Success Criteria:

#### Automated Verification:

- Env sync succeeds: `npx astro sync`
- Linting passes: `npm run lint`
- Build passes with the key absent (proves `optional: true` works): `npm run build`

#### Manual Verification:

**1.5 — Local dev still starts with the new key present**

**Setup:** Ask the agent for nothing here — you supply the key. Open the Supabase dashboard for the SmartTBR project, go to **Settings → API**, and copy the **secret** (also labelled `service_role`) key. Paste it into your local `.dev.vars` file as a new line `SUPABASE_SERVICE_ROLE_KEY=` followed by the value.

**Steps:**
1. Stop the dev server if it is running.
2. Run `npm run dev` and open `http://localhost:4321`.
3. Sign in with a test account from `supabase/seed.sql`.
4. Open your TBR list and confirm your books still appear.
5. Open the mood picker, choose a trope, and confirm you still get results.

**Expected:** The app behaves exactly as it did before — sign-in works, books load, mood picking works. Nothing visible has changed.

**Pass if:** You can sign in and see your own books, with no new errors on any page.

**1.6 — Production still healthy after the secret is set**

**Setup:** You will need access to the Cloudflare and GitHub dashboards.

**Steps:**
1. Run `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY` and paste the same value when prompted.
2. Run `npx wrangler secret list` and confirm `SUPABASE_SERVICE_ROLE_KEY` is in the list.
3. In GitHub, go to the repository **Settings → Secrets and variables → Actions** and add a repository secret named `SUPABASE_SERVICE_ROLE_KEY` with the same value.
4. Open `https://smart-tbr.nicole-rozanska93.workers.dev` and sign in.
5. Open your TBR list.

**Expected:** The live site loads, sign-in works, and your books appear. Confirm that `SUPABASE_KEY` in Cloudflare was **not** changed — it must still be the anon/publishable key, not the secret one. `wrangler secret list` shows the new secret name.

**Pass if:** The live site works exactly as before, `SUPABASE_KEY` is untouched, and the Worker secret list includes `SUPABASE_SERVICE_ROLE_KEY`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Gated Account Page and Navigation

### Overview

Ship the `/account` page showing the signed-in email, protect it against signed-out access, and add an **Account** link to all five navigation locations. No deletion capability yet — this phase is entirely safe to test, and it isolates the multi-file nav churn from the destructive logic.

### Changes Required:

#### 1. Account page

**File**: `src/pages/account.astro`

**Intent**: A gated page showing who you are signed in as, with a visually separated danger zone that will hold the delete control in Phase 3.

**Contract**: Server-rendered `.astro` page wrapped in `Layout`. Reads `Astro.locals.user`; redirects to `/auth/signin` if absent, mirroring the belt-and-braces self-redirect at `src/pages/books/index.astro:37-39`. Renders the same `flex flex-wrap gap-2` nav row used by the other signed-in pages (links to TBR, mood, Home, plus `SignOutButton`), the user's email, and an empty danger-zone section. Uses existing cosmic Tailwind classes — no theme work.

#### 2. Route gating

**File**: `src/middleware.ts`

**Intent**: Make `/account` require a session, the same way `/books` and `/mood` do.

**Contract**: Add `"/account"` to the `PROTECTED_ROUTES` array at line 4. This is the only place route gating is configured; do not add gating logic anywhere else.

#### 3. Navigation links

**Files**: `src/components/Topbar.astro`, `src/pages/books/index.astro`, `src/pages/mood.astro`, `src/pages/books/new.astro`, `src/pages/books/[id]/edit.astro`

**Intent**: Make the Account page reachable from every signed-in surface, since this app has no shared nav component.

**Contract**: Add an `Account` anchor to `/account` in each nav row, styled identically to the sibling anchors in that row and positioned immediately before the sign-out control. In `Topbar.astro` the row uses the `text-purple-300` link style rather than the bordered button style — match the local convention in each file, not a single global one. In `src/pages/books/[id]/edit.astro` the link must also carry the `data-unsaved-guard` attribute, as the sibling Home link does at line 74, so navigating away from a half-edited book still warns the user.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type checking passes: `npx astro check`
- Build passes: `npm run build`

#### Manual Verification:

**2.4 — Account page is reachable from everywhere**

**Setup:** Run `npm run dev` and sign in at `http://localhost:4321` with a test account from `supabase/seed.sql`.

**Steps:**
1. On the home page, find the **Account** link in the strip at the top and click it.
2. Confirm the page shows your email address.
3. Go back and open **View your TBR**. Find and click **Account** in the row of buttons.
4. Repeat from the **Pick by mood** page.
5. Repeat from the **Add a book** page.
6. Open any book's edit page and repeat.

**Expected:** An **Account** link appears on all five pages, and each one opens a page showing your signed-in email address.

**Pass if:** You can reach the Account page from every signed-in page, and it shows the right email.

**2.5 — Account page is blocked when signed out**

**Setup:** Start signed in.

**Steps:**
1. Click **Sign out**.
2. Type `http://localhost:4321/account` directly into the address bar and press Enter.
3. Note where you land.
4. Sign in again, then click **Account** to confirm it opens normally.

**Expected:** While signed out, requesting the Account page sends you straight to the sign-in page and never shows any account information. After signing in, the page opens normally.

**Pass if:** A signed-out visitor is redirected to sign-in and sees no email address.

**2.6 — Unsaved-changes warning still works on the edit page**

**Setup:** Sign in and open the edit page for any book.

**Steps:**
1. Change the title in the form but do not save.
2. Click the new **Account** link.

**Expected:** You get the same warning about leaving with unsaved changes that the **Home** link already produces.

**Pass if:** The Account link warns about unsaved changes just like Home does.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Account Deletion End to End

### Overview

The destructive path: admin client, delete API route with server-side type-to-confirm, the confirmation dialog, the failure banner on `/account`, and the success message on the public home page.

### Changes Required:

#### 1. Service-role Supabase client

**File**: `src/lib/supabase-admin.ts` (new)

**Intent**: A cookie-free, elevated Supabase client used for exactly one thing — Admin Auth calls — kept in its own module so it can never be confused with the request-scoped anon client.

**Contract**: Export `createAdminClient(): SupabaseClient<Database> | null`. Uses `createClient` from `@supabase/supabase-js` (**not** `createServerClient` from `@supabase/ssr`), with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `astro:env/server`, and `auth: { autoRefreshToken: false, persistSession: false }`. Returns `null` when either env var is unset, matching `src/lib/supabase.ts:7-9`. Takes no `Headers` or `AstroCookies` arguments — the absence of a cookie parameter is the guardrail that keeps a session JWT from ever overwriting the elevated token. Do not set the `accessToken` option; it disables the entire `auth` namespace.

Add a file-top comment recording the invariant: this client bypasses Row-Level Security, must only be imported by `src/pages/api/account/delete.ts`, and must never be imported by a React island or used for TBR queries.

#### 2. Confirmation-word validation

**File**: `src/lib/account-schema.ts` (new)

**Intent**: Centralise the typed-confirmation rule so the route and the dialog agree on the required word.

**Contract**: Export the confirmation word constant (`DELETE`) and a zod schema that trims the submitted value and requires an exact match, following the `.transform().pipe()` + `{ error: ... }` idiom in `src/lib/book-schema.ts:4-48`. The dialog imports the constant for its label so the instruction and the check can never drift.

#### 3. Delete API route

**File**: `src/pages/api/account/delete.ts` (new)

**Intent**: The single server-side entry point that verifies the caller, validates the confirmation, deletes the auth user, ends the session, and redirects with the right message.

**Contract**: `POST` handler under `/api/` (so `run_worker_first` routes it to the Worker) accepting `application/x-www-form-urlencoded`. Sequence:

1. Cookie client `getUser()` — no user, or a null client, redirects to `/auth/signin`. Use `getUser()`, not `getClaims()`: this must hit the Auth server for a live record, not trust a JWT.
2. Validate the submitted confirmation word. Mismatch → redirect to `/account?error=confirm_mismatch`.
3. `createAdminClient()` — null → log and redirect to `/account?error=delete_failed`.
4. `auth.admin.deleteUser(userId)` with the id captured in step 1. Error → `console.error` and redirect to `/account?error=delete_failed`. **No `books` delete call anywhere** — the FK cascade owns that.
5. Sign out via the cookie client with `signOut({ scope: "local" })`, swallowing `{ error }` and throws, then redirect to `/?notice=account_deleted`. Do not add a manual cookie-name sweeper.

Return redirects rather than JSON: this is a form-post route, matching `src/pages/api/books/[id]/delete.ts`.

#### 4. Confirmation dialog

**File**: `src/components/account/DeleteAccountModal.astro` (new)

**Intent**: A no-JavaScript confirmation dialog that states plainly what will be destroyed and requires typing a word before the form can be submitted meaningfully.

**Contract**: Reuses the existing `.delete-modal` / `.delete-modal-panel` / `.delete-modal-backdrop` classes from `src/styles/global.css:141-173` — no new CSS. Same structure as `DeleteBookModal.astro:26-68`: `role="dialog"` without `aria-modal` (a CSS-only dialog cannot make the page inert), a backdrop anchor and a Cancel anchor both pointing at `dismissHref`, and a `method="POST"` form to `/api/account/delete`. Adds a labelled text input for the confirmation word whose `name` matches what the route parses. Copy must name the consequences: the account, every book, and every trope tag are permanently removed and cannot be recovered.

#### 5. Account page danger zone and error banner

**File**: `src/pages/account.astro`

**Intent**: Wire the trigger and dialog into the page, and surface deletion failures.

**Contract**: Add a `:target` trigger anchor in the danger zone plus the `DeleteAccountModal`, passing a `dismissHref` that points at a real element id near the trigger (see Critical Implementation Details). Add the flash-message handling already used at `src/pages/books/index.astro:21-87`: map `error=confirm_mismatch` and `error=delete_failed` to plain-language messages, convert the query param to a short-lived `httpOnly` cookie scoped to `/account`, redirect to the clean URL, then read and delete the cookie on the next render and show a red banner.

#### 6. Post-delete confirmation on the public home page

**Files**: `src/pages/index.astro`, `src/components/Welcome.astro`

**Intent**: Tell the user their deletion actually completed — without it, success and silent failure look identical.

**Contract**: Reuse the books flash pattern, split across the two files the same way a page vs child component must split:

- `src/pages/index.astro` owns the plumbing. If `notice=account_deleted`, set a short-lived `httpOnly` cookie (`path: "/"`, `maxAge: 30`, `sameSite: "lax"`), redirect to `/`, then on the clean request read and delete that cookie (delete must use the same `path: "/"`). Do not put `Astro.redirect` or cookie conversion in `Welcome.astro`.
- `src/pages/index.astro` passes the resolved message string (or `null`) into `Welcome.astro` as a new prop. `Welcome.astro` does not read the query string or cookies.
- `Welcome.astro` renders the banner only in the signed-out branch, above the welcome content: "Your account and all your books have been deleted." The visitor is signed out at this point. The message must not survive a refresh and must not be reachable by sharing a URL.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type checking passes: `npx astro check`
- Build passes: `npm run build`
- Service-role client is imported by exactly one file: `rg -l "supabase-admin" src/` returns only `src/pages/api/account/delete.ts`
- No second cleanup path exists: `rg "from\(.books.\).*delete" src/pages/api/account/` returns nothing

#### Manual Verification:

**3.6 — Wrong confirmation text is rejected**

**Setup:** Run `npm run dev`. Create a brand-new throwaway account through **Sign Up** (do not use an account whose books you care about). Add two books to it so there is something to delete.

**Steps:**
1. Open the **Account** page.
2. Click the delete control in the danger zone.
3. Leave the confirmation box empty and submit.
4. Note what happens, then repeat with the word `delete me` typed in.

**Expected:** Both attempts are refused. You stay signed in, land back on the Account page, and see a red message telling you to type the exact word shown. Your account and books are untouched.

**Pass if:** Neither the empty box nor the wrong word deletes anything, and you get a clear error message both times.

**3.7 — Cancelling the dialog changes nothing**

**Setup:** Still signed in as the throwaway account.

**Steps:**
1. Open the **Account** page and click the delete control.
2. Click **Cancel**.
3. Open the dialog again and click outside it, on the dark backdrop.
4. Open your TBR list.

**Expected:** The dialog closes both times, you stay signed in, and both of your books are still there.

**Pass if:** Cancelling twice leaves you signed in with all your data.

**3.8 — Deletion works end to end**

**Setup:** Still signed in as the throwaway account, with its two books. Write down the email address you used.

**Steps:**
1. Open the **Account** page and click the delete control.
2. Type the exact confirmation word shown in the dialog.
3. Submit.
4. Read the page you land on.
5. Try to open `http://localhost:4321/books` directly in the address bar.
6. Go to **Sign In** and try to sign in with the throwaway email and password.

**Expected:** You land on the public welcome page (the signed-out one, with Sign In and Sign Up buttons) and see a message saying your account and all your books have been deleted. Opening the TBR list sends you to sign-in. Signing in with those credentials fails — the account no longer exists.

**Pass if:** You are signed out, told the deletion happened, and cannot sign back in with that account.

**3.9 — The message does not linger**

**Setup:** Immediately after test 3.8, while the confirmation message is on screen.

**Steps:**
1. Refresh the page.
2. Copy the address from the address bar, open a new tab, and paste it in.

**Expected:** The confirmation message is gone after the refresh, and the fresh tab shows the normal welcome page with no message.

**Pass if:** The message appears exactly once and cannot be resurrected by refreshing or sharing the address.

**3.10 — Another account is completely unaffected**

**Setup:** Sign in as a different, real test account from `supabase/seed.sql`.

**Steps:**
1. Open your TBR list and count the books.
2. Open the mood picker, choose a trope, and check you get results.

**Expected:** Every book is still there and the mood picker works. Deleting the throwaway account touched nothing belonging to this one.

**Pass if:** The second account's books and tropes are entirely intact.

**3.11 — It works with JavaScript turned off**

**Setup:** Create a second throwaway account with one book. Turn off JavaScript for `localhost` in your browser settings (in Chrome: Settings → Privacy and security → Site settings → JavaScript → Don't allow).

**Steps:**
1. Sign in as the throwaway account.
2. Open the **Account** page.
3. Open the delete dialog.
4. Submit once with the wrong word, then again with the correct word.
5. Turn JavaScript back on afterwards.

**Expected:** The dialog opens and closes, the wrong word is refused with an error message, and the correct word deletes the account exactly as it did with JavaScript on.

**Pass if:** The whole deletion flow works identically with JavaScript disabled.

**3.12 — A missing key fails safely**

**Setup:** Create a third throwaway account with one book. Open your local `.dev.vars` file, comment out or delete the `SUPABASE_SERVICE_ROLE_KEY` line, and restart `npm run dev`.

**Steps:**
1. Sign in as the throwaway account.
2. Open the **Account** page and complete the delete dialog with the correct word.
3. Note what happens.
4. Open your TBR list.
5. Restore the key line in `.dev.vars`, restart the dev server, and confirm the deletion now succeeds.

**Expected:** With the key missing you stay signed in, land back on the Account page with a red message saying the deletion could not be completed, and your book is still there. With the key restored, deletion works.

**Pass if:** A missing key leaves you signed in with your data intact and shows a clear error, rather than half-deleting anything.

**3.13 — The database cascade removes every owned book**

**Setup:** Create one final throwaway account and add exactly two books. In Supabase Studio, open **Authentication → Users**, find the throwaway email, and copy its user ID. Then open **Table Editor → books**, filter `user_id` to that ID, and confirm exactly two rows appear.

**Steps:**
1. In the app, open the throwaway account's **Account** page.
2. Complete the delete dialog with the exact confirmation word.
3. Return to **Authentication → Users** in Supabase Studio and refresh the list.
4. Return to the filtered **books** table and refresh it.

**Expected:** The throwaway user no longer appears in Authentication, and the filtered books table shows zero rows. Both books were removed by the database cascade when the auth user was deleted.

**Pass if:** The auth user is gone and no `books` rows remain for the copied user ID.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Gating Sweep and Documentation

### Overview

Confirm the whole S-06 outcome — not just the new page — and update the documents that are now wrong. This phase writes no feature code.

### Changes Required:

#### 1. Setup and deployment documentation

**File**: `README.md`

**Intent**: A fresh clone must know there is a third server-only secret and what it is for.

**Contract**: Add `SUPABASE_SERVICE_ROLE_KEY` to the environment-variable references at `README.md:38`, `:81`, `:133`, `:164`, and to the required-repository-secrets table at `:176-182`. State plainly that it is the **secret / service_role** key, that it is used only for account deletion, that it must never be placed in `SUPABASE_KEY`, and that it never appears in client code. Add a Routes-table row for `/account` (protected; signed-in email and the account-deletion danger zone).

#### 2. Agent onboarding rules

**File**: `AGENTS.md`

**Intent**: Future agents read Hard Rules once; they must see the third secret and the RLS-bypass failure mode.

**Contract**: Extend the existing Supabase env Hard Rule (currently `SUPABASE_URL` / `SUPABASE_KEY` only) to include `SUPABASE_SERVICE_ROLE_KEY`: `context: "server"`, `access: "secret"`, `optional: true`, import only from `astro:env/server`, never from a React island. State that it is used only for `auth.admin.deleteUser` via `src/lib/supabase-admin.ts`, and that it must never be written into `SUPABASE_KEY` (that would bypass Row-Level Security on every TBR query). The `npm run build` bullet may keep listing only `SUPABASE_URL` / `SUPABASE_KEY` — the new field is optional and is not required at build time.

#### 3. Operations reference

**File**: `context/foundation/infrastructure.md`

**Intent**: Keep the secrets inventory and rotation guidance accurate.

**Contract**: Extend the Secrets entry at line 80 to cover the new key across `.dev.vars`, `wrangler secret put`, the CI `secrets:` input, and GitHub repository secrets. Note the risk that the Cloudflare Supabase integration can inject a service-role value into `SUPABASE_KEY`, which would disable Row-Level Security across the whole app.

#### 4. Stale roadmap entry

**File**: `context/foundation/roadmap.md`

**Intent**: Remove a documented unknown that was actually resolved by F-01, so no future planning session re-litigates it.

**Contract**: Replace the S-06 `Unknowns` line at `:193` with a resolution note pointing at the `on delete cascade` foreign key in `supabase/migrations/20260705084406_create_books.sql`. Leave the status field alone; `/10x-archive` owns marking the slice done.

#### 5. Change record

**File**: `context/changes/account-lifecycle/change.md`

**Intent**: Reflect that planning is complete.

**Contract**: Set `status: planned` and `updated` to today's date in the frontmatter.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build passes: `npm run build`
- `/account` is registered as protected: `rg "PROTECTED_ROUTES" -A 1 src/middleware.ts` shows `/books`, `/mood`, and `/account`

#### Manual Verification:

**4.4 — Every private page is closed to signed-out visitors**

**Setup:** Open the app and click **Sign out** so you are definitely signed out. Have a book's edit-page address ready from an earlier session, or grab one after signing in and then sign out again.

**Steps:**
1. Type each of these into the address bar in turn and note where you end up: `/books`, `/books/new`, `/mood`, `/account`, and a specific book's edit page.
2. For each one, check that no book titles, trope tags, or email addresses appear at any point.

**Expected:** All five addresses send you to the sign-in page. No private information is visible even briefly.

**Pass if:** Every private address redirects to sign-in and leaks nothing.

**4.5 — Public pages still work signed out**

**Setup:** Still signed out.

**Steps:**
1. Open the home page.
2. Open **Sign In**, then **Sign Up**.

**Expected:** The welcome page and both auth pages load normally with no redirect loop.

**Pass if:** All three public pages load correctly while signed out.

**4.6 — Production deployment is healthy**

**Setup:** After the pull request is merged and CI has finished deploying.

**Steps:**
1. Open `https://smart-tbr.nicole-rozanska93.workers.dev` and sign in with your own account.
2. Click **Account** and confirm the page loads and shows your email.
3. **Do not delete your own account.** If you want to verify deletion in production, sign up a throwaway account first, add one book to it, and delete that one instead.
4. Sign out and try opening the live `/account` address directly.

**Expected:** The Account page works on the live site, and signed-out access redirects to sign-in.

**Pass if:** The Account page loads for a signed-in user in production and is blocked when signed out.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

No test framework is wired up in this repository (`AGENTS.md`), so verification is static analysis plus the structured manual tests above.

### Static checks:

- `npm run lint` (ESLint `strictTypeChecked` + `stylisticTypeChecked`, `react-compiler` as error, `no-console` as warn — the deliberate `console.error` calls in the delete route follow the existing precedent at `src/pages/api/books/[id]/delete.ts:43`).
- `npx astro check` for type coverage across the new page, component, and route.
- `npm run build` — must pass with `SUPABASE_SERVICE_ROLE_KEY` absent, proving the optional-env contract.
- `rg` assertions that the service-role client has exactly one importer and that no `books` delete exists in the account route.

### Manual scenarios (detailed in each phase):

- Happy path deletion with a throwaway account, verified by failed re-sign-in.
- Cascade verified by a second account's data being untouched.
- Wrong and empty confirmation words rejected.
- Cancel via button and via backdrop.
- Missing service-role key degrades to an error banner with no data loss.
- Full flow with JavaScript disabled.
- Flash messages appear once and are not shareable.
- All five private routes redirect when signed out; all three public routes still load.

### Cascade verification:

Required manual scenario 3.13 confirms in Supabase Studio that both the auth user and every matching `books` row are gone. This directly evidences FR-013's cascade requirement rather than inferring it from the UI.

## Performance Considerations

Negligible. The delete is one Admin API call plus one cascading Postgres delete over at most a few hundred rows for a single user — far inside the Cloudflare Workers per-request CPU ceiling that `context/foundation/lessons.md:12-17` warns about. The Account page renders one string. The extra nav link adds no requests.

## Migration Notes

No schema migration. The cascade this feature depends on already shipped with F-01.

The only environment change is the additive `SUPABASE_SERVICE_ROLE_KEY`. Because the env field is optional and the client null-checks, deploying the code before the secret exists degrades to a "could not delete" banner rather than a crash — but Phase 1 puts the secret in place first precisely so that state never occurs in production.

**Rollback:** revert the pull request and redeploy. The Worker secret can be left in place (harmless once nothing reads it) or removed with `npx wrangler secret delete SUPABASE_SERVICE_ROLE_KEY`. Accounts already deleted **cannot be restored** — that is inherent to FR-013, not a gap in the rollback plan.

## References

- Change record: `context/changes/account-lifecycle/change.md`
- Related research: `context/changes/account-lifecycle/research.md`
- Slice definition: `context/foundation/roadmap.md:185-194`
- Requirements: `context/foundation/prd.md` FR-013, FR-003, FR-001, FR-002, Access Control
- Closest UI/API ancestor: `src/pages/api/books/[id]/delete.ts:16-51`, `src/components/books/DeleteBookModal.astro:26-68`
- Cascade decision: `context/archive/2026-07-04-tbr-data-and-isolation/plan-brief.md`, `supabase/migrations/20260705084406_create_books.sql:6,9`
- Flash-message pattern: `src/pages/books/index.astro:21-87`
- Secret rollout precedent: `context/foundation/infrastructure.md:80,83`, `context/archive/deploy-plan.md`
- Manual test format: `context/foundation/manual-testing.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Service-Role Key Provisioning

#### Automated

- [x] 1.1 Env sync succeeds — 5ebb4a7
- [x] 1.2 Linting passes — 5ebb4a7
- [x] 1.3 Build passes with the key absent — 5ebb4a7

#### Manual

- [x] 1.5 Local dev still starts with the new key present — 5ebb4a7
- [x] 1.6 Production still healthy after the secret is set — 5ebb4a7

### Phase 2: Gated Account Page and Navigation

#### Automated

- [x] 2.1 Linting passes — f2605e7
- [x] 2.2 Type checking passes — f2605e7
- [x] 2.3 Build passes — f2605e7

#### Manual

- [x] 2.4 Account page is reachable from everywhere — f2605e7
- [x] 2.5 Account page is blocked when signed out — f2605e7
- [x] 2.6 Unsaved-changes warning still works on the edit page — f2605e7

### Phase 3: Account Deletion End to End

#### Automated

- [x] 3.1 Linting passes — 474f21e
- [x] 3.2 Type checking passes — 474f21e
- [x] 3.3 Build passes — 474f21e
- [x] 3.4 Service-role client is imported by exactly one file — 474f21e
- [x] 3.5 No second cleanup path exists in the account route — 474f21e

#### Manual

- [x] 3.6 Wrong confirmation text is rejected — 474f21e
- [x] 3.7 Cancelling the dialog changes nothing — 474f21e
- [x] 3.8 Deletion works end to end — 474f21e
- [x] 3.9 The message does not linger — 474f21e
- [x] 3.10 Another account is completely unaffected — 474f21e
- [x] 3.11 It works with JavaScript turned off — 474f21e
- [x] 3.12 A missing key fails safely — 474f21e
- [x] 3.13 The database cascade removes every owned book — 474f21e

### Phase 4: Gating Sweep and Documentation

#### Automated

- [x] 4.1 Linting passes
- [x] 4.2 Build passes
- [x] 4.3 `/account` is registered as protected

#### Manual

- [x] 4.4 Every private page is closed to signed-out visitors
- [x] 4.5 Public pages still work signed out
- [ ] 4.6 Production deployment is healthy
