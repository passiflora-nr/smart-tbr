# Café Romance UI Theme — Plan Brief

> Full plan: `context/changes/ui-theme-cafe-romance/plan.md`
> Research: `context/changes/ui-theme-cafe-romance/research.md`

## What & Why

Restyle the whole app from the starter’s dark purple “cosmic” look to Café Romance — warm linen, espresso text, dusty-rose actions, blush/oat trope pills — so it fits a 25–35 Bookstagram romance reader. Functional slices are done; this is optional polish, done last, in one change.

## Starting Point

Every screen still paints dark glass by hand. Shared color tokens exist but pages ignore them. No fonts are loaded. Six signed-in surfaces each draw their own nav. Tests check labels and sentences, not colors.

## Desired End State

The live site looks like one cream-and-rose app on every page. Headings use Fraunces, body uses DM Sans. Signed-in pages share one nav. Book lists stay title-and-author rows. Delete stays obviously red. Product behavior is unchanged.

## Key Decisions Made

| Decision          | Choice                                               | Why (1 sentence)                                           | Source            |
| ----------------- | ---------------------------------------------------- | ---------------------------------------------------------- | ----------------- |
| Layout            | Stacked rows, no covers / no grid                    | A cover-forward rebuild is more than this slice            | Change / Research |
| Theme modes       | Light only                                           | Velvet Evening is parked                                   | Change / Roadmap  |
| Heading font      | Fraunces                                             | Screen-friendly serif; DM Sans for body                    | Plan              |
| Font loading      | Astro Fonts API (bundled at build)                   | Works on Cloudflare without a live Google request          | Plan              |
| Navigation        | One shared signed-in nav, same links everywhere      | Chrome is being rewritten anyway; five rows will drift     | Roadmap / Plan    |
| Colors in code    | Palette on shared tokens, used on every page         | Tokens already exist; hex-on-each-page would drift         | Plan              |
| Leftover chrome   | Restyle banners, flash, dialogs; keep red for delete | A cream app with leftover purple/dark-red looks unfinished | Plan              |
| Look-check        | Every page, wide screen only                         | Owner chose desktop walk over extra phone / JS-off checks  | Plan              |
| Stale Phase 4 row | Flip in this change                                  | The e2e net is already archived                            | Research / Plan   |

## Scope

**In scope:** Token remap, fonts, shared nav, per-page class rewrite, leftover chrome, test-plan Phase 4 status fix.

**Out of scope:** Covers, dark mode, new UI-kit components, React islands on lists, copy/label changes, visual snapshot tests, unused `LibBadge.astro`.

## Architecture / Approach

Map Café Romance hex onto existing CSS variables, load two fonts in the layout, add `SignedInNav.astro` (Home, View your TBR, Add a book, Pick by mood, Account, Sign out; edit page still gets the unsaved-changes marks). Then restyle every page in one pass and delete `bg-cosmic`. List pages stay server HTML.

## Phases at a Glance

| Phase               | What it delivers                  | Key risk                                                       |
| ------------------- | --------------------------------- | -------------------------------------------------------------- |
| 1. Foundation       | Tokens, fonts, unused shared nav  | Fonts fail the Cloudflare build                                |
| 2. Apply everywhere | Whole app restyled + nav wired    | Locked copy / Tropes label / unsaved-changes marks break tests |
| 3. Docs cleanup     | Test-plan Phase 4 marked complete | None (docs only)                                               |

**Prerequisites:** S-02–S-06 done; Phase 4 e2e archived. Owner full-suite run once at the start of implement (`test-plan.md` §5). Do not deploy until Phase 2 is done.
**Estimated effort:** ~2–3 sessions across 3 phases (Phase 2 is the long one).

## Open Risks & Assumptions

- Astro Fonts API + Cloudflare adapter must emit font files as static assets; if the build path fails, fall back stays inside the Fonts API (fontsource/local), not a runtime Google `<link>`.
- Unifying nav adds **Add a book** / **Pick by mood** on pages that did not have them — labels stay, so e2e should still find them.
- A mid-change production deploy would ship a mixed look; Phase 1 is local-only until Phase 2 lands.

## Success Criteria (Summary)

- A tester walking every page on a wide screen sees cream, espresso, dusty-rose — no cosmic leftover.
- Your TBR is still a stacked list; trope pills are the colorful bit.
- Sign-in → add → browse → mood and edit-save still work; automated tests stay green.
