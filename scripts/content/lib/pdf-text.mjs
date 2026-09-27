// ============================================================================
// PDF text layer → reading-order lines (docs/CONTENT_ENGINE.md §4.2 steps 1–3).
//
//   const doc = await openPdf({ path })                       local cached PDF
//   const { doc, stats } = await openRangePdf({ url, length, fetchRange })
//                                                             only the byte ranges pdf.js asks for
//   const page = await readPage(doc, 14)                      slim items + image count
//   const a = analyzePage(page, { lexicon })                  lines, repair, flags, printed page
//
// pdf.js runs in Node from pdfjs-dist/legacy (no worker, isEvalSupported:
// false, useSystemFonts: false). Items are grouped into lines by baseline
// (tolerance 0.35 × font height); columns are found with an x-coverage
// histogram (flag two_column); a line is right-to-left when its strong
// characters are mostly Arabic, and runs of digits / Latin inside it keep
// their left-to-right order; a space is inserted when the gap exceeds
// 0.25 × font size and the adjoining characters are not both joining Arabic
// letters (any gap above 0.8 × font size is a word break). An item whose own
// string is in visual order (a reversed run) is put in logical order before
// the line is assembled (flag reversed_fixed).
// ============================================================================

import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { excerpt80, isArabicLetter, isReversedLine, joinsNext, repairPage, reverseLine, scriptShares } from "./arabic-pdf.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const PDFJS_DIR = join(REPO_ROOT, "node_modules/pdfjs-dist");

let pdfjsPromise = null;
/** The pdf.js legacy build (Node). */
export function loadPdfjs() {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsPromise;
}

const DOC_OPTIONS = () => ({
  isEvalSupported: false,
  useSystemFonts: false,
  disableFontFace: true,
  verbosity: 0,
  cMapUrl: join(PDFJS_DIR, "cmaps") + "/",
  cMapPacked: true,
  standardFontDataUrl: join(PDFJS_DIR, "standard_fonts") + "/",
});

/** Open a local PDF (path or bytes). */
export async function openPdf({ path = null, data = null } = {}) {
  const pdfjs = await loadPdfjs();
  const bytes = data ? new Uint8Array(data) : new Uint8Array(readFileSync(path));
  return pdfjs.getDocument({ ...DOC_OPTIONS(), data: bytes }).promise;
}

/**
 * Open a remote PDF in range mode: pdf.js asks for byte ranges and
 * `fetchRange(begin, end)` (end exclusive) returns exactly those bytes — the
 * caller routes it through the shared fetch queue. Nothing else is fetched.
 * @returns {Promise<{ doc, stats: { ranges: [number, number][], bytes: number }, guard: (p) => Promise, close: () => Promise }>}
 */
export async function openRangePdf({ length, fetchRange, rangeChunkSize = 262144 }) {
  if (!Number.isInteger(length) || length <= 0) throw new Error("range mode needs the file length");
  const pdfjs = await loadPdfjs();
  const transport = new pdfjs.PDFDataRangeTransport(length, null);
  const stats = { ranges: [], bytes: 0 };
  let fail;
  const failed = new Promise((_, reject) => {
    fail = reject;
  });
  failed.catch(() => {});
  let failure = null;
  transport.requestDataRange = (begin, end) => {
    stats.ranges.push([begin, end]);
    Promise.resolve()
      .then(() => fetchRange(begin, end))
      .then((chunk) => {
        const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
        if (bytes.length !== end - begin) throw new Error(`range ${begin}-${end}: got ${bytes.length} bytes`);
        stats.bytes += bytes.length;
        transport.onDataRange(begin, bytes);
      })
      .catch((err) => {
        failure ??= err;
        fail(err);
      });
  };
  const task = pdfjs.getDocument({ ...DOC_OPTIONS(), range: transport, rangeChunkSize, disableAutoFetch: true, disableStream: true });
  const guard = (p) => Promise.race([p, failed]);
  let doc;
  try {
    doc = await guard(task.promise);
  } catch (e) {
    await task.destroy().catch(() => {});
    throw failure ?? e;
  }
  return { doc, stats, guard, close: () => task.destroy() };
}

const IMAGE_OPS = (OPS) => new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject, OPS.paintImageXObjectRepeat].filter((x) => x !== undefined));

