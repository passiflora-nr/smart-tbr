---
bootstrapped_at: 2026-05-23T21:29:15Z
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter (Astro + Supabase + Cloudflare)
project_name: smart-tbr
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

Verbatim copy of `context/foundation/tech-stack.md`:

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: smart-tbr
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

### Why this stack

A solo reader shipping a personal TBR + mood-trope recommender as a desktop-only web MVP in 4 after-hours weeks needs a battle-tested, agent-friendly starter that ships auth, a Postgres data layer, and edge deploy out of the box. The 10x Astro Starter is the recommended default for `(web, js)` and clears all four agent-friendly gates; Supabase covers FR-001/002/003/013 email-password auth and the FR-011 strict per-user isolation via Row-Level Security against a Postgres backing store. TypeScript across Astro routes + React islands lets explicit schemas guard the FR-010 trope-overlap matching at the boundary. AI / payments / realtime / background-jobs flags are all false per PRD Non-Goals — the recommendation rule is a deterministic tag-set intersection, not an LLM. Cloudflare Pages is the starter's deploy default; GitHub Actions with auto-deploy-on-merge keeps the after-hours feedback loop tight. Scaffolding confidence is first-class — the starter has a registered CLI but bootstrapper hasn't completed an end-to-end verified run yet; a small heads-up, no blocker.

## Pre-scaffold verification

| Signal       | Value                                                                       | Severity | Notes                                                                |
| ------------ | --------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------- |
| npm package  | not run                                                                     | n/a      | `cmd_template` starts with `git clone`; no npm CLI to query          |
| GitHub repo  | `przeprogramowani/10x-astro-starter` last pushed 2026-05-17T10:33:39Z       | fresh    | from `card.docs_url`; queried via GitHub REST API (gh CLI absent)    |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 20
**Conflicts (.scaffold siblings)**: none
**.gitignore handling**: moved silently (no `.gitignore` in cwd before scaffold)
**.bootstrap-scaffold cleanup**: deleted

### Files moved (top-level)

- `.env.example`
- `.github/`
- `.gitignore`
- `.husky/`
- `.nvmrc`
- `.prettierrc.json`
- `.vscode/`
- `CLAUDE.md`
- `README.md`
- `astro.config.mjs`
- `components.json`
- `eslint.config.js`
- `node_modules/`
- `package-lock.json`
- `package.json`
- `public/`
- `src/`
- `supabase/`
- `tsconfig.json`
- `wrangler.jsonc`

### Pre-existing files preserved

- `.cursor/` (untouched)
- `context/` (protected by conflict matrix; scaffold had no `context/` to drop)
- `idea-notes.md` (no scaffold collision)
- `.DS_Store` (untouched system file)

### Notes

- `npm install` completed during the scaffold step (chained in `cmd_template`): 774 packages added, 775 audited.
- Upstream `.git/` cloned by `git clone` was deleted before move-up so the starter's history does not leak into the user's project. The user can run `git init` to start a fresh history.
- Two npm warnings were observed during install (deprecation notices for `node-domexception@1.0.0` and `@babel/plugin-proposal-private-methods@7.18.6`). These are upstream maintenance notes, not blockers.

## Post-scaffold audit

**Tool**: `npm audit --json`

**Bootstrap-time snapshot** (right after scaffold + `npm install`): 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW — including **GHSA-77vg-94rm-hx3p** (`devalue`, CVSS **7.5**, CWE-770), **GHSA-58qx-3vcg-4xpx** (`ws`, CVSS **4.4**), and **GHSA-48c2-rrv3-qjmp** (`yaml`, CVSS **4.3**, CWE-674), plus toolchain moderates without a separate GHSA line in npm’s JSON for every package path.

**Current snapshot** (after `npm audit fix` on 2026-05-23, non-breaking only):

**Summary**: 0 CRITICAL, 0 HIGH, 5 MODERATE, 0 LOW (5 total; `npm audit --json` `metadata.dependencies.total`: 898).

