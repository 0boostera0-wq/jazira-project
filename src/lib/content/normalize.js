// ============================================================================
// Content normalization, version n2 (docs/CONTENT_ENGINE.md, Appendix A).
//
//   searchNormalize(text)     search / short-answer grading / content hashes;
//                             mirrored exactly by SQL search_normalize_v2 (0014)
//   normalizeForDedup(text)   searchNormalize + lam_order_fold + number/operator
//                             folds (dedup, §4.5)
//   lamOrderFold(text)        matching-only fold for PDF lam-alef ligature order
//                             damage; applied to BOTH sides of a comparison,
//                             never to stored text
//   normalizeTitle(text)      searchNormalize + lamOrderFold (ids, registry, TOC)
//   normalizeExactMarks(text) NFC + whitespace collapse only (short answers with
//                             match: exact_marks)
//   trigramJaccard(a, b)      title similarity (id registry ≥ 0.85, TOC ≥ 0.6)
//
// Pure: no Node or browser APIs, safe on the server, the client and in tests.
// The step order is part of the contract (x² must never become x2, so
// superscripts are mapped BEFORE NFKC).
// ============================================================================

export const NORMALIZATION_VERSION = "n2";

// ── pre-NFKC: superscripts and vulgar fractions ────────────────────────────
const SUPERSCRIPTS = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
  "⁺": "+", "⁻": "-",
};
const SUPERSCRIPT_RUN_RE = /[⁰¹²³⁴-⁻]+/g;

const VULGAR_FRACTIONS = {
  "¼": "1/4", "½": "1/2", "¾": "3/4",
  "⅐": "1/7", "⅑": "1/9", "⅒": "1/10",
  "⅓": "1/3", "⅔": "2/3", "⅕": "1/5", "⅖": "2/5",
  "⅗": "3/5", "⅘": "4/5", "⅙": "1/6", "⅚": "5/6",
  "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8",
  "↉": "0/3",
};
const VULGAR_RE = /[¼-¾⅐-⅞↉]/g;

/** Superscript digits → `^n` (`x²` → `x^2`, `10⁻³` → `10^-3`); fractions → `n/d`. */
export function mapSuperscriptsAndFractions(text) {
  return String(text ?? "")
    .replace(SUPERSCRIPT_RUN_RE, (run) => "^" + [...run].map((c) => SUPERSCRIPTS[c]).join(""))
    .replace(VULGAR_RE, (c, offset, whole) => {
      // A fraction glued to a whole number is a mixed number: 2½ → "2 1/2".
      const prev = offset > 0 ? whole[offset - 1] : "";
      return (/[0-9٠-٩۰-۹]/.test(prev) ? " " : "") + VULGAR_FRACTIONS[c];
    });
}

// ── marks, letters, digits ──────────────────────────────────────────────────
const MARKS_RE = /[ً-ٰٟۖ-ۭـ]/g;
const LETTER_FOLD = {
  "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", // أ إ آ ٱ → ا
  "ى": "ي", "ئ": "ي", "ی": "ي", // ى ئ ی → ي
  "ؤ": "و", // ؤ → و
  "ة": "ه", // ة → ه
  "ک": "ك", // ک → ك
};
const LETTER_FOLD_RE = /[أإآٱىئیؤةک]/g;
const DIGITS_RE = /[٠-٩۰-۹]/g;
const foldDigit = (c) => {
  const cp = c.codePointAt(0);
  return String(cp >= 0x6f0 ? cp - 0x6f0 : cp - 0x660);
};

/** Strip tashkeel (U+064B–065F, U+0670, U+06D6–06ED) and tatweel. */
export const stripMarks = (text) => String(text ?? "").replace(MARKS_RE, "");
/** أ إ آ ٱ → ا · ى ئ ی → ي · ؤ → و · ة → ه · ک → ك */
export const foldLetters = (text) => String(text ?? "").replace(LETTER_FOLD_RE, (c) => LETTER_FOLD[c]);
/** Arabic-Indic and Persian digits → 0–9. */
export const foldDigits = (text) => String(text ?? "").replace(DIGITS_RE, foldDigit);

