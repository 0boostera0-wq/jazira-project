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
// Secret: LOCAL_EXAM_SECRET (≥ 16 chars) when set; otherwise derived from
// SUPABASE_SERVICE_ROLE_KEY (an HMAC with a fixed label — the service key
// itself is never exposed); otherwise (local dev) a per-process random key.
// ============================================================================
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// A set can be graded until a day after its deadline (a late visit still
// shows the review; re-grading a set reveals nothing its first grading didn't).
export const GRADE_GRACE_MS = 24 * 60 * 60_000;
const MAX_KEYS = 100;

let devKey = null;
function secret() {
  const explicit = process.env.LOCAL_EXAM_SECRET;
  if (explicit && explicit.length >= 16) return explicit;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (service) return createHmac("sha256", service).update("jazira.local-exam-set.v1").digest();
  if (!devKey) devKey = randomBytes(32);
  return devKey;
}

const b64 = (buf) => Buffer.from(buf).toString("base64url");
const mac = (payload) => createHmac("sha256", secret()).update(payload).digest();

/** @param {{ keys: string[], expiresAt: string|number|Date }} set */
export function signLocalSet({ keys, expiresAt }) {
  const payload = b64(JSON.stringify({ v: 1, k: keys.slice(0, MAX_KEYS), e: new Date(expiresAt).getTime() }));
  return `${payload}.${b64(mac(payload))}`;
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
  const expected = mac(payload);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, error: "invalid_token" };
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
