// ============================================================================
// Community — pure helpers (no Supabase, no React, no strings).
// Shared by the data layer (src/lib/social.js), the UI and unit tests
// (tests/unit/community.test.js). Grammar for #tags / @mentions mirrors the
// database trigger `index_post_entities()` (0009) exactly, so every link the
// UI draws points at the tag page the database actually indexed.
// ============================================================================

export const POST_MAX = 2000;
export const COMMENT_MAX = 1000;
export const REPORT_MAX = 1000;
export const MAX_TAGS_PER_POST = 10;
export const REPORT_REASONS = ["spam", "harassment", "inappropriate", "misinformation", "privacy", "other"];

export const MEDIA_LIMITS = Object.freeze({
  imageBytes: 5 * 1024 * 1024,
  videoBytes: 50 * 1024 * 1024,
  videoSeconds: 30,
});

// Exactly what the post-media bucket accepts (no SVG — see docs/SECURITY.md §6).
export const IMAGE_TYPES = Object.freeze({
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif",
});
export const VIDEO_TYPES = Object.freeze({ "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" });

const TAG_CHARS = "0-9A-Za-z_\\u0600-\\u06FF";
const TAG_STORED_RE = /^[0-9a-z_؀-ۿ]{2,50}$/; // hashtags_tag_format CHECK
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:?\d{2})?$/;

export const isUuid = (v) => typeof v === "string" && UUID_RE.test(v);

/** "%23Math" | "#Math" | "math" → "math" (or null when it can never be a stored tag). */
export function normalizeTag(raw) {
  if (typeof raw !== "string") return null;
  let s = raw;
  if (s.includes("%")) {
    try { s = decodeURIComponent(s); } catch { return null; }
  }
  s = s.trim().replace(/^#/, "").toLowerCase();
  return TAG_STORED_RE.test(s) ? s : null;
}

/** Route segment → stored handle (profiles_username_format: ^[a-z0-9_؀-ۿ]{3,40}$), or null. */
export function normalizeUsername(raw) {
  if (typeof raw !== "string") return null;
  let s = raw;
  if (s.includes("%")) {
    try { s = decodeURIComponent(s); } catch { return null; }
  }
  s = s.trim().replace(/^@/, "").toLowerCase();
  return /^[a-z0-9_؀-ۿ]{3,40}$/.test(s) ? s : null;
}

// ── post text → tokens (tags, mentions, https links) ────────────────────────
const TOKEN_RE = new RegExp(
  `(^|\\s)#([${TAG_CHARS}]{2,50})|(^|\\s)@([0-9A-Za-z_]{2,30})|https:\\/\\/[^\\s<>"'\`]+`,
  "g"
);
const URL_TRAIL_RE = /[.,!?;:)\]}'"،؛؟…]+$/;

/**
 * Split post/comment text into renderable tokens. Never returns HTML.
 *   { t: "text", v } · { t: "tag", v: "#Math", tag: "math" } ·
 *   { t: "mention", v: "@sara", handle: "sara" } · { t: "url", v, href }
 */
export function tokenizePost(text) {
  const out = [];
  if (typeof text !== "string" || !text) return out;
  const push = (tok) => {
    if (tok.t === "text") {
      if (!tok.v) return;
      const last = out[out.length - 1];
      if (last?.t === "text") { last.v += tok.v; return; }
    }
    out.push(tok);
  };
  let idx = 0;
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text))) {
    push({ t: "text", v: text.slice(idx, m.index) });
    if (m[2] !== undefined) {
      push({ t: "text", v: m[1] });
      push({ t: "tag", v: `#${m[2]}`, tag: m[2].toLowerCase() });
    } else if (m[4] !== undefined) {
      push({ t: "text", v: m[3] });
      push({ t: "mention", v: `@${m[4]}`, handle: m[4].toLowerCase() });
    } else {
      let url = m[0];
      const trail = url.match(URL_TRAIL_RE)?.[0] || "";
      if (trail) url = url.slice(0, -trail.length);
      if (url.length > "https://".length) push({ t: "url", v: url, href: url });
      else push({ t: "text", v: url });
      push({ t: "text", v: trail });
    }
    idx = m.index + m[0].length;
  }
  push({ t: "text", v: text.slice(idx) });
  return out;
}

