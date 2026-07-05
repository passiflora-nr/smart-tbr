# TBR Data Layer (books + trope tags) with Per-User RLS Isolation — Implementation Plan

## Overview

Establish the foundational data layer for SmartTBR: a single `books` table in Supabase Postgres that carries a book's title, author, one-or-more free-text trope tags, an optional description, and an owner reference — protected by Row-Level Security (RLS) so a book is reachable only by the account that owns it. This is roadmap slice **F-01** and the prerequisite for S-01 (add book), S-02 (browse), S-05 (mood-trope recommendation), and S-06 (account lifecycle).

The critical guarantee is **FR-011 / privacy Guardrail**: a user can never see another user's TBR through any interface SmartTBR exposes. RLS is the mechanism; a committed, re-runnable SQL isolation proof is the evidence.

## Current State Analysis

- **No data layer exists.** `supabase/config.toml` defines the local stack (`db.migrations.enabled = true`, seed path `./seed.sql`), but there is **no `supabase/migrations/` directory and no `books` schema**. This is the first migration in the repo.
- **The RLS enforcement path is already correctly wired.** `src/lib/supabase.ts` builds a `createServerClient` (`@supabase/ssr`) using the user's forwarded cookies plus the anon/publishable `SUPABASE_KEY`. Requests therefore run as the authenticated Postgres role, so `auth.uid()`-based policies are actually enforced — the app is **not** on a service-role key that would bypass RLS.
- **Auth is present.** Supabase email+password sign-up/in/out exist (`src/pages/api/auth/`*), `src/middleware.ts` populates `context.locals.user`, and `/dashboard` is gated. `App.Locals.user` is typed in `src/env.d.ts`.
- **Tooling is ready.** `supabase` CLI v2.101.0 is a devDependency; `@supabase/supabase-js` v2 is installed. No `gen:types` script exists yet.
- **No test framework** is wired up (per `AGENTS.md`) — RLS verification is done with a checked-in SQL script run against the local stack, not a JS test runner.
- **Production migrations are human-gated.** `context/foundation/infrastructure.md` lists "running schema migrations against Supabase production" as a human approval gate, and notes `wrangler rollback` does **not** undo schema migrations (manual reversal only).
- **Scale is tiny.** Single-digit users, ~100 books each; `lessons.md` confirms O(N) tag-matching in one Workers request is well within budget. Performance is not a constraint here beyond a sensible index.

### Key Discoveries:

