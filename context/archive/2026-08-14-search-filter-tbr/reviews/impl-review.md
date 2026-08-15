<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Search and Filter the TBR (S-04)

- **Plan**: `context/changes/search-filter-tbr/plan.md`
- **Scope**: Phases 1–3 of 3 (full plan)
- **Date**: 2026-08-15
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Commits reviewed: `d535bbf` (p1), `cfdf00d` (p2), `38e786e` (p3), `8af9f9a` (epilogue). Base `1dc6922`.

Eight source files changed, all eight named in the plan; no unplanned source files. The other files in the range (`AGENTS.md`, `.cursor/permissions.json`, `.cursor/sandbox.json`, `context/foundation/manual-testing.md`, `context/foundation/README.md`, `context/foundation/lessons.md`) arrived from the merged chore PR #20 and are not part of this slice.

Automated verification re-run at review time: `npx astro sync` passes, `npm run lint` passes with 0 errors and 7 pre-existing `no-console` warnings, `npm run build` completes.

## Findings

### F1 — Malformed POST body to the delete route returns a 500 instead of a redirect

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/books/[id]/delete.ts:7
- **Detail**: `const form = await context.request.formData();` is now the first statement in the handler and is unguarded. `formData()` throws a `TypeError` when the body is not form-encoded — no `Content-Type`, `application/json`, `text/plain`, or malformed multipart all throw, and the throw escapes to Astro's error boundary as a 500 error page. Before this change the route never read the body, so this is a new failure mode introduced here.

  Not a security issue. Astro's origin check (`node_modules/astro/dist/core/app/middlewares.js:19-32`) rejects cross-site non-GET requests that are form-like *and* those with no `Content-Type` at all, and a cross-origin JSON POST needs a CORS preflight the Worker never grants — so a hostile page cannot reach this line. The throw also happens before authentication and before the delete, so nothing is deleted. The consequence is purely robustness: a malformed or non-browser POST gets an error page where every other path in this route redirects gracefully.

  Note the same unguarded pattern already exists in `src/pages/api/auth/signin.ts:5` and `signup.ts` — the plan explicitly instructed the implementer to copy that ordering, so this is inherited rather than a deviation.
- **Fix**: Default to empty filters on a parse failure: `const form = await context.request.formData().catch(() => new FormData());`. Every redirect target already tolerates an empty `filterQuery`, so the route degrades to an unfiltered `/books` redirect. Consider the same guard in the two auth routes.
  - Strength: One line, no behaviour change on the happy path, and it removes the only 500 path in a route that otherwise always redirects.
  - Tradeoff: A genuinely broken request silently loses its filter context instead of surfacing an error — which is the desired outcome for a delete confirmation.
  - Confidence: HIGH — the throwing content types were confirmed directly against the `Request` implementation, and the origin-check reachability was confirmed by reading Astro's middleware source.
  - Blind spot: None significant.
- **Decision**: FIXED — `.catch(() => new FormData())` applied in `delete.ts`, `signin.ts`, and `signup.ts`

### F2 — Nothing caps the number of `trope` params, so a crafted URL inflates the rendered page

- **Severity**: 👀 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/book-filters.ts:23-36, src/pages/books/index.astro:112
- **Detail**: `parseFilterTropes` trims and dedupes but imposes no count limit, and `collectTropeVocabulary` unions every supplied trope into the vocabulary whether or not any book carries it (`book-filters.ts:81-87`), so `BookFilterBar` renders one checkbox per param. At 10,000 distinct `trope=` params parsing stays cheap (~3ms, no throw) but the vocabulary serialises to ~118KB and the page grows to a few hundred KB. Cloudflare's ~16KB URL cap bounds the GET vector to roughly 1,300 tropes. Through the delete route the values arrive in a POST body with no URL cap and are reflected into the `Location` header, which could exceed Cloudflare's response-header limit.

  This is self-inflicted — the victim must open the crafted link, no other user is affected, and nothing is disclosed. It is also partly self-limiting: because trope matching is all-match, a bogus trope set yields the `no-match` state, which renders no `DeleteBookModal` instances and so avoids a per-book hidden-input explosion.

  **The obvious fix is forbidden by the plan.** A parallel review recommended capping the trope count at `tropeListSchema`'s max of 25; `plan.md:79` explicitly rules that out, and correctly so — dropping tropes from an all-match filter *widens* the result set, which is the exact failure the plan's Critical Implementation Details forbid, and manual criterion 2.6 tests against it.
- **Fix**: If bounding this is worth it, truncate to 26 rather than 25. A book can hold at most 25 tropes (`book-schema.ts:20`), so any filter naming 26 or more provably matches nothing — keeping the first 26 preserves the zero-match outcome exactly while bounding what is serialised and rendered. Otherwise accept it as a self-inflicted nuisance.
  - Strength: Bounds the amplification without ever widening the result set, so criterion 2.6 still holds.
  - Tradeoff: Adds a magic number coupled to the per-book trope cap, and the 27th-plus trope stops rendering as a ticked box.
  - Confidence: MEDIUM — the semantics are sound, but the risk being mitigated is small enough that doing nothing is defensible.
  - Blind spot: Cloudflare's exact response-header ceiling was not measured against a real deploy.
