"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useAuthUser } from "@/context/AuthProvider";
import { useRouter } from "@/i18n/navigation";
import { getSupabase } from "@/lib/supabase-lazy";
import { readLastVisit } from "./lastVisit";
import {
  errorCode, loadAttempts, loadNotifications, loadOnboardingSignals, loadProgress, loadQuota, loadResume, loadStats, loadSubscription,
} from "./data";
import { findResumable } from "./model";

const DashboardContext = createContext(null);

export const RESOURCES = ["progress", "attempts", "resume", "stats", "notifications", "subscription", "quota", "onboarding"];
const LOADING = Object.freeze({ status: "loading", data: null, error: null });
const SIGN_IN = `/sign-in?next=${encodeURIComponent("/dashboard")}`;

const initialState = () => Object.fromEntries(RESOURCES.map((k) => [k, LOADING]));

function reducer(state, action) {
  if (action.type !== "set") return state;
  return { ...state, [action.key]: { status: action.status, data: action.data ?? null, error: action.error ?? null } };
}

/**
 * Loads everything the dashboard shows — one independent request per card, so
 * each card leaves its skeleton as soon as ITS data arrives and one slow or
 * failing query never blocks the rest.
 *
 * Guards the page for expired sessions: once auth has resolved to "signed
 * out" it replaces the route with sign-in (the middleware only checks that an
 * auth cookie exists).
 */
export default function DashboardProvider({ children }) {
  const auth = useAuthUser();
  const router = useRouter();
  const [resources, dispatch] = useReducer(reducer, null, initialState);
  const [lastVisit, setLastVisit] = useState(undefined);
  const [now, setNow] = useState(null);
  const alive = useRef(true);
  const xpFallback = useRef(null);

  const userId = auth.userId;
  const live = auth.isLoaded && auth.isSignedIn && Boolean(userId);
  xpFallback.current = Number.isFinite(Number(auth.profile?.xp)) ? Number(auth.profile.xp) : null;

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // Client clock (greeting, "x min left", today's tip). Ticks once a minute.
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  // Expired session / signed out → sign in, then come back here.
  useEffect(() => {
    if (!auth.isLoaded || auth.isSignedIn) return;
    router.replace(SIGN_IN);
  }, [auth.isLoaded, auth.isSignedIn, router]);

  useEffect(() => {
    setLastVisit(readLastVisit());
  }, []);

  // Latest request per card wins: a retry or refresh supersedes one still in flight.
  const seq = useRef({});
  const run = useCallback((key, load) => {
    const id = (seq.current[key] || 0) + 1;
    seq.current[key] = id;
    const current = () => alive.current && seq.current[key] === id;
    dispatch({ type: "set", key, status: "loading" });
    Promise.resolve()
      .then(load)
      .then(
        (data) => {
          if (current()) dispatch({ type: "set", key, status: "ready", data });
        },
        (err) => {
          if (!current()) return;
          const code = errorCode(err);
          if (code === "not_authenticated") router.replace(SIGN_IN);
          dispatch({ type: "set", key, status: code === "unavailable" ? "unavailable" : "error", error: code });
        }
      );
  }, [router]);

  const loaders = useMemo(() => ({
    progress: async () => loadProgress(await getSupabase(), userId, { fallbackXp: xpFallback.current }),
    attempts: loadAttempts,
    stats: loadStats,
    notifications: loadNotifications,
    quota: loadQuota,
    subscription: async () => loadSubscription(await getSupabase(), userId),
    onboarding: async () => loadOnboardingSignals(await getSupabase(), userId),
  }), [userId]);

  // Primary + secondary data: all independent, all in flight at once.
  useEffect(() => {
    if (!live) return;
    for (const key of ["progress", "attempts", "stats", "notifications", "quota"]) run(key, loaders[key]);
  }, [live, run, loaders]);

  // The attempt to resume: its real progress + server countdown (get_exam_attempt).
  const resumableId = resources.attempts.status === "ready" && now !== null ? findResumable(resources.attempts.data, now)?.id ?? null : null;
  useEffect(() => {
    if (live && resumableId) run("resume", () => loadResume(resumableId));
  }, [live, resumableId, run]);

  // Graded meanwhile (deadline passed) → refresh the list and the analytics once.
  const closedId = resources.resume.status === "ready" && resources.resume.data?.closed ? resources.resume.data.id : null;
  useEffect(() => {
    if (!live || !closedId) return;
    run("attempts", loaders.attempts);
    run("stats", loaders.stats);
  }, [live, closedId, run, loaders]);

  // Elite renewal date — only members with Elite have a row worth reading.
  const isElite = Boolean(auth.isElite);
  useEffect(() => {
    if (!live) return;
    if (isElite) run("subscription", loaders.subscription);
    else dispatch({ type: "set", key: "subscription", status: "ready", data: null });
  }, [live, isElite, run, loaders]);

  // Onboarding checklist signals — only for members without a completed attempt.
  const brandNew = resources.stats.status === "ready" && resources.stats.data?.completed === 0;
  useEffect(() => {
    if (live && brandNew) run("onboarding", loaders.onboarding);
  }, [live, brandNew, run, loaders]);

  const reload = useCallback((key) => {
    if (live && loaders[key]) run(key, loaders[key]);
  }, [live, loaders, run]);

  const value = useMemo(() => ({
    session: !auth.isLoaded ? "loading" : auth.isSignedIn ? "ready" : "redirecting",
    user: { name: auth.name || "", isElite },
    now,
    lastVisit,
    resources,
    reload,
  }), [auth.isLoaded, auth.isSignedIn, auth.name, isElite, now, lastVisit, resources, reload]);

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used inside <DashboardProvider>");
  return ctx;
}

/**
 * The newest attempt that can still be resumed, with its progress when known:
 *   { attempt: list row | null, progress: resumeSummary() + readAt | null }
 * An attempt the server has graded meanwhile is not offered for resuming.
 */
export function useResumable() {
  const { now, resources } = useDashboard();
  const { attempts, resume } = resources;
  return useMemo(() => {
    if (now === null || attempts.status !== "ready") return { attempt: null, progress: null };
    const attempt = findResumable(attempts.data, now);
    if (!attempt) return { attempt: null, progress: null };
    const progress = resume.status === "ready" && resume.data?.id === attempt.id ? resume.data : null;
    if (progress?.closed) return { attempt: null, progress: null };
    return { attempt, progress };
  }, [now, attempts, resume]);
}

/** One card's resource: { status, data, error, reload }. */
export function useResource(key) {
  const { resources, reload } = useDashboard();
  const r = resources[key] || LOADING;
  const retry = useCallback(() => reload(key), [reload, key]);
  return { ...r, reload: retry };
}
