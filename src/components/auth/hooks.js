"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cooldownLeft, RESEND_COOLDOWN_S, SENT_AT_KEYS, writeSession } from "./authUtils";

/**
 * The current URL's search params, read after mount. Auth pages stay statically
 * rendered (no useSearchParams → no Suspense bail-out); `null` until mounted.
 */
export function useQueryParams() {
  const [params, setParams] = useState(null);
  useEffect(() => {
    try { setParams(new URLSearchParams(window.location.search)); } catch { setParams(new URLSearchParams()); }
  }, []);
  return params;
}

/**
 * Resend cooldown for one flow ("signup" | "recovery"), backed by
 * sessionStorage (survives reloads within the tab) with an in-memory fallback
 * when storage is blocked. `start()` records a send now; `left` counts down to
 * 0 once per second.
 */
export function useResendCooldown(flow) {
  const [left, setLeft] = useState(0);
  const localSentAt = useRef(0);

  const compute = useCallback(() => {
    const mem = localSentAt.current
      ? Math.max(0, Math.ceil((localSentAt.current + RESEND_COOLDOWN_S * 1000 - Date.now()) / 1000))
      : 0;
    return Math.max(mem, cooldownLeft(flow));
  }, [flow]);

  useEffect(() => { setLeft(compute()); }, [compute]);

  useEffect(() => {
    if (left <= 0) return undefined;
    const id = setTimeout(() => setLeft(compute()), 1000);
    return () => clearTimeout(id);
  }, [left, compute]);

  const start = useCallback(() => {
    localSentAt.current = Date.now();
    writeSession(SENT_AT_KEYS[flow], localSentAt.current);
    setLeft(compute());
  }, [compute, flow]);

  return { left, start };
}
