# Account Lifecycle — Plan Brief

> Full plan: `context/changes/account-lifecycle/plan.md`
> Research: `context/changes/account-lifecycle/research.md`

## What & Why

S-06 gives beta testers a clean exit. A signed-in user gets a new **Account** page where they can permanently delete their own account; the deletion also removes every book and trope tag they own and ends their session immediately. It also closes the last route-gating gap so no private page is reachable while signed out. This is FR-013, a must-have the PRD justified as "a common privacy expectation without requiring out-of-band operator involvement."

## Starting Point

Route gating is already ~90% done — `/books` and `/mood` are in `PROTECTED_ROUTES`, which covers the add and edit pages by prefix. The database cascade FR-013 needs already shipped with F-01: `books.user_id` references `auth.users` with `on delete cascade`, and tropes are a `text[]` column on the same row. What does not exist is any account page, any admin-capable Supabase client, and the service-role key such a client requires. The roadmap still lists the cascade mechanism as an open unknown — that entry is stale and this plan corrects it.

## Desired End State

An **Account** link sits in the navigation of every signed-in page. It opens a page showing your email and a danger zone; deleting requires typing `DELETE` into a confirmation dialog. Afterwards the account and all its books are gone for good, you are signed out, and the public welcome page tells you the deletion completed. Signing in with those credentials fails, and another user's TBR is entirely untouched.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| New libraries | None | Admin delete, cascade, gating, and the confirm dialog are all covered by packages and schema already in the repo. | Research |
| Cascade mechanism | Existing foreign key `on delete cascade` | F-01 already chose it, and adding a second cleanup path is a documented cause of `Database error deleting user`. | Research |
| Client separation | Cookie/anon client for identity and sign-out; a separate cookie-free service-role client for the admin delete only | Passing the elevated key through `createServerClient` gets it overwritten by the session JWT and fails with `User not allowed`. | Research |
| Where the control lives | A new gated `/account` page | Keeps an irreversible action off every everyday screen and gives account settings somewhere to live. | Plan |
| Confirmation strength | Type `DELETE`, validated on the server | Friction proportional to an unrecoverable action, with no new libraries and no dependence on client-side JavaScript. | Plan |
| Secret rollout | Phase 1, owner-supplied, before any code | Nothing later can silently stall on a missing key, and it respects the human approval gate on Supabase keys. | Plan |
| Navigation reach | Account link on all five signed-in surfaces | Matches how Home and Sign out already behave in this app, which has no shared nav component. | Plan |
| Failure behaviour | Stay on the Account page, red banner, still signed in | Mirrors a failed book delete and leaves the user in a known-good state with data intact. | Plan |
| Success feedback | Public home page with a one-time confirmation message | Without it a tester cannot tell a successful permanent deletion from a silent failure. | Plan |
| Leftover JWT window | Accepted | An already-issued token stays valid until it expires; closing that window is a documented Supabase trade-off not worth v1 complexity. | Research |

## Scope

**In scope:** gated `/account` page with email display; type-to-confirm deletion dialog; `POST /api/account/delete`; service-role client and the `SUPABASE_SERVICE_ROLE_KEY` rollout across local, CI, Worker, and GitHub; Account link in five nav locations; error banner on failure; confirmation message on the public home page; `/account` added to `PROTECTED_ROUTES`; README, infrastructure, and roadmap doc corrections.

**Out of scope:** any new npm package; a second cleanup path for books; a Supabase Edge Function; mitigating the leftover-JWT window; account recovery, undo, grace period, or soft delete; data export; password/email change or any other account setting; sign-in return-to redirect; theme work (S-07 owns that); rotating the existing anon key.

## Architecture / Approach

Two Supabase clients with two keys, strictly separated. The existing cookie-scoped anon client proves who is asking and ends the session; a new cookie-free service-role client does exactly one thing, `auth.admin.deleteUser`. Request flow: `/account` → CSS `:target` dialog → form POST to `/api/account/delete` → `getUser()` → validate the typed word with zod → admin delete → Postgres cascades the books → sign out → redirect home with a flash message. The dialog reuses the existing `.delete-modal` CSS and needs no JavaScript, so the confirmation is enforced server-side and cannot be bypassed.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Service-role key provisioning | The new secret declared, documented, and present locally, in CI, on the Worker, and in GitHub | The Cloudflare Supabase integration overwriting `SUPABASE_KEY` with a service-role value, which would disable row-level security app-wide |
| 2. Gated Account page + navigation | `/account` showing your email, protected when signed out, linked from all five signed-in pages | Five hand-maintained nav rows drifting; the edit page's unsaved-changes guard being missed on the new link |
| 3. Account deletion end to end | Admin client, delete route, confirm dialog, error banner, success message | A failed post-delete `signOut()` reporting a successful irreversible deletion as an error |
| 4. Gating sweep + documentation | Verified redirects on every private route; README, infrastructure, and roadmap updated | Documentation drift left behind, so a future session re-litigates the settled cascade question |

**Prerequisites:** F-01 (done). The project owner must be available in Phase 1 to copy the secret key from the Supabase dashboard and set it in Cloudflare and GitHub — no one else can do this step.
**Estimated effort:** ~2-3 sessions across 4 phases; Phase 3 is the bulk of the work, Phase 1 is short but blocking.

## Open Risks & Assumptions

- **Testing requires throwaway accounts.** Several manual tests permanently destroy an account. The plan uses freshly signed-up accounts for every destructive test; do not test with an account whose books matter, and never with your own in production.
- **Assumes the hosted Supabase project allows Admin API access with the secret key.** If the key is scoped or restricted, Phase 3 surfaces it as a "could not delete" banner rather than a crash, but the feature would be blocked until resolved.
- **Deleted accounts cannot be restored.** Reverting the pull request stops future deletions; it does not bring anything back.
- **No automated test framework exists**, so correctness rests on the static checks plus the manual scenarios. A regression in gating or the confirmation word would not be caught by CI.
- **Sign-up must be working** for the throwaway-account tests, including whatever email-confirmation setting is active locally.

## Success Criteria (Summary)

- A signed-in user can permanently delete their account in a few clicks plus one typed word, and is told clearly that it happened.
- Their books and trope tags are gone with the account, and no other user's data is affected.
- No private page — TBR, add, edit, mood, or account — is reachable by a signed-out visitor.
