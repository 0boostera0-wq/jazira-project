-- ============================================================================
-- 0013 — Server-verified AI quota, payment-webhook integrity, shared rate
-- limits, contact-inbox abuse limit, reaction privacy, and drift fixes.
--
--   A) AI QUOTA (replaces the route's check-then-insert):
--      * ai_consume(p_session, p_content) — ONE transaction per user
--        (advisory lock): quota check + store the user message + charge it.
--        A retry of the same message is free only while the ledger row says
--        its reply was never delivered (ai_usage.replied_at), so deleting
--        chat_history rows no longer revives the exemption, and parallel
--        requests can no longer all pass the quota.
--      * ai_finish(p_ticket, p_reply) — stores the reply and marks it
--        delivered, or releases the claim when nothing was delivered. The
--        ticket is a random id the server keeps in memory (ai_usage has no
--        client privileges), so a browser cannot release its own claims.
--      * ai_quota() — same payload, search_path = ''.
--   B) PAYMENTS: apply_payment_event() (service role only) records the event
--      and changes the entitlement in ONE transaction, ignores stale
--      (out-of-order) events, and never marks an event processed when the
--      state change failed. subscriptions.provider_updated_at /
--      provider_status added.
--   C) RATE LIMITS: rate_limits + rate_limit_hit() — a fixed-window counter
--      shared by every server instance (service role only).
--   D) CONTACT: the inbox is written only by POST /api/contact (service role,
--      per-IP limit); the guard also caps guest messages platform-wide.
--   E) REACTION PRIVACY: who liked / reposted something is visible only when
--      that member shows the tab on their profile; dislikes are private.
--      The reaction tables leave supabase_realtime (nothing subscribes).
--   F) HASHTAGS / MENTIONS: the indexer keeps the FIRST 10 distinct tags /
--      handles in text order (what the UI links), not an arbitrary 10.
--   G) DRIFT: profiles.updated_at is no longer client-writable (the
--      set_updated_at trigger owns it); the remaining definer RPCs use
--      search_path = '' (docs/SECURITY.md §5).
--   H) EXAM XP: at most 300 exam XP per member per Asia/Riyadh day.
--   I) SESSIONS: user_sessions.city / country_code (the UI names the country
--      in the reader's language); device values become language-neutral codes.
--
-- Depends on 0000–0012. Idempotent: safe to re-run.
-- ============================================================================
begin;

-- ============================================================================
-- A) AI QUOTA
-- ============================================================================
alter table public.ai_usage add column if not exists session_id  text;
alter table public.ai_usage add column if not exists content_md5 text;
alter table public.ai_usage add column if not exists claimed_at  timestamptz;
alter table public.ai_usage add column if not exists ticket      uuid;
alter table public.ai_usage add column if not exists replied_at  timestamptz;
create index if not exists ai_usage_user_session_idx on public.ai_usage (user_id, session_id, created_at desc, id desc);
create unique index if not exists ai_usage_ticket_key on public.ai_usage (ticket) where ticket is not null;
-- still no client access at all (0010 revoked everything; restated on purpose)
revoke all on table public.ai_usage from public, anon, authenticated;

-- Rows from before 0013 (content_md5 is null only for them: the trigger below
-- fills it for every new row): best-effort session/content, and never
-- retry-exempt — their delivery state is unknown.
update public.ai_usage u
   set session_id  = ch.session_id,
       content_md5 = md5(ch.content),
       replied_at  = coalesce(u.replied_at, u.created_at)
  from public.chat_history ch
 where ch.id = u.chat_message_id
   and u.content_md5 is null;
update public.ai_usage
   set content_md5 = '',
       replied_at  = coalesce(replied_at, created_at)
 where content_md5 is null;

create or replace function public._log_ai_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.message_type = 'user' then
    insert into public.ai_usage (user_id, chat_message_id, created_at, session_id, content_md5)
    values (new.user_id, new.id, now(), new.session_id, md5(new.content))
    on conflict (chat_message_id) do nothing;
  end if;
  return null;
