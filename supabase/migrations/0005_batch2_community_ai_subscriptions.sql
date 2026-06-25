-- ============================================================================
-- Batch 2 — community, interactions, reviews, AI history, subscriptions,
-- referrals, Storage policies, count triggers, and Realtime.
-- Idempotent: IF NOT EXISTS / DROP POLICY IF EXISTS / CREATE OR REPLACE.
-- Public display name is ALWAYS profiles.full_name (never display_name/email).
-- ============================================================================
begin;

-- ----------------------------------------------------------------------------
-- Community posts + interactions (ensure tables, columns, RLS)
-- ----------------------------------------------------------------------------
create table if not exists public.community_posts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  content        text,
  media_url      text,
  media_type     text check (media_type in ('image','video')),
  media_path     text,
  likes_count    int not null default 0,
  dislikes_count int not null default 0,
  comments_count int not null default 0,
  reposts_count  int not null default 0,
  created_at     timestamptz not null default now()
);
alter table public.community_posts add column if not exists media_path text;

create table if not exists public.post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);
create table if not exists public.post_dislikes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);
create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.post_reposts (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

alter table public.community_posts enable row level security;
alter table public.post_likes     enable row level security;
alter table public.post_dislikes  enable row level security;
alter table public.post_comments  enable row level security;
alter table public.post_reposts   enable row level security;

-- posts: everyone reads; only the owner writes/updates/deletes
drop policy if exists "posts_read"   on public.community_posts;
drop policy if exists "posts_insert" on public.community_posts;
drop policy if exists "posts_update" on public.community_posts;
drop policy if exists "posts_delete" on public.community_posts;
create policy "posts_read"   on public.community_posts for select using (true);
create policy "posts_insert" on public.community_posts for insert with check (auth.uid() = user_id);
create policy "posts_update" on public.community_posts for update using (auth.uid() = user_id);
create policy "posts_delete" on public.community_posts for delete using (auth.uid() = user_id);

-- Drop legacy policy names from the first community batch (avoid duplicates).
drop policy if exists "likes_read"     on public.post_likes;
drop policy if exists "likes_write"    on public.post_likes;
drop policy if exists "likes_delete"   on public.post_likes;
drop policy if exists "dislikes_read"  on public.post_dislikes;
drop policy if exists "dislikes_write" on public.post_dislikes;
drop policy if exists "dislikes_delete" on public.post_dislikes;
drop policy if exists "reposts_read"   on public.post_reposts;
drop policy if exists "reposts_write"  on public.post_reposts;
drop policy if exists "reposts_delete" on public.post_reposts;
drop policy if exists "comments_write" on public.post_comments;

-- interactions: everyone reads counts/rows; only the owner writes/removes their own
do $$
declare t text;
begin
  foreach t in array array['post_likes','post_dislikes','post_reposts'] loop
    execute format('drop policy if exists "%1$s_read" on public.%1$s;', t);
    execute format('drop policy if exists "%1$s_insert" on public.%1$s;', t);
    execute format('drop policy if exists "%1$s_delete" on public.%1$s;', t);
    execute format('create policy "%1$s_read" on public.%1$s for select using (true);', t);
    execute format('create policy "%1$s_insert" on public.%1$s for insert with check (auth.uid() = user_id);', t);
    execute format('create policy "%1$s_delete" on public.%1$s for delete using (auth.uid() = user_id);', t);
  end loop;
end $$;

drop policy if exists "comments_read"   on public.post_comments;
drop policy if exists "comments_insert" on public.post_comments;
drop policy if exists "comments_update" on public.post_comments;
drop policy if exists "comments_delete" on public.post_comments;
create policy "comments_read"   on public.post_comments for select using (true);
create policy "comments_insert" on public.post_comments for insert with check (auth.uid() = user_id);
create policy "comments_update" on public.post_comments for update using (auth.uid() = user_id);
create policy "comments_delete" on public.post_comments for delete using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Durable, race-safe interaction counts via triggers (recompute exact count)
-- ----------------------------------------------------------------------------
create or replace function public.sync_post_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  col text := TG_ARGV[0];
  pid uuid := coalesce(NEW.post_id, OLD.post_id);
begin
  execute format(
    'update public.community_posts set %I = (select count(*) from public.%I where post_id = $1) where id = $1',
    col, TG_TABLE_NAME
  ) using pid;
  return null;
end $$;

drop trigger if exists trg_likes_count    on public.post_likes;
drop trigger if exists trg_dislikes_count on public.post_dislikes;
drop trigger if exists trg_comments_count on public.post_comments;
drop trigger if exists trg_reposts_count  on public.post_reposts;

create trigger trg_likes_count    after insert or delete on public.post_likes
  for each row execute function public.sync_post_counts('likes_count');
create trigger trg_dislikes_count after insert or delete on public.post_dislikes
  for each row execute function public.sync_post_counts('dislikes_count');
create trigger trg_comments_count after insert or delete on public.post_comments
  for each row execute function public.sync_post_counts('comments_count');
create trigger trg_reposts_count  after insert or delete on public.post_reposts
  for each row execute function public.sync_post_counts('reposts_count');

-- ----------------------------------------------------------------------------
-- Reviews (ensure table + RLS incl. edit/delete own)
-- ----------------------------------------------------------------------------
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  content text,
  created_at timestamptz not null default now()
);
alter table public.reviews enable row level security;
drop policy if exists "reviews_write"  on public.reviews; -- legacy name
drop policy if exists "reviews_read"   on public.reviews;
drop policy if exists "reviews_insert" on public.reviews;
drop policy if exists "reviews_update" on public.reviews;
drop policy if exists "reviews_delete" on public.reviews;
create policy "reviews_read"   on public.reviews for select using (true);
create policy "reviews_insert" on public.reviews for insert with check (auth.uid() = user_id);
create policy "reviews_update" on public.reviews for update using (auth.uid() = user_id);
create policy "reviews_delete" on public.reviews for delete using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- AI chat history (per-user, private via RLS)
-- ----------------------------------------------------------------------------
create table if not exists public.chat_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null,
  message_type text not null check (message_type in ('user','assistant')),
  content text not null,
  tokens_used int default 0,
  created_at timestamptz not null default now()
);
create index if not exists chat_history_user_session_idx on public.chat_history (user_id, session_id, created_at);
alter table public.chat_history enable row level security;
drop policy if exists "chat_read"   on public.chat_history;
drop policy if exists "chat_insert" on public.chat_history;
drop policy if exists "chat_delete" on public.chat_history;
create policy "chat_read"   on public.chat_history for select using (auth.uid() = user_id);
create policy "chat_insert" on public.chat_history for insert with check (auth.uid() = user_id);
create policy "chat_delete" on public.chat_history for delete using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Subscriptions (source of truth) + payment events (webhook idempotency)
-- Elite is set ONLY by the verified webhook (service role), never the client.
-- ----------------------------------------------------------------------------
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'free',
  status text not null default 'inactive',
  provider text,
  provider_subscription_id text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.subscriptions add column if not exists status text not null default 'inactive';
