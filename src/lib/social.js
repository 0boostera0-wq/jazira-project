// ============================================================================
// Social layer — client data access (community feed, posts, comments,
// reactions, follows, moderation, discovery, social settings, DMs).
//
// Conventions (docs/DATA_API.md):
//   • Supabase comes from getSupabase() and may be null (not configured).
//   • List functions never throw for "not deployed / not configured": they
//     return { items: [], available: false }. Mutations throw a DataError
//     (err.name === "DataError", err.code) — see CODES below.
//   • Never select("*") on profiles; author columns come from lib/profile.js.
//   • Posts and comments are READ only through the definer RPCs
//     community_feed() / community_comments() (migration 0012). They mask the
//     author of anonymous content server-side, so the browser never receives
//     who wrote an anonymous post or comment (not even in the network tab).
//     Never render other members' content from table reads plus a profile
//     lookup by user_id — see docs/SECURITY.md §7.
//   • community_posts / post_comments are not in supabase_realtime: the feed
//     polls countNewPosts() / refreshPosts() instead of subscribing.
//
// Pure logic (tokenizer, reducers, cursors, media paths, RPC rows → UI
// objects) lives in src/components/community/model.js and is unit-tested.
// ============================================================================
import { getSupabase } from "@/lib/supabase-lazy";
import { BASIC_PROFILE_COLUMNS } from "@/lib/profile";
import { IMAGE_PRESETS, downscaleImage } from "@/lib/image-resize";
import {
  POST_MAX, COMMENT_MAX, REPORT_MAX, REPORT_REASONS, buildMediaPath, cursorOf, feedCursorOf, isUuid, keysetFilter,
  mediaKindOf, normalizeComment, normalizePost, normalizeTag, publicIdentity,
} from "@/components/community/model";

export { parseEntities, REPORT_REASONS } from "@/components/community/model";

const BUCKET = "post-media";
const AUTHOR_COLUMNS = `${BASIC_PROFILE_COLUMNS}, show_elite_badge, anonymous_community`;
const SUGGEST_COLUMNS = `${AUTHOR_COLUMNS}, xp`;
// The author's own freshly inserted row (own rows are readable under RLS).
const OWN_POST_COLUMNS =
  "id, content, media_url, media_type, media_path, likes_count, dislikes_count, comments_count, reposts_count, created_at, is_anonymous";
const OWN_COMMENT_COLUMNS = "id, post_id, content, created_at, is_anonymous";
const FEED_SCOPES = new Set(["all", "following", "tag", "author", "liked", "reposted"]);

// ── errors ──────────────────────────────────────────────────────────────────
// not_authenticated · invalid_argument · forbidden (RLS/privilege, incl. blocks)
// · unavailable · network · upload_failed · invalid_media · empty_post · unknown
const MISSING = new Set(["PGRST202", "PGRST204", "PGRST205", "42P01", "42883", "42703"]);

function dataError(code, details = null, cause = undefined) {
  const e = new Error(code);
  e.name = "DataError";
  e.code = code;
  e.details = details;
  if (cause !== undefined) e.cause = cause;
  return e;
}
export const isDataError = (e) => e?.name === "DataError";
const isMissing = (err) => Boolean(err) && (MISSING.has(err.code) || /could not find|schema cache/i.test(err.message || ""));

function toError(err) {
  if (isDataError(err)) return err;
  if (!err) return dataError("unknown");
  const msg = `${err.message || ""} ${err.details || ""}`;
  if (isMissing(err)) return dataError("unavailable", null, err);
  if (err.message === "not_authenticated" || err.code === "PGRST301" || /jwt/i.test(err.message || "")) return dataError("not_authenticated", null, err);
  if (err.code === "42501") return dataError("forbidden", null, err);
  if (/invalid_media_url/.test(msg)) return dataError("invalid_media", null, err);
  if (err.message === "invalid_argument" || err.code === "23514" || err.code === "22001" || err.code === "22P02" || err.code === "22007") {
    return dataError("invalid_argument", null, err);
  }
  if (err.name === "AbortError" || /abort/i.test(err.message || "")) return dataError("aborted", null, err);
  if (!err.code && /fetch|network|load failed/i.test(msg)) return dataError("network", null, err);
  return dataError("unknown", null, err);
}

