---
change_id: browse-tbr-list
title: Browse the TBR list
status: implemented
created: 2026-08-08
updated: 2026-08-11
archived_at: null
---

## Notes

S-02 from @context/foundation/roadmap.md

### Local seed amendments (post-plan)

During Phase 2 manual verification, `supabase/seed.sql` was updated:

- **User C** (25 browse-TBR books) merged from the deleted `supabase/fixtures/populated-tbr.sql` — loads on every `db reset`.
- **User D** added as an empty-TBR account for empty-state testing.
- **Auth token columns** set to `''` on all manual `auth.users` inserts (GoTrue requires non-NULL strings).

Local test accounts (password `password123` for all):

| Email | Books | Use |
| --- | --- | --- |
| `user-a@example.test` | 6 | RLS / isolation |
| `user-b@example.test` | 6 | RLS / isolation |
| `user-c@example.test` | 25 | Browse list / ordering / clamping |
| `user-d@example.test` | 0 | Empty state |

### Post-plan UX amendments (2026-08-11)

During Phase 3 manual verification:

- **Natural title sort** — when `created_at` ties, browse order uses numeric-aware title comparison (`localeCompare` with `{ numeric: true }`) instead of plain alphabetical order, so e.g. `Scale Test 20` sorts before `Scale Test 100`.
- **Sign out on TBR pages** — `SignOutButton.astro` added to `/books` and `/books/new` header rows (FR-003 reachable without returning to dashboard).
- **Auth-aware landing** — `Welcome.astro` shows SmartTBR CTAs when signed in; starter copy replaced with product messaging when signed out. Topbar is hidden when signed out (hero CTAs are enough); kept when signed in for Dashboard / Sign out.
- **Sign-in redirect** — `POST /api/auth/signin` redirects to `/dashboard` (authenticated home; TBR and add-book linked from there).
- **Dashboard copy** — removed starter-only “authenticated users” helper text.

Phase 3 manual verification completed 2026-08-11.

