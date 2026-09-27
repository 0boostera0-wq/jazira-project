#!/usr/bin/env node
// ============================================================================
// Front matter of every iEN textbook (docs/CONTENT_ENGINE.md §4.2 "Fetch",
// run R3): the first pages (default 14) of each book, read from the cached PDF
// or — for books not in a generation batch — by HTTP range requests through
// the shared fetch queue (≤ 2 in flight across all tools, 500 ms spacing,
// backoff, circuit breaker, hourly budget; each book is one queue job and
// every range request counts against the budget). Resumable over days.
//
//   node scripts/content/pdf-frontmatter.mjs [--pages=14] [--only=<path substring>] [--local-only]
//                                            [--refresh] [--rebuild] [--sanitize] [--concurrency=2] [--budget=600] [--status]
//
// Input : data/staging/sources/ien/books.jsonl        (from ien-crawl.mjs)
// Output: cache  ien/text/<stem>/pNNN.txt              raw page text (never committed)
//         cache  extract/<resource>/pages.jsonl         repaired text rows (extract-pdf reuses them:
//                                                       no range read is ever repeated)
//         repo   data/staging/sources/ien/book-frontmatter.jsonl   book-frontmatter@1, one row per book:
//           page_count, PDF dates, per-page char counts, text_quality, evidence snippets
//           (≤ 80 chars, from REPAIRED text), TOC pages. No cache paths, no term_* keys:
//           terms are derived only by the strict routes of §2.4 (extract-pdf).
// Books already in the output are skipped (--refresh re-reads them). --rebuild
// recomputes every row from the cached page text without any request.
// --sanitize only cleans rows written by older versions (drops cache_dir and
// term_* keys, trims snippets to 80 chars) and keeps their evidence keys, so
// the downstream part/year inputs (WP2) do not change.
// ============================================================================
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cachePaths, cacheRoot, isSafePdfName } from "./lib/cache.mjs";
import { readJsonl, writeFileIfChanged, writeJsonl } from "./lib/jsonl.mjs";
import { stringifyRecord } from "./lib/schemas.mjs";
import { createLexicon, loadLexicon } from "./lib/lexicon.mjs";
import { analyzePage, openPdf, openRangePdf, readPage } from "./lib/pdf-text.mjs";
import { excerpt80, repairText, worstQuality } from "./lib/arabic-pdf.mjs";
import { detectTocPages } from "./lib/toc.mjs";
import { QueuePausedError, assertOutsideRepo, createFetchQueue, fetchRangeBytes, formatStatus, ienBookUrl } from "./lib/fetch-queue.mjs";
import { normalizeTitle } from "../../src/lib/content/normalize.js";

export { pageText } from "./lib/pdf-text.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = join(ROOT, "data/staging/sources/ien");
const OUT_FILE = join(SRC, "book-frontmatter.jsonl");

// ── evidence (never term evidence: parts, edition years, TOC heading) ──────
const fold = (s) => normalizeTitle(s);
const phrase = (...variants) => variants.map((v) => fold(v));
export const EVIDENCE_KEYS = Object.freeze([
  // «الثاين» is the text layer's ya/nun swap of «الثاني» (observed on covers)
  ["part_1", phrase("الجزء الأول"), /جزء|جلزء/],
  ["part_2", phrase("الجزء الثاني", "الجزء الثاين"), /جزء|جلزء/],
  ["year_1448", ["1448"], /1448|١٤٤٨/],
  ["year_1447", ["1447"], /1447|١٤٤٧/],
  ["toc", phrase("المحتويات", "الفهرس", "فهرس المحتويات", "قائمة المحتويات"), /محتويات|حملتويات|فهرس/],
]);

/** Excerpt (≤ 80 chars) of a line around an anchor. */
function lineExcerpt(line, anchor) {
  const s = String(line).replace(/\s+/g, " ").trim();
  if (s.length <= 80) return s;
  const i = Math.max(0, s.search(anchor));
  return excerpt80(s.slice(Math.max(0, i - 20)));
}