async function context() {
  let supabase = null;
  try {
    supabase = await getSupabase();
  } catch {
    supabase = null;
  }
  if (!supabase) return { supabase: null, userId: null };
  try {
    const { data } = await supabase.auth.getSession();
    return { supabase, userId: data?.session?.user?.id || null };
  } catch {
    return { supabase, userId: null };
  }
}

async function requireUser() {
  const c = await context();
  if (!c.supabase) throw dataError("unavailable");
  if (!c.userId) throw dataError("not_authenticated");
  return c;
}

// ── per-session caches (viewer-scoped) ──────────────────────────────────────
const cache = { viewer: undefined, blocked: null, following: null, tags: null };

function scoped(userId) {
  if (cache.viewer !== userId) {
    cache.viewer = userId;
    cache.blocked = null;
    cache.following = null;
  }
}

/** Ids the viewer has blocked (RLS: own rows only). Empty set when signed out. */
export async function getBlockedIds() {
  const { supabase, userId } = await context();
  if (!supabase || !userId) return new Set();
  scoped(userId);
  if (!cache.blocked) {
    cache.blocked = supabase
      .from("blocks")
      .select("blocked_id")
      .eq("blocker_id", userId)
      .limit(1000)
      .then(({ data, error }) => new Set(error ? [] : (data || []).map((r) => r.blocked_id)))
      .catch(() => new Set());
  }
  return cache.blocked;
}

/** Ids the viewer follows → Map(id → notify_pref). */
export async function getFollowing() {
  const { supabase, userId } = await context();
  if (!supabase || !userId) return new Map();
  scoped(userId);
  if (!cache.following) {
    cache.following = supabase
      .from("follows")
      .select("followee_id, notify_pref")
      .eq("follower_id", userId)
      .limit(1000)
      .then(({ data, error }) => new Map(error ? [] : (data || []).map((r) => [r.followee_id, r.notify_pref || "all"])))
      .catch(() => new Map());
  }
  return cache.following;
}

async function patchFollowing(id, pref) {
  if (!cache.following) return;
  const map = await cache.following;
  if (pref) map.set(id, pref);
  else map.delete(id);
}

// ── profiles (follow lists, suggestions, the viewer's own identity) ──────────
// Every read carries `anonymous_community`: a member identity is never
// rendered without knowing whether its owner is in anonymous mode. If even
// the minimal column set fails, members come back unknown (no link).
const AUTHOR_FALLBACK_COLUMNS = `${BASIC_PROFILE_COLUMNS}, anonymous_community`;

async function fetchProfiles(supabase, ids) {
  const list = [...new Set((ids || []).filter(Boolean))];
  if (!list.length) return new Map();
  try {
    let res = await supabase.from("profiles").select(AUTHOR_COLUMNS).in("id", list);
    if (res.error) res = await supabase.from("profiles").select(AUTHOR_FALLBACK_COLUMNS).in("id", list);
    if (res.error) return new Map();
    return new Map((res.data || []).map((p) => [p.id, p]));
  } catch {
    return new Map();
  }
}

/** The viewer's own author columns, shaped like a reader-RPC row. */
async function ownAuthorFields(supabase, userId) {
  const profile = (await fetchProfiles(supabase, [userId])).get(userId) || null;
  if (!profile) return { author_id: userId };
  return {
    author_id: profile.id,
    author_username: profile.username ?? null,
    author_full_name: profile.full_name ?? null,
    author_avatar_url: profile.avatar_url ?? null,
    author_is_elite: Boolean(profile.is_elite),
    author_show_elite_badge: profile.show_elite_badge !== false,
  };
}

/** Is the viewer currently in anonymous mode? (own profile row). */
async function ownAnonymousMode(supabase, userId) {
  const { data, error } = await supabase.from("profiles").select("anonymous_community").eq("id", userId).maybeSingle();
  if (error) throw toError(error);
  return Boolean(data?.anonymous_community);
}

// ── reader RPCs ─────────────────────────────────────────────────────────────
const withSignal = (q, signal) => (signal && typeof q?.abortSignal === "function" ? q.abortSignal(signal) : q);

