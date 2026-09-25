// ============================================================================
// Notifications — client data layer (see docs/DATA_API.md → "Notifications").
//
//   listNotifications({ limit, before, beforeId })  keyset pages, newest first
//   getUnreadCount()                                 number (0 when unavailable)
//   markNotificationsRead(ids | null)                null = all; fires "jz:notifications-read"
//   getNotificationPreferences() / updateNotificationPreferences(patch)
//
// Signed out or Supabase not configured → empty results (never throws).
// Missing 0010 RPCs → falls back to plain table reads (no post snippet).
// Other failures throw a DataError (err.name === "DataError", err.code).
// ============================================================================
import { getSupabase } from "@/lib/supabase-lazy";

export const NOTIFICATION_PREFERENCE_KEYS = [
  "likes", "comments", "follows", "mentions", "messages", "exam_results", "product_updates", "email_digest",
];
export const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({
  likes: true, comments: true, follows: true, mentions: true, messages: true,
  exam_results: true, product_updates: true, email_digest: false,
});
/** Which preference switch controls each notification type. */
export const NOTIFICATION_TYPE_PREFERENCE = Object.freeze({
  like: "likes", repost: "likes", comment: "comments", follow: "follows", mention: "mentions",
  message: "messages", message_request: "messages", request_accepted: "messages",
  exam_result: "exam_results", achievement: "exam_results", system: "product_updates",
});

const MISSING = new Set(["PGRST202", "PGRST204", "PGRST205", "42P01", "42883", "42703"]);
const SERVER_CODES = new Set(["not_authenticated", "invalid_argument", "forbidden"]);
const PUBLIC_ACTOR_COLUMNS = "id, username, full_name, avatar_url, is_elite, show_elite_badge, anonymous_community";

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
  if (SERVER_CODES.has(err?.message)) return dataError(err.message, null, err);
  if (err?.code === "42501") return dataError("forbidden", null, err);
  if (err && !err.code && /fetch|network|load failed/i.test(`${err.message || ""} ${err.details || ""}`)) return dataError("network", null, err);
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

function normalize(row) {
  const anonymous = Boolean(row.actor_anonymous);
  return {
    id: row.id,
    type: row.type,
    read: Boolean(row.read),
    created_at: row.created_at,
    post_id: row.post_id ?? null,
    comment_id: row.comment_id ?? null,
    conversation_id: row.conversation_id ?? null,
    data: row.data || {},
    actor: row.actor_id
      ? {
          id: row.actor_id,
          full_name: anonymous ? null : row.actor_full_name ?? null,
          username: anonymous ? null : row.actor_username ?? null,
          avatar_url: anonymous ? null : row.actor_avatar_url ?? null,
          is_elite: Boolean(row.actor_is_elite),
          show_elite_badge: row.actor_show_elite_badge !== false,
          anonymous,
        }
      : null,
    post_snippet: row.post_snippet ?? null,
  };
}

const cursorOf = (items, limit) => {
  const last = items[items.length - 1];
  return items.length === limit && last ? { before: last.created_at, beforeId: last.id } : null;
};

// Pre-0010 fallback: plain reads (RLS: own rows; public actor columns).
async function listFromTables(supabase, userId, { limit, before }) {
  let q = supabase
    .from("notifications")
    .select("id, type, read, created_at, post_id, comment_id, conversation_id, actor_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (before) q = q.lt("created_at", before);
  const { data, error } = await q;
  if (error) {
    if (isMissing(error)) return { items: [], nextCursor: null, available: false };
    throw toError(error);
  }
  const rows = data || [];
  const ids = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))];
  let actors = new Map();
  if (ids.length) {
    const res = await supabase.from("profiles").select(PUBLIC_ACTOR_COLUMNS).in("id", ids);
    actors = new Map((res.data || []).map((p) => [p.id, p]));
  }
  const items = rows.map((r) => {
    const p = actors.get(r.actor_id);
    return normalize({
      ...r,
      actor_full_name: p?.full_name,
      actor_username: p?.username,
      actor_avatar_url: p?.avatar_url,
      actor_is_elite: p?.is_elite,
      actor_show_elite_badge: p?.show_elite_badge,
      actor_anonymous: p?.anonymous_community,
    });
  });
  return { items, nextCursor: cursorOf(items, limit), available: true };
}

