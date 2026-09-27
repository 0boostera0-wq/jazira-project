// ============================================================================
// Table of contents (docs/CONTENT_ENGINE.md §2.6, §4.2 step 4).
//
//   detectTocPages(pages)                 TOC pages among the first 15 (heading or structure)
//   parseToc(tocPages)                    entries { level, title, printed_page, label, method }
//   alignToc(entries, { units, lessons }) trigram Jaccard on repaired, lam-folded titles
//                                          (≥ 0.6 match, 0.4–0.6 needs review; the score is kept)
//   lessonRanges(entries, { offset, pageCount })  printed/PDF page ranges
//   tocRecord(…)                          the committed toc@1 object (titles ≤ 80 chars)
//
// Page numbers are read only from unambiguous runs (one run of 1–4 digits of
// one digit system; a range "46 - 47" gives its start). Split or mixed digit
// groups («٤ 9», «144٦») give printed_page null — they are never guessed;
// vision reads fill them (§4.2).
// ============================================================================

import { normalizeTitle, trigramJaccard } from "../../../src/lib/content/normalize.js";
import { excerpt80 } from "./arabic-pdf.mjs";
import { findTermMarkers } from "./term-evidence.mjs";

const fold = (s) => normalizeTitle(s);
const DIGITS = "0-9\\u0660-\\u0669\\u06F0-\\u06F9";
const LEADER_RE = /\s*(?:[.·…‥_]{2,}|(?:\.\s){2,}\.?)\s*/g;
const HEADING_WORDS = ["المحتويات", "الفهرس", "فهرس المحتويات", "قائمة المحتويات", "contents", "table of contents"].map(fold);
const LABEL_RE = new RegExp(`^([${DIGITS}]{1,2})\\s*-\\s*([${DIGITS}]{1,2})(?=\\s|$)\\s*`);
const RUN_RE = new RegExp(`^(?:[0-9]{1,4}|[\\u0660-\\u0669]{1,4}|[\\u06F0-\\u06F9]{1,4})$`);
const digitValue = (s) => Number(String(s).replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x660)).replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 0x6f0)));

/** Is this line a TOC heading («المحتويات», «الفهرس», «فهرس المحتويات», "Contents")? */
export function isTocHeading(text) {
  const f = fold(text);
  if (!f || f.length > 40) return false;
  return HEADING_WORDS.some((h) => f === h || f.startsWith(h + " ") || f.endsWith(" " + h));
}

/**
 * Parse a page reference: one unambiguous run, or a range "a - b" (its start).
 * @returns {{ page: number|null, ambiguous: boolean }}
 */
export function parsePageRef(text) {
  const s = String(text ?? "").trim();
  if (!s) return { page: null, ambiguous: false };
  const parts = s.split(/\s*-\s*/);
  if (parts.length <= 2 && parts.every((p) => RUN_RE.test(p))) {
    const values = parts.map(digitValue);
    return { page: Math.min(...values), ambiguous: false };
  }
  return { page: null, ambiguous: true };
}

const TAIL_RE = new RegExp(`^(.*?[^\\s${DIGITS}-])\\s*((?:[${DIGITS}]+\\s*)+(?:-\\s*(?:[${DIGITS}]+\\s*)+)?)$`);
const MARKER_WORDS = new Set(["الوحدة", "وحدة", "الفصل", "الدرس", "unit", "chapter", "lesson"].map(fold));
const HEAD_RE = new RegExp(`^((?:[${DIGITS}]+\\s*)+)\\s+(.*[^\\s${DIGITS}].*)$`);

/**
 * Parse one TOC line (reading order). Returns null for lines without a title.
 * { title, printed_page, ambiguous_page, label ("1-2"), number (a heading's leading number), leader }
 */
export function parseTocLine(text) {
  let s = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!s) return null;
  const leader = LEADER_RE.test(s);
  LEADER_RE.lastIndex = 0;
  s = s.replace(LEADER_RE, " \u0001 ").replace(/\s+/g, " ").trim();
  let title = s;
  let pageText = "";
  let number = null;
  if (s.includes("\u0001")) {
    const [before, ...after] = s.split("\u0001");
    const rest = after.join(" ").trim();
    const b = before.trim();
    if (rest && !/[^\s\d\u0660-\u0669\u06F0-\u06F9-]/.test(rest) && b) {
      title = b; // <title> …… <page>
      pageText = rest;
    } else if (b && !/[^\s\d\u0660-\u0669\u06F0-\u06F9-]/.test(b) && rest && !LABEL_RE.test(b + " ")) {
      title = rest; // <page> …… <title>
      pageText = b;
    } else {
      title = (b + " " + rest).trim();
    }
  } else {
    // No leader: <title> <page>. A leading number without a leader is a
    // unit / chapter number («1 الجبر والدوال»), not a page.
    const m = TAIL_RE.exec(s);
    if (m) {
      title = m[1];
      pageText = m[2];
    } else {
      const h = HEAD_RE.exec(s);
      if (h && !LABEL_RE.test(s)) {
        number = parsePageRef(h[1]).page;
        title = h[2];
      }
    }
  }
  title = title.replace(/\u0001/g, " ").replace(/\s+/g, " ").trim();
  let label = null;
  const lm = LABEL_RE.exec(title);
  if (lm) {
    label = `${lm[1]}-${lm[2]}`;
    title = title.slice(lm[0].length).trim();
  }
  title = title.replace(/^[\s:\-–|]+|[\s:\-–|]+$/g, "");
  if (!/[\p{L}]/u.test(title)) {
    if (label) return { title: "", printed_page: parsePageRef(pageText).page, ambiguous_page: false, label, number, leader };
    return null;
  }
  const ref = parsePageRef(pageText);
  if (!leader && MARKER_WORDS.has(fold(title))) {
    // «الوحدة 3» without a leader: the number names the unit, it is not a page.
    return { title: `${title} ${pageText}`.trim(), printed_page: null, ambiguous_page: false, label, number: ref.page, leader };
  }
  return { title, printed_page: ref.page, ambiguous_page: ref.ambiguous, label, number, leader };
}