/** community_feed(…) → raw rows. Throws the PostgREST error. */
async function feedRows(supabase, args, signal) {
  const { data, error } = await withSignal(supabase.rpc("community_feed", args), signal);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

const idsOf = (ids) => [...new Set((ids || []).filter(isUuid))].slice(0, 100);

// Reader-RPC rows → UI objects (normalizePost / normalizeComment read the
// masked author_* / is_mine / viewer_* columns of 0012 rows).
const postFromRow = (row) => normalizePost(row, null);
const commentFromRow = (row) => normalizeComment(row);
const mediaFromRow = (m) => normalizePost({ id: null, ...m }, null).media;

const ISO_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)?$/;
/**
 * RPC keyset arguments from a cursor. A malformed or tampered cursor means
 * "first page" (never an error, never unchecked input in a query).
 */
function cursorParams(cursor) {
  const before = typeof cursor?.before === "string" && ISO_RE.test(cursor.before) ? cursor.before : null;
  return { p_before: before, p_before_id: before && isUuid(cursor.beforeId) ? cursor.beforeId : null };
}

// ── feed ────────────────────────────────────────────────────────────────────
export const FEED_PAGE_SIZE = 12;

/**
 * One page of posts, newest first (keyset), through community_feed().
 * @param {object} o
 * @param {"all"|"following"|"tag"|"author"|"liked"|"reposted"} [o.scope]
 * @param {string} [o.tag]       scope "tag"
 * @param {string} [o.userId]    scope "author" | "liked" | "reposted"
 * @param {{before:string, beforeId:string}|null} [o.cursor]  the previous nextCursor
 * @returns {Promise<{ items, nextCursor, available, reason? }>}
 *   reason: "not_configured" | "not_deployed" | "no_following" | "signed_out" | "no_tag"
 *   Each item has `anonymous` (posted anonymously) and `mine`; an anonymous
 *   post's `author` is { anonymous: true } for every reader, its author included.
 */
export async function listPosts({ scope = "all", tag = null, userId: target = null, cursor = null, limit = FEED_PAGE_SIZE, signal } = {}) {
  const { supabase, userId } = await context();
  if (!supabase) return { items: [], nextCursor: null, available: false, reason: "not_configured" };
  const size = Math.min(Math.max(1, Number(limit) || FEED_PAGE_SIZE), 50);
  const kind = FEED_SCOPES.has(scope) ? scope : "all";
  const empty = (reason) => ({ items: [], nextCursor: null, available: true, ...(reason ? { reason } : {}) });

  const args = { p_scope: kind, p_limit: size, ...cursorParams(cursor) };
  if (kind === "following") {
    if (!userId) return empty("signed_out");
    const following = await getFollowing();
    if (!following.size) return empty("no_following");
  } else if (kind === "author" || kind === "liked" || kind === "reposted") {
    if (!isUuid(target)) return empty();
    args.p_user = target;
  } else if (kind === "tag") {
    const norm = normalizeTag(tag);
    if (!norm) return empty("no_tag");
    args.p_tag = norm;
  }

  try {
    const rows = await feedRows(supabase, args, signal);
    return { items: rows.map(postFromRow), nextCursor: feedCursorOf(rows, size), available: true };
  } catch (err) {
    if (isMissing(err)) return { items: [], nextCursor: null, available: false, reason: "not_deployed" };
    throw toError(err);
  }
}

async function fetchPost(supabase, id) {
  const [row] = await feedRows(supabase, { p_scope: "ids", p_ids: [id], p_limit: 1 });
  return row ? postFromRow(row) : null;
}

/** A single post (permalink page). → { post | null, available } */
export async function getPost(id) {
  const { supabase } = await context();
  if (!supabase) return { post: null, available: false };
  if (!isUuid(id)) return { post: null, available: true };
  try {
    return { post: await fetchPost(supabase, id), available: true };
  } catch (err) {
    if (isMissing(err)) return { post: null, available: false };
    throw toError(err);
  }
}

/**
 * Posts for rows or ids (e.g. a freshly inserted post), ready to render, in
 * the feed's order. Posts that disappeared (deleted, or by a member you
 * blocked) are absent.
 */
