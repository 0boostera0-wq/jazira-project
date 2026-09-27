# Jazira database security model

Read this before you write a migration, a query in `src/`, or a route handler
that touches Supabase. The model below is implemented by
`supabase/migrations/0000–0012` and pinned down by `tests/db/security.test.js`
and, for anonymous posting (0012), `tests/db/anonymity.test.js`
(run `npm run test:db`).

## 1. Principles

1. **The database is the security boundary.** The browser holds the public
   anon key and the user's JWT, so anything the client *can* send through
   PostgREST, someone *will* send. Client-side validation is UX only.
2. **Four layers, all required:**
   | Layer | Decides | Example |
   |---|---|---|
   | Table/column **GRANTs** | *which columns* a role may read or write at all | `profiles.phone` is not granted to `anon`/`authenticated` |
   | **RLS policies** | *which rows* | `auth.uid() = user_id` |
   | **Guard triggers / CHECKs** | *which values and transitions* | protected profile columns, 30-minute delete window, content length |
   | **SECURITY DEFINER RPCs** | multi-row / privileged operations, done atomically after checks | `start_conversation()`, `update_full_name()` |
3. **Deny by default.** A new table gets RLS on and explicit grants. A new
   column on `profiles` is *not* readable by clients (column-level SELECT) and
   *not* writable (guard trigger allow-list) until you opt in.
4. **Every writable column has exactly one legitimate writer.** It is the
   client (under RLS and column grants), a definer RPC, a definer trigger, or
   the service role. Counters, timestamps, ownership and entitlement are never
   client-writable.

## 2. Roles

| Role | Who | Notes |
|---|---|---|
| `anon` | signed-out browser (anon key, no JWT `sub`) | read-only on public data; executes almost no RPCs |
| `authenticated` | signed-in browser | RLS + column grants + guard triggers apply |
| `service_role` | **server route handlers only** (`SUPABASE_SERVICE_ROLE_KEY`) | `BYPASSRLS`; guard triggers let it through. Used by the payment webhook (`is_elite`, `subscriptions`, `payment_events`) and account deletion |
| `postgres` (owner) | migrations, SECURITY DEFINER functions | inside a definer function `current_user` is the owner |

The guard triggers identify the caller with `current_user in ('anon',
'authenticated')`. They are therefore **SECURITY INVOKER**. Never make a guard
trigger `security definer`, or it will see the owner and let everything
through.

## 3. What clients may do, per table

