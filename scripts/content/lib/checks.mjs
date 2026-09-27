// ============================================================================
// Stage 1 deterministic checks (docs/CONTENT_ENGINE.md §4.4, Appendix B).
//
//   runChecks(question, ctx) → { checks: [{code, result, detail}], verdict,
//                                outcome: "pass" | "reject" | "review", review: [codes] }
//   applyO004(question)      → { changed, reason } (sets fixed_order_reason and
//                                shuffle_options=false in place when a pattern matches)
//   isHighRisk(question, checks?) → boolean (§4.4 high-risk definition)
//   createPageStore({ root, resources }) → page text / transcript / image lookup
//
// Every Appendix B code has a function below. Results are `pass | warn | fail`
// (the validation-record enum). Two kinds of failure lead to review instead
// of rejection: the REVIEW_CODES (P006, V001) and "not_checked" results of
// E001 / P004 / P005 on a page without trustworthy text (reported as `warn`
// with detail "not_checked: …" and `review: true`).
//
// ctx (all optional except where a check needs it):
//   nodes, resources, stimuli, objectives, questions, templates, sources: Map<id, record>
//   catalog: { EXAMS, SECTIONS } (src/lib/exams/catalog.js)
//   pages: createPageStore(...)             page text for E001 / P004 / P005
//   evidence(questionId, revision) → [{ pdf_page, quote, quote_sha256, quote_kind }]  (cache sidecar)
//   previous: Map<id, record>               last committed state (S002 frozen ids)
//   candidate: raw generator line           (S005; ingest-candidates only)
//   byContentHash: Map<content_hash, id[]>, idCounts: Map<id, n>   (D001, S002)
// ============================================================================

import { existsSync, readFileSync } from "node:fs";
import { searchNormalize, mapSuperscriptsAndFractions } from "../../../src/lib/content/normalize.js";
import { contentHash, gradeCode, isQuestionKey, LEGACY_QUESTION_ID_RE, questionIdHash, variantId } from "../../../src/lib/content/ids.js";
import { canonicalAnswer, parseNumber } from "../../../src/lib/content/answers.js";
import { absR, cmp, evaluate, formatValue, isRational, mul, parseDecimal, sub, toRational } from "../../../src/lib/content/expr.js";
import { sha256Hex } from "../../../src/lib/content/prng.js";
import { cachePaths, cacheRoot } from "./cache.mjs";
import { validateRecord } from "./schemas.mjs";
import { dimCompatible, dimensionOf, mentionsUnit, parseUnit, unitsAfterNumbers } from "./units.mjs";

// ── the code table ──────────────────────────────────────────────────────────
export const CHECK_CODES = Object.freeze([
  "S001", "S002", "S003", "S004", "S005",
  "O001", "O002", "O003", "O004", "O005", "O006", "O007", "O008", "O009", "O010",
  "E001", "V001",
  "N001", "N002", "N003", "N004",
  "L001", "L002", "L003", "L004", "L005", "L006", "L007", "L008",
  "P001", "P002", "P003", "P004", "P005", "P006",
  "D001",
]);
/** Failures of these codes send the item to human review instead of rejecting it. */
export const REVIEW_CODES = Object.freeze(new Set(["P006", "V001"]));
/** Warn-only codes (Appendix B severity `warn`). */
export const WARN_CODES = Object.freeze(new Set(["O005", "O006", "L003", "L006"]));

/** The verbatim-copy threshold of P004: a shared run of ≥ 60 normalized chars (≈ 12 Arabic words). */
export const P004_RUN_CHARS = 60;
/** P005: a figure/table-derived stimulus may copy at most 12 cells. */
export const P005_MAX_CELLS = 12;
/** Quote kinds that may be quoted verbatim (≤ 200 chars) without failing P004. */
export const PERMITTED_QUOTE_KINDS = Object.freeze(new Set(["quran", "hadith", "poetry", "definition"]));
export const MAX_QUOTE_CHARS = 200;

// Subjects whose computation items need `computation` (N002) and whose
// explanations need a step with the computed answer (P006).
export const STEM_SUBJECTS = Object.freeze(new Set([
  "math", "science", "physics", "chemistry", "statistics", "earth-space", "quantitative",
]));
export const ISLAMIC_SUBJECTS = Object.freeze(new Set([
  "islamic", "quran", "hadith", "tawhid", "fiqh", "tafsir", "qiraat", "quran-sciences", "sharia",
  "usul-fiqh", "hadith-terminology", "faraid", "tajweed", "tahfeez",
]));
/** Subjects whose explanations need a step with the computed answer (P006). */
export const MATH_SUBJECTS = Object.freeze(new Set(["math", "quantitative", "statistics"]));
export const LANGUAGE_SUBJECTS = Object.freeze(new Set(["arabic", "english", "verbal", "linguistic-studies", "rhetoric"]));

const pass = (code, detail = null) => ({ code, result: "pass", detail });
const warn = (code, detail) => ({ code, result: "warn", detail: clip(detail) });
const fail = (code, detail) => ({ code, result: "fail", detail: clip(detail) });
const notChecked = (code, detail) => ({ code, result: "warn", detail: clip(`not_checked: ${detail}`), review: true });
const clip = (s) => (s == null ? null : String(s).slice(0, 1000));

// ── small helpers ───────────────────────────────────────────────────────────
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v) => (typeof v === "string" ? v : "");
const norm = (s) => searchNormalize(s);

/** Subject slug of an item: the catalog subject id or the prep section. */
export function subjectSlug(q) {
  if (q?.curriculum?.subject) return String(q.curriculum.subject).split("/").pop();
  if (q?.prep?.section) return q.prep.section;
  return null;
}
export const isStemItem = (q) => STEM_SUBJECTS.has(subjectSlug(q));
export const isLegacyItem = (q) => LEGACY_QUESTION_ID_RE.test(q?.id ?? "") && q?.provenance?.origin === "internal_authored";

/** The option-like list of an item: [{id, text}] per type. */
export function optionList(q) {
  const p = q?.payload ?? {};
  switch (q?.question_type) {
    case "mcq":
    case "true_false":
      return p.options ?? [];
    case "matching":
      return [...(p.left ?? []), ...(p.right ?? [])];
    case "ordering":
      return p.items ?? [];
    default:
      return [];
  }
}

/** Every text of an item by field (for L*, P003, P004). */
export function itemTexts(q, stimulusText = null) {
  const p = q?.payload ?? {};
  const options = optionList(q).map((o) => str(o.text));
  if (q?.question_type === "short_answer") options.push(...(p.accepted ?? []).map(str), str(p.answer_display));
  if (q?.question_type === "numeric") options.push(str(p.answer?.value), str(p.unit?.text), ...(p.unit?.accepted ?? []).map(str));
  const explanation = [str(q?.explanation?.text), ...(q?.explanation?.steps ?? []).map(str), str(q?.explanation?.method)]
    .filter(Boolean).join("\n");
  return { stem: str(q?.stem), stimulus: str(stimulusText), options: options.filter((t) => t !== ""), explanation };
}
const allText = (t) => [t.stem, t.stimulus, ...t.options, t.explanation].filter(Boolean).join("\n");

/** Text of the correct answer (mcq/true_false option text, numeric value, …). */
export function answerText(q) {
  const p = q?.payload ?? {};
  switch (q?.question_type) {
    case "mcq":
    case "true_false":
      return str((p.options ?? []).find((o) => o.id === p.answer?.option_id)?.text);
    case "short_answer":
      return str(p.answer_display ?? p.accepted?.[0]);
    case "numeric":
      return str(p.answer?.value);
    default:
      return "";
  }
}

