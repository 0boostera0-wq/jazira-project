// ============================================================================
// Shared guards for route handlers (server only).
//
//   isSameOrigin(req)            mutating routes: same-origin browser requests only
//   readJsonBody(req, maxBytes)  JSON body with a byte cap → { ok, value } | { ok: false, status, error }
//   clientIp(req)                the caller's IP as the platform reports it
// ============================================================================

/**
 * Same-origin browser requests only (blocks cross-site use of a signed-in
 * session). Fetch Metadata first; then the Origin header, which browsers send
 * on every cross-origin POST. A request with neither is a same-origin one
 * from an older browser, or not from a browser at all (no ambient cookies).
 */
export function isSameOrigin(req) {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const host = new URL(origin).host;
    return host === req.headers.get("host") || host === new URL(req.url).host;
  } catch {
    return false;
  }
}

/** Read a JSON body with a size cap (UTF-8 bytes). → { ok, value } | { ok: false, status, error } */
export async function readJsonBody(req, maxBytes = 32 * 1024) {
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > maxBytes) return { ok: false, status: 413, error: "payload_too_large" };
  let text;
  try {
    text = await req.text();
  } catch {
    return { ok: false, status: 400, error: "invalid_json" };
  }
  if (Buffer.byteLength(text, "utf8") > maxBytes) return { ok: false, status: 413, error: "payload_too_large" };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, error: "invalid_json" };
  }
}

/**
 * The caller's IP. On Vercel `x-forwarded-for` is set by the platform (a
 * client-sent value is overwritten), and `x-real-ip` mirrors it. Elsewhere it
 * is only as trustworthy as the proxy in front of the app.
 */
export function clientIp(req) {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd && fwd.split(",")[0].trim()) || req.headers.get("x-real-ip") || "unknown";
}
