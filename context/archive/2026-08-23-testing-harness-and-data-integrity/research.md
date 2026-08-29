---
date: 2026-08-23T19:27:00+02:00
researcher: Cursor Agent
git_commit: 9fe653296fb6b8b8ee4ad34d15a6873618c00821
branch: feat/test-plan
repository: passiflora-nr/smart-tbr
topic: "Ground rollout Phase 1 of the test plan: harness feasibility plus risks #1, #5, #6"
tags: [research, codebase, testing, vitest, book-schema, mood-selection, supabase, astro-env]
status: complete
last_updated: 2026-08-23
last_updated_by: Cursor Agent
---

# Research: Grounding Test-Plan Phase 1 — Harness + Data-Integrity Core

**Date**: 2026-08-23 19:27 (UTC+2)
**Researcher**: Cursor Agent
**Git Commit**: `9fe653296fb6b8b8ee4ad34d15a6873618c00821`
**Branch**: `feat/test-plan`
**Repository**: `passiflora-nr/smart-tbr`

> Permalink base for any reference below: `https://github.com/passiflora-nr/smart-tbr/blob/9fe6532/<path>#L<line>`.
> References are kept as local `path:line` so they stay clickable in the editor; the commit is pushed, so the base above resolves them permanently.

## Research Question

Ground rollout Phase 1 of `@context/foundation/test-plan.md` ("Harness + data-integrity core"). Verify risks #1, #5 and #6 against the live codebase — confirm, refute, or relocate each — and ground the harness decisions Phase 1 must make, including the open question of how tests reach the Supabase data boundary. No implementation.

## Summary

Per §1 principle #3 of the test plan, research is ground truth where it disagrees with the plan. It disagrees in three places, and one of them changes what Phase 1 should build.

**Risk #1 is real but mislocated.** There is no code path that drops a trope tag. Tropes are a Postgres `text[]` column written verbatim in submitted order, order-preserving, echoed back by `.select()`, and backed by two DB `check` constraints; over-cap submissions are _rejected_ with a 400 rather than truncated. The silent-loss vector that does exist is in `description`: it is `.nullish()` in the shared schema, so a `PUT` that omits the key validates fine and writes `null` over an existing description (`src/lib/book-schema.ts:40-48`, `src/pages/api/books/[id].ts:69`). The real browser always sends the key, so this is reachable only by a direct API caller — **including Phase 1's own test client**, which will destroy fixture data and may misread the result as a product bug. The "stops surfacing in mood results" half of the risk is also real, but its mechanism is case/whitespace fragmentation, not loss: nothing lowercases anywhere, and matching is exact-string.

**Risk #5 is confirmed, and the oracle conflicts with the implementation on two points that must be settled before a test is written.** "Up to 3" is a _page size_, not a cap: `show` is an unbounded query parameter (`src/lib/mood-selection.ts:83-95`) feeding a shipped "Show me 3 more" link, so `/mood?trope=X&show=999` renders every match. And results _are_ ordered (title, then id — `src/lib/mood-selection.ts:74-81`) against the PRD Non-Goal that forbids ordering. Both were deliberate decisions recorded in the archived plan; the PRD was never amended. The empty states, by contrast, are in better shape than the risk assumes — `no-match` has its own branch and its own copy, and the blank screen the risk describes does not occur.

**Risk #6 is inverted.** One Zod schema is genuinely shared and genuinely executed on both sides (`src/lib/book-schema.ts` imported by both islands and both API routes), and that was an explicit planning decision, not an accident. The drift risk is subtler and more interesting: the client posts `result.data`, the schema's _already-transformed output_, so the server's trim/dedupe/empty-filter transforms never do any work for browser traffic. Every server-side normalisation rule is therefore dead code from the UI's perspective, and **no UI-level test can detect its removal**. Only a raw HTTP test with un-normalised input can. Separately, every length limit in the product exists only in Zod — the database has no maximum on any column.

**Harness.** No runner exists, but the ground is unusually favourable: only three modules import `astro:env/server` (`supabase.ts`, `supabase-admin.ts`, `config-status.ts`), and all five pure logic modules — `book-schema`, `book-filters`, `mood-selection`, `sort-books-for-browse`, `utils` — are importable in plain Node with nothing but the `@/*` alias configured. Four sharp edges dominate the plan, listed in full in §A.6. The most dangerous is a safety issue, not a config issue: **`.env` currently points at the hosted production Supabase project while `.dev.vars` points at the local stack**, and `.env` is the file Astro's env loader reads. A data-boundary test that inherits file precedence can reach production.

There is also an existing test asset the plan must not ignore or duplicate: `supabase/tests/rls.sql`, a working 5-case plain-SQL isolation suite that is run by hand and wired to nothing.

## Detailed Findings

### A. Harness baseline

#### A.1 Confirmed: no runner, and one orphaned SQL suite

`package.json:5-14` has no `test` script; neither dependency block contains `vitest`, `jest`, `@playwright/test`, `@cloudflare/vitest-pool-workers`, `msw`, `@testing-library/*`, `jsdom`, or `happy-dom`. Confirmed at the installed level too — no such binary in `node_modules/.bin`. Zero `*.test.*` / `*.spec.*` files and zero runner configs anywhere in the repo.

Two pre-existing accommodations: `.gitignore:48-49` already ignores `coverage/` under a `# test` heading, and because `eslint.config.js:75` calls `includeIgnoreFile(gitignorePath)`, `coverage/` is already ESLint-ignored too.

**`supabase/tests/rls.sql` (132 lines) is the one real test asset.** It is plain PostgreSQL run by `psql`, _not_ pgTAP — no `pgtap` extension, no `plan()`/`ok()`/`finish()`, no `pg_prove`. It uses five `begin; … rollback;` transactions, each impersonating a user via `set local role authenticated` plus `set local request.jwt.claims`, with `do $$ … raise exception … $$` blocks as assertions, relying on `psql -v ON_ERROR_STOP=1` for its exit code. Its own header documents the invocation:

```1:6:supabase/tests/rls.sql
-- FR-011 isolation proof: cross-account access denied, owner access works.
-- Run: psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql
--
-- UUIDs and the expected count are hardcoded inline: psql does not
-- interpolate :variables inside dollar-quoted (do $$ ... $$) blocks,
-- which is where the fixtures are used. Keep seed.sql UUIDs in sync.
```

It covers cross-account select/update/delete denial, insert-with-forged-`user_id` rejection, and a positive control. Nothing invokes it: no npm script, no `Makefile`, no CI step, no `[db.tests]` hook, and it is not in `db.seed.sql_paths` (`supabase/config.toml:65`). Searching the repo for `rls.sql` finds matches only in the file's own comment and in archived markdown. It was written to be automatable as-is — see §E.

**It also constrains Phase 1.** The positive control hard-asserts a row count:

```115:119:supabase/tests/rls.sql
  select count(*) into n from public.books;
  if n != 6 then
    raise exception 'User A own books: expected 6 rows, got %', n;
  end if;
```

Any automated test that writes to or deletes from `user-a@example.test` breaks this proof until `npx supabase db reset`. Fixture drift from manual testing has already happened once (`context/archive/2026-08-11-edit-delete-book/reviews/impl-review.md:197` records user C holding 17 books instead of the seeded 25).

#### A.2 The `astro:env` blast radius is three files

