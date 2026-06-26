"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase-client";
import { publicName } from "@/lib/profile";

// Unified Supabase auth context.
// Public display name comes from profiles.full_name (NON-UNIQUE) — never email,
// never the internal username handle.
// Shape: { isLoaded, isSignedIn, userId, name, email, phone, imageUrl,
//          needsProfileSetup, refreshUser, signOut }
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const supabaseRef = useRef(null);
  if (!supabaseRef.current) supabaseRef.current = createClient();
  const supabase = supabaseRef.current;

  const [state, setState] = useState({
    isLoaded: false,
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
  });

  const resolveUser = useCallback(async (user) => {
    if (!user) {
      return {
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
    }

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
    const name =
      profile?.full_name ||
      meta.full_name ||
      meta.name ||
      "";

    const imageUrl =
      profile?.avatar_url ||
      meta.avatar_url ||
      meta.picture ||
      "";

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
  }, [supabase]);

  // Re-fetch the current user's profile and update context (used right after
  // profile-setup / avatar changes so guards & UI update without a full reload).
  const refreshUser = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setState(await resolveUser(user));
  }, [supabase, resolveUser]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setState(await resolveUser(session?.user ?? null));
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setState(await resolveUser(session?.user ?? null));
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase, resolveUser]);

  const signOut = useCallback(async () => {
    // 'local' so signing out on one device never logs out the user's other
    // devices. Rotate the session id so the next login starts a clean session.
    try { localStorage.removeItem("jazira_session_id_v1"); } catch {}
    await supabase.auth.signOut({ scope: "local" });
    setState({
      isLoaded: true,
      isSignedIn: false,
      userId: null,
      name: "",
      email: "",
      phone: "",
      imageUrl: "",
      needsProfileSetup: false,
    });
  }, [supabase]);

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