"—" means not allowed: either no privilege (the write fails with `42501`) or no
RLS policy (it affects 0 rows). "own" means RLS restricts the rows to
`auth.uid()`.

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | everyone: `id, username, full_name, avatar_url, bio, role, is_elite, show_elite_badge, anonymous_community, xp, created_at` | own: `id, username, full_name, show_elite_badge, anonymous_community` | own: **only** `show_elite_badge`, `anonymous_community` (guard trigger) | — |
| `community_posts` | everyone: public rows (`not is_anonymous`); own: all own rows. Others' anonymous rows only through `community_feed` / `search_all` (author masked) | own: `user_id, content, media_url, media_type, media_path, is_anonymous` | own: `content, media_*` (never `is_anonymous`) | own |
| `post_comments` | everyone: public rows; own: all own rows (others' anonymous rows via `community_comments`) | own: `post_id, user_id, content, is_anonymous` (not if blocked by the author of a *public* post) | own: `content` | own |
| `post_likes` / `post_dislikes` / `post_reposts` | everyone | own (not if blocked by the author of a *public* post) | — | own |
| `follows` | everyone | own (not if blocked, not self) | own: `notify_pref` | own |
| `reviews` | everyone | own: `user_id, rating, content`; **one per user** | own: `rating, content` | own |
| `hashtags` | everyone | — (trigger) | — | — |
| `post_hashtags` | everyone | post author: `post_id, hashtag_id` | — | post author |
| `mentions` | actor; mentioned user only when `not is_anonymous` | — (trigger) | — | — |
| `notifications` | own | — (triggers / RPCs) | own: `read` | own |
| `user_social_settings` | own | own | own | — |
| `conversations` | participants | — (`start_conversation`) | — (trigger keeps `last_message_at`) | — |
| `conversation_participants` | participants | — (`start_conversation`) | own row: `last_read_at, muted, hidden` | — |
| `message_requests` | requester + recipient | — (`start_conversation`) | — (`respond_message_request`) | — |
| `messages` | participants | `conversation_id, sender_id, content` if `can_send_message()` | sender: `deleted_for_all` only (false→true, ≤ 30 min) | — |
| `message_deletes` | own | own, for visible messages | — | — |
| `blocks` | own (blocker) | own | — | own |
| `reports` | — | own | — | — |
| `referrals` | referrer + referred | the invited account, validated (see §6) | — | — |
| `streaks` | own | — (`record_daily_activity`) | — | — |
| `subscriptions` | own | — (service role) | — | — |
| `payment_events` | — | — (service role) | — | — |
| `chat_history` | own | own (bounded, `tokens_used ≥ 0`) | — | own |
| `user_preferences` | own | own | own | — |
| `user_sessions` | own | own (bounded text) | own | own |
| `storage.objects` (`avatars`, `post-media`) | **owner's folder only**; public URLs need no RLS | own folder `<uid>/…` | own folder | own folder |
| `storage.objects` (`post-media/anon/<uuid>/<file>`) | the uploader (`owner`) only | any signed-in member, as `owner` of it | — (write-once) | the uploader |
| `questions` (0014) | active rows, **never `exam = 'school'` and never staging-imported rows** (`import_origin = 'staging'`: keys minted under the earlier id rule hashed the answer; current ids are answer-free, the exclusion stays as defence in depth), premium only for premium members; **column list only** (`content_hash`, `exclusion_group`, `provenance`, `validation_status`, `import_origin`, `revision`, source columns, `option_flags`, `stem_norm` are not granted) | — | — | — |
| `question_keys`, `question_stimuli`, `question_curriculum`, `question_revisions`, `scope_pool_members`, `question_item_stats`, `content_import_*` | — | — | — | — |
| `exam_attempts` (0014) | own rows, **every column except `seed`** (the seed keys the opaque item handles) | — | — | — |
| `exam_attempt_items` | own rows, **columns** `attempt_id, position, question_id, selected_index, is_correct, time_spent_seconds, flagged, answered_at, score, question_revision, locked_at, voided` (not `choice_order`, `display_map`, `response`). For template items `selected_index` is the **display** index (a canonical index would reveal `choice_order`) | — | — | — |
| `learner_question_stats`, `learner_node_stats` | own | — (`_exam_finalize`) | — | — |
| `content_sources`, `curriculum_nodes` (not `source_only`), `subject_terms`, `curriculum_resources`, `lesson_resource_ranges`, `learning_objectives` (validated), `exam_templates` (active), `scope_pool_counts` | everyone | — (importer) | — | — |
| `ce_guest_check_locks` (0014) | — (RLS on, no policies, all revoked) | — (`ce_guest_check_lock`, service role) | — | — |

No API role has `TRUNCATE`, `TRIGGER` or `REFERENCES` on the tables above.
`TRUNCATE` bypasses RLS.

## 4. `profiles` in detail

- **Reading.** `select("*")` on `profiles` **fails** with `42501` because
  `phone`, `full_name_changed_at`, `avatar_changed_at`, `phone_changed_at` and
  `updated_at` are not granted. Use the column lists in `src/lib/profile.js`
  (`PUBLIC_PROFILE_COLUMNS`, `OWN_PROFILE_COLUMNS`, `BASIC_PROFILE_COLUMNS`),
  and never embed `profiles(*)`. The owner reads private columns with
  `rpc("get_my_private_profile")`.
- **Writing.** The trigger `profiles_guard_protected_columns` rejects any
  *change* to a column outside its allow-list (`show_elite_badge`,
  `anonymous_community`) when the caller is `anon`/`authenticated`. It raises
  `42501 profiles.<col> is not client-writable`. Unchanged values pass, so
  PostgREST upserts that re-send the key still work. Each protected column has
  one writer:

  | Column | Writer |
  |---|---|
  | `full_name` | `update_full_name(text)`: two words of letters, 14-day / 24-hour (Elite) cooldown |
  | `avatar_url` | `set_avatar(text)`: this project's `avatars/<uid>/…` URL only, 10-day cooldown; `set_avatar(null)` clears it |
  | `phone` | `update_phone(text)`: 24-hour cooldown |
  | `bio` | `update_bio(text)`: at most 300 characters |
  | `is_elite` | payment webhook (service role) |
  | `xp`, `role`, `username`, `*_changed_at` | definer RPCs / service role / SQL only |

- **Adding a profile column.** It is private and read-only for clients by
  default. To expose it, `grant select (col) on public.profiles to anon,
  authenticated`. To let clients write it directly, add it to
  `v_client_writable` in `profiles_guard_protected_columns()` (via `create or
  replace` in your migration). Prefer an RPC when the value needs validation or
  a cooldown.
- **Public names** must pass `is_valid_public_name()`: exactly two words of
  Latin or Arabic letters (harakat allowed), at most 60 characters. The Arabic
  block's digits (`٠-٩`, `۰-۹`), punctuation and tatweel are rejected. The
  profile CHECK, `update_full_name()` and `handle_new_user()` share it.

## 5. SECURITY DEFINER functions

Rules for every definer function:

- `set search_path = ''` and schema-qualify everything (`public.x`,
  `auth.uid()`).
- Start with `if auth.uid() is null then raise exception 'not_authenticated'`.
  Derive the actor from `auth.uid()` and **never** from a parameter.
- Check authorization explicitly (participant? owner? recipient?). RLS does not
  apply inside the function.
- After creating it: `revoke all on function … from public, anon;` then
  `grant execute … to authenticated, service_role;`. Supabase's default
  privileges otherwise make every new function executable by `anon`.
  Trigger functions get `revoke all … from public, anon, authenticated`.
  Firing a trigger needs no EXECUTE.
- Helpers used inside RLS policies must be callable by the querying role and
  are therefore API-callable. Make them **caller-scoped**:
  `has_block_with(other)` only answers "is there a block between *me* and
  them?", never between two arbitrary users.
- Errors are `P0001` with a stable code as the message, e.g.
  `name_cooldown`, `invalid_avatar_url`, `blocked`. The client matches on it.

| RPC | Purpose / checks |
|---|---|
| `get_my_private_profile()` | caller's `phone` and `*_changed_at` |
| `update_full_name`, `set_avatar`, `update_phone`, `update_bio`, `record_daily_activity` | the only writers of those profile/streak fields |
| `start_conversation(p_other) → uuid` | not self; no block either way; reuses the existing 1:1 conversation. For a new one: recipient's `allow_messages` must be on. If the recipient follows the caller the conversation is direct; otherwise it is a request, which needs `allow_message_requests`. Creates the conversation, both participants, the request and the notification atomically. Errors: `invalid_recipient`, `blocked`, `messages_disabled`, `requests_disabled`, `request_rejected` |
| `respond_message_request(p_request, p_accept)` | recipient only; pending→accepted/rejected, rejected→accepted; accepting flips `is_request` and notifies the requester |
| `mark_conversation_read(p_conversation)` | participant only; sets `read_at` on the other side's messages (not while still a request) and the caller's `last_read_at` |
| `can_send_message(p_conversation)` | used by the `messages` INSERT policy: participant, no block, recipient allows messages, only the requester writes while a request is pending |
| `get_public_social_settings(p_user)` | anon-callable: `show_likes_on_profile`, `show_reposts_on_profile`, `allow_messages` |
| `community_feed(…)`, `community_comments(…)`, `community_new_posts_count(…)` (0012) | anon-callable **readers** of posts / comments. They are definer because they must return other members' anonymous rows, which RLS hides; they return author columns only when the row is public or the caller's own, never `user_id` otherwise, and apply blocks / `show_*_on_profile` themselves |
| `search_all(…)` (0012: now definer) | same masking for posts; people = public columns of members not in anonymous mode; questions re-implement the `questions` RLS rule (`is_active and (not is_premium or has_premium(auth.uid()))`); 0014 patches both question queries to exclude `exam = 'school'` (school items are found lesson-level only, through `search_content`) |
| `post_public_author(p_post)` (0012) | helper for the reaction / comment INSERT policies: the author of a **public** post, `null` for an anonymous one. It only returns what the table already shows |
| `start_template_attempt`, `save_exam_response`, `check_exam_item`, `abandon_exam_attempt`, `list_exam_attempts_v2`, `get_learning_stats`, `get_practice_recommendations`, `search_content` (0014) | authenticated (+ service role). Owner lock (`for update`) on the attempt; `retake_of` must be one of the caller's attempts (`not_found`); the seed is always generated server side (`seed_not_allowed`); premium items only for `has_premium`; responses arrive as display indexes and are mapped to canonical ids server side; `score` / `is_correct` are written only by `check_exam_item` (one locked item) and `_exam_finalize`; a locked item cannot be changed (`item_locked`) and `submit` ignores new answers for it; answers after `expires_at + 30 s` are ignored |
| `submit_exam_attempt`, `get_exam_attempt`, `start_exam_attempt`, `_exam_finalize` (0014) | same signatures; template attempts dispatch to `_ce_submit` / `_ce_get` / `_ce_finalize` (revision guard: an item whose question changed is voided and rendered from `question_revisions`); legacy attempts keep the 0010–0013 code path. The free daily limit of `start_exam_attempt` counts exam-quota attempts only |
| `get_scope_availability` (0014) | anon + authenticated: counts only |
| `ce_import_begin/_batch/_retire/_finish`, `ce_refresh_aggregates`, `ce_guest_start`, `ce_guest_items`, `ce_guest_check_lock` (0014) | **service role only** (import pipeline, guest routes; `ce_guest_check_lock` records the first checked response per guest session position → `first` / `repeat` / `locked`). `ce_import_retire` refuses `--only` runs, runs with errors and filtered publish sets; `ce_guest_*` never return premium items and return only the picked rows |

Definer **triggers** own the derived data: `sync_post_counts` (post counters),
`sync_hashtag_count`, `index_post_entities` (`#tags` → `hashtags` /
`post_hashtags`; `@handles` → `mentions` + `mention` notifications,
max 10 each, skipping self, blocked pairs and `notify_mentions = false`;
anonymous content → anonymous mention, actor-less notification),
`notify_on_post_interaction` (no notification between a blocked pair; an
anonymous comment → actor-less notification), `notify_on_follow`,
`touch_conversation_last_message`, `handle_new_user`, `referrals_validate`.

Invoker triggers that are **not** `current_user` guards (they apply to every
role): `community_content_anonymity` (fills `is_anonymous` at insert, refuses
any later change with `anonymity_immutable`) and
`community_posts_validate_media`.

## 6. Other enforced rules

- **Messages.** Clients cannot set `created_at`, `read_at`, `delivered_at` or
  media. Deleting for everyone is one-way and allowed only within 30 minutes of
  `created_at` (`message_delete_window_expired`, `message_undelete_forbidden`).
  The content is wiped at that moment. A block, or the other side turning off
  `allow_messages`, stops new messages even in an existing conversation.
- **Blocks** (either direction) prevent comments, likes, dislikes, reposts,
  follows, new conversations, messages and mention notifications — on
  **public** posts. On an anonymous post the database does not refuse a blocked
  member (a refusal would tell them who wrote it); instead no notification is
  created between the pair, and the blocker's own feed / thread / search never
  shows public content of members they blocked.
- **Anonymous posting (0012).** `is_anonymous` is a per-post / per-comment
  snapshot: the client's explicit value or the author's
  `profiles.anonymous_community` at insert, immutable afterwards for every role.
  The author of anonymous content never leaves the database for another member
  or a guest:
  - RLS hides other members' anonymous rows (and therefore their `user_id`)
    from `community_posts` / `post_comments`, embeds and head counts;
  - the reader RPCs (`community_feed`, `community_comments`, `search_all`) mask
    the author columns; `following` and other members' `author` lists never
    contain anonymous posts;
  - `community_posts` / `post_comments` are **not** in `supabase_realtime` (their
    rows carry `user_id`);
  - notifications and mentions from anonymous content store no actor
    (`notifications.actor_id = null`, `data.anonymous = true`;
    `mentions.is_anonymous` rows are readable by their author only);
  - media: see below.
  The author still reads their own rows (`is_mine`) and receives the
  notifications about them (the recipient of a like on an anonymous post is its
  author; nobody else sees that row).
- **Media URLs.** `set_avatar()` and `community_posts.media_url` must be this
  project's public Storage URL for `<bucket>/<owner uid>/<file>` — except
  anonymous posts, which must use `post-media/anon/<uuid>/<file>`, an object the
  post's author uploaded (`storage.objects.owner`), and may not use their
  `<uid>/` folder (the path would name them). Public posts may not use `anon/`.
  `storage.objects` must never become readable by others: for `anon/` objects
  `owner` *is* the author. If the
  setting is present, the origin must equal it exactly:
  ```sql
  alter database postgres set app.storage_origin = 'https://<project-ref>.supabase.co';
  ```
  **Set this in production.** It is also required if you serve Supabase from a
  custom domain. Without it, any `https://*.supabase.co` or local
  `http://localhost|127.0.0.1` origin is accepted.
- **Storage buckets.** `avatars` allows 2 MB and `image/jpeg|png|webp|gif|avif`.
  `post-media` allows 50 MB, the same image types, and
  `video/mp4|webm|quicktime`. There is deliberately no `image/svg+xml`: an SVG
  is a scriptable document on the storage origin. Objects can be listed only by
  their owner; public URLs keep working because the buckets are public.
- **Referrals.** Only the invited account inserts its own row. The referrer
  must be an existing profile other than itself. The invited account must be
  confirmed, not anonymous, and at most 7 days old. There is one referral per
  invited account (`unique(referred_id)`).
- **Length and shape.** Posts: at most 2000 characters, and non-empty unless
  there is media; `media_url` and `media_type` must be set together.
  Comments: 1–1000 characters. Reviews: rating 1–5, content at most 1000
  characters. Messages: at most 4000 characters, non-empty. Bio: at most 300.
  Chat history: content at most 20000, session id at most 200, `tokens_used ≥ 0`.
  Report reason: at most 1000. `user_sessions` text columns are bounded.
  Hashtags: `^[0-9a-z_؀-ۿ]{2,50}$`.

### Content engine (0014)

- **The answer never reaches a client before it may.** Keys live in
  `question_keys` (no privilege); `content_hash` includes the answer and is not
  granted on `questions`; a test brute-forces every candidate answer against
  every anon-readable column and must find nothing. Session payloads carry
  display indexes only (no option / left / right / item ids), and the mapping
  (`choice_order`, `display_map`) and canonical `response` columns are not
  granted to the owner either.
- **No client sees a canonical question key before the result.** Keys
  `q-<grade>-<subject>-<hex10>` are now minted from answer-free material only
  (`sha256(anchor | type | normalize(stem) | questionIdMaterial)`: sorted
  option / column / item texts, the unit, never the key; `questionIdHash`
  refuses an `answer` argument; CONTENT_ENGINE §2.2). Keys minted by earlier
  runs hashed the answer, so the rules stay as defence in depth: DB session
  payloads carry `key` = an opaque per-attempt handle
  (`_ce_item_handle(seed, key)`, `h-` + 20 hex), the owner cannot read
  `exam_attempts.seed`, and staging-imported rows are not readable through
  PostgREST.
- **Guest sessions follow the same rule** (`src/lib/exams/engine/session-token.js`):
  - the token seals the question list, revisions and seed with AES-256-GCM
    (HKDF key `jz.exam.v2.enc`, AAD = version + sid); only the header is
    readable, and it is HMAC-signed (`jz.exam.v2`);
  - items are named by per-session opaque handles
    `h-` + 16 base64url of `HMAC(k_handle, sid | key)`;
  - the seen list is a sealed `s1.` blob (AES-256-GCM, `jz.exam.seen`) that
    the server issues and opens; a blob that does not open is ignored;
  - all keys are HKDF-derived from `LOCAL_EXAM_SECRET` (or the documented
    fallback); `LOCAL_EXAM_SECRET_PREVIOUS` verifies and decrypts only.
- **One check per guest position.** `ce_guest_check_locks` (sid, position,
  resp_hash, expires_at; RLS on with no policies, all privileges revoked from
  anon/authenticated) is written only by `ce_guest_check_lock(…)` (definer,
  `search_path = ''`, service role only). The first checked response is
  locked; a different one gets `409 item_locked` with no verdict, the same one
  again gets the same verdict (retry). Rows expire at the session's deadline +
  grace (≤ 8 days) and are cleaned up opportunistically. Without a service
  role the route falls back to a per-instance memory map (warning logged).
- **Guest oracles are budgeted per IP per day:** revealed keys in
  `exams.keys` (`EXAM_KEY_REVEAL_DAILY`, default 400) and graded submitted
  answers (verdicts) in `exams.grades` (`EXAM_GRADE_DAILY`, default twice the
  key cap), both on `rate_limit_hit` (0013). Past the grading cap the routes
  answer `429 rate_limited` and grade nothing.
- **Display order never depends on the answer** (the ordering swap rule was
  removed, CONTENT_ENGINE §5.4).
- **The curriculum bank is served only by RPCs** (`questions_read` excludes
  `exam = 'school'` and staging rows; `search_all` excludes `exam = 'school'`).
- **The legacy builder only serves what it can grade:** `_exam_pick` and
  `question_bank_counts` take `mcq` / `true_false` items only (choices +
  `correct_index`); a legacy row is updated by the importer only when the
  staging key names the seeded `correct_index` (`legacy_mismatch` otherwise).
- **Locked items are final** and `score` stays null until lock or finalize, so
  checking and then changing an answer never gains score.
- **Import is service-role only**, each row is an isolated upsert, and
  retirement never deletes (`is_active = false, status = 'retired'`).
- `_ce_u` and `_ce_stratum` are the only functions without `set search_path`:
  small `immutable` SQL helpers (not definer, not API-callable) left inlinable
  on purpose (the selection draws `_ce_u` thousands of times); their bodies
  are `pg_catalog`-qualified.

## 7. What client code must never do

- `select("*")` or `profiles(*)` on `profiles`. Also never select `phone` or
  `*_changed_at` from the table; use the RPC.
- Write `profiles` columns other than `show_elite_badge` /
  `anonymous_community`. Never add a "direct UPDATE fallback" for when an RPC
  fails or is missing. Show an honest error instead (CONVENTIONS §5).
- Insert into `notifications`, `conversations`, `conversation_participants`,
  `message_requests`, `hashtags`, `mentions`, `subscriptions`,
  `payment_events` or `streaks`.
- Send counters (`*_count`), `created_at`, `read_at`, `delivered_at`,
  `is_elite`, `xp` or `role` in any payload.
- Store a URL the user typed as `avatar_url` / `media_url`. Upload to the
  user's own folder (anonymous posts: `anon/<crypto.randomUUID()>/…`), then pass
  the `getPublicUrl()` result.
- Render other members' posts or comments from table reads plus a profile
  lookup by `user_id` (anonymous rows are missing and must stay unlinkable):
  use `community_feed` / `community_comments`. Never derive anonymity from
  `profiles.anonymous_community` for existing content — use `is_anonymous`.
- Subscribe to realtime changes of `community_posts` / `post_comments` (they are
  no longer published; poll `community_new_posts_count()`).
- Import `SUPABASE_SERVICE_ROLE_KEY` anywhere reachable from the browser, or
  use the service role to do something on behalf of a user without
  re-checking that user's rights in the handler.

## 8. Checklist for a new migration

1. `alter table … enable row level security`, and write a policy per command,
   scoped `to authenticated` (or `anon`) explicitly.
2. Decide the grants: `revoke insert, update on t from anon, authenticated`,
   then `grant insert (cols…)` / `grant update (cols…)` for exactly the
   client-writable columns. Remember that `revoke` on a table also drops its
   column grants, so re-grant after it.
3. Give every UPDATE policy both `using` and `with check`.
4. Keep counters, timestamps and ownership in triggers or definer functions.
5. Follow §5 for every definer function, including the explicit
   `revoke … from public, anon`.
6. Bound every free-text column with a CHECK. Add constraints to a table that
   may already hold data only when the data complies. A `NOT VALID` CHECK is
   still evaluated on every later UPDATE of old rows, including counter and
   webhook updates.
7. Stay idempotent: `if not exists`, `drop policy if exists`,
   `create or replace`.
8. In `tests/db/`, add the **attack** (other user, anon, forged column) next to
   the legitimate flow.

## 9. Known limits and follow-ups

- **Content engine (0014):** the guest check lock is server-side
  (`ce_guest_check_locks`), but its in-memory fallback (no service role, or
  before 0014) is per instance, so a guest routed to another instance could
  check a position twice there. Key-reveal and grading caps are per IP and
  weaker against many addresses. `search_content` for guests must go through
  the rate-limited route. Resolved in Security round 3: guest tokens seal the
  question list and seed, browsers see only opaque `h-` handles, the seen
  list is sealed, and question ids are answer-free.

- The test harness runs on PGlite with a Supabase shim, not a real project.
  It does not exercise GoTrue or the Storage API's size/MIME enforcement; only
  the bucket columns are asserted. Verify on a staging project before
  production.
- `app.storage_origin` is not set by the migration because it does not know
  the project URL. Until you set it, another Supabase project's URL passes the
  host check.
- Referral farming with several *confirmed* throwaway addresses is still
  possible. Rate-limiting or qualifying referrals (e.g. after first activity)
  needs server-side logic.
- `/api/chat` inserts assistant replies with the *user's* JWT, so a user can
  also insert `message_type = 'assistant'` rows into their own history. This
  affects only their own data. Moving those inserts to the service role would
  close it.
- On a database with legacy data that violates a new CHECK or the
  one-review-per-user index, 0009 skips that constraint with a `WARNING` in
  the migration output. Clean the data and re-run 0009.
- **Anonymity, residual channels (0012):**
  - anonymous posts created before 0012 whose media live in `post-media/<uid>/…`
    still expose the author's id in the media URL (move them with the Storage
    API, see DATA_API.md → Known limits);
  - EXIF / faces / voices inside media are the author's responsibility (the
    composer warns);
  - the backfill used each author's setting at migration time, which is what
    readers saw until then — posts made anonymously and later exposed by the old
    behaviour cannot be un-seen;
  - writing style, timing and content can always identify someone; the
    database only guarantees that it never *discloses* the author;
  - a blocked member can like / comment on the blocker's anonymous posts (by
    design, see §6); the blocker is not notified and does not see their public
    comments.