Exactly three modules import it, all `astro:env/server`, and there is no `astro:env/client` anywhere: `src/lib/config-status.ts:1`, `src/lib/supabase.ts:3`, `src/lib/supabase-admin.ts:7`.

`src/middleware.ts` does not import it directly but is contaminated twice over — via `astro:middleware` (`:1`) and transitively via `@/lib/supabase` (`:2`). Everything importing `@/lib/supabase` inherits the problem: all seven API routes, plus the frontmatter of `src/pages/books/index.astro:19`, `src/pages/mood.astro:18`, `src/pages/books/[id]/edit.astro:9`.

Everything Phase 1 wants to unit-test is clean. All five modules import only `zod` (or nothing) at runtime; every `Tables` import is `import type` and erased:

| Module                             | `astro:env`? | Runtime Supabase import?       | Plain-Node importable? |
| ---------------------------------- | ------------ | ------------------------------ | ---------------------- |
| `src/lib/book-schema.ts`           | no           | no — `import type` only (`:2`) | **yes**                |
| `src/lib/book-filters.ts`          | no           | no — `import type` only (`:2`) | **yes**                |
| `src/lib/mood-selection.ts`        | no           | no — `import type` only (`:2`) | **yes**                |
| `src/lib/sort-books-for-browse.ts` | no           | no — `import type` only (`:1`) | **yes**                |
| `src/lib/utils.ts`                 | no           | no                             | **yes**                |
| `src/lib/account-schema.ts`        | no           | no                             | **yes**                |

`src/lib/database.types.ts` has zero imports and one runtime export (`Constants`, `:203`), so it too is bare-Node importable.

**Consequence:** the unit half of Phase 1 needs no Astro machinery at all — only TypeScript transpilation and the `@/*` alias, because all four logic modules import `@/lib/database.types` by alias.

Why the virtual module is genuinely sharp: `astro:env/server` is created by Astro's own Vite plugin (`resolveId` at `node_modules/astro/dist/env/vite-plugin-env.js:37-53`, body generated in `load` at `:55-93`). Without that plugin in the pipeline the import fails at _transform_ time, not assertion time. Because all three vars are `optional: true` (`astro.config.mjs:23-27`), an absent value validates and yields `undefined` — which is exactly the branch `src/lib/supabase.ts:7-9` handles by returning `null`. That makes the 503 / `state = "failed"` paths real and testable rather than a crash.

#### A.3 Config the runner must satisfy

