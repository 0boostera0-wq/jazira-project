"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAiQuota } from "@/lib/data/ai";
import { listSessions, mergeSessions } from "@/lib/chatStore";

const MAX_TIMER = 2 ** 31 - 1;

/**
 * Server quota (ai_quota() via getAiQuota). status:
 *   "idle" (signed out / auth loading) · "loading" · "ready" (data) ·
 *   "none" (not configured / RPC not deployed → no numbers) · "error"
 * `exhausted` also turns on after a 429 from /api/chat (markExhausted) and
 * clears itself once the next message slot frees up.
 */
export function useQuota(enabled) {
  const [state, setState] = useState({ status: "idle", data: null });
  const [hit, setHit] = useState(null); // { resetsAt } from a 429
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true; // re-arm after a StrictMode remount
    return () => { alive.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setState((s) => (s.data ? s : { status: "loading", data: null }));
    try {
      const data = await getAiQuota();
      if (!alive.current) return;
      setState(data ? { status: "ready", data } : { status: "none", data: null });
      if (data && (data.unlimited || data.remaining > 0)) setHit(null);
    } catch {
      if (alive.current) setState((s) => (s.data ? s : { status: "error", data: null }));
    }
  }, [enabled]);

  useEffect(() => {
    if (enabled) refresh();
    else setState({ status: "idle", data: null });
  }, [enabled, refresh]);

  const data = state.data;
  const exhausted = Boolean(hit) || Boolean(data && !data.unlimited && typeof data.remaining === "number" && data.remaining <= 0);
  const resetsAt = hit?.resetsAt || data?.resets_at || null;

  // Re-check when the next slot frees up.
  useEffect(() => {
    if (!exhausted || !resetsAt) return;
    const ms = new Date(resetsAt).getTime() - Date.now() + 1500;
    const id = setTimeout(() => {
      setHit(null);
      refresh();
    }, Math.min(Math.max(ms, 1000), MAX_TIMER));
    return () => clearTimeout(id);
  }, [exhausted, resetsAt, refresh]);

  const markExhausted = useCallback((info) => {
    setHit({ resetsAt: info?.resetsAt || null });
    refresh();
  }, [refresh]);

  return { ...state, exhausted, resetsAt, refresh, markExhausted };
}

/**
 * Past conversations (chat_history grouped by session), paginated.
 * status: "idle" · "loading" · "ready" · "error" · "unavailable"
 */
export function useSessions(enabled) {
  const [state, setState] = useState({ status: "idle", items: [], nextCursor: null, loadingMore: false });
  const reqRef = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  const loadFirst = useCallback(async () => {
    const req = ++reqRef.current;
    setState({ status: "loading", items: [], nextCursor: null, loadingMore: false });
    try {
      const page = await listSessions({ limit: 20 });
      if (req !== reqRef.current) return;
      setState({ status: "ready", items: page.sessions, nextCursor: page.nextCursor, loadingMore: false });
    } catch (err) {
      if (req !== reqRef.current) return;
      setState({ status: err?.code === "unavailable" ? "unavailable" : "error", items: [], nextCursor: null, loadingMore: false });
    }
  }, []);

  useEffect(() => {
    if (enabled) loadFirst();
    else {
      reqRef.current++;
      setState({ status: "idle", items: [], nextCursor: null, loadingMore: false });
    }
  }, [enabled, loadFirst]);

  const loadMore = useCallback(async () => {
    const req = reqRef.current;
    const { nextCursor: cursor, items, loadingMore } = stateRef.current;
    if (!cursor || loadingMore) return;
    stateRef.current = { ...stateRef.current, loadingMore: true };
    setState((s) => ({ ...s, loadingMore: true }));
    try {
      // A page can contain only conversations already listed (they span pages);
      // keep going a few pages so "load more" always shows something new.
      let merged = items;
      let next = cursor;
      for (let hop = 0; hop < 4 && next; hop++) {
        const page = await listSessions({ limit: 20, before: next });
        const before = merged.length;
        merged = mergeSessions(merged, page.sessions);
        next = page.nextCursor;
        if (merged.length > before) break;
      }
      if (req !== reqRef.current) return;
      setState((s) => ({ ...s, items: mergeSessions(s.items, merged), nextCursor: next, loadingMore: false }));
    } catch {
      if (req !== reqRef.current) return;
      setState((s) => ({ ...s, loadingMore: false }));
    }
  }, []);

  /** Put a conversation at the top (a new reply arrived). */
  const upsert = useCallback((session) => {
    setState((s) => {
      const existing = s.items.find((x) => x.id === session.id);
      const merged = { ...existing, ...session, title: existing?.title || session.title };
      return { ...s, status: s.status === "idle" || s.status === "loading" ? s.status : "ready", items: [merged, ...s.items.filter((x) => x.id !== session.id)] };
    });
  }, []);

  const remove = useCallback((id) => {
    setState((s) => ({ ...s, items: s.items.filter((x) => x.id !== id) }));
  }, []);

  const restore = useCallback((session) => {
    setState((s) => ({ ...s, items: mergeSessions(s.items.filter((x) => x.id !== session.id), [session]) }));
  }, []);

  return { ...state, reload: loadFirst, loadMore, upsert, remove, restore };
}
