"use client";

import { createContext, useContext } from "react";
import * as social from "@/lib/social";

/**
 * Optional overrides for the community islands: `source` (data functions,
 * defaults to src/lib/social.js) and `viewer` (a signed-in member). Nothing
 * in the app sets it; it exists so a harness can render signed-in states
 * with fixture data during visual QA without a database.
 */
const CommunityContext = createContext(null);

export function CommunityProvider({ source = null, viewer = null, children }) {
  return <CommunityContext.Provider value={{ source, viewer }}>{children}</CommunityContext.Provider>;
}

/** Data functions for this subtree. */
export function useApi(source) {
  const ctx = useContext(CommunityContext);
  return source || ctx?.source || social;
}

export function useViewerOverride() {
  return useContext(CommunityContext)?.viewer || null;
}
