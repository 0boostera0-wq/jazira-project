"use client";

// One shared view of "who do I follow" for every Follow button on the page
// (post cards, suggestions, profile header, follower lists), so following
// someone in one place updates all of them — and it costs one query, not one
// per card.
import { useEffect, useSyncExternalStore } from "react";

const state = { viewer: undefined, loaded: false, loading: null, map: new Map() };
const listeners = new Set();
let version = 0;

function emit() {
  version += 1;
  listeners.forEach((l) => l());
}
function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function ensure(source, viewerId) {
  if (state.viewer !== viewerId) {
    state.viewer = viewerId;
    state.loaded = !viewerId;
    state.loading = null;
    state.map = new Map();
    emit();
  }
  if (!viewerId || state.loaded || state.loading) return;
  state.loading = Promise.resolve(source.getFollowing())
    .then((m) => { state.map = new Map(m); })
    .catch(() => {})
    .finally(() => { state.loaded = true; state.loading = null; emit(); });
}

/** Optimistic local update (null = not following). */
export function setFollowLocal(targetId, pref) {
  if (pref) state.map.set(targetId, pref);
  else state.map.delete(targetId);
  emit();
}

/** → { loaded, pref } where pref is "all" | "posts" | "off" | null (not following). */
export function useFollowState(source, viewerId, targetId) {
  useSyncExternalStore(subscribe, () => version, () => 0);
  useEffect(() => { ensure(source, viewerId || null); }, [source, viewerId]);
  const current = state.viewer === (viewerId || null);
  return { loaded: current && state.loaded, pref: current ? state.map.get(targetId) || null : null };
}
