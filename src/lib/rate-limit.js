// ============================================================================
// Rate limiting for route handlers (server only).
//
//   await isRateLimited({ bucket: "exams.local", key: clientIp(req), max: 60, windowSeconds: 300 })
//     → true when this request is over the limit
//
// Shared across every server instance through public.rate_limit_hit()
// (migration 0013, service role). Serverless instances do not share memory,
// so a Map-based limiter alone is only a per-instance speed bump; it remains
// the fallback when the service role or the RPC is unavailable (local dev,
// pre-0013 database), and the fallback is logged once.
// Keys are hashed before they leave the process (IPs are not stored).
// ============================================================================
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * Best-effort per-instance limiter. Returns true when the caller is over the
 * limit.
 */
export function createRateLimiter({ windowMs = 5 * 60_000, max = 60 } = {}) {
  const hits = new Map();
  return function limited(id) {
    const now = Date.now();
    const recent = (hits.get(id) || []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(id, recent);
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > windowMs) hits.delete(k);
    }
    return recent.length > max;
  };
}

export const hashKey = (value) => createHash("sha256").update(String(value)).digest("hex").slice(0, 40);

const fallbacks = new Map();
let warned = false;

function fallback(bucket, max, windowSeconds) {
  const id = `${bucket}|${max}|${windowSeconds}`;
  if (!fallbacks.has(id)) fallbacks.set(id, createRateLimiter({ windowMs: windowSeconds * 1000, max }));
  return fallbacks.get(id);
}

/**
 * @param {{ bucket: string, key: string, max: number, windowSeconds: number }} o
 *   bucket: /^[a-z0-9_.:-]{1,40}$/ (e.g. "chat", "checkout", "contact.ip")
 * @returns {Promise<boolean>} true = over the limit (answer 429)
 */
export async function isRateLimited({ bucket, key, max, windowSeconds }) {
  const k = hashKey(`${bucket}:${key}`);
  const admin = createAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin.rpc("rate_limit_hit", {
        p_bucket: bucket, p_key: k, p_max: max, p_window_seconds: windowSeconds,
      });
      if (!error && typeof data === "boolean") return !data;
      if (!warned) {
        warned = true;
        console.warn("[rate-limit] shared limiter unavailable, using per-instance memory:", error?.code || "bad response");
      }
    } catch (e) {
      if (!warned) {
        warned = true;
        console.warn("[rate-limit] shared limiter failed, using per-instance memory:", String(e?.message || e).slice(0, 120));
      }
    }
  }
  return fallback(bucket, max, windowSeconds)(k);
}
