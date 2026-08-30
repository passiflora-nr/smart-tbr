# TBR Surface Behaviour — Plan Brief

> Full plan: `context/changes/tbr-surface-behaviour/plan.md`
> Research: `context/changes/tbr-surface-behaviour/research.md`

## What & Why

Add automated checks that Your TBR search, tropes, clears, add, edit, and delete change **which books you see**. The owner has lived through controls that look fine and do nothing; a later visual redesign will rewrite every page, so these checks must look at titles and a few fixed sentences — not layout.

## Starting Point

Phase 1 already proves a book is stored correctly and that mood HTML shows the right title. Nobody yet requests the Your TBR page, and the browse matching rule has no unit tests.

## Desired End State

A small unit suite locks "search is title or author; two tropes means both." An integration suite, signed in as the empty test account, seeds a few marked books and checks the list after each control. You can repeat search, tropes, clears, and delete with JavaScript turned off. A short recipe tells the next person how to add another list check.

## Key Decisions Made

| Decision                    | Choice                                                                                 | Why (1 sentence)                                                                      | Source          |
| --------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------- |
| Cheapest layer for the rule | Unit on parse + match                                                                  | Pure function; Docker is wasted on AND/stale/26-cap                                   | Research        |
| Cheapest layer for wiring   | `GET /books` + titles                                                                  | Catches "Apply filters does nothing" only if the page runs                            | Research        |
| HTTP surface set            | Search, tropes, combined AND, both clears, empty/no-match, add→list, edit→list, delete | Covers the lived defect class without island clicks or a fake load failure            | Plan            |
| Delete proof                | Fresh `GET /books`; title gone                                                         | Avoids the flash-cookie trap; redirect status proves nothing                          | Plan            |
| Matching vs HTTP            | Unit owns edges; HTTP smokes wiring + one combined AND                                 | A page that ORs text and tropes would pass separate smokes                            | Plan            |
| Reset links                 | Both Clear search and Clear filters                                                    | They change the set differently                                                       | Plan            |
| Human gate                  | Same flows with JavaScript off                                                         | Browse/filter/delete are server HTML; an accidental list island would hide with JS on | Plan            |
| Helper change               | Thin HTML GET + create-via-API; leave form POST as-is                                  | Delete does not need repeated `trope` fields                                          | Research / Plan |

## Scope

**In scope:** Unit FR-012 rule; integration title/copy cases above; cookbook §6.6.

**Out of scope:** Product changes; Phase 1 storage re-proof; Save/Add button clicks; ownership / forged-origin; sort/pagination; flash "Book deleted."; failed-load; markup/snapshots; mood tests.

## Architecture / Approach

Tests build `/books?q=…&trope=…` by hand (repeated `trope` via `append`). The page already loads every owned row and filters in memory — the suite only needs the page to run. Add/edit use the JSON API, then a list GET, because those Save buttons need JavaScript. Mood's `trope` meaning (any overlap) is the opposite rule and must not be copied.

## Phases at a Glance

| Phase                       | What it delivers               | Key risk                                                                                      |
| --------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------- |
| 1. Browse-filter unit suite | FR-012 parse + match table     | Expected results copied from the matcher instead of FR-012                                    |
| 2. TBR surface integration  | Title/copy cases + JS-off walk | User D has leftover real books, so "empty" never appears; fixtures that would pass an OR rule |
| 3. Cookbook §6.6            | Recipe for the next list check | Section stays TBD or restates §6.2                                                            |

**Prerequisites:** Phase 1 harness on `main`; Docker for Phase 2; local seed accounts.
**Estimated effort:** ~2 sessions across 3 phases (unit is short; integration + your JS-off walk is the bulk).

## Open Risks & Assumptions

- User D is fixture-only. A hand-added book without the `[integration-test]` prefix fails the empty-list case on purpose.
- Combined-AND fixtures are load-bearing: one book must match the search word but not both tropes.
- S-07 may restyle the page; it must not rewrite the empty / no-match sentences or the suite will need a copy update.

## Success Criteria (Summary)

- Search, two tropes together, and both clears change which titles you see — including with JavaScript off.
- After add, edit, or delete, Your TBR shows the new set of titles.
- Empty list and "no books match" are different sentences, not a blank page.