// ── normalization with an offset map (E001, P004) ──────────────────────────
const MARK_RE = /[ً-ٰٟۖ-ۭـ]/;
const INVISIBLE_RE = /[​-‏‪-‮⁦-⁩﻿؜]/;
const PUNCT_RE = /[.,،؛؟?!:«»"'()٫\[\]{}\-–—…]/;
const LETTER_FOLD = { "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ئ": "ي", "ی": "ي", "ؤ": "و", "ة": "ه", "ک": "ك" };
const DIGIT_RE = /[٠-٩۰-۹]/;
const isDigitChar = (c) => /[0-9٠-٩۰-۹]/.test(c ?? "");
const ALEF_LAM = new Set(["ا", "ل"]);
const isArabicLetter = (c) => c >= "ء" && c <= "ي";

/**
 * The matching form used by E001 and P004 — searchNormalize steps plus
 * lam_order_fold — computed character by character so every output char maps
 * back to its [start, end) in the original string (UTF-16 offsets).
 * @returns {{ norm: string, starts: number[], ends: number[] }}
 */
export function normalizeWithMap(text) {
  const src = String(text ?? "");
  const out = [];
  const starts = [];
  const ends = [];
  const push = (c, s, e) => {
    out.push(c);
    starts.push(s);
    ends.push(e);
  };
  const cps = [];
  for (let i = 0; i < src.length;) {
    const ch = String.fromCodePoint(src.codePointAt(i));
    cps.push({ ch, s: i, e: i + ch.length });
    i += ch.length;
  }
  cps.forEach(({ ch, s, e }, k) => {
    for (let c of mapSuperscriptsAndFractions(ch).normalize("NFKC")) {
      if (MARK_RE.test(c) || INVISIBLE_RE.test(c)) continue;
      c = LETTER_FOLD[c] ?? c;
      if (DIGIT_RE.test(c)) c = String(c.codePointAt(0) - (c.codePointAt(0) >= 0x6f0 ? 0x6f0 : 0x660));
      c = c.toLowerCase();
      if (PUNCT_RE.test(c)) {
        const between = (c === "." || c === "," || c === "٫") && isDigitChar(cps[k - 1]?.ch) && isDigitChar(cps[k + 1]?.ch);
        c = between ? c : " ";
      }
      if (/\s/.test(c)) c = " ";
      if (c === " " && (out.length === 0 || out[out.length - 1] === " ")) continue;
      push(c, s, e);
    }
  });
  while (out.length && out[out.length - 1] === " ") {
    out.pop();
    starts.pop();
    ends.pop();
  }
  // lam_order_fold, word by word, carrying the map along.
  let w = 0;
  while (w < out.length) {
    let end = w;
    while (end < out.length && out[end] !== " ") end++;
    foldWordWithMap(out, starts, ends, w, end);
    w = end + 1;
  }
  return { norm: out.join(""), starts, ends };
}

function foldWordWithMap(out, starts, ends, a, b) {
  const swap = (i, j) => {
    [out[i], out[j]] = [out[j], out[i]];
    [starts[i], starts[j]] = [starts[j], starts[i]];
    [ends[i], ends[j]] = [ends[j], ends[i]];
  };
  if (b - a >= 3 && out[a] === "ا" && out[a + 2] === "ل" && isArabicLetter(out[a + 1]) && !ALEF_LAM.has(out[a + 1])) swap(a + 1, a + 2);
  let i = a;
  while (i < b) {
    if (!ALEF_LAM.has(out[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j < b && ALEF_LAM.has(out[j])) j++;
    // stable sort of the run by code point, keeping the maps paired
    const run = [];
    for (let k = i; k < j; k++) run.push([out[k], starts[k], ends[k]]);
    run.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
    run.forEach(([c, s, e], k) => {
      out[i + k] = c;
      starts[i + k] = s;
      ends[i + k] = e;
    });
    i = j;
  }
}

export const matchForm = (text) => normalizeWithMap(text).norm;

/** [start, end) of `quote` in `pageText` (matching form), or null. */
export function locateQuote(pageText, quote) {
  const exact = String(pageText ?? "").indexOf(String(quote ?? ""));
  if (quote && exact >= 0) return [exact, exact + String(quote).length];
  const P = normalizeWithMap(pageText);
  const Q = matchForm(quote);
  if (!Q) return null;
  const at = P.norm.indexOf(Q);
  if (at < 0) return null;
  let s = Infinity;
  let e = -Infinity;
  for (let k = at; k < at + Q.length; k++) {
    s = Math.min(s, P.starts[k]);
    e = Math.max(e, P.ends[k]);
  }
  return [s, e];
}

/** Set of char 5-grams of a matching-form string. */
export function charGrams(text, n = 5) {
  const set = new Set();
  for (let i = 0; i + n <= text.length; i++) set.add(text.slice(i, i + n));
  return set;
}

/** Longest run (in chars) of `text` whose 5-grams are all in `pageGrams` and not in `allowed`. */
export function longestSharedRun(text, pageGrams, allowed = new Set(), n = 5) {
  let best = 0;
  let run = 0;
  for (let i = 0; i + n <= text.length; i++) {
    const g = text.slice(i, i + n);
    if (pageGrams.has(g) && !allowed.has(g)) {
      run++;
      best = Math.max(best, run + n - 1);
    } else run = 0;
  }
  return best;
}

// ── page store: repaired text, vision transcripts and page images ──────────
/**
 * Page lookup over the content cache (§3): `extract/<resource>/pages.jsonl`
 * rows (a `method: vision` row is the source of truth for its page), else the
 * raw text layer `ien/text/<stem>/pNNN.txt` (untrusted: never enough for
 * E001 / P004), plus the render `ien/pages/<stem>/pNNN.jpg`.
 */
export function createPageStore({ root = cacheRoot(), resources = new Map() } = {}) {
  const paths = cachePaths(root);
  const rowsByResource = new Map();
  const rowsOf = (resourceId) => {
    if (rowsByResource.has(resourceId)) return rowsByResource.get(resourceId);
    const byPage = new Map();
    let file = null;
    try {
      file = paths.extractPages(resourceId);
    } catch {
      file = null;
    }
    if (file && existsSync(file)) {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (!line.trim()) continue;
        let row;
        try {
          row = JSON.parse(line);
        } catch {
          continue;
        }
        if (!Number.isInteger(row.pdf_page)) continue;
        const slot = byPage.get(row.pdf_page) ?? {};
        if (row.method === "vision") slot.vision = row;
        else slot.text = row;
        byPage.set(row.pdf_page, slot);
      }
    }
    rowsByResource.set(resourceId, byPage);
    return byPage;
  };
  const fileOf = (resourceId) => resources.get(resourceId)?.provider_ref?.path ?? null;
  const safe = (fn) => {
    try {
      return fn();
    } catch {
      return null;
    }
  };

  return {
    root: paths.root,
    /** Absolute image path of a page render (it may not exist yet). */
    imagePath(resourceId, pdfPage) {
      const name = fileOf(resourceId);
      return name ? safe(() => paths.pageImage(name, pdfPage).split("\\").join("/")) : null;
    },
    /**
     * @returns {{ text, method: "text"|"vision"|"none", quality: "ok"|"repaired"|"untrusted", readable, image, image_exists }}
     */
    get(resourceId, pdfPage) {
      const image = this.imagePath(resourceId, pdfPage);
      const base = { image, image_exists: Boolean(image && existsSync(image)) };
      const slot = rowsOf(resourceId).get(pdfPage);
      if (slot?.vision) {
        return { ...base, text: str(slot.vision.repaired ?? slot.vision.raw), method: "vision", quality: slot.vision.text_quality ?? "ok", readable: true };
      }
      if (slot?.text) {
        const quality = slot.text.text_quality ?? "untrusted";
        return { ...base, text: str(slot.text.repaired ?? slot.text.raw), method: "text", quality, readable: quality !== "untrusted" };
      }
      const name = fileOf(resourceId);
      const raw = name ? safe(() => paths.textPage(name, pdfPage)) : null;
      if (raw && existsSync(raw)) return { ...base, text: readFileSync(raw, "utf8"), method: "text", quality: "untrusted", readable: false };
      return { ...base, text: "", method: "none", quality: "untrusted", readable: false };
    },
  };
}

// ── O004 patterns (§5.4) ────────────────────────────────────────────────────
const ALL_OF_RE = /(?:^|\s)(?:كل|جميع)\s+(?:ما\s+(?:سبق|ذكر|تقدم)|الإجابات|الاجابات|الخيارات|البدائل)|all\s+of\s+the\s+above/iu;
const NONE_OF_RE = /(?:لا|ليس)\s+(?:شيء|شي|أي\s+شيء|أيا|ايا)\s+(?:مما|من)\s+(?:سبق|ذكر)|ليس\s+مما\s+سبق|لا\s+(?:توجد|يوجد)\s+إجابة\s+صحيحة|none\s+of\s+the\s+above/iu;
const COMBINED_RE = /^\s*\(?\s*[أبجدabcd]\s*\)?\s*و\s*\(?\s*[أبجدabcd]\s*\)?\s*(?:معًا|معا)?\s*$|\(\s*[أبجد]\s*\)\s*و\s*\(\s*[أبجد]\s*\)|both\s+\(?[a-d]\)?\s+and\s+\(?[a-d]\)?|^\s*\(?[a-d]\)?\s+and\s+\(?[a-d]\)?\s*$|^\s*(?:كلاهما|كلتاهما|الإجابتان)/iu;
const SCALES = [
  ["دائما", "غالبا", "احيانا", "نادرا", "ابدا"],
  ["always", "usually", "often", "sometimes", "rarely", "never"],
  ["اوافق بشده", "اوافق", "محايد", "لا اوافق", "لا اوافق بشده"],
  ["الاول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس"],
  ["first", "second", "third", "fourth", "fifth", "sixth"],
  ["القيمه الاولي اكبر", "القيمه الثانيه اكبر", "القيمتان متساويتان", "المعطيات غير كافيه"],
  ["صغير جدا", "صغير", "متوسط", "كبير", "كبير جدا"],
  ["منخفض", "متوسط", "مرتفع"],
].map((s) => new Set(s.map((w) => searchNormalize(w))));

/** Numeric value of an option text ("32", "٣٢ سم", "3/4", "0,5") or null. */
export function optionNumber(text) {
  const t = String(text ?? "").trim();
  const whole = parseNumber(t);
  if (whole.ok) return whole.value;
  const m = /^([-−+]?[0-9٠-٩۰-۹][0-9٠-٩۰-۹.,٫٬/]*)\s*(.+)$/u.exec(t);
  if (m && parseUnit(m[2])) {
    const n = parseNumber(m[1]);
    if (n.ok) return n.value;
  }
  return null;
}

/** The fixed-order reason an mcq's options call for, or null; `conflict` for all+none. */
export function detectFixedOrder(options) {
  const texts = (options ?? []).map((o) => str(o.text));
  const all = texts.some((t) => ALL_OF_RE.test(t));
  const none = texts.some((t) => NONE_OF_RE.test(t));
  if (all && none) return "conflict";
  if (all) return "all_of_above";
  if (none) return "none_of_above";
  if (texts.some((t) => COMBINED_RE.test(t))) return "combined_option";
  const normed = texts.map((t) => searchNormalize(t));
  if (texts.length >= 3 && SCALES.some((scale) => normed.every((t) => scale.has(t)))) return "conventional_scale";
  if (texts.length >= 2 && texts.every((t) => optionNumber(t) !== null)) return "numeric_ascending";
  return null;
}

/**
 * Options of a `numeric_ascending` mcq in ascending numeric order (stable;
 * ties keep their order), or null when an option does not parse as a number.
 * The engine shows fixed-order options in their stored order (§5.4), so an
 * unsorted "numeric_ascending" item would show the generator's authoring
 * order — typically with the key in the same position every time.
 */
export function ascendingOptions(options) {
  const list = (options ?? []).map((o, i) => ({ o, i, v: optionNumber(o?.text) }));
  if (!list.length || list.some((x) => !x.v)) return null;
  return list.sort((a, b) => cmp(a.v, b.v) || a.i - b.i).map((x) => x.o);
}

/** Does a numeric_ascending item need its options sorted? (Legacy items keep their source order.) */
function needsAscendingSort(q, reason) {
  if (reason !== "numeric_ascending" || isLegacyItem(q)) return false;
  const sorted = ascendingOptions(q.payload?.options);
  return Boolean(sorted) && sorted.some((o, i) => o !== q.payload.options[i]);
}

/** What O004 would change: { changed, reason, shuffle, conflict, sort }. Pure. */
export function o004Fix(q) {
  if (q?.question_type === "true_false") return { changed: q.shuffle_options !== false, reason: null, shuffle: false, conflict: false, sort: false };
  if (q?.question_type !== "mcq") return { changed: false, reason: null, shuffle: q?.shuffle_options, conflict: false, sort: false };
  const detected = detectFixedOrder(q.payload?.options);
  if (detected === "conflict") return { changed: false, reason: null, shuffle: false, conflict: true, sort: false };
  const current = q.payload?.fixed_order_reason ?? null;
  const reason = current ?? detected;
  const shuffle = reason ? false : q.shuffle_options;
  const sort = needsAscendingSort(q, reason);
  return { changed: reason !== current || shuffle !== q.shuffle_options || sort, reason, shuffle, conflict: false, sort };
}

/**
 * Apply O004 in place (mcq: fixed_order_reason + shuffle_options=false, and
 * numeric_ascending options stored in ascending order; true_false: no shuffle).
 */
export function applyO004(q) {
  const fix = o004Fix(q);
  if (!fix.changed) return { changed: false, reason: fix.reason };
  if (q.question_type === "mcq") q.payload.fixed_order_reason = fix.reason;
  if (fix.sort) q.payload.options = ascendingOptions(q.payload.options);
  q.shuffle_options = fix.shuffle;
  return { changed: true, reason: fix.reason };
}

/** Derived shuffle_options for a new item (§5.4). */
export const defaultShuffle = (q) => q.question_type === "mcq" && !q.payload?.fixed_order_reason;

// ── S: structure ────────────────────────────────────────────────────────────
/**
 * What a generator may write (§4.3 "Output"): content, source pages and
 * evidence, objective, origin, difficulty, style, computation. `true` = a
 * leaf; an object = nested allowlist; "*" = the per-type payload formats of
 * CANDIDATE_PAYLOAD_FIELDS. Everything else is assigned by ingest-candidates.
 */
export const CANDIDATE_FIELDS = Object.freeze({
  ref: true, lesson: true, repair_of: true,
  question_type: true, item_style: true, difficulty: true, language: true,
  stem: true, stimulus: { text: true }, payload: "*", explanation: { text: true, steps: true, method: true },
  tags: true, computation: { expr: true, vars: true }, time_limit_seconds: true, objective_id: true,
  source: { resource_id: true, pdf_page_start: true, pdf_page_end: true, printed_page_start: true, printed_page_end: true, evidence: "evidence" },
  provenance: { origin: true },
  variant: { kind: true, of: true, change: true },
});
const EVIDENCE_FIELDS = new Set(["pdf_page", "quote", "quote_kind"]);
/** Generator payload formats (text-based; ingest assigns the opaque ids). */
export const CANDIDATE_PAYLOAD_FIELDS = Object.freeze({
  mcq: ["options", "answer", "fixed_order_reason"],
  true_false: ["answer"],
  matching: ["left", "right", "pairs", "scoring"],
  ordering: ["items", "criterion"],
  short_answer: ["accepted", "match", "max_chars", "answer_display"],
  numeric: ["answer", "unit", "input"],
});

/** Paths of fields a generator line may not set (S005). */
export function forbiddenCandidateFields(candidate) {
  const bad = [];
  const walk = (value, allow, path) => {
    if (!isObj(value)) return;
    for (const k of Object.keys(value)) {
      const rule = allow[k];
      const p = path ? `${path}.${k}` : k;
      if (rule === undefined) bad.push(p);
      else if (rule === "evidence") {
        if (!Array.isArray(value[k])) continue;
        value[k].forEach((e, i) => {
          if (isObj(e)) for (const ek of Object.keys(e)) if (!EVIDENCE_FIELDS.has(ek)) bad.push(`${p}[${i}].${ek}`);
        });
      } else if (rule === "*") {
        const allowed = new Set(CANDIDATE_PAYLOAD_FIELDS[candidate?.question_type] ?? []);
        if (isObj(value[k])) for (const pk of Object.keys(value[k])) if (!allowed.has(pk)) bad.push(`${p}.${pk}`);
      } else if (isObj(rule)) walk(value[k], rule, p);
    }
  };
  walk(candidate, CANDIDATE_FIELDS, "");
  if (isObj(candidate?.variant) && candidate.variant.kind !== "rewrite") bad.push("variant.kind");
  return bad;
}

const CHECK = {};

CHECK.S001 = (q) => {
  const r = validateRecord("question", q);
  return r.ok ? pass("S001") : fail("S001", r.errors.join("; "));
};

function idPrefixProblem(q) {
  const m = /^[qv]-([a-z0-9]+)-(.+)-[0-9a-f]{10}(?:-\d{2})?$/.exec(q.id ?? "");
  if (!m) return null;
  let code;
  let subject;
  try {
    if (q.curriculum) {
      code = gradeCode(q.curriculum.grade);
      subject = String(q.curriculum.subject).split("/").pop();
    } else if (q.prep) {
      code = gradeCode(q.prep.exam);
      subject = q.prep.section;
    } else return "no curriculum or prep to derive the id prefix";
  } catch (e) {
    return e.message;
  }
  return m[1] === code && m[2] === subject ? null : `id must start with ${q.id[0]}-${code}-${subject}-`;
}

/** The id-hash anchor of an item: its lesson, or its prep topic scope. */
export const idAnchor = (q) => q.curriculum?.lesson ?? `prep:${q.prep?.exam}/${q.prep?.section}/${q.prep?.topic}`;

CHECK.S002 = (q, ctx) => {
  if (!isQuestionKey(q.id)) return fail("S002", `bad question key ${q.id}`);
  const prefix = idPrefixProblem(q);
  if (prefix) return fail("S002", prefix);
  if ((ctx.idCounts?.get(q.id) ?? 1) > 1) return fail("S002", `id ${q.id} is not unique`);
  if (q.variant?.kind === "template") {
    let want;
    try {
      want = variantId(q.variant.template_id, q.variant.variant_no);
    } catch (e) {
      return fail("S002", e.message);
    }
    if (want !== q.id) return fail("S002", `variant id ${q.id} ≠ ${want}`);
  } else if (/^q-/.test(q.id) && q.revision === 1) {
    // A new id is a 10-hex window of sha256(anchor|type|normalize(stem)|answer-free material) (§2.2).
    try {
      const full = questionIdHash({ anchor: idAnchor(q), type: q.question_type, stem: q.stem, payload: q.payload });
      const windows = [0, 10, 20, 30, 40, 50].map((w) => full.slice(w, w + 10));
      if (!windows.includes(q.id.slice(-10))) return fail("S002", `id hash ${q.id.slice(-10)} is not derived from the item's content`);
    } catch (e) {
      return fail("S002", `id not derivable: ${e.message}`);
    }
  }
  const prev = ctx.previous?.get(q.id);
  if (prev) {
    if (prev.created_at !== q.created_at) return fail("S002", `frozen id ${q.id}: created_at changed`);
    if (q.revision < prev.revision) return fail("S002", `frozen id ${q.id}: revision went back from ${prev.revision}`);
    if (q.revision === prev.revision && prev.content_hash !== q.content_hash) return fail("S002", "content changed without a new revision");
  }
  for (const id of ctx.previousByHash?.get(q.content_hash) ?? []) {
    if (id !== q.id) return fail("S002", `same content as frozen id ${id} (an id is never re-minted)`);
  }
  return pass("S002");
};

/** The lesson's ancestor of a kind (unit / chapter), walking parent_id. */
function ancestorOf(lesson, kind, nodes) {
  let n = lesson;
  for (let i = 0; n && i < 12; i++) {
    n = n.parent_id ? nodes.get(n.parent_id) : null;
    if (n?.kind === kind) return n.id;
  }
  return null;
}
export const lessonAncestor = ancestorOf;

CHECK.S003 = (q, ctx) => {
  if (q.scope === "curriculum") {
    const c = q.curriculum;
    if (!c) return fail("S003", "curriculum item without curriculum");
    const nodes = ctx.nodes ?? new Map();
    const lesson = nodes.get(c.lesson);
    if (!lesson) return fail("S003", `lesson ${c.lesson} does not resolve`);
    if (lesson.kind !== "lesson") return fail("S003", `${c.lesson} is a ${lesson.kind}, not a lesson`);
    if (lesson.status !== "verified") return fail("S003", `lesson ${c.lesson} has status ${lesson.status}`);
    if (lesson.unit_opener) return fail("S003", `lesson ${c.lesson} is a unit opener`);
    for (const k of ["stage", "grade", "track", "subject"]) {
      if ((lesson[k] ?? null) !== (c[k] ?? null)) return fail("S003", `curriculum.${k} ${c[k]} ≠ the lesson's ${lesson[k]}`);
    }
    if ((lesson.term ?? null) !== (c.term ?? null) || lesson.term_status !== c.term_status) {
      return fail("S003", `term ${c.term}/${c.term_status} is not copied from the lesson (${lesson.term}/${lesson.term_status})`);
    }
    for (const kind of ["unit", "chapter"]) {
      const want = ancestorOf(lesson, kind, nodes);
      if ((c[kind] ?? null) !== want) return fail("S003", `curriculum.${kind} ${c[kind]} ≠ the lesson's ${kind} ${want}`);
    }
    const primary = (q.links ?? []).filter((l) => l.role === "primary");
    if (primary.length !== 1 || primary[0].node_id !== c.lesson) return fail("S003", "exactly one primary link, to curriculum.lesson");
    for (const l of q.links ?? []) {
      if (!l.node_id.startsWith("prep:") && !nodes.has(l.node_id)) return fail("S003", `link ${l.node_id} does not resolve`);
    }
    if (q.objective_id && ctx.objectives && ctx.objectives.get(q.objective_id)?.lesson_node_id !== c.lesson) {
      return fail("S003", `objective ${q.objective_id} is not an objective of ${c.lesson}`);
    }
    return pass("S003");
  }
  const p = q.prep;
  if (!p) return fail("S003", `${q.scope} item without prep`);
  const { EXAMS = {}, SECTIONS = {} } = ctx.catalog ?? {};
  if (!EXAMS[p.exam] || p.exam !== q.scope) return fail("S003", `prep.exam ${p.exam} ≠ scope ${q.scope}`);
  const sec = SECTIONS[p.section];
  if (!sec || sec.exam !== p.exam) return fail("S003", `prep.section ${p.section} is not a ${p.exam} section`);
  if (p.topic !== null && !sec.topics.includes(p.topic)) return fail("S003", `prep.topic ${p.topic} is not a ${p.section} topic`);
  if ((q.links ?? []).some((l) => l.role === "primary")) return fail("S003", "prep items have no primary curriculum link");
  return pass("S003");
};

CHECK.S004 = (q, ctx) => {
  const s = q.source;
  const origin = q.provenance?.origin;
  const needsSource = origin === "source_derived" || origin === "transformed";
  if (!s || !s.resource_id) return needsSource ? fail("S004", `${origin} item without a source resource`) : pass("S004", "no source pages");
  const res = ctx.resources?.get(s.resource_id);
  if (!res) return fail("S004", `resource ${s.resource_id} does not resolve`);
  if (s.source_id !== res.source_id) return fail("S004", `source_id ${s.source_id} ≠ the resource's ${res.source_id}`);
  const a = s.pdf_page_start;
  const b = s.pdf_page_end;
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < a) return fail("S004", `bad page range ${a}–${b}`);
  if (Number.isInteger(res.page_count) && b > res.page_count) return fail("S004", `page ${b} beyond the resource's ${res.page_count} pages`);
  if (q.curriculum?.lesson) {
    const lesson = ctx.nodes?.get(q.curriculum.lesson);
    const ranges = (lesson?.pages ?? []).filter((r) => r.resource_id === s.resource_id);
    if (!ranges.length) return fail("S004", `lesson ${q.curriculum.lesson} has no pages in ${s.resource_id}`);
    const inside = (p) => ranges.some((r) => p >= r.pdf_start && p <= r.pdf_end);
    for (let p = a; p <= b; p++) if (!inside(p)) return fail("S004", `page ${p} is outside the lesson's range`);
  }
  for (const e of s.evidence ?? []) {
    if (e.pdf_page < a || e.pdf_page > b) return fail("S004", `evidence page ${e.pdf_page} outside ${a}–${b}`);
  }
  return pass("S004");
};

CHECK.S005 = (q, ctx) => {
  if (!ctx.candidate) return pass("S005", "no generator line to inspect");
  const bad = forbiddenCandidateFields(ctx.candidate);
  return bad.length ? fail("S005", `generator set: ${bad.join(", ")}`) : pass("S005");
};

// ── O: options and answers ──────────────────────────────────────────────────
const TF_TEXTS = { ar: ["صح", "خطأ"], en: ["True", "False"] };
const distinctNormalized = (list) => new Set(list.map((x) => norm(x.text))).size === list.length;
const distinctIds = (list) => new Set(list.map((x) => x.id)).size === list.length;
const nonEmpty = (list) => list.every((x) => typeof x?.text === "string" && norm(x.text) !== "");

CHECK.O001 = (q) => {
  const p = q.payload ?? {};
  const lists = [];
  switch (q.question_type) {
    case "mcq":
      if (!Array.isArray(p.options) || p.options.length < 2 || p.options.length > 6) return fail("O001", "mcq needs 2–6 options");
      lists.push(["options", p.options]);
      break;
    case "true_false": {
      const texts = TF_TEXTS[q.language] ?? TF_TEXTS.ar;
      const ok = Array.isArray(p.options) && p.options.length === 2 && p.options[0]?.id === "t" && p.options[1]?.id === "f"
        && p.options[0].text === texts[0] && p.options[1].text === texts[1];
      if (!ok) return fail("O001", `true_false options must be [t: ${texts[0]}, f: ${texts[1]}]`);
      break;
    }
    case "matching":
      if (!Array.isArray(p.left) || p.left.length < 2 || p.left.length > 6) return fail("O001", "matching needs 2–6 left entries");
      if (!Array.isArray(p.right) || p.right.length < 2) return fail("O001", "matching needs a right column");
      lists.push(["left", p.left], ["right", p.right]);
      break;
    case "ordering":
      if (!Array.isArray(p.items) || p.items.length < 2) return fail("O001", "ordering needs items");
      lists.push(["items", p.items]);
      break;
    case "short_answer": {
      const acc = (p.accepted ?? []).map((text) => ({ id: text, text }));
      if (!acc.length) return fail("O001", "short_answer needs accepted answers");
      if (!nonEmpty(acc)) return fail("O001", "an accepted answer is empty");
      const keyOf = p.match === "exact_marks" ? (t) => t.normalize("NFC").replace(/\s+/g, " ").trim() : norm;
      if (new Set(acc.map((a) => keyOf(a.text))).size !== acc.length) return fail("O001", "accepted answers repeat after normalization");
      return pass("O001");
    }
    case "numeric":
      return pass("O001", "no options");
    default:
      return fail("O001", `unknown type ${q.question_type}`);
  }
  for (const [name, list] of lists) {
    if (!nonEmpty(list)) return fail("O001", `${name}: an entry is empty`);
    if (!distinctIds(list)) return fail("O001", `${name}: ids repeat`);
    if (!distinctNormalized(list)) return fail("O001", `${name}: texts repeat after normalization`);
  }
  if (q.question_type === "matching" && !distinctIds([...p.left, ...p.right])) return fail("O001", "left and right ids overlap");
  return pass("O001");
};

CHECK.O002 = (q) => {
  const p = q.payload ?? {};
  const a = p.answer ?? {};
  switch (q.question_type) {
    case "mcq":
    case "true_false":
      return (p.options ?? []).some((o) => o.id === a.option_id) ? pass("O002") : fail("O002", `answer ${a.option_id} is not an option`);
    case "matching": {
      const left = new Set((p.left ?? []).map((x) => x.id));
      const right = new Set((p.right ?? []).map((x) => x.id));
      const pairs = a.pairs ?? [];
      if (pairs.length !== left.size) return fail("O002", `${pairs.length} pairs for ${left.size} left entries`);
      const usedL = new Set();
      const usedR = new Set();
      for (const [l, r] of pairs) {
        if (!left.has(l) || !right.has(r)) return fail("O002", `pair [${l}, ${r}] does not reference the columns`);
        if (usedL.has(l) || usedR.has(r)) return fail("O002", `pair [${l}, ${r}] repeats an entry`);
        usedL.add(l);
        usedR.add(r);
      }
      return pass("O002");
    }
    case "ordering": {
      const items = (p.items ?? []).map((x) => x.id);
      const order = a.order ?? [];
      const ok = order.length === items.length && new Set(order).size === order.length && order.every((id) => items.includes(id));
      return ok ? pass("O002") : fail("O002", "answer order is not a permutation of the items");
    }
    case "short_answer": {
      const keyOf = p.match === "exact_marks" ? (t) => String(t).normalize("NFC").replace(/\s+/g, " ").trim() : norm;
      return (p.accepted ?? []).map(keyOf).includes(keyOf(p.answer_display ?? ""))
        ? pass("O002") : fail("O002", "answer_display is not one of the accepted answers");
    }
    case "numeric":
      return typeof a.value === "string" && a.value !== "" ? pass("O002") : fail("O002", "numeric answer value missing");
    default:
      return fail("O002", `unknown type ${q.question_type}`);
  }
};

CHECK.O003 = (q) => {
  if (q.question_type !== "mcq" && q.question_type !== "true_false") return pass("O003", "n/a");
  const opts = q.payload?.options ?? [];
  const key = opts.filter((o) => o.id === q.payload?.answer?.option_id);
  if (key.length !== 1) return fail("O003", `${key.length} options carry the answer id`);
  const keyValue = optionNumber(key[0].text);
  if (keyValue) {
    const same = opts.filter((o) => o !== key[0]).find((o) => {
      const v = optionNumber(o.text);
      return v && cmp(v, keyValue) === 0;
    });
    if (same) return fail("O003", `option "${same.text}" has the same value as the answer`);
  }
  return pass("O003");
};

CHECK.O004 = (q, ctx) => {
  if (q.question_type !== "mcq" && q.question_type !== "true_false") return pass("O004", "n/a");
  const fix = o004Fix(q);
  if (fix.conflict) return fail("O004", "«all of the above» combined with «none of the above»");
  if (!fix.changed) return pass("O004");
  const sortNote = fix.sort ? ", options in ascending numeric order" : "";
  if (ctx.applyFixes) {
    applyO004(q);
    return warn("O004", `fixed: fixed_order_reason=${fix.reason}, shuffle_options=false${sortNote}`);
  }
  return fail("O004", `needs fixed_order_reason=${fix.reason} and shuffle_options=false${sortNote}`);
};

CHECK.O005 = (q) => {
  if (q.question_type !== "mcq") return pass("O005", "n/a");
  const lens = (q.payload?.options ?? []).map((o) => [...str(o.text).trim()].length).sort((x, y) => x - y);
  if (lens.length < 3) return pass("O005");
  const mid = lens.length % 2 ? lens[(lens.length - 1) / 2] : (lens[lens.length / 2 - 1] + lens[lens.length / 2]) / 2;
  const longest = lens[lens.length - 1];
  return mid > 0 && longest > 2.5 * mid ? warn("O005", `longest option ${longest} chars > 2.5 × median ${mid}`) : pass("O005");
};

CHECK.O006 = (q) => {
  if (q.question_type !== "mcq" && q.question_type !== "short_answer") return pass("O006", "n/a");
  const ans = norm(answerText(q));
  if (ans.length < 2) return pass("O006");
  return ` ${norm(q.stem)} `.includes(` ${ans} `) ? warn("O006", `the answer «${answerText(q)}» appears in the stem`) : pass("O006");
};

CHECK.O007 = (q) => {
  const p = q.payload ?? {};
  switch (q.question_type) {
    case "matching": {
      const l = p.left?.length ?? 0;
      const r = p.right?.length ?? 0;
      return r >= l && r <= l + 2 ? pass("O007") : fail("O007", `right column has ${r} entries for ${l} left (needs ${l}–${l + 2})`);
    }
    case "ordering": {
      const n = p.items?.length ?? 0;
      return n >= 3 && n <= 7 ? pass("O007") : fail("O007", `ordering has ${n} items (3–7)`);
    }
    case "short_answer": {
      const max = p.max_chars ?? 80;
      if (max > 80 || max < 1) return fail("O007", `max_chars ${max} (1–80)`);
      if ((p.accepted ?? []).length > 10) return fail("O007", "more than 10 accepted answers");
      const long = (p.accepted ?? []).find((a) => [...String(a)].length > max);
      return long ? fail("O007", `accepted answer longer than max_chars ${max}`) : pass("O007");
    }
    default:
      return pass("O007", "n/a");
  }
};

const LETTER_REF_RES = [
  /(?:الخيار|الاختيار|البديل|الإجابة|الاجابة|الجواب|الفقرة)\s*\(?\s*[أبجد]\s*\)?(?=$|[\s.,،:؛)])/u,
  /(?:الخيار|الاختيار|البديل|الإجابة|الاجابة|الجواب)\s+(?:الأول|الأولى|الثاني|الثانية|الثالث|الثالثة|الرابع|الرابعة|الخامس|الأخير|الأخيرة)(?=$|[\s.,،:؛)])/u,
  /\b(?:option|choice|answer|alternative)\s*\(?[a-f]\)?(?=$|[\s.,;:)])/i,
  /\b(?:first|second|third|fourth|fifth|last)\s+(?:option|choice|answer|alternative)\b/i,
];