export async function hydratePostRows(rowsOrIds) {
  const { supabase } = await context();
  const ids = idsOf((rowsOrIds || []).map((r) => (typeof r === "string" ? r : r?.id)));
  if (!supabase || !ids.length) return [];
  try {
    return (await feedRows(supabase, { p_scope: "ids", p_ids: ids, p_limit: 1 })).map(postFromRow);
  } catch (err) {
    if (isMissing(err)) return [];
    throw toError(err);
  }
}

/**
 * Fresh counts and text of up to 100 posts already on screen (the feed's
 * poll) → raw community_feed rows ({ id, content, likes_count, … }) for the
 * feed reducer's "row" action; [] when unavailable or offline.
 */
export async function refreshPosts(ids) {
  const { supabase } = await context();
  const list = idsOf(ids);
  if (!supabase || !list.length) return [];
  try {
    return await feedRows(supabase, { p_scope: "ids", p_ids: list, p_limit: 1 });
  } catch {
    return [];
  }
}

/**
 * How many posts newer than the feed's first row ({ since: its created_at,
 * sinceId: its id }) the viewer would see in "all", their own excluded
 * (capped at 100). Server-side comparison: the device clock never matters.
 * → number, or null when it can't tell (not deployed, offline).
 */
export async function countNewPosts({ since, sinceId = null } = {}) {
  const { p_before, p_before_id } = cursorParams({ before: since, beforeId: sinceId });
  if (!p_before) return null;
  const { supabase } = await context();
  if (!supabase) return null;
  try {
    const args = { p_since: p_before };
    if (p_before_id) args.p_since_id = p_before_id;
    const { data, error } = await supabase.rpc("community_new_posts_count", args);
    if (error) return null;
    const n = Number(data);
    return Number.isFinite(n) && n >= 0 ? Math.min(n, 100) : null;
  } catch {
    return null;
  }
}

/**
 * @deprecated Realtime is gone for posts (0012: community_posts is not in
 * supabase_realtime — its rows carry user_id, which would name the author of
 * anonymous posts). Feeds poll countNewPosts() / refreshPosts() while the tab
 * is visible. Kept as a no-op so older callers keep working.
 */
export async function subscribeToPosts() {
  return () => {};
}


// ── reactions ───────────────────────────────────────────────────────────────
/** Apply the writes from applyReaction(): deletes first, then inserts. Throws DataError. */
export async function runReactionOps(postId, ops) {
  const { supabase, userId } = await requireUser();
  for (const { table, op } of [...ops].sort((a, b) => (a.op === "delete" ? -1 : 1) - (b.op === "delete" ? -1 : 1))) {
    if (!["post_likes", "post_dislikes", "post_reposts"].includes(table)) continue;
    const res = op === "insert"
      ? await supabase.from(table).insert({ post_id: postId, user_id: userId })
      : await supabase.from(table).delete().eq("post_id", postId).eq("user_id", userId);
    if (res.error && res.error.code !== "23505") throw toError(res.error);
  }
}

// ── posts (author) ──────────────────────────────────────────────────────────
const NO_MEDIA = Object.freeze({ media_url: null, media_type: null, media_path: null });

/**
 * Storage path for a new upload. Public posts: `<uid>/<ms>-<w>x<h>.<ext>`.
 * Anonymous posts: `anon/<random uuid>/<ms>-<w>x<h>.<ext>` — nothing in the
 * path or public URL points at the author (docs/SECURITY.md §6).
 */
function uploadPath(userId, mime, dims, anonymous) {
  if (!anonymous) return buildMediaPath(userId, mime, dims);
  const folder = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : null;
  return folder ? buildMediaPath(null, mime, dims, Date.now(), { anonymous: true, folder }) : null;
}

async function uploadMedia(supabase, userId, file, dims, { anonymous = false } = {}) {
  let body = file;
  let size = dims;
  // Images are downscaled (≤ 1600 px, WebP) before upload; EXIF goes with it.
  if (mediaKindOf(file?.type) === "image") {
    const small = await downscaleImage(file, IMAGE_PRESETS.post).catch(() => null);
    if (small) {
      body = small.file;
      size = { width: small.width, height: small.height };
    }
  }
  const kind = mediaKindOf(body?.type);
  const path = kind && uploadPath(userId, body.type, size, anonymous);
  if (!path) throw dataError("invalid_media");
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
    cacheControl: "31536000",
    contentType: body.type,
    upsert: false,
  });
  if (error) throw dataError("upload_failed", null, error);
  const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  return { media_url: url, media_type: kind, media_path: path };
}