**Direct vs transitive**: 1 moderate direct (**`@astrojs/check`**); 4 moderates transitive (**`@astrojs/language-server`**, **`volar-service-yaml`**, **`yaml`**, **`yaml-language-server`**), all stemming from **`yaml`** in `node_modules/yaml-language-server/node_modules/yaml` (still `2.0.0 - 2.8.2` until `@astrojs/check` is upgraded off the vuln chain or forcibly pinned).

npm’s suggested remediation for *all remaining* moderate rows is **`npm audit fix --force`**, which would install **`@astrojs/check@0.9.2`** (`fixAvailable`, `isSemVerMajor: true`) — reviewed as undesired versus keeping current `@astrojs/check` semver.

#### CRITICAL findings

None.

#### HIGH findings

None. (Previously **GHSA-77vg-94rm-hx3p** on **`devalue`** — cleared by `npm audit fix`.)

#### MODERATE findings

- **`yaml`** (transitive nested under `yaml-language-server`, vulnerable range **`>=2.0.0 <2.8.3`** / locked tree **`2.0.0 - 2.8.2`**)
  - **GHSA-48c2-rrv3-qjmp** — “yaml is vulnerable to Stack Overflow via deeply nested YAML collections”
  - npm advisory **`1115556`**
  - **CVSS: 4.3** (CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:N/A:L)
  - **CWE-674**

- **`yaml-language-server`** (transitive) — moderate via vulnerable **`yaml`**; propagates into **`volar-service-yaml`**, **`@astrojs/language-server`**, **`@astrojs/check`**.

- **`volar-service-yaml`** (transitive) — moderate via **`yaml-language-server`**.

- **`@astrojs/language-server`** (transitive) — moderate via **`volar-service-yaml`**.

- **`@astrojs/check`** (direct **`>=0.9.3`**) — moderate via **`@astrojs/language-server`**; **`fixAvailable`**: pin to **`@astrojs/check@0.9.2`** (breaking / major bump per npm).

#### LOW / INFO findings

None.

### Resolved by `npm audit fix` (historical detail)

npm no longer lists these packages on 2026-05-23 after non-breaking `--fix` (prior bootstrap report): **`devalue`** (**GHSA-77vg-94rm-hx3p**), **`wrangler`**, **`@cloudflare/vite-plugin`**, **`miniflare`**, **`ws`** (**GHSA-58qx-3vcg-4xpx** — uninitialized memory disclosure).

### Suggested next action (informational only)

Remaining risk is dev-time YAML tooling (**`yaml` → language server → Astro check** only). Optionally run **`npm audit fix --force`** and re-run **`npm run build`** if accepting **`@astrojs/check@0.9.2`**; otherwise tolerate the moderates until upstream publishes a semver-compatible fix.

## Hints recorded but not acted on

| Hint                       | Value                                                          |
| -------------------------- | -------------------------------------------------------------- |
| bootstrapper_confidence    | first-class                                                    |
| quality_override           | false                                                          |
| path_taken                 | standard                                                       |
| self_check_answers         | null                                                           |
| team_size                  | solo                                                           |
| deployment_target          | cloudflare-pages                                               |
| ci_provider                | github-actions                                                 |
| ci_default_flow            | auto-deploy-on-merge                                           |
| has_auth                   | true                                                           |
| has_payments               | false                                                          |
| has_realtime               | false                                                          |
| has_ai                     | false                                                          |
| has_background_jobs        | false                                                          |

These fields were read from the hand-off and preserved here for the audit trail. v1 surfaces them but does not act on them — a future memory-architecture skill will consume them when generating `AGENTS.md` / `CLAUDE.md` and CI workflows.

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep. (None were created on this run.)
- Address audit findings per your project's risk tolerance — the full breakdown is in this log. Non-breaking **`npm audit fix`** was applied 2026-05-23; remaining moderates live in **`@astrojs/check`** → YAML tooling (see Post-scaffold audit).
- The starter ships a `CLAUDE.md` from the upstream repo at the project root. Review it before relying on its contents — it documents the upstream project's conventions, not yours.
- Configure Supabase secrets (`.env.example` is in place as a template) and Cloudflare Pages credentials before first deploy.
