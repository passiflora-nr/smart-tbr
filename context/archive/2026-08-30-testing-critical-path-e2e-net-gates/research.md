---
date: 2026-09-06T11:40:00+02:00
researcher: Cursor Agent
git_commit: d9d7d9c9c760ffe8a9f9f77a85019b21a542a00e
branch: testing-critical-path-e2e-net-gates
repository: passiflora-nr/smart-tbr
topic: "Ground rollout Phase 4 of the test plan: critical-path e2e net and CI gates"
tags: [research, codebase, e2e, playwright, ci, books, mood, auth, islands]
status: complete
last_updated: 2026-09-06
last_updated_by: Cursor Agent
last_updated_note: "Added follow-up research for mood empty-state reachability, mergePendingTrope, and e2e non-goals"
---

# Research: Grounding Test-Plan Phase 4 — Critical-Path E2E Net + Gates

**Date**: 2026-09-06 11:40 (UTC+2)
**Researcher**: Cursor Agent
**Git Commit**: `d9d7d9c9c760ffe8a9f9f77a85019b21a542a00e`
**Branch**: `testing-critical-path-e2e-net-gates`
**Repository**: `passiflora-nr/smart-tbr`

> Branch is not pushed; references stay as local `path:line`.

## Research Question

Ground rollout Phase 4 of `context/foundation/test-plan.md` ("Critical-path e2e net + gates"): a thin browser-level net over sign-in → add book → browse → mood pick, run on Chromium, Firefox, and WebKit, wired as a required CI gate before S-07 starts.

Risks to verify: #2, #3 (cross-cutting).

Risk response guidance to verify, not blindly accept:

- **#2**: prove submitting a filter, search, delete, or edit action produces the changed **set of books** the user expects, driven by what the control really sends; challenge that a rendered control implies it works; avoid CSS classes, DOM structure, or element counts.
- **#3**: prove every critical flow still passes after a page's markup has been rewritten wholesale; challenge that "tests pass" implies behaviour is safe when the tests were coupled to the old markup; avoid snapshot tests and any assertion on class names, colours, or layout.

Hot-spot directories cited as likelihood evidence (not anchors): `src/pages/books`, `src/components/books`, `src/pages`, `src/lib`.

## Summary

Phase 2 already closed the cheapest half of Risk #2. Filter, search, and delete change the set of books through **server HTML** (GET query params and a form POST). Those outcomes are proven today by `tests/unit/book-filters.test.ts` and `tests/integration/books-surface.test.ts`. Mood pick is also **zero-JS server HTML**; Phase 1 already proves the result set with `GET /mood?trope=…&submitted=1`. Repeating those matrices in a browser would violate cost × signal.

What Phase 4 must still prove is the **island-dependent hops** and the **stitch** between hops:

1. Sign-in is a React island wrapping a native form POST. Integration signs in by posting `/api/auth/signin` directly and never clicks **Sign in**.
2. Add-to-TBR and Edit Save are React 19 form actions that `fetch` JSON. Without JavaScript they do nothing. Integration posts the APIs and never clicks those buttons.
3. After add, the page **stays on `/books/new`**. The book only appears on Your TBR after the user follows **View your TBR**. That navigation hop is unproven except in an incomplete seed spec.
4. S-07 is a per-page class-and-markup rewrite, not a token swap. Tests that assert titles, statuses, and fixed copy will survive it. Tests that assert classes, structure, counts, or `Edit ${title}` as a stand-in for "the book is on the list" will be deleted by the rewrite instead of protecting it.

Playwright is **already a devDependency** (`@playwright/test` ^1.63.0). A seed commit on this branch added `playwright.config.ts` and `tests/e2e/seed.spec.ts`. The harness is not runnable: it references a missing `auth.setup.ts`, has no `baseURL` or `webServer`, only Chromium, no `test:e2e` script, and no CI step. Cookbook §6.3 is still TBD. Test-plan §4 still says "e2e none yet" — that line is stale.

**Cheapest remaining layer:** one Playwright journey on all three engines, plus CI wiring. Do not add e2e cases for FR-012 filter combinations, mood expansion math, ownership, or origin checks.

