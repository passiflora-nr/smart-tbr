# Testing Harness and Data-Integrity Core — Plan Brief

> Full plan: `context/changes/testing-harness-and-data-integrity/plan.md`
> Research: `context/changes/testing-harness-and-data-integrity/research.md`

## What & Why

Add SmartTBR's first automated test gate: fast unit tests for validation and mood-selection rules, plus
real HTTP integration tests that prove raw book data survives add, edit, persistence, and read-back.
This protects the highest-risk data path before the app-wide theme rewrite changes every user-facing
surface.

## Starting Point

The repository has no JavaScript test runner or CI test step. Its pure logic is already easy to import,
its API routes are reachable through the real Astro/Workerd development server, and local Supabase has
seeded accounts—but `.env` points at hosted Supabase, making fail-closed target validation essential.

## Desired End State

`npm test` runs unit and local-Supabase integration projects and is required on every pull request
between lint and build. Tests lock behavior/data rather than markup, safely isolate user-D fixtures, and
cannot run against hosted Supabase. The PRD, shipped mood flow, and test oracle all describe the same
initial-three plus explicit-expansion behavior.

## Key Decisions Made

| Decision             | Choice                                                        | Why                                                                            | Source           |
| -------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------- |
| Recommendation cap   | Show up to 3 initially; reveal more in groups of 3 on request | Preserves shipped behavior while keeping the default decision space small      | Plan             |
| Result order         | Title, then id, as presentation stability                     | Keeps expansion deterministic without introducing relevance ranking            | Research / Plan  |
| Large `show` values  | Clamp to finite match total                                   | Matches shipped behavior and is safe at ~100 books                             | Research / Plan  |
| Integration boundary | Raw HTTP against Astro dev + local Supabase                   | Exercises real routing, cookies, server normalization, and persistence         | Research / Plan  |
| CI policy            | Unit and integration required on every PR                     | Matches the frozen Phase 1 quality gate for highest-risk persistence behavior  | Test plan / Plan |
| Phase scope          | Node unit + HTTP integration only                             | Covers Risks #1, #5, #6 without pulling browser or access-control work forward | Test plan / Plan |
| Fixture ownership    | Unique prefixed rows on user D, cleaned in `finally`          | Avoids the user-A count coupling and preserves unrelated local data            | Research         |
| Production safety    | Exact loopback URL/port checks before mutation                | `.env` currently targets hosted Supabase                                       | Research         |

## Scope

**In scope:**

- Vitest 4 named unit/integration projects and npm commands
- Unit tests for `bookSchema` and mood-selection behavior
- Loopback-only Supabase/Astro lifecycle and typed test context
- HTTP add/edit/read-back plus mood title/no-match checks
- Required CI test step
- PRD contract reconciliation and test-plan / AGENTS.md / README cookbook updates

**Out of scope:**

- React DOM/island tests and Playwright
- `rls.sql` automation
- Snapshots, CSS/DOM assertions, visual tests, and coverage thresholds
- Database/schema/seed changes
- Product fixes for omitted `description` on PUT

## Architecture / Approach

Vitest's unit project imports pure TypeScript through the existing `@/*` alias. The integration
project's global setup discovers local Supabase through the CLI, validates exact loopback coordinates,
starts Astro with explicit local env values, and provides connection details to one serialized HTTP
scenario. That scenario signs in, writes raw data through the app, verifies it independently through an
authenticated Supabase client, checks mood behavior by title/copy, and cleans its own row.

## Phases at a Glance

| Phase                                         | What it delivers                                                   | Key risk                                         |
| --------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------ |
| 1. Contract reconciliation and unit harness   | Consistent requirements, Vitest setup, book/mood regression locks  | Freezing the wrong FR-010 interpretation         |
| 2. Safe HTTP integration and required CI gate | Real persistence proof, production-safe orchestration, CI/cookbook | Accidental hosted target or leaked fixture state |

**Prerequisites:** Node 22; Docker available for local Supabase; existing seeded accounts and migrations.

**Estimated effort:** About 2–3 implementation sessions across 2 phases; CI image startup may require one
additional tuning pass.

## Open Risks & Assumptions

- GitHub's Ubuntu runner has enough Docker memory for the reduced local Supabase service set.
- The current Supabase CLI continues exposing local API/database coordinates and a publishable or anon
  key through machine-readable status output.
- Fixed local ports 54321/54322 remain the repository contract; changing them requires updating the
  fail-closed allowlist.
- PUT remains a full four-field replacement. A separate product change is needed if omitted
  `description` should preserve the stored value.
- If Astro returns 201 but the local row is missing, the suite deletes that id through the same
  Astro session before failing, so a split-brain write cannot remain on a hosted target.

## Success Criteria (Summary)

- Unit tests lock book normalization/boundaries and approved any-match progressive recommendation rules.
- HTTP tests prove a raw add/edit round-trip through real Astro and local Supabase with exact data
  preservation and guaranteed cleanup.
- CI requires the full suite, while the harness rejects non-loopback Supabase before any mutation.