/**
 * One page as slim items in viewport space (y top-down, baseline):
 * { pdf_page, width, height, items: [{ str, dir, x, y, w, size }], images }.
 * `images: false` skips the operator list (range mode: it would fetch image data).
 */
export async function readPage(doc, n, { images = true } = {}) {
  const pdfjs = await loadPdfjs();
  const page = await doc.getPage(n);
  try {
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent({ includeMarkedContent: false });
    const items = [];
    for (const it of tc.items) {
      if (typeof it.str !== "string" || !it.str.length) continue;
      const t = pdfjs.Util.transform(vp.transform, it.transform);
      const size = Math.hypot(t[2], t[3]) || it.height || 1;
      items.push({ str: it.str, dir: it.dir, x: round2(t[4]), y: round2(t[5]), w: round2(it.width), size: round2(size) });
    }
    let imageCount = null;
    if (images) {
      const ops = await page.getOperatorList();
      const set = IMAGE_OPS(pdfjs.OPS);
      imageCount = ops.fnArray.filter((f) => set.has(f)).length;
    }
    return { pdf_page: n, width: round2(vp.width), height: round2(vp.height), items, images: imageCount };
  } finally {
    page.cleanup();
  }
}

const round2 = (x) => Math.round(Number(x) * 100) / 100;

// ── items → lines ───────────────────────────────────────────────────────────
const LTRISH_RE = /[0-9٠-٩۰-۹A-Za-z]/;
const ARABIC_ANY = /[ء-يٱ-ۓ\uFB50-\uFDFF\uFE70-\uFEFC]/;

/** Accept slim items ({x, y, w, size}) or raw pdf.js items ({transform, width, height}). */
export function normalizeItem(it, pageHeight) {
  const str = String(it.str ?? "");
  if (it.transform) {
    const t = it.transform;
    const size = Math.hypot(t[2], t[3]) || it.height || 1;
    return { s: str, dir: it.dir, x0: t[4], x1: t[4] + (it.width || 0), y: pageHeight - t[5], size };
  }
  return { s: str, dir: it.dir, x0: it.x, x1: it.x + (it.w || 0), y: it.y, size: it.size || 1 };
}

const charClass = (s) => (ARABIC_ANY.test(s) ? "A" : LTRISH_RE.test(s) ? "L" : "N");
const isSpace = (s) => !s.trim();
const lastChar = (s) => [...s.normalize("NFKC")].pop() ?? "";
const firstChar = (s) => [...s.normalize("NFKC")][0] ?? "";

/**
 * Visual-order (reversed) runs: when the line's Arabic tokens say so (§4.2:
 * > 30 % start with ة/ى or end with an initial form), every Arabic item's
 * string is reversed; the items' x positions still give the word order.
 */
function unreverseItems(items) {
  const arabicItems = items.filter((i) => ARABIC_ANY.test(i.s));
  if (!arabicItems.length || !isReversedLine(arabicItems.map((i) => i.s).join(" "))) return items;
  return items.map((i) => (ARABIC_ANY.test(i.s) ? { ...i, s: reverseLine(i.s), reversed: true } : i));
}

function orderLine(rawItems) {
  const items = unreverseItems(rawItems);
  const arabic = items.reduce((n, i) => n + (i.s.match(/[ء-يٱ-ۓ\uFB50-\uFDFF\uFE70-\uFEFC]/g) || []).length, 0);
  const latin = items.reduce((n, i) => n + (i.s.match(/[A-Za-z]/g) || []).length, 0);
  const strong = items.filter((i) => i.s.trim());
  const rtlItems = strong.filter((i) => i.dir === "rtl").length;
  const rtl = arabic > latin || (arabic === latin && rtlItems > strong.length / 2 && arabic > 0);
  const sorted = [...items].sort((a, b) => (rtl ? b.x1 - a.x1 || b.x0 - a.x0 : a.x0 - b.x0 || a.x1 - b.x1));
  // Runs of the opposite direction (digits / Latin in RTL lines, Arabic in LTR
  // lines) keep their own order: reverse each such run of consecutive items.
  const other = rtl ? "L" : "A";
  const cls = sorted.map((i) => charClass(i.s));
  for (let i = 0; i < cls.length; i++) {
    if (cls[i] === "N" && i > 0 && i + 1 < cls.length && cls[i - 1] === other && cls[i + 1] === other) cls[i] = other;
  }
  const out = [];
  for (let i = 0; i < sorted.length; ) {
    if (cls[i] !== other) {
      out.push(sorted[i++]);
      continue;
    }
    let j = i;
    while (j < sorted.length && cls[j] === other) j++;
    const run = sorted.slice(i, j);
    // A lesson label typeset as separate digit / hyphen glyphs («1», «-», «2»)
    // is placed right-to-left by the book: its reading order is the RTL order.
    out.push(...(rtl && isRtlLabelRun(run) ? run : run.reverse()));
    i = j;
  }
  return { rtl, items: out };
}

