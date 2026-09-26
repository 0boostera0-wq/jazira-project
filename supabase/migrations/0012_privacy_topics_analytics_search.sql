-- ============================================================================
-- 0012 — Real anonymous posting, topic-filtered exams, Elite analytics
-- enforcement, Arabic-normalised search.
--
--   A) ANONYMITY (community)
--      * community_posts.is_anonymous / post_comments.is_anonymous: a snapshot
--        taken at insert (the client's explicit value, else the author's
--        profiles.anonymous_community at that moment) and immutable afterwards
--        for every role. Existing rows are backfilled from the author's current
--        setting (= what readers saw until now).
--      * RLS: another user's anonymous post/comment is NOT readable through the
--        table API (so neither is its user_id). Feeds, threads, profile lists
--        and search read through SECURITY DEFINER RPCs that mask the author:
--        community_feed(), community_comments(), community_new_posts_count(),
--        search_all(). Own rows stay readable (achievement / dashboard counts).
--      * Realtime: community_posts and post_comments leave supabase_realtime
--        (rows carry user_id). Clients poll community_new_posts_count().
--      * Blocks are identity-blind on anonymous posts (checking them would tell
--        a blocked user who wrote the post); notifications between a blocked
--        pair are dropped instead.
--      * Notifications / mentions of anonymous content never store the actor:
--        notifications.actor_id = null + data.anonymous = true; mentions carry
--        is_anonymous and are then readable by the author only.
--      * Media of anonymous posts lives under post-media/anon/<uuid>/<file>
--        (uploadable by any signed-in user, listed / deleted by its owner only)
--        and is accepted only on anonymous posts, which must use it.
--   B) SEARCH: search_normalize() (IMMUTABLE Arabic folding) + trigram GIN
--      indexes on the normalised expressions; search_all(p_q, p_limit,
--      p_types, p_offset) with per-group totals (capped at 100).
--   C) EXAMS: start_exam_attempt(…, p_topic), exam_attempts.topic.
--   D) ANALYTICS: get_exam_stats() withholds by_topic / best_topics /
--      weakest_topics from non-premium users and lists them in "locked".
--
-- Depends on 0000–0010. Idempotent and convergent: safe to re-run, and
-- re-applying the chain in filename order (which re-creates the 0010
-- signatures this file replaces) ends in the same state.
-- ============================================================================
begin;

-- Migration-local helpers (session temp schema; nothing is left behind).
create or replace function pg_temp.jz12_trgm_expr_index(p_index text, p_table text, p_expr text)
returns void
language plpgsql
as $$
declare
  v_schema text;
begin
  select n.nspname into v_schema
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pg_trgm';
  if v_schema is null then
    raise exception 'pg_trgm is not installed (0010 creates it)';
  end if;
  execute format('create index if not exists %I on %s using gin ((%s) %I.gin_trgm_ops)',
                 p_index, p_table, p_expr, v_schema);
end
$$;

-- ============================================================================
-- A) ANONYMITY
-- ============================================================================

-- A1) Snapshot columns + backfill ------------------------------------------------
alter table public.community_posts add column if not exists is_anonymous boolean;
alter table public.post_comments   add column if not exists is_anonymous boolean;
alter table public.mentions        add column if not exists is_anonymous boolean not null default false;

update public.community_posts cp
   set is_anonymous = coalesce((select p.anonymous_community from public.profiles p where p.id = cp.user_id), false)
 where cp.is_anonymous is null;
update public.post_comments c
   set is_anonymous = coalesce((select p.anonymous_community from public.profiles p where p.id = c.user_id), false)
 where c.is_anonymous is null;

-- NOT NULL without a default: an insert that omits the column arrives as NULL,
-- the BEFORE trigger below fills it, and the constraint is checked after it.
alter table public.community_posts alter column is_anonymous drop default;
alter table public.post_comments   alter column is_anonymous drop default;
alter table public.community_posts alter column is_anonymous set not null;
alter table public.post_comments   alter column is_anonymous set not null;

-- A2) Snapshot at insert, immutable afterwards (every role) ---------------------
create or replace function public.community_content_anonymity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_anonymous is null then
      select p.anonymous_community into new.is_anonymous
        from public.profiles p
       where p.id = new.user_id;
      new.is_anonymous := coalesce(new.is_anonymous, false);
    end if;
  elsif new.is_anonymous is distinct from old.is_anonymous then
    raise exception 'anonymity_immutable'
      using errcode = '42501',
            hint = 'is_anonymous is fixed when the post or comment is created.';
  end if;
  return new;
end
$$;
revoke all on function public.community_content_anonymity() from public, anon, authenticated;

-- "…_anonymity" sorts before "community_posts_validate_media": BEFORE triggers
-- fire in name order and the media check depends on is_anonymous.
drop trigger if exists community_posts_anonymity on public.community_posts;
create trigger community_posts_anonymity
  before insert or update of is_anonymous on public.community_posts
  for each row execute function public.community_content_anonymity();

drop trigger if exists post_comments_anonymity on public.post_comments;
create trigger post_comments_anonymity
  before insert or update of is_anonymous on public.post_comments
  for each row execute function public.community_content_anonymity();

-- A3) Column grants: the flag is insertable (explicit per-post choice), never
-- updatable. (0009's column lists stay; this only adds to them.)
grant insert (is_anonymous) on public.community_posts to authenticated;
grant insert (is_anonymous) on public.post_comments   to authenticated;

-- A4) Row visibility through the table API --------------------------------------
drop policy if exists "posts_read" on public.community_posts;
create policy "posts_read" on public.community_posts
  for select to anon, authenticated
  using (not is_anonymous or user_id = (select auth.uid()));

drop policy if exists "comments_read" on public.post_comments;
create policy "comments_read" on public.post_comments
  for select to anon, authenticated
  using (not is_anonymous or user_id = (select auth.uid()));

-- Author of a post for block checks: only when the post is NOT anonymous
-- (then it is public anyway). Used by the insert policies below.
create or replace function public.post_public_author(p_post uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id
    from public.community_posts p
   where p.id = p_post
     and not p.is_anonymous
$$;
revoke all on function public.post_public_author(uuid) from public, anon;
grant execute on function public.post_public_author(uuid) to authenticated, service_role;

do $$
declare t text;
begin
  foreach t in array array['post_likes', 'post_dislikes', 'post_reposts'] loop
    execute format('drop policy if exists "%1$s_insert" on public.%1$s', t);
    execute format(
      'create policy "%1$s_insert" on public.%1$s for insert to authenticated
         with check (auth.uid() = user_id
                     and not public.has_block_with(public.post_public_author(post_id)))',
      t);
  end loop;
end $$;

drop policy if exists "comments_insert" on public.post_comments;
create policy "comments_insert" on public.post_comments
  for insert to authenticated
  with check (auth.uid() = user_id
              and not public.has_block_with(public.post_public_author(post_id)));

-- A5) Anonymous media: post-media/anon/<uuid>/<file> ----------------------------
create or replace function public.is_anon_media_path(p_name text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_name is not null
     and char_length(p_name) <= 300
     and p_name ~ '^anon/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]{1,200}$'
     and split_part(p_name, '/', 3) !~ '^\.+$'
$$;
revoke all on function public.is_anon_media_path(text) from public;
grant execute on function public.is_anon_media_path(text) to anon, authenticated, service_role;

-- Any signed-in user may upload under anon/<uuid>/ (the folder name is random,
-- so the path says nothing about the uploader); the Storage API records the
-- uploader as owner, which is what listing and deleting key on.
-- storage.objects.owner of an anon/ object IS the author, so the table must
-- never be readable by others: 0009 dropped 0005's world-readable listing
-- policy; drop it here too so this file alone guarantees it.
drop policy if exists "post_media_public_read" on storage.objects;
drop policy if exists "post_media_anon_insert" on storage.objects;
create policy "post_media_anon_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'post-media'
              and public.is_anon_media_path(name)
              and (owner = auth.uid() or owner_id = auth.uid()::text));

