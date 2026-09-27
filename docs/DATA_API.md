# Jazira Data API

Tables, RPCs and client data functions for the learning features: **exams**
(runner, results, history, analytics), **community reads** (anonymous
posting), **notifications**, **search**, **contact** and the **AI quota**.
Database side: `supabase/migrations/0010_learning_platform.sql`,
`0012_privacy_topics_analytics_search.sql` and `0014_content_engine.sql` (tests: `tests/db/learning.test.js`,
`tests/db/learning-0012.test.js`, `tests/db/anonymity.test.js`, `tests/db/content-*.test.js`). Client side:
`src/lib/data/*.js` (community: `src/lib/social.js`).

- [Conventions](#conventions)
- [Exams](#exams) — [tables](#exam-tables) · [RPCs](#exam-rpcs) · [client](#exam-client-srclibdataexamsjs) · [local practice mode](#local-practice-mode) · [question bank & seed](#question-bank--seed)
- [Content engine (0014)](#content-engine-0014) — [tables](#content-tables) · [template sessions](#template-sessions-signed-in) · [guests and secrets](#guest-sessions-and-secrets) · [import](#import-pipeline-service-role)
- [Community: anonymous posting and feed RPCs](#community-anonymous-posting-and-feed-rpcs)
- [Notifications](#notifications)
- [Search](#search)
- [Contact](#contact)
- [AI quota](#ai-quota)
- [Access model summary](#access-model-summary)
- [Known limits](#known-limits)

---

## Conventions

**Always go through `src/lib/data/*`** from UI code. The functions pick the
Supabase client (`getSupabase()`), handle "not deployed yet" and signed-out
states, and map errors to stable codes.

**Errors.** Data functions throw a `DataError` — an `Error` with
`name === "DataError"`, a stable `code` and optional `details` (an object).
`contact.js` is the exception: `sendContactMessage()` never throws and
returns `{ ok, code }`.

```js
try {
  const attempt = await startExam({ exam: "aptitude", count: 10 });
} catch (err) {
  if (err.code === "daily_limit_reached") showLimit(err.details.resets_at);
  else setError(err.code);          // map to t(`exams.errors.${err.code}`)
}
```

| code | meaning | typical UI |
|---|---|---|
| `not_authenticated` | no session (or it expired) | send to sign-in |
| `invalid_argument` | bad input; `details.field` names it | fix the form |
| `premium_required` | free plan asked for more than it allows; `details.max_questions` | upgrade prompt |
| `daily_limit_reached` | 5 free attempts used today; `details = { limit, used, resets_at }` | "come back after …" / upgrade |
| `not_enough_questions` | no question matches the filters (`details = { available, requested }`) | loosen filters |
| `attempt_not_found` | not yours, or does not exist | 404 state |
| `attempt_closed` | already submitted / expired; `details.status` | reload with `getAttempt()` |
| `rate_limited` | abuse limit (contact form, local API, guest exam routes incl. the daily grading budget) | try later |
| `forbidden` | RLS / privilege refusal | generic error |
| `unavailable` | Supabase not configured, table/RPC not deployed, DB unreachable | honest "not available yet" |
| `network` | fetch failed | retry |
| `aborted` | search request superseded / aborted | ignore |
| `unknown` | anything else (`err.cause` has the raw error) | generic error |

On the wire (PostgREST), RPC errors are `P0001` with `message` = the code and
`details` = a JSON string (e.g. `{"field":"count","min":5,"max":100}`).

**Modes.** Exam payloads carry `mode: "db" | "local"`. `local` means nothing is
saved (no history, no XP, no stats) — the UI must say so ("results aren't saved").

**Pagination** is keyset, newest first. Each list returns `nextCursor`
(`{ before, beforeId }` or `null`); pass it back as-is:
`listNotifications({ limit: 20, ...nextCursor })`. The id tiebreaker makes rows
with identical timestamps page correctly.

**Time.** All timestamps are ISO strings (UTC). Day boundaries (daily limits,
streaks, stats) use the **Asia/Riyadh** calendar day and the database clock.

**Positions** inside an attempt are **1-based** (`1..question_count`).
`selected_index` / `correct_index` are **0-based** choice indexes.

---

## Exams

Vocabulary (`exam`, `section`, `topic`, difficulty `1..3`, `LIMITS`) comes from
`src/lib/exams/catalog.js`; the database enforces the same slugs with
`exam_of_section(section)` / `exam_section_topics(section)` (a test compares
every catalog pair with the database).

| | Free | Elite (premium) |
|---|---|---|
| Questions per attempt | 5–25 | 5–100 |
| Attempts per Riyadh day | 5 | unlimited |
| Premium questions | never | yes |
| Time limit | 60 s – 4 h (default = sum of the questions' limits) | same |
| Guests | local practice mode only, ≤ 10 questions | — |

Premium = `profiles.is_elite` **or** an active elite subscription
(`subscriptions.tier = 'elite'`, `status = 'active'`, `current_period_end` null
or in the future) — `public.has_premium(uid)`.

### Exam tables

| table | columns (main) | client access |
|---|---|---|
| `question_sources` | `id, slug (unique), name_ar, name_en, kind ('original'\|'licensed'\|'official_public'\|'user_contributed'), license, url, notes` | read (anon + signed in) |
| `questions` | `id, key (unique), exam, section, topic, difficulty, stem, passage, choices (jsonb array of 2–6 strings), time_limit_seconds, tags, source_id, source_ref, year, language, is_premium, is_active, random_key` | read active rows; premium rows only for premium users. No writes |
| `question_keys` | `question_id, correct_index, explanation` | **none** (no privilege for anon/authenticated). Keys leave the DB only in graded results |
| `exam_attempts` | `id, user_id, exam, section (null = mixed), topic (null = every topic; 0012), difficulty (null = mixed), question_count, time_limit_seconds, status ('in_progress'\|'submitted'\|'expired'\|'abandoned'), started_at, expires_at, submitted_at, correct_count, total, score_percent, duration_seconds, meta` | read own. No writes (RPCs only) |
| `exam_attempt_items` | `attempt_id, position, question_id, selected_index, is_correct (null until graded), time_spent_seconds, flagged, answered_at` | read own. No writes |
| `question_bank_counts` | per `(exam, section, topic, difficulty)`: `free_count, premium_count` | none (behind `get_question_bank_stats()`) |

Seeded source: `jazira-original` — "All rights reserved — original practice
items authored for Jazira". Questions are never deleted once used by an
attempt (FK); retire them with `is_active = false`.

### Exam RPCs

All are `SECURITY DEFINER`, validate every argument, and are callable by
`authenticated` only — except `get_question_bank_stats()` (also anon).

#### `start_exam_attempt(p_exam text, p_section text = null, p_difficulty smallint = null, p_count int = 10, p_time_limit_seconds int = null, p_topic text = null) → jsonb`

(0012 added `p_topic` as the last parameter and dropped the five-parameter
0010 function, so there is exactly one overload; positional callers of the old
five arguments still work.)

`p_topic` restricts the attempt to one topic of the section
(`exam_section_topics(section)`). Without `p_section`, the one section of
`p_exam` that has the topic is used (topic slugs are unique within an exam);
the attempt stores `section` and `topic`. A topic of another section/exam,
an unknown slug or `""` → `invalid_argument {field: "topic"}`.

Picks questions at random (`random_key` range scan + wrap-around, index-backed
for every filter combination), avoiding questions seen in the caller's last 3
attempts while enough others remain. If fewer than `p_count` match, it uses
what exists (≥ 1); none → `not_enough_questions`. Overdue attempts of the user
are closed (graded as `expired`) first.

```json
{ "mode": "db", "attempt_id": "uuid", "status": "in_progress",
  "exam": "aptitude", "section": "quantitative", "topic": "algebra", "difficulty": null,
  "question_count": 10, "requested_count": 10,
  "started_at": "…", "expires_at": "…", "time_limit_seconds": 600, "server_now": "…",
  "questions": [ { "position": 1, "id": "uuid", "stem": "…", "passage": null,
                   "choices": ["…","…","…","…"], "section": "quantitative",
                   "topic": "algebra", "difficulty": 2, "time_limit_seconds": 60 } ] }
```
Errors: `not_authenticated`, `invalid_argument` (`exam`, `section`, `topic`, `difficulty`,
`count` 5–100, `time_limit_seconds` 60–14400), `premium_required`
(`{max_questions: 25}`), `daily_limit_reached` (`{limit, used, resets_at}`),
`not_enough_questions` (`{available, requested}`).

#### `save_exam_answer(p_attempt uuid, p_position smallint, p_selected smallint, p_time_spent int = 0, p_flagged boolean = null) → jsonb`

Owner only, attempt `in_progress`, not later than `expires_at + 30 s`.
`p_selected = null` clears the answer; `p_flagged = null` keeps the flag;
`p_time_spent` is the **cumulative** seconds on that question (stored value
only grows, capped at the time limit). Correctness is **not** computed here.

```json
{ "attempt_id": "uuid", "position": 3, "selected_index": 1, "flagged": false,
  "time_spent_seconds": 42, "saved_at": "…", "seconds_remaining": 318 }
```
Errors: `attempt_not_found`, `attempt_closed` (`{status}`; `"expired"` after the
grace period), `invalid_argument` (`position`, `selected`, `time_spent`).

#### `submit_exam_attempt(p_attempt uuid, p_answers jsonb = null) → jsonb`

Optionally bulk-saves `p_answers = [{ position, selected_index?, time_spent_seconds?, flagged? }]`
(≤ 100, unique positions; a missing `selected_index` key keeps the saved answer,
`null` clears it; everything is validated before anything is written), then
grades against `question_keys` and closes the attempt:

- on time (≤ `expires_at + 30 s`) → `submitted`; later → `expired` (answers sent late are ignored, saved ones count)
- `score_percent` = correct / total × 100 (2 decimals); unanswered = wrong
- XP: **+2 per correct answer** (written as definer), `record_daily_activity()`, and an `exam_result` notification (respects preferences)
- **Idempotent**: calling again returns the stored result and awards nothing.

```json
{ "mode": "db", "status": "submitted",
  "attempt": { "id": "uuid", "exam": "aptitude", "section": null, "topic": null, "difficulty": null,
               "status": "submitted", "question_count": 10, "time_limit_seconds": 600,
               "started_at": "…", "expires_at": "…", "submitted_at": "…",
               "correct_count": 6, "total": 10, "score_percent": 60, "duration_seconds": 412,
               "answered_count": 8, "xp_awarded": 12 },
  "items": [ { "position": 1, "question_id": "uuid", "stem": "…", "passage": null,
               "choices": ["…"], "selected_index": 2, "correct_index": 2, "is_correct": true,
               "explanation": "…", "section": "quantitative", "topic": "algebra",
               "difficulty": 1, "time_spent_seconds": 20, "flagged": false } ],
  "by_topic": [ { "section": "quantitative", "topic": "algebra", "correct": 2, "total": 3 } ] }
```
Errors: `attempt_not_found`, `attempt_closed` (abandoned), `invalid_argument` (`answers…`).

#### `get_exam_attempt(p_attempt uuid) → jsonb`

- `in_progress`: `{ mode, status, attempt, questions (no keys), answers: [{ position, selected_index, flagged, time_spent_seconds }], seconds_remaining, server_now }`
- past the deadline: grades it as `expired` first, then returns the result
- `submitted` / `expired`: the same payload as `submit_exam_attempt`

#### `list_exam_attempts(p_limit int = 20, p_before timestamptz = null, p_before_id uuid = null) → setof row`

Own attempts, newest first (`started_at desc, id desc`), `p_limit` 1–100. Rows:
`id, exam, section, difficulty, status, question_count, time_limit_seconds,
started_at, expires_at, submitted_at, correct_count, total, score_percent,
duration_seconds, xp_awarded`. Closes overdue attempts first. (No `topic`
column: the row type is kept so re-running 0010 stays possible; the attempt
JSON of `get_exam_attempt` / results carries `topic`.)

#### `get_exam_stats() → jsonb`

Graded (`submitted`/`expired`) attempts only. **Advanced analytics are Elite-only
(0012)**, matching the Elite plan on `/subscriptions` and the history page:

| key | free | Elite (`has_premium`) |
|---|---|---|
| `completed_attempts`, `in_progress`, `totals`, `by_section`, `trend` (windows + 30-day daily) | ✓ | ✓ |
| `by_topic`, `best_topics`, `weakest_topics` | `[]` (withheld) | ✓ |
| `premium` | `false` | `true` |
| `locked` | `["by_topic","best_topics","weakest_topics"]` | `[]` |

The shape never changes (withheld keys are empty arrays), so a client that
ignores `locked` degrades to "no topic data"; UIs must use `locked` to show the
Elite teaser instead of an empty state.

```json
{ "completed_attempts": 12, "in_progress": 1,
  "totals": { "attempts": 12, "questions": 180, "answered": 171, "correct": 121,
              "accuracy": 67.2, "average_score": 66.1, "best_score": 92,
              "total_seconds": 9800, "avg_seconds_per_question": 54.4,
              "xp_earned": 242, "last_attempt_at": "…" },
  "by_section": [ { "exam": "aptitude", "section": "verbal", "total": 60, "answered": 58, "correct": 44, "accuracy": 73.3 } ],
  "by_topic":   [ { "section": "verbal", "topic": "analogy", "total": 14, "answered": 14, "correct": 11, "accuracy": 78.6 } ],
  "trend": { "windows": { "last_7": { "attempts": 4, "total": 60, "correct": 41, "accuracy": 68.3 },
                          "prev_7": { … }, "last_30": { … }, "prev_30": { … } },
             "daily": [ { "day": "2026-09-20", "attempts": 2, "total": 30, "correct": 19, "accuracy": 63.3 } ] },
  "best_topics":    [ { "section": "…", "topic": "…", "total": 9, "correct": 8, "accuracy": 88.9 } ],
  "weakest_topics": [ … ],
  "premium": true, "locked": [] }
```
`accuracy` is `null` when there is nothing to divide. Best/weakest need ≥ 3
questions in a topic (top/bottom 3). A new user gets zeros and empty arrays.

#### `get_question_bank_stats() → jsonb` (anon too)

Counts only (active questions): `{ total, free, premium, by_exam: [{exam, free, premium}],
by_section: [{exam, section, free, premium}], by_difficulty: [{exam, section, difficulty, free, premium}],
by_topic: [{exam, section, topic, free, premium}] }`. Served from a cache table
refreshed on every questions write — cheap at any bank size.

### Exam client (`src/lib/data/exams.js`)

| function | returns |
|---|---|
| `startExam({ exam, section?, topic?, difficulty?, count = 10, timeLimitSeconds? })` | start payload incl. `topic` (null when unfiltered; + `limited`, `max_questions` in local mode). `p_topic` is only sent when set, so an unfiltered start also works against a pre-0012 database; a topic against a pre-0012 database falls back to local mode |
| `saveAnswer(attemptId, position, selectedIndex, { timeSpentSeconds?, flagged? })` | save payload |
| `submitExam(attemptId, answers?)` | result payload (idempotent) |
| `getAttempt(attemptId)` | resume or result payload |
| `listAttempts({ before?, beforeId?, limit = 20 })` | `{ mode, items, nextCursor }` (local: always empty) |
| `getExamStats()` | stats + `mode: "db"` (`locked` is always an array), or `{ mode: "local" }` |
| `getBankStats()` | counts + `{ mode: "db", available: true }`, or `{ mode: "local", available: false }` |
| `isLocalAttemptId(id)`, `isDataError(e)`, `toExamError(pgErr)`, `EXAM_ERROR_CODES` | helpers |

**Mode selection.** Signed in + Supabase configured → DB RPCs. Guest, Supabase
not configured, RPC missing (`PGRST202`/`42883`) or database unreachable
(`PGRST000–003`, network) → local practice mode, transparently. Local attempts
live in memory + `sessionStorage` (per tab) with ids `local-<uuid>`, and the
same functions (`saveAnswer`, `submitExam`, `getAttempt`) accept them.

**Exam runner** (resume-safe):

```js
import { startExam, saveAnswer, submitExam, getAttempt } from "@/lib/data/exams";

const a = await startExam({ exam: "achievement", section: "physics", difficulty: null, count: 25 });
// render a.questions; a.mode === "local" → show "practice mode — results aren't saved"
// timer: trust a.expires_at vs a.server_now (clock skew), not the device clock alone

await saveAnswer(a.attempt_id, q.position, choiceIndex, { timeSpentSeconds: spentOnQ });
await saveAnswer(a.attempt_id, q.position, null);                      // clear
await saveAnswer(a.attempt_id, q.position, current, { flagged: true }); // flag for review

// on reload: const s = await getAttempt(id) → s.status === "in_progress" ? resume(s.questions, s.answers, s.seconds_remaining) : showResult(s)
const result = await submitExam(a.attempt_id, unsavedAnswers /* optional */);
```

**Results page:** `result.attempt` (score, correct/total, duration, `xp_awarded`),
`result.items` (per question: selected vs `correct_index`, `explanation`),
`result.by_topic` (per-topic bars). Status `expired` = auto-submitted at the deadline.

**History page:**

```js
const [page, setPage] = useState({ items: [], nextCursor: null });
const more = async () => {
  const next = await listAttempts({ limit: 20, ...(page.nextCursor || {}) });
  setPage({ items: [...page.items, ...next.items], nextCursor: next.nextCursor });
};
```

### Local practice mode

Route handlers (server, same-origin only, best-effort per-IP rate limit
60 req / 5 min, bodies ≤ 4 KB / 16 KB, `Cache-Control: no-store`). Used by
`exams.js` automatically; call them directly only for special cases.

**`POST /api/exams/local/start`** body `{ exam, section?, topic?, difficulty?, count, time_limit_seconds? }`
(unknown keys rejected; `topic` follows the same rules as `p_topic` — section
inferred when missing, `400 invalid_argument {field: "topic"}` otherwise;
`count` must be 5–100 and is then capped at 10 for guests, 25 for signed-in
users → `limited: true`)
→ `200 { mode: "local", exam, section, topic, difficulty, question_count, requested_count, limited, max_questions, time_limit_seconds, started_at, expires_at, questions: [{ position, id, key, stem, passage, choices, section, topic, difficulty, time_limit_seconds }] }` (no answers).
Errors: `400 invalid_argument {field}` · `400 invalid_json` · `403 forbidden` · `413 payload_too_large` · `422 not_enough_questions` · `429 rate_limited` · `503 unavailable`.

**`POST /api/exams/local/grade`** body `{ answers: [{ key, selected_index }] }`
(1–100 unique known keys; `selected_index` null or a valid index)
→ `200 { mode: "local", items: [...as in the DB result, question_id = key], by_topic, summary: { correct, total, answered, score_percent } }`.
Errors: `400 invalid_argument | unknown_key {field}` and the same transport errors.

Implementation: `src/lib/exams/local-bank.js` (server-only). It loads
`src/content/questions/<file>.json` for each `QUESTION_FILES` entry through a
template-literal dynamic import, so webpack bundles whichever files exist at
build time; a missing file is recorded in `bank.missing` and the rest are
served. Malformed questions and `premium: true` items are never served.

### Question bank & seed

`src/content/questions/<exam>-<section>.json`:

```json
{ "source": "jazira-original", "exam": "aptitude", "section": "quantitative",
  "questions": [ { "key": "aq-001", "topic": "arithmetic", "difficulty": 1,
                   "stem": "…", "passage": null, "choices": ["…","…","…","…"],
                   "answer": 0, "explanation": "…", "time_limit_seconds": 60,
                   "tags": ["…"] } ] }
```
Optional per question: `premium` (bool), `year`, `source_ref`, `language` (`ar`|`en`).

```bash
node scripts/build-question-seed.mjs --check   # validate every file (exit 1 on errors)
node scripts/build-question-seed.mjs           # → supabase/migrations/0011_seed_questions.sql
node scripts/build-question-seed.mjs --file tests/fixtures/questions-sample.json --out /tmp/seed.sql
```
The generated SQL is deterministic and idempotent (upsert on `key` /
`question_id`, unchanged rows untouched), dollar-quotes every string, and
fails fast if the referenced source slug does not exist. Re-run it after
editing the JSON files and apply the new `0011` file.

---

## Content engine (0014)

`supabase/migrations/0014_content_engine.sql` adds the curriculum outline,
typed questions, template-driven exam sessions, learner analytics and the
staging import (design: `docs/CONTENT_ENGINE.md` §5–§6; tests:
`tests/db/content-0014.test.js`, `content-engine-rpc.test.js`,
`content-import.test.js`, `content-perf.test.js`). Every legacy RPC above keeps
its signature and, for rows with `template_id is null`, exactly today's payload.

### Content tables

| table | main columns | client access |
|---|---|---|
| `content_sources` | `id, kind, name_ar, name_en, license_status, provenance_status, redistribution, publish_policy` | read |
| `curriculum_nodes` | `id` (flat node id), `parent_id, kind (stage…lesson), stage, grade, track, subject, ord, title_ar, title_en, term, term_status, in_plan, status, unit_opener, search_norm` | read, except `status = 'source_only'` |
| `subject_terms` | `subject_node_id, term, status, evidence` | read |
| `curriculum_resources` | `id, source_id, subject_node_id, kind, title, part, year_label, url (https link-out), availability, term, term_status, status` | read (metadata only, nothing rehosted) |
| `lesson_resource_ranges` | `lesson_node_id, resource_id, pdf_start, pdf_end, printed_start, printed_end, method, status` | read |
| `learning_objectives` | `id, lesson_node_id, text_ar, text_en, origin, status` | read `validated` rows |
| `exam_templates` | `id, version, kind, definition (exam-template@1), is_active` | read active |
| `scope_pool_counts` | per `(node_id, band 0–3)`: `published_count, group_count, free_count, free_group_count` (node ids include `subject@t1/@t2` and `prep:` nodes) | read |
| `learner_question_stats`, `learner_node_stats` | per learner: seen / answered / correct, wrong streak, band counts, time | read own; no writes |
| `question_stimuli`, `question_curriculum`, `scope_pool_members`, `question_item_stats`, `question_revisions`, `content_import_*` | — | **none** (RPC payloads / service role only) |

Changed tables (additive):
- `questions`: `question_type, difficulty_level (1–5), item_style, provenance, status, validation_status, content_hash, revision, lesson_node_id, objective_id, stimulus_id, shuffle_options, fixed_order_reason, exclusion_group, payload_public, option_flags, source_*, import_origin, stem_norm`. `exam = 'school'` is the curriculum bank; its rows, and every staging-imported row (`import_origin = 'staging'`: the key is minted from a hash that includes the answer), are **not readable** through PostgREST (policy `exam <> 'school' and import_origin is distinct from 'staging'`); the legacy prep rows stay readable. Select is granted **per column**: today's columns plus `question_type, payload_public, difficulty_level, lesson_node_id`. `content_hash` (it includes the answer), `exclusion_group, provenance, validation_status, import_origin, revision`, source columns, `option_flags` and `stem_norm` are not granted.
- `question_keys`: `answer` (canonical payload with the answer — the grading input), `explanation_steps`, `accepted_norm` (normalized short answers, computed **in SQL** with `search_normalize_v2`). `correct_index` may be null for non-mcq types.
- `exam_attempts`: `template_id, template_version, scope, term_scope, seed, retake_of, timing_mode, feedback_mode, quota ('exam'|'practice'), bank_revision`; `exam` may be `'school'`; untimed sessions allow a 7-day deadline. The owner reads every column **except `seed`**.
- `exam_attempt_items`: `choice_order, display_map, response` (canonical ids — **not granted**, server side only), `score, question_revision, locked_at, voided` (granted to the owner). `score` / `is_correct` stay null until the item is locked (`check_exam_item`) or the attempt is finalized. For template items `selected_index` holds the **display** index of an mcq / true_false answer (grading uses the canonical `response`).

### Template sessions (signed in)

**Question handles.** In every template payload (`start_template_attempt`,
`get_exam_attempt`, `check_exam_item`, results) `questions[].key` / `items[].key`
is an opaque per-attempt handle (`h-` + 20 hex), stable within the attempt and
different across attempts — never the question key (current keys are
answer-free, §2.2 of docs/CONTENT_ENGINE.md, but keys minted under the earlier
rule hashed the answer, so none is exposed). Identify items by `position`.

Errors are `P0001` with the code as `message` and JSON `details`. New codes:
`template_not_found`, `scope_not_found`, `insufficient_pool {available, required}`,
`feedback_not_allowed`, `invalid_response {position, reason}` (reasons include
`bad_shape, bad_index, index_out_of_range, duplicate_left, duplicate_right,
not_a_permutation, too_long, too_large, invalid_number, ambiguous_separator,
fraction_not_allowed, too_many_decimals, empty`), `item_locked {position}`,
`scope_too_large`, `seed_not_allowed`, `not_found`, `retire_refused {reason}`;
plus the existing `daily_limit_reached` (now with `quota`), `premium_required`,
`attempt_not_found`, `attempt_closed`, `invalid_argument {field}`.

| RPC | grants | notes |
|---|---|---|
| `start_template_attempt(p_template, p_scope, p_count = null, p_timing = null, p_feedback = null, p_retake_of = null) → jsonb` | authenticated, service_role | Scope grammar `node[@t1|@t2|@year]`, `prep:exam[/section[/topic]]`, `weak:[node]`. Tier clamping (free: 25 questions, mini versions below a template's min, e.g. full year → 25), quotas (free: 5 `exam` sessions — legacy attempts included — and 30 `practice` sessions per Riyadh day), server seed (a `seed` argument → `seed_not_allowed`), selection in SQL (`_ce_select_rows`, identical to the JS engine), a retake reuses the stored allocation and must be the caller's attempt (`not_found`). Payload §5.7: `questions[]` with **display indexes only** (`options[{index,text}]`, `public.left/right/items[{index,text}]`), never ids, answers or explanations. |
| `save_exam_response(p_attempt, p_position smallint, p_response jsonb, p_time_spent int = 0, p_flagged boolean = null) → jsonb` | authenticated, service_role | `p_response` in display indexes: `{option_index}`, `{pairs:[[l,r]…]}`, `{order:[i…]}`, `{text}`, `{value, unit?}`; mapped to canonical ids and stored; refused on a locked item and after `expires_at + 30 s`. Never writes a score. |
| `check_exam_item(p_attempt, p_position smallint) → jsonb` | authenticated, service_role | Immediate-feedback sessions only: grades the saved response, locks the item, returns verdict, score, correct response, explanation, objective, lesson and source. |
| `submit_exam_attempt(p_attempt, p_answers = null)` / `get_exam_attempt(p_attempt)` | unchanged | Template attempts: `p_answers[].response` (display indexes; `selected_index` still accepted for mcq); locked positions keep their lock-time response; answers after the grace period are ignored; items whose question revision changed are **voided** (excluded from the score, rendered from `question_revisions`). Result: `attempt, items[] (verdict, score, response, correct_response, explanation, objective, lesson {id,title,href}, source {resource_id,title,printed_start,printed_end,url}), by_lesson, by_band, by_term (full year), by_topic (prep), voided_count, answered_count`. In progress: `questions`, `answers[] {position, response, flagged, time_spent_seconds, locked, check}`, `timing_mode`, `feedback_mode`. |
| `abandon_exam_attempt(p_attempt) → jsonb` | authenticated, service_role | Finalizes as `abandoned`: answered items graded for the statistics, no XP. Untimed sessions past their 7-day deadline are abandoned lazily. |
| `list_exam_attempts_v2(p_limit = 20, p_before = null, p_before_id = null) → jsonb` | authenticated, service_role | Like `list_exam_attempts` plus `topic, template_id, template_version, scope, scope_title, term_scope, retake_of`. |
| `get_learning_stats(p_node = null) → jsonb` | authenticated, service_role | Totals, by band, weakest lessons (answered ≥ 5, Wilson lower bound z = 1.645), repeated mistakes (wrong streak ≥ 2), 7/30-day trend; `by_topic` for Elite, otherwise listed in `locked`. |
| `get_practice_recommendations(p_limit = 5) → jsonb` | authenticated, service_role | `[{kind: weakness_review|lesson_review|lesson_quiz, node, title, reason {accuracy, answered}, href}]`. |
| `get_scope_availability(p_node) → jsonb` | anon, authenticated | Pool counts per band, exclusion components, and per template listing the scope kind: `offered, mini, min_pool, reason` (anon = guest tier). |
| `search_content(p_q, p_kinds = null, p_node = null, p_limit = 10, p_offset = 0, p_anon = false) → jsonb` | authenticated, service_role | Groups `node, resource, exam`, and — signed in, never with `p_anon` — `question` as **lesson-level counts** (never stems). `p_q` ≥ 2 characters (≥ 3 for questions), totals capped at 100, `statement_timeout = 500ms`. Guests go through the rate-limited `GET /api/content/search` route. |

### Guest sessions and secrets

Guests use `POST /api/exams/session/{start,check,submit}` (stateless tokens
v2; nothing is saved and results say so). All three: same origin only,
`exams.session` limit 60 / 300 s per IP, strict body whitelists, responses
`Cache-Control: no-store`, errors as `{error, …}`.

- **Token:** HMAC-signed clear header (template, scope, timing, deadline,
  feedback, tier) plus an AES-256-GCM sealed part holding the question keys,
  revisions and seed; the browser cannot read which questions it holds.
- **Handles:** `questions[].key` / `items[].key` are per-session opaque handles
  `h-` + 16 base64url, never canonical question keys.
- **Seen list:** `/start` returns `seen`, an opaque sealed blob (`s1.…`,
  ≤ 12 KiB). Keep it (per browser) and send it back as `seen` on the next
  `/start`; a blob that does not open is ignored.

| Route | Body | 200 | Errors |
|---|---|---|---|
| `/start` | `{template, version?, scope, count?, timing?, feedback?, seen?, retake_of?}` (≤ 16 KiB; `seed` → `seed_not_allowed`) | `{mode:"guest", session_id, token, template, scope, …, seen, questions[{position, key (handle), type, language, stem, stimulus, options[{index,text}], choices, public, time_limit_seconds, lesson}]}` | 400 `invalid_argument {field}`, `seed_not_allowed`, `feedback_not_allowed`, `token_invalid` (retake) · 403 `forbidden` · 404 `template_not_found`, `scope_not_found` · 409 `use_database` · 413 · 422 `insufficient_pool {available, required}`, `scope_too_large`, `premium_required` · 429 `rate_limited` · 503 `unavailable` |
| `/check` | `{token, position, response}` (≤ 8 KiB; response in display indexes) | `{position, verdict, score, correct_response, explanation, objective, lesson, source, receipt, key_reveal_limit}` | 400 `invalid_argument`, `invalid_response {position, reason}`, `token_invalid`, `feedback_not_allowed` · 403 · 409 `bank_changed {position}`, **`item_locked {position}`** · 410 `token_expired` · 413 · **429 `rate_limited`** · 503 |
| `/submit` | `{token, answers[{position, response, time_spent_seconds?, flagged?}], receipts?}` (≤ 48 KiB) | `{mode:"guest", saved:false, status: submitted\|expired, …, key_reveal_limit, items[{position, key (handle), …, verdict, score, correct_response, explanation, voided, locked}]}` | 400 `invalid_argument`, `invalid_response`, `token_invalid` · 403 · 410 `token_expired` (> 1 day past the deadline) · 413 · **429 `rate_limited`** · 503 |

- **One check per position** (immediate-feedback templates only): the first
  checked response of a (session, position) is locked on the server
  (`ce_guest_check_lock`, below). The same response again returns the same
  verdict and receipt (safe to retry); another response gets
  `409 item_locked` with no verdict. `/submit` takes a receipted position's
  score from its receipt; without a receipt, an immediate-feedback position is
  unanswered.
- **Daily per-IP budgets:** revealed keys (`exams.keys`,
  `EXAM_KEY_REVEAL_DAILY`, default 400): past it results carry verdicts only
  and `key_reveal_limit: true`. Graded submitted answers (`exams.grades`,
  `EXAM_GRADE_DAILY`, default twice the key cap; one per `/check`, one per
  `/submit` position graded from a response; receipted and unanswered
  positions free): past it `429 rate_limited` and nothing is graded.
- **Deadline:** `/check` refuses after deadline + grace (`410`); `/submit`
  then answers `status: "expired"` (answers ignored, receipts kept) for one
  more day, and `410 token_expired` after that.

With a service role the routes select and lock in SQL:

| RPC | grants | notes |
|---|---|---|
| `ce_guest_start(p_template, p_scope, p_seed, p_seen text[], p_count) → jsonb` | service_role | Guest tier and scope caps, premium never included, `p_seen` ≤ 300 keys. Returns only the picked content rows (canonical ids stay server side; the route turns them into display indexes) and the stored allocation. |
| `ce_guest_items(p_keys text[], p_with_keys boolean) → jsonb` | service_role | Content (and at check/submit time the key: canonical payload, explanation, objective, source) of published non-premium keys, in `p_keys` order. |
| `ce_guest_check_lock(p_sid text, p_position int, p_resp_hash text, p_expires_at timestamptz) → text` | service_role | Inserts into `ce_guest_check_locks` (pk sid, position; no client grants) → `first` \| `repeat` \| `locked`; rows expire at deadline + grace (≤ 8 days). Without a service role the route uses a per-instance memory fallback. |

Environment (see `docs/DATABASE_SETUP.md`): `LOCAL_EXAM_SECRET` signs guest
tokens (≥ 32 chars for v2); `LOCAL_EXAM_SECRET_PREVIOUS` is accepted during a
rotation (verification and decryption only); with `EXAM_SECRET_REQUIRED=1` the guest routes answer
`503 {error: "unavailable"}` when the secret is missing. Without the flag a
missing secret is derived from the existing server-only secrets (a warning is
logged), so live practice never goes down.

### Import pipeline (service role)

`node scripts/content/import-staging.mjs --target pglite|supabase [--run <id>] [--resume] [--only sources,resources,curriculum,objectives,stimuli,questions,templates] [--batch 500] [--dry-run] [--no-retire]`

| RPC | notes |
|---|---|
| `ce_import_begin(p_manifest jsonb) → uuid` | The staging manifest (`manifest@1`: `sha256`, `removed[]`) plus `run {target, only, filtered, …}`. |
| `ce_import_batch(p_run, p_entity, p_batch_no, p_rows jsonb) → jsonb` | ≤ 500 rows, one transaction, `jazira.bulk_import = on`; entities `sources, nodes, resources, subject_terms, lesson_ranges, objectives, stimuli, questions, templates`. Each row is an isolated upsert (unchanged rows untouched); a bad row is rejected into `content_import_errors` and the batch continues. A changed question appends its previous version to `question_revisions` and bumps `revision`. `duplicate_content` for a content hash shared with another manifest row (or an active row). |
| `ce_import_retire(p_run, p_keys text[]) → jsonb` | Only keys of the manifest's `removed[]`: `is_active = false, status = 'retired'` (never deleted). `retire_refused {reason: only | import_errors | filtered_publish_set}` with nothing retired. |
| `ce_import_finish(p_run) → jsonb` | Closes the run, calls `ce_refresh_aggregates()` once, returns per-entity counts. |
| `ce_refresh_aggregates() → void` | Rebuilds `question_bank_counts`, `scope_pool_members` and `scope_pool_counts`. |

Only `published` questions are sent; for `--target supabase` a question whose
source's `publish_policy` is not `derived_questions_allowed` (internal sources
always qualify) is held back. Retirement runs **before** question inserts and
only for keys of shards the run fully covers. The checkpoint
(`<cache>/import/<target>/checkpoint.json`) makes a stopped run resumable
(`--resume`, same manifest sha). Reports: `data/staging/reports/import/<target>-<run>.json`
(supabase) or the cache (pglite).

**Never re-apply `0011_seed_questions.sql` after an import**: it resets
`is_active` of the seeded rows. The importer updates only the new columns of
the 300 legacy rows (their stem, choices and key stay as seeded); a staging
record whose choices, type or answer differ from the seeded row is rejected
(`legacy_mismatch {field: choices | question_type | answer}`). The legacy
builder (`start_exam_attempt`) and `question_bank_counts` use `mcq` /
`true_false` items only. `--resume` needs the database of the stopped run
(the CLI's `--target pglite` is a fresh in-memory database, so it refuses) and
the same `--only`.

---

## Community: anonymous posting and feed RPCs

Since 0012 anonymity is a property of each **post and comment**, not of the
author's current setting.

| column | set by | rules |
|---|---|---|
| `community_posts.is_anonymous`, `post_comments.is_anonymous` (`boolean not null`) | the inserting client (column INSERT grant) or, when omitted / `null`, a trigger copying `profiles.anonymous_community` **at that moment** | immutable afterwards for every role (`anonymity_immutable`, `42501`); not client-updatable. Existing rows were backfilled from the author's setting when 0012 ran |
| `mentions.is_anonymous` | the `index_post_entities` trigger | copied from the post / comment |

Turning `profiles.anonymous_community` off never attributes earlier anonymous
content; turning it on does not hide earlier public content. The setting is
only the **default for new posts and comments** (plus: members in anonymous
mode are left out of people search / suggestions and their profile page stays
private, as before).

**Reading.** Another member's anonymous post or comment is *not readable
through the table API* (RLS `posts_read` / `comments_read`: `not is_anonymous
or user_id = auth.uid()`), so its `user_id` never reaches another client.
Plain table reads therefore only return public rows plus the caller's own
(head counts by `user_id` on a profile count public posts only; own-row counts
for achievements / the dashboard include the member's anonymous rows). Feeds,
threads and profile lists read through these `SECURITY DEFINER` RPCs (anon +
signed in), which mask the author:

#### `community_feed(p_scope text = 'all', p_user uuid = null, p_tag text = null, p_ids uuid[] = null, p_before timestamptz = null, p_before_id uuid = null, p_limit int = 12) → setof row`

| `p_scope` | rows | anonymous posts |
|---|---|---|
| `all` | every post | included, masked |
| `following` | posts by members the caller follows (guests: none) | **never** |
| `tag` (`p_tag`, `#` optional, case-insensitive) | posts indexed under the tag | included, masked |
| `author` (`p_user`) | that member's posts | only when `p_user` is the caller (flagged `is_anonymous`) |
| `liked` / `reposted` (`p_user`) | posts the member liked / reposted; empty for others when the member hides that tab (`show_likes_on_profile` / `show_reposts_on_profile`) | included, masked |
| `ids` (`p_ids`, ≤ 100) | those posts (permalink, hydrating a new post, refreshing counts) | included, masked |

Public posts by members the caller **blocked** are left out of every scope;
anonymous ones are not (see SECURITY.md §6). `p_limit` 1–50. Columns:

```
id, content, media_url, media_type, media_path, likes_count, dislikes_count,
comments_count, reposts_count, created_at, is_anonymous, is_mine,
author_id, author_username, author_full_name, author_avatar_url,
author_is_elite, author_show_elite_badge,          -- all null when masked
viewer_liked, viewer_disliked, viewer_reposted,    -- the caller's reactions
cursor_at, cursor_id                               -- keyset of this row
```
The author is returned when the post is public **or the caller's own**
(`is_mine = true`, so the UI can say "You (anonymous)"). Keyset: pass the last
row's `cursor_at` / `cursor_id` as `p_before` / `p_before_id` (for `tag`,
`liked`, `reposted` they are the link row's, not the post's). A page shorter
than `p_limit` is the last one.

#### `community_comments(p_post uuid, p_before timestamptz = null, p_before_id uuid = null, p_limit int = 20) → setof row`

Newest first (keyset on `created_at, id`), `p_limit` 1–50, public comments by
members the caller blocked left out. Columns: `id, post_id, content,
created_at, is_anonymous, is_mine, author_id, author_username,
author_full_name, author_avatar_url, author_is_elite, author_show_elite_badge`
(author columns null when masked).

#### `community_new_posts_count(p_since timestamptz, p_since_id uuid = null) → integer`

How many posts newer than `(p_since, p_since_id)` (the feed's first row) the
caller would see in `all`, excluding their own; capped at 100. **Replaces the
realtime subscription** for the "new posts" pill: `community_posts` and
`post_comments` are no longer in `supabase_realtime` (their rows carry
`user_id`). Poll it (e.g. every 30–60 s while the tab is visible) and refresh
visible counts with `community_feed('ids', p_ids => …)`.

**Writing** (unchanged except the new column): insert
`{ user_id, content, media_*, is_anonymous? }` / `{ post_id, user_id, content,
is_anonymous? }`; omit `is_anonymous` to use the profile default. Return only
the new row's own columns (`select=id,...` — the row is the caller's, so it is
readable), then hydrate with `community_feed('ids')`.

**Anonymous media** lives under `post-media/anon/<uuid>/<file>` (`<uuid>` =
`crypto.randomUUID()`, lower-case; `<file>` = `[A-Za-z0-9._-]{1,200}`, e.g. the
existing `<ms>-<w>x<h>.<ext>`). Any signed-in member may upload there (the
Storage API records them as `owner`); only the owner can list or delete it;
nobody can overwrite it (upload with `upsert: false`). An anonymous post
**must** use such a path, uploaded by its author, with the matching public URL;
a public post must keep using `<uid>/<file>` (`invalid_media_url`, `23514`,
otherwise). Media uploaded to `<uid>/` before 0012 keeps working but its URL
names the author (see Known limits).

---

## Notifications

### Types and preferences

| type | written by | preference switch |
|---|---|---|
| `like`, `repost` | trigger `notify_on_post_interaction` (0008, rewritten in 0012) | `likes` |
| `comment` | same trigger | `comments` |
| `follow` | trigger (0008) | `follows` |
| `mention` | trigger `index_post_entities` (0009, rewritten in 0012) | `mentions` |
| `message`, `message_request`, `request_accepted` | DM RPCs (0009) | `messages` |
| `exam_result` | `submit_exam_attempt` | `exam_results` |
| `achievement` | server code (definer / service role) | `exam_results` |
| `system` | service role | `product_updates` |

`notifications.data jsonb` carries type-specific payload — `exam_result`:
`{ attempt_id, exam, section, score_percent, correct, total, status }`;
`comment` / `mention` from **anonymous** content: `{ "anonymous": true }` (0012). Only
trust `data` for the system types and that flag.

**Anonymous content (0012).** The recipient of a `like` / `repost` / `comment`
is the post's author (also when the post is anonymous — only they receive it);
the actor is the member who acted. When the *actor's* content is anonymous (an
anonymous comment, a mention inside an anonymous post or comment) the row is
stored with `actor_id = null` and `data.anonymous = true`, so neither the row
(realtime included) nor `get_notifications` can reveal who it was. No
notification is created between a blocked pair (possible only on anonymous
posts, where blocks do not refuse the interaction — see SECURITY.md §6). Clients can never insert
`exam_result` / `achievement` / `system` rows (and, since 0009, no client
inserts at all).

`notification_preferences` (own row only; no row = defaults):
`likes, comments, follows, mentions, messages, exam_results, product_updates`
(default `true`), `email_digest` (default `false`), `updated_at`. A disabled type
is **not stored at all** (a delivery gate trigger on `notifications` applies it
to every writer). `email_digest` is stored for a future mailer; nothing sends
email yet.

### Notification RPCs

- `get_notifications(p_limit int = 20, p_before timestamptz = null, p_before_id uuid = null) → setof row` —
  own rows, newest first, `p_limit` 1–100. Columns: `id, type, read, created_at, post_id,
  comment_id, conversation_id, data, actor_id, actor_full_name, actor_username,
  actor_avatar_url, actor_is_elite, actor_show_elite_badge, actor_anonymous, post_snippet`
  (snippet ≤ 120 chars + "…"). `actor_anonymous` is true when the content was anonymous
  (`data.anonymous`; then `actor_id` is `null` too) **or** the actor is currently in anonymous
  mode (display preference kept from 0010; `actor_id` is still returned for those `like` /
  `repost` / `follow` rows because likes and follows are public anyway). When it is true the
  name, handle and avatar are `null` and `actor_is_elite` is `false`.
- `unread_notification_count() → integer` (0000; the shell bell).
- `mark_notifications_read(p_ids uuid[] = null) → integer` — `null` = all unread; ≤ 500 ids; returns rows changed.

### Notifications client (`src/lib/data/notifications.js`)

| function | returns |
|---|---|
| `listNotifications({ limit = 20, before?, beforeId? })` | `{ items, nextCursor, available }`; item = `{ id, type, read, created_at, post_id, comment_id, conversation_id, data, actor: { id, full_name, username, avatar_url, is_elite, show_elite_badge, anonymous } \| null, post_snippet }` |
| `getUnreadCount()` | `number` (0 when signed out / unavailable) |
| `markNotificationsRead(ids \| null)` / `markAllNotificationsRead()` | rows changed; dispatches `window` event `jz:notifications-read` (the bell refreshes) |
| `getNotificationPreferences()` | `{ …switches, available }` (defaults when never saved) |
| `updateNotificationPreferences(patch)` | saved switches; unknown keys / non-booleans → `invalid_argument` |
| `NOTIFICATION_PREFERENCE_KEYS`, `DEFAULT_NOTIFICATION_PREFERENCES`, `NOTIFICATION_TYPE_PREFERENCE` | constants |

Signed out → empty results. If `get_notifications` is not deployed it falls
back to plain table reads (no `post_snippet`).

```js
const { items, nextCursor } = await listNotifications({ limit: 20 });
await markNotificationsRead(items.filter((n) => !n.read).map((n) => n.id));
await updateNotificationPreferences({ likes: false, email_digest: true });
```
When `actor.anonymous` is true, render your localized "anonymous" label instead
of a name (name, handle and avatar are `null`); `actor` is `null` for system types.

> **Client follow-up (0012):** `normalize()` in `src/lib/data/notifications.js`
> builds `actor` only when `actor_id` is set, so anonymous-content rows
> (`actor_id: null`, `actor_anonymous: true`) currently come out as `actor: null`
> (rendered as "someone"). It must build `{ id: null, anonymous: true, … }` when
> `row.actor_anonymous` is true; `uniqueActors()` already keys id-less actors by
> notification.

---

## Search

`search_all(p_q text, p_limit int = 5, p_types text[] = null, p_offset int = 0) → jsonb`
— anon + signed in. 0012 replaced the 0010 `search_all(p_q, p_limit)` (one
function; two-argument calls still work).

- **Matching** is Arabic-normalised: both sides go through
  `search_normalize(text)` (IMMUTABLE; the database twin of `normalizeText()` in
  `src/lib/search/curriculum-index.js`): harakat, tanween, shadda, sukun,
  superscript alef, Quranic marks and tatweel are dropped; أ إ آ ٱ → ا, ة → ه,
  ى ئ ی → ي, ؤ → و, ک → ك; Arabic-Indic and Persian digits → 0-9; lower-case;
  whitespace collapsed. So "مدرسه" finds "المَدْرَسَةِ", "اسلام" finds "إسلام",
  "٣٠" finds "30". Punctuation is kept and `%`, `_`, `\` are literal
  (LIKE-escaped). Substring match backed by pg_trgm GIN indexes on the
  normalised expressions (`*_norm_idx` on `profiles.full_name`,
  `profiles.username`, `community_posts.content`, `hashtags.tag`,
  `questions.stem`).
- The query is trimmed, whitespace-collapsed and capped at 100 characters;
  fewer than 2 characters (also after normalising) returns empty groups.
- `p_limit` 1–20 rows per group. `p_types` = a non-empty subset of
  `people`, `posts`, `tags`, `questions` (default all); groups not requested come
  back `[]` with a `null` total. `p_offset` 0–100 pages the requested groups —
  "view all" for one group is `p_types => '{posts}', p_limit => 20, p_offset => 20`.
- `totals.<group>` = number of matches, **capped at 100**;
  `totals_capped.<group>` is `true` when more than 100 matched. More pages exist
  while `offset + rows < totals` (or when capped, until offset 100).
- `SECURITY DEFINER` (anonymous posts must be searchable without exposing
  their author), so every visibility rule is explicit:
  **people** — public columns only, never members in anonymous mode;
  **posts** — author only when the post is public or the caller's own
  (`is_mine`), public posts by members the caller blocked are skipped;
  **tags** — all; **questions** — active only, premium only for premium callers
  (the same rule as the `questions` RLS), only `id/section/topic/snippet`;
  never the curriculum bank (`exam = 'school'`, excluded by 0014 — school
  items are found lesson-level only, through `search_content`).
- Snippets are a window of the original text around the (normalised) match.

```json
{ "query": "جبر",
  "people":    [ { "id": "uuid", "username": "…", "full_name": "…", "avatar_url": null, "is_elite": false, "show_elite_badge": true } ],
  "posts":     [ { "id": "uuid", "snippet": "…window around the match…", "created_at": "…", "likes_count": 3, "comments_count": 1,
                   "is_anonymous": false, "is_mine": false,
                   "author": { "id", "username", "full_name", "avatar_url", "is_elite", "show_elite_badge" } | null } ],
  "tags":      [ { "tag": "جبر", "post_count": 12 } ],
  "questions": [ { "id": "uuid", "section": "quantitative", "topic": "algebra", "snippet": "…" } ],
  "totals":        { "people": 3, "posts": 100, "tags": 2, "questions": 7 },
  "totals_capped": { "people": false, "posts": true, "tags": false, "questions": false },
  "limit": 5, "offset": 0, "types": ["people", "posts", "tags", "questions"] }
```
`author` is `null` for another member's anonymous post; the author sees their
own with `is_anonymous: true, is_mine: true`. A leading `#` is ignored for tags.
Errors: `invalid_argument` with `details.field` = `limit` | `offset` | `types`.

Client (`src/lib/data/search.js`):

| function | notes |
|---|---|
| `searchAll(q, { limit = 5, signal, types = null, offset = 0 })` | `{ query, people, posts, tags, questions, totals, totalsCapped, offset, types, available }` (`totals` / `totalsCapped` are `null` against a pre-0012 database); `p_types` / `p_offset` are only sent when used. Bad `limit` (1–20), `offset` (0–100) or `types` → `DataError("invalid_argument")`; aborted → `DataError("aborted")`; function or table missing (`PGRST202`/`PGRST205`/`42883`/`42P01`) → empty with `available: false` |
| `createSearcher({ delay = 250, limit = 5, types, offset })` | `{ search(q), cancel() }` — debounced; a newer call aborts the older one (its promise rejects with `aborted`) |
| `debounce(fn, ms)`, `normalizeQuery(q)`, `normalizeTypes(types)`, `searchCacheKey(viewer, q, opts)`, `clearSearchCache()`, `createLruCache()` | helpers; constants `SEARCH_GROUPS`, `SEARCH_MAX_LIMIT`, `SEARCH_MAX_OFFSET`, `SEARCH_TOTAL_CAP` |

**Cache.** LRU, 50 entries, 2 min, **per viewer**: the key starts with the
session user's id (or `anon`) and includes limit, offset and groups. It is
cleared when the viewer changes (detected on the next request, and through
`supabase.auth.onAuthStateChange`: sign-out or another user), so one account
never sees results computed for another (premium questions, blocks, own
anonymous posts).

```js
const searcher = useMemo(() => createSearcher(), []);
useEffect(() => () => searcher.cancel(), [searcher]);
const onChange = (text) =>
  searcher.search(text).then(setResults).catch((e) => e.code !== "aborted" && setError(e.code));

// "view all posts", page 2
const page = await searchAll(q, { types: ["posts"], limit: 20, offset: 20 });
const label = page.totalsCapped?.posts ? `${page.totals.posts}+` : String(page.totals?.posts ?? page.posts.length);
```

---

## Contact

`contact_messages`: `id, user_id (null = guest), name (2–80), email (≤ 254,
stored lower-case), topic ('general'|'technical'|'billing'|'content'|'partnership'|'other'),
message (10–4000), locale ('ar'|'en'), status ('new'|'in_progress'|'resolved'|'spam'), created_at`.

- **Insert only** for anon and signed-in users (`user_id` must be null or the
  caller; signed-in senders are attributed automatically). No select / update /
  delete for clients — the team reads it with the service role. No `RETURNING`.
- A trigger trims/normalises, stamps `created_at = now()` and raises
  `rate_limited` on the **4th message within an hour** from the same email or
  the same account.

`sendContactMessage({ name, email, topic, message, locale })` →
`{ ok: true }` or `{ ok: false, code: "invalid" | "rate_limited" | "unavailable" | "network", field? }`
(never throws). `validateContactMessage(input)` → `null` or the first invalid
field; `CONTACT_LIMITS`, `CONTACT_TOPICS`.

> `ContactForm.jsx` allows names up to 100 characters client-side; the
> database limit is 80, so 81–100 comes back as `{ ok: false, code: "invalid", field: "name" }`.

---

## AI quota

`ai_quota() → jsonb` (signed in):

```json
{ "unlimited": false, "limit": 5, "used": 3, "remaining": 2,
  "resets_at": "…", "window_hours": 8, "referral_bonus": false }
```
- Elite (premium): `{ unlimited: true, limit: null, remaining: null, resets_at: null, used }`.
- Free: 5 user messages per **rolling 8 h**; +5 (limit 10) once the user has ≥ 5
  referrals (`REFERRAL_REWARD` in `src/lib/constants.js`).
- `resets_at` = when the next message slot frees up (`null` when nothing used).
- Usage is counted from a private ledger (`ai_usage`) filled by a trigger on
  every `chat_history` insert with `message_type = 'user'`, so deleting chat
  history does not give messages back.

**Enforcement** is server-side in `POST /api/chat`: after auth and input checks
and before anything is stored or sent to the model it calls `ai_quota()`;
when exhausted it answers **429** with a localized plain-text message (streamed
like a normal reply) and headers `Retry-After`, `X-Error-Code: ai_quota_exhausted`,
`X-Quota-Limit`, `X-Quota-Remaining: 0`, `X-Quota-Reset`. Locale:
`body.locale` → `NEXT_LOCALE` cookie → `Accept-Language` → Arabic. If
`ai_quota()` is not deployed the route logs a warning and continues; any other
quota error → 503. User-visible texts never name the AI provider or model.

Client: `getAiQuota()` (`src/lib/data/ai.js`) → the object above, or `null`
when signed out / not configured / not deployed (fall back to the local
estimate in `useAiUsage`).

---

## Access model summary

| object | anon | authenticated | notes |
|---|---|---|---|
| `question_sources` | select | select | |
| `questions` | select active non-premium, granted columns only, never `exam = 'school'` | same; premium if `has_premium` | no writes; `content_hash` & co. not granted (0014) |
| `question_keys`, `question_bank_counts`, `ai_usage` | — | — | no privileges at all |
| `exam_attempts`, `exam_attempt_items` | — | select own (items: no `choice_order`, `display_map`, `response`) | writes via RPCs only |
| `content_sources`, `curriculum_nodes`, `subject_terms`, `curriculum_resources`, `lesson_resource_ranges`, `learning_objectives` (validated), `exam_templates` (active), `scope_pool_counts` | select | select | 0014; no writes |
| `learner_question_stats`, `learner_node_stats` | — | select own | written only by `_exam_finalize` |
| `question_stimuli`, `question_curriculum`, `scope_pool_members`, `question_item_stats`, `question_revisions`, `content_import_*` | — | — | no privileges |
| RPCs: template sessions, `list_exam_attempts_v2`, `get_learning_stats`, `get_practice_recommendations`, `search_content` | — | execute | `SECURITY DEFINER`, `search_path = ''` |
| `get_scope_availability` | execute | execute | counts only |
| `ce_import_*`, `ce_refresh_aggregates`, `ce_guest_start`, `ce_guest_items` | — | — | service role only |
| `contact_messages` | insert | insert | write-only |
| `notification_preferences` | — | select/insert/update own | |
| `community_posts`, `post_comments` | select public rows | select public rows + own anonymous rows; insert own (`is_anonymous` optional, never updatable) | others' anonymous rows only through the RPCs below |
| RPCs: exams, notifications, `ai_quota` | — | execute | `SECURITY DEFINER`, check `auth.uid()` |
| `get_question_bank_stats` | execute | execute | counts only |
| `search_all`, `community_feed`, `community_comments`, `community_new_posts_count` | execute | execute | `SECURITY DEFINER` with explicit visibility rules; anonymous authors masked |
| `search_normalize`, `search_snippet`, `is_anon_media_path` | execute | execute | pure helpers |
| internal `_exam_*`, `_refresh_*`, `notification_allowed` | — | — | not callable by API roles |

---

## Known limits

- Local practice mode is stateless: non-premium answer keys can be obtained
  through `/api/exams/local/grade` by anyone who knows question keys (premium
  keys never). The per-IP limiter is per server instance only.
- The free daily limit counts attempts started (including ones never
  submitted and abandoned ones). `abandon_exam_attempt` (0014) closes a
  session without XP; practice-quota template sessions have their own limit.
- XP is +2 per correct answer, also for repeated questions (premium users can
  take unlimited attempts).
- `ai_quota()` is a check, not a reservation: two simultaneous requests at the
  last free message can both pass.
- `get_exam_stats()` aggregates on the fly (fine for thousands of attempts per
  user; add a rollup table if a user ever has far more).
- Questions removed from the JSON files are not deactivated by the seed;
  set `is_active = false` explicitly.
- `list_exam_attempts` rows have no `topic` column (its row type is kept so
  0010 can be re-run); read it from the attempt JSON.
- Anonymous posts created before 0012 whose media sit in `post-media/<uid>/…`
  keep a URL that names the author. Moving them needs the Storage API (service
  role `move()` to `anon/<uuid>/…`, then update `media_url` / `media_path`); list
  them with `select id, media_path from community_posts where is_anonymous and
  media_path not like 'anon/%'`.
- `search_all` / `community_*` totals and pages are computed per request
  (trigram-indexed); totals stop at 100 on purpose.
- The realtime "new posts" signal is gone for `community_posts` /
  `post_comments`; clients poll `community_new_posts_count()`.
