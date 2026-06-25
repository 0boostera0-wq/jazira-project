-- Per-account persisted preferences (restored on every login / device).

create table if not exists public.user_preferences (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  sound          boolean not null default true,
  language       text    not null default 'ar' check (language in ('ar','en')),
  ai_suggestions boolean not null default true,
  updated_at     timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

drop policy if exists "prefs_select_own" on public.user_preferences;
create policy "prefs_select_own" on public.user_preferences
  for select using (auth.uid() = user_id);

drop policy if exists "prefs_insert_own" on public.user_preferences;
create policy "prefs_insert_own" on public.user_preferences
  for insert with check (auth.uid() = user_id);

drop policy if exists "prefs_update_own" on public.user_preferences;
create policy "prefs_update_own" on public.user_preferences
  for update using (auth.uid() = user_id);
