---
change_id: search-filter-tbr
title: Search filter tbr
status: impl_reviewed
created: 2026-08-14
updated: 2026-08-15
archived_at: null
---

## Notes

- Library research for S-04 captured in `research.md` (2026-08-14): default path is zero new npm deps — Supabase filters + URL params + native HTML GET form.
- Plan written 2026-08-14 (`plan.md`, `plan-brief.md`). Departs from `research.md` on two points:
  - **Filtering runs in Astro frontmatter** over the already-fetched rows rather than in the Supabase query. Sourcing trope options and the result total from the full TBR requires fetching every row anyway, so this drops a second query and removes the PostgREST `.or()` escaping risk.
  - **Multi-trope filtering is all-match**, not the `overlaps` any-match research inferred from FR-012's wording (its Open Question #1). Reversed after review: ticking more boxes should narrow, as in every other filter UI. FR-010's any-match fits *asking for recommendations*, where zero results is a dead end; filtering is *hunting*, where zero results is informative and one untick away from recovery. Knock-on: a trope in the URL that no book carries can no longer be silently dropped (that would widen results), so it is kept in the filter and rendered as a ticked box.
- Plan review 2026-08-14 (`reviews/plan-review.md`): REVISE → SOUND after triage. F1 threaded filters through Edit Cancel and edit.astro load-error redirects; F2 dropped the per-book 25-trope cap on filter parse so invalid input cannot widen results; F3 reads delete formData before the first redirect.
- Phase 2 implementation (2026-08-15) — filter bar UI refinements during manual testing (still native HTML GET form, zero JS):
  - **Tropes in a `<details>` dropdown** beside the search field, not an inline checkbox grid. Large vocabularies (~60+ tropes) made the original flat layout unusable. Checkboxes live in a scrollable panel (`max-h-64`); summary shows `Tropes · N selected` when active. Panel stays **collapsed after Apply filters** (do not force `open` on reload).
  - **Search uses `type="text"`**, not `type="search"`. The browser's native search clear control only wipes the input locally and does not reload without `q` — filters appeared stuck. Replaced with a visible **× link** when `q` is active; it navigates via `buildBooksHref` and keeps trope selections.
  - **Clear filters always visible** in the filter bar: a link to `/books` when filters are active, a greyed-out `<span aria-disabled="true">` when none. Removed the duplicate link from the no-match message — one control in the bar is enough.
  - **Search placeholder** is `Search…`; the label above (`Search title or author`) carries the scope hint.
- Implementation review 2026-08-15 (`reviews/impl-review.md`): APPROVED — no plan drift across all three phases, no security findings (open redirect, header injection, XSS, and row scoping all verified clean), automated verification re-run green. One warning: the delete route's new unguarded `formData()` read returns a 500 on a non-form body. Four observations, including that the cap-at-25 fix a parallel reviewer suggested for unbounded `trope` params is forbidden by the plan because dropping tropes would widen results.
