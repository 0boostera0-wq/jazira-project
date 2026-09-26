"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { getSupabase } from "@/lib/supabase-lazy";
import { OWN_PROFILE_COLUMNS, BASIC_PROFILE_COLUMNS } from "@/lib/profile";

// ============================================================================
// The ONE app-wide Supabase auth subscription.
//
// Previously two providers (this one + hooks/useAuth) each subscribed to auth
// changes and each re-fetched the profile on every event — double network work
// on every page. Now this provider owns the session + profile and
// `useAuth()` (hooks/useAuth.js) is a thin action layer on top of it.
//
// Public display name = profiles.full_name (non-unique). Never email, never the
// internal username handle.
//
// PERF: the Supabase client is imported lazily (supabase-lazy.js) so ~250 kB of
// @supabase stays off the critical path. Consumers gate on `isLoaded`.
// ============================================================================

const AuthContext = createContext(null);

const SIGNED_OUT = {
  isLoaded: true,
  isSignedIn: false,
  user: null,
  profile: null,
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

async function fetchProfile(supabase, id) {
  // Explicit columns only: private columns (phone…) are not selectable by
  // clients. Fall back to the minimal set if a newer column isn't migrated yet.
  const full = await supabase.from("profiles").select(OWN_PROFILE_COLUMNS).eq("id", id).maybeSingle();
  if (!full.error) return full.data;
  const basic = await supabase.from("profiles").select(BASIC_PROFILE_COLUMNS).eq("id", id).maybeSingle();
  return basic.data || null;
}

function toState(user, profile) {
  if (!user) return { ...SIGNED_OUT };
  const meta = user.user_metadata || {};
  const name = profile?.full_name || meta.full_name || meta.name || "";
  return {
    isLoaded: true,
    isSignedIn: true,
    user,
    profile,
    userId: user.id,
    name,
    username: profile?.username || "",
    email: user.email || "",
    imageUrl: profile?.avatar_url || meta.avatar_url || meta.picture || "",
    isElite: !!profile?.is_elite, // DB-verified; only the payment webhook sets it
    showEliteBadge: profile?.show_elite_badge !== false,
    anonymousCommunity: !!profile?.anonymous_community,
    // Profile setup is required until a public name exists (e.g. first Google login).
    needsProfileSetup: !profile?.full_name,
  };
}

export function AuthProvider({ children }) {
  const [state, setState] = useState({ ...SIGNED_OUT, isLoaded: false });
  const lastUserId = useRef(undefined);

  const resolve = useCallback(async (user, supabase, { force = false } = {}) => {
    // Token refreshes fire auth events for the same user — don't refetch the
    // profile for those, only when the identity actually changes.
    if (!force && user && lastUserId.current === user.id) {
      setState((s) => (s.isSignedIn ? { ...s, user } : s));
      return;
    }
    lastUserId.current = user?.id ?? null;
    const profile = user ? await fetchProfile(supabase, user.id) : null;
    setState(toState(user, profile));
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
    let subscription;
    (async () => {
      const supabase = await getSupabase();
      if (!supabase || !alive) {
        if (alive) setState({ ...SIGNED_OUT });
        return;
      }
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
    })();
    return () => { alive = false; subscription?.unsubscribe(); };
  }, [resolve]);

  const signOut = useCallback(async () => {
    // 'local' so signing out here never logs the user out on other devices.
    try { localStorage.removeItem("jazira_session_id_v1"); } catch {}
    const supabase = await getSupabase();
    await supabase?.auth.signOut({ scope: "local" });
    lastUserId.current = null;
    setState({ ...SIGNED_OUT });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, refreshUser, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthUser() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthUser must be used within <AuthProvider>");
  return ctx;
}