- `src/lib/supabase.ts:9` — `createServerClient(SUPABASE_URL, SUPABASE_KEY, …)` with cookie-scoped auth → RLS is live for every app query. **Invariant to preserve:** TBR data access must always go through this cookie-scoped client, never a service-role key.
- `sr`c/lib/supabase.ts:6` — `createClient` returns `null` when env is unset; every consumer must null-check (already the codebase convention).
- `supabase/config.toml:53-65` — migrations and seed are enabled; seed loads from `./seed.sql` on `supabase db reset`.
- `astro.config.mjs:17-22` — `SUPABASE_URL` / `SUPABASE_KEY` are `context:"server"`, `access:"secret"`; server-only, never read in client code.
- `wrangler.jsonc:12` — `run_worker_first: ["/api/*"]`; unrelated to this change but the pattern future TBR API routes depend on.

## Desired End State

- A `books` table exists in both the **local** and **production** Supabase databases with: `id uuid` PK, `user_id uuid NOT NULL` FK → `auth.users(id) ON DELETE CASCADE`, `title text`, `author text`, `tropes text[]`, `description text` (nullable), `created_at`/`updated_at timestamptz`.
- CHECK constraints reject malformed rows (empty title/author, empty tropes array, empty/null tag elements).
- RLS is **enabled** and four owner-only policies exist; a checked-in SQL proof demonstrates cross-account access is denied and owner access works.
- A committed `src/lib/database.types.ts` describes the schema, a `gen:types` npm script regenerates it, and `createClient` is typed with the `Database` generic.
- A local-only seed populates two synthetic users with trope-tagged books as database/RLS fixtures; the accounts are not intended to be loginable demo users in F-01.

**Verification of end state:** `npx supabase db reset` applies migration + seed cleanly; `supabase/tests/rls.sql` runs with zero assertion failures; `npm run lint` and `npm run build` pass; and in production Supabase the `books` table shows "RLS enabled" with the four policies present.

## What We're NOT Doing

- **No API routes, UI, or forms.** Adding, browsing, editing, recommending — all deferred to S-01/S-02/S-03/S-04/S-05. F-01 is schema + isolation + typed boundary only.
- **No trope normalization of any kind** — no lowercasing, no canonical vocabulary, no cross-user mapping (permanent PRD Non-Goal). Within-a-single-book trim/dedupe is a write-path concern for S-01, not a DB constraint.
- **No account-deletion handler** (FR-013/S-06). F-01 only establishes the `ON DELETE CASCADE` FK that S-06 will rely on.
- **No separate tropes/tags table, no JSONB.** Trope tags are a `text[]` column (decided).
- **No test framework / pgTAP / CI DB tests.** Isolation is proven with a checked-in SQL script run locally. Automating this proof (e.g. pgTAP or a DB test step in CI, between `lint` and `build` per `AGENTS.md`) is intentionally deferred to a planned future testing phase; `rls.sql` is written to be the artifact that phase can automate as-is.
- **No route-gating changes** to `src/middleware.ts` (that is S-06's `PROTECTED_ROUTES` work).

## Implementation Approach

Build the schema as a single Supabase migration so the table, constraints, indexes, trigger, RLS enablement, and policies land atomically. Prove isolation locally with a seed + SQL script before anything touches production. Generate the typed boundary so downstream slices start type-safe. Apply to production last, as an explicit human-gated step, keeping local and prod schemas in parity from day one.

Sequencing rationale: schema first (nothing works without it) → isolation proof (the critical guardrail, provable locally) → typed boundary (unblocks consumers) → production apply (irreversible-ish, human-gated, done once local is proven).

## Critical Implementation Details

- **RLS enablement and policies must land in the same migration.** Enabling RLS without policies denies all access (breaks every future query); adding policies without `ENABLE ROW LEVEL SECURITY` provides no protection. Do both together.
- **The FK forces seed ordering.** `books.user_id` references `auth.users(id)`, so seeded/`test` users must be inserted into `auth.users` **before** their books. Seeding `auth.users` locally requires the identity columns Supabase expects (`id`, `aud`, `role`, `email`, `encrypted_password`, `created_at`, …); use fixed UUIDs so the RLS script can reference them deterministically.
- **Local RLS testing impersonates a user via JWT claims, not a real login.** Inside a transaction, set the role and the `sub` claim so `auth.uid()` resolves to a chosen user:

```sql
set local role authenticated;
set local request.jwt.claims to '{"sub":"<user-uuid>","role":"authenticated"}';
```

  Queries then execute under that user's RLS context. This is the non-obvious mechanism the isolation proof depends on.

- `**rls.sql` connection string.** Phase 2 runs the proof with `psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql`. Set `LOCAL_DB_URL` from `npx supabase status` (look for the DB URL), or use the default local stack URL: `postgresql://postgres:postgres@127.0.0.1:54322/postgres` (port matches `supabase/config.toml`).
- `**updated_at` auto-update** should use the standard `moddatetime` extension via a `BEFORE UPDATE` trigger, rather than a hand-rolled function, to keep the migration minimal. The migration must enable it first with `create extension if not exists moddatetime schema extensions;`, then call `extensions.moddatetime(updated_at)`.
- `**supabase gen types --local` requires the local stack running** (`supabase start`, i.e. Docker up). It reads the live local schema, so it must run after the migration is applied locally.
- **Production apply requires linking + DB credentials** (`supabase link`, then `supabase db push`) or applying the migration SQL via the Supabase Studio SQL editor. Either path is the human-gated step — do not run it unattended.

## Phase 1: Schema Migration

### Overview

Create the first repo migration defining the `books` table with all columns, constraints, indexes, the `updated_at` trigger, RLS enablement, and four owner-only policies. Prove it applies cleanly against the local stack.

### Changes Required:

#### 1. Books table migration

**File**: `supabase/migrations/<timestamp>_create_books.sql` (created via `npx supabase migration new create_books`)

**Intent**: Define the entire `books` schema and its isolation policies in one atomic migration so the table can never exist without RLS protecting it.

**Contract**: A `public.books` table with:

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `title text not null`, `author text not null`
- `tropes text[] not null`
- `description text` (nullable)
- `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`
- CHECK constraints: `length(trim(title)) > 0`; `length(trim(author)) > 0`; `cardinality(tropes) >= 1`; and no empty/null trope elements. The array constraints are the non-obvious ones:

