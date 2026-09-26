import { SUPABASE_URL } from "@/lib/supabase-env";

// User media is rendered only from this project's public Storage buckets. The
// database pins media URLs too (is_own_storage_url(); strict once
// app.storage_origin is set — docs/SECURITY.md §6), but until that setting is
// in place any https://*.supabase.co origin passes there, and another project
// could be used to log viewers' IPs. This is the client-side pin.
const COMMUNITY_BUCKETS = ["post-media", "avatars"];
const PUBLIC_OBJECT = /^\/storage\/v1\/object\/public\/([a-z0-9][a-z0-9_-]{0,62})\/[^/]/;

let ORIGIN = null;
try {
  ORIGIN = SUPABASE_URL ? new URL(SUPABASE_URL).origin : null;
} catch {
  ORIGIN = null;
}

/**
 * Is `url` a public Storage object of THIS project, in one of `buckets`
 * (default: post-media, avatars; `null` = any bucket of the project)?
 */
export function isTrustedMediaUrl(url, buckets = COMMUNITY_BUCKETS) {
  if (typeof url !== "string" || !ORIGIN || url.length > 1024) return false;
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.origin !== ORIGIN || u.username || u.password) return false;
  const m = PUBLIC_OBJECT.exec(u.pathname);
  if (!m) return false;
  return buckets === null || buckets.includes(m[1]);
}
