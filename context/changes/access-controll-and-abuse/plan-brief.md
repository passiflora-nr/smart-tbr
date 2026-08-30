# Access Control and Abuse Test Coverage — Plan Brief

> Full plan: `context/changes/access-controll-and-abuse/plan.md`
> Research: `context/changes/access-controll-and-abuse/research.md`

## What & Why

Add the missing automated safety net for two high-impact failures: one account changing another account's books,
and signed-out or cross-site requests crossing private boundaries. The defenses already exist; this change proves
their real HTTP behavior and documents how future tests must extend it safely.

## Starting Point

Book APIs already authenticate and filter by owner, Astro rejects cross-site form posts, and middleware gates three
private route prefixes. The existing Vitest integration setup can sign in real local users and verify temporary
user-D books independently, but none of these access boundaries is currently exercised end to end.

## Desired End State

Automated checks prove wrong-owner edit, delete, and Edit Book access fail without changing or revealing the victim
book. Hostile and missing-Origin permanent-delete forms are refused, signed-out APIs keep their JSON/form response
contracts, and all current private pages redirect to sign-in from one shared route list.

## Key Decisions Made

| Decision           | Choice                                          | Why                                                                      | Source   |
| ------------------ | ----------------------------------------------- | ------------------------------------------------------------------------ | -------- |
| Test layer         | Existing HTTP integration project               | Cookies, middleware, and Astro's origin check require a real request     | Research |
| Test accounts      | D owns temporary books; A is read-only attacker | Protects both accounts' seeded books while proving two-account isolation | Research |
| Wrong-owner result | Not found plus unchanged victim row             | Missing and foreign ids are deliberately indistinguishable               | Research |
| Origin coverage    | Hostile and absent Origin                       | Locks both known refusal paths                                           | Plan     |
| Delete surfaces    | Book and account forms                          | Both rely on the same global origin barrier                              | Plan     |
| Read isolation     | Include cross-account Edit Book page            | Covers the only page that loads one book by id                           | Plan     |
| Route source       | Extract shared protected prefixes               | Prevents middleware and tests from maintaining separate lists            | Research |
| Route depth        | Roots plus current Add/Edit Book URLs           | Directly covers nested pages that rely on the `/books` prefix            | Plan     |
| Human checks       | Safe sign-out walk and cookbook read            | Gives visible confidence without asking the tester to craft attacks      | Plan     |

## Scope

**In scope:**

- Shared pure module for protected route prefixes.
- Optional-Origin support in the existing form helper.
- One two-account access-control integration suite.
- Wrong-owner PUT, form delete, and Edit Book page checks.
- Hostile and missing-Origin checks for book and account deletion.
- Signed-out JSON/form response checks and protected/public page sweep.
- Test-plan cookbook sections 6.4, 6.5, and 6.7.

**Out of scope:**

- Product security behavior changes, ownership refactors, or database migrations.
- Vendor RLS automation, service-role testing, Playwright, or new dependencies.
- Cross-origin JSON, nonexistent-route semantics, visual markup, and seed-account mutation.

## Architecture / Approach

Middleware and tests import one pure protected-route array. The new suite signs in user D and user A through the
existing local HTTP flow, creates only reserved user-D fixtures, sends blocked requests with A or hostile origins,
and verifies the response plus the persisted row through D's independent Supabase client.

## Phases at a Glance

| Phase                             | What it delivers                                            | Key risk                                                      |
| --------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------- |
| 1. Access-control integration net | Shared routes, helper extension, and full HTTP safety suite | A false-positive status check could miss a deleted victim row |
| 2. Phase 3 cookbook               | Reusable ownership, origin, and route-gating recipes        | Documentation could flatten JSON and form behavior            |

**Prerequisites:** Docker, local Supabase seed users A and D, and the existing Phase 1–2 integration harness.

**Estimated effort:** About two implementation sessions across two phases.

## Open Risks & Assumptions

- HTTP checks cannot prove the application owner filter independently while database RLS is also active; this plan
  deliberately tests the user-visible contract instead of the database vendor.
- The account-origin test is safe only while integration keeps the service-role key empty, as it does today.
- New top-level private pages still require an explicit addition to the shared route array; the suite proves listed
  routes, not developer intent for an unlisted new page.

## Success Criteria (Summary)

- Another signed-in account cannot change, delete, or view the temporary victim book, and the row remains intact.
- Cross-site and origin-less permanent-delete forms return 403 without deleting a book or account.
- Signed-out private pages and APIs return the intended redirect or JSON behavior from one non-duplicated route
  contract.
