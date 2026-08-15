---
date: 2026-08-15T14:45:00+02:00
researcher: Cursor Agent
git_commit: 54ae90d4a538c180f189433a2266ea2a6223bf88
branch: feat/mood-trope-recommendation
repository: smart-tbr
topic: "S-05 library options compatible with tech stack (mood-trope-recommendation)"
tags: [research, s-05, mood-trope-recommendation, supabase, astro, react, shadcn, libraries]
status: complete
last_updated: 2026-08-15
last_updated_by: Cursor Agent
---

# Research: S-05 library options compatible with tech stack

**Date**: 2026-08-15T14:45:00+02:00
**Researcher**: Cursor Agent
**Git Commit**: 54ae90d4a538c180f189433a2266ea2a6223bf88
**Branch**: feat/mood-trope-recommendation
**Repository**: smart-tbr

## Research Question

What libraries are available for implementing S-05 (pick the next book by mood-tropes) that are compatible with `context/foundation/tech-stack.md`?

## Summary

**S-05 needs zero new npm dependencies.** Every layer the slice requires is already covered:

- **Matching (FR-009/FR-010)**: `.overlaps("tropes", selected)` in `@supabase/supabase-js` (already installed) maps to Postgres `&&` — "arrays share at least one element", which is exactly mood-trope overlap semantics. The in-memory alternative in `src/lib/book-filters.ts` also works at ~100 books.
- **Trope picker UI**: two working patterns already exist in the repo — the zero-JS `<details>` + checkbox widget in `BookFilterBar.astro` (built for S-04) and the React chip input `TropeInput.tsx` (built for S-01).
- **Ranking / similarity**: not needed. Ranking within results is a PRD Non-Goal; the rule is a deterministic tag-set intersection, not scoring.

The only genuine library decision is whether to upgrade the trope picker to a richer multi-select. Options are catalogued below with compatibility verdicts. **Recommendation: don't** — extend the existing native-HTML widget, per the `lessons.md` rule preferring native HTML on TBR surfaces.

## Detailed Findings

### S-05 requirements (from roadmap)

- **Outcome**: User opens a trope-selection screen populated from their own tropes, picks 1–3 mood tropes, receives up to 3 matching books (title, author, tropes), with empty states for no books / no tropes / no matches.
- **Change ID**: `mood-trope-recommendation`
- **PRD refs**: US-01, FR-008, FR-009, FR-010, NFR (≤2s end-to-end)
- **Prerequisites**: F-01 ✓, S-01 ✓
- **Risk note**: Tag-set intersection over ~100 books is O(N) and fits the Workers per-request budget.

### Tech stack constraints

From `context/foundation/tech-stack.md` and `AGENTS.md`:

| Constraint | Implication for S-05 |
|---|---|
| Astro v6 SSR + Cloudflare Workers | Matching runs server-side; avoid heavy client bundles |
| React 19 islands (selective) | An island is acceptable for the picker widget only |
| Supabase + RLS | Recommendation query stays on `books` scoped by `user_id` |
| shadcn (`new-york`) + Tailwind v4, no `tailwind.config` | npm-shipped components need an `@source` directive to emit classes |
| Only `@radix-ui/react-slot` installed | Adding Base UI or Ariakit introduces a second primitive family |
| `zod` already present | Validate the 1–3 trope selection without new deps |
| No AI (PRD Non-Goal) | Rules out embeddings, vector search, LLM recommenders |
| Edge/workerd runtime | Native (C++) npm addons cannot run — see ruled-out list |

### Layer 1: Matching — no new libraries

`@supabase/supabase-js` (`^2.106.2`, installed) already exposes the needed array operators on the `tropes text[]` column:

| Semantics | Supabase method | Postgres | Fit for S-05 |
|---|---|---|---|
| Share **any** selected trope | `.overlaps("tropes", selected)` | `&&` | **Yes** — mood overlap |
| Contain **all** selected tropes | `.contains("tropes", selected)` | `@>` | Too strict at 3 tropes |

```ts
const { data } = await supabase
  .from("books")
  .select("id, title, author, tropes")
  .eq("user_id", user.id)
  .overlaps("tropes", selectedTropes)
  .limit(3);
```

Alternative with no query change: fetch the user's books and intersect in TypeScript, mirroring `matchesBookFilters` in `src/lib/book-filters.ts`. At ~100 books × ≤25 tropes this is negligible work and keeps matching logic unit-testable in one place. Either path is defensible; the plan should pick one explicitly.

**Note on `.limit(3)`**: with no ranking (a PRD Non-Goal), "up to 3" is an arbitrary slice of the matches. The plan should state which 3 the user gets and why (e.g. most-recently-added, or DB order) so the behaviour is intentional rather than incidental.

### Layer 2: Ranking / similarity libraries — ruled out

Surveyed because "recommendation" suggests scoring, but none belong in v1:

