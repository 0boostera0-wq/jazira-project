"use client";

import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { getSupabase, hasAuthCookie, isSupabaseRequested, onSupabaseReady } from "@/lib/supabase-lazy";
import { isSupabaseConfigured } from "@/lib/supabase-env";
import { OWN_PROFILE_COLUMNS, BASIC_PROFILE_COLUMNS } from "@/lib/profile";

// ============================================================================
// The ONE app-wide Supabase auth subscription.
//
// This provider owns the session + profile; `useAuth()` (hooks/useAuth.js) is
// a thin action layer on top of it.
//
// Public display name = profiles.full_name (non-unique). Never email, never the
// internal username handle.
//
// PERF: the Supabase client (~70 kB gzipped) is imported lazily
// (supabase-lazy.js) and ONLY when this browser holds a session cookie. A
// guest (no `sb-…-auth-token` cookie) is signed out without downloading it.
// If something else loads the client later (a sign-in form, the referral
// capture), this provider attaches to it then; a sign-in in another tab is
// picked up when this tab regains focus. Consumers gate on `isLoaded`.
//
// PROFILE: `profileStatus` is "ready" once the profile row was actually read
// (even if it doesn't exist yet), "error" when it could not be read (offline,
// server error). `needsProfileSetup` is true only for a READ row without a
// public name — a failed read never sends a member to /profile-setup. Failed
// reads are retried with backoff and when the tab regains focus.
// ============================================================================

const AuthContext = createContext(null);

const SIGNED_OUT = {
  isLoaded: true,
  isSignedIn: false,
  user: null,
  profile: null,
  profileStatus: "none",
  userId: null,
  name: "",
  username: "",
  email: "",
  imageUrl: "",
  isElite: false,
  showEliteBadge: true,
  anonymousCommunity: false,
  needsProfileSetup: false,
};

const RETRY_DELAYS_MS = [2000, 5000, 15000, 30000];

function clearRetry(ref) {
  clearTimeout(ref.current.timer);
  ref.current = { timer: null, attempt: 0, pending: null };
}

/** → { profile, ok } — ok: the row was read (profile may still be null: no row yet). */
async function fetchProfile(supabase, id) {
  // Explicit columns only: private columns (phone…) are not selectable by
  // clients. Fall back to the minimal set if a newer column isn't migrated yet.
  // postgrest-js reports failures in `error` (it does not throw).
  try {
    const full = await supabase.from("profiles").select(OWN_PROFILE_COLUMNS).eq("id", id).maybeSingle();
    if (!full.error) return { profile: full.data || null, ok: true };
    const basic = await supabase.from("profiles").select(BASIC_PROFILE_COLUMNS).eq("id", id).maybeSingle();
    if (!basic.error) return { profile: basic.data || null, ok: true };
  } catch {
    /* network failure */
  }
  return { profile: null, ok: false };
}

function toState(user, profile, profileStatus) {
  if (!user) return { ...SIGNED_OUT };
  const meta = user.user_metadata || {};
  const name = profile?.full_name || meta.full_name || meta.name || "";
  return {
    isLoaded: true,
    isSignedIn: true,
    user,
    profile,
    profileStatus,
    userId: user.id,
    name,
    username: profile?.username || "",
    email: user.email || "",
    imageUrl: profile?.avatar_url || meta.avatar_url || meta.picture || "",
    isElite: !!profile?.is_elite, // DB-verified; only the payment webhook sets it
    showEliteBadge: profile?.show_elite_badge !== false,
    anonymousCommunity: !!profile?.anonymous_community,
    // Profile setup is required until a public name exists (e.g. first Google
    // login) — known only when the row was actually read.
    needsProfileSetup: profileStatus === "ready" && !profile?.full_name,
  };
}

