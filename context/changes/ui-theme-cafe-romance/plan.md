# Café Romance UI Theme Implementation Plan

## Overview

Replace the starter’s dark purple “cosmic” chrome with the Café Romance look — warm linen page, espresso text, dusty-rose actions, blush/oat/stone trope pills, Fraunces headings, and DM Sans body — across every public and signed-in screen. Product behavior, copy, and list layout stay the same. One shared signed-in nav replaces the six hand-rolled link rows.

## Current State Analysis

Pages ignore the shadcn tokens in `src/styles/global.css` and paint themselves with `bg-cosmic`, glass (`bg-white/10 backdrop-blur`), gradient headings, and purple buttons. Tokens, radius (`0.625rem`), and a unused `.dark` block already exist. No app fonts are loaded. `Layout.astro` has no font tags and no nav.

Signed-in navigation is split: `Topbar.astro` on home (email + Home + Account + inline Sign out) and five glass pill rows on Your TBR, Add a book, Edit, Pick by mood, and Account. Only `SignOutButton.astro` is shared. The edit page’s unsaved-changes guard listens for `data-unsaved-guard` on leave links and the sign-out form.

TBR lists are stacked title-and-author rows (`BookList.astro`, `MoodResultList.astro`, `SavedBooksList.tsx`). There is no cover field. Tests assert control names and a few sentences, not classes or colors. Research already mapped ~30 files that still carry cosmic chrome.

## Desired End State

Every visible screen uses the Café Romance palette and fonts. Cosmic utilities, orbs, star-field, glass cards, and gradient headings are gone. Signed-in pages share one nav with the same link labels. Book rows stay stacked. Delete actions stay clearly red. Automated tests still pass without rewriting locked copy. A tester walking every page on a wide screen sees one consistent cream-and-rose app.

### Key Discoveries:

- Token swap alone will not change what a reader sees — pages hardcode cosmic classes (`src/pages/books/index.astro:148`, `src/components/Welcome.astro:12`, and siblings).
- `SubmitButton` overrides the only shadcn `Button` with `bg-purple-600` (`src/components/auth/SubmitButton.tsx:19`).
- Edit leave-targets must keep `data-unsaved-guard` (`src/components/books/EditBookForm.tsx:99-148`).
- Mood closed label must stay exactly `Tropes` when nothing is selected (`tests/e2e/critical-path.spec.ts:58`).
- Filter form transport is asserted as HTML substrings (`tests/integration/books-surface.test.ts:220-227`).
- List pages must stay native HTML (`context/foundation/lessons.md` — no per-row React islands).
- Archived Phase 4 research still describes a cover-forward grid — ignore it; live `change.md` forbids covers.

## What We're NOT Doing

- Cover images, a cover field, or a cover-forward grid
- Dark mode / “Velvet Evening” or a theme toggle (leave the unused `.dark` token block as-is)
- New shadcn primitives beyond the existing `Button`
- Turning Your TBR, mood results, or filter/delete into React islands
- Changing product copy, button labels, empty/no-match sentences, or filter `method` / `action` / `name` / clear-link `href`s
- Changing the mood closed summary to `Tropes · 0 selected`
- Expanding or rewriting API routes, auth, or the data model
- Visual snapshot tests or class-name assertions
- Restyling unused `LibBadge.astro` (leave it; it is not rendered)
- Deploying a half-restyled app — do not ship to production until Phase 2 is done

## Implementation Approach

Phase 1 lays the rails: Café Romance hex values on the existing CSS variables, Fraunces + DM Sans via the Astro Fonts API, radius `0.75rem`, and a new shared nav component that is not yet swapped onto every page. `bg-cosmic` stays until its call sites are gone.

Phase 2 is the single visual pass: restyle every page and shared control, wire the nav, drop cosmic chrome, and restyle leftover banners, errors, save-flash, and delete dialogs (red stays on destructive actions).

Phase 3 only fixes the stale test-plan Phase 4 row so later work does not treat that net as still open.

## Critical Implementation Details

**Fonts on Workers.** Register Fraunces and DM Sans in `astro.config.mjs` with `fontProviders.google()` (or `fontsource()`), `subsets: ["latin"]`, `formats: ["woff2"]`. Render `<Font />` from `astro:assets` in `Layout.astro` `<head>` for both CSS variables, with `preload`. Fonts are downloaded at build time and served as site assets — do not add a runtime Google Fonts `<link>`. After the config change, run `npx astro sync` before lint.

