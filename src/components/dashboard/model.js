// ============================================================================
// Dashboard — pure view-model helpers (no React, no strings, server + client
// safe). Everything here is unit-tested in tests/unit/dashboard.test.js.
//
// Inputs are the raw payloads documented in docs/DATA_API.md:
//   list_exam_attempts rows · get_exam_stats() · get_notifications rows
// Outputs are small, null-safe objects the cards render directly. A value the
// server didn't send stays `null` so the UI can say "not tracked" instead of
// showing an invented 0.
// ============================================================================

import { SECTIONS, PRESETS, LIMITS } from "@/lib/exams/catalog";
import { builderHref } from "@/components/exams/builder-logic";
import { addDays, dayValue, riyadhToday } from "@/components/achievements/progress";
import { notificationHref as notificationTarget } from "@/components/notifications/model";

export const RECENT_LIMIT = 5;
export const NOTIFICATION_LIMIT = 5;
export const TREND_DAYS = 30;
export const QUICK_PRACTICE_QUESTIONS = (PRESETS.find((p) => p.id === "quick") || { count: 10 }).count;
export const FREE_DAILY_ATTEMPTS = LIMITS.freeDailyAttempts;
export const EXAMS = ["aptitude", "achievement"];

const DAY_MS = 86400000;

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = (v, digits = 1) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

// ── Greeting ────────────────────────────────────────────────────────────────

/** Local hour → "morning" | "afternoon" | "evening" | "night". */
export function greetingPeriod(hour) {
  const h = ((Math.floor(Number(hour) || 0) % 24) + 24) % 24;
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 22) return "evening";
  return "night";
}

/**
 * effectiveStreak() output → the one-line status under the streak:
 *   keepGoing       today is recorded and the run is ≥ 1
 *   startTomorrow   today is recorded as the first day (the DB counts it as 0)
 *   lastYesterday   today isn't recorded (the visit couldn't be saved) but the run is still alive
 *   none            no run
 */
export function streakStatus(streak) {
  if (!streak?.lastActive) return "none";
  if (streak.activeToday) return streak.current > 0 ? "keepGoing" : "startTomorrow";
  return streak.alive && streak.current > 0 ? "lastYesterday" : "none";
}

/** First word of the public display name ("سارة العتيبي" → "سارة"). */
export function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

// ── Links (one place to adjust when the exams team finalises its routes) ────

export const EXAM_CENTER_HREF = "/exams";
export const EXAM_HISTORY_HREF = "/exams/history";

export const examOfSection = (section) => SECTIONS[section]?.exam || null;

/** Attempt page: the runner resumes `in_progress`, otherwise it shows the result. */
export const attemptHref = (id) => `/exams/attempt/${encodeURIComponent(String(id))}`;

/**
 * Prefilled exam builder: /exams/<exam>?section=<section>&topic=<topic>#builder
 * (the exams team's documented deep link, built with their builderHref()).
 * Unknown / mismatched slugs are dropped, so the link always lands somewhere valid.
 */
export function practiceHref({ exam = null, section = null, topic = null } = {}) {
  const ex = EXAMS.includes(exam) ? exam : examOfSection(section);
  if (!ex) return EXAM_CENTER_HREF;
  const sec = SECTIONS[section];
  const valid = Boolean(sec && sec.exam === ex);
  return builderHref(ex, {
    section: valid ? section : null,
    topic: valid && topic && sec.topics.includes(topic) ? topic : null,
  });
}

// ── Attempts ────────────────────────────────────────────────────────────────

const timeOf = (iso) => {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? t : NaN;
};

/** The newest attempt that can still be resumed (in progress and not past its deadline). */
export function findResumable(items, now = Date.now()) {
  for (const a of Array.isArray(items) ? items : []) {
    if (!a || a.status !== "in_progress" || !a.id) continue;
    const exp = timeOf(a.expires_at);
    if (Number.isFinite(exp) && exp <= now) continue;
    return a;
  }
  return null;
}

/** The newest graded attempt (submitted or expired). */
export function lastGraded(items) {
  return (Array.isArray(items) ? items : []).find((a) => a && (a.status === "submitted" || a.status === "expired")) || null;
}

/**
 * get_exam_attempt() payload for an attempt listed as in progress →
 *   { id, closed: false, answered, total, secondsLeft }   still running
 *   { id, closed: true }                                   graded meanwhile (e.g. expired)
 * secondsLeft is the server's seconds_remaining (immune to device clock skew).
 */
