// ============================================================================
// Arabic word lexicon for PDF text repair (docs/CONTENT_ENGINE.md §4.2 step 2).
//
// The lam-ligature and split-letter repairs are validated against this
// lexicon: a repair whose result is a known word is "validated"; the repair
// rate and the validated share are recorded per page and per book.
//
// Sources (clean Unicode, never PDF text): iEN titles (lessons.jsonl unit and
// lesson titles, nodes.jsonl, books.jsonl listing titles), the curriculum
// catalog research files (src/content/curriculum/verified-*.json) and a short
// seed list of front-matter / textbook vocabulary that titles rarely contain.
//
//   const lex = loadLexicon();          // from the repo (cached per root)
//   lex.has("المقرر")                   // true: "مقرر" is known; ال / و / ف / ب / ك / لل are stripped
//   createLexicon(["الجزء", …])         // tests
//
// Membership is checked on searchNormalize() keys (hamza, ta marbuta and
// alef maqsura folded, marks stripped), so «الأول» and «الاول» are equal.
// ============================================================================

import { existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { searchNormalize } from "../../../src/lib/content/normalize.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Front-matter and textbook-structure words that iEN titles rarely contain. */
export const SEED_WORDS = Object.freeze([
  "المقرر", "مقرر", "الجزء", "جزء", "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس",
  "الأولى", "الثانية", "الثالثة", "الفصل", "الدراسي", "الدراسية", "العام", "طبعة", "الطبعة",
  "المحتويات", "الفهرس", "فهرس", "قائمة", "الوحدة", "وحدة", "الدرس", "درس", "الدروس", "الصف",
  "الابتدائي", "المتوسط", "الثانوي", "المرحلة", "الابتدائية", "المتوسطة", "الثانوية", "التعليم",
  "العام", "وزارة", "المملكة", "العربية", "السعودية", "الطالب", "الطالبة", "الطلاب", "كتاب",
  "النشاط", "المعلم", "المعلمين", "المعلمات", "دليل", "مراجعة", "اختبار", "الاختبار", "تمارين",
  "مثال", "أمثلة", "تدرب", "تدريب", "تدريبات", "تحقق", "فهمك", "تأكد", "مسائل", "مهارات",
  "التفكير", "العليا", "التهيئة", "منتصف", "التراكمي", "تراكمية", "استكشاف", "المركز", "الوطني",
  "للمناهج", "المناهج", "الرياض", "حقوق", "الطبع", "والنشر", "محفوظة", "لوزارة", "المتخصصين",
  "فريق", "قام", "بالتأليف", "والمراجعة", "والتطوير", "الحمد", "لله", "والصلاة", "والسلام",
  "نبينا", "محمد", "وعلى", "آله", "وصحبه", "أجمعين", "وبعد", "المادة", "الحياتية", "المشكلات",
  "المسألة", "المسائل", "الأعداد", "العمليات", "المعادلات", "الدوال", "الجبر", "الهندسة",
  "القياس", "الإحصاء", "الاحتمالات", "الكسور", "النسبة", "التناسب", "العلوم", "الرياضيات",
  "الفيزياء", "الكيمياء", "الأحياء", "اللغة", "الإنجليزية", "لغتي", "الدراسات", "الإسلامية",
  "الاجتماعية", "المهارات", "الرقمية", "التربية", "الفنية", "البدنية", "الأسرية", "التفكير",
  "الناقد", "الموضوع", "المصطلحات", "مسرد", "الملاحق", "المراجع", "إجابات", "الإجابات", "حلول",
  "أهداف", "مقدمة", "المقدمة", "تمهيد", "تقويم", "مقنن", "تجربة", "استقصاء", "نموذج", "الشكل",
  "الجدول", "صفحة", "رقم", "الإيداع", "ردمك", "ه\u0640", "مقررات", "والتعليم", "الإثرائية", "منصة",
]);

const PREFIXES = ["و", "ف", "ب", "ك", "ل"];
const ARABIC_WORD_RE = /[ء-يٱ-ۓ]+/g;

/** Lexicon key: searchNormalize of one word (no spaces). */
export const lexiconKey = (word) => searchNormalize(word).replace(/\s+/g, "");

/** Candidate keys of a word: itself, without the article, without a one-letter prefix (+ article), without لل. */
export function keyVariants(word) {
  const k = lexiconKey(word);
  const out = new Set([k]);
  if (!k) return out;
  const stripArticle = (s) => (s.length > 4 && s.startsWith("ال") ? s.slice(2) : null);
  const a = stripArticle(k);
  if (a) out.add(a);
  if (k.length > 4 && k.startsWith("لل")) out.add(k.slice(2));
  for (const p of PREFIXES) {
    if (k.length > 3 && k.startsWith(p)) {
      const rest = k.slice(1);
      out.add(rest);
      const ra = stripArticle(rest);
      if (ra) out.add(ra);
    }
  }
  return out;
}

export class Lexicon {
  constructor() {
    this.keys = new Set();
  }

  /** Add one word (and its article-less form). */
  add(word) {
    const k = lexiconKey(word);
    if (k.length < 2) return this;
    this.keys.add(k);
    if (k.length > 3 && k.startsWith("ال")) this.keys.add(k.slice(2));
    return this;
  }

  /** Add every Arabic word of a text. */
  addText(text) {
    for (const m of String(text ?? "").matchAll(ARABIC_WORD_RE)) this.add(m[0]);
    return this;
  }

  /** True when the word (or its prefix/article-stripped form) is known. */
  has(word) {
    const variants = keyVariants(word);
    for (const k of variants) if (k.length >= 3 && this.keys.has(k)) return true;
    const exact = lexiconKey(word);
    return exact.length === 2 && this.keys.has(exact);
  }

  get size() {
    return this.keys.size;
  }
}

/** A lexicon from words and/or texts (tests, ad-hoc use). Seed words are included unless `seed: false`. */
export function createLexicon(words = [], { seed = true } = {}) {
  const lex = new Lexicon();
  if (seed) for (const w of SEED_WORDS) lex.add(w);
  for (const w of words) lex.addText(w);
  return lex;
}

function collectStrings(value, out) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) collectStrings(v, out);
  return out;
}

function readLines(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter((l) => l.trim()).map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

const loaded = new Map();

/**
 * The repo lexicon: iEN titles + catalog research files + seed words.
 * @param {{ root?: string, stagingDir?: string }} [o]
 */
export function loadLexicon({ root = REPO_ROOT, stagingDir = join(root, "data/staging") } = {}) {
  const cacheKey = `${root}|${stagingDir}`;
  if (loaded.has(cacheKey)) return loaded.get(cacheKey);
  const lex = createLexicon();
  const ien = join(stagingDir, "sources/ien");
  for (const r of readLines(join(ien, "lessons.jsonl"))) lex.addText(`${r.unit_title ?? ""} ${r.lesson_title ?? ""}`);
  for (const r of readLines(join(ien, "nodes.jsonl"))) lex.addText(r.title ?? "");
  for (const r of readLines(join(ien, "books.jsonl"))) lex.addText(r.title ?? "");
  for (const f of ["verified-k9.json", "verified-secondary.json"]) {
    const p = join(root, "src/content/curriculum", f);
    if (!existsSync(p)) continue;
    try {
      for (const s of collectStrings(JSON.parse(readFileSync(p, "utf8")), [])) lex.addText(s);
    } catch {
      // a malformed catalog file only shrinks the lexicon
    }
  }
  loaded.set(cacheKey, lex);
  return lex;
}