```sql
-- reject empty arrays; array_length(..., 1) returns NULL for '{}', which CHECK would allow
constraint tropes_nonempty check (cardinality(tropes) >= 1),

-- reject empty-string or NULL elements inside the tropes array
constraint tropes_no_blanks check (
  array_position(tropes, null) is null
  and array_position(tropes, '') is null
)
```

- Indexes: `create index on public.books using gin (tropes);` and `create index on public.books (user_id);`
- Extension setup: `create extension if not exists moddatetime schema extensions;`
- `updated_at` maintained by a `before update` trigger using `extensions.moddatetime(updated_at)`.
- `alter table public.books enable row level security;`
- Four policies, each scoped to `authenticated` and keyed on ownership:
  - `select`: `using (auth.uid() = user_id)`
  - `insert`: `with check (auth.uid() = user_id)`
  - `update`: `using (auth.uid() = user_id) with check (auth.uid() = user_id)`
  - `delete`: `using (auth.uid() = user_id)`
- Table reachability for the cookie-scoped client (grants are separate from RLS; both are required for PostgREST/`supabase-js`):
  - `grant select, insert, update, delete on public.books to authenticated;`

### Success Criteria:

#### Automated Verification:

- Migration file exists under `supabase/migrations/`
- Local stack starts: `npx supabase start`
- Migration applies cleanly with no errors: `npx supabase migration up`
- `books` table + RLS + 4 policies present (query `pg_policies` / Studio shows RLS enabled)

#### Manual Verification:

- Table columns, types, defaults, and constraints match the contract in Supabase Studio
- Inserting a row with an empty `tropes` array or blank title is rejected by the DB

**Implementation Note**: After Phase 1's automated verification passes, pause for human confirmation of the manual checks before proceeding to Phase 2. Use `npx supabase migration up` only until `supabase/seed.sql` lands in Phase 2 — defer `npx supabase db reset` until then (config already references the missing seed file).

---

## Phase 2: Seed + RLS Isolation Proof

### Overview

Add local seed data and a checked-in SQL script that proves FR-011: a second user cannot read, update, or delete the first user's books, while the owner can. This is the evidence artifact for the critical guardrail.

### Changes Required:

#### 1. Local seed data

**File**: `supabase/seed.sql`

**Intent**: Provide realistic local-only database fixtures — two synthetic users each with several trope-tagged books, with overlapping tropes across books so downstream S-05 matching can be inspected — and to back the isolation proof. These fixtures are for DB/RLS verification and Studio inspection, not email/password login.

**Contract**: Idempotent inserts (fixed UUIDs) into `auth.users` for two users (User A, User B), followed by ~5-10 `books` rows per user with varied, overlapping `tropes` arrays. Users must be inserted before books (FK). Local-only; never applied to production. These synthetic users do not need to be loginable via Supabase Auth; downstream UI/API slices should create real accounts through signup or add loginable fixtures deliberately.

`**auth.users` seed checklist** (local stack; use fixed UUIDs for User A and User B so `rls.sql` can reference them):


| Column                      | Value / notes                                                       |
| --------------------------- | ------------------------------------------------------------------- |
| `id`                        | Fixed UUID per user (referenced by `books.user_id` and `rls.sql`)   |
| `instance_id`               | `'00000000-0000-0000-0000-000000000000'` (local dev default)        |
| `aud`                       | `'authenticated'`                                                   |
| `role`                      | `'authenticated'`                                                   |
| `email`                     | Unique per user, e.g. `user-a@example.test` / `user-b@example.test` |
| `encrypted_password`        | Bcrypt hash of a known test password (e.g. `password123`)           |
| `email_confirmed_at`        | `now()` (so local auth treats the account as confirmed)             |
| `created_at` / `updated_at` | `now()`                                                             |


Use `ON CONFLICT (id) DO NOTHING` (or equivalent) so re-running seed after `db reset` stays idempotent. Insert both users before any `books` rows.

#### 2. RLS isolation proof

**File**: `supabase/tests/rls.sql`

**Intent**: Assert the isolation contract deterministically so any agent/human can re-run it after any policy change.

**Contract**: A script that, per user transaction block (using `BEGIN`/`ROLLBACK`, with role and claims set via `SET LOCAL`), first asserts `auth.uid()` equals the expected fixed user UUID, then asserts:

