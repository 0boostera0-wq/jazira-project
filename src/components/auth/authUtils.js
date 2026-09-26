// Pure helpers shared by the auth forms (no React, safe on server and client).

import { safeNextPath, splitLocale } from "@/i18n/config";

export const DEFAULT_NEXT = "/dashboard";
export const OTP_LENGTH = 6;
export const RESEND_COOLDOWN_S = 60;
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const NAME_MAX = 60;

// Where the sign-up e-mail lives between the sign-up and verify steps (same tab).
export const OTP_EMAIL_KEY = "otp_email";
// When the last sign-up code / recovery link was sent, so each flow's resend
// cooldown survives reloads without leaking into the other flow.
export const SENT_AT_KEYS = { signup: "jazira_auth_signup_sent_at", recovery: "jazira_auth_recovery_sent_at" };

const AUTH_PATHS = ["/sign-in", "/sign-up", "/forgot-password", "/reset-password", "/auth/verify-email", "/profile-setup"];

// Letters accepted in public names — the exact classes of the database's
// is_valid_public_name() (supabase/migrations/0009_security_hardening.sql):
// Latin letters; Arabic letters without digits, punctuation or tatweel; and
// harakat after the first letter of a word.
const LETTER = "A-Za-z\\u0621-\\u063A\\u0641-\\u064A\\u0671-\\u06D3\\u06D5";
const MARK = "\\u064B-\\u065F\\u0670";
const NAME_WORD = `[${LETTER}][${LETTER}${MARK}]*`;
const NAME_RE = new RegExp(`^${NAME_WORD} ${NAME_WORD}$`);
const LETTER_RE = new RegExp(`[${LETTER}]`);

/**
 * Sanitised post-auth destination from a raw `?next=` value. Blocks open
 * redirects (safeNextPath) and loops back into the auth flow itself.
 */
