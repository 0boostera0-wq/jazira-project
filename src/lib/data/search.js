// ============================================================================
// Global search — client data layer (see docs/DATA_API.md → "Search").
//
//   searchAll(q, { limit, signal })   one request to search_all() (RLS applies:
//                                     premium questions only for premium users)
//   createSearcher({ delay, limit })  typeahead helper: 250 ms debounce, cancels
//                                     the stale request, resolves only the latest
//   debounce(fn, ms)                  generic trailing debounce with .cancel()
//
// Results are cached in memory (LRU, 50 entries, 2 min) for the session.
// Queries shorter than 2 characters (after trimming) never hit the network.
// Unavailable (no Supabase / RPC not deployed) → empty groups with
// `available: false`. Aborted requests reject with DataError code "aborted".
// ============================================================================
import { getSupabase } from "@/lib/supabase-lazy";

export const SEARCH_MIN_CHARS = 2;
export const SEARCH_MAX_CHARS = 100;
export const SEARCH_DEBOUNCE_MS = 250;
const CACHE_SIZE = 50;
const CACHE_TTL_MS = 2 * 60_000;
const MISSING = new Set(["PGRST202", "42883"]);

function dataError(code, cause = undefined) {
  const e = new Error(code);
  e.name = "DataError";
  e.code = code;
  if (cause !== undefined) e.cause = cause;
  return e;
}
export const isDataError = (e) => e?.name === "DataError";

/** Same normalisation as the database: trim, collapse spaces, cap at 100 chars. */
export function normalizeQuery(q) {
  return String(q ?? "").trim().replace(/\s+/g, " ").slice(0, SEARCH_MAX_CHARS);
}

export const emptyResults = (query = "", available = true) => ({
  query, people: [], posts: [], tags: [], questions: [], available,
});

// ── LRU cache ───────────────────────────────────────────────────────────────
export function createLruCache(max = CACHE_SIZE, ttlMs = CACHE_TTL_MS, now = () => Date.now()) {
  const map = new Map();
  return {
    get(key) {
      const hit = map.get(key);
      if (!hit) return undefined;
      if (now() - hit.at > ttlMs) {
        map.delete(key);
        return undefined;
      }
      map.delete(key);          // refresh recency
      map.set(key, hit);
      return hit.value;
    },
    set(key, value) {
      map.delete(key);
      map.set(key, { value, at: now() });
      while (map.size > max) map.delete(map.keys().next().value);
    },
    clear: () => map.clear(),
    get size() {
      return map.size;
    },
  };
}
const cache = createLruCache();
export const clearSearchCache = () => cache.clear();

// ── request ─────────────────────────────────────────────────────────────────
/**
 * @param {string} q
 * @param {{ limit?: number, signal?: AbortSignal }} [opts]  limit 1..20 per group (default 5)
 * @returns {Promise<{ query, people[], posts[], tags[], questions[], available: boolean }>}
 */
export async function searchAll(q, { limit = 5, signal } = {}) {
  const query = normalizeQuery(q);
  if (query.length < SEARCH_MIN_CHARS) return emptyResults(query);
  const key = `${limit}\u0000${query.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (signal?.aborted) throw dataError("aborted");

  let supabase = null;
  try {
    supabase = await getSupabase();
  } catch {
    supabase = null;
  }
  if (!supabase) return emptyResults(query, false);

  let req = supabase.rpc("search_all", { p_q: query, p_limit: limit });
  if (signal) req = req.abortSignal(signal);
  let res;
  try {
    res = await req;
  } catch (e) {
    throw dataError(signal?.aborted ? "aborted" : "network", e);
  }
  const { data, error } = res;
  if (error) {
    if (signal?.aborted || /abort/i.test(`${error.message || ""} ${error.details || ""}`)) throw dataError("aborted", error);
    if (MISSING.has(error.code)) return emptyResults(query, false);
    if (error.message === "invalid_argument") throw dataError("invalid_argument", error);
    if (!error.code && /fetch|network|load failed/i.test(`${error.message || ""} ${error.details || ""}`)) throw dataError("network", error);
    throw dataError("unknown", error);
  }
  const out = {
    query,
    people: data?.people || [],
    posts: data?.posts || [],
    tags: data?.tags || [],
    questions: data?.questions || [],
    available: true,
  };
  cache.set(key, out);
  return out;
}

// ── debounce / typeahead ────────────────────────────────────────────────────
/** Trailing-edge debounce. The returned function has .cancel(). */
export function debounce(fn, ms = SEARCH_DEBOUNCE_MS) {
  let t = null;
  const d = (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      fn(...args);
    }, ms);
  };
  d.cancel = () => {
    if (t) clearTimeout(t);
    t = null;
  };
  return d;
}

/**
 * Typeahead searcher: each search(q) waits `delay` ms; a newer call aborts the
 * older one (its promise rejects with code "aborted" — ignore that code).
 *
 *   const s = createSearcher();
 *   s.search(text).then(setResults).catch((e) => e.code !== "aborted" && setError(e.code));
 *   // on unmount: s.cancel()
 */
export function createSearcher({ delay = SEARCH_DEBOUNCE_MS, limit = 5 } = {}) {
  let timer = null;
  let controller = null;
  let pendingReject = null;

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (controller) controller.abort();
    controller = null;
    if (pendingReject) pendingReject(dataError("aborted"));
    pendingReject = null;
  };

  const search = (q) => {
    cancel();
    const query = normalizeQuery(q);
    if (query.length < SEARCH_MIN_CHARS) return Promise.resolve(emptyResults(query));
    const cached = cache.get(`${limit}\u0000${query.toLowerCase()}`);
    if (cached) return Promise.resolve(cached);
    return new Promise((resolve, reject) => {
      pendingReject = reject;
      timer = setTimeout(() => {
        timer = null;
        pendingReject = null;
        controller = new AbortController();
        const mine = controller;
        searchAll(query, { limit, signal: mine.signal })
          .then(resolve, reject)
          .finally(() => {
            if (controller === mine) controller = null;
          });
      }, delay);
    });
  };

  return { search, cancel };
}
