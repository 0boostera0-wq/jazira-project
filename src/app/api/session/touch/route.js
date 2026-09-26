import { createClient as createServerSupabase } from "@/lib/supabase-server";
import { isSameOrigin, readJsonBody } from "@/lib/http-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stamp the caller's active-session row with an APPROXIMATE location (city +
// country) derived from edge geo headers. Privacy-respecting by design: city /
// country granularity only, no precise coordinates, and NO browser geolocation
// permission prompt.
//
//   POST /api/session/touch   (same-origin)   body: { session_id }
//   200 { ok: true | false }   403 { error: "forbidden" }   413 / 400 on a bad body
//
// Stored per row: `city` (as the platform reports it), `country_code` (ISO
// 3166-1 alpha-2 — the UI names it in the reader's language with
// Intl.DisplayNames) and the legacy `location` "City, CC" string.
// Best-effort — it answers { ok: false } without failing when the user isn't
// signed in, geo headers are absent (local dev) or columns are missing.
const SESSION_ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
const MISSING_COLUMN = new Set(["42703", "PGRST204"]);

function geo(req) {
  let city = "";
  try {
    city = decodeURIComponent(req.headers.get("x-vercel-ip-city") || "").trim().slice(0, 100);
  } catch {
    city = "";
  }
  const cc = (req.headers.get("x-vercel-ip-country") || "").trim().toUpperCase();
  const country = /^[A-Z]{2}$/.test(cc) ? cc : "";
  return { city, country };
}

export async function POST(req) {
  if (!isSameOrigin(req)) return Response.json({ error: "forbidden" }, { status: 403 });
  const body = await readJsonBody(req, 1024);
  if (!body.ok) return Response.json({ error: body.error }, { status: body.status });
  const sessionId = body.value?.session_id;
  if (typeof sessionId !== "string" || !SESSION_ID_RE.test(sessionId)) return Response.json({ ok: false });

  try {
    const supabase = await createServerSupabase();
    if (!supabase) return Response.json({ ok: false });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ ok: false });

    const { city, country } = geo(req);
    const location = [city, country].filter(Boolean).join(", ");
    if (!location) return Response.json({ ok: true }); // nothing to record

    // RLS (sessions_update_own) scopes this to the caller's own row.
    const scope = (q) => q.eq("user_id", user.id).eq("session_id", sessionId);
    let { error } = await scope(supabase.from("user_sessions")
      .update({ location, city: city || null, country_code: country || null }));
    if (error && MISSING_COLUMN.has(error.code)) {
      ({ error } = await scope(supabase.from("user_sessions").update({ location }))); // pre-0013 database
    }
    return Response.json({ ok: !error });
  } catch {
    return Response.json({ ok: false });
  }
}
