// ============================================================================
// History & analytics — pure helpers (Riyadh calendar days, the daily trend
// series, the inline-SVG sparkline geometry, window deltas). Unit-tested.
// Day boundaries follow the database: the Asia/Riyadh calendar day.
// ============================================================================
import { EXAMS } from "@/lib/exams/catalog";

const riyadhFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" });

/** "YYYY-MM-DD" of an instant in Riyadh. */
export function riyadhDay(value = Date.now()) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return riyadhFmt.format(d);
}

/** Attempts started on the current Riyadh day (what the free daily limit counts). */
export function attemptsToday(items = [], now = Date.now()) {
  const today = riyadhDay(now);
  return items.filter((it) => riyadhDay(it?.started_at) === today).length;
}

/** The n calendar days ending at `today` ("YYYY-MM-DD"), oldest first. */
export function lastNDays(n, today) {
  const [y, m, d] = today.split("-").map(Number);
  const base = Date.UTC(y, m - 1, d);
  return Array.from({ length: n }, (_, i) => new Date(base - (n - 1 - i) * 86400000).toISOString().slice(0, 10));
}

/**
 * Daily accuracy for the last n days; days without attempts are null (gaps).
 * @returns {{ day: string, accuracy: number|null, attempts: number, total: number, correct: number }[]}
 */
export function dailySeries(daily = [], n = 30, today = riyadhDay()) {
  const byDay = new Map((daily || []).map((r) => [String(r.day).slice(0, 10), r]));
  return lastNDays(n, today).map((day) => {
    const r = byDay.get(day);
    const total = Number(r?.total) || 0;
    const correct = Number(r?.correct) || 0;
    const accuracy = r?.accuracy ?? (total ? Math.round((1000 * correct) / total) / 10 : null);
    return { day, accuracy: total || r?.attempts ? accuracy : null, attempts: Number(r?.attempts) || 0, total, correct };
  });
}

/**
 * Sparkline geometry (0–100 scale). null values break the line into segments
 * (or are skipped with connectGaps); isolated points are returned as dots.
 * @returns {{ segments: string[], area: string[], dots: {x,y,v,i}[], points: {x,y,v,i}[] }}
 */
export function sparkline(values = [], { width = 300, height = 80, pad = 6, min = 0, max = 100, connectGaps = false } = {}) {
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
  return { segments, area, dots, points };
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

/** Is there anything graded yet? */
export const hasStats = (stats) => Boolean(stats && Number(stats.completed_attempts) > 0);
