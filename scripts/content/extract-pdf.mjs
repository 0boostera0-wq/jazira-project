#!/usr/bin/env node
// ============================================================================
// PDF extraction (docs/CONTENT_ENGINE.md §4.2): text layer → repaired lines →
// page maps, TOC, exercise index, term evidence and extraction status.
//
//   node scripts/content/extract-pdf.mjs --resource ien-120607 [--pages cover,toc|all|1-40]
//   node scripts/content/extract-pdf.mjs --subject middle/grade-1/math --pages all
//   node scripts/content/extract-pdf.mjs --all-cached            # every PDF already in the cache
//   node scripts/content/extract-pdf.mjs --resource ien-120607 --rebuild   # outputs from the cache only
//   node scripts/content/extract-pdf.mjs --status
//   options: --range (uncached books: read the front pages by HTTP range through
//            the shared fetch queue), --run <run_id>, --staging <dir>, --no-manifest
//
// Reads PDFs only from <cache>/ien/pdf (fetch-books downloads them). Writes:
//   cache (never committed): ien/text/<stem>/pNNN.txt (raw text),
//     extract/<resource>/pages.jsonl {pdf_page, raw, repaired, normalized,
//     method: text|vision, text_quality, run_id, …}
//   repo (no body text, excerpts ≤ 80 chars): resources/page-maps/<resource>.jsonl,
//     resources/toc/<resource>.json, resources/exercise-index/<resource>.jsonl,
//     resources/extraction.jsonl, resources/term-evidence.jsonl,
//     validation/runs/<run_id>.json
// Pages whose text is untrusted (font garbage, unconfirmed repairs, no text
// layer), cover/TOC pages with low repair confidence and figure/equation/
// table pages of math and science books are marked `needs_vision` in the
// cache rows; scripts/content/vision-queue.mjs turns them into vision jobs.
// ============================================================================

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cachePaths, cacheRoot, isInside, isSafePdfName, pdfStem } from "./lib/cache.mjs";
import { readJsonl, writeFileIfChanged, writeJson, writeJsonl, writeShards } from "./lib/jsonl.mjs";
import { stringifyRecord } from "./lib/schemas.mjs";
import { loadLexicon } from "./lib/lexicon.mjs";
import { analyzePage, openPdf, openRangePdf, pageOffset, readPage, sha256 } from "./lib/pdf-text.mjs";
import { excerpt80, scriptShares } from "./lib/arabic-pdf.mjs";
import { alignToc, detectTocPages, lessonRanges, parseToc, tocRecord, tocStatus } from "./lib/toc.mjs";
import { exercisePageKind, exerciseRows, compareExerciseRows } from "./lib/exercise-index.mjs";
import { listingTitleEvidence, mergeTermEvidence, pageTermEvidence, stableProvenance, visionTermEvidence } from "./lib/term-evidence.mjs";
import { fetchRangeBytes, getFetchQueue, ienBookUrl } from "./lib/fetch-queue.mjs";
import { normalizeTitle } from "../../src/lib/content/normalize.js";
import { ienNodeId, isRunId, runId as makeRunId } from "../../src/lib/content/ids.js";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const FRONT_PAGES = 15;

