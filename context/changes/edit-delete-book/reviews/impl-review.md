<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Edit and Delete a Book (S-03)

- **Plan**: context/changes/edit-delete-book/plan.md
- **Scope**: Phases 1–2 of 4 (the fully completed phases in Progress)
- **Date**: 2026-08-14
- **Verdict**: APPROVED after triage; both current findings fixed on 2026-08-14
- **Findings**: 0 critical, 2 warnings, 0 observations — 2 fixed (current re-review)

## Current re-review verification (2026-08-14)

`npx astro sync` passed, `npm run lint` passed with 0 errors and the existing 7 server-side `no-console` warnings, and `npm run build` passed. The initial sync/build attempts failed only because the sandbox blocked Wrangler's log directory and network-interface inspection; both passed when rerun without those restrictions.

The Phase 1–2 endpoint, RLS, and manual criteria were already re-run against the same current working-tree fixes earlier on 2026-08-14, as recorded below. All Phase 1–2 Progress items remain checked with commit evidence. No completed manual item conflicts with the current code.

After triage, `npm run lint` passed again with 0 errors and the same 7 existing server-side `no-console` warnings. Scoped IDE diagnostics for `EditBookForm.tsx` are clean.

## Previous full-plan post-triage verification (2026-08-14)

After the triage edits: `npx astro sync` clean, `npm run lint` 0 errors with the same 7 baseline `no-console` warnings, `npm run build` clean, `checkOrigin: true` confirmed present in the rebuilt worker manifest, and `supabase/tests/rls.sql` passing against a freshly reset stack (fixtures back to 6 / 6 / 25 / 0).

Every endpoint contract was re-run live after the `jsonResponse` hoist touched both endpoints: `PUT` own book 200 `duplicate:false`, other user's book 404, `not-a-uuid` 404, malformed JSON 400, invalid fields 400 capped one message per field, no cookie 401, `POST /api/books` still 201, delete success → `/books?notice=deleted`, cross-account delete → `/books?error=not_found`, cross-site delete 403, own edit page 200, other user's edit page → `?error=not_found`, and user A untouched at six books. The `?error=toString` regression check now renders no banner at all.

Still open from the plan and unchanged by this review: Progress 4.2 (CI on the branch) and 4.7 (both API routes on the deployed Worker). Progress items 3.4 and 3.12 describe the delete redirect, which now carries `?notice=deleted` — worth a quick re-confirm in the browser during the next QA pass.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Verification performed in this environment

