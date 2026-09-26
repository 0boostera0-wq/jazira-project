"use client";

import { useAuthUser } from "@/context/AuthProvider";

/**
 * Viewer tier for UI limits: "guest" | "free" | "elite" (null while auth loads).
 * `profiles.is_elite` is set by the payment webhook together with the
 * subscription; the database stays the authority (premium_required).
 */
export function useTier() {
  const { isLoaded, isSignedIn, isElite } = useAuthUser();
  if (!isLoaded) return { isLoaded: false, tier: null, isSignedIn: false };
  return { isLoaded: true, isSignedIn, tier: !isSignedIn ? "guest" : isElite ? "elite" : "free" };
}
