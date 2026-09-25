-- ============================================================================
-- 0010 — Learning platform: exam engine, contact inbox, notification
-- preferences + feed RPCs, global search, server-side AI quota.
--
--   A) question_sources, questions, question_keys (never readable by clients),
--      exam_attempts, exam_attempt_items, question_bank_counts (cache)
--      RPCs: start_exam_attempt, save_exam_answer, submit_exam_attempt,
--            get_exam_attempt, list_exam_attempts, get_exam_stats,
--            get_question_bank_stats, has_premium
--   B) contact_messages (+ abuse limit trigger)
--   C) notifications: +exam_result/achievement/system types, `data` column,
--      notification_preferences (+ delivery gate), get_notifications,
--      mark_notifications_read
--   D) pg_trgm + trigram indexes, search_all
--   E) ai_usage ledger (fed by chat_history inserts) + ai_quota
--
-- Vocabulary (exam / section / topic slugs, limits) mirrors
-- src/lib/exams/catalog.js — keep both in sync (tests/db/learning.test.js
-- checks every catalog pair against the database).
--
-- Only depends on 0000–0008 objects (profiles, subscriptions, referrals,
-- chat_history, community_posts, hashtags, notifications, streaks RPC).
-- Idempotent: safe to re-run on a database that already has it.
--
-- Error contract: RPCs raise P0001 with the MESSAGE set to a stable code
-- (not_authenticated, invalid_argument, premium_required, daily_limit_reached,
-- not_enough_questions, attempt_not_found, attempt_closed, rate_limited,
-- forbidden) and, where useful, DETAIL set to a small JSON object.
-- See docs/DATA_API.md.
-- ============================================================================
begin;

-- ----------------------------------------------------------------------------
-- 0) pg_trgm — in schema `extensions` when it exists (Supabase), else public.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_trgm') then
    if exists (select 1 from pg_namespace where nspname = 'extensions') then
      create extension if not exists pg_trgm with schema extensions;
    else
      create extension if not exists pg_trgm;
    end if;
  end if;
end $$;