drop policy if exists "post_media_anon_owner_read" on storage.objects;
create policy "post_media_anon_owner_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'post-media'
         and (storage.foldername(name))[1] = 'anon'
         and (owner = auth.uid() or owner_id = auth.uid()::text));

drop policy if exists "post_media_anon_owner_delete" on storage.objects;
create policy "post_media_anon_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'post-media'
         and (storage.foldername(name))[1] = 'anon'
         and (owner = auth.uid() or owner_id = auth.uid()::text));
-- (no UPDATE policy: anonymous objects are write-once; upload with upsert=false)

-- 0009's media validation, extended. Public posts: unchanged
-- (post-media/<author>/<file>). Anonymous posts: post-media/anon/<uuid>/<file>
-- only, and the object must be the author's own upload. SECURITY INVOKER: for a
-- client the storage.objects lookup runs under the owner-only read policy, so
-- this never tells anyone about another user's objects.
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
  if new.media_path is null then
    raise exception 'invalid_media_url' using errcode = '23514';
  end if;

  if coalesce(new.is_anonymous, false) then
    -- nested on purpose: the uuid cast below runs only once the path is valid
    if not public.is_anon_media_path(new.media_path) then
      raise exception 'invalid_media_url' using errcode = '23514';
    end if;
    if not public.is_own_storage_url(new.media_url, 'post-media/anon', split_part(new.media_path, '/', 2)::uuid)
       or right(new.media_url, char_length(new.media_path) + 1) <> '/' || new.media_path
       or not exists (
         select 1 from storage.objects o
          where o.bucket_id = 'post-media'
            and o.name = new.media_path
            and (o.owner = new.user_id or o.owner_id = new.user_id::text)) then
      raise exception 'invalid_media_url' using errcode = '23514';
    end if;
    return new;
  end if;

  if split_part(new.media_path, '/', 1) <> new.user_id::text
     or not public.is_own_storage_url(new.media_url, 'post-media', new.user_id)
     or right(new.media_url, char_length(new.media_path) + 1) <> '/' || new.media_path then
    raise exception 'invalid_media_url' using errcode = '23514';
  end if;
  return new;
end
$$;
revoke all on function public.community_posts_validate_media() from public, anon, authenticated;

drop trigger if exists community_posts_validate_media on public.community_posts;
create trigger community_posts_validate_media
  before insert or update on public.community_posts
  for each row execute function public.community_posts_validate_media();

-- A6) Notifications from post interactions (replaces 0008) -----------------------
--   recipient = the post's author (owner); actor = who liked / reposted / commented.
--   * an anonymous comment → actor_id null, data.anonymous = true
--   * a block between owner and actor → no notification (only reachable on
--     anonymous posts, where the database does not refuse the interaction)
create or replace function public.notify_on_post_interaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_type  text;
  v_anon  boolean := false;
begin
  v_type := case tg_table_name
              when 'post_likes'    then 'like'
              when 'post_reposts'  then 'repost'
              when 'post_comments' then 'comment'
            end;
  if v_type is null then
    return null;
  end if;
  select p.user_id into v_owner from public.community_posts p where p.id = new.post_id;
  if v_owner is null or v_owner = new.user_id then
    return null;
  end if;
  if exists (select 1 from public.blocks b
              where (b.blocker_id = v_owner and b.blocked_id = new.user_id)
                 or (b.blocker_id = new.user_id and b.blocked_id = v_owner)) then
    return null;
  end if;
  if v_type = 'comment' then
    v_anon := coalesce((to_jsonb(new) ->> 'is_anonymous')::boolean, false);
  end if;
  insert into public.notifications (user_id, actor_id, type, post_id, comment_id, data)
  values (v_owner,
          case when v_anon then null else new.user_id end,
          v_type,
          new.post_id,
          case when v_type = 'comment' then new.id end,
          case when v_anon then jsonb_build_object('anonymous', true) else '{}'::jsonb end);
  return null;
end
$$;
revoke all on function public.notify_on_post_interaction() from public, anon, authenticated;

-- A7) #tags / @mentions indexer (replaces 0009): anonymous content records an
-- anonymous mention and an actor-less notification.
create or replace function public.index_post_entities()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_text    text := coalesce(new.content, '');
  v_anon    boolean := coalesce((to_jsonb(new) ->> 'is_anonymous')::boolean, false);
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
    insert into public.mentions (actor_id, mentioned_user_id, post_id, comment_id, is_anonymous)
    values (new.user_id, v_target, v_post, v_comment, v_anon);
    if coalesce((select s.notify_mentions from public.user_social_settings s where s.user_id = v_target), true) then
      insert into public.notifications (user_id, actor_id, type, post_id, comment_id, data)
      values (v_target,
              case when v_anon then null else new.user_id end,
              'mention', v_post, v_comment,
              case when v_anon then jsonb_build_object('anonymous', true) else '{}'::jsonb end);
    end if;
  end loop;
  return null;
end
$$;
revoke all on function public.index_post_entities() from public, anon, authenticated;

-- An anonymous mention is visible to its author only (the mentioned member
-- gets the actor-less notification instead).
drop policy if exists "mentions_read" on public.mentions;
create policy "mentions_read" on public.mentions
  for select to authenticated
  using (auth.uid() = actor_id or (auth.uid() = mentioned_user_id and not is_anonymous));

-- A8) Backfill: mentions and notifications that came from anonymous content --
update public.mentions m
   set is_anonymous = true
 where not m.is_anonymous
   and ((m.comment_id is not null
         and exists (select 1 from public.post_comments c where c.id = m.comment_id and c.is_anonymous))
     or (m.comment_id is null and m.post_id is not null
         and exists (select 1 from public.community_posts p where p.id = m.post_id and p.is_anonymous)));

update public.notifications n
   set actor_id = null,
       data     = coalesce(n.data, '{}'::jsonb) || jsonb_build_object('anonymous', true)
 where n.actor_id is not null
   and ((n.type = 'comment'
         and exists (select 1 from public.post_comments c where c.id = n.comment_id and c.is_anonymous))
     or (n.type = 'mention' and n.comment_id is not null
         and exists (select 1 from public.post_comments c where c.id = n.comment_id and c.is_anonymous))
     or (n.type = 'mention' and n.comment_id is null and n.post_id is not null
         and exists (select 1 from public.community_posts p where p.id = n.post_id and p.is_anonymous)));

-- A9) get_notifications (same signature and columns as 0010). The actor is
-- anonymous when the content was posted anonymously (data.anonymous; actor_id
-- is then already null) OR — display preference kept from 0010 — the actor's
-- profile is currently in anonymous mode.
create or replace function public.get_notifications(
  p_limit     int         default 20,
  p_before    timestamptz default null,
  p_before_id uuid        default null
)
returns table (
  id                     uuid,
  type                   text,
  read                   boolean,
  created_at             timestamptz,
  post_id                uuid,
  comment_id             uuid,
  conversation_id        uuid,
  data                   jsonb,
  actor_id               uuid,
  actor_full_name        text,
  actor_username         text,
  actor_avatar_url       text,
  actor_is_elite         boolean,
  actor_show_elite_badge boolean,
  actor_anonymous        boolean,
  post_snippet           text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'invalid_argument' using detail = '{"field":"limit","min":1,"max":100}';
  end if;

  return query
  select n.id, n.type, n.read, n.created_at, n.post_id, n.comment_id, n.conversation_id,
         coalesce(n.data, '{}'::jsonb),
         case when a.content_anon then null else n.actor_id end,
         case when a.anon then null else p.full_name end,
         case when a.anon then null else p.username end,
         case when a.anon then null else p.avatar_url end,
         case when a.anon then false else coalesce(p.is_elite, false) end,
         coalesce(p.show_elite_badge, true),
         a.anon,
         case when cp.content is null then null
              when char_length(cp.content) <= 120 then cp.content
              else left(cp.content, 120) || '…' end
    from public.notifications n
    left join public.profiles p on p.id = n.actor_id
    left join public.community_posts cp on cp.id = n.post_id
    cross join lateral (
      select coalesce((n.data ->> 'anonymous')::boolean, false) as content_anon
    ) c0
    cross join lateral (
      select c0.content_anon as content_anon,
             (c0.content_anon or coalesce(p.anonymous_community, false)) as anon
    ) a
   where n.user_id = v_uid
     and (p_before is null
          or n.created_at < p_before
          or (p_before_id is not null and n.created_at = p_before and n.id < p_before_id))
   order by n.created_at desc, n.id desc
   limit p_limit;
end
$$;

-- A10) Read RPCs ------------------------------------------------------------------
-- Is the author of a row hidden from the caller? (anonymous and not the caller)
-- Inlined below as: shown = not is_anonymous or user_id = auth.uid().