// A bare «(أ)» counts only when the stem does not itself label things (أ)/(ب) (e.g. «الباقة (أ)»).
const BARE_LETTER_RE = /(?:^|\s)\(\s*[أبجد]\s*\)(?=$|[\s.,،:؛])/u;

CHECK.O008 = (q) => {
  if (!["mcq", "true_false", "matching", "ordering"].includes(q.question_type)) return pass("O008", "n/a");
  const text = [str(q.explanation?.text), ...(q.explanation?.steps ?? []).map(str)].join("\n");
  const res = BARE_LETTER_RE.test(str(q.stem)) ? LETTER_REF_RES : [...LETTER_REF_RES, BARE_LETTER_RE];
  const hit = res.map((re) => re.exec(text)).find(Boolean);
  return hit ? fail("O008", `explanation refers to an option by position: «${hit[0].trim()}»`) : pass("O008");
};

const OPAQUE = { option: /^o[0-9a-f]{6,11}$/, left: /^l[0-9a-f]{6,11}$/, right: /^r[0-9a-f]{6,11}$/, item: /^s[0-9a-f]{6,11}$/ };
const cOrder = (a, b) => Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));

CHECK.O009 = (q) => {
  const p = q.payload ?? {};
  switch (q.question_type) {
    case "mcq": {
      const bad = (p.options ?? []).find((o) => !OPAQUE.option.test(o.id));
      return bad ? fail("O009", `option id ${bad.id} is not opaque (authoring order)`) : pass("O009");
    }
    case "matching": {
      const left = p.left ?? [];
      const right = p.right ?? [];
      const bad = left.find((x) => !OPAQUE.left.test(x.id)) ?? right.find((x) => !OPAQUE.right.test(x.id));
      if (bad) return fail("O009", `id ${bad.id} is not opaque`);
      const key = new Map((p.answer?.pairs ?? []).map(([l, r]) => [l, r]));
      if ([...key].every(([l, r]) => l.slice(1) === r.slice(1))) return fail("O009", "pairs share id suffixes (r_i ↔ l_i)");
      if (left.every((l, i) => key.get(l.id) === right[i]?.id)) return fail("O009", "the column order reveals the pairing");
      const ls = left.map((x) => x.id).sort(cOrder);
      const rs = right.map((x) => x.id).sort(cOrder);
      if (ls.every((l, i) => key.get(l) === rs[i])) return fail("O009", "sorting both columns by id reveals the pairing");
      return pass("O009");
    }
    case "ordering": {
      const items = (p.items ?? []).map((x) => x.id);
      const bad = items.find((id) => !OPAQUE.item.test(id));
      if (bad) return fail("O009", `item id ${bad} is not opaque`);
      const order = p.answer?.order ?? [];
      const same = (list) => list.length === order.length && list.every((id, i) => id === order[i]);
      if (same(items)) return fail("O009", "the items are stored in the answer order");
      const asc = [...items].sort(cOrder);
      if (same(asc) || same([...asc].reverse())) return fail("O009", "ascending ids equal the answer order");
      return pass("O009");
    }
    default:
      return pass("O009", "n/a");
  }
};

