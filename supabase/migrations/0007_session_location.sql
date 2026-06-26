-- ============================================================================
-- Batch 5 — approximate session location for the "Active devices" list.
-- Additive, idempotent, non-destructive. The column is populated best-effort by
-- /api/session/touch from edge geo headers (city + country only — never a precise
-- coordinate, never a browser permission prompt). It stays NULL when geo is
-- unavailable (e.g. local dev), and the UI simply omits location in that case.
-- Safe to run before or after deploying the app code.
-- ============================================================================
begin;

alter table public.user_sessions
  add column if not exists location text;

commit;
