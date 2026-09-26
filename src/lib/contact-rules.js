// Contact / feedback inbox — shared validation (client form, data layer and
// POST /api/contact). Mirrors the CHECKs on public.contact_messages (0010).
export const CONTACT_TOPICS = ["general", "technical", "billing", "content", "partnership", "other"];
export const CONTACT_LIMITS = Object.freeze({ nameMin: 2, nameMax: 80, emailMax: 254, messageMin: 10, messageMax: 4000 });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

/** → null (valid) | the first invalid field name */
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

/** The row to store (normalised like the database guard does). */
export function contactRow(input, userId = null) {
  return {
    user_id: userId,
    name: String(input.name).trim().replace(/\s+/g, " "),
    email: String(input.email).trim().toLowerCase(),
    topic: input.topic,
    message: String(input.message).trim(),
    locale: input.locale === "en" ? "en" : "ar",
  };
}