- As User B: `select` over User A's books returns 0 rows.
- As User B: `update`/`delete` targeting User A's rows affect 0 rows (RLS filters them out).
- As User B: `insert` with `user_id = <User A>` is rejected by the insert `with check`.
- The rejected insert is wrapped in a `DO` block (or equivalent) that catches the expected RLS error and raises only if the insert unexpectedly succeeds, so `psql -v ON_ERROR_STOP=1` still exits zero when isolation works.
- As User A: `select` returns exactly User A's own rows (policy is not over-denying).
- Failing any assertion raises an exception (script exits non-zero) so the result is unambiguous.

**Assertion pattern** (use throughout; no pgTAP dependency):

```sql
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"<user-uuid>","role":"authenticated"}';

-- sanity: impersonation resolved
do $$ begin
  if auth.uid() is distinct from '<user-uuid>'::uuid then
    raise exception 'auth.uid() mismatch: got %', auth.uid();
  end if;
end $$;

-- example: cross-account read must return zero rows
do $$ declare n int; begin
  select count(*) into n from public.books where user_id = '<other-user-uuid>'::uuid;
  if n != 0 then
    raise exception 'expected 0 rows, got %', n;
  end if;
end $$;

rollback;
```

Repeat the `BEGIN`/`SET LOCAL`/assertion/`ROLLBACK` pattern for each scenario in the contract above.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` loads the seed without FK/constraint errors
- Isolation proof passes with zero assertion failures: `psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql`
- Owner-visibility assertion (User A sees own rows) passes in the same run

#### Manual Verification:

- (Optional, Studio-only for F-01) In Supabase Studio Table Editor, confirm seed users exist in `auth.users` and `books` rows show the expected `user_id` owners. **Browser/API cross-account spot-check is deferred to S-01** — F-01 has no books UI or API surface yet; `rls.sql` is the isolation proof for this change.
- Seed data is visible in Studio under the correct owners

**Implementation Note**: After Phase 2's automated verification passes, pause for human confirmation before proceeding to Phase 3.

---

## Phase 3: Typed Data Boundary

### Overview

Generate the TypeScript schema types, wire a regeneration script, and type the Supabase client so downstream slices inherit a fully-typed `books` table.

### Changes Required:

#### 1. Generated database types

**File**: `src/lib/database.types.ts`

**Intent**: Produce a single source-of-truth type for the schema, generated from the live local DB.

**Contract**: Output of `npx supabase gen types typescript --local`, committed to the repo. Regenerated whenever the schema changes.

#### 2. `gen:types` npm script

**File**: `package.json`

**Intent**: Make regeneration a one-command, documented step.

**Contract**: Add a `scripts` entry, e.g. `"gen:types": "supabase gen types typescript --local > src/lib/database.types.ts"`.

#### 3. Typed client

**File**: `src/lib/supabase.ts`

**Intent**: Parameterize the client with the generated `Database` type so `.from("books")` is type-checked at the boundary.

**Contract**: Import `Database` from `./database.types` and pass it as the generic to `createServerClient<Database>(...)`. Preserve the existing null-return-when-unset behavior. No client-side import of server env.

### Success Criteria:

#### Automated Verification:

- `npm run gen:types` produces a non-empty `src/lib/database.types.ts` containing a `books` type
- `npx astro sync` runs clean
- `npm run lint` passes (type-aware ESLint)
- `npm run build` passes

#### Manual Verification:

- A scratch `supabase.from("books").select()` (removed after) shows typed columns in the editor
- No server-only env leaks into client bundles

**Implementation Note**: After Phase 3's automated verification passes, pause for human confirmation before proceeding to Phase 4.

---

## Phase 4: Production Rollout (Human-Gated)

### Overview

Apply the migration to the production Supabase project and confirm RLS is active in production. This is the only phase that touches production and must be operator-run/approved.

### Changes Required:

#### 1. Apply migration to production

**File**: (no repo change) — operational step

**Intent**: Bring production schema to parity with local, keeping the environments identical from the foundation onward.

**Contract**: Link the project and push (`npx supabase link --project-ref <ref>` then `npx supabase db push`), or apply the migration SQL via the Studio SQL editor. Do not run unattended — this is the human approval gate per `infrastructure.md`. Seed data is **not** applied to production.

### Success Criteria:

#### Automated Verification:

- `npx supabase db push` reports the migration applied (or Studio confirms table creation)

#### Manual Verification:

- Production Supabase shows `books` with RLS enabled and the four policies present
- In Supabase Studio SQL Editor (or `psql` against prod), impersonate a fresh authenticated user via JWT claims (same `SET LOCAL` pattern as `rls.sql`) and confirm `SELECT` on `books` returns zero rows with no RLS error; optionally sign in as a new prod account and confirm zero rows in the Table Editor
- Rollback note acknowledged: reverting this migration in production is manual (a down-migration or Studio drop), separate from `wrangler rollback`

**Implementation Note**: This phase requires the operator to perform the gated production apply. Do not mark complete until the human confirms production RLS is verified. Per `lessons.md`, show remaining manual ops before considering the change done.

---

## Testing Strategy

### Automated (SQL / build):

- Migration applies cleanly on a fresh local DB (`supabase db reset`).
- `supabase/tests/rls.sql` proves cross-account denial + owner access (the FR-011 guardrail).
- CHECK constraints reject malformed rows (exercised within the migration/reset flow).
- `npm run lint` + `npm run build` pass with the typed client.

### Manual Testing Steps:

1. `npx supabase start` then `npx supabase db reset` — confirm no errors, seed loads.
2. Run `supabase/tests/rls.sql` — confirm zero assertion failures.
3. In Studio, confirm RLS is enabled on `books` and four policies exist.
4. Attempt an insert with empty `tropes` / blank title — confirm the DB rejects it.
5. (Prod) After Phase 4, confirm RLS enabled in production and a fresh account sees zero books.

## Performance Considerations

Negligible at MVP scale (~100 books/user, single-digit users). The GIN index on `tropes` future-proofs FR-012 filtering and S-05 any-match overlap; the btree on `user_id` supports RLS-filtered reads. Per `lessons.md`, tag-set intersection over ~100 books is well within the Workers per-request budget.

## Migration Notes

- This is the first migration in the repo; it creates `supabase/migrations/`.
- Production apply is human-gated and effectively forward-only for MVP — plan a manual down-migration/Studio drop if reversal is ever needed. `wrangler rollback` does not touch Supabase schema.
- Seed data is strictly local; production starts empty.

## References

- Roadmap slice: `context/foundation/roadmap.md` (F-01)
- PRD: FR-004, FR-006, FR-007, FR-008, FR-010, FR-011, FR-013; Access Control; NFR (isolation)
- Change identity: `context/changes/tbr-data-and-isolation/change.md`
- RLS-enforcement wiring: `src/lib/supabase.ts:5-24`
- Production ops / human-gate: `context/foundation/infrastructure.md` (Operational Story, Risk Register)
- Workers per-request budget: `context/foundation/lessons.md` ("No monolithic batch work on Cloudflare Workers")

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append  `— <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema Migration

