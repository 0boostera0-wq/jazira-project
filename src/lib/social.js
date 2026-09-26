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
//   • Anonymous members (profiles.anonymous_community) are never linkable:
//     normalizePost()/publicIdentity() strip id, handle, name and avatar.
//
// Pure logic (tokenizer, reducers, cursors, media paths) lives in
// src/components/community/model.js and is unit-tested.
// ============================================================================
import { getSupabase } from "@/lib/supabase-lazy";
import { BASIC_PROFILE_COLUMNS } from "@/lib/profile";
import {
  POST_MAX, COMMENT_MAX, REPORT_MAX, REPORT_REASONS, buildMediaPath, cursorOf, isUuid, keysetFilter,
  mediaKindOf, normalizePost, normalizeTag, publicIdentity,
} from "@/components/community/model";

export { parseEntities, REPORT_REASONS } from "@/components/community/model";

const BUCKET = "post-media";
const AUTHOR_COLUMNS = `${BASIC_PROFILE_COLUMNS}, show_elite_badge, anonymous_community`;
const SUGGEST_COLUMNS = `${AUTHOR_COLUMNS}, xp`;
const POST_COLUMNS =
  "id, user_id, content, media_url, media_type, media_path, likes_count, dislikes_count, comments_count, reposts_count, created_at";
const COMMENT_COLUMNS = "id, post_id, user_id, content, created_at";

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
  if (err.code === "23514" || err.code === "22001" || err.code === "22P02") return dataError("invalid_argument", null, err);
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

// ── hydration: rows → UI posts ──────────────────────────────────────────────
// Every author read carries `anonymous_community`: an identity is never
// rendered without knowing whether its owner posts anonymously. If even the
// minimal column set fails, authors come back unknown ("Jazira member", no
// link) rather than named.
const AUTHOR_FALLBACK_COLUMNS = `${BASIC_PROFILE_COLUMNS}, anonymous_community`;

