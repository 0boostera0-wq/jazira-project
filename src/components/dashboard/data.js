// ============================================================================
// Dashboard — data loaders. Each card has exactly one loader so every card
// resolves (or fails) on its own. Loaders either return data or throw an
// Error with a stable `code` ("unavailable" | "network" | "unknown" | …);
// "unavailable" means Supabase isn't configured or the table/RPC isn't
// deployed yet — the card then says so honestly instead of faking numbers.
//
// Exams / notifications / quota go through src/lib/data/* (docs/DATA_API.md).
// The few direct reads (streaks, profiles.xp, subscriptions, onboarding
// signals) select explicit columns of the member's own rows (RLS: own).
// ============================================================================

import { effectiveStreak, levelFor, riyadhToday } from "@/components/achievements/progress";
import { listAttempts, getExamStats, getAttempt } from "@/lib/data/exams";
import { listNotifications } from "@/lib/data/notifications";
import { getAiQuota } from "@/lib/data/ai";
import { normalizeStats, resumeSummary, NOTIFICATION_LIMIT, RECENT_LIMIT } from "./model";

const MISSING = new Set(["PGRST202", "PGRST204", "PGRST205", "42P01", "42883", "42703"]);

export function isMissing(error) {
  if (!error) return false;
  if (MISSING.has(error.code)) return true;
  return /does not exist|could not find|schema cache/i.test(error.message || "");
}

export function dashboardError(code, cause) {
  const e = new Error(code);
  e.name = "DataError";
  e.code = code;
  if (cause !== undefined) e.cause = cause;
  return e;
}

/** Any thrown value → one of the codes the cards know how to show. */
export function errorCode(err) {
  const code = err?.code;
  if (code === "not_authenticated" || code === "unavailable" || code === "network") return code;
  return "unknown";
}

// ── Welcome: XP + streak ────────────────────────────────────────────────────

// record_daily_activity() is idempotent per Saudi day; call it once per visit
// and share the promise (React strict mode mounts effects twice in dev).
let activity = null;

export function recordActivityOnce(supabase, userId, today = riyadhToday()) {
  const key = `${userId}:${today}`;
  if (!activity || activity.key !== key) {
    activity = {
      key,
      promise: Promise.resolve()
        .then(() => supabase.rpc("record_daily_activity"))
        .then((res) => (res && !res.error && typeof res.data === "number" ? res.data : null))
        .catch(() => null),
    };
  }
  return activity.promise;
}

/** Forget the shared activity call (tests, sign-out). */
export function resetActivityCache() {
  activity = null;
}

/**
 * → { xp, level, streak } where xp is null when it can't be read and streak is
 *   effectiveStreak() output (see achievements/progress.js) or null.
 */
export async function loadProgress(supabase, userId, { today = riyadhToday(), fallbackXp = null } = {}) {
  if (!supabase || !userId) throw dashboardError("unavailable");

  const streakP = recordActivityOnce(supabase, userId, today)
    .then(async (recorded) => {
      const { data, error } = await supabase
        .from("streaks")
        .select("current_streak, longest_streak, last_active_date")
        .eq("user_id", userId)
        .maybeSingle();
      if (!error) return effectiveStreak(data, today);
      // Table unreadable but the RPC answered: that value is today's streak.
      if (recorded !== null) return { current: recorded, longest: recorded, lastActive: today, activeToday: true, alive: true };
      return null;
    })
    .catch(() => null);

  const xpP = Promise.resolve()
    .then(() => supabase.from("profiles").select("xp").eq("id", userId).maybeSingle())
    .then(({ data, error }) => {
      if (error) return fallbackXp;
      const n = Number(data?.xp);
      return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    })
    .catch(() => fallbackXp);

  const [streak, xp] = await Promise.all([streakP, xpP]);
  if (streak === null && (xp === null || xp === undefined)) throw dashboardError("unavailable");
  const safeXp = xp === null || xp === undefined ? null : xp;
  return { xp: safeXp, level: safeXp === null ? null : levelFor(safeXp), streak };
}

// ── Exams ───────────────────────────────────────────────────────────────────

/** Newest attempts (enough to find a resumable one and count today's free attempts). */
export async function loadAttempts() {
  const res = await listAttempts({ limit: RECENT_LIMIT });
  if (res?.mode !== "db") throw dashboardError("unavailable");
  return Array.isArray(res.items) ? res.items : [];
}

/** Progress of the attempt to resume (get_exam_attempt) → resumeSummary() + when it was read. */
export async function loadResume(attemptId) {
  const summary = resumeSummary(await getAttempt(attemptId), attemptId);
  if (!summary) throw dashboardError("unknown");
  return { ...summary, readAt: Date.now() };
}

export async function loadStats() {
  const raw = await getExamStats();
  if (raw?.mode !== "db") throw dashboardError("unavailable");
  const stats = normalizeStats(raw);
  if (!stats) throw dashboardError("unknown");
  return stats;
}

// ── Rail ────────────────────────────────────────────────────────────────────

export async function loadNotifications() {
  const res = await listNotifications({ limit: NOTIFICATION_LIMIT });
  if (res?.available === false) throw dashboardError("unavailable");
  return Array.isArray(res?.items) ? res.items.slice(0, NOTIFICATION_LIMIT) : [];
}

/** Elite renewal date from the member's own subscription row (null when unknown). */
export async function loadSubscription(supabase, userId) {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from("subscriptions")
    .select("tier, status, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const end = typeof data.current_period_end === "string" && Number.isFinite(Date.parse(data.current_period_end)) ? data.current_period_end : null;
  return { tier: data.tier || null, status: data.status || null, periodEnd: data.status === "active" ? end : null };
}

/** ai_quota() or null (signed out / not deployed). */
export async function loadQuota() {
  return getAiQuota();
}

// ── Onboarding signals (brand-new members only) ─────────────────────────────

/**
 * Has the member asked the assistant / taken part in the community yet?
 * Each signal is true, false, or null when it can't be measured (table missing).
 */
export async function loadOnboardingSignals(supabase, userId) {
  if (!supabase || !userId) return { assistant: null, community: null };
  const exists = async (query) => {
    try {
      const { data, error } = await query;
      if (error) return null;
      return Array.isArray(data) && data.length > 0;
    } catch {
      return null;
    }
  };
  const [assistant, posts, comments, follows] = await Promise.all([
    exists(supabase.from("chat_history").select("id").eq("user_id", userId).eq("message_type", "user").limit(1)),
    exists(supabase.from("community_posts").select("id").eq("user_id", userId).limit(1)),
    exists(supabase.from("post_comments").select("id").eq("user_id", userId).limit(1)),
    exists(supabase.from("follows").select("id").eq("follower_id", userId).limit(1)),
  ]);
  const social = [posts, comments, follows];
  const community = social.some((v) => v === true) ? true : social.every((v) => v === null) ? null : false;
  return { assistant, community };
}