// ── context ────────────────────────────────────────────────────────────────
const readJsonlIf = (p) => (existsSync(p) ? readJsonl(p) : []);
const readJsonIf = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);
/** Error text for committed files: absolute paths (cache, repo, temp) are replaced by <path> (§3 rule 7). */
export const scrubPaths = (text) => String(text ?? "").replace(/(?:[A-Za-z]:[\\/]|\\\\|\/(?:Users|home|tmp|var|mnt)\/)[^\s"'<>|;,()]*/g, "<path>");
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

/** Refuse a cache root inside the repository (page text and renders must never land in the repo). */
export function assertCacheOutsideRepo(root, repoRoot = REPO_ROOT) {
  if (isInside(repoRoot, root)) throw new Error(`the content cache (${root}) must be outside the repository (${repoRoot})`);
  return root;
}

/**
 * Load everything extraction needs from staging.
 * @param {{ stagingDir?, cacheDir?, repoRoot? }} o
 */
export function loadContext({ stagingDir = join(REPO_ROOT, "data/staging"), cacheDir = cacheRoot(), repoRoot = REPO_ROOT, lexicon = null } = {}) {
  assertCacheOutsideRepo(cacheDir, repoRoot);
  const ien = join(stagingDir, "sources/ien");
  const books = readJsonlIf(join(ien, "books.jsonl"));
  const lessons = readJsonlIf(join(ien, "lessons.jsonl"));
  const resourcesDir = join(stagingDir, "resources");
  const resources = existsSync(resourcesDir)
    ? readdirSync(resourcesDir).filter((f) => /^resources(?:\.p\d{2})?\.jsonl$/.test(f)).flatMap((f) => readJsonl(join(resourcesDir, f)))
    : [];
  const mapping = readJsonIf(join(stagingDir, "curriculum/ien-mapping.json"));
  return {
    stagingDir,
    cacheDir,
    paths: cachePaths(cacheDir),
    books,
    booksById: new Map(books.map((b) => [`ien-${b.ien_book_id}`, b])),
    lessons,
    resources: new Map(resources.map((r) => [r.id, r])),
    mapping,
    lexicon: lexicon ?? loadLexicon({ root: repoRoot, stagingDir }),
  };
}

/** Subject node id of a book: resources.jsonl first, then ien-mapping.json, else null. */
export function subjectNodeOf(ctx, book) {
  const r = ctx.resources.get(`ien-${book.ien_book_id}`);
  if (r?.subject_node_id) return r.subject_node_id;
  return ctx.mapping?.subjects?.[String(book.subject_ien_id)] ?? null;
}

/** iEN unit and lesson candidates for TOC alignment (ids need the subject node). */
export function alignmentCandidates(ctx, book) {
  const subject = subjectNodeOf(ctx, book);
  const id = (n) => (subject ? ienNodeId(subject, n) : `?n${n}`);
  const rows = ctx.lessons.filter((l) => l.subject_ien_id === book.subject_ien_id);
  const units = new Map();
  for (const l of rows) if (!units.has(l.unit_ien_id)) units.set(l.unit_ien_id, { id: id(l.unit_ien_id), title: l.unit_title });
  return {
    subject,
    units: [...units.values()],
    lessons: rows.map((l) => ({ id: id(l.lesson_ien_id), title: l.lesson_title, unit_id: id(l.unit_ien_id) })),
  };
}

const LANG_EN = /(^|[-_.])(i?eng|english)/i;
const STEM_SUBJECT = /(math|scin|scien|phys|chmi|chem|biog|biol|envr|geol|stat|earth)/i;
/** Content language of a book ("en" for English-language books). */
export const bookLanguage = (book) => (LANG_EN.test(book.slug ?? book.path ?? "") || /الإنجليزية|English/i.test(book.title ?? "") ? "en" : "ar");
/** Math / science book (figure, equation and table pages go to vision). */
export const isStemBook = (book) => STEM_SUBJECT.test(book.slug ?? book.path ?? "") || /الرياضيات|العلوم|الفيزياء|الكيمياء|الأحياء|علم البيئة/.test(book.title ?? "");

// ── page selection ─────────────────────────────────────────────────────────
/** "cover,toc" → 1..15; "all" → 1..n; "3-7,12" → those pages (clipped to n). */
export function selectPages(spec, pageCount) {
  const s = String(spec ?? "cover,toc").trim();
  if (s === "all") return Array.from({ length: pageCount }, (_, i) => i + 1);
  if (/^(cover|toc|cover,toc|toc,cover)$/.test(s)) return Array.from({ length: Math.min(FRONT_PAGES, pageCount) }, (_, i) => i + 1);
  const out = new Set();
  for (const part of s.split(",")) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!m) throw new Error(`bad --pages value ${JSON.stringify(spec)}`);
    for (let p = Number(m[1]); p <= Number(m[2] ?? m[1]); p++) if (p >= 1 && p <= pageCount) out.add(p);
  }
  return [...out].sort((a, b) => a - b);
}

// ── cache rows ─────────────────────────────────────────────────────────────
/** Cache rows of a resource (text and vision), or []. */
export function readCachePages(ctx, resourceId) {
  const p = ctx.paths.extractPages(resourceId);
  return existsSync(p) ? readJsonl(p) : [];
}

const cacheOrder = (a, b) => a.pdf_page - b.pdf_page || (a.method < b.method ? -1 : a.method > b.method ? 1 : 0) || (a.read_no ?? 0) - (b.read_no ?? 0);

/** Replace the text rows of the given pages; vision rows are kept. */
export function writeCachePages(ctx, resourceId, textRows) {
  const pages = new Set(textRows.map((r) => r.pdf_page));
  const keep = readCachePages(ctx, resourceId).filter((r) => r.method !== "text" || !pages.has(r.pdf_page));
  const path = ctx.paths.extractPages(resourceId);
  mkdirSync(dirname(path), { recursive: true });
  writeJsonl(path, [...keep, ...textRows], { compare: cacheOrder });
}

/** One analyzed page → its cache row (body text stays in the cache). */
export function cacheRow(a, { run_id }) {
  return {
    pdf_page: a.pdf_page,
    method: "text",
    raw: a.raw,
    repaired: a.repaired,
    normalized: a.normalized,
    text_quality: a.text_quality,
    flags: a.flags,
    sizes: a.lines.map((l) => l.size),
    printed_page: a.printed_page,
    headings: a.headings,
    char_count: a.char_count,
    has_text_layer: a.has_text_layer,
    images: a.images,
    stats: a.stats,
    run_id,
    needs_vision: false,
    vision_reason: null,
  };
}