No speculative risk to drop. Hot-spot dirs `src/pages/books` and `src/components/books` are valid for add/edit islands. They are **misleading** as the only Phase 4 surface: the remaining "renders but does nothing" failures also live in `src/pages/auth` / `src/components/auth`. `src/lib` matching rules are already unit-tested and are not an e2e failure path.

## Detailed Findings

### Risk #2 — which controls actually send data

Only four `client:*` directives exist in `src/`. All are `client:load`:

```16:16:src/pages/auth/signin.astro
      <SignInForm serverError={error} client:load />
```

```16:16:src/pages/auth/signup.astro
      <SignUpForm serverError={error} client:load />
```

```36:36:src/pages/books/new.astro
      <AddBookForm client:load />
```

```89:90:src/pages/books/[id]/edit.astro
        <EditBookForm
          client:load
```

Everything else on the named critical path — home, Your TBR, filter bar, delete modal, mood picker, show-more, sign-out — is server-rendered HTML.

| Control                   | Transport                                                                    | JS required?                        | Observable success                                        | Already proven?                                                |
| ------------------------- | ---------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| Sign in                   | Native `POST /api/auth/signin`; island validates and holds controlled inputs | **Yes** to type and submit honestly | Redirect to `/` with a session                            | API POST only (`http-session.ts`)                              |
| Add to TBR                | `fetch POST /api/books` from `action={handleSave}`                           | **Yes**                             | Session list on `/books/new`; title on later `GET /books` | API POST + list GET. Button click only in incomplete seed spec |
| View your TBR (after add) | `<a href="/books">`                                                          | No                                  | Title visible on Your TBR                                 | Seed spec clicks it; no auth/harness                           |
| Search / Apply filters    | `GET /books` with `q` + repeated `trope`                                     | No                                  | Titles narrow (FR-012 all-match AND)                      | Integration GET with hand-built query strings                  |
| Delete permanently        | `POST /api/books/{id}/delete` after `:target` modal                          | No                                  | Title gone; sibling titles remain                         | Integration form POST + GET. Seed spec also clicks confirm     |
| Save changes              | `fetch PUT /api/books/{id}` then `window.location` to `/books`               | **Yes**                             | New title on list; old title gone                         | PUT + GET only — **Save click unproven**                       |
| Find my next read         | `GET /mood` with `trope` + `submitted=1`                                     | No                                  | Matching titles; or "No matches — try different tropes."  | Integration GET. Checkbox + button click unproven              |
| Show me N more            | `<a href={buildMoodHref(…)}>`                                                | No                                  | Next slice of titles                                      | Unit on `mood-selection.ts`; no page click                     |

#### Sign-in (island wrapping a native POST)

```43:43:src/components/auth/SignInForm.tsx
    <form method="POST" action="/api/auth/signin" className="space-y-4" onSubmit={handleSubmit} noValidate>
```

`handleSubmit` calls `preventDefault` when client validation fails (`SignInForm.tsx:36-39`). Inputs are controlled (`FormField.tsx:77-78`). Success lands on `/`, not `/books`:

```19:19:src/pages/api/auth/signin.ts
  return context.redirect("/");
```

A test that only posts the API never proves the **Sign in** button. A test that only asserts the form `action` is present never proves typing or submit. That is the "rendered control implies it works" challenge for this hop.

#### Add book (island; no browse redirect)

```103:110:src/components/books/AddBookForm.tsx
      response = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        // Without this a hung request leaves useFormStatus pending forever,
        // and the only way out is a refresh that clears the session list.
        signal: AbortSignal.timeout(15000),
      });
```

The form is `<form action={handleSave}>` (`AddBookForm.tsx:173`) — a React 19 function action, not a URL. Tropes commit only through `TropeInput` (Enter / comma / `mergePendingTrope` on Save). After `201` the island clears the fields and appends to `SavedBooksList`. It does **not** navigate to `/books`.

The header link **View your TBR** lives on the page shell (`src/pages/books/new.astro:15-20`), not inside the island. The seed spec's click of that link is the stitch from add to browse.

