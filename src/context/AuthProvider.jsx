"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-client";

// Unified Supabase auth context.
// Uses profiles.username (public display name) and profiles.full_name.
// Never exposes email as a display name.
// Shape: { isLoaded, isSignedIn, userId, name, email, imageUrl, needsProfileSetup, signOut }
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({
    isLoaded: false,
    isSignedIn: false,
    userId: null,
    name: "",
    email: "",
    imageUrl: "",
    needsProfileSetup: false,
  });

  useEffect(() => {
    const supabase = createClient();

    async function resolveUser(user) {
      if (!user) {
        return {
          isLoaded: true,
          isSignedIn: false,
          userId: null,
          name: "",
          email: "",
          imageUrl: "",
          needsProfileSetup: false,
        };
      }

      const meta = user.user_metadata || {};

      // profiles table is the authoritative source — select existing columns only
      const { data: profile } = await supabase
        .from("profiles")
        .select("username, full_name, avatar_url")
        .eq("id", user.id)
        .single();

      // Priority: DB username → DB full_name → OAuth full_name → OAuth name
      // NEVER fall back to email or email prefix
      const name =
        profile?.username ||
        profile?.full_name ||
        meta.full_name ||
        meta.name ||
        "";

      const imageUrl =
        profile?.avatar_url ||
        meta.avatar_url ||
        meta.picture ||
        "";

      // needsProfileSetup: true when the user has no username set in DB
      // (email-registered users have username set during signUp; Google users need profile-setup)
      const needsProfileSetup = !profile?.username;

      return {
        isLoaded: true,
        isSignedIn: true,
        userId: user.id,
        name,
        email: user.email || "",
        imageUrl,
        needsProfileSetup,
      };
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setState(await resolveUser(session?.user ?? null));
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setState(await resolveUser(session?.user ?? null));
      }
    );

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = async () => {
    await createClient().auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ ...state, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthUser() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthUser must be used within <AuthProvider>");
  return ctx;
}