/**
 * Read pages of one PDF (local, or range mode through the queue) and analyze them.
 * @returns {Promise<{ pageCount, analyzed: object[], rangeStats: object|null }>}
 */
export async function readBookPages(ctx, book, { pages = "cover,toc", range = false, queue = null, language = bookLanguage(book) } = {}) {
  const local = ctx.paths.pdf(book.path);
  let doc;
  let guard = (p) => p;
  let close = async () => {};
  let rangeStats = null;
  if (existsSync(local)) {
    doc = await openPdf({ path: local });
    close = () => doc.destroy();
  } else if (range) {
    const q = queue ?? getFetchQueue();
    const url = book.url ?? ienBookUrl(book.path);
    const opened = await openRangePdf({
      length: book.bytes,
      fetchRange: (begin, end) => fetchRangeBytes(q, url, begin, end),
    });
    ({ doc, guard, close } = opened);
    rangeStats = opened.stats;
  } else {
    const e = new Error(`${book.path} is not in the cache (run fetch-books, or pass --range for front pages)`);
    e.code = "not_cached";
    throw e;
  }
  try {
    const pageCount = doc.numPages;
    const list = selectPages(pages, pageCount);
    if (rangeStats && list.length > 20) throw new Error("range mode reads at most 20 pages; download the book with fetch-books");
    const analyzed = [];
    for (const n of list) {
      const page = await guard(readPage(doc, n, { images: !rangeStats }));
      analyzed.push(analyzePage(page, { lexicon: ctx.lexicon, language }));
    }
    return { pageCount, analyzed, rangeStats };
  } finally {
    await close();
  }
}

// ── outputs from the cache rows ────────────────────────────────────────────
const GLOSSARY_RE = /^(?:المصطلحات|مسرد|قاموس|قائمه المصطلحات|glossary)/;
const NUMERIC_TOKEN = /^[0-9٠-٩.,٫%+=×÷/()-]+$/;
const isNumericLine = (t) => {
  const tokens = String(t).split(/\s+/).filter(Boolean);
  return tokens.length >= 3 && tokens.filter((x) => NUMERIC_TOKEN.test(x)).length / tokens.length >= 0.6;
};

/** Pages with their text row and vision reads; the effective lines are the first vision read, else the repaired text. */
export function effectivePages(rows) {
  const byPage = new Map();
  for (const r of rows) {
    const e = byPage.get(r.pdf_page) ?? { pdf_page: r.pdf_page, text: null, vision: [] };
    if (r.method === "vision") e.vision.push(r);
    else e.text = r;
    byPage.set(r.pdf_page, e);
  }
  return [...byPage.values()]
    .sort((a, b) => a.pdf_page - b.pdf_page)
    .map((e) => {
      e.vision.sort((a, b) => (a.read_no ?? 0) - (b.read_no ?? 0));
      const useVision = e.vision.length > 0;
      const source = useVision ? e.vision[0].repaired : e.text?.repaired ?? "";
      const sizes = useVision ? [] : e.text?.sizes ?? [];
      const lines = String(source).split("\n").map((text, i) => ({ text, size: sizes[i] ?? 0 })).filter((l) => l.text.trim());
      const trusted = useVision || (e.text !== null && e.text.text_quality !== "untrusted");
      return { ...e, useVision, lines, trusted, repaired: source };
    });
}

function pageKinds(eff, { tocPages, ranges, exercisesByPage }) {
  const lessonsR = ranges.filter((r) => r.pdf_start !== null && r.level !== "unit" && r.level !== "chapter");
  const unitsR = ranges.filter((r) => r.pdf_start !== null && (r.level === "unit" || r.level === "chapter"));
  const firstContent = Math.min(...ranges.filter((r) => r.pdf_start !== null).map((r) => r.pdf_start), Infinity);
  const lastContent = Math.max(...ranges.filter((r) => r.pdf_end !== null).map((r) => r.pdf_end), -Infinity);
  const out = new Map();
  for (const e of eff) {
    const p = e.pdf_page;
    const lesson = lessonsR
      .filter((r) => p >= r.pdf_start && p <= (r.pdf_end ?? r.pdf_start))
      .sort((a, b) => (a.node_id ? 0 : 1) - (b.node_id ? 0 : 1) || b.pdf_start - a.pdf_start)[0];
    const unit = unitsR.find((r) => p >= r.pdf_start && p <= (r.pdf_end ?? r.pdf_start));
    const exKind = exercisePageKind(exercisesByPage.get(p) ?? []);
    const heading = normalizeTitle(e.lines[0]?.text ?? "");
    let kind = "unknown";
    if (p === 1) kind = "cover";
    else if (tocPages.includes(p)) kind = "toc";
    else if (GLOSSARY_RE.test(heading)) kind = "glossary";
    else if (exKind === "answer_key") kind = "answer_key";
    else if (unit && !lesson) kind = "unit_opener";
    else if (lesson) kind = exKind === "review" || exKind === "exercise" ? exKind : "lesson";
    else if (p < firstContent) kind = "front_matter";
    else if (p > lastContent && lastContent !== -Infinity) kind = "back_matter";
    else if (exKind) kind = exKind;
    out.set(p, { kind, lesson_node_id: lesson?.node_id ?? null });
  }
  return out;
}

