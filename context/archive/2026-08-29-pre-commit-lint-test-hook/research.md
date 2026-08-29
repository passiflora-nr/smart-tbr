---
date: 2026-08-29T12:30:00+02:00
researcher: Cursor Agent
git_commit: 46890de5d4571f0048d3b896b06264c9da33b5b2
branch: hooks-and-triggers
repository: passiflora-nr/smart-tbr
topic: "Options for a pre-commit hook that runs lint and tests on staged files"
tags: [research, codebase, husky, lint-staged, vitest, pre-commit, quality-gates]
status: complete
last_updated: 2026-08-29
last_updated_by: Cursor Agent
last_updated_note: "Added follow-up research for whether the existing Husky pre-commit hook is actually installed"
---

# Research: Pre-commit lint and tests on staged files

**Date**: 2026-08-29 12:30 (UTC+2)
**Researcher**: Cursor Agent
**Git Commit**: `46890de5d4571f0048d3b896b06264c9da33b5b2`
**Branch**: `hooks-and-triggers`
**Repository**: `passiflora-nr/smart-tbr`

## Research Question

Research the options for a pre-commit hook that runs lint and tests on the staged files before a commit.

## Summary

The repo already has the right **hook runner** for this job: Husky 9 plus lint-staged. Today that pair lints and formats **staged files only**. It does **not** run tests. Full unit + integration coverage is a **CI gate**, and that split was an explicit decision when the test harness landed — nobody proposed putting Vitest on commit.

The cheapest way to add “tests on the files I am committing” is **not** a new tool. Keep Husky. Add Vitest’s official lint-staged recipe — `vitest related --run --project unit` — next to the existing `eslint --fix` glob. Pin the run to the **unit** project and add `--passWithNoTests` so a page or middleware commit without a unit test does not fail closed.

Do **not** run the integration project on pre-commit. Those tests need Docker, local Supabase, and the Astro dev server; cold start can exceed two minutes. CI already starts that stack and runs `npm test`.

Switching to Lefthook, simple-git-hooks, or the Python `pre-commit` framework would replace working npm tooling for no product gain. Cursor `postToolUse` hooks (untracked under `.cursor/hooks/`) are a **different layer**: they advise the agent after an edit; they do not block `git commit`.

One install gap matters before any new command is added: `package.json` has no `"prepare": "husky"` script, and this checkout has no `core.hooksPath`. The documented “don’t bypass Husky” rule assumes the hook is actually installed.

## Detailed Findings

### Current pre-commit (already in the repo)

`.husky/pre-commit` is a single line:

```1:1:.husky/pre-commit
npx lint-staged
```

lint-staged 16 is configured inline in `package.json`:

```66:72:package.json
  "lint-staged": {
    "*.{ts,tsx,astro}": [
      "eslint --fix"
    ],
    "*.{json,css,md}": [
      "prettier --write"
    ]
  }
```

What that means in practice:

- Staged `*.{ts,tsx,astro}` — including `tests/**/*.test.ts` — get type-aware `eslint --fix`.
- Staged `*.{json,css,md}` get `prettier --write`.
- lint-staged passes **only those filenames**, then re-stages fixes.
- No Vitest, no `tsc`, no `astro check`, no `astro sync`.
- Array syntax on one glob runs those commands **in order**. Different globs run **concurrently** by default.

ESLint is already the local type gate: `eslint.config.js` uses `strictTypeChecked` + `projectService: true`. A standalone `tsc --noEmit` on every commit would duplicate that cost. `@astrojs/check` is a dependency and is **not** wired into any script, hook, or CI step.

### The hook may not be installed

