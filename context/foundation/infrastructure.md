---
project: SmartTBR
researched_at: 2026-05-26
recommended_platform: Cloudflare Workers (with Static Assets)
runner_up: Render
context_type: mvp
deployed_at: 2026-06-11
production_url: https://smart-tbr.nicole-rozanska93.workers.dev
tech_stack:
  language: TypeScript
  framework: Astro v6 + React 19 islands
  runtime: Cloudflare Workers (workerd) via @astrojs/cloudflare adapter
---

## Recommendation

**Deploy on Cloudflare Workers (with Static Assets).**

The project is already scaffolded with `@astrojs/cloudflare` v13 and `wrangler.jsonc`, the Workers Free plan covers the MVP's expected traffic (10k–100k req/month) by ~10×, and Cloudflare's MCP suite + `llms.txt`/`llms-full.txt` give the agent first-class operational and documentation access. With external Supabase as the data layer, Q5's "co-location preferred" doesn't apply — and Hyperdrive sits in reserve if/when raw Postgres access from edge becomes useful. The cost-sensitive answer (Q2) is decisive: Cloudflare Workers is the only shortlisted option that is genuinely free at MVP scale.

**Production is live** at `https://smart-tbr.nicole-rozanska93.workers.dev` (first manual deploy + CI auto-deploy on merge to `main`, 2026-06-11). Rollout details and post-deploy checklist: [`context/archive/deploy-plan.md`](../archive/deploy-plan.md).

## Platform Comparison

Scoring lens: the five agent-friendly criteria (`references/agent-friendly-criteria.md`). Each scored Pass / Partial / Fail. Cost adjustment applied after raw scoring to reflect the user's "minimize cost" answer (Q2).

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Sum | Cost adj. | **Net** |
|---|---|---|---|---|---|---|---|---|
| **Cloudflare Workers** | Pass | Pass | Pass (`llms.txt` + `llms-full.txt` + per-product) | Pass | Pass (GA Code Mode + 13+ domain MCP servers) | 5.0 | +1.0 | **6.0** |
| **Render** | Pass | Pass | Partial (no `llms.txt`; `.md` URL suffix works) | Pass | Pass (hosted MCP at `mcp.render.com/mcp`, GA) | 4.7 | +0.5 | **5.2** |
| **Railway** | Pass | Partial (DBs unmanaged) | Pass (`llms.txt` + `llms-full.txt`, ~978 KB) | Pass | Pass (local + remote MCP, GA) | 4.5 | −0.3 | **4.2** |
| **Netlify** | Partial (no CLI rollback — must publish from dashboard) | Pass | Pass (`docs.netlify.com/llms.txt`) | Pass | Pass (`@netlify/mcp` GA) | 4.3 | −0.3 | **4.0** |
| **Vercel** | Pass | Pass | Pass (MDX on GitHub) | Pass | Partial (Vercel MCP **public beta**, OAuth-loop issues on Cursor) | 4.5 | −1.0 | **3.5** |
| **Fly.io** | Pass | Partial (you ship a Dockerfile) | Partial (no `llms.txt`, docs not on GitHub as MD) | Pass | Partial (`fly mcp launch/proxy/wrap` **experimental** in flyctl) | 3.3 | −0.3 | **3.0** |

Cost-adjustment notes: Cloudflare Workers Free covers 100k req/day per script — the MVP's 10k–100k req/**month** sits comfortably inside free. Render Free is generous (Static Site fully free; Web Service free with ~1-min cold start). Railway minimum is $5/mo (Hobby). Netlify Free is $0 but **hard-capped at 300 credits/month** (site pauses on overrun) so it's penalized lightly. Vercel Hobby explicitly **forbids commercial use** in ToS, so $20/seat/mo Pro is the effective floor — heavy penalty. Fly.io removed broad free allowances in Oct 2024; minimum realistic shape is ~$3–5/mo.

### Shortlisted Platforms

#### 1. Cloudflare Workers + Static Assets (Recommended)

Already scaffolded in the repo (`@astrojs/cloudflare` v13 GA, `wrangler.jsonc` configured for Workers + Static Assets binding). `wrangler deploy`, `wrangler rollback [VERSION_ID]`, `wrangler tail` cover the full ops loop. Free tier (100k req/day per script, 10ms CPU) covers MVP traffic by a wide margin. Cloudflare publishes an agent-readable `llms.txt`, `llms-full.txt`, and per-product subsets — the agent can load docs directly. MCP is GA via Code Mode (`mcp.cloudflare.com/mcp`, ~2500 endpoints) plus domain-specific servers for docs, bindings, observability, AI Gateway. Hyperdrive (GA) provides Postgres connection pooling for Supabase from the edge when needed. The only real cost is that the execution model (30s CPU per request, no long-running processes) constrains *future* features beyond the MVP — fine for v1's tag-set intersection.

