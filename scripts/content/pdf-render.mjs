#!/usr/bin/env node
// ============================================================================
// Render textbook pages to JPEG (for agents that read the page: equations,
// figures and tables are lost in these books' text layer).
//
//   node scripts/content/pdf-render.mjs <book path> <pages> [--width=1100] [--quality=72]
//     <book path>  a file name from data/staging/sources/ien/books.jsonl
//                  (e.g. 1448-GE-ME-K07-SM1-math-part1.pdf)
//     <pages>      "12-14,20" (1-based PDF page indices)
//   Output: <cache>/ien/pages/<stem>/p012.jpg … (prints the paths)
//
// The book is downloaded once into <cache>/ien/pdf/ (outside the repo) and
// rendered with pdf.js inside the local Chrome (puppeteer-core), served from a
// throw-away localhost server — nothing is published.
// ============================================================================
import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CACHE = process.env.CONTENT_CACHE_DIR || "C:/jazira/content-cache";
const PDF_DIR = join(CACHE, "ien/pdf");
const PAGES_DIR = join(CACHE, "ien/pages");
const PDFJS = join(ROOT, "node_modules/pdfjs-dist");
const CHROME = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => p && existsSync(p));

export function parsePages(spec) {
  const out = new Set();
  for (const part of String(spec).split(",")) {
    const [a, b] = part.split("-").map((x) => Number(x.trim()));
    if (!a) continue;
    for (let p = a; p <= (b || a); p++) out.add(p);
  }
  return [...out].sort((x, y) => x - y);
}

export async function ensurePdf(path) {
  mkdirSync(PDF_DIR, { recursive: true });
  const file = join(PDF_DIR, path);
  if (existsSync(file) && statSync(file).size > 1024) return file;
  const res = await fetch("https://iencontent.ien.edu.sa/books/" + encodeURI(path), { headers: { "User-Agent": "JaziraContentPipeline/1.0" } });
  if (!res.ok) throw new Error(`download ${path}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.subarray(0, 5).toString() !== "%PDF-") throw new Error(`download ${path}: not a PDF`);
  writeFileSync(file + ".part", buf);
  renameSync(file + ".part", file);
  return file;
}

const PAGE_HTML = `<!doctype html><meta charset="utf-8"><body style="margin:0"><canvas id="c"></canvas>
<script type="module">
import * as pdfjs from "/pdfjs/build/pdf.mjs";
pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/build/pdf.worker.mjs";
window.render = async (file, pageNo, width) => {
  window.__doc = window.__doc || {};
  const doc = window.__doc[file] || (window.__doc[file] = await pdfjs.getDocument({ url: "/pdf/" + encodeURIComponent(file), cMapUrl: "/pdfjs/cmaps/", cMapPacked: true, standardFontDataUrl: "/pdfjs/standard_fonts/" }).promise);
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

function serve() {
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url || "/").split("?")[0]);
    let file = null;
    let type = "application/octet-stream";
    if (url === "/" || url === "/index.html") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); return res.end(PAGE_HTML); }
    if (url.startsWith("/pdfjs/")) { file = join(PDFJS, url.slice(7)); if (file.endsWith(".mjs")) type = "text/javascript"; }
    else if (url.startsWith("/pdf/")) { file = join(PDF_DIR, url.slice(5)); type = "application/pdf"; }
    if (!file || !file.startsWith(url.startsWith("/pdf/") ? PDF_DIR : PDFJS) || !existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": type, "Content-Length": statSync(file).size });
    createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r(server)));
}

/** Render pages of one book; returns [{page, file, w, h}]. Reuses a browser if given. */
export async function renderPages(path, pages, { width = 1100, quality = 72, browser: shared } = {}) {
  await ensurePdf(path);
  const stem = path.replace(/\.pdf$/i, "");
  const outDir = join(PAGES_DIR, stem);
  mkdirSync(outDir, { recursive: true });
  const todo = pages.filter((p) => !existsSync(join(outDir, `p${String(p).padStart(3, "0")}.jpg`)));
  const result = pages.map((p) => ({ page: p, file: join(outDir, `p${String(p).padStart(3, "0")}.jpg`).replace(/\\/g, "/") }));
  if (!todo.length) return result;
  const server = await serve();
  const browser = shared || (await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] }));
  try {
    const tab = await browser.newPage();
    await tab.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "load" });
    await tab.waitForFunction("window.ready === true", { timeout: 30000 });
    for (const p of todo) {
      const info = await tab.evaluate((f, n, w) => window.render(f, n, w), path, p, width);
      if (p > info.pages) continue;
      const el = await tab.$("#c");
      await el.screenshot({ path: join(outDir, `p${String(p).padStart(3, "0")}.jpg`), type: "jpeg", quality });
    }
    await tab.close();
  } finally {
    if (!shared) await browser.close();
    server.close();
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flags = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.slice(2).split("="); return [k, v ?? true]; }));
  const [path, spec] = args.filter((a) => !a.startsWith("--"));
  if (!path || !spec) { console.error("usage: node scripts/content/pdf-render.mjs <book path> <pages> [--width=1100]"); process.exit(2); }
  const out = await renderPages(path, parsePages(spec), { width: Number(flags.width || 1100), quality: Number(flags.quality || 72) });
  for (const r of out) console.log(r.file);
}