const LABEL_PART_RE = /^\s*(?:[0-9٠-٩۰-۹]{1,2}|[-–])\s*$/;
/** Separate items «1» «-» «2» (each a 1–2 digit group or a hyphen, at least one of each kind). */
function isRtlLabelRun(run) {
  if (run.length < 3 || !run.every((i) => !i.s.trim() || LABEL_PART_RE.test(i.s))) return false;
  const parts = run.filter((i) => i.s.trim());
  return parts.some((i) => /[-–]/.test(i.s)) && parts.filter((i) => /[0-9٠-٩۰-۹]/.test(i.s)).length >= 2;
}

function joinItems(items) {
  let text = "";
  for (let k = 0; k < items.length; k++) {
    const b = items[k];
    if (isSpace(b.s)) {
      text += " ";
      continue;
    }
    if (k > 0 && !isSpace(items[k - 1].s)) {
      const a = items[k - 1];
      const size = Math.max(a.size, b.size);
      const gap = Math.max(b.x0 - a.x1, a.x0 - b.x1);
      const aEnds = /\s$/.test(a.s);
      const bStarts = /^\s/.test(b.s);
      if (!aEnds && !bStarts) {
        const joined = joinsNext(lastChar(a.s)) && isArabicLetter(firstChar(b.s));
        if (gap > 0.8 * size || (gap > 0.25 * size && !joined)) text += " ";
      }
    }
    text += b.s;
  }
  return text.replace(/\s+/g, " ").trim();
}

function groupBaselines(items) {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const lines = [];
  for (const it of sorted) {
    let best = null;
    for (let k = lines.length - 1; k >= 0 && k >= lines.length - 6; k--) {
      const l = lines[k];
      if (Math.abs(it.y - l.y) <= 0.35 * Math.max(it.size, l.size)) {
        best = l;
        break;
      }
    }
    if (best) {
      best.items.push(it);
      best.size = Math.max(best.size, it.size);
    } else lines.push({ y: it.y, size: it.size, items: [it] });
  }
  return lines;
}

/**
 * Column split from an x-coverage histogram: the widest near-empty vertical
 * band in the middle 30–70 % of the text extent, with ≥ 20 % of the text and
 * ≥ 3 baselines on each side. Returns the split x or null.
 */
export function detectColumns(items, width) {
  const text = items.filter((i) => i.s.trim() && i.x1 > i.x0);
  if (text.length < 10) return null;
  const xmin = Math.min(...text.map((i) => i.x0));
  const xmax = Math.max(...text.map((i) => i.x1));
  const extent = xmax - xmin;
  if (extent < 0.4 * width) return null;
  const BIN = 2;
  const bins = new Array(Math.ceil(extent / BIN) + 1).fill(0);
  for (const i of text) for (let b = Math.floor((i.x0 - xmin) / BIN); b < Math.ceil((i.x1 - xmin) / BIN); b++) bins[b]++;
  const allowance = Math.floor(text.length * 0.05);
  const lo = Math.floor((0.3 * extent) / BIN);
  const hi = Math.ceil((0.7 * extent) / BIN);
  let best = null;
  for (let b = lo; b <= hi; ) {
    if (bins[b] > allowance) {
      b++;
      continue;
    }
    let e = b;
    while (e + 1 <= hi && bins[e + 1] <= allowance) e++;
    if (!best || e - b > best[1] - best[0]) best = [b, e];
    b = e + 1;
  }
  if (!best || (best[1] - best[0] + 1) * BIN < Math.max(6, 0.012 * width)) return null;
  const split = xmin + ((best[0] + best[1] + 1) / 2) * BIN;
  const chars = (arr) => arr.reduce((n, i) => n + i.s.trim().length, 0);
  const left = text.filter((i) => i.x1 <= split);
  const right = text.filter((i) => i.x0 >= split);
  const total = chars(text);
  const baselines = (arr) => groupBaselines(arr).length;
  if (chars(left) < 0.2 * total || chars(right) < 0.2 * total) return null;
  if (baselines(left) < 3 || baselines(right) < 3) return null;
  // Justified single-column prose can leave a near-empty band by chance; a real
  // gutter is crossed by few lines (headings, full-width stems). More than
  // 40 % of the baselines running across the band means one column.
  const all = groupBaselines(text);
  const crossing = all.filter((l) => l.items.some((i) => i.x0 < split - 1 && i.x1 > split + 1)).length;
  if (crossing > 0.4 * all.length) return null;
  return round2(split);
}

