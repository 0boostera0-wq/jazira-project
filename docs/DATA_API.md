# Jazira Data API

Tables, RPCs and client data functions for the learning features: **exams**
(runner, results, history, analytics), **notifications**, **search**,
**contact** and the **AI quota**. Database side:
`supabase/migrations/0010_learning_platform.sql` (tests:
`tests/db/learning.test.js`). Client side: `src/lib/data/*.js`.

- [Conventions](#conventions)
- [Exams](#exams) — [tables](#exam-tables) · [RPCs](#exam-rpcs) · [client](#exam-client-srclibdataexamsjs) · [local practice mode](#local-practice-mode) · [question bank & seed](#question-bank--seed)
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
| `rate_limited` | abuse limit (contact form, local API) | try later |
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
| `exam_attempts` | `id, user_id, exam, section (null = mixed), difficulty (null = mixed), question_count, time_limit_seconds, status ('in_progress'\|'submitted'\|'expired'\|'abandoned'), started_at, expires_at, submitted_at, correct_count, total, score_percent, duration_seconds, meta` | read own. No writes (RPCs only) |
| `exam_attempt_items` | `attempt_id, position, question_id, selected_index, is_correct (null until graded), time_spent_seconds, flagged, answered_at` | read own. No writes |
| `question_bank_counts` | per `(exam, section, topic, difficulty)`: `free_count, premium_count` | none (behind `get_question_bank_stats()`) |

Seeded source: `jazira-original` — "All rights reserved — original practice
items authored for Jazira". Questions are never deleted once used by an
attempt (FK); retire them with `is_active = false`.

### Exam RPCs

All are `SECURITY DEFINER`, validate every argument, and are callable by
`authenticated` only — except `get_question_bank_stats()` (also anon).

#### `start_exam_attempt(p_exam text, p_section text = null, p_difficulty smallint = null, p_count int = 10, p_time_limit_seconds int = null) → jsonb`

Picks questions at random (`random_key` range scan + wrap-around, index-backed
for every filter combination), avoiding questions seen in the caller's last 3
attempts while enough others remain. If fewer than `p_count` match, it uses
what exists (≥ 1); none → `not_enough_questions`. Overdue attempts of the user
are closed (graded as `expired`) first.

```json
{ "mode": "db", "attempt_id": "uuid", "status": "in_progress",
  "exam": "aptitude", "section": "quantitative", "difficulty": null,
  "question_count": 10, "requested_count": 10,
  "started_at": "…", "expires_at": "…", "time_limit_seconds": 600, "server_now": "…",
  "questions": [ { "position": 1, "id": "uuid", "stem": "…", "passage": null,
                   "choices": ["…","…","…","…"], "section": "quantitative",
                   "topic": "algebra", "difficulty": 2, "time_limit_seconds": 60 } ] }
```
Errors: `not_authenticated`, `invalid_argument` (`exam`, `section`, `difficulty`,
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
  "attempt": { "id": "uuid", "exam": "aptitude", "section": null, "difficulty": null,
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
duration_seconds, xp_awarded`. Closes overdue attempts first.

#### `get_exam_stats() → jsonb`

Graded (`submitted`/`expired`) attempts only.

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
  "weakest_topics": [ … ] }
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
| `startExam({ exam, section?, difficulty?, count = 10, timeLimitSeconds? })` | start payload (+ `limited`, `max_questions` in local mode) |
| `saveAnswer(attemptId, position, selectedIndex, { timeSpentSeconds?, flagged? })` | save payload |
| `submitExam(attemptId, answers?)` | result payload (idempotent) |
| `getAttempt(attemptId)` | resume or result payload |
| `listAttempts({ before?, beforeId?, limit = 20 })` | `{ mode, items, nextCursor }` (local: always empty) |
| `getExamStats()` | stats + `mode: "db"`, or `{ mode: "local" }` |
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

**`POST /api/exams/local/start`** body `{ exam, section?, difficulty?, count, time_limit_seconds? }`
(unknown keys rejected; `count` must be 5–100 and is then capped at 10 for guests,
25 for signed-in users → `limited: true`)
→ `200 { mode: "local", exam, section, difficulty, question_count, requested_count, limited, max_questions, time_limit_seconds, started_at, expires_at, questions: [{ position, id, key, stem, passage, choices, section, topic, difficulty, time_limit_seconds }] }` (no answers).
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

## Notifications

### Types and preferences

| type | written by | preference switch |
|---|---|---|
| `like`, `repost` | triggers (0008) | `likes` |
| `comment` | trigger (0008) | `comments` |
| `follow` | trigger (0008) | `follows` |
| `mention` | trigger (0009) | `mentions` |
| `message`, `message_request`, `request_accepted` | DM RPCs (0009) | `messages` |
| `exam_result` | `submit_exam_attempt` | `exam_results` |
| `achievement` | server code (definer / service role) | `exam_results` |
| `system` | service role | `product_updates` |

`notifications.data jsonb` carries type-specific payload — `exam_result`:
`{ attempt_id, exam, section, score_percent, correct, total, status }`. Only
trust `data` for the system types above. Clients can never insert
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
  (actor name/handle/avatar are `null` when the actor posts anonymously; snippet ≤ 120 chars + "…").
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

---

## Search

`search_all(p_q text, p_limit int = 5) → jsonb` — `SECURITY INVOKER` (every
table's RLS applies to the caller), anon + signed in, `p_limit` 1–20 per group.
The query is trimmed, whitespace-collapsed and capped at 100 characters; fewer
than 2 characters returns empty groups. `%`, `_` and `\` are literal
(LIKE-escaped). Case-insensitive substring match backed by pg_trgm GIN indexes
on `profiles.full_name`, `profiles.username`, `community_posts.content`,
`hashtags.tag`, `questions.stem`.

```json
{ "query": "جبر",
  "people":    [ { "id": "uuid", "username": "…", "full_name": "…", "avatar_url": null, "is_elite": false, "show_elite_badge": true } ],
  "posts":     [ { "id": "uuid", "snippet": "…window around the match…", "created_at": "…", "likes_count": 3, "comments_count": 1,
                   "author": { "id", "username", "full_name", "avatar_url", "is_elite", "show_elite_badge" } | null } ],
  "tags":      [ { "tag": "جبر", "post_count": 12 } ],
  "questions": [ { "id": "uuid", "section": "quantitative", "topic": "algebra", "snippet": "…" } ] }
```
People who post anonymously are not listed; anonymous posts have `author: null`.
A leading `#` is ignored for tags. Questions: active only, premium only for
premium users, and only `id/section/topic/snippet` (never choices or keys).

Client (`src/lib/data/search.js`):

| function | notes |
|---|---|
| `searchAll(q, { limit = 5, signal })` | cached (LRU 50 entries, 2 min); `{ query, people, posts, tags, questions, available }`; aborted → `DataError("aborted")`; not deployed → empty with `available: false` |
| `createSearcher({ delay = 250, limit = 5 })` | `{ search(q), cancel() }` — debounced; a newer call aborts the older one (its promise rejects with `aborted`) |
| `debounce(fn, ms)`, `normalizeQuery(q)`, `clearSearchCache()`, `createLruCache()` | helpers |

```js
const searcher = useMemo(() => createSearcher(), []);
useEffect(() => () => searcher.cancel(), [searcher]);
const onChange = (text) =>
  searcher.search(text).then(setResults).catch((e) => e.code !== "aborted" && setError(e.code));
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
| `questions` | select active non-premium | select active; premium if `has_premium` | no writes |
| `question_keys`, `question_bank_counts`, `ai_usage` | — | — | no privileges at all |
| `exam_attempts`, `exam_attempt_items` | — | select own | writes via RPCs only |
| `contact_messages` | insert | insert | write-only |
| `notification_preferences` | — | select/insert/update own | |
| RPCs: exams, notifications, `ai_quota` | — | execute | `SECURITY DEFINER`, check `auth.uid()` |
| `get_question_bank_stats`, `search_all` | execute | execute | counts only / RLS-bound |
| internal `_exam_*`, `_refresh_*`, `notification_allowed` | — | — | not callable by API roles |

---

## Known limits

- Local practice mode is stateless: non-premium answer keys can be obtained
  through `/api/exams/local/grade` by anyone who knows question keys (premium
  keys never). The per-IP limiter is per server instance only.
- The free daily limit counts attempts started (including ones never
  submitted). There is no RPC that sets `abandoned` yet.
- XP is +2 per correct answer, also for repeated questions (premium users can
  take unlimited attempts).
- `ai_quota()` is a check, not a reservation: two simultaneous requests at the
  last free message can both pass.
- `get_exam_stats()` aggregates on the fly (fine for thousands of attempts per
  user; add a rollup table if a user ever has far more).
- Questions removed from the JSON files are not deactivated by the seed;
  set `is_active = false` explicitly.