-- Creates `create index if not exists <name> on <table> using gin (<col> <trgm schema>.gin_trgm_ops)`
-- wherever pg_trgm was installed. Internal (migration helper only).
create or replace function public._create_trgm_index(p_index text, p_table text, p_column text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_schema text;
begin
  select n.nspname into v_schema
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pg_trgm';
  if v_schema is null then
    raise exception 'pg_trgm is not installed';
  end if;
  execute format('create index if not exists %I on %s using gin (%I %I.gin_trgm_ops)',
                 p_index, p_table, p_column, v_schema);
end
$$;
revoke all on function public._create_trgm_index(text, text, text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 1) Catalog helpers (mirror src/lib/exams/catalog.js SECTIONS)
-- ----------------------------------------------------------------------------
create or replace function public.exam_of_section(p_section text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_section in ('quantitative', 'verbal') then 'aptitude'
    when p_section in ('math', 'physics', 'chemistry', 'biology') then 'achievement'
  end
$$;

create or replace function public.exam_section_topics(p_section text)
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case p_section
    when 'quantitative' then array['arithmetic', 'fractions-percent', 'ratio-proportion', 'algebra',
                                   'geometry', 'statistics', 'data-interpretation', 'comparison']
    when 'verbal'       then array['analogy', 'sentence-completion', 'contextual-error',
                                   'odd-word-out', 'reading-comprehension']
    when 'math'         then array['algebra', 'functions', 'trigonometry', 'geometry', 'calculus',
                                   'statistics-probability', 'sequences', 'matrices']
    when 'physics'      then array['kinematics', 'forces-motion', 'energy-work', 'electricity',
                                   'waves-sound', 'optics', 'thermodynamics', 'modern-physics']
    when 'chemistry'    then array['atomic-structure', 'periodic-table', 'bonding', 'stoichiometry',
                                   'solutions', 'acids-bases', 'thermochemistry', 'organic']
    when 'biology'      then array['cells', 'genetics', 'human-body', 'plants', 'ecology',
                                   'classification-evolution', 'microbiology', 'biochemistry']
  end::text[]
$$;

-- ============================================================================
-- A) EXAM ENGINE
-- ============================================================================

-- ----------------------------------------------------------------------------
-- question_sources — provenance / licensing of every question
-- ----------------------------------------------------------------------------
create table if not exists public.question_sources (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name_ar    text not null,
  name_en    text not null,
  kind       text not null check (kind in ('original', 'licensed', 'official_public', 'user_contributed')),
  license    text,
  url        text check (url is null or url ~ '^https://'),
  notes      text,
  created_at timestamptz not null default now()
);

insert into public.question_sources (slug, name_ar, name_en, kind, license, notes)
values ('jazira-original', 'أسئلة جزيرة الأصلية', 'Jazira original items', 'original',
        'All rights reserved — original practice items authored for Jazira',
        'Original practice items written for Jazira; not copied from Qiyas/NCA papers.')
on conflict (slug) do update
  set name_ar = excluded.name_ar,
      name_en = excluded.name_en,
      kind    = excluded.kind,
      license = excluded.license;

alter table public.question_sources enable row level security;
drop policy if exists "question_sources_read" on public.question_sources;
create policy "question_sources_read" on public.question_sources
  for select to anon, authenticated using (true);
revoke all on table public.question_sources from anon, authenticated;
grant select on table public.question_sources to anon, authenticated;

-- ----------------------------------------------------------------------------
-- questions — stems + choices (NO answers here)
-- ----------------------------------------------------------------------------
create table if not exists public.questions (
  id                 uuid primary key default gen_random_uuid(),
  key                text not null unique check (key ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  exam               text not null check (exam in ('aptitude', 'achievement')),
  section            text not null,
  topic              text not null,
  difficulty         smallint not null check (difficulty between 1 and 3),
  stem               text not null check (char_length(btrim(stem)) between 1 and 4000),
  passage            text check (passage is null or char_length(passage) <= 8000),
  choices            jsonb not null,
  time_limit_seconds int not null default 60 check (time_limit_seconds between 10 and 600),
  tags               text[] not null default '{}',
  source_id          uuid references public.question_sources (id) on delete set null,
  source_ref         text,
  year               int check (year is null or year between 1950 and 2100),
  language           text not null default 'ar' check (language in ('ar', 'en')),
  is_premium         boolean not null default false,
  is_active          boolean not null default true,
  random_key         double precision not null default random(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint questions_section_matches_exam check (public.exam_of_section(section) = exam),
  constraint questions_topic_in_section     check (topic = any (public.exam_section_topics(section))),
  -- 2..6 non-empty strings
  constraint questions_choices_shape check (
    case when jsonb_typeof(choices) = 'array'
         then jsonb_array_length(choices) between 2 and 6
              and not jsonb_path_exists(choices, '$[*] ? (@.type() != "string" || @ == "")')
         else false end)
);

-- Random selection: `random_key >= r order by random_key limit n` (+ wrap-around)
-- must be an index range scan for every filter combination the builder offers.
create index if not exists questions_pick_esd_idx on public.questions (exam, section, difficulty, random_key) where is_active;
create index if not exists questions_pick_es_idx  on public.questions (exam, section, random_key) where is_active;
create index if not exists questions_pick_ed_idx  on public.questions (exam, difficulty, random_key) where is_active;
create index if not exists questions_pick_e_idx   on public.questions (exam, random_key) where is_active;
create index if not exists questions_random_key_idx on public.questions (random_key);
create index if not exists questions_tags_idx     on public.questions using gin (tags);
create index if not exists questions_source_idx   on public.questions (source_id);
select public._create_trgm_index('questions_stem_trgm_idx', 'public.questions', 'stem');

drop trigger if exists questions_set_updated_at on public.questions;
create trigger questions_set_updated_at
  before update on public.questions
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- question_keys — the answer key. No client role has ANY privilege; keys
-- leave the database only inside submit_exam_attempt / get_exam_attempt.
-- ----------------------------------------------------------------------------
create table if not exists public.question_keys (
  question_id   uuid primary key references public.questions (id) on delete cascade,
  correct_index smallint not null check (correct_index between 0 and 5),
  explanation   text not null check (char_length(btrim(explanation)) between 1 and 8000)
);
alter table public.question_keys enable row level security;   -- and deliberately no policies
revoke all on table public.question_keys from public, anon, authenticated;

-- correct_index must point at an existing choice (checked at commit, so a
-- seed may update choices and keys in either order inside one transaction).
create or replace function public._check_question_key()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'question_keys' then
    if exists (select 1 from public.questions q
                where q.id = new.question_id
                  and new.correct_index >= jsonb_array_length(q.choices)) then
      raise exception 'question_key_out_of_range' using errcode = '23514';
    end if;
  else
    if exists (select 1 from public.question_keys k
                where k.question_id = new.id
                  and k.correct_index >= jsonb_array_length(new.choices)) then
      raise exception 'question_key_out_of_range' using errcode = '23514';
    end if;
  end if;
  return null;
end
$$;
revoke all on function public._check_question_key() from public, anon, authenticated;

drop trigger if exists question_keys_in_range on public.question_keys;
create constraint trigger question_keys_in_range
  after insert or update on public.question_keys
  deferrable initially deferred
  for each row execute function public._check_question_key();
drop trigger if exists questions_keys_in_range on public.questions;
create constraint trigger questions_keys_in_range
  after update of choices on public.questions
  deferrable initially deferred
  for each row execute function public._check_question_key();

-- ----------------------------------------------------------------------------
-- has_premium(uid) — Elite flag or an active elite subscription.
-- Answers only for the caller (or for server roles); other users → false.
-- ----------------------------------------------------------------------------
create or replace function public.has_premium(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_uid is null then false
    when p_uid is distinct from auth.uid()
         and coalesce(auth.role(), '') in ('anon', 'authenticated') then false
    else coalesce((select p.is_elite from public.profiles p where p.id = p_uid), false)
         or exists (select 1
                      from public.subscriptions s
                     where s.user_id = p_uid
                       and s.tier = 'elite'
                       and s.status = 'active'
                       and (s.current_period_end is null or s.current_period_end > now()))
  end
$$;
revoke all on function public.has_premium(uuid) from public, anon, authenticated;
grant execute on function public.has_premium(uuid) to anon, authenticated, service_role;

alter table public.questions enable row level security;
drop policy if exists "questions_read" on public.questions;
create policy "questions_read" on public.questions
  for select to anon, authenticated
  using (is_active and (not is_premium or (select public.has_premium((select auth.uid())))));
revoke all on table public.questions from anon, authenticated;
grant select on table public.questions to anon, authenticated;

-- ----------------------------------------------------------------------------
-- question_bank_counts — tiny cache behind get_question_bank_stats(), so the
-- public counts never scan a large questions table. Refreshed per statement.
-- ----------------------------------------------------------------------------
create table if not exists public.question_bank_counts (
  exam          text not null,
  section       text not null,
  topic         text not null,
  difficulty    smallint not null,
  free_count    int not null default 0,
  premium_count int not null default 0,
  primary key (exam, section, topic, difficulty)
);
alter table public.question_bank_counts enable row level security;   -- no policies: RPC only
revoke all on table public.question_bank_counts from public, anon, authenticated;

create or replace function public._refresh_question_bank_counts_now()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.question_bank_counts where true;
  insert into public.question_bank_counts (exam, section, topic, difficulty, free_count, premium_count)
  select q.exam, q.section, q.topic, q.difficulty,
         count(*) filter (where not q.is_premium),
         count(*) filter (where q.is_premium)
    from public.questions q
   where q.is_active
   group by q.exam, q.section, q.topic, q.difficulty;
end
$$;
revoke all on function public._refresh_question_bank_counts_now() from public, anon, authenticated;

create or replace function public._refresh_question_bank_counts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._refresh_question_bank_counts_now();
  return null;
end
$$;
revoke all on function public._refresh_question_bank_counts() from public, anon, authenticated;

drop trigger if exists questions_refresh_bank_counts on public.questions;
create trigger questions_refresh_bank_counts
  after insert or update or delete or truncate on public.questions
  for each statement execute function public._refresh_question_bank_counts();

-- ----------------------------------------------------------------------------
-- exam_attempts / exam_attempt_items — written ONLY by the RPCs below.
-- ----------------------------------------------------------------------------
create table if not exists public.exam_attempts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  exam               text not null check (exam in ('aptitude', 'achievement')),
  section            text,                                   -- null = mixed sections
  difficulty         smallint check (difficulty is null or difficulty between 1 and 3), -- null = mixed
  question_count     int not null check (question_count between 1 and 100),
  time_limit_seconds int not null check (time_limit_seconds between 60 and 14400),
  status             text not null default 'in_progress'
                     check (status in ('in_progress', 'submitted', 'expired', 'abandoned')),
  started_at         timestamptz not null default now(),
  expires_at         timestamptz not null,
  submitted_at       timestamptz,
  correct_count      int check (correct_count is null or correct_count >= 0),
  total              int check (total is null or total >= 0),
  score_percent      numeric(5, 2) check (score_percent is null or score_percent between 0 and 100),
  duration_seconds   int check (duration_seconds is null or duration_seconds >= 0),
  meta               jsonb not null default '{}'::jsonb,
  constraint exam_attempts_section_check check (section is null or public.exam_of_section(section) = exam),
  constraint exam_attempts_expiry_check  check (expires_at > started_at)
);
create index if not exists exam_attempts_user_started_idx on public.exam_attempts (user_id, started_at desc, id desc);
create index if not exists exam_attempts_open_idx on public.exam_attempts (user_id, expires_at) where status = 'in_progress';

create table if not exists public.exam_attempt_items (
  attempt_id         uuid not null references public.exam_attempts (id) on delete cascade,
  position           smallint not null check (position between 1 and 100),   -- 1-based
  question_id        uuid not null references public.questions (id),
  selected_index     smallint check (selected_index is null or selected_index between 0 and 5),
  is_correct         boolean,                                  -- null until graded
  time_spent_seconds int not null default 0 check (time_spent_seconds between 0 and 14400),
  flagged            boolean not null default false,
  answered_at        timestamptz,
  primary key (attempt_id, position),
  unique (attempt_id, question_id)
);
create index if not exists exam_attempt_items_question_idx on public.exam_attempt_items (question_id);

alter table public.exam_attempts      enable row level security;
alter table public.exam_attempt_items enable row level security;

drop policy if exists "exam_attempts_read_own" on public.exam_attempts;
create policy "exam_attempts_read_own" on public.exam_attempts
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "exam_attempt_items_read_own" on public.exam_attempt_items;
create policy "exam_attempt_items_read_own" on public.exam_attempt_items
  for select to authenticated
  using (exists (select 1 from public.exam_attempts a
                  where a.id = attempt_id and a.user_id = (select auth.uid())));

revoke all on table public.exam_attempts, public.exam_attempt_items from anon, authenticated;
grant select on table public.exam_attempts, public.exam_attempt_items to authenticated;

-- ----------------------------------------------------------------------------
-- Internal exam helpers (not callable by clients)
-- ----------------------------------------------------------------------------

-- Pick up to p_limit active question ids in random_key order, starting at
-- p_from (upward) or below it (wrap-around). Dynamic SQL so each filter
-- combination gets a plan that range-scans the matching questions_pick_* index.
create or replace function public._exam_pick(
  p_exam       text,
  p_section    text,
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
  if p_difficulty is not null then v_sql := v_sql || ' and q.difficulty = $3'; end if;
  if not coalesce(p_premium, false) then v_sql := v_sql || ' and not q.is_premium'; end if;
  v_sql := v_sql || case when p_upward then ' and q.random_key >= $4' else ' and q.random_key < $4' end;
  if coalesce(cardinality(p_exclude), 0) > 0 then v_sql := v_sql || ' and q.id <> all ($5)'; end if;
  v_sql := v_sql || ' order by q.random_key limit $6) s';
  execute v_sql into v_ids using p_exam, p_section, p_difficulty, p_from, p_exclude, p_limit;
  return coalesce(v_ids, '{}'::uuid[]);
end
$$;

-- Questions of an attempt WITHOUT answer keys.
create or replace function public._exam_questions_json(p_attempt uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'position', i.position,
           'id', q.id,
           'stem', q.stem,
           'passage', q.passage,
           'choices', q.choices,
           'section', q.section,
           'topic', q.topic,
           'difficulty', q.difficulty,
           'time_limit_seconds', q.time_limit_seconds
         ) order by i.position), '[]'::jsonb)
    from public.exam_attempt_items i
    join public.questions q on q.id = i.question_id
   where i.attempt_id = p_attempt
$$;

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

-- Graded result (keys + explanations). Only for submitted/expired attempts.
create or replace function public._exam_result(p_attempt uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'mode', 'db',
    'status', a.status,
    'attempt', public._exam_attempt_json(a.id),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'position', i.position,
               'question_id', i.question_id,
               'stem', q.stem,
               'passage', q.passage,
               'choices', q.choices,
               'selected_index', i.selected_index,
               'correct_index', k.correct_index,
               'is_correct', coalesce(i.is_correct, false),
               'explanation', k.explanation,
               'section', q.section,
               'topic', q.topic,
               'difficulty', q.difficulty,
               'time_spent_seconds', i.time_spent_seconds,
               'flagged', i.flagged
             ) order by i.position)
        from public.exam_attempt_items i
        join public.questions q on q.id = i.question_id
        left join public.question_keys k on k.question_id = i.question_id
       where i.attempt_id = a.id), '[]'::jsonb),
    'by_topic', coalesce((
      select jsonb_agg(jsonb_build_object('section', t.section, 'topic', t.topic,
                                          'correct', t.correct, 'total', t.total)
                       order by t.section, t.topic)
        from (select q.section, q.topic,
                     count(*) filter (where i.is_correct)::int as correct,
                     count(*)::int as total
                from public.exam_attempt_items i
                join public.questions q on q.id = i.question_id
               where i.attempt_id = a.id
               group by q.section, q.topic) t), '[]'::jsonb)
  )
  from public.exam_attempts a
  where a.id = p_attempt
    and a.status in ('submitted', 'expired')
