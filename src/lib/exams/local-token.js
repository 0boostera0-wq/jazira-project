// ============================================================================
// Local practice mode — the question set a /start handed out, signed, so
// /grade only grades THAT set, once it has been started, within its time
// (server only). Without it /grade was an answer-key oracle: any list of up to
// 100 known keys came back with correct answers and explanations.
//
//   const token = signLocalSet({ keys, expiresAt })          // in /start
//   const v = verifyLocalSet(token, { now })                  // in /grade
//     → { ok: true, keys: Set<string>, expiresAt } | { ok: false, error }
//
// Also the shared secret policy and HMAC helpers of every exam token
// (docs/CONTENT_ENGINE.md §5.8; v2 tokens and receipts:
// src/lib/exams/engine/session-token.js):
//
//   examSecretStatus(env)    → { available, source, required, warning }
//   baseSecrets(env)         → { current, previous }   the v2 HKDF input keys
//   hkdfKey(secret, info)    HKDF-SHA256(secret, salt "", info) → 32 bytes
//   hmac(key, data) · b64url(buf) · safeEqual(a, b)
//
// v1 key (UNCHANGED, so live v1 tokens keep verifying):
//   LOCAL_EXAM_SECRET (≥ 16 chars; a warning below 32) when set; otherwise
//   HMAC(SUPABASE_SERVICE_ROLE_KEY, "jazira.local-exam-set.v1"); otherwise
//   HKDF(LEMONSQUEEZY_WEBHOOK_SECRET | GEMINI_API_KEY, "jz.exam.fallback")
//   (stable across instances; a warning once per instance); otherwise — local
//   development, or a deployment with no server secret at all — a per-process
//   random key (a warning in production). LOCAL_EXAM_SECRET_PREVIOUS is
//   accepted for verification during rotation.
// EXAM_SECRET_REQUIRED=1 makes LOCAL_EXAM_SECRET (≥ 32 chars) mandatory:
// examSecretStatus().available is then false without it and the routes that
// check it answer 503 {error:"unavailable"}.
// ============================================================================
import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

// A set can be graded until a day after its deadline (a late visit still
// shows the review; re-grading a set reveals nothing its first grading didn't).
export const GRADE_GRACE_MS = 24 * 60 * 60_000;
const MAX_KEYS = 100;
export const V1_MIN_SECRET = 16;
export const V2_MIN_SECRET = 32;
export const FALLBACK_SECRETS = Object.freeze(["SUPABASE_SERVICE_ROLE_KEY", "LEMONSQUEEZY_WEBHOOK_SECRET", "GEMINI_API_KEY"]);

// ── shared helpers ──────────────────────────────────────────────────────────
export const b64url = (buf) => Buffer.from(buf).toString("base64url");
export const hmac = (key, data) => createHmac("sha256", key).update(data).digest();
/** HKDF-SHA256(secret, salt = "", info) → 32-byte key. */
export const hkdfKey = (secret, info) => Buffer.from(hkdfSync("sha256", Buffer.from(secret), Buffer.alloc(0), Buffer.from(info, "utf8"), 32));
/** Constant-time comparison of two buffers (false on a length mismatch). */
export function safeEqual(a, b) {
  return Buffer.isBuffer(a) && Buffer.isBuffer(b) && a.length === b.length && timingSafeEqual(a, b);
}

const isProduction = (env) => (env.VERCEL_ENV ? env.VERCEL_ENV === "production" : env.NODE_ENV === "production");
const flagOn = (env) => env.EXAM_SECRET_REQUIRED === "1" || env.EXAM_SECRET_REQUIRED === "true";
const explicitSecret = (env) => (typeof env.LOCAL_EXAM_SECRET === "string" && env.LOCAL_EXAM_SECRET.length >= V1_MIN_SECRET ? env.LOCAL_EXAM_SECRET : null);
const previousSecret = (env) => (typeof env.LOCAL_EXAM_SECRET_PREVIOUS === "string" && env.LOCAL_EXAM_SECRET_PREVIOUS.length >= V1_MIN_SECRET ? env.LOCAL_EXAM_SECRET_PREVIOUS : null);
const firstFallback = (env, names = FALLBACK_SECRETS) => {
  for (const name of names) if (typeof env[name] === "string" && env[name]) return { name, value: env[name] };
  return null;
};

let devKey = null;
const devSecret = () => {
  if (!devKey) devKey = randomBytes(32);
  return devKey;
};

const warned = new Set();
function warnOnce(code, message) {
  if (warned.has(code)) return;
  warned.add(code);
  console.warn(`[exam-secret] ${message}`);
}