**Unsaved-changes contract.** The shared nav must accept `guardUnsavedLeave` and an optional `booksHref` (edit page preserves active filters on **View your TBR**). When `guardUnsavedLeave` is true, every nav `<a>` and the sign-out `<form>` get `data-unsaved-guard`. Do not put the nav in `Layout.astro` — the layout has no user session today.

**Home link names are not unique after the nav lands.** Signed-in Home keeps the hero buttons **Pick by mood**, **View your TBR**, and **Add a book**, and the shared nav repeats those same names. Playwright fails if a `getByRole("link", { name })` matches two controls. `SignedInNav` must render as (or inside) a single `<nav>` landmark. After Phase 2 wires it, update `tests/e2e/auth.setup.ts` (Pick by mood visible on `/` after sign-in) and `tests/e2e/critical-path.spec.ts` (Add a book from `/`) so those queries scope to that landmark: `getByRole("navigation").getByRole("link", { name: "…" })`. Do not disambiguate with `.first()`, `.last()`, or `.nth()`. Do not rename any control.

**Do not delete `bg-cosmic` in Phase 1.** Removing the utility while pages still use the class leaves cream-on-glass leftovers. Delete the utility in Phase 2 after the last call site is gone.

## Phase 1: Foundation — tokens, fonts, shared nav

### Overview

Load the fonts, map the palette onto the existing token names, bump radius, and add the shared signed-in nav. Pages still look cosmic. The nav is not wired into pages yet.

### Changes Required:

#### 1. Font registration

**File**: `astro.config.mjs`

**Intent**: Register Fraunces (headings) and DM Sans (body/UI) so the Cloudflare build bundles woff2 files.

**Contract**: `fonts` array with two families, CSS variables `--font-fraunces` and `--font-dm-sans`, latin subset, woff2. Weights: Fraunces 600/700; DM Sans 400/500/600. Styles: `["normal"]` only — do not download italic (Astro’s Google helper includes italic unless we opt out). Import `fontProviders` from `astro/config`.

#### 2. Font tags in the layout

**File**: `src/layouts/Layout.astro`

**Intent**: Emit the font CSS and preload hints on every page.

**Contract**: In `<head>`, render `<Font cssVariable="--font-fraunces" preload />` and `<Font cssVariable="--font-dm-sans" preload />` from `astro:assets`. Do not add signed-in nav or auth fetches here.

#### 3. Café Romance tokens and type scale

**File**: `src/styles/global.css`

**Intent**: Make semantic utilities (`bg-background`, `text-foreground`, `bg-primary`, `font-sans`, `font-serif`) resolve to the spec palette and fonts, without removing cosmic page chrome yet.

**Contract**: Keep hex from `change.md` on `:root` (do not convert to oklch — the spec is hex). Map at least:

| Token                                | Hex       |
| ------------------------------------ | --------- |
| `--background`                       | `#F7F3EE` |
| `--card` / `--popover`               | `#FDFBF8` |
| `--foreground` / `--card-foreground` | `#3D2E2A` |
| `--muted-foreground`                 | `#8B7355` |
| `--primary`                          | `#7A4E57` |
| `--primary-foreground`               | `#FDFBF8` |
| `--accent`                           | `#E8C4C8` |
| `--border` / `--input`               | `#E5DDD3` |
| `--radius`                           | `0.75rem` |

Add `--primary-hover: #6B4249` and `--success: #6B7F6A` (sage, for saved/success states). Add trope pill tokens `--trope-blush: #F0D4D8`, `--trope-oat: #E8DFD0`, `--trope-stone: #D4C4B8`, `--trope-text: #5C4A42` and bridge them in `@theme inline` so utilities exist. Set `--font-sans` / `--font-serif` in `@theme inline` to the Font CSS variables plus system fallbacks. Apply `font-sans` on `body` only; do not globally restyle headings yet (Phase 2). Leave `@utility bg-cosmic` and the `.dark` block in place.

#### 4. Shared signed-in nav (unused by pages yet)