/** Why (and how many reads) a page goes to vision. Cover and TOC pages need two agreeing reads. */
export function visionRouting(e, { kind, isToc, stem }) {
  const t = e.text;
  if (!t) return { reason: null, required: 0 };
  const coverOrToc = e.pdf_page <= 3 || isToc;
  const required = coverOrToc ? 2 : 1;
  let reason = null;
  if (t.text_quality === "untrusted" && (t.has_text_layer || (t.images ?? 0) > 0)) reason = "untrusted";
  else if (coverOrToc && t.text_quality !== "ok" && (t.stats?.confidence ?? 1) < 0.9) reason = "cover_toc_low_confidence";
  else if (stem && ["lesson", "exercise", "review"].includes(kind)) {
    const digits = scriptShares(t.repaired).digits;
    const tableLines = String(t.repaired).split("\n").filter(isNumericLine).length;
    if ((t.images ?? 0) >= 3 || digits >= 0.25 || tableLines >= 3) reason = "figure_equation_table";
  }
  return { reason, required };
}

/** Book-level quality: untrusted when > 1/3 of text pages are untrusted, else repaired when any fix, else ok. */
export function bookQuality(textRows) {
  const withText = textRows.filter((r) => r.has_text_layer);
  if (!withText.length) return "untrusted";
  const untrusted = withText.filter((r) => r.text_quality === "untrusted").length;
  if (untrusted / withText.length > 1 / 3) return "untrusted";
  return withText.some((r) => r.text_quality !== "ok") ? "repaired" : "ok";
}

const readStagingJsonl = (path) => (existsSync(path) ? readJsonl(path) : []);

function readTermEvidence(resourcesDir) {
  if (!existsSync(resourcesDir)) return [];
  return readdirSync(resourcesDir)
    .filter((f) => /^term-evidence(?:\.p\d{2})?\.jsonl$/.test(f))
    .flatMap((f) => readJsonl(join(resourcesDir, f)));
}

const byPdfPage = (a, b) => a.pdf_page - b.pdf_page;

/**
 * Rebuild every committed output of one resource from its cache rows and
 * update the cache rows' vision routing.
 * @returns {{ extraction, pageMap, toc, exercises, termEvidence }}
 */
