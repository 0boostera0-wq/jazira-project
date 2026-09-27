// ============================================================================
// Part number and edition year of an iEN resource (docs/CONTENT_ENGINE.md §2.4).
//
//   partEvidence({ title, path, frontmatter }) → { listing, cover, file_name, … }
//   resolvePart(evidence)                      → { part, part_evidence, issues }
//   yearEvidence({ path, frontmatter })        → { cover, file_name, … }
//   resolveYear(evidence)                      → { year_label, year_evidence, issues }
//
// Source of truth for `part` is the listing title or the cover («الجزء
// الأول/الثاني»); the file name (`-part2`, `-PART2.PDF`, `.part.pdf`) is only a
// cross-check. `year_label` is the cover edition line («طبعة 1448») when
// present, else the file name. Missing, conflicting or anomalous values are
// kept verbatim and reported as issues (→ `needs_review`); nothing is guessed.
// Part numbers are NEVER term evidence (term-resolve.mjs does not read them).
// ============================================================================

import { normalizeTitle } from "../../../src/lib/content/normalize.js";

const W = (s) => normalizeTitle(s);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const ORDINALS = [
  [W("الأول"), 1],
  [W("الثاني"), 2],
  [W("الثالث"), 3],
];
const ORDINAL_OF = new Map(ORDINALS);
// «الجزء الثالث عشر» (13th) is not part 3: an ordinal followed by «عشر» never matches.
const PART_RE = new RegExp(`(?:^|\\s)${esc(W("الجزء"))}\\s+(${ORDINALS.map(([w]) => esc(w)).join("|")}|[1-9])(?=\\s|$)(?!\\s+${esc(W("عشر"))}(?:\\s|$))`, "u");
const PART_EN_RE = /\bpart\s*(one|two|three|[1-9])\b/i;
const EN_ORD = { one: 1, two: 2, three: 3 };

/** Part number stated in a text («الجزء الأول / الثاني», "Part 2"), or null. */
export function partFromText(text) {
  const t = W(text);
  const m = PART_RE.exec(t);
  if (m) return ORDINAL_OF.get(m[1]) ?? Number(m[1]);
  const e = PART_EN_RE.exec(String(text ?? ""));
  if (e) return EN_ORD[e[1].toLowerCase()] ?? Number(e[1]);
  return null;
}

/**
 * Part marker in an iEN file name: `…-part1.pdf`, `…-PART2.PDF` → 1 / 2;
 * `….part.pdf` / `….PART.pdf` → `{ number: null, marker: true }` (a part,
 * number not stated); `…-math.pdf` → no marker.
 */
export function partFromFileName(path) {
  const name = String(path ?? "");
  const numbered = /[-_.]part[-_ ]?([1-9])(?=\.[a-z0-9]+$)/i.exec(name);
  if (numbered) return { number: Number(numbered[1]), marker: true };
  if (/[-_.]part\.[a-z0-9]+$/i.test(name)) return { number: null, marker: true };
  return { number: null, marker: false };
}

/** Edition year at the start of an iEN file name (`1448-GE-…` → "1448"), or null. */
export function yearFromFileName(path) {
  const m = /^(\d{4})-/.exec(String(path ?? ""));
  return m ? m[1] : null;
}

