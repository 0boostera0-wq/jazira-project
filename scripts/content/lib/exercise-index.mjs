// ============================================================================
// Exercise index (docs/CONTENT_ENGINE.md §2.6, exercise-index@1): which pages
// hold worked examples, exercises, reviews and answer keys, with a short
// canonical label («مثال 1», «تدرب 3», «اختبار الفصل»; ≤ 20 chars) and no
// body text. Built from repaired text lines or vision transcripts; used for
// packet targets (§4.3) and the coverage gaps (§8).
//
// Headings are recognised at the start of a line on normalized, lam-folded
// text, so «املثال» and «المثال» both match. The label is the canonical
// heading, never the book's sentence.
// ============================================================================

import { normalizeTitle } from "../../../src/lib/content/normalize.js";
import { parseLoneNumber } from "./pdf-text.mjs";

const fold = (s) => normalizeTitle(s);

/** [kind, canonical label, heading variants] — longest variants are tried first. */
export const EXERCISE_HEADINGS = Object.freeze([
  ["example", "مثال", ["المثال", "مثال", "أمثلة", "امثلة", "مثال محلول", "Example"]],
  ["exercise", "تحقق من فهمك", ["تحقق من فهمك"]],
  ["exercise", "تأكد", ["تأكد"]],
  ["exercise", "تدرب وحل المسائل", ["تدرب وحل المسائل"]],
  ["exercise", "التفكير العليا", ["مسائل مهارات التفكير العليا", "مهارات التفكير العليا"]],
  ["exercise", "تدرب", ["تدرب"]],
  ["exercise", "تدريبات", ["تدريبات", "تدريب"]],
  ["exercise", "تمارين", ["تمارين", "تمرين"]],
  ["exercise", "نشاط", ["نشاط"]],
  ["exercise", "Exercises", ["Exercises", "Practice"]],
  ["review", "تدريب على اختبار", ["تدريب على اختبار"]],
  ["review", "اختبار منتصف الفصل", ["اختبار منتصف الفصل"]],
  ["review", "اختبار الفصل", ["اختبار الفصل"]],
  ["review", "الاختبار التراكمي", ["الاختبار التراكمي"]],
  ["review", "مراجعة تراكمية", ["مراجعة تراكمية"]],
  ["review", "مراجعة الدرس", ["مراجعة الدرس"]],
  ["review", "مراجعة الفصل", ["مراجعة الفصل"]],
  ["review", "تقويم الفصل", ["تقويم الفصل"]],
  ["review", "اختبار مقنن", ["اختبار مقنن"]],
  ["review", "دليل الدراسة", ["دليل الدراسة والمراجعة", "دليل الدراسة"]],
  ["review", "Review", ["Chapter Review", "Chapter Test", "Review"]],
  ["answer_key", "إجابات", ["الإجابات", "إجابات", "إجابات مختارة", "حلول التمارين"]],
  ["answer_key", "Answer Key", ["Answer Key", "Selected Answers", "Answers"]],
]);

const PATTERNS = EXERCISE_HEADINGS.flatMap(([kind, label, variants]) => variants.map((v) => ({ kind, label, key: fold(v) })))
  .sort((a, b) => b.key.length - a.key.length);

/**
 * Match a heading at the start of a line.
 * @returns {{ kind, label } | null} label ≤ 20 chars, with the number that follows when unambiguous
 */
export function matchExerciseHeading(line) {
  // A TOC entry («مراجعة الفصل ........ 45») names a heading elsewhere; it is not one.
  if (/[.·…‥_]{4,}/.test(String(line ?? ""))) return null;
  const f = fold(line);
  if (!f) return null;
  for (const p of PATTERNS) {
    if (f !== p.key && !f.startsWith(p.key + " ")) continue;
    const rest = f.slice(p.key.length).trim().split(" ")[0] ?? "";
    const n = parseLoneNumber(rest);
    const label = n !== null && n < 1000 ? `${p.label} ${n}` : p.label;
    return { kind: p.kind, label: label.slice(0, 20) };
  }
  return null;
}

/**
 * Exercise-index rows of one page.
 * @param {{ resource_id, pdf_page, lines: (string|{text})[], lesson_node_id?, method?: "text"|"vision" }} o
 */
export function exerciseRows({ resource_id, pdf_page, lines, lesson_node_id = null, method = "text" }) {
  const seen = new Set();
  const rows = [];
  for (const l of lines) {
    const m = matchExerciseHeading(typeof l === "string" ? l : l.text);
    if (!m || seen.has(m.label)) continue;
    seen.add(m.label);
    rows.push({ schema: "exercise-index@1", resource_id, pdf_page, label: m.label, kind: m.kind, lesson_node_id, method });
  }
  return rows;
}

/** Sort key of the committed file: (pdf_page, label). */
export const compareExerciseRows = (a, b) => a.pdf_page - b.pdf_page || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0);

/** Dominant page kind from its exercise headings (review > exercise > answer_key), or null. */
export function exercisePageKind(rows) {
  const kinds = new Set(rows.map((r) => r.kind));
  if (kinds.has("answer_key")) return "answer_key";
  if (kinds.has("review")) return "review";
  if (kinds.has("exercise")) return "exercise";
  return null;
}
