---
date: 2026-08-16T14:31:00+02:00
researcher: Cursor Agent
git_commit: cec51abc9161b16bc21c3589a338121418228661
branch: feat/account-lifecycle
repository: smart-tbr
topic: "S-06 library options compatible with tech stack (account-lifecycle)"
tags: [research, s-06, account-lifecycle, supabase, astro, react, shadcn, libraries]
status: complete
last_updated: 2026-08-20
last_updated_by: Cursor Agent
last_updated_note: "Added follow-up research for 2026-08-20 refresh/verify of live code, history, surfaces, and current docs"
---

# Research: S-06 library options compatible with tech stack

**Date**: 2026-08-16T14:31:00+02:00
**Researcher**: Cursor Agent
**Git Commit**: cec51abc9161b16bc21c3589a338121418228661
**Branch**: feat/account-lifecycle
**Repository**: smart-tbr

## Research Question

What libraries are available for implementing S-06 (account lifecycle — gated routes and self-serve account deletion) that are compatible with `context/foundation/tech-stack.md`?

Web survey used Exa (`web_search_exa`) on 2026-08-16; refreshed 2026-08-20 (Context7 + Exa) against the live tree. Verdict unchanged.

## Summary

**S-06 needs no new auth or GDPR library.** Deletion, cascade, session end, and route gating are already covered by packages and schema in the repo:

- **Delete the auth user (FR-013)**: `auth.admin.deleteUser(id)` in `@supabase/supabase-js` (already installed). Requires a **service_role** key and a cookie-free `createClient` — not the existing `@supabase/ssr` cookie client.
- **Cascade books + tropes**: `public.books.user_id` already has `references auth.users (id) on delete cascade`; tropes are `text[]` on `books`, so they go with the row. The roadmap unknown (FK cascade vs auth-user hook) is already decided in the schema.
- **End the session**: `auth.signOut()` via the existing cookie client (same as `src/pages/api/auth/signout.ts`). Deleting the auth user also drops `auth.sessions`.
- **Gating**: `PROTECTED_ROUTES` in `src/middleware.ts` already gates `/books` and `/mood`.
- **Confirmation UI**: reuse the zero-JS `DeleteBookModal.astro` pattern (native HTML + form POST). shadcn Alert Dialog is a compatible *optional* add, not required.

Do **not** add Better Auth, KavachOS/TheAuth, `privacy-pal`, `verifiable-delete`, `dpdpstack-js-sdk`, or `@supabase/server`. They replace, wrap, or sit beside Supabase Auth and do not fit this stack.

The only new *infra* (not a library) is a server-only `SUPABASE_SERVICE_ROLE_KEY`. Today's `SUPABASE_KEY` is the anon/publishable key. The new secret may hold a legacy `service_role` JWT **or** a current `sb_secret_…` key — both work until legacy JWT keys are deprecated (Supabase: end of 2026). Do not migrate keys as part of this slice unless you want to.

## Detailed Findings

### S-06 requirements (from roadmap)

- **Outcome**: TBR routes are gated (unauthenticated visitors redirected to sign-in). A signed-in user can permanently delete their own account after an explicit confirmation; deletion cascades to all their books and trope tags and ends the session.
- **Change ID**: `account-lifecycle`
- **PRD refs**: FR-013, FR-003, FR-001, FR-002, Access Control
- **Prerequisites**: F-01 ✓
- **Unknown (roadmap)**: cascade via Postgres FK `on delete cascade` vs an auth-user deletion hook. **Resolved in schema** — see Layer 2.

### Tech stack constraints

From `context/foundation/tech-stack.md` and `AGENTS.md`:

