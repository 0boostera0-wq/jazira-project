// ============================================================================
// Term evidence and term resolution (docs/CONTENT_ENGINE.md §2.4, §2.5, §4.2
// step 5). Pure functions; build-curriculum.mjs wires them to the data.
//
// Routes (method → best grade):
//   cover_text / title_page_text   strict regex on PDF pages 1–3     verified
//   toc_marker                      «الفصل الدراسي …» inside the TOC  verified (units)
//   vision                          counts only with reads ≥ 2        verified
//   listing_title                   the listing title names the term  inferred
//   plan_guide                      MoE plan-guide per-term table     inferred
//   course_code                     file-name course code, only when
//                                   the plan guide corroborates it    inferred
//   owner_decision                  owner-decisions.jsonl "part N =
//                                   term N" (shown as unconfirmed)    inferred
//
// Never evidence: part numbers by themselves, edition lines, «الفصل الثاني»
// without «الدراسي» (a chapter heading), and the `term_*` keys of
// book-frontmatter.jsonl (they are not read here at all).
// ============================================================================

import { normalizeTitle } from "../../../src/lib/content/normalize.js";
import { termEvidenceId } from "../../../src/lib/content/ids.js";
import { TERM_EVIDENCE_GRADE } from "../../../src/lib/content/enums.js";
import { compareC } from "../../../src/lib/content/prng.js";

export const VERIFIED_METHODS = Object.freeze(Object.keys(TERM_EVIDENCE_GRADE).filter((m) => TERM_EVIDENCE_GRADE[m] === "verified"));
export const INFERRED_METHODS = Object.freeze(Object.keys(TERM_EVIDENCE_GRADE).filter((m) => TERM_EVIDENCE_GRADE[m] === "inferred"));
/** Methods build-curriculum derives (pdf_page 0); page methods may also come from WP3. */
export const DERIVED_P0_METHODS = Object.freeze(["listing_title", "plan_guide", "course_code", "owner_decision"]);
const P0_PRIORITY = DERIVED_P0_METHODS;

const MAX_EXCERPT = 80;

// ── strict regex, word-token based so the excerpt is verbatim ─────────────
const W = (s) => normalizeTitle(s);
const AR_TERM = [W("الفصل"), W("الدراسي")];
const AR_ORD = new Map([
  [W("الأول"), "t1"],
  [W("الثاني"), "t2"],
  [W("الثالث"), "t3"],
]);
const EN_ORD = new Map([
  ["first", "t1"],
  ["second", "t2"],
  ["third", "t3"],
]);

// Words are split on whitespace AND on zero-width / bidi controls (a PDF text
// layer can glue «الفصل‌الدراسي» with a ZWNJ or an RLM); the matcher and the
// excerpt use the same split so word indexes line up.
const WORD_SPLIT = /[\s​-‏‪-‮⁦-⁩﻿]+/u;
const words = (text) => String(text ?? "").split(WORD_SPLIT);

function tokens(text) {
  const out = [];
  words(text).forEach((raw, i) => {
      if (!raw) return;
      for (const w of W(raw).split(" ")) if (w) out.push({ w, i });
    });
  return out;
}

function excerptAround(text, first, last) {
  const ws = words(text);
  let a = Math.max(0, first - 2);
  let b = Math.min(ws.length - 1, last + 2);
  let s = ws.slice(a, b + 1).join(" ").trim();
  while (s.length > MAX_EXCERPT && (a < first || b > last)) {
    if (b > last) b--;
    else a++;
    s = ws.slice(a, b + 1).join(" ").trim();
  }
  return s.length > MAX_EXCERPT ? s.slice(0, MAX_EXCERPT) : s;
}

/**
 * Every strict term statement in a text: «الفصل الدراسي الأول/الثاني/الثالث»
 * (after normalization and lam_order_fold, so «الفصل الدراسي األول» from a
 * damaged text layer matches) and "First/Second/Third Term|Semester".
 * «الفصل الثاني» alone is a chapter heading and never matches.
 * @returns {{ term: "t1"|"t2"|"t3", excerpt: string }[]}
 */