-- community_feed — one page of posts with the author masked where anonymous.
--   p_scope: 'all' | 'following' | 'tag' (p_tag) | 'author' (p_user) |
--            'liked' (p_user) | 'reposted' (p_user) | 'ids' (p_ids, ≤ 100)
--   Keyset: pass the last row's cursor_at / cursor_id as p_before / p_before_id
--   (for tag / liked / reposted the cursor is the link row, not the post).
--   Hidden from every scope: public posts by members the caller blocked.
--   'following' and other members' 'author' lists never contain anonymous posts;
--   the caller's own 'author' list does (is_anonymous tells the UI).
--   'liked' / 'reposted' of another member are empty when that member hides the
--   tab (user_social_settings.show_likes_on_profile / show_reposts_on_profile).
create or replace function public.community_feed(
  p_scope     text        default 'all',
  p_user      uuid        default null,
  p_tag       text        default null,
  p_ids       uuid[]      default null,
  p_before    timestamptz default null,
  p_before_id uuid        default null,
  p_limit     int         default 12
)
returns table (
  id                      uuid,
  content                 text,
  media_url               text,
  media_type              text,
  media_path              text,
  likes_count             int,
  dislikes_count          int,
  comments_count          int,
  reposts_count           int,
  created_at              timestamptz,
  is_anonymous            boolean,
  is_mine                 boolean,
  author_id               uuid,
  author_username         text,
  author_full_name        text,
  author_avatar_url       text,
  author_is_elite         boolean,
  author_show_elite_badge boolean,
  viewer_liked            boolean,
  viewer_disliked         boolean,
  viewer_reposted         boolean,
  cursor_at               timestamptz,
  cursor_id               uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid  uuid := auth.uid();
  v_tag  uuid;
  v_keys uuid[] := '{}'::uuid[];
  v_ts   timestamptz[] := '{}'::timestamptz[];
  v_cid  uuid[] := '{}'::uuid[];
begin
  if p_limit is null or p_limit not between 1 and 50 then
    raise exception 'invalid_argument' using detail = '{"field":"limit","min":1,"max":50}';
  end if;
  if p_scope is null or p_scope not in ('all', 'following', 'tag', 'author', 'liked', 'reposted', 'ids') then
    raise exception 'invalid_argument' using detail = '{"field":"scope"}';
  end if;
  if p_scope in ('author', 'liked', 'reposted') and p_user is null then
    raise exception 'invalid_argument' using detail = '{"field":"user"}';
  end if;
  if p_scope = 'ids' and (p_ids is null or cardinality(p_ids) > 100) then
    raise exception 'invalid_argument' using detail = '{"field":"ids","max":100}';
  end if;

  if p_scope = 'following' and v_uid is null then
    return;
  end if;
  if p_scope in ('liked', 'reposted') and p_user is distinct from v_uid
     and not coalesce((select case when p_scope = 'liked' then s.show_likes_on_profile else s.show_reposts_on_profile end
                         from public.user_social_settings s where s.user_id = p_user), true) then
    return;
  end if;

  -- 1) the page's keys: post id + keyset cursor, newest first. One static
  --    query per scope so each can range-scan its own index.
  if p_scope = 'all' then
    select coalesce(array_agg(x.pid order by x.ts desc, x.cid desc), '{}'::uuid[]),
           coalesce(array_agg(x.ts  order by x.ts desc, x.cid desc), '{}'::timestamptz[]),
           coalesce(array_agg(x.cid order by x.ts desc, x.cid desc), '{}'::uuid[])
      into v_keys, v_ts, v_cid
      from (select cp.id as pid, cp.created_at as ts, cp.id as cid
              from public.community_posts cp
             where (p_before is null
                    or (p_before_id is null and cp.created_at < p_before)
                    or (p_before_id is not null and (cp.created_at, cp.id) < (p_before, p_before_id)))
               and (cp.is_anonymous or v_uid is null
                    or not exists (select 1 from public.blocks b where b.blocker_id = v_uid and b.blocked_id = cp.user_id))
             order by cp.created_at desc, cp.id desc
             limit p_limit) x;

  elsif p_scope = 'following' then
    select coalesce(array_agg(x.pid order by x.ts desc, x.cid desc), '{}'::uuid[]),
           coalesce(array_agg(x.ts  order by x.ts desc, x.cid desc), '{}'::timestamptz[]),
           coalesce(array_agg(x.cid order by x.ts desc, x.cid desc), '{}'::uuid[])
      into v_keys, v_ts, v_cid
      from (select cp.id as pid, cp.created_at as ts, cp.id as cid
              from public.community_posts cp
             where not cp.is_anonymous
               and cp.user_id in (select f.followee_id from public.follows f where f.follower_id = v_uid)
               and (p_before is null
                    or (p_before_id is null and cp.created_at < p_before)
                    or (p_before_id is not null and (cp.created_at, cp.id) < (p_before, p_before_id)))
               and not exists (select 1 from public.blocks b where b.blocker_id = v_uid and b.blocked_id = cp.user_id)
             order by cp.created_at desc, cp.id desc
             limit p_limit) x;

  elsif p_scope = 'author' then
    select coalesce(array_agg(x.pid order by x.ts desc, x.cid desc), '{}'::uuid[]),
           coalesce(array_agg(x.ts  order by x.ts desc, x.cid desc), '{}'::timestamptz[]),
           coalesce(array_agg(x.cid order by x.ts desc, x.cid desc), '{}'::uuid[])
      into v_keys, v_ts, v_cid
      from (select cp.id as pid, cp.created_at as ts, cp.id as cid
              from public.community_posts cp
             where cp.user_id = p_user
               and (not cp.is_anonymous or p_user = v_uid)
               and (p_before is null
                    or (p_before_id is null and cp.created_at < p_before)
                    or (p_before_id is not null and (cp.created_at, cp.id) < (p_before, p_before_id)))
               and (v_uid is null
                    or not exists (select 1 from public.blocks b where b.blocker_id = v_uid and b.blocked_id = cp.user_id))
             order by cp.created_at desc, cp.id desc
             limit p_limit) x;

  elsif p_scope = 'ids' then
    select coalesce(array_agg(x.pid order by x.ts desc, x.cid desc), '{}'::uuid[]),
           coalesce(array_agg(x.ts  order by x.ts desc, x.cid desc), '{}'::timestamptz[]),
           coalesce(array_agg(x.cid order by x.ts desc, x.cid desc), '{}'::uuid[])
      into v_keys, v_ts, v_cid
      from (select cp.id as pid, cp.created_at as ts, cp.id as cid
              from public.community_posts cp
             where cp.id = any (p_ids)
               and (cp.is_anonymous or v_uid is null
                    or not exists (select 1 from public.blocks b where b.blocker_id = v_uid and b.blocked_id = cp.user_id))
             order by cp.created_at desc, cp.id desc
             limit 100) x;

  elsif p_scope = 'tag' then
    select h.id into v_tag
      from public.hashtags h
     where h.tag = lower(ltrim(btrim(coalesce(p_tag, '')), '#'));
    if v_tag is null then
      return;
    end if;
    select coalesce(array_agg(x.pid order by x.ts desc, x.cid desc), '{}'::uuid[]),
           coalesce(array_agg(x.ts  order by x.ts desc, x.cid desc), '{}'::timestamptz[]),
           coalesce(array_agg(x.cid order by x.ts desc, x.cid desc), '{}'::uuid[])
      into v_keys, v_ts, v_cid
      from (select ph.post_id as pid, ph.created_at as ts, ph.post_id as cid
              from public.post_hashtags ph
              join public.community_posts cp on cp.id = ph.post_id
             where ph.hashtag_id = v_tag
               and (p_before is null
                    or (p_before_id is null and ph.created_at < p_before)
                    or (p_before_id is not null and (ph.created_at, ph.post_id) < (p_before, p_before_id)))
               and (cp.is_anonymous or v_uid is null
                    or not exists (select 1 from public.blocks b where b.blocker_id = v_uid and b.blocked_id = cp.user_id))
             order by ph.created_at desc, ph.post_id desc
             limit p_limit) x;

  elsif p_scope = 'liked' then
    select coalesce(array_agg(x.pid order by x.ts desc, x.cid desc), '{}'::uuid[]),
           coalesce(array_agg(x.ts  order by x.ts desc, x.cid desc), '{}'::timestamptz[]),
           coalesce(array_agg(x.cid order by x.ts desc, x.cid desc), '{}'::uuid[])
      into v_keys, v_ts, v_cid
      from (select l.post_id as pid, l.created_at as ts, l.id as cid
              from public.post_likes l
              join public.community_posts cp on cp.id = l.post_id
             where l.user_id = p_user
               and (p_before is null
                    or (p_before_id is null and l.created_at < p_before)
                    or (p_before_id is not null and (l.created_at, l.id) < (p_before, p_before_id)))
               and (cp.is_anonymous or v_uid is null
                    or not exists (select 1 from public.blocks b where b.blocker_id = v_uid and b.blocked_id = cp.user_id))
             order by l.created_at desc, l.id desc
             limit p_limit) x;

  else -- 'reposted'
    select coalesce(array_agg(x.pid order by x.ts desc, x.cid desc), '{}'::uuid[]),
           coalesce(array_agg(x.ts  order by x.ts desc, x.cid desc), '{}'::timestamptz[]),
           coalesce(array_agg(x.cid order by x.ts desc, x.cid desc), '{}'::uuid[])
      into v_keys, v_ts, v_cid
      from (select r.post_id as pid, r.created_at as ts, r.id as cid
              from public.post_reposts r
              join public.community_posts cp on cp.id = r.post_id
             where r.user_id = p_user
               and (p_before is null
                    or (p_before_id is null and r.created_at < p_before)
                    or (p_before_id is not null and (r.created_at, r.id) < (p_before, p_before_id)))
               and (cp.is_anonymous or v_uid is null
                    or not exists (select 1 from public.blocks b where b.blocker_id = v_uid and b.blocked_id = cp.user_id))
             order by r.created_at desc, r.id desc
             limit p_limit) x;
  end if;

  -- 2) the rows, author masked unless the post is public or the caller's own
  return query
  select cp.id, cp.content, cp.media_url, cp.media_type, cp.media_path,
         cp.likes_count, cp.dislikes_count, cp.comments_count, cp.reposts_count, cp.created_at,
         cp.is_anonymous,
         (v_uid is not null and cp.user_id = v_uid),
         case when s.shown then cp.user_id end,
         case when s.shown then pr.username end,
         case when s.shown then pr.full_name end,
         case when s.shown then pr.avatar_url end,
         case when s.shown then coalesce(pr.is_elite, false) end,
         case when s.shown then coalesce(pr.show_elite_badge, true) end,
         (v_uid is not null and exists (select 1 from public.post_likes l    where l.post_id = cp.id and l.user_id = v_uid)),
         (v_uid is not null and exists (select 1 from public.post_dislikes d where d.post_id = cp.id and d.user_id = v_uid)),
         (v_uid is not null and exists (select 1 from public.post_reposts r  where r.post_id = cp.id and r.user_id = v_uid)),
         k.ts, k.cid
    from unnest(v_keys, v_ts, v_cid) with ordinality as k (pid, ts, cid, ord)
    join public.community_posts cp on cp.id = k.pid
    cross join lateral (select (not cp.is_anonymous or cp.user_id is not distinct from v_uid) as shown) s
    left join public.profiles pr on pr.id = cp.user_id and s.shown
   order by k.ord;