#### 2. Render

Cleanest non-Cloudflare alternative. `output: 'static'` builds map to free Render Static Sites (CDN-backed, no sleep); SSR maps to a Render Web Service with `@astrojs/node` standalone — free tier sleeps after 15 min idle (~1 min cold start) or paid Starter at $7/mo. Render CLI v2.18.0 (GA, May 2026) covers deploy/logs/rollback; deploy hooks + REST API back it. Official hosted MCP at `mcp.render.com/mcp` (GA). Docs available as `.md` via URL suffix (`docs/deploy-astro.md`) but no `llms.txt`. The deal-breaker vs. Cloudflare: requires adapter swap (`@astrojs/cloudflare` → `@astrojs/node`), reconfigured secrets (`.dev.vars` → Render env vars in `render.yaml` or dashboard), and rewritten CI deploy step. Non-trivial on a 4-week budget when the existing scaffolding works.

#### 3. Railway

Best documentation story of the three (`llms.txt` + `llms-full.txt` at 978 KB + any-page `.md` suffix + repo on GitHub). Mature MCP: both local stdio (`@railway/mcp-server`) and remote (`https://mcp.railway.com`) are GA, with destructive ops intentionally excluded. CLI v4 with `railway up`, `railway rollback`, `railway logs -f`. The penalty: $5/mo Hobby minimum (no free tier since Aug 2023), and Railway's "managed" databases are actually unmanaged Docker containers — you own backups/PITR/pooling/monitoring. The DB point is moot since Supabase is external; the $5/mo floor is the real penalty against Cloudflare's free.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. ~~**Stale `tech-stack.md` is a self-inflicted footgun.**~~ **Mitigated (2026-05-27).** `tech-stack.md` frontmatter and prose now say `cloudflare-workers`; `AGENTS.md` has a Hard Rule against Pages deploy. Cloudflare consolidated onto **Workers + Static Assets** for new projects, and **Astro 6 SSR is broken on Pages** (the `ASSETS` binding name is reserved on Pages) — the repo's `wrangler.jsonc` was always on the correct path.
2. ~~**`run_worker_first` gotcha for API auth routes.**~~ **Mitigated (2026-05-27).** `wrangler.jsonc` sets `assets.run_worker_first: ["/api/*"]`; `AGENTS.md` Hard Rule documents the requirement for new API routes.
3. **30s CPU + 50ms middleware budget on Workers.** Adequate for SmartTBR's tag-set intersection (which is O(N) over ≤100s books), but a hard wall for any future "bulk import" or fan-out feature. Re-architecting onto Durable Objects or Queues for v2 is non-trivial.
4. **`workerd` ≠ Node.** `nodejs_compat` covers most of Astro's needs, but npm dependencies using Node-only APIs (older pg drivers, fs-based config) fail at runtime rather than build time — harder to debug than on a Node container.
5. **Astro 6 + adapter v13 is recent** (Astro 6 shipped Mar 10, 2026). Both GA, but the combination is leading-edge; bug fixes are mostly upstream waits.

### Pre-Mortem — How This Could Fail

Six months in, SmartTBR's beta cohort grew to 5 readers and the author wanted to add "bulk import from CSV" (contradicting the original Non-Goal, but readers asked). The implementation needed to parse a CSV, fan out 200 lookups to an external metadata API, and persist results. On Workers Free, the 30s CPU ceiling killed every import past ~50 books. The author tried Durable Objects, but stumbled on a `nodejs_compat` mismatch with their CSV library. Meanwhile, `tech-stack.md` still said `cloudflare-pages` — and when the author tried to test a quick fix on a friend's machine, they followed the stale doc, deployed to Pages, SSR silently broke, and they spent two evenings hunting why Supabase Auth didn't work. The MVP itself shipped fine on Workers and ran for months; what failed was the *next step beyond MVP* being blocked by Workers' execution model plus stale documentation misleading future-self. Total real cost: ~6 evenings of demoralizing debugging on an after-hours project.

### Unknown Unknowns

- **Hyperdrive caching can return stale data for a few seconds** unless you opt out per-query (`cache: 'no-store'`). For Auth and TBR reads it's fine; for "did my book actually save?" UX, know to disable it.
- **Free-tier 10ms CPU limit is per-request, not wall-clock** — bcrypt-style work or pure-JS image processing can blow past it. Supabase handles password hashing server-side, so Auth is unaffected; user-land CPU-heavy code needs care.
- **`wrangler dev` and production diverge subtly** — Cron Triggers, scheduled Workers, and some binding edge-cases behave slightly differently locally vs deployed. The repo's current dev story is good but not 100% parity.
- **Workers billing is opaque per-script** until you cross the free threshold — set a usage alert to avoid surprise first paid bills.
- **The `astro:env/server` + `nodejs_compat` interaction is the right pattern but not heavily documented.** If you ever add a dependency that pulls in a Node built-in (`crypto`, `buffer`), verify the polyfill exists in workerd's compat list before debugging at runtime.