export function AuthProvider({ children }) {
  const [state, setState] = useState({ ...SIGNED_OUT, isLoaded: false });
  const lastUserId = useRef(undefined);
  const lastProfile = useRef(null);
  const retry = useRef({ timer: null, attempt: 0, pending: null });

  const resolve = useCallback(async (user, supabase, { force = false } = {}) => {
    // Token refreshes fire auth events for the same user — don't refetch the
    // profile for those, only when the identity actually changes.
    if (!force && user && lastUserId.current === user.id) {
      setState((s) => (s.isSignedIn ? { ...s, user } : s));
      return;
    }
    const changed = lastUserId.current !== (user?.id ?? null);
    lastUserId.current = user?.id ?? null;
    if (changed) {
      lastProfile.current = null;
      clearRetry(retry);
    }
    if (!user) {
      setState({ ...SIGNED_OUT });
      return;
    }
    const { profile, ok } = await fetchProfile(supabase, user.id);
    if (lastUserId.current !== user.id) return; // a newer identity won the race
    if (ok) {
      lastProfile.current = profile;
      clearRetry(retry);
      setState(toState(user, profile, "ready"));
      return;
    }
    // Couldn't read the profile: keep what we knew about this member, never
    // treat it as "no name yet", and try again.
    const known = lastProfile.current;
    setState(toState(user, known, known ? "ready" : "error"));
    const r = retry.current;
    r.pending = () => resolve(user, supabase, { force: true });
    if (r.attempt < RETRY_DELAYS_MS.length && !r.timer) {
      r.timer = setTimeout(() => {
        r.timer = null;
        r.pending?.();
      }, RETRY_DELAYS_MS[r.attempt++]);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const supabase = await getSupabase();
    if (!supabase) return;
    const { data, error } = await supabase.auth.getUser();
    // A transient network/auth-server error must not flip the app to signed-out;
    // only an authoritative "no session" (no error, no user) signs the user out.
    if (error && error.status !== 401 && error.status !== 403) return;
    await resolve(data?.user ?? null, supabase, { force: true });
  }, [resolve]);

  useEffect(() => {
    let alive = true;
    let subscription = null;
    let attached = false;
    const retryRef = retry;

    const attach = async (supabase) => {
      if (attached || !alive) return;
      attached = true;
      const { data: { session } } = await supabase.auth.getSession();
      if (!alive) return;
      await resolve(session?.user ?? null, supabase, { force: true });
      const { data } = supabase.auth.onAuthStateChange((_event, s) => {
        if (!alive) return;
        // Never await Supabase calls inside this callback (it can deadlock the
        // auth lock); schedule the profile fetch instead.
        setTimeout(() => alive && resolve(s?.user ?? null, supabase), 0);
      });
      subscription = data.subscription;
      if (!alive) subscription.unsubscribe();
    };
    const off = onSupabaseReady(attach);

    // Back in the tab: a guest may have signed in elsewhere (cookie appears),
    // or a failed profile read can be retried now.
    const wake = () => {
      if (document.visibilityState === "hidden") return;
      if (!attached && hasAuthCookie()) getSupabase().catch(() => {});
      if (attached) retry.current.pending?.();
    };
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);

    if (!isSupabaseConfigured) {
      setState({ ...SIGNED_OUT });
    } else if (hasAuthCookie() || isSupabaseRequested()) {
      getSupabase()
        .then((client) => { if (!client && alive) setState({ ...SIGNED_OUT }); })
        .catch(() => { if (alive) setState({ ...SIGNED_OUT }); });
    } else {
      // Guest: no session cookie → signed out, and no Supabase download.
      setState({ ...SIGNED_OUT });
    }

    return () => {
      alive = false;
      off();
      subscription?.unsubscribe();
      clearRetry(retryRef);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [resolve]);

  const signOut = useCallback(async () => {
    // 'local' so signing out here never logs the user out on other devices.
    try { localStorage.removeItem("jazira_session_id_v1"); } catch {}
    const supabase = await getSupabase();
    await supabase?.auth.signOut({ scope: "local" });
    lastUserId.current = null;
    lastProfile.current = null;
    clearRetry(retry);
    setState({ ...SIGNED_OUT });
  }, []);

  const value = useMemo(() => ({ ...state, refreshUser, signOut }), [state, refreshUser, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthUser() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthUser must be used within <AuthProvider>");
  return ctx;
}
