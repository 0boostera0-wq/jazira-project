// ============================================================================
// Global search — client data layer (see docs/DATA_API.md → "Search").
//
//   searchAll(q, { limit, signal, types, offset })
//                                     one request to search_all(): Arabic-
//                                     normalised matching, per-group totals,
//                                     anonymous post authors masked, premium
//                                     questions only for premium users
//   createSearcher({ delay, limit, types, offset })
//                                     typeahead helper: 250 ms debounce, cancels
//                                     the stale request, resolves only the latest
//   debounce(fn, ms)                  generic trailing debounce with .cancel()
//
// Results are cached in memory (LRU, 50 entries, 2 min) PER VIEWER: the key
// starts with the signed-in user's id (or "anon"), and the cache is cleared
// when the session's user changes (sign-in, sign-out, account switch) — what a
// search returns depends on who asks (premium questions, blocks, own posts).
// Queries shorter than 2 characters (after trimming) never hit the network.
// Unavailable (no Supabase / RPC or a table not deployed) → empty groups with
// `available: false`. Aborted requests reject with DataError code "aborted".
// ============================================================================
import { getSupabase } from "@/lib/supabase-lazy";

export const SEARCH_MIN_CHARS = 2;
export const SEARCH_MAX_CHARS = 100;
export const SEARCH_DEBOUNCE_MS = 250;
export const SEARCH_GROUPS = ["people", "posts", "tags", "questions"];
export const SEARCH_MAX_LIMIT = 20;      // rows per group per request (search_all p_limit)
export const SEARCH_MAX_OFFSET = 100;    // search_all p_offset
export const SEARCH_TOTAL_CAP = 100;     // totals stop counting here (totalsCapped says "more")
const CACHE_SIZE = 50;
const CACHE_TTL_MS = 2 * 60_000;
// function missing (PGRST202 / 42883) or a table it reads missing (PGRST205 / 42P01)
const MISSING = new Set(["PGRST202", "PGRST205", "42883", "42P01"]);

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

/**
 * `types` → the canonical subset of SEARCH_GROUPS (null = every group).
 * Throws DataError("invalid_argument") for an empty list or an unknown group.
 */
export function normalizeTypes(types) {
  if (types === null || types === undefined) return null;
  const list = Array.isArray(types) ? types : [types];
  if (!list.length || list.some((t) => !SEARCH_GROUPS.includes(t))) throw dataError("invalid_argument");
  const out = SEARCH_GROUPS.filter((g) => list.includes(g));
  return out.length === SEARCH_GROUPS.length ? null : out;
}

export const emptyResults = (query = "", available = true) => ({
  query, people: [], posts: [], tags: [], questions: [], totals: null, totalsCapped: null, available,
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

// ── viewer scoping ──────────────────────────────────────────────────────────
// Last viewer seen ("anon" or a user id); null until the first request.
let viewerKey = null;
let watchedAuth = null;

function setViewer(next) {
  if (viewerKey !== null && viewerKey !== next) cache.clear();
  viewerKey = next;
}

/** Subscribe once per auth client: clear the cache whenever the user changes. */
function watchAuth(supabase) {
  const auth = supabase?.auth;
  if (!auth || watchedAuth === auth || typeof auth.onAuthStateChange !== "function") return;
  watchedAuth = auth;
  try {
    auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        cache.clear();
        viewerKey = "anon";
        return;
      }
      setViewer(session?.user?.id || "anon");
    });
  } catch {
    watchedAuth = null;
  }
}

async function resolveViewer(supabase) {
  let uid = null;
  try {
    const { data } = await supabase.auth.getSession();
    uid = data?.session?.user?.id || null;
  } catch {
    uid = null;
  }
  setViewer(uid || "anon");
  watchAuth(supabase);
  return viewerKey;
}

/** Cache key: viewer · limit · offset · groups · query (lower-cased). */
export function searchCacheKey(viewer, query, { limit = 5, offset = 0, types = null } = {}) {
  return [viewer || "anon", limit, offset, types ? types.join(",") : "*", query.toLowerCase()].join("\u0000");
}