$$;

-- Grade + close an in_progress attempt the caller has locked (FOR UPDATE).
-- p_late → status 'expired' (answers saved before the deadline still count).
-- Side effects never fail the grading: XP, streak activity, notification.
create or replace function public._exam_finalize(p_attempt uuid, p_late boolean)
returns void
language plpgsql
set search_path = ''
as $$
declare
  a          public.exam_attempts%rowtype;
  v_correct  int;
  v_total    int;
  v_answered int;
  v_score    numeric(5, 2);
  v_duration int;
  v_xp       int;
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
  v_xp := 2 * v_correct;   -- +2 XP per correct answer

  -- XP (as definer). Never let a profile guard/constraint fail the submission.
  if v_xp > 0 then
    begin
      update public.profiles set xp = xp + v_xp where id = a.user_id;
      if found then v_awarded := v_xp; end if;
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

-- Close every overdue in_progress attempt of a user (called lazily).
create or replace function public._exam_expire_stale(p_uid uuid)
returns int
language plpgsql
set search_path = ''
as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select a.id from public.exam_attempts a
     where a.user_id = p_uid
       and a.status = 'in_progress'
       and a.expires_at < now() - interval '30 seconds'      -- sargable on exam_attempts_open_idx
     order by a.started_at
     for update skip locked
  loop
    perform public._exam_finalize(r.id, true);
    n := n + 1;
  end loop;
  return n;
end
$$;

