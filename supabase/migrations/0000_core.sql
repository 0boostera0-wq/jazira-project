-- ============================================================================
-- 0000 — Core schema that 0001–0008 assume but never create.
--
--   * public.profiles           one row per auth user (public identity + prefs)
--   * public.set_updated_at()   generic BEFORE UPDATE trigger function
--   * public.handle_new_user()  creates the profile on sign-up (never blocks it)
--   * public.unread_notification_count()  RPC used by the app-shell bell
--
-- Idempotent and convergent: safe on a brand-new project and safe to re-run.
-- Legacy tables from supabase-schema.sql (posts, comments, likes, achievements,
-- payments …) are intentionally NOT created — the app no longer uses them.
--
-- Access model here is the baseline only (public read, insert/update own row).
-- Column-level hardening of profiles (is_elite, xp, role, phone, *_changed_at)
-- is owned by a later migration.
-- ============================================================================
begin;

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  username             text not null unique,          -- internal unique handle (never shown as a name)
  full_name            text,                          -- PUBLIC display name (non-unique)
  avatar_url           text,
  bio                  text,
  role                 text not null default 'student',
  is_elite             boolean not null default false, -- set only by the payment webhook
  xp                   integer not null default 0,
  phone                text,                          -- private, +966XXXXXXXXX
  full_name_changed_at timestamptz,
  avatar_changed_at    timestamptz,
  phone_changed_at     timestamptz,
  show_elite_badge     boolean not null default true,
  anonymous_community  boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Converge an older/partial profiles table to the same shape (no-op when fresh).
alter table public.profiles add column if not exists full_name            text;
alter table public.profiles add column if not exists avatar_url           text;
alter table public.profiles add column if not exists bio                  text;
alter table public.profiles add column if not exists role                 text not null default 'student';
alter table public.profiles add column if not exists is_elite             boolean not null default false;
alter table public.profiles add column if not exists xp                   integer not null default 0;
alter table public.profiles add column if not exists phone                text;
alter table public.profiles add column if not exists full_name_changed_at timestamptz;
alter table public.profiles add column if not exists avatar_changed_at    timestamptz;
alter table public.profiles add column if not exists phone_changed_at     timestamptz;
alter table public.profiles add column if not exists show_elite_badge     boolean not null default true;
alter table public.profiles add column if not exists anonymous_community  boolean not null default false;
alter table public.profiles add column if not exists created_at           timestamptz not null default now();
alter table public.profiles add column if not exists updated_at           timestamptz not null default now();

