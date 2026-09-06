---
date: 2026-09-06T16:10:00+02:00
researcher: Cursor Agent
git_commit: 37dbcc37e377bdf2d6c3d785541b1f1e55d73c5a
branch: feat/ui-theme-cafe-romance
repository: smart-tbr
topic: "Are we ready to implement ui-theme-cafe-romance (S-07)?"
tags: [research, codebase, ui-theme-cafe-romance, s-07, theme, tailwind, shadcn, e2e]
status: complete
last_updated: 2026-09-06
last_updated_by: Cursor Agent
---

# Research: Are we ready to implement ui-theme-cafe-romance (S-07)?

**Date**: 2026-09-06T16:10:00+02:00
**Researcher**: Cursor Agent
**Git Commit**: 37dbcc37e377bdf2d6c3d785541b1f1e55d73c5a
**Branch**: feat/ui-theme-cafe-romance
**Repository**: smart-tbr

## Research Question

Are we ready to implement `ui-theme-cafe-romance` (roadmap S-07)?

## Summary

**Ready to plan. Not ready to implement.**

Every product gate that `change.md` and the roadmap named is now satisfied: slices S-02 through S-06 are archived, and test-plan Phase 4 (the critical-path browser net) was archived on 2026-09-06. The test suite was written so a restyle can change classes, fonts, and decorative markup without breaking it.

`/10x-implement` still cannot start. This folder has only `change.md` plus this research file — no `plan.md`, no Progress section, and `change.md` is not in `{planned, plan_reviewed}`. The next skill is `/10x-plan ui-theme-cafe-romance`, then `/10x-plan-review`, then implement.

The work itself is a **per-page rewrite of about 32–34 files**, not a CSS-variable swap. Pages ignore the shadcn tokens in `src/styles/global.css` and hardcode cosmic/glass Tailwind classes. Token edits alone would barely change what a reader sees.

Treat the current `change.md` as the source of truth for layout: keep stacked title-and-author rows, do not add covers or a cover-forward grid. Archived Phase 4 research still describes that older grid idea — do not plan from it.

## Detailed Findings

### Process gates

| Gate                          | Status           | Evidence                                                                                                                                                                                                                                                                                                                        |
| ----------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-02 browse TBR               | done             | `context/foundation/roadmap.md:38`, archived 2026-08-11                                                                                                                                                                                                                                                                         |
| S-03 edit / delete            | done             | `context/foundation/roadmap.md:39`, archived 2026-08-14                                                                                                                                                                                                                                                                         |
| S-04 search / filter          | done             | `context/foundation/roadmap.md:40`, archived 2026-08-15                                                                                                                                                                                                                                                                         |
| S-05 mood-trope pick          | done             | `context/foundation/roadmap.md:37`, archived 2026-08-15                                                                                                                                                                                                                                                                         |
| S-06 account lifecycle        | done             | `context/foundation/roadmap.md:36`, archived 2026-08-22                                                                                                                                                                                                                                                                         |
| Phase 4 e2e net + CI gate     | archived on disk | `context/archive/2026-08-30-testing-critical-path-e2e-net-gates/change.md:4-8` (`archived_at: 2026-09-06T13:51:51Z`). Live specs: `tests/e2e/critical-path.spec.ts`, `tests/e2e/edit-save.spec.ts`, `tests/e2e/auth.setup.ts`. CI runs `npm run test:e2e` after `npm test` and before build (`.github/workflows/ci.yml:23-26`). |
| `plan.md` for this change     | **absent**       | `context/changes/ui-theme-cafe-romance/` had only `change.md` before this research.                                                                                                                                                                                                                                             |
| `/10x-implement` entry status | not met          | Implement only advances `change.md` from `{planned, plan_reviewed}`. Current status was `new` (now `preparing`).                                                                                                                                                                                                                |

Roadmap Backlog Handoff already marked S-07 ready for `/10x-plan` and only asked to wait for Phase 4 to be archived (`context/foundation/roadmap.md:221`). That wait is over.

`/10x-implement` reads an approved `context/changes/<change-id>/plan.md` with a canonical `## Progress` section (`.cursor/skills/10x-implement/SKILL.md`). Without that file, implementation is the wrong next step.

### What the restyle actually touches

Every signed-in and public page still wraps itself in `bg-cosmic` plus glass cards (`border-white/10 bg-white/10 backdrop-blur-xl`). Semantic utilities (`bg-background`, `text-foreground`, `bg-primary`) are unused on page chrome.

**`bg-cosmic` call sites (must all go):**

1. `src/components/Welcome.astro:12` — plus orbs (`:13-25`) and star-field (`:27-31`)
2. `src/pages/auth/signin.astro:9`
3. `src/pages/auth/signup.astro:9`
4. `src/pages/auth/confirm-email.astro:22`
5. `src/pages/books/index.astro:148`
6. `src/pages/books/new.astro:8`
7. `src/pages/books/[id]/edit.astro:56`
8. `src/pages/mood.astro:95`
9. `src/pages/account.astro:50`
10. `src/styles/global.css:113-115` — utility definition (`#0a0e1a` → `#0f1529`)