export function resumeSummary(payload, id) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  if (payload.status !== "in_progress") return { id, closed: true };
  const answers = Array.isArray(payload.answers) ? payload.answers : [];
  const listed = num(payload.attempt?.question_count);
  const total = Math.max(0, listed ?? (Array.isArray(payload.questions) ? payload.questions.length : answers.length));
  const answered = answers.filter((a) => a && a.selected_index !== null && a.selected_index !== undefined).length;
  const secs = num(payload.seconds_remaining);
  return { id, closed: false, answered: Math.min(answered, total), total, secondsLeft: secs === null ? null : Math.max(0, Math.floor(secs)) };
}

/** Whole minutes left from a server countdown read at `readAt` (ms), or null. */
export function minutesFromCountdown(secondsLeft, readAt, now = Date.now()) {
  const s = num(secondsLeft);
  if (s === null || !Number.isFinite(readAt)) return null;
  const ms = s * 1000 - Math.max(0, now - readAt);
  return Math.max(0, Math.ceil(ms / 60000));
}

/** Whole minutes left before an attempt's deadline (never negative), or null without a deadline. */
export function minutesLeft(attempt, now = Date.now()) {
  const exp = timeOf(attempt?.expires_at);
  if (!Number.isFinite(exp)) return null;
  return Math.max(0, Math.ceil((exp - now) / 60000));
}

/**
 * Attempts started on the current Saudi day. The free daily limit counts
 * attempts *started* (any status) per Asia/Riyadh day; with `limit` ≥ the free
 * cap, the newest page of list_exam_attempts is enough to count it exactly.
 */
export function attemptsStartedToday(items, today = riyadhToday()) {
  let n = 0;
  for (const a of Array.isArray(items) ? items : []) {
    const t = timeOf(a?.started_at);
    if (Number.isFinite(t) && riyadhToday(new Date(t)) === today) n += 1;
  }
  return n;
}

/** Score band → badge tone. */
export function scoreTone(pct) {
  const v = num(pct);
  if (v === null) return "neutral";
  if (v >= 80) return "green";
  if (v >= 50) return "gold";
  return "warning";
}

/** Normalised row for the recent-attempts list. */
export function attemptRow(a) {
  const graded = a?.status === "submitted" || a?.status === "expired";
  return {
    id: a?.id ?? null,
    exam: EXAMS.includes(a?.exam) ? a.exam : examOfSection(a?.section),
    section: a?.section && SECTIONS[a.section] ? a.section : null,
    status: a?.status || "submitted",
    questions: num(a?.question_count) ?? num(a?.total) ?? 0,
    score: graded ? num(a?.score_percent) : null,
    correct: graded ? num(a?.correct_count) : null,
    total: graded ? num(a?.total) : null,
    at: a?.submitted_at || a?.started_at || null,
    durationSeconds: num(a?.duration_seconds),
  };
}

// ── Stats (get_exam_stats) ──────────────────────────────────────────────────

/**
 * Strongest / focus topics without overlap. get_exam_stats() returns the top
 * and bottom 3 topics (≥ 3 questions each), which overlap when the member has
 * practised fewer than 6 topics — so the union is split by accuracy instead.
 */
export function splitTopics(best, weakest) {
  const map = new Map();
  for (const x of [...(Array.isArray(best) ? best : []), ...(Array.isArray(weakest) ? weakest : [])]) {
    if (!x || typeof x.topic !== "string" || typeof x.section !== "string") continue;
    const accuracy = num(x.accuracy);
    if (accuracy === null) continue;
    const key = `${x.section}:${x.topic}`;
    if (!map.has(key)) {
      map.set(key, { section: x.section, topic: x.topic, total: num(x.total) ?? 0, correct: num(x.correct) ?? 0, accuracy: clamp(accuracy, 0, 100) });
    }
  }
  const all = [...map.values()].sort((a, b) => b.accuracy - a.accuracy || a.topic.localeCompare(b.topic));
  const n = all.length;
  if (n === 0) return { strongest: [], focus: [] };
  if (n === 1) return all[0].accuracy >= 70 ? { strongest: all, focus: [] } : { strongest: [], focus: all };
  const strong = Math.min(3, Math.ceil(n / 2));
  const focus = Math.min(3, n - strong);
  return { strongest: all.slice(0, strong), focus: all.slice(n - focus).reverse() };
}

/**
 * Last `days` Saudi days (oldest → today) with the day's accuracy, or null on
 * days without a graded attempt.
 */
export function dailySeries(daily, today = riyadhToday(), days = TREND_DAYS) {
  const byDay = new Map();
  for (const d of Array.isArray(daily) ? daily : []) {
    const iso = typeof d?.day === "string" ? d.day.slice(0, 10) : "";
    const accuracy = num(d?.accuracy);
    const attempts = num(d?.attempts) ?? 0;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || accuracy === null || attempts <= 0) continue;
    byDay.set(iso, { accuracy: clamp(accuracy, 0, 100), attempts });
  }
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const iso = addDays(today, -i);
    const v = byDay.get(iso);
    out.push({ day: iso, index: days - 1 - i, accuracy: v ? v.accuracy : null, attempts: v ? v.attempts : 0 });
  }
  return out;
}

