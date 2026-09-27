// ============================================================================
// Term evidence from the books themselves (docs/CONTENT_ENGINE.md §2.4, §4.2
// step 5). Strict routes only:
//
//   cover_text / title_page_text   PDF pages 1–3 (page 1 = cover), repaired text
//   toc_marker                     «الفصل الدراسي …» inside a trusted TOC page
//   vision                         cover/TOC transcripts; counts only when two
//                                  independent reads agree (reads ≥ 2)
//   listing_title                  the iEN listing title names the term (inferred)
//
// The strict regex is الفصل\s+الدراسي\s+(الأول|الثاني|الثالث) (on repaired,
// normalized, lam-folded text) and (First|Second) (Term|Semester). «الفصل
// الدراسي الأول والثاني» (or «/ الثاني», "First and Second Semester") names
// both terms: it gives `both`, never t1. «الفصل
// الثاني» without «الدراسي» is a chapter heading and never matches. Part
// numbers («الجزء الأول») and edition lines are never term evidence. A
// third-term match is not evidence either: it is returned as an anomaly
// (needs_review, possibly an older edition). Plan guide, course code and owner
// decisions are resolved by WP2 (scripts/content/lib/term-resolve.mjs).
// ============================================================================

import { normalizeTitle } from "../../../src/lib/content/normalize.js";
import { termEvidenceId } from "../../../src/lib/content/ids.js";
import { excerpt80 } from "./arabic-pdf.mjs";

const fold = (s) => normalizeTitle(s);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const phrase = (words) => new RegExp(`(?:^|\\s)${words.map((w) => esc(fold(w))).join("\\s+")}(?=\\s|$)`);

const words = (list) => list.map((w) => esc(fold(w))).join("\\s+");
// «… الأول والثاني», «… الأول / الثاني»: one book for both terms. Such a line
// is `both` evidence and never t1 (the t1 phrase alone would read it as term 1).
const SECOND = `(?:${["الثاني", "الثاين", "والثاني", "والثاين"].map((w) => esc(fold(w))).join("|")}|و\\s+(?:${esc(fold("الثاني"))}|${esc(fold("الثاين"))}))`;
const AND_SECOND = `\\s*(?:[/\\\\–-]\\s*)?${SECOND}(?=\\s|$)`;
const FIRST_OF = (list) => new RegExp(`(?:^|\\s)${words(list)}${AND_SECOND}`);
const ARABIC_TERMS = [
  ["both", FIRST_OF(["الفصل", "الدراسي", "الأول"])],
  ["both", FIRST_OF(["الفصلين", "الدراسيين", "الأول"])],
  ["both", FIRST_OF(["الفصلان", "الدراسيان", "الأول"])],
  ["t1", new RegExp(`(?:^|\\s)${words(["الفصل", "الدراسي", "الأول"])}(?=\\s|$)(?!${AND_SECOND})`)],
  ["t2", phrase(["الفصل", "الدراسي", "الثاني"])],
  // «الثاين»: the text layer's final ya/nun swap of «الثاني» (observed on covers and TOCs)
  ["t2", phrase(["الفصل", "الدراسي", "الثاين"])],
  ["t3", phrase(["الفصل", "الدراسي", "الثالث"])],
];
const ENGLISH_BOTH = /\b(?:first\s+(?:and|&)\s+second|1st\s*(?:and|&)\s*2nd)\s+(?:terms?|semesters?)\b/i;
const ENGLISH_TERM = /\b(first|second|third)\s+(term|semester)\b/i;
const ENGLISH_MAP = { first: "t1", second: "t2", third: "t3" };

/** Excerpt (≤ 80 chars) of a line around «فصل» / "term". */
function around(line) {
  const s = String(line).replace(/\s+/g, " ").trim();
  if (s.length <= 80) return s;
  const i = Math.max(s.search(/فصل|term|semester/i), 0);
  return excerpt80(s.slice(Math.max(0, i - 12)));
}

/**
 * Term markers in a text (line by line).
 * @returns {{ term: "t1"|"t2"|"t3", line: number, excerpt: string }[]}
 */
export function findTermMarkers(text) {
  const out = [];
  String(text ?? "").split(/\r?\n/).forEach((line, i) => {
    const f = fold(line);
    for (const [term, re] of ARABIC_TERMS) if (re.test(f)) out.push({ term, line: i, excerpt: around(line) });
    if (ENGLISH_BOTH.test(line)) out.push({ term: "both", line: i, excerpt: around(line) });
    else {
      const m = ENGLISH_TERM.exec(line);
      if (m) out.push({ term: ENGLISH_MAP[m[1].toLowerCase()], line: i, excerpt: around(line) });
    }
  });
  const seen = new Set();
  return out.filter((m) => (seen.has(m.term) ? false : seen.add(m.term)));
}

const row = ({ resource_id, pdf_page, method, term, excerpt, reads = null, confidence, run_id = null, extracted_at }) => ({
  schema: "term-evidence@1",
  id: termEvidenceId(resource_id, pdf_page, term),
  resource_id,
  pdf_page,
  method,
  term,
  excerpt: excerpt === null || excerpt === undefined ? null : excerpt80(excerpt),
  reads,
  confidence,
  run_id,
  extracted_at,
});