#### Edit save (island + client navigation)

```208:243:src/components/books/EditBookForm.tsx
      response = await fetch(`/api/books/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      // ...
        window.location.href = buildBooksHref(filterQuery, { hash: `book-${id}` });
```

Button label is **Save changes** (`EditBookForm.tsx:370`). Integration never clicks it. This is the remaining Risk #2 control that changes a book's fields and then the list set.

#### Browse / filter / delete (zero-JS; do not re-e2e the matrix)

`BookFilterBar.astro` is `<form method="GET" action="/books">` with `name="q"`, checkboxes `name="trope"`, and **Apply filters**. `index.astro:45-46` parses the URL and `index.astro:112` filters with `matchesBookFilters`. Delete is a hash-link modal plus form POST (`DeleteBookModal.astro:55-65`). Phase 2 integration already asserts which titles remain.

A browser click of **Apply filters** would prove the form still posts `q` / `trope`. That is a cheap extra inside a journey if the user is already on `/books`, not a reason to replay the four-book FR-012 matrix.

#### Mood pick (zero-JS; opposite `trope` rule)

```19:19:src/components/books/MoodPicker.astro
<form method="GET" action="/mood" class="mb-6 rounded-lg border border-white/10 bg-white/5 p-4">
```

Submit is **Find my next read** (`name="submitted" value="1"`). Expansion is an `<a>` (`mood.astro:173-178`). Matching is **any-match OR** (`matchesAnyTrope`), not browse's all-match AND. Same query key, opposite set. E2e must drive `/mood`, never `/books?trope=`, if it includes this hop.

Phase 1 already proves the result set:

```132:152:tests/integration/books-persistence.test.ts
      const moodMatchResponse = await fetch(
        `${astroBaseUrl}/mood?${new URLSearchParams({ trope: matchingTrope, submitted: "1" }).toString()}`,
        {
          headers: { Cookie: astroCookieHeader },
          redirect: "manual",
        },
      );
      expect(moodMatchResponse.status).toBe(200);
      const moodMatchHtml = await moodMatchResponse.text();
      expect(moodMatchHtml).toContain(normalizedTitle);
      // ...
      expect(moodNoMatchHtml).toContain("No matches — try different tropes.");