- If `supabase_realtime` was ever recreated `FOR ALL TABLES`, 0012 cannot remove
  the community tables from it and says so with a `WARNING`; recreate the
  publication with an explicit table list.
- **Device sessions are not a security control yet.** "End this session"
  (settings) only sets `user_sessions.revoked_at`; the targeted browser signs
  itself out only if its `SessionTracker` runs and cooperates, its refresh token
  and JWT stay valid, and `user_sessions` is client-updatable (a hijacker can
  clear `revoked_at`). The real control today is "sign out everywhere"
  (global `signOut`). Follow-up: record the JWT `session_id` (auth.sessions.id)
  server-side when a device registers, revoke through a definer RPC/route that
  deletes that `auth.sessions` row for `auth.uid()`, and make `revoked_at`
  writable only by that function.
- **Framework:** next@14.2.x has unpatched advisories fixed only in 15.5.x/16.x
  (Image Optimization AVIF RCE GHSA-2xp9-vwfh-vxw4, Windows-host RCE
  GHSA-p293-qw3h-jr36, several DoS/SSRF). Mitigated for now by turning the image
  optimizer off (`images.unoptimized`, nothing uses `next/image`) and binding
  `npm run dev` to 127.0.0.1; the upgrade to next ≥ 15.5.24 is still required.
