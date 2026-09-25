// ============================================================================
// Contact / feedback inbox — client data layer (see docs/DATA_API.md → "Contact").
//
// Writes one row to public.contact_messages (insert-only for anon and signed-in
// users; the team reads it with the service role). The database validates the
// same limits and refuses a 4th message within an hour from the same email or
// account ('rate_limited').
//
//   sendContactMessage({ name, email, topic, message, locale })
//     → { ok: true }
//     | { ok: false, code: "invalid" | "rate_limited" | "unavailable" | "network", field? }
// Never throws.
// ============================================================================
import { getSupabase } from "@/lib/supabase-lazy";

export const CONTACT_TOPICS = ["general", "technical", "billing", "content", "partnership", "other"];
export const CONTACT_LIMITS = Object.freeze({ nameMin: 2, nameMax: 80, emailMax: 254, messageMin: 10, messageMax: 4000 });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/;
const MISSING = new Set(["PGRST204", "PGRST205", "42P01", "42703"]);

/** Client-side mirror of the database checks. → null | field name */
export function validateContactMessage({ name, email, topic, message, locale } = {}) {
  const n = String(name ?? "").trim().replace(/\s+/g, " ");
  if (n.length < CONTACT_LIMITS.nameMin || n.length > CONTACT_LIMITS.nameMax || CONTROL_RE.test(n)) return "name";
  const e = String(email ?? "").trim();
  if (e.length > CONTACT_LIMITS.emailMax || !EMAIL_RE.test(e)) return "email";
  if (!CONTACT_TOPICS.includes(topic)) return "topic";
  const m = String(message ?? "").trim();
  if (m.length < CONTACT_LIMITS.messageMin || m.length > CONTACT_LIMITS.messageMax) return "message";
  if (locale !== undefined && locale !== null && locale !== "ar" && locale !== "en") return "locale";
  return null;
}

export async function sendContactMessage(input = {}) {
  const field = validateContactMessage(input);
  if (field) return { ok: false, code: "invalid", field };

  let supabase = null;
  try {
    supabase = await getSupabase();
  } catch {
    supabase = null;
  }
  if (!supabase) return { ok: false, code: "unavailable" };

  let userId = null;
  try {
    const { data } = await supabase.auth.getSession();
    userId = data?.session?.user?.id || null;
  } catch {
    userId = null;
  }

  const row = {
    user_id: userId,
    name: String(input.name).trim().replace(/\s+/g, " "),
    email: String(input.email).trim().toLowerCase(),
    topic: input.topic,
    message: String(input.message).trim(),
    locale: input.locale === "en" ? "en" : "ar",
  };

  let error;
  try {
    // No .select(): the table is write-only for clients (no RETURNING allowed).
    ({ error } = await supabase.from("contact_messages").insert(row));
  } catch {
    return { ok: false, code: "network" };
  }
  if (!error) return { ok: true };
  if (error.message === "rate_limited") return { ok: false, code: "rate_limited" };
  if (error.code === "23514" || error.code === "22001") return { ok: false, code: "invalid" };
  if (MISSING.has(error.code)) return { ok: false, code: "unavailable" };
  if (!error.code && /fetch|network|load failed/i.test(`${error.message || ""} ${error.details || ""}`)) {
    return { ok: false, code: "network" };
  }
  return { ok: false, code: "unavailable" };
}