**Other cosmic chrome that a token swap will not fix:**

- Gradient headings (`from-blue-200 via-purple-200 to-pink-200`) on home, auth, books, mood, account
- Glass inputs in `src/components/auth/FormField.tsx:6,43-54` and `src/components/books/TropeInput.tsx:7,92-120`
- `SubmitButton` overrides shadcn `Button` with `bg-purple-600` (`src/components/auth/SubmitButton.tsx:19`)
- Trope pills `bg-white/15 text-white` (`BookList.astro:38`, `TropeInput.tsx:111`) — spec wants blush / oat / warm stone with `#5C4A42` text
- Book-row `:target` flash uses purple RGB (`src/styles/global.css:130-143`)
- Delete modals use hardcoded dark-red CSS (`src/styles/global.css:145-180`)
- `Banner.astro:27-41` uses fixed hex, not tokens

**File-count estimate for a complete pass: 32–34 files** (9 route shells, ~16–18 components, `Layout.astro`, `global.css`, optional unused `LibBadge.astro`).

TBR lists are stacked rows (`BookList.astro:15-22`, `MoodResultList.astro:12-21`, `SavedBooksList.tsx:17-27`): title, author, optional description, trope pills. No cover field, no `<img>` book art, no cover-forward grid. Keep that layout.

### Tokens, fonts, and shadcn today

`src/styles/global.css:6-38` already has a full shadcn **new-york / neutral** oklch token set. `--radius` is `0.625rem` (`:7`); the spec wants `0.75rem`. A `.dark` block exists (`:41-73`) but `Layout.astro` never sets `class="dark"`. Dark mode stays parked (`context/foundation/roadmap.md:236`).

`body` applies `bg-background text-foreground` (`global.css:121-123`), then every page paints `bg-cosmic` over it. The only installed shadcn primitive is `Button` (`src/components/ui/button.tsx`); its sole consumer restyles it purple.

**No app fonts are loaded.** `Layout.astro` has no font links. There is no `@fontsource/*` package and no `--font-*` theme tokens. Fraunces, Cormorant Garamond, and DM Sans are named only in `change.md:38`. The plan must pick a heading font and a Workers-safe load path.

### Navigation: duplicated chrome, shared-nav opportunity

There is no shared signed-in nav.

| Surface                                                         | Pattern                                                              |
| --------------------------------------------------------------- | -------------------------------------------------------------------- |
| Signed-in home                                                  | `Topbar.astro:6-33` — text links + inline sign-out form              |
| `/books`, `/books/new`, `/books/[id]/edit`, `/mood`, `/account` | Hand-rolled glass pill rows; only `SignOutButton.astro:14` is shared |
| Signed-out home                                                 | Welcome CTAs only                                                    |

Roadmap S-07 already names extracting one signed-in nav during this rewrite (`context/foundation/roadmap.md:206`). Do it here: the classes are being rewritten anyway, and five hand-rolled rows will drift if left alone. Edit-page links that carry an unsaved-changes guard must keep that behaviour.

### Tests will survive the restyle (with copy caveats)

The suite asserts behaviour and data, not look. No visual snapshots, no class-name checks, no `toHaveCount` layout oracles.

| Safe to change                                          | Will break tests                                                                                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cosmic classes, glass, fonts, star-field / orbs         | Renaming product controls: Sign in, Add a book, Add to TBR, View your TBR, Pick by mood, Find my next read, Save changes                                                  |
| Shared nav extraction if accessible names stay the same | Empty / no-match sentences: `Your TBR is empty — add your first book to get started.`, `No books match your`, `No matches — try different tropes.`                        |
| Heading tags and decorative markup                      | Mood **Tropes** disclosure: `tests/e2e/critical-path.spec.ts:58` uses `getByText("Tropes", { exact: true })`. A closed label like `Tropes · 0 selected` fails that click. |
| Filter bar look                                         | Filter **transport** rewrite: `tests/integration/books-surface.test.ts:220-227` checks `method` / `action` / `name="q"` / clear-link `href` as substrings                 |

`lessons.md:47-52` still applies: do not turn Your TBR into a React island. Browse / filter / delete stay native HTML.

`test-plan.md:98` also names a **local, once** “full suite before S-07” gate. That is owner process at implement time, not a missing Phase 4 artifact.

### Stale documents that would mislead a planner

1. **`context/foundation/test-plan.md:60`** still says Phase 4 is `change opened` at `context/changes/testing-critical-path-e2e-net-gates/`. That folder is gone. Phase 4 is archived. Flip the row to `complete` and point at the archive — do not treat the stale cell as a blocker.
2. **Archived Phase 4 research / plan** still describe S-07 as a **cover-forward grid** (`context/archive/2026-08-30-testing-critical-path-e2e-net-gates/research.md:176,193,275,297`). Current `change.md:37-43` forbids covers and a grid. Plan from the live change note.
3. **Roadmap Backlog Handoff** (`roadmap.md:221`) and **`change.md:12`** still say “wait until Phase 4 is archived.” Historically correct; the wait is done.
4. **`change.md:12`** also says do not apply the palette early or slice-by-slice. That constraint still holds: restyle in one change, not while inventing new product surfaces.