const EXACT_MARK_TAGS = new Set(["spelling", "diacritics", "i3rab", "املاء", "الاملاء", "تشكيل", "التشكيل", "اعراب", "الاعراب"].map((t) => norm(t)));
CHECK.O010 = (q) => {
  if (q.question_type !== "short_answer") return pass("O010", "n/a");
  const tagged = (q.tags ?? []).some((t) => EXACT_MARK_TAGS.has(norm(t)));
  if (tagged && q.payload?.match !== "exact_marks") return fail("O010", "spelling/diacritics/i3rab item needs match: exact_marks");
  return pass("O010");
};

// ── E001 evidence, V001 rewrites ────────────────────────────────────────────
CHECK.E001 = (q, ctx) => {
  const ev = q.source?.evidence ?? [];
  const origin = q.provenance?.origin;
  const strict = origin === "source_derived" || origin === "transformed";
  if (!ev.length) return origin === "source_derived" ? fail("E001", "source_derived item without evidence") : pass("E001", "no evidence");
  const sidecar = ctx.evidence ? ctx.evidence(q.id, q.revision) ?? [] : [];
  const missing = [];
  const unread = [];
  for (const e of ev) {
    const row = sidecar.find((r) => r.pdf_page === e.pdf_page && r.quote_sha256 === e.quote_sha256);
    if (!row || typeof row.quote !== "string") return fail("E001", `quote for page ${e.pdf_page} is missing from the evidence sidecar`);
    if (sha256Hex(row.quote) !== e.quote_sha256) return fail("E001", `quote for page ${e.pdf_page} does not match quote_sha256`);
    const page = ctx.pages ? ctx.pages.get(q.source.resource_id, e.pdf_page) : null;
    if (!page || !page.readable) {
      unread.push(e.pdf_page);
      continue;
    }
    if (!locateQuote(page.text, row.quote)) missing.push(e.pdf_page);
  }
  if (missing.length) {
    const detail = `quote not found on page ${missing.join(", ")}`;
    return strict ? fail("E001", detail) : warn("E001", detail);
  }
  if (unread.length) return notChecked("E001", `page ${unread.join(", ")} has no trustworthy text or transcript yet`);
  return pass("E001");
};