end
$$;
revoke all on function public._log_ai_usage() from public, anon, authenticated;

create or replace function public.ai_quota()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c_window constant interval := interval '8 hours';   -- AI_WINDOW_MS
  c_free   constant int := 5;                         -- AI_FREE_LIMIT
  c_bonus  constant int := 5;                         -- REFERRAL_REWARD.bonusAiMessages
  c_target constant int := 5;                         -- REFERRAL_TARGET
  v_uid    uuid := auth.uid();
  v_times  timestamptz[];
  v_used   int;
  v_limit  int := c_free;
  v_bonus  boolean := false;
  v_reset  timestamptz;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select coalesce(array_agg(u.created_at order by u.created_at), '{}'::timestamptz[]) into v_times
    from public.ai_usage u
   where u.user_id = v_uid and u.created_at > now() - c_window;
  v_used := coalesce(cardinality(v_times), 0);

  if public.has_premium(v_uid) then
    return jsonb_build_object('unlimited', true, 'limit', null, 'used', v_used, 'remaining', null,
                              'resets_at', null, 'window_hours', 8, 'referral_bonus', false);
  end if;

  if (select count(*) from public.referrals r where r.referrer_id = v_uid) >= c_target then
    v_limit := v_limit + c_bonus;
    v_bonus := true;
  end if;

  if v_used >= v_limit then
    v_reset := v_times[v_used - v_limit + 1] + c_window;
  elsif v_used > 0 then
    v_reset := v_times[1] + c_window;
  end if;

  return jsonb_build_object('unlimited', false, 'limit', v_limit, 'used', v_used,
                            'remaining', greatest(v_limit - v_used, 0), 'resets_at', v_reset,
                            'window_hours', 8, 'referral_bonus', v_bonus);
end
$$;

-- ai_consume(p_session, p_content) → jsonb
--   { ok: true,  retry: false, ticket }   new message stored + charged
--   { ok: true,  retry: true,  ticket }   same message again, its reply was
--                                         never delivered → not charged again
--   { ok: false, reason: 'quota', quota } free quota exhausted (nothing stored)
-- Errors: not_authenticated · invalid_argument
create or replace function public.ai_consume(p_session text, p_content text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_retry_window constant interval := interval '30 minutes';
  c_stale_claim  constant interval := interval '3 minutes';
  v_uid    uuid := auth.uid();
  v_last   public.ai_usage%rowtype;
  v_quota  jsonb;
  v_msg    uuid;
  v_ticket uuid := gen_random_uuid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_session is null or p_session !~ '^[A-Za-z0-9_-]{1,100}$' then
    raise exception 'invalid_argument' using detail = '{"field":"session"}';
  end if;
  if p_content is null or char_length(btrim(p_content)) = 0 or char_length(p_content) > 20000 then
    raise exception 'invalid_argument' using detail = '{"field":"content"}';
  end if;

  -- One decision at a time per member: parallel requests queue here, so each
  -- one sees the previous one's charge.
  perform pg_advisory_xact_lock(hashtextextended('jazira.ai:' || v_uid::text, 0));

  -- Retry of the session's latest charged message whose reply never arrived.
  select * into v_last
    from public.ai_usage u
   where u.user_id = v_uid and u.session_id = p_session
   order by u.created_at desc, u.id desc
   limit 1;
  if found
     and v_last.content_md5 = md5(p_content)
     and v_last.replied_at is null
     and v_last.created_at > now() - c_retry_window
     and (v_last.claimed_at is null or v_last.claimed_at < now() - c_stale_claim) then
    update public.ai_usage set claimed_at = now(), ticket = v_ticket where id = v_last.id;
    return jsonb_build_object('ok', true, 'retry', true, 'ticket', v_ticket);
  end if;

  v_quota := public.ai_quota();
  if not coalesce((v_quota ->> 'unlimited')::boolean, false)
     and coalesce((v_quota ->> 'remaining')::int, 0) <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'quota', 'quota', v_quota);
  end if;

  insert into public.chat_history (user_id, session_id, message_type, content)
  values (v_uid, p_session, 'user', p_content)
  returning id into v_msg;
  -- the chat_history_log_ai_usage trigger has written the ledger row
  update public.ai_usage set claimed_at = now(), ticket = v_ticket where chat_message_id = v_msg;
  return jsonb_build_object('ok', true, 'retry', false, 'ticket', v_ticket);