// ── case, invisible characters, punctuation, whitespace ────────────────────
const INVISIBLE_RE = /[​-‏‪-‮⁦-⁩]/g;
// . , ، ؛ ؟ ? ! : « » " ' ( )  and the Arabic decimal mark ٫ (kept between digits).
const PUNCT_RE = /[.,،؛؟?!:«»"'()٫]/g;
const KEEP_BETWEEN_DIGITS = new Set([".", ",", "٫"]);
const isAsciiDigit = (c) => c >= "0" && c <= "9";

function lowerCase(text) {
  // Per code point (no context-sensitive rules such as the Greek final sigma),
  // like PostgreSQL lower().
  let out = "";
  for (const ch of text) out += ch.toLowerCase();
  return out;
}

function punctuationToSpace(text) {
  return text.replace(PUNCT_RE, (c, i, s) =>
    KEEP_BETWEEN_DIGITS.has(c) && isAsciiDigit(s[i - 1] ?? "") && isAsciiDigit(s[i + 1] ?? "") ? c : " ");
}

const collapse = (text) => text.replace(/\s+/g, " ").trim();

/**
 * Search normalization v2 (= SQL `search_normalize_v2`), Appendix A column 1.
 * Used for search, `accepted_norm` short-answer grading and content hashes.
 */
export function searchNormalize(text) {
  let s = mapSuperscriptsAndFractions(text);
  s = s.normalize("NFKC");
  s = stripMarks(s);
  s = foldLetters(s);
  s = foldDigits(s);
  s = lowerCase(s);
  s = s.replace(INVISIBLE_RE, "");
  s = punctuationToSpace(s);
  return collapse(s);
}

// ── lam_order_fold ──────────────────────────────────────────────────────────
// The PDF text layer emits the alef of a lam-alef glyph before the lam
// («املقرر» for «المقرر», «األول» for «الأول», «االبتدائي» for «الابتدائي»).
// The fold makes both spellings equal: (1) a word starting ا X ل (X an Arabic
// letter other than lam/alef) becomes ا ل X; (2) every maximal run of
// alef forms and lam inside a word is sorted by code point.
const ALEF_LAM = new Set(["ا", "أ", "إ", "آ", "ٱ", "ل"]);
const isArabicLetter = (c) => c >= "ء" && c <= "ي";

function foldWord(word) {
  let w = word;
  if (w.length >= 3 && w[0] === "ا" && w[2] === "ل" && isArabicLetter(w[1]) && !ALEF_LAM.has(w[1])) {
    w = "ال" + w[1] + w.slice(3);
  }
  let out = "";
  let run = [];
  const flush = () => {
    if (run.length) out += run.sort().join("");
    run = [];
  };
  for (const ch of w) {
    if (ALEF_LAM.has(ch)) run.push(ch);
    else {
      flush();
      out += ch;
    }
  }
  flush();
  return out;
}

/** Matching-only fold for ligature-order damage. Never apply to stored text. */
export function lamOrderFold(text) {
  return String(text ?? "")
    .split(/(\s+)/)
    .map((part, i) => (i % 2 === 1 ? part : foldWord(part)))
    .join("");
}

/**
 * Title key for ids, the id registry and TOC alignment. ZWNJ/ZWJ (U+200C/D)
 * are word breaks here (a PDF text layer can glue «الفصل‌الدراسي» with one):
 * searchNormalize strips them, which would join the words before the
 * per-word lam-order fold runs.
 */
export function normalizeTitle(text) {
  return lamOrderFold(searchNormalize(String(text ?? "").replace(/[‌‍]/g, " ")));
}

// ── dedup normalization ─────────────────────────────────────────────────────
const DEDUP_SYMBOLS = { "−": "-", "×": "*", "÷": "/", "٪": "%" };

/**
 * `normalizeForDedup` (§4.5 step 1, Appendix A column 2): the v2 steps plus
 * lam_order_fold after NFKC, `٫` → `.`, `٬` dropped, and − × ÷ ٪ → - * / %.
 */
export function normalizeForDedup(text) {
  let s = mapSuperscriptsAndFractions(text);
  s = s.normalize("NFKC");
  s = lamOrderFold(s);
  s = stripMarks(s);
  s = foldLetters(s);
  s = foldDigits(s).replace(/٫/g, ".").replace(/٬/g, "");
  s = s.replace(/[−×÷٪]/g, (c) => DEDUP_SYMBOLS[c]);
  s = lowerCase(s);
  s = s.replace(INVISIBLE_RE, "");
  s = punctuationToSpace(s);
  return collapse(s);
}

/** Short answers with `match: exact_marks`: NFC and whitespace collapse only. */
export function normalizeExactMarks(text) {
  return collapse(String(text ?? "").normalize("NFC"));
}

// ── trigram similarity ──────────────────────────────────────────────────────
/** pg_trgm-style trigram set: each word padded as "  w ". */
export function trigramSet(text) {
  const set = new Set();
  for (const word of String(text ?? "").split(/\s+/)) {
    if (!word) continue;
    const chars = [" ", " ", ...word, " "];
    for (let i = 0; i + 3 <= chars.length; i++) set.add(chars.slice(i, i + 3).join(""));
  }
  return set;
}

/**
 * Trigram Jaccard of two titles after `normalizeTitle` (pass
 * `{ normalized: true }` when both are already normalized). J(∅, ∅) is 1 when
 * the strings are equal and 0 otherwise.
 */
export function trigramJaccard(a, b, { normalized = false } = {}) {
  const na = normalized ? String(a ?? "") : normalizeTitle(a);
  const nb = normalized ? String(b ?? "") : normalizeTitle(b);
  const A = trigramSet(na);
  const B = trigramSet(nb);
  if (A.size === 0 && B.size === 0) return na === nb ? 1 : 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}
