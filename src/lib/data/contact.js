// ============================================================================
// Contact / feedback inbox — client data layer (see docs/DATA_API.md → "Contact").
//
// Sends one message through POST /api/contact, which rate-limits per client
// IP (shared across server instances) and writes public.contact_messages with
// the service role (migration 0013: browsers can no longer insert directly —
// a direct insert skipped any per-IP limit). The database still refuses a 4th
// message within an hour from the same email or account, and caps signed-out
// messages platform-wide ('rate_limited').
//
//   sendContactMessage({ name, email, topic, message, locale })
//     → { ok: true }
//     | { ok: false, code: "invalid" | "rate_limited" | "unavailable" | "network", field? }
// Never throws.
// ============================================================================
import { CONTACT_LIMITS, CONTACT_TOPICS, validateContactMessage } from "@/lib/contact-rules";

export { CONTACT_LIMITS, CONTACT_TOPICS, validateContactMessage };

export async function sendContactMessage(input = {}) {
  const field = validateContactMessage(input);
  if (field) return { ok: false, code: "invalid", field };

  let res;
  try {
    res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        name: input.name,
        email: input.email,
        topic: input.topic,
        message: input.message,
        locale: input.locale === "en" ? "en" : "ar",
      }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, code: "network" };
  }
  if (res.ok) return { ok: true };
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (res.status === 429 || body?.error === "rate_limited") return { ok: false, code: "rate_limited" };
  if (res.status === 400 && body?.error === "invalid") {
    return { ok: false, code: "invalid", ...(typeof body.field === "string" ? { field: body.field } : {}) };
  }
  return { ok: false, code: "unavailable" };
}