const frontEvidence = (fm) =>
  Object.entries(fm?.evidence ?? {})
    .filter(([key, v]) => !key.startsWith("term_") && v && typeof v === "object")
    .map(([key, v]) => ({ key, page: Number(v.page) || null, snippet: String(v.snippet ?? "") }))
    .sort((a, b) => (a.page ?? 99) - (b.page ?? 99) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

/**
 * Cover-side values from a book-frontmatter@1 row. Keys `part_N` / `year_NNNN`
 * (the front-matter detector) are read first; the snippets are parsed only
 * when no key exists. The `term_*` keys are never read. The lowest page wins;
 * distinct values on different pages are a conflict.
 */
function coverValues(fm, kind) {
  // Cover and title pages only (PDF pages 1–3): later pages (introductions,
  // cataloguing data of a full-year book) describe the course, not this file.
  const ev = frontEvidence(fm).filter((e) => e.page !== null && e.page <= COVER_PAGES);
  const keyRe = kind === "part" ? /^part_([1-9])$/ : /^year_(\d{4})$/;
  let hits = ev.filter((e) => keyRe.test(e.key)).map((e) => ({ page: e.page, value: kind === "part" ? Number(keyRe.exec(e.key)[1]) : keyRe.exec(e.key)[1] }));
  if (!hits.length) {
    for (const e of ev) {
      const value = kind === "part" ? partFromText(e.snippet) : editionYearFromText(e.snippet);
      if (value !== null) hits.push({ page: e.page, value });
    }
  }
  hits = hits.sort((a, b) => a.page - b.page);
  if (!hits.length) return { value: null, conflict: false };
  // The lowest page is the cover statement; a different value on the SAME page is a conflict.
  const first = hits.filter((h) => h.page === hits[0].page);
  return { value: first[0].value, conflict: new Set(first.map((h) => h.value)).size > 1 };
}
const COVER_PAGES = 3;

const EDITION_RE = new RegExp(`${esc(W("طبعة"))}\\s*(1[34]\\d\\d)(?!\\d)`, "u");

/** «طبعة 1448» (either digit set) → "1448"; only unambiguous 4-digit runs. */
export function editionYearFromText(text) {
  const m = EDITION_RE.exec(W(text));
  return m ? m[1] : null;
}

/** Collect the part evidence of one resource. */
export function partEvidence({ title, path, frontmatter = null }) {
  const cover = coverValues(frontmatter, "part");
  const file = partFromFileName(path);
  return { listing: partFromText(title), cover: cover.value, cover_conflict: cover.conflict, file_name: file.number, file_marker: file.marker };
}

/**
 * Resolve `part` (§2.4): listing, then cover; the file name only cross-checks.
 * @returns {{ part: number|null, part_evidence: {listing, cover, file_name}, issues: string[] }}
 */
export function resolvePart(ev) {
  const issues = [];
  let part = ev.listing ?? ev.cover ?? null;
  if (ev.cover_conflict) issues.push("part_cover_conflict");
  if (ev.listing !== null && ev.cover !== null && ev.listing !== ev.cover) {
    issues.push("part_listing_cover_conflict");
    part = null;
  }
  if (part !== null && ev.file_name !== null && ev.file_name !== part) issues.push("part_file_name_conflict");
  if (ev.listing === null && ev.cover === null && (ev.file_name !== null || ev.file_marker)) issues.push("part_missing");
  return { part, part_evidence: { listing: ev.listing, cover: ev.cover, file_name: ev.file_name }, issues };
}

export const YEAR_RANGE = Object.freeze([1440, 1460]);
const anomalous = (y) => y !== null && (Number(y) < YEAR_RANGE[0] || Number(y) > YEAR_RANGE[1]);

/** Collect the edition-year evidence of one resource. */
export function yearEvidence({ path, frontmatter = null }) {
  const cover = coverValues(frontmatter, "year");
  return { cover: cover.value, cover_conflict: cover.conflict, file_name: yearFromFileName(path) };
}

/**
 * Resolve `year_label` (§2.4): cover edition line, else the file name. Both
 * are recorded; a mismatch, a conflict between cover pages or an anomaly
 * (outside 1440–1460, e.g. "1488") is an issue, never corrected.
 * @returns {{ year_label: string|null, year_evidence: {cover, file_name}, issues: string[] }}
 */
export function resolveYear(ev) {
  const issues = [];
  if (ev.cover_conflict) issues.push("year_cover_conflict");
  if (ev.cover !== null && ev.file_name !== null && ev.cover !== ev.file_name) issues.push("year_mismatch");
  if (anomalous(ev.file_name) || anomalous(ev.cover)) issues.push("year_anomaly");
  return { year_label: ev.cover ?? ev.file_name ?? null, year_evidence: { cover: ev.cover, file_name: ev.file_name }, issues };
}