revoke all on function public._exam_pick(text, text, smallint, boolean, double precision, boolean, uuid[], int) from public, anon, authenticated;
revoke all on function public._exam_questions_json(uuid) from public, anon, authenticated;
revoke all on function public._exam_attempt_json(uuid)   from public, anon, authenticated;
revoke all on function public._exam_result(uuid)         from public, anon, authenticated;
revoke all on function public._exam_finalize(uuid, boolean) from public, anon, authenticated;
revoke all on function public._exam_expire_stale(uuid)   from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- start_exam_attempt
-- ----------------------------------------------------------------------------
create or replace function public.start_exam_attempt(
  p_exam               text,
  p_section            text     default null,
  p_difficulty         smallint default null,
  p_count              int      default 10,
  p_time_limit_seconds int      default null
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
  v_uid        uuid := auth.uid();
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
  if p_section is not null and public.exam_of_section(p_section) is distinct from p_exam then
    raise exception 'invalid_argument' using detail = '{"field":"section"}';
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

  v_picked := public._exam_pick(p_exam, p_section, p_difficulty, v_premium, v_r, true, v_recent, p_count);
  if cardinality(v_picked) < p_count then
    v_picked := v_picked || public._exam_pick(p_exam, p_section, p_difficulty, v_premium, v_r, false,
                                              v_recent, p_count - cardinality(v_picked));
  end if;
  if cardinality(v_picked) < p_count and cardinality(v_recent) > 0 then
    v_picked := v_picked || public._exam_pick(p_exam, p_section, p_difficulty, v_premium, v_r, true,
                                              v_picked, p_count - cardinality(v_picked));
    if cardinality(v_picked) < p_count then
      v_picked := v_picked || public._exam_pick(p_exam, p_section, p_difficulty, v_premium, v_r, false,
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

  insert into public.exam_attempts (user_id, exam, section, difficulty, question_count, time_limit_seconds,
                                    status, started_at, expires_at, meta)
  values (v_uid, p_exam, p_section, p_difficulty, v_n, v_time, 'in_progress', v_now,
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
    'section', p_section,
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

-- ----------------------------------------------------------------------------
-- save_exam_answer — one answer; p_selected null clears; p_flagged null keeps.
-- p_time_spent is the cumulative seconds on that question (kept monotonic).
-- ----------------------------------------------------------------------------
create or replace function public.save_exam_answer(
  p_attempt    uuid,
  p_position   smallint,
  p_selected   smallint,
  p_time_spent int     default 0,
  p_flagged    boolean default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  a          public.exam_attempts%rowtype;
  v_nchoices int;
  r          public.exam_attempt_items%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_attempt is null then
    raise exception 'invalid_argument' using detail = '{"field":"attempt"}';
  end if;
  if p_position is null then
    raise exception 'invalid_argument' using detail = '{"field":"position"}';
  end if;
  if p_time_spent is not null and p_time_spent not between 0 and 14400 then
    raise exception 'invalid_argument' using detail = '{"field":"time_spent"}';
  end if;

  select * into a from public.exam_attempts where id = p_attempt and user_id = v_uid for update;
  if not found then
    raise exception 'attempt_not_found';
  end if;
  if a.status <> 'in_progress' then
    raise exception 'attempt_closed' using detail = json_build_object('status', a.status)::text;
  end if;
  if now() > a.expires_at + interval '30 seconds' then
    raise exception 'attempt_closed' using detail = '{"status":"expired"}';
  end if;

  select jsonb_array_length(q.choices) into v_nchoices
    from public.exam_attempt_items i join public.questions q on q.id = i.question_id
   where i.attempt_id = p_attempt and i.position = p_position;
  if v_nchoices is null then
    raise exception 'invalid_argument' using detail = '{"field":"position"}';
  end if;
  if p_selected is not null and (p_selected < 0 or p_selected >= v_nchoices) then
    raise exception 'invalid_argument' using detail = '{"field":"selected"}';
  end if;

  update public.exam_attempt_items
     set selected_index     = p_selected,
         answered_at        = case when p_selected is null then null else now() end,
         time_spent_seconds = greatest(time_spent_seconds, least(coalesce(p_time_spent, 0), a.time_limit_seconds)),
         flagged            = coalesce(p_flagged, flagged)
   where attempt_id = p_attempt and position = p_position
  returning * into r;

  return jsonb_build_object(
    'attempt_id', p_attempt,
    'position', r.position,
    'selected_index', r.selected_index,
    'flagged', r.flagged,
    'time_spent_seconds', r.time_spent_seconds,
    'saved_at', now(),
    'seconds_remaining', greatest(0, ceil(extract(epoch from (a.expires_at - now()))))::int
  );
end
$$;

-- ----------------------------------------------------------------------------
-- submit_exam_attempt — optional bulk save, grade, close. Idempotent.
--   p_answers: [{position, selected_index?, time_spent_seconds?, flagged?}]
--   (a missing selected_index key keeps the saved answer; null clears it)
-- ----------------------------------------------------------------------------
create or replace function public.submit_exam_attempt(p_attempt uuid, p_answers jsonb default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  a       public.exam_attempts%rowtype;
  v_late  boolean;
  el      jsonb;
  v_pos   int;
  v_sel   int;
  v_ts    int;
  v_n     int;
  v_seen  int[] := '{}'::int[];
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_attempt is null then
    raise exception 'invalid_argument' using detail = '{"field":"attempt"}';
  end if;

  select * into a from public.exam_attempts where id = p_attempt and user_id = v_uid for update;
  if not found then
    raise exception 'attempt_not_found';
  end if;
  if a.status in ('submitted', 'expired') then
    return public._exam_result(p_attempt);           -- idempotent: stored result, no new XP
  end if;
  if a.status <> 'in_progress' then
    raise exception 'attempt_closed' using detail = json_build_object('status', a.status)::text;
  end if;

  v_late := now() > a.expires_at + interval '30 seconds';

  if p_answers is not null and jsonb_typeof(p_answers) <> 'null' then
    if jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) > 100 then
      raise exception 'invalid_argument' using detail = '{"field":"answers"}';
    end if;
    -- validate everything first (no partial writes)
    for el in select value from jsonb_array_elements(p_answers) loop
      if jsonb_typeof(el) <> 'object'
         or jsonb_typeof(el -> 'position') is distinct from 'number'
         or (el ->> 'position')::numeric <> trunc((el ->> 'position')::numeric)
         or (el ->> 'position')::numeric not between 1 and 100 then
        raise exception 'invalid_argument' using detail = '{"field":"answers.position"}';
      end if;
      v_pos := (el ->> 'position')::numeric::int;
      if v_pos = any (v_seen) then
        raise exception 'invalid_argument' using detail = '{"field":"answers.position","reason":"duplicate"}';
      end if;
      v_seen := v_seen || v_pos;
      select jsonb_array_length(q.choices) into v_n
        from public.exam_attempt_items i join public.questions q on q.id = i.question_id
       where i.attempt_id = p_attempt and i.position = v_pos;
      if v_n is null then
        raise exception 'invalid_argument' using detail = '{"field":"answers.position"}';
      end if;
      if el ? 'selected_index' and jsonb_typeof(el -> 'selected_index') <> 'null' then
        if jsonb_typeof(el -> 'selected_index') <> 'number'
           or (el ->> 'selected_index')::numeric <> trunc((el ->> 'selected_index')::numeric)
           or (el ->> 'selected_index')::numeric < 0
           or (el ->> 'selected_index')::numeric >= v_n then
          raise exception 'invalid_argument' using detail = '{"field":"answers.selected_index"}';
        end if;
      end if;
      if el ? 'time_spent_seconds' and jsonb_typeof(el -> 'time_spent_seconds') <> 'null' then
        if jsonb_typeof(el -> 'time_spent_seconds') <> 'number'
           or (el ->> 'time_spent_seconds')::numeric <> trunc((el ->> 'time_spent_seconds')::numeric)
           or (el ->> 'time_spent_seconds')::numeric not between 0 and 14400 then
          raise exception 'invalid_argument' using detail = '{"field":"answers.time_spent_seconds"}';
        end if;
      end if;
      if el ? 'flagged' and jsonb_typeof(el -> 'flagged') not in ('boolean', 'null') then
        raise exception 'invalid_argument' using detail = '{"field":"answers.flagged"}';
      end if;
    end loop;

    -- answers arriving after the deadline (+30 s grace) are ignored
    if not v_late then
      for el in select value from jsonb_array_elements(p_answers) loop
        v_pos := (el ->> 'position')::numeric::int;
        v_sel := case when jsonb_typeof(el -> 'selected_index') = 'number'
                      then (el ->> 'selected_index')::numeric::int end;
        v_ts  := case when jsonb_typeof(el -> 'time_spent_seconds') = 'number'
                      then (el ->> 'time_spent_seconds')::numeric::int end;
        update public.exam_attempt_items
           set selected_index     = case when el ? 'selected_index' then v_sel else selected_index end,
               answered_at        = case when not (el ? 'selected_index') then answered_at
                                         when v_sel is null then null
                                         else coalesce(answered_at, now()) end,
               time_spent_seconds = greatest(time_spent_seconds, least(coalesce(v_ts, 0), a.time_limit_seconds)),
               flagged            = case when jsonb_typeof(el -> 'flagged') = 'boolean'
                                         then (el ->> 'flagged')::boolean else flagged end
         where attempt_id = p_attempt and position = v_pos;
      end loop;
    end if;
  end if;

  perform public._exam_finalize(p_attempt, v_late);
  return public._exam_result(p_attempt);
end
$$;

-- ----------------------------------------------------------------------------
-- get_exam_attempt — resume (no keys) or review (graded result)
-- ----------------------------------------------------------------------------
create or replace function public.get_exam_attempt(p_attempt uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  a     public.exam_attempts%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_attempt is null then
    raise exception 'invalid_argument' using detail = '{"field":"attempt"}';
  end if;

  select * into a from public.exam_attempts where id = p_attempt and user_id = v_uid for update;
  if not found then
    raise exception 'attempt_not_found';
  end if;

  if a.status = 'in_progress' and now() > a.expires_at + interval '30 seconds' then
    perform public._exam_finalize(p_attempt, true);
    select * into a from public.exam_attempts where id = p_attempt;
  end if;

  if a.status in ('submitted', 'expired') then
    return public._exam_result(p_attempt);
  end if;

  return jsonb_build_object(
    'mode', 'db',
    'status', a.status,
    'attempt', public._exam_attempt_json(p_attempt),
    'questions', case when a.status = 'in_progress' then public._exam_questions_json(p_attempt) else '[]'::jsonb end,
    'answers', coalesce((
      select jsonb_agg(jsonb_build_object('position', i.position,
                                          'selected_index', i.selected_index,
                                          'flagged', i.flagged,
                                          'time_spent_seconds', i.time_spent_seconds) order by i.position)
        from public.exam_attempt_items i where i.attempt_id = p_attempt), '[]'::jsonb),
    'seconds_remaining', greatest(0, ceil(extract(epoch from (a.expires_at - now()))))::int,
    'server_now', now()
  );
end
$$;

-- ----------------------------------------------------------------------------
-- list_exam_attempts — own attempts, newest first, keyset pagination on
-- (started_at, id): pass the last row's started_at (+ id to break ties).
-- ----------------------------------------------------------------------------
create or replace function public.list_exam_attempts(
  p_limit     int         default 20,
  p_before    timestamptz default null,
  p_before_id uuid        default null
)
returns table (
  id                 uuid,
  exam               text,
  section            text,
  difficulty         smallint,
  status             text,
  question_count     int,
  time_limit_seconds int,
  started_at         timestamptz,
  expires_at         timestamptz,
  submitted_at       timestamptz,
  correct_count      int,
  total              int,
  score_percent      numeric,
  duration_seconds   int,
  xp_awarded         int
)
language plpgsql
volatile
security definer
set search_path = public
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

  perform public._exam_expire_stale(v_uid);

  return query
  select a.id, a.exam, a.section, a.difficulty, a.status, a.question_count, a.time_limit_seconds,
         a.started_at, a.expires_at, a.submitted_at, a.correct_count, a.total, a.score_percent,
         a.duration_seconds, coalesce((a.meta ->> 'xp_awarded')::int, 0)
    from public.exam_attempts a
   where a.user_id = v_uid
     and (p_before is null
          or a.started_at < p_before
          or (p_before_id is not null and a.started_at = p_before and a.id < p_before_id))
   order by a.started_at desc, a.id desc
   limit p_limit;
end
$$;

-- ----------------------------------------------------------------------------
-- get_exam_stats — own analytics (graded attempts only; Asia/Riyadh days)
-- ----------------------------------------------------------------------------
create or replace function public.get_exam_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v       jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

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
    'by_topic', coalesce((select jsonb_agg(jsonb_build_object(
                   'section', section, 'topic', topic, 'total', total, 'answered', answered,
                   'correct', correct, 'accuracy', round(100.0 * correct / nullif(total, 0), 1))
                   order by section, topic) from topic_rows), '[]'::jsonb),
    'trend', jsonb_build_object(
      'windows', (select jsonb_object_agg(name, jsonb_build_object(
                     'attempts', attempts, 'total', total, 'correct', correct,
                     'accuracy', round(100.0 * correct / nullif(total, 0), 1))) from win),
      'daily', coalesce((select jsonb_agg(jsonb_build_object(
                  'day', day, 'attempts', attempts, 'total', total, 'correct', correct,
                  'accuracy', round(100.0 * correct / nullif(total, 0), 1)) order by day) from daily), '[]'::jsonb)
    ),
    'best_topics', coalesce((select jsonb_agg(x order by (x ->> 'accuracy')::numeric desc, x ->> 'topic')
                               from (select jsonb_build_object('section', section, 'topic', topic, 'total', total,
                                              'correct', correct, 'accuracy', round(100.0 * correct / total, 1)) as x
                                       from topic_rows where total >= 3
                                      order by (1.0 * correct / total) desc, topic limit 3) b), '[]'::jsonb),
    'weakest_topics', coalesce((select jsonb_agg(x order by (x ->> 'accuracy')::numeric, x ->> 'topic')
                                  from (select jsonb_build_object('section', section, 'topic', topic, 'total', total,
                                                 'correct', correct, 'accuracy', round(100.0 * correct / total, 1)) as x
                                          from topic_rows where total >= 3
                                         order by (1.0 * correct / total), topic limit 3) w), '[]'::jsonb)
  ) into v;

  return v;
end
$$;

-- ----------------------------------------------------------------------------
-- get_question_bank_stats — public counts only (never content)
-- ----------------------------------------------------------------------------
create or replace function public.get_question_bank_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'total',   coalesce(sum(c.free_count + c.premium_count), 0)::int,
    'free',    coalesce(sum(c.free_count), 0)::int,
    'premium', coalesce(sum(c.premium_count), 0)::int,
    'by_exam', coalesce((select jsonb_agg(jsonb_build_object('exam', e.exam, 'free', e.f, 'premium', e.p) order by e.exam)
                           from (select exam, sum(free_count)::int f, sum(premium_count)::int p
                                   from public.question_bank_counts group by exam) e), '[]'::jsonb),
    'by_section', coalesce((select jsonb_agg(jsonb_build_object('exam', s.exam, 'section', s.section,
                                                               'free', s.f, 'premium', s.p) order by s.exam, s.section)
                              from (select exam, section, sum(free_count)::int f, sum(premium_count)::int p
                                      from public.question_bank_counts group by exam, section) s), '[]'::jsonb),
    'by_difficulty', coalesce((select jsonb_agg(jsonb_build_object('exam', d.exam, 'section', d.section,
                                                                  'difficulty', d.difficulty, 'free', d.f, 'premium', d.p)
                                                order by d.exam, d.section, d.difficulty)
                                 from (select exam, section, difficulty, sum(free_count)::int f, sum(premium_count)::int p
                                         from public.question_bank_counts group by exam, section, difficulty) d), '[]'::jsonb),
    'by_topic', coalesce((select jsonb_agg(jsonb_build_object('exam', t.exam, 'section', t.section, 'topic', t.topic,
                                                             'free', t.f, 'premium', t.p) order by t.exam, t.section, t.topic)
                            from (select exam, section, topic, sum(free_count)::int f, sum(premium_count)::int p
                                    from public.question_bank_counts group by exam, section, topic) t), '[]'::jsonb)
  )
  from public.question_bank_counts c
$$;

-- ============================================================================
-- B) CONTACT
-- ============================================================================
create table if not exists public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users (id) on delete set null,
  name       text not null check (char_length(btrim(name)) between 2 and 80 and name !~ '[[:cntrl:]]'),
  email      text not null check (char_length(email) <= 254
                                  and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'),
  topic      text not null check (topic in ('general', 'technical', 'billing', 'content', 'partnership', 'other')),
  message    text not null check (char_length(btrim(message)) between 10 and 4000),
  locale     text not null default 'ar' check (locale in ('ar', 'en')),
  status     text not null default 'new' check (status in ('new', 'in_progress', 'resolved', 'spam')),
  created_at timestamptz not null default now()
);
create index if not exists contact_messages_email_idx on public.contact_messages (email, created_at desc);
create index if not exists contact_messages_user_idx  on public.contact_messages (user_id, created_at desc) where user_id is not null;

alter table public.contact_messages enable row level security;
drop policy if exists "contact_insert" on public.contact_messages;
create policy "contact_insert" on public.contact_messages
  for insert to anon, authenticated
  with check ((user_id is null or user_id = (select auth.uid())) and status = 'new');
-- write-only inbox: no select/update/delete for clients (read by the team with the service role)
revoke all on table public.contact_messages from anon, authenticated;
grant insert on table public.contact_messages to anon, authenticated;

-- Normalise + stamp + abuse limit: more than 3 messages per hour from the same
-- email or the same account → 'rate_limited'.
create or replace function public._contact_messages_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
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
  return new;
end
$$;
revoke all on function public._contact_messages_guard() from public, anon, authenticated;

drop trigger if exists contact_messages_guard on public.contact_messages;
create trigger contact_messages_guard
  before insert on public.contact_messages
  for each row execute function public._contact_messages_guard();

-- ============================================================================
-- C) NOTIFICATIONS
-- ============================================================================
alter table public.notifications add column if not exists data jsonb not null default '{}'::jsonb;

-- Extend the type list. Rebuilt as the UNION of whatever the current check
-- allows (0008 or a later migration) and the new types, so re-runs and other
-- migrations' additions are preserved.
do $$
declare
  v_types text[] := array['like', 'follow', 'mention', 'repost', 'comment',
                          'message_request', 'request_accepted', 'message',
                          'exam_result', 'achievement', 'system'];
  r record;
  m text[];
begin
  for r in
    select c.conname, pg_get_constraintdef(c.oid) as def
      from pg_constraint c
     where c.conrelid = 'public.notifications'::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ~ '\mtype\M'
  loop
    for m in select regexp_matches(r.def, '''([a-z_]+)''', 'g') loop
      if not (m[1] = any (v_types)) then
        v_types := v_types || m[1];
      end if;
    end loop;
    execute format('alter table public.notifications drop constraint %I', r.conname);
  end loop;
  execute format('alter table public.notifications add constraint notifications_type_check check (type in (%s))',
                 (select string_agg(quote_literal(t), ', ') from unnest(v_types) t));
end $$;

create table if not exists public.notification_preferences (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  likes           boolean not null default true,    -- like, repost
  comments        boolean not null default true,    -- comment
  follows         boolean not null default true,    -- follow
  mentions        boolean not null default true,    -- mention
  messages        boolean not null default true,    -- message, message_request, request_accepted
  exam_results    boolean not null default true,    -- exam_result, achievement
  product_updates boolean not null default true,    -- system
  email_digest    boolean not null default false,
  updated_at      timestamptz not null default now()
);
alter table public.notification_preferences enable row level security;
drop policy if exists "notif_prefs_read_own"   on public.notification_preferences;
drop policy if exists "notif_prefs_insert_own" on public.notification_preferences;
drop policy if exists "notif_prefs_update_own" on public.notification_preferences;
create policy "notif_prefs_read_own" on public.notification_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy "notif_prefs_insert_own" on public.notification_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "notif_prefs_update_own" on public.notification_preferences
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on table public.notification_preferences from anon, authenticated;
grant select, insert, update on table public.notification_preferences to authenticated;

drop trigger if exists notification_preferences_set_updated_at on public.notification_preferences;
create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

-- Does p_user want notifications of p_type? (no row → defaults → yes)
create or replace function public.notification_allowed(p_user uuid, p_type text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case p_type
             when 'like'             then np.likes
             when 'repost'           then np.likes
             when 'comment'          then np.comments
             when 'follow'           then np.follows
             when 'mention'          then np.mentions
             when 'message'          then np.messages
             when 'message_request'  then np.messages
             when 'request_accepted' then np.messages
             when 'exam_result'      then np.exam_results
             when 'achievement'      then np.exam_results
             when 'system'           then np.product_updates
             else true
           end
      from public.notification_preferences np
     where np.user_id = p_user), true)