| Constraint | Implication for S-06 |
|---|---|
| Astro v6 SSR + Cloudflare Workers | Delete runs in an Astro API route on the Worker, not a browser client and not a required Supabase Edge Function |
| React 19 islands (selective) | Confirmation can stay native HTML; an island is only needed if Alert Dialog is chosen |
| Supabase Auth + RLS | Identify the caller with the cookie/anon client; never put service_role on the TBR query path |
| `SUPABASE_URL` / `SUPABASE_KEY` are `astro:env/server` secrets | `SUPABASE_KEY` is the **anon** key. Admin delete needs a second secret |
| `security.checkOrigin: true` (pinned) | Account-delete POST can be a cookie-authenticated HTML form, same as book delete |
| shadcn (`new-york`) + Tailwind v4 | If a modal library is added, stay on Radix / shadcn — not Base UI or a second primitive family |
| `zod` already present | Optional “type DELETE to confirm” without new deps |
| Edge/workerd runtime | Confirm packages work on Workers; prefer REST (`supabase-js`) over raw Postgres drivers |
| `assets.run_worker_first: ["/api/*"]` | Any new `/api/...` delete route must stay under that prefix |

### Layer 1: Auth deletion — already installed

`@supabase/supabase-js` (`^2.106.2`) and `@supabase/ssr` (`^0.10.3`) are the official, Workers-safe pair.

| API | Package | Key | Role |
|---|---|---|---|
| `auth.getUser()` | `@supabase/ssr` via existing `createClient` | anon `SUPABASE_KEY` + session cookie | Prove who is asking; only they may delete themselves |
| `auth.admin.deleteUser(id)` | `@supabase/supabase-js` `createClient` (no cookies) | **service_role** | Remove the `auth.users` row (hard delete, `shouldSoftDelete: false`) |
| `auth.signOut()` | `@supabase/ssr` cookie client | anon + cookie | Clear this browser session after delete |

There is **no** user-facing `auth.deleteUser()` on the anon/publishable key. Admin `deleteUser` requires a secret / `service_role` key and must run on the server. Never expose that key in a React island. `shouldSoftDelete` defaults to `false` (hard delete), which matches FR-013.

**Critical wiring pitfall** (from 2026 write-ups of `AuthApiError: User not allowed`; still current 2026-08-20): do **not** pass the service-role/secret key into `createServerClient`. `@supabase/ssr` attaches the user's session JWT as `Authorization`, which overwrites the elevated token. Admin work needs a plain `createClient` from `@supabase/supabase-js` with `auth: { autoRefreshToken: false, persistSession: false }` and no cookie plumbing. Do not set `accessToken` on the admin client — that disables the entire `auth` namespace.

Community pattern (Next.js Edge Function examples, same SDK) maps onto an Astro API route on this Worker:

1. Cookie client → `getUser()`.
2. Separate admin client → `auth.admin.deleteUser(user.id)`.
3. Cookie client → `signOut()`, then redirect.

A leftover access JWT can stay valid until `exp` (stateless JWT). Deleting the user invalidates refresh tokens via `auth.sessions`. That window is a documented Supabase limit, not something another library closes. FR-013's "immediately ends the session" is satisfied by `signOut()` plus session-row cascade.

`zod` (`^4.4.3`) and `lucide-react` (`^1.14.0`) are already present for optional type-to-confirm validation and warning icons.

### Layer 2: Cascade — no library

```sql
user_id uuid not null references auth.users (id) on delete cascade
```

in `supabase/migrations/20260705084406_create_books.sql`. Tropes are `text[]` on `books`, not a separate table. Official Supabase user-management docs recommend `on delete cascade` on FKs to `auth.users`.

Do **not** add a second cleanup path (trigger that also deletes books, or an application-level `.from("books").delete()` plus cascade). Dual cleanup has caused `Database error deleting user` when a delete trigger races the FK. One mechanism: delete the auth user, let Postgres cascade.

Webhooks / `pg_net` / an `auth.users` DELETE hook are unnecessary here — there is no Storage, no external system to notify.

### Layer 3: Confirmation UI

#### Existing in-repo pattern (recommended — no new libraries)

