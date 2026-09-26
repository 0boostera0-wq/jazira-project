// Pure progress helpers shared by /achievements and /competitions (server- and
// client-safe, no strings — all copy lives in the `achievements` namespace).

// ── Levels ──────────────────────────────────────────────────────────────────
// Level L starts at 50·L·(L−1) XP: 0, 100, 300, 600, 1000, 1500, 2100 …
// Early levels come quickly; each next level needs 100 XP more than the last.
export const levelStart = (level) => 50 * level * (level - 1);

export function levelFor(xpInput) {
  const xp = Math.max(0, Math.floor(Number(xpInput) || 0));
  let level = 1;
  while (levelStart(level + 1) <= xp) level += 1;
  const from = levelStart(level);
  const to = levelStart(level + 1);
  return { xp, level, from, to, remaining: to - xp, pct: ((xp - from) / (to - from)) * 100 };
}

// ── Dates (streaks are counted on Saudi days, Asia/Riyadh, like the DB) ─────
const DAY = 86400000;
const riyadhFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" });

/** Today's date in Asia/Riyadh as "YYYY-MM-DD". */
export const riyadhToday = (now = new Date()) => riyadhFmt.format(now);

/** "YYYY-MM-DD" → UTC midnight timestamp (ms), or NaN. */
export function dayValue(iso) {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return NaN;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export const isoOf = (value) => new Date(value).toISOString().slice(0, 10);
export const addDays = (iso, n) => isoOf(dayValue(iso) + n * DAY);

/**
 * Streak row → what is actually true today.
 * The DB keeps `current_streak` until the next recorded visit, so a row whose
 * last active day is older than yesterday is a streak that has already ended.
 */
export function effectiveStreak(row, today = riyadhToday()) {
  const current = Math.max(0, Number(row?.current_streak) || 0);
  const longest = Math.max(0, Number(row?.longest_streak) || 0, current);
  const last = row?.last_active_date ? String(row.last_active_date).slice(0, 10) : null;
  if (!last) return { current: 0, longest, lastActive: null, activeToday: false, alive: false };
  const gap = Math.round((dayValue(today) - dayValue(last)) / DAY);
  const alive = gap >= 0 && gap <= 1;
  return { current: alive ? current : 0, longest, lastActive: last, activeToday: gap === 0, alive };
}

/**
 * The days we KNOW were active: the current run ending on lastActive.
 * (record_daily_activity counts the first day of a run as 0, so a run of
 * `current` covers current + 1 calendar days.)
 */
export function activeDays(streak) {
  const set = new Set();
  if (!streak?.lastActive || !streak.alive) return set;
  for (let i = 0; i <= streak.current; i += 1) set.add(addDays(streak.lastActive, -i));
  return set;
}

// get_exam_stats() reports per-day exam activity for the last 30 Saudi days,
// so the calendar shows 4 weeks (≤ 28 days back) — every cell it draws is
// inside that window and "no exam that day" is always true, never a gap.
export const CALENDAR_WEEKS = 4;

/**
 * Calendar weeks (Sunday → Saturday) covering the last `weeks` weeks up to the
 * current week. Each cell: { iso, active, exams, today, future }.
 * `examDays` (optional): { "YYYY-MM-DD": completedAttempts } — null when the
 * exam stats aren't available (then `exams` is null on every cell).
 */
export function calendarWeeks(streak, today = riyadhToday(), weeks = CALENDAR_WEEKS, examDays = null) {
  const active = activeDays(streak);
  const dow = new Date(dayValue(today)).getUTCDay(); // 0 = Sunday
  const start = addDays(today, -dow - (weeks - 1) * 7);
  const t = dayValue(today);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const iso = addDays(start, w * 7 + d);
      const v = dayValue(iso);
      const exams = examDays ? Math.max(0, Number(examDays[iso]) || 0) : null;
      return { iso, active: active.has(iso), exams, today: v === t, future: v > t };
    })
  );
}
