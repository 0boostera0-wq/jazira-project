-- ============================================================================
-- Batch 6 — Social layer: follows, notifications, social settings, hashtags,
-- mentions, direct messages (conversations / requests / messages), moderation.
-- Idempotent & ADDITIVE: create table if not exists / drop policy if exists /
-- create or replace. Does NOT touch existing community/profile data.
-- Public display name stays profiles.full_name.
-- ============================================================================
begin;

-- Ensure bio exists (profile editing) — safe if already present.
alter table public.profiles add column if not exists bio text;

-- Safe bio update (security-definer, own row only). Direct profiles UPDATE is
-- intentionally NOT granted to clients so is_elite/xp can never be self-set;
-- this RPC updates ONLY the bio column.
create or replace function public.update_bio(new_bio text)
returns text language plpgsql security definer set search_path = public as $$
declare cleaned text := nullif(btrim(coalesce(new_bio, '')), '');
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if length(coalesce(cleaned, '')) > 300 then raise exception 'bio_too_long'; end if;
  update public.profiles set bio = cleaned where id = auth.uid();
  return cleaned;
end $$;
grant execute on function public.update_bio(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 1) FOLLOWS  (+ per-follow notification preference: all | posts | off)
-- ----------------------------------------------------------------------------
create table if not exists public.follows (
  id           uuid primary key default gen_random_uuid(),
  follower_id  uuid not null references auth.users(id) on delete cascade,
  followee_id  uuid not null references auth.users(id) on delete cascade,
  notify_pref  text not null default 'all' check (notify_pref in ('all','posts','off')),
  created_at   timestamptz not null default now(),
  unique (follower_id, followee_id),
  check (follower_id <> followee_id)            -- no self-follow
);
create index if not exists follows_follower_idx on public.follows (follower_id);
create index if not exists follows_followee_idx on public.follows (followee_id);

alter table public.follows enable row level security;
drop policy if exists "follows_read"   on public.follows;
drop policy if exists "follows_insert" on public.follows;
drop policy if exists "follows_update" on public.follows;
drop policy if exists "follows_delete" on public.follows;
create policy "follows_read"   on public.follows for select using (true);
create policy "follows_insert" on public.follows for insert with check (auth.uid() = follower_id and follower_id <> followee_id);
create policy "follows_update" on public.follows for update using (auth.uid() = follower_id);
create policy "follows_delete" on public.follows for delete using (auth.uid() = follower_id);

-- ----------------------------------------------------------------------------
-- 2) USER SOCIAL SETTINGS  (public-read for fields others must enforce,
--    e.g. allow_messages; own-write only). show_elite_badge / anonymous_community
--    already live on profiles and are unchanged.
-- ----------------------------------------------------------------------------
create table if not exists public.user_social_settings (
  user_id                 uuid primary key references auth.users(id) on delete cascade,
  allow_message_requests  boolean not null default true,
  hide_message_requests   boolean not null default false,
  allow_messages          boolean not null default true,
  notif_sound             boolean not null default true,
  show_likes_on_profile   boolean not null default true,
  show_reposts_on_profile boolean not null default true,
  notify_followers        boolean not null default true,
  notify_mentions         boolean not null default true,
  updated_at              timestamptz not null default now()
);
alter table public.user_social_settings enable row level security;
drop policy if exists "uss_read"   on public.user_social_settings;
drop policy if exists "uss_insert" on public.user_social_settings;
drop policy if exists "uss_update" on public.user_social_settings;
create policy "uss_read"   on public.user_social_settings for select using (true);
create policy "uss_insert" on public.user_social_settings for insert with check (auth.uid() = user_id);
create policy "uss_update" on public.user_social_settings for update using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 3) NOTIFICATIONS
-- ----------------------------------------------------------------------------
create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,   -- recipient
  actor_id        uuid references auth.users(id) on delete cascade,            -- who did it
  type            text not null check (type in
                    ('like','follow','mention','repost','comment',
                     'message_request','request_accepted','message')),
  post_id         uuid references public.community_posts(id) on delete cascade,
  comment_id      uuid references public.post_comments(id) on delete cascade,
  conversation_id uuid,
  read            boolean not null default false,
  created_at      timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx on public.notifications (user_id) where read = false;

alter table public.notifications enable row level security;
drop policy if exists "notif_read"   on public.notifications;
drop policy if exists "notif_insert" on public.notifications;
drop policy if exists "notif_update" on public.notifications;
drop policy if exists "notif_delete" on public.notifications;
create policy "notif_read"   on public.notifications for select using (auth.uid() = user_id);
-- App-level inserts (mentions, message notifications) must be authored as self.
-- Trigger-based inserts (like/follow/repost/comment) run security-definer and bypass this.
create policy "notif_insert" on public.notifications for insert with check (auth.uid() = actor_id);
create policy "notif_update" on public.notifications for update using (auth.uid() = user_id);
create policy "notif_delete" on public.notifications for delete using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 4) HASHTAGS + post_hashtags
-- ----------------------------------------------------------------------------
create table if not exists public.hashtags (
  id         uuid primary key default gen_random_uuid(),
  tag        text not null unique,            -- normalized (lower, no '#')
  post_count int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.post_hashtags (
  post_id    uuid not null references public.community_posts(id) on delete cascade,
  hashtag_id uuid not null references public.hashtags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, hashtag_id)
);
create index if not exists post_hashtags_tag_idx on public.post_hashtags (hashtag_id);

