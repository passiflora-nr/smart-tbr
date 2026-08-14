---
change_id: search-filter-tbr
title: Search filter tbr
status: plan_reviewed
created: 2026-08-14
updated: 2026-08-14
archived_at: null
---

## Notes

- Library research for S-04 captured in `research.md` (2026-08-14): default path is zero new npm deps — Supabase filters + URL params + native HTML GET form.
- Plan written 2026-08-14 (`plan.md`, `plan-brief.md`). Departs from `research.md` on two points:
  - **Filtering runs in Astro frontmatter** over the already-fetched rows rather than in the Supabase query. Sourcing trope options and the result total from the full TBR requires fetching every row anyway, so this drops a second query and removes the PostgREST `.or()` escaping risk.
  - **Multi-trope filtering is all-match**, not the `overlaps` any-match research inferred from FR-012's wording (its Open Question #1). Reversed after review: ticking more boxes should narrow, as in every other filter UI. FR-010's any-match fits *asking for recommendations*, where zero results is a dead end; filtering is *hunting*, where zero results is informative and one untick away from recovery. Knock-on: a trope in the URL that no book carries can no longer be silently dropped (that would widen results), so it is kept in the filter and rendered as a ticked box.
- Plan review 2026-08-14 (`reviews/plan-review.md`): REVISE → SOUND after triage. F1 threaded filters through Edit Cancel and edit.astro load-error redirects; F2 dropped the per-book 25-trope cap on filter parse so invalid input cannot widen results; F3 reads delete formData before the first redirect.
