// ============================================================================
// History & analytics — pure helpers (Riyadh calendar days, the daily trend
// series, the inline-SVG sparkline geometry, window deltas). Unit-tested.
// Day boundaries follow the database: the Asia/Riyadh calendar day.
//
// The ONE implementation of these for the whole app: the dashboard, the exam
// builder and /exams/history all use them (the Riyadh formatter itself lives
// in achievements/progress.js, which has no dependencies).
// ============================================================================
import { EXAMS } from "@/lib/exams/catalog";
import { riyadhToday } from "@/components/achievements/progress";

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** "YYYY-MM-DD" of an instant (Date, ms or ISO string) in Riyadh; null for an invalid date. */
export function riyadhDay(value = Date.now()) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return riyadhToday(d);
}

/**
 * Attempts started on the current Riyadh day (what the free daily limit
 * counts: any status). With a page of list_exam_attempts at least as long as
 * the free cap, the count is exact.
 */
export function attemptsToday(items, now = Date.now()) {
  const today = riyadhDay(now);
  if (!today) return 0;
  return (Array.isArray(items) ? items : []).filter((it) => riyadhDay(it?.started_at) === today).length;
}

/** The n calendar days ending at `today` ("YYYY-MM-DD"), oldest first. */
export function lastNDays(n, today) {
  const [y, m, d] = today.split("-").map(Number);
  const base = Date.UTC(y, m - 1, d);
  return Array.from({ length: n }, (_, i) => new Date(base - (n - 1 - i) * 86400000).toISOString().slice(0, 10));
}

/**
 * Daily accuracy for the last n Riyadh days (oldest first, `index` 0…n−1).
 * A day without a graded attempt is null (a gap); accuracy falls back to
 * correct / total and is clamped to 0–100. Malformed rows are ignored.
 * @returns {{ day: string, index: number, accuracy: number|null, attempts: number, total: number, correct: number }[]}
 */
export function dailySeries(daily = [], n = 30, today = riyadhDay()) {
  const byDay = new Map();
  for (const r of Array.isArray(daily) ? daily : []) {
    const day = typeof r?.day === "string" ? r.day.slice(0, 10) : "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) byDay.set(day, r);
  }
  return lastNDays(n, today).map((day, index) => {
    const r = byDay.get(day);
    const total = Math.max(0, num(r?.total) ?? 0);
    const correct = Math.max(0, num(r?.correct) ?? 0);
    const attempts = Math.max(0, num(r?.attempts) ?? 0);
    const raw = num(r?.accuracy) ?? (total > 0 ? Math.round((1000 * correct) / total) / 10 : null);
    const graded = attempts > 0 || total > 0;
    return { day, index, accuracy: graded && raw !== null ? clamp(raw, 0, 100) : null, attempts, total, correct };
  });
}

/**
 * Sparkline geometry in viewBox units (0–100 scale). null values break the
 * line into segments (or are skipped with connectGaps: points keep their true
 * x position); isolated points are returned as dots. `yAt(v)` and
 * topY / midY / baseY place guide lines and scale labels on the same grid.
 * @returns {{ segments: string[], area: string[], dots: {x,y,v,i}[], points: {x,y,v,i}[],
 *   width: number, height: number, pad: number, topY: number, midY: number, baseY: number, yAt: (v: number) => number }}
 */
