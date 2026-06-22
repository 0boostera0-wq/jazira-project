"use client";

import { createContext, useContext } from "react";
import { useUser, useClerk } from "@clerk/nextjs";
import { isClerkEnabled } from "@/lib/authConfig";

// Unified auth context so the rest of the app never imports Clerk directly.
// Shape: { isLoaded, isSignedIn, name, email, imageUrl, signOut }
const AuthContext = createContext(null);

// Reads the real Clerk session. Only rendered when Clerk is configured.
function ClerkAuthBridge({ children }) {
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();

  const value = {
    isLoaded,
    isSignedIn: !!isSignedIn,
    userId: user?.id || null,
    name: user?.fullName || user?.firstName || "",
    email: user?.primaryEmailAddress?.emailAddress || "",
    imageUrl: user?.imageUrl || "",
    signOut: () => signOut({ redirectUrl: "/" }),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Guest fallback used when Clerk keys are absent (demo mode).
function GuestAuthBridge({ children }) {
  const value = {
    isLoaded: true,
    isSignedIn: false,
    userId: null,
    name: "",
    email: "",
    imageUrl: "",
    signOut: () => {},
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }) {
  if (isClerkEnabled) return <ClerkAuthBridge>{children}</ClerkAuthBridge>;
  return <GuestAuthBridge>{children}</GuestAuthBridge>;
}

export function useAuthUser() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthUser must be used within <AuthProvider>");
  return ctx;
}
