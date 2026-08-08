<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Add a Book to the TBR (S-01)

- **Plan**: context/changes/add-book-to-tbr/plan.md
- **Scope**: Phases 1–4 of 4 (full plan)
- **Date**: 2026-08-08
- **Verdict**: APPROVED
- **Triage**: complete — 2 fixed, 1 accepted (2026-08-08)
- **Findings**: 0 critical, 0 warnings, 3 observations
- **Commits reviewed**: c22b888, 1348bb7, cb75e68, ef11aae, 44e0aa9 (branch `feat/add-book-to-tbr`)
- **Note**: Re-review of current tree after prior triage fixed 5 findings (fieldErrors cap, console.error on 500s, FormField/TropeInput a11y, mergePendingTrope, AbortSignal.timeout).

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence gathered

All 10 planned source changes verified as MATCH against their contracts, with two intentional post-triage deviations noted as observations (not failures). No MISSING items. No EXTRA source files — branch touches exactly the planned paths plus `package-lock.json` and `context/changes/add-book-to-tbr/**`.

Load-bearing contracts still hold:

- **Trope transform ordering** — trim → per-item 60-char cap → drop empties → exact dedupe (case-preserving) → min/max on cleaned array.
- **Synchronous merge in `AddBookForm`** — `mergePendingTrope` returns a local array used for both state update and `bookSchema.safeParse`; rejected pending text stays in the field (Enter and Save agree).
- **Ownership** — zod strips unknown keys (no `user_id` on schema); handler sets `user_id: user.id` from `getUser()`; RLS insert policy is the backstop. Client-facing errors are fixed strings; driver errors go to `console.error` only.

### Success criteria verification

| Criterion | Result |
|---|---|
| `npx astro sync` | PASS — exit 0, types generated |
| `npm run lint` | PASS — exit 0; 2 `no-console` warnings on intentional `console.error` (books.ts) |
| `npm run build` | PASS — exit 0, server built |
| Unauthenticated `POST /api/books` → 401 JSON | PASS — `401 application/json` `{"error":"Unauthorized"}` |
| Empty title + no tropes → 400 with `fieldErrors` naming both | PASS (schema) — `{"title":["Title is required"],"tropes":["Add at least one trope"]}` |
| Non-JSON body → 400, not 500 | PASS (code path) — `books.ts:27-32` try/catch returns 400 |
| Unauthenticated `GET /books/new` → 302 | PASS — `302` → `/auth/signin` |
| `supabase/tests/rls.sql` clean | Accepted as previously run (ef11aae); test file unchanged by this slice |
| CI passes on branch | PASS — CI success on `44e0aa9` (`feat/add-book-to-tbr`) |

Manual Progress items 1.7–1.8, 2.3–2.8, 3.5–3.13, 4.3–4.5 are all `[x]` with commit SHAs. Observable evidence in the diff supports the UI/API contracts; timed entry and multi-browser checks remain human-attested (not re-timed in this review).

## Findings

### F1 — Session list also renders description

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/books/SavedBooksList.tsx:22
- **Detail**: Plan contract for the session list is title, author, and trope chips. Implementation also shows `book.description` when present. Wording still correctly frames the list as session-only (not "Your TBR"). Harmless and useful for verifying optional description persistence, but it is unplanned surface.
- **Fix**: Leave as-is, or document as a one-line plan addendum if you want the plan to stay the source of truth.
- **Decision**: FIXED — plan contract updated to include description when present.

### F2 — 400 `fieldErrors` pre-truncated vs plan wording

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/api/books.ts:40-44
- **Detail**: Plan said return `z.flattenError(...).fieldErrors` as-is (client maps to first message). Current code caps each field to one message before responding. That is the deliberate fix from the prior review (unbounded response amplification under auth). Behavior is better than the original plan; the plan text was not updated.
- **Fix**: Add a short plan addendum noting the server-side first-message cap, or leave the plan historical and accept the hardening.
- **Decision**: FIXED — plan contract updated to document the first-message cap on fieldErrors.

### F3 — Two intentional `no-console` warnings in CI lint

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/books.ts:61,80
- **Detail**: Prior triage added `console.error` before both 500 returns so Workers observability can diagnose failures without leaking driver text to clients. Lint exits 0 with exactly two `no-console` warnings. Fine today (`no-console` is warn; CI does not use `--max-warnings=0`), but noisy if the team later tightens the baseline.
- **Fix**: Keep as-is until a structured logger exists; optionally `eslint-disable-next-line no-console` with a one-line rationale if zero-warning lint becomes a goal.
- **Decision**: ACCEPTED — keep console.error for Workers observability; tolerate the two no-console warnings until a structured logger exists.