async function removeObject(supabase, path) {
  if (!path) return;
  try { await supabase.storage.from(BUCKET).remove([path]); } catch {}
}

/**
 * Publish a post (text and/or one image or ≤ 30 s video). `dims` = the media's
 * pixel size (encoded in the object name for layout-stable rendering).
 * `anonymous` (optional) = post this one anonymously or not; omitted, the
 * database uses your current "post anonymously" setting. Anonymity is fixed
 * once the post exists. → the new post, ready to render.
 */
export async function publishPost({ content, file = null, dims = null, anonymous } = {}) {
  const { supabase, userId } = await requireUser();
  const text = typeof content === "string" ? content.trim() : "";
  if (text.length > POST_MAX) throw dataError("invalid_argument", { field: "content", max: POST_MAX });
  if (!text && !file) throw dataError("empty_post");
  // Media must be stored where the post's anonymity requires, so an implicit
  // choice is resolved (and then sent explicitly) before uploading.
  let anon = typeof anonymous === "boolean" ? anonymous : null;
  if (anon === null && file) anon = await ownAnonymousMode(supabase, userId);
  const media = file ? await uploadMedia(supabase, userId, file, dims, { anonymous: anon === true }) : NO_MEDIA;
  const insert = { user_id: userId, content: text || null, ...media };
  if (anon !== null) insert.is_anonymous = anon;
  const { data, error } = await supabase.from("community_posts").insert(insert).select(OWN_POST_COLUMNS).single();
  if (error) {
    await removeObject(supabase, media.media_path);
    throw toError(error);
  }
  // Same shape as the feed (through the reader RPC); the inserted row is the fallback.
  const post = await fetchPost(supabase, data.id).catch(() => null);
  if (post) return post;
  const author = data.is_anonymous ? {} : await ownAuthorFields(supabase, userId);
  return postFromRow({ ...data, ...author, is_mine: true });
}

/** Edit a post's text. Empty text is allowed only when the post has media. */
export async function updatePostContent(post, content) {
  const { supabase } = await requireUser();
  const text = typeof content === "string" ? content.trim() : "";
  if (text.length > POST_MAX) throw dataError("invalid_argument", { field: "content", max: POST_MAX });
  if (!text && !post.media) throw dataError("empty_post");
  const { data, error } = await supabase.from("community_posts").update({ content: text || null }).eq("id", post.id).select("id, content").maybeSingle();
  if (error) throw toError(error);
  if (!data) throw dataError("forbidden");
  return { content: data.content || "" };
}

/** Swap the attached media (upload new → update row → remove the old object). */
export async function replacePostMedia(post, file, dims = null) {
  const { supabase, userId } = await requireUser();
  // Own row (RLS): tells whether the new file belongs under anon/.
  const { data: own, error: ownError } = await supabase.from("community_posts").select("id, is_anonymous").eq("id", post?.id).maybeSingle();
  if (ownError) throw toError(ownError);
  if (!own) throw dataError("forbidden");
  const media = await uploadMedia(supabase, userId, file, dims, { anonymous: own.is_anonymous === true });
  const { data, error } = await supabase.from("community_posts").update(media).eq("id", own.id).select("id").maybeSingle();
  if (error || !data) {
    await removeObject(supabase, media.media_path);
    throw error ? toError(error) : dataError("forbidden");
  }
  await removeObject(supabase, post.media?.path);
  return mediaFromRow(media);
}

/** Remove the attached media (the post must keep some text). */
export async function removePostMedia(post) {
  const { supabase } = await requireUser();
  if (!post.content?.trim()) throw dataError("empty_post");
  const { data, error } = await supabase.from("community_posts")
    .update({ ...NO_MEDIA }).eq("id", post.id).select("id").maybeSingle();
  if (error) throw toError(error);
  if (!data) throw dataError("forbidden");
  await removeObject(supabase, post.media?.path);
}

export async function deletePost(post) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("community_posts").delete().eq("id", post.id).select("id");
  if (error) throw toError(error);
  if (!data?.length) throw dataError("forbidden");
  await removeObject(supabase, post.media?.path);
}

