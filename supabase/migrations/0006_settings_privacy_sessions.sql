-- ============================================================================
-- Batch 4 — cooldowns, privacy/display prefs, phone, and session management.
-- Idempotent & non-destructive. Public display name stays profiles.full_name.
-- ============================================================================
begin;

-- ----------------------------------------------------------------------------
-- Profile columns: cooldown timestamps + public display preferences
-- (show_elite_badge / anonymous_community are PUBLIC-read because they change
--  how the user appears to OTHERS in the community; the profiles row is already
--  world-readable for community joins. They do NOT grant Elite.)
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists avatar_changed_at   timestamptz;
alter table public.profiles add column if not exists phone_changed_at    timestamptz;
alter table public.profiles add column if not exists show_elite_badge    boolean not null default true;
alter table public.profiles add column if not exists anonymous_community boolean not null default false;

-- ----------------------------------------------------------------------------
-- Display name — tiered cooldown (Free = 14 days, Elite = 24 hours).
-- Replaces the previous fixed-7-day version. Two-word validation preserved.
-- ----------------------------------------------------------------------------
create or replace function public.update_full_name(new_name text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  uid          uuid := auth.uid();
  trimmed      text := btrim(new_name);
  last_changed timestamptz;
  elite        boolean;
  cooldown     interval;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  if trimmed !~ '^[A-Za-z؀-ۿ]+[ ]+[A-Za-z؀-ۿ]+$' then
    raise exception 'invalid_name_format';
  end if;

  select full_name_changed_at, coalesce(is_elite, false)
    into last_changed, elite
    from public.profiles where id = uid;

  cooldown := case when elite then interval '24 hours' else interval '14 days' end;

  if last_changed is not null and last_changed > (now() - cooldown) then
    raise exception 'name_cooldown';
  end if;

  update public.profiles
     set full_name = trimmed, full_name_changed_at = now()
   where id = uid;
  return now();
end;
$$;
grant execute on function public.update_full_name(text) to authenticated;

-- ----------------------------------------------------------------------------
-- Avatar — set a new avatar URL with a 10-day cooldown (Elite bypasses).
-- Client uploads to a unique Storage path, then calls this so the cooldown is
-- enforced atomically server-side (raises 'avatar_cooldown' when locked).
-- ----------------------------------------------------------------------------
create or replace function public.set_avatar(new_url text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  uid          uuid := auth.uid();
  last_changed timestamptz;
  elite        boolean;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  select avatar_changed_at, coalesce(is_elite, false)
    into last_changed, elite
    from public.profiles where id = uid;

  if not elite and last_changed is not null and last_changed > (now() - interval '10 days') then
    raise exception 'avatar_cooldown';
  end if;

  update public.profiles
     set avatar_url = new_url, avatar_changed_at = now()
   where id = uid;
  return now();
end;
$$;
grant execute on function public.set_avatar(text) to authenticated;

-- ----------------------------------------------------------------------------
-- Phone — set/clear the Saudi mobile (9 local digits) with a 24-hour cooldown.
-- ----------------------------------------------------------------------------
create or replace function public.update_phone(new_phone text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  uid          uuid := auth.uid();
  digits       text := regexp_replace(coalesce(new_phone, ''), '\D', '', 'g');
  last_changed timestamptz;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  if digits <> '' and digits !~ '^[0-9]{9}$' then
    raise exception 'invalid_phone';
  end if;

  select phone_changed_at into last_changed from public.profiles where id = uid;
  if last_changed is not null and last_changed > (now() - interval '24 hours') then
    raise exception 'phone_cooldown';
  end if;

  update public.profiles
     set phone = case when digits = '' then null else '+966' || digits end,
         phone_changed_at = now()
   where id = uid;
  return now();
end;
$$;
grant execute on function public.update_phone(text) to authenticated;

-- ----------------------------------------------------------------------------
-- Active devices / sessions (user-scoped, RLS own-only). App-level revocation:
-- a device polls its own row and signs out locally when revoked_at is set.
-- ----------------------------------------------------------------------------
create table if not exists public.user_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  session_id     text not null,
  device_label   text,
  browser        text,
  os             text,
  device_type    text,
  user_agent     text,
  last_active_at timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  revoked_at     timestamptz,
  unique (user_id, session_id)
);
create index if not exists user_sessions_user_idx on public.user_sessions (user_id, last_active_at desc);

alter table public.user_sessions enable row level security;
drop policy if exists "sessions_select_own" on public.user_sessions;
drop policy if exists "sessions_insert_own" on public.user_sessions;
drop policy if exists "sessions_update_own" on public.user_sessions;
drop policy if exists "sessions_delete_own" on public.user_sessions;
create policy "sessions_select_own" on public.user_sessions for select using (auth.uid() = user_id);
create policy "sessions_insert_own" on public.user_sessions for insert with check (auth.uid() = user_id);
create policy "sessions_update_own" on public.user_sessions for update using (auth.uid() = user_id);
create policy "sessions_delete_own" on public.user_sessions for delete using (auth.uid() = user_id);

commit;