function checkPaging(limit, offset) {
  if (!Number.isInteger(limit) || limit < 1 || limit > SEARCH_MAX_LIMIT) throw dataError("invalid_argument");
  if (!Number.isInteger(offset) || offset < 0 || offset > SEARCH_MAX_OFFSET) throw dataError("invalid_argument");
}

// ── request ─────────────────────────────────────────────────────────────────
/**
 * @param {string} q
 * @param {{ limit?: number, signal?: AbortSignal, types?: string[]|null, offset?: number }} [opts]
 *   limit 1..20 rows per group (default 5); types = a subset of SEARCH_GROUPS to
 *   compute (default all — the others come back empty with a null total);
 *   offset 0..100 pages the requested groups ("view all" for one group:
 *   `{ types: ["posts"], limit: 20, offset: 20 }`).
 * @returns {Promise<{ query, people[], posts[], tags[], questions[],
 *   totals: { people, posts, tags, questions }|null, totalsCapped: {…}|null,
 *   offset, types, available: boolean }>}
 *   totals: per requested group, the number of matches capped at 100 (null for
 *   groups not requested, and when talking to a pre-0012 database);
 *   totalsCapped[group] true means "more than 100".
 */
export async function searchAll(q, { limit = 5, signal, types = null, offset = 0 } = {}) {
  checkPaging(limit, offset);
  const groups = normalizeTypes(types);
  const query = normalizeQuery(q);
  if (query.length < SEARCH_MIN_CHARS) return emptyResults(query);
  if (signal?.aborted) throw dataError("aborted");

  let supabase = null;
  try {
    supabase = await getSupabase();
  } catch {
    supabase = null;
  }
  if (!supabase) return emptyResults(query, false);

  const viewer = await resolveViewer(supabase);
  const key = searchCacheKey(viewer, query, { limit, offset, types: groups });
  const hit = cache.get(key);
  if (hit) return hit;
  if (signal?.aborted) throw dataError("aborted");

  // p_types / p_offset only when used: the default call also matches a
  // database that predates them (0010's search_all(p_q, p_limit)).
  const args = { p_q: query, p_limit: limit };
  if (groups) args.p_types = groups;
  if (offset) args.p_offset = offset;
  let req = supabase.rpc("search_all", args);
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
    if (MISSING.has(error.code) || /could not find the function|schema cache/i.test(error.message || "")) {
      return emptyResults(query, false);
    }
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
    totals: data?.totals && typeof data.totals === "object" ? data.totals : null,
    totalsCapped: data?.totals_capped && typeof data.totals_capped === "object" ? data.totals_capped : null,
    offset,
    types: groups,
    available: true,
  };
  // Don't cache a result that arrived for a viewer who has since changed.
  if (viewerKey === viewer) cache.set(key, out);
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
export function createSearcher({ delay = SEARCH_DEBOUNCE_MS, limit = 5, types = null, offset = 0 } = {}) {
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
    let groups;
    try {
      checkPaging(limit, offset);
      groups = normalizeTypes(types);
    } catch (e) {
      return Promise.reject(e);
    }
    // Instant answer from the cache for the last known viewer; searchAll()
    // re-checks the session before every network request.
    if (viewerKey !== null) {
      const cached = cache.get(searchCacheKey(viewerKey, query, { limit, offset, types: groups }));
      if (cached) return Promise.resolve(cached);
    }
    return new Promise((resolve, reject) => {
      pendingReject = reject;
      timer = setTimeout(() => {
        timer = null;
        pendingReject = null;
        controller = new AbortController();
        const mine = controller;
        searchAll(query, { limit, types, offset, signal: mine.signal })
          .then(resolve, reject)
          .finally(() => {
            if (controller === mine) controller = null;
          });
      }, delay);
    });
  };

  return { search, cancel };
}