export function buildOutputs(ctx, book, { run_id = null, status = null, pageCount = null, extractedAt = nowIso(), extraAnomalies = [] } = {}) {
  const resource_id = `ien-${book.ien_book_id}`;
  const resourcesDir = join(ctx.stagingDir, "resources");
  const extractionPath = join(resourcesDir, "extraction.jsonl");
  const extractionRows = readStagingJsonl(extractionPath);
  const prev = extractionRows.find((r) => r.resource_id === resource_id) ?? null;
  const count = pageCount ?? prev?.page_count ?? null;
  const rows = readCachePages(ctx, resource_id);
  const eff = effectivePages(rows);
  const anomalies = [...extraAnomalies];

  // TOC: detected on every page, parsed only where the text is trusted (else vision).
  const tocPages = detectTocPages(eff.map((e) => ({ pdf_page: e.pdf_page, lines: e.lines })));
  const parseable = eff
    .filter((e) => tocPages.includes(e.pdf_page) && e.trusted)
    .map((e) => ({ pdf_page: e.pdf_page, lines: e.lines, method: e.useVision ? "vision" : "text" }));
  const { entries } = parseToc(parseable);
  const aligned = alignToc(entries, alignmentCandidates(ctx, book)).map((e) => (e.matched_node_id?.startsWith("?") ? { ...e, matched_node_id: null } : e));
  const offset = pageOffset(eff.map((e) => ({ pdf_page: e.pdf_page, printed_page: e.text?.printed_page ?? e.vision[0]?.printed_page ?? null })));
  const ranges = lessonRanges(aligned, { offset, pageCount: count });

  // Exercise headings on trusted pages, then page kinds and lesson nodes.
  const exercisesByPage = new Map();
  for (const e of eff) {
    if (e.trusted && e.pdf_page !== 1 && !tocPages.includes(e.pdf_page)) exercisesByPage.set(e.pdf_page, exerciseRows({ resource_id, pdf_page: e.pdf_page, lines: e.lines, method: e.useVision ? "vision" : "text" }));
  }
  const kinds = pageKinds(eff, { tocPages, ranges, exercisesByPage });
  const exercises = [];
  for (const [p, list] of exercisesByPage) for (const r of list) exercises.push({ ...r, lesson_node_id: kinds.get(p)?.lesson_node_id ?? null });

  // Term evidence (strict routes, §2.4).
  const fresh = [];
  const listing = listingTitleEvidence({ resource_id, title: book.title, run_id, extracted_at: extractedAt });
  fresh.push(...listing.rows);
  anomalies.push(...listing.anomalies);
  for (const e of eff) {
    const isToc = tocPages.includes(e.pdf_page);
    if (e.pdf_page > 3 && !isToc) continue;
    // A page with vision reads takes its evidence from them only (the transcript is
    // the source of truth there, §4.2): its text layer was routed to vision.
    if (e.text && e.text.text_quality !== "untrusted" && !e.vision.length) {
      const r = pageTermEvidence({ resource_id, pdf_page: e.pdf_page, text: e.text.repaired, text_quality: e.text.text_quality, toc: isToc, run_id, extracted_at: extractedAt });
      fresh.push(...r.rows);
      anomalies.push(...r.anomalies);
    }
    if (e.vision.length) {
      const v = visionTermEvidence({ resource_id, pdf_page: e.pdf_page, reads: e.vision.map((x) => x.repaired), run_id: e.vision[0].run_id ?? run_id, extracted_at: extractedAt });
      fresh.push(...v.rows);
      anomalies.push(...v.anomalies);
    }
  }
  const termEvidence = mergeTermEvidence(readTermEvidence(resourcesDir), fresh, [resource_id]);

  // Page map rows (no body text) and vision routing (cache rows).
  const stem = isStemBook(book);
  const routed = new Map();
  const numbered = eff.filter((e) => (e.text?.printed_page ?? e.vision[0]?.printed_page ?? null) !== null).map((e) => e.pdf_page);
  const firstNumbered = numbered.length ? Math.min(...numbered) : Infinity;
  const pageMap = eff.map((e) => {
    const t = e.text;
    const { kind, lesson_node_id } = kinds.get(e.pdf_page);
    const route = visionRouting(e, { kind, isToc: tocPages.includes(e.pdf_page), stem });
    routed.set(e.pdf_page, { ...route, needs: Boolean(route.reason) && e.vision.length < route.required });
    const flags = new Set(t?.flags ?? []);
    if (e.useVision) flags.add("vision_read");
    const effective = e.repaired;
    const charCount = effective.replace(/\s+/g, "").length;
    const detected = t?.printed_page ?? e.vision[0]?.printed_page ?? null;
    // printed = pdf_page − offset, only from the first page that carries a number (front matter is unnumbered)
    const printed = detected ?? (offset !== null && e.pdf_page >= firstNumbered && e.pdf_page - offset >= 1 ? e.pdf_page - offset : null);
    const headings = e.useVision || !t ? e.lines.slice(0, 1).map((l) => excerpt80(l.text)) : (t.headings ?? []).map((h) => excerpt80(h)).slice(0, 3);
    return {
      schema: "page-map@1",
      resource_id,
      pdf_page: e.pdf_page,
      printed_page: printed,
      kind,
      lesson_node_id,
      headings,
      char_count: charCount,
      text_sha256: charCount ? sha256(effective) : null,
      has_text_layer: Boolean(t?.has_text_layer),
      script: scriptShares(effective),
      flags: ["reversed_fixed", "presentation_forms_fixed", "ligature_fixed", "split_letters_fixed", "font_garbage", "low_text", "no_text_layer", "two_column", "vision_read"].filter((f) => flags.has(f)),
      text_method: e.useVision ? "vision" : t?.has_text_layer ? "text" : "none",
      text_quality: t?.text_quality ?? "untrusted",
    };
  });
  const textRows = rows.filter((r) => r.method === "text");
  const updatedRows = rows.map((r) => {
    if (r.method !== "text") return r;
    const v = routed.get(r.pdf_page);
    return { ...r, needs_vision: Boolean(v?.needs), vision_reason: v?.reason ?? null, vision_reads_required: v?.required ?? 0 };
  });
  if (rows.length) writeJsonl(ctx.paths.extractPages(resource_id), updatedRows, { compare: cacheOrder });

  // TOC record and extraction status.
  const tocPath = join(resourcesDir, "toc", `${resource_id}.json`);
  let toc = tocRecord({ resource_id, entries: aligned, tocPages, offset, run_id });
  if (tocPages.length && !parseable.length) toc.toc_status = "partial"; // TOC pages await vision
  else if (!tocPages.length) toc.toc_status = "not_found";
  else toc.toc_status = tocStatus(aligned);
  toc = stableProvenance(readJsonIf(tocPath), toc, ["run_id"]);
  const sum = (k) => textRows.reduce((n, r) => n + (r.stats?.[k] ?? 0), 0);
  const tokens = sum("arabic_tokens");
  const fixes = sum("lam_repairs") + sum("split_joins") + sum("damaged_tokens");
  const extraction = stableProvenance(prev, {
    schema: "extraction@1",
    resource_id,
    status: status ?? prev?.status ?? (textRows.length ? "frontmatter_done" : "not_started"),
    run_id,
    page_count: count,
    pages_read: textRows.length,
    pages_with_text: textRows.filter((r) => r.has_text_layer && r.text_quality !== "untrusted").length,
    pages_vision: eff.filter((e) => e.useVision).length,
    pages_untrusted: textRows.filter((r) => r.text_quality === "untrusted").length,
    pages_awaiting_vision: [...routed.values()].filter((v) => v.needs).length,
    text_quality: bookQuality(textRows),
    toc_status: toc.toc_status,
    toc_pages: toc.toc_pages,
    page_offset: offset,
    repair_rate: tokens ? Math.round((fixes / tokens) * 1000) / 1000 : 0,
    lexicon_confirmed_repairs: sum("lam_validated") + sum("split_validated"),
    anomalies: anomalies.map((a) => ({ ...a, excerpt: a.excerpt ? excerpt80(a.excerpt) : null })),
    extracted_at: extractedAt,
  });

  // Write the committed outputs.
  const pmPath = join(resourcesDir, "page-maps", `${resource_id}.jsonl`);
  const pmKeep = readStagingJsonl(pmPath).filter((r) => !pageMap.some((p) => p.pdf_page === r.pdf_page));
  writeJsonlSafe(pmPath, [...pmKeep, ...pageMap].sort(byPdfPage), (r) => stringifyRecord("page-map", r));
  mkdirSync(join(resourcesDir, "toc"), { recursive: true });
  writeJson(tocPath, toc);
  const exPath = join(resourcesDir, "exercise-index", `${resource_id}.jsonl`);
  const pagesDone = new Set(eff.map((e) => e.pdf_page));
  const exAll = [...readStagingJsonl(exPath).filter((r) => !pagesDone.has(r.pdf_page)), ...exercises].sort(compareExerciseRows);
  if (exAll.length || existsSync(exPath)) writeJsonlSafe(exPath, exAll, (r) => stringifyRecord("exercise-index", r));
  const nextExtraction = [...extractionRows.filter((r) => r.resource_id !== resource_id), extraction].sort((a, b) => (a.resource_id < b.resource_id ? -1 : 1));
  writeJsonlSafe(extractionPath, nextExtraction, (r) => stringifyRecord("extraction", r));
  mkdirSync(resourcesDir, { recursive: true });
  const hasEvidenceFile = readdirSync(resourcesDir).some((f) => f.startsWith("term-evidence") && f.endsWith(".jsonl"));
  if (termEvidence.length || hasEvidenceFile) writeShards(join(resourcesDir, "term-evidence"), termEvidence, { serialize: (r) => stringifyRecord("term-evidence", r) });
  return { extraction, pageMap, toc, exercises, termEvidence };
}

