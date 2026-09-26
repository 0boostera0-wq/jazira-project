"use client";

import { useCallback, useEffect, useState } from "react";
import { RECENT_KEY, addRecent, parseRecent, removeRecent } from "./model";

function read() {
  try {
    return parseRecent(window.localStorage.getItem(RECENT_KEY));
  } catch {
    return [];
  }
}

function write(list) {
  try {
    if (list.length) window.localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    else window.localStorage.removeItem(RECENT_KEY);
  } catch {
    /* private mode / blocked storage: history just isn't kept */
  }
}

/**
 * Recent searches kept on this device (localStorage). Loaded after mount so
 * server and client markup match; other tabs stay in sync via `storage`.
 * → { items, ready, add(q), remove(q), clear() }
 */
export function useRecentSearches() {
  const [items, setItems] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setItems(read());
    setReady(true);
    const onStorage = (e) => {
      if (e.key === null || e.key === RECENT_KEY) setItems(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((fn) => {
    setItems((prev) => {
      const next = fn(prev);
      if (next !== prev) write(next);
      return next;
    });
  }, []);

  const add = useCallback((q) => update((prev) => addRecent(prev, q)), [update]);
  const remove = useCallback((q) => update((prev) => removeRecent(prev, q)), [update]);
  const clear = useCallback(() => update(() => []), [update]);

  return { items, ready, add, remove, clear };
}