CHECK.V001 = (q, ctx) => {
  if (q.variant?.kind !== "rewrite") return pass("V001", "n/a");
  const parent = ctx.questions?.get(q.variant.of);
  if (!parent) return fail("V001", `parent ${q.variant.of} does not resolve`);
  const diffs = [];
  if ((parent.objective_id ?? null) !== (q.objective_id ?? null)) diffs.push("objective");
  if (parent.difficulty !== q.difficulty) diffs.push("difficulty");
  if (norm(parent.explanation?.method ?? "") !== norm(q.explanation?.method ?? "")) diffs.push("solution method");
  if ((parent.curriculum?.lesson ?? null) !== (q.curriculum?.lesson ?? null)) diffs.push("lesson");
  return diffs.length ? fail("V001", `rewrite changes the parent's ${diffs.join(", ")}`) : pass("V001");
};

// ── N: numbers ──────────────────────────────────────────────────────────────
const decimalsOf = (s) => (String(s).split(".")[1] ?? "").length;

/** |value − key| within the numeric answer's tolerance (exact when none). */
function withinKeyTolerance(value, answer) {
  const key = parseDecimal(answer.value);
  if (!key) return false;
  const diff = absR(sub(value, key));
  const t = answer.tolerance;
  if (!t) return diff.n === 0n;
  const tol = absR(toRational(t.value));
  return cmp(diff, t.kind === "rel" ? mul(tol, absR(key)) : tol) <= 0;
}

