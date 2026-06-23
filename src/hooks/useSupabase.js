"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-client";

// CommunityFeed queries Supabase directly; usePosts kept as a safe stub.
export function usePosts() {
  return { posts: [], loading: false, refetch: () => {} };
}

export function useLeaderboard(limit = 10) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetch() {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("profiles")
          .select("id, username, full_name, display_name, xp, is_elite, role")
          .order("xp", { ascending: false })
          .limit(limit);
        if (!cancelled) setLeaderboard(data || []);
      } catch {
        // leave leaderboard empty on any error
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetch();
    return () => { cancelled = true; };
  }, [limit]);

  return { leaderboard, loading };
}
