# Jazira — منصة جزيرة

Arabic-first learning platform for Saudi students: school curriculum resources
(elementary → high school), Qudurat / Tahsili practice with an explanation for
every question, a learning community, and the Jazira Assistant. Arabic is the
default locale (unprefixed URLs); English lives under `/en`.

**Stack:** Next.js 15 (App Router, JavaScript, React 19) · Tailwind CSS · Supabase
(Postgres + Auth + Storage, RLS everywhere) · Lemon Squeezy (payments, optional)
· Vercel.

## Getting started

Requires Node.js 20+.

```bash
npm install
cp .env.example .env.local   # fill in the values you have; everything is optional locally
npm run dev                  # http://127.0.0.1:3000 (bound to loopback)
```

Without Supabase variables the app runs in a signed-out state and shows honest
"not available" states — nothing is faked. See `.env.example` for every
variable and which features it enables.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | development server |
| `npm run build` | production build (runs ESLint) |
| `npm test` | unit tests — i18n key parity, pure logic |
| `npm run test:db` | database tests — migrations, RLS, RPCs on PGlite (no Docker) |
| `npm run assets:check` | illustration manifest ↔ files ↔ usages |
| `node scripts/shot.mjs /en/exams out.png --w=390 --axe` | screenshot + accessibility check |

## Database

Apply `supabase/migrations/` in filename order (0000 → latest) to a fresh
Supabase project — step-by-step in [docs/DATABASE_SETUP.md](docs/DATABASE_SETUP.md)
(project, auth settings, storage origin, Vercel variables). That folder is the only schema source; the security model is
documented in [docs/SECURITY.md](docs/SECURITY.md).

## Read before changing anything

- [AGENTS.md](AGENTS.md) — map of the codebase and non-negotiables
- [docs/CONVENTIONS.md](docs/CONVENTIONS.md) — routing, i18n, server/client split, quality gates
- [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) — tokens, typography, components, accessibility
- [docs/DATA_API.md](docs/DATA_API.md) — tables, RPCs and client data functions
- [docs/SECURITY.md](docs/SECURITY.md) — RLS, grants, definer functions, known limits
- [docs/CURRICULUM.md](docs/CURRICULUM.md) — curriculum structure and sources

Old prototype reports live in [docs/archive/](docs/archive/README.md) and do
not describe the current system.
