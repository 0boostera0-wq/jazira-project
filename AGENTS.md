# Jazira — guide for developers and coding agents

Arabic-first learning platform: school curriculum resources (elementary →
high school), Qudurat/Tahsili exam practice, a learning community, and the
Jazira Assistant. Next.js 15 App Router (JavaScript, React 19), Tailwind, Supabase
(Postgres + Auth + Storage with RLS), deployed on Vercel (region `bom1`).

Read these before changing anything:

| Doc | What it covers |
|---|---|
| [docs/CONVENTIONS.md](docs/CONVENTIONS.md) | routing, i18n rules, server/client split, loading strategy, Supabase usage, security checklist, quality gates |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | tokens, typography, layout, components, motion, illustration style, accessibility |
| [docs/DATA_API.md](docs/DATA_API.md) | tables, RPCs and client data functions (exams, notifications, search, contact, AI quota) |
| [docs/SECURITY.md](docs/SECURITY.md) | RLS model, column grants, guard triggers, definer RPCs |
| [docs/CURRICULUM.md](docs/CURRICULUM.md) | curriculum structure, verified sources, resource availability |
| [docs/DATABASE_SETUP.md](docs/DATABASE_SETUP.md) | provisioning Supabase, auth settings, Vercel environment variables |

## Map

```
src/app/[locale]/(site)   marketing shell: landing, about, faq, contact, support, reviews, legal
src/app/[locale]/(auth)   auth shell: sign-in/up, forgot/reset password, verify email, profile setup
src/app/[locale]/(app)    app shell: dashboard, curriculum, stages, exams, community, profile,
                          notifications, search, settings, assistant, chat, achievements, subscriptions
src/app/api               route handlers (chat, exams local practice, checkout, webhooks, content)
src/middleware.js         locale routing (Arabic unprefixed, English /en) + auth-cookie gate
src/i18n                  config, server getT, client useT, locale-aware navigation, formatting,
                          messages/{ar,en}/<namespace>.js (identical key trees — tested)
src/components/ui         design-system primitives
src/components/shell      AppShell, MarketingHeader/Footer, AuthShell, command palette
src/components/<feature>  feature components
src/lib                   data access (lib/data/*), catalogs (curriculum, exams), seo, assets manifest
src/content               question bank JSON + curriculum source manifest
supabase/migrations       apply in filename order to a fresh project (0000 → latest)
tests/unit, tests/db      vitest; DB tests run migrations on PGlite with a Supabase shim
public/images             the painted image library (WebP renditions) + brand kit — manifest: src/lib/assets.js
```

## Commands

```bash
npm run dev            # http://127.0.0.1:3000 (bound to loopback only)
npm run build          # production build (runs ESLint)
npm test               # unit tests (i18n parity, pure logic)
npm run test:db        # database schema/RLS/RPC tests (no Docker needed)
npm run assets:check   # image manifest ↔ files ↔ usages (renditions, budgets, orphans)
node scripts/shot.mjs /en/exams out.png --w=390 --h=844   # visual QA with local Chrome
```

## Non-negotiables

- No hardcoded UI strings — message keys in both locales.
- `Link`/`useRouter`/`usePathname` only from `@/i18n/navigation`.
- Never `select("*")` on `profiles`; never expose the service-role key.
- Never name the AI provider in the UI; never fabricate stats, reviews or sources.
- Shell first: every data route has a `loading.js`; data streams in.