end
$$;

-- ai_finish(p_ticket, p_reply) → boolean (false: unknown / already finished ticket)
--   p_reply non-empty → stored as the assistant message; the charge is spent.
--   p_reply null/empty → nothing was delivered; the claim is released so a
--   retry of the same message is not charged again.
create or replace function public.ai_finish(p_ticket uuid, p_reply text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.ai_usage%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_ticket is null then
    return false;
  end if;
  select * into v_row from public.ai_usage u where u.ticket = p_ticket and u.user_id = v_uid for update;
  if not found then
    return false;
  end if;
  if p_reply is null or char_length(btrim(p_reply)) = 0 then
    update public.ai_usage set claimed_at = null, ticket = null where id = v_row.id;
    return true;
  end if;
  insert into public.chat_history (user_id, session_id, message_type, content)
  values (v_uid, coalesce(v_row.session_id, 'unknown'), 'assistant', left(p_reply, 20000));
  update public.ai_usage set replied_at = now(), ticket = null where id = v_row.id;
  return true;
end
$$;

revoke all on function public.ai_quota()                  from public, anon, authenticated;
revoke all on function public.ai_consume(text, text)      from public, anon, authenticated;
revoke all on function public.ai_finish(uuid, text)       from public, anon, authenticated;
grant execute on function public.ai_quota()               to authenticated, service_role;
grant execute on function public.ai_consume(text, text)   to authenticated, service_role;
grant execute on function public.ai_finish(uuid, text)    to authenticated, service_role;

-- ============================================================================
-- B) PAYMENTS
-- ============================================================================
alter table public.subscriptions add column if not exists provider_updated_at timestamptz;
alter table public.subscriptions add column if not exists provider_status text;
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.subscriptions'::regclass and conname = 'subscriptions_provider_status_len') then
    alter table public.subscriptions
      add constraint subscriptions_provider_status_len
      check (provider_status is null or char_length(provider_status) <= 40);
  end if;
end $$;