/** Same grammar as the DB trigger: distinct lower-case tags, at most 10. */
export function extractTags(text) {
  const tags = [];
  for (const tok of tokenizePost(text)) {
    if (tok.t === "tag" && !tags.includes(tok.tag)) tags.push(tok.tag);
    if (tags.length === MAX_TAGS_PER_POST) break;
  }
  return tags;
}

/** Legacy API kept for callers of src/lib/social.js. */
export function parseEntities(text = "") {
  const tags = new Set();
  const handles = new Set();
  for (const tok of tokenizePost(text)) {
    if (tok.t === "tag") tags.add(tok.tag);
    if (tok.t === "mention") handles.add(tok.handle);
  }
  return { tags: [...tags], handles: [...handles] };
}

/**
 * Final post body: the text plus any topic tags the composer added that the
 * author didn't already type. Tags go on their own last line.
 */
export function composeContent(text, tags = []) {
  const body = String(text || "").replace(/\r\n/g, "\n").trim();
  const present = new Set(extractTags(body));
  const extra = [];
  for (const raw of tags) {
    const tag = normalizeTag(raw);
    if (tag && !present.has(tag) && !extra.includes(tag)) extra.push(tag);
  }
  if (!extra.length) return body;
  const line = extra.map((t) => `#${t}`).join(" ");
  return body ? `${body}\n\n${line}` : line;
}

// ── media ───────────────────────────────────────────────────────────────────
/** Validate a picked file → null (ok) or an error code for `community.composer.errors.*`. */
export function validateMediaFile(file, kind) {
  if (!file) return "mediaType";
  if (kind === "image") {
    if (!IMAGE_TYPES[file.type]) return "imageType";
    if (file.size > MEDIA_LIMITS.imageBytes) return "imageSize";
  } else {
    if (!VIDEO_TYPES[file.type]) return "videoType";
    if (file.size > MEDIA_LIMITS.videoBytes) return "videoSize";
  }
  return null;
}

export const mediaKindOf = (mime) => (IMAGE_TYPES[mime] ? "image" : VIDEO_TYPES[mime] ? "video" : null);

/**
 * Storage object path for a new upload: `<uid>/<ms>-<w>x<h>.<ext>`. The
 * dimensions in the file name let every reader reserve the exact box before
 * the media loads (no layout shift) without an extra column. Matches the
 * URL-safe single-segment rule of `is_own_storage_url()`.
 */
export function buildMediaPath(uid, mime, dims, now = Date.now()) {
  const ext = IMAGE_TYPES[mime] || VIDEO_TYPES[mime];
  if (!isUuid(uid) || !ext) return null;
  const w = Math.round(Number(dims?.width) || 0);
  const h = Math.round(Number(dims?.height) || 0);
  const size = w > 0 && h > 0 && w <= 20000 && h <= 20000 ? `-${w}x${h}` : "";
  return `${uid}/${Math.floor(now)}${size}.${ext}`;
}