- **Decision**: FIXED — `parseFilterTropes` stops at 26 tropes (`MAX_FILTER_TROPES`)

### F3 — `buildBooksHref` interpolates `hash` raw while encoding everything else

- **Severity**: 👀 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/book-filters.ts:116
- **Detail**: `const hash = options?.hash ? `#${options.hash}` : "";` is the only input to this function that bypasses `URLSearchParams`. All four current callers pass `book-${id}` where the id is either UUID-validated (`index.astro:64`, `delete.ts:29`) or a server-supplied row id (`EditBookForm.tsx:236,238,358`), so it is safe today. But the function itself offers no guarantee: `buildBooksHref("", { hash: "/@evil.com" })` returns `/books#/@evil.com`. Since the plan designates this function as the single place URLs are built — the security boundary for the whole feature — the invariant should live in the function rather than depend on every present and future caller.
- **Fix**: Run `hash` through `encodeURIComponent` before interpolating.
- **Decision**: FIXED — `hash` passed through `encodeURIComponent` in `buildBooksHref`

### F4 — The edit href is the one filter-aware URL built outside `buildBooksHref`

- **Severity**: 👀 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/books/BookList.astro:29
- **Detail**: The edit anchor is assembled by raw template interpolation: `filterQuery.length > 0 ? `/books/${book.id}/edit?${filterQuery}` : `/books/${book.id}/edit``. It is safe — `filterQuery` is already percent-encoded and Astro escapes the attribute — but it sits outside the `buildBooksHref` discipline the rest of the feature follows, and it is where the `?`-versus-nothing decision is made a second time.

  Related and plan-mandated rather than drift: filter state reaches sibling components in two shapes, `filterQuery: string` for `BookList` and `EditBookForm` versus `filters: BookFilters` for `DeleteBookModal`, and both pages call `parseBookFilters` twice (`index.astro:45` and `:90`; `edit.astro:21` and `:53`). The two derivations agree today, but they are two representations of one piece of state with nothing tying them together.
- **Fix**: Add a sibling `buildEditHref(id, filterQuery)` to `book-filters.ts` so all URL construction stays in one auditable module, and derive `filterQuery` from the single parsed `filters` (`serializeBookFilters(filters)`) instead of parsing twice.
- **Decision**: FIXED — added `buildEditHref`; single `parseBookFilters` + `serializeBookFilters` on `index.astro` and `edit.astro`

### F5 — The `q` zod schema is decorative; its failure path re-implements its success path

- **Severity**: 👀 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/book-filters.ts:9-21
- **Detail**: `filterQSchema` trims then rejects over 300 chars, and `parseFilterQ`'s fallback is `(raw ?? "").trim().slice(0, 300)` — so both branches converge on the same value by different routes and the schema earns nothing. Two side effects: an overlong `q` is silently truncated and searches for a prefix the user never typed, and `.slice(0, 300)` can split a surrogate pair, leaving a lone surrogate. That does not throw only because `URLSearchParams` substitutes U+FFFD, so the documented "never throws" guarantee is load-bearing on the current encoding path (`encodeURIComponent` on the same value would raise `URIError`).

  This followed the plan, which asked for zod in the trim-then-pipe style of `book-schema.ts` — so it is not drift, just an abstraction that does not pay for itself here.
- **Fix**: Replace the schema with a plain `(raw ?? "").trim().slice(0, 300)`, slicing on code points to avoid splitting a surrogate pair.
- **Decision**: FIXED — removed decorative `filterQSchema`; `parseFilterQ` uses `truncateToCodePoints` at 300

## Triage summary (2026-08-15)

| Finding | Decision |
|---------|----------|
| F1 | FIXED — `.catch(() => new FormData())` in delete, signin, signup |
| F2 | FIXED — `MAX_FILTER_TROPES = 26` cap in `parseFilterTropes` |
| F3 | FIXED — `encodeURIComponent` on hash in `buildBooksHref` |
| F4 | FIXED — `buildEditHref`; single parse on index and edit pages |
| F5 | FIXED — plain trim + code-point truncate; zod removed for `q` |

All five findings fixed. Post-triage lint: pass (0 errors).

## Note on what was compared against what

`cfdf00d` changed `plan.md` alongside `BookFilterBar.astro`, rewriting the Phase 2 contract from "a `<fieldset>` with a `<legend>` wrapping one checkbox per vocabulary entry … and — only when `hasActiveFilters(filters)` — a Clear filters anchor" into the `<details>` dropdown, `type="text"` plus × link, and always-visible Clear filters that were actually built. A plain "matches the plan" verdict on the filter bar is therefore partly self-referential, so it was checked against the original text as well.