/** First page/line of each evidence key, on repaired text. */
export function frontmatterEvidence(pages) {
  const evidence = {};
  for (const p of pages) {
    for (const line of String(p.repaired).split("\n")) {
      const f = fold(line.replace(/[/|_–-]+/g, " ")); // «الابتدائي/الجزء الأول»: separators are word breaks
      if (!f) continue;
      for (const [key, needles, anchor] of EVIDENCE_KEYS) {
        if (evidence[key]) continue;
        if (needles.some((n) => (` ${f} `).includes(` ${n} `) || (/^\d+$/.test(n) && f.includes(n)))) {
          evidence[key] = { page: p.pdf_page, snippet: lineExcerpt(line, anchor) };
        }
      }
    }
  }
  return evidence;
}

/** Book-level text quality: untrusted when > 1/3 of the pages with text are untrusted. */
export function frontmatterQuality(pages) {
  const withText = pages.filter((p) => p.has_text_layer);
  if (!withText.length) return "untrusted";
  if (withText.filter((p) => p.text_quality === "untrusted").length / withText.length > 1 / 3) return "untrusted";
  return worstQuality(withText.map((p) => (p.text_quality === "untrusted" ? "repaired" : p.text_quality)));
}

/** One book-frontmatter@1 row from analyzed pages. */
export function frontmatterRow(book, { pageCount, meta = {}, pages, runId = null, ms = null }) {
  const row = {
    schema: "book-frontmatter@1",
    ien_book_id: book.ien_book_id,
    subject_ien_id: book.subject_ien_id,
    path: book.path,
    title: book.title,
    page_count: pageCount,
    pdf_creation_date: meta.CreationDate || null,
    pdf_mod_date: meta.ModDate || null,
    pdf_language: meta.Language || null,
    pages_read: pages.length,
    page_chars: pages.map((p) => String(p.raw ?? "").length),
    text_layer: pages.some((p) => p.char_count > 200) ? "present" : "missing_or_image_only",
    text_quality: frontmatterQuality(pages),
    evidence: frontmatterEvidence(pages),
    toc_candidate_pages: detectTocPages(pages.map((p) => ({ pdf_page: p.pdf_page, lines: String(p.repaired).split("\n").filter((t) => t.trim()).map((text) => ({ text })) }))),
    run_id: runId,
  };
  if (Number.isInteger(ms)) row.ms = ms;
  return row;
}

/**
 * Clean a row written by the old script: drop cache_dir and term_* keys,
 * keep snippets ≤ 80 chars, keep only schema keys.
 */
let sanitizeLexicon = null;
const SANITIZE_LEXICON = () => (sanitizeLexicon ??= createLexicon());

export function sanitizeRow(r) {
  if (r.error) return { schema: "book-frontmatter@1", ien_book_id: r.ien_book_id, path: r.path, error: String(r.error).slice(0, 300) };
  const evidence = {};
  const found = {};
  const anchors = new Map(EVIDENCE_KEYS.map(([key, , anchor]) => [key, anchor]));
  for (const [k, v] of Object.entries(r.evidence ?? {})) {
    if (k.startsWith("term_") || !v || !Number.isInteger(v.page)) continue;
    const full = String(v.snippet ?? "");
    evidence[k] = { page: v.page, snippet: anchors.has(k) ? lineExcerpt(full, anchors.get(k)) : excerpt80(full) };
    // An over-long old snippet may hold other detector hits (e.g. «طبعة ١٤٤8» after
    // «الجزء الثاني»): keep them as their own keys before the text is cut to 80 chars.
    if (full.length > 80) {
      for (const [k2, v2] of Object.entries(frontmatterEvidence([{ pdf_page: v.page, repaired: repairText(full, { lexicon: SANITIZE_LEXICON() }).repaired }]))) found[k2] ??= v2;
    }
  }
  for (const [k2, v2] of Object.entries(found)) if (!(k2 in evidence) && !(k2 in (r.evidence ?? {}))) evidence[k2] = v2;
  const keep = ["ien_book_id", "subject_ien_id", "path", "title", "page_count", "pdf_creation_date", "pdf_mod_date", "pdf_language", "pages_read", "page_chars", "text_layer", "text_quality", "toc_candidate_pages", "run_id", "ms"];
  const out = { schema: "book-frontmatter@1" };
  for (const k of keep) if (r[k] !== undefined) out[k] = r[k];
  out.evidence = evidence;
  return out;
}