export function strictTermMatches(text) {
  const out = [];
  const toks = tokens(text);
  for (let k = 0; k + 2 < toks.length; k++) {
    if (toks[k].w !== AR_TERM[0] || toks[k + 1].w !== AR_TERM[1]) continue;
    const term = AR_ORD.get(toks[k + 2].w);
    if (term) out.push({ term, excerpt: excerptAround(text, toks[k].i, toks[k + 2].i) });
  }
  const ws = words(text);
  for (let k = 0; k + 1 < ws.length; k++) {
    const a = ws[k].toLowerCase().replace(/[^a-z]/g, "");
    const b = ws[k + 1].toLowerCase().replace(/[^a-z]/g, "");
    if (EN_ORD.has(a) && (b === "term" || b === "semester")) out.push({ term: EN_ORD.get(a), excerpt: excerptAround(text, k, k + 1) });
  }
  return out;
}

// ── evidence rows ─────────────────────────────────────────────────────────
function row({ resourceId, pdfPage, method, term, excerpt = null, reads = null, confidence, runId = null, at }) {
  return {
    schema: "term-evidence@1",
    id: termEvidenceId(resourceId, pdfPage, term),
    resource_id: resourceId,
    pdf_page: pdfPage,
    method,
    term,
    excerpt: excerpt === null ? null : String(excerpt).slice(0, MAX_EXCERPT),
    reads,
    confidence,
    run_id: runId,
    extracted_at: at,
  };
}

/**
 * Strict-regex re-derivation on PDF pages 1–3 (`pages`: [{ pdf_page, text,
 * run_id? }], repaired or raw text; the regex folds ligature order). Page 1 →
 * `cover_text`, pages 2–3 → `title_page_text`. A third-term statement is not
 * evidence (terms are t1/t2); it is returned in `thirdTerm` for the audit.
 */
export function evidenceFromPages(resourceId, pages, { at }) {
  const rows = [];
  const thirdTerm = [];
  for (const p of pages ?? []) {
    if (!(p?.pdf_page >= 1 && p.pdf_page <= 3)) continue;
    for (const m of strictTermMatches(p.text)) {
      if (m.term === "t3") {
        thirdTerm.push({ pdf_page: p.pdf_page, excerpt: m.excerpt });
        continue;
      }
      rows.push(
        row({ resourceId, pdfPage: p.pdf_page, method: p.pdf_page === 1 ? "cover_text" : "title_page_text", term: m.term, excerpt: m.excerpt, confidence: "high", runId: p.run_id ?? null, at }),
      );
    }
  }
  return { rows: dedupeById(rows), thirdTerm };
}

/** The listing title names the term → `listing_title` (inferred). */
export function evidenceFromListing(resourceId, title, { at }) {
  const hits = strictTermMatches(title).filter((m) => m.term !== "t3");
  return dedupeById(hits.map((m) => row({ resourceId, pdfPage: 0, method: "listing_title", term: m.term, excerpt: m.excerpt, confidence: "medium", at })));
}

/**
 * Owner decision "part N = term N" for the resource's subject (inferred, the
 * UI shows it as unconfirmed). Needs a resolved part; a resource without one
 * gets nothing from the decision.
 */
export function evidenceFromOwnerDecisions(resource, decisions) {
  const out = [];
  if (!resource.subject_node_id || !Number.isInteger(resource.part)) return out;
  for (const d of [...(decisions ?? [])].sort((a, b) => compareC(a.id, b.id))) {
    if (d.decision !== "part_equals_term" || !d.subject_node_ids?.includes(resource.subject_node_id)) continue;
    const term = d.mapping?.[String(resource.part)];
    if (!term) continue;
    out.push(row({ resourceId: resource.id, pdfPage: 0, method: "owner_decision", term, confidence: "medium", at: toDateTime(d.decided_at) }));
  }
  return dedupeById(out);
}

