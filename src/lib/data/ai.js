// ============================================================================
// Assistant quota — client data layer (see docs/DATA_API.md → "AI quota").
//
// The server (/api/chat) enforces the quota with the same ai_quota() RPC; this
// is only for showing "N messages left · resets at …" in the UI.
// ============================================================================
import { getSupabase } from "@/lib/supabase-lazy";

const MISSING = new Set(["PGRST202", "42883"]);

/**
 * @returns {Promise<{ unlimited: boolean, limit: number|null, used: number, remaining: number|null,
 *                     resets_at: string|null, window_hours: number, referral_bonus: boolean }|null>}
 *   null when signed out, Supabase is not configured or the RPC is not deployed
 *   (callers may fall back to their local estimate). Other failures throw a
 *   DataError (err.name === "DataError", err.code "network" | "unknown").
 */
export async function getAiQuota() {
  let supabase = null;
  try {
    supabase = await getSupabase();
  } catch {
    supabase = null;
  }
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    if (!data?.session) return null;
  } catch {
    return null;
  }
  const { data, error } = await supabase.rpc("ai_quota");
  if (!error) return data;
  if (MISSING.has(error.code) || error.message === "not_authenticated") return null;
  const e = new Error(!error.code && /fetch|network|load failed/i.test(`${error.message || ""} ${error.details || ""}`) ? "network" : "unknown");
  e.name = "DataError";
  e.code = e.message;
  e.cause = error;
  throw e;
}
