"use client";

// Async accessor for the Supabase browser client.
//
// WHY: providers mounted on EVERY page need Supabase. A static import would
// weld ~250 kB of @supabase into the critical-path bundle of every route,
// including the guest homepage. Dynamically importing moves it into an async
// chunk that loads after hydration — and only when something actually asks
// for it (AuthProvider asks only when a session cookie exists, see
// hasAuthCookie()). Consumers gate on `isLoaded`.
//
// Resolves the SAME singleton as supabase-client.js (never a second client),
// or null when Supabase env vars are missing — without downloading the
// library at all in that case.
import { isSupabaseConfigured } from "@/lib/supabase-env";

let p;
const readyListeners = new Set();

export function getSupabase() {
  if (!isSupabaseConfigured) return Promise.resolve(null);
  if (!p) {
    p = import("@/lib/supabase-client").then((m) => m.createClient());
    p.then((client) => {
      if (client) for (const fn of readyListeners) fn(client);
    }).catch(() => {});
  }
  return p;
}

/** Has the client been requested yet (by anyone)? */
export const isSupabaseRequested = () => Boolean(p);

/**
 * Call `fn(client)` once the client exists — immediately (async) if it was
 * already requested, otherwise whenever the first getSupabase() call loads it.
 * Lets AuthProvider start listening to auth changes without being the one
 * that pulls the chunk in (e.g. a guest opens the sign-in form).
 * → unsubscribe()
 */
export function onSupabaseReady(fn) {
  readyListeners.add(fn);
  if (p) p.then((client) => client && readyListeners.has(fn) && fn(client)).catch(() => {});
  return () => readyListeners.delete(fn);
}

// @supabase/ssr keeps the session in `sb-<ref>-auth-token` cookies (chunked
// as .0/.1 when large) that are readable by page scripts (not HttpOnly) —
// the same rule as src/middleware.js.
const AUTH_COOKIE_RE = /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.\d+)?=[^;]/;

/** Does this browser hold a Supabase session cookie? (false on the server) */
export function hasAuthCookie() {
  if (typeof document === "undefined") return false;
  try {
    return AUTH_COOKIE_RE.test(document.cookie || "");
  } catch {
    return false;
  }
}