// ── comments ────────────────────────────────────────────────────────────────
/**
 * Comments newest first (keyset), through community_comments() — the UI shows
 * them oldest → newest and loads earlier ones on demand.
 * → { items, nextCursor, available }
 */
export async function listComments(postId, { cursor = null, limit = 20 } = {}) {
  const { supabase } = await context();
  if (!supabase) return { items: [], nextCursor: null, available: false };
  if (!isUuid(postId)) return { items: [], nextCursor: null, available: true };
  const size = Math.min(Math.max(1, Number(limit) || 20), 50);
  const { data, error } = await supabase.rpc("community_comments", { p_post: postId, p_limit: size, ...cursorParams(cursor) });
  if (error) {
    if (isMissing(error)) return { items: [], nextCursor: null, available: false };
    throw toError(error);
  }
  const rows = Array.isArray(data) ? data : [];
  return { items: rows.map(commentFromRow), nextCursor: cursorOf(rows, size), available: true };
}

/**
 * Comment on a post. `anonymous` (optional): as for publishPost — omitted,
 * your current "post anonymously" setting applies. → the saved comment.
 */
export async function addComment(postId, content, { anonymous } = {}) {
  const { supabase, userId } = await requireUser();
  const text = typeof content === "string" ? content.trim() : "";
  if (!text || text.length > COMMENT_MAX) throw dataError("invalid_argument", { field: "content", max: COMMENT_MAX });
  const insert = { post_id: postId, user_id: userId, content: text };
  if (typeof anonymous === "boolean") insert.is_anonymous = anonymous;
  const { data, error } = await supabase.from("post_comments").insert(insert).select(OWN_COMMENT_COLUMNS).single();
  if (error) throw toError(error);
  const author = data.is_anonymous ? {} : await ownAuthorFields(supabase, userId);
  return commentFromRow({ ...data, ...author, is_mine: true });
}

export async function deleteComment(id) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("post_comments").delete().eq("id", id).select("id");
  if (error) throw toError(error);
  if (!data?.length) throw dataError("forbidden");
}

// ── moderation ──────────────────────────────────────────────────────────────

/** Report a post, comment or user for review. `reason` = a REPORT_REASONS id; `note` optional. */
export async function reportContent({ targetType, targetId, reason, note = "" }) {
  const { supabase, userId } = await requireUser();
  if (!["post", "comment", "user"].includes(targetType) || !isUuid(targetId) || !REPORT_REASONS.includes(reason)) {
    throw dataError("invalid_argument", { field: "reason" });
  }
  const text = `${reason}${note?.trim() ? `: ${note.trim()}` : ""}`.slice(0, REPORT_MAX);
  const { error } = await supabase.from("reports").insert({ reporter_id: userId, target_type: targetType, target_id: targetId, reason: text });
  if (error) throw toError(error);
}

/** Block a member: hides their posts and comments for you and stops interactions both ways. */
export async function blockUser(otherId) {
  const { supabase, userId } = await requireUser();
  if (!isUuid(otherId) || otherId === userId) throw dataError("invalid_argument", { field: "user" });
  const { error } = await supabase.from("blocks").insert({ blocker_id: userId, blocked_id: otherId });
  if (error && error.code !== "23505") throw toError(error);
  (await getBlockedIds()).add(otherId);
  // A block also ends your follow (the database already stops new ones).
  await supabase.from("follows").delete().eq("follower_id", userId).eq("followee_id", otherId);
  await patchFollowing(otherId, null);
}

export async function unblockUser(otherId) {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("blocks").delete().eq("blocker_id", userId).eq("blocked_id", otherId);
  if (error) throw toError(error);
  (await getBlockedIds()).delete(otherId);
}

// ── discovery ───────────────────────────────────────────────────────────────
/** Most-used hashtags with their real post counts (cached 60 s). → { items: [{ tag, post_count }], available } */
export async function getPopularTags({ limit = 10 } = {}) {
  const now = Date.now();
  if (cache.tags && now - cache.tags.at < 60000 && cache.tags.limit >= limit) {
    const res = await cache.tags.promise;
    return { ...res, items: res.items.slice(0, limit) };
  }
  const promise = (async () => {
    const { supabase } = await context();
    if (!supabase) return { items: [], available: false };
    const { data, error } = await supabase.from("hashtags").select("tag, post_count")
      .gt("post_count", 0).order("post_count", { ascending: false }).order("tag", { ascending: true }).limit(limit);
    if (error) return { items: [], available: false };
    return { items: (data || []).filter((r) => normalizeTag(r.tag)), available: true };
  })();
  cache.tags = { at: now, limit, promise };
  promise.then((r) => { if (!r.available) cache.tags = null; }).catch(() => { cache.tags = null; });
  return promise;
}

