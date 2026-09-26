// ============================================================================
// Settings — pure helpers (no React, no Supabase). Safe on server and client,
// unit-tested in tests/unit/settings-model.test.js.
//
// Cooldowns mirror the database writers (docs/SECURITY.md §4):
//   update_full_name  14 days · 24 hours for Elite     (0009)
//   set_avatar        10 days · none for Elite          (0009)
//   update_phone      24 hours                          (0006)
//   update_bio        ≤ 300 characters                  (0008)
// The server is the authority; these values only drive the UI messaging.
// ============================================================================

export const SECTION_IDS = ["profile", "account", "preferences", "notifications", "privacy", "subscription", "danger"];
export const DEFAULT_SECTION = "profile";

/** A valid section id from a raw ?section= value, or null. */
export function sectionFrom(value) {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" && SECTION_IDS.includes(v) ? v : null;
}

export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

export const COOLDOWNS = Object.freeze({
  name: { free: 14 * DAY_MS, elite: DAY_MS },
  avatar: { free: 10 * DAY_MS, elite: 0 },
  phone: { free: DAY_MS, elite: DAY_MS },
});

export const BIO_MAX = 300;
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
// A subset of the `avatars` bucket's types (0009; same as sign-up). Never SVG: it is a scriptable document.
export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const AVATAR_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Columns a client may update directly on its own profiles row (guard trigger allow-list). */
export const PROFILE_FLAG_COLUMNS = ["show_elite_badge", "anonymous_community"];

export function cooldownMs(kind, isElite) {
  const c = COOLDOWNS[kind];
  if (!c) return 0;
  return isElite ? c.elite : c.free;
}

const toMs = (v) => {
  if (v == null || v === "") return null;
  const n = v instanceof Date ? v.getTime() : typeof v === "number" ? v : new Date(v).getTime();
  return Number.isFinite(n) ? n : null;
};

/**
 * Milliseconds until `kind` may change again (0 = now).
 * @param {string|number|Date|null} changedAt  last change (from get_my_private_profile)
 */
export function cooldownLeft(kind, changedAt, isElite, now = Date.now()) {
  const at = toMs(changedAt);
  const span = cooldownMs(kind, isElite);
  if (at == null || !span) return 0;
  return Math.max(0, at + span - now);
}

/** When the cooldown ends (ms epoch), or null when there is none. */
export function cooldownEndsAt(kind, changedAt, isElite, now = Date.now()) {
  const left = cooldownLeft(kind, changedAt, isElite, now);
  return left > 0 ? now + left : null;
}

/**
 * Coarse duration for messaging: ≥ 1 day → days + hours, otherwise hours +
 * minutes. Minutes round UP so a pending cooldown never reads "0 minutes".
 */
export function splitDuration(ms) {
  const totalMin = Math.max(0, Math.ceil(ms / MINUTE_MS));
  const days = Math.floor(totalMin / (24 * 60));
  const hours = Math.floor((totalMin % (24 * 60)) / 60);
  const minutes = totalMin % 60;
  if (days > 0) return { days, hours, minutes: 0 };
  return { days: 0, hours, minutes };
}

// ── errors ────────────────────────────────────────────────────────────────
const MISSING = new Set(["PGRST202", "PGRST204", "PGRST205", "42P01", "42883", "42703"]);
const RPC_CODES = [
  ["name_cooldown", "nameCooldown"],
  ["invalid_name_format", "invalidName"],
  ["phone_cooldown", "phoneCooldown"],
  ["invalid_phone", "invalidPhone"],
  ["bio_too_long", "bioTooLong"],
  ["avatar_cooldown", "avatarCooldown"],
  ["invalid_avatar_url", "avatarInvalid"],
  ["not_authenticated", "sessionExpired"],
];

/** A settings error: an Error with name "SettingsError" and a stable `code` (a settings.errors.* key). */
export function settingsError(code, cause) {
  const e = new Error(code);
  e.name = "SettingsError";
  e.code = code;
  if (cause !== undefined) e.cause = cause;
  return e;
}

