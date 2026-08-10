---
change_id: browse-tbr-list
title: Browse the TBR list
status: implementing
created: 2026-08-08
updated: 2026-08-10
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

Phase 2 manual verification completed 2026-08-10.