function writeJsonlSafe(path, records, serialize) {
  mkdirSync(dirname(path), { recursive: true });
  return writeJsonl(path, records, { serialize });
}

/** Record a resource that cannot be extracted (zip, unsafe name, not cached, failure). */
export function recordStatus(ctx, book, { status, run_id = null, anomaly = null }) {
  const resource_id = `ien-${book.ien_book_id}`;
  const path = join(ctx.stagingDir, "resources", "extraction.jsonl");
  const rows = readStagingJsonl(path);
  const prev = rows.find((r) => r.resource_id === resource_id);
  if (prev && status === "not_started") return prev; // never downgrade existing work
  const row = stableProvenance(prev, {
    ...(prev ?? {}),
    schema: "extraction@1",
    resource_id,
    status,
    run_id,
    anomalies: anomaly ? [...(prev?.anomalies ?? []).filter((a) => a.code !== anomaly.code), anomaly] : prev?.anomalies ?? [],
    extracted_at: nowIso(),
  });
  writeJsonlSafe(path, [...rows.filter((r) => r.resource_id !== resource_id), row].sort((a, b) => (a.resource_id < b.resource_id ? -1 : 1)), (r) => stringifyRecord("extraction", r));
  return row;
}

/**
 * Extract one book: read pages (cache PDF, or range mode), write the cache
 * rows and raw page text, then rebuild the committed outputs.
 */
