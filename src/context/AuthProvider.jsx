"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { getSupabase } from "@/lib/supabase-lazy";
import { publicName } from "@/lib/profile";

// Unified Supabase auth context.
// Public display name comes from profiles.full_name (NON-UNIQUE) — never email,
// never the internal username handle.
// Shape: { isLoaded, isSignedIn, userId, name, email, phone, imageUrl,
//          needsProfileSetup, refreshUser, signOut }
//
// PERF: the Supabase client is imported dynamically (see supabase-lazy.js) so
// ~248 kB of @supabase stays out of the critical path of every route. Auth
// resolves a tick after hydration; consumers already gate on `isLoaded`.
const AuthContext = createContext(null);

const SIGNED_OUT = {
  isLoaded: true,
  isSignedIn: false,
  userId: null,
  name: "",
  email: "",
  phone: "",
  imageUrl: "",
  isElite: false,
  showEliteBadge: true,
  anonymousCommunity: false,
  needsProfileSetup: false,
};

export function AuthProvider({ children }) {
  const [state, setState] = useState({ ...SIGNED_OUT, isLoaded: false });

  const resolveUser = useCallback(async (user, supabase) => {
    if (!user) return { ...SIGNED_OUT };

    const meta = user.user_metadata || {};

    // profiles is the source of truth. Select ONLY columns guaranteed to exist
    // (id, username, full_name, avatar_url). Selecting a missing column (e.g.
    // phone) would fail the whole query and wrongly force profile-setup forever.
    // Try the full select (incl. display prefs); fall back to the guaranteed
    // columns if the new columns aren't migrated yet (never break auth).
    let profile = null;
    {
      const full = await supabase
        .from("profiles")
        .select("username, full_name, avatar_url, is_elite, show_elite_badge, anonymous_community")
        .eq("id", user.id)
        .single();
      if (full.error) {
        const basic = await supabase
          .from("profiles")
          .select("username, full_name, avatar_url, is_elite")
          .eq("id", user.id)
          .single();
        profile = basic.data;
      } else {
        profile = full.data;
      }
    }

    // Public name: full_name (non-unique). Fall back to OAuth metadata for the
    // brief window before profile-setup completes, but NEVER to email.
    const name = profile?.full_name || meta.full_name || meta.name || "";
    const imageUrl = profile?.avatar_url || meta.avatar_url || meta.picture || "";

    // Setup is required only when there is no full_name yet (covers Google users
    // whose first login has no profile row). Once full_name exists, never again.
    const needsProfileSetup = !profile?.full_name;

    return {
      isLoaded: true,
      isSignedIn: true,
      userId: user.id,
      name,
      email: user.email || "",
      phone: "", // fetched lazily in Settings (column may not exist yet)
      imageUrl,
      isElite: !!profile?.is_elite, // DB-verified; set only by the payment webhook
      showEliteBadge: profile?.show_elite_badge !== false, // default true
      anonymousCommunity: !!profile?.anonymous_community,
      needsProfileSetup,
    };
  }, []);

  // Re-fetch the current user's profile and update context (used right after
  // profile-setup / avatar changes so guards & UI update without a full reload).
  const refreshUser = useCallback(async () => {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    setState(await resolveUser(user, supabase));
  }, [resolveUser]);

  useEffect(() => {
    let alive = true;
    let subscription;

    (async () => {
      const supabase = await getSupabase();
      if (!alive) return;

      const { data: { session } } = await supabase.auth.getSession();
      if (!alive) return;
      setState(await resolveUser(session?.user ?? null, supabase));

      const { data } = supabase.auth.onAuthStateChange(async (_event, s) => {
        if (!alive) return;
        setState(await resolveUser(s?.user ?? null, supabase));
      });
      subscription = data.subscription;
      if (!alive) subscription.unsubscribe();
    })();

    return () => { alive = false; subscription?.unsubscribe(); };
  }, [resolveUser]);

  const signOut = useCallback(async () => {
    // 'local' so signing out on one device never logs out the user's other
    // devices. Rotate the session id so the next login starts a clean session.
    try { localStorage.removeItem("jazira_session_id_v1"); } catch {}
    const supabase = await getSupabase();
    await supabase.auth.signOut({ scope: "local" });
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