alter table public.subscriptions add column if not exists provider text;
alter table public.subscriptions add column if not exists provider_subscription_id text;
alter table public.subscriptions add column if not exists current_period_end timestamptz;
alter table public.subscriptions enable row level security;
drop policy if exists "subs_read_own" on public.subscriptions;
create policy "subs_read_own" on public.subscriptions for select using (auth.uid() = user_id);
-- No client insert/update policy: only the service role (webhook) writes.

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text unique,
  event_type text,
  raw jsonb,
  created_at timestamptz not null default now()
);
alter table public.payment_events enable row level security;
-- No policies → only the service role can read/write (RLS denies everyone else).

-- ----------------------------------------------------------------------------
-- Referrals (ensure unique per referred account → no duplicate credit)
-- ----------------------------------------------------------------------------
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users(id) on delete cascade,
  referred_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (referrer_id <> referred_id)            -- no self-referral
);
alter table public.referrals enable row level security;
drop policy if exists "referrals_read"   on public.referrals;
drop policy if exists "referrals_insert" on public.referrals;
create policy "referrals_read" on public.referrals
  for select using (auth.uid() = referrer_id or auth.uid() = referred_id);
create policy "referrals_insert" on public.referrals
  for insert with check (auth.uid() = referred_id and referrer_id <> referred_id);

-- ----------------------------------------------------------------------------
-- Storage: post-media bucket + owner-scoped policies (fixes upload failures)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('post-media', 'post-media', true)
on conflict (id) do nothing;

drop policy if exists "post_media_public_read" on storage.objects;
create policy "post_media_public_read" on storage.objects
  for select using (bucket_id = 'post-media');

drop policy if exists "post_media_owner_insert" on storage.objects;
create policy "post_media_owner_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "post_media_owner_update" on storage.objects;
create policy "post_media_owner_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "post_media_owner_delete" on storage.objects;
create policy "post_media_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ----------------------------------------------------------------------------
-- Realtime: publish community tables so new posts/interactions stream live
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['community_posts','post_likes','post_dislikes','post_comments','post_reposts'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

commit;