It holds up, and needs no action: every delta is recorded with its reasoning in `change.md:17-21` (large vocabularies made the flat checkbox grid unusable, the native search-clear control does not reload the page, one Clear control instead of two), the amendment landed in the same commit as the code rather than being backfilled at close-out, and the Phase 1 and Phase 3 contracts — which carry all the security and correctness semantics — were never touched, so those were verified against the plan as originally written. This is the documented-addendum pattern working as intended; recorded only so the review trail is honest.

## What was verified clean

Recorded so a later reader knows these were checked rather than skipped.

**Plan adherence.** All six `book-filters.ts` exports match their contracts, including the load-bearing ones: no 25-trope cap, `tropeListSchema` never reused, an overlong trope kept in the filter so all-match returns zero, and no path that degrades a trope-bearing request into an empty filter. Frontmatter ordering in `index.astro:112-114` is fetch → vocabulary from *all* rows → filter → sort, so a selected-but-absent trope still renders a tickable checkbox. The four-state machine, the `N of M` heading, the `filterQuery`/`filters` props, all five `buildBooksHref` redirects in `delete.ts`, `formData()` before the supabase null check, `append` rather than `Object.fromEntries` for repeated tropes, the `#book-<id>` fragment on the notice path, `edit.astro`'s pre-redirect `filterQuery` derivation, and all three `EditBookForm` destinations are as specified. `/auth/signin` redirects left bare in both routes.

**Open redirect and header injection.** Clean, and the strongest part of the change. Every redirect target is rebuilt server-side from individual validated values onto a hard-coded `/books` literal, never from a caller-supplied URL. Fifteen hostile `q` payloads (`//evil.com`, `https://evil.com`, CRLF, `%0d%0a`, `?x=1`, `#frag`, `&notice=deleted`, null bytes, unicode) all resolved to same-origin `/books` with no raw CR or LF surviving. The `&notice=deleted` case confirms no parameter smuggling, since `serializeBookFilters` builds a fresh `URLSearchParams` holding only `q` and `trope`.

**XSS.** No `set:html` or `dangerouslySetInnerHTML` anywhere in the changed files. Every interpolation of `q` or a trope value sits in an Astro expression in text or attribute position and is escaped automatically.

**Multi-tenant scoping and the hard delete.** `delete.ts:35-40` still scopes by `.eq("user_id", user.id)`, `index.astro:103` still filters by owner, `edit.astro` scopes by both id and owner. The new form fields feed only redirect construction and never touch a query. FR-011 holds.

**Performance.** No accidental O(N²). At the current 145 rows the filter pass is ~0.06ms and vocabulary collection ~0.5ms warm; even at 50,000 rows the whole path stays under ~5ms, four orders of magnitude inside the Worker CPU budget. `matchesBookFilters` is bounded by ≤25 tropes per book. The `localeCompare` comparator in `collectTropeVocabulary:89` constructs a collator per comparison and would be ~10× faster with a hoisted `Intl.Collator`, but it scales with vocabulary size (100–200 in practice, sub-millisecond) and `sort-books-for-browse.ts:15` already does the same — a repo-wide micro-optimisation, not a defect here.

**Scope discipline.** No new npm dependency (`package.json` and `package-lock.json` unchanged). No `client:*` directive on `/books` — the page stays zero-JS, satisfying `lessons.md:47-52`. No search inside `description`, no diacritic folding, no trope normalization, no sort or pagination controls. The only additions not named in the plan are three trivial details inside the planned `BookFilterBar.astro`: `maxlength={300}` mirroring the parser clamp, an `aria-hidden` spacer paragraph for baseline alignment, and a `tropeVocabulary.length > 0` guard around the dropdown that cannot suppress a stale-trope checkbox (the vocabulary is unioned with the selection, and the per-book schema requires at least one trope).

**Repo conventions.** All new imports use the `@/*` alias. `book-filters.ts` imports only `zod` and a type-only `Tables`, and `database.types.ts` has no imports at all, so the transitive closure reachable from the `EditBookForm` island contains zero `astro:env/server` references — the client-safety contract holds. `createClient` is null-checked at `delete.ts:17`, `index.astro:97`, `edit.astro:25`. No new routes, `run_worker_first` unchanged, no Node-only APIs. The new `typeof` guards in `delete.ts:10-12` are an improvement on the unchecked `as string` casts in `signin.ts:6-7`.

**Success criteria.** All nine automated checks re-run and pass. The manual items were checked off by the project owner; the ones with observable evidence in the diff (zero-JS by construction, `data-unsaved-guard` preserved on both anchors, tamper-proof redirects by construction) are consistent with the code, so no rubber-stamping is suspected.
