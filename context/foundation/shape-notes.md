---
project: SmartTBR
context_type: greenfield
created: 2026-05-21
updated: 2026-05-22
prd_priors:
  product_type: web-app
  target_scale:
    users: small
    qps: low
    data_volume: small
  timeline_budget:
    mvp_weeks: 4
    hard_deadline: null
    after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: primary persona scope
      decision: single named user (the author) — heavy reader with a fragmented trope-driven TBR
    - topic: pain category
      decision: data trapped across multiple surfaces + decision paralysis from a 100+ book backlog
    - topic: insight vs. status quo
      decision: existing trackers index by genre/rating, not by trope; mood-driven trope-matching is the unmet need
    - topic: authentication shape
      decision: email + password login; server-backed so the user can reach their TBR from any device
    - topic: role separation
      decision: flat user model — every user sees only their own TBR; no sharing, no admin
    - topic: MVP flow scope
      decision: |
        Locked flow (6 steps): sign-up → add book (title + author + tropes only)
        → browse / edit / delete → open trope selector → pick tropes matching
        current mood → receive 3 matched books from own TBR.
    - topic: book entry fields
      decision: title + author + tropes only; length and description fields dropped entirely
    - topic: recommendation result count
      decision: 3 matched books per query (down from 5)
    - topic: success criteria framing
      decision: personal-first (Primary = my migration + my regular use); beta-user 75% metrics live as Secondary, re-checked when others get access
    - topic: MVP timeline
      decision: 4 weeks, sustained-effort cost acknowledged
    - topic: trope source
      decision: free-text typed trope tags (no curated vocabulary in v1; typo risk accepted)
    - topic: multi-trope match rule
      decision: any-match — a book matches if at least one of its trope tags is in the selected set
    - topic: book entry fields (Socrates revision)
      decision: title (required) + author (required) + trope tags (required) + description (optional); length and cover-image remain cut
    - topic: list usability at 100+ books (Socrates revision)
      decision: added FR-012 — substring search on title/author plus filter by trope tags
    - topic: trope selector multi-select complexity (Socrates revision)
      decision: multi-select retained but capped at 3 trope tags per recommendation query
    - topic: business logic (one-sentence rule)
      decision: |
        Given a user's TBR and a set of 1–3 trope tags representing the
        user's current mood, SmartTBR returns up to 3 books from that TBR
        whose tag set intersects the mood set in at least one position.
    - topic: NFR scope
      decision: only NFRs that mirror locked Guardrails are captured; broader quality dimensions (browser/mobile support, session durability, uptime) routed to Open Questions
    - topic: product type
      decision: web-app
    - topic: target scale
      decision: small (single-digit users — me + a handful of beta testers)
    - topic: deadline
      decision: no hard deadline; soft 4-week target (hard_deadline=null in PRD frontmatter)
    - topic: work mode
      decision: after-hours / side project only
    - topic: curated trope vocabulary
      decision: NOT a non-goal at Phase 6 close on 2026-05-21; re-clarified on 2026-05-22 (see below)
    - topic: browser support (resolved 2026-05-22, OQ #1)
      decision: latest two major versions of the four mainstream desktop browsers
    - topic: mobile-browser commitment (resolved 2026-05-22, OQ #1)
      decision: desktop-only for v1; explicit walk-back of the "I'll add books from my phone" phrasing from Phase 1 persona; mobile-browser usability deferred to v2+
    - topic: session durability (resolved 2026-05-22, OQ #1)
      decision: ≥ 30 days of inactivity tolerance, survives browser restarts within that window, ends immediately on explicit sign-out
    - topic: uptime / availability (resolved 2026-05-22, OQ #1)
      decision: best-effort, no formal SLA; explicit non-promise rather than missing dimension
    - topic: beta cohort timing (resolved 2026-05-22, OQ #3)
      decision: invite after ≥ 2 weeks of the author's personal migration use; 4-week beta measurement window before reading 75% numbers
    - topic: beta feedback instrument (resolved 2026-05-22, OQ #3)
      decision: structured external questionnaire only; no in-app feedback FR added (keeps v1 scope tight)
    - topic: beta recruitment source (resolved 2026-05-22, OQ #3, operational note)
      decision: friends / reading-group acquaintances first; not a PRD-body concern, kept here for the author's own planning
    - topic: trope autocomplete in v1 (resolved 2026-05-22, OQ #2)
      decision: NOT in v1 — pure free-text entry per FR-004 stands
    - topic: global trope vocabulary curation (resolved 2026-05-22, OQ #2, permanent boundary)
      decision: permanent non-goal — no global curated taxonomy, no canonical-form normalization across users, ever; user wording IS the data
    - topic: per-user trope autocomplete in v2+ (resolved 2026-05-22, OQ #2, v2+ design intent)
      decision: v2+ may add autocomplete suggestions drawn ONLY from the same user's previously-used tropes; trigger is the author's lived experience of fragmentation hurting recommendations during own use
    - topic: account deletion (resolved 2026-05-22, OQ #4 / new PRD OQ #1)
      decision: self-serve — new FR-013 added; deleting an account also removes all of that user's books and trope tags and ends the session; requires explicit confirmation step
    - topic: data export (resolved 2026-05-22, OQ #4 / new PRD OQ #1)
      decision: NOT in v1 — explicit non-goal; users who want to leave SmartTBR re-key data manually elsewhere; may be reconsidered in v2+
    - topic: operator backup posture (resolved 2026-05-22, OQ #4 / new PRD OQ #1)
      decision: best-effort, no formal data-durability commitment; catastrophic single-region failure may result in data loss; mitigation is the existing Guardrail that original surfaces (Instagram/Amazon/phone notes) remain untouched during migration
  frs_drafted: 13
  quality_check_status: accepted
---

## Vision & Problem Statement

A heavy reader maintains a "To Be Read" list of 100+ titles, but those titles are scattered across saved Instagram posts (from Bookstagram/BookTok creators), an Amazon wishlist used as a bookmark, and loose notes on their phone. When they sit down to choose the next read, two things happen at once: the list is fragmented across surfaces, so they cannot see it as a single pile, and even where they can see it, picking by trope and current mood from a 100-book backlog produces decision paralysis. The cost today is hunting time that ends with either rereading something familiar or abandoning the choice for a scroll session.

The insight: existing book trackers (Goodreads, StoryGraph, notebook apps) index by genre and rating, not by trope. None of them treat "what trope am I in the mood for right now?" as the primary access pattern, and none collapse a scattered multi-surface TBR into one trope-indexed pile that the reader can query by mood. Trope-first organization plus mood-driven suggestion, in one place, is the unmet need.

## User & Persona

**Primary persona: Self — the heavy reader with a fragmented trope-driven TBR.**

A reader who follows multiple Bookstagram/BookTok creators, accumulates book recommendations across three or four scattered surfaces, and maintains an active TBR backlog of 100+ titles. They make book-choice decisions primarily by trope ("I want enemies-to-lovers tonight", "I'm in a grumpy-sunshine mood") and care about literary preferences (tropes, themes) more than star ratings or sales rank. The moment they reach for SmartTBR: sitting down to start the next book, knowing what mood/trope they want, and not wanting to scroll across those surfaces or be paralyzed by the size of the list.

(Single-user MVP. No secondary persona for v1.)

## Access Control

Email + password authentication. Each account is private and isolated — every user has exactly one TBR, and they only ever see their own. Flat user model: no roles, no sharing, no admin separation.

Sign-up creates a fresh, empty TBR account. Sign-in returns the user to their own TBR. Sign-out returns them to the public landing / sign-in page. An unauthenticated visitor hitting any TBR-related route is redirected to sign-in.

## Success Criteria

### Primary
- The author has moved their entire active TBR backlog (≥ 100 books) out of Instagram saves, Amazon wishlist, and phone notes into SmartTBR within 2 weeks of the app being usable. (Proves the consolidation value — the scattered-surface problem is actually solved, not just theoretically solvable.)
- The author uses the mood/trope selector to pick their next read at least 8 times in the 4 weeks following migration. (Proves the trope-driven selection flow is fast and useful enough to become the new default ritual, replacing scrolling Instagram saves.)

### Secondary
- A beta cohort of ≥ 3 readers other than the author is invited after the author has used the app for ≥ 2 weeks of personal migration; ≥ 75% of beta testers, surveyed via a structured external questionnaire after a 4-week beta usage window, report that the suggested books accurately match the specific tropes they selected. (Validates the trope-matching logic generalizes beyond the author's own tagging habits.)
- ≥ 75% of the same beta cohort, in the same questionnaire, report they no longer maintain active reading lists elsewhere because they've migrated to SmartTBR. (Validates the consolidation value externally.)

### Guardrails
- A user can never see another user's TBR. (Cross-account data leak is a critical regression even if Primary holds.)
- Adding a book takes ≤ 30 seconds of typing per book once the form is open. (If data entry is slow, the up-front migration tax of moving ≥ 100 books kills the product before Primary can be measured.)
- The trope/mood selector returns its 3 matched books in ≤ 2 seconds end-to-end. (A decision-paralysis product that itself makes the user wait fails its own value proposition.)
- The author's existing TBR notes in Instagram / Amazon / phone notes remain untouched during migration to SmartTBR. (Migration is one-way out of those surfaces; SmartTBR must not require trusting it before it has earned that trust.)

## Timeline acknowledgment

Acknowledged on 2026-05-21: 4-week MVP requires sustained dedication — roughly two to three productive evenings per week plus partial Saturdays for four consecutive weeks. User accepted the cost knowing the typical motivation dip falls around weeks 3–4, and committed to holding the scope (no creep beyond the locked flow + accepted cuts above).

## User Stories

### US-01: User picks the next book by mood-tropes

- **Given** a signed-in user with at least one book in their TBR
- **When** they open the trope-selection screen, pick one or more trope tags representing their current mood, and submit
- **Then** they see up to 3 books from their own TBR whose trope tags include at least one of the selected mood-tropes

#### Acceptance Criteria
- The trope-selection screen shows only trope tags that appear on at least one book in the user's own TBR (the universe of pickable tropes is derived from the user's own data, not a global vocabulary).
- If the user's TBR is empty, the trope-selection screen shows an explanatory empty-state ("Add a book to your TBR first"), not a 0-result list.
- If no books in the TBR match any of the selected tropes, the result screen shows an explanatory empty-state ("No matches — try different tropes"), not a blank screen.
- Each returned book shows its title, author, and the trope tags it was tagged with.
- The result screen returns within ≤ 2 seconds end-to-end (per Guardrail).
- No book from another user's TBR can appear in the result, by construction.

## Functional Requirements

### Authentication
- FR-001: A new visitor can create an account with email + password. Priority: must-have
  > Socrates: Reviewed counters (pre-seed the account and skip signup; passwordless as safer). Resolution: stands as written — beta testers in the Secondary success criterion require a public sign-up flow, and email + password keeps onboarding self-contained with no external email provider.
- FR-002: A returning user can sign in with email + password. Priority: must-have
  > Socrates: Reviewed counters (session-management complexity; stay-logged-in forever on personal devices). Resolution: stands as written — sign-in is required to support beta testers (FR-001 has no value without it), and session management is non-optional once accounts exist.
- FR-003: A signed-in user can sign out, returning to the public landing / sign-in page. Priority: must-have
  > Socrates: Reviewed counters (rarely used in personal apps; not needed if devices aren't shared). Resolution: stands as written — sign-out is cheap once sign-in exists, and beta testers may use shared devices.
- FR-013: A signed-in user can permanently delete their own account; the deletion also removes all of that user's books and trope tags and immediately ends the session. The action requires an explicit confirmation step before being applied. Priority: must-have
  > Socrates: Added 2026-05-22 from OQ #4 (data lifecycle) resolution, outside the formal Phase 4.5 loop. Counter-argument considered: "account deletion is rarely used in personal apps; could ship without it and have users contact the operator manually." Resolution: user picked self-serve over manual operator action — small build cost (~1–2 hours), gives beta testers a clean exit after the 4-week test, and satisfies a common privacy expectation without out-of-band operator involvement.

### Book entries
- FR-004: A signed-in user can add a book to their TBR by entering title (required), author (required), one or more free-text trope tags (required), and a free-text description (optional). Priority: must-have
  > Socrates: Counter-argument considered: "Title + author + tropes is too thin — without description I won't recognize older books I added months ago." Resolution: FR-004 REVISED — description added back as an OPTIONAL field so it doesn't slow down quick-add but is available when memory is fuzzy. Length field remains cut (not used by the recommendation rule).
- FR-005: A signed-in user can view their full TBR as a browsable list. Priority: must-have
  > Socrates: Counter-argument considered: "A flat list of 100+ books is unusable; this FR needs search/filter to be meaningful." Resolution: FR-005 stands as written; new FR-012 added in this section to cover search/filter, keeping FR-005's contract narrow (just the rendered list) while addressing the unusability concern.
- FR-006: A signed-in user can edit any field (title, author, trope tags, description) of a book already in their TBR. Priority: must-have
  > Socrates: Reviewed counters (delete + re-add as workaround; edit silently shifts past recommendations). Resolution: stands as written — typos in free-text trope tags will be common, and forcing delete + re-add to fix a typo is excessive friction during the migration of 100+ books.
- FR-007: A signed-in user can delete a book from their TBR. Priority: must-have
  > Socrates: Reviewed counters (soft-delete / read-archived state would be better; books are rarely deleted from a TBR). Resolution: stands as written — hard delete is sufficient for v1; a read/archived state is a worthwhile v2 feature, not blocking the core flow.
- FR-012: A signed-in user can narrow their TBR list view via substring match on title or author, and/or by selecting one or more trope tags from a filter widget. Priority: must-have
  > Socrates: Added in response to FR-005's counter — addresses "100-book flat list is unusable" without changing FR-005's render contract. No separate Socrates challenge needed; it inherits the resolution that prompted its creation.

### Trope-based recommendation
- FR-008: A signed-in user can open a trope-selection screen that shows the set of distinct trope tags used at least once across their own TBR. Priority: must-have
  > Socrates: Reviewed counters (global vocabulary would aid discovery; cold-start screen is empty for new users; dynamic checklist is non-trivial UI). Resolution: stands as written — per-user vocabulary is required to honor FR-011's strict isolation; the empty-state is handled in US-01's acceptance criteria; the dynamic checklist is a single list render off existing data.
- FR-009: A signed-in user can select up to 3 trope tags that match their current mood and request a recommendation. Priority: must-have
  > Socrates: Counter-argument considered: "Multi-select adds combinatorial complexity in UI and matching; single-trope-at-a-time selection is simpler and may be enough." Resolution: FR-009 REVISED — multi-select retained but capped at 3 tropes per query, preventing combinatorial blow-up while keeping the core multi-trope value (the mood pattern "I want enemies-to-lovers AND grumpy-sunshine" is the central insight of the product).
- FR-010: The app returns up to 3 books from the user's TBR whose trope tags overlap with at least one of the selected mood-tropes (any-match), each shown with title, author, and tagged tropes. Priority: must-have
  > Socrates: Reviewed counters (any-match feels weak — one shared tag of five; no ranking risks repetition; 3 results is too few). Resolution: stands as written — any-match keeps results generous against a 100-book pile, where strict matching would frequently return zero; if repetition becomes a real problem during personal use, ranking can land in v2 without changing this FR's contract.

### Data isolation (defensive)
- FR-011: A user's queries (browse, search/filter, recommend) return only books belonging to that user; books owned by other accounts are never reachable via any UI or API surface. Priority: must-have
  > Socrates: Reviewed counters ("obvious, don't state"; future read-only browse-others view could be useful). Resolution: stands STRICT as written — making isolation an explicit FR prevents accidental leaks during v1 development (especially when handler code is being written quickly under timeline pressure); v2 sharing can be designed deliberately when v2 happens.

## Non-Functional Requirements

(The first three NFRs mirror locked Guardrails. The next three were resolved on 2026-05-22 from OQ #1. The final one — data durability — was resolved on 2026-05-22 from OQ #4.)

- The trope/mood selector produces its result (up to 3 books) within 2 seconds end-to-end of the user submitting their selection. (Mirrors the Guardrail; without this, the product's "no more decision paralysis" value proposition fails — a slow recommender is itself a source of decision paralysis.)
- A user's TBR (titles, authors, trope tags, optional descriptions) is never visible to any account other than the owning user, and is never returnable to a different account through any interface SmartTBR exposes. (Mirrors FR-011 and the privacy Guardrail at the product boundary, independent of mechanism.)
- Adding a single book to the TBR via manual entry requires no more than 30 seconds of user input once the entry surface is presented. (Mirrors the Guardrail; without this, the migration of 100+ books becomes a prohibitive up-front tax and Primary success criteria cannot be measured.)
- The product remains usable on the latest two major versions of the four mainstream desktop browsers. (Provides a predictable test matrix for v1; broader compatibility is not promised. Mobile browsers are explicitly excluded — see Non-Goals.)
- A signed-in session survives at least 30 days of user inactivity without requiring re-authentication, persists across browser restarts within that window, and ends immediately when the user explicitly signs out. (Reading sessions are weekly, not hourly; a tighter session window would force frequent re-auth that adds friction without any meaningful security benefit at single-digit users.)
- The product is provided on a best-effort availability basis; v1 makes no formal uptime commitment beyond the operator's reasonable effort to keep the single-region deployment reachable. (An explicit non-promise rather than a missing dimension. A formal availability target is a v2+ concern that arises when the product graduates to broader use.)
- User TBR data is preserved on a best-effort basis; v1 makes no formal data-durability commitment, and a catastrophic failure of the single-region deployment may result in data loss. (Distinct from the availability NFR above: availability is about reachability; data durability is about the data not being lost. The user's mitigation against worst-case loss in v1 is the Guardrail that original source surfaces — Instagram, Amazon, phone notes — remain untouched during migration, so SmartTBR can be re-populated by hand if needed.)

## Business Logic

Given a user's TBR (each book carrying free-text trope tags) and a set of 1–3 trope tags representing the user's current mood, SmartTBR returns up to 3 books from that TBR whose tag set intersects the mood set in at least one position.

The rule consumes two user-facing inputs: the user's accumulated TBR (manually entered, each entry tagged with one or more free-text tropes), and a transient mood query (a set of 1–3 trope tags the user picks from the trope vocabulary that exists in their own TBR). It does not consume star ratings, genre, length, publish date, or any external metadata — those exist nowhere in v1.

The rule produces a tightly bounded output: at most 3 books, each presented with title, author, and trope tags. The cap is intentional — the entire point is to escape the paralysis of a 100-book pile, so the rule never returns a long list, never "ranks" beyond the implicit filter, and never returns nothing if any match exists (it returns whatever matches, up to 3). If zero books match, the user is told explicitly so they can re-query with different tropes; the rule does not fall back to "books you might also like" or any other inferred substitute.

The user encounters the rule by opening the trope-selection screen at the moment of choosing the next book to read, picking up to 3 tropes that capture the current mood, and submitting. The 3 results are the decision space. The reader picks one and goes off to read it; no further system involvement is required.

## Non-Goals

(Each entry is an explicit avoidance — a capability or quality dimension this v1 will NOT deliver — with a one-line rationale that explains why it's out of scope.)

- Avoid: AI-generated book details, summaries, or trope inference. — Rationale: the product's value is that the user expresses their own reading taste through the trope words they choose; auto-inferred tropes would launder that out and make recommendations feel like "any other tracker".
- Avoid: AI-driven recommendation logic of any kind (no embeddings, no LLM, no learned ranking). — Rationale: explicit user-controlled trope-overlap IS the insight; an LLM-based recommender would re-introduce the black-box-recommendation experience the user is escaping.
- Avoid: importing book entries from external sources (Goodreads export, Amazon wishlist, CSV, OPDS, etc.). — Rationale: manual entry IS the migration the product is designed around — it forces the user to tag each book with tropes that matter to them, which is what makes the recommendation flow work.
- Avoid: integration with external platforms (Goodreads sync, Amazon affiliate links, library catalog APIs, social platforms). — Rationale: keeps the v1 scope local to "store + recommend" with no third-party API contracts to maintain inside a 4-week budget.
- Avoid: sharing the TBR with other users (no public profiles, no shared lists, no follow / friend social graph). — Rationale: enforces the FR-011 strict isolation and the Phase 1 insight that this is a personal pile sorter, not a social product.
- Avoid: native mobile app (iOS / Android). — Rationale: web is the v1 surface.
- Avoid: any mobile-browser usability commitment for v1. — Rationale: v1 targets desktop browsers exclusively (per Non-Functional Requirements). The product may not render or behave acceptably at phone widths, and that is not considered a defect for v1. Mobile-browser support — including the previously-mentioned "add a book from my phone" moment — is deferred to v2+. (Walks back Phase 1 persona phrasing; resolved 2026-05-22, OQ #1.)
- Avoid: complex recommendation algorithms beyond simple tag-set intersection (no scoring weights, no collaborative filtering, no ML). — Rationale: the Business Logic is intentionally simple; algorithmic complexity here would consume timeline budget without proving the core insight that trope-matching alone solves the problem.
- Avoid: ranking or ordering within the 3 recommended results (no "best match first", no recency weighting, no random shuffle). — Rationale: v1 returns any matching books up to 3; ranking is a v2 concern once we know whether the simple match is good enough on its own.
- Avoid: a "read" / "archived" / "finished" state for books. — Rationale: hard delete is sufficient for v1 (per FR-007 Socrates resolution); a status state machine is a v2 concern.
- Avoid: offline-first guarantees (no service worker, no local cache, no progressive web app installability). — Rationale: connected web app only; adding offline doubles the engineering scope and adds sync-conflict surface area that doesn't earn its keep at single-digit users.
- Avoid: aiming for any compliance certification beyond baseline practices, and any multi-region SLA. — Rationale: v1 is single-region, personal-scale; compliance certification and multi-region availability are concerns that arise when the product graduates to broader use.
- Avoid in v1: any trope autocomplete or trope-vocabulary curation. — Rationale: v1 ships pure free-text trope entry (FR-004); keeping the manual-entry path simple is a deliberate scope choice. Typing assistance is a v2+ concern, deferred until personal use surfaces a real fragmentation pain. (Resolved 2026-05-22, OQ #2.)
- Avoid permanently (not just v1): a global curated trope vocabulary, a canonical-form mapping table, or any normalization of trope wording across users. — Rationale: the user's own wording IS the product's data; mapping "enemies-to-lovers", "enemies to lovers", and "etl" to a single canonical entry would launder out the per-user reading-taste expression that makes the recommendation flow meaningful. Per-user autocomplete drawn from the same user's prior tags remains a possible v2+ feature; cross-user vocabulary curation is not. (Resolved 2026-05-22, OQ #2.)
- Avoid: any user-facing data export in v1 (no download, no copy-out, no sync to external services). — Rationale: users who wish to leave SmartTBR re-key their TBR data manually elsewhere. Combined with the best-effort data-durability NFR, this means beta testers should treat v1 as a working pile-sorter rather than a system-of-record. Export may be reconsidered in v2+. (Resolved 2026-05-22, OQ #4.)

## Open Questions

(Items the user did not lock during shaping. /10x-prd carries any unresolved entries forward into its own Open Questions section.)

All four OQs raised during the initial 2026-05-21 shaping session were resolved in two follow-up working sessions on 2026-05-22:

- OQ #1 (quality dimensions: browser, mobile, session, uptime) — routed into `## Non-Functional Requirements` and `## Non-Goals`.
- OQ #2 (curated trope vocabulary) — routed into `## Non-Goals` (permanent boundary) and `## Forward: v2 roadmap` (per-user autocomplete as v2+ candidate).
- OQ #3 (beta cohort timing and feedback shape) — routed into `## Success Criteria → Secondary`.
- OQ #4 (data lifecycle — account deletion, export, backup posture) — split into three sub-decisions and resolved as:
  - Account deletion → FR-013 (self-serve, cascading).
  - Data export → Non-Goal in v1.
  - Operator backup posture → data-durability NFR (best-effort, no formal commitment).

No open questions remain at this time. New questions may emerge during build and will be appended here as numbered entries as they arise.

## Forward: v2 roadmap (informational, not part of PRD schema)

Forward-looking design intents captured during the 2026-05-22 OQ-resolution session. These do NOT flow into `prd.md` (PRD has no roadmap section by design); they live here so a future v2 shape session can pick them up.

- **v2: per-user trope autocomplete.** Add autocomplete suggestions on the book-entry form drawn ONLY from the user's own previously-used trope tags. No global vocabulary, no canonical-form mapping across users. **Trigger to act:** the author's lived experience that typo fragmentation hurts recommendations during personal v1 use (the personal-pain trigger; not a time-based or beta-feedback trigger). If fragmentation never bites in practice, this feature stays unbuilt.
- **v2+ candidates also surfaced in the 2026-05-22 sessions but not committed:** mobile-browser usability (deferred from v1 NFR commitment), a formal uptime / availability commitment (deferred from v1 NFR commitment), a formal data-durability / backup commitment (deferred from v1 NFR commitment), and user-facing data export (deferred from v1 scope; the v1 non-goal explicitly leaves the door open to v2+ reconsideration).

## Quality cross-check

Ran on 2026-05-21 against the five greenfield soft-gate elements:

- Access Control: PRESENT — email + password auth, flat user model, strict per-user isolation reinforced by FR-011.
- Business Logic: PRESENT — one-sentence rule captured: "Given a user's TBR and a set of 1–3 trope tags representing the user's current mood, SmartTBR returns up to 3 books from that TBR whose tag set intersects the mood set in at least one position."
- Project artifacts: PRESENT — `shape-notes.md` exists with a valid checkpoint block.
- Timeline-cost acknowledged: PRESENT — 4-week MVP exceeds the 3-week default; sustained-effort cost was surfaced and explicitly accepted on 2026-05-21 (see `## Timeline acknowledgment` section).
- Non-Goals: PRESENT — 11 explicit avoidances captured with one-line rationales each.

No gaps. `quality_check_status: accepted`.

### Addendum: 2026-05-22 OQ-resolution working sessions

The four Open Questions left over from the 2026-05-21 session were addressed across two follow-up working sessions on 2026-05-22 (outside the formal `/10x-shape` phase loop, since the project already has a PRD — per the skill's "Skip when" rule).

**First session (2026-05-22):** OQ #1 (quality dimensions), OQ #2 (curated trope vocabulary), and OQ #3 (beta cohort) were resolved and propagated into `## Non-Functional Requirements`, `## Non-Goals`, `## Success Criteria → Secondary`, and the new `## Forward: v2 roadmap` section. OQ #4 (data lifecycle) was sharpened from one blurry question into three explicit sub-questions and deferred.

**Second session (2026-05-22):** OQ #4's three sub-questions were resolved — self-serve account deletion (new FR-013), data export deferred (non-goal in v1), and best-effort data durability (new NFR). All four original OQs are now closed; `## Open Questions` notes "No open questions remain at this time."

`quality_check_status` remains `accepted`. The PRD frs_drafted count is now 13 (FR-013 added).