/** One hashtag's real post count. → { tag, post_count, available } (post_count 0 when unused). */
export async function getTagInfo(tag) {
  const norm = normalizeTag(tag);
  const { supabase } = await context();
  if (!supabase || !norm) return { tag: norm, post_count: 0, available: Boolean(supabase) };
  const { data, error } = await supabase.from("hashtags").select("tag, post_count").eq("tag", norm).maybeSingle();
  if (error) return { tag: norm, post_count: 0, available: false };
  return { tag: norm, post_count: Math.max(0, data?.post_count || 0), available: true };
}

/**
 * Active learners to follow: highest XP first, excluding you, people you
 * follow or blocked, and anyone posting anonymously. Public columns only.
 */
export async function getSuggestedPeople({ limit = 5 } = {}) {
  const { supabase, userId } = await context();
  if (!supabase) return { items: [], available: false };
  const { data, error } = await supabase.from("profiles").select(SUGGEST_COLUMNS)
    .not("anonymous_community", "is", true)
    .not("full_name", "is", null)
    .order("xp", { ascending: false })
    .limit(limit + 25);
  if (error) return { items: [], available: false };
  const [following, blocked] = await Promise.all([getFollowing(), getBlockedIds()]);
  const items = (data || [])
    .filter((p) => p.id !== userId && !following.has(p.id) && !blocked.has(p.id) && p.username)
    .slice(0, limit)
    .map((p) => ({ ...publicIdentity(p), xp: Math.max(0, p.xp || 0) }));
  return { items, available: true };
}

/** Followers / following of a member, newest first. Anonymous members appear unlinked. */
export async function listFollows(userId, direction = "followers", { cursor = null, limit = 20 } = {}) {
  const { supabase } = await context();
  if (!supabase || !isUuid(userId)) return { items: [], nextCursor: null, available: false };
  const [col, other] = direction === "following" ? ["follower_id", "followee_id"] : ["followee_id", "follower_id"];
  let q = supabase.from("follows").select(`id, ${other}, created_at`).eq(col, userId)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit);
  const f = keysetFilter(cursor?.before, cursor?.beforeId);
  if (f) q = q.or(f);
  const { data, error } = await q;
  if (error) {
    if (isMissing(error)) return { items: [], nextCursor: null, available: false };
    throw toError(error);
  }
  const rows = data || [];
  const authors = await fetchProfiles(supabase, rows.map((r) => r[other]));
  const items = rows.map((r) => ({ key: r.id, ...publicIdentity(authors.get(r[other]) || null) }));
  return { items, nextCursor: cursorOf(rows, limit), available: true };
}

// ── follows ─────────────────────────────────────────────────────────────────
export async function followUser(followeeId) {
  try {
    const { supabase, userId } = await requireUser();
    const { error } = await supabase.from("follows").insert({ follower_id: userId, followee_id: followeeId });
    if (error && error.code !== "23505") return { ok: false, error: toError(error) };
    await patchFollowing(followeeId, "all");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toError(e) };
  }
}

export async function unfollowUser(followeeId) {
  try {
    const { supabase, userId } = await requireUser();
    const { error } = await supabase.from("follows").delete().eq("follower_id", userId).eq("followee_id", followeeId);
    if (error) return { ok: false, error: toError(error) };
    await patchFollowing(followeeId, null);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toError(e) };
  }
}

/** notify_pref: "all" | "posts" | "off" */
export async function setFollowPref(followeeId, pref) {
  if (!["all", "posts", "off"].includes(pref)) return { ok: false };
  try {
    const { supabase, userId } = await requireUser();
    const { error } = await supabase.from("follows").update({ notify_pref: pref }).eq("follower_id", userId).eq("followee_id", followeeId);
    if (error) return { ok: false, error: toError(error) };
    await patchFollowing(followeeId, pref);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toError(e) };
  }
}