- **`astro.config.mjs`** — `output: "server"`; `integrations: [react(), sitemap()]`; the only `vite` entry is the Tailwind plugin; `adapter: cloudflare()`; `security: { checkOrigin: true }` pinned with a comment explaining why; all three env vars `context: "server"`, `access: "secret"`, `optional: true`.
- **`tsconfig.json`** — `include: ["**/*"]`, `exclude: ["dist"]`, so any new test file anywhere outside `dist` joins the TS project automatically (this satisfies ESLint's `projectService: true` with no `allowDefaultProject` escape hatch). `paths: { "@/*": ["./src/*"] }` is the only alias, and Vite gets it from Astro's `configAliasVitePlugin`, never for free.
- **`eslint.config.js`** — the base config has no `files` restriction and `reactConfig` targets `**/*.{js,jsx,ts,tsx}`, so new test files and `vitest.config.ts` are linted with the full type-aware set. Verified effective severities: `prettier/prettier` **error**, `no-unsafe-assignment` **error**, `no-unsafe-member-access` **error**, `no-non-null-assertion` **error**, `unbound-method` **error**, `no-floating-promises` **error**, `no-unnecessary-condition` **error**, `no-confusing-void-expression` **error**, `no-console` **warn**.
- **`wrangler.jsonc`** — `nodejs_compat` is the only compat flag; `run_worker_first: ["/api/*"]`. Read by the Cloudflare Vite plugin at config time, which is how it becomes relevant to a Vitest config (§A.6).
- **`.nvmrc`** — `22.14.0`. CI pins `node-version: 22` without the minor.

#### A.4 Local Supabase stack and fixtures

`supabase/config.toml`: API on **54321**, Postgres 17 on **54322**, Studio **54323**, Inbucket **54324**; pooler disabled; `api.tls.enabled = false`; `api.max_rows = 1000`. Note `project_id = "10x-astro-starter"`, which does not match the repo name.

Auth settings are favourable for programmatic sign-in: `enable_signup = true`, `minimum_password_length = 6`, `jwt_expiry = 3600`, and crucially **`[auth.email] enable_confirmations = false`** (`:209`) — no Inbucket round-trip needed. No captcha, no MFA, no `test_otp` presets, so sign-in must go through real password auth against the seeded accounts.

**Rate limits are a real hazard for a chatty suite**: `sign_in_sign_ups = 30` per 5 minutes per IP (`:189`) and `email_sent = 2` per hour (`:182`). Sign in once and share the cookie jar rather than per test.

`supabase/seed.sql` is auto-loaded on every `db reset` (`config.toml:60-65`) and provides four fixed accounts, all `email_confirmed_at = now()`, all sharing the password `password123`:

| Email                 | Fixed UUID                             | Books | Purpose                                            |
| --------------------- | -------------------------------------- | ----- | -------------------------------------------------- |
| `user-a@example.test` | `a0000000-0000-4000-8000-000000000001` | 6     | isolation source/target — **do not mutate** (§A.1) |
| `user-b@example.test` | `b0000000-0000-4000-8000-000000000001` | 6     | cross-account counterpart; tropes overlap A's      |
| `user-c@example.test` | `c0000000-0000-4000-8000-000000000001` | 25    | volume fixture; safe to mutate                     |
| `user-d@example.test` | `d0000000-0000-4000-8000-000000000001` | 0     | empty-TBR fixture                                  |

Books have fixed UUIDs too, so rows are addressable by id. User C's 25 carry explicit `created_at` offsets, with two rows deliberately sharing the same offset to exercise the browse tie-breaker; three have `description = null` and one has a ~2000-character description. Every insert is `on conflict (id) do nothing` — idempotent on re-seed, but **not self-cleaning**: rows a test creates persist, and rows a test deletes stay gone until `db reset`.

`supabase/migrations/` holds one file, `20260705084406_create_books.sql`, which is the entire application schema. `books` is the only application table; **there is no `tropes` table**. Relevant DDL:

```9:20:supabase/migrations/20260705084406_create_books.sql
  tropes text[] not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint title_nonempty check (length(trim(title)) > 0),
  constraint author_nonempty check (length(trim(author)) > 0),
  constraint tropes_nonempty check (cardinality(tropes) >= 1),
  constraint tropes_no_blanks check (
    array_position(tropes, null) is null
    and array_position(tropes, '') is null
  )
```

Plus: `on delete cascade` from `auth.users` (deleting a test user cleans up their books), a GIN index on `tropes` and a btree on `user_id`, a `moddatetime` trigger on `updated_at`, RLS enabled with four owner-only policies scoped `to authenticated`, and `revoke all on public.books from anon` — so an unauthenticated client cannot read `books` at all. No functions, views, or RPCs.

#### A.5 CI, hooks, and env files

`.github/workflows/ci.yml` runs `checkout → setup-node@v4 (Node 22, npm cache) → npm ci → npx astro sync → npm run lint → npm run build`, with `SUPABASE_URL` / `SUPABASE_KEY` supplied **only to the build step**. **No Supabase service exists in CI today** — no `setup-cli` action, no service container, no `DATABASE_URL`; the two build secrets point at the hosted project. The insertion seam for a test step is between `lint` and `build`, which is not inference: `AGENTS.md` prescribes it and `README.md:173` documents the chain.

Running a database-backed test in CI would need `supabase/setup-cli` plus `supabase start` (Docker is available on `ubuntu-latest`), at a cost of several minutes of image pulls per run and ~7-8 GB RAM. Unit-only tests over the pure modules need none of it.

`.husky/pre-commit` is `npx lint-staged`, and `lint-staged` runs `eslint --fix` on `*.{ts,tsx,astro}`. So **test code that trips `no-unsafe-assignment` or `no-non-null-assertion` blocks the commit**, and `AGENTS.md` forbids `--no-verify`. The idiomatic `const body = await res.json(); expect(body.book.title)` pattern trips both, because `res.json()` is `any`. The repo already ships the narrowing helpers for exactly this shape: `isBookMutationSuccess` / `isBookMutationError` (`src/lib/book-schema.ts:95-110`).

**Env files, verified directly on this machine (values redacted):**

| File          | `SUPABASE_URL`                  | Target                        |
| ------------- | ------------------------------- | ----------------------------- |
| `.dev.vars:1` | `http://127.0.0.1:54321…`       | **local stack**               |
| `.env:1`      | `https://kahvpxeygnmqpysrskok…` | **hosted production project** |

`.dev.vars` is read by the Cloudflare _adapter_, which assigns it into `process.env` during `astro:config:done` (`node_modules/@astrojs/cloudflare/dist/index.js:292-303`). `.env` is read by Astro's env loader via Vite's `loadEnv(mode, envDir, "")` — an **empty prefix**, so every key is loaded, not just `PUBLIC_`/`VITE_` — and it re-reads on every call (`node_modules/astro/dist/env/env-loader.js:40`, `:51-54`). Vite's precedence writes `.env` values first, then lets `process.env` overwrite them.

The local anon key is the standard published Supabase CLI demo key — decoding the JWT payload gives `{"iss":"supabase-demo","role":"anon","exp":1983812996}`. So a test runner needs **no real secret** to reach the local stack: `http://127.0.0.1:54321` plus the published demo key, or `postgresql://postgres:postgres@127.0.0.1:54322/postgres` for direct SQL.

#### A.6 Sharp edges, ordered by how early they bite

1. **`astro:env/server` is unresolvable in plain Vitest.** Importing any of the three env modules, `src/middleware.ts`, or anything under `src/pages/api/` fails at transform time without either the Astro env plugin or an explicit alias/stub.
2. **`@/*` is not resolved for free** — needed even by pure unit tests, since all four logic modules import `@/lib/database.types`.
3. **`getViteConfig()` drags `@cloudflare/vite-plugin` into the test pipeline.** The adapter injects it during `astro:config:setup` configured as `viteEnvironment: { name: "ssr" }` (`node_modules/@astrojs/cloudflare/dist/index.js:135-141`); it also blanks `ssr.external` and marks `cloudflare:*` external. Vitest's node pool transforms through an environment of the same name, so the two collide. `@cloudflare/vitest-pool-workers` is **not** installed, and nothing in this repo has ever exercised the combination. This is the most likely cause of an opaque failure in an otherwise-correct config. Astro's docs confirm `getViteConfig(userViteConfig, inlineAstroConfig?)` accepts a second `AstroInlineConfig` argument (checked against `/withastro/docs`, 2026-08-23), which is the documented lever for overriding config in tests — whether it can unset the adapter is untested and worth a spike rather than an assumption.
4. **`.env` points at production while `.dev.vars` points at local**, and the precedence that saves you is incidental ordering between the adapter's `config:done` hook and the env plugin's `load` hook. It would invert silently if `.dev.vars` were missing or the adapter dropped from the test config. **Highest-consequence edge in this report** — pin the target explicitly rather than inheriting file precedence.
5. **`supabase/tests/rls.sql:115-118` hard-asserts user A owns exactly 6 books** (§A.1). Destructive tests belong on user C or D.
6. **`strictTypeChecked` + `prettier/prettier` as errors, enforced on commit** (§A.5). `no-console` is only a warning, so logging is safe.
7. **`security.checkOrigin: true`** rejects cross-origin _form_ posts before the handler runs. Per Astro's configuration reference the check only inspects `application/x-www-form-urlencoded`, `multipart/form-data`, and `text/plain` — so the JSON book routes are unaffected and need no `Origin` header, while the form-post delete route does. Handler-level tests bypass the check entirely and cannot assert it (this matters for Phase 3, not Phase 1).
8. **Book _read_ paths are `.astro` frontmatter, not importable functions** (§C.5). Only the Container API or a real HTTP request can exercise them, and under the Container API middleware does not run, so `locals.user` must be injected by hand.
9. **The Container API cannot accept `integrations` or `adapter`** (`AstroContainerUserConfig = Omit<AstroUserConfig, 'integrations' | 'adapter'>`), so `@astrojs/react` must be re-registered via `container.addServerRenderer` for any page containing an island — which includes the add/edit forms and `books/index.astro`.
10. **Auth rate limits** will bite a suite that signs in per test (§A.4).
11. **No transaction isolation across the REST boundary.** `rls.sql` gets clean state from `begin; … rollback;`; anything going through PostgREST or HTTP cannot, so it needs explicit cleanup or per-run namespacing.
12. **`npx astro sync` must run before any type-aware step** — `.astro/env.d.ts` is what makes `astro:env/server` type-check, and it is gitignored. CI already syncs before lint; a fresh clone running tests directly would not.
13. **`Astro.locals` carries only `user`, never the Supabase client** (§B.4). There is no client-injection seam.

### B. Risk #1 — silent alteration or loss on add/edit

> _"A book's data is silently altered or lost on add/edit — a trope tag dropped, a field not persisted — and the user only discovers it later when the book stops surfacing in mood results."_

**Verdict: real, but the stated mechanism does not exist. Two different mechanisms do.**

#### B.1 The write paths are JSON-only API routes

Both are exported `APIRoute` consts, so both are importable as functions: `POST` at `src/pages/api/books.ts:6` and `PUT` at `src/pages/api/books/[id].ts:6`. There is no `PATCH` handler.

Neither route ever calls `request.formData()`. Both consume `request.json()` exclusively:

```20:25:src/pages/api/books.ts
  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
```

A form-urlencoded body therefore yields `400 {"error":"Invalid JSON body"}`. **There is no plain-form request for a test to replicate** — and it would not help if there were, because the trope input has no `name` attribute and no hidden inputs, so tropes are physically absent from any browser form body.

The insert names five columns and reads the row back:

```60:70:src/pages/api/books.ts
  const { data: book, error: insertError } = await supabase
    .from("books")
    .insert({
      title,
      author,
      tropes,
      description,
      user_id: user.id,
    })
    .select()
    .single();
```

Success is `201 { book, duplicate }`; there is no redirect. The island prepends the returned row to an in-memory session list. Failure statuses: `503` (no Supabase client), `401`, `400` (bad JSON or validation, with `fieldErrors`), `500`.

Edit is a _partial_ `.update()` naming four columns, but because `bookSchema` requires title, author, and tropes, every accepted request overwrites all four:

```67:73:src/pages/api/books/[id].ts
  const { data: book, error: updateError } = await supabase
    .from("books")
    .update({ title, author, tropes, description })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .maybeSingle();
```

`id`, `user_id`, and `created_at` are never in the update object and cannot be clobbered; `updated_at` is bumped by the DB trigger. Success is `200 { book, duplicate }`, after which the island does a full page navigation to `/books`.

**Duplicates are not blocked.** The pre-insert lookup only sets a flag (`src/pages/api/books.ts:58`); the insert runs regardless, and the comparison is exact-match and case-sensitive. Posting the same title/author twice yields two `201`s and two rows.

#### B.2 Trope storage round-trips losslessly

Tropes are the `text[]` column shown in §A.4, with `cardinality >= 1` and no-null/no-blank constraints as DB backstops. Generated types agree (`src/lib/database.types.ts:44`, `:54`, `:64`).

The single transformation lives in the shared schema and does exactly four things:

```9:21:src/lib/book-schema.ts
export const tropeListSchema = z
  .array(trope)
  .transform((raw) => {
    const seen = new Set<string>();
    return raw.filter((t) => {
      if (t.length === 0 || seen.has(t)) return false;
      seen.add(t);
      return true;
    });
  })
  .pipe(
    z.array(z.string()).min(1, { error: "Add at least one trope" }).max(25, { error: "Add no more than 25 tropes" }),
  );
```

Per-element trim, empty-filter, exact-string dedupe (first occurrence wins), order preserved by `filter`. **No lowercasing and no Unicode normalisation exist anywhere in `src/`** — a repo-wide grep for `toLowerCase|normalize(` finds only the `/books` search-box lowercasing and the sort comparators. That is correct per the PRD's permanent Non-Goal on normalisation.

Reading back is a plain server-side select passed straight down as a prop (`src/pages/books/[id]/edit.astro:38-43`, `:94`) and seeded into state unchanged (`src/components/books/EditBookForm.tsx:78`). **Add-then-read-back is lossless**: `text[]` preserves order, `.select()` echoes the payload, and no case or order transformation exists on either leg. Over-cap submissions are rejected with a 400, not silently truncated.

#### B.3 What can actually go wrong

1. **`description` is nulled on edit when the key is omitted.** `descriptionSchema` is `.nullish()` (`src/lib/book-schema.ts:40-48`), so `{title, author, tropes}` with no `description` validates, becomes `null`, and `src/pages/api/books/[id].ts:69` writes that `null` over an existing value. Title, author, and tropes are required and cannot be nulled this way. The browser always sends the key — so this is a **test-client hazard first and a product hazard second**, and Phase 1 must send `description` explicitly or it will corrupt its own fixtures.
2. **Case and whitespace fragmentation produces the "stops surfacing" symptom without any loss.** Matching is exact-string (`src/lib/mood-selection.ts:68`; browse is the same at `src/lib/book-filters.ts:72`), and picker vocabulary dedupe is exact (`src/lib/book-filters.ts:85`). So `Slow Burn` and `slow burn` are two pickable options. Two mitigations worth knowing: the vocabulary is derived from the user's own stored tropes, so a book always surfaces under its own exact spelling — it is fragmented, not invisible; and the vocabulary sort uses `sensitivity: "base"`, so variants list adjacently. Internal whitespace (`slow  burn`, two spaces) is the genuinely UI-reachable trap, because trim does not collapse it. The seed data itself already contains both `enemies-to-lovers` (`supabase/seed.sql:192`) and `enemies to lovers` (`:298`).
3. **The uncommitted-pending-trope path is the closest thing to a real trope-dropping bug — and it already happened once.** Text still sitting in the trope input when Save is pressed would silently vanish; the fix is `mergePendingTrope`, which merges pending text before parsing. It is defined **twice, identically, and exported from neither file** (`src/components/books/AddBookForm.tsx:27-36`, `src/components/books/EditBookForm.tsx:47-56`), so the two copies can drift silently and neither can be reached by importing a module — only by rendering the island.

#### B.4 Clients, ownership, and the absence of an injection seam

Both write paths use the request-scoped SSR client with the anon key, so every write is subject to RLS (`src/pages/api/books.ts:7`, `src/pages/api/books/[id].ts:7`). The service-role admin client is not used by either path. `user_id` is taken from `supabase.auth.getUser()` server-side and never trusted from the body — `bookSchema` has no `user_id` key, and since the object is not `.strict()`, a client-supplied `user_id` is silently stripped rather than rejected.

**The Supabase client is never attached to `locals`; only the user is.** `src/env.d.ts` in full:

```1:5:src/env.d.ts
declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
  }
}
```

So every route builds its own client from `createClient(request.headers, cookies)` — middleware once for auth, then each route and each page frontmatter independently. The session lives entirely in the request's `Cookie` header. There is no shared instance to inject or swap, which rules out any plan premised on stubbing a client on `locals`.

To call an API handler directly, a test must fabricate: `request` (with a real `Cookie` header — the only identity channel), `cookies` with a working `.set()`, `params` for the `[id]` routes, and `redirect()` for form-post routes. **`locals` is not needed** — no API route reads it.

### C. Risk #5 — the mood-trope picker

> _"The mood-trope picker returns books that do not overlap the chosen tropes, returns more than three, or shows a blank screen instead of the 'no matches' explanation."_

**Verdict: confirmed as the right area, but the three symptoms score very differently. "Returns more than three" is true today by design. "Blank screen" does not occur. "Does not overlap" is guarded but has a real lookalike hazard.**

#### C.1 Matching is entirely in-process

The only database call on the mood path is an unfiltered, unordered, unlimited fetch of the user's whole TBR (`src/pages/mood.astro:49-52`) — no `.order()`, no `.limit()`, no `.overlaps()`/`.cs()`/`.ov()`, no `.rpc()`. The GIN index on `tropes` exists but no query uses it. This was a deliberate decision: at ~100 rows a DB-side overlap would add a round trip for no gain, and the picker needs all the user's tropes anyway (`context/archive/2026-08-15-mood-trope-recommendation/plan.md:31`).

The predicate is a plain loop, and `Array.prototype.includes` makes it exact-string:

```64:72:src/lib/mood-selection.ts
export function matchesAnyTrope(book: Pick<Tables<"books">, "tropes">, tropes: string[]): boolean {
  if (tropes.length === 0) return false;

  for (const trope of tropes) {
    if (book.tropes.includes(trope)) return true;
  }

  return false;
}
```

The `tropes.length === 0` guard is load-bearing: without it, the first visit would render the no-match screen. A plan review flagged that both wrong implementations could ship green because no manual test covered the landing screen (`context/archive/2026-08-15-mood-trope-recommendation/reviews/plan-review.md:35`).

**The single highest-value unit test in this area is the AND/OR distinction.** `matchesAnyTrope` is OR; `matchesBookFilters` (`src/lib/book-filters.ts:70-74`) is AND. Both read the same `trope` query-param name and read almost identically at a glance. The archived plan called this "the main correctness hazard in this slice" and deliberately put the mood predicate in a separate module to avoid co-locating them.

#### C.2 "Up to 3" is a page size, not a cap — the biggest divergence

`show` is clamped low but **unbounded high**:

```89:95:src/lib/mood-selection.ts
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < MOOD_STEP_SIZE) {
    return MOOD_STEP_SIZE;
  }

  return Math.ceil(parsed / MOOD_STEP_SIZE) * MOOD_STEP_SIZE;
```

So `/mood?trope=X&show=999` renders every match, and the UI ships an explicit "Show me 3 more" link (`src/pages/mood.astro:170-178`). FR-010's "up to 3" and the Business Logic's "at most 3 books … never returns a long list" hold only for the _first_ view.

This was reasoned about deliberately, and the reasoning is quotable: _"That constraint is read as governing what the system volunteers, not what the reader may deliberately ask for. Each expansion is an explicit click, the starting answer is always three, and picking a new mood resets to three"_ (`context/archive/2026-08-15-mood-trope-recommendation/plan.md:287`). The PRD was never amended to say so. **A test asserting "never more than 3" fails; a test asserting "3 on first view, resets to 3 on a new selection" passes.** Which is the contract is a decision the plan must record, not one a test author should make silently.

Related invariant worth pinning: the submit form must not carry `show`, or picking a fresh mood after expanding would silently return twelve books instead of three (`plan.md:60`). `buildMoodHref` omits `show` when it equals the step size (`src/lib/mood-selection.ts:119-121`).

#### C.3 Results are ordered, against a Non-Goal

```74:81:src/lib/mood-selection.ts
export function sortBooksForMood<T extends Pick<Tables<"books">, "id" | "title">>(books: T[]): T[] {
  return [...books].sort((a, b) => {
    const titleCmp = a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" });
    if (titleCmp !== 0) return titleCmp;

    return a.id.localeCompare(b.id);
  });
}
```

The PRD Non-Goal forbids "ranking or ordering within the 3 recommended results". The archived plan took the trade knowingly, because stable order is what makes incremental expansion coherent — books already on screen never move when more appear beneath them (`plan.md:34`). Practically this is also what makes exact-title assertions possible at all, since the query imposes no order.

**Caveat for fixtures:** two titles that tie under `sensitivity: "base"` (which folds case _and_ accents) fall through to a `localeCompare` on random UUIDs. Such a fixture must be asserted on set membership only. The archive already provides a worked oracle: user A picking `enemies-to-lovers` + `slow burn` + `contemporary` matches 5 books, in stable order _Beach Read, Fourth Wing, Red White and Royal Blue, The Hating Game, The Seven Husbands of Evelyn Hugo_ (`plan.md:35`).

#### C.4 Selection transport, the 1–3 cap, and boundaries

Tropes arrive as repeated `GET` query params from a **no-JavaScript HTML form** (`src/components/books/MoodPicker.astro:19`), one checkbox per vocabulary entry all named `trope`, plus a `submitted=1` marker on the submit button read at `src/pages/mood.astro:33`.

Parsing and validation are deliberately separate steps, so the page can re-render the user's actual ticks alongside an error instead of silently truncating (`plan.md:64`). `parseMoodTropes` trims, drops empties, dedupes exactly, and stops at a defensive 26; `validateMoodSelection` then applies the 1–3 rule. The cap is **server-side only** — there is no JavaScript in the picker, so a user can tick 4+ and submit.

Confirmed boundary behaviour:

| Input                        | Result                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 4+ tropes                    | `too-many` → error `"Pick 1 to 3 tropes"`, ticks preserved, **no matching runs, no results render**                                  |
| 27+ tropes                   | truncated to 26 by the transport bound, then still `too-many`                                                                        |
| zero tropes                  | `empty` → `picker-only`; error `"Pick at least one trope"` shown **only if `submitted` is present**, which keeps a first visit clean |
| unknown trope                | passes validation, matches nothing, lands on `no-match` — there is no membership check against the vocabulary anywhere               |
| duplicates / whitespace-only | dropped before counting, so `?trope=a&trope=a&trope=a&trope=a` is one trope                                                          |
| `show=abc`, `1`, `2.5`, `-5` | all fall back to 3                                                                                                                   |

Two traps for a test author. First, `moodSelectionSchema`'s message is `"Pick no more than 3 tropes"` (`src/lib/mood-selection.ts:27`) but that string is **never rendered** — the page hardcodes `"Pick 1 to 3 tropes"`. A unit test asserting the schema message is not asserting the user-visible text. Second, the mood cap must **not** reuse `tropeListSchema`, whose ceiling is 25; a plan review caught this as a wording trap that would treat 4–25 as `ok`.

#### C.5 The seven states, and why "blank screen" does not occur

`src/pages/mood.astro:22` declares seven states, and they do not map one-to-one onto screens:

| State              | Condition                                  | User-visible text                                   |
| ------------------ | ------------------------------------------ | --------------------------------------------------- |
| `failed`           | no client (`:46`) or query error (`:54`)   | "Couldn't load your list. Try reloading the page."  |
| `empty-tbr`        | `data.length === 0` (`:57`)                | "Add a book to your TBR first." + "Add a book" link |
| `empty-vocabulary` | `tropeVocabulary.length === 0` (`:62`)     | **identical copy — shares the branch at `:145`**    |
| `picker-only`      | `validation.status === "empty"` (`:64`)    | picker; error only when `submitted`                 |
| `too-many`         | `validation.status === "too-many"` (`:69`) | picker + "Pick 1 to 3 tropes"                       |
| `no-match`         | `matches.length === 0` (`:75`)             | picker + "No matches — try different tropes."       |
| `results`          | otherwise (`:81`)                          | picker + count line + list + expansion link         |

Answering the risk directly: **no collapse violates US-01.** The 0-result list the PRD warns against does not occur, because `empty-tbr` never reaches `matchesAnyTrope`. The blank screen does not occur, because `no-match` has its own branch, its own copy, and renders the picker above the message so the user can re-query. The only collapse is `empty-tbr` / `empty-vocabulary` into one screen, and both halves render exactly the copy US-01 asks for.

Two states are effectively untestable and should not be chased. **`empty-vocabulary` is unreachable** — the DB `tropes_nonempty` constraint plus `tropeListSchema.min(1)` make a book with zero tropes unrepresentable through any supported write path; the archive already recorded it as a safe fallback rather than a built-and-tested state. **`no-match` is unreachable by clicking** — every offered trope is on ≥1 book and any-match only widens, so no clickable combination returns zero; it is reachable by a stale bookmark, a hand-edited URL, a case mismatch, or a trope deleted between load and submit, and the archive says it "ships and is tested via URL".

Also note `too-many` has **no PRD backing at all**: FR-009 caps selection at 3 but the PRD never specifies what happens on 4+, so the copy is implementation-defined and a test asserting it asserts the implementation, not the oracle.

#### C.6 Vocabulary and isolation

The picker vocabulary is computed in TypeScript over the already-fetched rows (`src/pages/mood.astro:60` → `collectTropeVocabulary`, `src/lib/book-filters.ts:79-99`), scoped to the user because its input is the `.eq("user_id", user.id)` result, deduped by exact string, sorted case-insensitively.

**Minor divergence from FR-008:** the `alsoInclude` argument injects the caller's own selected tropes into the picker even when they appear on zero books, so `/mood?trope=zzz` renders `zzz` as a checked box. The intent was to keep a stale selection visible rather than silently dropping it — and dropping it would widen the result set, which a plan review flagged as the worse failure. Astro escapes the value, so it is not an injection vector. A test should assert the vocabulary equals the distinct TBR tropes **plus any currently-selected value**.

Isolation is belt-and-braces: `Astro.locals.user` from verified `getUser()`, `/mood` listed in `PROTECTED_ROUTES`, an explicit `.eq("user_id", user.id)`, and the RLS select policy as backstop. Because RLS is a backstop rather than the sole mechanism, **a test that dropped the `.eq()` would still pass** — so isolation is only meaningfully verifiable at the RLS layer, which is what `supabase/tests/rls.sql` already does. That is Phase 3 territory, not Phase 1.

### D. Risk #6 — validation drift between browser and server

> _"Validation drifts between the browser form and the server, so a book the user typed is silently refused, or is saved with wrong or missing trope tags, part-way through migrating a 100-book backlog."_

**Verdict: the premise is refuted — one schema is genuinely shared and genuinely run on both sides. Three narrower drift mechanisms replace it, and one of them is invisible to any UI-level test.**

#### D.1 One schema, explicitly shared

`src/lib/book-schema.ts` exports `tropeListSchema`, `bookSchema`, `BookInput`, `BookPayload`, `bookIdSchema`, `BookMutationSuccess`, `BookMutationError`, `jsonResponse`, `isBookMutationSuccess`, `isBookMutationError`. The four field schemas (`trope`, `titleSchema`, `authorSchema`, `descriptionSchema`) are module-private and not directly unit-testable.

Importers: `AddBookForm.tsx:9-15` and `EditBookForm.tsx:8-14` (both run `bookSchema.safeParse` in the browser), `TropeInput.tsx:4` (runs `tropeListSchema` on every chip commit), `api/books.ts:3`, `api/books/[id].ts:3`, `api/books/[id]/delete.ts:3`, `books/[id]/edit.astro:7`, `books/index.astro:17`.

This was a recorded decision, not an accident: _"Add zod 4; one schema in `src/lib/book-schema.ts` shared by route and island … Client and server can't drift"_ (`context/archive/2026-08-02-add-book-to-tbr/plan-brief.md:24`). The archive also records the intended division of labour: the DB already rejects everything FR-004 forbids, so _"application validation is about fast, field-level user feedback — not about being the last line of defense"_ (`plan.md:38`).

The full constraint set:

| Field         | Required              | Transform                                    | Limits                    | Messages                                                                                              |
| ------------- | --------------------- | -------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------- |
| `title`       | yes                   | trim                                         | 1–300                     | "Title is required" / "Keep the title to 300 characters or fewer"                                     |
| `author`      | yes                   | trim                                         | 1–200                     | "Author is required" / "Keep the author to 200 characters or fewer"                                   |
| `tropes`      | yes                   | per-element trim, drop empties, exact dedupe | 1–25 items, 60 chars each | "Add at least one trope" / "Add no more than 25 tropes" / "Keep each trope to 60 characters or fewer" |
| `description` | **no (`.nullish()`)** | trim, `""` → `null`                          | ≤ 2000, nullable          | "Keep the description to 2000 characters or fewer"                                                    |

No defaults, no `z.coerce`, no `.refine()`, no `.regex()`, and **no `.strict()`** — unknown keys are silently stripped, not rejected.

Two ordering facts that matter for test expectations: a >60-char trope fails _before_ the array-level dedupe transform runs, so it never reaches the count check; and `titleSchema` trims before `min(1)`, so a whitespace-only title reports "Title is required" rather than a length error.

#### D.2 The client posts already-transformed output — the invisible drift

Both islands parse and then send `result.data`, not raw state:

```99:106:src/components/books/AddBookForm.tsx
    const payload: BookPayload = result.data;

    let response: Response;
    try {
      response = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
```

**Consequence:** the server's trim, dedupe, and empty-filter transforms never do any work for browser traffic — they are idempotent no-ops on an already-normalised array. Any UI-level test passes whether or not the server still normalises. Only a direct HTTP test with raw, un-normalised input can catch a regression there, and that path is precisely what would silently store wrong or missing trope tags. **This is the strongest argument in this document for including a raw-request integration test in Phase 1 rather than deferring the data boundary.**

#### D.3 Browser-side checks, and the one imperative mirror

There is **no HTML-attribute validation at all**: both forms carry `noValidate`, and `FormField` emits no `required`/`minlength`/`maxlength`/`pattern`. (For contrast, `BookFilterBar.astro:32` does use `maxlength={300}` — the codebase knows the technique and deliberately doesn't use it here.) Submit is never disabled on validity: Add is always clickable; Edit is disabled only when not dirty.

`TropeInput` commits a chip on Enter, on a typed comma, or on blur, applying rules imperatively _before_ the schema sees the value: trim, **silent** empty rejection, **silent** case-sensitive dedupe, then `tropeListSchema` for the length and count caps. Removal is by chip ✕ or Backspace on an empty input. No allowed-character restriction anywhere, consistent with the no-normalisation rule.

`mergePendingTrope` re-implements the same commit rules a second and third time (§B.3), with its own comment admitting it is a mirror: _"Mirrors TropeInput's commit rules so pressing Save accepts exactly what pressing Enter would have accepted."_ `mapFieldErrors` is likewise duplicated in both islands. None of the four copies is exported.

#### D.4 Server-side handling

Both routes parse with the shared `bookSchema` and nothing else. Failure is a **JSON 400**, never a re-rendered form or a redirect:

```28:41:src/pages/api/books.ts
  const result = bookSchema.safeParse(body);
  if (!result.success) {
    const fieldErrors = z.flattenError(result.error).fieldErrors;
    return jsonResponse(
      {
        error: "Validation failed",
        // The client renders one message per field; capping keeps a per-element
        // failure from producing one message per submitted trope.
        fieldErrors: Object.fromEntries(
          Object.entries(fieldErrors).map(([field, messages]) => [field, messages.slice(0, 1)]),
        ),
      },
      400,
    );
  }
```

The `messages.slice(0, 1)` cap exists **only in the routes**, not in the schema, so it is only assertable at the HTTP layer. All four fields' validation messages live solely in `book-schema.ts`; the envelope strings (`"Validation failed"`, `"Invalid JSON body"`) are duplicated literals across the two routes. `mapFieldErrors` hard-codes the four field names, so a fifth field would produce a server error the UI drops silently, with nothing type-checking the pairing.

#### D.5 Concrete divergences worth testing

Genuinely different accept/reject or different stored value:

1. **A pasted trope containing a comma becomes one tag; a typed one becomes two.** The comma is a separator only in `handleKeyDown`; `onChange` does no splitting. Pasting `enemies to lovers, fake dating` and blurring commits the single trope `"enemies to lovers, fake dating"`, which the server and DB both accept. **This is the highest-value case for a 100-book migration, where paste is the natural input method.**
2. **A >60-char trope can be held in the input indefinitely but never committed** — `tryCommitTag` does not clear pending text on failure, and in Edit pending text counts toward `isDirty`, so Save stays enabled and fails again identically. The user sees a rejection loop; the text is silently absent from what would be saved if they navigate away.
3. **Duplicate and empty tropes are dropped with no message at all** on both sides — the chip simply doesn't appear.
4. **Every length limit lives only in Zod.** A 301-char title, 201-char author, 61-char trope, 2001-char description, and a 26th trope are all rejected by both sides and would all be accepted by the database.
5. **Non-string payloads surface raw Zod messages** to the UI. The islands cannot produce `title: 123`, but a direct caller can; those strings are the only user-facing validation text not authored in this repo.
6. **Unknown keys are stripped, not rejected** — `POST` with a foreign `user_id` returns 201 having ignored it.

Same on both sides, worth pinning as regression locks: whitespace-only title/author → "is required"; leading/trailing whitespace → stored trimmed; zero tropes and `["   "]` → "Add at least one trope"; description omitted / `null` / `""` / `"   "` → all store `null`. And **`"Fake Dating"` and `"fake dating"` are both kept as separate tropes** — correct per the PRD's permanent no-normalisation rule, and worth a test precisely so nobody later "fixes" it.

#### D.6 House style, for the plan's reference

Three conventions coexist. The books flow is the strongest and the one to treat as the target:

| Pattern                                  | Where          | Client validation                                                                  | Failure UX                                   |
| ---------------------------------------- | -------------- | ---------------------------------------------------------------------------------- | -------------------------------------------- |
| Shared Zod, run both sides               | books add/edit | same `bookSchema` in browser                                                       | JSON 400 → per-field messages, no navigation |
| Shared Zod server-only, shared constants | account delete | none                                                                               | redirect with `?error=` code                 |
| **Hand-rolled client checks**            | auth forms     | duplicated literals and an inline regex (`SignInForm.tsx:18-30`), no schema module | native POST + server re-render               |

The auth forms are the actual instance of the "two independent definitions that can drift" risk — out of scope for Phase 1, worth noting for a later phase.

### E. How tests reach the data boundary

The test plan leaves this open for research to ground (§4, "data boundary"). Two structural facts constrain every option.

**Reads are not importable; writes are.** All three book read surfaces run their query inside `.astro` frontmatter, which compiles to an internal component factory and cannot be called as a function: `src/pages/books/index.astro:89-121`, `src/pages/mood.astro:35-95`, `src/pages/books/[id]/edit.astro:24-39`. The four book/account mutation routes plus three auth routes export named `APIRoute` consts and are directly importable.

| Option                                                | What exists already                                                                                                               | What must be built                                                                            | Blocked by adapter / `astro:env`?                                                               | Proves                                                                                                                                                             | Does not prove                                                                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| **(a) HTTP against `npm run dev`**                    | dev script; adapter reads `.dev.vars` into `process.env`; CI already curl-smoke-tests prod                                        | server start/stop + health wait; sign-in via form POST to `/api/auth/signin` and a cookie jar | **No** — both fully satisfied; runs in workerd as production does                               | end-to-end persistence and read-back, statuses, redirects, 401-not-HTML, route gating, origin check, rendered page content                                         | unit-level behaviour; cannot separate "our owner check worked" from "RLS denied it" without probing                       |
| **(b) `getViteConfig()` / preview server**            | `getViteConfig` is exported and documented; adapter declares a preview entrypoint                                                 | `vitest.config.ts` wrapping it, or preview orchestration                                      | **Partially** — pulls in `@cloudflare/vite-plugin` claiming the `ssr` environment (§A.6 #3)     | everything (a) does, closer to the shipped bundle; plus Container API rendering of `.astro`                                                                        | production runtime if Container is used instead of workerd                                                                |
| **(c) Import handlers + synthetic `Request`/context** | seven exported `APIRoute` handlers; the needed context surface is small (§B.4)                                                    | a fake `APIContext`: `request`, `cookies`, `params`, `redirect`                               | **Yes, on `astro:env`** — needs either (b) or a 2-line alias stub; adapter otherwise irrelevant | the full handler contract: statuses, JSON bodies, duplicate flag, the `fieldErrors` cap, 503/401/404 branches — and real persistence if pointed at the local stack | anything Astro mediates: `checkOrigin`, `PROTECTED_ROUTES`, middleware `locals`, `Set-Cookie`, routing; no page rendering |
| **(d) Drive `supabase-js` directly**                  | both Supabase packages already dependencies; local URL + demo key known; 4 seeded accounts; fixed book UUIDs; `rls.sql` precedent | client + sign-in helper; cleanup or namespacing discipline                                    | **No** — zero Astro and Cloudflare exposure                                                     | trope round-trip at the column level, the four `check` constraints, the `updated_at` trigger, RLS via PostgREST, `anon` revoked                                    | **none of our code** — not the schema, not the ownership filters, not statuses. Highest risk of building the wrong thing  |
| **(e) Automate the existing `rls.sql`**               | the suite exists and `ON_ERROR_STOP=1` already yields a correct exit code                                                         | one npm script; a `psql` binary (not currently a declared prerequisite)                       | **No**                                                                                          | exactly what it proves today                                                                                                                                       | nothing new                                                                                                               |

**What the evidence favours, for the plan to confirm.** A two-tier split matches this repo's shape unusually well. The unit tier is nearly free — five pure modules, no Astro machinery, just the `@/*` alias — and covers most of risks #5 and #6. For the integration tier, §D.2 is decisive: because the browser posts pre-normalised data, only a **raw request carrying un-normalised input** can prove the server's normalisation still works, which is the core of risk #1 and #6. Option (d) alone cannot do that (it never touches our code), and option (b) carries the highest configuration risk. Options (a) and (c) both can; (c) is cheaper and (a) is more faithful. §7 of the test plan also explicitly carves out "Supabase's own built-in behaviour" as the vendor's job, which argues against investing in (d) beyond fixture setup.

## Code References

**Pure and unit-testable today (no I/O, no Astro):**

- `src/lib/book-schema.ts:9` — `tropeListSchema`: trim, empty-filter, exact dedupe, 1–25, 60 chars/element
- `src/lib/book-schema.ts:50` — `bookSchema`: the whole four-field contract both sides run
- `src/lib/book-schema.ts:60`, `:72`, `:95`, `:101` — `bookIdSchema`, `jsonResponse`, and the two response guards
- `src/lib/mood-selection.ts:46`, `:50` — `parseMoodSelection` / `validateMoodSelection`: the 0 / 1–3 / 4+ boundaries
- `src/lib/mood-selection.ts:64` — `matchesAnyTrope`: OR semantics and the empty-selection guard
- `src/lib/mood-selection.ts:74` — `sortBooksForMood`: determinism and tie-breaking
- `src/lib/mood-selection.ts:83`, `:103`, `:112` — `parseMoodShowCount`, `takeMoodMatches`, `buildMoodHref`
- `src/lib/book-filters.ts:59` — `matchesBookFilters`: AND semantics, the lookalike hazard
- `src/lib/book-filters.ts:79` — `collectTropeVocabulary`: FR-008 universe plus `alsoInclude`
- `src/lib/sort-books-for-browse.ts:8`, `src/lib/account-schema.ts:6`

**Reachable only through HTTP or a fabricated context:**

- `src/pages/api/books.ts:6` — `POST`: JSON-only, `.insert().select()`, duplicate flag, `user_id` from session
- `src/pages/api/books/[id].ts:6` — `PUT`: full four-column overwrite scoped by `.eq("user_id")`
- `src/pages/api/books.ts:29-41` — the `fieldErrors` one-per-field cap, defined only here
- `src/pages/mood.astro:22-90` — the seven-state machine and its branch order
- `src/pages/books/index.astro:89-121`, `src/pages/books/[id]/edit.astro:24-43` — frontmatter reads

**Reachable only by rendering an island:**

- `src/components/books/TropeInput.tsx:24-54` — the chip-commit contract, including the pasted-comma case
- `src/components/books/AddBookForm.tsx:27-36`, `src/components/books/EditBookForm.tsx:47-56` — the two unexported copies of `mergePendingTrope`

**Infrastructure:**

- `supabase/tests/rls.sql:1-131` — the existing isolation suite; `:115-118` is the count coupling
- `supabase/seed.sql` — four accounts (`password123`), fixed UUIDs, 37 books
- `supabase/migrations/20260705084406_create_books.sql:4-59` — schema, constraints, indexes, trigger, RLS
- `src/middleware.ts:4` — `PROTECTED_ROUTES`; `src/env.d.ts:1-5` — `locals` carries only `user`
- `.github/workflows/ci.yml:19-25` — the `lint` → `build` seam

## Architecture Insights

- **The `astro:env` boundary is unusually clean**, and that is the single most useful structural fact for this phase. Three thin modules, each with an explicit `return null` fallback, isolate the entire framework dependency. Everything worth unit-testing sits outside it.
- **Pure logic modules were written for this phase before it existed.** The archive is explicit: _"If a test framework is added later, `src/lib/mood-selection.ts` is the unit under test"_ (`context/archive/2026-08-15-mood-trope-recommendation/plan.md:406`), and the S-04 filter core was _"deliberately shaped as a dependency-free pure module so tests can be added later without refactoring it."_ Phase 1 is collecting a debt that was deliberately structured to be collectable.
- **Validation is intentionally three-layered, not redundantly duplicated**: Zod for fast field-level feedback, DB `check` constraints as the real floor, RLS for ownership. Length caps exist only in layer one. A test author should know which layer owns which guarantee before deciding what a failure means.
- **The mood flow is server-rendered with zero JavaScript** — a plain `GET` form with checkboxes — which makes it the cheapest surface in the app to test and the most robust against the S-07 rewrite. The add/edit forms are the opposite: React 19 form actions with no `method`/`action`, so they do not function at all without JavaScript, and there is no plain-form request to replicate.
- **RLS as a backstop weakens tests that target application code.** Because both the explicit `.eq("user_id", …)` filter and the RLS policy are present, removing the filter would not fail an integration test. Ownership is only meaningfully provable at the SQL layer.
- **Determinism in results comes from application code, not the database.** No query on the mood or browse path has an `ORDER BY`; the TS sort is the only thing making exact-title assertions possible.

## Historical Context (from prior changes)

- `context/archive/2026-07-04-tbr-data-and-isolation/plan-brief.md:21` — trope storage decided as `text[]` + GIN: _"Matches PRD's per-user free-text/no-normalization rule; any-match is a one-line overlap query with zero joins."_ A tags table and JSONB were explicitly rejected (`plan.md:42`).
- `context/archive/2026-07-04-tbr-data-and-isolation/plan.md:43` — automation deferred deliberately, with `rls.sql` written _"to be the artifact that phase can automate as-is"_. That phase is this one.
- `context/archive/2026-08-02-add-book-to-tbr/plan-brief.md:24` — the shared-schema decision, quoted in §D.1.
- `context/archive/2026-08-02-add-book-to-tbr/plan.md:82` — the uncommitted-trope trap found during planning; `reviews/impl-review.md:31` confirms the fix. `impl-review.md:11` records five findings fixed before ship (fieldErrors cap, console.error on 500s, a11y, `mergePendingTrope`, `AbortSignal.timeout`).
- `context/archive/2026-08-15-mood-trope-recommendation/plan.md:30-35` — the AND/OR hazard, the in-memory decision, stable ordering, and the 5-book expansion oracle. `:287` is the "up to 3" reinterpretation. `reviews/plan-review.md:35` flags that the landing-state bug could ship green because no manual test covered it.
- `context/archive/2026-08-15-mood-trope-recommendation/plan.md:426` — an unplanned fix: _"During mood manual testing, Save with no changes appeared clickable but did nothing."_ An instance of the exact defect class behind Risk #2.
- `context/archive/2026-08-11-edit-delete-book/plan.md:88` — _"A handler that only checks `error` will report a cross-account delete as a success"_ — RLS silence, relevant to Phase 3.
- `context/archive/2026-08-11-edit-delete-book/reviews/impl-review.md:197` — fixture drift after manual delete testing left user C with 17 books instead of 25.
- `context/archive/2026-08-14-search-filter-tbr/change.md:15` — filtering is deliberately all-match while recommendation is any-match: _"FR-010's any-match fits asking for recommendations … filtering is hunting."_
- `context/foundation/roadmap.md:198-207` and `context/changes/ui-theme-cafe-romance/change.md:43` — S-07 is a per-page class rewrite of every surface, described as _"pure polish"_. **No document contains an explicit behaviour-preservation guarantee**; the test plan treats it as a behaviour-drift risk requiring a full suite run first. This is what makes the behaviour-and-data-only constraint non-negotiable.

**Gap:** no archived document describes a _shipped_ production incident of trope loss or wrong mood overlap. The evidence for these risks is planned traps, review catches, and manual-QA discoveries — strong enough to justify tests, but worth stating honestly rather than implying a production regression.

## Open Questions

Ordered by how much each blocks the plan. The first three are decisions only the owner or the plan can make; research can only show the conflict.

1. **Is "up to 3" a hard cap or a first-page size?** (§C.2) The implementation and the archived plan say page size with unbounded expansion; PRD FR-010 and the Business Logic read as a hard cap. A test must assert one. Recommend recording the decision in the plan and, if the current behaviour stands, noting that the PRD should be amended rather than silently contradicted.
2. **Is the title-then-id ordering part of the contract or an implementation detail?** (§C.3) It contradicts a Non-Goal but is what makes exact-title assertions possible. If it is a detail, mood tests must assert set membership only — which is a materially weaker test.
3. **Does the `show` parameter need an upper bound?** (§C.2) `show=999` renders every match. Whether that is a defect or intended power-user behaviour follows from question 1.
4. **Which data-boundary option does Phase 1 adopt, and does it run in CI?** (§E) The unit tier is nearly free; the integration tier is where the cost sits, and CI has no Supabase service today. Options: local-only integration for now, or pay the `supabase start` cost per CI run.
5. **How does Phase 1 avoid breaking `supabase/tests/rls.sql`?** (§A.1) Confining writes to users C and D is the obvious answer; a `db reset` step before or after the suite is the alternative. Also to decide: does `rls.sql` become the first automated gate now (§E option e), or stay hand-run until Phase 3?
6. **How is the production-database hazard pinned shut?** (§A.5) `.env` currently points at the hosted project. The plan should set the target explicitly from the test command rather than inheriting Vite's file precedence, and should state what happens if a contributor's `.env` differs.
7. **Does Phase 1 add a DOM-capable tier?** The pasted-comma case, the pending-trope merge, and both unexported `mergePendingTrope` copies are only reachable by rendering an island (§D.3). That means jsdom/happy-dom plus a `fetch` stub — but Astro 6 forbids rendering `.astro` components in client environments, so this would be a second, separately configured project. Deferring it leaves the one genuine trope-loss mechanism uncovered; including it widens Phase 1 noticeably. Recommend deciding explicitly rather than by omission.
8. **Should the `description`-nulling behaviour be treated as a product bug or a caller contract?** (§B.3) Either way Phase 1's test client must send the key. If it is a bug, the fix belongs in a change of its own, not smuggled into the test phase.