/** Map a Supabase / PostgREST / fetch error to a settings.errors.* key. */
export function errorCode(err) {
  if (!err) return "generic";
  if (err.name === "SettingsError" && err.code) return err.code;
  const msg = String(err.message || "");
  const hit = RPC_CODES.find(([raw]) => msg.includes(raw));
  if (hit) return hit[1];
  if (MISSING.has(err.code) || /could not find|schema cache/i.test(msg)) return "unavailable";
  if (err.code === "42501" || /row-level security|permission denied/i.test(msg)) return "forbidden";
  if (/failed to fetch|network|load failed|fetch failed/i.test(msg) || err.name === "AuthRetryableFetchError") return "network";
  return "generic";
}

export const toSettingsError = (err) => settingsError(errorCode(err), err);

// ── account deletion (/api/account/delete) ─────────────────────────────────
/** HTTP status (+ JSON body) of POST /api/account/delete → settings.danger.errors.* key. */
export function deleteErrorCode(status, body) {
  const code = body && typeof body === "object" ? body.error : null;
  if (status === 501 || (code === "not_configured" && status !== 503)) return "notConfigured";
  if (status === 503) return "unavailable";
  if (status === 401 || code === "unauthorized") return "unauthorized";
  return "failed";
}

/** Typed confirmation: case-, space- and direction-mark-insensitive. */
export function phraseMatches(input, phrase) {
  const norm = (s) => String(s || "").replace(/[\u200e\u200f\u061c]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
  return Boolean(norm(phrase)) && norm(input) === norm(phrase);
}

// ── sign-in methods ────────────────────────────────────────────────────────
/**
 * Which ways the user signs in, from a Supabase auth user.
 * No identities at all (older sessions) → assume email so the password form stays available.
 */
export function signInMethods(user) {
  const ids = Array.isArray(user?.identities) ? user.identities : [];
  const providers = new Set(ids.map((i) => i?.provider).filter(Boolean));
  const meta = user?.app_metadata || {};
  if (meta.provider) providers.add(meta.provider);
  if (Array.isArray(meta.providers)) meta.providers.forEach((p) => p && providers.add(p));
  const email = providers.has("email") || providers.size === 0;
  const google = providers.has("google");
  const others = [...providers].filter((p) => p !== "email" && p !== "google");
  return { email, google, others, canChangePassword: email };
}

// ── sessions (user_sessions rows written by SessionTracker + lib/device.js) ─
// parseDevice() stores Arabic labels for device type / unknown values.
const DEVICE_TYPES = { "جوال": "mobile", "جهاز لوحي": "tablet", "حاسوب": "desktop", mobile: "mobile", tablet: "tablet", desktop: "desktop" };
const UNKNOWN_OS = new Set(["نظام غير معروف", "unknown", ""]);
const UNKNOWN_BROWSER = new Set(["متصفح", "browser", "unknown", ""]);

export function deviceInfo(row) {
  const type = DEVICE_TYPES[String(row?.device_type || "").trim()] || "unknown";
  const os = String(row?.os || "").trim();
  const browser = String(row?.browser || "").trim();
  return {
    type,
    os: UNKNOWN_OS.has(os) ? null : os,
    browser: UNKNOWN_BROWSER.has(browser) ? null : browser,
    location: String(row?.location || "").trim() || null,
  };
}

/** Current device first, then most recently active. */
export function sortSessions(rows, currentSid) {
  const time = (r) => toMs(r?.last_active_at) || 0;
  return [...(rows || [])].sort((a, b) => {
    if (a.session_id === currentSid) return -1;
    if (b.session_id === currentSid) return 1;
    return time(b) - time(a);
  });
}

export const isRecentlyActive = (ts, now = Date.now(), windowMs = 5 * MINUTE_MS) => {
  const at = toMs(ts);
  return at != null && now - at < windowMs;
};

// ── notification preferences ───────────────────────────────────────────────
/**
 * Mentions are gated twice in the database: notification_preferences.mentions
 * (delivery gate) and user_social_settings.notify_mentions (mention trigger).
 * The effective switch is on only when both are on.
 */
export function effectiveNotificationPrefs(prefs, social) {
  const out = { ...(prefs || {}) };
  if (social && social.notify_mentions === false) out.mentions = false;
  return out;
}
