#!/usr/bin/env node
// ============================================================================
// Render textbook pages to JPEG for Claude vision reads (equations, figures,
// tables and damaged text layers; docs/CONTENT_ENGINE.md §4.2).
//
//   node scripts/content/pdf-render.mjs <book file | ien-<bookId>> <pages> [--width=1100] [--quality=72]
//     <book file>  a file name from data/staging/sources/ien/books.jsonl
//                  (e.g. 1448-GE-ME-K07-SM1-math-part1.pdf), or its resource id
//     <pages>      "12-14,20" (1-based PDF page indices)
//   Output: <cache>/ien/pages/<stem>/p012.jpg … (prints the paths)
//
// The book comes from <cache>/ien/pdf (downloaded once through the shared
// fetch queue when missing: ≤ 2 in flight, backoff, breaker). Pages are
// rendered with pdf.js inside the local Chrome (puppeteer-core), served from
// a throw-away 127.0.0.1 server that only serves pdf.js files and the one
// sanitized PDF. Renders are copyrighted page images: cache only, never
// committed, never sent to third-party AI systems.
// ============================================================================
import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { cachePaths, cacheRoot, safePdfName } from "./lib/cache.mjs";
import { assertOutsideRepo, ensurePdf as ensurePdfInCache, getFetchQueue } from "./lib/fetch-queue.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PDFJS = join(ROOT, "node_modules/pdfjs-dist");
const CHROME_CANDIDATES = () => [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"];

export const MAX_PAGE = 99999;

/** "12-14,20" → [12, 13, 14, 20] (pages 1..99999; a book never has more) */
export function parsePages(spec) {
  const out = new Set();
  for (const part of String(spec).split(",")) {
    const [a, b] = part.split("-").map((x) => Number(x.trim()));
    if (!Number.isInteger(a) || a < 1 || a > MAX_PAGE) continue;
    const end = Number.isInteger(b) && b >= a ? Math.min(b, MAX_PAGE) : a;
    for (let p = a; p <= end; p++) out.add(p);
  }
  return [...out].sort((x, y) => x - y);
}

let booksCache = null;
/** books.jsonl row of a file name or resource id (for URL, size and Last-Modified). */
export function bookRow(nameOrId) {
  if (!booksCache) {
    const p = join(ROOT, "data/staging/sources/ien/books.jsonl");
    booksCache = existsSync(p) ? readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  }
  const id = /^ien-(\d+)$/.exec(String(nameOrId));
  return booksCache.find((b) => (id ? b.ien_book_id === Number(id[1]) : b.path === nameOrId)) ?? null;
}

/** The cached PDF path of a book, downloading it through the shared queue when missing. */
export async function ensurePdf(path, { queue = null, root = cacheRoot() } = {}) {
  const name = safePdfName(path);
  const book = bookRow(name);
  const r = await ensurePdfInCache(name, {
    queue: queue ?? getFetchQueue(),
    url: book?.url ?? null,
    expectedBytes: book?.bytes ?? null,
    lastModified: book?.last_modified ?? null,
    cacheRoot: root,
  });
  return r.path;
}

const PAGE_HTML = `<!doctype html><meta charset="utf-8"><body style="margin:0"><canvas id="c"></canvas>
<script type="module">
import * as pdfjs from "/pdfjs/build/pdf.mjs";
pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/build/pdf.worker.mjs";
window.render = async (pageNo, width) => {
  window.__doc = window.__doc || await pdfjs.getDocument({ url: "/book.pdf", cMapUrl: "/pdfjs/cmaps/", cMapPacked: true, standardFontDataUrl: "/pdfjs/standard_fonts/", isEvalSupported: false }).promise;
  const doc = window.__doc;
  if (pageNo > doc.numPages) return { pages: doc.numPages };
  const page = await doc.getPage(pageNo);
  const vp1 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: width / vp1.width });
  const c = document.getElementById("c");
  c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  page.cleanup();
  return { w: c.width, h: c.height, pages: doc.numPages };
};
window.ready = true;
</script>`;

/** A loopback server for one PDF: "/", "/book.pdf" and files under node_modules/pdfjs-dist only. */
export function serve(pdfFile) {
  const pdfjsRoot = resolve(PDFJS) + sep;
  const server = createServer((req, res) => {
    let url;
    try {
      url = decodeURIComponent((req.url || "/").split("?")[0]);
    } catch {
      res.writeHead(400);
      return res.end();
    }
    if (url === "/" || url === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(PAGE_HTML);
    }
    let file = null;
    let type = "application/octet-stream";
    if (url === "/book.pdf") {
      file = pdfFile;
      type = "application/pdf";
    } else if (url.startsWith("/pdfjs/")) {
      const candidate = resolve(PDFJS, "." + url.slice(6));
      if (candidate.startsWith(pdfjsRoot)) file = candidate;
      if (file && file.endsWith(".mjs")) type = "text/javascript";
    }
    if (!file || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { "Content-Type": type, "Content-Length": statSync(file).size });
    createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r(server)));
}

/** Render pages of one book; returns [{page, file}]. Reuses a browser if given. */
export async function renderPages(path, pages, { width = 1100, quality = 72, browser: shared = null, root = cacheRoot(), queue = null } = {}) {
  const name = safePdfName(path);
  const paths = cachePaths(assertOutsideRepo(root));
  const pdfFile = await ensurePdf(name, { queue, root });
  const outDir = paths.pagesDir(name);
  mkdirSync(outDir, { recursive: true });
  const result = pages.map((p) => ({ page: p, file: paths.pageImage(name, p).replace(/\\/g, "/") }));
  const todo = pages.filter((p) => !existsSync(paths.pageImage(name, p)));
  if (!todo.length) return result;
  const chrome = CHROME_CANDIDATES().find((p) => p && existsSync(p));
  if (!shared && !chrome) throw new Error("no local Chrome/Edge found (set CHROME_PATH)");
  const { default: puppeteer } = await import("puppeteer-core");
  const server = await serve(pdfFile);
  const browser = shared || (await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] }));
  try {
    const tab = await browser.newPage();
    await tab.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "load" });
    await tab.waitForFunction("window.ready === true", { timeout: 30000 });
    for (const p of todo) {
      const info = await tab.evaluate((n, w) => window.render(n, w), p, width);
      if (p > info.pages) continue;
      const el = await tab.$("#c");
      await el.screenshot({ path: paths.pageImage(name, p), type: "jpeg", quality });
    }
    await tab.close();
  } finally {
    if (!shared) await browser.close();
    server.close();
  }
  return result.filter((r) => existsSync(r.file));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flags = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => {
    const [k, v] = a.slice(2).split("=");
    return [k, v ?? true];
  }));
  const [target, spec] = args.filter((a) => !a.startsWith("--"));
  if (!target || !spec) {
    console.error("usage: node scripts/content/pdf-render.mjs <book file | ien-<bookId>> <pages> [--width=1100] [--quality=72]");
    process.exit(2);
  }
  const book = /^ien-\d+$/.test(target) ? bookRow(target) : null;
  const path = book ? book.path : target;
  try {
    const out = await renderPages(path, parsePages(spec), { width: Number(flags.width || 1100), quality: Number(flags.quality || 72) });
    for (const r of out) console.log(r.file);
  } catch (e) {
    console.error(String(e.message || e));
    process.exit(1);
  }
}
