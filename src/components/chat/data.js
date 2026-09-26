// ============================================================================
// Direct messages — client data layer (browser Supabase client, RLS applies).
//
// Tables/RPCs: docs/SECURITY.md §3/§5 (conversations, conversation_participants,
// message_requests, messages, blocks; start_conversation, respond_message_request,
// mark_conversation_read — the last three via src/lib/social.js).
//
// Every function throws a ChatDataError { code } on failure:
//   "not_authenticated" | "unavailable" | "cannot_send" | "message_delete_window_expired" |
//   "message_undelete_forbidden" | "network" | "unknown"
// ============================================================================
import { getSupabase } from "@/lib/supabase-lazy";
import { BASIC_PROFILE_COLUMNS } from "@/lib/profile";
import { sortConversations } from "./messaging";

const PROFILE_COLUMNS = `${BASIC_PROFILE_COLUMNS}, show_elite_badge`; // public columns only
const MESSAGE_COLUMNS = "id, conversation_id, sender_id, content, media_url, media_type, created_at, delivered_at, read_at, deleted_for_all";
const CONVERSATION_COLUMNS = "id, is_request, last_message_at, created_at, created_by, conversation_participants(user_id, last_read_at, muted, hidden)";
const MISSING = new Set(["PGRST205", "PGRST202", "PGRST200", "42P01", "42883"]);
const RAISED = ["message_delete_window_expired", "message_undelete_forbidden", "not_authenticated"];

export function chatError(code, cause) {
  const e = new Error(code);
  e.name = "ChatDataError";
  e.code = code;
  if (cause) e.cause = cause;
  return e;
}

function toError(error) {
  if (!error) return chatError("unknown");
  if (MISSING.has(error.code)) return chatError("unavailable", error);
  const raised = RAISED.find((r) => (error.message || "").includes(r));
  if (raised) return chatError(raised, error);
  if (error.code === "42501") return chatError("cannot_send", error); // RLS: can_send_message() said no
  if (!error.code && /fetch|network|load failed/i.test(`${error.message || ""} ${error.details || ""}`)) return chatError("network", error);
  return chatError("unknown", error);
}

export async function client() {
  let sb = null;
  try {
    sb = await getSupabase();
  } catch {
    sb = null;
  }
  if (!sb) throw chatError("unavailable");
  return sb;
}

const quote = (v) => `"${String(v).replace(/"/g, "")}"`;

/** Public profiles by id → Map(id → profile). */
export async function fetchProfiles(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const sb = await client();
  const { data, error } = await sb.from("profiles").select(PROFILE_COLUMNS).in("id", unique);
  if (error) throw toError(error);
  return new Map((data || []).map((p) => [p.id, p]));
}