/** Level of an entry from markers, then font size. */
export function entryLevel(entry, { size = 0, median = 0 } = {}) {
  const f = fold(entry.title);
  const starts = (w) => f === fold(w) || f.startsWith(fold(w) + " ");
  if (starts("الوحدة") || starts("وحدة") || /^unit\b/.test(f)) return "unit";
  if ((starts("الفصل") || /^chapter\b/.test(f)) && !starts("الفصل الدراسي")) return "chapter";
  if (entry.label || starts("الدرس") || starts("درس") || /^lesson\b/.test(f)) return "lesson";
  if (median && size >= 1.25 * median && entry.printed_page === null) return "unit";
  return "other";
}

function medianOf(values) {
  if (!values.length) return 0;
  const v = [...values].sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
}

/** Lines that look like TOC entries (a leader, or a title followed by a page number). */
export function tocLineCount(lines) {
  let n = 0;
  for (const l of lines) {
    const e = parseTocLine(typeof l === "string" ? l : l.text);
    if (e && e.title && (e.leader || e.printed_page !== null)) n++;
  }
  return n;
}

/**
 * TOC pages among the first 15 analyzed pages: a heading in the first lines,
 * or ≥ 6 entry-like lines making ≥ 40 % of the page; continuation pages that
 * directly follow with ≥ 5 entry-like lines are included.
 * @param {{ pdf_page, lines: {text}[] }[]} pages
 */
export function detectTocPages(pages, { window = 15 } = {}) {
  const first = pages.filter((p) => p.pdf_page <= window).sort((a, b) => a.pdf_page - b.pdf_page);
  const out = [];
  for (const p of first) {
    const lines = p.lines || [];
    const heading = lines.slice(0, 6).some((l) => isTocHeading(l.text));
    const n = tocLineCount(lines);
    const prevIsToc = out.includes(p.pdf_page - 1);
    if (heading || (n >= 6 && n >= 0.4 * lines.length) || (prevIsToc && n >= 5)) out.push(p.pdf_page);
  }
  return out;
}

/**
 * Parse the TOC pages into ordered entries. A label-only line («7-2») is
 * joined to the next line; a term marker line («الفصل الدراسي الثاني») is kept
 * as a level "other" entry (it bounds the units of each term) and returned
 * in `markers`.
 * @param {{ pdf_page, lines: {text, size?}[], method?: "text"|"vision" }[]} tocPages
 * @returns {{ entries: object[], markers: { pdf_page, term, text }[] }}
 */
export function parseToc(tocPages) {
  const entries = [];
  const markers = [];
  for (const page of [...tocPages].sort((a, b) => a.pdf_page - b.pdf_page)) {
    const method = page.method === "vision" ? "vision" : "text";
    const lines = (page.lines || []).map((l) => (typeof l === "string" ? { text: l, size: 0 } : l));
    const median = medianOf(lines.map((l) => l.size || 0).filter(Boolean));
    let pendingLabel = null;
    for (const line of lines) {
      if (isTocHeading(line.text)) continue;
      const terms = findTermMarkers(line.text);
      if (terms.length) {
        for (const t of terms) markers.push({ pdf_page: page.pdf_page, term: t.term, text: t.excerpt });
        entries.push({ level: "other", title: excerpt80(line.text), printed_page: null, label: null, method, pdf_page_of_toc: page.pdf_page, marker: terms[0].term });
        continue;
      }
      const e = parseTocLine(line.text);
      if (!e) continue;
      if (!e.title) {
        pendingLabel = e.label;
        continue;
      }
      if (!e.label && pendingLabel) e.label = pendingLabel;
      pendingLabel = null;
      const level = entryLevel(e, { size: line.size || 0, median });
      entries.push({ level, title: excerpt80(e.title), printed_page: e.printed_page, label: e.label, method, pdf_page_of_toc: page.pdf_page, ambiguous_page: e.ambiguous_page });
    }
  }
  return { entries, markers };
}

