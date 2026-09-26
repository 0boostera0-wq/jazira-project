"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAuthUser } from "@/context/AuthProvider";
import * as realApi from "./api";

// Dependency seam for the settings islands: real auth + Supabase by default.
// A visual-QA harness may wrap the page in <SettingsOverride auth api> to
// render signed-in states without a backend; production never does.
const OverrideContext = createContext(null);

export function SettingsOverride({ auth, api, children }) {
  return <OverrideContext.Provider value={{ auth, api }}>{children}</OverrideContext.Provider>;
}

/** useAuthUser(), or the harness' fake member. */
export function useSettingsAuth() {
  const real = useAuthUser();
  const o = useContext(OverrideContext);
  return o?.auth ? { ...real, ...o.auth } : real;
}

export function useSettingsApi() {
  const o = useContext(OverrideContext);
  return o?.api || realApi;
}

// ── load once per session, show cached data instantly, refresh quietly ─────
const cache = new Map();

/**
 * const { status, data, error, reload, mutate } = useLoad(key, () => api.x())
 * key = null → idle (e.g. signed out). Cached per key for the session.
 */
export function useLoad(key, load) {
  const loadRef = useRef(load);
  loadRef.current = load;
  const [state, setState] = useState(() =>
    key && cache.has(key) ? { status: "ready", data: cache.get(key), error: null } : { status: key ? "loading" : "idle", data: undefined, error: null }
  );
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!key) {
      setState({ status: "idle", data: undefined, error: null });
      return undefined;
    }
    let alive = true;
    if (cache.has(key)) setState({ status: "ready", data: cache.get(key), error: null });
    else setState((s) => (s.status === "loading" ? s : { status: "loading", data: undefined, error: null }));
    Promise.resolve()
      .then(() => loadRef.current())
      .then((data) => {
        if (!alive) return;
        cache.set(key, data);
        setState({ status: "ready", data, error: null });
      })
      .catch((error) => {
        if (!alive) return;
        setState((s) => (s.status === "ready" && cache.has(key) ? s : { status: "error", data: undefined, error }));
      });
    return () => {
      alive = false;
    };
  }, [key, nonce]);

  const reload = useCallback(() => {
    if (key) cache.delete(key);
    setNonce((n) => n + 1);
  }, [key]);

  const mutate = useCallback(
    (updater) =>
      setState((s) => {
        const data = typeof updater === "function" ? updater(s.data) : updater;
        if (key) cache.set(key, data);
        return { status: "ready", data, error: null };
      }),
    [key]
  );

  return { ...state, reload, mutate };
}

/** Forget cached reads (after sign-out / account changes). */
export const clearSettingsCache = () => cache.clear();

// ── inline save state: idle → saving → saved (auto-clears) | error ──────────
export function useSaver(resetMs = 2600) {
  const [state, setState] = useState({ status: "idle", error: null });
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const run = useCallback(
    async (fn) => {
      clearTimeout(timer.current);
      setState({ status: "saving", error: null });
      try {
        const value = await fn();
        setState({ status: "saved", error: null });
        timer.current = setTimeout(() => setState((s) => (s.status === "saved" ? { status: "idle", error: null } : s)), resetMs);
        return { ok: true, value };
      } catch (error) {
        setState({ status: "error", error });
        return { ok: false, error };
      }
    },
    [resetMs]
  );
  const reset = useCallback(() => {
    clearTimeout(timer.current);
    setState({ status: "idle", error: null });
  }, []);

  return { ...state, saving: state.status === "saving", run, reset };
}

/** Re-render every `ms` (cooldown messaging). */
export function useNow(ms = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