end
$$;

-- community_comments — a post's comments, newest first (keyset), author masked
-- where anonymous. Hidden: public comments by members the caller blocked.
create or replace function public.community_comments(
  p_post      uuid,
  p_before    timestamptz default null,
  p_before_id uuid        default null,
  p_limit     int         default 20
)
returns table (
  id                      uuid,
  post_id                 uuid,
  content                 text,
  created_at              timestamptz,
  is_anonymous            boolean,
  is_mine                 boolean,
  author_id               uuid,
  author_username         text,
  author_full_name        text,
  author_avatar_url       text,
  author_is_elite         boolean,
  author_show_elite_badge boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if p_post is null then
    raise exception 'invalid_argument' using detail = '{"field":"post"}';
  end if;
  if p_limit is null or p_limit not between 1 and 50 then
    raise exception 'invalid_argument' using detail = '{"field":"limit","min":1,"max":50}';
  end if;

  return query
  select c.id, c.post_id, c.content, c.created_at, c.is_anonymous,
         (v_uid is not null and c.user_id = v_uid),
         case when s.shown then c.user_id end,
         case when s.shown then pr.username end,
         case when s.shown then pr.full_name end,
         case when s.shown then pr.avatar_url end,
         case when s.shown then coalesce(pr.is_elite, false) end,
         case when s.shown then coalesce(pr.show_elite_badge, true) end
    from public.post_comments c
    cross join lateral (select (not c.is_anonymous or c.user_id is not distinct from v_uid) as shown) s
    left join public.profiles pr on pr.id = c.user_id and s.shown
   where c.post_id = p_post
     and (p_before is null
          or c.created_at < p_before
          or (p_before_id is not null and c.created_at = p_before and c.id < p_before_id))
     and (c.is_anonymous or v_uid is null
          or not exists (select 1 from public.blocks b where b.blocker_id = v_uid and b.blocked_id = c.user_id))
   order by c.created_at desc, c.id desc
   limit p_limit;
end
$$;

-- community_new_posts_count — how many posts newer than the feed's first row
-- (p_since / p_since_id = its created_at / id) the caller would see, excluding
-- their own. Capped at 100. Replaces the realtime "new posts" pill.
create or replace function public.community_new_posts_count(
  p_since    timestamptz,
  p_since_id uuid default null
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_n   int;
begin
  if p_since is null then
    raise exception 'invalid_argument' using detail = '{"field":"since"}';
  end if;
  select count(*)::int into v_n
    from (select 1
            from public.community_posts cp
           where (cp.created_at > p_since
                  or (p_since_id is not null and cp.created_at = p_since and cp.id > p_since_id))
             and (v_uid is null or cp.user_id <> v_uid)
             and (cp.is_anonymous or v_uid is null
                  or not exists (select 1 from public.blocks b where b.blocker_id = v_uid and b.blocked_id = cp.user_id))
           limit 100) x;
  return v_n;
end
$$;

-- A11) Realtime: rows carrying the author of (possibly anonymous) content leave
-- the publication. post_likes / post_dislikes / post_reposts (actor = the
-- reacting member, public anyway), notifications (own rows; anonymous actors
-- are never stored) and the DM tables stay.
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables) then
    raise warning '0012: supabase_realtime publishes ALL TABLES — community_posts / post_comments cannot be removed from it; recreate the publication with an explicit table list.';
    return;
  end if;
  foreach t in array array['community_posts', 'post_comments'] loop
    if exists (select 1 from pg_publication_tables
                where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $$;

-- A12) Indexes for the read RPCs ----------------------------------------------------
create index if not exists community_posts_created_idx      on public.community_posts (created_at desc, id desc);
create index if not exists community_posts_user_created_idx on public.community_posts (user_id, created_at desc, id desc);
create index if not exists post_comments_post_created_idx   on public.post_comments (post_id, created_at desc, id desc);
create index if not exists post_likes_user_created_idx      on public.post_likes (user_id, created_at desc, id desc);
create index if not exists post_reposts_user_created_idx    on public.post_reposts (user_id, created_at desc, id desc);
create index if not exists post_hashtags_tag_created_idx    on public.post_hashtags (hashtag_id, created_at desc, post_id desc);

