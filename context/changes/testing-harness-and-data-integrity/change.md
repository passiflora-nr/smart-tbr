---
change_id: testing-harness-and-data-integrity
title: Harness + data-integrity core
status: implementing
created: 2026-08-23
updated: 2026-08-29
archived_at: null
---

## Notes

Test-plan §3 Phase 1 (`@context/foundation/test-plan.md`).

**Goal:** Stand up the test runner, then prove a book survives add/edit intact and that trope matching obeys FR-010.

**Risks covered:** #1 (silent data loss on add/edit), #5 (mood-trope picker overlap/cap/empty state), #6 (client/server validation drift).

**Test types:** setup, unit, integration.

**Stack hints from the guide:** Vitest with `environment: "node"` for Astro 6; local Supabase + seed accounts as the honest data boundary (how tests reach it is an open decision for research); no HTTP-mocking library proposed.

**Gates unlocked after this phase:** unit (trope-matching + validation contract), integration on book data (request → persisted state → read back).

**Constraint:** Assert on behaviour and data only — never CSS classes, DOM structure, element counts, or snapshots (S-07 theme rewrite).
