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
//   searchContent(q, { kinds, node, limit, offset, signal })
//                                     lessons, units, books and quizzes
//                                     (search_content when signed in, else
//                                     GET /api/content/search); see below
//   createContentSearcher(opts)       typeahead for searchContent
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

// ── content search (lessons, units, books, quizzes) ─────────────────────────
// docs/CONTENT_ENGINE.md §7 "Search". Signed-in users ask search_content
// directly (their lesson-level question counts come back; never stems);
// guests — and databases without 0014 — go through the rate-limited
// GET /api/content/search (service role with p_anon, or the server-side
// outline index). Same payload either way:
//   { query, available, source, groups: { node, resource, exam, question?: { total, capped, items[] } } }
export const CONTENT_GROUPS = ["node", "resource", "exam", "question"];
export const CONTENT_MAX_LIMIT = 20;
export const CONTENT_MAX_OFFSET = 100;
const ROUTE_KINDS = ["node", "resource", "exam"];

export const emptyContentResults = (query = "", available = true) => ({ query, available, source: null, groups: {} });

/** `kinds` → the canonical subset of CONTENT_GROUPS (null = all). Throws invalid_argument. */
export function normalizeContentKinds(kinds) {
  if (kinds === null || kinds === undefined) return null;
  const list = Array.isArray(kinds) ? kinds : [kinds];
  if (!list.length || list.some((k) => !CONTENT_GROUPS.includes(k))) throw dataError("invalid_argument");
  return CONTENT_GROUPS.filter((k) => list.includes(k));
}

function contentGroups(data, kinds) {
  const out = {};
  for (const k of CONTENT_GROUPS) {
    if (kinds && !kinds.includes(k)) continue;
    const g = data?.groups?.[k];
    if (!g || typeof g !== "object") continue;
    const total = Number(g.total);
    out[k] = {
      total: Number.isFinite(total) && total >= 0 ? Math.min(total, SEARCH_TOTAL_CAP) : 0,
      capped: Boolean(g.capped) || total > SEARCH_TOTAL_CAP,
      items: Array.isArray(g.items) ? g.items : [],
    };
  }
  return out;
}

async function contentFromRoute(query, { kinds, node, limit, offset, signal }) {
  const routeKinds = kinds ? kinds.filter((k) => ROUTE_KINDS.includes(k)) : null;
  if (routeKinds && !routeKinds.length) return { ...emptyContentResults(query), source: "index" };
  const params = new URLSearchParams({ q: query, limit: String(limit), offset: String(offset) });
  if (routeKinds && routeKinds.length < ROUTE_KINDS.length) params.set("kinds", routeKinds.join(","));
  if (node) params.set("node", node);
  let res;
  try {
    res = await fetch(`/api/content/search?${params}`, { signal, headers: { Accept: "application/json" } });
  } catch (e) {
    throw dataError(signal?.aborted || e?.name === "AbortError" ? "aborted" : "network", e);
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok) {
    if (res.status === 429) throw dataError("rate_limited");
    if (res.status === 400) throw dataError("invalid_argument");
    if (res.status === 503) return emptyContentResults(query, false);
    throw dataError("unknown");
  }
  return { query: typeof json?.query === "string" ? json.query : query, available: true, source: json?.source ?? "index", groups: contentGroups(json, routeKinds) };
}

/**
 * @param {string} q
 * @param {{ kinds?: string[]|null, node?: string|null, limit?: number, offset?: number, signal?: AbortSignal }} [opts]
 *   kinds ⊆ CONTENT_GROUPS ("question" only reaches signed-in users); node = subtree
 *   filter (a node id); limit 1..20 (default 5); offset 0..100.
 */
export async function searchContent(q, { kinds = null, node = null, limit = 5, offset = 0, signal } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > CONTENT_MAX_LIMIT) throw dataError("invalid_argument");
  if (!Number.isInteger(offset) || offset < 0 || offset > CONTENT_MAX_OFFSET) throw dataError("invalid_argument");
  const groups = normalizeContentKinds(kinds);
  if (node !== null && (typeof node !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*){0,5}$/.test(node))) throw dataError("invalid_argument");
  const query = normalizeQuery(q);
  if (query.length < SEARCH_MIN_CHARS) return emptyContentResults(query);
  if (signal?.aborted) throw dataError("aborted");

  let supabase = null;
  try {
    supabase = await getSupabase();
  } catch {
    supabase = null;
  }
  const viewer = supabase ? await resolveViewer(supabase) : "anon";
  const key = `content\u0000${searchCacheKey(viewer, query, { limit, offset, types: groups })}\u0000${node || ""}`;
  const hit = cache.get(key);
  if (hit) return hit;

  let out = null;
  if (supabase && viewer !== "anon") {
    let req = supabase.rpc("search_content", { p_q: query, p_kinds: groups, p_node: node, p_limit: limit, p_offset: offset });
    if (signal) req = req.abortSignal(signal);
    let res;
    try {
      res = await req;
    } catch (e) {
      throw dataError(signal?.aborted ? "aborted" : "network", e);
    }
    const { data, error } = res;
    if (!error) out = { query: typeof data?.query === "string" ? data.query : query, available: true, source: "db", groups: contentGroups(data, groups) };
    else if (signal?.aborted || /abort/i.test(`${error.message || ""}`)) throw dataError("aborted", error);
    else if (error.message === "invalid_argument") throw dataError("invalid_argument", error);
    else if (!MISSING.has(error.code) && !/could not find the function|schema cache/i.test(error.message || "")) {
      if (!error.code && /fetch|network|load failed/i.test(`${error.message || ""}`)) throw dataError("network", error);
      throw dataError("unknown", error);
    }
    // search_content not deployed yet → the route (outline index)
  }
  if (!out) out = await contentFromRoute(query, { kinds: groups, node, limit, offset, signal });
  if (viewerKey === null || viewerKey === viewer) cache.set(key, out);
  return out;
}

/**
 * Typeahead for content search: 250 ms debounce, a newer call aborts the
 * older one (rejects with code "aborted"), queries under 2 chars resolve empty
 * without a request.
 */
export function createContentSearcher({ delay = SEARCH_DEBOUNCE_MS, limit = 5, kinds = null, node = null } = {}) {
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
    if (query.length < SEARCH_MIN_CHARS) return Promise.resolve(emptyContentResults(query));
    return new Promise((resolve, reject) => {
      pendingReject = reject;
      timer = setTimeout(() => {
        timer = null;
        pendingReject = null;
        controller = new AbortController();
        const mine = controller;
        searchContent(query, { limit, kinds, node, signal: mine.signal })
          .then(resolve, reject)
          .finally(() => {
            if (controller === mine) controller = null;
          });
      }, delay);
    });
  };
  return { search, cancel };
}