-- ============================================================================
-- B) SEARCH — Arabic-normalised matching
-- ============================================================================

-- Mirrors normalizeText() in src/lib/search/curriculum-index.js for Arabic:
-- drops harakat / tanween / shadda / sukun / superscript alef / Quranic marks
-- and tatweel; folds أ إ آ ٱ → ا, ة → ه, ى ئ ی → ي, ؤ → و, ک → ك, Arabic-Indic
-- and Persian digits → 0-9; lower-cases; collapses and trims whitespace.
-- Punctuation is kept (so LIKE wildcards stay literal after escaping).
create or replace function public.search_normalize(p_text text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(
           lower(translate(
             regexp_replace(p_text, '[ؐ-ًؚ-ٰٟۖ-ۭـ]', '', 'g'),
             U&'\0623\0625\0622\0671\0629\0649\0626\06CC\0624\06A9\0660\0661\0662\0663\0664\0665\0666\0667\0668\0669\06F0\06F1\06F2\06F3\06F4\06F5\06F6\06F7\06F8\06F9',
             U&'\0627\0627\0627\0627\0647\064A\064A\064A\0648\0643' || '0123456789' || '0123456789')),
           '\s+', ' ', 'g'))
$$;
revoke all on function public.search_normalize(text) from public;
grant execute on function public.search_normalize(text) to anon, authenticated, service_role;

select pg_temp.jz12_trgm_expr_index('profiles_full_name_norm_idx',      'public.profiles',        'public.search_normalize(full_name)');
select pg_temp.jz12_trgm_expr_index('profiles_username_norm_idx',       'public.profiles',        'public.search_normalize(username)');
select pg_temp.jz12_trgm_expr_index('community_posts_content_norm_idx', 'public.community_posts', 'public.search_normalize(content)');
select pg_temp.jz12_trgm_expr_index('hashtags_tag_norm_idx',            'public.hashtags',        'public.search_normalize(tag)');
select pg_temp.jz12_trgm_expr_index('questions_stem_norm_idx',          'public.questions',       'public.search_normalize(stem)');

-- A window of p_text around the first match of p_q (… marks cut ends). Tries a
-- plain case-insensitive match first, then the normalised one (e.g. the query
-- "مدرسه" in the text "مدرسةٌ"), mapping the position back to the original text.
create or replace function public.search_snippet(p_text text, p_q text, p_len int)
returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_len   int;
  v_pos   int;
  v_npos  int;
  v_kept  int := 0;
  v_space boolean := true;      -- leading whitespace is trimmed by the normaliser
  v_ch    text;
  v_i     int;
  v_s     int;
begin
  if p_text is null then
    return null;
  end if;
  v_len := char_length(p_text);
  if p_len is null or v_len <= p_len then
    return p_text;
  end if;
  v_pos := strpos(lower(p_text), lower(coalesce(p_q, '')));
  if v_pos = 0 and coalesce(p_q, '') <> '' then
    v_npos := strpos(public.search_normalize(p_text), public.search_normalize(p_q));
    if v_npos > 0 then
      for v_i in 1 .. v_len loop
        v_ch := substr(p_text, v_i, 1);
        if v_ch ~ '[ؐ-ًؚ-ٰٟۖ-ۭـ]' then
          continue;
        elsif v_ch ~ '\s' then
          if v_space then
            continue;
          end if;
          v_space := true;
        else
          v_space := false;
        end if;
        v_kept := v_kept + 1;
        if v_kept >= v_npos then
          v_pos := v_i;
          exit;
        end if;
      end loop;
    end if;
  end if;
  v_s := greatest(1, v_pos - p_len / 4);
  return (case when v_s > 1 then '…' else '' end)
      || substr(p_text, v_s, p_len)
      || (case when v_s + p_len - 1 < v_len then '…' else '' end);
end
$$;
revoke all on function public.search_snippet(text, text, int) from public;
grant execute on function public.search_snippet(text, text, int) to anon, authenticated, service_role;