// ============================================================================
// Below: social settings and direct messages (used by the settings,
// notifications and chat features — keep the API). Notifications themselves
// live in src/lib/data/notifications.js.
// ============================================================================
const sb = async () => (await context()).supabase;

export const DEFAULT_SOCIAL_SETTINGS = {
  allow_message_requests: true,
  hide_message_requests: false,
  allow_messages: true,
  notif_sound: true,
  show_likes_on_profile: true,
  show_reposts_on_profile: true,
  notify_followers: true,
  notify_mentions: true,
};

const SOCIAL_SETTINGS_COLUMNS = Object.keys(DEFAULT_SOCIAL_SETTINGS).join(", ");

// Own row → every setting. Another user's row is private (RLS, migration 0009):
// only the prefs a profile page needs come back, via get_public_social_settings().
export async function getSocialSettings(userId) {
  try {
    const { supabase: client, userId: me } = await context();
    if (!client) return { ...DEFAULT_SOCIAL_SETTINGS };
    if (me && me === userId) {
      const { data } = await client.from("user_social_settings").select(SOCIAL_SETTINGS_COLUMNS).eq("user_id", userId).maybeSingle();
      return { ...DEFAULT_SOCIAL_SETTINGS, ...(data || {}) };
    }
    const { data } = await client.rpc("get_public_social_settings", { p_user: userId }).maybeSingle();
    return { ...DEFAULT_SOCIAL_SETTINGS, ...(data || {}) };
  } catch {
    return { ...DEFAULT_SOCIAL_SETTINGS };
  }
}

export async function updateSocialSettings(patch) {
  try {
    const { supabase: client, userId } = await context();
    if (!client || !userId) return { ok: false };
    const { error } = await client.from("user_social_settings")
      .upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    return { ok: !error, error };
  } catch (e) {
    return { ok: false, error: e };
  }
}

// ── direct messages (migration 0009: conversations, participants and message
//    requests are written ONLY by these SECURITY DEFINER RPCs) ─────────────────
const RPC_REASONS = [
  "not_authenticated", "invalid_recipient", "blocked", "messages_disabled", "requests_disabled",
  "request_rejected", "request_not_found", "request_already_accepted", "not_a_participant",
];
const rpcReason = (error) => {
  if (!error) return null;
  if (error.code === "PGRST202" || error.code === "42883") return "unavailable";
  return RPC_REASONS.find((r) => (error.message || "").includes(r)) || "error";
};

/**
 * Open (or reuse) the 1:1 conversation with `otherId`. Direct when they follow
 * you, otherwise a message request. → { ok, conversationId } | { ok: false, reason }
 * reason: blocked | messages_disabled | requests_disabled | request_rejected |
 *         invalid_recipient | not_authenticated | unavailable | error
 */
export async function startConversation(otherId) {
  try {
    const client = await sb();
    if (!client) return { ok: false, reason: "unavailable" };
    const { data, error } = await client.rpc("start_conversation", { p_other: otherId });
    if (error) return { ok: false, reason: rpcReason(error) };
    return { ok: true, conversationId: data };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/** Accept (true) or reject (false) a message request addressed to you. */
export async function respondMessageRequest(requestId, accept) {
  try {
    const client = await sb();
    if (!client) return { ok: false, reason: "unavailable" };
    const { data, error } = await client.rpc("respond_message_request", { p_request: requestId, p_accept: !!accept });
    if (error) return { ok: false, reason: rpcReason(error) };
    return { ok: true, status: data };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/** Mark the other side's messages read (read receipts) and move your last_read_at. */
export async function markConversationRead(conversationId) {
  try {
    const client = await sb();
    if (!client) return { ok: false };
    const { error } = await client.rpc("mark_conversation_read", { p_conversation: conversationId });
    if (!error) return { ok: true };
    if (rpcReason(error) !== "unavailable") return { ok: false };
    // RPC not migrated yet → at least keep the unread counter right.
    const { data: { session } } = await client.auth.getSession();
    if (!session?.user) return { ok: false };
    const res = await client.from("conversation_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId).eq("user_id", session.user.id);
    return { ok: !res.error };
  } catch {
    return { ok: false };
  }
}
