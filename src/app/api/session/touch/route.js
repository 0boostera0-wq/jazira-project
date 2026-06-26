import { createClient as createServerSupabase } from "@/lib/supabase-server";
import { headers } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stamp the caller's active-session row with an APPROXIMATE location (city +
// country) derived from edge geo headers. Privacy-respecting by design: city /
// country granularity only, no precise coordinates, and NO browser geolocation
// permission prompt. Everything is best-effort — it no-ops silently when:
//   • the user isn't signed in,
//   • no session_id is supplied,
//   • geo headers are absent (local dev / non-Vercel hosts), or
//   • the `location` column hasn't been migrated yet (migration 0007).
// So sessions keep working perfectly even when location can't be resolved.
export async function POST(request) {
  try {
    const { session_id } = await request.json().catch(() => ({}));
    if (!session_id) return Response.json({ ok: false });

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ ok: false });

    const h = await headers();
    const rawCity = h.get("x-vercel-ip-city");
    const city = rawCity ? decodeURIComponent(rawCity) : "";
    const country = h.get("x-vercel-ip-country") || "";
    const location = [city, country].filter(Boolean).join(", ");
    if (!location) return Response.json({ ok: true }); // nothing to record

    // RLS (sessions_update_own) scopes this to the caller's own row.
    await supabase
      .from("user_sessions")
      .update({ location })
      .eq("user_id", user.id)
      .eq("session_id", session_id);

    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false });
  }
}