/** A computed value shown as `text` (exact, or rounded to the text's decimals). */
function showsValue(text, value) {
  const n = optionNumber(text);
  if (!n) return false;
  if (cmp(n, value) === 0) return true;
  const d = decimalsOf(String(text).trim().split(/\s/)[0].replace(/[٫,]/, "."));
  return d > 0 && formatValue(value, `decimal:${d}`) === formatValue(n, `decimal:${d}`);
}

CHECK.N001 = (q) => {
  if (q.question_type !== "numeric") return pass("N001", "n/a");
  const a = q.payload?.answer ?? {};
  if (!parseDecimal(a.value)) return fail("N001", `answer value ${JSON.stringify(a.value)} does not parse`);
  if (a.tolerance) {
    let tol;
    try {
      tol = toRational(a.tolerance.value);
    } catch {
      return fail("N001", "tolerance value does not parse");
    }
    if (tol.n < 0n) return fail("N001", "negative tolerance");
    if (a.tolerance.kind === "rel" && cmp(tol, { n: 1n, d: 1n }) > 0) return fail("N001", "relative tolerance above 1");
    if (a.tolerance.kind !== "abs" && a.tolerance.kind !== "rel") return fail("N001", `tolerance kind ${a.tolerance.kind}`);
  }
  const max = q.payload?.input?.max_decimals;
  if (Number.isInteger(max) && decimalsOf(a.value) > max) return fail("N001", `the key has more than max_decimals ${max} decimals`);
  return pass("N001");
};

/** Exact value of an item's `computation`, or { error }. */
export function computeValue(q) {
  try {
    const value = evaluate(q.computation.expr, q.computation.vars ?? {});
    return { value };
  } catch (e) {
    return { error: e.message };
  }
}

CHECK.N002 = (q) => {
  const required = q.item_style === "computation" || (q.question_type === "numeric" && isStemItem(q));
  if (!q.computation) return required ? fail("N002", "computation is required for this item") : pass("N002", "n/a");
  const { value, error } = computeValue(q);
  if (error) return fail("N002", `computation does not evaluate: ${error}`);
  const p = q.payload ?? {};
  if (typeof value === "boolean") {
    if (q.question_type !== "true_false") return fail("N002", "a boolean computation needs a true_false item");
    return (p.answer?.option_id === "t") === value ? pass("N002") : fail("N002", `computed ${value}, key says ${p.answer?.option_id}`);
  }
  if (!isRational(value)) return fail("N002", "computation is not a number");
  const shown = formatValue(value, "fraction");
  switch (q.question_type) {
    case "numeric":
      return withinKeyTolerance(value, p.answer ?? {}) ? pass("N002") : fail("N002", `computed ${shown} ≠ key ${p.answer?.value}`);
    case "mcq": {
      const text = answerText(q);
      return showsValue(text, value) ? pass("N002") : fail("N002", `computed ${shown} ≠ answer option «${text}»`);
    }
    case "short_answer":
      return (p.accepted ?? []).some((t) => showsValue(t, value)) ? pass("N002") : fail("N002", `computed ${shown} is not an accepted answer`);
    default:
      return fail("N002", `a numeric computation does not fit a ${q.question_type} item`);
  }
};

CHECK.N003 = (q) => {
  if (q.question_type !== "numeric") return pass("N003", "n/a");
  const p = q.payload ?? {};
  const explanation = [str(q.explanation?.text), ...(q.explanation?.steps ?? []).map(str)].join("\n");
  const key = parseDecimal(p.answer?.value);
  const statesKey = (u) => {
    const n = parseNumber(u.value);
    return key && n.ok && cmp(n.value, key) === 0;
  };
  const stated = unitsAfterNumbers(explanation).filter(statesKey);
  const unit = p.unit;
  if (!unit) {
    return stated.length ? warn("N003", `the explanation gives the answer in ${stated[0].unit} but the item has no unit`) : pass("N003");
  }
  if (!str(unit.text).trim()) return fail("N003", "unit text is empty");
  const dim = dimensionOf(unit.text);
  if (!dim) return warn("N003", `unit «${unit.text}» is not in the unit table`);
  for (const a of unit.accepted ?? []) {
    const d = dimensionOf(a);
    if (d && !dimCompatible(d, dim)) return fail("N003", `accepted unit «${a}» measures ${d}, not ${dim}`);
  }
  const wrong = stated.find((u) => !dimCompatible(u.dimension, dim));
  if (wrong) return fail("N003", `the explanation states the answer as ${wrong.raw} (${wrong.dimension}), the item asks for ${dim}`);
  if (!mentionsUnit(explanation, unit.text) && !mentionsUnit(q.stem, unit.text)) return warn("N003", `unit «${unit.text}» is not mentioned in the stem or explanation`);
  return pass("N003");
};

CHECK.N004 = (q) => {
  if (q.question_type !== "mcq") return pass("N004", "n/a");
  const opts = (q.payload?.options ?? []).map((o) => ({ o, v: optionNumber(o.text) })).filter((x) => x.v);
  if (opts.length < 2) return pass("N004", "n/a");
  for (let i = 0; i < opts.length; i++) {
    for (let j = i + 1; j < opts.length; j++) {
      if (cmp(opts[i].v, opts[j].v) === 0) return fail("N004", `options «${opts[i].o.text}» and «${opts[j].o.text}» have the same value`);
    }
  }
  if (q.computation) {
    const { value } = computeValue(q);
    const keyId = q.payload?.answer?.option_id;
    if (isRational(value)) {
      const clash = opts.find((x) => x.o.id !== keyId && cmp(x.v, value) === 0);
      if (clash) return fail("N004", `distractor «${clash.o.text}» equals the computed answer`);
    }
  }
  return pass("N004");
};

// ── L: language and script ──────────────────────────────────────────────────
const AR_LETTER_G = /[ء-يٱ-ۓ]/g;
const LATIN_LETTER_G = /[A-Za-z]/g;
const MATH_WORD = /^(?:[A-Za-z]{1,2}|sin|cos|tan|cot|sec|csc|log|ln|lim|max|min|mod|gcd|lcm|exp|sqrt|abs|pi|mol|kg|km|cm|mm|ml|mg|kj|kw|kwh|hz|kpa|atm|nm|dna|rna|atp|ph|[A-Za-z]{1,3}\/[A-Za-z]{1,3})$/i;
const count = (s, re) => (s.match(re) ?? []).length;
const QUOTED_RE = /«[^»]*»|"[^"]*"|“[^”]*”|'[^']*'/g;

CHECK.L001 = (q, ctx) => {
  const text = allText(itemTexts(q, ctx.stimuli?.get(q.stimulus_id)?.text));
  if (q.language === "en") {
    const outside = text.replace(QUOTED_RE, " ");
    return count(outside, AR_LETTER_G) ? fail("L001", "Arabic letters outside quotes in an English item") : pass("L001");
  }
  let ar = 0;
  let latin = 0;
  for (const token of text.split(/\s+/)) {
    const t = token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (!t || /[0-9٠-٩=+*/^<>]/.test(t) || MATH_WORD.test(t)) continue; // math: variables, functions, units
    ar += count(t, AR_LETTER_G);
    latin += count(t, LATIN_LETTER_G);
  }
  if (ar + latin === 0) return pass("L001", "no prose letters");
  return ar / (ar + latin) >= 0.5 ? pass("L001") : fail("L001", `Arabic letters are ${Math.round((100 * ar) / (ar + latin))}% of the prose letters`);
};

