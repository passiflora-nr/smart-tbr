# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Pre-request network permissions for multi-subagent web research

- **Context**: Agent permissions — multi-subagent flows that fan out web research across multiple domains.
- **Problem**: The agent doesn't pre-request permissions before running a multi-subagent web-research flow. Some of the websites were not on the sandbox's network allowlist, and even though the user was waiting for the subagents to finish research, it turned out research was not ongoing for all the subagents — they were silently blocked on a permission prompt the user hadn't seen yet.
- **Rule**: Request the permissions up front when running a multi-subagent web-research flow — surface a single batched approval before fan-out instead of letting individual subagents stall on per-domain prompts mid-run.
- **Applies to**: research