**File**: `src/components/SignedInNav.astro` (new)

**Intent**: One nav that every signed-in surface will mount in Phase 2, with the labels tests already click.

**Contract**: Visible links, in this order, with these exact accessible names:

| Label         | href                               |
| ------------- | ---------------------------------- |
| Home          | `/`                                |
| View your TBR | `booksHref` prop, default `/books` |
| Add a book    | `/books/new`                       |
| Pick by mood  | `/mood`                            |
| Account       | `/account`                         |
| Sign out      | `POST /api/auth/signout`           |

Props: `guardUnsavedLeave?: boolean` (default false), `booksHref?: string`. When `guardUnsavedLeave` is true, mark every leave `<a>` and the sign-out form with `data-unsaved-guard`. Render as (or inside) one `<nav>` so the signed-in menu is the page’s navigation landmark. Style with semantic tokens (not cosmic glass). Do not show the user’s email (Account already does). Do not change `EditBookForm` in this phase.

### Success Criteria:

#### Automated Verification:

- After the Astro config change, `npx astro sync` completes
- Linting passes: `npm run lint`
- Unit tests pass: `npm run test:unit`
- Production build succeeds (fonts download at build): `npm run build`

#### Manual Verification:

**1.5 — App still loads with the old look**

**Setup:** Start the app locally (`npm run dev`). You do not need to sign in.

**Steps:**

1. Open the home page in a wide browser window.
2. Open Sign in (`/auth/signin`).
3. If you already have a session, open Your TBR (`/books`).

**Expected:** Screens still have the dark purple background and glass cards. The body typeface may already look like the new one (DM Sans). If a config warning bar is showing at the top, a cream strip behind it is fine. You should not expect the cream theme on the screens themselves yet — that is Phase 2.

**Pass if:** Home, Sign in, and (if signed in) Your TBR still open. Dark purple cards are still there. Nothing is broken (no missing layout, no unreadable text).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Apply Café Romance everywhere

### Overview

Restyle every public and signed-in screen, shared forms, book rows, leftover chrome, and wire the shared nav. Remove cosmic utilities and decorative orbs/star-field. This is the only phase that should change what a reader sees. Do not merge this to production until the whole phase is done.

### Changes Required:

#### 1. Drop cosmic utilities and retune leftover CSS

**File**: `src/styles/global.css`

**Intent**: Remove the dark-page utility and retune the save-flash and delete-dialog chrome to the new palette.

**Contract**: Delete `@utility bg-cosmic`. Headings (`h1`–`h3`) use `font-serif` and foreground color (no gradient text). `:target` book-row flash uses primary/accent, not purple, and settles on the card/sand border. `.delete-modal-backdrop` can stay a dim overlay. `.delete-modal-panel` becomes a cream card with a sand border and a clearly red destructive frame (keep red for danger — not dusty-rose). Soft card shadow is allowed; no glass / `backdrop-blur` in these rules.

#### 2. Wire shared nav; retire Topbar

**Files**: `src/components/Welcome.astro`, `src/pages/books/index.astro`, `src/pages/books/new.astro`, `src/pages/books/[id]/edit.astro`, `src/pages/mood.astro`, `src/pages/account.astro`, `src/components/Topbar.astro`, `src/components/auth/SignOutButton.astro`

**Intent**: Every signed-in surface shows the same nav. Home’s old top bar and the five pill rows go away.

**Contract**: Signed-in `Welcome` mounts `SignedInNav` (no email). The five app pages replace their hand-rolled rows with `SignedInNav`. Edit page passes `guardUnsavedLeave` and `booksHref={buildBooksHref(filterQuery)}`. Delete `Topbar.astro` once nothing imports it. `SignOutButton.astro` may be inlined into the nav or kept as a child — sign-out remains `POST /api/auth/signout` with the same visible name **Sign out**. Home hero CTAs (**Pick by mood**, **View your TBR**, **Add a book**) stay; they sit outside the `<nav>`. After this swap, signed-in Home has two links for each of those three names — update `tests/e2e/auth.setup.ts` and `tests/e2e/critical-path.spec.ts` to query them through `getByRole("navigation")` (see Critical Implementation Details). Do not use `.first()`, `.last()`, or `.nth()`. Signed-out home keeps **Sign In** / **Sign Up** in the hero (no signed-in nav).