## Operational Story

How Cloudflare Workers actually operates day to day for this project. Production Worker: **`smart-tbr`** · account `10e6c5de7ae20000c186703ad894eab2` · URL above.

- **Production deploys**: Push to `main` → GitHub Actions `ci` job (lint + build) → `deploy` job (`cloudflare/wrangler-action@v3`, post-deploy curl smoke checks). Manual redeploy: Actions → **CI** → **Run workflow** (`workflow_dispatch`). Local emergency deploy: `npm run build && npx wrangler deploy` (prefer CI for routine changes).
- **Preview deploys**: `wrangler versions upload` (or push to a non-`main` branch with GitHub Actions invoking `wrangler versions upload`) creates a versioned preview at `<version-id>-<worker-name>.<account>.workers.dev`. No Cloudflare Access needed for solo MVP; add Access in front of preview URLs once the beta cohort exists if they shouldn't see in-progress builds. Preview URLs are not generated for fork PRs unless you wire `pull_request_target` carefully. **Not wired yet** — parked in deploy plan.
- **Secrets**: `SUPABASE_URL` and `SUPABASE_KEY` are declared `context: "server"`, `access: "secret"` in `astro.config.mjs`. Locally they live in `.dev.vars` (read by workerd in `npm run dev`). In production they're set on the Worker via `wrangler secret put` and refreshed by CI's `wrangler-action` `secrets:` input. GitHub repo secrets: `SUPABASE_URL`, `SUPABASE_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. Rotation: regenerate in Supabase, update GitHub secrets, then re-run deploy (or `wrangler secret put` locally).
- **Supabase Auth URLs**: Hosted project Site URL and redirect URLs must include the production workers.dev hostname (`https://smart-tbr.nicole-rozanska93.workers.dev/**`) plus `http://localhost:4321/**` for local dev. Configured 2026-06-11; re-apply after any custom-domain change.
- **Rollback**: `npx wrangler deployments list` to find a known-good version ID, then `npx wrangler rollback [VERSION_ID]`. Rehearsed 2026-06-11 (~10–30 s). Caveat: rollback does not undo data migrations on Supabase — schema changes need separate, manual reversal in Supabase Studio.
- **Approval**: An agent can do `wrangler deploy` (production), `wrangler versions upload` (preview), `wrangler tail` (logs), and `wrangler rollback` unattended. Human approval gates: rotating Supabase keys (because Supabase Auth sessions break for active users), running schema migrations against Supabase production, and dropping the Worker entirely. Optional: GitHub Environment with required reviewers on the `deploy` job.
- **Logs**: `npx wrangler tail --format pretty` from the terminal (`observability.enabled: true` in `wrangler.jsonc`). Optionally, the Cloudflare MCP observability server — **skipped** for this project; `wrangler tail` and the dashboard (24h retention) are sufficient for MVP.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| ~~`tech-stack.md` says `cloudflare-pages`~~ — stale deploy target misleads future agent/self into Pages, where Astro 6 SSR is broken | Devil's advocate | ~~High~~ Low (mitigated) | Medium (silent SSR failures, 1–2 evenings lost) | **Done (2026-05-27):** `tech-stack.md` frontmatter + prose updated to `cloudflare-workers`; `AGENTS.md` Hard Rule added. |
| ~~API auth routes return 1003/403 because Static Assets router shadows them~~ | Devil's advocate / Research | ~~Medium~~ Low (mitigated) | High (auth flow blocked) | **Done (2026-05-27):** `run_worker_first: ["/api/*"]` in `wrangler.jsonc`; `AGENTS.md` Hard Rule. **Done (2026-06-11):** deploy CI curl smoke check for `/api/auth/signin` (`cf-ray` + status assertion). |
| 30s CPU ceiling blocks future fan-out / bulk-import features | Devil's advocate / Pre-mortem | Medium (only if scope creeps beyond MVP) | Medium | **Documented:** `idea-notes.md`, `lessons.md`, `AGENTS.md` pointer. MVP tag-set intersection is fine; v2 bulk work needs Queues/DO/chunking. |
| `workerd` ≠ Node — runtime failure on Node-only npm deps | Devil's advocate | Low–Medium | Medium | **Documented:** `AGENTS.md` Hard Rule — audit deps before adding; prefer edge-safe clients (`@supabase/supabase-js`). |
| Hyperdrive returns slightly stale data on rapid reads after writes | Unknown unknowns | Low (Supabase Auth + REST path doesn't use Hyperdrive) | Low–Medium (only matters if/when you reach for raw Postgres) | If you adopt Hyperdrive later, pass `cache: 'no-store'` on queries where freshness matters; document the trade-off when introducing it. |
| Surprise Workers paid bill if traffic spikes past free tier unnoticed | Unknown unknowns | Low (MVP traffic is small) | Low ($5–$20 unexpected) | Set a Workers usage alert in the Cloudflare dashboard (Settings → Usage Notifications) at 80k req/day (80% of free tier). **Open** — see deploy plan post-rollout checklist. |
| `wrangler dev` vs production parity gaps in cron / scheduled workers | Unknown unknowns | Low (MVP has no cron) | Low | Not relevant to MVP. Re-evaluate if a cron feature is added. |
| Astro 6 + adapter v13 leading-edge bugs | Devil's advocate | Low–Medium | Low–Medium | Pin versions in `package.json`; subscribe to `withastro/astro` and `cloudflare/workers-sdk` GitHub releases. Don't auto-bump major versions during the 4-week MVP build. |
| Free Cloudflare account suspension for ToS edge cases (paid lookups, etc.) | Devil's advocate / general platform risk | Low | High (could lose deployment access) | Keep deployment-relevant config in version control. Have a billing card on file once the MVP is live to remove friction if you hit limits. |

## Getting Started

The repo is already scaffolded for Cloudflare Workers via the 10x Astro Starter. Rollout completed 2026-06-11; archived step-by-step log: [`context/archive/deploy-plan.md`](../archive/deploy-plan.md).

1. ~~**Fix the stale doc.**~~ **Done (2026-05-27).** `tech-stack.md` and `AGENTS.md` now consistently target Cloudflare Workers (not Pages).
2. ~~**Audit `wrangler.jsonc` for the API-shadowing gotcha.**~~ **Done (2026-05-27).** `run_worker_first: ["/api/*"]` is set; deploy CI smoke check added 2026-06-11.
3. ~~**Verify local dev parity.**~~ **Done (2026-06-11).** `npm run dev` on workerd; `.dev.vars` / `.env` gitignored; hosted Supabase credentials synced.
4. ~~**Set production secrets in Cloudflare.**~~ **Done (2026-06-11).** Worker secrets via `wrangler secret put`; GitHub Actions secrets for CI deploy.
5. ~~**First production deploy.**~~ **Done (2026-06-11).** Live at `https://smart-tbr.nicole-rozanska93.workers.dev`; Supabase Auth Site URL + redirect URLs configured; API signup/signin smoke-tested.
6. **Set a usage alert.** Cloudflare dashboard → Workers & Pages → **smart-tbr** → Settings → Usage Notifications → alert at ~80k req/day. **Remaining manual op.**
7. ~~**(Optional) Install the Cloudflare MCP servers in Cursor.**~~ **Skipped** — user opted out; use `wrangler tail` and the dashboard.

### Remaining manual ops

Optional dashboard/hygiene tasks (not blockers). Full table: [`deploy-plan.md` → Remaining manual ops](../archive/deploy-plan.md#remaining-manual-ops-post-rollout).

- Browser sign-up → confirm → sign-in → `/dashboard` (one-time production smoke test)
- `npx wrangler tail --format pretty` while clicking around
- Cloudflare usage alert at 80k req/day
- Bookmark [Worker dashboard](https://dash.cloudflare.com/10e6c5de7ae20000c186703ad894eab2/workers/services/view/smart-tbr) and [Supabase Auth users](https://supabase.com/dashboard/project/kahvpxeygnmqpysrskok/auth/users)

## Out of Scope

The following were not evaluated in this research (or were deferred to the deployment rollout, now complete):

- Docker image configuration (Workers doesn't use Docker; `@astrojs/cloudflare` produces a bundled Worker script, no Dockerfile needed)
- ~~CI/CD pipeline setup~~ — **Done (2026-06-11):** `.github/workflows/ci.yml` runs lint + build on PR/push; `deploy` job auto-deploys on push to `main` via `wrangler-action@v3` with post-deploy smoke checks
- Per-PR preview deploys — parked; see deploy plan
- Production-scale architecture (multi-region failover, SLA commitments, dedicated support tiers) — explicit Non-Goal per PRD ("v1 makes no formal uptime commitment", "single-region deployment")
- Formal compliance certification (per PRD Non-Goal: "Avoid: aiming for any compliance certification beyond baseline practices")
- Database backup / disaster recovery beyond Supabase's defaults (per PRD: "best-effort data durability, no formal commitment")