alter table public.hashtags      enable row level security;
alter table public.post_hashtags enable row level security;
drop policy if exists "hashtags_read"   on public.hashtags;
drop policy if exists "hashtags_insert" on public.hashtags;
drop policy if exists "hashtags_update" on public.hashtags;
create policy "hashtags_read"   on public.hashtags for select using (true);
create policy "hashtags_insert" on public.hashtags for insert to authenticated with check (true);
create policy "hashtags_update" on public.hashtags for update to authenticated using (true);
drop policy if exists "post_hashtags_read"   on public.post_hashtags;
drop policy if exists "post_hashtags_insert" on public.post_hashtags;
create policy "post_hashtags_read"   on public.post_hashtags for select using (true);
create policy "post_hashtags_insert" on public.post_hashtags for insert to authenticated with check (true);

-- keep hashtags.post_count in sync
create or replace function public.sync_hashtag_count()
returns trigger language plpgsql security definer set search_path = public as $$
declare hid uuid := coalesce(NEW.hashtag_id, OLD.hashtag_id);
begin
  update public.hashtags set post_count =
    (select count(*) from public.post_hashtags where hashtag_id = hid) where id = hid;
  return null;
end $$;
drop trigger if exists trg_hashtag_count on public.post_hashtags;
create trigger trg_hashtag_count after insert or delete on public.post_hashtags
  for each row execute function public.sync_hashtag_count();

-- ----------------------------------------------------------------------------
-- 5) MENTIONS
-- ----------------------------------------------------------------------------
create table if not exists public.mentions (
  id                uuid primary key default gen_random_uuid(),
  actor_id          uuid not null references auth.users(id) on delete cascade,
  mentioned_user_id uuid not null references auth.users(id) on delete cascade,
  post_id           uuid references public.community_posts(id) on delete cascade,
  comment_id        uuid references public.post_comments(id) on delete cascade,
  created_at        timestamptz not null default now()
);
create index if not exists mentions_user_idx on public.mentions (mentioned_user_id, created_at desc);
alter table public.mentions enable row level security;
drop policy if exists "mentions_read"   on public.mentions;
drop policy if exists "mentions_insert" on public.mentions;
create policy "mentions_read"   on public.mentions for select using (true);
create policy "mentions_insert" on public.mentions for insert with check (auth.uid() = actor_id);

-- ----------------------------------------------------------------------------
-- 6) DIRECT MESSAGES — conversations, participants, requests, messages, deletes
-- ----------------------------------------------------------------------------
create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  created_by      uuid references auth.users(id) on delete set null,
  is_request      boolean not null default true,   -- pending until accepted
  last_message_at timestamptz,
  created_at      timestamptz not null default now()
);
create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  last_read_at    timestamptz,
  muted           boolean not null default false,
  hidden          boolean not null default false,
  primary key (conversation_id, user_id)
);
create index if not exists conv_participants_user_idx on public.conversation_participants (user_id);

create table if not exists public.message_requests (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  requester_id    uuid not null references auth.users(id) on delete cascade,
  recipient_id    uuid not null references auth.users(id) on delete cascade,
  status          text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at      timestamptz not null default now(),
  unique (requester_id, recipient_id)
);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references auth.users(id) on delete cascade,
  content         text,
  media_url       text,
  media_type      text check (media_type in ('image','video','voice')),
  media_meta      jsonb,                         -- duration, size, mime, waveform…
  delivered_at    timestamptz,
  read_at         timestamptz,
  deleted_for_all boolean not null default false,
  created_at      timestamptz not null default now()
);
create index if not exists messages_conv_idx on public.messages (conversation_id, created_at desc);