| Check | Result |
|---|---|
| `npx astro sync` | PASS — clean |
| `npm run lint` | PASS — 0 errors, 7 `no-console` warnings, all `console.error` on server error paths (matches the pre-existing `api/books.ts` baseline) |
| `npm run build` | PASS |
| `supabase/tests/rls.sql` against the live local stack | PASS — no assertion raised |
| `PUT /api/books/<own-id>` valid body | PASS — 200, row reflects new values |
| `PUT` same values twice (self-match exclusion) | PASS — `duplicate: false` |
| `PUT` retitled to twin another owned book | PASS — `duplicate: true` |
| `PUT /api/books/<other-users-id>` | PASS — 404, user A's rows unchanged (still 6) |
| `PUT /api/books/<unused-uuid>` | PASS — 404 |
| `PUT /api/books/not-a-uuid` | PASS — 404, not 500 |
| `PUT` malformed JSON | PASS — 400 |
| `PUT` empty title + zero tropes | PASS — 400, exactly one message per field |
| `PUT` with no session cookie | PASS — 401 |
| `GET /books/<id>/edit` unauthenticated | PASS — 302 → `/auth/signin` |
| `GET /books/<other-users-id>/edit` | PASS — 302 → `/books?error=not_found` |
| `GET /books/not-a-uuid/edit` | PASS — 302 → `/books?error=not_found` |
| `POST /api/books/<other-users-id>/delete` | PASS — 302 → `/books?error=not_found`, row survives |
| `POST /api/books/<unused-uuid>/delete` | PASS — 302 → `/books?error=not_found` |
| `POST /api/books/not-a-uuid/delete` | PASS — 302 → `/books?error=not_found`, not 500 |
| `POST` delete with no session cookie | PASS — 302 → `/auth/signin` (with an `Origin` header; a bare `curl` with no `Origin` is refused 403 by Astro's origin check before the handler runs) |
| Cross-site form POST to the delete route | PASS — 403 from Astro's origin check |
| Zero JavaScript on `/books` | PASS — no `client:` directive or `<script>` in any component reachable from the page |
| 4.2 CI on the branch | PENDING — no PR open and no workflow run exists for `feat/edit-delete-book` |
| 4.7 Deployed Worker routes | PENDING — not deployed |

Destructive testing was confined to user C and reversed afterwards; user A and user B are untouched at six books each.

## Findings

### F11 — Session-expired sign-in bypasses the unsaved-changes guard

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/books/EditBookForm.tsx:336-341
- **Detail**: A 401 keeps the user's edited values and sets `sessionExpired`, but the rendered "Sign in" anchor is the only leave-the-page link in the form without `data-unsaved-guard`. Following it discards the retained edits immediately, despite the Phase 2 addendum's stated intent to stop silent loss of typed edits when navigating away.
- **Fix**: Add `data-unsaved-guard` to the session-expired "Sign in" anchor so it uses the existing confirmation path.
- **Decision**: FIXED — added `data-unsaved-guard` to the session-expired "Sign in" anchor

### F12 — Modified clicks are converted into same-tab navigation

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/books/EditBookForm.tsx:113-126
- **Detail**: The capture-phase click guard intercepts every click on a guarded anchor, including Cmd/Ctrl/Shift/Alt-clicks, then calls `window.location.assign()`. A user trying to open the TBR or dashboard in another tab therefore gets same-tab navigation and loses the edit page after confirming, even though the requested new-tab navigation would have preserved it.
- **Fix**: Only intercept an unmodified primary-button click; let modified and non-primary clicks retain native browser behavior.
- **Decision**: FIXED — the guard now ignores modified and non-primary clicks

## Historical findings from the previous full-plan review

### F1 — Prototype-chain keys defeat the redirect-message allowlist

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/books/index.astro:34,44,66,68
- **Detail**: The allowlist gate is `errorParam in REDIRECT_ERRORS`, and `in` walks the prototype chain, so every `Object.prototype` member passes as a recognised code. Reproduced live against `npm run dev`: `?error=toString` renders the red error banner containing `[object Undefined]`, `?error=constructor` renders `[object Object]`, and `?error=isPrototypeOf` renders an empty banner. No 500 occurs on Astro 6.3.1 — all five keys tried returned 200. This is not XSS (no attacker-supplied text reaches the page; Astro escapes output), but it breaks the plan's explicit contract that "unrecognised codes render nothing", and the bad code is first written into a 30-second flash cookie so the broken banner outlives the request that caused it. TypeScript cannot catch this because `noUncheckedIndexedAccess` is off, so the lookup is typed `string` while returning a function at runtime.
- **Fix**: Replace both `in` guards with `Object.hasOwn(REDIRECT_ERRORS, errorParam)` / `Object.hasOwn(REDIRECT_NOTICES, noticeParam)`, at all four sites (the pre-redirect gate and the post-cookie read).
- **Decision**: FIXED — all four `in` checks replaced with `Object.hasOwn`

### F2 — Unplanned unsaved-changes guard that crosses the island boundary

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Scope Discipline / Architecture
- **Location**: src/components/books/EditBookForm.tsx:31,77-151; src/components/auth/SignOutButton.astro:4-11; src/pages/books/[id]/edit.astro:59,66,71,82
- **Detail**: The largest block of new code in the slice is a feature the plan never asked for. `EditBookForm` computes an `isDirty` flag, installs capture-phase `click` and `submit` listeners on `document` that call `stopImmediatePropagation()` and `window.confirm()`, and imperatively mutates markup it does not own via `document.querySelectorAll("[data-edit-delete-controls]").setAttribute("hidden","")`. Making it work required a new `guardUnsavedLeave` prop on `SignOutButton.astro` — a component every authenticated page renders — plus `data-unsaved-guard` hooks in `edit.astro` and an `editDeleteControls` prop on `DeleteBookModal`. Three surfaces are now coupled by undeclared string data-attributes; renaming one breaks the behaviour silently with lint and build green. `SignOutButton` fails safe (the prop defaults to `false → undefined`, so `/books`, `/dashboard`, and `/books/new` render byte-identical markup), and the guard itself is best-effort: it does not cover tab close, the Back button, URL editing, the session-expired "Sign in" link, or the `Layout` banner link. It also uses a native `window.confirm` for leaving, while the slice deliberately built a custom modal rather than a native confirm for deleting.
- **Fix A ⭐ Recommended**: Keep the guard, document it as a plan addendum, and record the `data-unsaved-guard` / `data-edit-delete-controls` attribute contract in both `EditBookForm.tsx` and `edit.astro`.
  - Strength: The behaviour is genuinely useful on a prefilled form and it already survived manual QA; the plan is the source of truth for the next reviewer and currently does not mention any of it.
  - Tradeoff: Blesses an island reaching outside its own root, which no sibling island does; future work may copy the pattern.
  - Confidence: HIGH — this repo consistently records discovered scope as plan addenda (S-02 did exactly this for the `<details>` disclosure).
  - Blind spot: Whether the guard was requested during manual QA or added unprompted; the commit message ("manual QA follow-ups") suggests the former but does not say so.
- **Fix B**: Remove the guard and its three attribute hooks, reverting `SignOutButton.astro` to its pre-slice shape, and file it as follow-up work.
  - Strength: Restores strict scope discipline and removes the cross-boundary DOM mutation and the shared-component change in one step.
  - Tradeoff: Discards working, QA'd behaviour that protects against losing typed edits; a later re-add costs the same work again.
  - Confidence: MEDIUM — nothing else depends on the attributes, but the UX regression is real.
  - Blind spot: Whether the user relies on the confirm in their own workflow.
- **Decision**: FIXED via Fix A — plan gains a Phase 2 change #5 addendum with an attribute-contract table; `EditBookForm.tsx` names both attributes as constants with a comment, and `edit.astro` cross-references the addendum

### F3 — Redirect messages reimplemented as flash cookies with a second redirect

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/pages/books/index.astro:21-68; src/components/books/EditBookForm.tsx:222
- **Detail**: The plan specified reading `error` and `notice` from `Astro.url.searchParams` in frontmatter and mapping them to fixed copy. The implementation instead writes a recognised code into an httpOnly cookie, issues a second 302 to a clean `/books`, and renders from the cookie on the following request. Every structural requirement the plan cared about is met — hoisted header row, single message slot above the heading in all three states, fixed copy, error beats notice, nothing echoed — so the user-visible result is correct. But the mechanism is undocumented, costs an extra round trip and two cookies, and forced a new `highlight` query parameter that exists only to rebuild the `#book-<id>` fragment the plan expected the browser to carry through the redirect. Two side effects: the cookie is scoped `path=/books` but only consumed by `index.astro`, so a code set while navigating to `/books/new` or an edit page lingers up to 30 seconds and can surface on a later unrelated visit to the list; and the cookie omits `secure` (negligible — the payload is a non-sensitive enum code and production is HTTPS-only).
- **Fix A ⭐ Recommended**: Keep the flash-cookie design and amend the plan's Phase 2 change #1 to describe it, including the `highlight` parameter and the cookie scope.
  - Strength: The clean-URL result is better than what the plan described — reloading after a message no longer re-shows it — and the code is already QA'd; updating the plan keeps it usable as ground truth for `/10x-archive` and the next slice.
  - Tradeoff: The plan becomes a moving target, and the extra redirect stays.
  - Confidence: HIGH — the contract's observable requirements are all satisfied; only the mechanism differs.
  - Blind spot: Behaviour when two tabs trigger different codes within the same 30-second window is untested.
- **Fix B**: Revert to the planned single-pass render straight from `searchParams`.
  - Strength: Removes the extra round trip, both cookies, the `highlight` parameter, and the lingering-cookie edge case; the code shrinks noticeably.
  - Tradeoff: The message re-appears on reload and the parameter stays in the URL, which is presumably what motivated the change during QA.
  - Confidence: MEDIUM — straightforward to write, but it undoes a deliberate QA fix without knowing what prompted it.
  - Blind spot: Whether the cookie hop was added to fix an observed problem rather than as a preference.
- **Decision**: FIXED via Fix A — plan's Phase 2 change #1 gains an amendment describing the flash cookies, the `highlight` parameter, the cookie-scope caveat, and the `Object.hasOwn` requirement from F1

### F4 — The 404 branch lost its link back, but Progress 2.17 still claims it was verified

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence / Success Criteria
- **Location**: src/components/books/EditBookForm.tsx:260-266
- **Detail**: The plan requires that on 404 the form "shows a message stating the book is no longer in the TBR, with a link back to `/books`". The shipped branch is a bare paragraph reading "This book is no longer in your TBR." with no link; the link was removed in `cbd98c7`, the same commit that stamped Progress item 2.17 as verified "with a working link back". The user is not stranded — the page header's "View your TBR" link works and the guard correctly stands down once `notFound` is set — but the checkbox no longer describes the code.
- **Fix**: Restore an anchor to `/books` inside the not-found paragraph, matching the session-expired branch's inline link style at lines 330-337.
- **Decision**: FIXED differently — the link removal was deliberate (the header's "View your TBR" link is the way back, and the guard stands down once `notFound` is set, so it navigates without a prompt). Code left as-is; the plan's Phase 2 change #3 contract and Progress 2.17 were amended to match.

### F5 — The plan contradicts itself about which delete design shipped

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/edit-delete-book/plan.md:47,67,84,90,457
- **Detail**: Phase 3's contract was rewritten in `cbd98c7` — one commit *after* the code landed in `0ad450c` — to describe the `:target` modal in `DeleteBookTrigger.astro` + `DeleteBookModal.astro` that actually shipped. The earlier sections were not updated: Key Discoveries, What We're NOT Doing, Implementation Approach, Critical Implementation Details, and Performance Considerations all still describe a `<details>`/`<summary>` `DeleteBookForm.astro` with a `<summary>` that doubles as the cancel control. That component does not exist. A future reader (or `/10x-archive`) cannot tell from the plan which design is real.
- **Fix**: Update lines 47, 67, 84, 90, and 457 to describe the `:target` modal, and commit the working-tree plan changes that are currently unstaged.
- **Decision**: FIXED — six passages reconciled (Key Discoveries, Desired End State, What We're NOT Doing, Implementation Approach, Critical Implementation Details, Performance Considerations) plus the stale `<details>` reference entry. Committing the plan remains for the user.

### F6 — The confirmation modal claims modality it cannot deliver, and cancelling drops focus

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/books/DeleteBookModal.astro:16-17,21,37
- **Detail**: Two related accessibility problems in the zero-JavaScript modal. First, it declares `aria-modal="true"`, which tells assistive technology that everything outside the dialog is unavailable — false here, since there is no script to move focus in, trap it, or mark the page inert; the underlying 145-row list stays fully focusable, and a screen-reader user gets no announcement that a confirmation appeared. Second, both the backdrop and Cancel point at `href="#_"`, a fragment matching no element. That is deliberate and correct for scroll position, but the element the user just activated becomes `display: none` the instant the fragment changes, so focus resets to the document: a keyboard user who cancels at row 100 restarts tabbing from the top of the page. Keyboard reachability itself is fine — the trigger is a real anchor, and navigating to the fragment puts the sequential focus starting point inside the modal, so Tab reaches both buttons.
- **Fix**: Drop `aria-modal="true"` (keep `role="dialog"` and `aria-labelledby`), and point Cancel and the backdrop at `#book-${id}` on the browse page — the `<li id="book-${id}">` already exists, so it closes the modal, restores the focus starting point to the row, and reuses the existing `.book-row:target` emphasis as a bonus. The edit page has no such element and needs its own anchor.
- **Decision**: FIXED — `aria-modal` removed; `DeleteBookModal` gained a required `dismissHref` prop wired to `#book-<id>` on the browse page and to a new `#delete-controls-<id>` wrapper id on the edit page. Worth a QA glance: cancelling on `/books` now re-runs the row's 2-second emphasis animation, which is a nice "here's where you were" cue but could read as "something changed".

### F7 — A successful delete is silent, while deleting twice reports an error

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/books/[id]/delete.ts:37-41
- **Detail**: Success redirects to a bare `/books` with no confirmation, but a repeated delete of the same book lands in the zero-row branch and shows "That book is not in your TBR." The zero-row branch is correct as authorization logic — it must not distinguish "already gone" from "not yours" — yet it means a double-clicked confirm button, a modal open in two tabs, or a delete from both `/books` and the edit page reports failure after an operation that actually succeeded. The plan chose silence deliberately ("the honest signal is the shorter list and the lower count"), but it did not anticipate the repeat-submit reading as an error, and the edit flow by contrast does have a feedback surface.
- **Fix**: Add a `deleted` code to `REDIRECT_NOTICES` and redirect the success path to `/books?notice=deleted`, so a delete confirms itself and a duplicate submission no longer reads as a failure.
- **Decision**: FIXED — verified live: deleting a throwaway book redirects to `/books?notice=deleted` and the list shows "Book deleted."; a repeat delete of the same id still redirects to `?error=not_found`, so the authorization signal is unchanged. Plan's redirect code table, Phase 3 change #1, and automated criterion 3.4 updated to match.

### F8 — CSRF protection on the destructive route is entirely implicit

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: astro.config.mjs (absent `security` block); src/lib/supabase.ts:10-24
- **Detail**: The delete route is a cookie-authenticated hard-delete driven by a plain HTML form post, so CSRF is the right question to ask. It resolves in the branch's favour, verified rather than assumed: Astro's origin check defaults to `true` and is `true` in the built worker manifest, so a cross-site form POST is rejected with 403 before user middleware runs — confirmed live, where a POST carrying `Origin: https://evil.example` and a form content type was refused. Independently, `@supabase/ssr` sets `SameSite=Lax`, so the auth cookie is not attached to a cross-site POST at all. The JSON `PUT` endpoint is separately safe because `application/json` triggers a preflight and no CORS handler exists to grant one. The concern is durability, not current exposure: nothing in this repo pins either default. A future `security: { checkOrigin: false }` (a common fix for third-party webhook routes) or a `cookieOptions: { sameSite: "none" }` would silently make a hard-delete endpoint CSRF-able with no signal in code review.
- **Fix**: Add an explicit `security: { checkOrigin: true }` to `astro.config.mjs` with a comment naming `/api/books/[id]/delete` as the reason, and note the `SameSite=Lax` dependency in the AGENTS.md hard rules beside the existing cookie guidance.
- **Decision**: FIXED — `security: { checkOrigin: true }` pinned with a comment; confirmed still `true` in the rebuilt worker manifest. AGENTS.md gained a hard rule covering both the origin check and the `SameSite=Lax` cookie dependency. Opportunistically corrected the adjacent `PROTECTED_ROUTES` rule, which claimed auth gating happens "nowhere else" while every `src/pages/api/` route self-authenticates instead.
- **Tester note**: the regression check is a single command — a POST to the delete route carrying a foreign `Origin` header must return 403, never 302.

### F9 — Local scale fixture left untracked and the local database left un-reset

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: supabase/snippets/Untitled query 322.sql
- **Detail**: The Phase 4 scale fixture — a `generate_series(1, 120)` insert of "Scale Test N" rows hardcoded to user C's UUID — was saved as a Supabase Studio scratch file inside the repo. The plan calls this fixture "local only — do not commit", but `.gitignore` has no `supabase/` entry, so it shows up as untracked and would be swept in by a `git add -A`. It holds no secrets. Related: Phase 4 ends with `npx supabase db reset`, which has not been run — user C currently owns 17 books rather than the seeded 25, so a future manual test starts from a drifted fixture. The committed isolation proof is unaffected, since it asserts only on user A.
- **Fix**: Delete the snippet (or add `supabase/snippets/` to `.gitignore`) and run `npx supabase db reset`.
- **Decision**: FIXED — `supabase/snippets/` added to `.gitignore`, and `npx supabase db reset` run. Fixtures are back to 6 / 6 / 25 / 0 and `rls.sql` passes against the reset stack.

### F10 — Small consistency nits across the new files

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/books/[id].ts:6-11,46; src/components/books/EditBookForm.tsx:33-37; src/components/books/DeleteBookModal.astro:19
- **Detail**: Four minor items, none behavioural on their own. (1) `jsonResponse` is duplicated verbatim between `api/books.ts:6-11` and `api/books/[id].ts:6-11` — conspicuous because the branch did hoist the adjacent concern, renaming the response types into `book-schema.ts` cleanly. (2) The field-error cap at `[id].ts:46` copies the code from `books.ts:40-41` but not the comment explaining why the cap exists. (3) The comment "Mirrors TropeInput's commit rules…" now sits above the newly inserted `arraysEqual` helper instead of above `mergePendingTrope`, so it documents the wrong function. (4) The `notFound` effect hides `[data-edit-delete-controls]` with the `hidden` attribute, but that attribute is also on the modal root, where the author rule `.delete-modal:target { display: flex }` outranks the UA `[hidden]` rule — so a modal that is already open stays visible and clickable. Blast radius is nil: the book is already gone, so the POST finds zero rows and redirects to `/books?error=not_found`.
- **Fix**: Hoist `jsonResponse` into a shared module, carry the cap comment across, move the `mergePendingTrope` comment back above its function, and hide the modal via a class the `:target` rule also respects.
- **Decision**: FIXED — all four. `jsonResponse` now lives in `@/lib/book-schema.ts` beside the response types it is typed against, and both endpoints import it; the field-error cap comment was carried across; the `mergePendingTrope` comment moved back above its own function; and `global.css` gained `.delete-modal[hidden]:target { display: none }`, which outranks the open rule on specificity without needing `!important`.

## Notes

- **No critical findings.** The authorization core is the strongest part of this branch. All three new surfaces self-authenticate, scope every query by `user_id`, and — the trap the plan singled out — branch on the returned row count rather than on `error`, so an RLS-silenced cross-account write cannot report success. Cross-account access returns a byte-identical not-found signal on every surface, with no timing or content distinction between "does not exist" and "not yours".
- **Scope guardrails were respected.** `git diff a0be6a7^..HEAD` is empty for `supabase/**`, `package.json`, `package-lock.json`, `components.json`, `wrangler.jsonc`, and `astro.config.mjs` — no migration, no RLS or seed change, no new dependency, no shadcn install. `SavedBooksList.tsx` is untouched, `AddBookForm.tsx` changed only on the five rename lines, and none of undo, bulk delete, concurrency control, a detail page, `PATCH`, or search appears anywhere.
- **Phase 1 is a clean match to its contract**, line for line, including the `.neq("id", id)` self-match exclusion, the one-message-per-field cap, the omission of `user_id` and `updated_at` from the update payload, and the generic 404 body.
- **`/books` remains zero-JavaScript**, satisfying the accepted lesson about per-row list surfaces. The row highlight also terminates correctly: the keyframes end at exactly the row's resting `border-white/10` and `animation-fill-mode: forwards` holds that identical state, so the row looks normal after two seconds even while the fragment persists.
- **The one remaining gap the plan itself flags** is that `run_worker_first` deep-matching for `/api/books/<id>` and `/api/books/<id>/delete` cannot be exercised locally or in CI. Progress items 4.2 and 4.7 are correctly still open — no PR is open on `feat/edit-delete-book` and no workflow run exists for it.
