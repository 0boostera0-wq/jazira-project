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
(`0000_core.sql` → `0014_content_engine.sql`), e.g. with the Supabase CLI:

```bash
supabase link --project-ref <new-ref>
supabase db push
```

or paste them one by one into the SQL editor. `0011_seed_questions.sql` loads
the 300 original practice questions; regenerate it with
`node scripts/build-question-seed.mjs` whenever `src/content/questions/*.json`
changes. Do **not** run anything in `docs/archive/` (legacy, conflicting schema).

`0014_content_engine.sql` adds the curriculum outline, typed questions and
template exam sessions (docs/CONTENT_ENGINE.md §6). Its content is loaded with
the import pipeline, never with hand-written SQL:

```bash
npm run content:validate                                           # staging + manifest must pass
node scripts/content/import-staging.mjs --target supabase --dry-run # what would be sent
node scripts/content/import-staging.mjs --target supabase           # needs the two variables below
```

It uses `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the
environment, resumes with `--resume` after an interruption, and writes its
report to `data/staging/reports/import/`. Items derived from sources whose
`publish_policy` is not `derived_questions_allowed` are held back.

**Never re-apply `0011_seed_questions.sql` after an import**: it would reset
`is_active` of the seeded questions (and undo retirements of them).

Then set the storage origin used to validate avatar/media URLs:

```sql
alter database postgres set app.storage_origin = 'https://<new-ref>.supabase.co';
```

The same SQL is covered by the automated DB tests (`npm run test:db`, PGlite with a
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
| `LOCAL_EXAM_SECRET` | a random string of ≥ 32 characters (`openssl rand -base64 48`), **server-only**; signs guest exam tokens | Production + Preview |
| `LOCAL_EXAM_SECRET_PREVIOUS` | the previous `LOCAL_EXAM_SECRET` during a rotation (optional) | Production + Preview |
| `EXAM_SECRET_REQUIRED` | `1` once `LOCAL_EXAM_SECRET` is set: guest exam routes then answer 503 without it instead of deriving a secret | Production + Preview |

Remove the stale `NEXT_PUBLIC_SUPABASE_ANON_KEY` / URL values of the deleted
project. Redeploy after changing variables.

`SUPABASE_SERVICE_ROLE_KEY` enables account deletion, the payment webhook and
the SQL-side guest exam selection (`ce_guest_start`); without it those features
answer "not configured" (guests fall back to the runtime bank) and nothing else
breaks. Until `LOCAL_EXAM_SECRET` is set, guest exam tokens are signed with a
secret derived from the existing server-only secrets (a warning is logged);
set it, then turn on `EXAM_SECRET_REQUIRED=1`.
Payments additionally need the four `LEMONSQUEEZY_*` variables (see
`.env.example`); the assistant needs `GEMINI_API_KEY` (already set on Vercel).
