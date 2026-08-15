# Mood-Trope Recommendation (S-05) — Plan Brief

> Full plan: `context/changes/mood-trope-recommendation/plan.md`
> Research: `context/changes/mood-trope-recommendation/research.md`

## What & Why

S-05 is the north star: the thinnest end-to-end flow that proves the whole product bet — that picking by trope beats scrolling when you're trying to choose your next read. A signed-in user opens a mood screen, ticks 1–3 tropes drawn from their own TBR, and gets up to 3 of their own books that share at least one of them. Everything else in SmartTBR only matters if this works.

## Starting Point

The prerequisites are done and the browse stack has already built almost every piece this needs. `/books` is a working template for the exact shape required: one per-user query, a trope vocabulary derived from the user's own books, in-memory filtering, and a multi-way empty-state machine. The filter bar contains a zero-JavaScript trope checkbox picker to adapt. What does not exist is the matching rule itself — the existing filter predicate requires a book to carry *every* selected trope, and this slice needs *any*.

## Desired End State

"Pick by mood" is reachable from the dashboard and the TBR list. It shows only your own tropes, accepts one to three, and returns up to 3 books with title, author, description, and trope pills. When more than 3 match, it says so and offers three more suggestions at a time, added below the ones you are already looking at rather than replacing them. Empty TBR, oversized selection, and no-match each get their own explanation instead of a blank screen. No other account's books can appear, and nothing needs JavaScript.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Dependencies | None added | Every layer is already covered by the installed stack. | Research |
| Matching mechanism | In-memory any-match over one query | The picker needs all the user's tropes anyway, so a second DB query would only add a round trip. | Research + Plan |
| Picker widget | Adapt the existing zero-JS checkbox dropdown | Native HTML is the standing rule for TBR surfaces; no multi-select library earns its keep. | Research |
| Screen shape | One page at `/mood`, results below the picker | Mirrors `/books`, keeps the picker visible for re-picking, and makes results bookmarkable. | Plan |
| Which 3 of many matches | Stable repeatable order (title, then id) | The only option that honours the Non-Goal banning ranking, recency weighting, and shuffling. | Plan |
| Wanting more than three | "Show me 3 more" adds to the list rather than replacing it | A reader weighing up options shouldn't lose a book they were half-considering; swapping in three others would do exactly that. | Plan |
| Over-3 selection | Server rejects with an error, ticks preserved | A silently trimmed selection would answer a question the user didn't ask. | Plan |
| Result card content | Title, author, tropes, plus description | The description field exists precisely for recognising books added months ago — this is that moment. | Plan |
| Card actions | None (no Edit/Delete) | A destructive button doesn't belong on a "pick one of these" screen. | Plan |
| "Books but no tropes" state | Safe fallback, not a built third state | Every book requires a trope, so the state is unreachable and its test could not honestly be run. | Plan |

## Scope

**In scope:** A gated `/mood` route; the trope picker; any-match recommendation opening at 3 books; a "Show me 3 more" control that extends the list; empty, no-match, and over-selection states; entry-point links; extraction of the description disclosure into a shared component.

**Out of scope:** Ranking or shuffling of any kind; new dependencies or a richer multi-select; React islands on this page; client-side enforcement of the 3-trope cap; Edit/Delete on result cards; a "show fewer" control; schema, migration, or RLS changes; saved mood history; the Café Romance restyle (S-07).

## Architecture / Approach

`/mood` is a GET form that submits to itself, with the entire selection held in the URL. Each request loads the user's books once, derives the pickable tropes from that same result, validates the selection, filters by trope overlap, sorts deterministically, and renders one slice. All rules live in a new `src/lib/mood-selection.ts`, kept deliberately separate from the existing filter module so the all-match and any-match predicates can never be mistaken for each other. Rendering is entirely server-side.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Matching logic + shared description card | The mood-selection module and a shared description component, with no new user-facing surface | Touching the working TBR list; mitigated by verifying it as a pure no-regression pass |
| 2. The `/mood` screen, end to end | The working north-star flow: picker, results, empty states, cap error, gating, entry links | Confusing any-match with the existing all-match filter, which would look correct in review |
| 3. More suggestions + guardrail verification | "Show me 3 more" extending the list, match counts, then isolation, speed, and JS-off checks | The expanded count leaking into the picker, so a freshly chosen mood returns a long list instead of three |

**Prerequisites:** F-01 and S-01 are done; local Supabase running with `supabase/seed.sql` applied; work continues on the existing `feat/mood-trope-recommendation` branch.
**Estimated effort:** ~2–3 sessions, one per phase, with a manual verification gate between each.

## Open Risks & Assumptions

- **Repetition is accepted for v1.** Stable ordering means the same mood returns the same books; "Show me 3 more" is the mitigation, and the PRD already parks ranking for v2.
- **Expansion is a deliberate reading of the 3-book cap.** The PRD says the rule "never returns a long list"; this plan treats that as governing what the system volunteers, not what the reader explicitly asks for. The opening answer is always three, and a new mood resets to three.
- **Two states are effectively untestable by clicking.** "No matches" can only be reached through a stale or hand-edited URL, and "books with no tropes" cannot be reached at all — the plan tests the first via URL and treats the second as a fallback.
- **No automated test coverage exists.** The project has no test framework, so correctness depends on the manual suites plus lint and build; the logic module is written as pure functions so tests can be added later without rework.
- **Manual tests assume the seed fixtures.** They name specific accounts and expect specific books; if `supabase/seed.sql` changes, the expected results need updating.

## Success Criteria (Summary)

- You can go from the dashboard to three books that match your mood in a couple of clicks, in under 2 seconds.
- Asking for more suggestions adds to what you're looking at instead of taking books away, every match is reachable, and the same mood gives the same answer.
- No screen is ever blank: an empty TBR, too many tropes, and no matches each explain themselves, and no other account's books can ever appear.
