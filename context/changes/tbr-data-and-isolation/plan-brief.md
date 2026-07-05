# TBR Data Layer (books + trope tags) with Per-User RLS Isolation — Plan Brief

> Full plan: `context/changes/tbr-data-and-isolation/plan.md`

## What & Why

Create the foundational `books` table in Supabase Postgres — title, author, free-text trope tags, optional description, and an owner reference — protected by Row-Level Security so a book is reachable only by the account that owns it. This is roadmap slice **F-01**, the prerequisite for adding books (S-01), browsing (S-02), mood-trope recommendation (S-05), and account lifecycle (S-06). The load-bearing goal is **FR-011**: a user can never see another user's TBR.

## Starting Point

Auth is already live (Supabase email+password, gated `/dashboard`) and the app's Supabase client already runs queries as the authenticated user via cookie-scoped `@supabase/ssr` — so `auth.uid()`-based RLS will actually be enforced. But there is **no data layer at all**: no `supabase/migrations/`, no `books` table, no policies. This is the first migration in the repo.

## Desired End State

A `books` table exists in both local and production Supabase, with CHECK constraints guaranteeing well-formed rows, RLS enabled, and four owner-only policies. Cross-account isolation is proven by a checked-in, re-runnable SQL script. Downstream slices start type-safe via generated TypeScript types, and a local seed provides database/RLS fixtures for inspection. Production starts empty.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Trope storage | `text[]` array column + GIN index | Matches PRD's per-user free-text/no-normalization rule; any-match is a one-line overlap query with zero joins | Plan |
| Owner reference | `user_id` FK → `auth.users(id)` `ON DELETE CASCADE`, NOT NULL | Guarantees FR-013 cascade delete at the DB layer as defense-in-depth alongside RLS | Plan |
| DB invariants | CHECK constraints on title/author/tropes, including `cardinality(tropes) >= 1` | Foundation rejects malformed rows regardless of client bugs (FR-004 "required"); `cardinality` avoids PostgreSQL's empty-array/NULL CHECK trap | Plan |
| RLS verification | Committed `supabase/tests/rls.sql` run on local stack | Re-runnable, reviewable proof of the critical guardrail without a test framework; transaction-wrapped impersonation first asserts `auth.uid()` | Plan |
| TypeScript types | Generate + commit `database.types.ts`, add `gen:types` script | Single source of truth from schema; downstream slices inherit a typed `books` table | Plan |
| Local seed | Small realistic seed (2 users, ~5-10 tagged books each) | Backs the RLS proof and makes S-02/S-05 data inspectable at the database level (local only; not loginable demo accounts) | Plan |
| Production apply | Apply now, as a human-gated step | Keeps local/prod parity from day one; empty table is zero-risk to apply early | Plan |
| Schema shape | uuid PK + created_at/updated_at (`moddatetime` trigger) + GIN + btree | Unguessable IDs for a privacy product; edit tracking + fast filter/recommend ready; migration enables the extension explicitly | Plan |
| Table grants | `GRANT SELECT, INSERT, UPDATE, DELETE ON public.books TO authenticated` | RLS alone is not enough — PostgREST/supabase-js needs table privileges or queries return 42501 even when policies are correct | Plan |

## Scope

**In scope:** `books` schema (columns, constraints, indexes, `updated_at` trigger); RLS enablement + 4 owner-only policies + `authenticated` table grants; local seed; committed RLS isolation proof; generated TS types + typed client; human-gated production apply.

**Out of scope:** any API routes/UI/forms; trope normalization; the account-deletion handler (S-06, only the FK is set here); a tags table or JSONB; a test framework/pgTAP/CI DB tests; `PROTECTED_ROUTES` changes.

## Architecture / Approach

One Supabase migration creates the table, constraints, indexes, `moddatetime` extension/trigger, grants table privileges to `authenticated`, and — atomically — enables RLS with four `auth.uid() = user_id` policies (select/insert/update/delete). Phase 1 verifies the migration with `npx supabase migration up`; Phase 2 uses `db reset` after `supabase/seed.sql` exists. The app already talks to Postgres as the authenticated user, so those policies enforce isolation on every future query. Isolation is proven locally with seed data plus transaction-wrapped `rls.sql` impersonation via JWT claims before production is touched.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema migration | `books` table + constraints + indexes + explicit `moddatetime` setup + trigger + RLS + 4 policies + `authenticated` grants | Enabling RLS without policies would deny all access — must land together |
| 2. Seed + RLS proof | Local seed + `rls.sql` proving cross-account denial | Seeding `auth.users` needs specific columns + correct FK ordering; proof must assert `auth.uid()` after setting claims |
| 3. Typed boundary | Generated `database.types.ts` + `gen:types` script + typed client | `gen:types` needs the local stack (Docker) running |
| 4. Production rollout | Migration applied to prod, RLS verified | Human-gated; prod migration reversal is manual (not `wrangler rollback`) |

**Prerequisites:** Docker + local Supabase stack (`supabase start`); Supabase project link + DB credentials for the Phase 4 prod apply (operator).
**Estimated effort:** ~1-2 focused sessions across 4 phases; the DB work is small, the care is in the isolation proof and the gated prod apply.

## Open Risks & Assumptions

- Seeding `auth.users` locally can be finicky (required identity columns); the seed uses fixed UUIDs so the RLS proof is deterministic.
- The isolation proof runs locally only (no CI DB runner); it must be re-run manually whenever policies change — accepted for now, with automation deferred to a planned future testing phase (wired into CI between `lint` and `build`, per `AGENTS.md`).
- Production apply is irreversible-ish for MVP — reversal is a manual down-migration/Studio drop, separate from Worker rollback.
- Assumes the app continues to use the cookie-scoped anon client (never a service-role key) for TBR data, or RLS would be bypassed.

## Success Criteria (Summary)

- A user's books are reachable only by that user — proven by `rls.sql` (cross-account SELECT/UPDATE/DELETE denied, owner access works).
- The `books` table exists with RLS enabled + four policies in both local and production.
- The repo builds and lints clean with a typed `books` boundary ready for S-01.
