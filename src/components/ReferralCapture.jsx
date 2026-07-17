"use client";

import { useEffect } from "react";
import { getSupabase } from "@/lib/supabase-lazy";

const PENDING_KEY = "jazira_pending_ref";

// Captures a personal invite code from the URL (?ref=<inviterUserId>) and, once
// the visitor is authenticated with a DIFFERENT account, records exactly one
// successful invitation in Supabase (dedup by referred_id). Supports both Google
// and email signups. Fails silently if the referrals table is absent.
//
// PERF: mounted in the root layout on EVERY page. It now bails out before
// touching Supabase when there is nothing pending to attribute (the case for
// virtually every visitor), so it never pulls the @supabase chunk into a page
// that has no referral to record.
export default function ReferralCapture() {
  useEffect(() => {
    // 1) Capture ?ref= as soon as the visitor lands.
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get("ref");
      if (ref) localStorage.setItem(PENDING_KEY, ref);
    } catch {}

    // 2) Nothing pending → no attribution work and no reason to load Supabase.
    let pending = null;
    try { pending = localStorage.getItem(PENDING_KEY); } catch {}
    if (!pending) return;

    let alive = true;
    let subscription;

    // 3) Attribute it once the user is signed in (covers both auth methods).
    const attribute = async () => {
      try {
        const code = localStorage.getItem(PENDING_KEY);
        if (!code) return;

        const supabase = await getSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return; // not signed in yet — try again on next auth change

        // Never count a self-invite.
        if (code === user.id) {
          localStorage.removeItem(PENDING_KEY);
          return;
        }

        // One invite per invited account: unique(referred_id) + ignore-duplicates.
        await supabase
          .from("referrals")
          .upsert(
            { referrer_id: code, referred_id: user.id },
            { onConflict: "referred_id", ignoreDuplicates: true }
          );

        localStorage.removeItem(PENDING_KEY);
      } catch {
        // table may not exist yet — ignore
      }
    };

    (async () => {
      await attribute();
      const supabase = await getSupabase();
      if (!alive) return;
      const { data } = supabase.auth.onAuthStateChange(() => { attribute(); });
      subscription = data.subscription;
      if (!alive) subscription.unsubscribe();
    })();

    return () => { alive = false; subscription?.unsubscribe(); };
  }, []);

  return null;
}
