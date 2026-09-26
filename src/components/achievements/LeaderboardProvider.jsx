"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuthUser } from "@/context/AuthProvider";
import { getSupabase } from "@/lib/supabase-lazy";
import { levelFor } from "./progress";
import { loadLeaderboard } from "./data";

const BoardContext = createContext(null);

/**
 * Loads the all-time XP board (public columns only) and, when signed in, the
 * viewer's own rank — once, for both the standing card and the board.
 *
 * status: "loading" | "ready" | "unavailable"
 */
export default function LeaderboardProvider({ children }) {
  const { isLoaded, isSignedIn, userId } = useAuthUser();
  const [state, setState] = useState({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isLoaded) return;
    let alive = true;
    setState((s) => (s.status === "ready" ? s : { status: "loading" }));
    (async () => {
      try {
        const supabase = await getSupabase();
        if (!supabase) {
          if (alive) setState({ status: "unavailable" });
          return;
        }
        const res = await loadLeaderboard(supabase, { viewerId: isSignedIn ? userId : null });
        if (!alive) return;
        setState(res.failed ? { status: "unavailable" } : { status: "ready", ...res });
      } catch {
        if (alive) setState({ status: "unavailable" });
      }
    })();
    return () => { alive = false; };
  }, [isLoaded, isSignedIn, userId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const value = useMemo(() => {
    const me = state.me ? { ...state.me, levelInfo: levelFor(state.me.xp) } : null;
    return {
      status: state.status,
      authLoaded: isLoaded,
      signedIn: isSignedIn,
      entries: state.entries || [],
      total: state.total || 0,
      me,
      retry,
    };
  }, [state, isLoaded, isSignedIn, retry]);

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}

export function useLeaderboard() {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error("useLeaderboard must be used inside <LeaderboardProvider>");
  return ctx;
}
