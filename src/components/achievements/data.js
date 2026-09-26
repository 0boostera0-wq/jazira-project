// Data access for /achievements and /competitions. Pure async functions that
// take the browser Supabase client (from getSupabase()) — no React, no strings.
//
// Every query degrades: a missing table/RPC (not deployed yet) yields `null`
// for that metric so the UI can say "not tracked yet" instead of faking a 0.

import { levelFor } from "./progress";

// PostgREST / Postgres codes for "this relation / function / column isn't there".
const MISSING_CODES = new Set(["PGRST202", "PGRST204", "PGRST205", "42P01", "42883", "42703"]);

export function isMissing(error) {
  if (!error) return false;
  if (MISSING_CODES.has(error.code)) return true;
  return /does not exist|could not find|schema cache/i.test(error.message || "");
}

const num = (v) => (v === null || v === undefined || v === "" ? NaN : Number(v));

/**
 * get_exam_stats() → jsonb (supabase/migrations/0010, docs/DATA_API.md):
 *   { completed_attempts, totals: { attempts, … }, trend: { daily: [{ day, attempts, … }] } }
 * Graded (submitted/expired) attempts only; `daily` covers the last 30 Saudi days.
 * → { completed: number|null, days: { "YYYY-MM-DD": attempts }|null }
 */
export function examStatsFrom(data) {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return { completed: null, days: null };
  const c = num(row.completed_attempts ?? row.totals?.attempts);
  const completed = Number.isFinite(c) ? Math.max(0, c) : null;
  const daily = row.trend?.daily;
  let days = null;
  if (Array.isArray(daily)) {
    days = {};
    for (const d of daily) {
      const n = num(d?.attempts);
      if (typeof d?.day === "string" && Number.isFinite(n) && n > 0) days[d.day.slice(0, 10)] = n;
    }
  }
  return { completed, days };
}

async function headCount(supabase, table, column, value) {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq(column, value);
  if (error) return { value: null, missing: isMissing(error), error };
  return { value: typeof count === "number" ? count : 0 };
}

/**
 * The signed-in user's progress. Records today's activity first (the same
 * idempotent, server-clock RPC the dashboard uses) so the streak is current.
 * → { xp, streakRow, streakAvailable, exams, examDays, posts, comments, failed }
 *   (metrics are null when they can't be measured)
 */
export async function loadMyProgress(supabase, userId) {
  const streakP = (async () => {
    try { await supabase.rpc("record_daily_activity"); } catch { /* RPC missing → read what exists */ }
    const { data, error } = await supabase
      .from("streaks")
      .select("current_streak, longest_streak, last_active_date")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return { row: null, available: false, error: isMissing(error) ? null : error };
    return { row: data || null, available: true };
  })();

  const xpP = supabase.from("profiles").select("xp").eq("id", userId).maybeSingle();

  const examsP = (async () => {
    const { data, error } = await supabase.rpc("get_exam_stats");
    if (error) return { completed: null, days: null };
    return examStatsFrom(data);
  })();

  const [streak, xpRes, examStats, posts, comments] = await Promise.all([
    streakP,
    xpP,
    examsP.catch(() => ({ completed: null, days: null })),
    headCount(supabase, "community_posts", "user_id", userId).catch(() => ({ value: null })),
    headCount(supabase, "post_comments", "user_id", userId).catch(() => ({ value: null })),
  ]);

  const xpVal = num(xpRes.data?.xp);
  const xp = xpRes.error ? null : Number.isFinite(xpVal) ? Math.max(0, xpVal) : 0;
  // Only a genuine failure of the core profile read counts as an error state;
  // everything else degrades metric by metric.
  const failed = !!xpRes.error && !isMissing(xpRes.error);

  return {
    xp,
    streakRow: streak.row,
    streakAvailable: streak.available,
    exams: examStats.completed,
    examDays: examStats.days,
    posts: posts.value,
    comments: comments.value,
    failed,
  };
}

// ── Leaderboard ──────────────────────────────────────────────────────────────

