---
date: 2026-08-30T16:06:39+02:00
researcher: Cursor Agent
git_commit: 123040d01661114fc0cb05946842c77866e2eab1
branch: access-controll-and-abuse
repository: passiflora-nr/smart-tbr
topic: "Ground rollout Phase 3 of the test plan: ownership, origin checks, and route gating (risks #4, #7)"
tags: [research, codebase, access-control, origin, csrf, middleware, integration-tests]
status: complete
last_updated: 2026-08-30
last_updated_by: Cursor Agent
---

# Research: Grounding Test-Plan Phase 3 — Access Control and Abuse

**Date**: 2026-08-30 16:06 (UTC+2)
**Researcher**: Cursor Agent
**Git Commit**: `123040d01661114fc0cb05946842c77866e2eab1`
**Branch**: `access-controll-and-abuse`
**Repository**: `passiflora-nr/smart-tbr`

> Permalink base for any reference below: `https://github.com/passiflora-nr/smart-tbr/blob/123040d/<path>#L<line>`.
> References are kept as local `path:line` so they stay clickable in the editor; this commit is on `origin/main`, so the base above resolves them permanently.

## Research Question

Ground rollout Phase 3 of `@context/foundation/test-plan.md` ("Access control and abuse"). Verify risks #4 and #7 against the live codebase — confirm, refute, or relocate each — and ground the three questions the plan assigned to this research:

1. Which client and key each mutating route uses, how ownership is verified per request, and how the origin check is enforced.
2. The actual enumerated protected-route set, and how API routes self-authenticate differently from page routes.
3. What the existing integration harness can reuse so Phase 3 extends it instead of inventing a second fixture style.

No implementation.

## Summary

Both risks are real, live in our code (not only in Supabase), and are untested at the HTTP layer today. Phase 3 can stay inside the existing Vitest integration project. It needs a **second signed-in session** (user A as a read-only attacker), new cases for ownership / forged-origin / gating, and a way to **derive** the protected-route list from the app. It does **not** need a second runner, Playwright, or automated `rls.sql`.

**Risk #4 is confirmed and split across two different defences.** Book create / update / delete all use the cookie-scoped anon client (`SUPABASE_KEY`) and filter by `user.id` from `getUser()`. A foreign book id comes back as **not found** (404 JSON on `PUT`, `?error=not_found` redirect on form delete), not as success and not as 403. The cookie-authenticated hard delete is a plain HTML form; Astro’s global `security.checkOrigin: true` plus default `SameSite=Lax` cookies are the only CSRF defence — there is no token. JSON create/edit are **not** covered by `checkOrigin` (it only inspects form-like content types); they rely on SameSite and the absence of CORS. The service-role client exists only for `auth.admin.deleteUser` on account delete and is blanked in the integration Astro child.

**Risk #7 is confirmed and fail-open.** The real list is three prefixes: `"/books"`, `"/mood"`, `"/account"`. Unlisted page routes are public. `/books/new` has no page-level sign-in check and depends entirely on the `/books` prefix. JSON book routes return **401 JSON**; form-post delete routes return a **302 to sign-in**. That split is intentional (`AGENTS.md`) and must not be flattened into “every API returns 401.” `PROTECTED_ROUTES` is a private `const` — a table-driven sweep cannot import it today.

