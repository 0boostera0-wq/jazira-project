# Jazira database security model

Read this before you write a migration, a query in `src/`, or a route handler
that touches Supabase. The model below is implemented by
`supabase/migrations/0000–0009` and pinned down by `tests/db/security.test.js`
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
| `community_posts` | everyone | own: `user_id, content, media_url, media_type, media_path` | own: `content, media_*` | own |
| `post_comments` | everyone | own: `post_id, user_id, content` (not if blocked) | own: `content` | own |
| `post_likes` / `post_dislikes` / `post_reposts` | everyone | own (not if blocked) | — | own |
| `follows` | everyone | own (not if blocked, not self) | own: `notify_pref` | own |
| `reviews` | everyone | own: `user_id, rating, content`; **one per user** | own: `rating, content` | own |
| `hashtags` | everyone | — (trigger) | — | — |
| `post_hashtags` | everyone | post author: `post_id, hashtag_id` | — | post author |
| `mentions` | actor + mentioned user | — (trigger) | — | — |
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
| `get_public_social_settings(p_user)` | the only definer RPC `anon` may call: `show_likes_on_profile`, `show_reposts_on_profile`, `allow_messages` |

Definer **triggers** own the derived data: `sync_post_counts` (post counters),
`sync_hashtag_count`, `index_post_entities` (`#tags` → `hashtags` /
`post_hashtags`; `@handles` → `mentions` + `mention` notifications,
max 10 each, skipping self, blocked pairs and `notify_mentions = false`),
`notify_on_post_interaction`, `notify_on_follow`, `touch_conversation_last_message`,
`handle_new_user`, `referrals_validate`.

## 6. Other enforced rules

- **Messages.** Clients cannot set `created_at`, `read_at`, `delivered_at` or
  media. Deleting for everyone is one-way and allowed only within 30 minutes of
  `created_at` (`message_delete_window_expired`, `message_undelete_forbidden`).
  The content is wiped at that moment. A block, or the other side turning off
  `allow_messages`, stops new messages even in an existing conversation.
- **Blocks** (either direction) prevent comments, likes, dislikes, reposts,
  follows, new conversations, messages and mention notifications.
- **Media URLs.** `set_avatar()` and `community_posts.media_url` must be this
  project's public Storage URL for `<bucket>/<owner uid>/<file>`. If the
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
  user's own folder, then pass the `getPublicUrl()` result.
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