-- search_all(p_q, p_limit = 5, p_types = null, p_offset = 0) → jsonb
-- SECURITY DEFINER (anonymous posts must be searchable with their author
-- masked), so every visibility rule is explicit here:
--   people    public columns only; never members in anonymous mode
--   posts     author only when the post is not anonymous (or is the caller's);
--             public posts by members the caller blocked are skipped
--   tags      everything
--   questions active only; premium only for premium callers (= questions RLS)
-- p_types: subset of people/posts/tags/questions (null = all); p_offset 0–100
-- pages the requested groups. totals: per requested group, capped at 100
-- (totals_capped says when more matched); null for groups not requested.
drop function if exists public.search_all(text, int);
create or replace function public.search_all(
  p_q      text,
  p_limit  int    default 5,
  p_types  text[] default null,
  p_offset int    default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c_cap     constant int := 100;
  c_groups  constant text[] := array['people', 'posts', 'tags', 'questions'];
  v_uid     uuid := auth.uid();
  v_offset  int := coalesce(p_offset, 0);
  v_types   text[];
  v_q       text;
  v_norm    text;
  v_pat     text;
  v_prefix  text;
  v_tag     text;
  v_tagpat  text;
  v_tagpre  text;
  v_premium boolean;
  v_n       int;
  v_people  jsonb := '[]'::jsonb;
  v_posts   jsonb := '[]'::jsonb;
  v_tags    jsonb := '[]'::jsonb;
  v_qs      jsonb := '[]'::jsonb;
  v_totals  jsonb;
  v_capped  jsonb;
begin
  if p_limit is null or p_limit not between 1 and 20 then
    raise exception 'invalid_argument' using detail = '{"field":"limit","min":1,"max":20}';
  end if;
  if v_offset not between 0 and 100 then
    raise exception 'invalid_argument' using detail = '{"field":"offset","min":0,"max":100}';
  end if;
  if p_types is null then
    v_types := c_groups;
  else
    if cardinality(p_types) = 0
       or exists (select 1 from unnest(p_types) t where t is null or not (t = any (c_groups))) then
      raise exception 'invalid_argument' using detail = '{"field":"types"}';
    end if;
    v_types := array(select g from unnest(c_groups) g where g = any (p_types));
  end if;

  v_totals := jsonb_build_object('people', null, 'posts', null, 'tags', null, 'questions', null);
  v_capped := jsonb_build_object('people', null, 'posts', null, 'tags', null, 'questions', null);

  v_q    := left(regexp_replace(btrim(coalesce(p_q, '')), '\s+', ' ', 'g'), 100);
  v_norm := coalesce(public.search_normalize(v_q), '');
  if char_length(v_q) < 2 or char_length(v_norm) < 2 then
    select v_totals || coalesce(jsonb_object_agg(g, 0), '{}'::jsonb),
           v_capped || coalesce(jsonb_object_agg(g, false), '{}'::jsonb)
      into v_totals, v_capped
      from unnest(v_types) g;
    return jsonb_build_object('query', v_q, 'people', v_people, 'posts', v_posts, 'tags', v_tags,
                              'questions', v_qs, 'totals', v_totals, 'totals_capped', v_capped,
                              'limit', p_limit, 'offset', v_offset, 'types', to_jsonb(v_types));
  end if;

  -- LIKE-escape the normalised text: \ % _ are literals
  v_pat    := replace(replace(replace(v_norm, '\', '\\'), '%', '\%'), '_', '\_');
  v_prefix := v_pat || '%';
  v_pat    := '%' || v_pat || '%';

  -- people ------------------------------------------------------------------
  if 'people' = any (v_types) then
    select count(*)::int into v_n
      from (select 1 from public.profiles p
             where not coalesce(p.anonymous_community, false)
               and (public.search_normalize(p.full_name) like v_pat escape '\'
                    or public.search_normalize(p.username) like v_pat escape '\')
             limit c_cap + 1) x;
    v_totals := v_totals || jsonb_build_object('people', least(v_n, c_cap));
    v_capped := v_capped || jsonb_build_object('people', v_n > c_cap);

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', x.id, 'username', x.username, 'full_name', x.full_name, 'avatar_url', x.avatar_url,
             'is_elite', x.is_elite, 'show_elite_badge', x.show_elite_badge)
             order by x.pref desc, x.xp desc, x.id), '[]'::jsonb)
      into v_people
      from (select p.id, p.username, p.full_name, p.avatar_url, p.is_elite, p.show_elite_badge, p.xp,
                   coalesce(public.search_normalize(p.full_name) like v_prefix escape '\', false)
                   or coalesce(public.search_normalize(p.username) like v_prefix escape '\', false) as pref
              from public.profiles p
             where not coalesce(p.anonymous_community, false)
               and (public.search_normalize(p.full_name) like v_pat escape '\'
                    or public.search_normalize(p.username) like v_pat escape '\')
             order by 8 desc, p.xp desc, p.id
            offset v_offset
             limit p_limit) x;
  end if;

  -- posts -------------------------------------------------------------------
  if 'posts' = any (v_types) then
    select count(*)::int into v_n
      from (select 1 from public.community_posts cp
             where public.search_normalize(cp.content) like v_pat escape '\'
               and (cp.is_anonymous or v_uid is null
                    or not exists (select 1 from public.blocks b where b.blocker_id = v_uid and b.blocked_id = cp.user_id))
             limit c_cap + 1) x;
    v_totals := v_totals || jsonb_build_object('posts', least(v_n, c_cap));
    v_capped := v_capped || jsonb_build_object('posts', v_n > c_cap);

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', x.id,
             'snippet', public.search_snippet(x.content, v_q, 160),
             'created_at', x.created_at,
             'likes_count', x.likes_count,
             'comments_count', x.comments_count,
             'is_anonymous', x.is_anonymous,
             'is_mine', x.is_mine,
             'author', case when x.shown then jsonb_build_object(
                         'id', x.author_id, 'username', x.username, 'full_name', x.full_name,
                         'avatar_url', x.avatar_url, 'is_elite', coalesce(x.is_elite, false),
                         'show_elite_badge', coalesce(x.show_elite_badge, true)) end
           ) order by x.created_at desc, x.id), '[]'::jsonb)
      into v_posts
      from (select cp.id, cp.content, cp.created_at, cp.likes_count, cp.comments_count, cp.is_anonymous,
                   (v_uid is not null and cp.user_id = v_uid) as is_mine,
                   (not cp.is_anonymous or cp.user_id is not distinct from v_uid) as shown,
                   pr.id as author_id, pr.username, pr.full_name, pr.avatar_url, pr.is_elite, pr.show_elite_badge
              from public.community_posts cp
              left join public.profiles pr
                on pr.id = cp.user_id and (not cp.is_anonymous or cp.user_id is not distinct from v_uid)
             where public.search_normalize(cp.content) like v_pat escape '\'
               and (cp.is_anonymous or v_uid is null
                    or not exists (select 1 from public.blocks b where b.blocker_id = v_uid and b.blocked_id = cp.user_id))
             order by cp.created_at desc, cp.id
            offset v_offset
             limit p_limit) x;
  end if;

  -- tags (a leading # is ignored) ---------------------------------------------
  if 'tags' = any (v_types) then
    v_tag := coalesce(public.search_normalize(ltrim(v_q, '#')), '');
    if char_length(v_tag) >= 2 then
      v_tagpat := replace(replace(replace(v_tag, '\', '\\'), '%', '\%'), '_', '\_');
      v_tagpre := v_tagpat || '%';
      v_tagpat := '%' || v_tagpat || '%';
      select count(*)::int into v_n
        from (select 1 from public.hashtags h
               where public.search_normalize(h.tag) like v_tagpat escape '\'
               limit c_cap + 1) x;
      select coalesce(jsonb_agg(jsonb_build_object('tag', x.tag, 'post_count', x.post_count)
                                order by x.pref desc, x.post_count desc, x.tag), '[]'::jsonb)
        into v_tags
        from (select h.tag, h.post_count, (public.search_normalize(h.tag) like v_tagpre escape '\') as pref
                from public.hashtags h
               where public.search_normalize(h.tag) like v_tagpat escape '\'
               order by 3 desc, h.post_count desc, h.tag
              offset v_offset
               limit p_limit) x;
    else
      v_n := 0;
    end if;
    v_totals := v_totals || jsonb_build_object('tags', least(v_n, c_cap));
    v_capped := v_capped || jsonb_build_object('tags', v_n > c_cap);
  end if;

  -- questions -----------------------------------------------------------------
  if 'questions' = any (v_types) then
    v_premium := public.has_premium(v_uid);
    select count(*)::int into v_n
      from (select 1 from public.questions q
             where q.is_active
               and (not q.is_premium or v_premium)
               and public.search_normalize(q.stem) like v_pat escape '\'
             limit c_cap + 1) x;
    v_totals := v_totals || jsonb_build_object('questions', least(v_n, c_cap));
    v_capped := v_capped || jsonb_build_object('questions', v_n > c_cap);

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', x.id, 'section', x.section, 'topic', x.topic,
             'snippet', public.search_snippet(x.stem, v_q, 140)) order by x.difficulty, x.key), '[]'::jsonb)
      into v_qs
      from (select q.id, q.section, q.topic, q.stem, q.difficulty, q.key
              from public.questions q
             where q.is_active
               and (not q.is_premium or v_premium)
               and public.search_normalize(q.stem) like v_pat escape '\'
             order by q.difficulty, q.key
            offset v_offset
             limit p_limit) x;
  end if;

  return jsonb_build_object('query', v_q, 'people', v_people, 'posts', v_posts, 'tags', v_tags,
                            'questions', v_qs, 'totals', v_totals, 'totals_capped', v_capped,
                            'limit', p_limit, 'offset', v_offset, 'types', to_jsonb(v_types));
end
$$;

-- ============================================================================
-- C) EXAMS — topic filter
-- ============================================================================
alter table public.exam_attempts add column if not exists topic text;   -- null = every topic of the section

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.exam_attempts'::regclass and conname = 'exam_attempts_topic_check') then
    alter table public.exam_attempts add constraint exam_attempts_topic_check
      check (topic is null or (section is not null and topic = any (public.exam_section_topics(section))));
  end if;
end $$;

create index if not exists questions_pick_est_idx  on public.questions (exam, section, topic, random_key) where is_active;
create index if not exists questions_pick_estd_idx on public.questions (exam, section, topic, difficulty, random_key) where is_active;

-- _exam_pick with a topic filter (replaces the 8-argument 0010 version).
drop function if exists public._exam_pick(text, text, smallint, boolean, double precision, boolean, uuid[], int);
create or replace function public._exam_pick(
  p_exam       text,
  p_section    text,
  p_topic      text,
  p_difficulty smallint,
  p_premium    boolean,
  p_from       double precision,
  p_upward     boolean,
  p_exclude    uuid[],
  p_limit      int
)
returns uuid[]
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_sql text;
  v_ids uuid[];
begin
  if p_limit is null or p_limit <= 0 then
    return '{}'::uuid[];
  end if;
  v_sql := 'select coalesce(array_agg(s.id), ''{}''::uuid[]) from (select q.id from public.questions q'
        || ' where q.is_active and q.exam = $1';
  if p_section is not null then v_sql := v_sql || ' and q.section = $2'; end if;
  if p_topic is not null then v_sql := v_sql || ' and q.topic = $7'; end if;
  if p_difficulty is not null then v_sql := v_sql || ' and q.difficulty = $3'; end if;
  if not coalesce(p_premium, false) then v_sql := v_sql || ' and not q.is_premium'; end if;
  v_sql := v_sql || case when p_upward then ' and q.random_key >= $4' else ' and q.random_key < $4' end;
  if coalesce(cardinality(p_exclude), 0) > 0 then v_sql := v_sql || ' and q.id <> all ($5)'; end if;
  v_sql := v_sql || ' order by q.random_key limit $6) s';
  execute v_sql into v_ids using p_exam, p_section, p_difficulty, p_from, p_exclude, p_limit, p_topic;
  return coalesce(v_ids, '{}'::uuid[]);
end
$$;
revoke all on function public._exam_pick(text, text, text, smallint, boolean, double precision, boolean, uuid[], int)
  from public, anon, authenticated;

-- attempt JSON (+ topic)
create or replace function public._exam_attempt_json(p_attempt uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
           'id', a.id,
           'exam', a.exam,
           'section', a.section,
           'topic', a.topic,
           'difficulty', a.difficulty,
           'status', a.status,
           'question_count', a.question_count,
           'time_limit_seconds', a.time_limit_seconds,
           'started_at', a.started_at,
           'expires_at', a.expires_at,
           'submitted_at', a.submitted_at,
           'correct_count', a.correct_count,
           'total', a.total,
           'score_percent', a.score_percent,
           'duration_seconds', a.duration_seconds,
           'answered_count', coalesce((a.meta ->> 'answered_count')::int,
                                      (select count(*)::int from public.exam_attempt_items i
                                        where i.attempt_id = a.id and i.selected_index is not null)),
           'xp_awarded', coalesce((a.meta ->> 'xp_awarded')::int, 0)
         )
    from public.exam_attempts a
   where a.id = p_attempt
$$;
revoke all on function public._exam_attempt_json(uuid) from public, anon, authenticated;

-- start_exam_attempt(…, p_topic text = null). The 0010 signature is dropped so
-- PostgREST never sees two overloads; p_topic is last, so positional callers
-- of the old five arguments keep working.
drop function if exists public.start_exam_attempt(text, text, smallint, int, int);
create or replace function public.start_exam_attempt(
  p_exam               text,
  p_section            text     default null,
  p_difficulty         smallint default null,
  p_count              int      default 10,
  p_time_limit_seconds int      default null,
  p_topic              text     default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  c_free_max   constant int := 25;   -- LIMITS.freeMaxQuestions
  c_free_daily constant int := 5;    -- LIMITS.freeDailyAttempts
  c_sections   constant text[] := array['quantitative', 'verbal', 'math', 'physics', 'chemistry', 'biology'];
  v_uid        uuid := auth.uid();
  v_section    text := p_section;
  v_topic      text := p_topic;
  v_matches    text[];
  v_premium    boolean;
  v_day_start  timestamptz;
  v_used       int;
  v_recent     uuid[];
  v_picked     uuid[] := '{}'::uuid[];
  v_r          double precision := random();
  v_n          int;
  v_time       int;
  v_attempt    uuid;
  v_now        timestamptz := now();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_exam is null or p_exam not in ('aptitude', 'achievement') then
    raise exception 'invalid_argument' using detail = '{"field":"exam"}';
  end if;
  if v_section is not null and public.exam_of_section(v_section) is distinct from p_exam then
    raise exception 'invalid_argument' using detail = '{"field":"section"}';
  end if;
  if v_topic is not null then
    if v_section is null then
      -- a topic belongs to exactly one section of an exam: infer it
      v_matches := array(select s from unnest(c_sections) s
                          where public.exam_of_section(s) = p_exam
                            and v_topic = any (public.exam_section_topics(s)));
      if coalesce(cardinality(v_matches), 0) <> 1 then
        raise exception 'invalid_argument' using detail = '{"field":"topic"}';
      end if;
      v_section := v_matches[1];
    elsif not (v_topic = any (public.exam_section_topics(v_section))) then
      raise exception 'invalid_argument' using detail = '{"field":"topic"}';
    end if;
  end if;
  if p_difficulty is not null and p_difficulty not between 1 and 3 then
    raise exception 'invalid_argument' using detail = '{"field":"difficulty"}';
  end if;
  if p_count is null or p_count not between 5 and 100 then          -- LIMITS.min/maxQuestions
    raise exception 'invalid_argument' using detail = '{"field":"count","min":5,"max":100}';
  end if;
  if p_time_limit_seconds is not null and p_time_limit_seconds not between 60 and 14400 then  -- 1..240 min
    raise exception 'invalid_argument' using detail = '{"field":"time_limit_seconds","min":60,"max":14400}';
  end if;

  v_premium := public.has_premium(v_uid);
  if not v_premium and p_count > c_free_max then
    raise exception 'premium_required' using detail = json_build_object('max_questions', c_free_max)::text;
  end if;

  -- One start at a time per user (the daily count below must not race).
  perform pg_advisory_xact_lock(hashtextextended('jazira.exam_start:' || v_uid::text, 0));

  perform public._exam_expire_stale(v_uid);

  if not v_premium then
    v_day_start := date_trunc('day', v_now at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh';
    select count(*)::int into v_used
      from public.exam_attempts
     where user_id = v_uid and started_at >= v_day_start;
    if v_used >= c_free_daily then
      raise exception 'daily_limit_reached' using detail = json_build_object(
        'limit', c_free_daily, 'used', v_used, 'resets_at', v_day_start + interval '1 day')::text;
    end if;
  end if;

  -- Questions seen in the user's last 3 attempts are avoided while enough remain.
  select coalesce(array_agg(distinct i.question_id), '{}'::uuid[]) into v_recent
    from public.exam_attempt_items i
   where i.attempt_id in (select a.id from public.exam_attempts a
                           where a.user_id = v_uid
                           order by a.started_at desc
                           limit 3);

  v_picked := public._exam_pick(p_exam, v_section, v_topic, p_difficulty, v_premium, v_r, true, v_recent, p_count);
  if cardinality(v_picked) < p_count then
    v_picked := v_picked || public._exam_pick(p_exam, v_section, v_topic, p_difficulty, v_premium, v_r, false,
                                              v_recent, p_count - cardinality(v_picked));
  end if;
  if cardinality(v_picked) < p_count and cardinality(v_recent) > 0 then
    v_picked := v_picked || public._exam_pick(p_exam, v_section, v_topic, p_difficulty, v_premium, v_r, true,
                                              v_picked, p_count - cardinality(v_picked));
    if cardinality(v_picked) < p_count then
      v_picked := v_picked || public._exam_pick(p_exam, v_section, v_topic, p_difficulty, v_premium, v_r, false,
                                                v_picked, p_count - cardinality(v_picked));
    end if;
  end if;

  v_n := coalesce(cardinality(v_picked), 0);
  if v_n = 0 then
    raise exception 'not_enough_questions' using detail = json_build_object('available', 0, 'requested', p_count)::text;
  end if;

  select coalesce(p_time_limit_seconds, least(greatest(sum(q.time_limit_seconds), 60), 14400))::int
    into v_time
    from public.questions q where q.id = any (v_picked);

  insert into public.exam_attempts (user_id, exam, section, topic, difficulty, question_count, time_limit_seconds,
                                    status, started_at, expires_at, meta)
  values (v_uid, p_exam, v_section, v_topic, p_difficulty, v_n, v_time, 'in_progress', v_now,
          v_now + make_interval(secs => v_time),
          jsonb_build_object('requested_count', p_count, 'premium', v_premium))
  returning id into v_attempt;

  insert into public.exam_attempt_items (attempt_id, position, question_id)
  select v_attempt, s.ord::smallint, s.id
    from unnest(array(select x from unnest(v_picked) x order by random())) with ordinality as s (id, ord);

  return jsonb_build_object(
    'mode', 'db',
    'attempt_id', v_attempt,
    'status', 'in_progress',
    'exam', p_exam,
    'section', v_section,
    'topic', v_topic,
    'difficulty', p_difficulty,
    'question_count', v_n,
    'requested_count', p_count,
    'started_at', v_now,
    'expires_at', v_now + make_interval(secs => v_time),
    'time_limit_seconds', v_time,
    'server_now', v_now,
    'questions', public._exam_questions_json(v_attempt)
  );
end
$$;

-- ============================================================================
-- D) ANALYTICS — Elite-only advanced analytics (matches /subscriptions and
-- the history page). Everyone gets the basic block: completed_attempts,
-- in_progress, totals, by_section, trend. Premium adds by_topic, best_topics,
-- weakest_topics; for everyone else those keys are [] and listed in "locked".
-- ============================================================================
create or replace function public.get_exam_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c_advanced constant text[] := array['by_topic', 'best_topics', 'weakest_topics'];
  v_uid     uuid := auth.uid();
  v_today   date := (now() at time zone 'Asia/Riyadh')::date;
  v_premium boolean;
  v         jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  v_premium := public.has_premium(v_uid);

  with att as (
    select a.*, (coalesce(a.submitted_at, a.started_at) at time zone 'Asia/Riyadh')::date as day
      from public.exam_attempts a
     where a.user_id = v_uid and a.status in ('submitted', 'expired')
  ),
  itm as (
    select i.*, q.section, q.topic
      from public.exam_attempt_items i
      join att on att.id = i.attempt_id
      join public.questions q on q.id = i.question_id
  ),
  topic_rows as (
    select section, topic,
           count(*)::int as total,
           count(*) filter (where selected_index is not null)::int as answered,
           count(*) filter (where is_correct)::int as correct
      from itm group by section, topic
  ),
  section_rows as (
    select section, public.exam_of_section(section) as exam,
           count(*)::int as total,
           count(*) filter (where selected_index is not null)::int as answered,
           count(*) filter (where is_correct)::int as correct
      from itm group by section
  ),
  win as (
    select w.name,
           count(att.id)::int as attempts,
           coalesce(sum(att.total), 0)::int as total,
           coalesce(sum(att.correct_count), 0)::int as correct
      from (values ('last_7', v_today - 6, v_today),
                   ('prev_7', v_today - 13, v_today - 7),
                   ('last_30', v_today - 29, v_today),
                   ('prev_30', v_today - 59, v_today - 30)) as w (name, d_from, d_to)
      left join att on att.day between w.d_from and w.d_to
     group by w.name
  ),
  daily as (
    select day, count(*)::int as attempts, coalesce(sum(total), 0)::int as total,
           coalesce(sum(correct_count), 0)::int as correct
      from att where day > v_today - 30 group by day
  )
  select jsonb_build_object(
    'completed_attempts', (select count(*)::int from att),
    'in_progress', (select count(*)::int from public.exam_attempts
                     where user_id = v_uid and status = 'in_progress'
                       and expires_at + interval '30 seconds' >= now()),
    'totals', (select jsonb_build_object(
                 'attempts', count(*)::int,
                 'questions', coalesce(sum(total), 0)::int,
                 'answered', coalesce(sum(coalesce((meta ->> 'answered_count')::int, 0)), 0)::int,
                 'correct', coalesce(sum(correct_count), 0)::int,
                 'accuracy', round(100.0 * sum(correct_count) / nullif(sum(total), 0), 1),
                 'average_score', round(avg(score_percent), 1),
                 'best_score', max(score_percent),
                 'total_seconds', coalesce(sum(duration_seconds), 0)::int,
                 'avg_seconds_per_question', round(sum(duration_seconds)::numeric / nullif(sum(total), 0), 1),
                 'xp_earned', coalesce(sum(coalesce((meta ->> 'xp_awarded')::int, 0)), 0)::int,
                 'last_attempt_at', max(coalesce(submitted_at, started_at)))
               from att),
    'by_section', coalesce((select jsonb_agg(jsonb_build_object(
                     'exam', exam, 'section', section, 'total', total, 'answered', answered,
                     'correct', correct, 'accuracy', round(100.0 * correct / nullif(total, 0), 1))
                     order by exam, section) from section_rows), '[]'::jsonb),
    'by_topic', case when not v_premium then '[]'::jsonb else
                  coalesce((select jsonb_agg(jsonb_build_object(
                     'section', section, 'topic', topic, 'total', total, 'answered', answered,
                     'correct', correct, 'accuracy', round(100.0 * correct / nullif(total, 0), 1))
                     order by section, topic) from topic_rows), '[]'::jsonb) end,
    'trend', jsonb_build_object(
      'windows', (select jsonb_object_agg(name, jsonb_build_object(
                     'attempts', attempts, 'total', total, 'correct', correct,
                     'accuracy', round(100.0 * correct / nullif(total, 0), 1))) from win),
      'daily', coalesce((select jsonb_agg(jsonb_build_object(
                  'day', day, 'attempts', attempts, 'total', total, 'correct', correct,
                  'accuracy', round(100.0 * correct / nullif(total, 0), 1)) order by day) from daily), '[]'::jsonb)
    ),
    'best_topics', case when not v_premium then '[]'::jsonb else
                     coalesce((select jsonb_agg(x order by (x ->> 'accuracy')::numeric desc, x ->> 'topic')
                                 from (select jsonb_build_object('section', section, 'topic', topic, 'total', total,
                                                'correct', correct, 'accuracy', round(100.0 * correct / total, 1)) as x
                                         from topic_rows where total >= 3
                                        order by (1.0 * correct / total) desc, topic limit 3) b), '[]'::jsonb) end,
    'weakest_topics', case when not v_premium then '[]'::jsonb else
                        coalesce((select jsonb_agg(x order by (x ->> 'accuracy')::numeric, x ->> 'topic')
                                    from (select jsonb_build_object('section', section, 'topic', topic, 'total', total,
                                                   'correct', correct, 'accuracy', round(100.0 * correct / total, 1)) as x
                                            from topic_rows where total >= 3
                                           order by (1.0 * correct / total), topic limit 3) w), '[]'::jsonb) end,
    'premium', v_premium,
    'locked', case when v_premium then '[]'::jsonb else to_jsonb(c_advanced) end
  ) into v;

  return v;
end
$$;

-- ============================================================================
-- Function privileges (Supabase's default privileges grant EXECUTE on every
-- new function to anon + authenticated, so each is set explicitly).
-- ============================================================================
revoke all on function public.community_feed(text, uuid, text, uuid[], timestamptz, uuid, int) from public;
revoke all on function public.community_comments(uuid, timestamptz, uuid, int)                 from public;
revoke all on function public.community_new_posts_count(timestamptz, uuid)                     from public;
revoke all on function public.search_all(text, int, text[], int)                              from public;
grant execute on function public.community_feed(text, uuid, text, uuid[], timestamptz, uuid, int) to anon, authenticated, service_role;
grant execute on function public.community_comments(uuid, timestamptz, uuid, int)                 to anon, authenticated, service_role;
grant execute on function public.community_new_posts_count(timestamptz, uuid)                     to anon, authenticated, service_role;
grant execute on function public.search_all(text, int, text[], int)                              to anon, authenticated, service_role;

revoke all on function public.start_exam_attempt(text, text, smallint, int, int, text) from public, anon, authenticated;
grant execute on function public.start_exam_attempt(text, text, smallint, int, int, text) to authenticated, service_role;

revoke all on function public.get_exam_stats()                              from public, anon, authenticated;
grant execute on function public.get_exam_stats()                           to authenticated, service_role;
revoke all on function public.get_notifications(int, timestamptz, uuid)     from public, anon, authenticated;
grant execute on function public.get_notifications(int, timestamptz, uuid)  to authenticated, service_role;

-- PostgREST: pick up the new / changed signatures.
notify pgrst, 'reload schema';

commit;
