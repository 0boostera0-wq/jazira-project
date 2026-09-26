import { getRouteUser } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { clientIp, isSameOrigin, readJsonBody } from "@/lib/http-guards";
import { isRateLimited } from "@/lib/rate-limit";
import { contactRow, validateContactMessage } from "@/lib/contact-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Contact / feedback inbox (the only writer of public.contact_messages since 0013).
//
//   POST /api/contact   (same-origin)   body: { name, email, topic, message, locale }
//   200 { ok: true }
//   400 { error: "invalid", field } · 400 { error: "invalid_json" } · 413 payload_too_large
//   403 { error: "forbidden" }       cross-site
//   429 { error: "rate_limited" }    5 per hour per client IP (shared limiter), or the
//                                    database's per-email / per-account / guest caps
//   503 { error: "unavailable" }     service role / table missing
//
// A signed-in sender is attributed to their verified account (never a
// client-supplied id). Guests are limited per IP here and platform-wide by
// the database trigger.
const PER_IP = { max: 5, windowSeconds: 3600 };
const MISSING = new Set(["PGRST204", "PGRST205", "42P01", "42703"]);
const reply = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req) {
  if (!isSameOrigin(req)) return reply({ error: "forbidden" }, 403);
  const body = await readJsonBody(req, 16 * 1024);
  if (!body.ok) return reply({ error: body.error }, body.status);
  const input = body.value && typeof body.value === "object" ? body.value : {};
  const field = validateContactMessage(input);
  if (field) return reply({ error: "invalid", field }, 400);

  if (await isRateLimited({ bucket: "contact.ip", key: clientIp(req), ...PER_IP })) {
    return reply({ error: "rate_limited" }, 429);
  }

  const admin = createAdminClient();
  if (!admin) {
    console.error("[contact] Missing env: SUPABASE_SERVICE_ROLE_KEY and/or NEXT_PUBLIC_SUPABASE_URL");
    return reply({ error: "unavailable" }, 503);
  }
  let userId = null;
  try {
    userId = (await getRouteUser()).user?.id || null;
  } catch {
    userId = null; // auth unreachable → a guest message
  }

  let error;
  try {
    ({ error } = await admin.from("contact_messages").insert(contactRow(input, userId)));
  } catch (e) {
    error = { message: String(e?.message || e) };
  }
  if (!error) return reply({ ok: true });
  if (error.message === "rate_limited") return reply({ error: "rate_limited" }, 429);
  if (error.code === "23514" || error.code === "22001") return reply({ error: "invalid", field: null }, 400);
  if (!MISSING.has(error.code)) console.error("[contact] insert failed:", error.code || "", String(error.message || "").slice(0, 200));
  return reply({ error: "unavailable" }, 503);
}