| Pattern | File | Cost |
|---|---|---|
| CSS/anchor modal + form POST | `src/components/books/DeleteBookModal.astro` | 0 deps, 0 JS |
| Form POST + redirect + `getUser()` | `src/pages/api/books/[id]/delete.ts` | 0 deps |
| Origin check on cookie-auth POSTs | `astro.config.mjs` `security.checkOrigin: true` | already pinned |

`lessons.md` prefers native HTML over React islands on **per-row list surfaces** (TBR browse list), not on every mutation UI. Account deletion is one action on a settings/account page, not a list row — so that lesson does not strictly apply. Copy the S-03 pattern anyway: `DeleteBookModal.astro` + form POST keeps the delete out of the client bundle and keeps `security.checkOrigin` load-bearing.

#### Compatible library add (only if a Radix modal is wanted)

| Option | New deps | React 19 / Tailwind v4 / new-york | Verdict |
|---|---|---|---|
| shadcn Alert Dialog (`npx shadcn@latest add alert-dialog`) | `@radix-ui/react-alert-dialog` **or** unified `radix-ui` | Yes — official Tailwind v4 + React 19 support; docs example is “permanently delete your account” | Least disruptive if a modal island is chosen. Wrap Trigger + Content in **one** `.tsx` island (`client:load`); Radix context does not cross Astro islands |
| Unified `radix-ui` package | 1 | `new-york` now prefers this (Feb 2026 changelog). `npx shadcn@latest migrate radix` rewrites `@radix-ui/react-*` imports | Fine later; not required to start. Repo currently has only `@radix-ui/react-slot` |
| shadcn `sonner` | `sonner` | Yes; toast is deprecated in favor of sonner | Optional error toast. Success can redirect, like book delete |
| shadcn `input` | none extra if already added | Yes | Only if type-to-confirm is wanted |

**Astro gotcha** (same as prior shadcn research): calling AlertDialog pieces directly from a `.astro` file splits them into islands and breaks context. Compose the whole dialog in a `.tsx` file.

### Layer 4: Dedicated “delete account / GDPR” libraries — ruled out

Surveyed because FR-013 looks like a privacy/DSR feature. None belong in this stack:

| Library | Why not |
|---|---|
| Better Auth + `@forgehustle/better-auth-soft-deletion` | Replaces Supabase Auth. Soft-delete (`status = "deleted"`), not FR-013 hard delete |
| KavachOS / TheAuth GDPR plugin | Separate auth product; `onBeforeDelete` assumes their user store |
| `privacy-pal` | MongoDB / Firestore only |
| `verifiable-delete` (+ Cloudflare adapter) | Threshold crypto-shredding + public transparency log. Far beyond a personal TBR |
| `dpdpstack-js-sdk` | Hosted DPDP/erasure platform |
| Firebase Admin (Workers ports, e.g. `@prmichaelsen/firebase-admin-sdk-v8`) | Wrong auth backend |
| `@supabase/auth-ui-react` | Custom sign-in/up forms already exist |
| Supabase Edge Function as a *required* extra runtime | Same `supabase-js` Admin API can run in the existing Astro `/api/*` Worker route. An Edge Function is an optional pattern, not a library we need |
| `@supabase/server` `createAdminClient` (2026, public beta) | Official, Workers-oriented wrapper around the same admin client. No Astro adapter; does not replace `@supabase/ssr`. Extra surface for one `deleteUser` call |
| `effaced` / `effaced-supabase` | Python (SQLAlchemy/FastAPI); still just Admin `DELETE /auth/v1/admin/users/{id}` |
| ForgetOps | TypeScript control plane + Rust agent; developer preview, not an Astro island |
| `@dsr-kit/nextjs` | Next.js App Router + Prisma; no Astro/Workers/supabase-js path |