export async function extractResource(ctx, book, { pages = "cover,toc", range = false, queue = null, run_id = null } = {}) {
  if (book.file_ext !== "pdf") return { status: "not_applicable", extraction: recordStatus(ctx, book, { status: "not_applicable", run_id }) };
  if (!isSafePdfName(book.path)) {
    return { status: "failed", extraction: recordStatus(ctx, book, { status: "failed", run_id, anomaly: { code: "unsafe_file_name", pdf_page: 0, method: null, excerpt: excerpt80(book.path) } }) };
  }
  const resource_id = `ien-${book.ien_book_id}`;
  let read;
  try {
    read = await readBookPages(ctx, book, { pages, range, queue });
  } catch (e) {
    if (e.code !== "not_cached") throw e;
    // No PDF in the cache: the text rows pdf-frontmatter already stored are
    // reused (a range read is never repeated), else the book waits.
    const cached = readCachePages(ctx, resource_id).filter((r) => r.method === "text");
    if (cached.length && String(pages) !== "all") {
      const fm = readStagingJsonl(join(ctx.stagingDir, "sources/ien/book-frontmatter.jsonl")).find((r) => r.ien_book_id === book.ien_book_id);
      const prior = readStagingJsonl(join(ctx.stagingDir, "resources", "extraction.jsonl")).find((r) => r.resource_id === resource_id)?.status;
      const status = prior === "full_done" ? "full_done" : "frontmatter_done";
      const out = buildOutputs(ctx, book, { run_id, status, pageCount: fm?.page_count ?? null });
      return { status, stem: pdfStem(book.path), pagesRead: cached.length, rangeStats: null, fromCache: true, ...out };
    }
    return { status: "not_started", error: e.message, extraction: recordStatus(ctx, book, { status: "not_started", run_id }) };
  }
  const { pageCount, analyzed } = read;
  const stem = pdfStem(book.path);
  for (const a of analyzed) {
    const f = ctx.paths.textPage(book.path, a.pdf_page);
    mkdirSync(dirname(f), { recursive: true });
    writeFileIfChanged(f, a.raw);
  }
  writeCachePages(ctx, resource_id, analyzed.map((a) => cacheRow(a, { run_id })));
  const all = analyzed.length === pageCount && String(pages) === "all";
  const prevStatus = readStagingJsonl(join(ctx.stagingDir, "resources", "extraction.jsonl")).find((r) => r.resource_id === resource_id)?.status;
  const status = all ? "full_done" : prevStatus === "full_done" ? "full_done" : "frontmatter_done";
  const out = buildOutputs(ctx, book, { run_id, status, pageCount });
  return { status, stem, pagesRead: analyzed.length, rangeStats: read.rangeStats, ...out };
}

// ── CLI ────────────────────────────────────────────────────────────────────
/** Next free run id of a kind for today: run-<yyyymmdd>-<kind>-<nn>. */
export function nextRunId(stagingDir, kind, date = new Date()) {
  const dir = join(stagingDir, "validation", "runs");
  const ymd = date.toISOString().slice(0, 10).replace(/-/g, "");
  const used = existsSync(dir) ? readdirSync(dir).map((f) => new RegExp(`^run-${ymd}-${kind}-(\\d{2})\\.json$`).exec(f)).filter(Boolean).map((m) => Number(m[1])) : [];
  return makeRunId(ymd, kind, Math.max(0, ...used) + 1);
}

/** Books selected by --resource / --file / --subject / --all-cached. */
export function resolveBooks(ctx, args) {
  const out = new Map();
  const add = (b) => b && out.set(b.ien_book_id, b);
  for (const id of String(args.resource ?? "").split(",").filter(Boolean)) {
    const b = ctx.booksById.get(id.trim());
    if (!b) throw new Error(`unknown resource ${id} (not in books.jsonl)`);
    add(b);
  }
  for (const f of String(args.file ?? "").split(",").filter(Boolean)) {
    const b = ctx.books.find((x) => x.path === f.trim());
    if (!b) throw new Error(`unknown book file ${f}`);
    add(b);
  }
  if (args.subject) {
    const found = ctx.books.filter((b) => subjectNodeOf(ctx, b) === args.subject || String(b.subject_ien_id) === String(args.subject).replace(/^ien:/, ""));
    if (!found.length) throw new Error(`no books for subject ${args.subject} (needs resources.jsonl or curriculum/ien-mapping.json, or pass ien:<subject id>)`);
    found.forEach(add);
  }
  if (args["all-cached"]) for (const b of ctx.books) if (b.file_ext === "pdf" && isSafePdfName(b.path) && existsSync(ctx.paths.pdf(b.path))) add(b);
  return [...out.values()].sort((a, b) => a.ien_book_id - b.ien_book_id);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const [k, v] = a.slice(2).split("=");
    if (v !== undefined) args[k] = v;
    else if (argv[i + 1] && !argv[i + 1].startsWith("--")) args[k] = argv[++i];
    else args[k] = true;
  }
  return args;
}

