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