Reference implementation (pattern, not a package): [mansueli/supabase-user-self-deletion-nextjs](https://github.com/mansueli/supabase-user-self-deletion-nextjs) — anon client to identify the user, service-role client to `admin.deleteUser`, then `signOut()`. Port that to an Astro API route.

## Code References

- `src/middleware.ts:4,18-21` — `PROTECTED_ROUTES` (`/books`, `/mood`) + prefix `getUser()` gate; extend if an account/settings page is added
- `src/lib/supabase.ts:6-24` — cookie-scoped `createServerClient` with anon `SUPABASE_KEY`; **do not** reuse this for `auth.admin.*`
- `src/pages/api/auth/signout.ts:4-9` — existing `signOut()` + redirect `/`
- `src/pages/api/books/[id]/delete.ts:16-51` — cookie-auth form POST, `getUser()`, hard delete, redirect-with-error pattern to copy
- `src/components/books/DeleteBookModal.astro:26-68` — native HTML `:target` confirm modal to adapt for account deletion
- `src/components/Topbar.astro:11-20` — signed-in email + sign-out form on home only; natural chrome for an account link
- `supabase/migrations/20260705084406_create_books.sql:6,9` — `user_id … references auth.users (id) on delete cascade`; tropes are `text[]`
- `astro.config.mjs:17-26` — pinned `checkOrigin: true`; env schema currently has only `SUPABASE_URL` / `SUPABASE_KEY`
- `wrangler.jsonc:12` — `assets.run_worker_first: ["/api/*"]`
- `package.json:21-23,30,36` — `@radix-ui/react-slot` only; supabase-js `^2.106.2`; ssr `^0.10.3`; zod; lucide
- `components.json:3` — `style: "new-york"`
- `context/foundation/roadmap.md:185-194` — S-06 slice definition (cascade unknown at `:193` is **stale**; schema already resolved it)
- `context/foundation/prd.md` — FR-013 (self-serve hard delete + confirm + cascade + end session)
- `context/foundation/lessons.md:47-52` — native HTML over React islands on **per-row list** surfaces; `:26-30` ask before marking secret steps blocked
- `context/archive/2026-07-04-tbr-data-and-isolation/plan.md` — invariant: TBR access stays on the cookie/anon client, never service-role

## Architecture Insights

1. **Default architecture**: settings/account page (gated) → native HTML confirm → `POST /api/account/delete` (or similar) on the Worker → `getUser()` → admin `deleteUser` → FK cascade wipes `books` → `signOut()` → redirect to landing. No new npm packages.
2. **Two clients, two keys**: cookie/anon (or publishable) for identity and sign-out; cookie-free service-role/secret for Admin Auth only. Mixing them is the main failure mode. Do not let the Cloudflare dashboard integration overwrite `SUPABASE_KEY` with a Service Role value — that would bypass RLS on every TBR query.
3. **Service-role is new infra**: declare `SUPABASE_SERVICE_ROLE_KEY` as `context: "server"`, `access: "secret"` in `astro.config.mjs`; put it in `.dev.vars` locally and as a Wrangler/GitHub secret in prod. Adding it to the Astro env schema means every `astro:env/server` import validates it — CI/`npm run build` needs a dummy, same as existing keys. Never import it from a React island. Follow `lessons.md`: ask the owner for the secret immediately; do not mark the step blocked and continue.
4. **Gating is mostly done**: S-06's "unauthenticated visitors redirected to sign-in" is already true for `/books` (prefix, including `/books/new` and `/books/[id]/edit`) and `/mood`. F-01 originally assigned `PROTECTED_ROUTES` to S-06; S-01 added `/books` and S-05 added `/mood` first. Home action hub removed `/dashboard` from the list (`/` is a public signed-in hub). The slice still needs the delete path and any new account-page path added to `PROTECTED_ROUTES`. There is no shared nav — a new `/account` link must be wired in `Topbar.astro` **and** each TBR page nav row.
5. **JWT leftover window**: after delete, an already-issued access token can work until `exp`. Official docs now list two mitigations (short JWT expiry, or `session_id` check against `auth.sessions`). Accept the window + `signOut()` for v1 rather than adding a session-introspection library. For the delete handler itself, keep `getUser()` (live Auth-server record), not `getClaims()` (JWT-only).
6. **Origin check stays on**: the account-delete POST is the same class of cookie-authenticated form as book delete. Do not turn off `security.checkOrigin` for it.

## Historical Context (from prior changes)

- **Shaping (2026-05-22)** — FR-013 added from OQ #4: self-serve hard delete, cascade books+tropes, explicit confirmation, end session (`context/foundation/shape-notes.md`, `context/foundation/prd.md`). Product language is “privacy expectation,” not GDPR certification.
- **Bootstrap (~2026-06-11)** — Auth + middleware with `/dashboard` as the only gated route; `SUPABASE_KEY` deployed as the **anon** key via Wrangler/GitHub secrets (`context/archive/deploy-plan.md`).
- **F-01 (`tbr-data-and-isolation`)** — `books.user_id` FK to `auth.users` with `on delete cascade` chosen explicitly to guarantee FR-013 at the DB layer; handler left to S-06. Anon-only cookie client invariant documented. Route gating deferred to S-06 on paper (`plan.md:44`); later slices did part of that work.
- **S-01 (`add-book-to-tbr`)** — Added `"/books"` to `PROTECTED_ROUTES` (first TBR route gating), ahead of S-06.
- **S-03 (`edit-delete-book`)** — First destructive confirm in the product: CSS `:target` modal + HTML form POST; **no** shadcn dialog. `security.checkOrigin: true` was pinned in impl-review after CSRF analysis (not at bootstrap). Closest UI/API pattern for FR-013 confirmation.
- **S-05 (`mood-trope-recommendation`)** — Added `"/mood"` to `PROTECTED_ROUTES`. Same “survey libraries, then recommend zero new deps” research shape.
- **Home action hub (`2026-08-15-home-action-hub`)** — Removed `"/dashboard"` from `PROTECTED_ROUTES`; signed-in home is `/` (public hub). `/dashboard` is a redirect page.
- **`admin.deleteUser`** — no in-repo precedent before this research (web survey only).

## Related Research

- `context/archive/2026-08-15-mood-trope-recommendation/research.md` — S-05 library survey (same stack gates)
- `context/archive/2026-08-14-search-filter-tbr/research.md` — prior “no new libraries” conclusion for a TBR surface
- `context/archive/2026-08-11-edit-delete-book/plan.md` — zero-dep destructive confirm (no research.md; direct FR-013 UI/API ancestor)
- `context/archive/2026-07-04-tbr-data-and-isolation/plan-brief.md` — FK cascade decision for FR-013
- `context/foundation/infrastructure.md` + `context/archive/deploy-plan.md` — secret rollout pattern to copy for `SUPABASE_SERVICE_ROLE_KEY`

## Recommendation for `/10x-plan`

| Concern | Choice |
|---|---|
| Delete auth user | `@supabase/supabase-js` `auth.admin.deleteUser` on a **new** service-role client — **no new library** |
| Identify caller / sign out | Existing `@supabase/ssr` cookie client — **no new library** |
| Cascade books + tropes | Existing FK `on delete cascade` — **no library, no extra hook** |
| Route gating | Extend `PROTECTED_ROUTES` if a new account page is added — **no library** |
| Confirmation UI | Adapt `DeleteBookModal.astro` + form POST — **no library** |
| Type-to-confirm (optional) | `zod` already installed — **no library** |
| shadcn Alert Dialog / `radix-ui` | **Defer**; only if a hydrated modal is judged necessary |
| Dedicated GDPR / Better Auth / Edge Function / `@supabase/server` | **Skip** — incompatible or redundant |

## Open Questions

1. **Where the delete control lives** — new `/account` (or settings) page vs. home `Topbar` (email is only shown there today). Affects `PROTECTED_ROUTES`, multi-place nav wiring, and S-07 restyle surface. Confirmed 2026-08-20: no account/settings/profile route exists yet.
2. **Confirmation strength** — one-click confirm (book-delete `:target` modal) vs. type-to-confirm (`zod` already installed). FR-013 only requires “an explicit confirmation step.”
3. **Service-role secret name and rollout** — `SUPABASE_SERVICE_ROLE_KEY` in `astro.config.mjs` + `.dev.vars` + `wrangler secret put` + `gh secret set` + CI `secrets:` input. Value may be legacy `service_role` JWT or `sb_secret_…`. Local CLI vs hosted project keys need a plan note. **Ask the owner for the secret immediately** (`lessons.md`); do not mark blocked and continue. Human approval gate applies to key rotation (`infrastructure.md`).
4. **Post-delete JWT window** — accept documented leftover access-token validity + `signOut()`, or add a `session_id` check on sensitive routes? Unlikely to be worth it for v1. Official docs now spell both options; plan should pick “accept” unless a reason appears.

## Sources (web research via Exa, 2026-08-16)

- Supabase Admin `deleteUser` — [supabase.com/docs/reference/javascript/auth-admin-deleteuser](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser)
- Managing user data / removing account access / JWT leftover window — [supabase.com/docs/guides/auth/managing-user-data](https://supabase.com/docs/guides/auth/managing-user-data)
- `signOut` scopes — [supabase.com/docs/reference/javascript/auth-signout](https://supabase.com/docs/reference/javascript/auth-signout)
- Astro SSR client (`createServerClient`) — [supabase.com/docs/guides/auth/server-side/creating-a-client](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- Cloudflare Workers + Supabase keys — [supabase.com/partners/integrations/cloudflare-workers](https://supabase.com/partners/integrations/cloudflare-workers)
- `AuthApiError: User not allowed` when service_role is passed through `createServerClient` — [guardlayer.io/blog/supabase-auth-api-error-user-not-allowed](https://www.guardlayer.io/blog/supabase-auth-api-error-user-not-allowed)
- Self-deletion Edge Function pattern (port to Astro API route) — [github.com/mansueli/supabase-user-self-deletion-nextjs](https://github.com/mansueli/supabase-user-self-deletion-nextjs), [blog.mansueli.com](https://blog.mansueli.com/supabase-user-self-deletion-empower-users-with-edge-functions)
- FK `on delete cascade` vs `Database error deleting user` — [github.com/supabase/supabase/issues/30879](https://github.com/supabase/supabase/issues/30879), [github.com/supabase/supabase/issues/3930](https://github.com/supabase/supabase/issues/3930)
- shadcn Alert Dialog (Radix) — [ui.shadcn.com/docs/components/radix/alert-dialog](https://ui.shadcn.com/docs/components/radix/alert-dialog)
- shadcn Tailwind v4 + React 19 — [ui.shadcn.com/docs/tailwind-v4](https://ui.shadcn.com/docs/tailwind-v4)
- Unified `radix-ui` package for `new-york` — [ui.shadcn.com/docs/changelog/2026-02-radix-ui](https://ui.shadcn.com/docs/changelog/2026-02-radix-ui)
- `@radix-ui/react-alert-dialog` npm — [npmjs.com/package/@radix-ui/react-alert-dialog](https://www.npmjs.com/package/@radix-ui/react-alert-dialog)
- Ruled-out GDPR/auth packages: [privacy-pal](https://github.com/privacy-pal/privacy-pal), [KavachOS GDPR](https://docs.theauth.dev/gdpr), [better-auth-soft-deletion](https://github.com/forgehustle/better-auth-soft-deletion), [verifiable-delete](https://github.com/ephemeral-social/verifiable-delete)

> Compatibility claims come from vendor docs and issue threads, not from installing anything in this repo. If the plan adopts a third-party package, verify with a real `npm install` plus `npm run build` on the branch before committing to it.

## Follow-up Research 2026-08-20T17:50:49+02:00

**Scope**: refresh/verify of the 2026-08-16 library survey against the live tree, prior-change history, account/gating surfaces, and current vendor docs (Context7 + Exa). Branch `feat/account-lifecycle` at `cec51abc9161b16bc21c3589a338121418228661` (research folder untracked; no GitHub permalinks).

**Verdict (high confidence):** still **no new auth, GDPR, or UI library.** Docs and packages have not changed enough to alter S-06. New 2026 names (`@supabase/server`, `effaced`, ForgetOps, `@dsr-kit/nextjs`) do not fit this Astro + Workers stack.

### Live tree

Confirmed: cookie-only `createClient` in `src/lib/supabase.ts`; no admin client; `PROTECTED_ROUTES = ["/books", "/mood"]`; book-delete form POST + `DeleteBookModal.astro`; FK `ON DELETE CASCADE` + `tropes text[]`; `checkOrigin: true`; env schema has no service-role key; shadcn surface is `button` + `@radix-ui/react-slot` only.

Expected gaps (not contradictions): no `/account` or `/settings`, no `POST /api/account/delete`, no `SUPABASE_SERVICE_ROLE_KEY`.

Imprecise original wording fixed above: `lessons.md` is scoped to **per-row list surfaces**, not all mutation UIs; `src/middleware.ts` redirect ends at line 21.

### Surfaces

- `/` is the signed-in action hub (`Welcome.astro`); `/dashboard` redirects to `/`.
- No account/settings/profile route or link. Email appears only in `Topbar.astro` (home).
- Nav is **not** shared: `Topbar.astro` on home vs duplicated nav rows on books/mood/new/edit. Adding `/account` needs `PROTECTED_ROUTES` **and** links in both chrome families.
- Sign-out already lands on public marketing home with no flash message — copy that for post-delete redirect.

### Docs / libraries (2026-08-20)

Still true: no user-facing `deleteUser` on the anon key; `auth.admin.deleteUser` needs secret/`service_role`; `shouldSoftDelete` defaults `false`; `createServerClient` must not receive the elevated key; leftover JWT until `exp`; official cascade guidance unchanged.

**Docs drift (behavior unchanged):**

- Elevated keys are now documented as **secret** (`sb_secret_…`) with legacy `service_role` JWT still valid until end-of-2026 deprecation. Same env var can hold either.
- Managing-user-data docs now spell two leftover-JWT mitigations (short expiry vs `session_id` check). v1 should still accept the window + `signOut()`.
- SSR docs push `getClaims()` for page gates; **delete must keep `getUser()`**.
- Adding the secret to `astro:env` means every server-env import validates it (dummy in CI/build).
- Cloudflare Workers integration can inject Service Role as `SUPABASE_KEY` — do not overwrite the TBR cookie client.

**Still skip:** Better Auth, KavachOS, `privacy-pal`, `verifiable-delete`, `dpdpstack-js-sdk`, `@supabase/server`.

### Historical notes absorbed above

Roadmap S-06 still lists cascade as TBD (`roadmap.md:193`); F-01 already chose FK cascade. Out of scope for this research file to edit the roadmap.

### Extra sources (2026-08-20)

- Auth Admin (secret key) — [supabase.com/docs/reference/javascript/auth-admin](https://supabase.com/docs/reference/javascript/auth-admin)
- API keys (publishable/secret vs anon/service_role) — [supabase.com/docs/guides/getting-started/api-keys](https://supabase.com/docs/guides/getting-started/api-keys)
- User sessions / JWT expiry — [supabase.com/docs/guides/auth/sessions](https://supabase.com/docs/guides/auth/sessions)
- Astro env secrets — [docs.astro.build/en/guides/environment-variables](https://docs.astro.build/en/guides/environment-variables/)
- `@astrojs/cloudflare` `.dev.vars` — [docs.astro.build/en/guides/integrations-guide/cloudflare](https://docs.astro.build/en/guides/integrations-guide/cloudflare/)
- `@supabase/server` (do not add) — [npmjs.com/package/@supabase/server](https://www.npmjs.com/package/@supabase/server)
