# Archive — superseded prototype documents

Nothing in this folder describes the current system. These files were written
for an early prototype (Clerk / localStorage state / a legacy Supabase schema)
and are kept for history only.

| File | Superseded by |
|---|---|
| `SQL_TO_RUN.sql`, `supabase-schema.sql` | `supabase/migrations/` (apply 0000 → latest). **Never run these** — they create tables the app does not use and divergent copies of real ones. `0000_core.sql` removes what they may have left on old projects. |
| `AUTH_COMPLETE.md`, `AUTH_QUICK_REF.md`, `AUTH_SYSTEM.md` | [SECURITY.md](../SECURITY.md), [CONVENTIONS.md](../CONVENTIONS.md) §5 |
| `SUPABASE_SETUP.md`, `SUPABASE_QUICK_REF.md`, `SUPABASE_SQL_EXECUTE.md`, `SETUP_COMPLETE.md` | [AGENTS.md](../../AGENTS.md), `.env.example`, [DATA_API.md](../DATA_API.md) |
| `FINAL_REPORT.md` | — (historical build notes) |
