# Critical-Path E2E Net and CI Gates — Plan Brief

> Full plan: `context/changes/testing-critical-path-e2e-net-gates/plan.md`
> Research: `context/changes/testing-critical-path-e2e-net-gates/research.md`

## What & Why

A thin browser net over Sign in → Add a book → Your TBR → Pick by mood, plus a short Save changes case, on Chromium, Firefox, and WebKit. Filter, search, and delete already have cheaper HTTP tests; what is still unproven is the JavaScript buttons and the hop from Add a book to the list. This net must land before the Café Romance restyle, which will rewrite every page’s markup.

## Starting Point

Playwright is installed but not runnable (missing server, three browsers, start command, and CI). The seed spec uses fragile checks the restyle will break. Integration already starts the local app on `127.0.0.1:14567`; Playwright can reuse that starter.

## Desired End State

A signed-in user can add a book, see its title on Your TBR, pick it by mood, and save an edit — proven by real button clicks in three browsers. A pull request that breaks that path cannot merge. Leftover `[e2e]` books cannot break the HTTP suite.

## Key Decisions Made

| Decision       | Choice                                                                                                | Why (1 sentence)                                                                            | Source   |
| -------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------- |
| Journey hops   | Thin path + Save changes as a second case                                                             | Sign in / Add / Save are the remaining JavaScript buttons; filter/delete are already proven | Plan     |
| Sign-in proof  | One setup test clicks Sign in; later tests start logged in via saved session, each in a fresh context | Proves the button once without retyping the password every hop                              | Plan     |
| Leftover books | API/form cleanup with `[e2e]` titles; HTTP hygiene accepts `[e2e]` too                                | A crashed run must not fail the next `npm test`                                             | Plan     |
| CI             | Same `ci` job, after current tests, before build                                                      | Deploy already waits on one job                                                             | Plan     |
| Noisy WebKit   | Keep all three; skip only Linux-CI WebKit if it goes noisy                                            | PRD wants four desktop browsers; WebKit-on-Linux is the flaky one                           | Plan     |
| Docs           | Cookbook §6.3, §4 e2e row, infrastructure CI lines, command tables                                    | Those lines are already stale                                                               | Plan     |
| Server         | Reuse `startLocalServices`, not Playwright `webServer`                                                | Same loopback guards as HTTP tests; port 14567 is exclusive                                 | Research |
| List oracle    | Title text, not `Edit ${title}` or counts                                                             | S-07 will rebuild the list chrome                                                           | Research |

## Scope

**In scope:** Playwright harness, Sign in click, add → TBR → mood journey, Save changes case, `[e2e]` hygiene, `test:e2e`, CI step, cookbook and stale docs.

**Out of scope:** Filter matrices, delete-as-proof, ownership, signup, mood no-match, snapshots, production Workers, a second CI job, e2e inside `npm test`.

## Architecture / Approach

Playwright `globalSetup` starts the same local app the HTTP tests use. A setup project clicks **Sign in** as user D and writes `playwright/.auth/user.json`. Chromium, Firefox, and WebKit load that session. Specs create/delete books through the app’s own API using those cookies. The GitHub `ci` job installs browsers and runs `npm run test:e2e` after `npm test`.

## Phases at a Glance

| Phase                              | What it delivers                                       | Key risk                                                          |
| ---------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------- |
| 1. Make Playwright actually run    | Three-engine harness + Sign in click + `[e2e]` hygiene | Setup/teardown cannot serialize the Astro process — persist a pid |
| 2. Thin journey + Save changes     | Add → TBR → mood, and Save changes, with title oracles | Mood picker hides checkboxes until Tropes is opened               |
| 3. CI gate + cookbook + stale docs | Required PR step + written recipe                      | WebKit-on-Linux noise (quarantine hook, not a day-one skip)       |

**Prerequisites:** Docker and local Supabase (same as `npm test`); `npx playwright install` once per machine.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- Playwright may not resolve the `@/` import alias — e2e files must not import `test-books.ts`.
- One Chromium sign-in session is reused by Firefox and WebKit (official Playwright pattern).
- “Full suite before S-07” stays a local-once run, not a GitHub job.

## Success Criteria (Summary)

- You can watch Sign in happen once, then see a new book’s title on Your TBR and in mood results, in three browsers.
- Save changes replaces the old title with the new one on Your TBR.
- A pull request that breaks that path fails the existing `ci` job.
