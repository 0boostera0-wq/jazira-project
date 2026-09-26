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