#### 3. Public surfaces

**Files**: `src/components/Welcome.astro`, `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`, `src/pages/auth/confirm-email.astro`

**Intent**: Landing and auth look like Café Romance: linen page, cream cards, serif headings, dusty-rose primary actions.

**Contract**: Remove `bg-cosmic`, orbs, star-field, glass, and gradient headings. Use `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`. Feature cards on home become flat cream with a soft shadow. Do not change heading words or CTA labels.

#### 4. Signed-in page shells

**Files**: `src/pages/books/index.astro`, `src/pages/books/new.astro`, `src/pages/books/[id]/edit.astro`, `src/pages/mood.astro`, `src/pages/account.astro`

**Intent**: App pages share the same cream shell as public pages.

**Contract**: Same token swap as public surfaces. Keep empty-state sentence `Your TBR is empty — add your first book to get started.` and the `No books match your` prefix. Keep filter form `method="GET"`, `action="/books"`, `name="q"`, `name="trope"`, and the **Clear search** / **Clear filters** labels and hrefs. Keep mood helper **Pick 1 to 3 tropes** and submit **Find my next read**. Account still shows **Signed in as** plus the existing delete-account flow.

#### 5. Forms and shared controls

**Files**: `src/components/auth/FormField.tsx`, `src/components/auth/SubmitButton.tsx`, `src/components/auth/PasswordToggle.tsx`, `src/components/auth/SignUpForm.tsx`, `src/components/auth/ServerError.tsx`, `src/components/books/TropeInput.tsx`, `src/components/books/AddBookForm.tsx`, `src/components/books/EditBookForm.tsx`, `src/components/ui/button.tsx`

**Intent**: Inputs and primary buttons consume tokens so they are readable on cream. Primary actions stop being purple.

**Contract**: Form fields: card/input background, espresso text, sand border, primary focus ring. `SubmitButton` drops the `bg-purple-600` override so `Button`’s `bg-primary` shows. Session-expired and cancel links use primary/muted tokens, not `text-purple-300`. `ServerError` stays a red-tinted warning (destructive), not mauve. Do not rename **Add to TBR**, **Save changes**, **Sign in**, field labels **Title** / **Author** / **Tropes** / **Email** / **Password**, or **Remove ${trope}**. Edit Cancel keeps `data-unsaved-guard` and the filter-preserving books href.

#### 6. Lists, filters, mood picker, trope pills

**Files**: `src/components/books/BookList.astro`, `src/components/books/MoodResultList.astro`, `src/components/books/SavedBooksList.tsx`, `src/components/books/BookDescription.astro`, `src/components/books/BookFilterBar.astro`, `src/components/books/MoodPicker.astro`

**Intent**: Book rows stay stacked title-then-author. Trope pills become the most colorful element. Filters/mood picker stay native HTML.

**Contract**: Rows are cream cards (soft shadow, sand border), espresso title, taupe author/description. Trope pills rotate blush / oat / warm stone by index (`i % 3`) with `#5C4A42` text — same rotation in all three list surfaces and in `TropeInput` chips. Do not add `<img>` covers or change the row to a grid. Filter and mood dropdowns lose slate/glass; keep checkbox `name="trope"`. Mood `<summary>` text when zero tropes are selected remains exactly `Tropes` (not `Tropes · 0 selected`).

#### 7. Leftover chrome — banners, delete, save-flash

**Files**: `src/components/Banner.astro`, `src/components/books/DeleteBookTrigger.astro`, `src/components/books/DeleteBookModal.astro`, `src/components/account/DeleteAccountModal.astro`

**Intent**: Config banners and delete UI belong on a cream page. Destructive actions stay obviously red.

**Contract**: Banner info/warning/error variants use warm surfaces (linen/cream/blush) with espresso or sage text; error variant may keep a red border. Delete triggers and **Delete permanently** stay red. Modal cancel buttons use card/border tokens, not glass. Visible names **Delete**, **Cancel**, **Delete permanently** stay. `:target` open/close behavior is unchanged.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Unit tests pass: `npm run test:unit`
- Integration tests pass: `npm run test:integration`
- End-to-end tests pass: `npm run test:e2e`
- Production build succeeds: `npm run build`
- No remaining `bg-cosmic`, `from-blue-200`, `bg-purple-600`, `bg-white/10`, `backdrop-blur`, `text-purple-`, `text-blue-100`, or `border-white/10` in `src/` (search the tree)

