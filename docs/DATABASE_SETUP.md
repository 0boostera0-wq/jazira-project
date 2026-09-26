# Provisioning the Jazira database (Supabase)

The production Supabase project the site used before (ref `osbutymigkorsovnaatl`)
no longer exists. Until a new project is connected, everything that needs an
account (sign-in, saved exam results, community, messages, notifications,
settings) shows an honest "not available" state; public pages, the curriculum,
the FAQ/legal pages and **guest exam practice** keep working.

## 1. Create the project

- Organization: the one that owns the other production projects.
  **Its overdue invoices must be settled first** — Supabase refuses to create
  projects in an organization with overdue invoices.
- Name `jazira-production`, region **ap-south-1 (Mumbai)** — closest available
  region to Saudi Arabia; the Vercel functions are pinned to `bom1` (Mumbai) in
  `vercel.json` to match.

## 2. Apply the schema

Apply every file in `supabase/migrations/` **in filename order**
(`0000_core.sql` → `0013_…`), e.g. with the Supabase CLI:

```bash
supabase link --project-ref <new-ref>
supabase db push
```

or paste them one by one into the SQL editor. `0011_seed_questions.sql` loads
the 300 original practice questions; regenerate it with
`node scripts/build-question-seed.mjs` whenever `src/content/questions/*.json`
changes. Do **not** run anything in `docs/archive/` (legacy, conflicting schema).

Then set the storage origin used to validate avatar/media URLs:

```sql
alter database postgres set app.storage_origin = 'https://<new-ref>.supabase.co';
```

The same SQL is covered by 333 automated tests (`npm run test:db`, PGlite with a
Supabase shim), but it has not yet run against a real Supabase instance — run
the Security Advisor in the dashboard after applying it.

## 3. Auth settings (Dashboard → Authentication)

- Site URL: `https://jazira-sa.vercel.app` (or the custom domain).
- Redirect URLs: `https://<domain>/auth/callback` (and the preview domain if used).
- Email templates: the sign-up screen offers a 6-digit code, so the
  "Confirm signup" template must include `{{ .Token }}` (keep the link too).
- Password policy: minimum 8 characters with letters and digits (matches the form).
- Google provider (optional): client ID/secret from Google Cloud Console.

## 4. Environment variables (Vercel → jazira-sa → Settings → Environment Variables)

| Variable | Where to get it | Scope |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | Production + Preview |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → API Keys (publishable, `sb_publishable_…`) | Production + Preview |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API Keys (secret) — **server-only** | Production (+ Preview if needed) |
| `NEXT_PUBLIC_SITE_URL` | your production origin, e.g. `https://jazira-sa.vercel.app` | Production |

Remove the stale `NEXT_PUBLIC_SUPABASE_ANON_KEY` / URL values of the deleted
project. Redeploy after changing variables.

`SUPABASE_SERVICE_ROLE_KEY` enables account deletion and the payment webhook;
without it those two features answer "not configured" and nothing else breaks.
Payments additionally need the four `LEMONSQUEEZY_*` variables (see
`.env.example`); the assistant needs `GEMINI_API_KEY` (already set on Vercel).