/**
 * Where the exam secret comes from, and whether the routes may run.
 * @returns {{ available: boolean, required: boolean, source: "explicit"|"fallback"|"dev", fallback: string|null, warning: string|null }}
 */
export function examSecretStatus(env = process.env) {
  const required = flagOn(env);
  const explicit = explicitSecret(env);
  if (required && (!explicit || explicit.length < V2_MIN_SECRET)) {
    return { available: false, required, source: explicit ? "explicit" : "none", fallback: null, warning: "LOCAL_EXAM_SECRET (≥ 32 chars) is required" };
  }
  if (explicit) {
    return { available: true, required, source: "explicit", fallback: null, warning: explicit.length < V2_MIN_SECRET ? "LOCAL_EXAM_SECRET is shorter than 32 characters" : null };
  }
  const fb = firstFallback(env);
  if (fb) return { available: true, required, source: "fallback", fallback: fb.name, warning: isProduction(env) ? `LOCAL_EXAM_SECRET is not set; using a key derived from ${fb.name}` : null };
  return { available: true, required, source: "dev", fallback: null, warning: isProduction(env) ? "no server secret is set; exam tokens use a per-process key" : null };
}

/**
 * The v2 HKDF input secrets: LOCAL_EXAM_SECRET, else HKDF(first fallback
 * secret, "jz.exam.fallback"), else the per-process development key.
 * `previous` is LOCAL_EXAM_SECRET_PREVIOUS (verification only).
 */
export function baseSecrets(env = process.env) {
  const status = examSecretStatus(env);
  if (!status.available) return { current: null, previous: null, status };
  if (status.warning) warnOnce(`v2:${status.source}:${status.fallback}`, status.warning);
  let current;
  if (status.source === "explicit") current = Buffer.from(explicitSecret(env), "utf8");
  else if (status.source === "fallback") current = hkdfKey(firstFallback(env).value, "jz.exam.fallback");
  else current = devSecret();
  const prev = previousSecret(env);
  return { current, previous: prev ? Buffer.from(prev, "utf8") : null, status };
}

// ── v1 (format and key unchanged) ───────────────────────────────────────────
function v1Keys(env = process.env) {
  const explicit = explicitSecret(env);
  let current;
  if (explicit) {
    if (explicit.length < V2_MIN_SECRET) warnOnce("v1:short", "LOCAL_EXAM_SECRET is shorter than 32 characters");
    current = explicit;
  } else if (env.SUPABASE_SERVICE_ROLE_KEY) {
    current = hmac(env.SUPABASE_SERVICE_ROLE_KEY, "jazira.local-exam-set.v1");
  } else {
    const fb = firstFallback(env, FALLBACK_SECRETS.slice(1));
    if (fb) {
      if (isProduction(env)) warnOnce(`v1:fallback:${fb.name}`, `LOCAL_EXAM_SECRET is not set; using a key derived from ${fb.name}`);
      current = hkdfKey(fb.value, "jz.exam.fallback");
    } else {
      if (isProduction(env)) warnOnce("v1:dev", "no server secret is set; local exam sets use a per-process key");
      current = devSecret();
    }
  }
  const prev = previousSecret(env);
  return prev ? [current, prev] : [current];
}

/** @param {{ keys: string[], expiresAt: string|number|Date }} set */
export function signLocalSet({ keys, expiresAt }) {
  const payload = b64url(JSON.stringify({ v: 1, k: keys.slice(0, MAX_KEYS), e: new Date(expiresAt).getTime() }));
  return `${payload}.${b64url(hmac(v1Keys()[0], payload))}`;
}

export function verifyLocalSet(token, { now = Date.now() } = {}) {
  if (typeof token !== "string" || token.length > 8192) return { ok: false, error: "invalid_token" };
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return { ok: false, error: "invalid_token" };
  let given;
  try {
    given = Buffer.from(sig, "base64url");
  } catch {
    return { ok: false, error: "invalid_token" };
  }
  if (!v1Keys().some((key) => safeEqual(given, hmac(key, payload)))) return { ok: false, error: "invalid_token" };
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, error: "invalid_token" };
  }
  if (data?.v !== 1 || !Array.isArray(data.k) || !Number.isFinite(data.e)) return { ok: false, error: "invalid_token" };
  if (now > data.e + GRADE_GRACE_MS) return { ok: false, error: "expired" };
  return { ok: true, keys: new Set(data.k.filter((k) => typeof k === "string")), expiresAt: data.e };
}
