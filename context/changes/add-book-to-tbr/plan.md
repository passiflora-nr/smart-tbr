# Add a Book to the TBR (S-01) Implementation Plan

## Overview

Build the first write path into the TBR. A signed-in user opens a dedicated `/books/new` page and enters a book's title, author, one or more free-text trope tags, and an optional description; the entry is validated against a schema shared by client and server, inserted into the existing `books` table as a row owned by that user, and echoed back into a session list so the user can see it was saved.

This is roadmap slice **S-01**, the consumer that first exercises the F-01 data layer end to end and the prerequisite for S-02 (browse) and S-05 (mood-trope recommendation). The load-bearing constraint is the PRD guardrail that **adding one book takes ≤ 30 seconds of input**, because the Primary success criterion is the author hand-migrating 100+ books out of Instagram saves, an Amazon wishlist, and phone notes.

## Current State Analysis

The database half of this feature is already built and proven; everything above it is missing.

**What exists:**

- `books` table with exactly the FR-004 shape, created by the single migration `supabase/migrations/20260705084406_create_books.sql`: `id uuid` PK, `user_id uuid not null` FK to `auth.users(id) on delete cascade`, `title text not null`, `author text not null`, `tropes text[] not null`, `description text` (nullable), plus `created_at` / `updated_at` (the latter maintained by a `moddatetime` trigger).
- DB-level enforcement of FR-004's "required" semantics as CHECK constraints: `title_nonempty` and `author_nonempty` (`length(trim(...)) > 0`), `tropes_nonempty` (`cardinality(tropes) >= 1`), and `tropes_no_blanks` (no `null` and no `''` elements).
- RLS enabled with four owner-only policies using `(select auth.uid()) = user_id`, `grant select, insert, update, delete ... to authenticated`, and `revoke all ... from anon`. Isolation is proven by the committed, re-runnable `supabase/tests/rls.sql`.
- Indexes: `books_user_id_idx` (btree) and `books_tropes_gin_idx` (GIN, for S-05).
- Generated types in `src/lib/database.types.ts`, including a typed `books` `Insert` shape requiring `title`, `author`, `tropes: string[]`, `user_id`, with `description?: string | null`. The file is excluded from ESLint (`eslint.config.js:73-75`).
- A cookie-scoped server Supabase client, `createClient(requestHeaders, cookies)` in `src/lib/supabase.ts`, typed with `Database` and returning `null` when env is unset — so queries run as the authenticated user and RLS actually applies.
- `src/middleware.ts` populating `context.locals.user` from `supabase.auth.getUser()` on every request, and gating `PROTECTED_ROUTES = ["/dashboard"]`.
- Hand-rolled form components under `src/components/auth/`: `FormField` (label + icon + input + error, `FormField.tsx:22-68`), `SubmitButton` (React 19 `useFormStatus`, `SubmitButton.tsx:11-33`), `ServerError` (`ServerError.tsx:7-16`), `PasswordToggle`. The theme is a cosmic glass look driven by the `bg-cosmic` utility (`src/styles/global.css:113`).

**What's missing / constrains this slice:**

- No books API route, no books page, no books component — `src/` contains zero references to the `books` table today, and `Tables`/`TablesInsert` helpers in `database.types.ts` are unused.
- No JSON API precedent. All three existing routes (`src/pages/api/auth/{signin,signup,signout}.ts`) parse `formData()` and answer with `context.redirect()`, passing failures back as `?error=` query params. Whatever this slice does becomes the pattern S-03 and S-05 inherit.
- No validation library. `package.json` has no zod, no react-hook-form; `SignInForm.tsx:18-30` hand-rolls a `validate()` function.
- `PROTECTED_ROUTES` does not cover `/api/*`, and `wrangler.jsonc:12` routes `/api/*` to the Worker first — so an API handler must authenticate itself.
- `src/components/ui/` holds only `button.tsx`. There is no input, label, textarea, card, badge, dialog, or toast primitive installed.
- No test framework anywhere in the repo (`AGENTS.md`); verification is lint + build + manual + the committed SQL isolation script.
- `eslint.config.js` runs `strictTypeChecked` + `stylisticTypeChecked` with `react-compiler/react-compiler: error` and `no-console: warn`.



### Key Discoveries:

