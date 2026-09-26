"use client";

import { useAuthUser } from "@/context/AuthProvider";
import { useViewerOverride } from "./context";

/**
 * The signed-in member as the community UI needs it. `override` lets a
 * harness render signed-in states without a session (visual QA only).
 */
export function useViewer(override) {
  const auth = useAuthUser();
  const fromContext = useViewerOverride();
  const o = override || fromContext;
  if (o) return { isLoaded: true, ...o };
  return {
    isLoaded: auth.isLoaded,
    isSignedIn: auth.isSignedIn,
    userId: auth.userId,
    name: auth.name,
    username: auth.username,
    avatar: auth.imageUrl || null,
    anonymous: auth.anonymousCommunity,
    elite: auth.isElite && auth.showEliteBadge,
  };
}