Husky 9’s documented setup is a `prepare` script that runs `husky`, which sets `git config core.hooksPath .husky` ([Husky v9.1.7](https://github.com/typicode/husky/blob/v9.1.7/docs/get-started.md)).

This repo:

- lists `husky@9.1.7` as a devDependency (`package.json:52`)
- has **no** `"prepare": "husky"` script
- has no `.husky/_` helper tree
- on this checkout, `git config --get core.hooksPath` is unset

So a fresh clone (and possibly this working tree) can skip `.husky/pre-commit` entirely. `AGENTS.md:66` forbids `--no-verify` on the assumption the hook runs. Any plan that adds tests to pre-commit should restore `prepare` first, or the new command never fires.

### Test gates today (three layers, not one)

| Layer                           | When                           | Lint                                    | Tests                                                        | Blocks?                             |
| ------------------------------- | ------------------------------ | --------------------------------------- | ------------------------------------------------------------ | ----------------------------------- |
| Husky + lint-staged             | `git commit`                   | Staged files                            | None                                                         | Yes (if hooksPath is set)           |
| Cursor `postToolUse`            | After agent Write / StrReplace | Full-repo `eslint --fix` + `tsc`        | `vitest related` **unit only**                               | No — JSON `additional_context` only |
| CI (`.github/workflows/ci.yml`) | PR / push to `main`            | Full-repo `eslint .` after `astro sync` | `npm test` (unit **and** integration) after `supabase start` | Yes                                 |

Vitest is two named projects (`vitest.config.ts:12-36`):

- **unit** — `tests/unit/**/*.test.ts`, Node, no Docker. Three files today: `book-schema`, `mood-selection`, `local-coordinates`.
- **integration** — `tests/integration/**/*.test.ts`, serialized, `globalSetup` starts or reuses local Supabase + Astro, 120s test / 360s hook timeouts.

`npm test` runs both. That is what CI requires between lint and build (`AGENTS.md:49`, `.github/workflows/ci.yml:21-24`).

`test-plan.md` §5 already names the intended split: lint + typecheck on **local + CI**; unit and integration on **local + CI** after Phase 1; a manual browser pass **before merge**. “Local” there means the contributor can run `npm run test:unit` / `test:integration` — it does not say those commands belong on every commit.

### How “tests on staged files” actually works

There are three different ideas people collapse into one phrase:

1. **Run the test file if that test file is staged** — `vitest run path/to/foo.test.ts`. Misses the common case: you edit `src/lib/book-schema.ts` and the test is unstaged.
2. **Run tests whose import graph includes the staged source** — `vitest related <files> --run`. This is what Vitest documents for lint-staged ([CLI: `vitest related`](https://github.com/vitest-dev/vitest/blob/main/docs/guide/cli.md)):

   ```js
   export default {
     "*.{js,ts}": "vitest related --run",
   };
   ```

3. **Run every test that differs from `main`** — `vitest --changed origin/main`. Broader than “this commit”; includes unstaged dirty files. Better as a pre-push or CI filter than as a pre-commit.

`vitest related` walks each unit test’s Vite SSR module graph and keeps a spec if the staged path is the test itself or one of its static imports. Dynamic imports are not followed. `node_modules` is skipped.

That matches this repo’s unit layout:

- `tests/unit/book-schema.test.ts` imports `@/lib/book-schema`
- `tests/unit/mood-selection.test.ts` imports `@/lib/mood-selection`
- `tests/unit/local-coordinates.test.ts` imports `../integration/support/local-coordinates` (so a support-file change **is** related)

It does **not** match most `.astro` pages, API routes, or middleware: those have no unit specs. Committing only `src/pages/books/index.astro` should lint, then run **zero** unit tests.

Empty-related behavior is the sharp edge. `passWithNoTests` defaults to `false`. `--changed` flips it to `true` automatically; `related` does **not**. Without `--passWithNoTests`, a staged file with no unit-test dependents can throw `FilesNotFoundError` and **block the commit**. The official lint-staged snippet omits the flag; this repo should add it (or restrict the glob to `src/lib/**` + `tests/unit/**`).

`forceRerunTriggers` (Vitest default includes config files such as `vitest.config.ts`) can expand a related run to the **entire unit project**. That is the right fail-closed behavior for harness edits.

### Option A — Extend lint-staged (recommended)

Keep `.husky/pre-commit` as `npx lint-staged`. Add a unit-related command to the TypeScript globs.

JSON in `package.json` is enough if filenames should be appended (they should — `related` wants them):

```json
"*.{ts,tsx}": [
  "eslint --fix",
  "vitest related --run --project unit --passWithNoTests"
],
"*.astro": ["eslint --fix"]
```

Why this shape:

- Same glob family as today; ESLint still covers `.astro`.
- `--project unit` never starts Docker or `globalSetup`.
- Array = lint-fix **then** tests on the post-fix working tree.
- `--passWithNoTests` keeps page-only commits unblocked.
- No new dependencies.

Use a `lint-staged.config.js` **function** only if you need to drop filenames (`tsc --noEmit`) or filter paths in JS. Husky’s own docs show `() => 'tsc --noEmit'` for that case; it is the opposite of what `related` needs.

**Cost:** seconds on the three unit files, not minutes. **Gap:** related tests only cover what unit tests import. An `.astro` or API-route regression still waits for CI integration / a later e2e phase.

### Option B — Husky script without lint-staged

Put `npm run lint` and `npm run test:unit` (or `npm test`) directly in `.husky/pre-commit`. Husky’s own examples do this.

This runs the **full** lint tree and the **full** unit (or full) suite on every commit, including docs-only and CSS-only commits. It ignores “staged files.” Integration on this path is the same Docker/cold-start problem as Option D.

Worse than A for this repo: we already have lint-staged, and the user asked for staged-file scope.

### Option C — Lefthook (replace Husky + lint-staged)

Lefthook is a Go binary. One `lefthook.yml` does parallel jobs, `{staged_files}` interpolation, globs, and `stage_fixed: true` — the job lint-staged does today ([Lefthook pre-commit jobs](https://github.com/evilmartians/lefthook/blob/master/docs/index.md)). Official wiki: [migrate from Husky + lint-staged](https://github.com/evilmartians/lefthook/wiki/Migration-from-husky-with-lint-staged).

Useful when you need polyglot hooks, many parallel jobs, or to drop the Node hook runtime. This repo is Node/npm only, already has Husky 9 + lint-staged 16, and AGENTS.md / archived slice plans all name Husky. Migration is churn: uninstall two packages, delete `.husky/`, rewrite config, teach every later plan a new name.

No capability here that Option A lacks for “lint + related unit tests on staged files.”

### Option D — simple-git-hooks or Python pre-commit

**simple-git-hooks** stores hook commands in `package.json` and still recommends lint-staged for staged-file filtering. It is a thinner Husky. Same lint-staged work, plus a migration off `core.hooksPath` if Husky already set it. Not worth a swap.

**pre-commit** (pre-commit.com) is a Python installer with isolated hook environments. Strong for polyglot / security scanners. Extra runtime (Python) for a JS app that already standardizes on npm. Does not help Vitest related more than lint-staged does.

### Option E — Pre-push instead of (or as well as) pre-commit

A `pre-push` hook can run `npm run test:unit` or `vitest --changed origin/main --project unit` after local commits exist. Slower is acceptable because pushes are rarer. Does **not** answer “before a commit.” Complements A if related-on-commit feels too narrow; does not replace CI integration.

### Option F — Cursor hooks only (already drafted, untracked)

`.cursor/hooks.json` (untracked) registers two `postToolUse` scripts on `Write|StrReplace`:

- `.cursor/hooks/lint-typecheck.sh` — **full-repo** `eslint --fix .` then `tsc --noEmit` (60s timeout)
- `.cursor/hooks/related-tests.sh` — `vitest related "$file_path" --run --project unit` (30s timeout)

Both always `exit 0` and, on failure, return `additional_context` to the agent. They never block a commit.

They overlap Option A on `vitest related --project unit`, but:

- they fire on **every agent edit**, not on `git commit`
- lint is full-repo, not staged (heavier, and can fix files the user did not mean to touch)
- they do not help a commit made outside Cursor

Treat them as agent feedback, not as the git quality gate. If both land, keep related-test flags aligned (`--project unit`, `--passWithNoTests`) so the two layers do not disagree.

### What must not go on pre-commit

Prior harness research priced integration at **several minutes of image pulls and ~7–8 GB RAM**, and an impl-review found cold `supabase start` (~240s) + Astro (~90s) vs a 120s Vitest hook timeout (`context/archive/2026-08-23-testing-harness-and-data-integrity/research.md:150`, `reviews/impl-review.md:115-122`).

Integration also fail-closes on non-loopback coordinates and mutates only user-D rows (`test-plan.md:114-117`). A laptop without Docker, or with `.env` still pointing at hosted Supabase, would **block every commit** that touched an integration file — or worse, if coordinates were ever wrong, risk the hosted project.

CI already runs `npx supabase start …` then `npm test` (`.github/workflows/ci.yml:22-24`). That is the right place for the expensive suite.

## Code References

- `.husky/pre-commit:1` — `npx lint-staged`
- `package.json:10-16` — lint / test scripts; no `prepare`
- `package.json:52-53` — `husky@9.1.7`, `lint-staged@^16.3.3`
- `package.json:66-72` — current lint-staged globs (lint + prettier only)
- `eslint.config.js:14-20` — type-aware ESLint (`projectService`)
- `vitest.config.ts:12-36` — `unit` vs `integration` projects
- `.github/workflows/ci.yml:19-24` — `astro sync` → lint → supabase start → `npm test`
- `AGENTS.md:66` — Husky + lint-staged; do not `--no-verify`
- `context/foundation/test-plan.md:89-98` — quality-gate table (lint local+CI; tests local+CI; not “on commit”)
- `.cursor/hooks.json` — untracked Cursor `postToolUse` pair
- `.cursor/hooks/related-tests.sh:38` — existing `vitest related --project unit` usage
- `tests/unit/book-schema.test.ts:3` — `@/lib/book-schema` (related-graph evidence)
- `tests/unit/local-coordinates.test.ts:2-8` — unit test depends on integration **support** module

## Architecture Insights

**Staged-file lint is already the local contract; staged-file tests are a small extension of that contract, not a new gate.** CI remains the only place that must run integration. Pre-commit should stay fast enough that `AGENTS.md`’s “never `--no-verify`” rule stays realistic. A two-minute Docker boot on every commit would train people to bypass the hook.

**Related tests follow imports, not “files that feel related.”** Unit coverage today is three lib/support modules. A pre-commit related run will not protect browse/search/delete markup — those risks sit in later test-plan phases (integration / e2e). That is acceptable: the hook’s job is cheap signal on the files that already have unit specs.

**Two hook systems can coexist if their jobs stay distinct.** Git pre-commit = block a bad commit. Cursor `postToolUse` = tell the agent the edit just broke lint or a related unit test. Combining them into one “run everything everywhere” script would make agent edits and human commits both slow.

**Husky without `prepare` is documentation, not a gate.** Restore install before adding work to the hook.

## Historical Context (from prior changes)

- `context/archive/2026-08-23-testing-harness-and-data-integrity/research.md` (§A.5, ~146–152) — Husky/lint-staged lint-only; ESLint on staged test files can block commits; integration in CI costs Docker/RAM; unit-only needs none of that.
- Same change, `plan-brief.md` / `plan.md` Phase 2.5 — `npm test` inserted in **CI** between lint and build. Contributors run focused commands locally; PRs run the full gate.
- Same change, `reviews/impl-review.md` (~115–122) — integration cold start can exceed Vitest hook timeouts.
- Slice merge contracts (`context/archive/2026-08-02-add-book-to-tbr/plan.md:352` and later browse/edit-delete plans) — “never bypass the Husky pre-commit hook.”
- `context/archive/2026-05-23-bootstrap-verification/verification.md:65` — `.husky/` arrived with the Astro scaffold; no policy written at bootstrap.
- No prior change folder proposed running Vitest on commit. Active `context/changes/` had only `ui-theme-cafe-romance/` before this research.

## Related Research

- `context/archive/2026-08-23-testing-harness-and-data-integrity/research.md` — primary prior write-up of CI vs hooks vs env files

## Open Questions

1. **Install first?** Should the plan add `"prepare": "husky"` (and verify `core.hooksPath`) as a prerequisite, even if the related-test command is deferred?
2. **Glob vs `--passWithNoTests`?** Restrict related tests to `src/lib/**` + `tests/unit/**` (precise, silent skip elsewhere) or keep `*.{ts,tsx}` plus `--passWithNoTests` (simpler, matches Vitest’s lint-staged docs)?
3. **Cursor hooks in the same change?** The untracked `.cursor/hooks/*` scripts already run related unit tests. Same change, or keep git pre-commit and agent hooks as separate work?
4. **Pre-push later?** After related-on-commit lands, is a full `test:unit` on push wanted, or is CI enough?

## Recommendation

For a plan that answers the research question without replacing the stack:

1. Restore Husky install (`prepare` script).
2. Keep Husky + lint-staged; do not migrate to Lefthook / simple-git-hooks / pre-commit.
3. Add `vitest related --run --project unit --passWithNoTests` to staged TypeScript files, after `eslint --fix`.
4. Leave integration and `npm test` on CI.
5. Treat Cursor hooks as optional agent feedback, not as a substitute for the git hook.

## Follow-up Research 2026-08-29T12:26+02:00

**Question:** Does this repo already have a pre-commit hook?

**Answer:** The **file** exists; the **git hook is not installed** on this checkout.

Re-checked live:

- `.husky/pre-commit` is present, executable, dated May 23, contents: `npx lint-staged`.
- `git config --get core.hooksPath` is unset.
- `git rev-parse --git-path hooks` returns `.git/hooks` (Git’s default), not `.husky`.
- `.git/hooks/pre-commit` does not exist.

A `git commit` on this machine therefore does **not** run lint-staged. The hook arrived with the May bootstrap scaffold and was never wired via `"prepare": "husky"`.