-- apply_payment_event(...) → 'duplicate' | 'recorded' | 'unknown_user' | 'stale' | 'applied'
--   p_event_id   per-delivery key (the route uses a hash of the signed body)
--   p_entitled   true / false = the event decides Elite; null = record only
--   p_event_at   the provider object's updated_at: older than what was
--                already applied → recorded but ignored ('stale')
-- Everything happens in the caller's transaction: if any write fails, the
-- event row is rolled back too, so the provider's retry is processed again.
create or replace function public.apply_payment_event(
  p_provider        text,
  p_event_id        text,
  p_event_type      text,
  p_raw             jsonb,
  p_user            uuid,
  p_entitled        boolean,
  p_subscription_id text,
  p_provider_status text,
  p_period_end      timestamptz,
  p_event_at        timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last timestamptz;
begin
  if p_provider is null or p_event_id is null or char_length(p_event_id) not between 1 and 200 then
    raise exception 'invalid_argument' using detail = '{"field":"event_id"}';
  end if;

  insert into public.payment_events (provider, event_id, event_type, raw)
  values (p_provider, p_event_id, left(p_event_type, 100), p_raw)
  on conflict (event_id) do nothing;
  if not found then
    return 'duplicate';
  end if;

  if p_user is null or p_entitled is null then
    return 'recorded';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user) then
    return 'unknown_user';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('jazira.pay:' || p_user::text, 0));
  select s.provider_updated_at into v_last from public.subscriptions s where s.user_id = p_user;
  if v_last is not null and p_event_at is not null and p_event_at < v_last then
    return 'stale';
  end if;

  insert into public.subscriptions as s
         (user_id, tier, status, provider, provider_subscription_id, provider_status,
          current_period_end, provider_updated_at, updated_at)
  values (p_user,
          case when p_entitled then 'elite' else 'free' end,
          case when p_entitled then 'active' else 'inactive' end,
          p_provider, p_subscription_id, left(p_provider_status, 40),
          p_period_end, p_event_at, now())
  on conflict (user_id) do update
     set tier                     = excluded.tier,
         status                   = excluded.status,
         provider                 = excluded.provider,
         provider_subscription_id = coalesce(excluded.provider_subscription_id, s.provider_subscription_id),
         provider_status          = excluded.provider_status,
         current_period_end       = excluded.current_period_end,
         provider_updated_at      = coalesce(greatest(excluded.provider_updated_at, s.provider_updated_at),
                                             excluded.provider_updated_at, s.provider_updated_at),
         updated_at               = now();

  update public.profiles set is_elite = p_entitled where id = p_user;
  return 'applied';
end
$$;
revoke all on function public.apply_payment_event(text, text, text, jsonb, uuid, boolean, text, text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.apply_payment_event(text, text, text, jsonb, uuid, boolean, text, text, timestamptz, timestamptz)
  to service_role;

-- ============================================================================
-- C) SHARED RATE LIMITS (server routes, service role only)
-- ============================================================================
create table if not exists public.rate_limits (
  bucket       text        not null check (bucket ~ '^[a-z0-9_.:-]{1,40}$'),
  key          text        not null check (char_length(key) between 1 and 128),
  window_start timestamptz not null,
  hits         int         not null default 0,
  primary key (bucket, key, window_start)
);
create index if not exists rate_limits_window_idx on public.rate_limits (window_start);
alter table public.rate_limits enable row level security;   -- no policies: service role only
revoke all on table public.rate_limits from public, anon, authenticated;

-- rate_limit_hit(bucket, key, max, window_seconds) → true when this hit is
-- allowed (≤ max hits in the current fixed window). Keys are opaque (the
-- routes hash IPs before sending them).
create or replace function public.rate_limit_hit(p_bucket text, p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz;
  v_hits  int;
begin
  if p_bucket is null or p_bucket !~ '^[a-z0-9_.:-]{1,40}$'
     or p_key is null or char_length(p_key) not between 1 and 128
     or p_max is null or p_max not between 1 and 100000
     or p_window_seconds is null or p_window_seconds not between 1 and 86400 then
    raise exception 'invalid_argument';
  end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limits as r (bucket, key, window_start, hits)
  values (p_bucket, p_key, v_start, 1)
  on conflict (bucket, key, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;
  -- opportunistic cleanup of old windows (bounded work)
  if random() < 0.02 then
    delete from public.rate_limits x
     where x.ctid in (select y.ctid from public.rate_limits y
                       where y.window_start < now() - interval '1 day' limit 500);
  end if;
  return v_hits <= p_max;
end
$$;
revoke all on function public.rate_limit_hit(text, text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, text, int, int) to service_role;

-- ============================================================================
-- D) CONTACT INBOX
-- ============================================================================
-- Only the server route (service role) writes the inbox now: it rate-limits
-- per client IP before inserting, which a direct PostgREST insert skipped.
revoke insert on table public.contact_messages from anon, authenticated;
drop policy if exists "contact_insert" on public.contact_messages;

create or replace function public._contact_messages_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_guest_hourly constant int := 60;   -- platform-wide cap for signed-out senders
  v_uid uuid := auth.uid();
  v_n   int;
begin
  new.name       := btrim(regexp_replace(coalesce(new.name, ''), '\s+', ' ', 'g'));
  new.email      := lower(btrim(coalesce(new.email, '')));
  new.message    := btrim(coalesce(new.message, ''));
  new.created_at := now();
  if new.user_id is null and v_uid is not null then
    new.user_id := v_uid;       -- signed-in senders are always attributed to their account
  end if;

  perform pg_advisory_xact_lock(hashtextextended('jazira.contact:' || new.email, 0));
  if new.user_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('jazira.contact:' || new.user_id::text, 0));
  end if;

  select count(*)::int into v_n
    from public.contact_messages m
   where m.created_at > now() - interval '1 hour'
     and (m.email = new.email or (new.user_id is not null and m.user_id = new.user_id));
  if v_n >= 3 then
    raise exception 'rate_limited' using detail = '{"limit":3,"window_minutes":60}';
  end if;

  -- Rotating the email must not open the floodgates for guests: all
  -- signed-out messages share one hourly budget.
  if new.user_id is null then
    perform pg_advisory_xact_lock(hashtextextended('jazira.contact:guests', 0));
    select count(*)::int into v_n
      from public.contact_messages m
     where m.created_at > now() - interval '1 hour'
       and m.user_id is null;
    if v_n >= c_guest_hourly then
      raise exception 'rate_limited' using detail = '{"scope":"guests","window_minutes":60}';
    end if;
  end if;
  return new;
