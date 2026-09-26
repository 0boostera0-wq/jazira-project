// ============================================================================
// Direct messages — pure helpers (no I/O): thread layout, receipts, previews,
// list ordering. Used by the messenger UI and tests/unit/chat.test.js.
// ============================================================================

export const MESSAGE_MAX = 4000; // messages_content_length (DB CHECK)
export const DELETE_WINDOW_MS = 30 * 60 * 1000; // messages_guard(): 30 minutes
const GROUP_GAP_MS = 5 * 60 * 1000;

const time = (iso) => {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
};

/** Local calendar day key "YYYY-MM-DD" of an ISO timestamp. */
export function dayKey(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "today" | "yesterday" | null for a day key relative to `now`. */
export function relativeDay(key, now = new Date()) {
  if (key === dayKey(now.toISOString())) return "today";
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (key === dayKey(y.toISOString())) return "yesterday";
  return null;
}

/** Sort + dedupe by id (a realtime echo and the insert response can both arrive). */
export function mergeMessages(list, incoming) {
  const byId = new Map();
  for (const m of [...list, ...incoming]) {
    if (!m?.id) continue;
    byId.set(m.id, { ...byId.get(m.id), ...m });
  }
  return [...byId.values()].sort((a, b) => time(a.created_at) - time(b.created_at) || (a.id < b.id ? -1 : 1));
}

/**
 * Messages (oldest first) → render items with day separators and sender
 * groups (same sender, < 5 minutes apart, same day):
 *   { type: "day", key } | { type: "msg", message, mine, groupStart, groupEnd }
 */
export function buildThreadItems(messages, me) {
  const items = [];
  let prevDay = null;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const key = dayKey(m.created_at);
    if (key !== prevDay) {
      items.push({ type: "day", key });
      prevDay = key;
    }
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const joinsPrev = prev && prev.sender_id === m.sender_id && dayKey(prev.created_at) === key && time(m.created_at) - time(prev.created_at) < GROUP_GAP_MS;
    const joinsNext = next && next.sender_id === m.sender_id && dayKey(next.created_at) === key && time(next.created_at) - time(m.created_at) < GROUP_GAP_MS;
    items.push({ type: "msg", message: m, mine: m.sender_id === me, groupStart: !joinsPrev, groupEnd: !joinsNext });
  }
  return items;
}

/** Can `me` still delete this message for everyone? (the DB re-checks) */
export function canDeleteForAll(m, me, now = Date.now()) {
  if (!m || m.sender_id !== me || m.deleted_for_all || m.pending || m.failed) return false;
  return now - time(m.created_at) < DELETE_WINDOW_MS;
}

/** Receipt state for my own message. */
export function tickState(m) {
  if (m.failed) return "failed";
  if (m.pending) return "sending";
  if (m.read_at) return "read";
  if (m.delivered_at) return "delivered";
  return "sent";
}

/** Short list preview of a conversation's last message. */
export function previewOf(m, me) {
  if (!m) return { kind: "none", mine: false, text: "" };
  const mine = m.sender_id === me;
  if (m.deleted_for_all) return { kind: "deleted", mine, text: "" };
  const text = (m.content || "").replace(/\s+/g, " ").trim();
  if (!text && m.media_url) return { kind: "media", mine, text: "" };
  return { kind: "text", mine, text: text.slice(0, 140) };
}

/** Unread = the latest message is someone else's and newer than my last read. */
export function isUnread(conv, me) {
  const last = conv?.last;
  if (!last || last.sender_id === me || last.deleted_for_all) return false;
  const readAt = conv.lastReadAt ? time(conv.lastReadAt) : 0;
  return time(last.created_at) > readAt;
}

/** Newest activity first (last message, else creation). */
export function sortConversations(list) {
  const at = (c) => time(c.last?.created_at || c.lastMessageAt || c.createdAt);
  return [...list].sort((a, b) => at(b) - at(a) || (a.id < b.id ? 1 : -1));
}

/** Apply an incoming message to the inbox list: preview, order, unread. */
export function applyIncoming(list, message) {
  const idx = list.findIndex((c) => c.id === message.conversation_id);
  if (idx === -1) return { list, known: false };
  const conv = list[idx];
  const newer = !conv.last || time(message.created_at) >= time(conv.last.created_at);
  const updated = newer ? { ...conv, last: message, lastMessageAt: message.created_at } : conv;
  const next = [...list];
  next[idx] = updated;
  return { list: sortConversations(next), known: true };
}

/** Composer text → what we send (or null when nothing / too long). */
export function outgoingText(raw) {
  const text = String(raw ?? "").replace(/\r\n?/g, "\n").trim();
  if (!text || text.length > MESSAGE_MAX) return null;
  return text;
}

/**
 * Who may write in this conversation right now, from what the client can see.
 * The database (can_send_message) remains the authority.
 *   "ok" | "incomingRequest" | "requestSent" | "declined" | "blockedByMe"
 */
export function composerState(conv, me, { blockedByMe = false } = {}) {
  if (blockedByMe) return "blockedByMe";
  const req = conv?.request;
  if (conv?.isRequest && req) {
    if (req.recipientId === me) return "incomingRequest";
    if (req.status === "rejected") return "declined";
    return "requestSent";
  }
  return "ok";
}

/**
 * Compact time for the conversation list: today → clock time, this week →
 * weekday, older → day + month. Returns { kind, opts } for formatDate so the
 * caller formats in the active locale.
 */
export function listTimeFormat(iso, now = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const key = dayKey(iso);
  if (key === dayKey(now.toISOString())) return { kind: "time", opts: { hour: "numeric", minute: "2-digit" } };
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (d.getTime() >= startToday - 6 * 86400000) return { kind: "weekday", opts: { weekday: "short" } };
  if (d.getFullYear() === now.getFullYear()) return { kind: "date", opts: { day: "numeric", month: "short" } };
  return { kind: "date", opts: { day: "numeric", month: "short", year: "numeric" } };
}

/** "rtl" | "ltr" from the first strongly-directional letter (undefined if none). */
export function dirOfText(text) {
  const m = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF]|[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/.exec(String(text ?? ""));
  if (!m) return undefined;
  return /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/.test(m[0]) ? "rtl" : "ltr";
}
