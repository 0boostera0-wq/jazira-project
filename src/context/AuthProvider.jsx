"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-client";

// Unified auth context backed by Supabase.
// Shape: { isLoaded, isSignedIn, userId, name, email, imageUrl, signOut }
// Components import useAuthUser() — never touch Supabase or Clerk directly.
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const supabase = createClient();
  const [state, setState] = useState({
    isLoaded: false,
    isSignedIn: false,
    userId: null,
    name: "",
    email: "",
    imageUrl: "",
  });

  useEffect(() => {
    function fromUser(user) {
      if (!user) {
        return { isLoaded: true, isSignedIn: false, userId: null, name: "", email: "", imageUrl: "" };
      }
      const meta = user.user_metadata || {};
      return {
        isLoaded: true,
        isSignedIn: true,
        userId: user.id,
        name: meta.full_name || meta.name || user.email?.split("@")[0] || "",
        email: user.email || "",
        imageUrl: meta.avatar_url || meta.picture || "",
      };
    }

    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState(fromUser(session?.user ?? null));
    });

    // Keep in sync with any auth state change (login, logout, token refresh, OAuth callback)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(fromUser(session?.user ?? null));
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = async () => {
    const supabaseClient = createClient();
    await supabaseClient.auth.signOut();
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
