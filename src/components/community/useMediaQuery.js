"use client";

import { useCallback, useSyncExternalStore } from "react";

const serverSnapshot = () => false;

/**
 * Does `query` match? false on the server and during hydration (so the first
 * client render matches the HTML), then the real value. Used to gate islands
 * that CSS hides at some widths — a hidden island would still mount and fetch.
 */
export function useMediaQuery(query) {
  const subscribe = useCallback((onChange) => {
    try {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    } catch {
      return () => {};
    }
  }, [query]);
  const snapshot = useCallback(() => {
    try {
      return window.matchMedia(query).matches;
    } catch {
      return false;
    }
  }, [query]);
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
