# Repository Guidelines

Astro v6 server-rendered app with React 19 islands, Tailwind v4, and Supabase Auth, deployed to Cloudflare Workers via `@astrojs/cloudflare`. Node 22 (`@.nvmrc`), npm, TypeScript strict.

## Hard Rules

- **Deploy target is Cloudflare Workers (Static Assets), not Pages.** Use `wrangler deploy` via `@wrangler.jsonc`; do not deploy to Cloudflare Pages — Astro 6 SSR breaks there.
- **Supabase env is server-only.** `SUPABASE_URL` / `SUPABASE_KEY` are declared `context: "server"`, `access: "secret"` in `@astro.config.mjs`. Import only from `astro:env/server`; never read them in client code.
- **Local secrets live in `.dev.vars`, not `.env`.** Cloudflare workerd (used by `npm run dev`) reads `.dev.vars`; `.env` is for the Supabase CLI. Copy `@.env.example` to both. Both are gitignored.
- **Protected routes are gated by `PROTECTED_ROUTES` in `@src/middleware.ts`.** Add new auth-required paths there; nowhere else.
- **`createClient` in `@src/lib/supabase.ts` can return `null`** when env is unset — always null-check before using the client.
- **Dev runs in workerd, not Node.** Code in `src/pages/api/**` and `src/middleware.ts` should avoid Node-only APIs unless covered by `nodejs_compat` (`@wrangler.jsonc`). Before adding npm packages, confirm they work on Workers/edge; prefer Supabase REST over raw Postgres drivers.
- **API routes must reach the Worker, not Static Assets.** Keep `assets.run_worker_first: ["/api/*"]` in `@wrangler.jsonc` when adding routes under `src/pages/api/` — without it, auth and other API handlers return 1003/403.
- **Platform constraints:** deploy/ops gotchas and mitigated risks — `@context/foundation/infrastructure.md` Risk Register.

## Project Structure

- `src/pages/` — Astro routes; `src/pages/api/` — endpoints; `src/pages/auth/` — sign-in/up.
- `src/components/` — `.astro` and `.tsx` islands. `src/components/ui/` is shadcn (style `new-york`, see `@components.json`); `src/components/auth/` is React auth forms.
- `src/layouts/`, `src/lib/`, `src/middleware.ts`, `src/styles/global.css` (Tailwind v4 entry).
- `supabase/config.toml` — local stack config; `wrangler.jsonc` — Cloudflare deploy; `public/` — static assets.
- Setup, auth routes, and deployment steps: `@README.md`.

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

No test framework is wired up. If you add one, wire it into `@.github/workflows/ci.yml` between `lint` and `build`.

## Commit & Pull Request Guidelines

History is single-commit; no convention is established yet — prefer Conventional Commits (`feat:`, `fix:`, `chore:`). PRs target `main`; CI runs `npm ci → npx astro sync → npm run lint → npm run build` and must pass (`@.github/workflows/ci.yml`). Husky `pre-commit` runs lint-staged (see `@package.json`) — don't bypass with `--no-verify`.
