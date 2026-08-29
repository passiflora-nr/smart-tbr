# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-08-29

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the risk wins. Do not promote to e2e because e2e "feels safer." Do not put a vision model on top of a deterministic visual diff that already catches the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the owner is worried about X, and the failure would surface somewhere in `<area>`" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents _what could fail_ and _why we believe it's likely_ — drawn from documents, interview, and codebase _signal_ (churn, structure, test base). It does NOT claim to know which line owns the failure. That knowledge is produced by `/10x-research` during each rollout phase. If the plan and research disagree about where the failure lives, research is the ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/` (27 commits in the 30 days before 2026-08-22; excludes `context/`, `.cursor/`, docs, build output, lockfiles).

**Project-specific constraint.** Roadmap slice S-07 (`ui-theme-cafe-romance`) rewrites the markup of every user-facing surface and is the next change in the queue. Every test this rollout adds must therefore assert on **behaviour and data** — which books appear, what persists, which status is returned — and never on CSS classes, DOM structure, element counts, or snapshots. A suite coupled to today's markup would be deleted by S-07 instead of protecting it.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by risk = impact × likelihood. Risks are failure scenarios in user / business terms, not test names. The Source column cites the _evidence that surfaced this risk_ — never a specific file as "where the failure lives" (that is research's job, see §1 principle #3).

