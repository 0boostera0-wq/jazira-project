// ============================================================================
// record_daily_activity() — ONE owner for "this member was active today".
//
// The streak RPC is idempotent per Riyadh day, but it used to be sent twice on
// the first dashboard visit of the day: once by the (app) layout's session
// tracker and once by the dashboard's progress loader. Both now go through
// recordActivityOnce(), which
//   • shares one in-flight promise per member and day in this tab, and
//   • skips the request when this device already recorded the day
//     (localStorage "jazira_active_day_v1:<uid>" = "YYYY-MM-DD", the key the
//     session tracker has always used).
// Dependency-light on purpose, so the layout can import it without pulling in
// the dashboard's data loaders.
// ============================================================================

import { riyadhToday } from "@/components/achievements/progress";

export const activeDayKey = (userId) => `jazira_active_day_v1:${userId}`;

let activity = null; // { key, promise }

function recordedDay(userId) {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(activeDayKey(userId));
  } catch {
    return null;
  }
}

function rememberDay(userId, day) {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(activeDayKey(userId), day);
  } catch {
    /* storage blocked: the shared promise still dedupes within this tab */
  }
}

/**
 * Record today's activity once per member and Riyadh day.
 * → the streak the RPC returned (number), or null when it wasn't sent (already
 *   recorded today on this device) or failed. A failed call is not cached, so
 *   the next caller tries again.
 */
export function recordActivityOnce(supabase, userId, today = riyadhToday()) {
  const key = `${userId}:${today}`;
  if (activity?.key === key) return activity.promise;
  const entry = { key, promise: null };
  entry.promise =
    recordedDay(userId) === today
      ? Promise.resolve(null)
      : Promise.resolve()
          .then(() => supabase.rpc("record_daily_activity"))
          .then((res) => {
            if (!res || res.error) throw new Error("record_daily_activity failed");
            rememberDay(userId, today);
            return typeof res.data === "number" ? res.data : null;
          })
          .catch(() => {
            if (activity === entry) activity = null;
            return null;
          });
  activity = entry;
  return entry.promise;
}

/** Forget the shared activity call (tests, sign-out). */
export function resetActivityCache() {
  activity = null;
}