function statusReport(ctx) {
  const rows = readStagingJsonl(join(ctx.stagingDir, "resources", "extraction.jsonl"));
  const pdfs = ctx.books.filter((b) => b.file_ext === "pdf").length;
  const by = {};
  for (const r of rows) by[r.status] = (by[r.status] || 0) + 1;
  const awaiting = rows.reduce((n, r) => n + (r.pages_awaiting_vision ?? 0), 0);
  return [`extraction: ${rows.length} resources recorded of ${pdfs} PDFs`, ...Object.entries(by).map(([k, v]) => `  ${k}: ${v}`), `pages awaiting vision: ${awaiting}`].join("\n");
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const ctx = loadContext({ stagingDir: args.staging ? resolve(args.staging) : undefined });
  if (args.status) {
    console.log(statusReport(ctx));
    return 0;
  }
  const books = resolveBooks(ctx, args);
  if (!books.length) {
    console.error("usage: extract-pdf.mjs --resource <id>[,…] | --file <name.pdf> | --subject <node> | --all-cached [--pages cover,toc|all|a-b] [--range] [--rebuild] [--run <id>] [--status]");
    return 2;
  }
  const run_id = typeof args.run === "string" ? args.run : nextRunId(ctx.stagingDir, "extract");
  if (!isRunId(run_id)) {
    console.error(`--run must look like run-<yyyymmdd>-<kind>-<nn> (§2.2), got ${JSON.stringify(run_id)}`);
    return 2;
  }
  const pages = typeof args.pages === "string" ? args.pages : "cover,toc";
  const startedAt = nowIso();
  const counts = { resources: 0, pages: 0, untrusted: 0, awaiting_vision: 0, not_cached: 0, not_applicable: 0, failed: 0 };
  const errors = [];
  for (const book of books) {
    try {
      if (args.rebuild) {
        if (!readCachePages(ctx, `ien-${book.ien_book_id}`).length) {
          console.log(`${book.path}: nothing in the cache to rebuild from (run extract-pdf without --rebuild first)`);
          continue;
        }
        const out = buildOutputs(ctx, book, { run_id });
        console.log(`${book.path}: rebuilt from the cache (${out.pageMap.length} pages, toc ${out.toc.toc_status})`);
        counts.resources++;
        continue;
      }
      const r = await extractResource(ctx, book, { pages, range: Boolean(args.range), run_id });
      if (r.status === "not_started") {
        counts.not_cached++;
        console.log(`${book.path}: skipped — ${r.error}`);
        continue;
      }
      if (r.status === "not_applicable" || r.status === "failed") {
        counts[r.status]++;
        console.log(`${book.path}: ${r.status}`);
        continue;
      }
      counts.resources++;
      counts.pages += r.pagesRead;
      counts.untrusted += r.extraction.pages_untrusted;
      counts.awaiting_vision += r.extraction.pages_awaiting_vision;
      console.log(`${book.path}: ${r.pagesRead} pages, quality ${r.extraction.text_quality}, toc ${r.extraction.toc_status}, awaiting vision ${r.extraction.pages_awaiting_vision}`);
    } catch (e) {
      counts.failed++;
      errors.push({ resource_id: `ien-${book.ien_book_id}`, error: scrubPaths(e.message || e).slice(0, 300) });
      recordStatus(ctx, book, { status: "failed", run_id, anomaly: { code: "extraction_error", pdf_page: 0, method: null, excerpt: excerpt80(scrubPaths(e.message || e)) } });
      console.error(`${book.path}: FAILED ${e.message}`);
    }
  }
  if (!args["no-manifest"]) {
    const manifest = {
      schema: "run-manifest@1",
      run_id,
      kind: "extract",
      tool: "extract-pdf@1",
      started_at: startedAt,
      finished_at: nowIso(),
      params: { pages, range: Boolean(args.range), rebuild: Boolean(args.rebuild), resources: books.map((b) => `ien-${b.ien_book_id}`) },
      inputs: { books_sha256: sha256(readFileSync(join(ctx.stagingDir, "sources/ien/books.jsonl"), "utf8")) },
      counts,
      errors,
    };
    mkdirSync(join(ctx.stagingDir, "validation", "runs"), { recursive: true });
    writeFileSync(join(ctx.stagingDir, "validation", "runs", `${run_id}.json`), JSON.stringify(manifest, null, 2) + "\n");
  }
  console.log(`${run_id}: ${JSON.stringify(counts)}`);
  return counts.failed ? 1 : 0;
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