/**
 * Align entries to iEN nodes (trigram Jaccard on normalizeTitle, which
 * includes lam_order_fold). Lessons are matched inside the current unit
 * first, then among all unmatched lessons. Scores ≥ 0.4 keep the node id
 * (0.4–0.6 = needs review: consumers check `match_score`).
 * @param {object[]} entries from parseToc
 * @param {{ units: {id, title}[], lessons: {id, title, unit_id}[] }} nodes
 */
export function alignToc(entries, { units = [], lessons = [] } = {}) {
  const used = new Set();
  let currentUnit = null;
  const best = (title, cands) => {
    let top = null;
    for (const c of cands) {
      if (used.has(c.id)) continue;
      const score = trigramJaccard(title, c.title);
      if (!top || score > top.score) top = { id: c.id, score };
    }
    return top;
  };
  return entries.map((e) => {
    if (e.marker) return { ...e, matched_node_id: null, match_score: null };
    let m = null;
    if (e.level === "unit" || e.level === "chapter") {
      m = best(e.title, units);
      if (m && m.score >= 0.6) currentUnit = m.id;
    } else {
      const inUnit = currentUnit ? lessons.filter((l) => l.unit_id === currentUnit) : [];
      m = best(e.title, inUnit);
      if (!m || m.score < 0.6) {
        const all = best(e.title, lessons);
        if (all && (!m || all.score > m.score)) m = all;
      }
      if (e.level === "other" && (!m || m.score < 0.6)) {
        const u = best(e.title, units);
        if (u && u.score >= 0.6 && (!m || u.score > m.score)) {
          m = u;
          currentUnit = u.id;
        }
      }
    }
    if (!m) return { ...e, matched_node_id: null, match_score: null };
    const score = Math.round(m.score * 100) / 100;
    if (score >= 0.6) used.add(m.id);
    return { ...e, matched_node_id: score >= 0.4 ? m.id : null, match_score: score };
  });
}

/**
 * Page ranges: each entry with a printed page runs to the next entry's start
 * − 1 (same start → one page); the last runs to `lastPrinted` (the unit's
 * end or the back matter, default: the last page). Unit/chapter ranges run to
 * the next unit/chapter start − 1. PDF pages = printed + offset.
 */
export function lessonRanges(entries, { offset = null, pageCount = null, lastPrinted = null } = {}) {
  const withPages = entries.filter((e) => Number.isInteger(e.printed_page));
  const end = lastPrinted ?? (pageCount !== null && offset !== null ? pageCount - offset : null);
  const toPdf = (p) => (p === null || offset === null ? null : p + offset);
  const out = [];
  withPages.forEach((e, i) => {
    let stop = end;
    const isGroup = e.level === "unit" || e.level === "chapter";
    for (let k = i + 1; k < withPages.length; k++) {
      const n = withPages[k];
      if (isGroup && !(n.level === "unit" || (e.level === "chapter" && n.level === "chapter"))) continue;
      if (n.printed_page > e.printed_page) {
        stop = n.printed_page - 1;
        break;
      }
      if (!isGroup && n.printed_page === e.printed_page) {
        stop = e.printed_page;
        break;
      }
    }
    if (stop !== null && stop < e.printed_page) stop = e.printed_page;
    out.push({
      node_id: e.matched_node_id ?? null,
      level: e.level,
      title: e.title,
      match_score: e.match_score ?? null,
      printed_start: e.printed_page,
      printed_end: stop,
      pdf_start: toPdf(e.printed_page),
      pdf_end: toPdf(stop),
    });
  });
  return out;
}

/** TOC status: found (≥ 3 entries, ≥ 60 % with pages), partial (some entries), not_found. */
export function tocStatus(entries) {
  const real = entries.filter((e) => !e.marker);
  if (!real.length) return "not_found";
  const paged = real.filter((e) => Number.isInteger(e.printed_page)).length;
  return real.length >= 3 && paged / real.length >= 0.6 ? "found" : "partial";
}

/** The committed toc@1 record (titles ≤ 80 chars, no body text). */
export function tocRecord({ resource_id, entries, tocPages, offset, run_id = null }) {
  return {
    schema: "toc@1",
    resource_id,
    toc_status: tocStatus(entries),
    toc_pages: [...new Set(tocPages)].sort((a, b) => a - b).slice(0, 20),
    page_offset: Number.isInteger(offset) ? offset : null,
    run_id,
    entries: entries.slice(0, 2000).map((e) => ({
      level: e.level,
      title: excerpt80(e.title),
      printed_page: Number.isInteger(e.printed_page) ? e.printed_page : null,
      pdf_page: Number.isInteger(e.printed_page) && Number.isInteger(offset) && e.printed_page + offset >= 1 ? e.printed_page + offset : null,
      matched_node_id: e.matched_node_id ?? null,
      match_score: e.match_score ?? null,
      method: e.method === "vision" ? "vision" : "text",
    })),
  };
}
