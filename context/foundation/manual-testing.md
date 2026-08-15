# Manual testing guide

The primary reader for manual verification in this project is a **tester, not a developer**. Plans, PR test plans, and agent messages must assume the reader is checking the app in a browser — not reading source code.

## Audience

When explaining what changed or what to verify:

- Use plain language. Say **what you see and do**, not how the code works.
- Define jargon the first time (e.g. "TBR = your to-read book list").
- Prefer **page names, button labels, and URLs** over file paths and component names.
- Skip implementation detail unless it changes what the tester should expect (e.g. "works with JavaScript turned off" is useful; "React island hydrates" is not).

## Manual verification format

**Do not** give manual tests as a single summary line (e.g. "Title search narrows the list").

**Do** write numbered steps for each test: setup, actions, and expected result.

Each manual test should include:

1. **Setup** — how to start (URL, account to sign in with, seed data if relevant).
2. **Steps** — numbered clicks/typing/navigation in order.
3. **Expected result** — what should appear, disappear, or stay the same.
4. **Pass criteria** — one sentence a tester can answer yes/no.

### Example — too brief (avoid)

> Title, author, and case-insensitive search each narrow the list.

### Example — good

> **2.4 — Search by title, author, and case**
>
> **Setup:** Sign in as `user-c@example.test` / `password`. Open `/books` (you should see many books).
>
> **Steps:**
> 1. In the search box, type part of a book title you can see on the page (e.g. the first word only).
> 2. Submit or wait for the list to update.
> 3. Clear the search. Repeat with part of an author name.
> 4. Search again using UPPERCASE letters for a title you know is lowercase on the page.
>
> **Expected:** After each search, only books matching that text remain. Case does not matter. Clearing search shows the full list again.
>
> **Pass if:** All three searches filter correctly and clear restores the full list.

## Where this applies

| Artifact | Requirement |
| -------- | ----------- |
| Plan phase blocks (`#### Manual Verification:`) | Full step-by-step tests (source of truth) |
| Plan `## Progress` manual rows | Short checkbox titles are OK; they must point to a detailed test in the phase block above |
| Agent messages after automated checks | Expand manual items into numbered steps — do not paste Progress one-liners alone |
| PR test plans | Same step format; link to the plan's manual section when one exists |

## Test accounts and local setup

For local manual testing, use accounts from `supabase/seed.sql` (documented in `@README.md`). Always say which account to use when a test depends on specific data (empty list vs many books, etc.).