/**
 * Plan-guide per-term table for the subject (`terms`: ["t1"] | ["t2"] |
 * ["t1","t2"]), inferred. Absent from the 5th edition today; wired so a
 * recorded table is used without code changes.
 */
export function evidenceFromPlanGuide(resourceId, planTerms, { at }) {
  const term = termOfSet(new Set(planTerms ?? []));
  return term ? [row({ resourceId, pdfPage: 0, method: "plan_guide", term, confidence: "medium", at })] : [];
}

/** Course code of a secondary file name: `…-SM1-CHMI2.1.part.pdf` → "CHMI2.1". */
export function courseCode(path) {
  const m = /-SM\d-([A-Za-z]+\d+(?:\.\d+)?)(?:[-.]part\d?)?\.[a-z0-9]+$/i.exec(String(path ?? ""));
  return m ? m[1].toUpperCase() : null;
}

/** Course-code route: only when the plan guide corroborates the code (`courseTerms`: { CODE: term }). */
export function evidenceFromCourseCode(resourceId, path, courseTerms, { at }) {
  const code = courseCode(path);
  const term = code ? courseTerms?.[code] : null;
  return term ? [row({ resourceId, pdfPage: 0, method: "course_code", term, excerpt: code, confidence: "low", at })] : [];
}

/** Vision reads (WP3) of cover/TOC pages; a single read is kept but never counts. */
export const visionCounts = (ev) => ev.method !== "vision" || (Number.isInteger(ev.reads) && ev.reads >= 2);

/**
 * One row per id (the id is `te-<resource>-p<page>-<term>`): for page 0 the
 * stronger route wins (listing > plan guide > course code > owner decision);
 * otherwise the first row.
 */
export function dedupeById(rows) {
  const byId = new Map();
  for (const r of rows) {
    const prev = byId.get(r.id);
    if (!prev || (r.pdf_page === 0 && P0_PRIORITY.indexOf(r.method) < P0_PRIORITY.indexOf(prev.method))) byId.set(r.id, r);
  }
  return [...byId.values()].sort((a, b) => compareC(a.id, b.id));
}

// ── resolution ────────────────────────────────────────────────────────────
const SET_OF = { t1: ["t1"], t2: ["t2"], both: ["t1", "t2"] };
export const termSet = (term) => new Set(SET_OF[term] ?? []);
export function termOfSet(set) {
  if (set.has("t1") && set.has("t2")) return "both";
  if (set.has("t1")) return "t1";
  if (set.has("t2")) return "t2";
  return null;
}
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

/**
 * Resolve a resource's term from its evidence rows (§2.4 "Resolution per
 * resource"): verified = ≥ 1 verified-grade hit and no contradiction;
 * inferred = only inferred-grade hits and no contradiction; conflict →
 * needs_review. With no counting hit the resource is `needs_review` too
 * (§1.5 "Missing evidence gives term_status needs_review"; §2.4 "conflicting
 * hits or none = needs_review"), whether it is one book or split into parts.
 * `toc_marker` rows count at resource level only when both terms are marked
 * (a full-year book → "both"); single markers assign units
 * (build-curriculum). Part numbers are not an input: any option object passed
 * as the second argument is ignored.
 *
 * @param {object[]} evidence  term-evidence@1 rows of this resource
 * @returns {{ term, term_status, term_evidence: string[], basis: "evidence"|"owner_decision"|null, conflict: boolean }}
 */
