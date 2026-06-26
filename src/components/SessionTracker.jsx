"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase-client";
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
  const handledRef = useRef(false);

  useEffect(() => {
    if (!isSignedIn || !userId) return;
    const supabase = createClient();
    const sid = getSid();
    if (!sid) return;
    const dev = parseDevice();
    let timer;
    let cancelled = false;

    const handleRevoked = async () => {
      if (handledRef.current) return;
      handledRef.current = true;
      try { localStorage.removeItem(SID_KEY); } catch {}      // rotate → clean next login
      try { await supabase.auth.signOut(); } catch {}
      window.location.href = "/sign-in?reason=revoked";
    };

    const register = async () => {
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
    };

    const check = async (skipTouch) => {
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
  }, [isSignedIn, userId]);

  return null;
}
