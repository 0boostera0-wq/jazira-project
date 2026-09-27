// ============================================================================
// Guest check locks (docs/CONTENT_ENGINE.md §5.8). Server only.
//
//   await claimCheck({ sid, pos, respHash, expiresAt }) → "first" | "repeat" | "locked"
//
// A guest session is stateless, but its immediate check must not be: a client
// that could /check one position twice would check a wrong answer, read the
// revealed key, check the right answer and keep the better receipt (score 1
// for an item it got wrong). So the FIRST checked response of a session
// position is recorded, and
//   - "first"  : this response is now the position's locked response;
//   - "repeat" : the same response again (a retry after a lost reply): the
//                same grade, so the receipt may be issued again;
//   - "locked" : another response was checked before → 409 item_locked.
// Storage: ce_guest_check_lock() (0014, service role; rows kept until the
// session's deadline + grace, after which /check refuses the token anyway),
// with a per-instance memory fallback when the service role or the function
// is missing (local dev, pre-0014), logged once — the same policy as
// src/lib/rate-limit.js.
// ============================================================================
import { createAdminClient } from "@/lib/supabase-admin";

const RESULTS = new Set(["first", "repeat", "locked"]);
const SID_RE = /^g-[A-Za-z0-9_-]{22}$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const MISSING = new Set(["PGRST202", "42883", "42P01", "PGRST205"]);
/** Memory fallback bound (entries); expired entries are dropped first. */
export const MEMORY_MAX = 50000;

const memory = new Map();
let warned = false;

function warnOnce(why) {
  if (warned) return;
  warned = true;
  console.warn("[exam-check-lock] shared lock unavailable, using per-instance memory:", String(why).slice(0, 120));
}

function claimInMemory(store, id, respHash, expiresAt, now) {
  const cur = store.get(id);
  if (cur && cur.exp >= now) return cur.hash === respHash ? "repeat" : "locked";
  if (store.size >= MEMORY_MAX) {
    for (const [k, v] of store) if (v.exp < now) store.delete(k);
    // still full: drop the oldest insertions (Map keeps insertion order)
    for (const k of store.keys()) {
      if (store.size < MEMORY_MAX) break;
      store.delete(k);
    }
  }
  store.set(id, { hash: respHash, exp: expiresAt });
  return "first";
}

/**
 * Claim the immediate check of one guest session position.
 * @param {{ sid: string, pos: number, respHash: string, expiresAt: number }} c
 *   expiresAt: ms — the session's deadline + grace (the lock is not needed after it)
 * @param {{ admin?: object|null, store?: Map, now?: number }} [o]
 * @returns {Promise<"first"|"repeat"|"locked">}
 */
export async function claimCheck({ sid, pos, respHash, expiresAt }, { admin = createAdminClient(), store = memory, now = Date.now() } = {}) {
  if (!SID_RE.test(sid ?? "") || !Number.isInteger(pos) || pos < 1 || pos > 100 || !HASH_RE.test(respHash ?? "") || !Number.isFinite(expiresAt)) {
    throw new Error("invalid check lock claim");
  }
  if (admin) {
    try {
      const { data, error } = await admin.rpc("ce_guest_check_lock", {
        p_sid: sid, p_position: pos, p_resp_hash: respHash, p_expires_at: new Date(expiresAt).toISOString(),
      });
      if (!error && RESULTS.has(data)) return data;
      warnOnce(error ? (MISSING.has(error.code) ? "ce_guest_check_lock missing" : error.code || error.message) : "bad response");
    } catch (e) {
      warnOnce(e?.message || e);
    }
  }
  return claimInMemory(store, `${sid}|${pos}`, respHash, expiresAt, now);
}

/** Tests: forget the memory fallback and the warning. */
export function resetCheckLocks() {
  memory.clear();
  warned = false;
}
