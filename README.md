# SmartTBR (smart-tbr)

SmartTBR is a web app for heavy readers who keep a large “To Be Read” backlog and prefer to choose the **next book by trope and mood** rather than digging through scattered lists (Instagram saves, wishlists, notes). Product goals and MVP scope live in [`context/foundation/prd.md`](./context/foundation/prd.md).

**Current codebase:** authentication and route protection match the MVP needs; the `/dashboard` area is still a lightweight signed-in placeholder while TBR CRUD and trope-driven recommendations are implemented.

Repository conventions for contributors and tooling are summarized in [`AGENTS.md`](./AGENTS.md).

## Tech stack

The app builds on **[10x Astro Starter](https://github.com/przeprogramowani/10x-astro-starter)**: Astro server rendering, React islands, Tailwind v4, Supabase Auth, Cloudflare Workers. Exact versions live in [`package.json`](./package.json).

Key pieces:

- [Astro](https://astro.build/) (server-rendered UI)
- [React](https://react.dev/) (interactive islands)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/) v4
- [Supabase](https://supabase.com/) (Auth)
- Deploy target: [Cloudflare Workers](https://workers.cloudflare.com/) via [`@astrojs/cloudflare`](./astro.config.mjs) and [`wrangler.jsonc`](./wrangler.jsonc)

## Prerequisites

- **Node.js** — use [`.nvmrc`](./.nvmrc) (currently 22.x)
- **npm**
- Optional: **Docker** (~7 GB RAM) if you run Supabase locally

## Getting started

1. Clone and install:

```bash
git clone https://github.com/passiflora-nr/smart-tbr.git
cd smart-tbr
npm install
```

2. Configure secrets — see [Supabase configuration](#supabase-configuration) below. Server-only vars are **`SUPABASE_URL`** and **`SUPABASE_KEY`** (see Astro env schema in [`astro.config.mjs`](./astro.config.mjs)).

3. For Cloudflare-style local dev (`npm run dev`), copy the Supabase placeholders into **`.dev.vars`** (Workers read this file; keep it gitignored):

```bash
cp .env.example .dev.vars
```

4. Start the dev server:

```bash
npm run dev
```

## Scripts

| Command            | Purpose                                                                               |
| ------------------ | ------------------------------------------------------------------------------------- |
| `npm run dev`      | Astro dev server on the Cloudflare adapter                                            |
| `npm run build`    | Production build (needs Supabase env set)                                             |
| `npm run preview`  | Preview production build locally                                                      |
| `npm run lint`     | ESLint with type-checked rules (`astro sync` first if env/schema changed; CI runs it) |
| `npm run lint:fix` | ESLint with `--fix`                                                                   |
| `npm run format`   | Prettier                                                                              |

## Project layout

High level:

```
src/
├── components/      # Astro + React (e.g. `ui/` shadcn-style primitives)
├── layouts/
├── pages/           # Routes; `pages/api/` for endpoints
├── lib/             # Shared TS (e.g. Supabase client helpers)
├── middleware.ts    # Auth gating (`PROTECTED_ROUTES`)
└── styles/          # Tailwind entry (`global.css`)
public/               # Static assets
supabase/             # Local Supabase CLI config (`config.toml`)
```

## Supabase configuration

Auth uses Supabase. **`SUPABASE_URL`** and **`SUPABASE_KEY`** are **server-only** (via `astro:env`); never import them in client code.

### Local stack (recommended for offline iteration)

Requires Docker.

1. Create **`.env`** for the Supabase CLI (distinct from Workers):

```bash
cp .env.example .env
```

2. This repo already contains [`supabase/config.toml`](./supabase/config.toml). Start the stack (first run pulls images):

```bash
npx supabase start
```

3. Paste the anon URL and anon key printed by the CLI into **both** `.env` and `.dev.vars` as `SUPABASE_URL` / `SUPABASE_KEY`.

4. Studio: `http://localhost:54323`. Stop when done: `npx supabase stop`.

For early development you only need **`auth.users`**; app-specific tables appear as the TBR backend is implemented (see PRD).

### Hosted Supabase

Use the project URL and **anon** public key from the Supabase dashboard (Settings → API) in `.env`, `.dev.vars`, and CI secrets — same variable names.

### Email confirmation during dev

Supabase often requires verified email before sign-in. To skip confirmation in development, toggle **Authentication → Email → Confirm email** off for your local or staging project.

## Routes

| Route                 | Purpose                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| `/`                   | Marketing / entry (adjust copy in [`src/components/Welcome.astro`](./src/components/Welcome.astro)) |
| `/auth/signin`        | Sign in                                                                                             |
| `/auth/signup`        | Sign up                                                                                             |
| `/auth/confirm-email` | Post-signup inbox reminder                                                                          |
| `/dashboard`          | Authenticated shell (starter placeholder UI)                                                        |

Protected paths are centralized in **`PROTECTED_ROUTES`** in [`src/middleware.ts`](./src/middleware.ts); add paths there only.

## Deployment

1. Build: `npm run build`
2. Deploy: `npx wrangler deploy` (same worker name as [`wrangler.jsonc`](./wrangler.jsonc) until you rename the project everywhere)

Configure **`SUPABASE_URL`** and **`SUPABASE_KEY`** as [Wrangler secrets](https://developers.cloudflare.com/workers/configuration/secrets/) for production.

## CI

[`.github/workflows/ci.yml`](./github/workflows/ci.yml) runs **`npm ci` → `npx astro sync` → `npm run lint` → `npm run build`** on pushes and PRs to **`main`**. Define **`SUPABASE_URL`** and **`SUPABASE_KEY`** as repository secrets for the build step.

## Starter attribution

Derived from **[przeprogramowani/10x-astro-starter](https://github.com/przeprogramowani/10x-astro-starter)** — thank you to the upstream maintainers for the baseline auth, ESLint/Tailwind setup, and Cloudflare wiring.
