# Home as signed-in action hub

## Overview

Move the signed-in landing experience from `/dashboard` to `/`. The home page (`Welcome.astro`) becomes the action hub with **Pick by mood**, **View your TBR**, and **Add a book**. `/dashboard` becomes a redirect for legacy bookmarks. Sign-in success redirects to `/`.

**Prerequisite:** S-05 (`/mood` route and Pick by mood flow) must be merged first.

## What We're NOT Doing

- No new routes beyond repurposing `/` for signed-in users
- No auth model changes — `/books`, `/mood`, and other protected paths unchanged
- No visual theme work (S-07)
- No removal of `/dashboard` URL — it redirects, not 404

## Changes Required

### 1. Dashboard redirect

**File:** `src/pages/dashboard.astro`

Replace the hub page with `return Astro.redirect("/");`.

### 2. Middleware

**File:** `src/middleware.ts`

Remove `"/dashboard"` from `PROTECTED_ROUTES` — the redirect page is public; auth is enforced on destination routes.

### 3. Sign-in redirect

**File:** `src/pages/api/auth/signin.ts`

Change post-success redirect from `/dashboard` to `/`.

### 4. Signed-in home CTAs

**File:** `src/components/Welcome.astro`

For signed-in users, add **Pick by mood** (`/mood`) as the primary CTA; demote **View your TBR** to secondary styling (border, not filled).

### 5. Topbar

**File:** `src/components/Topbar.astro`

Rename **Dashboard** → **Home**, link to `/`.

### 6. Book and mood page nav

**Files:** `src/pages/books/index.astro`, `src/pages/books/new.astro`, `src/pages/books/[id]/edit.astro`, `src/pages/mood.astro`

Change **Back to dashboard** (`/dashboard`) → **Home** (`/`).

### 7. README route table

**File:** `README.md`

Update `/`, `/auth/signin`, and `/dashboard` rows to reflect the new flow. Keep `/mood` row from S-05.

## Success Criteria

#### Automated Verification

- [x] `npx astro sync`
- [x] `npm run lint`
- [x] `npm run build`

#### Manual Verification

**1.1 — Sign-in lands on home action hub**

**Setup:** Sign out. Open `/auth/signin`.

**Steps:**
1. Sign in as `user-a@example.test` / `password123`.

**Expected:** You land on `/` (home), not `/dashboard`. You see **Pick by mood**, **View your TBR**, and **Add a book**.

**Pass if:** URL is `/` and all three actions are visible.

---

**1.2 — Legacy dashboard bookmark redirects**

**Setup:** Signed in.

**Steps:**
1. Go to `/dashboard` directly.

**Expected:** Browser redirects to `/` (home action hub).

**Pass if:** You end up on home without seeing the old dashboard card.

---

**1.3 — Book pages link Home**

**Setup:** Signed in as `user-a@example.test`.

**Steps:**
1. Open `/books`, `/books/new`, and edit any book.
2. On each page, find the nav link that used to say **Back to dashboard**.

**Expected:** Link says **Home** and goes to `/`.

**Pass if:** All three pages show **Home** linking to `/`.

---

**1.4 — Mood page links Home**

**Setup:** Signed in. Open `/mood`.

**Steps:**
1. Click **Home** in the page header.

**Expected:** You land on `/` with the action hub.

**Pass if:** Navigation works from mood back to home.

## Progress

### Automated

- [x] 1.1 Astro sync
- [x] 1.2 Lint
- [x] 1.3 Build

### Manual

- [ ] 1.1 Sign-in lands on home action hub
- [ ] 1.2 Legacy dashboard bookmark redirects
- [ ] 1.3 Book pages link Home
- [ ] 1.4 Mood page links Home
