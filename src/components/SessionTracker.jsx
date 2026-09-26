"use client";

import { useEffect, useRef } from "react";
import { getSupabase } from "@/lib/supabase-lazy";
import { localizeHref } from "@/i18n/config";
import { useLocale } from "@/i18n/client";
import { useAuthUser } from "@/context/AuthProvider";
import { parseDevice } from "@/lib/device";

// Registers this browser as a session row, heartbeats last_active_at, and — when
// the row is revoked from another device — signs this device out (app-level).
//
// Honest limitation: a browser refresh token cannot be revoked remotely from the
// client. So remote sign-out is enforced here by detecting `revoked_at` and
// calling signOut() locally (within ~60s or on tab focus). On revoke we also
// rotate the local session id, so the next login is a clean, non-revoked session
// and the logout survives reloads.
const SID_KEY = "jazira_session_id_v1";

function getSid() {
  if (typeof window === "undefined") return null;
  try {
    let id = localStorage.getItem(SID_KEY);
    if (!id) {
      id = "s_" + (crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36));
      localStorage.setItem(SID_KEY, id);
    }
    return id;
  } catch { return null; }
}

export default function SessionTracker() {
  const { userId, isSignedIn } = useAuthUser();
  const { locale } = useLocale();
  const handledRef = useRef(false);

  useEffect(() => {
    if (!isSignedIn || !userId) return;
    const sid = getSid();
    if (!sid) return;
    let supabase = null;
    const dev = parseDevice();
    let timer;
    let cancelled = false;

    const handleRevoked = async () => {
      if (handledRef.current) return;
      handledRef.current = true;
      try { localStorage.removeItem(SID_KEY); } catch {}      // rotate → clean next login
      // CRITICAL: scope 'local' — sign out ONLY this device. The default 'global'
      // revokes every device's refresh token, which previously logged out the
      // device that initiated the remote sign-out too.
      try { await supabase.auth.signOut({ scope: "local" }); } catch {}
      window.location.href = localizeHref("/sign-in?reason=revoked", locale);
    };

    // Best-effort: ask the server to stamp this row's approximate location from
    // edge geo headers (city/country). Fire-and-forget — never blocks or throws.
    const stampLocation = () => {
      try {
        fetch("/api/session/touch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sid }),
          keepalive: true,
        }).catch(() => {});
      } catch {}
    };

    // Any active day counts toward the streak (record_daily_activity is
    // idempotent per Riyadh day); skip the RPC if already recorded today.
    const recordActiveDay = () => {
      const day = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
      const key = `jazira_active_day_v1:${userId}`;
      try { if (localStorage.getItem(key) === day) return; } catch {}
      supabase.rpc("record_daily_activity").then(({ error }) => {
        if (!error) { try { localStorage.setItem(key, day); } catch {} }
      }, () => {});
    };

    const register = async () => {
      supabase = await getSupabase();
      if (!supabase || cancelled) return;
      try {
        // Upsert WITHOUT revoked_at so an existing revoked flag is preserved.
        await supabase.from("user_sessions").upsert({
          user_id: userId, session_id: sid,
          device_label: dev.label, browser: dev.browser, os: dev.os,
          device_type: dev.deviceType, user_agent: dev.userAgent,
          last_active_at: new Date().toISOString(),
        }, { onConflict: "user_id,session_id" });
      } catch {}
      await check(true);
      stampLocation();
      recordActiveDay();
    };

    const check = async (skipTouch) => {
      if (!supabase) return;
      try {
        const { data } = await supabase.from("user_sessions")
          .select("revoked_at").eq("user_id", userId).eq("session_id", sid).single();
        if (cancelled) return;
        if (data?.revoked_at) { await handleRevoked(); return; }
        if (!skipTouch) {
          await supabase.from("user_sessions").update({ last_active_at: new Date().toISOString() })
            .eq("user_id", userId).eq("session_id", sid);
        }
      } catch {}
    };

    register();
    timer = setInterval(() => check(false), 60000);
    const onFocus = () => check(false);
    window.addEventListener("focus", onFocus);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [isSignedIn, userId, locale]);

  return null;
}