#### Automated

- [x] 1.1 Migration file exists under `supabase/migrations/` — 67b9e44
- [x] 1.2 Local stack starts: `npx supabase start` — 67b9e44
- [x] 1.3 Migration applies cleanly: `npx supabase migration up` — 67b9e44
- [x] 1.4 `books` table + RLS + 4 policies present — 67b9e44

#### Manual

- [x] 1.5 Columns, types, defaults, constraints match the contract in Studio — 67b9e44
- [x] 1.6 Empty tropes array / blank title rejected by the DB — 67b9e44

### Phase 2: Seed + RLS Isolation Proof

#### Automated

- [x] 2.1 `supabase db reset` loads the seed without FK/constraint errors — 47630e2
- [x] 2.2 Isolation proof passes with zero assertion failures (`rls.sql`) — 47630e2
- [x] 2.3 Owner-visibility assertion (User A sees own rows) passes — 47630e2

#### Manual

- [x] 2.4 (Optional, Studio-only) Confirm seed users in auth.users and books rows show expected user_id owners — 47630e2
- [x] 2.5 Seed data visible in Studio under correct owners — 47630e2

### Phase 3: Typed Data Boundary

#### Automated

- [x] 3.1 `npm run gen:types` produces non-empty `database.types.ts` with a `books` type
- [x] 3.2 `npx astro sync` runs clean
- [x] 3.3 `npm run lint` passes
- [x] 3.4 `npm run build` passes

#### Manual

- [x] 3.5 Scratch typed `from("books")` shows typed columns
- [x] 3.6 No server-only env leaks into client bundles

### Phase 4: Production Rollout (Human-Gated)

#### Automated

- [ ] 4.1 `supabase db push` reports migration applied (or Studio confirms)

#### Manual

- [ ] 4.2 Production shows `books` with RLS enabled + four policies
- [ ] 4.3 Prod RLS check via Studio SQL (JWT impersonation) or fresh account — zero rows, no RLS error
- [ ] 4.4 Manual rollback path acknowledged