#### Manual Verification:

**2.7 — Every page on a wide screen (signed out)**

**Setup:** Sign out. Use a wide browser window (laptop or desktop width). Start at the home page.

**Steps:**

1. Look at Home. Note the background, the SmartTBR heading, the Sign In / Sign Up buttons, and the three feature cards.
2. Open Sign in. Look at the heading, the Email / Password fields, and the Sign in button.
3. Open Sign up. Look at the form and the password hint.
4. Open Confirm email (`/auth/confirm-email`) if you can reach it (or sign up with a new unused address and land there).

**Expected:** Every screen is a warm cream/linen page with dark brown text. Headings look like a book serif. Buttons are dusty rose, not purple. No dark starry background, no see-through glass cards, no blue-to-purple faded titles.

**Pass if:** Home, Sign in, Sign up, and Confirm email (if visited) all match that look.

**2.8 — Every signed-in page on a wide screen**

**Setup:** Sign in as `user-c@example.test` / `password123`. Use a wide browser window.

**Steps:**

1. From Home, confirm the top nav shows **Home**, **View your TBR**, **Add a book**, **Pick by mood**, **Account**, and **Sign out**. Confirm the three hero buttons are still there.
2. Open Your TBR. Confirm the same nav. Confirm the list is still one book under another (title, author, tropes) — not a picture grid. Trope pills should be blush, oat, and warm stone, not white-on-glass. If the list is long, scroll and check a row with a description.
3. Use search or a trope filter, then **Clear filters**. The list should behave as it does today.
4. Open Add a book. Confirm the same nav and a cream form. Add a book you will delete later (any title).
5. Open that book’s Edit page. Confirm the same nav. Change the title, then click **View your TBR** without saving. You should get “You have unsaved changes. Leave without saving?” — Cancel stays on the form; OK leaves.
6. Open Pick by mood. Confirm the same nav. Open the Tropes control (the word should still be **Tropes** when nothing is selected). Run **Find my next read** with one trope you know exists.
7. Open Account. Confirm the same nav and “Signed in as” your email.

**Expected:** Every signed-in screen uses the same cream look and the same nav labels. Book lists stay stacked. Mood still works. The unsaved-changes question still appears on Edit.

**Pass if:** All seven surfaces match the new look and the flows above still work.

**2.9 — Delete dialogs stay clearly dangerous**

**Setup:** Still signed in as `user-c@example.test`. Have a book you are willing to keep (do not have to delete it).

**Steps:**

1. On Your TBR, open a book’s delete confirmation (the Delete control).
2. Look at the dialog: cancel vs **Delete permanently**.
3. Press Cancel (do not delete unless you intend to).
4. Optionally open Account and open the delete-account confirmation, then Cancel.

**Expected:** The dialog sits on a cream page. **Delete permanently** is clearly red / dangerous, not dusty rose. Cancel looks like a normal cream-page button.

**Pass if:** You can tell immediately which control destroys data, and Cancel dismisses the dialog.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Test-plan Phase 4 status cleanup

### Overview

The critical-path browser net is already archived. The live test-plan table still says that work is “change opened” and points at a folder that no longer exists. Flip that row so S-07 and later readers are not blocked by a stale gate.

### Changes Required:

#### 1. Mark Phase 4 complete

**File**: `context/foundation/test-plan.md`

**Intent**: Record that the e2e net and CI gate already landed, and point at the archive.

**Contract**: In §3 Phased Rollout, row 4 **Status** becomes `complete`. **Change folder** becomes `context/archive/2026-08-30-testing-critical-path-e2e-net-gates/`. Adjust the one-line “must land before S-07” rationale so it reads as already satisfied, not as a future blocker. Do not rewrite the cookbook or drop the “full-suite run before S-07” owner gate — that run still happens at the start of implement.

### Success Criteria:

#### Automated Verification:

- The Phase 4 row in `context/foundation/test-plan.md` shows Status `complete` and the archive path

#### Manual Verification:

**3.2 — Stale gate is gone**