| Library | Why not |
|---|---|
| `jaccard-suggest` | Text tokenization + stopwords + fuzzy matching; contradicts "user wording IS the data" |
| `jaccard-index` | Promise-based collaborative-filtering framework; far beyond a 3-tag intersection |
| `strsimkit` | String-similarity suite (Levenshtein, Dice, Jaccard); S-05 compares exact tags, not strings |
| `superminhash` | Probabilistic Jaccard estimation for large-scale sets; pointless at 100 rows |
| `text-similarity-node` | **Native C++ addon — will not run on Cloudflare Workers** |

Ranking within results is explicitly parked in the roadmap ("Ranking within results … v2+ concerns"). A one-line `.filter()` / `.length` intersection covers FR-010.

### Layer 3: Trope picker UI

#### Existing in-repo patterns (recommended — no new libraries)

| Pattern | File | Cost |
|---|---|---|
| `<details>` + checkbox dropdown in a GET form | `src/components/books/BookFilterBar.astro` | 0 deps, 0 JS, already styled |
| React chip input with keyboard commit | `src/components/books/TropeInput.tsx` | 0 deps, island already in use |

The S-04 widget is the closest analogue: it renders the user's own trope vocabulary (via `collectTropeVocabulary`) as checkboxes inside a collapsible summary, submitted as repeated `trope` params. S-05 needs the same shape plus a **1–3 selection cap**, which can be enforced server-side in zod and, optionally, hinted client-side.

#### If a richer multi-select is wanted

| Option | New deps | React 19 / Tailwind v4 | Verdict |
|---|---|---|---|
| `cmdk` + `@radix-ui/react-popover` (classic shadcn multi-select) | 2 (~2 KB + popover) | Requires `cmdk` ≥ 1.0.4 for React 19 types | Least disruptive — stays on Radix |
| shadcn `Combobox` (`multiple` + `ComboboxChips`) | `@base-ui/react` | Yes | **Now built on Base UI, not Radix** — new primitive family |
| `downshift` (`useSelect`, `useCombobox`, `useTagGroup`) | 1 (~7 KB) | React 19 in peer range | Headless, WAI-ARIA 1.2; you write all markup |
| Base UI `Select multiple` / `Combobox` | `@base-ui/react` | Yes | Native multi-select, but second primitive family |
| Ariakit (`ComboboxSelect` family) | 1 | Yes | Very complete, heavier, second primitive family |
| `react-select` (`isMulti`) | 1 (~20 KB + Emotion) | Yes | Worst fit — CSS-in-JS against a Tailwind codebase |
| `@parag.vora/react-multiselect-ui` | 1 | Explicitly React 19 + Tailwind v4 | Bundles Radix popover + cmdk; young/low-adoption |
| `gjs-select` (shadcn CLI copy-paste) | `radix-ui`, `@tanstack/react-virtual` | React 19 supported | Has `maxCount` + tags mode; virtualization is overkill here |

**Two gotchas that would bite during implementation:**

