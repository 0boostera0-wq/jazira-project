"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuthUser } from "@/context/AuthProvider";
import { getSupabase } from "@/lib/supabase-lazy";
import { evaluateBadges } from "./badges";
import { CALENDAR_WEEKS, calendarWeeks, effectiveStreak, levelFor, riyadhToday } from "./progress";
import { loadMyProgress } from "./data";

const ProgressContext = createContext(null);

/**
 * Loads the signed-in user's progress ONCE for every island on /achievements
 * (summary, streak, badges, next badges) and derives levels / badges from it.
 *
 * status: "loading" | "guest" | "ready" | "unavailable"
 */
export default function ProgressProvider({ children }) {
  const { isLoaded, isSignedIn, userId } = useAuthUser();
  const [state, setState] = useState({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || !userId) {
      setState({ status: "guest" });
      return;
    }
    let alive = true;
    setState((s) => (s.status === "ready" ? s : { status: "loading" }));
    (async () => {
      try {
        const supabase = await getSupabase();
        if (!supabase) {
          if (alive) setState({ status: "unavailable" });
          return;
        }
        const raw = await loadMyProgress(supabase, userId);
        if (!alive) return;
        setState(raw.failed ? { status: "unavailable" } : { status: "ready", raw });
      } catch {
        if (alive) setState({ status: "unavailable" });
      }
    })();
    return () => { alive = false; };
  }, [isLoaded, isSignedIn, userId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const value = useMemo(() => {
    if (state.status !== "ready") {
      // Guests (and failures) still see the full catalogue, all locked.
      return { status: state.status, retry, badges: evaluateBadges({}) };
    }
    const { raw } = state;
    const today = raw.today || riyadhToday();
    const streak = raw.streakAvailable ? effectiveStreak(raw.streakRow, today) : null;
    const metrics = {
      exams: raw.exams,
      streak: streak ? streak.longest : null,
      xp: raw.xp,
      posts: raw.posts,
      comments: raw.comments,
    };
    return {
      status: "ready",
      retry,
      xp: raw.xp ?? 0,
      level: levelFor(raw.xp ?? 0),
      exams: raw.exams,
      streak,
      // The calendar needs the streak row; exam days are layered on when known.
      calendar: streak ? calendarWeeks(streak, today, CALENDAR_WEEKS, raw.examDays || null) : null,
      today,
      badges: evaluateBadges(metrics),
    };
  }, [state, retry]);

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress() {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error("useProgress must be used inside <ProgressProvider>");
  return ctx;
}