export const writeRows = (rows, file = OUT_FILE) =>
  writeJsonl(file, [...rows].sort((a, b) => a.ien_book_id - b.ien_book_id), { serialize: (r) => stringifyRecord("book-frontmatter", r) });

// ── reading ────────────────────────────────────────────────────────────────
/**
 * Read the first `pages` pages of one book (cached PDF, else range mode
 * through the queue), write the cache text and rows, return its row.
 */
export async function readFrontmatter(book, { pages = 14, queue = null, root = cacheRoot(), lexicon = loadLexicon(), runId = null } = {}) {
  const { bookLanguage, cacheRow, writeCachePages } = await import("./extract-pdf.mjs");
  const paths = cachePaths(assertOutsideRepo(root));
  const t0 = Date.now();
  const local = paths.pdf(book.path);
  let doc;
  let guard = (p) => p;
  let close = async () => {};
  let ranged = false;
  if (existsSync(local)) {
    doc = await openPdf({ path: local });
    close = () => doc.destroy();
  } else {
    if (!queue) throw new Error(`${book.path} is not cached and no fetch queue was given`);
    const url = book.url ?? ienBookUrl(book.path);
    const opened = await openRangePdf({
      length: book.bytes,
      // 206 only: a server that ignores Range is refused before its body is read (fatal)
      fetchRange: (begin, end) => fetchRangeBytes(queue, url, begin, end),
    });
    ({ doc, guard, close } = opened);
    ranged = true;
  }
  try {
    const meta = (await guard(doc.getMetadata())).info || {};
    const n = Math.min(pages, doc.numPages);
    const language = bookLanguage(book);
    const analyzed = [];
    for (let p = 1; p <= n; p++) analyzed.push(analyzePage(await guard(readPage(doc, p, { images: !ranged })), { lexicon, language }));
    for (const a of analyzed) {
      const f = paths.textPage(book.path, a.pdf_page);
      mkdirSync(dirname(f), { recursive: true });
      writeFileIfChanged(f, a.raw);
    }
    writeCachePages({ paths }, `ien-${book.ien_book_id}`, analyzed.map((a) => cacheRow(a, { run_id: runId })));
    return frontmatterRow(book, { pageCount: doc.numPages, meta, pages: analyzed, runId, ms: Date.now() - t0 });
  } finally {
    await close();
  }
}

/** Recompute a row from the cached page text (no request); null when the text is not cached. */
export function rebuildFromCache(prev, book, { root = cacheRoot(), lexicon = loadLexicon(), language = "ar" } = {}) {
  const paths = cachePaths(root);
  const n = prev.pages_read ?? 0;
  if (!n || !isSafePdfName(book.path)) return null;
  const pages = [];
  for (let p = 1; p <= n; p++) {
    const f = paths.textPage(book.path, p);
    if (!existsSync(f)) return null;
    const raw = readFileSync(f, "utf8");
    const r = repairText(raw, { lexicon, language, hasTextLayer: raw.trim().length > 0 });
    pages.push({ pdf_page: p, raw, repaired: r.repaired, text_quality: r.text_quality, char_count: r.char_count, has_text_layer: raw.trim().length > 0 });
  }
  const meta = { CreationDate: prev.pdf_creation_date, ModDate: prev.pdf_mod_date, Language: prev.pdf_language };
  const row = frontmatterRow(book, { pageCount: prev.page_count, meta, pages, runId: prev.run_id ?? null, ms: prev.ms ?? null });
  row.page_chars = prev.page_chars ?? row.page_chars; // counts of the original read
  return row;
}

// ── CLI ────────────────────────────────────────────────────────────────────
function parseFlags(argv) {
  return Object.fromEntries(argv.filter((a) => a.startsWith("--")).map((a) => {
    const [k, v] = a.slice(2).split("=");
    return [k, v ?? true];
  }));
}