CHECK.L002 = (q, ctx) => {
  const t = itemTexts(q, ctx.stimuli?.get(q.stimulus_id)?.text);
  const text = allText(t);
  if (/[یک]/.test(text)) return fail("L002", "Persian ی/ک");
  if (/[‎‏‪-‮⁦-⁩؜]/.test(text)) return fail("L002", "bidi control characters");
  if (/[  ]/.test(text)) return fail("L002", "non-breaking space");
  if ([t.stem, t.stimulus, ...t.options, t.explanation].some((s) => / {2,}/.test(s))) return fail("L002", "double space");
  // «بـ 3p⁶», «لـ ΔH», «بـ«…»»: a detached prefix before a non-Arabic token.
  const rest = text.replace(/(?<=[بلفك])ـ(?=\s?[^\sء-ي])/g, "");
  if (rest.includes("ـ")) return fail("L002", "tatweel outside the بـ/لـ/فـ + Latin form");
  return pass("L002");
};

CHECK.L003 = (q) => {
  if (q.language !== "ar") return pass("L003", "n/a");
  const stem = str(q.stem).trim();
  if (/\?$/.test(stem)) return warn("L003", "Arabic stem ends with ? instead of ؟");
  if (["true_false", "matching", "ordering"].includes(q.question_type)) return pass("L003");
  const givens = /[:：]$|(?:\.{3}|…|_{2,})\s*[.؟]?$|[=]\s*$/.test(stem) || /\n\s*\S.*[0-9٠-٩=].*$/.test(stem);
  return /؟$/.test(stem) || givens ? pass("L003") : warn("L003", "Arabic stem does not end with ؟ or a givens block");
};

CHECK.L004 = (q, ctx) => {
  const text = allText(itemTexts(q, ctx.stimuli?.get(q.stimulus_id)?.text));
  const m = /[ﭐ-ﷹ﷼-﷿ﹰ-﻿]/.exec(text);
  return m ? fail("L004", `Arabic presentation form U+${m[0].codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`) : pass("L004");
};

CHECK.L005 = (q, ctx) => {
  const text = allText(itemTexts(q, ctx.stimuli?.get(q.stimulus_id)?.text));
  const systems = [/[0-9]/, /[٠-٩]/, /[۰-۹]/].filter((re) => re.test(text)).length;
  return systems > 1 ? fail("L005", "more than one digit system in the item") : pass("L005");
};

CHECK.L006 = (q, ctx) => {
  const text = allText(itemTexts(q, ctx.stimuli?.get(q.stimulus_id)?.text));
  const m = /[0-9٠-٩)][ \t]*-[ \t]*[0-9٠-٩(]/.exec(text);
  return m ? warn("L006", `ASCII hyphen used as a minus: «${m[0]}» (use −)`) : pass("L006");
};