**Setup:** Open `context/foundation/test-plan.md` (or have the implementer show you the table).

**Steps:**

1. Find the Phase 4 row (“Critical-path e2e net + gates”).
2. Check Status and the change-folder path.

**Expected:** Status is complete. The path is the archive folder, not `context/changes/testing-critical-path-e2e-net-gates/`.

**Pass if:** That row no longer looks like unfinished work.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- No new unit tests for colors or fonts.
- Existing unit tests should stay green; they do not assert chrome.

### End-to-end Tests:

- Signed-in Home will have two **Add a book** / **View your TBR** / **Pick by mood** links (nav + hero). Scope the two existing Home queries to the navigation landmark — `tests/e2e/auth.setup.ts` and `tests/e2e/critical-path.spec.ts`. Do not use `.first()`, `.last()`, or `.nth()`. Do not rename controls.

### Integration Tests:

- Do not add class or color assertions.
- Existing books-surface checks must still find `method="GET"`, `action="/books"`, `name="q"`, `name="trope"`, **Clear search**, **Clear filters**, and the empty / no-match sentences.
- Mood persistence still expects `No matches — try different tropes.`

### Manual Testing Steps:

Owner walk is specified in Phase 2 (every page, wide screen). Also treat these as regression spots if anything looks off:

1. Edit page: dirty form + **Home** / **Add a book** / **Pick by mood** / **Account** / **Sign out** also ask before leaving.
2. Your TBR row `:target` flash after save (edit a book, save, land on the highlighted row) — blush/rose, not purple.
3. Config banner only if env is missing — should look warm, not default blue.

## Performance Considerations

Two latin woff2 families, preloaded, is acceptable. Do not add extra weights or italic unless a screen actually uses them. Do not load fonts from Google at request time (Workers + privacy + flicker).

## Migration Notes

No database or API migration. Existing books render in the new chrome with no data change. Do not deploy Phase 1 alone to production (fonts/tokens without the page pass is fine locally; a production deploy of Phase 1 only would still show cosmic pages and is wasted).

## References

- Related research: `context/changes/ui-theme-cafe-romance/research.md`
- Palette and layout lock: `context/changes/ui-theme-cafe-romance/change.md`
- Roadmap S-07: `context/foundation/roadmap.md`
- Manual test format: `context/foundation/manual-testing.md`
- List-page HTML rule: `context/foundation/lessons.md`
- Astro Fonts: https://docs.astro.build/en/guides/fonts/

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Foundation — tokens, fonts, shared nav

#### Automated

- [x] 1.1 After the Astro config change, `npx astro sync` completes — ae8f4ec
- [x] 1.2 Linting passes: `npm run lint` — ae8f4ec
- [x] 1.3 Unit tests pass: `npm run test:unit` — ae8f4ec
- [x] 1.4 Production build succeeds (fonts download at build): `npm run build` — ae8f4ec

#### Manual

- [x] 1.5 App still loads with the old look — ae8f4ec

### Phase 2: Apply Café Romance everywhere

#### Automated

- [x] 2.1 Linting passes: `npm run lint` — 16a65f7
- [x] 2.2 Unit tests pass: `npm run test:unit` — 16a65f7
- [x] 2.3 Integration tests pass: `npm run test:integration` — 16a65f7
- [x] 2.4 End-to-end tests pass: `npm run test:e2e` — 16a65f7
- [x] 2.5 Production build succeeds: `npm run build` — 16a65f7
- [x] 2.6 No remaining `bg-cosmic`, `from-blue-200`, `bg-purple-600`, `bg-white/10`, `backdrop-blur`, `text-purple-`, `text-blue-100`, or `border-white/10` in `src/` — 16a65f7

#### Manual

- [x] 2.7 Every page on a wide screen (signed out) — 16a65f7
- [x] 2.8 Every signed-in page on a wide screen — 16a65f7
- [x] 2.9 Delete dialogs stay clearly dangerous — 16a65f7

### Phase 3: Test-plan Phase 4 status cleanup

#### Automated

- [x] 3.1 The Phase 4 row in `context/foundation/test-plan.md` shows Status `complete` and the archive path — c58b907

#### Manual

- [x] 3.2 Stale gate is gone — c58b907