export async function main(argv = process.argv.slice(2)) {
  const flags = parseFlags(argv);
  const PAGES = Number(flags.pages || 14);
  const concurrency = Math.max(1, Math.min(2, Number(flags.concurrency || 1)));
  const root = cacheRoot();
  const paths = cachePaths(root);
  const all = readJsonl(join(SRC, "books.jsonl"));
  const books = all
    .filter((b) => b.file_ext === "pdf" && b.http_status === 200 && isSafePdfName(b.path))
    .filter((b) => !flags.only || b.path.includes(flags.only));
  const existing = new Map((existsSync(OUT_FILE) ? readJsonl(OUT_FILE) : []).map((r) => [r.ien_book_id, sanitizeRow(r)]));
  const queue = createFetchQueue({ budgetPerHour: flags.budget ? Number(flags.budget) : undefined, log: (m) => console.log(`  queue: ${m}`) });
  const coverage = () => `front matter: ${[...existing.values()].filter((r) => !r.error).length}/${all.length} files`;

  if (flags.status) {
    console.log(formatStatus(queue.status()));
    console.log(coverage());
    return 0;
  }
  const lexicon = loadLexicon();
  if (flags.sanitize) {
    writeRows(existing.values());
    console.log(`sanitized ${existing.size} rows (no reads, no requests); ${coverage()}`);
    return 0;
  }
  if (flags.rebuild) {
    const { bookLanguage } = await import("./extract-pdf.mjs");
    let rebuilt = 0;
    for (const b of books) {
      const prev = existing.get(b.ien_book_id);
      if (!prev || prev.error) continue;
      const row = rebuildFromCache(prev, b, { root, lexicon, language: bookLanguage(b) });
      if (row) {
        existing.set(b.ien_book_id, row);
        rebuilt++;
      }
    }
    writeRows(existing.values());
    console.log(`rebuilt ${rebuilt} rows from the cached page text (no requests); ${coverage()}`);
    return 0;
  }

  const todo = books.filter((b) => flags.refresh || !existing.has(b.ien_book_id) || existing.get(b.ien_book_id).error);
  const local = todo.filter((b) => existsSync(paths.pdf(b.path)));
  const remote = flags["local-only"] ? [] : todo.filter((b) => !existsSync(paths.pdf(b.path)));
  console.log(`${books.length} books, ${existing.size} already done, ${local.length} to read from the cache, ${remote.length} by range requests`);
  writeRows(existing.values()); // sanitizes rows written by older versions

  for (const b of local) {
    const row = await readFrontmatter(b, { pages: PAGES, root, lexicon });
    existing.set(b.ien_book_id, row);
    writeRows(existing.values());
    console.log(`${b.path}: ${row.page_count}p cached ${row.text_quality} ${Object.keys(row.evidence).join(",")}`);
  }
  if (remote.length) {
    const { scrubPaths } = await import("./extract-pdf.mjs");
    const byUrl = new Map(remote.map((b) => [b.url ?? ienBookUrl(b.path), b]));
    await queue.enqueue([...byUrl].map(([url, b]) => ({ url, kind: "range", resource_id: `ien-${b.ien_book_id}` })), { retry: true, reopen: Boolean(flags.refresh) });
    const r = await queue.runJobs(
      async (job) => {
        const b = byUrl.get(job.url);
        try {
          const row = await readFrontmatter(b, { pages: PAGES, queue, root, lexicon });
          existing.set(b.ien_book_id, row);
          console.log(`${b.path}: ${row.page_count}p ${row.ms}ms ${row.text_quality} ${Object.keys(row.evidence).join(",")}`);
        } catch (e) {
          if (e instanceof QueuePausedError) throw e;
          if (e.status || e.fatal) existing.set(b.ien_book_id, sanitizeRow({ ien_book_id: b.ien_book_id, path: b.path, error: scrubPaths(e.message || e) }));
          throw e;
        } finally {
          writeRows(existing.values());
        }
      },
      { filter: (j) => j.kind === "range" && byUrl.has(j.url), concurrency },
    );
    console.log(`queue run: done ${r.done}, deferred ${r.deferred}, parked ${r.parked}, failed ${r.failed}`);
    if (r.paused) console.log(`paused (${r.paused.reason}) until ${new Date(r.paused.until).toISOString()} — rerun later to resume`);
  }
  console.log(coverage());
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );
}
