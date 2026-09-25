-- ============================================================================
-- 0009 — Security hardening of 0000–0008.
--
-- Closes every gap found by the 0000–0008 audit (see docs/SECURITY.md for the
-- resulting model). In short:
--
--   profiles        column-level SELECT (phone / *_changed_at are private) and
--                   INSERT grants; BEFORE UPDATE guard: clients may change only
--                   show_elite_badge / anonymous_community directly — every
--                   other column goes through a SECURITY DEFINER RPC or the
--                   service role. + get_my_private_profile().
--   names           is_valid_public_name(): letters only (no Arabic-Indic
--                   digits), used by the CHECK, update_full_name() and
--                   handle_new_user().
--   avatars         set_avatar() only accepts this project's public
--                   avatars/<uid>/… URL; set_avatar(null) clears it.
--   storage         bucket size / MIME limits; objects listable by their owner
--                   only (public URLs keep working — the buckets are public).
--   community       column-level INSERT/UPDATE grants (no counters, no
--                   created_at, no user_id changes), content CHECKs, media URL
--                   validation, blocks enforced, hashtags / mentions indexed by
--                   a definer trigger (no client writes to hashtags/mentions).
--   direct messages no client writes to conversations / participants /
--                   message_requests: start_conversation(),
--                   respond_message_request(), mark_conversation_read();
--                   messages: content-only insert, deleted_for_all-only update
--                   within 30 minutes (DB-enforced), blocks + recipient
--                   settings enforced by can_send_message().
--   notifications   no client inserts; only `read` is client-updatable.
--   reviews         one per user; referrals validated; length limits.
--   functions       SECURITY DEFINER RPCs are not executable by anon; trigger
--                   functions are not executable by API roles at all.
--
-- Idempotent: safe to re-run. New CHECK constraints / unique indexes are only
-- added when the existing data satisfies them (otherwise a WARNING names the
-- constraint and the rest of the migration still applies) — a NOT VALID CHECK
-- would make every later UPDATE of a legacy row fail, including counter
-- updates and the payment webhook.
-- ============================================================================
begin;

-- ============================================================================
-- 0) Hygiene: no API role needs TRUNCATE (bypasses RLS), REFERENCES or TRIGGER.
-- ============================================================================
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- ============================================================================
-- 1) Shared helpers
-- ============================================================================

-- Public display name: exactly two words of letters (Latin or Arabic letters,
-- Arabic harakat allowed after a letter), at most 60 characters. Excludes the
-- Arabic-Indic digits (U+0660–0669, U+06F0–06F9), Arabic punctuation and
-- tatweel that the old U+0600–U+06FF range let through.
create or replace function public.is_valid_public_name(p_name text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_name is not null
     and char_length(p_name) <= 60
     and p_name ~ '^[A-Za-zء-غف-يٱ-ۓە][A-Za-zء-غف-يً-ٰٟٱ-ۓە]* +[A-Za-zء-غف-يٱ-ۓە][A-Za-zء-غف-يً-ٰٟٱ-ۓە]*$'
$$;

-- Is p_url a public Storage URL of THIS project for an object in
-- <p_bucket>/<p_owner>/<file>? (optionally with the app's ?t=<digits> cache
-- buster). The origin is pinned to the database setting `app.storage_origin`
-- when it is set (recommended in production:
--   alter database postgres set app.storage_origin = 'https://<ref>.supabase.co';)
-- otherwise to https://<ref>.supabase.co or a local Supabase (localhost /
-- 127.0.0.1) — the same hosts next.config.js allows for images.
create or replace function public.is_own_storage_url(p_url text, p_bucket text, p_owner uuid)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_marker constant text := '/storage/v1/object/public/';
  v_origin text := nullif(rtrim(btrim(coalesce(current_setting('app.storage_origin', true), '')), '/'), '');
  v_prefix text;
  v_pos    int;
  v_host   text;
  v_rest   text;
  v_file   text;
begin
  if p_url is null or p_bucket is null or p_owner is null or char_length(p_url) > 1024 then
    return false;
  end if;
  v_pos := strpos(p_url, v_marker);
  if v_pos = 0 then
    return false;
  end if;
  v_host := left(p_url, v_pos - 1);
  v_rest := substr(p_url, v_pos + char_length(v_marker));
  if v_origin is not null then
    if v_host <> v_origin then
      return false;
    end if;
  elsif v_host !~ '^(https://[a-z0-9-]+\.supabase\.co|http://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?)$' then
    return false;
  end if;
  v_prefix := p_bucket || '/' || p_owner::text || '/';
  if left(v_rest, char_length(v_prefix)) <> v_prefix then
    return false;
  end if;
  v_file := regexp_replace(substr(v_rest, char_length(v_prefix) + 1), '\?t=[0-9]{1,20}$', '');
  return v_file ~ '^([A-Za-z0-9._~-]|%[0-9A-Fa-f]{2})+$'   -- one path segment, URL-safe
     and v_file !~* '%(2f|5c|2e)'                          -- no encoded / \ .
     and v_file !~ '^\.+$';                                -- not . or ..
