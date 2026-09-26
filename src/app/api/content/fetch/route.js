import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// Authorised curriculum files — served from Jazira's own store.
// ----------------------------------------------------------------------------
// Serves a file ONLY when the curriculum manifest
// (src/content/curriculum/manifest.json, built by
// scripts/build-curriculum-manifest.mjs) marks its key `availability: "hosted"`,
// i.e. it is registered in src/content/curriculum/hosted.js with written
// permission (or is Jazira's own work) and exists in the store. Today no file
// is hosted: official textbooks stay on «مقرراتي» / Madrasati, which Jazira is
// not permitted to rehost. Everything else is a 404 JSON — never a placeholder.
//
// Stores (CONTENT_STORE, default "public" unless CONTENT_BASE_URL is set):
//   • public — public/resources/<key> on this server (path pinned inside it)
//   • remote — CONTENT_BASE_URL (your own bucket); the target is pinned to that
//              exact origin, so this is never a general URL proxy (SSRF-safe)
// ============================================================================

const BASE = process.env.CONTENT_BASE_URL;
const STORE = process.env.CONTENT_STORE || (BASE ? "remote" : "public");
const PUBLIC_DIR = path.join(process.cwd(), "public", "resources");

const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_\-./]{0,199}\.pdf$/;
const wellFormed = (key) => typeof key === "string" && KEY_RE.test(key) && !key.includes("..") && !key.includes("//");

let hostedKeys = null;
async function hostedSet() {
  if (!hostedKeys) {
    const { default: manifest } = await import("@/content/curriculum/manifest.json");
    hostedKeys = new Set((manifest.rows || []).filter((r) => r.availability === "hosted").map((r) => r.internal_key));
  }
  return hostedKeys;
}

function jsonError(status, error) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
  );
}

function pdfHeaders(key, asDownload, extra = {}) {
  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  const filename = (key.split("/").pop() || "document.pdf").replace(/[^A-Za-z0-9_.-]/g, "");
  headers.set("Content-Disposition", `${asDownload ? "attachment" : "inline"}; filename="${filename}"`);
  // Keys are versioned by year/path → safe to cache on the CDN.
  headers.set("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Accept-Ranges", "bytes");
  for (const [k, v] of Object.entries(extra)) if (v) headers.set(k, v);
  return headers;
}

// ── public store: stream from public/resources/<key> ─────────────────────────
async function serveLocal(key, asDownload) {
  const filePath = path.join(PUBLIC_DIR, key);
  const rel = path.relative(PUBLIC_DIR, filePath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return jsonError(400, "invalid_key");
  try {
    const body = new Uint8Array(await fs.readFile(filePath));
    return new NextResponse(body, { status: 200, headers: pdfHeaders(key, asDownload, { "Content-Length": String(body.byteLength) }) });
  } catch {
    return jsonError(404, "not_found");
  }
}

// ── remote store: stream from CONTENT_BASE_URL (origin-pinned) ───────────────
function resolveRemote(key) {
  if (!BASE) return null;
  try {
    const base = new URL(BASE.endsWith("/") ? BASE : `${BASE}/`);
    if (base.protocol !== "https:") return null;
    const target = new URL(key, base);
    if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) return null;
    return target.toString();
  } catch {
    return null;
  }
}

async function serveRemote(key, asDownload, range) {
  const url = resolveRemote(key);
  if (!url) return jsonError(503, "unconfigured");
  let upstream;
  try {
    upstream = await fetch(url, { headers: range ? { Range: range } : {}, cache: "no-store", redirect: "error" });
  } catch {
    return jsonError(502, "upstream_unavailable");
  }
  if (upstream.status === 404) return jsonError(404, "not_found");
  if (!upstream.ok && upstream.status !== 206) return jsonError(502, "upstream_unavailable");
  const headers = pdfHeaders(key, asDownload, {
    "Content-Length": upstream.headers.get("content-length"),
    "Content-Range": upstream.headers.get("content-range"),
  });
  return new NextResponse(upstream.body, { status: upstream.status, headers });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  if (!wellFormed(key)) return jsonError(400, "invalid_key");
  if (!(await hostedSet()).has(key)) return jsonError(404, "not_available");

  const asDownload = searchParams.get("download") === "1";
  if (STORE === "remote") return serveRemote(key, asDownload, request.headers.get("range"));
  return serveLocal(key, asDownload);
}