/** Dimensions encoded by buildMediaPath (null for older uploads). */
export function parseMediaDims(pathOrUrl) {
  if (typeof pathOrUrl !== "string") return null;
  const m = pathOrUrl.match(/-(\d{1,5})x(\d{1,5})\.[A-Za-z0-9]+(?:[?#].*)?$/);
  if (!m) return null;
  const width = Number(m[1]);
  const height = Number(m[2]);
  if (!width || !height) return null;
  return { width, height };
}

/** Display box ratio (w / h): real ratio clamped to a sane band, or a default. */
export function mediaAspect(dims, type = "image") {
  const fallback = type === "video" ? 16 / 9 : 4 / 3;
  if (!dims?.width || !dims?.height) return fallback;
  const r = dims.width / dims.height;
  return Math.min(1.91, Math.max(0.8, r));
}

// ── reactions (optimistic) ──────────────────────────────────────────────────
const REACTION_TABLE = { like: "post_likes", dislike: "post_dislikes", repost: "post_reposts" };

/**
 * Optimistic toggle. Likes and "not helpful" are mutually exclusive; reposts
 * are independent. Returns the next state and the writes that make it true.
 *   state = { liked, disliked, reposted, likes, dislikes, reposts }
 */
export function applyReaction(state, kind) {
  const s = { liked: false, disliked: false, reposted: false, likes: 0, dislikes: 0, reposts: 0, ...state };
  const next = { ...s };
  const ops = [];
  const dec = (n) => Math.max(0, n - 1);
  if (kind === "like" || kind === "dislike") {
    const on = kind === "like" ? "liked" : "disliked";
    const off = kind === "like" ? "disliked" : "liked";
    const onCount = kind === "like" ? "likes" : "dislikes";
    const offCount = kind === "like" ? "dislikes" : "likes";
    if (s[on]) {
      next[on] = false;
      next[onCount] = dec(s[onCount]);
      ops.push({ table: REACTION_TABLE[kind], op: "delete" });
    } else {
      if (s[off]) {
        next[off] = false;
        next[offCount] = dec(s[offCount]);
        ops.push({ table: REACTION_TABLE[kind === "like" ? "dislike" : "like"], op: "delete" });
      }
      next[on] = true;
      next[onCount] = s[onCount] + 1;
      ops.push({ table: REACTION_TABLE[kind], op: "insert" });
    }
  } else if (kind === "repost") {
    next.reposted = !s.reposted;
    next.reposts = s.reposted ? dec(s.reposts) : s.reposts + 1;
    ops.push({ table: REACTION_TABLE.repost, op: s.reposted ? "delete" : "insert" });
  }
  return { next, ops };
}

// ── pagination ──────────────────────────────────────────────────────────────
/**
 * PostgREST `or` filter for keyset pagination, newest first:
 * (col < before) OR (col = before AND idCol < beforeId). Values are validated
 * so a tampered cursor can never inject filter syntax. null = first page.
 */
export function keysetFilter(before, beforeId, col = "created_at", idCol = "id") {
  if (typeof before !== "string" || !ISO_RE.test(before)) return null;
  if (!isUuid(beforeId)) return `${col}.lt."${before}"`;
  return `${col}.lt."${before}",and(${col}.eq."${before}",${idCol}.lt.${beforeId})`;
}

/** Cursor for the next page, or null when the page wasn't full. */
export function cursorOf(rows, limit, col = "created_at", idCol = "id") {
  if (!Array.isArray(rows) || rows.length < limit) return null;
  const last = rows[rows.length - 1];
  return last?.[col] ? { before: last[col], beforeId: last[idCol] ?? null } : null;
}

// ── identities ──────────────────────────────────────────────────────────────
/**
 * Public identity of an author. Anonymous members expose NOTHING that could
 * link the post to them (no id, no handle, no name, no avatar, no badge).
 * `name: null` means "unknown member" (profile row not readable).
 */
export function publicIdentity(profile) {
  if (!profile) return { anonymous: false, id: null, username: null, name: null, avatar: null, elite: false };
  if (profile.anonymous_community) return { anonymous: true };
  return {
    anonymous: false,
    id: profile.id || null,
    username: profile.username || null,
    name: profile.full_name || null,
    avatar: profile.avatar_url || null,
    elite: Boolean(profile.is_elite) && profile.show_elite_badge !== false,
  };
}

/** DB row + author profile + viewer's reactions → the post object the UI renders. */
export function normalizePost(row, profile, { viewerId = null, liked = false, disliked = false, reposted = false } = {}) {
  const media = row.media_url && (row.media_type === "image" || row.media_type === "video")
    ? { url: row.media_url, type: row.media_type, path: row.media_path || null, dims: parseMediaDims(row.media_path || row.media_url) }
    : null;
  return {
    id: row.id,
    content: row.content || "",
    media,
    created_at: row.created_at,
    mine: Boolean(viewerId) && row.user_id === viewerId,
    author: publicIdentity(profile),
    counts: {
      likes: Math.max(0, row.likes_count ?? 0),
      dislikes: Math.max(0, row.dislikes_count ?? 0),
      comments: Math.max(0, row.comments_count ?? 0),
      reposts: Math.max(0, row.reposts_count ?? 0),
    },
    viewer: { liked: Boolean(liked), disliked: Boolean(disliked), reposted: Boolean(reposted) },
  };
}

/** Topic chips: curated starters first, then popular real tags not already listed. */
export function mergeTopics(starters, popular, max = 14) {
  const seen = new Set();
  const out = [];
  for (const s of starters || []) {
    const tag = normalizeTag(s.tag);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push({ ...s, tag, count: null });
  }
  for (const p of popular || []) {
    const tag = normalizeTag(p.tag);
    if (!tag) continue;
    if (seen.has(tag)) {
      const hit = out.find((o) => o.tag === tag);
      if (hit) hit.count = p.post_count ?? null;
      continue;
    }
    if (out.length >= max) continue;
    seen.add(tag);
    out.push({ id: null, tag, count: p.post_count ?? null });
  }
  return out;
}

// ── feed state (reducer used by the Feed island) ────────────────────────────
export const FEED_INITIAL = Object.freeze({ status: "loading", items: [], cursor: null, loadingMore: false, error: null, reason: null });

const patchOf = (post, patch) => (typeof patch === "function" ? patch(post) : patch) || {};

/**
 * Actions: reset · page { items, nextCursor, available, reason, append } ·
 * loadingMore · error { code, append } · prepend { post } · patch { id, patch }
 * (object or post => object, shallow-merged) · remove { id } ·
 * removeAuthor { userId } · row { row } (realtime counts / text).
 */
export function feedReducer(state, action) {
  switch (action.type) {
    case "reset":
      return { ...FEED_INITIAL };
    case "page": {
      if (action.available === false) return { ...FEED_INITIAL, status: "unavailable", reason: action.reason || null };
      const base = action.append ? state.items : [];
      const seen = new Set(base.map((p) => p.id));
      const fresh = (action.items || []).filter((p) => !seen.has(p.id) && seen.add(p.id));
      return { ...state, status: "ready", items: [...base, ...fresh], cursor: action.nextCursor || null, loadingMore: false, error: null, reason: action.reason || null };
    }
    case "loadingMore":
      return { ...state, loadingMore: true, error: null };
    case "error":
      return action.append
        ? { ...state, loadingMore: false, error: action.code || "unknown" }
        : { ...FEED_INITIAL, status: "error", error: action.code || "unknown" };
    case "prepend":
      if (!action.post || state.items.some((p) => p.id === action.post.id)) return state;
      return { ...state, status: "ready", reason: null, items: [action.post, ...state.items] };
    case "patch":
      return { ...state, items: state.items.map((p) => (p.id === action.id ? { ...p, ...patchOf(p, action.patch) } : p)) };
    case "remove":
      return { ...state, items: state.items.filter((p) => p.id !== action.id) };
    case "removeAuthor":
      return { ...state, items: state.items.filter((p) => p.author?.id !== action.userId) };
    case "row": {
      const r = action.row;
      if (!r?.id) return state;
      return {
        ...state,
        items: state.items.map((p) =>
          p.id !== r.id
            ? p
            : {
                ...p,
                content: typeof r.content === "string" ? r.content : r.content === null ? "" : p.content,
                counts: {
                  likes: Math.max(0, r.likes_count ?? p.counts.likes),
                  dislikes: Math.max(0, r.dislikes_count ?? p.counts.dislikes),
                  comments: Math.max(0, r.comments_count ?? p.counts.comments),
                  reposts: Math.max(0, r.reposts_count ?? p.counts.reposts),
                },
              }
        ),
      };
    }
    default:
      return state;
  }
}

// ── script detection (Arabic content inside the English UI and vice versa) ──
const ARABIC_CHAR = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const LATIN_CHAR = /[A-Za-zÀ-ɏ]/;

/** "ar" | "en" from the first strong letter of user text (null if none). */
export function scriptOf(text) {
  if (typeof text !== "string") return null;
  for (const ch of text) {
    if (ARABIC_CHAR.test(ch)) return "ar";
    if (LATIN_CHAR.test(ch)) return "en";
  }
  return null;
}