-- Data-shape constraints (mirror the rules the RPCs / app already enforce).
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_role_check') then
    alter table public.profiles add constraint profiles_role_check
      check (role in ('student', 'teacher', 'admin'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_xp_check') then
    alter table public.profiles add constraint profiles_xp_check check (xp >= 0);
  end if;
  -- Handles come from genHandle() (src/lib/profile.js) or handle_new_user():
  -- lower-case latin / digits / underscore / Arabic block, 3–40 chars.
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_username_format') then
    alter table public.profiles add constraint profiles_username_format
      check (username ~ '^[a-z0-9_؀-ۿ]{3,40}$');
  end if;
  -- Same two-word rule as update_full_name(), plus a sane length cap.
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_full_name_format') then
    alter table public.profiles add constraint profiles_full_name_format
      check (full_name is null or (char_length(full_name) <= 60 and full_name ~ '^[A-Za-z؀-ۿ]+[ ]+[A-Za-z؀-ۿ]+$'));
  end if;
  -- Same shape update_phone() produces.
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_phone_format') then
    alter table public.profiles add constraint profiles_phone_format
      check (phone is null or phone ~ '^\+966[0-9]{9}$');
  end if;
  -- Same limit as update_bio().
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_bio_length') then
    alter table public.profiles add constraint profiles_bio_length
      check (bio is null or char_length(bio) <= 300);
  end if;
end $$;

create index if not exists profiles_xp_idx on public.profiles (xp desc);

-- ----------------------------------------------------------------------------
-- updated_at maintenance
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists profiles_updated_at_trigger on public.profiles;   -- legacy name
drop trigger if exists profiles_set_updated_at     on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS baseline: world-readable identity, insert/update own row only.
-- (No DELETE policy: rows go away with the auth user via ON DELETE CASCADE.)
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;

-- legacy policy names from supabase-schema.sql / SQL_TO_RUN.sql
drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
drop policy if exists "Users can update their own profile"      on public.profiles;
drop policy if exists "Users can insert their own profile"      on public.profiles;

drop policy if exists "profiles_select_public" on public.profiles;
drop policy if exists "profiles_insert_own"    on public.profiles;
drop policy if exists "profiles_update_own"    on public.profiles;
create policy "profiles_select_public" on public.profiles
  for select using (true);
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- Sign-up → profile. SECURITY DEFINER, empty search_path, and it must NEVER
-- block sign-up: every failure path degrades to a minimal profile (or none,
-- in which case the app's profile-setup upsert creates it).
--
--   full_name : raw_user_meta_data.full_name, whitespace-collapsed, kept only if
--               it satisfies the public-name rule (else NULL → profile setup).
--   username  : raw_user_meta_data.username (lower-cased) if valid and free,
--               else a generated unique handle "<base>_<random>".
--   phone     : normalised to +966XXXXXXXXX (accepts 5XXXXXXXX, 05XXXXXXXX,
--               966…, 00966…, with any separators) or NULL.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta     jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_name   text;
  v_handle text;
  v_base   text;
  v_digits text;
  v_phone  text;
  i        int;
begin
  begin
    -- public display name
    if jsonb_typeof(meta -> 'full_name') = 'string' then
      v_name := regexp_replace(btrim(meta ->> 'full_name'), '\s+', ' ', 'g');
      if char_length(v_name) > 60 or v_name !~ '^[A-Za-z؀-ۿ]+ [A-Za-z؀-ۿ]+$' then
        v_name := null;
      end if;
    end if;

    -- phone
    if jsonb_typeof(meta -> 'phone') in ('string', 'number') then
      v_digits := regexp_replace(meta ->> 'phone', '[^0-9]', '', 'g');
      v_digits := case
        when v_digits ~ '^00966[0-9]{9}$' then substr(v_digits, 6)
        when v_digits ~ '^966[0-9]{9}$'   then substr(v_digits, 4)
        when v_digits ~ '^0[0-9]{9}$'     then substr(v_digits, 2)
        when v_digits ~ '^[0-9]{9}$'      then v_digits
        else null
      end;
      if v_digits is not null then
        v_phone := '+966' || v_digits;
      end if;
    end if;

    -- username: requested handle if valid …
    if jsonb_typeof(meta -> 'username') = 'string' then
      v_handle := lower(btrim(meta ->> 'username'));
      if v_handle !~ '^[a-z0-9_؀-ۿ]{3,40}$' then
        v_handle := null;
      end if;
    end if;
    -- … and a sanitised base for generated ones (mirrors genHandle()).
    v_base := left(
      regexp_replace(
        regexp_replace(lower(btrim(coalesce(
          case when jsonb_typeof(meta -> 'username')  = 'string' then meta ->> 'username'  end,
          case when jsonb_typeof(meta -> 'full_name') = 'string' then meta ->> 'full_name' end,
          ''))), '\s+', '_', 'g'),
        '[^a-z0-9_؀-ۿ]', '', 'g'),
      20);
    if v_base = '' then
      v_base := 'user';
    end if;

    for i in 1..8 loop
      if v_handle is not null then
        insert into public.profiles (id, username, full_name, phone)
        values (new.id, v_handle, v_name, v_phone)
        on conflict do nothing;
        if found then
          return new;
        end if;
        -- Nothing inserted: either this id already has a profile (done) …
        if exists (select 1 from public.profiles where id = new.id) then
          return new;
        end if;
        -- … or the handle is taken (possibly by a concurrent sign-up): retry.
      end if;
      v_handle := v_base || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 5 + i);
    end loop;

    -- An id-derived handle is unique by construction.
    insert into public.profiles (id, username, full_name, phone)
    values (new.id, 'u_' || replace(new.id::text, '-', ''), v_name, v_phone)
    on conflict do nothing;
    return new;
  exception when others then
    -- Last resort: bare profile, and never propagate the error to GoTrue.
    begin
      insert into public.profiles (id, username)
      values (new.id, 'u_' || replace(new.id::text, '-', ''))
      on conflict do nothing;
    exception when others then
      raise warning 'handle_new_user(%): % (%)', new.id, sqlerrm, sqlstate;
    end;
    return new;
  end;
end
$$;

-- Trigger functions are not API endpoints.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_updated_at()  from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- No `leaderboard` view: its only consumer (/api/leaderboard) was removed and
-- the Leaderboard component reads PUBLIC profile columns directly. Drop the
-- legacy view (supabase-schema.sql) if present — it was a definer-rights view
-- over profiles.
-- ----------------------------------------------------------------------------
drop view if exists public.leaderboard;

-- ----------------------------------------------------------------------------
-- unread_notification_count() — called by the app-shell bell
-- (src/components/shell/NotificationBell.jsx; it falls back to a count query).
-- plpgsql so it can be created before public.notifications exists (0008): the
-- body is only resolved when called. SECURITY INVOKER → notifications RLS
-- (own rows only) still applies on top of the explicit auth.uid() filter.
-- ----------------------------------------------------------------------------
create or replace function public.unread_notification_count()
returns integer
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return 0;
  end if;
  return (
    select count(*)::integer
      from public.notifications n
     where n.user_id = auth.uid()
       and n.read = false
  );
end
$$;

revoke all on function public.unread_notification_count() from public, anon;
grant execute on function public.unread_notification_count() to authenticated, service_role;

commit;
