// Shared numeric / configuration constants. No UI copy here: every
// user-visible string lives in src/i18n/messages/{ar,en} (docs/CONVENTIONS.md §2).

// Elite subscription — the displayed price. What Elite includes is described
// in the subscriptions messages and enforced by the database (has_premium()).
export const ELITE = { priceSAR: 19 };

// Referral reward — NOT Elite: it never sets is_elite and never shows the crown.
// Enforced server-side by ai_quota() (+5 assistant messages at 5 invites).
export const REFERRAL_TARGET = 5; // successful invites to unlock the reward
export const REFERRAL_REWARD = { bonusAiMessages: 5 };

// AI Assistant usage limits (free members; Elite = unlimited). Mirrored by
// public.ai_quota() — change both together.
export const AI_FREE_LIMIT = 5; // messages
export const AI_WINDOW_MS = 8 * 60 * 60 * 1000; // 8 hours

// Live support (WhatsApp)
export const SUPPORT_WHATSAPP = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || "966573902089";

/**
 * WhatsApp chat link to support. `text` pre-fills the first message: pass a
 * localized message (e.g. t("whatsapp.prefill")); without it the chat opens
 * empty rather than typing a message in the wrong language.
 */
export function supportWhatsAppUrl(text) {
  const base = `https://wa.me/${SUPPORT_WHATSAPP}`;
  const prefill = typeof text === "string" ? text.trim().slice(0, 500) : "";
  return prefill ? `${base}?text=${encodeURIComponent(prefill)}` : base;
}

// Storage keys (localStorage)
export const STORAGE = {
  theme: "jazira_theme_v1", // "light" | "dark"
};