end
$$;

-- Is there a block between the CALLER and p_other (either direction)?
-- Caller-scoped on purpose: it is callable through the API (policies need
-- it), so it must not reveal blocks between two other users.
create or replace function public.has_block_with(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and p_other is not null
     and exists (
       select 1 from public.blocks b
        where (b.blocker_id = auth.uid() and b.blocked_id = p_other)
           or (b.blocker_id = p_other and b.blocked_id = auth.uid())
     )
$$;

-- Generic CHECK installer used below: adds the constraint only if it is absent
-- and the existing rows satisfy it (a WARNING is raised otherwise).
create or replace function pg_temp.jz_add_check(p_table text, p_name text, p_expr text)
returns void
language plpgsql
as $$
begin
  if exists (select 1 from pg_constraint
              where conrelid = format('public.%I', p_table)::regclass and conname = p_name) then
    return;
  end if;
  begin
    execute format('alter table public.%I add constraint %I check (%s)', p_table, p_name, p_expr);
  exception when check_violation then
    raise warning '0009: constraint %.% NOT added — existing rows violate (%). Fix the data and re-run 0009.',
      p_table, p_name, p_expr;
  end;
end
$$;

-- ============================================================================
-- 2) profiles
-- ============================================================================

-- 2a) READ: column-level. Public identity + the display prefs other users need
-- (PUBLIC_PROFILE_COLUMNS ∪ OWN_PROFILE_COLUMNS in src/lib/profile.js).
-- phone, *_changed_at and updated_at are NOT granted → get_my_private_profile().
revoke select on public.profiles from anon, authenticated;
grant select (id, username, full_name, avatar_url, bio, role, is_elite, show_elite_badge,
              anonymous_community, xp, created_at)
  on public.profiles to anon, authenticated;

-- 2b) INSERT: the profile row is created by handle_new_user(); the app's
-- fallback upserts only ever send id / username / full_name.
revoke insert on public.profiles from anon, authenticated;
grant insert (id, username, full_name, show_elite_badge, anonymous_community)
  on public.profiles to authenticated;

-- 2c) UPDATE guard. Table-level UPDATE stays granted so PostgREST upserts that
-- re-send unchanged values (ON CONFLICT … SET id = EXCLUDED.id) keep working;
-- the trigger rejects any real change outside the allow-list when the caller
-- is an API role. SECURITY DEFINER RPCs (current_user = owner) and the service
-- role (payment webhook) are not affected. SECURITY INVOKER on purpose:
-- current_user must be the caller.
create or replace function public.profiles_guard_protected_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- Columns an API role may change directly. Everything else — including any
  -- column a later migration adds — is protected by default.
  v_client_writable constant text[] := array['show_elite_badge', 'anonymous_community', 'updated_at'];
  v_new jsonb;
  v_old jsonb;
  v_col text;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  v_new := to_jsonb(new);
  v_old := to_jsonb(old);
  select k into v_col
    from jsonb_object_keys(v_new) as k
   where k <> all (v_client_writable)
     and (v_new -> k) is distinct from (v_old -> k)
   order by k
   limit 1;
  if v_col is not null then
    raise exception 'profiles.% is not client-writable', v_col
      using errcode = '42501',
            hint = 'Use the RPC (update_full_name, set_avatar, update_phone, update_bio) or the service role.';
  end if;
  return new;
end
$$;

drop trigger if exists profiles_guard_protected_columns on public.profiles;
create trigger profiles_guard_protected_columns
  before update on public.profiles
  for each row execute function public.profiles_guard_protected_columns();

-- 2d) The caller's private columns (settings page).
create or replace function public.get_my_private_profile()
returns table (phone text, full_name_changed_at timestamptz, avatar_changed_at timestamptz, phone_changed_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  return query
    select p.phone, p.full_name_changed_at, p.avatar_changed_at, p.phone_changed_at
      from public.profiles p
     where p.id = auth.uid();
end
$$;

-- 2e) Public-name rule everywhere: CHECK (replaced only if all rows comply).
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.profiles'::regclass
       and conname = 'profiles_full_name_format'
       and pg_get_constraintdef(oid) like '%is_valid_public_name%'
  ) then
    begin
      alter table public.profiles drop constraint if exists profiles_full_name_format;
      alter table public.profiles add constraint profiles_full_name_format
        check (full_name is null or public.is_valid_public_name(full_name));
    exception when check_violation then
      -- the sub-transaction rollback restores the previous (0000) constraint
      raise warning '0009: profiles_full_name_format kept at the 0000 definition — some full_name values contain digits/symbols. Fix them and re-run 0009.';
    end;
  end if;
