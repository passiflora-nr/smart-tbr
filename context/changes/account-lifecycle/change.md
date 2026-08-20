---
change_id: account-lifecycle
title: Account lifecycle — gating and self-serve deletion
status: implementing
created: 2026-08-15
updated: 2026-08-20
archived_at: null
---

## Notes

S-06 from @context/foundation/roadmap.md

Library survey is in `research.md` (Exa 2026-08-16; refresh/verify 2026-08-20). Headline unchanged: no new auth/GDPR package; use existing `@supabase/supabase-js` Admin API + FK cascade + native HTML confirm. New infra (not a library): server-only `SUPABASE_SERVICE_ROLE_KEY` (legacy `service_role` JWT or `sb_secret_…`).