function balanced(s) {
  const stack = [];
  const OPEN = "([{«“";
  const CLOSE = ")]}»”";
  for (const ch of s) {
    const o = OPEN.indexOf(ch);
    if (o >= 0) {
      stack.push(o);
      continue;
    }
    const c = CLOSE.indexOf(ch);
    if (c < 0) continue;
    const top = stack.pop();
    if (top === undefined) return false;
    // ( and [ close each other (interval notation [0, 1)); the others must match.
    const bracket = (x) => (x <= 1 ? 0 : x);
    if (bracket(top) !== bracket(c)) return false;
  }
  return stack.length === 0 && count(s, /"/g) % 2 === 0;
}

CHECK.L007 = (q, ctx) => {
  const t = itemTexts(q, ctx.stimuli?.get(q.stimulus_id)?.text);
  const field = [["stem", t.stem], ["stimulus", t.stimulus], ["explanation", t.explanation], ...t.options.map((o) => ["option", o])]
    .find(([, s]) => s && !balanced(s));
  return field ? fail("L007", `unbalanced brackets or quotes in the ${field[0]}`) : pass("L007");
};

CHECK.L008 = (q, ctx) => {
  const len = (s) => [...str(s)].length;
  if (len(q.stem) > 4000) return fail("L008", "stem longer than 4000");
  const long = optionList(q).find((o) => len(o.text) > 1000);
  if (long) return fail("L008", "option longer than 1000");
  const ex = [str(q.explanation?.text), ...(q.explanation?.steps ?? [])].join("\n");
  if (len(ex) > 8000) return fail("L008", "explanation longer than 8000");
  if (len(ctx.stimuli?.get(q.stimulus_id)?.text) > 8000) return fail("L008", "stimulus longer than 8000");
  return pass("L008");
};

// ── P: provenance and copyright ─────────────────────────────────────────────
const VALID_ORIGINS = {
  curriculum: ["source_derived", "transformed", "generated_practice", "internal_authored"],
  aptitude: ["generated_practice", "internal_authored"],
  achievement: ["source_derived", "transformed", "generated_practice", "internal_authored"],
};

CHECK.P001 = (q, ctx) => {
  const pv = q.provenance;
  if (!isObj(pv) || !pv.origin || !isObj(pv.generator)) return fail("P001", "provenance incomplete");
  if (pv.origin === "review_required") return fail("P001", "origin unclear (review_required) — cannot be published");
  if (!(VALID_ORIGINS[q.scope] ?? []).includes(pv.origin)) return fail("P001", `origin ${pv.origin} is not valid for a ${q.scope} item`);
  const g = pv.generator;
  if (g.kind === "llm_subagent" && (!g.run_id || !g.prompt_version)) return fail("P001", "llm_subagent generator needs run_id and prompt_version");
  if (g.kind === "script" && !g.run_id) return fail("P001", "script generator needs run_id");
  if (g.kind === "legacy_unknown" && pv.origin !== "internal_authored") return fail("P001", "legacy_unknown generator is only for internal_authored items");
  if (q.variant?.kind === "template" && (pv.origin !== "generated_practice" || pv.template_id !== q.variant.template_id)) {
    return fail("P001", "template variants are generated_practice with provenance.template_id = variant.template_id");
  }
  if (q.variant?.kind === "rewrite" && !(pv.derived_from ?? []).includes(q.variant.of)) return fail("P001", "a rewrite lists its parent in derived_from");
  if (pv.origin === "internal_authored") {
    if (pv.license_status !== "internal") return fail("P001", "internal_authored items carry license_status internal");
  } else if (q.source?.resource_id) {
    const res = ctx.resources?.get(q.source.resource_id);
    const src = ctx.sources?.get(q.source.source_id);
    const want = res?.license_status ?? src?.license_status;
    if (want && pv.license_status !== want) return fail("P001", `license_status ${pv.license_status} ≠ the source's ${want}`);
  }
  if (q.source?.source_id && ctx.sources && !ctx.sources.has(q.source.source_id)) return fail("P001", `source ${q.source.source_id} is not registered`);
  return pass("P001");
};

CHECK.P002 = (q) => (q.provenance?.official === false ? pass("P002") : fail("P002", "provenance.official must be false"));

const FORBIDDEN_LABELS = [
  /\bofficial\b/i,
  /\bministry\s+(?:exam|test|question)s?\b/i,
  /\bqiyas\b/i,
  /\b(?:past|previous)\s+(?:exam|test)s?\b/i,
  /وزاري(?:ة|ه|ات)?(?=$|[\s.,،؛:!؟?)»"'])/u,
  /من\s+اختبارات/u,
  /(?:اختبار|اختبارات|أسئلة|اسئلة|هيئة|مركز|نماذج|نموذج|منصة|بنك)\s+قياس(?=$|[\s.,،؛:!؟?)»"'])/u,
  /\(\s*قياس\s*\)/u,
  /(?:اختبار|أسئلة|اسئلة|نموذج)\s+رسمي/u,
  /(?:سنوات|اختبارات)\s+سابقة/u,
];

CHECK.P003 = (q, ctx) => {
  const text = [allText(itemTexts(q, ctx.stimuli?.get(q.stimulus_id)?.text)), ...(q.tags ?? [])].join("\n");
  const hit = FORBIDDEN_LABELS.map((re) => re.exec(text)).find(Boolean);
  return hit ? fail("P003", `forbidden label «${hit[0].trim()}»`) : pass("P003");
};

/** Pages an item cites (its source range plus evidence pages), or null. */
function citedPages(q) {
  const s = q.source;
  if (!s?.resource_id || !Number.isInteger(s.pdf_page_start)) return null;
  const pages = new Set();
  for (let p = s.pdf_page_start; p <= (s.pdf_page_end ?? s.pdf_page_start) && pages.size < 50; p++) pages.add(p);
  for (const e of s.evidence ?? []) pages.add(e.pdf_page);
  return [...pages].sort((a, b) => a - b);
}

function readPages(q, ctx) {
  const pages = citedPages(q);
  if (!pages) return { none: true };
  if (!ctx.pages) return { unread: pages };
  const got = pages.map((p) => ({ p, page: ctx.pages.get(q.source.resource_id, p) }));
  const unread = got.filter((g) => !g.page.readable).map((g) => g.p);
  return { unread, texts: got.filter((g) => g.page.readable).map((g) => g.page.text) };
}

CHECK.P004 = (q, ctx) => {
  const r = readPages(q, ctx);
  if (r.none) return pass("P004", "no cited pages");
  if (r.unread.length) return notChecked("P004", `page ${r.unread.join(", ")} has no trustworthy text or transcript yet`);
  const pageGrams = new Set();
  for (const t of r.texts) for (const g of charGrams(matchForm(t))) pageGrams.add(g);
  const allowed = new Set();
  const quotes = ctx.evidence ? ctx.evidence(q.id, q.revision) ?? [] : [];
  for (const e of quotes) {
    if (PERMITTED_QUOTE_KINDS.has(e.quote_kind) && typeof e.quote === "string" && [...e.quote].length <= MAX_QUOTE_CHARS) {
      for (const g of charGrams(matchForm(e.quote))) allowed.add(g);
    }
  }
  const t = itemTexts(q, ctx.stimuli?.get(q.stimulus_id)?.text);
  let worst = { run: 0, field: null };
  for (const [field, text] of [["stem", t.stem], ["stimulus", t.stimulus], ["explanation", t.explanation], ...t.options.map((o) => ["option", o])]) {
    const run = longestSharedRun(matchForm(text), pageGrams, allowed);
    if (run > worst.run) worst = { run, field };
  }
  return worst.run >= P004_RUN_CHARS
    ? fail("P004", `the ${worst.field} copies a ${worst.run}-char run from the cited pages (limit ${P004_RUN_CHARS - 1})`)
    : pass("P004", worst.run ? `longest shared run ${worst.run} chars` : null);
};

const FIGURE_RES = [
  /(?:الشكل|الرسم|الصورة|المخطط|التمثيل\s+البياني)\s+(?:المجاور|المجاورة|التالي|التالية|أدناه|ادناه|السابق|السابقة|المقابل|المقابلة)/u,
  /(?:في|من)\s+(?:الشكل|الرسم)\s*\(?\s*[0-9٠-٩]+/u,
  /الجدول\s+(?:المجاور|أدناه|ادناه|التالي|السابق|المقابل)/u,
  /\b(?:in|from|see|shown\s+in|using)\s+the\s+(?:figure|diagram|picture|graph|image|drawing)\b/i,
  /\bthe\s+(?:figure|diagram|table|graph)\s+(?:below|above|opposite|shown)\b/i,
  /\bfigure\s+\d/i,
];

/** Cells of a tabular stimulus (≥ 2 lines with ≥ 2 cells separated by | or tab), else null. */
export function tableCells(text) {
  const rows = String(text ?? "").split(/\n/).map((l) => l.split(/\t|\|/).map((c) => c.trim()).filter(Boolean)).filter((r) => r.length >= 2);
  return rows.length >= 2 ? rows.flat() : null;
}

CHECK.P005 = (q, ctx) => {
  const t = itemTexts(q, null);
  const refText = [t.stem, ...t.options].join("\n");
  const ref = FIGURE_RES.map((re) => re.exec(refText)).find(Boolean);
  const stimulus = ctx.stimuli?.get(q.stimulus_id)?.text ?? null;
  if (ref && !stimulus) return fail("P005", `figure reference «${ref[0]}» without a text stimulus`);
  const cells = stimulus ? tableCells(stimulus) : null;
  if (!cells) return pass("P005");
  const r = readPages(q, ctx);
  if (r.none) return pass("P005", "table stimulus without cited pages");
  if (r.unread.length) return notChecked("P005", `page ${r.unread.join(", ")} has no trustworthy text to compare the table with`);
  const page = ` ${r.texts.map(matchForm).join(" ")} `;
  const copied = cells.filter((c) => {
    const m = matchForm(c);
    return m && (/^[-0-9.,/ ]+$/.test(m) ? page.includes(` ${m} `) : m.length >= 4 && page.includes(m));
  });
  if (copied.length > P005_MAX_CELLS) return fail("P005", `the table copies ${copied.length} cells from the book (max ${P005_MAX_CELLS})`);
  const numeric = cells.filter((c) => /^[-0-9.,/ ]+$/.test(matchForm(c)));
  const numericCopied = numeric.filter((c) => copied.includes(c));
  if (numeric.length >= 3 && numericCopied.length === numeric.length) return fail("P005", "the table keeps the book's data unchanged (change the values)");
  return pass("P005");
};

/** Numbers written in a text (Western, Arabic-Indic, decimals, fractions). */
function numbersIn(text) {
  const out = [];
  for (const m of String(text ?? "").matchAll(/[-−]?[0-9٠-٩۰-۹]+(?:[.,٫][0-9٠-٩۰-۹]+)?(?:\/[0-9٠-٩۰-۹]+)?/gu)) {
    const n = parseNumber(m[0]);
    if (n.ok) out.push(n.value);
  }
  return out;
}

CHECK.P006 = (q) => {
  const ex = q.explanation;
  const text = str(ex?.text).trim();
  const steps = (ex?.steps ?? []).map(str).filter((s) => s.trim());
  if (!text && !steps.length) return fail("P006", "explanation missing");
  const math = MATH_SUBJECTS.has(subjectSlug(q)) || q.question_type === "numeric" || q.item_style === "computation";
  if (math && ["mcq", "numeric", "short_answer"].includes(q.question_type)) {
    // Legacy items keep their worked solution in the text: it is the one step.
    const pool = steps.length ? steps : [text];
    const ans = answerText(q);
    const computed = q.computation ? computeValue(q).value : null;
    // The computed answer = every number of the key (or the computed value);
    // a key without numbers must appear as text.
    const targets = q.question_type === "numeric" ? [parseDecimal(q.payload?.answer?.value)].filter(Boolean) : numbersIn(ans);
    if (isRational(computed) && !targets.some((v) => cmp(v, computed) === 0)) targets.push(computed);
    const has = pool.some((s) => {
      if (targets.length) {
        const found = numbersIn(s);
        return targets.every((v) => found.some((n) => cmp(n, v) === 0));
      }
      return norm(ans) !== "" && norm(s).includes(norm(ans));
    });
    return has ? pass("P006") : fail("P006", "no explanation step contains the computed answer");
  }
  return text ? pass("P006") : fail("P006", "explanation text is empty");
};

CHECK.D001 = (q, ctx) => {
  let fresh;
  try {
    fresh = contentHash(q, { stimulusText: ctx.stimuli?.get(q.stimulus_id)?.text ?? null });
  } catch (e) {
    return fail("D001", `content hash not computable: ${e.message}`);
  }
  if (fresh !== q.content_hash) return fail("D001", "content_hash is stale (recompute it; edits need a new revision)");
  const others = (ctx.byContentHash?.get(q.content_hash) ?? []).filter((id) => {
    if (id === q.id) return false;
    const st = ctx.questions?.get(id)?.status;
    return st !== "rejected" && st !== "retired";
  });
  return others.length ? fail("D001", `exact duplicate of ${others[0]}`) : pass("D001");
};

// ── running the checks ──────────────────────────────────────────────────────
/**
 * Run every Appendix B check on one question.
 * @returns {{ checks, verdict: "pass"|"warn"|"fail", outcome: "pass"|"reject"|"review", failed: string[], review: string[] }}
 */
export function runChecks(q, ctx = {}) {
  const results = CHECK_CODES.map((code) => {
    try {
      return CHECK[code](q, ctx);
    } catch (e) {
      return fail(code, `check crashed: ${e.message}`);
    }
  });
  const hard = results.filter((c) => c.result === "fail" && !REVIEW_CODES.has(c.code));
  const review = results.filter((c) => c.review || (c.result === "fail" && REVIEW_CODES.has(c.code)));
  return {
    checks: results.map(({ code, result, detail }) => ({ code, result, detail })),
    verdict: results.some((c) => c.result === "fail") ? "fail" : results.some((c) => c.result === "warn") ? "warn" : "pass",
    outcome: hard.length ? "reject" : review.length ? "review" : "pass",
    failed: hard.map((c) => c.code),
    review: review.map((c) => c.code),
  };
}

/** Run one check by code (tests, diagnostics). */
export function runCheck(code, q, ctx = {}) {
  if (!CHECK[code]) throw new Error(`unknown check ${code}`);
  return CHECK[code](q, ctx);
}

/**
 * High-risk items (§4.4): numeric or computation; source_derived with a
 * number or date in the answer; Quran/hadith quotes or Islamic studies;
 * difficulty ≥ 4; any Stage 1 warn; every aptitude item.
 */
export function isHighRisk(q, checks = []) {
  if (q.scope === "aptitude") return true;
  if (q.question_type === "numeric" || q.item_style === "computation") return true;
  if ((q.difficulty ?? 0) >= 4) return true;
  if (q.provenance?.origin === "source_derived") {
    let ans = "";
    try {
      ans = canonicalAnswer(q.question_type, q.payload);
    } catch {
      ans = answerText(q);
    }
    if (/[0-9٠-٩۰-۹]/.test(ans)) return true;
  }
  if ((q.source?.evidence ?? []).some((e) => e.quote_kind === "quran" || e.quote_kind === "hadith")) return true;
  if (ISLAMIC_SUBJECTS.has(subjectSlug(q))) return true;
  return checks.some((c) => c.result === "warn");
}

/** Index helpers for a bank: id counts and content-hash → ids. */
export function bankIndexes(questions) {
  const idCounts = new Map();
  const byContentHash = new Map();
  for (const q of questions) {
    idCounts.set(q.id, (idCounts.get(q.id) ?? 0) + 1);
    if (!byContentHash.has(q.content_hash)) byContentHash.set(q.content_hash, []);
    byContentHash.get(q.content_hash).push(q.id);
  }
  return { idCounts, byContentHash };
}