function toLines(items) {
  return groupBaselines(items).filter((l) => l.items.some((i) => i.s.trim())).map((l) => {
    const { rtl, items: ordered } = orderLine(l.items);
    return {
      text: joinItems(ordered),
      reversed: ordered.some((i) => i.reversed),
      y: round2(l.y),
      size: round2(l.size),
      x0: round2(Math.min(...l.items.filter((i) => i.s.trim()).map((i) => i.x0))),
      x1: round2(Math.max(...l.items.filter((i) => i.s.trim()).map((i) => i.x1))),
      dir: rtl ? "rtl" : "ltr",
    };
  }).filter((l) => l.text);
}

/**
 * Items → reading-order lines. Two-column pages: full-width lines above the
 * columns, then the first column in reading order (right column on an
 * Arabic page), then the other column, then the remaining full-width lines.
 * @returns {{ lines: {text, y, size, x0, x1, dir, column}[], twoColumn: boolean, rtl: boolean }}
 */
export function buildLines(rawItems, { width = 600, height = 800 } = {}) {
  // Whitespace items are kept: they are the word separators of these PDFs.
  const items = rawItems.map((i) => normalizeItem(i, height)).filter((i) => i.s.length);
  const arabic = items.reduce((n, i) => n + (ARABIC_ANY.test(i.s) ? i.s.length : 0), 0);
  const latin = items.reduce((n, i) => n + ((i.s.match(/[A-Za-z]/g) || []).length), 0);
  const rtl = arabic >= latin;
  const split = detectColumns(items, width);
  if (split === null) return { lines: toLines(items).map((l) => ({ ...l, column: 0 })), twoColumn: false, rtl };
  const spanning = items.filter((i) => i.s.trim() && i.x0 < split - 1 && i.x1 > split + 1);
  const left = items.filter((i) => i.x1 <= split + 1 && !spanning.includes(i));
  const right = items.filter((i) => i.x0 >= split - 1 && !spanning.includes(i) && !left.includes(i));
  const [first, second] = rtl ? [right, left] : [left, right];
  const colTop = Math.min(...[...left, ...right].filter((i) => i.s.trim()).map((i) => i.y));
  const spanLines = toLines(spanning).map((l) => ({ ...l, column: 0 }));
  const lines = [
    ...spanLines.filter((l) => l.y < colTop),
    ...toLines(first).map((l) => ({ ...l, column: 1 })),
    ...toLines(second).map((l) => ({ ...l, column: 2 })),
    ...spanLines.filter((l) => l.y >= colTop),
  ];
  return { lines, twoColumn: true, rtl };
}

const LONE_NUMBER_RE = /^(?:[0-9]{1,4}|[\u0660-\u0669]{1,4}|[\u06F0-\u06F9]{1,4})$/;

/** A lone number of one digit system (1–4 digits), else null. Split or mixed digit groups are not guessed. */
export function parseLoneNumber(text) {
  const s = String(text ?? "").trim();
  if (!LONE_NUMBER_RE.test(s)) return null;
  const n = Number(s.replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x660)).replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 0x6f0)));
  return Number.isInteger(n) ? n : null;
}