end $$;

-- update_full_name: same contract as 0006 (tiered cooldown), stricter letters,
-- whitespace collapsed like the client's validateFullName().
create or replace function public.update_full_name(new_name text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid          uuid := auth.uid();
  cleaned      text := btrim(regexp_replace(coalesce(new_name, ''), '\s+', ' ', 'g'));
  last_changed timestamptz;
  elite        boolean;
  cooldown     interval;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_valid_public_name(cleaned) then
    raise exception 'invalid_name_format';
  end if;

  select p.full_name_changed_at, coalesce(p.is_elite, false)
    into last_changed, elite
    from public.profiles p
   where p.id = uid;

  cooldown := case when elite then interval '24 hours' else interval '14 days' end;
  if last_changed is not null and last_changed > (now() - cooldown) then
    raise exception 'name_cooldown';
  end if;

  update public.profiles
     set full_name = cleaned, full_name_changed_at = now()
   where id = uid;
  return now();
end
$$;

-- handle_new_user: identical to 0000 except the display-name test, which now
-- uses is_valid_public_name() (so the stricter CHECK can never make sign-up
-- fall back to a bare profile).
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
      if not public.is_valid_public_name(v_name) then
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
        if exists (select 1 from public.profiles where id = new.id) then
          return new;
        end if;
      end if;
      v_handle := v_base || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 5 + i);
    end loop;

    insert into public.profiles (id, username, full_name, phone)
    values (new.id, 'u_' || replace(new.id::text, '-', ''), v_name, v_phone)
    on conflict do nothing;
    return new;
  exception when others then
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

