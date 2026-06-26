import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { findResourceByKey } from "@/lib/curriculum";

export const runtime = "nodejs";
// Streamed per-request; the CDN still caches via the Cache-Control header below.
export const dynamic = "force-dynamic";

// ============================================================================
// Authorized content serving — serve YOUR OWN / licensed PDFs through your own
// Jazira domain. The browser ALWAYS talks only to /api/content/fetch — no
// external host or source name is ever exposed in the UI / Network tab.
// ----------------------------------------------------------------------------
// Two stores (chosen automatically; override with CONTENT_STORE):
//   • "public"  — files live in /public/resources/<key> on this server. Served
//                 from local disk, so the site works even if the original source
//                 is unavailable. Default when CONTENT_BASE_URL is not set.
//   • "remote"  — files live in your own storage (e.g. a Supabase Storage public
//                 bucket); CONTENT_BASE_URL points at its base. We stream them
//                 server-side, so again only the Jazira URL is visible.
//
// This is NOT a general URL proxy:
//   1. the `key` must exist in YOUR curriculum catalog (allow-list),
//   2. it must match a strict path shape (no schemes, no `..` traversal),
//   3. remote mode pins the result to CONTENT_BASE_URL's exact host (SSRF-safe);
//      public mode pins the resolved path inside /public/resources.
// ============================================================================

const BASE = process.env.CONTENT_BASE_URL; // e.g. https://<proj>.supabase.co/storage/v1/object/public/curriculum
const STORE = process.env.CONTENT_STORE || (BASE ? "remote" : "public");
const PUBLIC_DIR = path.join(process.cwd(), "public", "resources");

const KEY_RE = /^[A-Za-z0-9_\-./]+\.pdf$/;

// A key is valid only if it is well-formed AND present in the published catalog.
function validKey(key) {
  return Boolean(key) && KEY_RE.test(key) && !key.includes("..") && Boolean(findResourceByKey(key));
}

function pdfHeaders(key, asDownload, extra = {}) {
  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  const filename = (key.split("/").pop() || "document.pdf").replace(/"/g, "");
  headers.set("Content-Disposition", `${asDownload ? "attachment" : "inline"}; filename="${filename}"`);
  // Content is versioned by its key → safe to cache hard on the edge/CDN.
  headers.set("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800");
  headers.set("Accept-Ranges", "bytes");
  for (const [k, v] of Object.entries(extra)) if (v) headers.set(k, v);
  return headers;
}

// ── local store: stream from /public/resources/<key> ──────────────────────
async function serveLocal(key, asDownload) {
  const filePath = path.join(PUBLIC_DIR, key);
  // Defense-in-depth: the resolved path must stay inside /public/resources.
  const rel = path.relative(PUBLIC_DIR, filePath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return NextResponse.json({ error: "invalid_key" }, { status: 400 });
  }
  try {
    const data = await fs.readFile(filePath);
    // Buffer → fresh Uint8Array so the body is a clean ArrayBuffer view.
    const body = new Uint8Array(data);
    return new NextResponse(body, {
      status: 200,
      headers: pdfHeaders(key, asDownload, { "Content-Length": String(body.byteLength) }),
    });
  } catch {
    // Not imported yet → the viewer shows a friendly "content not available".
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}

// ── remote store: stream from CONTENT_BASE_URL (host-pinned) ───────────────
function resolveRemote(key) {
  if (!BASE) return null;
  let target;
  try {
    target = new URL(key.replace(/^\/+/, ""), BASE.endsWith("/") ? BASE : BASE + "/");
  } catch {
    return null;
  }
  let baseUrl;
  try {
    baseUrl = new URL(BASE);
  } catch {
    return null;
  }
  if (target.origin !== baseUrl.origin) return null; // host must not change
  return target.toString();
}

async function serveRemote(key, asDownload, range) {
  const url = resolveRemote(key);
  if (!url) return NextResponse.json({ error: "unconfigured" }, { status: 400 });

  let upstream;
  try {
    upstream = await fetch(url, { headers: range ? { Range: range } : {}, cache: "no-store" });
  } catch {
    return NextResponse.json({ error: "upstream_unreachable" }, { status: 502 });
  }
  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json(
      { error: upstream.status === 404 ? "not_found" : "upstream_error" },
      { status: upstream.status === 404 ? 404 : 502 }
    );
  }
  const headers = pdfHeaders(key, asDownload, {
    "Content-Length": upstream.headers.get("content-length"),
    "Content-Range": upstream.headers.get("content-range"),
  });
  return new NextResponse(upstream.body, { status: upstream.status, headers });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  const asDownload = searchParams.get("download") === "1";

  if (!validKey(key)) {
    return NextResponse.json({ error: "invalid_key" }, { status: 400 });
  }

  if (STORE === "remote") {
    return serveRemote(key, asDownload, request.headers.get("range"));
  }
  return serveLocal(key, asDownload);
}