$$;
revoke all on function public.notification_allowed(uuid, text) from public, anon, authenticated;

-- Delivery gate for EVERY notification insert — the 0008 notify_* triggers
-- (likes, reposts, comments, follows), client-authored mention/message rows
-- and the exam engine — so a disabled type is never stored. Implemented as a
-- trigger on notifications instead of rewriting the notify_* functions, so any
-- other migration's changes to those functions are preserved.
create or replace function public._notifications_prefs_gate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.notification_allowed(new.user_id, new.type) then
    return null;     -- recipient disabled this type: silently skip
  end if;
  return new;
end
$$;
revoke all on function public._notifications_prefs_gate() from public, anon, authenticated;

-- System-only types can only be written by definer code (RPCs/triggers),
-- never by a client request. SECURITY INVOKER on purpose: current_user is the
-- API role for a direct client insert and the function owner inside RPCs.
create or replace function public._notifications_system_types_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.type in ('exam_result', 'achievement', 'system')
     and current_user in ('anon', 'authenticated') then
    raise exception 'forbidden' using errcode = '42501', detail = '{"field":"type"}';
  end if;
  return new;
end
$$;
revoke all on function public._notifications_system_types_guard() from public, anon, authenticated;

drop trigger if exists notifications_a_system_types_guard on public.notifications;
create trigger notifications_a_system_types_guard
  before insert on public.notifications
  for each row execute function public._notifications_system_types_guard();
