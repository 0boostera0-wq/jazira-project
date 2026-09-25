-- ============================================================================
-- Supabase platform shim for the PGlite test harness (tests/db/harness.js).
--
-- Recreates, on an empty PGlite database, the pieces of a brand-new Supabase
-- project that our migrations rely on but never create themselves:
--   * API roles        anon / authenticated / service_role (+ authenticator …)
--   * auth schema      auth.users, auth.uid(), auth.role(), auth.jwt(), auth.email()
--   * storage schema   storage.buckets, storage.objects (RLS on), foldername()…
--   * extensions       schema "extensions" with pgcrypto + uuid-ossp (Supabase
--                      pre-installs both there; pg_trgm is only *available*,
--                      a migration must `create extension pg_trgm` itself)
--   * realtime         the (empty) supabase_realtime publication
--   * privileges       Supabase's default grants — RLS is what restricts.
--
-- This file is TEST-ONLY. It must never be applied to a real project.
-- Definitions of auth.uid()/role()/jwt() and storage.foldername() are copied
-- from Supabase's own schema so policy behaviour matches production.
-- ============================================================================

-- Supabase runs in UTC.
set timezone to 'UTC';

-- ----------------------------------------------------------------------------
-- Roles (all NOLOGIN here; in Supabase `authenticator` logs in and SET ROLEs).
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator nologin noinherit;
  end if;
  -- Present in every Supabase project; migrations sometimes GRANT to them.
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_storage_admin') then
    create role supabase_storage_admin nologin noinherit;
  end if;
end $$;

grant anon, authenticated, service_role to authenticator;

-- ----------------------------------------------------------------------------
-- Extensions schema (Supabase keeps extensions out of `public`).
-- ----------------------------------------------------------------------------
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- Supabase's default search_path.
select set_config('search_path', '"$user", public, extensions', false);

-- ----------------------------------------------------------------------------
-- auth schema
-- ----------------------------------------------------------------------------
create schema if not exists auth;

create table if not exists auth.users (
  instance_id        uuid,
  id                 uuid primary key default gen_random_uuid(),
  aud                varchar(255) default 'authenticated',
  role               varchar(255) default 'authenticated',
  email              text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  phone              text unique,
  raw_app_meta_data  jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb,
  is_anonymous       boolean not null default false,
  is_sso_user        boolean not null default false,
  banned_until       timestamptz,
  last_sign_in_at    timestamptz,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  deleted_at         timestamptz
);

-- Exactly as Supabase defines them (supabase/auth migrations).
create or replace function auth.uid()
returns uuid
language sql stable
as $$
  select
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
$$;

create or replace function auth.role()
returns text
language sql stable
as $$
  select
    coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
    )::text
$$;

create or replace function auth.email()
returns text
language sql stable
as $$
  select
    coalesce(
      nullif(current_setting('request.jwt.claim.email', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
    )::text
$$;

create or replace function auth.jwt()
returns jsonb
language sql stable
as $$
  select
    coalesce(
      nullif(current_setting('request.jwt.claim', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;

-- API roles may resolve auth.* functions but get NO table access in `auth`
-- (auth.users is not readable by anon/authenticated in Supabase).
grant usage on schema auth to anon, authenticated, service_role;
revoke all on all tables in schema auth from anon, authenticated, service_role;
grant execute on function auth.uid(), auth.role(), auth.email(), auth.jwt()
  to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- storage schema
-- ----------------------------------------------------------------------------
create schema if not exists storage;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  owner              uuid,
  public             boolean default false,
  avif_autodetection boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);
create unique index if not exists bname on storage.buckets (name);

create table if not exists storage.objects (
  id               uuid primary key default gen_random_uuid(),
  bucket_id        text references storage.buckets (id),
  name             text,
  owner            uuid,
  owner_id         text,
  metadata         jsonb,
  path_tokens      text[] generated always as (string_to_array(name, '/')) stored,
  version          text,
  user_metadata    jsonb,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  last_accessed_at timestamptz default now()
);
create unique index if not exists bucketid_objname on storage.objects (bucket_id, name);

alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;

-- Same semantics as Supabase: every path segment except the file name.
create or replace function storage.foldername(name text)
returns text[]
language plpgsql immutable
as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end
$$;

create or replace function storage.filename(name text)
returns text
language plpgsql immutable
as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[array_length(_parts, 1)];
end
$$;

create or replace function storage.extension(name text)
returns text
language plpgsql immutable
as $$
declare
  _parts    text[];
  _filename text;
begin
  select string_to_array(name, '/') into _parts;
  select _parts[array_length(_parts, 1)] into _filename;
  return reverse(split_part(reverse(_filename), '.', 1));
end
$$;

-- Supabase grants ALL on the storage tables to the API roles; RLS restricts.
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.buckets, storage.objects to anon, authenticated, service_role;
grant execute on function storage.foldername(text), storage.filename(text), storage.extension(text)
  to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Realtime publication (created empty, like a fresh Supabase project).
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- public schema — Supabase default privileges. Every table/sequence/function
-- the migration owner creates is fully granted to the API roles; RLS policies
-- (and explicit REVOKEs in migrations) are what restrict access.
-- ----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines  in schema public to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on routines  to anon, authenticated, service_role;
