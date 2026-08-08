# Add a Book to the TBR (S-01) — Plan Brief

> Full plan: `context/changes/add-book-to-tbr/plan.md`

## What & Why

Build the first write path into the TBR: a signed-in user enters a book's title, author, one or more free-text trope tags, and an optional description, and it is saved as a row only they can see. This is roadmap slice **S-01** — the first consumer of the F-01 data layer and the prerequisite for browsing (S-02) and the north-star mood-trope pick (S-05). The motivation is the PRD's Primary success criterion: the author hand-migrating 100+ books out of Instagram saves, an Amazon wishlist, and phone notes. That makes the **≤30 seconds per book** guardrail the load-bearing constraint, not the persistence.

## Starting Point

The database half is already built and proven. `books` exists with `tropes text[]`, RLS with four owner-only policies, `authenticated` grants, and CHECK constraints that already enforce every FR-004 required-field rule; typed insert shapes are generated in `src/lib/database.types.ts`. What's missing is everything above it: no books API route, no books page, no books component — `src/` doesn't reference the table at all. There is also no JSON API precedent (all three auth routes use `formData` + redirect), no validation library, and only `button.tsx` in `src/components/ui/`.

## Desired End State

A signed-in user goes from the dashboard to `/books/new`, types a book, and saves it without leaving the page — the form clears, focus returns to the title field, and the saved book appears in a running session list showing its title, author, and trope chips as persisted. Books can be entered back-to-back with no page reload, well inside 30 seconds each. Duplicates of an existing title and author still save but say so, unauthenticated visitors to `/books/new` are redirected to sign-in, and an unauthenticated POST to `/api/books` gets a clean 401.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Entry surface | Dedicated protected route `/books/new` | A bookmarkable URL the user keeps open for a whole migration session, and it gives S-02/S-03 an obvious sibling structure | Plan |
| Submit mechanics | JSON `fetch` to a new `POST /api/books`; form stays mounted, resets, refocuses the title | The only shape that makes ≤30s reachable across 100+ entries — no reload, no focus loss between books | Plan |
| Trope entry | Chip input — Enter or comma commits, Backspace removes, chips individually removable | Shows exactly what was parsed before saving, so typos are caught at entry rather than becoming phantom tags with no list view to audit | Plan |
| Validation | Add zod 4; one schema in `src/lib/book-schema.ts` shared by route and island | Client and server can't drift, the body is typed end-to-end under `strictTypeChecked`, and S-03/S-05 inherit it | Plan |
| Trope hygiene | Trim, drop empties, de-duplicate exact repeats; preserve wording and case | Protects the `tropes_no_blanks` constraint without touching the user's words, per the PRD's permanent no-normalization non-goal | Plan |
| Duplicate books | Warn on save, never block; no unique constraint | Catches the real migration failure mode (same book saved in two places) without rejecting two editions, and needs no schema change | Plan |
| "See it saved" | In-memory session list of server-returned rows below the form | Literally satisfies the slice outcome and gives migration momentum without borrowing S-02's scope | Plan |
| UI primitives | Extend the hand-rolled auth components (`FormField` gains multiline); no shadcn installs | Visually and structurally consistent with the only forms in the app, and adds no dependencies mid-migration | Plan |

## Scope

**In scope:** zod dependency + shared book schema with the trope cleanup transform; `POST /api/books` with its own auth guard, duplicate lookup, and JSON error/success shapes; the `TropeInput` chip component; multiline support in `FormField`; the `AddBookForm` island and session list; the `/books/new` page; `/books` added to `PROTECTED_ROUTES`; a dashboard entry point; guardrail verification (timed entry + isolation re-check).

**Out of scope:** list/search/filter/edit/delete (S-02–S-04); mood-trope recommendation (S-05); trope autocomplete or a recently-used picker; any cross-book or cross-user trope normalization; a unique constraint or any schema migration; bulk import or paste-many; shadcn primitive installs and any new UI dependency; a no-JS fallback; mobile layout commitments; a test framework; anything in auth or account deletion (S-06).

## Architecture / Approach

One zod schema in `src/lib/book-schema.ts` is the contract, imported by both the API route and the React island, owning required fields, length caps, the trope cleanup rules, and blank-description-to-null. `POST /api/books` — the repo's first JSON endpoint — resolves the Supabase client (503 if unset), requires a session user (401), `safeParse`s the body (400 with `z.flattenError` field errors), checks title + author for a duplicate, then inserts a payload built explicitly from the parsed fields plus the session user's id and returns the persisted row (201 with a `duplicate` flag). Ownership is never client-supplied, and the RLS insert policy is the backstop. The UI composes existing components — `FormField` (plus a new multiline mode), `SubmitButton`, `ServerError` — with a new `TropeInput`, submitted via the React 19 form `action` prop so `SubmitButton`'s `useFormStatus` keeps working; the page hydrates the island with `client:load` exactly as the auth pages do.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Validation contract + insert API | zod dependency, shared schema, `POST /api/books` with auth guard, duplicate check, and JSON contract | Sets the JSON API convention S-03/S-05 inherit; the handler must authenticate itself since `PROTECTED_ROUTES` doesn't cover `/api/*` |
| 2. Trope chip input | The keyboard-driven `TropeInput` component | Most custom UI in the slice with nothing to copy; Enter must not submit the form, and uncommitted text must not silently vanish |
| 3. Page, form, session list | `/books/new`, `AddBookForm`, `SavedBooksList`, multiline `FormField`, route gating, dashboard link | `useFormStatus` reports nothing unless the form submits via a React action; reset and refocus must happen only on success |
| 4. Guardrail verification | Timed entry against ≤30s, isolation re-check for the new writer, CI green | A timing failure sends work back into Phase 3 rather than being a phase of its own |

**Prerequisites:** Docker + the local Supabase stack running (`supabase start`) for inserts and the RLS script; a confirmed test account to sign in with; work stays on the existing `feat/add-book-to-tbr` branch and lands via PR.
**Estimated effort:** ~2 focused sessions across 4 phases; Phase 1 is small, the care is in Phase 2's keyboard handling and Phase 3's reset/refocus loop.

## Open Risks & Assumptions

- The session list is client-side only and vanishes on reload, and its wording is the only safeguard: if "added this session" isn't unmistakable, a mid-migration refresh reads as data loss, and a user who believes that re-enters books — creating duplicates that can't be removed until S-03 ships delete. Confirmed as an accepted risk rather than reading recent books from the database, which would have borrowed S-02 scope.
- Preserving trope case means `Enemies-To-Lovers` and `enemies-to-lovers` become distinct tags, which S-05's mood picker will show separately — accepted as the cost of the PRD's no-normalization rule.
- The duplicate warning is exact-match on title and author (deliberately not `ilike`, whose wildcards misfire on real titles), so case or punctuation variants slip through; the check is also non-atomic with the insert, which is fine for an advisory notice.
- Duplicates and typos can't be corrected until S-03 ships edit and delete, so early migration data may need cleanup later.
- zod is a new runtime dependency; it is dependency-free and workerd-compatible, but it's the first validation convention in the repo and later slices are expected to follow it.
- The ≤30s guardrail is verified by one human timing three entries, not by instrumentation — a coarse signal, but the guardrail is stated in human terms.

## Success Criteria (Summary)

- A signed-in user can save a book with title, author, tropes, and optional description, and immediately see what persisted.
- Books can be entered back-to-back without a page reload, each in under 30 seconds of input.
- The new write path cannot create or expose a row belonging to another account, and unauthenticated access to both the page and the endpoint fails cleanly.