async function fetchAuthors(supabase, ids) {
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

async function fetchViewerReactions(supabase, userId, postIds) {
  const empty = { liked: new Set(), disliked: new Set(), reposted: new Set() };
  if (!userId || !postIds.length) return empty;
  const pick = (table) =>
    supabase.from(table).select("post_id").eq("user_id", userId).in("post_id", postIds)
      .then(({ data }) => new Set((data || []).map((r) => r.post_id)))
      .catch(() => new Set());
  const [liked, disliked, reposted] = await Promise.all([pick("post_likes"), pick("post_dislikes"), pick("post_reposts")]);
  return { liked, disliked, reposted };
}

async function hydrate(supabase, rows, userId, { dropAnonymous = false } = {}) {
  if (!rows.length) return [];
  const [authors, reactions, blocked] = await Promise.all([
    fetchAuthors(supabase, rows.map((r) => r.user_id)),
    fetchViewerReactions(supabase, userId, rows.map((r) => r.id)),
    userId ? getBlockedIds() : Promise.resolve(new Set()),
  ]);
  const out = [];
  for (const row of rows) {
    if (blocked.has(row.user_id)) continue;
    const profile = authors.get(row.user_id) || null;
    if (dropAnonymous && profile?.anonymous_community) continue;
    out.push(normalizePost(row, profile, {
      viewerId: userId,
      liked: reactions.liked.has(row.id),
      disliked: reactions.disliked.has(row.id),
      reposted: reactions.reposted.has(row.id),
    }));
  }
  return out;
}

const withSignal = (q, signal) => (signal && typeof q.abortSignal === "function" ? q.abortSignal(signal) : q);

async function postsByIds(supabase, ids, signal) {
  if (!ids.length) return [];
  const { data, error } = await withSignal(supabase.from("community_posts").select(POST_COLUMNS).in("id", ids), signal);
  if (error) throw error;
  const byId = new Map((data || []).map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

// ── feed ────────────────────────────────────────────────────────────────────
export const FEED_PAGE_SIZE = 12;

/**
 * One page of posts, newest first (keyset).
 * @param {object} o
 * @param {"all"|"following"|"tag"|"author"|"liked"|"reposted"} [o.scope]
 * @param {string} [o.tag]       scope "tag"
 * @param {string} [o.userId]    scope "author" | "liked" | "reposted"
 * @param {{before:string, beforeId:string}|null} [o.cursor]  the previous nextCursor
 * @returns {Promise<{ items, nextCursor, available, reason? }>}
 *   reason: "not_configured" | "not_deployed" | "no_following" | "signed_out" | "no_tag"
 */
export async function listPosts({ scope = "all", tag = null, userId: target = null, cursor = null, limit = FEED_PAGE_SIZE, signal } = {}) {
  const { supabase, userId } = await context();
  if (!supabase) return { items: [], nextCursor: null, available: false, reason: "not_configured" };
  const size = Math.min(Math.max(1, limit), 50);
  const keyset = (col, idCol) => keysetFilter(cursor?.before, cursor?.beforeId, col, idCol);

  try {
    // ── interaction lists (likes / reposts on a profile) ──
    if (scope === "liked" || scope === "reposted") {
      if (!isUuid(target)) return { items: [], nextCursor: null, available: true };
      const table = scope === "liked" ? "post_likes" : "post_reposts";
      let q = supabase.from(table).select("id, post_id, created_at").eq("user_id", target)
        .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(size);
      const f = keyset("created_at", "id");
      if (f) q = q.or(f);
      const { data, error } = await withSignal(q, signal);
      if (error) throw error;
      const links = data || [];
      const rows = await postsByIds(supabase, links.map((l) => l.post_id), signal);
      return { items: await hydrate(supabase, rows, userId), nextCursor: cursorOf(links, size), available: true };
    }

    // ── tag feed: post_hashtags (indexed by trigger) → posts ──
    if (scope === "tag") {
      const norm = normalizeTag(tag);
      if (!norm) return { items: [], nextCursor: null, available: true, reason: "no_tag" };
      const { data: h, error: hErr } = await supabase.from("hashtags").select("id").eq("tag", norm).maybeSingle();
      if (hErr) throw hErr;
      if (!h) return { items: [], nextCursor: null, available: true, reason: "no_tag" };
      let q = supabase.from("post_hashtags").select("post_id, created_at").eq("hashtag_id", h.id)
        .order("created_at", { ascending: false }).order("post_id", { ascending: false }).limit(size);
      const f = keyset("created_at", "post_id");
      if (f) q = q.or(f);
      const { data, error } = await withSignal(q, signal);
      if (error) throw error;
      const links = data || [];
      const rows = await postsByIds(supabase, links.map((l) => l.post_id), signal);
      return { items: await hydrate(supabase, rows, userId), nextCursor: cursorOf(links, size, "created_at", "post_id"), available: true };
    }

    // ── posts table scopes ──
    let q = supabase.from("community_posts").select(POST_COLUMNS)
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(size);
    let dropAnonymous = false;
    if (scope === "following") {
      if (!userId) return { items: [], nextCursor: null, available: true, reason: "signed_out" };
      const following = await getFollowing();
      if (!following.size) return { items: [], nextCursor: null, available: true, reason: "no_following" };
      q = q.in("user_id", [...following.keys()].slice(0, 150)); // keeps the request URL short
      // A follow list must never reveal which anonymous post belongs to whom.
      dropAnonymous = true;
    } else if (scope === "author") {
      if (!isUuid(target)) return { items: [], nextCursor: null, available: true };
      q = q.eq("user_id", target);
    }
    const f = keyset("created_at", "id");
    if (f) q = q.or(f);
    const { data, error } = await withSignal(q, signal);
    if (error) throw error;
    const rows = data || [];
    return { items: await hydrate(supabase, rows, userId, { dropAnonymous }), nextCursor: cursorOf(rows, size), available: true };
  } catch (err) {
    if (isMissing(err)) return { items: [], nextCursor: null, available: false, reason: "not_deployed" };
    throw toError(err);
  }
}

/** A single post (permalink page). → { post | null, available } */
export async function getPost(id) {
  const { supabase, userId } = await context();
  if (!supabase) return { post: null, available: false };
  if (!isUuid(id)) return { post: null, available: true };
  const { data, error } = await supabase.from("community_posts").select(POST_COLUMNS).eq("id", id).maybeSingle();
  if (error) {
    if (isMissing(error)) return { post: null, available: false };
    throw toError(error);
  }
  if (!data) return { post: null, available: true };
  const [post] = await hydrate(supabase, [data], userId);
  return { post: post || null, available: true };
}

/** Rows for realtime-delivered posts (profile + reactions attached). */
export async function hydratePostRows(rows) {
  const { supabase, userId } = await context();
  if (!supabase) return [];
  return hydrate(supabase, rows, userId);
}

/**
 * Live feed updates. Returns an unsubscribe function (no-op when unavailable).
 * onInsert(row) gets the raw row: call hydratePostRows() before rendering it.
 */
export async function subscribeToPosts({ onInsert, onUpdate }) {
  const { supabase } = await context();
  if (!supabase || typeof supabase.channel !== "function") return () => {};
  try {
    const channel = supabase
      .channel(`community-feed-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "community_posts" }, (p) => p?.new && onInsert?.(p.new))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "community_posts" }, (p) => p?.new && onUpdate?.(p.new))
      .subscribe();
    return () => { try { supabase.removeChannel(channel); } catch {} };
  } catch {
    return () => {};
  }
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
async function uploadMedia(supabase, userId, file, dims) {
  const kind = mediaKindOf(file?.type);
  const path = kind && buildMediaPath(userId, file.type, dims);
  if (!path) throw dataError("invalid_media");
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "31536000",
    contentType: file.type,
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
 * → the new post, ready to render.
 */
export async function publishPost({ content, file = null, dims = null }) {
  const { supabase, userId } = await requireUser();
  const text = typeof content === "string" ? content.trim() : "";
  if (text.length > POST_MAX) throw dataError("invalid_argument", { field: "content", max: POST_MAX });
  if (!text && !file) throw dataError("empty_post");
  const media = file ? await uploadMedia(supabase, userId, file, dims) : { media_url: null, media_type: null, media_path: null };
  const { data, error } = await supabase
    .from("community_posts")
    .insert({ user_id: userId, content: text || null, ...media })
    .select(POST_COLUMNS)
    .single();
  if (error) {
    await removeObject(supabase, media.media_path);
    throw toError(error);
  }
  const [post] = await hydrate(supabase, [data], userId);
  return post;
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
  const media = await uploadMedia(supabase, userId, file, dims);
  const { data, error } = await supabase.from("community_posts").update(media).eq("id", post.id).select("id").maybeSingle();
  if (error || !data) {
    await removeObject(supabase, media.media_path);
    throw error ? toError(error) : dataError("forbidden");
  }
  await removeObject(supabase, post.media?.path);
  return normalizePost({ id: post.id, ...media }, null).media;
}

/** Remove the attached media (the post must keep some text). */
export async function removePostMedia(post) {
  const { supabase } = await requireUser();
  if (!post.content?.trim()) throw dataError("empty_post");
  const { data, error } = await supabase.from("community_posts")
    .update({ media_url: null, media_type: null, media_path: null }).eq("id", post.id).select("id").maybeSingle();
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
function normalizeComment(row, profile, viewerId) {
  return {
    id: row.id,
    post_id: row.post_id,
    content: row.content || "",
    created_at: row.created_at,
    mine: Boolean(viewerId) && row.user_id === viewerId,
    author: publicIdentity(profile),
  };
}

/**
 * Comments newest first (keyset) — the UI shows them oldest → newest and
 * loads earlier ones on demand. → { items, nextCursor, available }
 */
export async function listComments(postId, { cursor = null, limit = 20 } = {}) {
  const { supabase, userId } = await context();
  if (!supabase) return { items: [], nextCursor: null, available: false };
  let q = supabase.from("post_comments").select(COMMENT_COLUMNS).eq("post_id", postId)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit);
  const f = keysetFilter(cursor?.before, cursor?.beforeId);
  if (f) q = q.or(f);
  const { data, error } = await q;
  if (error) {
    if (isMissing(error)) return { items: [], nextCursor: null, available: false };
    throw toError(error);
  }
  const rows = data || [];
  const [authors, blocked] = await Promise.all([fetchAuthors(supabase, rows.map((r) => r.user_id)), getBlockedIds()]);
  const items = rows.filter((r) => !blocked.has(r.user_id)).map((r) => normalizeComment(r, authors.get(r.user_id) || null, userId));
  return { items, nextCursor: cursorOf(rows, limit), available: true };
}

export async function addComment(postId, content) {
  const { supabase, userId } = await requireUser();
  const text = typeof content === "string" ? content.trim() : "";
  if (!text || text.length > COMMENT_MAX) throw dataError("invalid_argument", { field: "content", max: COMMENT_MAX });
  const { data, error } = await supabase.from("post_comments").insert({ post_id: postId, user_id: userId, content: text }).select(COMMENT_COLUMNS).single();
  if (error) throw toError(error);
  const authors = await fetchAuthors(supabase, [userId]);
  return normalizeComment(data, authors.get(userId) || null, userId);
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
  const authors = await fetchAuthors(supabase, rows.map((r) => r[other]));
  const items = rows.map((r) => ({ key: r.id, ...publicIdentity(authors.get(r[other]) || null) }));
  return { items, nextCursor: cursorOf(rows, limit), available: true };
}

// ── follows ─────────────────────────────────────────────────────────────────
/** → { following, pref } | null (signed out / self). */
export async function isFollowing(followeeId) {
  const { supabase, userId } = await context();
  if (!supabase || !userId || userId === followeeId) return null;
  const map = await getFollowing();
  return map.has(followeeId) ? { following: true, pref: map.get(followeeId) } : { following: false, pref: null };
}

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
// Below: social settings, notifications and direct messages (used by the
// settings, notification bell, sidebar and chat features — keep the API).
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

// ── notifications (legacy bell; new code uses src/lib/data/notifications.js) ─
export async function listNotifications({ type } = {}) {
  try {
    const { supabase: client, userId } = await context();
    if (!client || !userId) return [];
    let q = client.from("notifications")
      .select("id, user_id, actor_id, type, post_id, comment_id, conversation_id, read, created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(60);
    if (type && type !== "all") q = q.eq("type", type);
    const { data } = await q;
    return data || [];
  } catch {
    return [];
  }
}

export async function unreadNotificationCount() {
  try {
    const { supabase: client, userId } = await context();
    if (!client || !userId) return 0;
    const { count } = await client.from("notifications")
      .select("id", { count: "exact", head: true }).eq("user_id", userId).eq("read", false);
    return count || 0;
  } catch {
    return 0;
  }
}

export async function markNotificationsRead(ids) {
  try {
    const { supabase: client, userId } = await context();
    if (!client || !userId) return { ok: false };
    let q = client.from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false);
    if (Array.isArray(ids) && ids.length) q = q.in("id", ids);
    const { error } = await q;
    return { ok: !error };
  } catch {
    return { ok: false };
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

// ── unread DM count (best-effort) ────────────────────────────────────────────
export async function unreadMessageCount() {
  try {
    const { supabase: client, userId } = await context();
    if (!client || !userId) return 0;
    // conversations I'm in, with messages newer than my last_read_at
    const { data: parts } = await client.from("conversation_participants")
      .select("conversation_id, last_read_at").eq("user_id", userId);
    if (!parts?.length) return 0;
    const counts = await Promise.all(parts.map((p) =>
      client.from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", p.conversation_id)
        .neq("sender_id", userId)
        .gt("created_at", p.last_read_at || "1970-01-01")
        .then(({ count }) => count || 0, () => 0)
    ));
    return counts.reduce((a, b) => a + b, 0);
  } catch {
    return 0;
  }
}
