---
date: 2026-08-14T19:14:00+02:00
researcher: Cursor Agent
git_commit: 170a9ccab986ae7203df55034ce88b7552ce2f92
branch: feat/search-filter-tbr
repository: smart-tbr
topic: "S-04 library options compatible with tech stack (search-filter-tbr)"
tags: [research, s-04, search-filter-tbr, supabase, astro, react, shadcn, libraries]
status: complete
last_updated: 2026-08-14
last_updated_by: Cursor Agent
---

# Research: S-04 library options compatible with tech stack

**Date**: 2026-08-14T19:14:00+02:00  
**Researcher**: Cursor Agent  
**Git Commit**: 170a9ccab986ae7203df55034ce88b7552ce2f92  
**Branch**: feat/search-filter-tbr  
**Repository**: smart-tbr

## Research Question

What libraries are available for implementing S-04 (search and filter the TBR) that are compatible with `context/foundation/tech-stack.md`?

## Summary

**S-04 likely needs zero new npm dependencies.** The stack already provides everything FR-012 requires:

- **Server-side text search**: Supabase PostgREST `.ilike()` + `.or()` for case-insensitive substring match on `title` and `author`.
- **Trope filter**: `.overlaps()` (match any selected trope) or `.contains()` (match all) on the existing `tropes text[]` column.
- **Filter state**: URL query params read from `Astro.url.searchParams` in `src/pages/books/index.astro`, validated with existing `zod` schemas.
- **UI**: Native HTML GET form (search input + trope checkboxes) keeps the browse list zero-JS, matching the established pattern in `BookList.astro`.

Optional libraries exist for fuzzy client-side search, shadcn multi-select widgets, and URL state management — but each adds complexity or scope beyond FR-012. The repo lesson **"Prefer native HTML over React islands on per-row list surfaces"** (`context/foundation/lessons.md`) explicitly names S-04 and recommends URL params before React islands on `/books`.

## Detailed Findings

### S-04 requirements (from roadmap)

- **Outcome**: User can narrow the TBR list by substring match on title/author and/or by selecting one or more trope tags.
- **Change ID**: `search-filter-tbr`
- **PRD ref**: FR-012
- **Prerequisites**: S-02 (browse list) — done
- **Risk note**: Makes a 100+ book list usable; O(N) client filter over ~100 rows fits Workers budget per `lessons.md`.

### Tech stack constraints

From `context/foundation/tech-stack.md` and `AGENTS.md`:

| Constraint | Implication for S-04 |
|---|---|
| Astro v6 SSR + Cloudflare Workers | Server-side filtering preferred; avoid heavy client bundles |
| React 19 islands (selective) | Islands OK for isolated widgets, not per-row list hydration |
| Supabase + RLS | Filter queries stay on `books` table with `user_id` scope |
| shadcn (`new-york`) + Tailwind v4 | UI components available but not required for filter bar |
| zod already in `package.json` | Parse/validate URL params without new deps |
| No AI / no external search SaaS | Rules out Algolia, Typesense, Pagefind for live user data |
| Edge/workerd runtime | Client-side search libs must be dependency-free and browser-safe |

### Current browse implementation baseline

`src/pages/books/index.astro` loads all books server-side:

```ts
await supabase
  .from("books")
  .select("id, title, author, tropes, description, created_at")
  .eq("user_id", user.id);
```

`src/components/books/BookList.astro` renders the list with **zero client JavaScript** — native `<details>`, anchors, and form-post delete. S-04 should extend this pattern, not replace it with a hydrated list.

---

### Layer 1: Server-side filtering (recommended — no new libraries)

#### Supabase PostgREST filters

**Text substring (FR-012)** — use `ilike`, not full-text search:

```ts
let query = supabase
  .from("books")
  .select("id, title, author, tropes, description, created_at")
  .eq("user_id", user.id);

if (q) {
  query = query.or(`title.ilike.%${q}%,author.ilike.%${q}%`);
}
```