export function sparkline(input = [], { width = 300, height = 80, pad = 6, min = 0, max = 100, connectGaps = false } = {}) {
  const values = Array.isArray(input) ? input : [];
  const n = values.length;
  const x = (i) => (n <= 1 ? width / 2 : pad + (i * (width - 2 * pad)) / (n - 1));
  const y = (v) => {
    const clamped = Math.min(max, Math.max(min, v));
    return pad + (height - 2 * pad) * (1 - (clamped - min) / (max - min || 1));
  };
  const r2 = (v) => Math.round(v * 100) / 100;
  const points = [];
  const segments = [];
  const area = [];
  const dots = [];
  let run = [];
  const close = () => {
    if (run.length === 1) dots.push(run[0]);
    if (run.length > 1) {
      segments.push(run.map((p, j) => `${j ? "L" : "M"}${p.x} ${p.y}`).join(" "));
      const base = r2(height - pad);
      area.push(`M${run[0].x} ${base} ${run.map((p) => `L${p.x} ${p.y}`).join(" ")} L${run[run.length - 1].x} ${base} Z`);
    }
    run = [];
  };
  values.forEach((v, i) => {
    if (v === null || v === undefined || Number.isNaN(Number(v))) {
      if (!connectGaps) close();
      return;
    }
    const p = { x: r2(x(i)), y: r2(y(Number(v))), v: Number(v), i };
    points.push(p);
    run.push(p);
  });
  close();
  const yAt = (v) => r2(y(v));
  return { segments, area, dots, points, width, height, pad, topY: yAt(max), midY: yAt((min + max) / 2), baseY: r2(height - pad), yAt };
}

/** Accuracy change between two windows, in percentage points (1 decimal). */
export function windowDelta(current, previous) {
  const a = current?.accuracy;
  const b = previous?.accuracy;
  if (a === null || a === undefined || b === null || b === undefined) return null;
  const diff = Number(a) - Number(b);
  const value = (Math.sign(diff) * Math.round(Math.abs(diff) * 10)) / 10 || 0; // symmetric rounding, no -0
  return { value, direction: value > 0 ? "up" : value < 0 ? "down" : "same" };
}

/** by_section rows in catalog order (aptitude sections, then achievement). */
export function sortSections(bySection = []) {
  const order = Object.values(EXAMS).flatMap((e) => e.sections);
  const idx = (s) => {
    const i = order.indexOf(s);
    return i === -1 ? 99 : i;
  };
  return [...bySection].sort((a, b) => idx(a.section) - idx(b.section));
}

/** Topics ranked by volume (most practised first) for the accuracy list. */
export function rankTopics(byTopic = []) {
  return [...byTopic].sort((a, b) => (Number(b.total) || 0) - (Number(a.total) || 0) || String(a.topic).localeCompare(String(b.topic)));
}

/** get_exam_stats() keys only Elite members receive (0012): withheld as [] and listed in `locked`. */
export const TOPIC_ANALYTICS_KEYS = ["by_topic", "best_topics", "weakest_topics"];

/**
 * Are the topic analytics (per-skill accuracy, strongest / weakest topics)
 * locked for this viewer? They are Elite analytics, as the Elite plan sells
 * them. The database decides since 0012 (`locked`, `premium`), so a lock
 * never sits over real data; against an older database the viewer's plan does.
 */
export function topicAnalyticsLocked(stats, isElite) {
  const locked = Array.isArray(stats?.locked) ? stats.locked : [];
  if (TOPIC_ANALYTICS_KEYS.some((k) => locked.includes(k))) return true;
  if (typeof stats?.premium === "boolean") return !stats.premium;
  return !isElite;
}

/** Is there anything graded yet? */
export const hasStats = (stats) => Boolean(stats && Number(stats.completed_attempts) > 0);

// ── template attempts: scope comparison, weak lessons, repeated mistakes ────

/**
 * "The same scope" for comparing attempts: template + scope for template
 * attempts (list_exam_attempts_v2), exam + section + topic for legacy ones.
 */
export function attemptScopeKey(it) {
  if (!it) return null;
  if (it.template_id) return `tpl:${it.template_id}|${it.scope ?? ""}`;
  return `legacy:${it.exam ?? ""}|${it.section ?? ""}|${it.topic ?? ""}`;
}

/**
 * An attempt row that can still be resumed. list_exam_attempts carries
 * `expires_at`; list_exam_attempts_v2 (0014) does not, so its deadline is
 * started_at + time_limit_seconds (always set: untimed sessions get 7 days).
 * A row whose deadline cannot be derived is not offered for resuming.
 */
export function isOpenAttempt(it, now = Date.now()) {
  if (!it || it.status !== "in_progress") return false;
  let deadline = Date.parse(it.expires_at);
  if (Number.isNaN(deadline)) {
    const start = Date.parse(it.started_at);
    const secs = num(it.time_limit_seconds);
    deadline = Number.isNaN(start) || secs === null ? NaN : start + secs * 1000;
  }
  return !Number.isNaN(deadline) && deadline > now;
}

