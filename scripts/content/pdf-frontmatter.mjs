#!/usr/bin/env node
// ============================================================================
// Front-matter + table-of-contents text for every iEN textbook, fetched with
// HTTP range requests (only the pages read are downloaded — never the whole
// book). Feeds curriculum extraction (units / lessons / page numbers) and the
// term evidence (what each book says about «الفصل الدراسي» / «الجزء»).
//
//   node scripts/content/pdf-frontmatter.mjs [--pages=14] [--only=<path substring>] [--refresh]
//
// Input : data/staging/sources/ien/books.jsonl        (from ien-crawl.mjs)
// Output: <cache>/ien/text/<file stem>/p001.txt …      (outside the repo; raw page text)
//         data/staging/sources/ien/book-frontmatter.jsonl  one row per book:
//           page_count, pdf metadata dates, per-page char counts, term/part
//           evidence snippets (NFKC-normalised), candidate TOC pages
// The PDF text layer of these InDesign books is imperfect (broken lam-alef
// ligatures, some glyphs as U+FFFD); rows keep the raw text for agents to read
// and never "repair" it silently.
// ============================================================================
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = join(ROOT, "data/staging/sources/ien");
const CACHE = join(process.env.CONTENT_CACHE_DIR || "C:/jazira/content-cache", "ien/text");
const pdfjs = await import(pathToFileURL(join(ROOT, "node_modules/pdfjs-dist/legacy/build/pdf.mjs")).href);

const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.slice(2).split("="); return [k, v ?? true]; }));
const PAGES = Number(flags.pages || 14);
const CONCURRENCY = Number(flags.concurrency || 3);

/** Lines of a page, right-to-left within a line, top-to-bottom. */
export async function pageText(doc, n) {
  const page = await doc.getPage(n);
  const tc = await page.getTextContent();
  const lines = new Map();
  for (const it of tc.items) {
    if (!it.str || !it.str.trim()) continue;
    const y = Math.round(it.transform[5] / 2) * 2;
    if (!lines.has(y)) lines.set(y, []);
    lines.get(y).push({ x: it.transform[4], s: it.str });
  }
  page.cleanup();
  return [...lines.keys()].sort((a, b) => b - a).map((y) => lines.get(y).sort((a, b) => b.x - a.x).map((i) => i.s).join(" ")).join("\n");
}

const fold = (s) => s.normalize("NFKC").replace(/\uFFFD/g, "").replace(/[\u064B-\u0652\u0640]/g, "");
const EVIDENCE = [
  ["term_1", /الفصل\s*الدراسي\s*الأول|الفصل\s*الأول/],
  ["term_2", /الفصل\s*الدراسي\s*الثاني|الفصل\s*الثاني/],
  ["term_3", /الفصل\s*الدراسي\s*الثالث/],
  ["part_1", /الجزء\s*الأول|اجلزء\s*األول|اجلزء\s*الأول/],
  ["part_2", /الجزء\s*الثاني|اجلزء\s*الثاين|اجلزء\s*الثاني/],
  ["year_1448", /1448|١٤٤٨/],
  ["year_1447", /1447|١٤٤٧/],
  ["toc", /المحتويات|احملتويات|فهرس|الفهرس/],
];

async function one(book) {
  const stem = book.path.replace(/\.pdf$/i, "");
  const dir = join(CACHE, stem);
  mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  // Prefer a book already downloaded into the cache (no network); else range-read it.
  const local = join(process.env.CONTENT_CACHE_DIR || "C:/jazira/content-cache", "ien/pdf", book.path);
  const source = existsSync(local) ? { data: new Uint8Array(readFileSync(local)) } : { url: book.url, disableAutoFetch: true, disableStream: true, rangeChunkSize: 262144 };
  const doc = await pdfjs.getDocument({ ...source, isEvalSupported: false, verbosity: 0 }).promise;
  const meta = (await doc.getMetadata()).info || {};
  const n = Math.min(PAGES, doc.numPages);
  const pages = [];
  const evidence = {};
  for (let p = 1; p <= n; p++) {
    const f = join(dir, `p${String(p).padStart(3, "0")}.txt`);
    let text;
    if (!flags.refresh && existsSync(f)) text = readFileSync(f, "utf8");
    else {
      text = await pageText(doc, p);
      writeFileSync(f, text);
    }
    const folded = fold(text);
    pages.push({ page: p, chars: text.length });
    for (const [key, re] of EVIDENCE) {
      const m = re.exec(folded);
      if (m && !evidence[key]) evidence[key] = { page: p, snippet: folded.slice(Math.max(0, m.index - 60), m.index + 80).replace(/\s+/g, " ") };
    }
  }
  const row = {
    ien_book_id: book.ien_book_id,
    subject_ien_id: book.subject_ien_id,
    path: book.path,
    title: book.title,
    page_count: doc.numPages,
    pdf_creation_date: meta.CreationDate || null,
    pdf_mod_date: meta.ModDate || null,
    pdf_language: meta.Language || null,
    pages_read: n,
    page_chars: pages.map((p) => p.chars),
    text_layer: pages.some((p) => p.chars > 200) ? "present" : "missing_or_image_only",
    evidence,
    toc_candidate_pages: pages.filter((p) => p.chars > 300).map((p) => p.page),
    cache_dir: dir.replace(/\\/g, "/"),
    ms: Date.now() - t0,
  };
  await doc.destroy();
  return row;
}

const books = readFileSync(join(SRC, "books.jsonl"), "utf8").trim().split("\n").map(JSON.parse)
  .filter((b) => b.file_ext === "pdf" && b.http_status === 200)
  .filter((b) => !flags.only || b.path.includes(flags.only))
  // --local-only: just the books already in the cache (no network)
  .filter((b) => !flags["local-only"] || existsSync(join(process.env.CONTENT_CACHE_DIR || "C:/jazira/content-cache", "ien/pdf", b.path)));
const outFile = join(SRC, "book-frontmatter.jsonl");
const done = new Map();
if (existsSync(outFile) && !flags.refresh) for (const l of readFileSync(outFile, "utf8").trim().split("\n").filter(Boolean)) { const r = JSON.parse(l); if (!r.error) done.set(r.ien_book_id, r); }

const queue = books.filter((b) => !done.has(b.ien_book_id));
console.log(`${books.length} books, ${done.size} already done, ${queue.length} to read`);
let i = 0;
async function worker() {
  while (i < queue.length) {
    const b = queue[i++];
    let row;
    for (let attempt = 1; attempt <= 4 && !row; attempt++) {
      try {
        row = await one(b);
      } catch (e) {
        if (attempt === 4) row = { ien_book_id: b.ien_book_id, path: b.path, error: String(e.message || e) };
        else await new Promise((r) => setTimeout(r, 5000 * attempt)); // back off: the CDN drops bursts
      }
    }
    done.set(b.ien_book_id, row);
    const ordered = [...done.values()].sort((a, b) => a.ien_book_id - b.ien_book_id);
    writeFileSync(outFile, ordered.map((r) => JSON.stringify(r)).join("\n") + "\n");
    console.log(`${done.size}/${books.length} ${b.path} ${row.error ? "ERROR " + row.error : row.page_count + "p " + row.ms + "ms " + Object.keys(row.evidence).join(",")}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log("done");