end
$$;
revoke all on function public._contact_messages_guard() from public, anon, authenticated;

-- ============================================================================
-- E) REACTION PRIVACY + realtime
-- ============================================================================
-- Whether a member shows a profile tab. The same facts get_public_social_settings()
-- already returns to everyone; used by the SELECT policies below.
create or replace function public.social_tab_public(p_user uuid, p_tab text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_tab
           when 'likes'   then coalesce((select s.show_likes_on_profile   from public.user_social_settings s where s.user_id = p_user), true)
           when 'reposts' then coalesce((select s.show_reposts_on_profile from public.user_social_settings s where s.user_id = p_user), true)
           else false
         end
$$;
revoke all on function public.social_tab_public(uuid, text) from public;
grant execute on function public.social_tab_public(uuid, text) to anon, authenticated, service_role;

drop policy if exists "post_likes_read" on public.post_likes;
create policy "post_likes_read" on public.post_likes
  for select to anon, authenticated
  using (user_id = (select auth.uid()) or public.social_tab_public(user_id, 'likes'));

drop policy if exists "post_reposts_read" on public.post_reposts;
create policy "post_reposts_read" on public.post_reposts
  for select to anon, authenticated
  using (user_id = (select auth.uid()) or public.social_tab_public(user_id, 'reposts'));

-- "Not helpful" is nobody else's business.
drop policy if exists "post_dislikes_read" on public.post_dislikes;
create policy "post_dislikes_read" on public.post_dislikes
  for select to authenticated
  using (user_id = (select auth.uid()));

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables) then
    raise warning '0013: supabase_realtime publishes ALL TABLES — post_likes / post_dislikes / post_reposts cannot be removed from it.';
    return;
  end if;
  foreach t in array array['post_likes', 'post_dislikes', 'post_reposts'] loop
    if exists (select 1 from pg_publication_tables
                where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $$;

-- ============================================================================
-- F) #tags / @mentions: the FIRST 10 distinct ones in text order (replaces 0012)
-- ============================================================================
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
    -- same grammar and order as extractTags() in src/components/community/model.js
    v_tags := array(
      select s.t
        from (select lower(x.m[1]) as t, min(x.ord) as o
                from regexp_matches(v_text, '(?:^|\s)#([0-9A-Za-z_؀-ۿ]{2,50})', 'g') with ordinality as x (m, ord)
               group by 1) s
       order by s.o
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
    select s.t
      from (select lower(x.m[1]) as t, min(x.ord) as o
              from regexp_matches(v_text, '(?:^|\s)@([0-9A-Za-z_]{2,30})', 'g') with ordinality as x (m, ord)
             group by 1) s
     order by s.o
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

-- ============================================================================
-- G) DRIFT FIXES
-- ============================================================================
-- profiles: updated_at is owned by the profiles_set_updated_at trigger, which
-- fires after this guard (triggers run in name order), so no client ever
-- needs to send it (docs/SECURITY.md §1.4 / §4).
create or replace function public.profiles_guard_protected_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- Columns an API role may change directly. Everything else — including any
  -- column a later migration adds — is protected by default.
  v_client_writable constant text[] := array['show_elite_badge', 'anonymous_community'];
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

