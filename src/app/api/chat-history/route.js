import { createClient } from "@/lib/supabase-server";
import { groupSessions, isValidSessionId, deriveTitle } from "@/lib/chatStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Jazira Assistant — conversation history (the caller's own chat_history rows;
// RLS: select/delete own). Rows are written only by POST /api/chat.
//
//   GET    /api/chat-history?limit=20&before=<iso>
//          → 200 { sessions: [{ id, title, lastAt }], nextCursor: <iso>|null }
//            conversations grouped by session_id, newest activity first
//            (keyset on the latest user message; pages may repeat a session
//            that spans pages — merge by id)
//   GET    /api/chat-history?session=<id>
//          → 200 { session, messages: [{ id, role, content, created_at }], truncated }
//            oldest first; the latest 200 messages
//   DELETE /api/chat-history?session=<id>   (same-origin)
//          → 200 { ok: true }
//   Errors: 400 { error: "invalid_argument", field } · 401 not_authenticated ·
//           403 forbidden · 503 unavailable (Supabase not configured / table
//           missing) · 500 unknown
// The old POST (it let clients insert forged assistant rows) is gone.
// ---------------------------------------------------------------------------

const NO_STORE = { "Cache-Control": "no-store" };
const json = (body, status = 200) => Response.json(body, { status, headers: NO_STORE });
const MISSING = new Set(["PGRST205", "PGRST202", "42P01", "42883"]);
const SESSION_MESSAGES = 200;

function isSameOrigin(req) {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const host = new URL(origin).host;
    return host === req.headers.get("host") || host === new URL(req.url).host;
  } catch {
    return false;
  }
}

async function authed() {
  const supabase = await createClient();
  if (!supabase) return { res: json({ error: "unavailable" }, 503) };
  let user = null;
  try {
    ({ data: { user } } = await supabase.auth.getUser());
  } catch {
    return { res: json({ error: "unavailable" }, 503) };
  }
  if (!user) return { res: json({ error: "not_authenticated" }, 401) };
  return { supabase, user };
}

function dbError(error) {
  if (MISSING.has(error?.code)) return json({ error: "unavailable" }, 503);
  console.error("[chat-history]", error?.code, error?.message);
  return json({ error: "unknown" }, 500);
}

function parseLimit(raw) {
  if (raw == null || raw === "") return 20;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 50 ? n : null;
}

function parseBefore(raw) {
  if (raw == null || raw === "") return { ok: true, value: null };
  if (raw.length > 40) return { ok: false };
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? { ok: false } : { ok: true, value: raw };
}

async function listSessionsPage(supabase, userId, { limit, before }) {
  const scan = Math.min(400, limit * 12);
  let q = supabase
    .from("chat_history")
    .select("session_id, created_at")
    .eq("user_id", userId)
    .eq("message_type", "user")
    .order("created_at", { ascending: false })
    .limit(scan);
  if (before) q = q.lt("created_at", before);
  const { data: rows, error } = await q;
  if (error) return { error };

  const { sessions, nextCursor } = groupSessions(rows || [], { limit, scanFull: (rows || []).length === scan });

  // Title = the conversation's first user message (one indexed lookup each).
  const titled = await Promise.all(
    sessions.map(async (s) => {
      const { data } = await supabase
        .from("chat_history")
        .select("content")
        .eq("user_id", userId)
        .eq("session_id", s.id)
        .eq("message_type", "user")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      return { id: s.id, title: deriveTitle(data?.content || ""), lastAt: s.lastAt };
    })
  );
  return { sessions: titled, nextCursor };
}

export async function GET(req) {
  const url = new URL(req.url);
  const auth = await authed();
  if (auth.res) return auth.res;
  const { supabase, user } = auth;

  const session = url.searchParams.get("session");
  if (session !== null) {
    if (!isValidSessionId(session)) return json({ error: "invalid_argument", field: "session" }, 400);
    const { data, error } = await supabase
      .from("chat_history")
      .select("id, message_type, content, created_at")
      .eq("user_id", user.id)
      .eq("session_id", session)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(SESSION_MESSAGES + 1);
    if (error) return dbError(error);
    const rows = data || [];
    const truncated = rows.length > SESSION_MESSAGES;
    const messages = rows
      .slice(0, SESSION_MESSAGES)
      .reverse()
      .map((r) => ({ id: r.id, role: r.message_type === "assistant" ? "assistant" : "user", content: r.content || "", created_at: r.created_at }));
    return json({ session, messages, truncated });
  }

  const limit = parseLimit(url.searchParams.get("limit"));
  if (limit === null) return json({ error: "invalid_argument", field: "limit" }, 400);
  const before = parseBefore(url.searchParams.get("before"));
  if (!before.ok) return json({ error: "invalid_argument", field: "before" }, 400);

  const page = await listSessionsPage(supabase, user.id, { limit, before: before.value });
  if (page.error) return dbError(page.error);
  return json(page);
}

export async function DELETE(req) {
  if (!isSameOrigin(req)) return json({ error: "forbidden" }, 403);
  const session = new URL(req.url).searchParams.get("session");
  if (!isValidSessionId(session)) return json({ error: "invalid_argument", field: "session" }, 400);
  const auth = await authed();
  if (auth.res) return auth.res;
  const { error } = await auth.supabase.from("chat_history").delete().eq("user_id", auth.user.id).eq("session_id", session);
  if (error) return dbError(error);
  return json({ ok: true });
}