/** Latest message per conversation → Map(conversationId → message). */
async function lastMessages(sb, ids) {
  const out = new Map();
  if (!ids.length) return out;
  const { data, error } = await sb
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .in("conversation_id", ids)
    .order("created_at", { ascending: false })
    .limit(Math.min(ids.length * 4, 400));
  if (error) throw toError(error);
  for (const m of data || []) if (!out.has(m.conversation_id)) out.set(m.conversation_id, m);
  // Very active threads can crowd others out of that window: fetch the rest.
  const missing = ids.filter((id) => !out.has(id));
  await Promise.all(
    missing.map(async (id) => {
      const { data: row } = await sb.from("messages").select(MESSAGE_COLUMNS).eq("conversation_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (row) out.set(id, row);
    })
  );
  return out;
}

function shapeConversation(row, me) {
  const parts = row.conversation_participants || [];
  const mine = parts.find((p) => p.user_id === me) || {};
  const other = parts.find((p) => p.user_id !== me);
  return {
    id: row.id,
    isRequest: Boolean(row.is_request),
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
    createdBy: row.created_by,
    lastReadAt: mine.last_read_at || null,
    hidden: Boolean(mine.hidden),
    otherId: other?.user_id || null,
    other: null,
    last: null,
    request: null,
  };
}

/**
 * One page of my conversations, newest activity first (keyset on
 * last_message_at, id). Incoming requests I haven't accepted are excluded
 * (they live in listRequests); my own pending/declined requests are kept.
 *   → { items, nextCursor: { before, beforeId } | null }
 */
export async function listConversations(me, { cursor = null, limit = 30 } = {}) {
  const sb = await client();
  let q = sb
    .from("conversations")
    .select(CONVERSATION_COLUMNS)
    .not("last_message_at", "is", null)
    .order("last_message_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (cursor) q = q.or(`last_message_at.lt.${quote(cursor.before)},and(last_message_at.eq.${quote(cursor.before)},id.lt.${quote(cursor.beforeId)})`);
  const { data, error } = await q;
  if (error) throw toError(error);
  const rows = data || [];
  const more = rows.length > limit;
  let page = rows.slice(0, limit);

  // Conversations without any message yet (just opened) — first page only.
  if (!cursor) {
    const { data: fresh } = await sb.from("conversations").select(CONVERSATION_COLUMNS).is("last_message_at", null).order("created_at", { ascending: false }).limit(20);
    page = [...page, ...(fresh || [])];
  }

  let items = page.map((r) => shapeConversation(r, me)).filter((c) => !c.hidden && c.otherId);
  const requestIds = items.filter((c) => c.isRequest).map((c) => c.id);
  const [profiles, lasts, requests] = await Promise.all([
    fetchProfiles(items.map((c) => c.otherId)),
    lastMessages(sb, items.filter((c) => c.lastMessageAt).map((c) => c.id)),
    requestIds.length
      ? sb.from("message_requests").select("id, conversation_id, requester_id, recipient_id, status, created_at").in("conversation_id", requestIds)
      : Promise.resolve({ data: [] }),
  ]);
  const reqByConv = new Map();
  for (const r of requests.data || []) {
    const prev = reqByConv.get(r.conversation_id);
    if (!prev || prev.created_at < r.created_at) reqByConv.set(r.conversation_id, r);
  }
  items = items
    .map((c) => {
      const r = reqByConv.get(c.id);
      return {
        ...c,
        other: profiles.get(c.otherId) || null,
        last: lasts.get(c.id) || null,
        request: r ? { id: r.id, status: r.status, requesterId: r.requester_id, recipientId: r.recipient_id } : null,
      };
    })
    // incoming requests appear under "Requests" until accepted
    .filter((c) => !(c.isRequest && c.request && c.request.recipientId === me));

  const lastRow = rows[Math.min(rows.length, limit) - 1];
  return {
    items: sortConversations(items),
    nextCursor: more && lastRow ? { before: lastRow.last_message_at, beforeId: lastRow.id } : null,
  };
}

/** Pending message requests addressed to me (newest first). */
export async function listRequests(me, { limit = 50 } = {}) {
  const sb = await client();
  const { data, error } = await sb
    .from("message_requests")
    .select("id, conversation_id, requester_id, recipient_id, status, created_at")
    .eq("recipient_id", me)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw toError(error);
  const rows = data || [];
  const [profiles, lasts] = await Promise.all([
    fetchProfiles(rows.map((r) => r.requester_id)),
    lastMessages(sb, rows.map((r) => r.conversation_id)),
  ]);
  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    requesterId: r.requester_id,
    createdAt: r.created_at,
    other: profiles.get(r.requester_id) || null,
    last: lasts.get(r.conversation_id) || null,
  }));
}

