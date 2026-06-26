import { NextResponse } from "next/server";
import { findResourceByKey } from "@/lib/curriculum";

export const runtime = "nodejs";
// Streamed per-request; the CDN still caches via the Cache-Control header below.
export const dynamic = "force-dynamic";

// ============================================================================
// Authorized content streaming — serve YOUR OWN / licensed PDFs through your
// own domain.
// ----------------------------------------------------------------------------
// This is intentionally NOT a general-purpose URL proxy:
//   1. the requested `key` must exist in YOUR curriculum catalog (allow-list),
//   2. it must match a strict path shape (no schemes, no traversal),
//   3. it is joined to CONTENT_BASE_URL and the result must stay on that exact
//      host (defense-in-depth against SSRF / host injection).
// So it can only ever serve files you have placed in your configured store
// (e.g. Supabase Storage, your CDN). Point CONTENT_BASE_URL at content you own
// or are licensed to redistribute. Do not use this to re-host third-party
// copyrighted material or to conceal its source.
// ============================================================================

const BASE = process.env.CONTENT_BASE_URL; // e.g. https://<proj>.supabase.co/storage/v1/object/public/curriculum

const KEY_RE = /^[A-Za-z0-9_\-./]+\.pdf$/;

function resolveUrl(key) {
  if (!key || !KEY_RE.test(key) || key.includes("..")) return null;
  if (!BASE) return null;
  // allow-list: only keys that actually belong to the published catalog
  if (!findResourceByKey(key)) return null;
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

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  const asDownload = searchParams.get("download") === "1";

  const url = resolveUrl(key);
  if (!url) {
    return NextResponse.json({ error: "invalid_key_or_unconfigured" }, { status: 400 });
  }

  // Forward Range so the in-app viewer streams large PDFs progressively.
  const range = request.headers.get("range");
  let upstream;
  try {
    upstream = await fetch(url, {
      headers: range ? { Range: range } : {},
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "upstream_unreachable" }, { status: 502 });
  }

  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json(
      { error: upstream.status === 404 ? "not_found" : "upstream_error" },
      { status: upstream.status === 404 ? 404 : 502 }
    );
  }

  // Build a clean PDF response served from our own domain, with sane caching.
  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  const filename = (key.split("/").pop() || "document.pdf").replace(/"/g, "");
  headers.set("Content-Disposition", `${asDownload ? "attachment" : "inline"}; filename="${filename}"`);
  // Content is versioned by its key → safe to cache hard on the edge/CDN.
  headers.set("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800");
  headers.set("Accept-Ranges", "bytes");
  const len = upstream.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  const cr = upstream.headers.get("content-range");
  if (cr) headers.set("Content-Range", cr);

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