drop trigger if exists notifications_b_prefs_gate on public.notifications;
create trigger notifications_b_prefs_gate
  before insert on public.notifications
  for each row execute function public._notifications_prefs_gate();

-- Feed with the actor's PUBLIC identity (masked when they post anonymously)
-- and a post snippet. Keyset pagination on (created_at, id).
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
set search_path = public
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
         n.actor_id,
         case when coalesce(p.anonymous_community, false) then null else p.full_name end,
         case when coalesce(p.anonymous_community, false) then null else p.username end,
         case when coalesce(p.anonymous_community, false) then null else p.avatar_url end,
         coalesce(p.is_elite, false),
         coalesce(p.show_elite_badge, true),
         coalesce(p.anonymous_community, false),
         case when cp.content is null then null
              when char_length(cp.content) <= 120 then cp.content
              else left(cp.content, 120) || '…' end
    from public.notifications n
    left join public.profiles p on p.id = n.actor_id
    left join public.community_posts cp on cp.id = n.post_id
   where n.user_id = v_uid
     and (p_before is null
          or n.created_at < p_before
          or (p_before_id is not null and n.created_at = p_before and n.id < p_before_id))
   order by n.created_at desc, n.id desc
   limit p_limit;
end
$$;

-- Mark the caller's notifications read: p_ids null → all unread. Returns the count.
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n   int;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_ids is not null and cardinality(p_ids) > 500 then
    raise exception 'invalid_argument' using detail = '{"field":"ids","max":500}';
  end if;
  update public.notifications n
     set read = true
   where n.user_id = v_uid
     and n.read = false
     and (p_ids is null or n.id = any (p_ids));
  get diagnostics v_n = row_count;
  return v_n;