/**
 * One page of the caller's notifications, newest first.
 * @param {{ limit?: number, before?: string|null, beforeId?: string|null }} [opts]  pass the previous nextCursor
 * @returns {Promise<{ items: object[], nextCursor: { before, beforeId }|null, available: boolean }>}
 */
export async function listNotifications({ limit = 20, before = null, beforeId = null } = {}) {
  const { supabase, userId } = await context();
  if (!supabase || !userId) return { items: [], nextCursor: null, available: Boolean(supabase) };
  const { data, error } = await supabase.rpc("get_notifications", { p_limit: limit, p_before: before, p_before_id: beforeId });
  if (error) {
    if (isMissing(error)) return listFromTables(supabase, userId, { limit, before });
    throw toError(error);
  }
  const items = (data || []).map(normalize);
  return { items, nextCursor: cursorOf(items, limit), available: true };
}

/** Unread count for the bell; 0 when signed out or unavailable. */
export async function getUnreadCount() {
  const { supabase, userId } = await context();
  if (!supabase || !userId) return 0;
  const rpc = await supabase.rpc("unread_notification_count");
  if (!rpc.error && typeof rpc.data === "number") return rpc.data;
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("read", false);
  return error ? 0 : count || 0;
}

function announceRead() {
  try {
    window.dispatchEvent(new Event("jz:notifications-read"));
  } catch {
    /* not in a browser */
  }
}

/**
 * Mark notifications read. ids = null → every unread notification.
 * @param {string[]|null} [ids]
 * @returns {Promise<number|null>} rows changed (null when the fallback can't tell)
 */
export async function markNotificationsRead(ids = null) {
  if (ids !== null && (!Array.isArray(ids) || ids.length > 500)) throw dataError("invalid_argument", { field: "ids" });
  if (Array.isArray(ids) && ids.length === 0) return 0;
  const { supabase, userId } = await context();
  if (!supabase || !userId) throw dataError("not_authenticated");
  const { data, error } = await supabase.rpc("mark_notifications_read", { p_ids: ids });
  if (!error) {
    announceRead();
    return typeof data === "number" ? data : null;
  }
  if (!isMissing(error)) throw toError(error);
  let q = supabase.from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false);
  if (ids) q = q.in("id", ids);
  const res = await q;
  if (res.error) throw toError(res.error);
  announceRead();
  return null;
}
export const markAllNotificationsRead = () => markNotificationsRead(null);

/**
 * The caller's notification switches (defaults when never saved).
 * @returns {Promise<{ likes, comments, follows, mentions, messages, exam_results, product_updates, email_digest, available: boolean }>}
 */
export async function getNotificationPreferences() {
  const { supabase, userId } = await context();
  if (!supabase || !userId) return { ...DEFAULT_NOTIFICATION_PREFERENCES, available: false };
  const { data, error } = await supabase
    .from("notification_preferences")
    .select(NOTIFICATION_PREFERENCE_KEYS.join(", "))
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (isMissing(error)) return { ...DEFAULT_NOTIFICATION_PREFERENCES, available: false };
    throw toError(error);
  }
  return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...(data || {}), available: true };
}

/**
 * Update some switches, e.g. { likes: false }. Unknown keys / non-booleans → invalid_argument.
 * @returns {Promise<object>} the full, saved preferences
 */
export async function updateNotificationPreferences(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw dataError("invalid_argument", { field: "patch" });
  const clean = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!NOTIFICATION_PREFERENCE_KEYS.includes(k) || typeof v !== "boolean") throw dataError("invalid_argument", { field: k });
    clean[k] = v;
  }
  const { supabase, userId } = await context();
  if (!supabase || !userId) throw dataError("not_authenticated");
  const { data, error } = await supabase
    .from("notification_preferences")
    .upsert({ user_id: userId, ...clean }, { onConflict: "user_id" })
    .select(NOTIFICATION_PREFERENCE_KEYS.join(", "))
    .single();
  if (error) {
    if (isMissing(error)) throw dataError("unavailable", null, error);
    throw toError(error);
  }
  return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...data, available: true };
}
