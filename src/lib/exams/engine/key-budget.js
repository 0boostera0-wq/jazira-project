// ============================================================================
// Per-IP key-reveal and grading caps for guest sessions
// (docs/CONTENT_ENGINE.md §5.8). Server only.
//
//   await takeKeyReveals(clientKey, count) → true when `count` more answer keys
//   may be revealed to this client today, false past the cap (the results then
//   show verdicts without correct responses or explanations: key_reveal_limit).
//
//   await takeGrades(clientKey, count) → true when `count` more submitted
//   answers may be graded for this client today, false past the cap (the
//   routes then answer 429 rate_limited and grade nothing).
//
// Shared limiter buckets `exams.keys` / `exams.grades` (public.rate_limit_hit,
// 0013) with a per-instance memory fallback (src/lib/rate-limit.js). The
// limiter counts hits, so every revealed key is one hit: a /check (one key)
// costs 1, a submit of n live items costs n, and the default cap is 400 keys a
// day (EXAM_KEY_REVEAL_DAILY overrides it, 10..100000). One probe hit goes
// first and the rest are charged in parallel batches, so a client already at
// the cap costs a single limiter call per request.
//
// Why a grading cap too: past the key-reveal cap results still carry
// verdicts, and a verdict is an answer oracle — /submit is stateless and can be
// replayed with the same token, so a client could submit option 0, 1, 2 … for
// every item of one session and read each key off the verdicts, however many
// keys it had already been shown. Every graded submitted answer (a /check, or
// a /submit position graded from a response) is one hit in `exams.grades`; an
// unanswered position reveals nothing through its verdict and costs nothing.
// Default: twice the key-reveal cap (EXAM_GRADE_DAILY overrides it,
// 10..100000), so the verdicts one client can collect in a day stay bounded.
// ============================================================================
import { isRateLimited } from "@/lib/rate-limit";

export const KEY_BUCKET = "exams.keys";
export const GRADE_BUCKET = "exams.grades";
export const DEFAULT_DAILY_KEYS = 400;
export const KEY_WINDOW_SECONDS = 86400;
/** Parallel limiter calls per batch (a guest submit reveals ≤ 25 keys). */
export const CHARGE_BATCH = 25;
/** Upper bound of keys one response can reveal (the token's item limit). */
const MAX_COUNT = 100;

export function dailyKeyLimit(env = process.env) {
  const v = Number(env.EXAM_KEY_REVEAL_DAILY);
  return Number.isInteger(v) && v >= 10 && v <= 100000 ? v : DEFAULT_DAILY_KEYS;
}

/** Daily cap of graded submitted answers per client (default: twice the key-reveal cap). */
export function dailyGradeLimit(env = process.env) {
  const v = Number(env.EXAM_GRADE_DAILY);
  return Number.isInteger(v) && v >= 10 && v <= 100000 ? v : Math.min(100000, 2 * dailyKeyLimit(env));
}

/** One limiter hit per unit: a probe first, then parallel batches; the first refusal stops. */
async function charge(bucket, max, clientKey, count, limiter) {
  if (!Number.isInteger(count) || count <= 0) return true;
  const n = Math.min(count, MAX_COUNT);
  if (n > max) return false;
  const hit = () => limiter({ bucket, key: String(clientKey || "unknown"), max, windowSeconds: KEY_WINDOW_SECONDS });
  if (await hit()) return false;
  for (let done = 1; done < n; done += CHARGE_BATCH) {
    const batch = Math.min(CHARGE_BATCH, n - done);
    const over = await Promise.all(Array.from({ length: batch }, hit));
    if (over.some(Boolean)) return false;
  }
  return true;
}

/**
 * Charge `count` revealed keys to a client (one limiter hit per key). The
 * first refusal stops (a partial charge stays: the client is at the cap anyway).
 * @param {string} clientKey  the caller's IP (hashed by the limiter)
 * @param {number} count      answer keys this response would reveal
 * @returns {Promise<boolean>} true = reveal, false = over the cap
 */
export function takeKeyReveals(clientKey, count, { env = process.env, limiter = isRateLimited } = {}) {
  return charge(KEY_BUCKET, dailyKeyLimit(env), clientKey, count, limiter);
}

/**
 * Charge `count` graded submitted answers (verdicts) to a client.
 * @param {string} clientKey  the caller's IP (hashed by the limiter)
 * @param {number} count      submitted answers this request would grade
 * @returns {Promise<boolean>} true = grade, false = over the cap (answer 429 rate_limited)
 */
export function takeGrades(clientKey, count, { env = process.env, limiter = isRateLimited } = {}) {
  return charge(GRADE_BUCKET, dailyGradeLimit(env), clientKey, count, limiter);
}