end
$$;

-- ============================================================================
-- D) SEARCH
-- ============================================================================
select public._create_trgm_index('profiles_full_name_trgm_idx', 'public.profiles', 'full_name');
select public._create_trgm_index('profiles_username_trgm_idx',  'public.profiles', 'username');
select public._create_trgm_index('community_posts_content_trgm_idx', 'public.community_posts', 'content');
select public._create_trgm_index('hashtags_tag_trgm_idx', 'public.hashtags', 'tag');

-- A window of p_text around the first match of p_q (… marks cut ends).
create or replace function public.search_snippet(p_text text, p_q text, p_len int)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_text is null then null
    when char_length(p_text) <= p_len then p_text
    else (select (case when s > 1 then '…' else '' end)
                 || substr(p_text, s, p_len)
                 || (case when s + p_len - 1 < char_length(p_text) then '…' else '' end)
            from (select greatest(1, strpos(lower(p_text), lower(coalesce(p_q, ''))) - p_len / 4) as s) t)
  end
$$;

-- Global search. SECURITY INVOKER: every table's RLS applies to the caller
-- (premium questions stay hidden from free users and guests).
create or replace function public.search_all(p_q text, p_limit int default 5)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_q      text;
  v_esc    text;
  v_pat    text;
  v_prefix text;
  v_tag    text;
  v_people jsonb;
  v_posts  jsonb;
  v_tags   jsonb := '[]'::jsonb;
  v_qs     jsonb;