-- Definer RPCs from 0010 / 0012 that still ran with search_path = public.
-- Their bodies are fully schema-qualified, so only the setting changes.
alter function public.save_exam_answer(uuid, smallint, smallint, int, boolean)      set search_path = '';
alter function public.submit_exam_attempt(uuid, jsonb)                              set search_path = '';
alter function public.get_exam_attempt(uuid)                                        set search_path = '';
alter function public.list_exam_attempts(int, timestamptz, uuid)                    set search_path = '';
alter function public.mark_notifications_read(uuid[])                              set search_path = '';
alter function public.start_exam_attempt(text, text, smallint, int, int, text)      set search_path = '';
alter function public.get_exam_stats()                                              set search_path = '';
-- …and the older definer functions still on search_path = public (0001–0008).
alter function public.record_daily_activity()                                       set search_path = '';
alter function public.sync_post_counts()                                            set search_path = '';
alter function public.is_conversation_participant(uuid)                             set search_path = '';
alter function public.update_phone(text)                                            set search_path = '';
alter function public.update_bio(text)                                              set search_path = '';
alter function public.sync_hashtag_count()                                          set search_path = '';
alter function public.notify_on_follow()                                            set search_path = '';

-- ============================================================================
-- H) EXAM XP — daily cap (replaces 0010's _exam_finalize; unchanged otherwise)
-- ============================================================================
create or replace function public._exam_finalize(p_attempt uuid, p_late boolean)
returns void
language plpgsql
set search_path = ''
as $$
declare
  c_daily_xp constant int := 300;   -- exam XP per member per Asia/Riyadh day
  a          public.exam_attempts%rowtype;
  v_correct  int;
  v_total    int;
  v_answered int;
  v_score    numeric(5, 2);
  v_duration int;
  v_xp       int;
  v_today    int;
  v_awarded  int := 0;
begin
  select * into a from public.exam_attempts where id = p_attempt;
  if not found or a.status <> 'in_progress' then
    return;
  end if;

  update public.exam_attempt_items i
     set is_correct = (i.selected_index is not null
                       and i.selected_index = (select k.correct_index from public.question_keys k
                                                where k.question_id = i.question_id))
   where i.attempt_id = p_attempt;
  update public.exam_attempt_items set is_correct = false
   where attempt_id = p_attempt and is_correct is null;

  select count(*) filter (where is_correct)::int,
         count(*)::int,
         count(*) filter (where selected_index is not null)::int
    into v_correct, v_total, v_answered
    from public.exam_attempt_items where attempt_id = p_attempt;

  v_score := case when v_total > 0 then round(100.0 * v_correct / v_total, 2) else 0 end;
  v_duration := case
    when p_late then a.time_limit_seconds
    else least(greatest(0, round(extract(epoch from (now() - a.started_at))))::int, a.time_limit_seconds)
  end;
  v_xp := 2 * v_correct;   -- +2 XP per correct answer, up to the daily cap

  -- XP (as definer). Never let a profile guard/constraint fail the submission.
  if v_xp > 0 then
    begin
      perform pg_advisory_xact_lock(hashtextextended('jazira.xp:' || a.user_id::text, 0));
      select coalesce(sum(case when jsonb_typeof(x.meta -> 'xp_awarded') = 'number'
                               then (x.meta ->> 'xp_awarded')::int else 0 end), 0)::int
        into v_today
        from public.exam_attempts x
       where x.user_id = a.user_id
         and x.id <> a.id
         and x.submitted_at >= (date_trunc('day', now() at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh');
      v_xp := least(v_xp, greatest(0, c_daily_xp - v_today));
      if v_xp > 0 then
        update public.profiles set xp = xp + v_xp where id = a.user_id;
        if found then v_awarded := v_xp; end if;
      end if;
    exception when others then
      raise warning '_exam_finalize(%): xp not awarded: % (%)', p_attempt, sqlerrm, sqlstate;
      v_awarded := 0;
    end;
  end if;

  update public.exam_attempts
     set status           = case when p_late then 'expired' else 'submitted' end,
         submitted_at     = now(),
         correct_count    = v_correct,
         total            = v_total,
         score_percent    = v_score,
         duration_seconds = v_duration,
         meta             = meta || jsonb_build_object('xp_awarded', v_awarded, 'answered_count', v_answered)
   where id = p_attempt;

  -- Streak activity — only when the owner is the caller (auth.uid() based RPC).
  if auth.uid() is not distinct from a.user_id then
    begin
      perform public.record_daily_activity();
    exception when others then
      null;
    end;
  end if;

  -- In-app notification (respecting notification_preferences via the gate trigger).
  begin
    insert into public.notifications (user_id, actor_id, type, data)
    values (a.user_id, null, 'exam_result',
            jsonb_build_object('attempt_id', a.id, 'exam', a.exam, 'section', a.section,
                               'score_percent', v_score, 'correct', v_correct, 'total', v_total,
                               'status', case when p_late then 'expired' else 'submitted' end));
  exception when others then
    null;   -- type not allowed / notifications missing → the result still stands
  end;
end
$$;
revoke all on function public._exam_finalize(uuid, boolean) from public, anon, authenticated;

create index if not exists exam_attempts_user_submitted_idx
  on public.exam_attempts (user_id, submitted_at desc) where submitted_at is not null;

-- ============================================================================
-- I) SESSIONS — language-neutral device data, location split for the UI
-- ============================================================================
-- city (as the edge reports it) + ISO country code; the settings page names
-- the country in the reader's language (Intl.DisplayNames). `location` stays
-- for older clients.
alter table public.user_sessions add column if not exists city text;
alter table public.user_sessions add column if not exists country_code text;
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.user_sessions'::regclass and conname = 'user_sessions_geo_shape') then
    alter table public.user_sessions
      add constraint user_sessions_geo_shape
      check ((city is null or char_length(city) <= 100)
             and (country_code is null or country_code ~ '^[A-Z]{2}$'));
  end if;
end $$;

update public.user_sessions
   set country_code = substring(location from ',\s*([A-Z]{2})$'),
       city         = nullif(btrim(regexp_replace(location, ',\s*[A-Z]{2}$', '')), '')
 where location is not null and country_code is null and location ~ ',\s*[A-Z]{2}$'
   and char_length(btrim(regexp_replace(location, ',\s*[A-Z]{2}$', ''))) <= 100;

-- src/lib/device.js used to store Arabic UI words as values.
update public.user_sessions set os = 'unknown'          where os = 'نظام غير معروف';
update public.user_sessions set browser = 'unknown'     where browser = 'متصفح';
update public.user_sessions set device_type = 'desktop' where device_type = 'حاسوب';
update public.user_sessions set device_type = 'tablet'  where device_type = 'جهاز لوحي';
update public.user_sessions set device_type = 'mobile'  where device_type = 'جوال';

-- PostgREST: pick up the new signatures.
notify pgrst, 'reload schema';

commit;