/** get_exam_stats() payload → what the performance card renders, or null for an unusable payload. */
export function normalizeStats(raw, today = riyadhToday()) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const t = raw.totals && typeof raw.totals === "object" ? raw.totals : {};
  const completed = Math.max(0, num(raw.completed_attempts) ?? num(t.attempts) ?? 0);
  const w = raw.trend?.windows || {};
  const last7 = num(w.last_7?.accuracy);
  const prev7 = num(w.prev_7?.accuracy);
  const sections = (Array.isArray(raw.by_section) ? raw.by_section : [])
    .filter((s) => s && SECTIONS[s.section] && num(s.total) > 0)
    .map((s) => ({
      exam: EXAMS.includes(s.exam) ? s.exam : examOfSection(s.section),
      section: s.section,
      total: num(s.total),
      correct: num(s.correct) ?? 0,
      accuracy: num(s.accuracy) === null ? null : clamp(num(s.accuracy), 0, 100),
    }));
  const { strongest, focus } = splitTopics(raw.best_topics, raw.weakest_topics);
  return {
    completed,
    inProgress: Math.max(0, num(raw.in_progress) ?? 0),
    totals: {
      questions: num(t.questions) ?? 0,
      answered: num(t.answered) ?? 0,
      correct: num(t.correct) ?? 0,
      accuracy: num(t.accuracy),
      averageScore: num(t.average_score),
      bestScore: num(t.best_score),
      lastAttemptAt: typeof t.last_attempt_at === "string" ? t.last_attempt_at : null,
    },
    trend: {
      last7,
      prev7,
      last7Attempts: num(w.last_7?.attempts) ?? 0,
      delta: last7 !== null && prev7 !== null ? round(last7 - prev7, 1) : null,
    },
    sections,
    strongest,
    focus,
    daily: dailySeries(raw.trend?.daily, today),
  };
}

/**
 * Sparkline geometry in viewBox units. Only days with data become points;
 * consecutive points are joined (the line shows the trend across practice days).
 */
export function sparklineGeometry(series, { width = 320, height = 96, pad = 8 } = {}) {
  const list = Array.isArray(series) ? series : [];
  const n = list.length;
  const x = (i) => (n <= 1 ? width / 2 : pad + (i * (width - 2 * pad)) / (n - 1));
  const y = (a) => pad + ((100 - a) * (height - 2 * pad)) / 100;
  const points = [];
  list.forEach((p, i) => {
    if (p && p.accuracy !== null && p.accuracy !== undefined) {
      points.push({ ...p, x: round(x(i), 2), y: round(y(clamp(p.accuracy, 0, 100)), 2) });
    }
  });
  const path = points.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
  const base = round(height - pad, 2);
  const area = points.length > 1 ? `${path} L${points[points.length - 1].x} ${base} L${points[0].x} ${base} Z` : "";
  return { width, height, pad, points, path, area, midY: round(y(50), 2), topY: round(y(100), 2), baseY: base };
}

// ── Daily tip ───────────────────────────────────────────────────────────────

/** Stable index for "today's tip" (changes at Saudi midnight). */
export function tipIndex(today = riyadhToday(), count = 1) {
  const n = Math.max(1, Math.floor(Number(count) || 1));
  const d = Math.floor(dayValue(today) / DAY_MS);
  if (!Number.isFinite(d)) return 0;
  return ((d % n) + n) % n;
}

// ── Notifications ───────────────────────────────────────────────────────────

/**
 * Where a notification row should take the member. Uses the notifications
 * team's target (post permalink, conversation, profile, result…) so this
 * preview and /notifications always agree; rows without a target open the
 * full list.
 */
export function notificationHref(n) {
  return notificationTarget(n) || "/notifications";
}

/** Wrap a user-supplied name in a Unicode first-strong isolate so it can't reorder the sentence around it. */
export const isolate = (s) => `⁨${String(s ?? "")}⁩`;

// ── Onboarding ──────────────────────────────────────────────────────────────

export const ONBOARDING_STEPS = [
  { key: "stage", href: "/curriculum" },
  { key: "practice", href: EXAM_CENTER_HREF },
  { key: "assistant", href: "/assistant" },
  { key: "community", href: "/community" },
];

/**
 * signals: { stage, practice, assistant, community } — true (done), false
 * (not yet) or null (can't be measured). Only `true` ticks a step.
 */
export function onboardingSteps(signals = {}) {
  const steps = ONBOARDING_STEPS.map((s) => ({ ...s, done: signals?.[s.key] === true }));
  return { steps, done: steps.filter((s) => s.done).length, total: steps.length };
}
