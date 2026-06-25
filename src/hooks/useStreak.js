"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-client";

// Records today's activity (Asia/Riyadh, server-authoritative) and returns the
// live streak. Safe if the RPC isn't deployed yet — falls back to 0.
export function useStreak(userId) {
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!userId) { setStreak(0); setLoading(false); return; }

    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.rpc("record_daily_activity");
        if (!cancelled && !error && typeof data === "number") setStreak(data);
      } catch {
        // RPC missing — leave at 0
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [userId]);

  return { streak, loading };
}
