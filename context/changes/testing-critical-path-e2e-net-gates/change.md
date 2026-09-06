---
change_id: testing-critical-path-e2e-net-gates
title: Critical-path e2e net and CI gates
status: implemented
created: 2026-08-30
updated: 2026-09-06
archived_at: null
---

## Notes

Open a change folder for rollout Phase 4 of context/foundation/test-plan.md: "Critical-path e2e net + gates".
Risks covered: #2 (an interactive TBR control — search submit, trope filter, delete confirm, edit save, navigation — renders but does nothing or the wrong thing), #3 (the app-wide theme rewrite silently breaks behaviour on a page it restyles). Test types planned: e2e, gates.
Risk response intent: #2 — submitting a filter, search, delete, or edit action produces the changed set of books the user expects, driven by what the control really sends. #3 — every critical flow still passes after a page's markup has been rewritten wholesale.
After creating the folder, follow the downstream continuation rule.