| #   | Risk (failure scenario)                                                                                                                                                                                                | Impact | Likelihood | Source (evidence — not anchor)                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A book's data is silently altered or lost on add/edit — a trope tag dropped, a field not persisted — and the user only discovers it later when the book stops surfacing in mood results                                  | High   | High       | interview Q1; interview Q2 (recurring defect class: control renders, does not act); hot-spot dir `src/components/books` (29 commits/30d); PRD Primary success criterion (migrate ≥ 100 books) |
| 2   | An interactive control on the TBR surfaces — search submit, trope filter, delete confirm, edit save, navigation — renders correctly but does nothing, or the wrong thing, and only hand-testing in a browser catches it  | High   | High       | interview Q2 (explicit, recurring, every slice); interview Q3; hot-spot dirs `src/pages/books` (19 commits/30d), `src/components/books` (29 commits/30d)                   |
| 3   | The app-wide theme rewrite silently breaks behaviour on a page it restyles — a form stops submitting, a filter stops being read, an empty state vanishes — because it rewrites markup everywhere with no automated net   | High   | High       | roadmap S-07 (explicitly a per-page rewrite, not a token swap); interview Q3 (named as the top anxiety)                                                                    |
| 4   | A book-mutating request acts on a record the caller does not own, or the cookie-authenticated hard delete is triggered from another site, because an ownership check or the origin check regressed                       | High   | Medium     | PRD FR-011 and the cross-account privacy guardrail; `AGENTS.md` hard rule (origin check plus `SameSite=Lax` are the only defence for the delete form-post); hot-spot dir `src/pages/api/books/[id]` (4 commits/30d) |
| 5   | The mood-trope picker returns books that do not overlap the chosen tropes, shows more than three results without an explicit expansion request, or shows a blank screen instead of the "no matches" explanation — so the core ritual quietly stops being trustworthy | High   | Medium     | PRD US-01 acceptance criteria, FR-010; interview Q1; hot-spot dirs `src/lib` (12 commits/30d), `src/pages` (18 commits/30d)                                                |
| 6   | Validation drifts between the browser form and the server, so a book the user typed is silently refused, or is saved with wrong or missing trope tags, part-way through migrating a 100-book backlog                     | High   | Medium     | PRD FR-004 (free-text tropes, required) and the ≤ 30s entry guardrail; owner calibration 2026-08-22 (impact raised to High: a refused or mis-saved entry during migration is data loss); hot-spot dir `src/lib` (12 commits/30d) |
| 7   | A signed-out visitor reaches a TBR page, or a signed-in user is bounced to sign-in from a page they should reach, because a newly added route was never added to the protected-route list                                 | Medium | Medium     | interview Q1 (locked out); `AGENTS.md` hard rule (`PROTECTED_ROUTES` is the single gate; API routes self-authenticate instead); hot-spot dir `src/pages` (18 commits/30d); owner calibration 2026-08-22 (impact lowered to Medium: the cross-account-leak half of this scenario is carried by Risk #4, leaving the recoverable lockout half) |

**Deliberately excluded from the map.** Two candidate risks were dropped during the challenger pass. _"Recommendation exceeds the 2-second guardrail"_ — the PRD names the guardrail, but at roughly 100 rows behind one indexed query this is Low likelihood, and latency assertions in a suite are flaky and low-signal; this belongs to a manual spot-check. _"Catastrophic data loss / durability"_ — the PRD makes best-effort durability an explicit non-promise, so there is no behaviour to defend.

### Risk Response Guidance

| Risk | What would prove protection                                                                                                                        | Must challenge                                                                                              | Context `/10x-research` must ground                                                                                              | Likely cheapest layer                                | Anti-pattern to avoid                                                                                              |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| #1   | A book submitted with N trope tags is readable back with exactly those N tags; an edit that changes one field leaves every other field intact        | "The form posted successfully" implies the data persisted correctly — a redirect proves neither              | Where book writes are persisted, how trope tags are stored and round-tripped, what the request-to-storage boundary actually is    | integration (request → persisted state → read back)  | Asserting the redirect status only; over-mocking the storage layer so nothing is really written                     |
| #2   | Submitting a filter, search, delete, or edit action produces the changed **set of books** the user expects, driven by what the control really sends | "The control is present in the HTML" implies it works; a rendered button proves nothing about its action     | How filter and search state travels (query params vs. form post vs. client state), and which surfaces need JavaScript at all      | integration (assert which book titles appear)        | Asserting CSS classes, DOM structure, or element counts — all of which S-07 will change                            |
| #3   | Every critical flow still passes after a page's markup has been rewritten wholesale                                                                  | "Tests pass" implies behaviour is safe, when the tests were coupled to the old markup                        | Which surfaces are server-rendered with no JavaScript vs. genuinely island-dependent (`lessons.md` flags this distinction)        | integration, plus a thin e2e net on critical flows   | Snapshot tests; any assertion on class names, colours, or layout — the rewrite changes all of them on purpose      |
| #4   | A mutating request carrying account A's session cannot alter or delete account B's book; a cross-origin post to the delete route is refused          | "Row-level security in the database covers it" — our own code can bypass the owner check via the wrong key   | Which client and key each mutating route uses, how ownership is verified per request, and how the origin check is enforced        | integration (two-account fixture; forged-origin post) | Testing the database's own rules instead of our code path; testing only the authenticated happy path                |
| #5   | Selecting tropes returns only books sharing at least one; a new query opens at three in deterministic title-then-id order; explicit expansion reveals the next three until the finite match total; a new selection resets to three; invalid or missing `show` counts fall back to three; a large valid `show` is clamped to the match total; zero matches produces the explanatory message, not a blank page | Any-match overlap "obviously works" — the boundaries break it (3 selected, 1 shared of 5, empty TBR, no tropes). Showing more than three without an explicit expansion is a defect; showing more after the reader asks is the approved contract. | Where the overlap rule lives, what its inputs are, and where the empty-state branches are decided                             | unit for the rule, integration for the screen states | Copying the expected result out of the matching code itself — the oracle must come from PRD FR-010, not the implementation |
| #6   | Input the browser form accepts is accepted by the server, and input it rejects is rejected server-side with a message the user can act on             | The client island's validation is the contract — the server must not trust the client                        | Whether one schema is genuinely shared by both sides or two definitions exist, and what the required/optional field set is        | unit on the shared contract, integration on the route | Testing only the client; asserting exact error-message wording rather than the accept/reject decision               |
| #7   | Every page requiring sign-in redirects an unauthenticated visitor; every JSON endpoint returns 401 rather than an HTML sign-in page                   | The route list is complete, and a newly added page is protected by default                                   | The actual enumerated protected-route set, and how API routes self-authenticate differently from page routes                      | integration (table-driven sweep over the real list)  | Hand-listing routes in the test, which drifts the moment a page is added — derive the list from the app             |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder via `/10x-new`. Status moves left-to-right through the values below; the orchestrator updates Status as artifacts appear on disk.

| #   | Phase name                    | Goal (one line)                                                                                                      | Risks covered  | Test types                | Status      | Change folder |
| --- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------- | ----------- | ------------- |
| 1   | Harness + data-integrity core | Stand up the test runner, then prove a book survives add/edit intact and that trope matching obeys FR-010            | #1, #5, #6     | setup, unit, integration  | implementing  | `context/changes/testing-harness-and-data-integrity/` |
| 2   | TBR surface behaviour         | Prove every control on browse/search/filter/edit/delete produces the right set of books, asserting data not markup   | #1, #2, #3     | integration               | not started | —             |
| 3   | Access control and abuse      | Prove ownership is enforced per request, cross-origin deletes are refused, and route gating holds for new routes     | #4, #7         | integration               | not started | —             |
| 4   | Critical-path e2e net + gates | A thin browser-level net over sign-in → add book → browse → mood pick, run on all three engines, wired as a required CI gate before S-07 starts | #2, #3 (cross-cutting) | e2e, gates        | not started | —             |

**Ordering rationale.** Phase 1 is unavoidable: with no runner and no test files, nothing can be asserted until one exists, and it pairs the bootstrap with the highest-scoring risk. Phase 2 targets the defect class the owner has actually lived through (interview Q2) at the layer that survives the S-07 rewrite. Phase 3 covers lower-likelihood but irreversible failures and is short. Phase 4 is last because the cheaper layers cover most of the surface first, but it must land **before** the S-07 theme rewrite begins.

**No AI-native phase.** Under cost × signal it earns nothing here: the product contains no AI (PRD Non-Goals rule out inference and learned ranking), the recommendation rule is deterministic tag intersection, and §7 excludes visual styling from the test budget — a multimodal visual review would duplicate the owner's own eyes at real cost.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a `checked:` date so future readers can see which lines need re-verification. Recommendations in this section are grounded in the local manifest and configs plus the MCP tools actually exposed in the session that wrote this plan.

| Layer              | Tool                       | Version | Notes                                                                                                        |
| ------------------ | -------------------------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| unit + integration | Vitest (unit project)      | 4.1.11  | Named `unit` project, `environment: "node"`, no DOM. Integration project and local-Supabase lifecycle land in this change's second implement phase. |
| component render   | none yet — see Phase 1     | —       | Astro's Container API renders `.astro` components directly; available since Astro 4.9, still experimental.    |
| data boundary      | none yet — see Phase 1     | —       | Supabase is the only external boundary. The local Supabase stack plus the existing seed accounts is the honest integration surface — **how tests reach it is an open decision Phase 1 research must ground**, not a choice this plan pre-decides. No HTTP-mocking library is proposed. |
| e2e                | none yet — see Phase 4     | —       | Playwright, run against all three engines (Chromium, Firefox, WebKit) so the PRD's four-browser matrix is honoured automatically — Chrome and Edge share Chromium. Rationale: the repeat cost is machine minutes on a thin net, versus the owner hand-clicking every flow three times. Known caveat: WebKit on Linux CI is the flakiest of the three and is not identical to Safari on macOS; if it becomes noisy, quarantine that engine rather than deleting the matrix. |
| accessibility      | none — not in this rollout | —       | `eslint-plugin-jsx-a11y` already runs in lint. No runtime a11y assertions proposed for v1.                    |

**Stack grounding tools (current session):**

- Docs: Context7 (`/withastro/docs`) — verified that Astro 6 no longer renders Astro components in Vitest client environments and requires `environment: "node"`, and that the Container API is the supported way to render `.astro` components in tests; checked: 2026-08-22
- Search: Exa.ai — available, not used; the Astro docs answered the stack questions directly; checked: 2026-08-22
- Runtime/browser: none — no Playwright or browser MCP exposed in this session, so Phase 4 must install Playwright as a normal dev dependency; checked: 2026-08-22
- Provider/platform: none — no GitHub, Cloudflare, or Supabase MCP exposed in this session; CI and deploy gates must be reasoned from the repo's own workflow and Wrangler config; checked: 2026-08-22

## 5. Quality Gates

The full set of gates that must pass before a change reaches production. "Required after §3 Phase N" means the gate is enforced once that rollout phase lands; before that, the gate is planned.

| Gate                            | Where                | Required?                 | Catches                                                            |
| ------------------------------- | -------------------- | ------------------------- | ------------------------------------------------------------------ |
| lint + typecheck                | local + CI           | required (already wired)  | syntactic and type drift                                           |
| manual browser pass             | before merge         | required (already wired)  | everything the suite deliberately excludes (see §7) — chiefly whether pages *look* right per browser, which the e2e net does not judge |
| unit                            | local + CI           | required after §3 Phase 1 | trope-matching and validation-contract regressions                 |
| integration on book data        | local + CI           | required after §3 Phase 1 | a book losing fields or trope tags between form and storage        |
| integration on TBR surfaces     | local + CI           | required after §3 Phase 2 | controls that render but do not act, or act on the wrong set       |
| access-control sweep            | local + CI           | required after §3 Phase 3 | ownership, origin-check, and route-gating regressions              |
| e2e on critical flows           | CI on PR             | required after §3 Phase 4 | a broken sign-in → add → browse → mood path, in any of the four PRD browsers |
| full-suite run before S-07      | local, once          | required after §3 Phase 4 | behaviour drift introduced by the app-wide theme rewrite            |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once the relevant rollout phase ships; before that, the sub-section names the pattern it is waiting on.

### 6.1 Adding a unit test

- Put the file in `tests/unit/` and name it `*.test.ts`. The named `unit` project includes only that tree.
- Run the focused command: `npm run test:unit`. Use typed fixtures and import product modules via `@/*`.
- Assert accept/reject decisions, normalized values, titles, and statuses. Do not assert CSS classes, DOM structure, element counts, or snapshots.
- For mood behavior, take the expected result from the reconciled FR-010 contract: any-match, opening at three, deterministic title-then-id order, expansion in steps of up to three (the control names the next-click count), reset on a new selection, invalid-count fallback, and finite-total clamping. Do not copy expected results out of the implementation under test.

### 6.2 Adding an integration test

- TBD — see §3 Phase 1. Will cover the request-to-persisted-state-and-back pattern that proves a book keeps every field and trope tag through add and edit.

### 6.3 Adding an e2e test

- TBD — see §3 Phase 4. Will cover the critical path sign-in → add book → browse → mood pick, run across all three engines. A new e2e test is added once and inherits the engine matrix from the Playwright config — never hand-duplicated per browser.

### 6.4 Adding a test for a new API endpoint

- TBD — see §3 Phase 1 for the request-and-side-effect pattern, and §3 Phase 3 for the ownership and 401-not-HTML pattern every new endpoint must satisfy.

### 6.5 Adding a test for a new page or route

- TBD — see §3 Phase 3. Will cover the table-driven gating sweep, derived from the app's own protected-route list rather than hand-listed in the test.

### 6.6 Adding a test for a control on a list surface

- TBD — see §3 Phase 2. Will cover asserting on which book titles appear or disappear, never on markup, so the test survives the S-07 rewrite. Related rule: `lessons.md` — prefer native HTML over React islands on per-row list surfaces, and verify with JavaScript disabled.

### 6.7 Per-rollout-phase notes

(Optional. After each phase lands, `/10x-implement` appends a two-to-three-line note here capturing anything surprising the phase taught.)

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future contributors should respect these unless the underlying assumption changes.

- **Visual styling — colours, fonts, spacing, layout.** The owner verifies these by eye, and S-07 is about to change all of them. Re-evaluate if the project ever gains a second theme or a designer other than the owner. (Source: Phase 2 interview Q5.)
- **The off-the-shelf shadcn UI primitives** (button, badge, input, and similar). They come from a widely used public library, and a broken primitive would fail loudly on every page. Re-evaluate if a primitive is forked and given project-specific behaviour. (Source: Phase 2 interview Q5.)
- **The auto-generated database types file.** It is produced by `npm run gen:types` from the live schema and never hand-edited; a mismatch fails the build on its own. Re-evaluate if the file is ever edited by hand. (Source: Phase 2 interview Q5.)
- **Supabase's own built-in behaviour** — its password checks, its database-level owner-only rule, and its cascade when an account is deleted. These are the vendor's job. **Our own code keeping the owner check switched on is still tested** under Risk #4. Re-evaluate if the project ever bypasses the standard client or grants elevated database access to a new code path. (Source: Phase 2 interview Q5, with the Risk #4 carve-out.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-08-22
- Stack versions last verified: 2026-08-22
- AI-native tool references last verified: 2026-08-22 (none recommended; re-check only if the product gains AI features, which PRD Non-Goals currently forbid)

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the owner believes,
- S-07 (`ui-theme-cafe-romance`) has landed and the theme-rewrite risk (#3) is spent.
