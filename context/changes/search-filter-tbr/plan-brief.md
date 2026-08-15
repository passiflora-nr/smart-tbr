# Search and Filter the TBR (S-04) — Plan Brief

> Full plan: `context/changes/search-filter-tbr/plan.md`
> Research: `context/changes/search-filter-tbr/research.md`

## What & Why

A flat list of 100+ books is unusable — the counter-argument that produced FR-012 in the first place. This slice lets a signed-in user narrow `/books` by a case-insensitive substring match on title or author, and/or by ticking one or more of their own trope tags. Filter state lives in the URL, so a filtered view is shareable, bookmarkable, and survives a reload.

## Starting Point

`/books` fetches every book the user owns in one query, sorts it, and renders it through a deliberately zero-JavaScript list component. It runs a three-state machine (failed / empty / populated) and shows a total count in the heading. Nothing narrows the list today. Separately, every mutation redirect currently returns to a hardcoded bare `/books`, discarding any query parameters — which is why filter persistence is a real piece of work rather than a footnote.

## Desired End State

A compact filter bar sits above the list: a labelled search field (`Search…` placeholder), a collapsible **Tropes** dropdown with checkboxes in a scrollable panel, **Apply filters**, and an always-visible **Clear filters** (link when active, greyed when not). Submitting reloads the page at a URL like `/books?q=hairpin&trope=Grumpy%20Sunshine`, showing only matching books under a heading reading `Your TBR (12 of 143)`. When nothing matches, a distinct message says so; clearing is via the bar's **Clear filters** control only.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Libraries | None — zero new npm dependencies | The stack already covers every requirement; fuzzy search, `cmdk`, and `nuqs` were all evaluated and deferred. | Research |
| Filter transport | URL query params via a native GET form | `lessons.md` names S-04 explicitly and mandates native HTML over React islands on this page. | Research |
| Where filtering runs | In Astro frontmatter, over rows already fetched | The trope vocabulary and the "of 143" total both need the unfiltered set anyway, so this costs one query instead of two and removes the PostgREST escaping/injection risk entirely. | Plan |
| Multi-trope semantics | All-match (a book needs every selected trope) | Ticking more boxes should narrow, as it does in every other filter UI; FR-010's any-match suits *asking for suggestions*, not *hunting through a list*. | Plan |
| Stale tropes in a URL | Kept in the filter and rendered as a ticked box | All-match makes silent dropping wrong — it would widen results — so the trope stays and stays visible so it can be unticked. | Plan |
| Search scope | Title and author only | FR-012 says so, and description matches would be invisible on a collapsed row. | Plan |
| Trope option source | All distinct tropes across the whole TBR | Keeps the checkbox list stable so a ticked trope can never vanish and strand the user. | Plan |
| Trope filter UI | Collapsible `<details>` dropdown beside search | ~60+ distinct tropes made an inline checkbox grid unusable; still native HTML, zero JS. | Phase 2 impl |
| Search clear | Server-side × link (`type="text"` input) | Browser `type="search"` clear only wipes the field locally — filters stay applied in the URL. | Phase 2 impl |
| Clear filters placement | Always visible in filter bar; greyed when inactive | One control, predictable layout; no duplicate link in the no-match message. | Phase 2 impl |
| Zero-match state | Distinct message; clear via filter bar | Reusing empty-TBR copy would tell a user with 143 books that their TBR is empty. | Plan |
| Heading count | `Your TBR (12 of 143)` | Makes the filter's effect legible and reassures the user that a bookmarked filtered view isn't data loss. | Plan |
| Filters after edit/delete | Preserved | Filtering to a trope then cleaning up several books in a row is the migration workflow S-04 exists for. | Plan |
| Return-trip safety | Carry `q`/`trope` values, rebuild the URL server-side | Accepting a caller-supplied return URL would be an open-redirect hole. | Plan |

## Scope

**In scope:** substring search on title/author; all-match trope filtering; URL-based filter state; trope checkbox vocabulary in a collapsible dropdown; `N of M` heading; distinct no-match state; always-visible **Clear filters** in the filter bar; per-field search clear (×); filter survival across edit and delete.

**Out of scope:** fuzzy/typo-tolerant search; searching descriptions; diacritic folding; trope normalization; `pg_trgm` or other DB indexing; sort controls; pagination; saved filters; any new dependency; any React island on `/books`; wiring a test framework.

## Architecture / Approach

One Supabase query fetches all the user's books, as today. Frontmatter then collects the trope vocabulary from the full set, unions in whatever tropes the URL selected so none can go unrendered, filters the raw rows, and sorts the survivors — in that order, which matters. All of it runs on the Cloudflare Worker during SSR, so the list page stays zero-JavaScript. A new `src/lib/book-filters.ts` owns every filter decision (parsing, matching, vocabulary, URL serialization) as a dependency-free pure module shared by the page, the components, and the delete API.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Filter core | `src/lib/book-filters.ts` — parsing, matching, vocabulary, URL building. Nothing user-visible. | Must stay free of server-only imports, since a React island imports it in Phase 3. |
| 2. Filter bar and page wiring | The working feature: filter bar, filtered results, `N of M` heading, no-match state. | The frontmatter ordering — collect vocabulary before filtering, filter before sorting — is easy to get backwards. |
| 3. Filter persistence | Filters survive edit and delete round-trips. | Touches six files across three redirect paths; regressing the flash-message or highlight behaviour is the likely failure. |

**Prerequisites:** S-02 (browse list) and S-03 (edit/delete), both done and archived. Work happens on `feat/search-filter-tbr`.

**Estimated effort:** ~2-3 sessions; Phase 2 is the bulk, Phase 3 is broad but shallow.

## Open Risks & Assumptions

- Assumes low-hundreds of books per user. Fetching every row per request is fine at the 145 verified today but would need moving into the Supabase query if a user reached low thousands.
- All-match trope semantics diverges from the recommendation screen (FR-010), which stays any-match. The two screens have different jobs — hunting versus asking for suggestions — but it is a deliberate inconsistency worth naming.
- Because tropes are free text, near-duplicate tags (`enemies to lovers` vs `enemies-to-lovers`) tick as separate boxes, and selecting both returns nothing under all-match. Visible via the result count rather than mysterious, but a likely source of user confusion.
- Phase 3 touches the delete and edit redirect plumbing built in S-03, so the highest regression risk in this slice is to already-shipped behaviour rather than to the new feature.
- No automated tests exist, so every behavioural guarantee here rests on the manual checklist — including the JavaScript-disabled pass that `lessons.md` requires.

## Success Criteria (Summary)

- A user with a large TBR can find a specific book by typing part of its title or author, and can narrow to a mood by ticking tropes.
- A filtered view can be bookmarked or shared and reproduces exactly when reopened.
- Cleaning up several books in a row from a filtered view never throws the user back to the unfiltered list.