- **The DB already rejects everything FR-004 forbids** (`supabase/migrations/20260705084406_create_books.sql:14-21`), so application validation is about fast, field-level user feedback — not about being the last line of defense.
- `tropes` **is a** `text[]` **column, not a join table** (`database.types.ts:37-69` types it `string[]`), so the API's job is to turn the chip input's array into a Postgres array — no second write, no transaction.
- `useFormStatus()` **only reports pending for React form actions**, not for a `fetch` inside an `onSubmit` that called `preventDefault()`. Reusing `SubmitButton` unchanged therefore dictates how the form submits (see Critical Implementation Details).
- **RLS makes** `user_id` **spoofing structurally impossible** — the insert policy's `with check ((select auth.uid()) = user_id)` rejects any row whose owner isn't the session user, so the server never needs to trust a client-supplied owner.
- **Two roadmap slices depend on choices made here**: S-05 reads the distinct trope vocabulary from these rows, so trope hygiene at write time is what makes the later mood picker coherent.
- **zod is at 4.4.3**, where error customization uses `{ error: "..." }` (v3's `required_error` / `invalid_type_error` are removed) and errors are read via top-level `z.flattenError()` / `z.treeifyError()` rather than `error.flatten()`. It has no dependencies and runs on workerd.
- `context/foundation/lessons.md` forbids monolithic batch work in a single Workers request. A one-row insert is trivially within budget, and this plan deliberately does not add a bulk importer.



## Desired End State

A signed-in user can navigate from the dashboard to `/books/new`, type a book, and save it without leaving the page. The form clears, focus returns to the title field, and the saved book appears in a running list below the form showing its title, author, and trope chips as persisted. Entering a book takes well under 30 seconds of input, and books can be entered back-to-back with no page reload. If the title and author already exist in that user's TBR, the save still succeeds but the confirmation says so. An unauthenticated visitor hitting `/books/new` is redirected to sign-in, and an unauthenticated POST to `/api/books` gets a 401 JSON response rather than a crash.

Verified by: the phase-level automated checks below (lint, build, `astro sync`, unauthenticated 401 and malformed-body 400 responses), a re-run of `supabase/tests/rls.sql`, and a timed manual entry of three realistic books.

## What We're NOT Doing

- **No list, search, filter, edit, or delete** — those are S-02, S-03, S-04. The session list in this slice is in-memory only and is not a TBR view.
- **No mood-trope recommendation** (S-05) and no reading of the user's distinct trope vocabulary.
- **No trope autocomplete or "recently used tropes" picker** — a PRD v1 non-goal, and explicitly declined during planning.
- **No normalization of trope wording across books or users** — a permanent PRD non-goal. No lowercasing, no canonical mapping, no synonym table.
- **No unique constraint on (user_id, title, author)** and no second migration. The schema is untouched by this slice.
- **No bulk import, CSV, paste-many-books, or external source integration** — PRD non-goals, and forbidden by the Workers batch-work lesson.
- **No shadcn primitive installation** (no input, label, textarea, card, dialog, toast) and no new UI dependency — the existing hand-rolled components are extended instead.
- **No progressive enhancement / no-JS fallback** for the form; the JSON path is the only path.
- **No mobile layout commitment** — v1 is desktop-only per the PRD.
- **No test framework** — this slice does not wire Vitest/Playwright into CI.
- **No changes to auth, sign-out, or account deletion** (S-06).



## Implementation Approach

One shared zod schema is the contract. It lives in `src/lib/book-schema.ts`, is imported by both the API route and the React island, and owns every rule: required title and author, at least one trope, length caps, the trope cleanup transform (trim, drop empties, de-duplicate exact repeats, preserve wording and case), and normalizing a blank description to `null`.

`POST /api/books` is the first JSON endpoint in the repo. It resolves the Supabase client, requires a session user, `safeParse`s the body, does a cheap duplicate lookup on title + author, inserts a row built from the parsed data plus the session user's id, and returns the persisted row. Errors are JSON with stable status codes.

The UI is composed from the components that already exist. `FormField` gains an optional multiline mode for the description; a new `TropeInput` provides the chip interaction; `AddBookForm` wires them together as a React 19 form action (which keeps `SubmitButton`'s `useFormStatus` working) and, on success, resets state, refocuses the title, and prepends the server-returned row to a session list. The page `/books/new` hydrates the island with `client:load` exactly as the auth pages do, and `/books` joins `PROTECTED_ROUTES`.

## Critical Implementation Details

**Timing & lifecycle — how the form submits determines whether** `SubmitButton` **works.** `useFormStatus()` reads pending state from a React form action; it stays `false` forever if the form instead uses `onSubmit` + `preventDefault()` + `fetch`. Submit via the React 19 `action` prop (`<form action={handleSave}>` with an async handler) so `SubmitButton` can be reused unchanged and no second loading-state mechanism is introduced.

**Timing & lifecycle — Enter inside the trope input must not submit the form.** A text input inside a form submits it on Enter by default, so the chip input's Enter and comma handlers must call `preventDefault()` before committing a tag. Related trap: text still sitting uncommitted in the trope field when the user hits Save would silently vanish and trigger a spurious "at least one trope" error. `AddBookForm` owns both the committed tags and pending trope text. On blur, commit the pending text to the controlled tags; as the first step of the save handler, synchronously clean and merge the pending text into a local tags array, update the controlled tag state from that same array, and validate the local merged payload rather than reading state immediately after a setter.

**State sequencing — render the session list from the server's row, not the form state.** Prepend the row returned by the API (which reflects the cleanup transform, the generated `id`, and what Postgres actually stored) rather than the local field values. Otherwise the list can show tropes that were de-duplicated away, and it stops being evidence that the save persisted. Reset the fields and refocus the title only after a successful response — a failed save must leave the user's typing intact.

## Phase 1: Validation contract and insert API



### Overview

Establish the shared schema and the first JSON endpoint. At the end of this phase the write path is complete and testable with `curl`, with no UI.

### Changes Required:



#### 1. Add the validation dependency

**File**: `package.json`

**Intent**: Add zod as the shared validation library for client and server, per the planning decision that one schema definition must serve both.

**Contract**: `zod` in `dependencies` at `^4.4.3` (current latest; the v4 API is what this plan targets). No other dependency changes. Confirm the lockfile updates and that nothing else in the tree pulls a conflicting major.

#### 2. Shared book input schema

**File**: `src/lib/book-schema.ts` (new)

**Intent**: Define the single source of truth for what a valid new-book submission is, including the trope cleanup rules, so the route and the form cannot drift. Every later slice that writes a book (S-03 edit) reuses this.

**Contract**: Exports the full book schema, a reusable trope-list schema, `BookInput = z.input<typeof bookSchema>` for raw form/API input, and `BookPayload = z.output<typeof bookSchema>` for cleaned values after transforms. Also exports the TypeScript response types for the create-book endpoint (201 success with `book` and `duplicate`; error with `error` and optional field-error arrays) plus `isCreateBookSuccess(value: unknown)` and `isCreateBookError(value: unknown)` runtime type guards that check every field the client reads. These guards are the required boundary for narrowing `response.json()`; TypeScript response types alone do not validate unknown JSON. Rules: `title` and `author` are trimmed before their non-empty and 300/200-character checks; `description` is optional, trimmed before its 2000-character check, and becomes `null` when blank; each trope is trimmed before its 60-character check, then empties are dropped and exact duplicates removed while preserving first-seen order, wording, and case, and only then is the cleaned array checked for 1–25 elements. Thus caps describe the cleaned values that can be persisted, not raw whitespace or duplicate entries. The full schema uses the exported trope-list schema so the route, form, and chip input share those exact semantics. The schema does **not** accept `user_id` — ownership is never client-supplied. Error messages are user-facing strings set via zod v4's `{ error: "..." }` option, since these same strings render as field errors in the form.

The trope transform is the cross-phase contract worth pinning down, because both the route and the chip input depend on its exact semantics:

```ts
const trope = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().max(60, { error: "Keep each trope to 60 characters or fewer" }));

export const tropeListSchema = z
  .array(trope)
  .transform((raw) => {
    const seen = new Set<string>();
    return raw
      .filter((t) => t.length > 0 && !seen.has(t) && (seen.add(t), true));
  })
  .pipe(
    z
      .array(z.string())
      .min(1, { error: "Add at least one trope" })
      .max(25, { error: "Add no more than 25 tropes" }),
  );
```



#### 3. Books insert endpoint

**File**: `src/pages/api/books.ts` (new)

**Intent**: Accept a JSON book submission from a signed-in user, validate it, insert it as a row they own, and report back what persisted plus whether it duplicates an existing title and author. This is the repo's first JSON API route, so its response shape is the convention S-03 and S-05 will follow.

**Contract**: `export const POST: APIRoute`. Obtains the client via `createClient(context.request.headers, context.cookies)` and answers **503** `{ error }` if it is `null` (env unset — the documented null case in `src/lib/supabase.ts`). Requires a user from `supabase.auth.getUser()` and answers **401** `{ error }` otherwise. Middleware does run for API requests and does populate `context.locals.user` (`src/middleware.ts:7-16`), but its `PROTECTED_ROUTES` check only redirects — and only for paths on that list — so nothing blocks an unauthenticated POST from reaching this handler. Refusing it is the handler's own job. Call `getUser()` rather than reading `locals.user`: the client is needed for the insert anyway, and this revalidates the session at the point of the write. Parses the body with `safeParse` and answers **400** `{ error, fieldErrors }` where `fieldErrors` comes from `z.flattenError(result.error).fieldErrors` and therefore maps field names to `string[]`, so the form can map errors onto fields by name. Also answers **400** for a body that isn't valid JSON, rather than throwing. Build every response against the shared create-book response types.

On success: one `select("id").limit(1)` on `books` filtered by `user_id`, `title`, and `author` (exact equality — avoid `ilike`, whose `%` and `_` wildcards would misfire on real titles) to detect duplicates. Check the lookup error before continuing, and derive `duplicate` from whether its returned array is non-empty; do not use `.single()` or `.maybeSingle()`, because the schema intentionally permits both zero and multiple matches. Then perform one `insert` whose payload is built explicitly from the parsed fields plus `user_id: user.id`, with `.select().single()` so the persisted row comes back. Responds **201** with `{ book, duplicate: boolean }`. Any Postgres error from either query answers **500** `{ error }` with a generic message — do not leak driver text, and do not `console.log` (`no-console` is on).

Respond with an explicit `new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })` rather than `Response.json()`, to stay clear of lib-typing differences between the workerd runtime and the TS DOM lib under `strictTypeChecked`.

### Success Criteria:



#### Automated Verification:

- `npx astro sync` completes clean
- Type-aware lint passes: `npm run lint`
- Production build passes: `npm run build`
- Unauthenticated `POST /api/books` with a valid body returns 401 with a JSON error body (against `npm run dev`)
- `POST /api/books` with an empty title and no tropes returns 400 with `fieldErrors` naming both fields
- `POST /api/books` with a non-JSON body returns 400, not a 500 or an unhandled exception



#### Manual Verification:

- A signed-in insert (browser devtools fetch, or curl with the session cookie) creates exactly one row in Supabase Studio with the correct `tropes` array, `description` null when omitted, and `user_id` matching the signed-in user
- Submitting a book whose title and author already exist returns 201 with `duplicate: true`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding.

---



## Phase 2: Trope chip input



### Overview

Build the keyboard-driven tag component in isolation. It is the highest-risk UI in this slice — it has no existing component to copy, it is what the ≤30s guardrail hinges on, and S-05's mood picker will likely reuse it.

### Changes Required:



#### 1. Trope chip input component

**File**: `src/components/books/TropeInput.tsx` (new)

**Intent**: Let the user commit trope tags one at a time and see exactly what was parsed before saving, so typos are caught at entry rather than becoming permanent phantom tags across 100 books with no list view to audit.

**Contract**: A fully controlled component taking the committed tags (`string[]`) and change callback, the pending text (`string`) and pending-text change callback, an optional error string and error-change callback, and an id/label, matching how `FormField` is driven from parent state (`SignInForm.tsx:44-56`). Keyboard behavior: Enter and comma commit the pending text as a tag and clear the pending text, both calling `preventDefault()` so Enter cannot submit the enclosing form; Backspace on an empty field removes the last tag. Blur commits pending text. Each rendered chip has an accessible remove control with `type="button"` so removing a chip cannot submit the enclosing form. Before committing, validate the candidate array with the shared `tropeListSchema`: trimming, blank removal, and exact de-duplication happen before the 25-tag check, while each trimmed tag is capped at 60 characters. A duplicate is simply not added; a 26th unique tag or overlong tag is not silently committed and reports the schema's first error through the error-change callback. What the user sees after a successful commit is therefore what the server will store. Visual language matches `FormField`'s `inputBase` classes and its red error treatment (`FormField.tsx:5-6,51-62`) so the field reads as part of the same form.

Exposing a way for the parent to focus the field (or reading focus from the parent) is not needed here — only the title field is refocused after save.

### Success Criteria:



#### Automated Verification:

- Type-aware lint passes, including `react-compiler/react-compiler`: `npm run lint`
- Production build passes: `npm run build`



#### Manual Verification:

- Typing a trope and pressing Enter creates a chip and clears the field, without submitting the form
- Typing a comma commits the tag the same way
- Backspace on an empty field removes the last chip
- Clicking a chip's remove control deletes that chip only
- Blurring with uncommitted text commits it rather than discarding it
- Re-entering an existing tag verbatim does not create a second chip; a different-case variant does create its own chip (per the decision to preserve wording)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding.

---



## Phase 3: Add-book page, form, and session list



### Overview

Compose the entry surface: a protected `/books/new` route hosting the form island, with the running list of books saved this session below it and a way in from the dashboard.

### Changes Required:



#### 1. Multiline support in the shared field component

**File**: `src/components/auth/FormField.tsx`

**Intent**: Give the optional description a textarea while reusing the existing label, error, and hint markup rather than duplicating it.

**Contract**: Add optional `multiline` and `rows` props, plus `inputRef?: Ref<HTMLInputElement>` for access to the rendered native input. Attach `inputRef` only in the non-multiline input branch; textarea ref support is not needed by this slice and a union ref would not narrow safely under strict TypeScript. When `multiline` is set, render a `textarea` in place of the `input` (with `type` ignored) and top-align the leading icon instead of vertically centering it, since `top-1/2 -translate-y-1/2` (`FormField.tsx:41`) is wrong for a multi-row control. Existing call sites in `SignInForm` and `SignUpForm` must be unaffected and may omit `inputRef`.

#### 2. Add-book form island

**File**: `src/components/books/AddBookForm.tsx` (new)

**Intent**: The entry surface itself, tuned for repeat entry — validate locally for instant feedback, POST JSON, then reset and refocus so the next book can be typed immediately.

**Contract**: Default-exported React component (the auth forms are default exports consumed by Astro, `signin.astro:3`). Holds field state with `useState`, including both committed trope tags and pending trope text. At the start of the save action, synchronously clean and merge pending trope text into a local tags array, update the controlled trope state from that same array, and validate a local `BookInput` payload containing the merged tags with the shared schema's `safeParse`; treat `result.data` as `BookPayload`, and do not call a state setter and then validate from state. For local and server validation, map each `z.flattenError` field-error array to its first message (for example, `fieldErrors.title?.[0]`) before passing it to the single-string `error` props on `FormField` and `TropeInput`. Submit through the React 19 form `action` prop with an async handler so `SubmitButton`'s `useFormStatus` reports pending (see Critical Implementation Details), POSTing JSON to `/api/books`. Treat `response.json()` as `unknown`: on 201 require `isCreateBookSuccess`, and on error statuses require `isCreateBookError`, before reading fields; handle a failed guard as a generic server failure. Passes a title input ref through `FormField`'s `inputRef` prop. On 201: reset the fields, focus that title input ref, and prepend the returned row to session state. When `duplicate` is true, show a non-blocking notice that names the just-saved book; clear any prior duplicate notice when the next submission starts so it cannot describe a later entry. On 400: map the first message for each `fieldErrors` entry back onto the fields. On 401: tell the user their session ended and link to sign-in. On any other failure: show the message through `ServerError` (`ServerError.tsx:7`) and leave the typed values untouched.

#### 3. Session list of saved books

**File**: `src/components/books/SavedBooksList.tsx` (new)

**Intent**: Satisfy "see it saved" without building S-02 — show what actually persisted this session, so a mistyped trope is visible immediately.

**Contract**: Takes the array of server-returned book rows (typed from `Tables<"books">` in `src/lib/database.types.ts`, whose helpers are currently unused) and renders each with title, author, and trope chips, newest first, with a count.

The heading and the empty state must both state that this lists books **added in this session**, not the TBR itself. This wording is the only thing standing between a mid-migration page refresh and the user believing their books were lost — and a user who believes that will re-enter books, creating duplicates that cannot be removed until S-03 ships delete. Do not label it "Your TBR", do not leave it unlabelled, and make the empty state say something to the effect of "Books you add will appear here — anything already saved is safe in your TBR" rather than a bare "No books".

#### 4. The add-book page

**File**: `src/pages/books/new.astro` (new)

**Intent**: Host the island on a stable, bookmarkable URL the user can keep open for an entire migration session.

**Contract**: Mirrors `src/pages/auth/signin.astro` — `Layout` with a title, the `bg-cosmic` wrapper and glass card, a heading, and the form hydrated with `client:load`. Wider than the `max-w-sm` auth card to fit the chip input and the session list. Includes a link back to the dashboard.

#### 5. Gate the books routes

**File**: `src/middleware.ts`

**Intent**: Ensure an unauthenticated visitor to any books page is redirected to sign-in, per the PRD's Access Control section.

**Contract**: Add `"/books"` to `PROTECTED_ROUTES` (`src/middleware.ts:4`), which is prefix-matched, so it covers `/books/new` and every future books page. Per `AGENTS.md`, this is the only place auth-required paths are declared.

#### 6. Entry point from the dashboard

**File**: `src/pages/dashboard.astro`

**Intent**: Make the feature reachable; today the dashboard has no navigation at all.

**Contract**: Add a link to `/books/new` styled like the existing sign-out control (`dashboard.astro:18-22`). No other dashboard changes.

### Success Criteria:



#### Automated Verification:

- `npx astro sync` completes clean
- Type-aware lint passes: `npm run lint`
- Production build passes: `npm run build`
- Unauthenticated `GET /books/new` redirects to `/auth/signin` (302), confirming the `PROTECTED_ROUTES` entry



#### Manual Verification:

- A book with title, author, two tropes, and no description saves; the fields clear and focus lands back on the title input
- The saved book appears at the top of the session list with the tropes as stored
- A second book can be entered immediately with no page reload, and both appear in the list
- The description is saved when provided and stored as null when left blank
- Submitting with an empty title, empty author, or no tropes shows field-level errors and does not POST
- Saving a duplicate title and author shows the non-blocking duplicate notice and still saves
- A failed save (e.g. dev server stopped) shows an error and preserves everything typed
- The dashboard link reaches the page, and the page's back-link reaches the dashboard
- After saving two books, refreshing the page empties the session list — and the heading and empty-state wording make clear that nothing was lost (the books are still in Supabase Studio)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding.

---



## Phase 4: Guardrail verification



### Overview

Prove the two PRD guardrails this slice can break — the ≤30s entry budget and per-user isolation on the new write path — and get CI green. No feature code; findings that fail the budget come back as adjustments to Phase 3.

### Changes Required:



#### 1. Timed entry check

**File**: no code change; record the result in this plan's Progress notes

**Intent**: Confirm the ≤30s-per-book guardrail actually holds, since it is the constraint that decides whether migrating 100+ books is feasible.

**Contract**: Enter three realistic books (a real title, author, and 2-3 tropes, one with a description) back to back from the already-open form, timing input per book. Each must land under 30 seconds. If any exceeds it, identify the friction — most likely tab order, the number of keystrokes to commit a trope, or focus not returning to the title — and fix it in Phase 3 before closing this phase.

#### 2. Isolation re-verification for the write path

**File**: no code change; re-run `supabase/tests/rls.sql`

**Intent**: F-01 proved isolation for a schema with no application writers. This slice adds the first writer, so re-confirm the guardrail with the new code path in place.

**Contract**: Re-run the committed isolation script against the local stack and confirm it still exits clean (cross-account select/insert/update/delete denied, owner access allowed). Separately confirm that a request carrying an extra `user_id` in its JSON body cannot create a row owned by another user — the schema does not accept the field and the handler builds the payload explicitly, with the insert policy as the backstop.

#### 3. CI

**File**: no code change

**Intent**: The repo's gate for merging (`.github/workflows/ci.yml` runs `npm ci → npx astro sync → npm run lint → npm run build`).

**Contract**: Push the branch and confirm CI passes. Per `AGENTS.md`, this lands on `main` via PR from `feat/add-book-to-tbr`; never commit to `main` and never bypass the Husky pre-commit hook.

### Success Criteria:



#### Automated Verification:

- `supabase/tests/rls.sql` runs clean against the local stack
- CI passes on the branch (`npm ci`, `npx astro sync`, `npm run lint`, `npm run build`)



#### Manual Verification:

- Three consecutive realistic books each take under 30 seconds of input
- A body containing a foreign `user_id` cannot create a row owned by another account
- The feature works on at least two of the four mainstream desktop browsers (per the PRD browser NFR)

**Implementation Note**: This is the final phase. Confirm the guardrail results with the human before opening the PR.

---



## Testing Strategy

No test framework is wired up in this repo (`AGENTS.md`), and this slice deliberately does not add one. Verification is therefore three-legged:

### Static and build verification:

- `npx astro sync`, `npm run lint` (type-aware, `strictTypeChecked` + `react-compiler`), `npm run build` — run after every phase, and enforced by CI.



### API-level checks (curl against `npm run dev`):

- Unauthenticated POST → 401 JSON.
- Malformed JSON body → 400.
- Missing title / missing tropes → 400 with `fieldErrors` for each field.
- Authenticated valid POST → 201, row visible in Supabase Studio with the correct array and owner.
- Duplicate title and author → 201 with `duplicate: true`.

Start `npm run dev` first. For authenticated checks, copy the complete `Cookie` request header from a signed-in browser session into `SESSION_COOKIE` without committing it. Run the three Phase 1 error-path checks with:

```sh
curl -i -X POST http://localhost:4321/api/books -H "Content-Type: application/json" --data '{"title":"Test","author":"Author","tropes":["Found family"]}'
curl -i -X POST http://localhost:4321/api/books -H "Content-Type: application/json" -H "Cookie: $SESSION_COOKIE" --data 'not-json'
curl -i -X POST http://localhost:4321/api/books -H "Content-Type: application/json" -H "Cookie: $SESSION_COOKIE" --data '{"title":"","author":"Author","tropes":[]}'
```

Confirm the first response is 401 JSON, the second is 400 rather than 500, and the third is 400 with both `title` and `tropes` entries in `fieldErrors`.

### Database and isolation:

- `supabase/tests/rls.sql` against the local stack, re-run in Phase 4 now that a writer exists.



### Manual testing steps:

1. Sign in, go to `/books/new` from the dashboard.
2. Enter a book with two tropes and no description; confirm it saves, the form clears, focus returns to the title, and the entry appears in the session list.
3. Enter a second book with a description; confirm both appear and no page reload occurred.
4. Submit an empty form; confirm field errors and that no request is sent.
5. Type a trope but press Save without pressing Enter; confirm the tag is committed rather than lost.
6. Re-enter the first book's title and author; confirm the duplicate notice and that it still saves.
7. Stop the dev server and submit; confirm an error is shown and nothing typed is lost.
8. Sign out and visit `/books/new`; confirm redirect to sign-in.
9. Time three consecutive realistic entries against the 30-second budget.



## Performance Considerations

The write path is two round trips per save (a duplicate lookup and an insert), both single-row and index-backed by `books_user_id_idx` — far inside the Workers per-request CPU ceiling flagged in `context/foundation/lessons.md`. The relevant budget here is human, not machine: the ≤30s guardrail is why the form stays mounted and refocuses instead of redirecting. No caching, batching, or optimistic UI is warranted at single-digit users; the duplicate lookup can be dropped later if it ever measurably slows the save.

## Migration Notes

No schema migration. The `books` table, its constraints, indexes, RLS policies, and grants all ship from F-01 and are untouched here. Existing local seed rows remain valid. Nothing needs to be applied to production for this slice beyond the normal `npm run build` + `npx wrangler deploy`, so there is no database rollback to plan — reverting is a Worker rollback.

## References

- Roadmap slice S-01: `context/foundation/roadmap.md:111-121`
- PRD FR-004 and the ≤30s guardrail: `context/foundation/prd.md:107`, `context/foundation/prd.md:47`, `context/foundation/prd.md:136`
- PRD Access Control (unauthenticated visitors redirected to sign-in): `context/foundation/prd.md:152-156`
- PRD permanent non-goal on trope normalization: `context/foundation/prd.md:173`
- F-01 foundation plan and decisions: `context/archive/2026-07-04-tbr-data-and-isolation/plan.md`, `.../plan-brief.md`
- Schema this slice writes to: `supabase/migrations/20260705084406_create_books.sql:4-60`
- Typed insert shape: `src/lib/database.types.ts:37-69`
- Client factory and its null case: `src/lib/supabase.ts:6-25`
- Route gating: `src/middleware.ts:4`
- API route pattern to diverge from: `src/pages/api/auth/signin.ts:4-20`
- Form components to reuse: `src/components/auth/FormField.tsx:22-68`, `src/components/auth/SubmitButton.tsx:11-33`, `src/components/auth/ServerError.tsx:7-16`
- Island hydration pattern: `src/pages/auth/signin.astro:16`
- Workers batch-work constraint: `context/foundation/lessons.md:12-17`



## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append  `— <commit sha>` when a step lands. Do not rename step titles.



### Phase 1: Validation contract and insert API



#### Automated

- [x] 1.1 `npx astro sync` completes clean — c22b888
- [x] 1.2 Type-aware lint passes: `npm run lint` — c22b888
- [x] 1.3 Production build passes: `npm run build` — c22b888
- [x] 1.4 Unauthenticated `POST /api/books` with a valid body returns 401 with a JSON error body (against `npm run dev`) — c22b888
- [x] 1.5 `POST /api/books` with an empty title and no tropes returns 400 with `fieldErrors` naming both fields — c22b888
- [x] 1.6 `POST /api/books` with a non-JSON body returns 400, not a 500 or an unhandled exception — c22b888



#### Manual

- [x] 1.7 A signed-in insert (browser devtools fetch, or curl with the session cookie) creates exactly one row in Supabase Studio with the correct `tropes` array, `description` null when omitted, and `user_id` matching the signed-in user — c22b888
- [x] 1.8 Submitting a book whose title and author already exist returns 201 with `duplicate: true` — c22b888



### Phase 2: Trope chip input



#### Automated

- [x] 2.1 Type-aware lint passes, including `react-compiler/react-compiler`: `npm run lint`
- [x] 2.2 Production build passes: `npm run build`



#### Manual

- [x] 2.3 Typing a trope and pressing Enter creates a chip and clears the field, without submitting the form
- [x] 2.4 Typing a comma commits the tag the same way
- [x] 2.5 Backspace on an empty field removes the last chip
- [x] 2.6 Clicking a chip's remove control deletes that chip only
- [x] 2.7 Blurring with uncommitted text commits it rather than discarding it
- [x] 2.8 Re-entering an existing tag verbatim does not create a second chip; a different-case variant does create its own chip (per the decision to preserve wording)



### Phase 3: Add-book page, form, and session list



#### Automated

- [x] 3.1 `npx astro sync` completes clean
- [x] 3.2 Type-aware lint passes: `npm run lint`
- [x] 3.3 Production build passes: `npm run build`
- [x] 3.4 Unauthenticated `GET /books/new` redirects to `/auth/signin` (302), confirming the `PROTECTED_ROUTES` entry



#### Manual

- [x] 3.5 A book with title, author, two tropes, and no description saves; the fields clear and focus lands back on the title input
- [x] 3.6 The saved book appears at the top of the session list with the tropes as stored
- [x] 3.7 A second book can be entered immediately with no page reload, and both appear in the list
- [x] 3.8 The description is saved when provided and stored as null when left blank
- [x] 3.9 Submitting with an empty title, empty author, or no tropes shows field-level errors and does not POST
- [x] 3.10 Saving a duplicate title and author shows the non-blocking duplicate notice and still saves
- [x] 3.11 A failed save (e.g. dev server stopped) shows an error and preserves everything typed
- [x] 3.12 The dashboard link reaches the page, and the page's back-link reaches the dashboard
- [x] 3.13 After saving two books, refreshing the page empties the session list — and the heading and empty-state wording make clear that nothing was lost (the books are still in Supabase Studio)



### Phase 4: Guardrail verification



#### Automated

- [x] 4.1 `supabase/tests/rls.sql` runs clean against the local stack
- [ ] 4.2 CI passes on the branch (`npm ci`, `npx astro sync`, `npm run lint`, `npm run build`)



#### Manual

- [ ] 4.3 Three consecutive realistic books each take under 30 seconds of input
- [ ] 4.4 A body containing a foreign `user_id` cannot create a row owned by another account
- [ ] 4.5 The feature works on at least two of the four mainstream desktop browsers (per the PRD browser NFR)