-- set_avatar: only this project's avatars/<caller>/<file> URL (no external
-- tracking pixels); NULL clears the photo without touching the cooldown clock.
create or replace function public.set_avatar(new_url text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid          uuid := auth.uid();
  last_changed timestamptz;
  elite        boolean;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select p.avatar_changed_at, coalesce(p.is_elite, false)
    into last_changed, elite
    from public.profiles p
   where p.id = uid;

  if new_url is null or btrim(new_url) = '' then
    update public.profiles set avatar_url = null where id = uid;
    return last_changed;
  end if;

  if not public.is_own_storage_url(new_url, 'avatars', uid) then
    raise exception 'invalid_avatar_url';
  end if;

  if not elite and last_changed is not null and last_changed > (now() - interval '10 days') then
    raise exception 'avatar_cooldown';
  end if;

  update public.profiles
     set avatar_url = new_url, avatar_changed_at = now()
   where id = uid;
  return now();
end
$$;

-- ============================================================================
-- 3) Storage: bucket limits + owner-only listing
-- ============================================================================
-- Explicit raster types instead of image/*: an SVG (image/svg+xml) in a public
-- bucket is a scriptable document on the storage origin.
update storage.buckets
   set file_size_limit    = 2 * 1024 * 1024,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
 where id = 'avatars';

update storage.buckets
   set file_size_limit    = 50 * 1024 * 1024,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
                                  'video/mp4', 'video/webm', 'video/quicktime']
 where id = 'post-media';

-- Public buckets serve /object/public/… without RLS, so a SELECT policy is only
-- needed for list()/remove()/upsert by the owner — never for everyone (that let
-- anon enumerate every object name, i.e. every user id).
drop policy if exists "avatars_public_read"    on storage.objects;
drop policy if exists "post_media_public_read" on storage.objects;
drop policy if exists "avatars_owner_read"     on storage.objects;
drop policy if exists "post_media_owner_read"  on storage.objects;
create policy "avatars_owner_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "post_media_owner_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================
-- 4) Community: posts, comments, reactions, follows, reviews
-- ============================================================================

-- 4a) community_posts — no counters / created_at / user_id from clients.
revoke insert, update on public.community_posts from anon, authenticated;
grant insert (user_id, content, media_url, media_type, media_path) on public.community_posts to authenticated;
-- media_* stay updatable: the feed's "remove media" / "replace media" actions.
grant update (content, media_url, media_type, media_path) on public.community_posts to authenticated;

drop policy if exists "posts_insert" on public.community_posts;
drop policy if exists "posts_update" on public.community_posts;
create policy "posts_insert" on public.community_posts
  for insert to authenticated with check (auth.uid() = user_id);
create policy "posts_update" on public.community_posts
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

select pg_temp.jz_add_check('community_posts', 'community_posts_content_length',
  'content is null or char_length(content) <= 2000');
select pg_temp.jz_add_check('community_posts', 'community_posts_not_empty',
  $c$media_url is not null or (content is not null and content ~ '\S')$c$);
select pg_temp.jz_add_check('community_posts', 'community_posts_media_consistent',
  '(media_url is null) = (media_type is null)');

-- media_url must be this project's post-media/<author>/<file> and match
-- media_path (checked whenever the media changes, for every role).
create or replace function public.community_posts_validate_media()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.media_url  is not distinct from old.media_url
     and new.media_path is not distinct from old.media_path then
    return new;
  end if;
  if new.media_url is null then
    if new.media_path is not null then
      raise exception 'invalid_media_url' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.media_path is null
     or split_part(new.media_path, '/', 1) <> new.user_id::text
     or not public.is_own_storage_url(new.media_url, 'post-media', new.user_id)
     or right(new.media_url, char_length(new.media_path) + 1) <> '/' || new.media_path then
    raise exception 'invalid_media_url' using errcode = '23514';
  end if;
  return new;
end
$$;

drop trigger if exists community_posts_validate_media on public.community_posts;
create trigger community_posts_validate_media
  before insert or update on public.community_posts
  for each row execute function public.community_posts_validate_media();

-- 4b) post_comments — content only; blocked users cannot comment.
revoke insert, update on public.post_comments from anon, authenticated;
grant insert (post_id, user_id, content) on public.post_comments to authenticated;
grant update (content) on public.post_comments to authenticated;

drop policy if exists "comments_insert" on public.post_comments;
drop policy if exists "comments_update" on public.post_comments;
create policy "comments_insert" on public.post_comments
  for insert to authenticated
  with check (auth.uid() = user_id
              and not public.has_block_with((select p.user_id from public.community_posts p where p.id = post_id)));
create policy "comments_update" on public.post_comments
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

select pg_temp.jz_add_check('post_comments', 'post_comments_content_length',
  $c$char_length(content) <= 1000 and content ~ '\S'$c$);

-- 4c) likes / dislikes / reposts — blocked users cannot react.
do $$
declare t text;
begin
  foreach t in array array['post_likes', 'post_dislikes', 'post_reposts'] loop
    execute format('drop policy if exists "%1$s_insert" on public.%1$s', t);
    execute format(
      'create policy "%1$s_insert" on public.%1$s for insert to authenticated
         with check (auth.uid() = user_id
                     and not public.has_block_with((select p.user_id from public.community_posts p where p.id = post_id)))',
      t);
  end loop;
end $$;

-- 4d) follows — only notify_pref is updatable; blocked users cannot follow.
revoke update on public.follows from anon, authenticated;
grant update (notify_pref) on public.follows to authenticated;

drop policy if exists "follows_insert" on public.follows;
drop policy if exists "follows_update" on public.follows;
create policy "follows_insert" on public.follows
  for insert to authenticated
  with check (auth.uid() = follower_id and follower_id <> followee_id and not public.has_block_with(followee_id));
create policy "follows_update" on public.follows
  for update to authenticated using (auth.uid() = follower_id) with check (auth.uid() = follower_id);

-- 4e) reviews — one per user (the /reviews UI edits "your review"), rating +
-- content only, no back-/future-dating.
revoke insert, update on public.reviews from anon, authenticated;
grant insert (user_id, rating, content) on public.reviews to authenticated;
grant update (rating, content) on public.reviews to authenticated;

drop policy if exists "reviews_update" on public.reviews;
create policy "reviews_update" on public.reviews
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- (rating between 1 and 5 is already enforced by 0005's column CHECK)
select pg_temp.jz_add_check('reviews', 'reviews_content_length', 'content is null or char_length(content) <= 1000');

do $$
begin
  create unique index if not exists reviews_one_per_user on public.reviews (user_id);
exception when unique_violation then
  raise warning '0009: reviews_one_per_user NOT created — some users have several reviews (legacy multi-review UI). Keep one per user and re-run 0009.';
end $$;

-- ============================================================================
-- 5) Hashtags + mentions — maintained by a definer trigger, never by clients
-- ============================================================================
revoke insert, update, delete on public.hashtags from anon, authenticated;
drop policy if exists "hashtags_insert" on public.hashtags;
drop policy if exists "hashtags_update" on public.hashtags;
select pg_temp.jz_add_check('hashtags', 'hashtags_tag_format', $c$tag ~ '^[0-9a-z_؀-ۿ]{2,50}$'$c$);

-- post_hashtags: only the post's author may (un)tag it; counts stay trigger-owned.
revoke insert, update, delete on public.post_hashtags from anon, authenticated;
grant insert (post_id, hashtag_id), delete on public.post_hashtags to authenticated;
drop policy if exists "post_hashtags_insert" on public.post_hashtags;
drop policy if exists "post_hashtags_delete" on public.post_hashtags;
create policy "post_hashtags_insert" on public.post_hashtags
  for insert to authenticated
  with check (exists (select 1 from public.community_posts p where p.id = post_id and p.user_id = auth.uid()));
create policy "post_hashtags_delete" on public.post_hashtags
  for delete to authenticated
  using (exists (select 1 from public.community_posts p where p.id = post_id and p.user_id = auth.uid()));

-- mentions: private to the two people involved; written only by the trigger.
revoke insert, update, delete on public.mentions from anon, authenticated;
drop policy if exists "mentions_insert" on public.mentions;
drop policy if exists "mentions_read"   on public.mentions;
create policy "mentions_read" on public.mentions
  for select to authenticated using (auth.uid() = actor_id or auth.uid() = mentioned_user_id);

-- Index #tags (posts) and @handles (posts + comments) with the grammar of
-- parseEntities() in src/lib/social.js. At most 10 of each per text. Mentions
-- skip self, blocked pairs and duplicates; the notification respects
-- user_social_settings.notify_mentions.
create or replace function public.index_post_entities()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_text    text := coalesce(new.content, '');
  v_post    uuid;
  v_comment uuid;
  v_tags    text[];
  v_handles text[];
  v_target  uuid;
begin
  if tg_table_name = 'community_posts' then
    v_post := new.id;
    v_tags := array(
      select distinct lower(m[1])
        from regexp_matches(v_text, '(?:^|\s)#([0-9A-Za-z_؀-ۿ]{2,50})', 'g') as m
       limit 10);
    delete from public.post_hashtags ph
     where ph.post_id = v_post
       and not exists (select 1 from public.hashtags h where h.id = ph.hashtag_id and h.tag = any (v_tags));
    if cardinality(v_tags) > 0 then
      insert into public.hashtags (tag)
        select t from unnest(v_tags) as t
        on conflict (tag) do nothing;
      insert into public.post_hashtags (post_id, hashtag_id)
        select v_post, h.id from public.hashtags h where h.tag = any (v_tags)
        on conflict do nothing;
    end if;
  else
    v_post    := new.post_id;
    v_comment := new.id;
  end if;

  v_handles := array(
    select distinct lower(m[1])
      from regexp_matches(v_text, '(?:^|\s)@([0-9A-Za-z_]{2,30})', 'g') as m
     limit 10);
  if cardinality(v_handles) = 0 then
    return null;
  end if;

  for v_target in
    select p.id
      from public.profiles p
     where p.username = any (v_handles)
       and p.id <> new.user_id
       and not exists (
         select 1 from public.blocks b
          where (b.blocker_id = p.id and b.blocked_id = new.user_id)
             or (b.blocker_id = new.user_id and b.blocked_id = p.id))
       and not exists (
         select 1 from public.mentions x
          where x.mentioned_user_id = p.id
            and x.post_id is not distinct from v_post
            and x.comment_id is not distinct from v_comment)
  loop
    insert into public.mentions (actor_id, mentioned_user_id, post_id, comment_id)
    values (new.user_id, v_target, v_post, v_comment);
    if coalesce((select s.notify_mentions from public.user_social_settings s where s.user_id = v_target), true) then
      insert into public.notifications (user_id, actor_id, type, post_id, comment_id)
      values (v_target, new.user_id, 'mention', v_post, v_comment);
    end if;
  end loop;
  return null;
end
$$;

drop trigger if exists trg_index_post_entities on public.community_posts;
create trigger trg_index_post_entities
  after insert or update of content on public.community_posts
  for each row execute function public.index_post_entities();

drop trigger if exists trg_index_comment_mentions on public.post_comments;
create trigger trg_index_comment_mentions
  after insert on public.post_comments
  for each row execute function public.index_post_entities();

-- ============================================================================
-- 6) Notifications — created only by definer triggers / RPCs
-- ============================================================================
revoke insert, update on public.notifications from anon, authenticated;
grant update (read) on public.notifications to authenticated;

drop policy if exists "notif_insert" on public.notifications;
drop policy if exists "notif_update" on public.notifications;
create policy "notif_update" on public.notifications
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
-- 7) Social settings — private rows; public-facing prefs through an RPC
-- ============================================================================
drop policy if exists "uss_read"   on public.user_social_settings;
drop policy if exists "uss_update" on public.user_social_settings;
create policy "uss_read" on public.user_social_settings
  for select to authenticated using (auth.uid() = user_id);
create policy "uss_update" on public.user_social_settings
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- What a profile page may know about another user's preferences.
create or replace function public.get_public_social_settings(p_user uuid)
returns table (show_likes_on_profile boolean, show_reposts_on_profile boolean, allow_messages boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(s.show_likes_on_profile, true),
         coalesce(s.show_reposts_on_profile, true),
         coalesce(s.allow_messages, true)
    from (select p_user as uid) q
    left join public.user_social_settings s on s.user_id = q.uid
   where p_user is not null
$$;

-- ============================================================================
-- 8) Direct messages
-- ============================================================================

-- 8a) conversations / participants / requests: read-only for clients.
revoke insert, update, delete on public.conversations             from anon, authenticated;
revoke insert, update, delete on public.conversation_participants from anon, authenticated;
revoke insert, update, delete on public.message_requests          from anon, authenticated;
grant update (last_read_at, muted, hidden) on public.conversation_participants to authenticated;

drop policy if exists "conv_read"   on public.conversations;
drop policy if exists "conv_insert" on public.conversations;
drop policy if exists "conv_update" on public.conversations;
create policy "conv_read" on public.conversations
  for select to authenticated using (public.is_conversation_participant(id));

drop policy if exists "cp_read"   on public.conversation_participants;
drop policy if exists "cp_insert" on public.conversation_participants;
drop policy if exists "cp_update" on public.conversation_participants;
create policy "cp_read" on public.conversation_participants
  for select to authenticated using (public.is_conversation_participant(conversation_id));
create policy "cp_update" on public.conversation_participants
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "mr_read"   on public.message_requests;
drop policy if exists "mr_insert" on public.message_requests;
drop policy if exists "mr_update" on public.message_requests;
create policy "mr_read" on public.message_requests
  for select to authenticated using (auth.uid() = requester_id or auth.uid() = recipient_id);

-- 8b) Can the CALLER post into p_conversation? Participant, no block with any
-- other participant, nobody else has turned messages off, and while the
-- conversation is still a request only the requester may write (pending).
create or replace function public.can_send_message(p_conversation uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me           uuid := auth.uid();
  v_is_request boolean;
begin
  if me is null or p_conversation is null then
    return false;
  end if;
  if not exists (select 1 from public.conversation_participants
                  where conversation_id = p_conversation and user_id = me) then
    return false;
  end if;
  select c.is_request into v_is_request from public.conversations c where c.id = p_conversation;
  if not found then
    return false;
  end if;
  if exists (
    select 1
      from public.conversation_participants cp
     where cp.conversation_id = p_conversation
       and cp.user_id <> me
       and (exists (select 1 from public.blocks b
                     where (b.blocker_id = me and b.blocked_id = cp.user_id)
                        or (b.blocker_id = cp.user_id and b.blocked_id = me))
            or exists (select 1 from public.user_social_settings s
                        where s.user_id = cp.user_id and s.allow_messages = false))
  ) then
    return false;
  end if;
  if v_is_request then
    return exists (select 1 from public.message_requests mr
                    where mr.conversation_id = p_conversation
                      and mr.requester_id = me
                      and mr.status = 'pending');
  end if;
  return true;
end
$$;

-- 8c) messages: insert content only (no forged created_at / read_at /
-- delivered_at / media), update deleted_for_all only.
revoke insert, update on public.messages from anon, authenticated;
grant insert (conversation_id, sender_id, content) on public.messages to authenticated;
grant update (deleted_for_all) on public.messages to authenticated;

drop policy if exists "msg_read"   on public.messages;
drop policy if exists "msg_insert" on public.messages;
drop policy if exists "msg_update" on public.messages;
create policy "msg_read" on public.messages
  for select to authenticated using (public.is_conversation_participant(conversation_id));
create policy "msg_insert" on public.messages
  for insert to authenticated
  with check (auth.uid() = sender_id and public.can_send_message(conversation_id));
create policy "msg_update" on public.messages
  for update to authenticated using (auth.uid() = sender_id) with check (auth.uid() = sender_id);

select pg_temp.jz_add_check('messages', 'messages_content_length',
  'content is null or char_length(content) <= 4000');
select pg_temp.jz_add_check('messages', 'messages_not_empty',
  $c$deleted_for_all or media_url is not null or (content is not null and content ~ '\S')$c$);

-- Delete-for-everyone: one way, within 30 minutes of sending, enforced here;
-- the content is wiped so participants can no longer read it through the API.
create or replace function public.messages_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_for_all is distinct from old.deleted_for_all then
    if current_user in ('anon', 'authenticated') then
      if old.deleted_for_all then
        raise exception 'message_undelete_forbidden';
      end if;
      if old.created_at < now() - interval '30 minutes' then
        raise exception 'message_delete_window_expired';
      end if;
    end if;
    if new.deleted_for_all then
      new.content    := null;
      new.media_url  := null;
      new.media_type := null;
      new.media_meta := null;
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists messages_guard on public.messages;
create trigger messages_guard
  before update on public.messages
  for each row execute function public.messages_guard();

-- conversations.last_message_at is maintained here (clients can no longer
-- update conversations).
create or replace function public.touch_conversation_last_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
     set last_message_at = new.created_at
   where id = new.conversation_id
     and (last_message_at is null or last_message_at < new.created_at);
  return null;
end
$$;

drop trigger if exists trg_touch_conversation on public.messages;
create trigger trg_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation_last_message();

-- "Delete for me": only for messages the caller can see.
drop policy if exists "md_read"   on public.message_deletes;
drop policy if exists "md_insert" on public.message_deletes;
create policy "md_read" on public.message_deletes
  for select to authenticated using (auth.uid() = user_id);
create policy "md_insert" on public.message_deletes
  for insert to authenticated
  with check (auth.uid() = user_id and exists (select 1 from public.messages m where m.id = message_id));

-- 8d) start_conversation(p_other) → conversation id.
--   * not yourself, not a blocked pair (either direction)
--   * reuses the existing 1:1 conversation (the recipient of a request who
--     starts a conversation with the requester accepts that request)
--   * new: recipient must allow messages; if the recipient follows the caller
--     the conversation is direct, otherwise it is a message request (needs
--     allow_message_requests) → conversation + both participants + request +
--     notification, atomically.
create or replace function public.start_conversation(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me           uuid := auth.uid();
  v_conv       uuid;
  v_is_request boolean;
  v_req        public.message_requests%rowtype;
  v_allow_msg  boolean;
  v_allow_req  boolean;
  v_hide_req   boolean;
  v_direct     boolean;
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;
  if p_other is null or p_other = me
     or not exists (select 1 from public.profiles where id = p_other) then
    raise exception 'invalid_recipient';
  end if;
  if exists (select 1 from public.blocks b
              where (b.blocker_id = me and b.blocked_id = p_other)
                 or (b.blocker_id = p_other and b.blocked_id = me)) then
    raise exception 'blocked';
  end if;

  -- One conversation per pair even with concurrent calls (both users, two tabs).
  perform pg_advisory_xact_lock(
    hashtextextended(least(me, p_other)::text || ':' || greatest(me, p_other)::text, 0));

  select c.id, c.is_request into v_conv, v_is_request
    from public.conversations c
   where exists (select 1 from public.conversation_participants p where p.conversation_id = c.id and p.user_id = me)
     and exists (select 1 from public.conversation_participants p where p.conversation_id = c.id and p.user_id = p_other)
     and (select count(*) from public.conversation_participants p where p.conversation_id = c.id) = 2
   order by c.created_at
   limit 1;

  if v_conv is not null then
    if v_is_request then
      select * into v_req from public.message_requests mr
       where mr.conversation_id = v_conv
       order by mr.created_at desc
       limit 1;
      if found and v_req.recipient_id = me and v_req.status <> 'accepted' then
        update public.message_requests set status = 'accepted' where id = v_req.id;
        update public.conversations set is_request = false where id = v_conv;
        insert into public.notifications (user_id, actor_id, type, conversation_id)
        values (v_req.requester_id, me, 'request_accepted', v_conv);
      elsif found and v_req.requester_id = me and v_req.status = 'rejected' then
        raise exception 'request_rejected';
      end if;
    end if;
    return v_conv;
  end if;

  select coalesce(s.allow_messages, true), coalesce(s.allow_message_requests, true), coalesce(s.hide_message_requests, false)
    into v_allow_msg, v_allow_req, v_hide_req
    from (select p_other as uid) q
    left join public.user_social_settings s on s.user_id = q.uid;
  if not v_allow_msg then
    raise exception 'messages_disabled';
  end if;

  v_direct := exists (select 1 from public.follows f where f.follower_id = p_other and f.followee_id = me);
  if not v_direct and not v_allow_req then
    raise exception 'requests_disabled';
  end if;

  insert into public.conversations (created_by, is_request)
  values (me, not v_direct)
  returning id into v_conv;

  insert into public.conversation_participants (conversation_id, user_id)
  values (v_conv, me), (v_conv, p_other);

  if not v_direct then
    insert into public.message_requests (conversation_id, requester_id, recipient_id)
    values (v_conv, me, p_other);
    if not v_hide_req then
      insert into public.notifications (user_id, actor_id, type, conversation_id)
      values (p_other, me, 'message_request', v_conv);
    end if;
  end if;
  return v_conv;
end
$$;

-- 8e) Accept / reject a message request (recipient only).
--     pending → accepted | rejected;  rejected → accepted (change of mind).
create or replace function public.respond_message_request(p_request uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me    uuid := auth.uid();
  v_req public.message_requests%rowtype;
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;
  select * into v_req from public.message_requests where id = p_request for update;
  if not found or v_req.recipient_id <> me then
    raise exception 'request_not_found';
  end if;

  if coalesce(p_accept, false) then
    if v_req.status = 'accepted' then
      return 'accepted';
    end if;
    update public.message_requests set status = 'accepted' where id = v_req.id;
    update public.conversations set is_request = false where id = v_req.conversation_id;
    insert into public.notifications (user_id, actor_id, type, conversation_id)
    values (v_req.requester_id, me, 'request_accepted', v_req.conversation_id);
    return 'accepted';
  end if;

  if v_req.status = 'accepted' then
    raise exception 'request_already_accepted';
  end if;
  update public.message_requests set status = 'rejected' where id = v_req.id;
  return 'rejected';
end
$$;

-- 8f) Read receipts: the caller marks the other side's messages read (and
-- moves their own last_read_at). No receipts while still a request.
create or replace function public.mark_conversation_read(p_conversation uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  n  integer := 0;
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;
  update public.conversation_participants
     set last_read_at = now()
   where conversation_id = p_conversation and user_id = me;
  if not found then
    raise exception 'not_a_participant';
  end if;
  if exists (select 1 from public.conversations c where c.id = p_conversation and not c.is_request) then
    update public.messages
       set read_at = now(), delivered_at = coalesce(delivered_at, now())
     where conversation_id = p_conversation
       and sender_id <> me
       and read_at is null
       and not deleted_for_all;
    get diagnostics n = row_count;
  end if;
  return n;
end
$$;

-- ============================================================================
-- 9) Referrals — the invited account records its own referral: the referrer
-- must be a real profile and not the same account, and the invited account
-- must be new (7 days), confirmed and not anonymous.
-- ============================================================================
create or replace function public.referrals_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created   timestamptz;
  v_confirmed timestamptz;
begin
  -- Other client inserts are rejected by RLS; the service role is trusted.
  if auth.uid() is null or auth.uid() is distinct from new.referred_id then
    return new;
  end if;
  if new.referrer_id is null or new.referrer_id = new.referred_id
     or not exists (select 1 from public.profiles p where p.id = new.referrer_id) then
    raise exception 'invalid_referrer' using errcode = '23514';
  end if;
  select u.created_at, u.email_confirmed_at into v_created, v_confirmed
    from auth.users u where u.id = new.referred_id;
  if v_confirmed is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'referral_unverified_account' using errcode = '23514';
  end if;
  if v_created is null or v_created < now() - interval '7 days' then
    raise exception 'referral_window_closed' using errcode = '23514';
  end if;
  return new;
end
$$;

drop trigger if exists referrals_validate on public.referrals;
create trigger referrals_validate
  before insert on public.referrals
  for each row execute function public.referrals_validate();

-- ============================================================================
-- 10) Length limits on the remaining free-text columns
-- ============================================================================
select pg_temp.jz_add_check('chat_history', 'chat_history_limits',
  'char_length(content) <= 20000 and char_length(session_id) <= 200 and (tokens_used is null or tokens_used >= 0)');
select pg_temp.jz_add_check('user_sessions', 'user_sessions_text_limits',
  'char_length(session_id) <= 200
   and (device_label is null or char_length(device_label) <= 200)
   and (browser      is null or char_length(browser)      <= 100)
   and (os           is null or char_length(os)           <= 100)
   and (device_type  is null or char_length(device_type)  <= 50)
   and (user_agent   is null or char_length(user_agent)   <= 2048)
   and (location     is null or char_length(location)     <= 200)');
select pg_temp.jz_add_check('reports', 'reports_reason_length', 'reason is null or char_length(reason) <= 1000');

-- ============================================================================
-- 11) Function privileges. Supabase's default privileges make every new
-- function executable by anon; PostgreSQL grants EXECUTE to PUBLIC.
-- ============================================================================
do $$
declare f text;
begin
  -- RPCs (and helpers RLS policies call): signed-in users only. Each one also
  -- refuses auth.uid() is null itself.
  foreach f in array array[
    'public.record_daily_activity()',
    'public.update_full_name(text)',
    'public.set_avatar(text)',
    'public.update_phone(text)',
    'public.update_bio(text)',
    'public.get_my_private_profile()',
    'public.is_conversation_participant(uuid)',
    'public.has_block_with(uuid)',
    'public.can_send_message(uuid)',
    'public.start_conversation(uuid)',
    'public.respond_message_request(uuid, boolean)',
    'public.mark_conversation_read(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;

  -- Trigger functions are not API endpoints (firing a trigger needs no EXECUTE).
  foreach f in array array[
    'public.handle_new_user()',
    'public.sync_post_counts()',
    'public.sync_hashtag_count()',
    'public.notify_on_post_interaction()',
    'public.notify_on_follow()',
    'public.profiles_guard_protected_columns()',
    'public.community_posts_validate_media()',
    'public.index_post_entities()',
    'public.messages_guard()',
    'public.touch_conversation_last_message()',
    'public.referrals_validate()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- Public, read-only, no private data: profile pages work signed out.
revoke all on function public.get_public_social_settings(uuid) from public;
grant execute on function public.get_public_social_settings(uuid) to anon, authenticated, service_role;

-- Pure helpers used inside CHECKs / invoker triggers: callers need EXECUTE.
revoke all on function public.is_valid_public_name(text) from public;
grant execute on function public.is_valid_public_name(text) to anon, authenticated, service_role;
revoke all on function public.is_own_storage_url(text, text, uuid) from public;
grant execute on function public.is_own_storage_url(text, text, uuid) to authenticated, service_role;

commit;