// PUBLIC profile columns only (see src/lib/profile.js). The privacy flags are
// public-read by design so every surface can honour them.
const BOARD_COLUMNS = "id, username, full_name, avatar_url, is_elite, show_elite_badge, anonymous_community, xp";
const BOARD_COLUMNS_MIN = "id, username, full_name, avatar_url, is_elite, xp";

export const BOARD_LIMIT = 50;

/** Standard competition ranking: equal XP shares a rank (1, 2, 2, 4 …). */
export function withRanks(rows) {
  let prev = null;
  return rows.map((r, i) => {
    const rank = prev && prev.xp === r.xp ? prev.rank : i + 1;
    prev = { xp: r.xp, rank };
    return { ...r, rank };
  });
}

/** Public identity for a board row, honouring the member's own choices. */
export function boardIdentity(row) {
  const anonymous = !!row.anonymous_community;
  return {
    id: row.id,
    anonymous,
    name: anonymous ? null : (row.full_name || "").trim() || null,
    username: anonymous ? null : row.username || null,
    avatar: anonymous ? null : row.avatar_url || null,
    elite: !anonymous && !!row.is_elite && row.show_elite_badge !== false,
  };
}

function toEntry(row) {
  const xp = Math.max(0, num(row.xp) || 0);
  return { ...boardIdentity(row), xp, level: levelFor(xp).level };
}

/**
 * Top of the all-time XP board + the viewer's own position.
 * → { entries, total, me, failed }
 *   me: null (guest) | { ...identity, xp, level, rank|null, inList, nextXp|null, nextRank|null }
 */
export async function loadLeaderboard(supabase, { viewerId = null, limit = BOARD_LIMIT } = {}) {
  const top = async (cols) =>
    supabase
      .from("profiles")
      .select(cols)
      .gt("xp", 0)
      .order("xp", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(limit);

  let res = await top(BOARD_COLUMNS);
  if (res.error && isMissing(res.error)) res = await top(BOARD_COLUMNS_MIN);
  if (res.error) return { entries: [], total: 0, me: null, failed: true };

  const entries = withRanks((res.data || []).map(toEntry));

  const totalP = supabase.from("profiles").select("id", { count: "exact", head: true }).gt("xp", 0);
  const meP = viewerId
    ? supabase.from("profiles").select(BOARD_COLUMNS).eq("id", viewerId).maybeSingle()
        .then((r) => (r.error && isMissing(r.error) ? supabase.from("profiles").select(BOARD_COLUMNS_MIN).eq("id", viewerId).maybeSingle() : r))
    : Promise.resolve({ data: null });

  const [totalRes, meRes] = await Promise.all([totalP, meP]);
  const total = typeof totalRes.count === "number" ? totalRes.count : entries.length;

  let me = null;
  if (viewerId) {
    const row = meRes.data || { id: viewerId, xp: 0 };
    const xp = Math.max(0, num(row.xp) || 0);
    me = { ...toEntry({ ...row, id: viewerId }), xp, rank: null, inList: false, nextXp: null, nextRank: null };
    const idx = entries.findIndex((e) => e.id === viewerId);
    if (idx !== -1) {
      me.inList = true;
      me.rank = entries[idx].rank;
      // Nearest entry with strictly more XP (the place to catch next).
      const above = [...entries.slice(0, idx)].reverse().find((e) => e.xp > xp);
      if (above) { me.nextXp = above.xp; me.nextRank = above.rank; }
    } else if (xp > 0) {
      const [ahead, nextRes] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }).gt("xp", xp),
        supabase.from("profiles").select("xp").gt("xp", xp).order("xp", { ascending: true }).limit(1),
      ]);
      if (typeof ahead.count === "number") me.rank = ahead.count + 1;
      const nx = num(nextRes.data?.[0]?.xp);
      if (Number.isFinite(nx)) {
        me.nextXp = nx;
        const aheadOfNext = await supabase.from("profiles").select("id", { count: "exact", head: true }).gt("xp", nx);
        me.nextRank = typeof aheadOfNext.count === "number" ? aheadOfNext.count + 1 : null;
      }
    }
  }

  return { entries, total, me, failed: false };
}
