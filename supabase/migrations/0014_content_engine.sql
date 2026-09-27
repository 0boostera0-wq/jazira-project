-- ============================================================================
-- 0014 — Content engine: curriculum outline, canonical question types,
-- template-driven exam sessions, learner analytics, staging import.
-- Design: docs/CONTENT_ENGINE.md §5 (engine), §6 (database), §6.3 (import).
--
--   A) search_normalize_v2 (mirror of src/lib/content/normalize.js n2) and
--      the HASH-CTR draw _ce_u (mirror of src/lib/content/prng.js u()).
--   B) new tables: content_sources, curriculum_nodes, subject_terms,
--      curriculum_resources, lesson_resource_ranges, learning_objectives,
--      question_stimuli, question_curriculum, exam_templates,
--      scope_pool_counts, scope_pool_members, learner_question_stats,
--      learner_node_stats, question_item_stats, content_import_runs,
--      content_import_batches, content_import_errors, question_revisions.
--   C) additive changes to questions (types, provenance, revision, curriculum
--      bank `exam = 'school'`, column grants), question_keys (answer jsonb,
--      accepted_norm), exam_attempts (template sessions) and
--      exam_attempt_items (display maps, responses, scores, locks, voiding).
--   D) grading: _ce_parse_number, _ce_grade (mirror of answers.js).
--   E) selection: _ce_band_targets, _ce_distribute, _ce_allocate,
--      _ce_retake_allocation, _ce_select / _ce_select_rows (mirror of
--      engine/allocate.js and select.js), _ce_display_maps (engine/shuffle.js).
--   F) sessions: scope resolution, pools (scope_pool_members), history,
--      start_template_attempt, save_exam_response, check_exam_item,
--      abandon_exam_attempt; submit_exam_attempt / get_exam_attempt /
--      _exam_finalize dispatch template attempts to _ce_submit / _ce_get /
--      _ce_finalize (legacy attempts keep the 0010–0013 code path and payloads);
--      start_exam_attempt counts only exam-quota attempts; list_exam_attempts_v2.
--   G) analytics and discovery: get_learning_stats, get_practice_recommendations,
--      get_scope_availability, search_content.
--   H) import (service role): ce_import_begin / _batch / _retire / _finish,
--      ce_refresh_aggregates.
--   I) guests (service role): ce_guest_start, ce_guest_items.
--
-- JS ↔ SQL conformance: tests/fixtures/engine/*.json (selection, allocation,
-- permutations), tests/fixtures/content/grading-cases.json (grading) and
-- tests/fixtures/contracts/rpc/*.json (RPC payloads) run against this file in
-- tests/db/content-*.test.js.
--
-- Error contract: P0001 with MESSAGE = code and DETAIL = JSON (docs/DATA_API.md).
-- New codes: template_not_found, scope_not_found, insufficient_pool,
-- feedback_not_allowed, invalid_response, item_locked, scope_too_large,
-- seed_not_allowed, not_found, retire_refused (plus daily_limit_reached for
-- the practice quota).
--
-- Depends on 0000–0013. Idempotent: safe to re-run (also after 0010/0012/0013
-- are re-run). Never re-apply 0011 after an import: it resets is_active.
-- ============================================================================
begin;

-- Drop + add a named CHECK constraint (re-runnable; picks up new definitions).
create or replace function pg_temp.jz14_check(p_table text, p_name text, p_def text)
returns void
language plpgsql
as $$
begin
  if exists (select 1 from pg_constraint where conrelid = p_table::regclass and conname = p_name) then
    execute format('alter table %s drop constraint %I', p_table, p_name);
  end if;
  execute format('alter table %s add constraint %I check (%s)', p_table, p_name, p_def);
end
$$;

-- ============================================================================
-- A) NORMALIZATION v2 AND HASH-CTR
-- ============================================================================

-- Appendix A, pre-NFKC step: superscript runs → "^" + digits (x² → x^2,
-- 10⁻³ → 10^-3), vulgar fractions → n/d (a fraction glued to a digit becomes
-- a mixed number: 2½ → "2 1/2"). Must run BEFORE NFKC (x² must never be x2).
create or replace function public._ce_pre_nfkc(p_text text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
         replace(replace(replace(replace(replace(replace(replace(replace(replace(
           regexp_replace(
             translate(
               regexp_replace(p_text, '(^|[^⁰¹²³⁴-⁻])([⁰¹²³⁴-⁻])', '\1^\2', 'g'),
               U&'\2070\00B9\00B2\00B3\2074\2075\2076\2077\2078\2079\207A\207B', '0123456789+-'),
             '([0-9٠-٩۰-۹])([¼-¾⅐-⅞↉])', '\1 \2', 'g'),
           U&'\00BC', '1/4'), U&'\00BD', '1/2'), U&'\00BE', '3/4'),
           U&'\2150', '1/7'), U&'\2151', '1/9'), U&'\2152', '1/10'),
           U&'\2153', '1/3'), U&'\2154', '2/3'), U&'\2155', '1/5'), U&'\2156', '2/5'),
           U&'\2157', '3/5'), U&'\2158', '4/5'), U&'\2159', '1/6'), U&'\215A', '5/6'),
           U&'\215B', '1/8'), U&'\215C', '3/8'), U&'\215D', '5/8'), U&'\215E', '7/8'),
           U&'\2189', '0/3')
$$;

-- JavaScript whitespace (String.prototype.trim / \s), locale independent.
create or replace function public._ce_js_trim(p_text text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select regexp_replace(p_text,
    '^[\t\n\u000B\f\r    -     　﻿]+|[\t\n\u000B\f\r    -     　﻿]+$',
    '', 'g')
$$;

-- search_normalize_v2 = normalize.js searchNormalize (n2). Steps in order:
-- pre-NFKC map, NFKC, strip marks + tatweel, letter folds, digit folds,
-- lower-case, strip invisible controls, punctuation → space (except . , ٫
-- between ASCII digits), collapse whitespace, trim. The 0012
-- search_normalize() is left untouched.
create or replace function public.search_normalize_v2(p_text text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(
           regexp_replace(
             regexp_replace(
               lower(translate(translate(
                 regexp_replace(normalize(public._ce_pre_nfkc(p_text), NFKC),
                                '[ً-ٰٟۖ-ۭـ]', '', 'g'),
                 U&'\0623\0625\0622\0671\0649\0626\06CC\0624\0629\06A9',
                 U&'\0627\0627\0627\0627\064A\064A\064A\0648\0647\0643'),
                 U&'\0660\0661\0662\0663\0664\0665\0666\0667\0668\0669\06F0\06F1\06F2\06F3\06F4\06F5\06F6\06F7\06F8\06F9',
                 '01234567890123456789')),
               '[​-‏‪-‮⁦-⁩]', '', 'g'),
             '(?<![0-9])[.,٫]|[.,٫](?![0-9])|[،؛؟?!:«»"''()]', ' ', 'g'),
           '[\t\n\u000B\f\r    -     　﻿]+', ' ', 'g'))
$$;

-- normalizeExactMarks: NFC + whitespace collapse only (short answers with
-- match = exact_marks: hamza, taa marbuta and tashkeel must match).
create or replace function public._ce_exact_marks(p_text text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select public._ce_js_trim(regexp_replace(normalize(p_text, NFC),
           '[\t\n\u000B\f\r    -     　﻿]+', ' ', 'g'))
$$;

-- HASH-CTR draw (§5.2): int(first 13 hex of SHA-256(seed:tag:key)), 52 bits.
-- No SET clause, so the planner inlines it (a selection draws it thousands of
-- times); every name is pg_catalog-qualified instead.
create or replace function public._ce_u(p_seed text, p_tag text, p_key text)
returns bigint
language sql
immutable
parallel safe
as $$
  select (('x' || pg_catalog.substr(pg_catalog.encode(pg_catalog.sha256(
           pg_catalog.convert_to(p_seed || ':' || p_tag || ':' || p_key, 'UTF8')), 'hex'), 1, 13))::bit(52))::bigint
$$;

-- A node id per src/lib/content/ids.js NODE_ID_RE (≤ 160 chars, ≤ 6 segments).
create or replace function public._ce_is_node_id(p_id text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_id is not null and char_length(p_id) <= 160
     and p_id ~ '^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*){0,5}$'
$$;

revoke all on function public._ce_pre_nfkc(text)            from public, anon, authenticated;
revoke all on function public._ce_js_trim(text)             from public, anon, authenticated;
revoke all on function public._ce_exact_marks(text)         from public, anon, authenticated;
revoke all on function public._ce_u(text, text, text)       from public, anon, authenticated;
revoke all on function public._ce_is_node_id(text)          from public, anon, authenticated;
revoke all on function public.search_normalize_v2(text)     from public;
grant execute on function public.search_normalize_v2(text)  to anon, authenticated, service_role;
-- search_normalize_v2 is used in generated columns read by client roles.
grant execute on function public._ce_pre_nfkc(text)         to anon, authenticated, service_role;

-- ============================================================================
-- B) NEW TABLES (every text id carries length / format checks)
-- ============================================================================

-- Sources (§2.3). publish_policy gates what may reach production.
create table if not exists public.content_sources (
  id                text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  kind              text not null check (kind in ('official_portal', 'official_document', 'official_news', 'internal', 'licensed')),
  name_ar           text not null check (char_length(name_ar) between 1 and 200),
  name_en           text not null check (char_length(name_en) between 1 and 200),
  operator          text check (operator is null or char_length(operator) <= 300),
  domain            text check (domain is null or char_length(domain) <= 200),
  base_urls         text[] not null default '{}',
  license_status    text not null check (license_status in ('all_rights_reserved', 'permission_granted', 'public_domain', 'internal', 'unknown')),
  provenance_status text not null check (provenance_status in ('verified', 'PROVENANCE_REVIEW_REQUIRED')),
  redistribution    text not null check (redistribution in ('link_only', 'allowed', 'internal')),
  publish_policy    text not null check (publish_policy in ('pending_owner_decision', 'derived_questions_allowed', 'blocked')),
  retrieved_at      timestamptz,
  notes             text check (notes is null or char_length(notes) <= 4000),
  updated_at        timestamptz not null default now()
);

-- Curriculum outline (§2.5). Flat ids; the parent is a column.
create table if not exists public.curriculum_nodes (
  id          text primary key check (public._ce_is_node_id(id)),
  parent_id   text references public.curriculum_nodes (id) on delete restrict,
  kind        text not null check (kind in ('stage', 'grade', 'track', 'term', 'subject', 'unit', 'chapter', 'lesson')),
  stage       text check (stage is null or char_length(stage) <= 160),
  grade       text check (grade is null or char_length(grade) <= 160),
  track       text check (track is null or char_length(track) <= 160),
  subject     text check (subject is null or char_length(subject) <= 160),
  ord         int not null default 0 check (ord between 0 and 100000),
  title_ar    text not null check (char_length(title_ar) between 1 and 300),
  title_en    text check (title_en is null or char_length(title_en) <= 300),
  term        text check (term is null or term in ('t1', 't2', 'both')),
  term_status text not null default 'unknown' check (term_status in ('verified', 'inferred', 'needs_review', 'unknown')),
  in_plan     boolean not null default true,
  status      text not null check (status in ('verified', 'needs_review', 'source_only', 'unavailable')),
  source_refs jsonb not null default '[]'::jsonb check (jsonb_typeof(source_refs) = 'array'),
  search_norm text generated always as (public.search_normalize_v2(title_ar || ' ' || coalesce(title_en, ''))) stored,
  updated_at  timestamptz not null default now()
);
create index if not exists curriculum_nodes_parent_idx  on public.curriculum_nodes (parent_id, ord);
create index if not exists curriculum_nodes_subject_idx on public.curriculum_nodes (subject, kind);
create index if not exists curriculum_nodes_leaf_idx    on public.curriculum_nodes (stage, grade, track, kind);
select public._create_trgm_index('curriculum_nodes_search_gin_idx', 'public.curriculum_nodes', 'search_norm');
create index if not exists curriculum_nodes_search_fts_idx on public.curriculum_nodes using gin (to_tsvector('simple', search_norm));

create table if not exists public.subject_terms (
  subject_node_id text not null references public.curriculum_nodes (id) on delete cascade,
  term            text not null check (term in ('t1', 't2')),
  status          text not null check (status in ('verified', 'inferred', 'needs_review', 'absent')),
  evidence        text[] not null default '{}',
  updated_at      timestamptz not null default now(),
  primary key (subject_node_id, term)
);

-- Resources (§2.4): metadata and link-outs only (nothing is rehosted).
create table if not exists public.curriculum_resources (
  id              text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*-[0-9]+$' and char_length(id) <= 80),
  source_id       text not null references public.content_sources (id),
  subject_node_id text references public.curriculum_nodes (id) on delete set null,
  kind            text not null check (kind in ('student_book', 'activity_book', 'teacher_guide', 'practice_resource',
                                                'test_resource', 'audio', 'question_bank_external', 'other')),
  title           text not null check (char_length(title) between 1 and 400),
  part            smallint check (part is null or part between 1 and 20),
  year_label      text check (year_label is null or year_label ~ '^[0-9]{4}$'),
  url             text check (url is null or (url ~ '^https://' and char_length(url) <= 1000)),
  file_type       text check (file_type is null or file_type in ('pdf', 'zip', 'other')),
  page_count      int check (page_count is null or page_count between 0 and 100000),
  external_count  int check (external_count is null or external_count >= 0),
  availability    text not null check (availability in ('external_official', 'unavailable', 'needs_review')),
  term            text check (term is null or term in ('t1', 't2', 'both')),
  term_status     text not null default 'unknown' check (term_status in ('verified', 'inferred', 'needs_review', 'unknown')),
  license_status  text not null,
  redistribution  text not null,
  status          text not null check (status in ('active', 'needs_review', 'unavailable')),
  retrieved_at    timestamptz,
  search_norm     text generated always as (public.search_normalize_v2(title)) stored,
  updated_at      timestamptz not null default now()
);
create index if not exists curriculum_resources_subject_idx on public.curriculum_resources (subject_node_id);
select public._create_trgm_index('curriculum_resources_search_gin_idx', 'public.curriculum_resources', 'search_norm');

-- Page ranges of lessons (and units / chapters) in a resource.
create table if not exists public.lesson_resource_ranges (
  lesson_node_id text not null references public.curriculum_nodes (id) on delete cascade,
  resource_id    text not null references public.curriculum_resources (id) on delete cascade,
  pdf_start      int check (pdf_start is null or pdf_start >= 1),
  pdf_end        int check (pdf_end is null or pdf_end >= 1),
  printed_start  int,
  printed_end    int,
  method         text not null check (method in ('toc', 'ien_align', 'manual')),
  status         text not null check (status in ('verified', 'needs_review')),
  primary key (lesson_node_id, resource_id),
  check (pdf_start is null or pdf_end is null or pdf_end >= pdf_start)
);
create index if not exists lesson_resource_ranges_resource_idx on public.lesson_resource_ranges (resource_id);

create table if not exists public.learning_objectives (
  id             text primary key check (id ~ '^obj-[0-9a-f]{10}$'),
  lesson_node_id text not null references public.curriculum_nodes (id) on delete cascade,
  text_ar        text not null check (char_length(text_ar) between 1 and 1000),
  text_en        text check (text_en is null or char_length(text_en) <= 1000),
  origin         text not null check (origin in ('extracted', 'authored')),
  status         text not null check (status in ('draft', 'validated')),
  updated_at     timestamptz not null default now()
);
create index if not exists learning_objectives_lesson_idx on public.learning_objectives (lesson_node_id);

-- Shared passages; served only inside RPC payloads.
create table if not exists public.question_stimuli (
  id         text primary key check (id ~ '^st-[0-9a-f]{10}$'),
  language   text not null check (language in ('ar', 'en')),
  text       text not null check (char_length(text) between 1 and 8000),
  origin     text check (origin is null or char_length(origin) <= 40),
  updated_at timestamptz not null default now()
);

-- Exam templates (§2.12), exported from src/lib/exams/engine/exam-templates.js.
create table if not exists public.exam_templates (
  id         text not null check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(id) <= 64),
  version    int not null check (version between 1 and 1000),
  kind       text not null check (kind in ('lesson', 'chapter', 'subject', 'term', 'full_year', 'practice', 'mock', 'timed', 'weakness', 'random')),
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  is_active  boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (id, version)
);

-- Pool counts per node and band (band 0 = all bands); refreshed by
-- ce_refresh_aggregates(). free_* exclude premium items.
create table if not exists public.scope_pool_counts (
  node_id          text not null check (char_length(node_id) <= 200),
  band             smallint not null check (band between 0 and 3),
  published_count  int not null default 0,
  group_count      int not null default 0,
  free_count       int not null default 0,
  free_group_count int not null default 0,
  primary key (node_id, band)
);

-- Selection rows per (lesson | prep topic, band): the pool of a scope is read
-- from here, so u() is computed only over the requested scope (§6.2).
create table if not exists public.scope_pool_members (
  lesson_node_id text not null check (char_length(lesson_node_id) <= 200),
  band           smallint not null check (band between 1 and 3),
  question_key   text not null,
  question_id    uuid not null references public.questions (id) on delete cascade,
  component      text,
  question_type  text not null,
  stimulus_id    text,
  is_premium     boolean not null default false,
  revision       int not null default 1,
  -- the item's learning objective: lesson-quiz strata (§2.12 coverage
  -- "by objective"; an item without one falls back to its lesson, §5.3)
  objective_id   text check (objective_id is null or objective_id ~ '^obj-[0-9a-f]{10}$'),
  primary key (lesson_node_id, band, question_key)
);
alter table public.scope_pool_members add column if not exists objective_id text
  check (objective_id is null or objective_id ~ '^obj-[0-9a-f]{10}$');
create index if not exists scope_pool_members_lesson_idx on public.scope_pool_members (lesson_node_id, band);

-- Learner analytics (§2.14): written only by _exam_finalize (definer).
create table if not exists public.learner_question_stats (
  user_id       uuid not null references auth.users (id) on delete cascade,
  question_id   uuid not null references public.questions (id) on delete cascade,
  seen_count    int not null default 0 check (seen_count >= 0),
  correct_count int not null default 0 check (correct_count >= 0),
  last_seen_at  timestamptz not null default now(),
  last_correct  boolean,
  wrong_streak  int not null default 0 check (wrong_streak >= 0),
  primary key (user_id, question_id)
);
create index if not exists learner_question_stats_recent_idx on public.learner_question_stats (user_id, last_seen_at desc);

create table if not exists public.learner_node_stats (
  user_id       uuid not null references auth.users (id) on delete cascade,
  node_id       text not null check (char_length(node_id) <= 200),
  answered      int not null default 0 check (answered >= 0),
  correct       int not null default 0 check (correct >= 0),
  time_seconds  bigint not null default 0 check (time_seconds >= 0),
  band_answered int[] not null default '{0,0,0}' check (cardinality(band_answered) = 3),
  band_correct  int[] not null default '{0,0,0}' check (cardinality(band_correct) = 3),
  last_at       timestamptz not null default now(),
  primary key (user_id, node_id)
);
create index if not exists learner_node_stats_recent_idx on public.learner_node_stats (user_id, last_at desc);

-- Content QA (empirical difficulty); service role only.
create table if not exists public.question_item_stats (
  question_id        uuid primary key references public.questions (id) on delete cascade,
  answered           int not null default 0,
  correct            int not null default 0,
  total_time_seconds bigint not null default 0,
  last_at            timestamptz
);

-- Import bookkeeping (§6.3); service role only.
create table if not exists public.content_import_runs (
  id           uuid primary key default gen_random_uuid(),
  target       text not null check (target in ('pglite', 'supabase', 'test')),
  manifest_sha text not null check (manifest_sha ~ '^[0-9a-f]{64}$'),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null default 'running' check (status in ('running', 'done', 'failed')),
  options      jsonb not null default '{}'::jsonb,
  counts       jsonb not null default '{}'::jsonb,
  report       jsonb not null default '{}'::jsonb
);

create table if not exists public.content_import_batches (
  run_id      uuid not null references public.content_import_runs (id) on delete cascade,
  entity      text not null,
  batch_no    int not null check (batch_no >= 0),
  first_key   text,
  last_key    text,
  rows        int not null default 0,
  inserted    int not null default 0,
  updated     int not null default 0,
  unchanged   int not null default 0,
  rejected    int not null default 0,
  status      text not null default 'done' check (status in ('done', 'failed')),
  error       text,
  finished_at timestamptz not null default now(),
  primary key (run_id, entity, batch_no)
);

create table if not exists public.content_import_errors (
  id     bigint generated always as identity primary key,
  run_id uuid not null references public.content_import_runs (id) on delete cascade,
  entity text not null,
  key    text,
  code   text not null,
  detail jsonb,
  at     timestamptz not null default now()
);
create index if not exists content_import_errors_run_idx on public.content_import_errors (run_id);

-- Answered versions of changed questions (append-only; §5.8 revision guard).
create table if not exists public.question_revisions (
  question_id    uuid not null references public.questions (id) on delete cascade,
  revision       int not null check (revision >= 1),
  question_type  text not null,
  language       text not null,
  stem           text not null,
  stimulus_id    text,
  stimulus_text  text,
  payload_public jsonb not null default '{}'::jsonb,
  choices        jsonb not null default '[]'::jsonb,
  answer         jsonb,
  correct_index  smallint,
  explanation    jsonb,
  created_at     timestamptz not null default now(),
  primary key (question_id, revision)
);

create or replace function public._question_revisions_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- a cascade from a deleted question is allowed (the parent is already gone)
  if tg_op = 'DELETE' and not exists (select 1 from public.questions q where q.id = old.question_id) then
    return old;
  end if;
  raise exception 'question_revisions_append_only' using errcode = '42501';
end
$$;
revoke all on function public._question_revisions_append_only() from public, anon, authenticated;
drop trigger if exists question_revisions_append_only on public.question_revisions;
create trigger question_revisions_append_only
  before update or delete on public.question_revisions
  for each row execute function public._question_revisions_append_only();

-- Curriculum links of a question (primary lesson + aligned nodes).
create table if not exists public.question_curriculum (
  question_id uuid not null references public.questions (id) on delete cascade,
  node_id     text not null references public.curriculum_nodes (id) on delete cascade,
  role        text not null check (role in ('primary', 'aligned')),
  primary key (question_id, node_id)
);
create index if not exists question_curriculum_node_idx on public.question_curriculum (node_id, question_id);

-- RLS on every new table, a policy per readable command, minimal grants.
alter table public.content_sources        enable row level security;
alter table public.curriculum_nodes       enable row level security;
alter table public.subject_terms          enable row level security;
alter table public.curriculum_resources   enable row level security;
alter table public.lesson_resource_ranges enable row level security;
alter table public.learning_objectives    enable row level security;
alter table public.question_stimuli       enable row level security;
alter table public.question_curriculum    enable row level security;
alter table public.exam_templates         enable row level security;
alter table public.scope_pool_counts      enable row level security;
alter table public.scope_pool_members     enable row level security;
alter table public.learner_question_stats enable row level security;
alter table public.learner_node_stats     enable row level security;
alter table public.question_item_stats    enable row level security;
alter table public.content_import_runs    enable row level security;
alter table public.content_import_batches enable row level security;
alter table public.content_import_errors  enable row level security;
alter table public.question_revisions     enable row level security;

revoke all on table public.content_sources, public.curriculum_nodes, public.subject_terms,
  public.curriculum_resources, public.lesson_resource_ranges, public.learning_objectives,
  public.question_stimuli, public.question_curriculum, public.exam_templates, public.scope_pool_counts,
  public.scope_pool_members, public.learner_question_stats, public.learner_node_stats,
  public.question_item_stats, public.content_import_runs, public.content_import_batches,
  public.content_import_errors, public.question_revisions
  from public, anon, authenticated;

drop policy if exists "content_sources_read" on public.content_sources;
create policy "content_sources_read" on public.content_sources for select to anon, authenticated using (true);
drop policy if exists "curriculum_nodes_read" on public.curriculum_nodes;
create policy "curriculum_nodes_read" on public.curriculum_nodes for select to anon, authenticated using (status <> 'source_only');
drop policy if exists "subject_terms_read" on public.subject_terms;
create policy "subject_terms_read" on public.subject_terms for select to anon, authenticated using (true);
drop policy if exists "curriculum_resources_read" on public.curriculum_resources;
create policy "curriculum_resources_read" on public.curriculum_resources for select to anon, authenticated using (true);
drop policy if exists "lesson_resource_ranges_read" on public.lesson_resource_ranges;
create policy "lesson_resource_ranges_read" on public.lesson_resource_ranges for select to anon, authenticated using (true);
drop policy if exists "learning_objectives_read" on public.learning_objectives;
create policy "learning_objectives_read" on public.learning_objectives for select to anon, authenticated using (status = 'validated');
drop policy if exists "exam_templates_read" on public.exam_templates;
create policy "exam_templates_read" on public.exam_templates for select to anon, authenticated using (is_active);
drop policy if exists "scope_pool_counts_read" on public.scope_pool_counts;
create policy "scope_pool_counts_read" on public.scope_pool_counts for select to anon, authenticated using (true);
drop policy if exists "learner_question_stats_read_own" on public.learner_question_stats;
create policy "learner_question_stats_read_own" on public.learner_question_stats for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "learner_node_stats_read_own" on public.learner_node_stats;
create policy "learner_node_stats_read_own" on public.learner_node_stats for select to authenticated using (user_id = (select auth.uid()));

grant select on table public.content_sources, public.curriculum_nodes, public.subject_terms,
  public.curriculum_resources, public.lesson_resource_ranges, public.learning_objectives,
  public.exam_templates, public.scope_pool_counts
  to anon, authenticated;
grant select on table public.learner_question_stats, public.learner_node_stats to authenticated;
-- question_stimuli, question_curriculum, scope_pool_members, question_item_stats,
-- content_import_*, question_revisions: no client grants (RPC payloads only).

-- ============================================================================
-- C) CHANGED TABLES (additive: nullable or defaulted)
-- ============================================================================

-- questions ------------------------------------------------------------------
alter table public.questions add column if not exists question_type        text not null default 'mcq';
alter table public.questions add column if not exists difficulty_level     smallint;
alter table public.questions add column if not exists item_style           text;
alter table public.questions add column if not exists provenance           text;
alter table public.questions add column if not exists status               text not null default 'published';
alter table public.questions add column if not exists validation_status    text;
alter table public.questions add column if not exists content_hash         text;
alter table public.questions add column if not exists revision             int not null default 1;
alter table public.questions add column if not exists lesson_node_id       text;
alter table public.questions add column if not exists objective_id         text;
alter table public.questions add column if not exists stimulus_id          text;
alter table public.questions add column if not exists shuffle_options      boolean not null default true;
alter table public.questions add column if not exists fixed_order_reason   text;
alter table public.questions add column if not exists exclusion_group      text;
alter table public.questions add column if not exists payload_public       jsonb not null default '{}'::jsonb;
alter table public.questions add column if not exists source_resource_id   text;
alter table public.questions add column if not exists source_printed_start int;
alter table public.questions add column if not exists source_printed_end   int;
alter table public.questions add column if not exists source_pdf_page      int;
alter table public.questions add column if not exists import_origin        text;

select pg_temp.jz14_check('public.questions', 'questions_exam_check', $c$exam in ('aptitude', 'achievement', 'school')$c$);
select pg_temp.jz14_check('public.questions', 'questions_section_matches_exam',
  $c$exam = 'school' or public.exam_of_section(section) = exam$c$);
select pg_temp.jz14_check('public.questions', 'questions_topic_in_section',
  $c$exam = 'school' or topic = any (public.exam_section_topics(section))$c$);
select pg_temp.jz14_check('public.questions', 'questions_choices_shape', $c$
  (question_type in ('mcq', 'true_false')
   and case when jsonb_typeof(choices) = 'array'
            then jsonb_array_length(choices) between 2 and 6
                 and not jsonb_path_exists(choices, '$[*] ? (@.type() != "string" || @ == "")')
            else false end)
  or (question_type not in ('mcq', 'true_false') and choices = '[]'::jsonb)$c$);
select pg_temp.jz14_check('public.questions', 'questions_question_type_check',
  $c$question_type in ('mcq', 'true_false', 'matching', 'ordering', 'short_answer', 'numeric')$c$);
select pg_temp.jz14_check('public.questions', 'questions_difficulty_level_check',
  $c$difficulty_level is null or difficulty_level between 1 and 5$c$);
select pg_temp.jz14_check('public.questions', 'questions_item_style_check',
  $c$item_style is null or item_style in ('definition', 'conceptual', 'computation', 'application', 'scenario', 'reasoning', 'review')$c$);
select pg_temp.jz14_check('public.questions', 'questions_provenance_check',
  $c$provenance is null or provenance in ('source_derived', 'transformed', 'generated_practice', 'internal_authored', 'review_required')$c$);
select pg_temp.jz14_check('public.questions', 'questions_status_check',
  $c$status in ('candidate', 'validated', 'published', 'rejected', 'review_required', 'retired')$c$);
select pg_temp.jz14_check('public.questions', 'questions_validation_status_check',
  $c$validation_status is null or validation_status in ('pending', 'structural_pass', 'auto_pass', 'validated', 'failed', 'review_required')$c$);
select pg_temp.jz14_check('public.questions', 'questions_content_hash_check',
  $c$content_hash is null or content_hash ~ '^n[0-9]+:sha256:[0-9a-f]{64}$'$c$);
select pg_temp.jz14_check('public.questions', 'questions_revision_check', $c$revision between 1 and 100000$c$);
select pg_temp.jz14_check('public.questions', 'questions_refs_check', $c$
  (lesson_node_id is null or public._ce_is_node_id(lesson_node_id))
  and (objective_id is null or objective_id ~ '^obj-[0-9a-f]{10}$')
  and (stimulus_id is null or stimulus_id ~ '^st-[0-9a-f]{10}$')
  and (exclusion_group is null or char_length(exclusion_group) <= 80)
  and (source_resource_id is null or char_length(source_resource_id) <= 80)$c$);
select pg_temp.jz14_check('public.questions', 'questions_fixed_order_reason_check',
  $c$fixed_order_reason is null or fixed_order_reason in ('all_of_above', 'none_of_above', 'combined_option', 'numeric_ascending', 'conventional_scale', 'source_order')$c$);
select pg_temp.jz14_check('public.questions', 'questions_payload_public_check', $c$jsonb_typeof(payload_public) = 'object'$c$);
select pg_temp.jz14_check('public.questions', 'questions_import_origin_check',
  $c$import_origin is null or import_origin in ('legacy_seed', 'staging')$c$);
select pg_temp.jz14_check('public.questions', 'questions_school_lesson_check',
  $c$exam <> 'school' or lesson_node_id is not null$c$);

-- the answer is part of the hash: one active row per content
create unique index if not exists questions_content_hash_active_uidx
  on public.questions (content_hash) where is_active and content_hash is not null;
create index if not exists questions_lesson_pick_idx
  on public.questions (lesson_node_id, difficulty, status) where is_active;

-- The curriculum bank (exam = 'school') is served only through RPCs, and so
-- is every staging-imported row: its key is minted from a hash that includes
-- the canonical answer (§2.2), so key + stem + options would reveal the
-- answer. Legacy rows (import_origin null / legacy_seed, keys like av-001)
-- stay readable as before.
drop policy if exists "questions_read" on public.questions;
create policy "questions_read" on public.questions
  for select to anon, authenticated
  using (is_active and exam <> 'school' and import_origin is distinct from 'staging'
         and (not is_premium or (select public.has_premium((select auth.uid())))));

-- Column grants: today's client-visible columns plus the public payload.
-- content_hash (includes the answer), exclusion_group, provenance,
-- validation_status, import_origin, revision and source columns are NOT granted.
revoke all on table public.questions from anon, authenticated;
grant select (id, key, exam, section, topic, difficulty, stem, passage, choices, time_limit_seconds, tags,
              source_id, source_ref, year, language, is_premium, is_active, random_key, created_at, updated_at,
              question_type, payload_public, difficulty_level, lesson_node_id)
  on public.questions to anon, authenticated;

-- question_keys --------------------------------------------------------------
alter table public.question_keys alter column correct_index drop not null;
alter table public.question_keys add column if not exists answer            jsonb;
alter table public.question_keys add column if not exists explanation_steps jsonb;
alter table public.question_keys add column if not exists accepted_norm     text[];
select pg_temp.jz14_check('public.question_keys', 'question_keys_answer_present',
  $c$correct_index is not null or answer is not null$c$);

-- correct_index (legacy mcq) must point at an existing choice; null is allowed.
create or replace function public._check_question_key()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'question_keys' then
    if new.correct_index is not null
       and exists (select 1 from public.questions q
                    where q.id = new.question_id
                      and new.correct_index >= jsonb_array_length(q.choices)) then
      raise exception 'question_key_out_of_range' using errcode = '23514';
    end if;
  else
    if exists (select 1 from public.question_keys k
                where k.question_id = new.id
                  and k.correct_index is not null
                  and k.correct_index >= jsonb_array_length(new.choices)) then
      raise exception 'question_key_out_of_range' using errcode = '23514';
    end if;
  end if;
  return null;
end
$$;
revoke all on function public._check_question_key() from public, anon, authenticated;

-- exam_attempts --------------------------------------------------------------
alter table public.exam_attempts add column if not exists template_id      text;
alter table public.exam_attempts add column if not exists template_version int;
alter table public.exam_attempts add column if not exists scope            text;
alter table public.exam_attempts add column if not exists term_scope       text;
alter table public.exam_attempts add column if not exists seed             text;
alter table public.exam_attempts add column if not exists retake_of        uuid references public.exam_attempts (id) on delete set null;
alter table public.exam_attempts add column if not exists timing_mode      text not null default 'timed';
alter table public.exam_attempts add column if not exists feedback_mode    text not null default 'end';
alter table public.exam_attempts add column if not exists quota            text not null default 'exam';
alter table public.exam_attempts add column if not exists bank_revision    text;

select pg_temp.jz14_check('public.exam_attempts', 'exam_attempts_exam_check', $c$exam in ('aptitude', 'achievement', 'school')$c$);
select pg_temp.jz14_check('public.exam_attempts', 'exam_attempts_section_check',
  $c$section is null or exam = 'school' or public.exam_of_section(section) = exam$c$);
select pg_temp.jz14_check('public.exam_attempts', 'exam_attempts_topic_check',
  $c$topic is null or exam = 'school' or (section is not null and topic = any (public.exam_section_topics(section)))$c$);
select pg_temp.jz14_check('public.exam_attempts', 'exam_attempts_time_limit_seconds_check',
  $c$(timing_mode = 'timed' and time_limit_seconds between 60 and 14400)
     or (timing_mode = 'untimed' and time_limit_seconds between 60 and 604800)$c$);
select pg_temp.jz14_check('public.exam_attempts', 'exam_attempts_template_check', $c$
  (template_id is null or (char_length(template_id) <= 64 and template_version between 1 and 1000
                           and scope is not null and char_length(scope) <= 200 and seed is not null))
  and (term_scope is null or term_scope in ('t1', 't2', 'year'))
  and (seed is null or seed ~ '^[0-9a-f]{32}$')
  and timing_mode in ('timed', 'untimed')
  and feedback_mode in ('end', 'immediate')
  and quota in ('exam', 'practice')
  and (bank_revision is null or char_length(bank_revision) <= 80)$c$);
create index if not exists exam_attempts_user_template_idx on public.exam_attempts (user_id, template_id, started_at desc);

-- The owner keeps reading every column of their attempts except `seed`: the
-- seed keys the opaque item handles of the payloads (_ce_item_handle), so a
-- client that could read it could map handles back to answer-derived keys.
do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into v_cols
    from pg_attribute a
   where a.attrelid = 'public.exam_attempts'::regclass and a.attnum > 0 and not a.attisdropped and a.attname <> 'seed';
  execute 'revoke all on table public.exam_attempts from anon, authenticated';
  execute format('grant select (%s) on public.exam_attempts to authenticated', v_cols);
end
$$;

-- exam_attempt_items ---------------------------------------------------------
alter table public.exam_attempt_items add column if not exists choice_order      smallint[];
alter table public.exam_attempt_items add column if not exists display_map       jsonb;
alter table public.exam_attempt_items add column if not exists response          jsonb;
alter table public.exam_attempt_items add column if not exists score             numeric(5, 4);
alter table public.exam_attempt_items add column if not exists question_revision int;
alter table public.exam_attempt_items add column if not exists locked_at         timestamptz;
alter table public.exam_attempt_items add column if not exists voided            text;
select pg_temp.jz14_check('public.exam_attempt_items', 'exam_attempt_items_score_check',
  $c$(score is null or score between 0 and 1) and (voided is null or voided = 'question_updated')$c$);

-- The owner reads legacy columns plus score / lock / voiding; display maps and
-- canonical responses (canonical ids) stay server-side (§5.4).
revoke all on table public.exam_attempt_items from anon, authenticated;
grant select (attempt_id, position, question_id, selected_index, is_correct, time_spent_seconds, flagged,
              answered_at, score, question_revision, locked_at, voided)
  on public.exam_attempt_items to authenticated;

-- question_bank_counts: legacy aptitude / achievement counts only; skipped
-- during a bulk import (the importer calls ce_refresh_aggregates() once).
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
   where q.is_active and q.exam <> 'school' and q.question_type in ('mcq', 'true_false')  -- what _exam_pick serves
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
  if coalesce(current_setting('jazira.bulk_import', true), '') = 'on' then
    return null;
  end if;
  perform public._refresh_question_bank_counts_now();
  return null;
end
$$;
revoke all on function public._refresh_question_bank_counts() from public, anon, authenticated;

-- ============================================================================
-- D) GRADING — mirror of src/lib/content/answers.js (grading-cases.json)
-- ============================================================================

-- parseNumber (§2.8 numeric): Arabic-Indic / Persian digits, a/b fractions,
-- `٫`/`.` decimal marks, `٬` thousands, `,` thousands only in strict groups of
-- three after a non-zero leading group; `,` + 1, 2 or ≥ 4 digits is a decimal
-- mark; `,` + exactly 3 digits otherwise, or mixed with `.`/`٫`/`٬`, is
-- ambiguous. → {ok, num, den, fraction, decimals} | {ok:false, reason}.
create or replace function public._ce_parse_number(p_value jsonb)
returns jsonb
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  s     text;
  neg   boolean := false;
  m     text[];
  v     numeric;
  fracp text;
begin
  if p_value is null then
    return '{"ok":false,"reason":"invalid_number"}';
  end if;
  if jsonb_typeof(p_value) = 'number' then
    v := (p_value #>> '{}')::numeric;
    fracp := split_part(p_value #>> '{}', '.', 2);
    fracp := rtrim(fracp, '0');   -- String(2.50) = "2.5" in JS
    return jsonb_build_object('ok', true, 'num', v, 'den', 1, 'fraction', false, 'decimals', char_length(fracp));
  end if;
  if jsonb_typeof(p_value) <> 'string' then
    return '{"ok":false,"reason":"invalid_number"}';
  end if;
  s := public._ce_pre_nfkc(p_value #>> '{}');
  s := normalize(s, NFKC);
  s := regexp_replace(s, '[​-‏‪-‮⁦-⁩﻿]', '', 'g');
  s := translate(s, U&'\0660\0661\0662\0663\0664\0665\0666\0667\0668\0669\06F0\06F1\06F2\06F3\06F4\06F5\06F6\06F7\06F8\06F9',
                 '01234567890123456789');
  s := replace(replace(s, U&'\2212', '-'), U&'\2044', '/');
  s := public._ce_js_trim(s);
  if char_length(s) = 0 or char_length(s) > 64 then
    return '{"ok":false,"reason":"invalid_number"}';
  end if;
  if left(s, 1) in ('-', '+') then
    neg := left(s, 1) = '-';
    s := substr(s, 2);
  end if;
  m := regexp_match(s, '^([0-9]+)/([0-9]+)$');
  if m is not null then
    if m[2] ~ '^0+$' then
      return '{"ok":false,"reason":"invalid_number"}';
    end if;
    return jsonb_build_object('ok', true, 'num', case when neg then -(m[1]::numeric) else m[1]::numeric end,
                              'den', m[2]::numeric, 'fraction', true, 'decimals', 0);
  end if;
  if strpos(s, ',') > 0 and (s ~ U&'[.\066B]' or strpos(s, U&'\066C') > 0) then
    return '{"ok":false,"reason":"ambiguous_separator"}';
  end if;
  if strpos(s, U&'\066C') > 0 then
    if s !~ U&'^[1-9][0-9]{0,2}(\066C[0-9]{3})+([.\066B][0-9]+)?$' then
      return '{"ok":false,"reason":"invalid_number"}';
    end if;
    s := replace(s, U&'\066C', '');
  end if;
  if strpos(s, ',') > 0 then
    if s ~ '^[1-9][0-9]{0,2}(,[0-9]{3})+$' then
      s := replace(s, ',', '');
    else
      m := regexp_match(s, '^([0-9]+),([0-9]+)$');
      if m is null then
        return '{"ok":false,"reason":"invalid_number"}';
      end if;
      if char_length(m[2]) = 3 then
        return '{"ok":false,"reason":"ambiguous_separator"}';
      end if;
      s := m[1] || '.' || m[2];
    end if;
  end if;
  s := replace(s, U&'\066B', '.');
  m := regexp_match(s, '^([0-9]*)(?:\.([0-9]+))?$');
  if m is null or (m[1] = '' and m[2] is null) then
    return '{"ok":false,"reason":"invalid_number"}';
  end if;
  v := (coalesce(nullif(m[1], ''), '0') || coalesce('.' || m[2], ''))::numeric;
  return jsonb_build_object('ok', true, 'num', case when neg then -v else v end, 'den', 1,
                            'fraction', false, 'decimals', coalesce(char_length(m[2]), 0));
end
$$;

-- blank(): undefined, JSON null, or a string that is empty after trim.
create or replace function public._ce_blank(p_value jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_value is null or jsonb_typeof(p_value) = 'null'
      or (jsonb_typeof(p_value) = 'string' and public._ce_js_trim(p_value #>> '{}') = '')
$$;

-- validateResponse(type, payload, canonical response) → {ok, empty} | {ok:false, reason}
create or replace function public._ce_validate_response(p_type text, p_payload jsonb, p_response jsonb)
returns jsonb
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v      jsonb;
  el     jsonb;
  seen_l text[] := '{}';
  seen_r text[] := '{}';
  ids    text[];
  parsed jsonb;
  pl     jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  if p_response is null or jsonb_typeof(p_response) = 'null' then
    return '{"ok":true,"empty":true}';
  end if;
  if jsonb_typeof(p_response) <> 'object' then
    return '{"ok":false,"reason":"bad_shape"}';
  end if;
  case p_type
  when 'mcq', 'true_false' then
    v := p_response -> 'option_id';
    if public._ce_blank(v) then
      return '{"ok":true,"empty":true}';
    end if;
    if jsonb_typeof(v) <> 'string'
       or not exists (select 1 from jsonb_array_elements(coalesce(pl -> 'options', '[]')) o where o ->> 'id' = v #>> '{}') then
      return '{"ok":false,"reason":"unknown_option"}';
    end if;
  when 'matching' then
    v := p_response -> 'pairs';
    if v is null or jsonb_typeof(v) = 'null' or v = '[]'::jsonb then
      return '{"ok":true,"empty":true}';
    end if;
    if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > jsonb_array_length(coalesce(pl -> 'left', '[]')) then
      return '{"ok":false,"reason":"bad_shape"}';
    end if;
    for el in select value from jsonb_array_elements(v) loop
      if jsonb_typeof(el) <> 'array' or jsonb_array_length(el) <> 2
         or jsonb_typeof(el -> 0) <> 'string' or jsonb_typeof(el -> 1) <> 'string'
         or not exists (select 1 from jsonb_array_elements(coalesce(pl -> 'left', '[]')) x where x ->> 'id' = el ->> 0)
         or not exists (select 1 from jsonb_array_elements(coalesce(pl -> 'right', '[]')) x where x ->> 'id' = el ->> 1) then
        return '{"ok":false,"reason":"unknown_pair"}';
      end if;
      if (el ->> 0) = any (seen_l) then
        return '{"ok":false,"reason":"duplicate_left"}';
      end if;
      if (el ->> 1) = any (seen_r) then
        return '{"ok":false,"reason":"duplicate_right"}';
      end if;
      seen_l := seen_l || (el ->> 0);
      seen_r := seen_r || (el ->> 1);
    end loop;
  when 'ordering' then
    v := p_response -> 'order';
    if v is null or jsonb_typeof(v) = 'null' or v = '[]'::jsonb then
      return '{"ok":true,"empty":true}';
    end if;
    ids := array(select x ->> 'id' from jsonb_array_elements(coalesce(pl -> 'items', '[]')) x);
    if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) <> cardinality(ids)
       or exists (select 1 from jsonb_array_elements(v) e where jsonb_typeof(e) <> 'string' or not ((e #>> '{}') = any (ids)))
       or (select count(distinct e #>> '{}') from jsonb_array_elements(v) e) <> jsonb_array_length(v) then
      return '{"ok":false,"reason":"not_a_permutation"}';
    end if;
  when 'short_answer' then
    v := p_response -> 'text';
    if public._ce_blank(v) then
      return '{"ok":true,"empty":true}';
    end if;
    if jsonb_typeof(v) <> 'string' then
      return '{"ok":false,"reason":"bad_shape"}';
    end if;
    if char_length(public._ce_js_trim(v #>> '{}')) > coalesce((pl ->> 'max_chars')::int, 80) then
      return '{"ok":false,"reason":"too_long"}';
    end if;
  when 'numeric' then
    v := p_response -> 'value';
    if public._ce_blank(v) then
      return '{"ok":true,"empty":true}';
    end if;
    parsed := public._ce_parse_number(v);
    if not (parsed ->> 'ok')::boolean then
      return parsed;
    end if;
    if (parsed ->> 'fraction')::boolean and pl #> '{input,allow_fraction}' = 'false'::jsonb then
      return '{"ok":false,"reason":"fraction_not_allowed"}';
    end if;
    if jsonb_typeof(pl #> '{input,max_decimals}') = 'number'
       and (pl #>> '{input,max_decimals}')::numeric = trunc((pl #>> '{input,max_decimals}')::numeric)
       and (parsed ->> 'decimals')::int > (pl #>> '{input,max_decimals}')::numeric then
      return '{"ok":false,"reason":"too_many_decimals"}';
    end if;
    if p_response ? 'unit' and jsonb_typeof(p_response -> 'unit') not in ('null', 'string') then
      return '{"ok":false,"reason":"bad_shape"}';
    end if;
  else
    return '{"ok":false,"reason":"unknown_type"}';
  end case;
  return '{"ok":true,"empty":false}';
end
$$;

-- gradeResponse(type, canonical payload with answer, canonical response)
--   → {score (0..1, 4 decimals), verdict, reason?}. p_accepted_norm (the
--   stored question_keys.accepted_norm) wins over payload.accepted_norm, which
--   wins over normalizing payload.accepted here.
create or replace function public._ce_grade_full(p_type text, p_payload jsonb, p_accepted_norm text[], p_response jsonb)
returns jsonb
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  pl      jsonb := coalesce(p_payload, '{}'::jsonb);
  ans     jsonb := coalesce(p_payload -> 'answer', '{}'::jsonb);
  chk     jsonb;
  score   numeric := 0;
  n_left  int;
  n_key   int;
  correct int;
  got     text;
  norms   text[];
  parsed  jsonb;
  a       numeric;
  num     numeric;
  den     numeric;
  tol     numeric;
  bound   numeric;
begin
  chk := public._ce_validate_response(p_type, pl, p_response);
  if not (chk ->> 'ok')::boolean then
    return jsonb_build_object('score', 0, 'verdict', 'incorrect', 'reason', chk ->> 'reason');
  end if;
  if (chk ->> 'empty')::boolean then
    return '{"score":0,"verdict":"unanswered"}';
  end if;
  case p_type
  when 'mcq', 'true_false' then
    score := case when (p_response ->> 'option_id') = (ans ->> 'option_id') then 1 else 0 end;
  when 'matching' then
    n_left := jsonb_array_length(coalesce(pl -> 'left', '[]'));
    n_key := jsonb_array_length(coalesce(ans -> 'pairs', '[]'));
    select count(*)::int into correct
      from jsonb_array_elements(p_response -> 'pairs') r
     where exists (select 1 from jsonb_array_elements(coalesce(ans -> 'pairs', '[]')) k
                    where k ->> 0 = r ->> 0 and k ->> 1 = r ->> 1);
    n_left := coalesce(nullif(n_left, 0), nullif(n_key, 0), 1);
    if pl ->> 'scoring' = 'all_or_nothing' then
      score := case when correct = n_left then 1 else 0 end;
    else
      score := correct::numeric / n_left;
    end if;
  when 'ordering' then
    score := case when coalesce(ans -> 'order', '[]'::jsonb) = p_response -> 'order' then 1 else 0 end;
  when 'short_answer' then
    if pl ->> 'match' = 'exact_marks' then
      got := public._ce_exact_marks(p_response ->> 'text');
      score := case when exists (select 1 from jsonb_array_elements_text(coalesce(pl -> 'accepted', '[]')) x
                                  where public._ce_exact_marks(x) = got) then 1 else 0 end;
    else
      got := public.search_normalize_v2(p_response ->> 'text');
      norms := coalesce(p_accepted_norm,
                        case when jsonb_typeof(pl -> 'accepted_norm') = 'array'
                             then array(select jsonb_array_elements_text(pl -> 'accepted_norm')) end,
                        array(select public.search_normalize_v2(x) from jsonb_array_elements_text(coalesce(pl -> 'accepted', '[]')) x));
      score := case when got <> '' and got = any (norms) then 1 else 0 end;
    end if;
  when 'numeric' then
    parsed := public._ce_parse_number(p_response -> 'value');
    num := (parsed ->> 'num')::numeric;
    den := (parsed ->> 'den')::numeric;
    a := (ans ->> 'value')::numeric;
    if jsonb_typeof(ans -> 'tolerance') = 'object' then
      tol := abs((ans #>> '{tolerance,value}')::numeric);
      bound := case when ans #>> '{tolerance,kind}' = 'rel' then tol * abs(a) else tol end;
    else
      bound := 0;
    end if;
    score := case when abs(num - a * den) <= bound * den then 1 else 0 end;
    if score = 1 and jsonb_typeof(pl -> 'unit') = 'object' and (pl #> '{unit,required}') = 'true'::jsonb then
      got := public.search_normalize_v2(coalesce(p_response ->> 'unit', ''));
      if got = '' or not (got = any (array(
            select public.search_normalize_v2(x)
              from (select pl #>> '{unit,text}' as x
                    union all
                    select jsonb_array_elements_text(coalesce(pl #> '{unit,accepted}', '[]'))) t))) then
        score := 0;
      end if;
    end if;
  else
    score := 0;
  end case;
  score := round(score, 4);
  return jsonb_build_object('score', score,
                            'verdict', case when score >= 1 then 'correct' when score > 0 then 'partial' else 'incorrect' end);
end
$$;

create or replace function public._ce_grade(p_type text, p_answer jsonb, p_accepted_norm text[], p_response jsonb)
returns numeric
language sql
immutable
parallel safe
set search_path = ''
as $$
  select (public._ce_grade_full(p_type, p_answer, p_accepted_norm, p_response) ->> 'score')::numeric
$$;

-- The canonical correct response (correctResponse in answers.js).
create or replace function public._ce_correct_response(p_type text, p_payload jsonb)
returns jsonb
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case p_type
    when 'mcq' then jsonb_build_object('option_id', p_payload #> '{answer,option_id}')
    when 'true_false' then jsonb_build_object('option_id', p_payload #> '{answer,option_id}')
    when 'matching' then jsonb_build_object('pairs', coalesce(p_payload #> '{answer,pairs}', '[]'::jsonb))
    when 'ordering' then jsonb_build_object('order', coalesce(p_payload #> '{answer,order}', '[]'::jsonb))
    when 'short_answer' then jsonb_build_object('text', coalesce(p_payload ->> 'answer_display', p_payload #>> '{accepted,0}', ''))
    when 'numeric' then case when jsonb_typeof(p_payload -> 'unit') = 'object'
                             then jsonb_build_object('value', p_payload #> '{answer,value}', 'unit', p_payload #> '{unit,text}')
                             else jsonb_build_object('value', p_payload #> '{answer,value}') end
  end
$$;

-- publicPayload (answers.js): the client-visible part of a payload; every
-- field is projected explicitly so an answer field never leaks.
create or replace function public._ce_public_payload(p_type text, p_payload jsonb)
returns jsonb
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case p_type
    when 'mcq' then jsonb_build_object(
      'options', coalesce((select jsonb_agg(jsonb_build_object('id', o -> 'id', 'text', o -> 'text') order by n)
                             from jsonb_array_elements(coalesce(p_payload -> 'options', '[]')) with ordinality e (o, n)), '[]'::jsonb),
      'fixed_order_reason', coalesce(p_payload -> 'fixed_order_reason', 'null'::jsonb))
    when 'true_false' then jsonb_build_object(
      'options', coalesce((select jsonb_agg(jsonb_build_object('id', o -> 'id', 'text', o -> 'text') order by n)
                             from jsonb_array_elements(coalesce(p_payload -> 'options', '[]')) with ordinality e (o, n)), '[]'::jsonb),
      'fixed_order_reason', coalesce(p_payload -> 'fixed_order_reason', 'null'::jsonb))
    when 'matching' then jsonb_build_object(
      'left', coalesce((select jsonb_agg(jsonb_build_object('id', o -> 'id', 'text', o -> 'text') order by n)
                          from jsonb_array_elements(coalesce(p_payload -> 'left', '[]')) with ordinality e (o, n)), '[]'::jsonb),
      'right', coalesce((select jsonb_agg(jsonb_build_object('id', o -> 'id', 'text', o -> 'text') order by n)
                           from jsonb_array_elements(coalesce(p_payload -> 'right', '[]')) with ordinality e (o, n)), '[]'::jsonb),
      'scoring', coalesce(p_payload -> 'scoring', '"partial"'::jsonb))
    when 'ordering' then jsonb_build_object(
      'items', coalesce((select jsonb_agg(jsonb_build_object('id', o -> 'id', 'text', o -> 'text') order by n)
                           from jsonb_array_elements(coalesce(p_payload -> 'items', '[]')) with ordinality e (o, n)), '[]'::jsonb),
      'criterion', coalesce(p_payload -> 'criterion', '"other"'::jsonb))
    when 'short_answer' then jsonb_build_object('max_chars', coalesce(p_payload -> 'max_chars', '80'::jsonb))
    when 'numeric' then jsonb_build_object(
      'unit', case when jsonb_typeof(p_payload -> 'unit') = 'object'
                   then jsonb_build_object('text', p_payload #> '{unit,text}',
                                           'required', coalesce((p_payload #>> '{unit,required}')::boolean, false),
                                           'accepted', coalesce(p_payload #> '{unit,accepted}', '[]'::jsonb))
                   else 'null'::jsonb end,
      'input', jsonb_build_object(
        'allow_fraction', coalesce(p_payload #> '{input,allow_fraction}', 'true'::jsonb) <> 'false'::jsonb,
        'max_decimals', case when jsonb_typeof(p_payload #> '{input,max_decimals}') = 'number'
                              and (p_payload #>> '{input,max_decimals}')::numeric = trunc((p_payload #>> '{input,max_decimals}')::numeric)
                             then p_payload #> '{input,max_decimals}' else 'null'::jsonb end))
  end
$$;

revoke all on function public._ce_parse_number(jsonb)                          from public, anon, authenticated;
revoke all on function public._ce_blank(jsonb)                                 from public, anon, authenticated;
revoke all on function public._ce_validate_response(text, jsonb, jsonb)        from public, anon, authenticated;
revoke all on function public._ce_grade_full(text, jsonb, text[], jsonb)       from public, anon, authenticated;
revoke all on function public._ce_grade(text, jsonb, text[], jsonb)            from public, anon, authenticated;
revoke all on function public._ce_correct_response(text, jsonb)                from public, anon, authenticated;
revoke all on function public._ce_public_payload(text, jsonb)                  from public, anon, authenticated;

-- ============================================================================
-- E) SELECTION — mirror of src/lib/exams/engine/allocate.js and select.js.
-- Every tie is broken by _ce_u(seed, tag, key) and then by the id in C order,
-- so the result equals the JS engine bit for bit (tests/fixtures/engine).
-- ============================================================================

-- Band targets: floor(n·mix_b/Σ), leftover one each to the largest remainder;
-- ties go medium, easy, hard. p_mix = [easy, medium, hard].
create or replace function public._ce_band_targets(p_n int, p_mix int[])
returns int[]
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  total int := coalesce(p_mix[1], 0) + coalesce(p_mix[2], 0) + coalesce(p_mix[3], 0);
  base  int[] := array[0, 0, 0];
  rem   int[] := array[0, 0, 0];
  lft   int;
  b     int;
begin
  if total <= 0 then
    return base;
  end if;
  for b in 1 .. 3 loop
    base[b] := floor((p_n::bigint * p_mix[b]) / total);
    rem[b] := (p_n::bigint * p_mix[b]) % total;
  end loop;
  lft := p_n - base[1] - base[2] - base[3];
  for b in select x.b from unnest(array[2, 1, 3]) with ordinality x (b, pref) order by rem[x.b] desc, x.pref loop
    exit when lft <= 0;
    base[b] := base[b] + 1;
    lft := lft - 1;
  end loop;
  return base;
end
$$;

-- Capped largest remainder with redistribution (§5.3 step 6). Returns the
-- quotas aligned with p_ids.
create or replace function public._ce_distribute(p_total int, p_ids text[], p_weights bigint[], p_caps int[], p_seed text)
returns int[]
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  n         int := coalesce(cardinality(p_ids), 0);
  quotas    int[] := array_fill(0, array[greatest(n, 1)]);
  give      bigint[] := array_fill(0::bigint, array[greatest(n, 1)]);
  rems      bigint[] := array_fill(0::bigint, array[greatest(n, 1)]);
  ties      bigint[] := array_fill(0::bigint, array[greatest(n, 1)]);
  active    int[];
  remaining bigint := greatest(0, coalesce(p_total, 0));
  w_sum     bigint;
  lft       bigint;
  placed    bigint;
  take      bigint;
  i         int;
begin
  if n = 0 then
    return '{}'::int[];
  end if;
  active := array(select g from generate_series(1, n) g where p_weights[g] > 0 and p_caps[g] > 0 order by g);
  for i in select unnest(active) loop
    ties[i] := public._ce_u(p_seed, 'tie', p_ids[i]);
  end loop;
  while remaining > 0 and cardinality(active) > 0 loop
    w_sum := 0;
    foreach i in array active loop
      w_sum := w_sum + p_weights[i];
    end loop;
    lft := remaining;
    foreach i in array active loop
      give[i] := (remaining * p_weights[i]) / w_sum;
      rems[i] := (remaining * p_weights[i]) % w_sum;
      lft := lft - give[i];
    end loop;
    for i in select a.i from unnest(active) a (i)
              order by rems[a.i] desc, ties[a.i], p_ids[a.i] collate "C" loop
      exit when lft <= 0;
      give[i] := give[i] + 1;
      lft := lft - 1;
    end loop;
    placed := 0;
    foreach i in array active loop
      take := least(give[i], p_caps[i] - quotas[i]);
      quotas[i] := quotas[i] + take;
      placed := placed + take;
    end loop;
    remaining := remaining - placed;
    active := array(select a.i from unnest(active) a (i) where p_caps[a.i] - quotas[a.i] > 0);
    exit when placed = 0;
  end loop;
  return quotas[1:n];
end
$$;

-- fill (allocate.js): _ce_distribute, then any leftover over the free room of
-- every cell (weight = cap = room), so capacity in a zero-weight cell is used
-- before a session is left short.
create or replace function public._ce_fill(p_total int, p_ids text[], p_weights bigint[], p_caps int[], p_seed text)
returns int[]
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  n    int := coalesce(cardinality(p_ids), 0);
  q    int[];
  q2   int[];
  room int[];
  lft  int;
  i    int;
begin
  if n = 0 then
    return '{}'::int[];
  end if;
  q := public._ce_distribute(p_total, p_ids, p_weights, p_caps, p_seed);
  lft := greatest(0, coalesce(p_total, 0));
  for i in 1 .. n loop
    lft := lft - q[i];
  end loop;
  if lft <= 0 then
    return q;
  end if;
  room := array(select greatest(0, coalesce(p_caps[g], 0) - q[g]) from generate_series(1, n) g);
  q2 := public._ce_distribute(lft, p_ids, room::bigint[], room, p_seed);
  for i in 1 .. n loop
    q[i] := q[i] + q2[i];
  end loop;
  return q;
end
$$;

-- Fresh allocation (§5.3 steps 4–7). Strata are given in any order with
-- flattened capacities (index (s-1)*3 + band). Returns
-- {targets, cells:[[cell, unseen, seen]…] (C order), stored:[[cell, q]…],
--  placed, reused, lower_bound, prepass:[stratum…]}.
create or replace function public._ce_allocate(
  p_n int, p_mix int[], p_strata text[], p_weights bigint[], p_cap_u int[], p_cap_s int[],
  p_seed text, p_min_per_stratum int default 1, p_allow_reuse boolean default true, p_share int default 30)
returns jsonb
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  ns        int := coalesce(cardinality(p_strata), 0);
  targets   int[] := public._ce_band_targets(p_n, p_mix);
  w         bigint[];
  ids       text[] := '{}';
  wts       bigint[] := '{}';
  caps      int[] := '{}';
  unseen    int[];
  seen      int[];
  assigned  int[] := array[0, 0, 0];
  ranked    text[];
  prepass   text[] := '{}';
  pre       int;
  q         int[];
  placed_u  int;
  reused    int := 0;
  best_b    int;
  best_need int;
  need      int;
  s         int;
  b         int;
  k         int;
  budget    int;
  cells     jsonb;
  stored    jsonb;
begin
  -- stratum weights: max(0, round(w)); all zero → equal weights
  w := array(select greatest(0, coalesce(p_weights[g], 1)) from generate_series(1, greatest(ns, 1)) g);
  if ns > 0 and not exists (select 1 from unnest(w[1:ns]) x where x > 0) then
    w := array_fill(1::bigint, array[ns]);
  end if;
  unseen := array_fill(0, array[greatest(ns * 3, 1)]);
  seen := array_fill(0, array[greatest(ns * 3, 1)]);

  -- step 5: coverage pre-pass over the strata with unseen capacity
  ranked := array(select p_strata[g] from generate_series(1, ns) g
                   where coalesce(p_cap_u[(g - 1) * 3 + 1], 0) > 0 or coalesce(p_cap_u[(g - 1) * 3 + 2], 0) > 0
                      or coalesce(p_cap_u[(g - 1) * 3 + 3], 0) > 0
                   order by public._ce_u(p_seed, 'strat', p_strata[g]), p_strata[g] collate "C");
  if coalesce(p_min_per_stratum, 1) > 0 then
    prepass := case when p_n >= cardinality(ranked) then ranked else ranked[1:greatest(p_n, 0)] end;
  end if;
  for s in select array_position(p_strata, x.id) from unnest(prepass) with ordinality x (id, ord) order by x.ord loop
    best_b := null;
    foreach b in array array[2, 1, 3] loop
      k := (s - 1) * 3 + b;
      continue when coalesce(p_cap_u[k], 0) - unseen[k] <= 0;
      need := targets[b] - assigned[b];
      if best_b is null or need > best_need then
        best_b := b;
        best_need := need;
      end if;
    end loop;
    continue when best_b is null;
    k := (s - 1) * 3 + best_b;
    unseen[k] := unseen[k] + 1;
    assigned[best_b] := assigned[best_b] + 1;
  end loop;
  pre := coalesce(cardinality(prepass), 0);

  -- step 6: proportional pass over the remaining unseen capacity
  for s in 1 .. ns loop
    for b in 1 .. 3 loop
      ids := ids || (p_strata[s] || '#' || b);
      wts := wts || (w[s] * coalesce(p_mix[b], 0));
      caps := caps || (coalesce(p_cap_u[(s - 1) * 3 + b], 0) - unseen[(s - 1) * 3 + b]);
    end loop;
  end loop;
  q := public._ce_fill(p_n - pre, ids, wts, caps, p_seed);
  placed_u := pre;
  for k in 1 .. coalesce(cardinality(q), 0) loop
    unseen[k] := unseen[k] + q[k];
    placed_u := placed_u + q[k];
  end loop;

  -- step 7: controlled reuse over the seen capacity, up to ceil(n·share/100),
  -- then forced reuse up to n (every unseen item is already placed here)
  if placed_u < p_n and coalesce(p_allow_reuse, true) then
    budget := ceil((p_n * coalesce(p_share, 0))::numeric / 100);
    caps := array(select coalesce(p_cap_s[g], 0) from generate_series(1, ns * 3) g);
    q := public._ce_distribute(least(p_n - placed_u, budget), ids, wts, caps, p_seed);
    for k in 1 .. coalesce(cardinality(q), 0) loop
      seen[k] := q[k];
      reused := reused + q[k];
    end loop;
    if placed_u + reused < p_n then
      caps := array(select coalesce(p_cap_s[g], 0) - seen[g] from generate_series(1, ns * 3) g);
      q := public._ce_fill(p_n - placed_u - reused, ids, wts, caps, p_seed);
      for k in 1 .. coalesce(cardinality(q), 0) loop
        seen[k] := seen[k] + q[k];
        reused := reused + q[k];
      end loop;
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_array(c.id, c.u, c.s) order by c.id collate "C"), '[]'::jsonb),
         coalesce(jsonb_agg(jsonb_build_array(c.id, c.u + c.s) order by c.id collate "C"), '[]'::jsonb)
    into cells, stored
    from (select ids[g] id, unseen[g] u, seen[g] s from generate_series(1, ns * 3) g) c
   where c.u > 0 or c.s > 0;

  return jsonb_build_object('n', p_n, 'targets', to_jsonb(targets), 'cells', cells, 'stored', stored,
                            'placed', placed_u + reused, 'reused', reused,
                            'lower_bound', coalesce(p_min_per_stratum, 1) > 0 and p_n < cardinality(ranked),
                            'prepass', to_jsonb(prepass));
end
$$;

-- Retake (§5.3 step 4, mirror of retakeAllocation): the stored per-cell quotas,
-- capped by the current capacity, in this order of preference:
--   a. unseen items of the cell;
--   b. controlled reuse: seen items of the short cells up to ceil(n·share/100),
--      by shortfall (the distribution of the original stays identical);
--   c. unseen items of any cell, by free room;
--   d. forced reuse (no unseen item left): seen items of the short cells;
--   e. forced reuse of seen items of any cell, by free room.
-- b, d and e need allow_reuse; the retake is short only when the pool is.
create or replace function public._ce_retake_allocation(
  p_stored jsonb, p_strata text[], p_cap_u int[], p_cap_s int[], p_seed text,
  p_allow_reuse boolean default true, p_share int default 30)
returns jsonb
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  allow   boolean := coalesce(p_allow_reuse, true);
  ids     text[];
  m       int;
  cu      int[];
  cs      int[];
  us      int[];
  ss      int[];
  sh      int[];
  n       int := 0;
  placed  int := 0;
  reused  int := 0;
  r       record;
  s       int;
  b       int;
  i       int;
  j       int;
  ph      int;
  take    int;
  budget  int;
  q       int[];
  sub_ix  int[];
  sub_ids text[];
  sub_w   bigint[];
  sub_c   int[];
  cells   jsonb;
begin
  -- every cell of the current strata plus the stored ones, C order
  ids := array(select t.x from (
                 select p_strata[g] || '#' || bb x
                   from generate_series(1, coalesce(cardinality(p_strata), 0)) g cross join generate_series(1, 3) bb
                 union
                 select e ->> 0 from jsonb_array_elements(coalesce(p_stored, '[]')) e) t
               order by t.x collate "C");
  m := coalesce(cardinality(ids), 0);
  cu := array_fill(0, array[greatest(m, 1)]);
  cs := array_fill(0, array[greatest(m, 1)]);
  us := array_fill(0, array[greatest(m, 1)]);
  ss := array_fill(0, array[greatest(m, 1)]);
  sh := array_fill(0, array[greatest(m, 1)]);
  for i in 1 .. m loop
    s := array_position(p_strata, left(ids[i], length(ids[i]) - strpos(reverse(ids[i]), '#')));
    b := right(ids[i], 1)::int;
    if s is not null then
      cu[i] := coalesce(p_cap_u[(s - 1) * 3 + b], 0);
      cs[i] := coalesce(p_cap_s[(s - 1) * 3 + b], 0);
    end if;
  end loop;

  -- a. unseen items of each stored cell
  for r in select e ->> 0 as id, (e ->> 1)::int as q
             from jsonb_array_elements(coalesce(p_stored, '[]')) e
            order by (e ->> 0) collate "C" loop
    n := n + r.q;
    i := array_position(ids, r.id);
    take := least(r.q, cu[i] - us[i]);
    us[i] := us[i] + take;
    placed := placed + take;
    if r.q > take then
      sh[i] := sh[i] + r.q - take;
    end if;
  end loop;

  -- b..e (ph 1..4)
  budget := ceil((n * coalesce(p_share, 0))::numeric / 100);
  for ph in 1 .. 4 loop
    exit when placed + reused >= n;
    continue when ph <> 2 and not allow;
    sub_ix := case when ph in (1, 3) then array(select g from generate_series(1, m) g where sh[g] - ss[g] > 0 order by g)
                   else array(select g from generate_series(1, m) g order by g) end;
    sub_ids := array(select ids[x.i] from unnest(sub_ix) with ordinality x (i, o) order by x.o);
    sub_w := array(select (case ph when 2 then greatest(0, cu[x.i] - us[x.i])
                                   when 4 then greatest(0, cs[x.i] - ss[x.i])
                                   else sh[x.i] - ss[x.i] end)::bigint
                     from unnest(sub_ix) with ordinality x (i, o) order by x.o);
    sub_c := array(select case ph when 2 then greatest(0, cu[x.i] - us[x.i])
                                  when 4 then greatest(0, cs[x.i] - ss[x.i])
                                  else least(sh[x.i] - ss[x.i], cs[x.i] - ss[x.i]) end
                     from unnest(sub_ix) with ordinality x (i, o) order by x.o);
    q := public._ce_distribute(case when ph = 1 then least(budget, n - placed - reused) else n - placed - reused end,
                               sub_ids, sub_w, sub_c, p_seed);
    for j in 1 .. coalesce(cardinality(q), 0) loop
      if ph = 2 then
        us[sub_ix[j]] := us[sub_ix[j]] + q[j];
        placed := placed + q[j];
      else
        ss[sub_ix[j]] := ss[sub_ix[j]] + q[j];
        reused := reused + q[j];
      end if;
    end loop;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_array(ids[g], us[g], ss[g]) order by ids[g] collate "C"), '[]'::jsonb)
    into cells
    from generate_series(1, m) g
   where us[g] > 0 or ss[g] > 0;
  return jsonb_build_object('n', n, 'targets', null, 'cells', cells, 'stored', coalesce(p_stored, '[]'::jsonb),
                            'placed', placed + reused, 'reused', reused, 'lower_bound', false, 'prepass', '[]'::jsonb);
end
$$;

revoke all on function public._ce_band_targets(int, int[])                                  from public, anon, authenticated;
revoke all on function public._ce_distribute(int, text[], bigint[], int[], text)            from public, anon, authenticated;
revoke all on function public._ce_fill(int, text[], bigint[], int[], text)                  from public, anon, authenticated;
revoke all on function public._ce_allocate(int, int[], text[], bigint[], int[], int[], text, int, boolean, int)
  from public, anon, authenticated;
revoke all on function public._ce_retake_allocation(jsonb, text[], int[], int[], text, boolean, int)
  from public, anon, authenticated;

-- Stratum of a pool row under a template (§5.3 step 3; full-year: (term, unit)).
create or replace function public._ce_stratum(p_template jsonb, p_lesson text, p_unit text, p_chapter text,
                                              p_term text, p_topic text, p_objective text)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when p_template ->> 'kind' = 'full_year' then coalesce(p_term, 'none') || '|' || coalesce(p_unit, p_topic, p_lesson)
    else case p_template #>> '{coverage,stratify_by}'
      when 'objective' then coalesce(p_objective, p_lesson)
      when 'lesson'    then p_lesson
      when 'chapter'   then coalesce(p_chapter, p_unit, p_topic, p_lesson)
      when 'unit'      then coalesce(p_unit, p_topic, p_lesson)
      when 'topic'     then coalesce(p_topic, p_lesson)
      else '*' end
  end
$$;

-- Pool rows and representatives as composite arrays: the selection works on
-- SQL rows (never on per-row jsonb), so a 5,000-item scope stays cheap.
do $$
begin
  if not exists (select 1 from pg_type t where t.typname = 'ce_pool_item' and t.typnamespace = 'public'::regnamespace) then
    create type public.ce_pool_item as (key text, lesson text, band int, component text, type text, stimulus text,
                                        premium boolean, revision int, unit text, chapter text, term text, topic text,
                                        objective text);
  end if;
  if not exists (select 1 from pg_type t where t.typname = 'ce_rep_item' and t.typnamespace = 'public'::regnamespace) then
    create type public.ce_rep_item as (key text, lesson text, band int, grp text, stimulus text, stratum text,
                                       seen boolean, recency numeric, pref int);
  end if;
end
$$;

-- The selection itself (same contract as _ce_select, pool as a composite array).
create or replace function public._ce_select_rows(
  p_template jsonb, p_n int, p_min int, p_seed text, p_pool public.ce_pool_item[],
  p_seen jsonb default null, p_wrong jsonb default null, p_retake jsonb default null,
  p_errors jsonb default null, p_now_ms bigint default null, p_premium boolean default false)
returns jsonb
language plpgsql
stable
parallel safe
set search_path = ''
as $$
declare
  c_cap    constant int := 5000;   -- SCOPE_ITEM_CAP
  v_types  text[] := array(select jsonb_array_elements_text(coalesce(p_template -> 'types', '[]')));
  v_mix    int[] := array[coalesce((p_template #>> '{difficulty_mix,easy}')::int, 0),
                          coalesce((p_template #>> '{difficulty_mix,medium}')::int, 0),
                          coalesce((p_template #>> '{difficulty_mix,hard}')::int, 0)];
  v_weight text := coalesce(p_template #>> '{coverage,weight}', 'equal');
  v_allow  boolean := coalesce((p_template #>> '{retry,allow_reuse}')::boolean, true);
  v_share  int := coalesce((p_template #>> '{retry,max_reuse_share}')::int, 0);
  v_minps  int := coalesce((p_template #>> '{coverage,min_per_stratum}')::int, 1);
  v_order  text := coalesce(p_template #>> '{randomization,question_order}', 'shuffle');
  v_kind   text := p_template ->> 'kind';
  v_by     text := p_template #>> '{coverage,stratify_by}';
  v_now    bigint := coalesce(p_now_ms, (extract(epoch from now()) * 1000)::bigint);
  v_count  int;
  v_seen_k text[];
  v_seen_r numeric[];
  v_pref   text[] := '{}';
  v_reps   public.ce_rep_item[];
  v_strata text[];
  v_wts    bigint[];
  v_capu   int[];
  v_caps   int[];
  v_alloc  jsonb;
  v_keys   jsonb;
  v_reused int;
  v_n      int;
begin
  select count(*)::int into v_count
    from unnest(coalesce(p_pool, '{}')) p
   where p.type = any (v_types) and (coalesce(p_premium, false) or not coalesce(p.premium, false));
  if v_count > c_cap then
    return jsonb_build_object('ok', false, 'error', 'scope_too_large');
  end if;

  -- history: seen map (recency; larger = more recent)
  select coalesce(array_agg(k order by k), '{}'), coalesce(array_agg(r order by k), '{}')
    into v_seen_k, v_seen_r
    from (select k, max(r) r
            from (select case when jsonb_typeof(e) = 'array' then e ->> 0 else e #>> '{}' end k,
                          case when jsonb_typeof(e) = 'array' then (e ->> 1)::numeric else n::numeric end r
                    from jsonb_array_elements(coalesce(p_seen, '[]')) with ordinality x (e, n)) s
           where k is not null
           group by k) t;
  -- weakness-review: previously wrong items last seen > 24 h ago come first and are not avoided
  if p_template ->> 'kind' = 'weakness' and p_wrong is not null then
    v_pref := array(select e ->> 0 from jsonb_array_elements(p_wrong) e
                     where jsonb_typeof(e -> 1) = 'number' and v_now - (e ->> 1)::numeric > 86400000);
  end if;

  -- representatives: per exclusion group the unseen member with the smallest
  -- u("grp", group:key), or the smallest among all when every member was seen
  -- (a one-member group needs no draw)
  with seen_t as (
    select t.k, t.r from unnest(v_seen_k, v_seen_r) t (k, r) where not (t.k = any (v_pref))
  ), pool as (
    select p.key, p.lesson, p.band, coalesce(p.component, p.key) grp, p.stimulus, p.unit, p.chapter, p.term, p.topic,
           p.objective, (st.k is not null) seen, st.r recency
      from unnest(coalesce(p_pool, '{}')) p
      left join seen_t st on st.k = p.key
     where p.type = any (v_types) and (coalesce(p_premium, false) or not coalesce(p.premium, false))
  ), groups as (
    select grp, count(*) gsize, count(*) filter (where not seen) gfresh from pool group by grp
  ), multi as (
    -- only groups with several members need a draw (hash aggregate, no sort over the pool)
    select x.key from (
      select pool.key,
             row_number() over (partition by pool.grp collate "C"
                                order by (case when pool.seen and g.gfresh > 0 then 1 else 0 end),
                                         public._ce_u(p_seed, 'grp', pool.grp || ':' || pool.key), pool.key collate "C") rn
        from pool join groups g on g.grp = pool.grp and g.gsize > 1) x
     where x.rn = 1
  )
  select coalesce(array_agg(row(p.key, p.lesson, p.band, p.grp, p.stimulus,
                                case when v_kind = 'full_year' then coalesce(p.term, 'none') || '|' || coalesce(p.unit, p.topic, p.lesson)
                                     else case v_by
                                       when 'objective' then coalesce(p.objective, p.lesson)
                                       when 'lesson' then p.lesson
                                       when 'chapter' then coalesce(p.chapter, p.unit, p.topic, p.lesson)
                                       when 'unit' then coalesce(p.unit, p.topic, p.lesson)
                                       when 'topic' then coalesce(p.topic, p.lesson)
                                       else '*' end end,
                                p.seen, case when p.seen then p.recency end,
                                case when p.key = any (v_pref) then 0 else 1 end)::public.ce_rep_item), '{}')
    into v_reps
    from pool p
    join groups g on g.grp = p.grp
   where g.gsize = 1 or p.key in (select m.key from multi m);

  -- strata (C order) with weights and capacities
  select coalesce(array_agg(s.stratum order by s.stratum collate "C"), '{}'),
         coalesce(array_agg(case v_weight
                              when 'lesson_count' then s.lessons
                              when 'pool_size' then s.size
                              when 'error_rate' then round(coalesce((p_errors ->> s.stratum)::numeric, 0) * 1000)::bigint
                              else 1 end order by s.stratum collate "C"), '{}')
    into v_strata, v_wts
    from (select r.stratum, count(distinct r.lesson)::bigint lessons, count(*)::bigint size
            from unnest(v_reps) r group by 1) s;
  select coalesce(array_agg(coalesce(c.u, 0) order by g.ord, g.b), '{}'), coalesce(array_agg(coalesce(c.s, 0) order by g.ord, g.b), '{}')
    into v_capu, v_caps
    from (select x.id, x.ord, b.b from unnest(v_strata) with ordinality x (id, ord) cross join generate_series(1, 3) b (b)) g
    left join (select r.stratum, r.band, count(*) filter (where not r.seen)::int u, count(*) filter (where r.seen)::int s
                 from unnest(v_reps) r group by 1, 2) c
      on c.stratum = g.id and c.band = g.b;

  if p_retake is not null and jsonb_typeof(p_retake) = 'array' then
    v_alloc := public._ce_retake_allocation(p_retake, v_strata, v_capu, v_caps, p_seed, v_allow, v_share);
  else
    v_alloc := public._ce_allocate(p_n, v_mix, v_strata, v_wts, v_capu, v_caps, p_seed, v_minps, v_allow, v_share);
  end if;
  if (v_alloc ->> 'placed')::int < p_min then
    return jsonb_build_object('ok', false, 'error', 'insufficient_pool',
                              'available', (v_alloc ->> 'placed')::int, 'required', p_min);
  end if;

  -- step 8: pick per cell by (preferred, seen rank, u("sel"), key); a cell
  -- taken whole needs no draw. Step 9: order by u("ord"); stimulus blocks /
  -- strata stay contiguous.
  with quota as (
    select c ->> 0 cell, (c ->> 1)::int + (c ->> 2)::int q from jsonb_array_elements(v_alloc -> 'cells') c
  ), cand as (
    select r.*, r.stratum || '#' || r.band cell from unnest(v_reps) r
  ), csize as (
    select cand.cell, count(*) n from cand group by cand.cell
  ), sized as (
    select cand.*, quota.q, csize.n csize
      from cand join quota on quota.cell = cand.cell join csize on csize.cell = cand.cell
  ), ranked as (
    select sized.*,
           row_number() over (partition by cell collate "C"
                              order by pref, (case when seen then 1 else 0 end), coalesce(recency, 0),
                                       (case when seen or q >= csize then 0 else public._ce_u(p_seed, 'sel', key) end),
                                       key collate "C") rn
      from sized
  ), picked as (
    select key, seen, stratum, stimulus,
           row_number() over (order by public._ce_u(p_seed, 'ord', key), key collate "C") pos
      from ranked where rn <= q
  ), blocks as (
    select picked.*,
           case when v_order = 'by_stratum' then 's:' || stratum
                when v_order = 'shuffle_keep_stimulus' and stimulus is not null then 't:' || stimulus
                else 'k:' || key end blk
      from picked
  )
  select coalesce(jsonb_agg(to_jsonb(key) order by first_pos, inner_pos), '[]'::jsonb),
         count(*) filter (where seen)::int
    into v_keys, v_reused
    from (select blocks.*, min(pos) over (partition by blk) first_pos,
                 case when v_order = 'by_stratum' then pos
                      else row_number() over (partition by blk order by key collate "C") end inner_pos
            from blocks) o;

  v_n := case when p_retake is not null and jsonb_typeof(p_retake) = 'array' then (v_alloc ->> 'n')::int else p_n end;
  return jsonb_build_object(
    'ok', true,
    'keys', v_keys,
    'stored', v_alloc -> 'stored',
    'reused', v_reused > 0,
    'reused_count', v_reused,
    'short', jsonb_array_length(v_keys) < v_n,
    'lower_bound', coalesce((v_alloc ->> 'lower_bound')::boolean, false),
    'pool_size', v_count,
    'group_count', coalesce(cardinality(v_reps), 0),
    'allocation', v_alloc);
end
$$;

-- selectSession (§5.3 steps 2–10) over an explicit pool (jsonb rows).
--   p_pool     [{key, lesson, band, component, type, stimulus, premium, revision,
--                unit, chapter, term, topic, objective}]
--   p_seen     [[key, recency]…] or [key…] (most recent last)
--   p_wrong    [[key, last_seen_ms]…] (weakness-review)
--   p_retake   stored allocation [[cell, q]…] of the original attempt, or null
--   p_errors   {stratum: error rate 0..1} (weight error_rate)
-- → {ok:true, keys (session order), stored, reused, reused_count, short,
--    lower_bound, pool_size, group_count, allocation}
--   | {ok:false, error:"insufficient_pool", available, required} | {ok:false, error:"scope_too_large"}
create or replace function public._ce_select(
  p_template jsonb, p_n int, p_min int, p_seed text, p_pool jsonb,
  p_seen jsonb default null, p_wrong jsonb default null, p_retake jsonb default null,
  p_errors jsonb default null, p_now_ms bigint default null, p_premium boolean default false)
returns jsonb
language sql
stable
parallel safe
set search_path = ''
as $$
  select public._ce_select_rows(p_template, p_n, p_min, p_seed,
           array(select row(p.key, p.lesson, p.band, p.component, p.type, p.stimulus, p.premium, p.revision,
                            p.unit, p.chapter, p.term, p.topic, p.objective)::public.ce_pool_item
                   from jsonb_to_recordset(coalesce(p_pool, '[]')) p (key text, lesson text, band int, component text, type text,
                          stimulus text, premium boolean, revision int, unit text, chapter text, term text, topic text, objective text)),
           p_seen, p_wrong, p_retake, p_errors, p_now_ms, p_premium)
$$;


-- ── Safe option shuffling (§5.4) ────────────────────────────────────────────
-- patternFold: search normalization plus the removal of a bare hamza.
create or replace function public._ce_pattern_fold(p_text text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(replace(public.search_normalize_v2(p_text), U&'\0621', ''), ' +', ' ', 'g'))
$$;

-- "All / none of the above" and combined-option patterns.
create or replace function public._ce_has_fixed_pattern(p_text text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  -- the §5.4 patterns (كل ما سبق، جميع ما سبق، جميع الإجابات، لا شيء مما سبق، ليس مما سبق، (أ) و(ب)،
  -- all / none of the above, both a and b), stored already folded; the input is folded once
  select exists (
    select 1
      from (select ' ' || public._ce_pattern_fold(coalesce(p_text, '')) || ' ' t) f,
           unnest(array['كل ما سبق', 'جميع ما سبق', 'جميع الاجابات', 'لا شي مما سبق', 'ليس مما سبق', 'ا و ب',
                        'all of the above', 'none of the above', 'both a and b']) p
     where strpos(f.t, ' ' || p || ' ') > 0)
$$;

-- Seed-independent option facts of an mcq (§5.4), computed once at import
-- (questions.option_flags): {fixed: an option matches the all / none /
-- combined patterns, numeric_order: canonical indexes in ascending numeric
-- order when every option is a number, else null}.
create or replace function public._ce_option_flags(p_type text, p_public jsonb)
returns jsonb
language sql
stable
parallel safe
set search_path = ''
as $$
  select case when p_type <> 'mcq' then '{}'::jsonb else jsonb_build_object(
    'fixed', exists (select 1 from jsonb_array_elements(coalesce(p_public -> 'options', '[]')) o
                      where public._ce_has_fixed_pattern(o ->> 'text')),
    'numeric_order', case
      when jsonb_array_length(coalesce(p_public -> 'options', '[]')) > 0
       and not exists (select 1 from jsonb_array_elements(p_public -> 'options') o
                        where not (public._ce_parse_number(o -> 'text') ->> 'ok')::boolean)
      then (select jsonb_agg((n - 1)::int
                             order by ((pv.v ->> 'num')::numeric / (pv.v ->> 'den')::numeric), (o ->> 'id') collate "C")
              from jsonb_array_elements(p_public -> 'options') with ordinality e (o, n),
                   lateral (select public._ce_parse_number(o -> 'text') v offset 0) pv) end) end
$$;

alter table public.questions add column if not exists option_flags jsonb;

-- displayMaps(seed, item, {template, answerOrder}) → {choice_order} | {display_map} | {}.
-- choice_order[display] = canonical index (null = identity);
-- display_map.left/right/items[display] = canonical id. p_flags = the stored
-- _ce_option_flags (computed here when null).
drop function if exists public._ce_display_maps(text, text, text, jsonb, boolean, text, text, boolean, jsonb);
create or replace function public._ce_display_maps(
  p_seed text, p_key text, p_type text, p_public jsonb, p_shuffle boolean, p_fixed text, p_topic text,
  p_option_shuffle boolean default true, p_answer_order jsonb default null, p_flags jsonb default null)
returns jsonb
language plpgsql
stable
parallel safe
set search_path = ''
as $$
declare
  v_order int[];
  v_items jsonb;
  v_flags jsonb;
begin
  case p_type
  when 'mcq' then
    if coalesce(p_option_shuffle, true) is false
       or coalesce(p_shuffle, true) is false
       or p_fixed is not null
       or (p_public ->> 'fixed_order_reason') is not null
       or coalesce(p_topic, '') in ('comparison', 'contextual-error') then
      return '{"choice_order":null}';
    end if;
    v_flags := coalesce(p_flags, public._ce_option_flags(p_type, p_public));
    if coalesce((v_flags ->> 'fixed')::boolean, false) then
      return '{"choice_order":null}';
    end if;
    if jsonb_typeof(v_flags -> 'numeric_order') = 'array' then
      -- all-numeric options are shown ascending (deterministic)
      v_order := array(select x::int from jsonb_array_elements_text(v_flags -> 'numeric_order') x);
    else
      v_order := array(
        select (n - 1)::int
          from jsonb_array_elements(p_public -> 'options') with ordinality e (o, n)
         order by public._ce_u(p_seed, 'opt:' || p_key, o ->> 'id'), (o ->> 'id') collate "C");
    end if;
    if v_order = array(select g - 1 from generate_series(1, cardinality(v_order)) g) then
      return '{"choice_order":null}';
    end if;
    return jsonb_build_object('choice_order', to_jsonb(v_order));
  when 'true_false' then
    return '{"choice_order":null}';
  when 'matching' then
    return jsonb_build_object('display_map', jsonb_build_object(
      'left', coalesce((select jsonb_agg(o -> 'id' order by public._ce_u(p_seed, 'optl:' || p_key, o ->> 'id'), (o ->> 'id') collate "C")
                          from jsonb_array_elements(coalesce(p_public -> 'left', '[]')) o), '[]'::jsonb),
      'right', coalesce((select jsonb_agg(o -> 'id' order by public._ce_u(p_seed, 'optr:' || p_key, o ->> 'id'), (o ->> 'id') collate "C")
                           from jsonb_array_elements(coalesce(p_public -> 'right', '[]')) o), '[]'::jsonb)));
  when 'ordering' then
    -- Never a function of the answer: p_answer_order is accepted (signature)
    -- and ignored. Swapping the first two items when the shuffle equalled the
    -- answer made the answer the one arrangement never shown (and the swapped
    -- one twice as frequent), readable across attempts before submitting.
    v_items := coalesce((select jsonb_agg(o -> 'id' order by public._ce_u(p_seed, 'opt:' || p_key, o ->> 'id'), (o ->> 'id') collate "C")
                           from jsonb_array_elements(coalesce(p_public -> 'items', '[]')) o), '[]'::jsonb);
    return jsonb_build_object('display_map', jsonb_build_object('items', v_items));
  else
    return '{}';
  end case;
end
$$;

-- publicQuestion (§5.7): display indexes only — no option / left / right /
-- item ids, answers, explanations, sources or hashes.
create or replace function public._ce_public_question(
  p_position int, p_key text, p_type text, p_language text, p_stem text, p_stimulus text, p_public jsonb,
  p_choice_order smallint[], p_display_map jsonb, p_time_limit int, p_lesson_id text, p_lesson_title text)
returns jsonb
language sql
immutable
parallel safe
set search_path = ''
as $$
  with opts as (
    select coalesce(jsonb_agg(jsonb_build_object('index', d.ord - 1, 'text', coalesce(p_public #>> array['options', d.idx::text], ''))
                              order by d.ord), '[]'::jsonb) options
      from (select x.ord, coalesce(p_choice_order[x.ord], x.ord - 1) idx
              from generate_series(1, jsonb_array_length(coalesce(p_public -> 'options', '[]'))) x (ord)) d
     where p_type in ('mcq', 'true_false')
  ), idx_of as (
    select (select coalesce(jsonb_agg(jsonb_build_object('index', e.n - 1,
                                        'text', coalesce((select o ->> 'text' from jsonb_array_elements(p_public -> col) o
                                                           where o ->> 'id' = e.id #>> '{}' limit 1), ''))
                                      order by e.n), '[]'::jsonb)
              from jsonb_array_elements(coalesce(p_display_map -> col, '[]')) with ordinality e (id, n)) list,
           col
      from unnest(array['left', 'right', 'items']) col
  )
  select jsonb_build_object(
    'position', p_position,
    'key', p_key,
    'type', p_type,
    'language', coalesce(p_language, 'ar'),
    'stem', p_stem,
    'stimulus', case when p_stimulus is null then null else jsonb_build_object('text', p_stimulus) end,
    'options', case when p_type in ('mcq', 'true_false') then (select options from opts) else '[]'::jsonb end,
    'choices', case when p_type in ('mcq', 'true_false')
                    then (select coalesce(jsonb_agg(o -> 'text' order by (o ->> 'index')::int), '[]'::jsonb)
                            from jsonb_array_elements((select options from opts)) o)
                    else '[]'::jsonb end,
    'public', case p_type
      when 'matching' then jsonb_build_object('left', (select list from idx_of where col = 'left'),
                                              'right', (select list from idx_of where col = 'right'),
                                              'scoring', coalesce(p_public -> 'scoring', '"partial"'::jsonb))
      when 'ordering' then jsonb_build_object('items', (select list from idx_of where col = 'items'),
                                              'criterion', coalesce(p_public -> 'criterion', '"other"'::jsonb))
      when 'short_answer' then jsonb_build_object('max_chars', coalesce(p_public -> 'max_chars', '80'::jsonb))
      when 'numeric' then jsonb_build_object(
        'unit', case when jsonb_typeof(p_public -> 'unit') = 'object'
                     then jsonb_build_object('text', p_public #> '{unit,text}',
                                             'required', coalesce((p_public #>> '{unit,required}')::boolean, false))
                     else 'null'::jsonb end,
        'input', jsonb_build_object(
          'allow_fraction', coalesce(p_public #> '{input,allow_fraction}', 'true'::jsonb) <> 'false'::jsonb,
          'max_decimals', case when jsonb_typeof(p_public #> '{input,max_decimals}') = 'number'
                               then p_public #> '{input,max_decimals}' else 'null'::jsonb end))
      else '{}'::jsonb end,
    'time_limit_seconds', p_time_limit,
    'lesson', case when p_lesson_id is null then null else jsonb_build_object('id', p_lesson_id, 'title', p_lesson_title) end)
$$;

-- display ↔ canonical (engine/grade.js). A display response is parsed
-- strictly, then mapped through choice_order / display_map.
create or replace function public._ce_parse_display(p_type text, p_raw jsonb)
returns jsonb
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v jsonb;
begin
  if p_raw is null or jsonb_typeof(p_raw) = 'null' then
    return '{"ok":true,"response":null}';
  end if;
  if jsonb_typeof(p_raw) <> 'object' then
    return '{"ok":false,"reason":"bad_shape"}';
  end if;
  case p_type
  when 'mcq', 'true_false' then
    if exists (select 1 from jsonb_object_keys(p_raw) k where k <> 'option_index') then
      return '{"ok":false,"reason":"bad_shape"}';
    end if;
    v := p_raw -> 'option_index';
    if v is null or jsonb_typeof(v) = 'null' then
      return '{"ok":true,"response":null}';
    end if;
    if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric)
       or (v #>> '{}')::numeric < 0 or (v #>> '{}')::numeric >= 64 then
      return '{"ok":false,"reason":"bad_index"}';
    end if;
    return jsonb_build_object('ok', true, 'response', jsonb_build_object('option_index', (v #>> '{}')::numeric::int));
  when 'matching' then
    if exists (select 1 from jsonb_object_keys(p_raw) k where k <> 'pairs') then
      return '{"ok":false,"reason":"bad_shape"}';
    end if;
    v := p_raw -> 'pairs';
    if v is null or jsonb_typeof(v) = 'null' then
      return '{"ok":true,"response":null}';
    end if;
    if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 12 then
      return '{"ok":false,"reason":"bad_shape"}';
    end if;
    if exists (select 1 from jsonb_array_elements(v) p
                where jsonb_typeof(p) <> 'array' or jsonb_array_length(p) <> 2
                   or exists (select 1 from jsonb_array_elements(p) i
                               where jsonb_typeof(i) <> 'number' or (i #>> '{}')::numeric <> trunc((i #>> '{}')::numeric)
                                  or (i #>> '{}')::numeric < 0 or (i #>> '{}')::numeric >= 64)) then
      return '{"ok":false,"reason":"bad_index"}';
    end if;
    if jsonb_array_length(v) = 0 then
      return '{"ok":true,"response":null}';
    end if;
    return jsonb_build_object('ok', true, 'response', jsonb_build_object('pairs',
      (select jsonb_agg(jsonb_build_array((p ->> 0)::numeric::int, (p ->> 1)::numeric::int) order by n)
         from jsonb_array_elements(v) with ordinality e (p, n))));
  when 'ordering' then
    if exists (select 1 from jsonb_object_keys(p_raw) k where k <> 'order') then
      return '{"ok":false,"reason":"bad_shape"}';
    end if;
    v := p_raw -> 'order';
    if v is null or jsonb_typeof(v) = 'null' then
      return '{"ok":true,"response":null}';
    end if;
    if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 12
       or exists (select 1 from jsonb_array_elements(v) i
                   where jsonb_typeof(i) <> 'number' or (i #>> '{}')::numeric <> trunc((i #>> '{}')::numeric)
                      or (i #>> '{}')::numeric < 0 or (i #>> '{}')::numeric >= 64) then
      return '{"ok":false,"reason":"bad_index"}';
    end if;
    if jsonb_array_length(v) = 0 then
      return '{"ok":true,"response":null}';
    end if;
    return jsonb_build_object('ok', true, 'response', jsonb_build_object('order',
      (select jsonb_agg((i #>> '{}')::numeric::int order by n) from jsonb_array_elements(v) with ordinality e (i, n))));
  when 'short_answer' then
    if exists (select 1 from jsonb_object_keys(p_raw) k where k <> 'text') then
      return '{"ok":false,"reason":"bad_shape"}';
    end if;
    v := p_raw -> 'text';
    if v is null or jsonb_typeof(v) = 'null' then
      return '{"ok":true,"response":null}';
    end if;
    if jsonb_typeof(v) <> 'string' or char_length(v #>> '{}') > 400 then
      return '{"ok":false,"reason":"too_long"}';
    end if;
    if public._ce_js_trim(v #>> '{}') = '' then
      return '{"ok":true,"response":null}';
    end if;
    return jsonb_build_object('ok', true, 'response', jsonb_build_object('text', v));
  when 'numeric' then
    if exists (select 1 from jsonb_object_keys(p_raw) k where k not in ('value', 'unit')) then
      return '{"ok":false,"reason":"bad_shape"}';
    end if;
    v := p_raw -> 'value';
    if public._ce_blank(v) then
      return '{"ok":true,"response":null}';
    end if;
    if jsonb_typeof(v) not in ('string', 'number') or char_length(v #>> '{}') > 64 then
      return '{"ok":false,"reason":"bad_shape"}';
    end if;
    if p_raw ? 'unit' and jsonb_typeof(p_raw -> 'unit') <> 'null'
       and (jsonb_typeof(p_raw -> 'unit') <> 'string' or char_length(p_raw ->> 'unit') > 40) then
      return '{"ok":false,"reason":"bad_shape"}';
    end if;
    return jsonb_build_object('ok', true, 'response',
      case when coalesce(p_raw ->> 'unit', '') <> '' then jsonb_build_object('value', v, 'unit', p_raw -> 'unit')
           else jsonb_build_object('value', v) end);
  else
    return '{"ok":false,"reason":"unknown_type"}';
  end case;
end
$$;

-- toCanonical: display response → canonical ids. → {ok, response} | {ok:false, reason}
create or replace function public._ce_to_canonical(p_type text, p_public jsonb, p_choice_order smallint[],
                                                   p_display_map jsonb, p_display jsonb)
returns jsonb
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  n    int;
  c    int;
  el   jsonb;
  out_ jsonb := '[]'::jsonb;
begin
  if p_display is null or jsonb_typeof(p_display) = 'null' then
    return '{"ok":true,"response":null}';
  end if;
  case p_type
  when 'mcq', 'true_false' then
    n := jsonb_array_length(coalesce(p_public -> 'options', '[]'));
    c := (p_display ->> 'option_index')::int;
    if c >= n then
      return '{"ok":false,"reason":"index_out_of_range"}';
    end if;
    c := coalesce(p_choice_order[c + 1], c);
    if c is null or c >= n then
      return '{"ok":false,"reason":"index_out_of_range"}';
    end if;
    return jsonb_build_object('ok', true, 'response', jsonb_build_object('option_id', p_public #> array['options', c::text, 'id']));
  when 'matching' then
    for el in select value from jsonb_array_elements(p_display -> 'pairs') loop
      if (el ->> 0)::int >= jsonb_array_length(coalesce(p_display_map -> 'left', '[]'))
         or (el ->> 1)::int >= jsonb_array_length(coalesce(p_display_map -> 'right', '[]')) then
        return '{"ok":false,"reason":"index_out_of_range"}';
      end if;
      out_ := out_ || jsonb_build_array(jsonb_build_array(p_display_map -> 'left' -> ((el ->> 0)::int),
                                                          p_display_map -> 'right' -> ((el ->> 1)::int)));
    end loop;
    return jsonb_build_object('ok', true, 'response', jsonb_build_object('pairs', out_));
  when 'ordering' then
    for el in select value from jsonb_array_elements(p_display -> 'order') loop
      if (el #>> '{}')::int >= jsonb_array_length(coalesce(p_display_map -> 'items', '[]')) then
        return '{"ok":false,"reason":"index_out_of_range"}';
      end if;
      out_ := out_ || jsonb_build_array(p_display_map -> 'items' -> ((el #>> '{}')::int));
    end loop;
    return jsonb_build_object('ok', true, 'response', jsonb_build_object('order', out_));
  when 'short_answer', 'numeric' then
    return jsonb_build_object('ok', true, 'response', p_display);
  else
    return '{"ok":false,"reason":"unknown_type"}';
  end case;
end
$$;

-- toDisplay: canonical response → display indexes (results, resume).
create or replace function public._ce_to_display(p_type text, p_public jsonb, p_choice_order smallint[],
                                                 p_display_map jsonb, p_canonical jsonb)
returns jsonb
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  c int;
  d int;
begin
  if p_canonical is null or jsonb_typeof(p_canonical) = 'null' then
    return null;
  end if;
  case p_type
  when 'mcq', 'true_false' then
    select (n - 1)::int into c
      from jsonb_array_elements(coalesce(p_public -> 'options', '[]')) with ordinality e (o, n)
     where o ->> 'id' = p_canonical ->> 'option_id' limit 1;
    if c is null then
      return null;
    end if;
    d := case when p_choice_order is null then c else array_position(p_choice_order, c::smallint) - 1 end;
    return jsonb_build_object('option_index', d);
  when 'matching' then
    return jsonb_build_object('pairs', coalesce((
      select jsonb_agg(jsonb_build_array(l, r) order by l)
        from (select coalesce((select (n - 1)::int from jsonb_array_elements(p_display_map -> 'left') with ordinality x (id, n)
                                where x.id = p -> 0 limit 1), -1) l,
                     coalesce((select (n - 1)::int from jsonb_array_elements(p_display_map -> 'right') with ordinality x (id, n)
                                where x.id = p -> 1 limit 1), -1) r
                from jsonb_array_elements(coalesce(p_canonical -> 'pairs', '[]')) p) t), '[]'::jsonb));
  when 'ordering' then
    return jsonb_build_object('order', coalesce((
      select jsonb_agg(coalesce((select (n - 1)::int from jsonb_array_elements(p_display_map -> 'items') with ordinality x (id, n)
                                  where x.id = i limit 1), -1) order by k)
        from jsonb_array_elements(coalesce(p_canonical -> 'order', '[]')) with ordinality e (i, k)), '[]'::jsonb));
  when 'short_answer', 'numeric' then
    return p_canonical;
  else
    return null;
  end case;
end
$$;

revoke all on function public._ce_pattern_fold(text)                                       from public, anon, authenticated;
revoke all on function public._ce_has_fixed_pattern(text)                                  from public, anon, authenticated;
revoke all on function public._ce_option_flags(text, jsonb) from public, anon, authenticated;
revoke all on function public._ce_display_maps(text, text, text, jsonb, boolean, text, text, boolean, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public._ce_public_question(int, text, text, text, text, text, jsonb, smallint[], jsonb, int, text, text)
  from public, anon, authenticated;
revoke all on function public._ce_parse_display(text, jsonb)                               from public, anon, authenticated;
revoke all on function public._ce_to_canonical(text, jsonb, smallint[], jsonb, jsonb)      from public, anon, authenticated;
revoke all on function public._ce_to_display(text, jsonb, smallint[], jsonb, jsonb)        from public, anon, authenticated;
revoke all on function public._ce_stratum(jsonb, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public._ce_select(jsonb, int, int, text, jsonb, jsonb, jsonb, jsonb, jsonb, bigint, boolean)
  from public, anon, authenticated;
revoke all on function public._ce_select_rows(jsonb, int, int, text, public.ce_pool_item[], jsonb, jsonb, jsonb, jsonb, bigint, boolean)
  from public, anon, authenticated;

-- ============================================================================
-- F) SESSION HELPERS — templates, scopes, tier plans, pools, history
-- ============================================================================

-- P0001 with MESSAGE = code and DETAIL = JSON (null → no detail).
create or replace function public._ce_raise(p_code text, p_detail jsonb default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_detail is null then
    raise exception using message = p_code;
  end if;
  raise exception using message = p_code, detail = p_detail::text;
end
$$;

-- Unit openers («مدخل وحدة») never enter a pool (§2.5).
alter table public.curriculum_nodes add column if not exists unit_opener boolean not null default false;

-- Stem normalization v2 for the lesson-level question search (never granted).
alter table public.questions add column if not exists stem_norm text
  generated always as (public.search_normalize_v2(stem)) stored;
select public._create_trgm_index('questions_stem_norm_v2_gin_idx', 'public.questions', 'stem_norm');

-- Latest active version of a template (or the given version) → definition | null.
create or replace function public._ce_template(p_id text, p_version int default null)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select t.definition
    from public.exam_templates t
   where t.id = p_id and t.is_active and (p_version is null or t.version = p_version)
   order by t.version desc
   limit 1
$$;

-- Scope grammar (§2.12) → {type:"node", node, term} | {type:"prep", node, exam,
-- section, topic} | {type:"weak", node} | null. Strict, like scope.js parseScope.
create or replace function public._ce_parse_scope(p_scope text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  c_slug  constant text := '^[a-z0-9]+(-[a-z0-9]+)*$';
  v_parts text[];
  v_node  text;
  v_term  text;
  v_at    int;
begin
  if p_scope is null or p_scope = '' or char_length(p_scope) > 200 then
    return null;
  end if;
  if left(p_scope, 5) = 'prep:' then
    v_parts := string_to_array(substr(p_scope, 6), '/');
    if cardinality(v_parts) not between 1 and 3
       or exists (select 1 from unnest(v_parts) x where x !~ c_slug) then
      return null;
    end if;
    if v_parts[1] not in ('aptitude', 'achievement') then
      return null;
    end if;
    if cardinality(v_parts) >= 2 and public.exam_of_section(v_parts[2]) is distinct from v_parts[1] then
      return null;
    end if;
    if cardinality(v_parts) = 3 and not (v_parts[3] = any (public.exam_section_topics(v_parts[2]))) then
      return null;
    end if;
    return jsonb_build_object('type', 'prep', 'raw', p_scope, 'node', p_scope, 'exam', v_parts[1],
                              'section', v_parts[2], 'topic', v_parts[3]);
  end if;
  if left(p_scope, 5) = 'weak:' then
    v_node := nullif(substr(p_scope, 6), '');
    if v_node is not null and not public._ce_is_node_id(v_node) then
      return null;
    end if;
    return jsonb_build_object('type', 'weak', 'raw', p_scope, 'node', v_node);
  end if;
  v_at := strpos(p_scope, '@');
  v_node := case when v_at = 0 then p_scope else left(p_scope, v_at - 1) end;
  v_term := case when v_at = 0 then null else substr(p_scope, v_at + 1) end;
  if v_term is not null and v_term not in ('t1', 't2', 'year') then
    return null;
  end if;
  if not public._ce_is_node_id(v_node) then
    return null;
  end if;
  return jsonb_build_object('type', 'node', 'raw', p_scope, 'node', v_node, 'term', v_term);
end
$$;

-- Eligible lessons under a node (§5.3 step 1): verified, not unit openers;
-- for t1 / t2 only lessons of that term (or both) with verified / inferred
-- term status. unit / chapter = nearest ancestors (like scope.js).
create or replace function public._ce_scope_lessons(p_node text, p_term text default null)
returns table (lesson text, title text, unit text, chapter text, term text, term_status text)
language sql
stable
set search_path = ''
as $$
  with recursive down as (
    select n.id, n.kind, n.status, n.unit_opener, n.title_ar, n.term, n.term_status
      from public.curriculum_nodes n
     where n.id = p_node
    union all
    select c.id, c.kind, c.status, c.unit_opener, c.title_ar, c.term, c.term_status
      from public.curriculum_nodes c
      join down d on c.parent_id = d.id
     where d.kind <> 'lesson' and c.kind <> 'term'
  ), lessons as (
    select * from down
     where kind = 'lesson' and status = 'verified' and not unit_opener
       and (p_term is null or p_term not in ('t1', 't2')
            or ((term = p_term or term = 'both') and term_status in ('verified', 'inferred')))
  ), up as (
    select l.id lesson, n.id anc, n.kind, n.parent_id, 0 depth
      from lessons l join public.curriculum_nodes n on n.id = l.id
    union all
    select up.lesson, p.id, p.kind, p.parent_id, up.depth + 1
      from up join public.curriculum_nodes p on p.id = up.parent_id
     where up.kind <> 'subject' and up.depth < 8
  )
  -- nearest unit / chapter ancestor per lesson, aggregated once (a correlated
  -- subquery per lesson rescans the whole CTE: quadratic at a grade scope)
  , anc as (
    select u.lesson,
           (array_agg(u.anc order by u.depth) filter (where u.kind = 'unit'))[1] unit,
           (array_agg(u.anc order by u.depth) filter (where u.kind = 'chapter'))[1] chapter
      from up u
     group by u.lesson
  )
  select l.id, l.title_ar, a.unit, a.chapter, l.term, l.term_status
    from lessons l
    left join anc a on a.lesson = l.id
$$;

-- tierMax (exam-templates.js).
create or replace function public._ce_tier_max(p_t jsonb, p_tier text)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p_tier
    when 'guest' then least((p_t #>> '{count,max}')::int,
                            coalesce((p_t #>> '{count,guest_max}')::int, (p_t #>> '{count,max}')::int))
    when 'free' then least((p_t #>> '{count,max}')::int,
                           coalesce((p_t #>> '{count,free_max}')::int, (p_t #>> '{count,max}')::int))
    else (p_t #>> '{count,max}')::int end
$$;

-- planCount (exam-templates.js): tier clamping and mini versions (§5.3).
create or replace function public._ce_plan_count(p_t jsonb, p_tier text, p_requested int)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_cap  int := public._ce_tier_max(p_t, p_tier);
  v_min  int := (p_t #>> '{count,min}')::int;
  v_max  int := (p_t #>> '{count,max}')::int;
  v_mini int := nullif(p_t #>> '{count,mini}', '')::int;
  v_want int;
  v_n    int;
begin
  if p_requested is not null and (p_requested < 1 or p_requested > v_max) then
    return '{"ok":false,"error":"invalid_argument","field":"count"}';
  end if;
  if v_cap < v_min then
    if v_mini is null or v_mini <= 0 then
      return '{"ok":false,"error":"premium_required"}';
    end if;
    v_n := least(v_mini, v_cap);
    return jsonb_build_object('ok', true, 'n', v_n, 'mini', true, 'limited', true,
                              'requested', coalesce(p_requested, (p_t #>> '{count,default}')::int),
                              'min_required', v_n);
  end if;
  v_want := coalesce(p_requested, (p_t #>> '{count,default}')::int);
  if v_want < v_min then
    return '{"ok":false,"error":"invalid_argument","field":"count"}';
  end if;
  v_n := least(v_want, v_cap);
  return jsonb_build_object('ok', true, 'n', v_n, 'mini', false, 'limited', v_n < v_want,
                            'requested', v_want, 'min_required', least(v_min, v_n));
end
$$;

-- planTiming (exam-templates.js): timed = n × s/q clamped to the template's
-- and the table's bounds; untimed = 7 days.
create or replace function public._ce_plan_timing(p_t jsonb, p_n int, p_mode text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_mode text := coalesce(p_mode, p_t #>> '{timing,mode}');
  v_secs int;
begin
  if v_mode not in ('timed', 'untimed') then
    return '{"ok":false,"error":"invalid_argument","field":"timing"}';
  end if;
  if v_mode <> (p_t #>> '{timing,mode}') and not coalesce((p_t #>> '{timing,user_may_change}')::boolean, false) then
    return '{"ok":false,"error":"invalid_argument","field":"timing"}';
  end if;
  if v_mode = 'untimed' then
    return jsonb_build_object('ok', true, 'mode', v_mode, 'seconds', 604800,
                              'grace_seconds', coalesce((p_t #>> '{timing,grace_seconds}')::int, 30));
  end if;
  v_secs := p_n * coalesce(nullif(p_t #>> '{timing,seconds_per_question}', '')::int, 60);
  if nullif(p_t #>> '{timing,min_seconds}', '') is not null then
    v_secs := greatest(v_secs, (p_t #>> '{timing,min_seconds}')::int);
  end if;
  if nullif(p_t #>> '{timing,max_seconds}', '') is not null then
    v_secs := least(v_secs, (p_t #>> '{timing,max_seconds}')::int);
  end if;
  v_secs := least(greatest(v_secs, 60), 14400);
  return jsonb_build_object('ok', true, 'mode', v_mode, 'seconds', v_secs,
                            'grace_seconds', coalesce((p_t #>> '{timing,grace_seconds}')::int, 30));
end
$$;

-- Resolve a parsed scope for a template and tier (§5.3 step 1, caps §5.8):
-- → {ok, kind, node, title, lessons:[{lesson,title,unit,chapter,term}], prefix}
--   | {ok:false, error[, field]}. weak: scopes need the learner (p_uid).
create or replace function public._ce_resolve_scope(p_parsed jsonb, p_template jsonb, p_tier text, p_uid uuid default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_node    public.curriculum_nodes%rowtype;
  v_kind    text;
  v_term    text := p_parsed ->> 'term';
  v_lessons jsonb;
begin
  if p_parsed is null then
    return '{"ok":false,"error":"invalid_argument","field":"scope"}';
  end if;
  if p_parsed ->> 'type' = 'prep' then
    v_kind := case when p_parsed ->> 'topic' is not null then 'prep_topic'
                   when p_parsed ->> 'section' is not null then 'prep_section' else 'prep' end;
  elsif p_parsed ->> 'type' = 'weak' then
    v_kind := 'weak';
    if p_uid is null then
      return '{"ok":false,"error":"invalid_argument","field":"scope"}';
    end if;
    if p_parsed ->> 'node' is not null
       and not exists (select 1 from public.curriculum_nodes n
                        where n.id = p_parsed ->> 'node' and n.kind <> 'term'
                          and n.status not in ('source_only', 'unavailable')) then
      return '{"ok":false,"error":"scope_not_found"}';
    end if;
  else
    select * into v_node from public.curriculum_nodes n where n.id = p_parsed ->> 'node';
    if not found or v_node.kind = 'term' or v_node.status in ('source_only', 'unavailable') then
      return '{"ok":false,"error":"scope_not_found"}';
    end if;
    if v_term is not null and v_node.kind <> 'subject' then
      return '{"ok":false,"error":"invalid_argument","field":"scope"}';
    end if;
    v_kind := case when v_term is null then v_node.kind else v_node.kind || '@' || v_term end;
  end if;

  if p_template is not null and not (p_template -> 'scope_kinds') ? v_kind then
    return '{"ok":false,"error":"invalid_argument","field":"scope"}';
  end if;
  if p_tier = 'guest' and split_part(v_kind, '@', 1) in ('stage', 'grade', 'track', 'prep') then
    return '{"ok":false,"error":"scope_too_large"}';
  end if;

  if p_parsed ->> 'type' = 'prep' then
    return jsonb_build_object('ok', true, 'kind', v_kind, 'node', p_parsed ->> 'node', 'title', null,
                              'lessons', '[]'::jsonb, 'prefix', p_parsed ->> 'node');
  end if;
  if p_parsed ->> 'type' = 'weak' then
    -- the learner's ≤ 20 weakest lessons (answered ≥ 5, Wilson lower bound ascending)
    select coalesce(jsonb_agg(jsonb_build_object('lesson', l.lesson, 'title', l.title, 'unit', l.unit,
                                                 'chapter', l.chapter, 'term', l.term) order by w.wl, w.node_id collate "C"), '[]'::jsonb)
      into v_lessons
      from (select s.node_id, public._ce_wilson(s.correct, s.answered) wl
              from public.learner_node_stats s
              join public.curriculum_nodes n on n.id = s.node_id and n.kind = 'lesson'
             where s.user_id = p_uid and s.answered >= 5
               and (p_parsed ->> 'node' is null or s.node_id = p_parsed ->> 'node'
                    or s.node_id in (select x.lesson from public._ce_scope_lessons(p_parsed ->> 'node') x))
             order by 2, s.node_id collate "C"
             limit 20) w
      join lateral public._ce_scope_lessons(w.node_id) l on true;
    return jsonb_build_object('ok', true, 'kind', v_kind, 'node', p_parsed ->> 'node', 'title', null,
                              'lessons', v_lessons, 'prefix', null);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('lesson', l.lesson, 'title', l.title, 'unit', l.unit,
                                               'chapter', l.chapter, 'term', l.term)), '[]'::jsonb)
    into v_lessons
    from public._ce_scope_lessons(v_node.id, v_term) l;
  return jsonb_build_object('ok', true, 'kind', v_kind, 'node', v_node.id, 'title', v_node.title_ar,
                            'lessons', v_lessons, 'prefix', null);
end
$$;

-- Wilson lower bound (z = 1.645) of an accuracy, 4 decimals (§2.14).
create or replace function public._ce_wilson(p_correct numeric, p_answered numeric)
returns numeric
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case when coalesce(p_answered, 0) <= 0 then null else round(
    ((p_correct / p_answered) + 1.645 ^ 2 / (2 * p_answered)
     - 1.645 * sqrt(greatest(0, (p_correct / p_answered) * (1 - p_correct / p_answered) / p_answered
                                 + 1.645 ^ 2 / (4 * p_answered ^ 2))))
    / (1 + 1.645 ^ 2 / p_answered), 4) end
$$;

-- The pool of a resolved scope (§5.3 step 2) as selection rows, read from
-- scope_pool_members (never from the whole bank). null = more than 5,000
-- eligible items (scope_too_large).
drop function if exists public._ce_pool(jsonb, jsonb, boolean);
create or replace function public._ce_pool(p_res jsonb, p_template jsonb, p_premium boolean)
returns public.ce_pool_item[]
language plpgsql
stable
set search_path = ''
as $$
declare
  c_cap   constant int := 5000;
  v_types text[] := array(select jsonb_array_elements_text(coalesce(p_template -> 'types', '[]')));
  v_n     int;
begin
  if p_res ->> 'prefix' is not null then
    select count(*)::int into v_n
      from public.scope_pool_members m
     where (m.lesson_node_id = p_res ->> 'prefix' or m.lesson_node_id like (p_res ->> 'prefix') || '/%')
       and m.question_type = any (v_types) and (p_premium or not m.is_premium);
    if v_n > c_cap then
      return null;
    end if;
    return array(
      select row(m.question_key, m.lesson_node_id, m.band::int, m.component, m.question_type, m.stimulus_id, m.is_premium,
                 m.revision, null, null, null, nullif(split_part(m.lesson_node_id, '/', 3), ''), m.objective_id)::public.ce_pool_item
        from public.scope_pool_members m
       where (m.lesson_node_id = p_res ->> 'prefix' or m.lesson_node_id like (p_res ->> 'prefix') || '/%')
         and m.question_type = any (v_types) and (p_premium or not m.is_premium));
  end if;
  select count(*)::int into v_n
    from jsonb_to_recordset(coalesce(p_res -> 'lessons', '[]')) l (lesson text)
    join public.scope_pool_members m on m.lesson_node_id = l.lesson
   where m.question_type = any (v_types) and (p_premium or not m.is_premium);
  if v_n > c_cap then
    return null;
  end if;
  return array(
    select row(m.question_key, m.lesson_node_id, m.band::int, m.component, m.question_type, m.stimulus_id, m.is_premium,
               m.revision, l.unit, l.chapter, l.term, null, m.objective_id)::public.ce_pool_item
      from jsonb_to_recordset(coalesce(p_res -> 'lessons', '[]')) l (lesson text, unit text, chapter text, term text)
      join public.scope_pool_members m on m.lesson_node_id = l.lesson
     where m.question_type = any (v_types) and (p_premium or not m.is_premium));
end
$$;

-- Learner history H (§5.3 step 3): seen = items of the last
-- avoid_last_attempts attempts of the same template kind, or seen within
-- avoid_days; recency = epoch ms. wrong = items last answered wrong.
create or replace function public._ce_history(p_uid uuid, p_template jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'seen', coalesce((
      select jsonb_agg(jsonb_build_array(s.key, s.ms) order by s.key collate "C")
        from (select x.key, max(x.ms) ms
                from (select q.key, (extract(epoch from a.started_at) * 1000)::bigint ms
                        from (select a0.id, a0.started_at
                                from public.exam_attempts a0
                               where a0.user_id = p_uid and a0.template_id is not null
                                 and a0.meta ->> 'template_kind' = p_template ->> 'kind'
                               order by a0.started_at desc
                               limit greatest(coalesce((p_template #>> '{retry,avoid_last_attempts}')::int, 0), 0)) a
                        join public.exam_attempt_items i on i.attempt_id = a.id
                        join public.questions q on q.id = i.question_id
                      union all
                      select q.key, (extract(epoch from s0.last_seen_at) * 1000)::bigint
                        from public.learner_question_stats s0
                        join public.questions q on q.id = s0.question_id
                       where s0.user_id = p_uid
                         and s0.last_seen_at > now() - make_interval(days => coalesce((p_template #>> '{retry,avoid_days}')::int, 0))) x
               group by x.key) s), '[]'::jsonb),
    'wrong', case when p_template ->> 'kind' = 'weakness' then coalesce((
      select jsonb_agg(jsonb_build_array(q.key, (extract(epoch from s1.last_seen_at) * 1000)::bigint) order by q.key collate "C")
        from public.learner_question_stats s1
        join public.questions q on q.id = s1.question_id
       where s1.user_id = p_uid and s1.last_correct is false), '[]'::jsonb) end,
    'errors', case when p_template #>> '{coverage,weight}' = 'error_rate' then coalesce((
      select jsonb_object_agg(s2.node_id, round((s2.answered - s2.correct)::numeric / s2.answered, 6))
        from public.learner_node_stats s2
       where s2.user_id = p_uid and s2.answered > 0), '{}'::jsonb) end)
$$;

-- The content of an attempt item at the revision that was served: the
-- current row, or the question_revisions snapshot when it changed (§5.8).
create or replace function public._ce_item_content(p_qid uuid, p_revision int)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case
    when r.question_id is not null then jsonb_build_object(
      'type', r.question_type, 'language', r.language, 'stem', r.stem, 'stimulus', r.stimulus_text,
      'public', r.payload_public, 'payload', r.answer, 'explanation', r.explanation, 'accepted_norm', null,
      'revision', r.revision, 'current', false)
    else jsonb_build_object(
      'type', q.question_type, 'language', q.language, 'stem', q.stem,
      'stimulus', coalesce((select st.text from public.question_stimuli st where st.id = q.stimulus_id), q.passage),
      'public', q.payload_public, 'payload', k.answer,
      'explanation', jsonb_build_object('text', k.explanation, 'steps', coalesce(k.explanation_steps, '[]'::jsonb)),
      'accepted_norm', to_jsonb(k.accepted_norm), 'revision', q.revision, 'current', true)
  end
  from public.questions q
  left join public.question_keys k on k.question_id = q.id
  left join public.question_revisions r
         on r.question_id = q.id and r.revision = p_revision and p_revision is distinct from q.revision
  where q.id = p_qid
$$;

-- The lesson (or prep topic) of a question and its title.
create or replace function public._ce_item_lesson(p_qid uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', coalesce(q.lesson_node_id, 'prep:' || q.exam || '/' || q.section || '/' || q.topic),
    'title', n.title_ar,
    'term', n.term,
    'href', case when q.lesson_node_id is null then null else '/learn/' || q.lesson_node_id end)
  from public.questions q
  left join public.curriculum_nodes n on n.id = q.lesson_node_id
  where q.id = p_qid
$$;

-- Source link-out of a question (§5.7): book title, printed pages, #page.
create or replace function public._ce_item_source(p_qid uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case when r.id is null then null else jsonb_build_object(
    'resource_id', r.id, 'title', r.title,
    'printed_start', q.source_printed_start, 'printed_end', q.source_printed_end,
    'url', case when r.availability = 'unavailable' or r.status = 'unavailable' or r.url is null then null
                when q.source_pdf_page is not null and r.file_type = 'pdf' then r.url || '#page=' || q.source_pdf_page
                else r.url end) end
  from public.questions q
  left join public.curriculum_resources r on r.id = q.source_resource_id
  where q.id = p_qid
$$;

-- Verdict of a graded item (answers.js verdictOf; unanswered when no response).
create or replace function public._ce_verdict(p_response jsonb, p_score numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_response is null or jsonb_typeof(p_response) = 'null' then 'unanswered'
              when coalesce(p_score, 0) >= 1 then 'correct'
              when coalesce(p_score, 0) > 0 then 'partial'
              else 'incorrect' end
$$;

-- Opaque per-attempt handle shown to the client in place of the question key.
-- A question id is minted from sha256(anchor | type | normalize(stem) |
-- canonicalAnswer) (§2.2), so the real key lets a client recover the answer of
-- an mcq / true_false / ordering item from the stem and options it already
-- sees. The handle is keyed with the attempt's seed, which no client role can
-- read (column grants on exam_attempts below). null without a seed.
create or replace function public._ce_item_handle(p_seed text, p_key text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case when p_seed is null or p_key is null then null
              else 'h-' || substr(encode(sha256(convert_to(p_seed || ':handle:' || p_key, 'UTF8')), 'hex'), 1, 20) end
$$;
revoke all on function public._ce_item_handle(text, text) from public, anon, authenticated;

-- Result rows (§5.7, engine/grade.js resultItem) of a template attempt
-- (every item, or one position): public question + response, verdict,
-- score, correct response, explanation, objective, lesson link and source.
-- The served revision is rendered (question_revisions when it changed);
-- voided items carry no key data. One joined query, no per-item lookups.
create or replace function public._ce_result_items(p_attempt uuid, p_position int default null)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(
           public._ce_public_question(i.position, public._ce_item_handle(a.seed, q.key), x.type, x.language, x.stem, x.stimulus,
                                      x.public, i.choice_order, i.display_map, q.time_limit_seconds, x.lesson_id, n.title_ar)
           || jsonb_build_object(
                'lesson', jsonb_build_object('id', x.lesson_id, 'title', n.title_ar,
                                             'href', case when q.lesson_node_id is not null then '/learn/' || q.lesson_node_id end),
                'voided', i.voided,
                'locked', i.locked_at is not null,
                'response', public._ce_to_display(x.type, x.public, i.choice_order, i.display_map, i.response),
                'verdict', case when i.voided is null then public._ce_verdict(i.response, i.score) end,
                'score', case when i.voided is null then coalesce(i.score, 0) end,
                'correct_response', case when i.voided is null then public._ce_to_display(x.type, x.public, i.choice_order, i.display_map,
                                                                                         public._ce_correct_response(x.type, x.payload)) end,
                'explanation', case when i.voided is null and x.expl is not null
                                    then jsonb_build_object('text', coalesce(x.expl ->> 'text', ''), 'steps', coalesce(x.expl -> 'steps', '[]'::jsonb)) end,
                'objective', case when i.voided is null and o.id is not null then jsonb_build_object('text', o.text_ar) end,
                'source', case when i.voided is null and res.id is not null then jsonb_build_object(
                  'resource_id', res.id, 'title', res.title,
                  'printed_start', q.source_printed_start, 'printed_end', q.source_printed_end,
                  'url', case when res.availability = 'unavailable' or res.status = 'unavailable' or res.url is null then null
                              when q.source_pdf_page is not null and res.file_type = 'pdf' then res.url || '#page=' || q.source_pdf_page
                              else res.url end) end)
           order by i.position), '[]'::jsonb)
    from public.exam_attempt_items i
    join public.exam_attempts a on a.id = i.attempt_id
    join public.questions q on q.id = i.question_id
    left join public.question_keys k on k.question_id = q.id
    left join public.question_revisions r
           on r.question_id = q.id and r.revision = i.question_revision and i.question_revision is distinct from q.revision
    left join public.question_stimuli st on st.id = q.stimulus_id
    left join public.curriculum_nodes n on n.id = q.lesson_node_id
    left join public.learning_objectives o on o.id = q.objective_id and o.status = 'validated'
    left join public.curriculum_resources res on res.id = q.source_resource_id
    cross join lateral (select coalesce(r.question_type, q.question_type) type, coalesce(r.language, q.language) language,
                               coalesce(r.stem, q.stem) stem,
                               case when r.question_id is not null then r.stimulus_text else coalesce(st.text, q.passage) end stimulus,
                               coalesce(r.payload_public, q.payload_public) public,
                               case when r.question_id is not null then r.answer else k.answer end payload,
                               case when r.question_id is not null then r.explanation
                                    else jsonb_build_object('text', k.explanation, 'steps', coalesce(k.explanation_steps, '[]'::jsonb)) end expl,
                               coalesce(q.lesson_node_id, 'prep:' || q.exam || '/' || q.section || '/' || q.topic) lesson_id
                         offset 0) x
   where i.attempt_id = p_attempt and (p_position is null or i.position = p_position)
$$;

-- One result row (check_exam_item, resume of a locked item).
create or replace function public._ce_result_item(p_attempt uuid, p_position int, p_reveal boolean default true)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case when coalesce(p_reveal, true) then x.r
              else x.r || '{"correct_response":null,"explanation":null,"objective":null,"source":null}'::jsonb end
    from (select public._ce_result_items(p_attempt, p_position) -> 0 r) x
$$;

-- Attempt summary of a template attempt (results, history).
create or replace function public._ce_attempt_json(p_attempt uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', a.id, 'template_id', a.template_id, 'template_version', a.template_version, 'scope', a.scope,
    'term_scope', a.term_scope, 'retake_of', a.retake_of, 'status', a.status,
    'timing_mode', a.timing_mode, 'feedback_mode', a.feedback_mode, 'quota', a.quota,
    'mini', coalesce((a.meta ->> 'mini')::boolean, false),
    'time_limit_seconds', a.time_limit_seconds,
    'started_at', a.started_at, 'expires_at', a.expires_at, 'submitted_at', a.submitted_at,
    'question_count', a.question_count, 'correct_count', a.correct_count, 'score_percent', a.score_percent,
    'duration_seconds', a.duration_seconds, 'xp_awarded', coalesce((a.meta ->> 'xp_awarded')::int, 0))
  from public.exam_attempts a
  where a.id = p_attempt
$$;

-- Graded result of a template attempt (§5.7): items, by_lesson, by_band,
-- by_term (full year), by_topic (prep scopes). Voided items are excluded
-- from every figure.
create or replace function public._ce_result(p_attempt uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  a       public.exam_attempts%rowtype;
  v_items jsonb;
  v_rows  jsonb;
begin
  select * into a from public.exam_attempts where id = p_attempt;
  v_items := public._ce_result_items(p_attempt);
  -- per-item facts for the breakdowns
  select coalesce(jsonb_agg(jsonb_build_object(
           'lesson', coalesce(q.lesson_node_id, 'prep:' || q.exam || '/' || q.section || '/' || q.topic),
           'title', n.title_ar, 'school', q.lesson_node_id is not null,
           'band', q.difficulty, 'term', coalesce(n.term, 'none'), 'topic', q.topic,
           'score', coalesce(i.score, 0))), '[]'::jsonb)
    into v_rows
    from public.exam_attempt_items i
    join public.questions q on q.id = i.question_id
    left join public.curriculum_nodes n on n.id = q.lesson_node_id
   where i.attempt_id = p_attempt and i.voided is null;

  return jsonb_build_object(
    'mode', 'db',
    'status', a.status,
    'attempt', public._ce_attempt_json(p_attempt),
    'template', jsonb_build_object('id', a.template_id, 'version', a.template_version,
                                   'kind', a.meta ->> 'template_kind'),
    'voided_count', (select count(*)::int from public.exam_attempt_items i where i.attempt_id = p_attempt and i.voided is not null),
    'answered_count', (select count(*)::int from public.exam_attempt_items i
                        where i.attempt_id = p_attempt and i.voided is null and i.response is not null),
    'reused', coalesce((a.meta ->> 'reused')::boolean, false),
    'by_lesson', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.lesson, 'title', g.title,
                                          'href', case when g.school then '/learn/' || g.lesson end,
                                          'total', g.total, 'correct', g.correct, 'score_sum', g.score_sum)
                       order by g.lesson collate "C")
        from (select r ->> 'lesson' lesson, max(r ->> 'title') title, bool_or((r ->> 'school')::boolean) school,
                     count(*)::int total, count(*) filter (where (r ->> 'score')::numeric >= 1)::int correct,
                     round(sum((r ->> 'score')::numeric), 2) score_sum
                from jsonb_array_elements(v_rows) r group by 1) g), '[]'::jsonb),
    'by_band', coalesce((
      select jsonb_agg(jsonb_build_object('band', g.band, 'total', g.total, 'correct', g.correct, 'score_sum', g.score_sum)
                       order by g.band)
        from (select (r ->> 'band')::int band, count(*)::int total,
                     count(*) filter (where (r ->> 'score')::numeric >= 1)::int correct,
                     round(sum((r ->> 'score')::numeric), 2) score_sum
                from jsonb_array_elements(v_rows) r group by 1) g), '[]'::jsonb),
    'by_term', case when a.meta ->> 'template_kind' = 'full_year' then coalesce((
      select jsonb_agg(jsonb_build_object('term', g.term, 'total', g.total, 'correct', g.correct, 'score_sum', g.score_sum)
                       order by g.term collate "C")
        from (select r ->> 'term' term, count(*)::int total,
                     count(*) filter (where (r ->> 'score')::numeric >= 1)::int correct,
                     round(sum((r ->> 'score')::numeric), 2) score_sum
                from jsonb_array_elements(v_rows) r group by 1) g), '[]'::jsonb) end,
    'by_topic', case when left(a.scope, 5) = 'prep:' then coalesce((
      select jsonb_agg(jsonb_build_object('topic', g.topic, 'total', g.total, 'correct', g.correct, 'score_sum', g.score_sum)
                       order by g.topic collate "C")
        from (select r ->> 'topic' topic, count(*)::int total,
                     count(*) filter (where (r ->> 'score')::numeric >= 1)::int correct,
                     round(sum((r ->> 'score')::numeric), 2) score_sum
                from jsonb_array_elements(v_rows) r group by 1) g), '[]'::jsonb) end,
    'items', v_items);
end
$$;

-- Public questions of an attempt (display indexes only; served revision).
create or replace function public._ce_questions_json(p_attempt uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(
           public._ce_public_question(
             i.position, public._ce_item_handle(a.seed, q.key), coalesce(r.question_type, q.question_type), coalesce(r.language, q.language),
             coalesce(r.stem, q.stem), case when r.question_id is not null then r.stimulus_text else coalesce(st.text, q.passage) end,
             coalesce(r.payload_public, q.payload_public), i.choice_order, i.display_map, q.time_limit_seconds,
             coalesce(q.lesson_node_id, 'prep:' || q.exam || '/' || q.section || '/' || q.topic), n.title_ar)
           order by i.position), '[]'::jsonb)
    from public.exam_attempt_items i
    join public.exam_attempts a on a.id = i.attempt_id
    join public.questions q on q.id = i.question_id
    left join public.question_revisions r
           on r.question_id = q.id and r.revision = i.question_revision and i.question_revision is distinct from q.revision
    left join public.question_stimuli st on st.id = q.stimulus_id
    left join public.curriculum_nodes n on n.id = q.lesson_node_id
   where i.attempt_id = p_attempt
$$;

-- ============================================================================
-- start_template_attempt (§6.2, §5.3, §5.7). `seed` exists only so that a
-- client-supplied seed is refused with seed_not_allowed (the seed is always
-- generated here).
-- ============================================================================
create or replace function public.start_template_attempt(
  p_template  text,
  p_scope     text,
  p_count     int     default null,
  p_timing    text    default null,
  p_feedback  text    default null,
  p_retake_of uuid    default null,
  seed        text    default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c_free_daily     constant int := 5;    -- LIMITS.freeDailyAttempts (exam quota)
  c_practice_daily constant int := 30;   -- practice quota, free tier
  v_uid       uuid := auth.uid();
  v_now       timestamptz := now();
  v_t         jsonb;
  v_parsed    jsonb;
  v_res       jsonb;
  v_premium   boolean;
  v_tier      text;
  v_orig      public.exam_attempts%rowtype;
  v_stored    jsonb := null;
  v_plan      jsonb;
  v_timing    jsonb;
  v_feedback  text;
  v_quota     text;
  v_day_start timestamptz;
  v_used      int;
  v_hist      jsonb;
  v_pool      public.ce_pool_item[];
  v_sel       jsonb;
  v_seed      text;
  v_n         int;
  v_attempt   uuid;
  v_exam      text := 'school';
  v_section   text;
  v_topic     text;
  v_bank      text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if start_template_attempt.seed is not null then
    perform public._ce_raise('seed_not_allowed');
  end if;
  v_t := public._ce_template(p_template);
  if v_t is null then
    perform public._ce_raise('template_not_found');
  end if;
  if p_timing is not null and p_timing not in ('timed', 'untimed') then
    perform public._ce_raise('invalid_argument', '{"field":"timing"}');
  end if;
  if p_feedback is not null and p_feedback not in ('end', 'immediate') then
    perform public._ce_raise('invalid_argument', '{"field":"feedback"}');
  end if;
  v_parsed := public._ce_parse_scope(p_scope);
  if v_parsed is null then
    perform public._ce_raise('invalid_argument', '{"field":"scope"}');
  end if;
  if p_retake_of is not null then
    select * into v_orig from public.exam_attempts a where a.id = p_retake_of and a.user_id = v_uid;
    if not found then
      perform public._ce_raise('not_found');
    end if;
    if v_orig.template_id is distinct from (v_t ->> 'id') or v_orig.scope is distinct from p_scope then
      perform public._ce_raise('invalid_argument', '{"field":"retake_of"}');
    end if;
    if jsonb_typeof(v_orig.meta -> 'allocation') = 'array' and jsonb_array_length(v_orig.meta -> 'allocation') > 0 then
      v_stored := v_orig.meta -> 'allocation';
    end if;
  end if;

  v_premium := public.has_premium(v_uid);
  v_tier := case when v_premium then 'premium' else 'free' end;

  -- One start at a time per user (shared with start_exam_attempt: quotas must not race).
  perform pg_advisory_xact_lock(hashtextextended('jazira.exam_start:' || v_uid::text, 0));
  perform public._exam_expire_stale(v_uid);

  if v_stored is not null then
    v_n := (select sum((c ->> 1)::int)::int from jsonb_array_elements(v_stored) c);
    if v_n > public._ce_tier_max(v_t, v_tier) then
      perform public._ce_raise('invalid_argument', '{"field":"retake_of"}');
    end if;
    v_plan := jsonb_build_object('ok', true, 'n', v_n, 'mini', coalesce((v_orig.meta ->> 'mini')::boolean, false),
                                 'limited', coalesce((v_orig.meta ->> 'limited')::boolean, false), 'requested', v_n,
                                 'min_required', least((v_t #>> '{count,min}')::int, v_n));
  else
    v_plan := public._ce_plan_count(v_t, v_tier, p_count);
  end if;
  if not (v_plan ->> 'ok')::boolean then
    if v_plan ->> 'error' = 'premium_required' then
      perform public._ce_raise('premium_required', jsonb_build_object('max_questions', public._ce_tier_max(v_t, v_tier)));
    end if;
    perform public._ce_raise(v_plan ->> 'error', jsonb_build_object('field', v_plan ->> 'field'));
  end if;
  v_n := (v_plan ->> 'n')::int;
  v_timing := public._ce_plan_timing(v_t, v_n, p_timing);
  if not (v_timing ->> 'ok')::boolean then
    perform public._ce_raise('invalid_argument', '{"field":"timing"}');
  end if;
  v_feedback := coalesce(p_feedback, v_t #>> '{feedback,default}');
  if not (v_t #> '{feedback,allowed}') ? v_feedback then
    perform public._ce_raise('feedback_not_allowed');
  end if;

  v_quota := coalesce(v_t ->> 'quota', 'exam');
  if not v_premium then
    v_day_start := date_trunc('day', v_now at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh';
    select count(*)::int into v_used
      from public.exam_attempts a
     where a.user_id = v_uid and a.started_at >= v_day_start
       and (case when v_quota = 'exam' then a.quota = 'exam' else a.quota = 'practice' and a.template_id is not null end);
    if v_used >= (case when v_quota = 'exam' then c_free_daily else c_practice_daily end) then
      perform public._ce_raise('daily_limit_reached', jsonb_build_object(
        'limit', case when v_quota = 'exam' then c_free_daily else c_practice_daily end,
        'used', v_used, 'resets_at', v_day_start + interval '1 day', 'quota', v_quota));
    end if;
  end if;

  v_res := public._ce_resolve_scope(v_parsed, v_t, v_tier, v_uid);
  if not (v_res ->> 'ok')::boolean then
    perform public._ce_raise(v_res ->> 'error', case when v_res ? 'field' then jsonb_build_object('field', v_res ->> 'field') end);
  end if;
  v_pool := public._ce_pool(v_res, v_t, v_premium);
  if v_pool is null then
    perform public._ce_raise('scope_too_large');
  end if;
  v_hist := public._ce_history(v_uid, v_t);
  v_seed := replace(pg_catalog.gen_random_uuid()::text, '-', '');
  v_sel := public._ce_select_rows(v_t, v_n, (v_plan ->> 'min_required')::int, v_seed, v_pool, v_hist -> 'seen',
                             v_hist -> 'wrong', v_stored, v_hist -> 'errors',
                             (extract(epoch from v_now) * 1000)::bigint, v_premium);
  if not (v_sel ->> 'ok')::boolean then
    if v_sel ->> 'error' = 'insufficient_pool' then
      perform public._ce_raise('insufficient_pool', jsonb_build_object('available', (v_sel ->> 'available')::int,
                                                                        'required', (v_sel ->> 'required')::int));
    end if;
    perform public._ce_raise(v_sel ->> 'error');
  end if;
  if jsonb_array_length(v_sel -> 'keys') = 0 then
    perform public._ce_raise('insufficient_pool', jsonb_build_object('available', 0, 'required', (v_plan ->> 'min_required')::int));
  end if;

  if v_parsed ->> 'type' = 'prep' then
    v_exam := v_parsed ->> 'exam';
    v_section := v_parsed ->> 'section';
    v_topic := v_parsed ->> 'topic';
  end if;
  -- bank_revision is owner-readable: hashed over the random question ids and
  -- revisions, never over the keys (a staging key is minted from a hash that
  -- includes the answer, so a hash of keys could be brute-forced over the
  -- few candidate answers of a small pool).
  select left(encode(sha256(convert_to(coalesce(string_agg(q.id::text || ':' || p.revision, ',' order by q.id), ''),
                                       'UTF8')), 'hex'), 32)
    into v_bank
    from unnest(v_pool) p
    join public.questions q on q.key = p.key;

  insert into public.exam_attempts (user_id, exam, section, topic, difficulty, question_count, time_limit_seconds,
                                    status, started_at, expires_at, meta, template_id, template_version, scope,
                                    term_scope, seed, retake_of, timing_mode, feedback_mode, quota, bank_revision)
  values (v_uid, v_exam, v_section, v_topic, null, jsonb_array_length(v_sel -> 'keys'), (v_timing ->> 'seconds')::int,
          'in_progress', v_now, v_now + make_interval(secs => (v_timing ->> 'seconds')::int),
          jsonb_build_object('requested_count', (v_plan ->> 'requested')::int, 'premium', v_premium, 'tier', v_tier,
                             'mini', (v_plan ->> 'mini')::boolean, 'limited', (v_plan ->> 'limited')::boolean,
                             'allocation', v_sel -> 'stored', 'reused', (v_sel ->> 'reused')::boolean,
                             'reused_count', (v_sel ->> 'reused_count')::int, 'short', (v_sel ->> 'short')::boolean,
                             'lower_bound', (v_sel ->> 'lower_bound')::boolean, 'template_kind', v_t ->> 'kind',
                             'pool_size', (v_sel ->> 'pool_size')::int, 'group_count', (v_sel ->> 'group_count')::int),
          v_t ->> 'id', (v_t ->> 'version')::int, p_scope, v_parsed ->> 'term', v_seed, p_retake_of,
          v_timing ->> 'mode', v_feedback, v_quota, v_bank)
  returning id into v_attempt;

  insert into public.exam_attempt_items (attempt_id, position, question_id, question_revision, choice_order, display_map)
  select v_attempt, k.pos::smallint, q.id, q.revision,
         case when jsonb_typeof(m -> 'choice_order') = 'array'
              then array(select x::smallint from jsonb_array_elements_text(m -> 'choice_order') x) end,
         m -> 'display_map'
    from jsonb_array_elements_text(v_sel -> 'keys') with ordinality k (key, pos)
    join public.questions q on q.key = k.key
    -- display maps never read the answer key (§5.4: nothing shown depends on it)
    cross join lateral (select public._ce_display_maps(
                          v_seed, q.key, q.question_type, q.payload_public, q.shuffle_options, q.fixed_order_reason,
                          case when q.exam = 'school' then null else q.topic end,
                          coalesce((v_t #>> '{randomization,option_shuffle}')::boolean, true),
                          null, q.option_flags) m offset 0) mm;

  return jsonb_build_object(
    'mode', 'db',
    'attempt_id', v_attempt,
    'status', 'in_progress',
    'template', jsonb_build_object('id', v_t ->> 'id', 'version', (v_t ->> 'version')::int, 'kind', v_t ->> 'kind'),
    'scope', p_scope,
    'term_scope', v_parsed ->> 'term',
    'quota', v_quota,
    'mini', (v_plan ->> 'mini')::boolean,
    'limited', (v_plan ->> 'limited')::boolean or jsonb_array_length(v_sel -> 'keys') < (v_plan ->> 'requested')::int,
    'requested_count', (v_plan ->> 'requested')::int,
    'max_questions', public._ce_tier_max(v_t, v_tier),
    'question_count', jsonb_array_length(v_sel -> 'keys'),
    'reused', (v_sel ->> 'reused')::boolean,
    'short', (v_sel ->> 'short')::boolean,
    'retake_of', p_retake_of,
    'timing_mode', v_timing ->> 'mode',
    'feedback_mode', v_feedback,
    'time_limit_seconds', (v_timing ->> 'seconds')::int,
    'started_at', v_now,
    'expires_at', v_now + make_interval(secs => (v_timing ->> 'seconds')::int),
    'server_now', v_now,
    'seconds_remaining', (v_timing ->> 'seconds')::int,
    'questions', public._ce_questions_json(v_attempt));
end
$$;

-- Grade a canonical response against item content (_ce_item_content): the
-- stored accepted_norm (computed in SQL at import) is used when present.
create or replace function public._ce_grade_content(p_content jsonb, p_response jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select public._ce_grade_full(p_content ->> 'type', p_content -> 'payload',
           case when jsonb_typeof(p_content -> 'accepted_norm') = 'array'
                then array(select jsonb_array_elements_text(p_content -> 'accepted_norm')) end,
           p_response)
$$;

-- Display response → validated canonical response for one attempt item.
-- → {ok, canonical, display} | {ok:false, reason}
create or replace function public._ce_map_response(p_attempt uuid, p_position int, p_raw jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  i   public.exam_attempt_items%rowtype;
  c   jsonb;
  d   jsonb;
  m   jsonb;
  v   jsonb;
begin
  select * into i from public.exam_attempt_items where attempt_id = p_attempt and position = p_position;
  c := public._ce_item_content(i.question_id, i.question_revision);
  d := public._ce_parse_display(c ->> 'type', p_raw);
  if not (d ->> 'ok')::boolean then
    return d;
  end if;
  if d -> 'response' is null or jsonb_typeof(d -> 'response') = 'null' then
    return '{"ok":true,"canonical":null,"display":null}';
  end if;
  m := public._ce_to_canonical(c ->> 'type', c -> 'public', i.choice_order, i.display_map, d -> 'response');
  if not (m ->> 'ok')::boolean then
    return m;
  end if;
  v := public._ce_validate_response(c ->> 'type', c -> 'public', m -> 'response');
  if not (v ->> 'ok')::boolean then
    return v;
  end if;
  if (v ->> 'empty')::boolean then
    return '{"ok":true,"canonical":null,"display":null}';
  end if;
  return jsonb_build_object('ok', true, 'canonical', m -> 'response', 'display', d -> 'response');
end
$$;

-- The legacy selected_index column of a template item holds the DISPLAY index
-- of an mcq / true_false answer (null otherwise). The owner can read the
-- column, and a canonical index there would let a client recover choice_order
-- (the canonical = authoring order of the options) by saving each option in
-- turn. Grading never reads it for template items (they are graded from
-- response); legacy statistics only test it for null ("answered").
drop function if exists public._ce_selected_index(jsonb, jsonb);
create or replace function public._ce_selected_index(p_display jsonb)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p_display) = 'object' and jsonb_typeof(p_display -> 'option_index') = 'number'
              then (p_display ->> 'option_index')::smallint end
$$;

-- ============================================================================
-- save_exam_response (§6.2): stores a response only — never score / is_correct.
-- ============================================================================
create or replace function public.save_exam_response(
  p_attempt    uuid,
  p_position   smallint,
  p_response   jsonb,
  p_time_spent int     default 0,
  p_flagged    boolean default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  a     public.exam_attempts%rowtype;
  i     public.exam_attempt_items%rowtype;
  m     jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_attempt is null then
    perform public._ce_raise('invalid_argument', '{"field":"attempt"}');
  end if;
  if p_position is null then
    perform public._ce_raise('invalid_argument', '{"field":"position"}');
  end if;
  if p_time_spent is not null and p_time_spent not between 0 and 14400 then
    perform public._ce_raise('invalid_argument', '{"field":"time_spent"}');
  end if;
  if p_response is not null and octet_length(p_response::text) > 8192 then
    perform public._ce_raise('invalid_response', jsonb_build_object('position', p_position, 'reason', 'too_large'));
  end if;

  select * into a from public.exam_attempts where id = p_attempt and user_id = v_uid for update;
  if not found then
    perform public._ce_raise('attempt_not_found');
  end if;
  if a.status <> 'in_progress' then
    perform public._ce_raise('attempt_closed', jsonb_build_object('status', a.status));
  end if;
  if now() > a.expires_at + interval '30 seconds' then
    perform public._ce_raise('attempt_closed', '{"status":"expired"}');
  end if;
  select * into i from public.exam_attempt_items where attempt_id = p_attempt and position = p_position;
  if not found then
    perform public._ce_raise('invalid_argument', '{"field":"position"}');
  end if;
  if i.locked_at is not null then
    -- A checked (locked) item keeps its response and score for good. The
    -- runner still saves its flag: a save with no response (SQL / JSON null)
    -- or with exactly the locked response updates `flagged` only; any other
    -- response (a change, a clear, or an invalid body) is item_locked.
    if p_response is not null and jsonb_typeof(p_response) <> 'null' then
      m := public._ce_map_response(p_attempt, p_position, p_response);
      if not (m ->> 'ok')::boolean
         or nullif(m -> 'canonical', 'null'::jsonb) is distinct from nullif(i.response, 'null'::jsonb) then
        perform public._ce_raise('item_locked', jsonb_build_object('position', p_position));
      end if;
    end if;
    update public.exam_attempt_items
       set flagged = coalesce(p_flagged, flagged)
     where attempt_id = p_attempt and position = p_position
    returning * into i;
    return jsonb_build_object(
      'attempt_id', p_attempt,
      'position', i.position,
      'response', (select nullif(public._ce_to_display(c ->> 'type', c -> 'public', i.choice_order, i.display_map, i.response),
                                 'null'::jsonb)
                     from (select public._ce_item_content(i.question_id, i.question_revision) c) cc),
      'flagged', i.flagged,
      'time_spent_seconds', i.time_spent_seconds,
      'saved_at', now(),
      'seconds_remaining', greatest(0, ceil(extract(epoch from (a.expires_at - now()))))::int);
  end if;

  m := public._ce_map_response(p_attempt, p_position, p_response);
  if not (m ->> 'ok')::boolean then
    perform public._ce_raise('invalid_response', jsonb_build_object('position', p_position, 'reason', m ->> 'reason'));
  end if;

  update public.exam_attempt_items
     set response           = m -> 'canonical',
         selected_index     = public._ce_selected_index(m -> 'display'),
         answered_at        = case when m -> 'canonical' is null or jsonb_typeof(m -> 'canonical') = 'null' then null
                                   else coalesce(answered_at, now()) end,
         time_spent_seconds = greatest(time_spent_seconds, least(coalesce(p_time_spent, 0), a.time_limit_seconds, 14400)),
         flagged            = coalesce(p_flagged, flagged)
   where attempt_id = p_attempt and position = p_position
  returning * into i;

  return jsonb_build_object(
    'attempt_id', p_attempt,
    'position', i.position,
    'response', case when jsonb_typeof(m -> 'display') = 'null' then null else m -> 'display' end,
    'flagged', i.flagged,
    'time_spent_seconds', i.time_spent_seconds,
    'saved_at', now(),
    'seconds_remaining', greatest(0, ceil(extract(epoch from (a.expires_at - now()))))::int);
end
$$;

-- ============================================================================
-- check_exam_item (§6.2): immediate feedback — grades the stored response,
-- writes score / is_correct and locks the item.
-- ============================================================================
create or replace function public.check_exam_item(p_attempt uuid, p_position smallint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  a     public.exam_attempts%rowtype;
  i     public.exam_attempt_items%rowtype;
  q     public.questions%rowtype;
  c     jsonb;
  g     jsonb;
  r     jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_attempt is null or p_position is null then
    perform public._ce_raise('invalid_argument', jsonb_build_object('field', case when p_attempt is null then 'attempt' else 'position' end));
  end if;
  select * into a from public.exam_attempts where id = p_attempt and user_id = v_uid for update;
  if not found then
    perform public._ce_raise('attempt_not_found');
  end if;
  if a.feedback_mode <> 'immediate' then
    perform public._ce_raise('feedback_not_allowed');
  end if;
  if a.status <> 'in_progress' then
    perform public._ce_raise('attempt_closed', jsonb_build_object('status', a.status));
  end if;
  if now() > a.expires_at + interval '30 seconds' then
    perform public._ce_raise('attempt_closed', '{"status":"expired"}');
  end if;
  select * into i from public.exam_attempt_items where attempt_id = p_attempt and position = p_position for update;
  if not found then
    perform public._ce_raise('invalid_argument', '{"field":"position"}');
  end if;
  if i.locked_at is not null then
    perform public._ce_raise('item_locked', jsonb_build_object('position', p_position));
  end if;
  if i.response is null or jsonb_typeof(i.response) = 'null' then
    perform public._ce_raise('invalid_response', jsonb_build_object('position', p_position, 'reason', 'empty'));
  end if;

  select * into q from public.questions where id = i.question_id;
  if q.revision is distinct from i.question_revision then
    -- the question changed after it was served: void it, never grade another version
    update public.exam_attempt_items
       set voided = 'question_updated', locked_at = now(), score = null, is_correct = null
     where attempt_id = p_attempt and position = p_position;
  else
    c := public._ce_item_content(q.id, i.question_revision);
    g := public._ce_grade_content(c, i.response);
    update public.exam_attempt_items
       set score = (g ->> 'score')::numeric, is_correct = (g ->> 'score')::numeric >= 1, locked_at = now()
     where attempt_id = p_attempt and position = p_position;
  end if;

  r := public._ce_result_item(p_attempt, p_position);
  return jsonb_build_object(
    'position', p_position,
    'voided', r -> 'voided',
    'verdict', r -> 'verdict',
    'score', r -> 'score',
    'response', r -> 'response',
    'correct_response', r -> 'correct_response',
    'explanation', r -> 'explanation',
    'objective', r -> 'objective',
    'lesson', r -> 'lesson',
    'source', r -> 'source',
    'locked_at', (select x.locked_at from public.exam_attempt_items x where x.attempt_id = p_attempt and x.position = p_position));
end
$$;

-- A lesson and its ancestors up to (and including) the subject.
create or replace function public._ce_lesson_ancestors(p_lesson text)
returns setof text
language sql
stable
set search_path = ''
as $$
  with recursive up as (
    select n.id, n.parent_id, n.kind, 0 depth from public.curriculum_nodes n where n.id = p_lesson
    union all
    select p.id, p.parent_id, p.kind, up.depth + 1
      from up join public.curriculum_nodes p on p.id = up.parent_id
     where up.kind <> 'subject' and up.depth < 8
  )
  select id from up where kind not in ('stage', 'grade', 'track', 'term')
$$;

-- Learner analytics (§2.14) from a finalized attempt: question stats for
-- every served item, node stats (lesson, unit / chapter, subject; prep topic
-- and section) and item QA stats for answered items. Voided items are skipped.
create or replace function public._ce_update_stats(p_attempt uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_uid   uuid;
  v_items jsonb;
begin
  select a.user_id into v_uid from public.exam_attempts a where a.id = p_attempt;
  if v_uid is null then
    return;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'question_id', i.question_id,
           'answered', (i.response is not null and jsonb_typeof(i.response) <> 'null') or i.selected_index is not null,
           'sc', coalesce(i.score, case when i.is_correct then 1 else 0 end),
           'ts', i.time_spent_seconds, 'band', q.difficulty, 'lesson', q.lesson_node_id,
           'exam', q.exam, 'section', q.section, 'topic', q.topic)), '[]'::jsonb)
    into v_items
    from public.exam_attempt_items i
    join public.questions q on q.id = i.question_id
   where i.attempt_id = p_attempt and i.voided is null;

  insert into public.learner_question_stats as s (user_id, question_id, seen_count, correct_count, last_seen_at, last_correct, wrong_streak)
  select v_uid, t.question_id, 1, case when t.answered and t.sc >= 1 then 1 else 0 end, now(),
         case when t.answered then t.sc >= 1 end, case when t.answered and t.sc < 1 then 1 else 0 end
    from jsonb_to_recordset(v_items) t (question_id uuid, answered boolean, sc numeric, ts int, band int, lesson text, exam text, section text, topic text)
  on conflict (user_id, question_id) do update
     set seen_count    = s.seen_count + 1,
         correct_count = s.correct_count + excluded.correct_count,
         last_seen_at  = excluded.last_seen_at,
         last_correct  = coalesce(excluded.last_correct, s.last_correct),
         wrong_streak  = case when excluded.last_correct is null then s.wrong_streak
                              when excluded.last_correct then 0 else s.wrong_streak + 1 end;

  insert into public.learner_node_stats as s (user_id, node_id, answered, correct, time_seconds, band_answered, band_correct, last_at)
  select v_uid, x.node, count(*)::int, count(*) filter (where x.sc >= 1)::int, coalesce(sum(x.ts), 0),
         array[count(*) filter (where x.band = 1), count(*) filter (where x.band = 2), count(*) filter (where x.band = 3)]::int[],
         array[count(*) filter (where x.band = 1 and x.sc >= 1), count(*) filter (where x.band = 2 and x.sc >= 1),
               count(*) filter (where x.band = 3 and x.sc >= 1)]::int[],
         now()
    from (select a.node, t.sc, t.ts, t.band
            from jsonb_to_recordset(v_items) t (question_id uuid, answered boolean, sc numeric, ts int, band int, lesson text, exam text, section text, topic text) cross join lateral public._ce_lesson_ancestors(t.lesson) a (node)
           where t.answered and t.lesson is not null
          union all
          select 'prep:' || t.exam || '/' || t.section || '/' || t.topic, t.sc, t.ts, t.band
            from jsonb_to_recordset(v_items) t (question_id uuid, answered boolean, sc numeric, ts int, band int, lesson text, exam text, section text, topic text) where t.answered and t.lesson is null and t.exam <> 'school'
          union all
          select 'prep:' || t.exam || '/' || t.section, t.sc, t.ts, t.band
            from jsonb_to_recordset(v_items) t (question_id uuid, answered boolean, sc numeric, ts int, band int, lesson text, exam text, section text, topic text) where t.answered and t.lesson is null and t.exam <> 'school') x
   group by x.node
  on conflict (user_id, node_id) do update
     set answered      = s.answered + excluded.answered,
         correct       = s.correct + excluded.correct,
         time_seconds  = s.time_seconds + excluded.time_seconds,
         band_answered = array[s.band_answered[1] + excluded.band_answered[1], s.band_answered[2] + excluded.band_answered[2],
                               s.band_answered[3] + excluded.band_answered[3]],
         band_correct  = array[s.band_correct[1] + excluded.band_correct[1], s.band_correct[2] + excluded.band_correct[2],
                               s.band_correct[3] + excluded.band_correct[3]],
         last_at       = excluded.last_at;

  insert into public.question_item_stats as s (question_id, answered, correct, total_time_seconds, last_at)
  select t.question_id, 1, case when t.sc >= 1 then 1 else 0 end, t.ts, now()
    from jsonb_to_recordset(v_items) t (question_id uuid, answered boolean, sc numeric, ts int, band int, lesson text, exam text, section text, topic text) where t.answered
  on conflict (question_id) do update
     set answered = s.answered + 1, correct = s.correct + excluded.correct,
         total_time_seconds = s.total_time_seconds + excluded.total_time_seconds, last_at = excluded.last_at;
end
$$;

-- Grade + close a template attempt (status submitted | expired | abandoned).
-- Voids items whose question revision changed, keeps locked items' scores
-- (graded at lock time), grades the rest, applies the XP cap (no XP when
-- abandoned) and updates the learner statistics. Legacy attempts reuse it for
-- abandon only (graded by correct_index).
create or replace function public._ce_finalize(p_attempt uuid, p_status text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  c_daily_xp constant int := 300;
  a          public.exam_attempts%rowtype;
  v_correct  int;
  v_total    int;
  v_answered int;
  v_voided   int;
  v_sum      numeric;
  v_score    numeric(5, 2);
  v_duration int;
  v_xp       int := 0;
  v_today    int;
  v_awarded  int := 0;
begin
  select * into a from public.exam_attempts where id = p_attempt;
  if not found or a.status <> 'in_progress' then
    return;
  end if;

  update public.exam_attempt_items i
     set voided = 'question_updated', score = null, is_correct = null
    from public.questions q
   where q.id = i.question_id and i.attempt_id = p_attempt and i.voided is null
     and i.question_revision is not null and q.revision is distinct from i.question_revision;

  if a.template_id is null then
    -- legacy items (abandon only): the seeded correct_index
    update public.exam_attempt_items i
       set is_correct = (i.selected_index is not null and i.selected_index = k.correct_index),
           score = case when i.selected_index is not null and i.selected_index = k.correct_index then 1 else 0 end
      from public.question_keys k
     where k.question_id = i.question_id and i.attempt_id = p_attempt and i.voided is null and i.locked_at is null;
  else
    -- every remaining item is at its served revision (mismatches were voided above)
    update public.exam_attempt_items i
       set score = (x.g ->> 'score')::numeric, is_correct = (x.g ->> 'score')::numeric >= 1
      from (select i2.position,
                   public._ce_grade_full(q.question_type, k.answer, k.accepted_norm, i2.response) g
              from public.exam_attempt_items i2
              join public.questions q on q.id = i2.question_id
              left join public.question_keys k on k.question_id = q.id
             where i2.attempt_id = p_attempt and i2.voided is null and i2.locked_at is null
            offset 0) x
     where i.attempt_id = p_attempt and i.position = x.position;
  end if;

  select count(*) filter (where voided is null and score >= 1)::int,
         count(*) filter (where voided is null)::int,
         count(*) filter (where voided is null and ((response is not null and jsonb_typeof(response) <> 'null') or selected_index is not null))::int,
         count(*) filter (where voided is not null)::int,
         coalesce(sum(score) filter (where voided is null), 0)
    into v_correct, v_total, v_answered, v_voided, v_sum
    from public.exam_attempt_items where attempt_id = p_attempt;

  v_score := case when v_total > 0 then round(100.0 * v_sum / v_total, 2) else 0 end;
  v_duration := case
    when p_status = 'expired' and a.timing_mode = 'timed' then a.time_limit_seconds
    else least(greatest(0, round(extract(epoch from (now() - a.started_at))))::int, a.time_limit_seconds)
  end;

  if p_status <> 'abandoned' then
    v_xp := 2 * v_correct;
  end if;
  if v_xp > 0 then
    begin
      perform pg_advisory_xact_lock(hashtextextended('jazira.xp:' || a.user_id::text, 0));
      select coalesce(sum(case when jsonb_typeof(x.meta -> 'xp_awarded') = 'number'
                               then (x.meta ->> 'xp_awarded')::int else 0 end), 0)::int
        into v_today
        from public.exam_attempts x
       where x.user_id = a.user_id and x.id <> a.id
         and x.submitted_at >= (date_trunc('day', now() at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh');
      v_xp := least(v_xp, greatest(0, c_daily_xp - v_today));
      if v_xp > 0 then
        update public.profiles set xp = xp + v_xp where id = a.user_id;
        if found then v_awarded := v_xp; end if;
      end if;
    exception when others then
      raise warning '_ce_finalize(%): xp not awarded: % (%)', p_attempt, sqlerrm, sqlstate;
      v_awarded := 0;
    end;
  end if;

  update public.exam_attempts
     set status           = p_status,
         submitted_at     = now(),
         correct_count    = v_correct,
         total            = v_total,
         score_percent    = v_score,
         duration_seconds = v_duration,
         meta             = meta || jsonb_build_object('xp_awarded', v_awarded, 'answered_count', v_answered,
                                                       'voided_count', v_voided)
   where id = p_attempt;

  begin
    perform public._ce_update_stats(p_attempt);
  exception when others then
    raise warning '_ce_finalize(%): statistics not updated: % (%)', p_attempt, sqlerrm, sqlstate;
  end;

  if p_status <> 'abandoned' then
    if auth.uid() is not distinct from a.user_id then
      begin
        perform public.record_daily_activity();
      exception when others then
        null;
      end;
    end if;
    begin
      insert into public.notifications (user_id, actor_id, type, data)
      values (a.user_id, null, 'exam_result',
              jsonb_build_object('attempt_id', a.id, 'exam', a.exam, 'section', a.section,
                                 'score_percent', v_score, 'correct', v_correct, 'total', v_total, 'status', p_status));
    exception when others then
      null;
    end;
  end if;
end
$$;

-- ============================================================================
-- abandon_exam_attempt (§6.2): answered items are graded for the statistics;
-- no XP, no notification.
-- ============================================================================
create or replace function public.abandon_exam_attempt(p_attempt uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  a     public.exam_attempts%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_attempt is null then
    perform public._ce_raise('invalid_argument', '{"field":"attempt"}');
  end if;
  select * into a from public.exam_attempts where id = p_attempt and user_id = v_uid for update;
  if not found then
    perform public._ce_raise('attempt_not_found');
  end if;
  if a.status <> 'in_progress' then
    perform public._ce_raise('attempt_closed', jsonb_build_object('status', a.status));
  end if;
  perform public._ce_finalize(p_attempt, 'abandoned');
  select * into a from public.exam_attempts where id = p_attempt;
  return jsonb_build_object('attempt_id', p_attempt, 'status', a.status,
                            'answered_count', coalesce((a.meta ->> 'answered_count')::int, 0),
                            'xp_awarded', coalesce((a.meta ->> 'xp_awarded')::int, 0));
end
$$;

-- Template branch of submit_exam_attempt (the caller holds the row lock).
--   p_answers: [{position, response? (display indexes), selected_index? (mcq
--   display index), time_spent_seconds?, flagged?}]; entries for locked
--   positions only update time and flag (the lock-time response stands).
create or replace function public._ce_submit(p_attempt uuid, p_answers jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  a      public.exam_attempts%rowtype;
  v_late boolean;
  el     jsonb;
  v_pos  int;
  v_seen int[] := '{}'::int[];
  v_raw  jsonb;
  v_has  boolean;
  m      jsonb;
  v_map  jsonb := '{}'::jsonb;
  v_ts   int;
  i      public.exam_attempt_items%rowtype;
begin
  select * into a from public.exam_attempts where id = p_attempt;
  if a.status in ('submitted', 'expired', 'abandoned') then
    return public._ce_result(p_attempt);
  end if;
  v_late := now() > a.expires_at + interval '30 seconds';

  -- answers arriving after the deadline (+30 s grace) are ignored entirely (graded as saved)
  if not v_late and p_answers is not null and jsonb_typeof(p_answers) <> 'null' then
    if jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) > 100 then
      perform public._ce_raise('invalid_argument', '{"field":"answers"}');
    end if;
    -- validate everything first (no partial writes)
    for el in select value from jsonb_array_elements(p_answers) loop
      if jsonb_typeof(el) <> 'object'
         or jsonb_typeof(el -> 'position') is distinct from 'number'
         or (el ->> 'position')::numeric <> trunc((el ->> 'position')::numeric)
         or (el ->> 'position')::numeric not between 1 and 100 then
        perform public._ce_raise('invalid_argument', '{"field":"answers.position"}');
      end if;
      v_pos := (el ->> 'position')::numeric::int;
      if v_pos = any (v_seen) then
        perform public._ce_raise('invalid_argument', '{"field":"answers.position","reason":"duplicate"}');
      end if;
      v_seen := v_seen || v_pos;
      select * into i from public.exam_attempt_items x where x.attempt_id = p_attempt and x.position = v_pos;
      if not found then
        perform public._ce_raise('invalid_argument', '{"field":"answers.position"}');
      end if;
      if el ? 'time_spent_seconds' and jsonb_typeof(el -> 'time_spent_seconds') <> 'null'
         and (jsonb_typeof(el -> 'time_spent_seconds') <> 'number'
              or (el ->> 'time_spent_seconds')::numeric <> trunc((el ->> 'time_spent_seconds')::numeric)
              or (el ->> 'time_spent_seconds')::numeric not between 0 and 14400) then
        perform public._ce_raise('invalid_argument', '{"field":"answers.time_spent_seconds"}');
      end if;
      if el ? 'flagged' and jsonb_typeof(el -> 'flagged') not in ('boolean', 'null') then
        perform public._ce_raise('invalid_argument', '{"field":"answers.flagged"}');
      end if;
      v_has := el ? 'response' or el ? 'selected_index';
      if v_has and i.locked_at is null then
        v_raw := case when el ? 'response' then el -> 'response'
                      when jsonb_typeof(el -> 'selected_index') = 'null' then null
                      else jsonb_build_object('option_index', el -> 'selected_index') end;
        m := public._ce_map_response(p_attempt, v_pos, v_raw);
        if not (m ->> 'ok')::boolean then
          perform public._ce_raise('invalid_response', jsonb_build_object('position', v_pos, 'reason', m ->> 'reason'));
        end if;
        v_map := v_map || jsonb_build_object(v_pos::text, m);
      end if;
    end loop;

    for el in select value from jsonb_array_elements(p_answers) loop
        v_pos := (el ->> 'position')::numeric::int;
        v_ts := case when jsonb_typeof(el -> 'time_spent_seconds') = 'number' then (el ->> 'time_spent_seconds')::numeric::int end;
        m := v_map -> v_pos::text;
        update public.exam_attempt_items x
           set response           = case when m is null then x.response
                                         when jsonb_typeof(m -> 'canonical') = 'null' then null else m -> 'canonical' end,
               selected_index     = case when m is null then x.selected_index else public._ce_selected_index(m -> 'display') end,
               answered_at        = case when m is null then x.answered_at
                                         when jsonb_typeof(m -> 'canonical') = 'null' then null
                                         else coalesce(x.answered_at, now()) end,
               time_spent_seconds = greatest(x.time_spent_seconds, least(coalesce(v_ts, 0), a.time_limit_seconds, 14400)),
               flagged            = case when jsonb_typeof(el -> 'flagged') = 'boolean' then (el ->> 'flagged')::boolean else x.flagged end
         where x.attempt_id = p_attempt and x.position = v_pos;
    end loop;
  end if;

  perform public._ce_finalize(p_attempt,
    case when v_late and a.timing_mode = 'untimed' then 'abandoned' when v_late then 'expired' else 'submitted' end);
  return public._ce_result(p_attempt);
end
$$;

-- Template branch of get_exam_attempt (the caller holds the row lock).
create or replace function public._ce_get(p_attempt uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  a public.exam_attempts%rowtype;
begin
  select * into a from public.exam_attempts where id = p_attempt;
  if a.status = 'in_progress' and now() > a.expires_at + interval '30 seconds' then
    perform public._ce_finalize(p_attempt, case when a.timing_mode = 'untimed' then 'abandoned' else 'expired' end);
    select * into a from public.exam_attempts where id = p_attempt;
  end if;
  if a.status <> 'in_progress' then
    return public._ce_result(p_attempt);
  end if;
  return jsonb_build_object(
    'mode', 'db',
    'status', a.status,
    'attempt', public._ce_attempt_json(p_attempt),
    'template', jsonb_build_object('id', a.template_id, 'version', a.template_version, 'kind', a.meta ->> 'template_kind'),
    'timing_mode', a.timing_mode,
    'feedback_mode', a.feedback_mode,
    'questions', public._ce_questions_json(p_attempt),
    'answers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'position', i.position,
               'response', public._ce_to_display(c ->> 'type', c -> 'public', i.choice_order, i.display_map, i.response),
               'flagged', i.flagged,
               'time_spent_seconds', i.time_spent_seconds,
               'locked', i.locked_at is not null,
               'check', case when i.locked_at is not null then public._ce_result_item(p_attempt, i.position) end)
             order by i.position)
        from public.exam_attempt_items i
        cross join lateral (select public._ce_item_content(i.question_id, i.question_revision) c offset 0) cc
       where i.attempt_id = p_attempt), '[]'::jsonb),
    'seconds_remaining', greatest(0, ceil(extract(epoch from (a.expires_at - now()))))::int,
    'server_now', now());
end
$$;

-- ============================================================================
-- list_exam_attempts_v2 (§6.2): own attempts, newest first, keyset
-- pagination on (started_at, id); template, scope and scope title included.
-- ============================================================================
create or replace function public.list_exam_attempts_v2(
  p_limit     int         default 20,
  p_before    timestamptz default null,
  p_before_id uuid        default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    perform public._ce_raise('invalid_argument', '{"field":"limit"}');
  end if;
  perform public._exam_expire_stale(v_uid);
  return coalesce((
    select jsonb_agg(x.j order by x.started_at desc, x.id desc)
      from (select a.id, a.started_at, jsonb_build_object(
                     'id', a.id, 'exam', a.exam, 'section', a.section, 'topic', a.topic,
                     'template_id', a.template_id, 'template_version', a.template_version, 'scope', a.scope,
                     'scope_title', (select n.title_ar from public.curriculum_nodes n
                                      where n.id = split_part(split_part(a.scope, '@', 1), 'weak:', 1)
                                         or (left(a.scope, 5) = 'weak:' and n.id = substr(a.scope, 6))
                                      limit 1),
                     'term_scope', a.term_scope, 'retake_of', a.retake_of, 'status', a.status,
                     'question_count', a.question_count, 'correct_count', a.correct_count,
                     'score_percent', a.score_percent, 'time_limit_seconds', a.time_limit_seconds,
                     'started_at', a.started_at, 'submitted_at', a.submitted_at,
                     'duration_seconds', a.duration_seconds,
                     'xp_awarded', coalesce((a.meta ->> 'xp_awarded')::int, 0)) j
              from public.exam_attempts a
             where a.user_id = v_uid
               and (p_before is null
                    or a.started_at < p_before
                    or (p_before_id is not null and a.started_at = p_before and a.id < p_before_id))
             order by a.started_at desc, a.id desc
             limit p_limit) x), '[]'::jsonb);
end
$$;

-- ============================================================================
-- Legacy RPCs, same signatures (§5.9). Bodies copied from 0010 / 0012 / 0013;
-- rows with template_id null keep exactly today's behaviour and payloads.
-- ============================================================================

-- _exam_finalize: 0013 body + template dispatch + learner analytics.
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
  -- template attempts (0014): voiding, typed grading, locks; an untimed
  -- attempt past its 7-day deadline is abandoned
  if a.template_id is not null then
    perform public._ce_finalize(p_attempt, case when p_late and a.timing_mode = 'untimed' then 'abandoned'
                                                 when p_late then 'expired' else 'submitted' end);
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

  -- Learner analytics (0014); never fails the grading.
  begin
    perform public._ce_update_stats(p_attempt);
  exception when others then
    raise warning '_exam_finalize(%): statistics not updated: % (%)', p_attempt, sqlerrm, sqlstate;
  end;

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

-- submit_exam_attempt: 0010 body + template dispatch.
create or replace function public.submit_exam_attempt(p_attempt uuid, p_answers jsonb default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
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
  if a.template_id is not null then
    return public._ce_submit(p_attempt, p_answers);   -- template attempt (0014)
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

-- get_exam_attempt: 0010 body + template dispatch.
create or replace function public.get_exam_attempt(p_attempt uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
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
  if a.template_id is not null then
    return public._ce_get(p_attempt);   -- template attempt (0014)
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

-- start_exam_attempt: 0012 body; the free daily limit counts only
-- exam-quota attempts (legacy attempts default to quota 'exam').
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
set search_path = ''
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
     where user_id = v_uid and started_at >= v_day_start
       and quota = 'exam';   -- 0014: practice-quota template sessions do not count
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

-- _exam_pick: 0012 body; the legacy builder renders and grades choices +
-- correct_index only, so it never picks the typed staging items (matching,
-- ordering, short_answer, numeric have no choices and no correct_index).
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
        || ' where q.is_active and q.exam = $1 and q.question_type in (''mcq'', ''true_false'')';
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

-- search_all (0012, anon + authenticated): its questions group returns stem
-- snippets and ids of every active question, which now includes the
-- curriculum bank. The 0012 body is kept verbatim except that both question
-- queries exclude exam = 'school' (school items are found lesson-level only,
-- through search_content) and staging-imported rows (like questions_read:
-- their keys are minted from a hash that includes the answer, and the group
-- is ordered by key, so even the order of the ids would leak key bits).
-- Patched in place, idempotently, so the rest of the function stays
-- byte-identical to 0012.
do $$
declare
  c_filter constant text := ' and q.exam <> ''school'' and q.import_origin is distinct from ''staging''';
  v_def    text;
  v_new    text;
begin
  v_def := pg_get_functiondef('public.search_all(text, int, text[], int)'::regprocedure);
  if strpos(v_def, c_filter) = 0 then
    v_def := replace(v_def, 'where q.is_active and q.exam <> ''school''', 'where q.is_active');
    v_new := replace(v_def, 'where q.is_active', 'where q.is_active' || c_filter);
    if (char_length(v_new) - char_length(v_def)) <> 2 * char_length(c_filter) then
      raise exception 'search_all: expected exactly two question filters to patch';
    end if;
    execute v_new;
  end if;
end
$$;

-- ============================================================================
-- G) ANALYTICS AND DISCOVERY
-- ============================================================================

-- Lesson node ids under a node (any status), or prep topic nodes under a
-- prep node; null node = every lesson / prep topic of the learner's stats.
create or replace function public._ce_node_lessons(p_node text)
returns setof text
language sql
stable
set search_path = ''
as $$
  with recursive down as (
    select n.id, n.kind from public.curriculum_nodes n where n.id = p_node
    union all
    select c.id, c.kind from public.curriculum_nodes c join down d on c.parent_id = d.id
     where d.kind <> 'lesson' and c.kind <> 'term'
  )
  select id from down where kind = 'lesson'
$$;

-- ============================================================================
-- get_learning_stats (§2.14, §6.2): own totals, by band, weakest lessons
-- (answered ≥ 5, Wilson lower bound z = 1.645 ascending), repeated mistakes
-- (wrong_streak ≥ 2), average time per lesson and a 7 / 30-day trend.
-- By-topic breakdowns stay Elite-gated (listed in `locked`).
-- ============================================================================
create or replace function public.get_learning_stats(p_node text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_premium boolean;
  v_prep    boolean := left(coalesce(p_node, ''), 5) = 'prep:';
  v_lessons text[];
  v_rows    jsonb;
  v_totals  jsonb;
  v_trend   jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_node is not null then
    if char_length(p_node) > 200 then
      perform public._ce_raise('invalid_argument', '{"field":"node"}');
    end if;
    if v_prep then
      if public._ce_parse_scope(p_node) is null then
        perform public._ce_raise('scope_not_found');
      end if;
    elsif not exists (select 1 from public.curriculum_nodes n where n.id = p_node and n.status <> 'source_only') then
      perform public._ce_raise('scope_not_found');
    end if;
  end if;
  v_premium := public.has_premium(v_uid);

  -- the leaf rows (lessons, prep topics) under the node
  if p_node is null then
    v_lessons := array(select s.node_id from public.learner_node_stats s
                         left join public.curriculum_nodes n on n.id = s.node_id
                        where s.user_id = v_uid
                          and (n.kind = 'lesson' or (s.node_id like 'prep:%/%/%')));
  elsif v_prep then
    v_lessons := array(select s.node_id from public.learner_node_stats s
                        where s.user_id = v_uid and s.node_id like 'prep:%/%/%'
                          and (s.node_id = p_node or s.node_id like p_node || '/%'));
  else
    v_lessons := array(select x from public._ce_node_lessons(p_node) x);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'lesson', s.node_id, 'title', n.title_ar, 'answered', s.answered, 'correct', s.correct,
           'time_seconds', s.time_seconds, 'band_answered', to_jsonb(s.band_answered), 'band_correct', to_jsonb(s.band_correct))), '[]'::jsonb)
    into v_rows
    from public.learner_node_stats s
    left join public.curriculum_nodes n on n.id = s.node_id
   where s.user_id = v_uid and s.node_id = any (v_lessons);

  select jsonb_build_object('answered', coalesce(sum((r ->> 'answered')::int), 0)::int,
                            'correct', coalesce(sum((r ->> 'correct')::int), 0)::int,
                            'time_seconds', coalesce(sum((r ->> 'time_seconds')::bigint), 0)::bigint)
    into v_totals
    from jsonb_array_elements(v_rows) r;

  select jsonb_build_object(
           'last_7_days', jsonb_build_object('answered', count(*) filter (where a.submitted_at > now() - interval '7 days')::int,
                                             'correct', count(*) filter (where a.submitted_at > now() - interval '7 days' and i.is_correct)::int),
           'last_30_days', jsonb_build_object('answered', count(*)::int, 'correct', count(*) filter (where i.is_correct)::int))
    into v_trend
    from public.exam_attempts a
    join public.exam_attempt_items i on i.attempt_id = a.id
    join public.questions q on q.id = i.question_id
   where a.user_id = v_uid and a.status in ('submitted', 'expired', 'abandoned')
     and a.submitted_at > now() - interval '30 days' and i.voided is null
     and ((i.response is not null and jsonb_typeof(i.response) <> 'null') or i.selected_index is not null)
     and (p_node is null
          or q.lesson_node_id = any (v_lessons)
          or (v_prep and ('prep:' || q.exam || '/' || q.section || '/' || q.topic = p_node
                          or 'prep:' || q.exam || '/' || q.section || '/' || q.topic like p_node || '/%'
                          or 'prep:' || q.exam || '/' || q.section = p_node)));

  return jsonb_build_object(
    'node', p_node,
    'totals', v_totals,
    'by_band', (select jsonb_agg(jsonb_build_object(
                         'band', b,
                         'answered', coalesce((select sum((r -> 'band_answered' ->> (b - 1))::int) from jsonb_array_elements(v_rows) r), 0)::int,
                         'correct', coalesce((select sum((r -> 'band_correct' ->> (b - 1))::int) from jsonb_array_elements(v_rows) r), 0)::int)
                       order by b)
                  from generate_series(1, 3) b),
    'by_lesson', coalesce((
      select jsonb_agg(jsonb_build_object('lesson', x.lesson, 'title', x.title, 'answered', x.answered, 'correct', x.correct,
                                          'accuracy', round(x.correct::numeric / x.answered, 4),
                                          'wilson_lower', public._ce_wilson(x.correct, x.answered),
                                          'avg_time_seconds', round(x.time_seconds::numeric / x.answered)::int)
                       order by public._ce_wilson(x.correct, x.answered), x.lesson collate "C")
        from jsonb_to_recordset(v_rows) x (lesson text, title text, answered int, correct int, time_seconds bigint)
       where x.answered >= 5), '[]'::jsonb),
    -- a staging key is answer-derived (§2.2): those rows carry an opaque
    -- handle of the (random) question id instead; legacy keys are public
    'repeated_mistakes', coalesce((
      select jsonb_agg(jsonb_build_object('question_key', case when q.import_origin = 'staging' or q.exam = 'school'
                                                               then 'h-' || substr(encode(sha256(convert_to('mistake:' || q.id::text, 'UTF8')), 'hex'), 1, 20)
                                                               else q.key end,
                                          'wrong_streak', s.wrong_streak,
                                          'lesson', coalesce(q.lesson_node_id, 'prep:' || q.exam || '/' || q.section || '/' || q.topic))
                       order by s.wrong_streak desc, s.last_seen_at desc)
        from public.learner_question_stats s
        join public.questions q on q.id = s.question_id
       where s.user_id = v_uid and s.wrong_streak >= 2
         and (p_node is null or q.lesson_node_id = any (v_lessons)
              or 'prep:' || q.exam || '/' || q.section || '/' || q.topic = any (v_lessons))), '[]'::jsonb),
    'trend', v_trend,
    'by_topic', case when v_premium then coalesce((
      select jsonb_agg(jsonb_build_object('topic', s.node_id, 'answered', s.answered, 'correct', s.correct) order by s.node_id collate "C")
        from public.learner_node_stats s
       where s.user_id = v_uid and s.node_id like 'prep:%/%/%'
         and (p_node is null or not v_prep or s.node_id = p_node or s.node_id like p_node || '/%')), '[]'::jsonb)
      else '[]'::jsonb end,
    'locked', case when v_premium then '[]'::jsonb else '["by_topic"]'::jsonb end);
end
$$;

-- ============================================================================
-- get_practice_recommendations (§6.2): weakness reviews for weak lessons,
-- reviews for shaky ones, then untried lessons of the subjects in practice.
-- ============================================================================
create or replace function public.get_practice_recommendations(p_limit int default 5)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_limit is null or p_limit not between 1 and 20 then
    perform public._ce_raise('invalid_argument', '{"field":"limit"}');
  end if;
  return coalesce((
    select jsonb_agg(r.j order by r.grp, r.w nulls last, r.ord_key collate "C")
      from (select * from (
              select 1 grp, public._ce_wilson(s.correct, s.answered) w, s.node_id ord_key,
                     jsonb_build_object('kind', case when s.correct::numeric / s.answered < 0.6 then 'weakness_review' else 'lesson_review' end,
                                        'node', s.node_id, 'title', n.title_ar,
                                        'reason', jsonb_build_object('accuracy', round(s.correct::numeric / s.answered, 4), 'answered', s.answered),
                                        'href', '/learn/' || s.node_id) j
                from public.learner_node_stats s
                join public.curriculum_nodes n on n.id = s.node_id and n.kind = 'lesson'
               where s.user_id = v_uid and s.answered >= 5 and s.correct::numeric / s.answered < 0.8
              union all
              select 2, null, lpad(n.ord::text, 6, '0') || n.id,
                     jsonb_build_object('kind', 'lesson_quiz', 'node', n.id, 'title', n.title_ar,
                                        'reason', jsonb_build_object('accuracy', null, 'answered', 0),
                                        'href', '/learn/' || n.id)
                from public.curriculum_nodes n
               where n.kind = 'lesson' and n.status = 'verified' and not n.unit_opener
                 and n.subject in (select n2.subject from public.learner_node_stats s2
                                     join public.curriculum_nodes n2 on n2.id = s2.node_id and n2.kind = 'lesson'
                                    where s2.user_id = v_uid)
                 and not exists (select 1 from public.learner_node_stats s3 where s3.user_id = v_uid and s3.node_id = n.id)
                 and exists (select 1 from public.scope_pool_members m where m.lesson_node_id = n.id and not m.is_premium)) u
            order by grp, w nulls last, ord_key collate "C"
            limit p_limit) r), '[]'::jsonb);
end
$$;

-- ============================================================================
-- get_scope_availability (§6.2, §7): pool counts of a scope and, per active
-- template that lists its scope kind, whether it is offered (the pool rule:
-- exclusion components ≥ ceil(min × min_pool_factor); the mini count for a
-- mini version). anon = guest tier.
-- ============================================================================
create or replace function public.get_scope_availability(p_node text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_tier    text;
  v_parsed  jsonb := public._ce_parse_scope(p_node);
  v_node    public.curriculum_nodes%rowtype;
  v_kind    text;
  v_key     text;
  v_premium boolean;
  v_groups  int;
  v_counts  jsonb;
begin
  if v_parsed is null or v_parsed ->> 'type' = 'weak' then
    perform public._ce_raise('scope_not_found');
  end if;
  if v_parsed ->> 'type' = 'prep' then
    v_kind := case when v_parsed ->> 'topic' is not null then 'prep_topic'
                   when v_parsed ->> 'section' is not null then 'prep_section' else 'prep' end;
    v_key := p_node;
  else
    select * into v_node from public.curriculum_nodes n where n.id = v_parsed ->> 'node';
    if not found or v_node.kind = 'term' or v_node.status in ('source_only', 'unavailable') then
      perform public._ce_raise('scope_not_found');
    end if;
    if v_parsed ->> 'term' is not null and v_node.kind <> 'subject' then
      perform public._ce_raise('scope_not_found');
    end if;
    v_kind := v_node.kind || coalesce('@' || (v_parsed ->> 'term'), '');
    v_key := case when v_parsed ->> 'term' in ('t1', 't2') then p_node else v_node.id end;
  end if;
  v_premium := v_uid is not null and public.has_premium(v_uid);
  v_tier := case when v_uid is null then 'guest' when v_premium then 'premium' else 'free' end;

  select coalesce(jsonb_object_agg(b::text, coalesce((select case when v_premium then c.published_count else c.free_count end
                                                        from public.scope_pool_counts c where c.node_id = v_key and c.band = b), 0)), '{}'::jsonb)
    into v_counts
    from generate_series(1, 3) b;
  select coalesce((select case when v_premium then c.group_count else c.free_group_count end
                     from public.scope_pool_counts c where c.node_id = v_key and c.band = 0), 0)
    into v_groups;

  return jsonb_build_object(
    'node', p_node,
    'counts', v_counts,
    'groups', v_groups,
    'templates', coalesce((
      select jsonb_agg(o.j order by o.id collate "C")
        from (select t.id, (select jsonb_build_object(
                        'id', t.id, 'version', t.version,
                        'offered', not refused and plan_ok and v_groups >= req,
                        'mini', plan_ok and mini,
                        'min_pool', req,
                        'reason', case when refused then 'scope_too_large' when not plan_ok then plan ->> 'error'
                                       when v_groups < req then 'insufficient_pool' end)
                      from (select p plan, (p ->> 'ok')::boolean plan_ok, coalesce((p ->> 'mini')::boolean, false) mini,
                                   ceil(case when (p ->> 'ok')::boolean and (p ->> 'mini')::boolean then (p ->> 'n')::int
                                             else (t.definition #>> '{count,min}')::int end
                                        * coalesce((t.definition #>> '{eligibility,min_pool_factor}')::numeric, 1))::int req,
                                   v_tier = 'guest' and split_part(v_kind, '@', 1) in ('stage', 'grade', 'track', 'prep') refused
                              from (select public._ce_plan_count(t.definition, v_tier, null) p) pp) z) j
                from (select distinct on (x.id) x.id, x.version, x.definition
                        from public.exam_templates x where x.is_active
                       order by x.id, x.version desc) t
               where (t.definition -> 'scope_kinds') ? v_kind) o), '[]'::jsonb));
end
$$;

-- ============================================================================
-- search_content (§6.2, §7): groups node, resource, exam and — signed in and
-- never with p_anon — question (lesson-level counts only, never stems;
-- premium, unpublished and inactive items excluded). Totals capped at 100.
-- ============================================================================
create or replace function public.search_content(
  p_q      text,
  p_kinds  text[]  default null,
  p_node   text    default null,
  p_limit  int     default 10,
  p_offset int     default 0,
  p_anon   boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '500ms'
as $$
declare
  c_cap   constant int := 100;
  v_q     text := public.search_normalize_v2(coalesce(p_q, ''));
  v_like  text;
  v_kinds text[] := coalesce(p_kinds, array['node', 'resource', 'exam', 'question']);
  v_anon  boolean := coalesce(p_anon, false) or auth.uid() is null;
  v_out   jsonb := '{}'::jsonb;
  v_total int;
  v_items jsonb;
begin
  if char_length(v_q) < 2 or char_length(coalesce(p_q, '')) > 200 then
    perform public._ce_raise('invalid_argument', '{"field":"q"}');
  end if;
  if exists (select 1 from unnest(v_kinds) k where k not in ('node', 'resource', 'exam', 'question')) then
    perform public._ce_raise('invalid_argument', '{"field":"kinds"}');
  end if;
  if p_limit is null or p_limit not between 1 and 50 then
    perform public._ce_raise('invalid_argument', '{"field":"limit"}');
  end if;
  if p_offset is null or p_offset not between 0 and 1000 then
    perform public._ce_raise('invalid_argument', '{"field":"offset"}');
  end if;
  if p_node is not null and not public._ce_is_node_id(p_node) then
    perform public._ce_raise('invalid_argument', '{"field":"node"}');
  end if;
  v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  if 'node' = any (v_kinds) then
    select count(*)::int into v_total from (
      select 1 from public.curriculum_nodes n
       where n.status not in ('source_only', 'unavailable') and n.kind <> 'term' and n.search_norm like v_like
         and (p_node is null or n.id = p_node or n.id like p_node || '/%')
       limit c_cap) x;
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', n.id, 'kind', n.kind, 'title', n.title_ar, 'subject', n.subject,
             'href', case when n.kind in ('subject', 'unit', 'chapter', 'lesson') then '/learn/' || n.id end)
             order by (n.search_norm = v_q) desc, char_length(n.title_ar), n.id collate "C"), '[]'::jsonb)
      into v_items
      from (select * from public.curriculum_nodes n
             where n.status not in ('source_only', 'unavailable') and n.kind <> 'term' and n.search_norm like v_like
               and (p_node is null or n.id = p_node or n.id like p_node || '/%')
             order by (n.search_norm = v_q) desc, char_length(n.title_ar), n.id collate "C"
             limit p_limit offset p_offset) n;
    v_out := v_out || jsonb_build_object('node', jsonb_build_object('total', v_total, 'items', v_items));
  end if;

  if 'resource' = any (v_kinds) then
    select count(*)::int into v_total from (
      select 1 from public.curriculum_resources r
       where r.search_norm like v_like
         and (p_node is null or r.subject_node_id = p_node or r.subject_node_id like p_node || '/%'
              or p_node like r.subject_node_id || '/%')
       limit c_cap) x;
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', r.id, 'kind', r.kind, 'title', r.title, 'subject', r.subject_node_id, 'part', r.part,
             'availability', r.availability, 'url', case when r.availability = 'unavailable' then null else r.url end)
             order by r.title, r.id collate "C"), '[]'::jsonb)
      into v_items
      from (select * from public.curriculum_resources r
             where r.search_norm like v_like
               and (p_node is null or r.subject_node_id = p_node or r.subject_node_id like p_node || '/%'
                    or p_node like r.subject_node_id || '/%')
             order by r.title, r.id collate "C"
             limit p_limit offset p_offset) r;
    v_out := v_out || jsonb_build_object('resource', jsonb_build_object('total', v_total, 'items', v_items));
  end if;

  if 'exam' = any (v_kinds) then
    -- exam entry points: matching lessons / units / subjects that have a published pool
    select count(*)::int into v_total from (
      select 1 from public.curriculum_nodes n
      join public.scope_pool_counts c on c.node_id = n.id and c.band = 0 and c.free_group_count > 0
       where n.status = 'verified' and n.kind in ('subject', 'unit', 'chapter', 'lesson') and n.search_norm like v_like
         and (p_node is null or n.id = p_node or n.id like p_node || '/%')
       limit c_cap) x;
    select coalesce(jsonb_agg(jsonb_build_object(
             'node', n.id, 'kind', n.kind, 'title', n.title_ar,
             'template', case n.kind when 'lesson' then 'lesson-quiz' when 'subject' then 'subject-quiz' else 'chapter-quiz' end,
             'count', n.free_group_count, 'href', '/learn/' || n.id)
             order by char_length(n.title_ar), n.id collate "C"), '[]'::jsonb)
      into v_items
      from (select n.*, c.free_group_count from public.curriculum_nodes n
              join public.scope_pool_counts c on c.node_id = n.id and c.band = 0 and c.free_group_count > 0
             where n.status = 'verified' and n.kind in ('subject', 'unit', 'chapter', 'lesson') and n.search_norm like v_like
               and (p_node is null or n.id = p_node or n.id like p_node || '/%')
             order by char_length(n.title_ar), n.id collate "C"
             limit p_limit offset p_offset) n;
    v_out := v_out || jsonb_build_object('exam', jsonb_build_object('total', v_total, 'items', v_items));
  end if;

  if 'question' = any (v_kinds) and not v_anon and char_length(v_q) >= 3 then
    select count(*)::int into v_total from (
      select q.lesson_node_id from public.questions q
       where q.is_active and q.status = 'published' and not q.is_premium and q.exam = 'school'
         and q.stem_norm like v_like
         and (p_node is null or q.lesson_node_id like p_node || '/%' or q.lesson_node_id = p_node)
       group by q.lesson_node_id
       limit c_cap) x;
    select coalesce(jsonb_agg(jsonb_build_object('lesson', g.lesson_node_id, 'title', n.title_ar, 'count', g.n,
                                                 'href', '/learn/' || g.lesson_node_id)
                              order by g.n desc, g.lesson_node_id collate "C"), '[]'::jsonb)
      into v_items
      from (select q.lesson_node_id, count(*)::int n from public.questions q
             where q.is_active and q.status = 'published' and not q.is_premium and q.exam = 'school'
               and q.stem_norm like v_like
               and (p_node is null or q.lesson_node_id like p_node || '/%' or q.lesson_node_id = p_node)
             group by q.lesson_node_id
             order by count(*) desc, q.lesson_node_id collate "C"
             limit p_limit offset p_offset) g
      left join public.curriculum_nodes n on n.id = g.lesson_node_id;
    v_out := v_out || jsonb_build_object('question', jsonb_build_object('total', v_total, 'items', v_items));
  elsif 'question' = any (v_kinds) and not v_anon then
    v_out := v_out || jsonb_build_object('question', jsonb_build_object('total', 0, 'items', '[]'::jsonb));
  end if;

  return jsonb_build_object('query', v_q, 'groups', v_out);
end
$$;

-- ============================================================================
-- H) IMPORT (service role; §6.3). One upsert function per entity returns
-- 'inserted' | 'updated' | 'unchanged'; a bad row raises and is isolated by
-- ce_import_batch. Unchanged rows are never written (is distinct from).
-- ============================================================================

-- jsonb string array → text[] (null → '{}').
create or replace function public._ce_text_array(p jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p) = 'array' then array(select jsonb_array_elements_text(p)) else '{}'::text[] end
$$;

create or replace function public._ce_import_source(r jsonb)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_ins boolean;
begin
  insert into public.content_sources as t (id, kind, name_ar, name_en, operator, domain, base_urls, license_status,
                                           provenance_status, redistribution, publish_policy, retrieved_at, notes)
  values (r ->> 'id', r ->> 'kind', r ->> 'name_ar', r ->> 'name_en', r ->> 'operator', r ->> 'domain',
          public._ce_text_array(r -> 'base_urls'), r ->> 'license_status', r ->> 'provenance_status',
          r ->> 'redistribution', r ->> 'publish_policy', (r #>> '{retrieval,retrieved_at}')::timestamptz,
          left(r ->> 'notes', 4000))
  on conflict (id) do update
     set kind = excluded.kind, name_ar = excluded.name_ar, name_en = excluded.name_en, operator = excluded.operator,
         domain = excluded.domain, base_urls = excluded.base_urls, license_status = excluded.license_status,
         provenance_status = excluded.provenance_status, redistribution = excluded.redistribution,
         publish_policy = excluded.publish_policy, retrieved_at = excluded.retrieved_at, notes = excluded.notes,
         updated_at = now()
   where (t.kind, t.name_ar, t.name_en, t.operator, t.domain, t.base_urls, t.license_status, t.provenance_status,
          t.redistribution, t.publish_policy, t.retrieved_at, t.notes)
         is distinct from
         (excluded.kind, excluded.name_ar, excluded.name_en, excluded.operator, excluded.domain, excluded.base_urls,
          excluded.license_status, excluded.provenance_status, excluded.redistribution, excluded.publish_policy,
          excluded.retrieved_at, excluded.notes)
  returning (xmax = 0) into v_ins;
  return case when v_ins is null then 'unchanged' when v_ins then 'inserted' else 'updated' end;
end
$$;

create or replace function public._ce_import_node(r jsonb)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_ins boolean;
begin
  insert into public.curriculum_nodes as t (id, parent_id, kind, stage, grade, track, subject, ord, title_ar, title_en,
                                            term, term_status, in_plan, status, source_refs, unit_opener)
  values (r ->> 'id', r ->> 'parent_id', r ->> 'kind', r ->> 'stage', r ->> 'grade', r ->> 'track', r ->> 'subject',
          coalesce((r ->> 'order')::int, 0), r ->> 'title_ar', r ->> 'title_en', r ->> 'term',
          coalesce(r ->> 'term_status', 'unknown'), coalesce((r ->> 'in_plan')::boolean, true), r ->> 'status',
          coalesce(r -> 'source_refs', '[]'::jsonb), coalesce((r ->> 'unit_opener')::boolean, false))
  on conflict (id) do update
     set parent_id = excluded.parent_id, kind = excluded.kind, stage = excluded.stage, grade = excluded.grade,
         track = excluded.track, subject = excluded.subject, ord = excluded.ord, title_ar = excluded.title_ar,
         title_en = excluded.title_en, term = excluded.term, term_status = excluded.term_status,
         in_plan = excluded.in_plan, status = excluded.status, source_refs = excluded.source_refs,
         unit_opener = excluded.unit_opener, updated_at = now()
   where (t.parent_id, t.kind, t.stage, t.grade, t.track, t.subject, t.ord, t.title_ar, t.title_en, t.term,
          t.term_status, t.in_plan, t.status, t.source_refs, t.unit_opener)
         is distinct from
         (excluded.parent_id, excluded.kind, excluded.stage, excluded.grade, excluded.track, excluded.subject,
          excluded.ord, excluded.title_ar, excluded.title_en, excluded.term, excluded.term_status, excluded.in_plan,
          excluded.status, excluded.source_refs, excluded.unit_opener)
  returning (xmax = 0) into v_ins;
  return case when v_ins is null then 'unchanged' when v_ins then 'inserted' else 'updated' end;
end
$$;

create or replace function public._ce_import_resource(r jsonb)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_ins boolean;
begin
  insert into public.curriculum_resources as t (id, source_id, subject_node_id, kind, title, part, year_label, url,
                                                file_type, page_count, external_count, availability, term,
                                                term_status, license_status, redistribution, status, retrieved_at)
  values (r ->> 'id', r ->> 'source_id', r ->> 'subject_node_id', r ->> 'kind', r ->> 'title', (r ->> 'part')::smallint,
          r ->> 'year_label', r ->> 'url', r ->> 'file_type', (r ->> 'page_count')::int, (r ->> 'external_count')::int,
          r ->> 'availability', r ->> 'term', coalesce(r ->> 'term_status', 'unknown'), r ->> 'license_status',
          r ->> 'redistribution', r ->> 'status', (r ->> 'retrieved_at')::timestamptz)
  on conflict (id) do update
     set source_id = excluded.source_id, subject_node_id = excluded.subject_node_id, kind = excluded.kind,
         title = excluded.title, part = excluded.part, year_label = excluded.year_label, url = excluded.url,
         file_type = excluded.file_type, page_count = excluded.page_count, external_count = excluded.external_count,
         availability = excluded.availability, term = excluded.term, term_status = excluded.term_status,
         license_status = excluded.license_status, redistribution = excluded.redistribution,
         status = excluded.status, retrieved_at = excluded.retrieved_at, updated_at = now()
   where (t.source_id, t.subject_node_id, t.kind, t.title, t.part, t.year_label, t.url, t.file_type, t.page_count,
          t.external_count, t.availability, t.term, t.term_status, t.license_status, t.redistribution, t.status,
          t.retrieved_at)
         is distinct from
         (excluded.source_id, excluded.subject_node_id, excluded.kind, excluded.title, excluded.part,
          excluded.year_label, excluded.url, excluded.file_type, excluded.page_count, excluded.external_count,
          excluded.availability, excluded.term, excluded.term_status, excluded.license_status,
          excluded.redistribution, excluded.status, excluded.retrieved_at)
  returning (xmax = 0) into v_ins;
  return case when v_ins is null then 'unchanged' when v_ins then 'inserted' else 'updated' end;
end
$$;

create or replace function public._ce_import_subject_term(r jsonb)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_ins boolean;
begin
  insert into public.subject_terms as t (subject_node_id, term, status, evidence)
  values (r ->> 'subject_node_id', r ->> 'term', r ->> 'status', public._ce_text_array(r -> 'evidence'))
  on conflict (subject_node_id, term) do update
     set status = excluded.status, evidence = excluded.evidence, updated_at = now()
   where (t.status, t.evidence) is distinct from (excluded.status, excluded.evidence)
  returning (xmax = 0) into v_ins;
  return case when v_ins is null then 'unchanged' when v_ins then 'inserted' else 'updated' end;
end
$$;

create or replace function public._ce_import_lesson_range(r jsonb)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_ins boolean;
begin
  insert into public.lesson_resource_ranges as t (lesson_node_id, resource_id, pdf_start, pdf_end, printed_start,
                                                  printed_end, method, status)
  values (r ->> 'lesson_node_id', r ->> 'resource_id', (r ->> 'pdf_start')::int, (r ->> 'pdf_end')::int,
          (r ->> 'printed_start')::int, (r ->> 'printed_end')::int, r ->> 'method', r ->> 'status')
  on conflict (lesson_node_id, resource_id) do update
     set pdf_start = excluded.pdf_start, pdf_end = excluded.pdf_end, printed_start = excluded.printed_start,
         printed_end = excluded.printed_end, method = excluded.method, status = excluded.status
   where (t.pdf_start, t.pdf_end, t.printed_start, t.printed_end, t.method, t.status)
         is distinct from
         (excluded.pdf_start, excluded.pdf_end, excluded.printed_start, excluded.printed_end, excluded.method, excluded.status)
  returning (xmax = 0) into v_ins;
  return case when v_ins is null then 'unchanged' when v_ins then 'inserted' else 'updated' end;
end
$$;

create or replace function public._ce_import_objective(r jsonb)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_ins boolean;
begin
  insert into public.learning_objectives as t (id, lesson_node_id, text_ar, text_en, origin, status)
  values (r ->> 'id', r ->> 'lesson_node_id', r ->> 'text_ar', r ->> 'text_en', r ->> 'origin', r ->> 'status')
  on conflict (id) do update
     set lesson_node_id = excluded.lesson_node_id, text_ar = excluded.text_ar, text_en = excluded.text_en,
         origin = excluded.origin, status = excluded.status, updated_at = now()
   where (t.lesson_node_id, t.text_ar, t.text_en, t.origin, t.status)
         is distinct from (excluded.lesson_node_id, excluded.text_ar, excluded.text_en, excluded.origin, excluded.status)
  returning (xmax = 0) into v_ins;
  return case when v_ins is null then 'unchanged' when v_ins then 'inserted' else 'updated' end;
end
$$;

create or replace function public._ce_import_stimulus(r jsonb)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_ins boolean;
begin
  insert into public.question_stimuli as t (id, language, text, origin)
  values (r ->> 'id', r ->> 'language', r ->> 'text', r ->> 'origin')
  on conflict (id) do update
     set language = excluded.language, text = excluded.text, origin = excluded.origin, updated_at = now()
   where (t.language, t.text, t.origin) is distinct from (excluded.language, excluded.text, excluded.origin)
  returning (xmax = 0) into v_ins;
  return case when v_ins is null then 'unchanged' when v_ins then 'inserted' else 'updated' end;
end
$$;

create or replace function public._ce_import_template(r jsonb)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_ins boolean;
begin
  insert into public.exam_templates as t (id, version, kind, definition, is_active)
  values (r ->> 'id', (r ->> 'version')::int, r ->> 'kind', r, true)
  on conflict (id, version) do update
     set kind = excluded.kind, definition = excluded.definition, is_active = true, updated_at = now()
   where (t.kind, t.definition, t.is_active) is distinct from (excluded.kind, excluded.definition, true)
  returning (xmax = 0) into v_ins;
  return case when v_ins is null then 'unchanged' when v_ins then 'inserted' else 'updated' end;
end
$$;

-- Row error with a code (isolated by ce_import_batch).
create or replace function public._ce_row_error(p_code text, p_detail jsonb default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using message = p_code, detail = coalesce(p_detail, '{}'::jsonb)::text, hint = 'ce_row_error';
end
$$;

-- question@1 → questions + question_keys + question_curriculum (§6.3 step 4).
-- A content change appends the previous version to question_revisions and
-- bumps revision; legacy rows (0011, import_origin ≠ staging) only get the
-- new columns, their stem / choices / key stay as seeded.
create or replace function public._ce_import_question(r jsonb)
returns text
language plpgsql
set search_path = ''
as $$
declare
  q          public.questions%rowtype;
  k          public.question_keys%rowtype;
  v_type     text := r ->> 'question_type';
  v_payload  jsonb := r -> 'payload';
  v_public   jsonb;
  v_choices  jsonb := '[]'::jsonb;
  v_correct  smallint;
  v_accepted text[];
  v_exam     text;
  v_section  text;
  v_topic    text;
  v_lesson   text;
  v_expl     text := r #>> '{explanation,text}';
  v_steps    jsonb := coalesce(r #> '{explanation,steps}', '[]'::jsonb);
  v_source   uuid;
  v_rev      int;
  v_content  boolean;
  v_meta     boolean;
begin
  if r ->> 'status' is distinct from 'published' then
    perform public._ce_row_error('not_published', jsonb_build_object('status', r ->> 'status'));
  end if;
  if r #>> '{_import,duplicate_of}' is not null then
    perform public._ce_row_error('duplicate_content', jsonb_build_object('same_as', r #>> '{_import,duplicate_of}'));
  end if;
  if coalesce(btrim(v_expl), '') = '' then
    perform public._ce_row_error('missing_explanation');
  end if;
  if r ->> 'scope' = 'curriculum' then
    v_lesson := r #>> '{curriculum,lesson}';
    v_exam := 'school';
    v_section := r #>> '{curriculum,subject}';
    v_topic := v_lesson;
    if not exists (select 1 from public.curriculum_nodes n where n.id = v_lesson and n.kind = 'lesson') then
      perform public._ce_row_error('missing_reference', jsonb_build_object('lesson', v_lesson));
    end if;
  else
    v_exam := r #>> '{prep,exam}';
    v_section := r #>> '{prep,section}';
    v_topic := r #>> '{prep,topic}';
    if v_exam is null or public.exam_of_section(v_section) is distinct from v_exam
       or not (v_topic = any (public.exam_section_topics(v_section))) then
      perform public._ce_row_error('invalid_row', jsonb_build_object('field', 'prep'));
    end if;
  end if;
  if r ->> 'stimulus_id' is not null
     and not exists (select 1 from public.question_stimuli s where s.id = r ->> 'stimulus_id') then
    perform public._ce_row_error('missing_reference', jsonb_build_object('stimulus', r ->> 'stimulus_id'));
  end if;
  if r ->> 'objective_id' is not null
     and not exists (select 1 from public.learning_objectives o where o.id = r ->> 'objective_id') then
    perform public._ce_row_error('missing_reference', jsonb_build_object('objective', r ->> 'objective_id'));
  end if;

  v_public := public._ce_public_payload(v_type, v_payload);
  if v_public is null then
    perform public._ce_row_error('invalid_row', jsonb_build_object('field', 'question_type'));
  end if;
  if v_type in ('mcq', 'true_false') then
    v_choices := coalesce((select jsonb_agg(o -> 'text' order by n)
                             from jsonb_array_elements(coalesce(v_payload -> 'options', '[]')) with ordinality e (o, n)), '[]'::jsonb);
    v_correct := (select (n - 1)::smallint from jsonb_array_elements(v_payload -> 'options') with ordinality e (o, n)
                   where o ->> 'id' = v_payload #>> '{answer,option_id}' limit 1);
    if v_correct is null then
      perform public._ce_row_error('invalid_row', jsonb_build_object('field', 'payload.answer'));
    end if;
  elsif v_type = 'short_answer' and coalesce(v_payload ->> 'match', 'normalized_exact') <> 'exact_marks' then
    -- accepted_norm is computed here, with the same function that normalizes responses (§6.1)
    v_accepted := array(select public.search_normalize_v2(x) from jsonb_array_elements_text(coalesce(v_payload -> 'accepted', '[]')) x);
  end if;
  if r #>> '{provenance,origin}' = 'internal_authored' then
    select s.id into v_source from public.question_sources s where s.slug = 'jazira-original';
  end if;

  select * into q from public.questions where key = r ->> 'id' for update;
  if found then
    select * into k from public.question_keys where question_id = q.id;
  end if;

  if q.id is not null and q.import_origin is distinct from 'staging' then
    -- legacy (0011) row: new columns only; the seeded stem, choices and key stay
    if q.question_type = 'mcq' and v_type = 'mcq' and q.choices is distinct from v_choices then
      perform public._ce_row_error('legacy_mismatch', jsonb_build_object('field', 'choices'));
    end if;
    -- the legacy RPCs grade by correct_index and template sessions by answer:
    -- both must name the same option, or one item would have two keys
    if v_type is distinct from q.question_type then
      perform public._ce_row_error('legacy_mismatch', jsonb_build_object('field', 'question_type'));
    end if;
    if k.correct_index is distinct from v_correct then
      perform public._ce_row_error('legacy_mismatch', jsonb_build_object('field', 'answer'));
    end if;
    update public.questions t
       set question_type = v_type, difficulty_level = (r ->> 'difficulty')::smallint, item_style = r ->> 'item_style',
           provenance = r #>> '{provenance,origin}', status = 'published', validation_status = r #>> '{validation,status}',
           content_hash = r ->> 'content_hash', payload_public = v_public,
           shuffle_options = coalesce((r ->> 'shuffle_options')::boolean, true),
           fixed_order_reason = v_payload ->> 'fixed_order_reason', exclusion_group = r #>> '{dedup,exclusion_group}',
           objective_id = r ->> 'objective_id', import_origin = 'legacy_seed',
           option_flags = public._ce_option_flags(v_type, v_public)
     where t.id = q.id
       and (t.question_type, t.difficulty_level, t.item_style, t.provenance, t.status, t.validation_status,
            t.content_hash, t.payload_public, t.shuffle_options, t.fixed_order_reason, t.exclusion_group,
            t.objective_id, t.import_origin)
           is distinct from
           (v_type, (r ->> 'difficulty')::smallint, r ->> 'item_style', r #>> '{provenance,origin}', 'published',
            r #>> '{validation,status}', r ->> 'content_hash', v_public, coalesce((r ->> 'shuffle_options')::boolean, true),
            v_payload ->> 'fixed_order_reason', r #>> '{dedup,exclusion_group}', r ->> 'objective_id', 'legacy_seed');
    v_meta := found;
    update public.question_keys t
       set answer = v_payload, explanation_steps = v_steps, accepted_norm = v_accepted
     where t.question_id = q.id
       and (t.answer, t.explanation_steps, t.accepted_norm) is distinct from (v_payload, v_steps, v_accepted);
    v_meta := v_meta or found;
    return case when v_meta then 'updated' else 'unchanged' end;
  end if;

  if q.id is null then
    insert into public.questions (key, exam, section, topic, difficulty, stem, passage, choices, time_limit_seconds, tags,
                                  source_id, language, is_premium, is_active, question_type, difficulty_level, item_style,
                                  provenance, status, validation_status, content_hash, revision, lesson_node_id,
                                  objective_id, stimulus_id, shuffle_options, fixed_order_reason, exclusion_group,
                                  payload_public, source_resource_id, source_printed_start, source_printed_end,
                                  source_pdf_page, import_origin, option_flags)
    values (r ->> 'id', v_exam, v_section, v_topic, (r ->> 'difficulty_band')::smallint, r ->> 'stem', null, v_choices,
            coalesce((r ->> 'time_limit_seconds')::int, 60), public._ce_text_array(r -> 'tags'), v_source,
            coalesce(r ->> 'language', 'ar'), coalesce((r ->> 'is_premium')::boolean, false), true, v_type,
            (r ->> 'difficulty')::smallint, r ->> 'item_style', r #>> '{provenance,origin}', 'published',
            r #>> '{validation,status}', r ->> 'content_hash', coalesce((r ->> 'revision')::int, 1), v_lesson,
            r ->> 'objective_id', r ->> 'stimulus_id', coalesce((r ->> 'shuffle_options')::boolean, true),
            v_payload ->> 'fixed_order_reason', r #>> '{dedup,exclusion_group}', v_public,
            r #>> '{source,resource_id}', (r #>> '{source,printed_page_start}')::int,
            (r #>> '{source,printed_page_end}')::int, (r #>> '{source,pdf_page_start}')::int, 'staging',
            public._ce_option_flags(v_type, v_public))
    returning * into q;
    insert into public.question_keys (question_id, correct_index, explanation, answer, explanation_steps, accepted_norm)
    values (q.id, v_correct, v_expl, v_payload, v_steps, v_accepted);
    perform public._ce_import_links(q.id, v_lesson, r -> 'links');
    return 'inserted';
  end if;

  -- existing staging row: content change → snapshot + revision bump; metadata only → update
  v_content := (q.question_type, q.language, q.stem, q.stimulus_id, q.payload_public, q.choices, q.content_hash)
               is distinct from (v_type, coalesce(r ->> 'language', 'ar'), r ->> 'stem', r ->> 'stimulus_id', v_public,
                                 v_choices, r ->> 'content_hash')
               or (k.answer, k.explanation, k.explanation_steps, k.correct_index, k.accepted_norm)
                  is distinct from (v_payload, v_expl, v_steps, v_correct, v_accepted);
  v_meta := (q.exam, q.section, q.topic, q.difficulty, q.time_limit_seconds, q.tags, q.source_id, q.is_premium,
             q.is_active, q.difficulty_level, q.item_style, q.provenance, q.status, q.validation_status,
             q.lesson_node_id, q.objective_id, q.shuffle_options, q.fixed_order_reason, q.exclusion_group,
             q.source_resource_id, q.source_printed_start, q.source_printed_end, q.source_pdf_page)
            is distinct from
            (v_exam, v_section, v_topic, (r ->> 'difficulty_band')::smallint, coalesce((r ->> 'time_limit_seconds')::int, 60),
             public._ce_text_array(r -> 'tags'), v_source, coalesce((r ->> 'is_premium')::boolean, false), true,
             (r ->> 'difficulty')::smallint, r ->> 'item_style', r #>> '{provenance,origin}', 'published',
             r #>> '{validation,status}', v_lesson, r ->> 'objective_id', coalesce((r ->> 'shuffle_options')::boolean, true),
             v_payload ->> 'fixed_order_reason', r #>> '{dedup,exclusion_group}', r #>> '{source,resource_id}',
             (r #>> '{source,printed_page_start}')::int, (r #>> '{source,printed_page_end}')::int,
             (r #>> '{source,pdf_page_start}')::int);
  if not v_content and not v_meta then
    return 'unchanged';
  end if;
  v_rev := q.revision;
  if v_content then
    insert into public.question_revisions (question_id, revision, question_type, language, stem, stimulus_id, stimulus_text,
                                           payload_public, choices, answer, correct_index, explanation)
    values (q.id, q.revision, q.question_type, q.language, q.stem, q.stimulus_id,
            coalesce((select s.text from public.question_stimuli s where s.id = q.stimulus_id), q.passage),
            q.payload_public, q.choices, k.answer, k.correct_index,
            jsonb_build_object('text', k.explanation, 'steps', coalesce(k.explanation_steps, '[]'::jsonb)))
    on conflict (question_id, revision) do nothing;
    v_rev := greatest(q.revision + 1, coalesce((r ->> 'revision')::int, 1));
  end if;
  update public.questions t
     set exam = v_exam, section = v_section, topic = v_topic, difficulty = (r ->> 'difficulty_band')::smallint,
         stem = r ->> 'stem', choices = v_choices, time_limit_seconds = coalesce((r ->> 'time_limit_seconds')::int, 60),
         tags = public._ce_text_array(r -> 'tags'), source_id = v_source, language = coalesce(r ->> 'language', 'ar'),
         is_premium = coalesce((r ->> 'is_premium')::boolean, false), is_active = true, question_type = v_type,
         difficulty_level = (r ->> 'difficulty')::smallint, item_style = r ->> 'item_style',
         provenance = r #>> '{provenance,origin}', status = 'published', validation_status = r #>> '{validation,status}',
         content_hash = r ->> 'content_hash', revision = v_rev, lesson_node_id = v_lesson,
         objective_id = r ->> 'objective_id', stimulus_id = r ->> 'stimulus_id',
         shuffle_options = coalesce((r ->> 'shuffle_options')::boolean, true),
         fixed_order_reason = v_payload ->> 'fixed_order_reason', exclusion_group = r #>> '{dedup,exclusion_group}',
         payload_public = v_public, source_resource_id = r #>> '{source,resource_id}',
         source_printed_start = (r #>> '{source,printed_page_start}')::int,
         source_printed_end = (r #>> '{source,printed_page_end}')::int,
         source_pdf_page = (r #>> '{source,pdf_page_start}')::int,
         option_flags = public._ce_option_flags(v_type, v_public)
   where t.id = q.id;
  if v_content then
    update public.question_keys t
       set correct_index = v_correct, explanation = v_expl, answer = v_payload, explanation_steps = v_steps,
           accepted_norm = v_accepted
     where t.question_id = q.id;
  end if;
  perform public._ce_import_links(q.id, v_lesson, r -> 'links');
  return 'updated';
end
$$;

-- Curriculum links of a question: the primary lesson + aligned nodes that exist.
create or replace function public._ce_import_links(p_qid uuid, p_lesson text, p_links jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.question_curriculum where question_id = p_qid;
  insert into public.question_curriculum (question_id, node_id, role)
  select p_qid, x.node_id, max(x.role)
    from (select p_lesson node_id, 'primary' role where p_lesson is not null
          union all
          select l ->> 'node_id', 'aligned'
            from jsonb_array_elements(case when jsonb_typeof(p_links) = 'array' then p_links else '[]'::jsonb end) l
           where l ->> 'node_id' is not null) x
    join public.curriculum_nodes n on n.id = x.node_id
   group by x.node_id;
end
$$;

-- ce_import_begin(manifest) → run id. p_manifest = the staging manifest
-- (manifest@1: sha256, removed[]) plus `run`: {target, only, filtered, …}
-- written by scripts/content/import-staging.mjs.
create or replace function public.ce_import_begin(p_manifest jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_manifest is null or jsonb_typeof(p_manifest) <> 'object' or p_manifest ->> 'schema' is distinct from 'manifest@1'
     or coalesce(p_manifest ->> 'sha256', '') !~ '^[0-9a-f]{64}$' then
    perform public._ce_raise('invalid_argument', '{"field":"manifest"}');
  end if;
  if jsonb_typeof(coalesce(p_manifest -> 'removed', '[]')) <> 'array' then
    perform public._ce_raise('invalid_argument', '{"field":"removed"}');
  end if;
  insert into public.content_import_runs (target, manifest_sha, options)
  values (coalesce(p_manifest #>> '{run,target}', 'test'), p_manifest ->> 'sha256',
          coalesce(p_manifest -> 'run', '{}'::jsonb)
            || jsonb_build_object('removed', coalesce((select jsonb_agg(e ->> 'key')
                                                         from jsonb_array_elements(coalesce(p_manifest -> 'removed', '[]')) e), '[]'::jsonb)))
  returning id into v_id;
  return v_id;
end
$$;

-- ce_import_batch(run, entity, batch_no, rows ≤ 500): one transaction with
-- jazira.bulk_import = on; each row is an isolated upsert (a bad row is
-- rejected and logged, the batch continues). Replaying a batch is idempotent.
create or replace function public.ce_import_batch(p_run uuid, p_entity text, p_batch_no int, p_rows jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run      public.content_import_runs%rowtype;
  r          jsonb;
  v_res      text;
  v_key      text;
  v_ins      int := 0;
  v_upd      int := 0;
  v_same     int := 0;
  v_rej      int := 0;
  v_errors   jsonb := '[]'::jsonb;
  v_code     text;
  v_detail   jsonb;
  v_state    text;
  v_msg      text;
  v_dtext    text;
  v_hint     text;
  v_cons     text;
  v_first    text;
  v_last     text;
begin
  select * into v_run from public.content_import_runs where id = p_run;
  if not found or v_run.status <> 'running' then
    perform public._ce_raise('invalid_argument', '{"field":"run"}');
  end if;
  if p_entity is null or p_entity not in ('sources', 'resources', 'nodes', 'subject_terms', 'lesson_ranges',
                                          'objectives', 'stimuli', 'questions', 'templates') then
    perform public._ce_raise('invalid_argument', '{"field":"entity"}');
  end if;
  if p_batch_no is null or p_batch_no < 0 then
    perform public._ce_raise('invalid_argument', '{"field":"batch_no"}');
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    perform public._ce_raise('invalid_argument', '{"field":"rows"}');
  end if;
  perform set_config('jazira.bulk_import', 'on', true);

  for r in select value from jsonb_array_elements(p_rows) loop
    v_key := coalesce(r ->> 'id', case when p_entity = 'subject_terms' then (r ->> 'subject_node_id') || '@' || (r ->> 'term')
                                       when p_entity = 'lesson_ranges' then (r ->> 'lesson_node_id') || '@' || (r ->> 'resource_id') end);
    v_first := coalesce(v_first, v_key);
    v_last := v_key;
    begin
      if jsonb_typeof(r) <> 'object' then
        perform public._ce_row_error('invalid_row');
      end if;
      -- a row the importer isolated after a failed batch (§6.3 step 5) is logged, never applied
      if r #>> '{_import,reject}' is not null then
        perform public._ce_row_error(r #>> '{_import,reject}', coalesce(r #> '{_import,detail}', '{}'::jsonb));
      end if;
      v_res := case p_entity
        when 'sources' then public._ce_import_source(r)
        when 'resources' then public._ce_import_resource(r)
        when 'nodes' then public._ce_import_node(r)
        when 'subject_terms' then public._ce_import_subject_term(r)
        when 'lesson_ranges' then public._ce_import_lesson_range(r)
        when 'objectives' then public._ce_import_objective(r)
        when 'stimuli' then public._ce_import_stimulus(r)
        when 'questions' then public._ce_import_question(r)
        when 'templates' then public._ce_import_template(r)
      end;
      if v_res = 'inserted' then v_ins := v_ins + 1;
      elsif v_res = 'updated' then v_upd := v_upd + 1;
      else v_same := v_same + 1;
      end if;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_dtext = pg_exception_detail,
                              v_hint = pg_exception_hint, v_cons = constraint_name;
      if v_hint = 'ce_row_error' then
        v_code := v_msg;
        v_detail := nullif(v_dtext, '')::jsonb;
      elsif v_state = '23505' and v_cons = 'questions_content_hash_active_uidx' then
        v_code := 'duplicate_content';
        v_detail := jsonb_build_object('same_as', (select q.key from public.questions q
                                                    where q.content_hash = r ->> 'content_hash' and q.is_active limit 1));
      else
        v_code := case v_state when '23503' then 'missing_reference' when '23514' then 'check_violation'
                               when '23505' then 'unique_violation' when '23502' then 'missing_value'
                               else case when left(v_state, 2) = '22' then 'invalid_value' else 'row_error' end end;
        v_detail := jsonb_build_object('sqlstate', v_state, 'message', left(v_msg, 300),
                                       'constraint', v_cons);
      end if;
      v_rej := v_rej + 1;
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('key', v_key, 'code', v_code, 'detail', v_detail));
      insert into public.content_import_errors (run_id, entity, key, code, detail)
      values (p_run, p_entity, left(v_key, 200), v_code, v_detail);
    end;
  end loop;

  insert into public.content_import_batches as b (run_id, entity, batch_no, first_key, last_key, rows, inserted, updated,
                                                  unchanged, rejected, status, finished_at)
  values (p_run, p_entity, p_batch_no, left(v_first, 200), left(v_last, 200), jsonb_array_length(p_rows), v_ins, v_upd,
          v_same, v_rej, 'done', now())
  on conflict (run_id, entity, batch_no) do update
     set first_key = least(b.first_key, excluded.first_key), last_key = greatest(b.last_key, excluded.last_key),
         rows = b.rows + excluded.rows, inserted = b.inserted + excluded.inserted, updated = b.updated + excluded.updated,
         unchanged = b.unchanged + excluded.unchanged, rejected = b.rejected + excluded.rejected, status = 'done',
         finished_at = now();

  return jsonb_build_object('run', p_run, 'entity', p_entity, 'batch_no', p_batch_no, 'rows', jsonb_array_length(p_rows),
                            'inserted', v_ins, 'updated', v_upd, 'unchanged', v_same, 'rejected', v_rej,
                            'errors', v_errors);
end
$$;

-- ce_import_retire(run, keys): marks the manifest's removed[] keys inactive
-- and retired (never deleted: attempts reference them). Refused, with
-- nothing retired, for --only runs, runs with import errors, and runs whose
-- publish set was filtered differently from the manifest's (§6.3 step 6).
create or replace function public.ce_import_retire(p_run uuid, p_keys text[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run     public.content_import_runs%rowtype;
  v_allowed text[];
  v_skipped jsonb;
  v_n       int;
begin
  select * into v_run from public.content_import_runs where id = p_run;
  if not found or v_run.status <> 'running' then
    perform public._ce_raise('invalid_argument', '{"field":"run"}');
  end if;
  if coalesce(cardinality(p_keys), 0) > 10000 then
    perform public._ce_raise('invalid_argument', '{"field":"keys"}');
  end if;
  if jsonb_typeof(v_run.options -> 'only') = 'array' and jsonb_array_length(v_run.options -> 'only') > 0 then
    perform public._ce_raise('retire_refused', '{"reason":"only"}');
  end if;
  if exists (select 1 from public.content_import_errors e where e.run_id = p_run) then
    perform public._ce_raise('retire_refused', '{"reason":"import_errors"}');
  end if;
  if coalesce((v_run.options ->> 'filtered')::boolean, false) then
    perform public._ce_raise('retire_refused', '{"reason":"filtered_publish_set"}');
  end if;
  perform set_config('jazira.bulk_import', 'on', true);

  select coalesce(jsonb_agg(jsonb_build_object('key', k, 'reason', reason) order by k collate "C"), '[]'::jsonb)
    into v_skipped
    from (select k, case when not (v_run.options -> 'removed') ? k then 'not_in_manifest'
                         when q.id is null then 'not_found'
                         when not q.is_active then 'already_retired' end reason
            from unnest(coalesce(p_keys, '{}')) k
            left join public.questions q on q.key = k) s
   where reason is not null;
  v_allowed := array(select k from unnest(coalesce(p_keys, '{}')) k
                      where (v_run.options -> 'removed') ? k);
  update public.questions q
     set is_active = false, status = 'retired'
   where q.key = any (v_allowed) and q.is_active;
  get diagnostics v_n = row_count;
  update public.content_import_runs
     set counts = jsonb_set(counts, '{retired}', to_jsonb(coalesce((counts ->> 'retired')::int, 0) + v_n))
   where id = p_run;
  return jsonb_build_object('run', p_run, 'retired', v_n, 'skipped', v_skipped);
end
$$;

-- ce_import_finish(run): closes the run, refreshes the aggregates once and
-- returns the per-entity counts.
create or replace function public.ce_import_finish(p_run uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run    public.content_import_runs%rowtype;
  v_counts jsonb;
  v_errors int;
begin
  select * into v_run from public.content_import_runs where id = p_run for update;
  if not found then
    perform public._ce_raise('invalid_argument', '{"field":"run"}');
  end if;
  select coalesce(jsonb_object_agg(b.entity, jsonb_build_object('inserted', b.i, 'updated', b.u, 'unchanged', b.s,
                                                               'rejected', b.r)), '{}'::jsonb)
    into v_counts
    from (select entity, sum(inserted)::int i, sum(updated)::int u, sum(unchanged)::int s, sum(rejected)::int r
            from public.content_import_batches where run_id = p_run group by entity) b;
  v_counts := jsonb_set(v_counts, '{questions}',
                        coalesce(v_counts -> 'questions', '{"inserted":0,"updated":0,"unchanged":0,"rejected":0}'::jsonb)
                        || jsonb_build_object('retired', coalesce((v_run.counts ->> 'retired')::int, 0)));
  select count(*)::int into v_errors from public.content_import_errors where run_id = p_run;
  perform public.ce_refresh_aggregates();
  update public.content_import_runs
     set finished_at = now(), status = 'done', counts = v_counts,
         report = jsonb_build_object('errors', v_errors)
   where id = p_run;
  return jsonb_build_object('run', p_run, 'status', 'done', 'counts', v_counts, 'errors', v_errors,
                            'aggregates_refreshed', true);
end
$$;

-- ce_refresh_aggregates(): rebuilds question_bank_counts (legacy),
-- scope_pool_members (published, active, imported items; lesson or prep
-- topic × band) and scope_pool_counts (every ancestor node of an eligible
-- lesson, subject@t1 / @t2 for term-eligible lessons, prep topic / section /
-- exam; band 0 = all bands). Called once per import, never per statement.
create or replace function public.ce_refresh_aggregates()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public._refresh_question_bank_counts_now();

  delete from public.scope_pool_members where true;
  insert into public.scope_pool_members (lesson_node_id, band, question_key, question_id, component, question_type,
                                         stimulus_id, is_premium, revision, objective_id)
  select coalesce(q.lesson_node_id, 'prep:' || q.exam || '/' || q.section || '/' || q.topic), q.difficulty, q.key, q.id,
         q.exclusion_group, q.question_type, q.stimulus_id, q.is_premium, q.revision, q.objective_id
    from public.questions q
   where q.is_active and q.status = 'published' and q.import_origin is not null
     and q.payload_public <> '{}'::jsonb;

  delete from public.scope_pool_counts where true;
  with recursive lessons as (
    select n.id, n.parent_id, n.term, n.term_status, n.subject
      from public.curriculum_nodes n
     where n.kind = 'lesson' and n.status = 'verified' and not n.unit_opener
       and exists (select 1 from public.scope_pool_members m where m.lesson_node_id = n.id)
  ), up as (
    select l.id lesson, l.id node, l.parent_id, 0 depth from lessons l
    union all
    select up.lesson, p.id, p.parent_id, up.depth + 1
      from up join public.curriculum_nodes p on p.id = up.parent_id
     where up.depth < 10
  ), node_members as (
    select up.node, m.band, m.question_key, coalesce(m.component, m.question_key) grp, m.is_premium
      from up join public.scope_pool_members m on m.lesson_node_id = up.lesson
    union all
    select l.subject || '@' || t.term, m.band, m.question_key, coalesce(m.component, m.question_key), m.is_premium
      from lessons l
      cross join (values ('t1'), ('t2')) t (term)
      join public.scope_pool_members m on m.lesson_node_id = l.id
     where l.subject is not null and (l.term = t.term or l.term = 'both') and l.term_status in ('verified', 'inferred')
    union all
    select x.node, m.band, m.question_key, coalesce(m.component, m.question_key), m.is_premium
      from public.scope_pool_members m
      cross join lateral (values (m.lesson_node_id),
                                 (split_part(m.lesson_node_id, '/', 1) || '/' || split_part(m.lesson_node_id, '/', 2)),
                                 (split_part(m.lesson_node_id, '/', 1))) x (node)
     where m.lesson_node_id like 'prep:%'
  )
  insert into public.scope_pool_counts (node_id, band, published_count, group_count, free_count, free_group_count)
  select node, b.band, count(distinct question_key)::int, count(distinct grp)::int,
         count(distinct question_key) filter (where not is_premium)::int,
         count(distinct grp) filter (where not is_premium)::int
    from node_members
   cross join lateral (values (node_members.band::smallint), (0::smallint)) b (band)
   group by node, b.band;
  -- fresh planner statistics after the rebuild (pool lookups stay index scans)
  analyze public.scope_pool_members;
  analyze public.scope_pool_counts;
end
$$;

-- ============================================================================
-- I) GUESTS (service role; §5.8). Selection runs here and only the picked
-- public rows leave the database. Premium items never enter a guest pool.
-- ============================================================================

-- The runtime bank's content row (c/ item) of a question.
create or replace function public._ce_content_row(p_qid uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'key', q.key, 'revision', q.revision, 'type', q.question_type, 'language', q.language, 'stem', q.stem,
    'stimulus', (select jsonb_build_object('id', s.id, 'text', s.text) from public.question_stimuli s where s.id = q.stimulus_id),
    'public', case when jsonb_typeof(q.payload_public -> 'unit') = 'object'
                   then jsonb_set(q.payload_public, '{unit}', (q.payload_public -> 'unit') - 'accepted')
                   else q.payload_public end,
    'shuffle_options', q.shuffle_options, 'fixed_order_reason', q.fixed_order_reason,
    'time_limit_seconds', q.time_limit_seconds, 'band', q.difficulty,
    'lesson', jsonb_build_object('id', coalesce(q.lesson_node_id, 'prep:' || q.exam || '/' || q.section || '/' || q.topic),
                                 'title', n.title_ar, 'term', n.term),
    'topic', case when q.exam = 'school' then null else q.topic end)
  from public.questions q
  left join public.curriculum_nodes n on n.id = q.lesson_node_id
  where q.id = p_qid
$$;

create or replace function public.ce_guest_start(p_template text, p_scope text, p_seed text, p_seen text[], p_count int)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_t      jsonb := public._ce_template(p_template);
  v_parsed jsonb;
  v_res    jsonb;
  v_pool   public.ce_pool_item[];
  v_sel    jsonb;
  v_min    int;
begin
  if v_t is null then
    perform public._ce_raise('template_not_found');
  end if;
  if p_seed is null or p_seed !~ '^[0-9a-f]{32}$' then
    perform public._ce_raise('invalid_argument', '{"field":"seed"}');
  end if;
  if p_count is null or p_count < 1 or p_count > public._ce_tier_max(v_t, 'guest') then
    perform public._ce_raise('invalid_argument', '{"field":"count"}');
  end if;
  if coalesce(cardinality(p_seen), 0) > 300 then
    perform public._ce_raise('invalid_argument', '{"field":"seen"}');
  end if;
  v_parsed := public._ce_parse_scope(p_scope);
  if v_parsed is null or v_parsed ->> 'type' = 'weak' then
    perform public._ce_raise('invalid_argument', '{"field":"scope"}');
  end if;
  v_res := public._ce_resolve_scope(v_parsed, v_t, 'guest', null);
  if not (v_res ->> 'ok')::boolean then
    perform public._ce_raise(v_res ->> 'error', case when v_res ? 'field' then jsonb_build_object('field', v_res ->> 'field') end);
  end if;
  v_pool := public._ce_pool(v_res, v_t, false);
  if v_pool is null then
    perform public._ce_raise('scope_too_large');
  end if;
  v_min := least((v_t #>> '{count,min}')::int, p_count);
  v_sel := public._ce_select_rows(v_t, p_count, v_min, p_seed, v_pool, to_jsonb(coalesce(p_seen, '{}'::text[])), null, null, null,
                             null, false);
  if not (v_sel ->> 'ok')::boolean then
    if v_sel ->> 'error' = 'insufficient_pool' then
      perform public._ce_raise('insufficient_pool', jsonb_build_object('available', (v_sel ->> 'available')::int,
                                                                        'required', (v_sel ->> 'required')::int));
    end if;
    perform public._ce_raise(v_sel ->> 'error');
  end if;
  return jsonb_build_object(
    'template', jsonb_build_object('id', v_t ->> 'id', 'version', (v_t ->> 'version')::int, 'kind', v_t ->> 'kind'),
    'scope', p_scope,
    'question_count', jsonb_array_length(v_sel -> 'keys'),
    'allocation', v_sel -> 'stored',
    'reused', (v_sel ->> 'reused')::boolean,
    'short', (v_sel ->> 'short')::boolean,
    'lower_bound', (v_sel ->> 'lower_bound')::boolean,
    'items', coalesce((select jsonb_agg(public._ce_content_row(q.id) order by k.pos)
                         from jsonb_array_elements_text(v_sel -> 'keys') with ordinality k (key, pos)
                         join public.questions q on q.key = k.key), '[]'::jsonb));
end
$$;

create or replace function public.ce_guest_items(p_keys text[], p_with_keys boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
           public._ce_content_row(q.id)
           || case when coalesce(p_with_keys, false) then jsonb_build_object('key_data', jsonb_build_object(
                'payload', k.answer,
                'explanation', jsonb_build_object('text', k.explanation, 'steps', coalesce(k.explanation_steps, '[]'::jsonb)),
                'objective', (select jsonb_build_object('text', o.text_ar) from public.learning_objectives o
                               where o.id = q.objective_id and o.status = 'validated'),
                'source', public._ce_item_source(q.id))) else '{}'::jsonb end
           order by x.pos), '[]'::jsonb)
    from unnest(p_keys[1:100]) with ordinality x (key, pos)
    join public.questions q on q.key = x.key
    left join public.question_keys k on k.question_id = q.id
   where q.is_active and q.status = 'published' and not q.is_premium and q.import_origin is not null
$$;

-- Guest check locks (§5.8, engine/check-lock.js). Without this row a guest
-- could /check a position twice — a wrong answer (the key is revealed), then
-- the right one — and keep the better receipt. The first checked response of
-- (session, position) is kept until the session's deadline + grace (after
-- which /check refuses the token anyway). Service role only; no client grants.
create table if not exists public.ce_guest_check_locks (
  sid        text        not null check (sid ~ '^g-[A-Za-z0-9_-]{22}$'),
  position   smallint    not null check (position between 1 and 100),
  resp_hash  text        not null check (resp_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  primary key (sid, position)
);
create index if not exists ce_guest_check_locks_expiry_idx on public.ce_guest_check_locks (expires_at);
alter table public.ce_guest_check_locks enable row level security;   -- and deliberately no policies
revoke all on table public.ce_guest_check_locks from public, anon, authenticated;

-- → 'first' (this response is now the locked one) | 'repeat' (the locked
-- response again: a retry) | 'locked' (another response was checked first).
create or replace function public.ce_guest_check_lock(p_sid text, p_position int, p_resp_hash text, p_expires_at timestamptz)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rows int;
  v_hash text;
begin
  if p_sid is null or p_sid !~ '^g-[A-Za-z0-9_-]{22}$'
     or p_position is null or p_position not between 1 and 100
     or p_resp_hash is null or p_resp_hash !~ '^[0-9a-f]{64}$'
     or p_expires_at is null then
    perform public._ce_raise('invalid_argument');
  end if;
  insert into public.ce_guest_check_locks (sid, position, resp_hash, expires_at)
  values (p_sid, p_position::smallint, p_resp_hash,
          least(greatest(p_expires_at, now()), now() + interval '8 days'))
  on conflict (sid, position) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 1 then
    -- opportunistic cleanup of ended sessions (bounded work)
    if random() < 0.02 then
      delete from public.ce_guest_check_locks x
       where x.ctid in (select y.ctid from public.ce_guest_check_locks y where y.expires_at < now() limit 500);
    end if;
    return 'first';
  end if;
  select l.resp_hash into v_hash from public.ce_guest_check_locks l where l.sid = p_sid and l.position = p_position;
  return case when v_hash = p_resp_hash then 'repeat' else 'locked' end;
end
$$;

-- ============================================================================
-- J) GRANTS. Internal helpers are revoked from every API role; RPCs are
-- granted per §6.2 (the shim grants everything by default, like Supabase).
-- ============================================================================
revoke all on function public._ce_raise(text, jsonb)                                   from public, anon, authenticated;
revoke all on function public._ce_template(text, int)                                  from public, anon, authenticated;
revoke all on function public._ce_parse_scope(text)                                    from public, anon, authenticated;
revoke all on function public._ce_scope_lessons(text, text)                            from public, anon, authenticated;
revoke all on function public._ce_tier_max(jsonb, text)                                from public, anon, authenticated;
revoke all on function public._ce_plan_count(jsonb, text, int)                         from public, anon, authenticated;
revoke all on function public._ce_plan_timing(jsonb, int, text)                        from public, anon, authenticated;
revoke all on function public._ce_resolve_scope(jsonb, jsonb, text, uuid)              from public, anon, authenticated;
revoke all on function public._ce_wilson(numeric, numeric)                             from public, anon, authenticated;
revoke all on function public._ce_pool(jsonb, jsonb, boolean)                          from public, anon, authenticated;
revoke all on function public._ce_history(uuid, jsonb)                                 from public, anon, authenticated;
revoke all on function public._ce_item_content(uuid, int)                              from public, anon, authenticated;
revoke all on function public._ce_item_lesson(uuid)                                    from public, anon, authenticated;
revoke all on function public._ce_item_source(uuid)                                    from public, anon, authenticated;
revoke all on function public._ce_verdict(jsonb, numeric)                              from public, anon, authenticated;
revoke all on function public._ce_result_item(uuid, int, boolean)                      from public, anon, authenticated;
revoke all on function public._ce_result_items(uuid, int)                              from public, anon, authenticated;
revoke all on function public._ce_attempt_json(uuid)                                   from public, anon, authenticated;
revoke all on function public._ce_result(uuid)                                         from public, anon, authenticated;
revoke all on function public._ce_questions_json(uuid)                                 from public, anon, authenticated;
revoke all on function public._ce_grade_content(jsonb, jsonb)                          from public, anon, authenticated;
revoke all on function public._ce_map_response(uuid, int, jsonb)                       from public, anon, authenticated;
revoke all on function public._ce_selected_index(jsonb)                                from public, anon, authenticated;
revoke all on function public._ce_lesson_ancestors(text)                               from public, anon, authenticated;
revoke all on function public._ce_update_stats(uuid)                                   from public, anon, authenticated;
revoke all on function public._ce_finalize(uuid, text)                                 from public, anon, authenticated;
revoke all on function public._ce_submit(uuid, jsonb)                                  from public, anon, authenticated;
revoke all on function public._ce_get(uuid)                                            from public, anon, authenticated;
revoke all on function public._ce_node_lessons(text)                                   from public, anon, authenticated;
revoke all on function public._ce_text_array(jsonb)                                    from public, anon, authenticated;
revoke all on function public._ce_row_error(text, jsonb)                               from public, anon, authenticated;
revoke all on function public._ce_import_source(jsonb)                                 from public, anon, authenticated;
revoke all on function public._ce_import_node(jsonb)                                   from public, anon, authenticated;
revoke all on function public._ce_import_resource(jsonb)                               from public, anon, authenticated;
revoke all on function public._ce_import_subject_term(jsonb)                           from public, anon, authenticated;
revoke all on function public._ce_import_lesson_range(jsonb)                           from public, anon, authenticated;
revoke all on function public._ce_import_objective(jsonb)                              from public, anon, authenticated;
revoke all on function public._ce_import_stimulus(jsonb)                               from public, anon, authenticated;
revoke all on function public._ce_import_template(jsonb)                               from public, anon, authenticated;
revoke all on function public._ce_import_question(jsonb)                               from public, anon, authenticated;
revoke all on function public._ce_import_links(uuid, text, jsonb)                      from public, anon, authenticated;
revoke all on function public._ce_content_row(uuid)                                    from public, anon, authenticated;
revoke all on function public._exam_finalize(uuid, boolean)                            from public, anon, authenticated;

revoke all on function public.start_template_attempt(text, text, int, text, text, uuid, text)  from public, anon, authenticated;
revoke all on function public.save_exam_response(uuid, smallint, jsonb, int, boolean)          from public, anon, authenticated;
revoke all on function public.check_exam_item(uuid, smallint)                                  from public, anon, authenticated;
revoke all on function public.abandon_exam_attempt(uuid)                                       from public, anon, authenticated;
revoke all on function public.list_exam_attempts_v2(int, timestamptz, uuid)                    from public, anon, authenticated;
revoke all on function public.get_learning_stats(text)                                         from public, anon, authenticated;
revoke all on function public.get_practice_recommendations(int)                                from public, anon, authenticated;
revoke all on function public.get_scope_availability(text)                                     from public, anon, authenticated;
revoke all on function public.search_content(text, text[], text, int, int, boolean)            from public, anon, authenticated;
revoke all on function public.submit_exam_attempt(uuid, jsonb)                                 from public, anon, authenticated;
revoke all on function public.get_exam_attempt(uuid)                                           from public, anon, authenticated;
revoke all on function public.start_exam_attempt(text, text, smallint, int, int, text)         from public, anon, authenticated;
revoke all on function public.ce_import_begin(jsonb)                                           from public, anon, authenticated;
revoke all on function public.ce_import_batch(uuid, text, int, jsonb)                          from public, anon, authenticated;
revoke all on function public.ce_import_retire(uuid, text[])                                   from public, anon, authenticated;
revoke all on function public.ce_import_finish(uuid)                                           from public, anon, authenticated;
revoke all on function public.ce_refresh_aggregates()                                          from public, anon, authenticated;
revoke all on function public.ce_guest_start(text, text, text, text[], int)                    from public, anon, authenticated;
revoke all on function public.ce_guest_items(text[], boolean)                                  from public, anon, authenticated;

grant execute on function public.start_template_attempt(text, text, int, text, text, uuid, text)  to authenticated, service_role;
grant execute on function public.save_exam_response(uuid, smallint, jsonb, int, boolean)          to authenticated, service_role;
grant execute on function public.check_exam_item(uuid, smallint)                                  to authenticated, service_role;
grant execute on function public.abandon_exam_attempt(uuid)                                       to authenticated, service_role;
grant execute on function public.list_exam_attempts_v2(int, timestamptz, uuid)                    to authenticated, service_role;
grant execute on function public.get_learning_stats(text)                                         to authenticated, service_role;
grant execute on function public.get_practice_recommendations(int)                                to authenticated, service_role;
grant execute on function public.get_scope_availability(text)                                     to anon, authenticated;
-- the contract lists anon + authenticated only (the server calls it with the caller's session)
revoke all on function public.get_scope_availability(text)                                        from service_role;
grant execute on function public.search_content(text, text[], text, int, int, boolean)            to authenticated, service_role;
grant execute on function public.submit_exam_attempt(uuid, jsonb)                                 to authenticated, service_role;
grant execute on function public.get_exam_attempt(uuid)                                           to authenticated, service_role;
grant execute on function public.start_exam_attempt(text, text, smallint, int, int, text)         to authenticated, service_role;
grant execute on function public.ce_import_begin(jsonb)                                           to service_role;
grant execute on function public.ce_import_batch(uuid, text, int, jsonb)                          to service_role;
grant execute on function public.ce_import_retire(uuid, text[])                                   to service_role;
grant execute on function public.ce_import_finish(uuid)                                           to service_role;
grant execute on function public.ce_refresh_aggregates()                                          to service_role;
grant execute on function public.ce_guest_start(text, text, text, text[], int)                    to service_role;
grant execute on function public.ce_guest_items(text[], boolean)                                  to service_role;
revoke all on function public.ce_guest_check_lock(text, int, text, timestamptz)                   from public, anon, authenticated;
grant execute on function public.ce_guest_check_lock(text, int, text, timestamptz)                to service_role;

-- PostgREST: pick up the new signatures.
notify pgrst, 'reload schema';

commit;
