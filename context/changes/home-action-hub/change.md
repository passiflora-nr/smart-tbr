---
change_id: home-action-hub
title: Home as signed-in action hub
status: implementing
created: 2026-08-15
updated: 2026-08-15
archived_at: null
---

## Notes

Spin-off from mood-trope-recommendation impl-review F1 (2026-08-15). The mood slice (S-05) keeps `/dashboard` as the post-sign-in hub; this change moves primary navigation to `/` for signed-in users.

**Depends on:** mood-trope-recommendation (S-05) merged — signed-in home exposes **Pick by mood** linking to `/mood`.

**Intent:** After sign-in, land on `/` (not `/dashboard`). Signed-in home becomes the action hub (Pick by mood, View TBR, Add book). `/dashboard` redirects to `/` for legacy bookmarks. Topbar and book-page nav links say **Home** instead of **Dashboard**.
