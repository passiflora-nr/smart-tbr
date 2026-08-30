# Known issue: `.dev.vars` leaks `SUPABASE_SERVICE_ROLE_KEY` into integration Astro

> **Audience:** future agents working on integration tests, the access-control suite, or
> `tests/integration/support/local-services.ts`. Read before changing startup guards or asking
> contributors to edit `.dev.vars` manually.

## Summary

The integration harness starts a local Astro dev server to run real-HTTP tests. It intentionally
pins `SUPABASE_SERVICE_ROLE_KEY` to an empty string so account-delete handlers cannot use the
admin key during tests. **`@astrojs/cloudflare` then reloads the repo-root `.dev.vars` and
overwrites that pin** with the developer's real service-role key. The current workaround — refusing
to start integration tests when `.dev.vars` contains a non-empty key — is safe but forces an
unnatural manual step. **Fix the harness, not the developer's secrets file.**

## Background

### What `SUPABASE_SERVICE_ROLE_KEY` is

Server-only Supabase **admin** key. In this app it is used only for `auth.admin.deleteUser` on
`POST /api/account/delete` (`src/lib/supabase-admin.ts`). Normal TBR queries use the anon key
(`SUPABASE_KEY`) and respect row-level ownership.

### Why integration tests care

Phase 3 access-control coverage (`tests/integration/access-control.test.ts`) includes a **canary**
for account deletion: it posts a fully valid delete form (`confirmation=DELETE`) with a hostile
or missing `Origin` header. The test expects **403** from Astro's global origin check **before**
the handler runs.

If the origin check ever regressed and the handler ran **with a live service-role key**, user D
(the integration-test account) could be permanently deleted. Book-delete origin tests do not need
the admin key; account-delete is the high-consequence case.

## The leak (root cause)

### What the harness tries to do

`startAstroDev` in `tests/integration/support/local-services.ts` spawns `npm run dev` with:

```ts
env: {
  ...process.env,
  SUPABASE_URL: supabaseUrl,       // verified local loopback from `supabase status`
  SUPABASE_KEY: supabaseKey,       // local anon/publishable key from CLI
  SUPABASE_SERVICE_ROLE_KEY: "",   // intentionally blank
},
```

### What actually happens

During `astro:config:done`, `@astrojs/cloudflare` reads `.dev.vars` from the project root and
merges it into `process.env`:

```js
// node_modules/@astrojs/cloudflare/dist/index.js (approx. lines 292–297)
const devVarsPath = new URL(".dev.vars", config.root);
if (existsSync(devVarsPath)) {
  const parsed = parseEnv(readFileSync(devVarsPath, "utf-8"));
  Object.assign(process.env, parsed);
}
```

Any `SUPABASE_SERVICE_ROLE_KEY=` line in the developer's `.dev.vars` **wins over** the spawn pin.
The test Astro process therefore behaves like normal local dev — including the ability to delete
accounts — even though the harness believed it had disabled the admin key.

This was already documented in
`context/archive/2026-08-23-testing-harness-and-data-integrity/reviews/impl-review.md` (Fix B:
isolate Astro from contributor `.dev.vars`).

### Why CI is unaffected

GitHub Actions has no `.dev.vars` (gitignored). Only `SUPABASE_URL` / `SUPABASE_KEY` are injected
for build; integration tests see an empty service-role key and the canary stays non-destructive.

## Current mitigation (unsatisfactory)

`assertDevVarsDoNotOverrideLocalCoordinates` in `tests/integration/support/local-coordinates.ts`
was extended (access-controll-and-abuse Phase 1) to **throw before Astro starts** if the parsed
`.dev.vars` map contains a non-empty `SUPABASE_SERVICE_ROLE_KEY`.

| Pros                                                          | Cons                                                                                     |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Fail-closed locally; cannot silently run destructive canaries | Contributors must comment out or remove the key in `.dev.vars` before `npm test` locally |
| Same pattern as the existing `SUPABASE_URL` loopback guard    | Not how real projects expect to run tests                                                |
| Small diff                                                    | Treats symptom; does not stop the adapter overwrite                                      |

**Do not ask the project owner to maintain this manual ritual as the long-term answer.**

## Recommended fix (not implemented)

**Harness-owned `.dev.vars` for the test window** (impl-review Fix B):

1. Before spawning Astro, back up the repo-root `.dev.vars` (if present).
2. Write a temporary `.dev.vars` containing **only** the verified local `SUPABASE_URL` and
   `SUPABASE_KEY` from `supabase status` — **omit** `SUPABASE_SERVICE_ROLE_KEY`.
3. Run integration tests.
4. Restore the original `.dev.vars` in teardown (`finally`, including on failure).

Then remove the service-role refusal from `assertDevVarsDoNotOverrideLocalCoordinates` and any
contributor-facing “comment out your key” guidance.

Alternative (weaker test): post a wrong confirmation value on account-delete origin cases so the
handler redirects to `confirm_mismatch` even if origin check fails — cannot delete user D, but
proves less about “forged delete was stopped before the handler.”

## Related files

| File                                                               | Role                                          |
| ------------------------------------------------------------------ | --------------------------------------------- |
| `tests/integration/support/local-services.ts`                      | Spawns Astro; pins env (currently overridden) |
| `tests/integration/support/local-coordinates.ts`                   | URL guard + service-role startup refusal      |
| `tests/integration/access-control.test.ts`                         | Account-delete origin canary                  |
| `src/lib/supabase-admin.ts`                                        | Consumes `SUPABASE_SERVICE_ROLE_KEY`          |
| `node_modules/@astrojs/cloudflare/dist/index.js`                   | `.dev.vars` → `Object.assign(process.env, …)` |
| `context/changes/access-controll-and-abuse/reviews/plan-review.md` | F1 — why the canary + guard were chosen       |

## Change history

- **2026-08-30** — Documented during access-controll-and-abuse Phase 1 after owner rejected
  manual `.dev.vars` editing as the permanent workflow.