**Where this research disagrees with the plan** (research is ground truth per test-plan §1 principle #3):

- Risk #7’s “every JSON endpoint returns 401 rather than an HTML sign-in page” is true only for `POST /api/books` and `PUT /api/books/[id]`. Form-post APIs (`POST /api/books/[id]/delete`, `POST /api/account/delete`) redirect. Treat that as the contract, not a gap.
- A two-account HTTP test proves the **user-visible** isolation contract and the S-03 “empty result → not found” branch. It cannot prove that `.eq("user_id")` exists independently of RLS while both stay on. Do **not** promote `supabase/tests/rls.sql` into CI to close that gap — test-plan §7 forbids testing vendor RLS.
- The “two-account fixture” must **not** write to user A’s six seed books. Sign in A as the attacker; let D create the victim row. A write that actually lands on A would break the hand-run RLS script.
- `PROTECTED_ROUTES` cannot be imported as-is. Phase 3 should extract it to a shared module (small product change) so the test derives the list from the app.

## Detailed Findings

### Mutating routes, clients, and keys

There are seven API files under `src/pages/api/`. None of them is a GET. There are no Astro server actions; every mutation is an `/api/*` POST or PUT.

| Route                         | Method    | Client                               | Key                     | Unauthenticated                        | Ownership in our code                                                                             |
| ----------------------------- | --------- | ------------------------------------ | ----------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `POST /api/books`             | POST JSON | `createClient`                       | `SUPABASE_KEY` (anon)   | 401 JSON `{ "error": "Unauthorized" }` | Insert sets `user_id: user.id`; `bookSchema` has no `user_id` field                               |
| `PUT /api/books/[id]`         | PUT JSON  | `createClient`                       | anon                    | 401 JSON                               | `.update(...).eq("id", id).eq("user_id", user.id)`; empty → 404 JSON                              |
| `POST /api/books/[id]/delete` | POST form | `createClient`                       | anon                    | 302 `/auth/signin`                     | `.delete().eq("id", id).eq("user_id", user.id).select()`; empty → 302 `error=not_found`           |
| `POST /api/account/delete`    | POST form | `createClient` + `createAdminClient` | anon + **service role** | 302 `/auth/signin`                     | Deletes `user.id` from `getUser()` only; service role is `auth.admin.deleteUser`, not a TBR query |
| `POST /api/auth/signin`       | POST form | `createClient`                       | anon                    | N/A (creates session)                  | —                                                                                                 |
| `POST /api/auth/signup`       | POST form | `createClient`                       | anon                    | N/A                                    | —                                                                                                 |
| `POST /api/auth/signout`      | POST form | `createClient`                       | anon                    | Always 302 `/`                         | —                                                                                                 |

`createClient` (`src/lib/supabase.ts:6-24`) returns `null` when env is unset, passes **no** `cookieOptions`, and therefore keeps `@supabase/ssr`’s default `SameSite=Lax`. `createAdminClient` (`src/lib/supabase-admin.ts:1-17`) is documented as account-delete-only and is imported only by `src/pages/api/account/delete.ts`. Integration Astro starts with `SUPABASE_SERVICE_ROLE_KEY: ""` (`tests/integration/support/local-services.ts:256`), so the suite cannot accidentally exercise a service-role TBR path.

There is **no shared ownership helper**. `.eq("user_id", user.id)` is copy-pasted on update, delete, duplicate lookup, and the read pages (`books/index.astro`, `edit.astro`, `mood.astro`). A future route that forgets the filter still has RLS behind it **if** the anon key stays anon.

### How a foreign book id fails (our code, not 403)

The S-03 plan recorded the trap: RLS answers a cross-account mutate with **silence**, not an error. A handler that only checks `error` would treat a blocked delete as success (`context/archive/2026-08-11-edit-delete-book/plan.md:88`). Current handlers chain `.select()` / `maybeSingle()` and treat an empty result as not found:

- `PUT` → 404 JSON `{ "error": "Book not found" }` (`src/pages/api/books/[id].ts:80-81`)
- Form delete → 302 to `/books?...error=not_found` (`src/pages/api/books/[id]/delete.ts:47-48`)
- Edit page load → same `error=not_found` redirect (`src/pages/books/[id]/edit.astro:50-51`)

That empty-result branch **is** our code and is the cheapest Risk #4 oracle: status + “the victim row is still there.” Do not assert 403. Do not assert that Postgres denied the row.

Honest limit: if someone deleted the `.eq("user_id")` filter but left RLS and the anon key intact, this HTTP test would still pass. That is the “RLS covers it” challenge the plan named. Closing it would mean testing vendor RLS or inspecting SQL — both out of Phase 3 scope per §7. What HTTP **does** catch is the S-03 success-on-silence bug, a handler that returns 200/deleted for a foreign id, and a future path that used the service-role client for books (the harness already blanks that key).

### Origin check and the delete form-post

Pinned globally, no exemptions:

```17:21:astro.config.mjs
  // Pinned, not defaulted: POST /api/books/[id]/delete is a cookie-authenticated
  // hard delete driven by a plain HTML form, so it is forgeable from another site
  // the moment this is off. Turning it off to unblock a webhook route would be a
  // silent security regression — exempt that route another way instead.
  security: { checkOrigin: true },
```

`DeleteBookModal.astro:55` posts `application/x-www-form-urlencoded` to `/api/books/${id}/delete`. Astro’s check runs **before** the handler on form-like POST/PUT/PATCH/DELETE and compares the `Origin` header to the request URL. Archive evidence: missing Origin or `Origin: https://evil.example` → **403** with body `Cross-site POST form submissions are forbidden` (`context/archive/deploy-plan.md:72,142`; `context/archive/2026-08-11-edit-delete-book/reviews/impl-review.md:60-61`). There are **no CSRF tokens** in `src/`.

`checkOrigin` does **not** apply to `application/json`. `AddBookForm` / `EditBookForm` `fetch` calls are therefore outside this defence; they depend on SameSite=Lax (cookie not sent on a cross-site POST) and the lack of CORS headers.

`wrangler.jsonc:12` `assets.run_worker_first: ["/api/*"]` is a prerequisite: without it, production `/api/*` can 1003/403 at the Static Assets router and never reach Astro’s origin check. That is an ops gate, not a Vitest assertion.

Same CSRF class, lower Phase 3 priority: `POST /api/account/delete` is also a cookie-authenticated HTML form (`DeleteAccountModal.astro`). A forged-origin 403 can be asserted **without** deleting a seed user, because the check fails before the handler. Do not run a successful account-delete against A/B/C/D.

### Route gating — the real list

```4:22:src/middleware.ts
const PROTECTED_ROUTES = ["/books", "/mood", "/account"];
// ...
  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }
```

Matching is **prefix** `startsWith`, not an exact path segment. `/books/new` and `/books/{id}/edit` inherit `/books`. A future `/bookshelf` would also match — a naming hazard, not a current leak.

Middleware runs on every request, including `/api/*`, but API paths do not start with those prefixes, so they are **not** redirected to HTML sign-in. That is the AGENTS.md exception.

| URL                                                   | File                              | Gate                                                   |
| ----------------------------------------------------- | --------------------------------- | ------------------------------------------------------ |
| `/`                                                   | `src/pages/index.astro`           | Public hub                                             |
| `/dashboard`                                          | `src/pages/dashboard.astro`       | Public; immediate redirect to `/`                      |
| `/auth/signin`, `/auth/signup`, `/auth/confirm-email` | `src/pages/auth/*`                | Public                                                 |
| `/books`                                              | `src/pages/books/index.astro`     | Middleware prefix **and** page `if (!user)` (`:37-38`) |
| `/books/new`                                          | `src/pages/books/new.astro`       | **Middleware only** — no frontmatter auth check        |
| `/books/[id]/edit`                                    | `src/pages/books/[id]/edit.astro` | Middleware **and** page `if (!user)` (`:17-18`)        |
| `/mood`                                               | `src/pages/mood.astro`            | Middleware **and** page `if (!user)` (`:27-28`)        |
| `/account`                                            | `src/pages/account.astro`         | Middleware **and** page `if (!user)` (`:20-21`)        |
| `/api/*`                                              | seven handlers                    | Self-auth; not listed                                  |

**Default for a new top-level page is fail-open.** A new `/settings.astro` that needs sign-in is public until someone adds `"/settings"` to the array. New files under `/books/` are fail-closed via the prefix. New JSON APIs are fail-open at middleware and fail-closed only if the handler remembers `getUser()` + 401.

There is no `redirectTo` / `next` query on the sign-in hop. Gate redirect is bare `/auth/signin`. Successful sign-in always goes to `/` (`src/pages/api/auth/signin.ts:19`). Open-redirect after login is not a current risk; “return to the page you wanted” is not implemented.

`PROTECTED_ROUTES` is **not exported**. Importing `src/middleware.ts` in Vitest would pull `astro:middleware` / `astro:env/server` (Phase 1 research §A.2 / §A.6). The plan’s “derive the list from the app, do not hand-list” requirement therefore needs a small extract — e.g. `src/lib/protected-routes.ts` imported by middleware and by the test — then expand prefixes to the concrete URLs that exist today (`/books`, `/books/new`, `/books/<uuid>/edit`, `/mood`, `/account`). Keep `/dashboard` out.

### Existing tests — reuse, do not fork

| Already there                                 | Phase 3 use                                                                                                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/integration/support/http-session.ts`   | `signInWithForm(origin, email, password)` already takes any email. `postFormWithManualRedirect(..., origin)` already takes a foreign Origin. `fetchUnknownJson` without `cookieHeader` is the 401 path. |
| `tests/integration/support/test-books.ts`     | User D constants, `[integration-test]` prefix, `createBookViaApi`, prefix cleanup, D verification client                                                                                                |
| `tests/integration/books-persistence.test.ts` | Forged body `user_id` still inserts as D — schema strip, **not** cross-account                                                                                                                          |
| `tests/integration/books-surface.test.ts`     | Always signed in as D; no gating                                                                                                                                                                        |
| `tests/unit/book-schema.test.ts`              | Already asserts `user_id` strip and that `{ error: "Unauthorized" }` is a mutation error — do not re-test                                                                                               |

**No integration file asserts 401, cross-account mutate, forged Origin, or an unauthenticated page GET.** Add `tests/integration/access-control.test.ts` (or similar) in the same style.

Seed accounts (`supabase/seed.sql`): A and B each have six fixed books; C has 25; D has zero. Cookbook §6.2: mutate **only D**, only `[integration-test]` titles. User A is the attacker session. Never point a test write at A’s seed ids.

Local auth rate limit is 30 sign-ins / 5 minutes — two sign-ins per file (D + A) is fine.

### What Phase 3 should assert (S-07-safe)

Behaviour, status, titles, `Location`, content-type — never CSS, DOM, counts, or snapshots.

| Case                                                                                     | Oracle                                                                                                     |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Unauthenticated `POST /api/books` and `PUT /api/books/:id`                               | `401`, `content-type` includes `application/json`, `isBookMutationError`, body is not an HTML sign-in page |
| Unauthenticated form delete / account delete                                             | `302` `Location` contains `/auth/signin` — **not** 401                                                     |
| A’s session `PUT`s D’s book                                                              | `404` + `{ error: "Book not found" }`; D’s verification client still reads the row                         |
| A’s session form-deletes D’s book (same-origin Origin)                                   | `302` with `error=not_found`, **not** `notice=deleted`; row remains                                        |
| A’s session `GET /books/{D id}/edit`                                                     | redirect `error=not_found`; response text must not contain D’s title (FR-011 read isolation; cheap extra)  |
| Forged `Origin: https://evil.example` (or omitted Origin) on form delete, valid D cookie | `403`; book remains; handler must not have run                                                             |
| Unauthenticated `GET` of each concrete protected URL                                     | `302` `Location` contains `/auth/signin`                                                                   |
| Unauthenticated `GET /` and `/auth/signin`                                               | reachable (not bounced to sign-in)                                                                         |

Do not automate `supabase/tests/rls.sql`. Do not delete seed users. Do not import API handlers into unit tests to “unit-test origin” — `checkOrigin` is Astro middleware and only exists on real HTTP.

## Code References

- `src/middleware.ts:4` — private `PROTECTED_ROUTES` prefixes
- `src/middleware.ts:18-21` — `startsWith` gate; 302 `/auth/signin`; no return path
- `src/lib/supabase.ts:6-24` — cookie-scoped anon `createClient`; null if env unset; no `cookieOptions`
- `src/lib/supabase-admin.ts:1-17` — service-role client; account-delete only
- `src/pages/api/books.ts:12-18,60-68` — `getUser()` 401 JSON; insert `user_id: user.id`
- `src/pages/api/books/[id].ts:12-18,67-81` — `getUser()` 401 JSON; owner filter; empty → 404
- `src/pages/api/books/[id]/delete.ts:21-51` — form POST; unauth → sign-in redirect; owner delete; empty → `not_found`
- `src/pages/api/account/delete.ts:21-43` — session `getUser()` then `admin.auth.admin.deleteUser(user.id)`
- `src/pages/api/auth/signin.ts:19` — success always `/`
- `src/lib/book-schema.ts:72-76` — `jsonResponse` sets `Content-Type: application/json`
- `src/pages/books/new.astro` — no `locals.user` check
- `src/pages/books/[id]/edit.astro:17-18,38-51` — page gate + owner-scoped load
- `src/pages/dashboard.astro:2` — public redirect to `/`
- `src/components/books/DeleteBookModal.astro:55` — cookie-authenticated form POST, no CSRF token
- `astro.config.mjs:17-21` — `security.checkOrigin: true`, no exemptions
- `wrangler.jsonc:12` — `run_worker_first: ["/api/*"]`
- `supabase/migrations/20260705084406_create_books.sql:31-56` — RLS owner policies
- `tests/integration/support/http-session.ts:16-34,74-93` — parameterized sign-in; origin-aware form POST
- `tests/integration/support/test-books.ts:7-10` — user D + title prefix
- `tests/integration/support/local-services.ts:256` — empty service-role key in the Astro child

## Architecture Insights

- **Belt-and-braces isolation.** Session `getUser()` → app `.eq("user_id")` → RLS. Tests should target the HTTP contract (status + victim row), not a single layer.
- **Two API personalities.** JSON mutators speak 401 JSON so a script never gets an HTML sign-in page. Form-post mutators speak 302 because the browser is navigating. Middleware must not list `/api/*` or that split collapses.
- **CSRF is content-type-scoped.** Form posts are origin-checked; JSON `fetch` is not. The load-bearing surface named in AGENTS.md is the delete form, not `POST /api/books`.
- **Fail-open pages, fail-closed `/books/*`.** The drift Risk #7 describes is a **new top-level** auth page, not another file under `/books/`. `/books/new` is the existence proof that a page can omit its own `if (!user)` and still be gated.
- **404, not 403, on the wrong owner.** Cross-account and missing id are indistinguishable by design (S-03). Tests must use that oracle.
- **No ownership module.** Copy-paste of `.eq("user_id")` is the consistency risk. Phase 3 should not invent a helper unless the plan later asks for one; the tests lock the per-route contract.

## Historical Context (from prior changes)

- `context/archive/2026-08-11-edit-delete-book/plan.md:88` — RLS silence ≠ success; empty `.select()` is the not-found signal. Impl-review recorded forged-origin 403 before middleware.
- `context/archive/2026-08-15-account-lifecycle/research.md` — `/account` was added to `PROTECTED_ROUTES`; account delete is the same origin-check class as book delete; home hub removed `/dashboard` from the list.
- `context/archive/2026-08-23-testing-harness-and-data-integrity/research.md:173,397,510` — `checkOrigin` only sees form content-types; handler-import tests cannot assert it; dropping `.eq()` still passes while RLS holds; `rls.sql` automation was deferred.
- `context/archive/2026-08-29-tbr-surface-behaviour/research.md:283` — ownership / forged-origin / gating explicitly left to Phase 3.
- Phase 1 plan: freeze A/B seed counts; mutate C/D then cookbook narrowed writes to **D only**.
- PRD FR-011 + privacy NFR (`context/foundation/prd.md:131-137`): another account must never see or receive this user’s books through any Smart TBR interface.
- `context/foundation/test-plan.md` §6.5 is still a TBD stub — Phase 3 fills it once the derived sweep exists. §6.4 already points ownership and 401-not-HTML at this phase. §7: test our owner check staying on; do not test vendor RLS.

## Related Research

- `context/archive/2026-08-23-testing-harness-and-data-integrity/research.md` — Phase 1 harness, clients/keys, why origin cannot be unit-tested
- `context/archive/2026-08-29-tbr-surface-behaviour/research.md` — Phase 2 surfaces; explicit Phase 3 deferral
- `context/archive/2026-08-15-account-lifecycle/research.md` — account delete, `PROTECTED_ROUTES` extension, origin-check reuse
- `context/archive/2026-08-15-mood-trope-recommendation/research.md` — `/mood` gating

## Open Questions

1. **Export vs parse `PROTECTED_ROUTES`.** Extracting `src/lib/protected-routes.ts` is a one-file product change that lets the test import the real list. Parsing `middleware.ts` with a regex avoids touching `src/` but is brittle. Recommendation: extract — it is the only way to honour “derive from the app” without importing `astro:middleware`.
2. **Account-delete forged-origin.** Same defence class as book delete; 403 can be asserted without deleting anyone. In scope for Phase 3 as a cheap sibling, or left as a later note in §6.4?
3. **Edit-page cross-account GET.** Risk #4 is worded as mutating requests; FR-011 also covers reads. The edit page is the only HTML surface that loads a single book by id. Recommendation: include it — one extra `GET` with A’s cookie.
4. **Prefix false-positive (`/bookshelf`).** Not a current route. A test that only expands today’s prefixes will not catch it. Out of scope unless the plan wants a comment in §6.5.
5. **`/books/new` belt-and-brace.** Adding `if (!user)` would match sibling pages but is product work, not a test. The gating sweep already covers the URL via the `/books` prefix.