/**
 * For each graded attempt (list order: newest first), the previous graded
 * attempt on the same scope and the score change in percentage points.
 * @returns {Map<string, { previousId: string, previousScore: number, delta: number, direction: "up"|"down"|"same" }>}
 */
export function previousOnScope(items = []) {
  const out = new Map();
  const last = new Map();
  const list = (Array.isArray(items) ? items : []).filter((it) => it?.id && num(it.score_percent) !== null && it.status !== "in_progress");
  for (let i = list.length - 1; i >= 0; i--) {
    const it = list[i];
    const key = attemptScopeKey(it);
    const prev = last.get(key);
    if (prev) {
      const diff = num(it.score_percent) - num(prev.score_percent);
      const delta = (Math.sign(diff) * Math.round(Math.abs(diff) * 10)) / 10 || 0;
      out.set(it.id, { previousId: prev.id, previousScore: num(prev.score_percent), delta, direction: delta > 0 ? "up" : delta < 0 ? "down" : "same" });
    }
    last.set(key, it);
  }
  return out;
}

/** Wilson score lower bound of an accuracy (z = 1.645, as the database ranks weak lessons). */
export function wilsonLower(correct, n, z = 1.645) {
  const total = num(n) ?? 0;
  if (total <= 0) return 0;
  const p = clamp((num(correct) ?? 0) / total, 0, 1);
  const z2 = z * z;
  const centre = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
  return Math.max(0, (centre - margin) / (1 + z2 / total));
}

/**
 * Weak lessons (§2.14): lessons with at least `min` answers, weakest first by
 * the Wilson lower bound (the server's `wilson_lower`, else computed here);
 * accuracy in percent (0–100, 1 decimal).
 */
export function weakLessons(byLesson = [], { min = 5, limit = 5 } = {}) {
  return (Array.isArray(byLesson) ? byLesson : [])
    .filter((r) => r?.lesson && (num(r.answered) ?? 0) >= min)
    .map((r) => {
      const answered = num(r.answered) ?? 0;
      const correct = num(r.correct) ?? 0;
      const wilson = num(r.wilson_lower) ?? wilsonLower(correct, answered);
      return { ...r, answered, correct, wilson, accuracy: Math.round((1000 * correct) / answered) / 10 };
    })
    .sort((a, b) => a.wilson - b.wilson || b.answered - a.answered || String(a.lesson).localeCompare(String(b.lesson)))
    .slice(0, limit);
}

/**
 * Repeated mistakes (§2.14: wrong_streak ≥ 2) grouped by lesson: how many
 * questions keep being missed there, most first. Lesson titles come from
 * the by_lesson rows when the mistake rows have none.
 * @returns {{ lesson: string, title: string|null, count: number, maxStreak: number }[]}
 */
export function repeatedMistakes(rows = [], byLesson = []) {
  const titles = new Map((Array.isArray(byLesson) ? byLesson : []).filter((r) => r?.lesson).map((r) => [r.lesson, r.title ?? null]));
  const groups = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const streak = num(r?.wrong_streak) ?? 0;
    if (streak < 2 || !r?.lesson) continue;
    const g = groups.get(r.lesson) ?? { lesson: r.lesson, title: r.title ?? titles.get(r.lesson) ?? null, count: 0, maxStreak: 0 };
    g.count += 1;
    g.maxStreak = Math.max(g.maxStreak, streak);
    groups.set(r.lesson, g);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || b.maxStreak - a.maxStreak || a.lesson.localeCompare(b.lesson));
}

/** Recommendation rows of get_practice_recommendations, well formed and in a known kind. */
export const RECOMMENDATION_KINDS = ["lesson_quiz", "lesson_review", "weakness_review"];
export function recommendationRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).filter((r) => r && RECOMMENDATION_KINDS.includes(r.kind) && typeof r.node === "string" && r.node);
}
