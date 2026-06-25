// Per-user chat persistence for the AI Assistant.
//
// Conversations persist in localStorage keyed by the user's id, so a signed-in
// user finds their history after logging out and back in (on the same device).
// Guests use a shared "guest" bucket.
//
// NOTE: localStorage is per-device. For true cross-device sync you'd point
// these same functions at an API/DB (e.g. /api/conversations). The interface
// below is intentionally storage-agnostic so that swap is a one-file change.

import { STORAGE } from "@/lib/constants";

const keyFor = (userId) => `${STORAGE.chats}:${userId || "guest"}`;

function read(userId) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function write(userId, conversations) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify(conversations));
  } catch {}
}

export function newId() {
  return "c_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Returns conversations sorted by most-recently-updated.
export function listConversations(userId) {
  return read(userId).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getConversation(userId, id) {
  return read(userId).find((c) => c.id === id) || null;
}

// Derive a short Arabic title from the first user message.
export function deriveTitle(messages) {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "محادثة جديدة";
  const t = firstUser.content.trim().replace(/\s+/g, " ");
  return t.length > 38 ? t.slice(0, 38) + "…" : t;
}

// Insert or update a conversation, then return the saved record.
export function upsertConversation(userId, convo) {
  const all = read(userId);
  const idx = all.findIndex((c) => c.id === convo.id);
  const record = {
    ...convo,
    title: convo.title || deriveTitle(convo.messages || []),
    updatedAt: Date.now(),
    createdAt: convo.createdAt || Date.now(),
  };
  if (idx >= 0) all[idx] = record;
  else all.push(record);
  write(userId, all);
  return record;
}

export function deleteConversation(userId, id) {
  write(
    userId,
    read(userId).filter((c) => c.id !== id)
  );
}

// Pull the user's server-side history (Supabase, RLS-protected) and merge any
// conversations missing locally. Lets history follow the account across devices.
export async function hydrateFromServer(userId) {
  if (!userId || typeof window === "undefined") return read(userId);
  try {
    const res = await fetch("/api/chat-history", { cache: "no-store" });
    if (!res.ok) return read(userId);
    const rows = await res.json();
    if (!Array.isArray(rows)) return read(userId);

    // Group flat messages by session_id into conversations.
    const bySession = new Map();
    for (const r of rows) {
      const sid = r.session_id;
      if (!sid) continue;
      if (!bySession.has(sid)) bySession.set(sid, []);
      bySession.get(sid).push({
        role: r.message_type === "assistant" ? "assistant" : "user",
        content: r.content || "",
        at: r.created_at,
      });
    }

    const local = read(userId);
    const localIds = new Set(local.map((c) => c.id));
    for (const [sid, msgs] of bySession) {
      if (localIds.has(sid)) continue; // keep the richer local copy
      const ts = msgs[0]?.at ? new Date(msgs[0].at).getTime() : Date.now();
      local.push({
        id: sid,
        messages: [{ role: "assistant", content: "مرحباً بك في منصة جزيرة! كيف أقدر أساعدك اليوم؟ 🏝️" }, ...msgs.map((m) => ({ role: m.role, content: m.content }))],
        title: deriveTitle(msgs),
        createdAt: ts,
        updatedAt: ts,
      });
    }
    write(userId, local);
    return local;
  } catch {
    return read(userId);
  }
}

export function clearConversations(userId) {
  write(userId, []);
}

// Case-insensitive search across title + message bodies.
export function searchConversations(userId, query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return listConversations(userId);
  return listConversations(userId).filter((c) => {
    if (c.title?.toLowerCase().includes(q)) return true;
    return (c.messages || []).some((m) => m.content?.toLowerCase().includes(q));
  });
}