/**
 * Evidence from one page's repaired text. Pages 1–3 only for cover/title
 * routes (page 1 = cover_text, 2–3 = title_page_text); `toc` pages give
 * toc_marker. Untrusted text gives nothing (it goes to vision).
 * @returns {{ rows: object[], anomalies: object[] }}
 */
export function pageTermEvidence({ resource_id, pdf_page, text, text_quality = "ok", toc = false, run_id = null, extracted_at }) {
  const rows = [];
  const anomalies = [];
  if (text_quality === "untrusted") return { rows, anomalies };
  let method = null;
  if (toc) method = "toc_marker";
  else if (pdf_page === 1) method = "cover_text";
  else if (pdf_page >= 2 && pdf_page <= 3) method = "title_page_text";
  if (!method) return { rows, anomalies };
  for (const m of findTermMarkers(text)) {
    if (m.term === "t3") anomalies.push({ code: "third_term_marker", pdf_page, method, excerpt: m.excerpt });
    else rows.push(row({ resource_id, pdf_page, method, term: m.term, excerpt: m.excerpt, confidence: "high", run_id, extracted_at }));
  }
  return { rows, anomalies };
}

/** The iEN listing title names the term (inferred grade, pdf_page 0). Part numbers never count. */
export function listingTitleEvidence({ resource_id, title, run_id = null, extracted_at }) {
  const rows = [];
  const anomalies = [];
  for (const m of findTermMarkers(title)) {
    if (m.term === "t3") anomalies.push({ code: "third_term_marker", pdf_page: 0, method: "listing_title", excerpt: m.excerpt });
    else rows.push(row({ resource_id, pdf_page: 0, method: "listing_title", term: m.term, excerpt: m.excerpt, confidence: "medium", run_id, extracted_at }));
  }
  return { rows, anomalies };
}

/**
 * Vision reads of a cover or TOC page: evidence only when at least two
 * independent reads find the same (non-empty) set of terms.
 * @param {{ resource_id, pdf_page, reads: string[], run_id, extracted_at }} o
 * @returns {{ status: "agreed"|"disagreed"|"insufficient"|"none", rows: object[], anomalies: object[] }}
 */
export function visionTermEvidence({ resource_id, pdf_page, reads, run_id = null, extracted_at }) {
  const sets = reads.map((t) => findTermMarkers(t));
  const keys = sets.map((s) => s.map((m) => m.term).sort().join(","));
  if (!keys.some(Boolean)) return { status: reads.length >= 2 ? "none" : "insufficient", rows: [], anomalies: [] };
  if (reads.length < 2) return { status: "insufficient", rows: [], anomalies: [] };
  const counts = new Map();
  for (const k of keys) counts.set(k, (counts.get(k) || 0) + 1);
  const [topKey, topCount] = [...counts].sort((a, b) => b[1] - a[1])[0];
  if (!topKey || topCount < 2 || counts.size > 1) {
    return { status: "disagreed", rows: [], anomalies: [{ code: "vision_term_disagreement", pdf_page, method: "vision", excerpt: keys.join(" | ") }] };
  }
  const rows = [];
  const anomalies = [];
  const first = sets[keys.indexOf(topKey)];
  for (const m of first) {
    if (m.term === "t3") anomalies.push({ code: "third_term_marker", pdf_page, method: "vision", excerpt: m.excerpt });
    else rows.push(row({ resource_id, pdf_page, method: "vision", term: m.term, excerpt: m.excerpt, reads: topCount, confidence: "high", run_id, extracted_at }));
  }
  return { status: "agreed", rows, anomalies };
}

/** Methods this package derives from the book (replaced on each extraction of a resource). */
export const EXTRACTED_METHODS = Object.freeze(["cover_text", "title_page_text", "toc_marker", "listing_title", "vision"]);

/**
 * Merge fresh rows for some resources into the existing term-evidence rows:
 * rows of those resources with an extracted method are replaced; other
 * methods (plan guide, course code, owner decision) are kept. One row per id:
 * a vision row wins over a text row on the same page and term (vision is
 * the source of truth on pages it read). Sorted by id.
 */
export function mergeTermEvidence(existing, fresh, resourceIds) {
  const ids = new Set(resourceIds);
  const before = new Map(existing.map((r) => [r.id, r]));
  const keep = existing.filter((r) => !(ids.has(r.resource_id) && EXTRACTED_METHODS.includes(r.method)));
  const byId = new Map(keep.map((r) => [r.id, r]));
  for (const r of fresh) {
    const prev = byId.get(r.id);
    if (!prev || r.method === "vision" || (EXTRACTED_METHODS.includes(prev.method) && prev.method !== "vision")) byId.set(r.id, stableProvenance(before.get(r.id), r));
  }
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const canonical = (v) => JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));

/**
 * Byte-stable reruns (§3): when a rebuilt record equals the previous one in
 * everything but its run provenance (`run_id`, `extracted_at`), the previous
 * provenance is kept, so a rerun without changes produces no diff.
 */
export function stableProvenance(prev, next, keys = ["run_id", "extracted_at"]) {
  if (!prev || !next) return next;
  const strip = (o) => canonical(Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k) && o[k] !== undefined)));
  if (strip(prev) !== strip(next)) return next;
  const out = { ...next };
  for (const k of keys) if (k in prev) out[k] = prev[k];
  return out;
}