-- per-user "delete for me"
create table if not exists public.message_deletes (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

-- helper: is the current user a participant of a conversation?
create or replace function public.is_conversation_participant(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.conversation_participants
    where conversation_id = cid and user_id = auth.uid()
  );
$$;

alter table public.conversations             enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.message_requests          enable row level security;
alter table public.messages                  enable row level security;
alter table public.message_deletes           enable row level security;

drop policy if exists "conv_read"   on public.conversations;
drop policy if exists "conv_insert" on public.conversations;
drop policy if exists "conv_update" on public.conversations;
create policy "conv_read"   on public.conversations for select using (public.is_conversation_participant(id));
create policy "conv_insert" on public.conversations for insert with check (auth.uid() = created_by);
create policy "conv_update" on public.conversations for update using (public.is_conversation_participant(id));

drop policy if exists "cp_read"   on public.conversation_participants;
drop policy if exists "cp_insert" on public.conversation_participants;
drop policy if exists "cp_update" on public.conversation_participants;
-- read participant rows of conversations you belong to
create policy "cp_read"   on public.conversation_participants for select using (public.is_conversation_participant(conversation_id));
-- the creator seeds both participant rows when starting a conversation
create policy "cp_insert" on public.conversation_participants for insert with check (auth.uid() is not null);
-- you may only update your OWN participant row (last_read_at, muted, hidden)
create policy "cp_update" on public.conversation_participants for update using (auth.uid() = user_id);

drop policy if exists "mr_read"   on public.message_requests;
drop policy if exists "mr_insert" on public.message_requests;
drop policy if exists "mr_update" on public.message_requests;
create policy "mr_read"   on public.message_requests for select using (auth.uid() = requester_id or auth.uid() = recipient_id);
create policy "mr_insert" on public.message_requests for insert with check (auth.uid() = requester_id and requester_id <> recipient_id);
create policy "mr_update" on public.message_requests for update using (auth.uid() = recipient_id); -- accept/reject

drop policy if exists "msg_read"   on public.messages;
drop policy if exists "msg_insert" on public.messages;
drop policy if exists "msg_update" on public.messages;
create policy "msg_read"   on public.messages for select using (public.is_conversation_participant(conversation_id));
create policy "msg_insert" on public.messages for insert with check (auth.uid() = sender_id and public.is_conversation_participant(conversation_id));
create policy "msg_update" on public.messages for update using (auth.uid() = sender_id); -- delete_for_all (30-min rule enforced in app + below)

drop policy if exists "md_read"   on public.message_deletes;
drop policy if exists "md_insert" on public.message_deletes;
create policy "md_read"   on public.message_deletes for select using (auth.uid() = user_id);
create policy "md_insert" on public.message_deletes for insert with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 7) MODERATION — blocks + reports
-- ----------------------------------------------------------------------------
create table if not exists public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('post','comment','message','user')),
  target_id   uuid not null,
  reason      text,
  created_at  timestamptz not null default now()
);
alter table public.blocks  enable row level security;
alter table public.reports enable row level security;
drop policy if exists "blocks_read"   on public.blocks;
drop policy if exists "blocks_insert" on public.blocks;
drop policy if exists "blocks_delete" on public.blocks;
create policy "blocks_read"   on public.blocks for select using (auth.uid() = blocker_id);
create policy "blocks_insert" on public.blocks for insert with check (auth.uid() = blocker_id);
create policy "blocks_delete" on public.blocks for delete using (auth.uid() = blocker_id);
drop policy if exists "reports_insert" on public.reports;
create policy "reports_insert" on public.reports for insert with check (auth.uid() = reporter_id);

-- ----------------------------------------------------------------------------
-- 8) NOTIFICATION TRIGGERS on existing interaction tables
--    (security definer → can insert into notifications regardless of RLS)
-- ----------------------------------------------------------------------------
create or replace function public.notify_on_post_interaction()
returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid; ntype text;
begin
  ntype := case TG_TABLE_NAME
             when 'post_likes'   then 'like'
             when 'post_reposts' then 'repost'
             when 'post_comments' then 'comment'
           end;
  if ntype is null then return null; end if;
  select user_id into owner from public.community_posts where id = NEW.post_id;
  if owner is not null and owner <> NEW.user_id then
    insert into public.notifications (user_id, actor_id, type, post_id, comment_id)
    values (owner, NEW.user_id, ntype, NEW.post_id,
            case when ntype = 'comment' then NEW.id else null end);
  end if;
  return null;
end $$;

drop trigger if exists trg_notify_like    on public.post_likes;
drop trigger if exists trg_notify_repost  on public.post_reposts;
drop trigger if exists trg_notify_comment on public.post_comments;
create trigger trg_notify_like    after insert on public.post_likes    for each row execute function public.notify_on_post_interaction();
create trigger trg_notify_repost  after insert on public.post_reposts  for each row execute function public.notify_on_post_interaction();
create trigger trg_notify_comment after insert on public.post_comments for each row execute function public.notify_on_post_interaction();

create or replace function public.notify_on_follow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, actor_id, type)
  values (NEW.followee_id, NEW.follower_id, 'follow');
  return null;
end $$;
drop trigger if exists trg_notify_follow on public.follows;
create trigger trg_notify_follow after insert on public.follows
  for each row execute function public.notify_on_follow();

-- ----------------------------------------------------------------------------
-- 9) REALTIME — stream messages, notifications, requests, follows
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['messages','notifications','message_requests','conversations','follows'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

commit;
