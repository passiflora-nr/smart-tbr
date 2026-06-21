---
starter_id: 10x-astro-starter
package_manager: npm
project_name: smart-tbr
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-workers
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: verified
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
---

## Why this stack

A solo reader shipping a personal TBR + mood-trope recommender as a desktop-only web MVP in 4 after-hours weeks needs a battle-tested, agent-friendly starter that ships auth, a Postgres data layer, and edge deploy out of the box. The 10x Astro Starter is the recommended default for `(web, js)` and clears all four agent-friendly gates; Supabase covers FR-001/002/003/013 email-password auth and the FR-011 strict per-user isolation via Row-Level Security against a Postgres backing store. TypeScript across Astro routes + React islands lets explicit schemas guard the FR-010 trope-overlap matching at the boundary. AI / payments / realtime / background-jobs flags are all false per PRD Non-Goals — the recommendation rule is a deterministic tag-set intersection, not an LLM. Cloudflare Workers with Static Assets is the deploy target (`wrangler deploy`, not Pages — Astro 6 SSR is broken on Pages); GitHub Actions with auto-deploy-on-merge keeps the after-hours feedback loop tight. **Bootstrap verified end-to-end (2026-06-11):** production Worker live at `https://smart-tbr.nicole-rozanska93.workers.dev`, hosted Supabase Auth configured, CI deploy on merge to `main`.