- `.textSearch()` / `tsvector` is **wrong** for FR-012: tokenizes and stems ("hai" won't match "The Hairpin"); also requires a generated column to search multiple fields.
- `.ilike()` is the correct primitive for substring match.

**Caveat**: `.or()` expects raw PostgREST syntax. Sanitize or double-quote search terms containing `,`, `(`, `.`, or `"` before interpolating.

**Trope filter** — array operators on `tropes text[]`:

| Semantics | Supabase method | Postgres meaning |
|---|---|---|
| Match **any** selected trope | `.overlaps("tropes", selectedTropes)` | Arrays share ≥1 element |
| Match **all** selected tropes | `.contains("tropes", selectedTropes)` | Column contains every filter value |

FR-012 wording ("selecting one or more trope tags") maps to **any-match** (`overlaps`) unless product decides otherwise.

**Optional DB optimization** (not needed at ~100 rows):

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX books_title_trgm_idx ON books USING gin (title gin_trgm_ops);
CREATE INDEX books_author_trgm_idx ON books USING gin (author gin_trgm_ops);
```

`pg_trgm` GIN indexes accelerate unanchored `ILIKE '%pattern%'` on short text fields. Sequential scan is faster below ~1000 rows; add only if profiling shows need.

#### URL state (no nuqs required)

Read filters in Astro frontmatter:

```ts
const q = Astro.url.searchParams.get("q") ?? "";
const tropes = Astro.url.searchParams.getAll("trope");
```

Validate with zod (reuse patterns from `src/lib/book-schema.ts`). Native GET form submits update the URL; page re-renders server-side — shareable, bookmarkable, works with JS disabled.

**nuqs** (type-safe React URL state): no stock Astro adapter; requires custom `serverSearch={Astro.url.search}` prop per island to avoid React #418 hydration mismatch. Overkill when Astro already owns the request URL server-side.

---

### Layer 2: Client-side fuzzy search (optional — scope beyond FR-012)

Only needed if product wants **typo tolerance** beyond substring match. Requires a React island; data already loaded or fetched once.

| Library | Version (npm) | Min size | Pros | Cons |
|---|---|---|---|---|
| `@leeoniya/ufuzzy` | 1.0.19 | ~7.6 KB | Fastest; zero deps; no index build | Searches flat strings only — concat title+author |
| `fuzzysort` | latest | ~6.2 KB | Multi-key object search; good ranking | Less configurable than Fuse |
| `fuse.js` | 7.5.0 | ~24 KB | Best fuzzy quality; field weights | Slowest (irrelevant at ~100 rows) |
| `minisearch` | latest | ~29 KB | Token-based FTS in browser | Overkill for two short fields |

At ~100 books, performance differences are noise (benchmarks at 162k items). **Recommendation if fuzzy is wanted**: `fuzzysort` (native multi-field object search).

**Ruled out**:

- **Pagefind** — static build-time index; cannot index per-user private Supabase rows.
- **Algolia / Typesense** — external SaaS; contradicts PRD non-goals and adds sync complexity.

---

### Layer 3: Trope filter UI widgets (optional)

#### Native HTML (recommended)

- `<form method="GET">` with text `<input name="q">` and `<input type="checkbox" name="trope" value="…">` per distinct trope derived from user's books.
- Zero JS, aligns with `BookList.astro` and `lessons.md`.

#### shadcn combobox / multi-select (if richer UX required)

Requires adding:

| Package | Version | React 19 peer |
|---|---|---|
| `cmdk` | 1.1.1 | `^18 \|\| ^19` |
| `@radix-ui/react-popover` | 1.1.23 | `^16.8 … ^19` |

Pattern: Popover + Command + Badge chips (shadcn has no official multi-select; assemble from primitives or copy a community block).

**Known friction in Astro + Radix + cmdk**:

- Radix Portal components can fail Astro SSR hydration → often need `client:only="react"`.
- cmdk keyboard nav breaks when `Command.List` is inside Radix Portal (GitHub issues on cmdk #95, radix #1386).
- cmdk filters on `value`, not `label` — use `keywords` prop on `Command.Item`.
- Cannot pass React event handlers from `.astro` to islands (functions serialize to null); island must be self-contained `.tsx`.
- May need `experimentalReactChildren: true` in `@astrojs/react` if passing children from Astro.

Given trope vocabulary is the user's own modest tag set, checkboxes or existing `TropeInput.tsx` patterns are lower risk.

#### Third-party multi-select packages

| Package | Notes |
|---|---|
| `@parag.vora/react-multiselect-ui` | React 19 + Tailwind v4 peer; bundles cmdk + Radix popover |
| `downshift` | Headless hooks (`useCombobox`, `useTagGroup`); more assembly, ARIA 1.2 |
| `react-select` | Heavy; community workaround when shadcn combobox is insufficient |

Not recommended unless shadcn primitives prove insufficient after trying native HTML.

---

### Layer 4: URL state libraries (optional)

| Library | Fit | Verdict |
|---|---|---|
| **nuqs** | React SPA, Next.js, Remix; Astro needs custom adapter | Skip — use `Astro.url.searchParams` |
| **Native GET form** | SSR-first, zero deps | **Use this** |

---

## Code References

- `src/pages/books/index.astro:74-96` — current server-side book fetch (extension point for filters)
- `src/components/books/BookList.astro:17-60` — zero-JS list rendering pattern to preserve
- `src/lib/book-schema.ts` — zod validation patterns to reuse for URL params
- `src/lib/sort-books-for-browse.ts` — post-query sort; apply after filtering
- `context/foundation/roadmap.md:171-181` — S-04 slice definition
- `context/foundation/tech-stack.md` — stack constraints
- `context/foundation/lessons.md:47-52` — native HTML over React islands on `/books` (names S-04)

## Architecture Insights

1. **Default architecture**: SSR filter in Astro frontmatter → filtered query to Supabase → same `BookList.astro` render. No new npm packages.
2. **Filter bar UI**: Native GET form above the list; trope options computed from distinct values in the fetched (or separately queried) trope set.
3. **Combined filters**: Apply text `or(ilike…)` and trope `overlaps()` as AND conditions on the same query builder chain.
4. **Empty states**: Distinguish "no books in TBR" (existing) from "no matches for current filters" (new copy).
5. **Do not** hydrate the per-row book list — lesson explicitly warns silent JS dependency at 145+ rows.

## Historical Context (from prior changes)

- **F-01 (`tbr-data-and-isolation`)** — established `books` table with `tropes text[]` and RLS; trope storage shape is settled (archived `context/archive/2026-07-04-tbr-data-and-isolation/`).
- **S-02 (`browse-tbr-list`)** — deliberately server-rendered list with zero client JS; S-04 should extend, not replace.
- **S-03 (`edit-delete-book`)** — edit/delete affordances on list rows; filters must not break row anchors or delete modals.

## Recommendation for `/10x-plan`

| Concern | Choice |
|---|---|
| Text search | Supabase `.ilike()` + `.or()` — **no library** |
| Trope filter | Supabase `.overlaps()` — **no library** |
| Filter state | URL query params + zod — **no library** |
| Filter UI | Native HTML GET form — **no library** |
| Fuzzy search | **Defer** (not FR-012); if added later, `fuzzysort` in a small island |
| Multi-select widget | **Defer**; native checkboxes first |
| pg_trgm index | **Defer** until row count or latency warrants |

## Open Questions

1. **Trope filter semantics**: `overlaps` (any) vs `contains` (all) — FR-012 says "selecting one or more trope tags" which implies any-match; confirm in plan.
2. **Trope option source**: Derive distinct tropes from full TBR query vs separate lightweight query — plan should pick one.
3. **Search across description**: FR-012 specifies title/author only; exclude `description` unless product expands scope.

## Sources (web research via Exa, 2026-08-14)

- Supabase JS filters: `ilike`, `or`, `overlaps`, `contains` — [supabase.com/docs/reference/javascript](https://supabase.com/docs/reference/javascript/like)
- Postgres `pg_trgm` for ILIKE indexing — [postgresql.org/docs/18/pgtrgm.html](https://www.postgresql.org/docs/18/pgtrgm.html)
- Client search benchmarks: uFuzzy compare page, Fuse.js vs MiniSearch — [github.com/leeoniya/uFuzzy](https://github.com/leeoniya/uFuzzy)
- shadcn combobox multi-select — [ui.shadcn.com/docs/components/combobox](https://ui.shadcn.com/docs/components/base/combobox)
- cmdk + Radix Portal issues — [github.com/pacocoursey/cmdk/issues/95](https://github.com/pacocoursey/cmdk/issues/95)
- nuqs Astro SSR gap — [github.com/47ng/nuqs/discussions/1425](https://github.com/47ng/nuqs/discussions/1425)
- Astro native filter pattern — anchor chips + URL params (Passionfruit CollectionFilter pattern)

## As-built UI notes (Phase 2, 2026-08-15)

Research assumed inline trope checkboxes in the GET form. During implementation, large trope vocabularies led to a **collapsible `<details>` dropdown** beside the search field (still native HTML, zero JS). Other Phase 2 UI decisions (search clear link, always-visible Clear filters, placeholder copy) are recorded in `change.md`.