1. **shadcn's Combobox is Base UI now.** The docs page that shows exactly the S-05 use case (`multiple` with chips) installs `@base-ui/react`; there is no Radix version despite the docs tabs suggesting one (shadcn-ui/ui issues [#9669](https://github.com/shadcn-ui/ui/issues/9669), [#10068](https://github.com/shadcn-ui/ui/issues/10068)).
2. **`components.json` says `"style": "new-york"`** but Tailwind v4 registry entries live under `new-york-v4`, so `npx shadcn add combobox` 404s until the style is changed or the full registry URL is passed (issue [#9400](https://github.com/shadcn-ui/ui/issues/9400)).

Plus the Astro-specific friction already recorded in the S-04 research: Radix Portal components often need `client:only="react"` in Astro, cmdk keyboard nav breaks inside a Portal, cmdk filters on `value` not `label`, and event handlers cannot be passed from `.astro` into an island.

**Tailwind v4 note**: this repo has `"config": ""` (no `tailwind.config`). Any component installed as an *npm package* needs an `@source` directive in `src/styles/global.css` or its utility classes are never generated. Copy-paste components under `src/` avoid this entirely.

## Code References

- `src/components/books/BookFilterBar.astro:65-117` — `<details>` + checkbox trope widget to adapt for the mood picker
- `src/components/books/TropeInput.tsx` — React chip input pattern (island already in use for add/edit)
- `src/lib/book-filters.ts:60-99` — `matchesBookFilters` (AND semantics) and `collectTropeVocabulary`
- `src/lib/book-schema.ts:20` — `tropeListSchema`, the zod pattern to reuse for the 1–3 cap
- `src/lib/database.types.ts:44` — `tropes: string[]` on `books`
- `package.json:15-37` — current dependency set (no multi-select library present)
- `components.json:3` — `style: "new-york"` (blocks the v4 combobox registry)
- `context/foundation/roadmap.md:135-145` — S-05 slice definition
- `context/foundation/lessons.md:47-52` — native HTML over React islands on TBR surfaces

## Architecture Insights

1. **Default architecture**: mood-trope selection submitted as URL params → server-side `.overlaps()` (or in-memory intersection) in Astro frontmatter → server-rendered result cards. No new npm packages, no hydration.
2. **Trope vocabulary source**: reuse `collectTropeVocabulary` over the user's books — the picker must show only the user's own tropes (FR-008), never a global list.
3. **Selection cap**: 1–3 is a validation rule, not a UI trick. Enforce in zod server-side so a hand-edited URL cannot widen the query; any client-side cap is a convenience layer on top.
4. **Three empty states are distinct**: no books at all, books but no tropes, and tropes selected but no matches. Each needs its own copy and its own manual test.
5. **≤2s NFR** is comfortably met by SSR + a single indexed query; no client-side work is on the critical path if the picker stays native HTML.

## Historical Context (from prior changes)

- **F-01 (`tbr-data-and-isolation`)** — settled `tropes text[]` on `books` with RLS; array operators work directly against it.
- **S-01 (`add-book-to-tbr`)** — produced `TropeInput.tsx`, the one place an island was judged genuinely necessary.
- **S-04 (`search-filter-tbr`)** — produced the zero-JS trope checkbox dropdown and `collectTropeVocabulary`; its research reached the same "no new libraries" conclusion for the filter case (`context/archive/2026-08-14-search-filter-tbr/research.md`).

## Recommendation for `/10x-plan`

| Concern | Choice |
|---|---|
| Trope matching | Supabase `.overlaps()` or in-memory intersection — **no library** |
| Result cap (3) | `.limit(3)` / `.slice(0, 3)` with a stated selection order — **no library** |
| Ranking / scoring | **Skip** — PRD Non-Goal |
| Trope picker UI | Adapt the `BookFilterBar.astro` `<details>` + checkbox pattern — **no library** |
| 1–3 selection cap | zod server-side validation — **no library** |
| Multi-select widget | **Defer**; if ever needed, `cmdk` + `@radix-ui/react-popover` (stays on Radix) |
| Fuzzy / similarity matching | **Never** — contradicts the "user wording IS the data" Non-Goal |

## Open Questions

1. **Which 3 books** are returned when more than 3 match — most recently added, DB order, or random? Needs a product decision, since ranking is out of scope but the choice is still visible to the user.
2. **Query vs in-memory**: `.overlaps()` at the DB, or fetch-and-intersect reusing `book-filters.ts` helpers? Both meet the NFR; pick one for testability.
3. **Where the picker lives**: a new route (e.g. `/mood`) versus a panel on `/dashboard` — affects `PROTECTED_ROUTES` in `src/middleware.ts`.
4. **Re-roll affordance**: does the user get a "show me another set" action, or is re-picking tropes the only path? Affects whether selection order matters.

## Sources (web research via Exa, 2026-08-15)

- Supabase JS `overlaps` (array `&&`) — [supabase.com/docs/reference/javascript/using-filters-overlaps](https://supabase.com/docs/reference/javascript/using-filters-overlaps)
- Supabase JS `contains` (array `@>`) — [supabase.com/docs/reference/javascript/v1/contains](https://supabase.com/docs/reference/javascript/v1/contains)
- Postgres array operators in Supabase — [dev.to: The Power of Postgres Arrays in Your Supabase Projects](https://dev.to/ziga_petek_c2bfdf4d05a5cb/the-power-of-postgres-arrays-in-your-supabase-projects-2iml)
- shadcn Combobox with `multiple` + chips — [ui.shadcn.com/docs/components/base/combobox](https://ui.shadcn.com/docs/components/base/combobox)
- shadcn Combobox is Base UI, not Radix — [shadcn-ui/ui#9669](https://github.com/shadcn-ui/ui/issues/9669), [#10068](https://github.com/shadcn-ui/ui/issues/10068)
- shadcn registry needs `new-york-v4` style — [shadcn-ui/ui#9400](https://github.com/shadcn-ui/ui/issues/9400)
- cmdk React 19 type errors below 1.0.4 — [shadcn-ui/ui#6200](https://github.com/shadcn-ui/ui/issues/6200)
- react-select vs cmdk vs Downshift comparison (bundle sizes, multi-select support) — [pkgpulse.com](https://www.pkgpulse.com/guides/react-select-vs-cmdk-vs-downshift-accessible-select-2026)
- Downshift hooks (`useSelect`, `useCombobox`, `useTagGroup`) — [github.com/downshift-js/downshift](https://github.com/downshift-js/downshift)
- Astro island hydration directives and SSR constraints — [docs.astro.build/en/concepts/islands](https://docs.astro.build/en/concepts/islands/)

> Compatibility claims come from vendor docs and issue threads, not from installing anything in this repo. If the plan adopts a third-party package, verify with a real `npm install` plus `npm run build` on the branch before committing to it.
