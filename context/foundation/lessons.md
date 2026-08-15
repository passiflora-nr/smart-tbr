# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Pre-request network permissions for multi-subagent web research

- **Context**: Agent permissions — multi-subagent flows that fan out web research across multiple domains.
- **Problem**: The agent doesn't pre-request permissions before running a multi-subagent web-research flow. Some of the websites were not on the sandbox's network allowlist, and even though the user was waiting for the subagents to finish research, it turned out research was not ongoing for all the subagents — they were silently blocked on a permission prompt the user hadn't seen yet.
- **Rule**: Request the permissions up front when running a multi-subagent web-research flow — surface a single batched approval before fan-out instead of letting individual subagents stall on per-domain prompts mid-run.
- **Applies to**: research

## No monolithic batch work on Cloudflare Workers

- **Context**: Features under `src/pages/api/**`, background processing, or any v2 scope expansion on Cloudflare Workers.
- **Problem**: Workers enforce a per-request CPU ceiling (~30s). A single HTTP handler that bulk-imports books, fans out hundreds of external API calls, or does heavy in-process work will time out — the pre-mortem in `@context/foundation/infrastructure.md` lost ~6 evenings on this pattern.
- **Rule**: MVP tag-matching over ~100 books per user is fine in one request. Do not design bulk import, CSV parsing, or fan-out as one synchronous API call — chunk work, or plan Cloudflare Queues / Durable Objects for v2.
- **Applies to**: plan, plan-review, implement, impl-review

## Pre-request network for gh GitHub API calls

- **Context**: GitHub CLI
- **Problem**: False "invalid token" from sandboxed `gh auth status` because sandbox network restrictions block token validation against GitHub's API.
- **Rule**: Request network permissions up front for `gh` commands that talk to GitHub (auth checks, PRs, issues, repo queries).
- **Applies to**: all

## Ask before marking steps blocked

- **Context**: Agent behavior during `/10x-implement` and similar execution workflows — any phase where a checklist step depends on user-provided credentials, config, or a dashboard action.
- **Problem**: The agent proceeds through the plan, marks steps as "blocked" in the doc, and moves on without stopping to ask the user — even when the user already said prerequisites are done and the missing input is something only they can supply.
- **Rule**: If a step needs user input (secrets, credentials, dashboard config, approval), stop and ask immediately — do not mark it blocked and continue. Treat "Phase 0 done" or "credentials ready" as a signal to request them, not to skip the step.
- **Applies to**: implement

## Show remaining manual ops before archiving plans

- **Context**: Deployment/rollout plans (`context/deployment/*.md`, deploy checklists) when marking a plan `status: done` or moving it to `context/archive/`.
- **Problem**: Archiving or closing a plan before the user sees the remaining manual ops hides dashboard/hygiene tasks they still need to do — the agent marked rollout complete and moved deploy-plan to archive in the same commit without the user reviewing what was left.
- **Rule**: Before archiving a plan or setting `status: done`, show the user a "Remaining manual ops" summary and get acknowledgment. Only archive after they have seen it.
- **Applies to**: plan, plan-review, implement, impl-review

## Rerun affected tests after changing test files or their dependencies

- **Context**: Any implementation/review work that edits test files or the code, fixtures, or config those tests depend on.
- **Problem**: A change to a test file or a file the test depends on can silently break the test; without rerunning, the breakage ships undetected.
- **Rule**: When changing any test file or any file the tests depend on, rerun the affected tests to confirm they still pass before considering the change done.
- **Applies to**: implement, impl-review

## Prefer native HTML over React islands on per-row list surfaces

- **Context**: Any slice touching `src/pages/books/index.astro` or `src/components/books/BookList.astro` — the un-paginated TBR list, which renders one element per book the user owns (verified at 145 rows). Most immediately S-04 (`search-filter-tbr`).
- **Problem**: The browse list is deliberately server-rendered with zero client-side JavaScript; its interactivity uses native HTML — `<details>` for the description disclosure and the delete confirm, anchors for navigation, form post + redirect for the delete itself. Adding a React island to that page costs hydration setup proportional to row count, and it degrades silently: lint, build, and CI all stay green, and the page looks and behaves identically to anyone testing with JavaScript enabled.
- **Rule**: Before adding a React island to a page that renders one element per user-owned row, try the native HTML equivalent first — `<details>` for disclosure, anchors for navigation, form post + redirect for mutation, URL query params for filtering and sorting. If an island is genuinely required (as it is for the trope chip input), state that in the plan and record the trade-off; never let a list page become JavaScript-dependent by default. Verify by loading the page with JavaScript disabled.
- **Applies to**: plan, plan-review, implement, impl-review

## Manual verification for a tester audience

- **Context**: Plans, PR test plans, and `/10x-implement` manual gates — any time an agent asks the project owner to verify behavior in the browser.
- **Problem**: Manual tests were written as one-line summaries ("search narrows the list") and explained like developer notes (file paths, component names). The owner is a tester, not a developer, and could not run checks without guessing the steps.
- **Rule**: Write manual verification as numbered steps (setup → actions → expected result → pass criteria) in plain language. Progress checklist titles in `plan.md` may stay short; the phase's `#### Manual Verification:` block and any message to the human must contain the full steps. See `@context/foundation/manual-testing.md`.
- **Applies to**: plan, plan-review, implement, impl-review, all agent chat when proposing manual tests