/**
 * Printed page number: a lone number (one item, 1–4 digits of one digit
 * system) in the top or bottom 8 % of the page, separated
 * from any other text on its baseline by at least half a font size. One distinct value, else null.
 */
export function detectPrintedPage(rawItems, height) {
  const items = rawItems.map((i) => normalizeItem(i, height)).filter((i) => i.s.trim());
  const values = new Set();
  for (const it of items) {
    const inBand = it.y <= 0.08 * height + it.size || it.y >= 0.92 * height;
    if (!inBand) continue;
    const n = parseLoneNumber(it.s);
    if (n === null) continue;
    const crowded = items.some((o) => o !== it && Math.abs(o.y - it.y) <= 0.35 * Math.max(o.size, it.size) && Math.max(o.x0 - it.x1, it.x0 - o.x1) < 0.5 * it.size);
    if (!crowded) values.add(n);
  }
  return values.size === 1 ? [...values][0] : null;
}

/** Offset = mode of (pdf_page − printed_page) over pages with a number (ties: the smaller offset). */
export function pageOffset(pages) {
  const counts = new Map();
  for (const p of pages) {
    if (p.printed_page === null || p.printed_page === undefined) continue;
    const o = p.pdf_page - p.printed_page;
    counts.set(o, (counts.get(o) || 0) + 1);
  }
  let best = null;
  for (const [o, c] of counts) if (best === null || c > best[1] || (c === best[1] && o < best[0])) best = [o, c];
  return best ? best[0] : null;
}

function medianSize(lines) {
  const sizes = [];
  for (const l of lines) for (let k = 0; k < Math.min(l.text.length, 200); k++) sizes.push(l.size);
  if (!sizes.length) return 0;
  sizes.sort((a, b) => a - b);
  return sizes[Math.floor(sizes.length / 2)];
}

/** Up to 3 headings (≤ 80 chars): lines ≥ 1.25 × the median font size that are not bare numbers. */
export function pickHeadings(lines, texts = lines.map((l) => l.text)) {
  const median = medianSize(lines);
  const out = [];
  lines.forEach((l, k) => {
    const t = excerpt80(texts[k]);
    if (out.length >= 3 || !median || l.size < 1.25 * median) return;
    if (t.length < 2 || parseLoneNumber(t) !== null || !/[\p{L}]/u.test(t)) return;
    if (!out.includes(t)) out.push(t);
  });
  return out;
}

export const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");

/**
 * Analyze one page: lines, Arabic repair, flags, quality, printed page, headings, script shares.
 * @param {{ pdf_page, width, height, items, images }} page from readPage (or a fixture)
 * @param {{ lexicon?, language?: "ar"|"en" }} ctx
 */
export function analyzePage(page, { lexicon = null, language = "ar" } = {}) {
  const { lines, twoColumn } = buildLines(page.items || [], page);
  const hasTextLayer = (page.items || []).some((i) => String(i.str ?? "").trim());
  const rep = repairPage(lines.map((l) => l.text), {
    lexicon,
    language,
    images: page.images ?? 0,
    hasTextLayer,
    extraFlags: [...(twoColumn ? ["two_column"] : []), ...(lines.some((l) => l.reversed) ? ["reversed_fixed"] : [])],
  });
  const outLines = lines.map((l, k) => ({ ...l, text: rep.lines[k] }));
  return {
    pdf_page: page.pdf_page,
    raw: rep.raw,
    repaired: rep.repaired,
    normalized: rep.normalized,
    lines: outLines,
    flags: rep.flags,
    text_quality: rep.text_quality,
    char_count: rep.char_count,
    stats: rep.stats,
    printed_page: detectPrintedPage(page.items || [], page.height || 800),
    headings: pickHeadings(outLines),
    script: scriptShares(rep.repaired),
    has_text_layer: hasTextLayer,
    images: page.images ?? null,
    text_sha256: rep.char_count ? sha256(rep.repaired) : null,
  };
}

/** Raw reading-order text of one page (kept for pdf-frontmatter callers). */
export async function pageText(doc, n) {
  const page = await readPage(doc, n, { images: false });
  return buildLines(page.items, page).lines.map((l) => l.text).join("\n");
}