export function resolveResourceTerm(evidence) {
  const rows = [...(evidence ?? [])].sort((a, b) => compareC(a.id, b.id));
  const markers = rows.filter((r) => r.method === "toc_marker");
  const markerTerms = new Set(markers.flatMap((r) => [...termSet(r.term)]));
  const hits = rows.filter((r) => r.method !== "toc_marker" && TERM_EVIDENCE_GRADE[r.method] && visionCounts(r));
  const units = [...hits.map((r) => ({ ids: [r.id], set: termSet(r.term), grade: TERM_EVIDENCE_GRADE[r.method], method: r.method }))];
  if (markerTerms.has("t1") && markerTerms.has("t2")) units.push({ ids: markers.map((r) => r.id), set: new Set(["t1", "t2"]), grade: "verified", method: "toc_marker" });
  if (!units.length) {
    return { term: null, term_status: "needs_review", term_evidence: [], basis: null, conflict: false };
  }
  const first = units[0].set;
  if (units.some((u) => !sameSet(u.set, first))) {
    return { term: null, term_status: "needs_review", term_evidence: [], basis: null, conflict: true };
  }
  const ids = [...new Set(units.flatMap((u) => u.ids))].sort(compareC);
  return {
    term: termOfSet(first),
    term_status: units.some((u) => u.grade === "verified") ? "verified" : "inferred",
    term_evidence: ids,
    basis: units.every((u) => u.method === "owner_decision") ? "owner_decision" : "evidence",
    conflict: false,
  };
}

/**
 * Subject-term membership (§2.5): a subject is in term t when ≥ 1 of its
 * units or book resources has t (or both) with verified/inferred status
 * (verified if any such hit is verified). It is `absent` from t only when it
 * has ≥ 1 book resource and ALL of them are verified for other terms.
 * Otherwise `needs_review`.
 *
 * @param {string} subjectNodeId
 * @param {{ term, term_status, term_evidence }[]} books   file resources (no question banks)
 * @param {{ term, term_status, term_evidence }[]} units
 */
export function subjectTermMembership(subjectNodeId, books, units = []) {
  const out = [];
  for (const t of ["t1", "t2"]) {
    const support = [...books, ...units].filter((x) => termSet(x.term).has(t) && (x.term_status === "verified" || x.term_status === "inferred"));
    let status;
    let evidence;
    if (support.length) {
      status = support.some((x) => x.term_status === "verified") ? "verified" : "inferred";
      evidence = support.filter((x) => (status === "verified" ? x.term_status === "verified" : true)).flatMap((x) => x.term_evidence ?? []);
    } else if (books.length && books.every((b) => b.term_status === "verified" && b.term && !termSet(b.term).has(t))) {
      status = "absent";
      evidence = books.flatMap((b) => b.term_evidence ?? []);
    } else {
      status = "needs_review";
      evidence = [];
    }
    out.push({ schema: "subject-term@1", subject_node_id: subjectNodeId, term: t, status, evidence: [...new Set(evidence)].sort(compareC).slice(0, 100) });
  }
  return out;
}

/**
 * Catalog terms from membership (§4.2 "Catalog correction"): a subject leaves
 * a term only when that membership is `absent` (verified); `terms_status` is
 * "verified" only when both memberships are verified or absent. Anything
 * else keeps both terms and "unverified".
 */
export function catalogTermsFromMembership(rows) {
  const by = new Map(rows.map((r) => [r.term, r]));
  const verifiedGrade = (r) => r && (r.status === "verified" || r.status === "absent");
  const terms = ["t1", "t2"].filter((t) => by.get(t)?.status !== "absent");
  const fully = ["t1", "t2"].every((t) => verifiedGrade(by.get(t)));
  if (!fully || !terms.length) return { terms: ["t1", "t2"], terms_status: "unverified", terms_evidence: [] };
  const evidence = [...new Set(["t1", "t2"].flatMap((t) => by.get(t).evidence))].sort(compareC);
  return { terms, terms_status: "verified", terms_evidence: evidence };
}

/** "2026-09-27" | ISO → "2026-09-27T00:00:00Z" style ISO without millis. */
export function toDateTime(value) {
  const s = String(value ?? "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00Z`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error(`bad date ${s}`);
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}
