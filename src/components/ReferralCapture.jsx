"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase-client";

const PENDING_KEY = "jazira_pending_ref";

// Captures a personal invite code from the URL (?ref=<inviterUserId>) and, once
// the visitor is authenticated with a DIFFERENT account, records exactly one
// successful invitation in Supabase (dedup by referred_id). Supports both Google
// and email signups. Fails silently if the referrals table is absent.
export default function ReferralCapture() {
  useEffect(() => {
    // 1) Capture ?ref= as soon as the visitor lands.
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get("ref");
      if (ref) localStorage.setItem(PENDING_KEY, ref);
    } catch {}

    // 2) Attribute it once the user is signed in (covers both auth methods).
    const attribute = async () => {
      try {
        const pending = localStorage.getItem(PENDING_KEY);
        if (!pending) return;

        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return; // not signed in yet — try again on next auth change

        // Never count a self-invite.
        if (pending === user.id) {
          localStorage.removeItem(PENDING_KEY);
          return;
        }

        // One invite per invited account: unique(referred_id) + ignore-duplicates.
        await supabase
          .from("referrals")
          .upsert(
            { referrer_id: pending, referred_id: user.id },
            { onConflict: "referred_id", ignoreDuplicates: true }
          );

        localStorage.removeItem(PENDING_KEY);
      } catch {
        // table may not exist yet — ignore
      }
    };

    attribute();
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      attribute();
    });
    return () => subscription.unsubscribe();
  }, []);

  return null;
}