/** One conversation (for ?c= deep links and threads opened from requests). */
export async function getConversation(me, id) {
  const sb = await client();
  const { data, error } = await sb.from("conversations").select(CONVERSATION_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw toError(error);
  if (!data) return null;
  const c = shapeConversation(data, me);
  const [profiles, req] = await Promise.all([
    fetchProfiles([c.otherId]),
    c.isRequest
      ? sb.from("message_requests").select("id, requester_id, recipient_id, status, created_at").eq("conversation_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const r = req.data;
  return {
    ...c,
    other: profiles.get(c.otherId) || null,
    request: r ? { id: r.id, status: r.status, requesterId: r.requester_id, recipientId: r.recipient_id } : null,
  };
}

/**
 * Messages of a conversation, newest page first (keyset on created_at, id),
 * returned oldest → newest for rendering. → { items, nextCursor }
 */
export async function listMessages(conversationId, { cursor = null, limit = 40 } = {}) {
  const sb = await client();
  let q = sb
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (cursor) q = q.or(`created_at.lt.${quote(cursor.before)},and(created_at.eq.${quote(cursor.before)},id.lt.${quote(cursor.beforeId)})`);
  const { data, error } = await q;
  if (error) throw toError(error);
  const rows = data || [];
  const more = rows.length > limit;
  const page = rows.slice(0, limit);
  const oldest = page[page.length - 1];
  const nextCursor = more && oldest ? { before: oldest.created_at, beforeId: oldest.id } : null;
  const hidden = await deletedForMe(sb, page.map((m) => m.id));
  return { items: page.filter((m) => !hidden.has(m.id)).reverse(), nextCursor };
}

/** Ids among `ids` I removed "for me" earlier (message_deletes, own rows). Best effort. */
async function deletedForMe(sb, ids) {
  if (!ids.length) return new Set();
  try {
    const { data, error } = await sb.from("message_deletes").select("message_id").in("message_id", ids);
    return new Set(error ? [] : (data || []).map((r) => r.message_id));
  } catch {
    return new Set();
  }
}

/** Insert a text message (RLS + can_send_message() decide). */
export async function sendMessage(conversationId, me, content) {
  const sb = await client();
  const { data, error } = await sb.from("messages").insert({ conversation_id: conversationId, sender_id: me, content }).select(MESSAGE_COLUMNS).single();
  if (error) throw toError(error);
  return data;
}

/** Delete my message for everyone (30-minute window enforced by the DB). */
export async function deleteForEveryone(messageId) {
  const sb = await client();
  const { data, error } = await sb.from("messages").update({ deleted_for_all: true }).eq("id", messageId).select(MESSAGE_COLUMNS).maybeSingle();
  if (error) throw toError(error);
  if (!data) throw chatError("unknown");
  return data;
}

// Blocks go through src/lib/social.js so the community feed's blocked-ids
// cache stays in sync and a block also ends my follow (blocks are readable by
// the blocker only, so "blocked by them" is only learnt when sending fails).
/** Did I block this member? */
export async function isBlockedByMe(otherId) {
  if (!otherId) return false;
  return (await (await social()).getBlockedIds()).has(otherId);
}

export async function setBlocked(otherId, blocked) {
  const s = await social();
  if (blocked) await s.blockUser(otherId);
  else await s.unblockUser(otherId);
  return blocked;
}

/**
 * Realtime: new/updated messages in any of my conversations (RLS-filtered)
 * and requests addressed to me. Returns an unsubscribe function.
 */
export async function subscribeInbox(me, { onMessage, onMessageUpdate, onRequest }) {
  let sb;
  try {
    sb = await client();
  } catch {
    return () => {};
  }
  let channel;
  try {
    channel = sb
      .channel(`dm-inbox:${me}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => onMessage?.(p.new))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (p) => onMessageUpdate?.(p.new))
      .on("postgres_changes", { event: "*", schema: "public", table: "message_requests", filter: `recipient_id=eq.${me}` }, () => onRequest?.())
      .subscribe();
  } catch {
    return () => {};
  }
  return () => {
    try {
      sb.removeChannel(channel);
    } catch {}
  };
}

// Request / receipt RPCs live in src/lib/social.js (security-reviewed
// wrappers → { ok, reason }). Loaded lazily so the Supabase client stays out
// of the route's first-load bundle, and re-exported so the messenger has a
// single data entry point.
const social = () => import("@/lib/social");
export const startConversation = async (otherId) => (await social()).startConversation(otherId);
export const respondMessageRequest = async (requestId, accept) => (await social()).respondMessageRequest(requestId, accept);
export const markConversationRead = async (conversationId) => (await social()).markConversationRead(conversationId);
