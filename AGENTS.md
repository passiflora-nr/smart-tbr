# Repository Guidelines

Astro v6 server-rendered app with React 19 islands, Tailwind v4, and Supabase Auth, deployed to Cloudflare Workers via `@astrojs/cloudflare`. Node 22 (`@.nvmrc`), npm, TypeScript strict. **Production:** `https://smart-tbr.nicole-rozanska93.workers.dev` — ops details in `@context/foundation/infrastructure.md`.

## Hard Rules

- **Never work on `main` directly.** Do not develop, commit, or push to `main`. Create a feature branch first (`git checkout -b feat/...` or similar), do all work there, and merge via PR only.
- **Deploy target is Cloudflare Workers (Static Assets), not Pages.** Use `wrangler deploy` via `@wrangler.jsonc`; do not deploy to Cloudflare Pages — Astro 6 SSR breaks there.
- **Supabase env is server-only.** `SUPABASE_URL`, `SUPABASE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are declared `context: "server"`, `access: "secret"` (`optional: true`) in `@astro.config.mjs`. Import only from `astro:env/server`; never read them in client code or a React island. `SUPABASE_KEY` is the anon / publishable key. `SUPABASE_SERVICE_ROLE_KEY` is used only for `auth.admin.deleteUser` via `@src/lib/supabase-admin.ts` — never write it into `SUPABASE_KEY` (that would bypass Row-Level Security on every TBR query).
- **Local secrets live in `.dev.vars`, not `.env`.** Cloudflare workerd (used by `npm run dev`) reads `.dev.vars`; `.env` is for the Supabase CLI. Copy `@.env.example` to both. Both are gitignored.
- **Protected routes are gated by `PROTECTED_ROUTES` in `@src/middleware.ts`.** Add new auth-required paths there; nowhere else. Routes under `src/pages/api/` are the exception: they self-authenticate with `supabase.auth.getUser()` and return 401 (or redirect, for form-post routes) rather than being listed there, so a JSON caller never gets an HTML sign-in page.
- **Never turn off `security.checkOrigin`** (pinned `true` in `@astro.config.mjs`). `POST /api/books/[id]/delete` is a cookie-authenticated hard delete driven by a plain HTML form; the origin check plus `@supabase/ssr`'s `SameSite=Lax` cookie default are the only things stopping a cross-site page from forging it. Don't pass `cookieOptions: { sameSite: "none" }` to `createServerClient` either. If a webhook route needs to accept cross-origin posts, exempt that route — don't disable the check globally.
- **`createClient` in `@src/lib/supabase.ts` can return `null`** when env is unset — always null-check before using the client.
- **Dev runs in workerd, not Node.** Code in `src/pages/api/**` and `src/middleware.ts` should avoid Node-only APIs unless covered by `nodejs_compat` (`@wrangler.jsonc`). Before adding npm packages, confirm they work on Workers/edge; prefer Supabase REST over raw Postgres drivers.
- **API routes must reach the Worker, not Static Assets.** Keep `assets.run_worker_first: ["/api/*"]` in `@wrangler.jsonc` when adding routes under `src/pages/api/` — without it, auth and other API handlers return 1003/403.
- **Platform constraints:** deploy/ops gotchas and mitigated risks — `@context/foundation/infrastructure.md` Risk Register.
- **Shell commands:** run allowlisted shell commands one at a time. Do not chain with `&&`, `;`, or `|`.

## Project Structure

- `src/pages/` — Astro routes; `src/pages/api/` — endpoints; `src/pages/auth/` — sign-in/up.
- `src/components/` — `.astro` and `.tsx` islands. `src/components/ui/` is shadcn (style `new-york`, see `@components.json`); `src/components/auth/` is React auth forms.
- `src/layouts/`, `src/lib/`, `src/middleware.ts`, `src/styles/global.css` (Tailwind v4 entry).
- `supabase/config.toml` — local stack config; `wrangler.jsonc` — Cloudflare deploy; `public/` — static assets.
- Setup, auth routes, and deployment steps: `@README.md`.
- Production ops, rollback, and remaining manual tasks: `@context/foundation/infrastructure.md` (rollout log: `@context/archive/deploy-plan.md`).

## Build, Test, and Development Commands

- `npm run dev` — Astro dev server on the Cloudflare adapter.
- `npm run build` — production build; needs `SUPABASE_URL` / `SUPABASE_KEY` in env.
- `npm run lint` — ESLint type-aware; run `npx astro sync` first after env/config changes (CI does).
- `npm run lint:fix`, `npm run format` — auto-fix ESLint, run Prettier.
- `npx wrangler deploy` — deploy after `npm run build`.

## Coding Style & Naming

- Prettier: 2 spaces, 120 col, semis, double quotes, trailing-comma `all` (`@.prettierrc.json`).
- ESLint: `strictTypeChecked` + `stylisticTypeChecked`, `react-compiler/react-compiler: error`, `no-console: warn` (`@eslint.config.js`).
- Import via the `@/*` alias (`@tsconfig.json`); don't use long relative paths across `src/`.
- Naming: Astro pages `lower-case.astro`, components `PascalCase.{astro,tsx}`, shadcn primitives `lower-case.tsx` under `src/components/ui/`.

## Testing

Vitest 4 runs two named projects:

- `npm run test:unit` — pure logic in `tests/unit/` (no Astro or Supabase runtime).
- `npm run test:integration` — raw HTTP against the Astro dev server and local Supabase; requires Docker for the local stack.
- `npm test` — both projects in non-watch mode; required in `@.github/workflows/ci.yml` between `lint` and `build`.

Integration tests fail closed on non-loopback Supabase coordinates, mutate only user-D rows with the `[integration-test]` title prefix, and clean those rows in `finally`. Do not parse `.env` or `.dev.vars` as test coordinates.

See `@context/foundation/test-plan.md` §6 for cookbook patterns.

## Audience & manual testing

The project owner verifies changes manually and is a **tester, not a developer**. When writing manual verification steps (in plans, PRs, or chat), follow `@context/foundation/manual-testing.md`:

- **Write numbered steps** (setup → actions → expected result → pass criteria). Do not give manual tests as a single summary line.
- **Use plain language** — page names, button labels, and what the user should see; avoid file paths, component names, and implementation jargon unless the tester needs them to know what to expect.

Progress checklist titles in `plan.md` may stay short; the matching `#### Manual Verification:` block in the same phase must contain the full steps.

## Commit & Pull Request Guidelines

History is single-commit; no convention is established yet — prefer Conventional Commits (`feat:`, `fix:`, `chore:`). **All changes land on `main` through PRs only** — branch from `main`, push the branch, open a PR; never commit or push directly to `main`. CI runs `npm ci → npx astro sync → npm run lint → npm test → npm run build` and must pass (`@.github/workflows/ci.yml`). Husky `pre-commit` runs lint-staged (see `@package.json`): ESLint on staged `*.{ts,tsx,astro}`, Prettier on staged `*.{json,css,md}`, and `vitest related` for the **unit** project on staged `*.{ts,tsx}`. `npm ci` / `npm install` runs `prepare` to set `core.hooksPath` — don't bypass with `--no-verify`.