export function resolveNext(raw, fallback = DEFAULT_NEXT) {
  const next = safeNextPath(raw, fallback);
  const { path } = splitLocale(next.split(/[?#]/)[0]);
  if (AUTH_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) return fallback;
  return next;
}

/** Append `?next=` to an auth link only when it carries information. */
export function withNext(href, next) {
  if (!next || next === DEFAULT_NEXT) return href;
  return `${href}${href.includes("?") ? "&" : "?"}next=${encodeURIComponent(next)}`;
}

/** Arabic-Indic (٠-٩) and Persian (۰-۹) digits → ASCII, so Arabic keyboards just work. */
export function toLatinDigits(value) {
  return String(value ?? "").replace(/[٠-٩۰-۹]/g, (d) => String((d.charCodeAt(0) & 0xf) % 10));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const normalizeEmail = (v) => String(v || "").trim();

/** → null when valid, otherwise a `validation.*` key. */
export function emailError(value) {
  const v = normalizeEmail(value);
  if (!v) return "emailRequired";
  if (!EMAIL_RE.test(v)) return "emailInvalid";
  return null;
}

/**
 * Saudi mobile, national part only (5XXXXXXXX): accepts pasted or typed
 * +966 / 00966 / 0 prefixes, spaces and Arabic-Indic digits.
 * National numbers never start with 9, so a leading 966 is always the country code.
 */
export function normalizePhone(value) {
  let d = toLatinDigits(value).replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("9665") || (d.startsWith("966") && d.length > 9)) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  return d.slice(0, 9);
}

export function phoneError(digits) {
  if (!digits) return null; // optional
  return /^5\d{8}$/.test(digits) ? null : "phoneInvalid";
}

/** Password requirements (mirrors common.validation.passwordWeak). */
export function passwordRules(p = "") {
  return {
    length: p.length >= 8,
    mix: LETTER_RE.test(p) && /\d/.test(toLatinDigits(p)),
  };
}

export function newPasswordError(p) {
  if (!p) return "passwordRequired";
  const r = passwordRules(p);
  if (!r.length) return "passwordShort";
  if (!r.mix) return "passwordMix";
  return null;
}

/** 0–4 → weak · fair · good · strong (length and character variety). */
export function passwordScore(p = "") {
  if (!p) return 0;
  const r = passwordRules(p);
  let s = 0;
  if (r.length) s += 1;
  if (r.mix) s += 1;
  if (p.length >= 12) s += 1;
  if (/[^\p{L}\p{N}]/u.test(p) || (/[a-z]/.test(p) && /[A-Z]/.test(p))) s += 1;
  return Math.max(1, s);
}

export const strengthLevel = (score) => (score <= 1 ? "weak" : score === 2 ? "fair" : score === 3 ? "good" : "strong");

/**
 * Display-name check with a localisable reason. Mirrors the database rule
 * (update_full_name / handle_new_user): exactly two words of Arabic or English
 * letters, at most 60 characters — so a name accepted here is never silently
 * dropped at sign-up. (lib/profile validateFullName is looser: its
 * U+0600–U+06FF range also admits Arabic-Indic digits and punctuation.)
 */
export function nameCheck(value) {
  const trimmed = String(value || "").trim().replace(/\s+/g, " ");
  if (!trimmed) return { ok: false, key: "nameRequired" };
  if (NAME_RE.test(trimmed) && trimmed.length <= NAME_MAX) return { ok: true, value: trimmed };
  const words = trimmed.split(" ");
  if (words.length === 1) return { ok: false, key: "nameOneWord" };
  if (words.length > 2) return { ok: false, key: "nameTooMany" };
  return { ok: false, key: "nameChars" };
}

/**
 * A display-name suggestion from a provider name (e.g. Google): first and last
 * word ("Sara Al Otaibi" → "Sara Otaibi"), only when that is a valid name.
 */
export function suggestedName(raw) {
  const words = String(raw || "").trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return "";
  const r = nameCheck(`${words[0]} ${words[words.length - 1]}`);
  return r.ok ? r.value : "";
}

/**
 * Map a Supabase auth / PostgREST error to an `errors.*` message key.
 * Raw error text is never shown to users.
 */
export function authErrorKey(err, fallback = "generic") {
  if (!err) return fallback;
  const code = String(err.code || err.error_code || "").toLowerCase();
  const msg = String(err.message || err.error_description || err.error || "").toLowerCase();
  const status = Number(err.status) || 0;

  if (code === "invalid_credentials" || msg.includes("invalid login credentials")) return "invalidCredentials";
  if (code === "email_not_confirmed" || msg.includes("email not confirmed")) return "emailNotConfirmed";
  if (code === "user_already_exists" || code === "email_exists" || msg.includes("already registered") || msg.includes("already exists")) return "userExists";
  if (code === "weak_password" || msg.includes("password should") || msg.includes("weak password")) return "weakPassword";
  if (code === "same_password" || msg.includes("different from the old")) return "samePassword";
  if (code.startsWith("over_") || status === 429 || msg.includes("rate limit") || msg.includes("security purposes")) return "rateLimit";
  if (code === "otp_expired" || code === "otp_invalid" || msg.includes("token has expired") || msg.includes("otp") || msg.includes("invalid token")) return "otpInvalid";
  if (code === "email_address_invalid" || code === "email_address_not_authorized" || msg.includes("invalid email") || msg.includes("unable to validate email")) return "invalidEmail";
  if (code === "signup_disabled" || code === "email_provider_disabled" || msg.includes("signups not allowed")) return "signupDisabled";
  if (code === "session_not_found" || code === "session_expired" || code === "reauthentication_needed" || code === "refresh_token_not_found" || msg.includes("auth session missing")) return "sessionExpired";
  if (err.name === "AuthRetryableFetchError" || msg.includes("failed to fetch") || msg.includes("network") || msg.includes("load failed")) return "network";
  return fallback;
}

// sessionStorage helpers — storage can be unavailable (private mode, blocked).
export function readSession(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
export function writeSession(key, value) {
  try {
    if (value == null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, String(value));
  } catch {}
}

/** Seconds left before another code/link of `flow` ("signup" | "recovery") may be sent. */
export function cooldownLeft(flow, now = Date.now()) {
  const sentAt = Number(readSession(SENT_AT_KEYS[flow])) || 0;
  if (!sentAt) return 0;
  return Math.max(0, Math.ceil((sentAt + RESEND_COOLDOWN_S * 1000 - now) / 1000));
}