begin
  if p_limit is null or p_limit not between 1 and 20 then
    raise exception 'invalid_argument' using detail = '{"field":"limit","min":1,"max":20}';
  end if;
  v_q := left(regexp_replace(btrim(coalesce(p_q, '')), '\s+', ' ', 'g'), 100);
  if char_length(v_q) < 2 then
    return jsonb_build_object('query', v_q, 'people', '[]'::jsonb, 'posts', '[]'::jsonb,
                              'tags', '[]'::jsonb, 'questions', '[]'::jsonb);
  end if;

  -- LIKE-escape the user's text: \ % _ are literals
  v_esc    := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  v_pat    := '%' || v_esc || '%';
  v_prefix := v_esc || '%';

  select coalesce(jsonb_agg(to_jsonb(x) order by x.rank_prefix desc, x.xp desc, x.id), '[]'::jsonb) into v_people
    from (select p.id, p.username, p.full_name, p.avatar_url, p.is_elite, p.show_elite_badge, p.xp,
                 (p.full_name ilike v_prefix escape '\' or p.username ilike v_prefix escape '\') as rank_prefix
            from public.profiles p
           where not coalesce(p.anonymous_community, false)
             and (p.full_name ilike v_pat escape '\' or p.username ilike v_pat escape '\')
           order by 8 desc, p.xp desc, p.id
           limit p_limit) x;
  v_people := coalesce((select jsonb_agg(e - 'rank_prefix' - 'xp') from jsonb_array_elements(v_people) e), '[]'::jsonb);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id,
           'snippet', public.search_snippet(x.content, v_q, 160),
           'created_at', x.created_at,
           'likes_count', x.likes_count,
           'comments_count', x.comments_count,
           'author', case when x.anon then null else jsonb_build_object(
                       'id', x.author_id, 'username', x.username, 'full_name', x.full_name,
                       'avatar_url', x.avatar_url, 'is_elite', x.is_elite,
                       'show_elite_badge', x.show_elite_badge) end
         ) order by x.created_at desc, x.id), '[]'::jsonb) into v_posts
    from (select cp.id, cp.content, cp.created_at, cp.likes_count, cp.comments_count,
                 pr.id as author_id, pr.username, pr.full_name, pr.avatar_url, pr.is_elite,
                 pr.show_elite_badge, coalesce(pr.anonymous_community, false) as anon
            from public.community_posts cp
            left join public.profiles pr on pr.id = cp.user_id
           where cp.content ilike v_pat escape '\'
           order by cp.created_at desc, cp.id
           limit p_limit) x;

  v_tag := lower(ltrim(v_q, '#'));
  if char_length(v_tag) >= 2 then
    v_tag := replace(replace(replace(v_tag, '\', '\\'), '%', '\%'), '_', '\_');
    select coalesce(jsonb_agg(jsonb_build_object('tag', x.tag, 'post_count', x.post_count)
                              order by x.pref desc, x.post_count desc, x.tag), '[]'::jsonb) into v_tags
      from (select h.tag, h.post_count, (h.tag like (v_tag || '%') escape '\') as pref
              from public.hashtags h
             where h.tag ilike ('%' || v_tag || '%') escape '\'
             order by 3 desc, h.post_count desc, h.tag
             limit p_limit) x;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'section', x.section, 'topic', x.topic,
           'snippet', public.search_snippet(x.stem, v_q, 140)) order by x.difficulty, x.key), '[]'::jsonb) into v_qs
    from (select q.id, q.section, q.topic, q.stem, q.difficulty, q.key
            from public.questions q
           where q.is_active and q.stem ilike v_pat escape '\'
           order by q.difficulty, q.key
           limit p_limit) x;

  return jsonb_build_object('query', v_q, 'people', v_people, 'posts', v_posts,
                            'tags', v_tags, 'questions', v_qs);
end
$$;

-- ============================================================================
-- E) AI QUOTA — ledger fed by chat_history inserts (deleting chat history
-- does not give messages back), rolling 8 h window, Elite unlimited.
-- Mirrors src/lib/constants.js: AI_FREE_LIMIT 5, AI_WINDOW_MS 8 h,
-- REFERRAL_REWARD { target 5, bonusAiMessages 5 }.
-- ============================================================================
create table if not exists public.ai_usage (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references auth.users (id) on delete cascade,
  chat_message_id uuid unique,
  created_at      timestamptz not null default now()
);
create index if not exists ai_usage_user_time_idx on public.ai_usage (user_id, created_at desc);
alter table public.ai_usage enable row level security;       -- no policies: RPC only
revoke all on table public.ai_usage from public, anon, authenticated;

create or replace function public._log_ai_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.message_type = 'user' then
    insert into public.ai_usage (user_id, chat_message_id, created_at)
    values (new.user_id, new.id, now())
    on conflict (chat_message_id) do nothing;
  end if;
  return null;
end
$$;
revoke all on function public._log_ai_usage() from public, anon, authenticated;

drop trigger if exists chat_history_log_ai_usage on public.chat_history;
create trigger chat_history_log_ai_usage
  after insert on public.chat_history
  for each row execute function public._log_ai_usage();

-- Backfill the current window once (idempotent via chat_message_id).
insert into public.ai_usage (user_id, chat_message_id, created_at)
select ch.user_id, ch.id, ch.created_at
  from public.chat_history ch
 where ch.message_type = 'user'
   and ch.created_at > now() - interval '8 hours'
on conflict (chat_message_id) do nothing;

create or replace function public.ai_quota()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c_window constant interval := interval '8 hours';   -- AI_WINDOW_MS
  c_free   constant int := 5;                         -- AI_FREE_LIMIT
  c_bonus  constant int := 5;                         -- REFERRAL_REWARD.bonusAiMessages
  c_target constant int := 5;                         -- REFERRAL_REWARD.target
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

  -- when the next message slot frees up (rolling window)
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

-- ============================================================================
-- Function privileges. Supabase's default privileges grant EXECUTE on every
-- new function to anon + authenticated, so each RPC is re-granted explicitly.
-- ============================================================================
revoke all on function public.start_exam_attempt(text, text, smallint, int, int) from public, anon, authenticated;
revoke all on function public.save_exam_answer(uuid, smallint, smallint, int, boolean) from public, anon, authenticated;
revoke all on function public.submit_exam_attempt(uuid, jsonb)                   from public, anon, authenticated;
revoke all on function public.get_exam_attempt(uuid)                             from public, anon, authenticated;
revoke all on function public.list_exam_attempts(int, timestamptz, uuid)         from public, anon, authenticated;
revoke all on function public.get_exam_stats()                                   from public, anon, authenticated;
revoke all on function public.get_question_bank_stats()                          from public, anon, authenticated;
revoke all on function public.get_notifications(int, timestamptz, uuid)          from public, anon, authenticated;
revoke all on function public.mark_notifications_read(uuid[])                    from public, anon, authenticated;
revoke all on function public.search_all(text, int)                              from public, anon, authenticated;
revoke all on function public.ai_quota()                                         from public, anon, authenticated;

grant execute on function public.start_exam_attempt(text, text, smallint, int, int) to authenticated, service_role;
grant execute on function public.save_exam_answer(uuid, smallint, smallint, int, boolean) to authenticated, service_role;
grant execute on function public.submit_exam_attempt(uuid, jsonb)                   to authenticated, service_role;
grant execute on function public.get_exam_attempt(uuid)                             to authenticated, service_role;
grant execute on function public.list_exam_attempts(int, timestamptz, uuid)         to authenticated, service_role;
grant execute on function public.get_exam_stats()                                   to authenticated, service_role;
grant execute on function public.get_question_bank_stats()                          to anon, authenticated, service_role;
grant execute on function public.get_notifications(int, timestamptz, uuid)          to authenticated, service_role;
grant execute on function public.mark_notifications_read(uuid[])                    to authenticated, service_role;
grant execute on function public.search_all(text, int)                              to anon, authenticated, service_role;
grant execute on function public.ai_quota()                                         to authenticated, service_role;

-- pure helpers used inside RLS/queries of the callers above
grant execute on function public.exam_of_section(text), public.exam_section_topics(text),
                          public.search_snippet(text, text, int)
  to anon, authenticated, service_role;

-- Warm the bank-count cache (no-op on an empty bank).
select public._refresh_question_bank_counts_now();

commit;