```

#### Navigation after sign-in

Signed-in home (`Welcome.astro:54-71`) offers **Pick by mood** (`/mood`), **View your TBR** (`/books`), **Add a book** (`/books/new`). There is no shared nav component. S-07's change note plans to extract one while restyling. Load-bearing hrefs for the critical path are those three plus `/auth/signin` and the post-sign-in redirect to `/`.

Protected prefixes (`src/lib/protected-routes.ts:2`): `/books`, `/mood`, `/account`. Middleware redirects unsigned visitors (`src/middleware.ts:17-20`).

### Risk #3 — what S-07 will actually rewrite

S-07 (`context/changes/ui-theme-cafe-romance/change.md`) is **not** a CSS-variable swap. Pages hardcode cosmic Tailwind (`bg-cosmic`, `bg-white/10 backdrop-blur`, gradient headings). The slice rewrites those classes surface by surface, drops the star-field / orb markup in `Welcome.astro`, wires fonts, and **rebuilds the book list as a cover-forward grid**. Roadmap S-07 also flags consolidating the five hand-rolled nav rows.

That confirms Risk #3: a restyle can break a form `action`, drop an `aria-label`, or turn a native GET form into an island. "The existing tests still pass" is only safety if those tests assert behaviour, not today's markup.

**Safe oracles (survive a wholesale rewrite):**

- Book title and author as visible text
- Fixed copy: `Your TBR is empty — add your first book to get started.`, `No books match your`, `No matches — try different tropes.`, `Add a book to your TBR first.`
- HTTP status and resulting URL (`/`, `/books`, `/mood?…`)
- Button / link **accessible names that are product copy**: Sign in, Add to TBR, Save changes, Find my next read, View your TBR, Pick by mood

**Unsafe oracles (S-07 will change them on purpose):**

- CSS classes, colours, layout, snapshots
- DOM structure (`.book-row`, `ul` vs cover grid, `:target` modal markup)
- Element counts, including `toHaveCount(0)` as a substitute for "title is gone"
- Heading `Your TBR (N of M)`
- `getByRole("link", { name: \`Edit ${title}\` })` as the **only** proof the book is on the list — S-07's cover-forward grid may change Edit from a labelled link to something else. Assert the title text.

Phase 2 integration already follows the safe set (titles and copy). The seed spec does not: it uses the Edit link role as the list oracle and `toHaveCount(0)` in cleanup (`tests/e2e/seed.spec.ts:26-36`).

`lessons.md` still applies: prefer native HTML on per-row list surfaces; verify browse/filter/delete with JavaScript disabled. Phase 2's raw HTTP GET **is** that verification. Phase 4 must not replace it with Playwright.

### Existing tests

| File                                          | What it proves                                                                                          | Browser click?                        | Risk                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------- |
| `tests/unit/book-filters.test.ts`             | FR-012 parse/match rule                                                                                 | No                                    | #2 rule only                      |
| `tests/unit/mood-selection.test.ts`           | FR-010 any-match, slice, href                                                                           | No                                    | #5                                |
| `tests/unit/book-schema.test.ts`              | Shared accept/reject                                                                                    | No                                    | #6                                |
| `tests/integration/books-surface.test.ts`     | Titles on `GET /books` after filter/search/edit/delete; empty / no-match copy; GET transport substrings | No — constructed URLs, PUT, form POST | #2 / #3 for server HTML           |
| `tests/integration/books-persistence.test.ts` | POST/PUT persistence; mood HTML title + no-match copy                                                   | No                                    | #1; mood GET                      |
| `tests/integration/access-control.test.ts`    | Ownership, origin, route gate                                                                           | No                                    | #4, #7 — do not re-test           |
| `tests/e2e/seed.spec.ts`                      | Add-to-TBR click → View your TBR → reload → delete confirm                                              | Yes, but harness incomplete           | Draft #1/#2; not the Phase 4 path |

Filter matrix already in integration (`books-surface.test.ts:127-186`): unfiltered, `q=Alpha`, two tropes all-match, combined, clear-search destination. Delete set-of-books at `:273-295`. Edit via PUT then GET at `:242-270`.

Cookbook §6.3 is still TBD (`test-plan.md:122-124`). §6.6 already says Add/Save button clicks stay in Phase 4.

Four untracked Finder copies (`playwright.config 2.ts`, `tests/e2e/seed.spec 2.ts`, `tests/integration/access-control.test 2.ts`, `src/lib/protected-routes 2.ts`) are not picked up by Vitest or Playwright globs. Delete them during implement; they are not product.

### Playwright / CI / deploy gates

**Today's CI** (`.github/workflows/ci.yml:11-27`): Node 22 → `npm ci` → `npx astro sync` → `npm run lint` → `npx supabase start --exclude …` → `npm test` → `npm run build`. No Playwright. Deploy (`:29-68`) needs `ci`, runs only on push to `main`, and does not re-run tests. Production curl smokes are not a browser net.

**Playwright on disk (seed commit `d9d7d9c`):**

- `@playwright/test` ^1.63.0 in `package.json:45`
- `playwright.config.ts` — `setup` project matching `/auth.setup.ts/` (file missing) + Chromium with `storageState: "playwright/.auth/user.json"`
- No `baseURL`, no `webServer`, no Firefox/WebKit, no `test:e2e` script
- `playwright/.auth/` and `.playwright-cli/` are gitignored

Official Playwright config (Context7 `/websites/playwright_dev`, checked 2026-09-06): projects via `devices['Desktop Chrome' | 'Desktop Firefox' | 'Desktop Safari']`; `webServer` with `reuseExistingServer: !process.env.CI`; CI install `npx playwright install --with-deps`. Auth setup-project + `storageState` is the documented pattern — the seed config copied the shape without the setup file.

**Harness reuse:** Integration already starts loopback Supabase and `npm run dev` on `http://127.0.0.1:14567` with pinned local keys and a blank `SUPABASE_SERVICE_ROLE_KEY` (`tests/integration/support/local-services.ts:16-17`, `:249-260`). Playwright cannot `inject()` Vitest provides. Cheapest reuse: Playwright `globalSetup` imports `startLocalServices` / `stopLocalServices`. Do not target production Workers. Do not invent a second coordinate parser.

**Auth for e2e:** User D (`user-d@example.test` / `password123`, `supabase/seed.sql:166-167`) is the mutation account. User A stays read-only. Seed spec uses title prefix `[e2e]-Book-` — keep a reserved `[e2e]` prefix so it does not collide with `[integration-test]`. At least one test must click **Sign in** on `/auth/signin` (Risk #2). `storageState` may cache that session for later hops; it must not replace the only sign-in proof.

**Three engines:** PRD NFR requires the latest two major versions of the four mainstream desktop browsers. Chromium covers Chrome and Edge. Firefox and WebKit are the other two. WebKit-on-Linux-CI caveat in §4 remains valid — quarantine that engine if it goes noisy; do not drop the matrix.

**"Full-suite run before S-07"** (`test-plan.md:98`) is a **local-once** gate, not a CI job. CI should run the thin e2e net on every PR. The owner still runs the full suite once locally before starting S-07.

`infrastructure.md:78` and `:126` still describe CI as "lint + build" and omit `npm test` plus the Supabase Docker step. That is doc drift; refresh when Phase 4 lands, not a §2 edit.

### Risk verdicts vs response guidance

| Risk   | Verdict                                                                                                                                                                                                                                    | Guidance correction                                                                                                                                                                                                                                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#2** | Real. Phase 2 already proves the **set of books** for filter/search/delete via HTTP. Remaining failure is island submit (Sign in, Add to TBR, Save changes) and the add→browse stitch.                                                     | Do **not** treat "unit + integration" as Phase 4 work — that layer shipped. Phase 4's cheapest layer is **thin e2e**. Do **not** e2e the FR-012 matrix or delete-as-proof; those are already green. "Rendered control implies it works" still holds for the islands. Anti-pattern still holds: no classes, structure, or counts. |
| **#3** | Real. S-07 rewrites markup on every surface, including a cover-forward list rebuild. Phase 2 tests that assert titles/copy will protect server HTML. They cannot see an island whose `fetch` URL or form `action` dies during the restyle. | "Integration plus a thin e2e net" is confirmed. Mood and browse do **not** need their own e2e suites; include them as hops in the one journey so a rewritten nav href cannot drop a step. Challenge stands: a green suite coupled to `Edit ${title}` / `toHaveCount` / CSS is not safety.                                        |

No speculative risk. Do not invent sort, pagination, signup, or account-delete e2e.

## Code References

- `src/pages/auth/signin.astro:16` — SignInForm `client:load`
- `src/components/auth/SignInForm.tsx:36-43` — client validation + native POST to `/api/auth/signin`
- `src/pages/api/auth/signin.ts:13-19` — password sign-in; success redirect `/`
- `src/components/Welcome.astro:54-71` — signed-in home CTAs (mood / TBR / add)
- `src/pages/books/new.astro:15-36` — View your TBR link + AddBookForm island
- `src/components/books/AddBookForm.tsx:103-136` — `fetch POST /api/books`; stay on page; session list
- `src/components/books/AddBookForm.tsx:173` — React 19 `action={handleSave}`
- `src/components/books/TropeInput.tsx:70-74` / `:119` — Enter/comma commit; `Remove ${tag}`
- `src/components/books/EditBookForm.tsx:208-243` — `fetch PUT` + `window.location` to `/books`
- `src/components/books/EditBookForm.tsx:370` — Save changes
- `src/pages/books/index.astro:45-46` / `:112` — parse filters; `matchesBookFilters`
- `src/components/books/BookFilterBar.astro:22-125` — GET form, Apply filters
- `src/components/books/BookList.astro:21-32` — title text; Edit `aria-label`; Delete trigger
- `src/components/books/DeleteBookModal.astro:55-65` — form POST delete
- `src/pages/mood.astro:31-87` / `:173-178` — server mood states; show-more link
- `src/components/books/MoodPicker.astro:19-76` — GET form; Find my next read
- `src/lib/protected-routes.ts:2` / `src/middleware.ts:17-20` — `/books`, `/mood`, `/account`
- `tests/integration/books-surface.test.ts:127-295` — filter/search/edit/delete title assertions
- `tests/integration/books-persistence.test.ts:132-152` — mood GET title + no-match copy
- `tests/integration/support/local-services.ts:16-17` / `:249-260` — Astro on `127.0.0.1:14567`
- `tests/e2e/seed.spec.ts:1-40` — incomplete add/delete seed; Edit-link oracle; `toHaveCount(0)`
- `playwright.config.ts:1-12` — Chromium-only; missing `auth.setup.ts`
- `.github/workflows/ci.yml:11-27` / `:29-31` — Vitest + build; deploy needs `ci`
- `package.json:45` — `@playwright/test` already installed
- `context/changes/ui-theme-cafe-romance/change.md:41-43` — per-page rewrite + cover-forward grid
- `context/foundation/prd.md:77-91` / `:139` — US-01 ritual; four-browser NFR

## Architecture Insights

1. **Two layers of Risk #2, not one.** Server HTML controls send query params or form posts. React islands send JSON via `fetch` and never fall back to a native POST. Phase 2 tested the first layer. Phase 4 must test the second.
2. **Add is not a browse mutation.** A green Add-to-TBR click that only checks the session list still misses Your TBR. The journey must follow **View your TBR** (or an equivalent navigation) and assert the title there.
3. **Sign-in success is home.** Any journey that expects to land on `/books` after Sign in is testing a contract that does not exist.
4. **Same `trope` param, opposite rules.** Browse = all-match AND. Mood = any-match OR. The e2e oracle for mood is US-01 / FR-010 (title appears among matches), not FR-012.
5. **S-07 will rebuild the list chrome.** Accessible names on Edit/Delete are today's convenience, not a stable product contract. Title text is the contract.
6. **Dev e2e is workerd, same as integration.** `npm run dev` through `@astrojs/cloudflare` is the honest target. Production Workers.dev is not a fixture environment.
7. **Seed config is a sketch.** It copied Playwright's auth-setup shape without the setup file, without three engines, and without a server. Treat it as a starting point to rewrite, not as the Phase 4 suite.

## Historical Context (from prior changes)

- `context/archive/2026-08-29-tbr-surface-behaviour/research.md` — Phase 2 grounded Risks #1–#3. Island Save / Add buttons were explicitly deferred to Phase 4. Browse/filter/delete are zero-JS; raw HTTP GET is the JS-off stand-in. Still accurate.
- `context/archive/2026-08-23-testing-harness-and-data-integrity/research.md` — user D is the mutation account; user A is frozen at six rows; `book-filters` is Node-importable; mood vs browse `trope` semantics.
- `context/archive/2026-08-30-access-controll-and-abuse/research.md` — ownership, origin check, `PROTECTED_ROUTE_PREFIXES`. Phase 4 must not re-test these.
- `context/archive/2026-08-15-mood-trope-recommendation/` — mood GET form + any-match; expansion via `show` query. Do not reuse browse fixtures as the mood oracle.
- `context/archive/2026-08-14-search-filter-tbr/plan.md` — FR-012 all-match; JS-disabled GET is the verification.
- `context/foundation/lessons.md:47-52` — native HTML on per-row list surfaces; verify with JavaScript disabled.
- `context/foundation/roadmap.md` S-07 — last optional slice; per-page rewrite; shared-nav opportunity.
- `context/changes/ui-theme-cafe-romance/change.md` — palette + cover-forward grid; pages do not consume semantic tokens today.

## Related Research

- `context/archive/2026-08-29-tbr-surface-behaviour/research.md` — Phase 2 TBR surface (Risks #1–#3)
- `context/archive/2026-08-23-testing-harness-and-data-integrity/research.md` — Phase 1 harness + Risks #1/#5/#6
- `context/archive/2026-08-30-access-controll-and-abuse/research.md` — Phase 3 ownership / origin / gating
- `context/archive/2026-08-15-mood-trope-recommendation/research.md` — mood any-match
- `context/archive/2026-08-14-search-filter-tbr/research.md` — filter transport (any-match inference is stale; plan won)

## Open Questions

None that block `/10x-plan`. Settled here:

- **One journey, three engines:** sign in (click) → add book (click Add to TBR, commit a trope) → View your TBR (title text) → Pick by mood → Find my next read (same title). Optional second case: Save changes after a title edit. Cleanup with a reserved `[e2e]` prefix, not `[integration-test]`.
- **Do not e2e:** FR-012 combinations, mood expansion math, delete-as-proof, ownership, origin, signup, account delete, snapshots, classes, counts.
- **Harness:** reuse `startLocalServices` (port `14567`, loopback Supabase, blank service-role key). Playwright `globalSetup`, not a second coordinate stack. `npx playwright install --with-deps` in CI. Add e2e to the existing `ci` job so deploy stays gated.
- **Seed spec:** rewrite or replace. Keep role/name locators; drop Edit-link-as-oracle and `toHaveCount(0)`.
- **Cookbook §6.3:** fill when the first real spec and the three-engine config land.
- **§4 "e2e none yet":** stale. Refresh with the implement phase or `--refresh`; not a §2 wording change.

Plan sub-phases by cost × signal: (1) make Playwright actually run against the local stack on three engines, (2) the thin journey with behaviour oracles, (3) CI gate + `test:e2e` + §6.3 cookbook. Challenge happy-path-only sign-in via `storageState` with no click. Oracle for the journey is US-01 + FR-002/FR-004/FR-005 (signed-in user adds a book, sees it on their TBR, picks it by mood) — not the implementation's session-list markup.

## Follow-up Research 2026-09-06T12:02+02:00

Late pass on mood, auth islands, and S-07. Confirms the verdicts above. Extra constraints for `/10x-plan`:

- **Mood empty-vocabulary is not a real e2e state.** Phase 1 already recorded that `empty-vocabulary` cannot happen through supported writes. `no-match` is reachable by typing a trope into the URL, not by ticking a checkbox the picker offered. Do not write an e2e that tries to tick a listed trope and expect "No matches — try different tropes."
- **A new mood submit drops `show`.** `MoodPicker.astro` does not post the expansion count. Clicking **Find my next read** again resets to three. That is already the S-05 contract and a unit test; the journey does not need a second expansion suite. Clicking **Show me N more** is optional S-07 wiring, cheaper as another authed GET with `show=` if needed at all.
- **`mergePendingTrope` is island-only and duplicated.** Add and Edit both commit leftover chip text on Save (`AddBookForm.tsx:25-36`, `EditBookForm.tsx:47-56`). The seed spec presses Enter before Add to TBR; that is enough for the thin net. A pending-text-without-Enter case is a useful boundary if a second island spec is added — it is not required for the CI journey.
- **Sign-in client validation is not the oracle.** `preventDefault` on empty/invalid fields is island-only. The server already accepts a raw POST. The journey should type a valid user-D email and password and land on `/`. Do not spend the thin net on the empty-field message.
- **Seed-spec delete is extra.** `tests/e2e/seed.spec.ts` clicks Delete → Permanently delete in `finally`. That is cleanup, not a Risk #2 proof. Prefer API/form cleanup with the `[e2e]` prefix so the journey does not e2e a zero-JS delete that Phase 2 already covers.
- **PRD leftovers stay out of e2e.** Empty-TBR copy, expansion clamp, the 2-second mood guardrail, and cross-account isolation are already unit/integration (and Phase 3 for isolation). Mobile projects are a PRD Non-Goal.
- **S-07 break that integration would miss:** dropping `client:load`, or turning Add/Edit into a native `action` that no longer `fetch`es `/api/books`. Restyling classes while leaving the fetch URLs intact is not a new persistence bug — it is why the **button click** still belongs in e2e.