## Code References

- `context/changes/ui-theme-cafe-romance/change.md:12-43` — sequencing, palette, light-only, no covers, per-page rewrite estimate
- `context/foundation/roadmap.md:196-221` — S-07 outcome, shared-nav opportunity, Backlog “ready for /10x-plan”
- `context/foundation/test-plan.md:21,60,98,122-129,172` — no CSS assertions; stale Phase 4 row; full-suite-once gate; e2e cookbook; visual styling excluded
- `src/styles/global.css:6-38` — unused shadcn tokens; `:7` radius `0.625rem`; `:113-115` `bg-cosmic`; `:130-180` purple row flash + delete-modal CSS
- `src/components/Welcome.astro:12-31` — cosmic shell, orbs, star-field
- `src/components/auth/SubmitButton.tsx:19` — purple override of the only shadcn `Button`
- `src/components/books/BookList.astro:15-38` — stacked TBR rows, glass pills
- `src/components/Topbar.astro:6-33` vs per-page nav in `src/pages/books/index.astro:179-209` and siblings
- `src/layouts/Layout.astro:16-41` — no font loading
- `tests/e2e/critical-path.spec.ts:5-71` — sign-in → add → browse → mood
- `tests/e2e/edit-save.spec.ts:5-39` — edit title → Save changes
- `.github/workflows/ci.yml:23-26` — e2e is a required CI gate
- `.cursor/skills/10x-implement/SKILL.md` — implement requires approved `plan.md`

## Architecture Insights

- **Tokens are infrastructure, not the UI.** shadcn CSS variables are already wired (`@theme inline` in `global.css`, `components.json` style `new-york`). Pages never consume them. The plan should do both: map Café Romance hex roles onto those variables **and** replace hardcoded cosmic classes so the tokens actually paint the app.
- **One primitive, many one-off surfaces.** Only `Button` is generated. Inputs, pills, cards, and nav are hand-rolled. Do not expand the shadcn kit as a side quest unless a primitive removes duplication without adding islands on the TBR list.
- **Home nav and app nav are different designs.** Unifying them is a real design choice (text links vs bordered pills), which is why earlier slices left them alone. S-07 is the right time because both get rewritten.
- **Behaviour contract is copy + hrefs + form transport.** The e2e net and integration suite lock control names and a few sentences. The restyle should keep those strings, or the plan must budget matching test edits.
- **List pages stay server HTML.** A theme pass that hydrates one island per book row would violate `lessons.md` and silently pass lint/CI.

## Historical Context (from prior changes)

- `context/archive/2026-08-30-testing-critical-path-e2e-net-gates/` — Phase 4 landed the browser net and CI gate that S-07 was waiting on. Impl-review 2026-09-06: Tropes exact-text locator dismissed as current markup; still a restyle tripwire if the closed label changes.
- `context/archive/2026-08-30-testing-critical-path-e2e-net-gates/research.md:176` — **stale S-07 shape** (cover-forward grid). Superseded by the 2026-09-06 `change.md`.
- `context/archive/2026-08-29-tbr-surface-behaviour/research.md:42,256` — `/books` is zero-JS; title text and fixed empty/no-match sentences survive a class rewrite.
- `context/archive/2026-08-23-testing-harness-and-data-integrity/research.md:572` — S-07 is a per-page rewrite with no written behaviour-preservation guarantee; that is why tests assert data, not chrome.
- Multiple archived functional plans (S-03, S-06, and others) deferred Café Romance to S-07 rather than restyle as they shipped.

## Related Research

- `context/archive/2026-08-30-testing-critical-path-e2e-net-gates/research.md` — Phase 4 grounding; ignore the cover-grid S-07 description
- `context/archive/2026-08-29-tbr-surface-behaviour/research.md` — list-surface behaviour oracles that S-07 must not rewrite
- `context/archive/2026-08-15-mood-trope-recommendation/research.md` — mood flow is server HTML (picker + results)

## Open Questions

These are planning choices, not implementation blockers:

1. **Heading font:** Fraunces or Cormorant Garamond (`change.md:38` lists both).
2. **Font loading on Workers:** `@fontsource/*`, self-hosted files in `public/`, or a Google Fonts `<link>` in `Layout.astro` — pick one path that works with the Cloudflare adapter.
3. **Shared nav in scope?** Roadmap recommends extracting it during this rewrite. The plan should say yes or no explicitly, and preserve the edit page’s unsaved-changes guard.
4. **When to flip the stale Phase 4 row** in `test-plan.md` — this change or a tiny docs follow-up. It should not stay “change opened.”
5. **Hex vs oklch tokens:** pages can use literal hex utilities, or the plan can convert the Café Romance palette into `--primary` / `--background` / etc. so shadcn `Button` and `body` match without overrides.
6. **Owner “full suite once” run** (`test-plan.md:98`) — schedule it at the start of implement, not as a reason to delay `/10x-plan`.
