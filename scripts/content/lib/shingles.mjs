// ============================================================================
// Dedup tokens, shingles and similarity (docs/CONTENT_ENGINE.md §4.5 steps 1–5).
//
//   tokenize(text)          normalizeForDedup → tokens: numbers (decimals,
//                           fractions, 1,250), operators + - * / = < > ^ %,
//                           Latin words/variables, Arabic words (prefix-stripped),
//                           other symbols (√ π | ≤ …); punctuation separates.
//   stripPrefix(word)       ال وال بال فال كال لل + ≥ 3 letters, except the stoplist
//   canonicalizeMath(toks)  sorts operands of maximal commutative chains
//                           (a + b, a * b) where precedence allows: 8 × 7 ≡ 7 × 8
//   maskNumbers(toks)       numbers → "#" (numeric_variant detection)
//   wordShingles / charGrams / textShingles / optionShingles
//   jaccard(A, B, fallback) with J(∅, ∅) = fallback (exact-string equality)
//
// Pure: no I/O. Shingles are namespaced strings ("1:", "2:", "c:", "o…:") so
// stem, option and stimulus shingles never collide in whole-item sets.
// ============================================================================

import { normalizeForDedup } from "../../../src/lib/content/normalize.js";

/** Stems with at least this many tokens use word 1+2-shingles only. */
export const LONG_STEM_TOKENS = 10;
/** Character n-gram size for short stems and options. */
export const CHAR_GRAM = 4;

// ── prefix stripping ────────────────────────────────────────────────────────
/** Longest first; stripped only when ≥ 3 letters remain. */
export const ARTICLE_PREFIXES = Object.freeze(["وال", "بال", "فال", "كال", "ال", "لل"]);

/**
 * Letter-initial words that merely look like article + word (§4.5 step 2).
 * Stored normalized (the fold maps ة → ه, ى → ي, أ → ا …).
 */
export const PREFIX_STOPLIST = Object.freeze(
  [
    "كالسيوم", "كالسيت", "كالوري", "كالوريات", "كالسيفيرول",
    "بالون", "بالونات", "بالونة", "بالكون", "بالطو", "بالتيمور",
    "فالح", "فالنتين",
    "لله", "للة",
    "والد", "والده", "والدة", "والدان", "والدين", "والدي", "والدتي", "والي", "والى", "والا", "والتر",
    "البوم", "الماس", "الماني", "المانيا", "الاسكا", "الجبرا", "الفا", "الكان", "الكين", "الكاين", "الكيل",
  ].map((w) => normalizeForDedup(w)),
);
const STOP = new Set(PREFIX_STOPLIST);
const isLetter = (c) => /\p{L}/u.test(c);

export function stripPrefix(word) {
  if (STOP.has(word)) return word;
  // lam_order_fold turns «ال» + alef-initial word into «اال…» («الأولى» →
  // «االولي»); strip the article and keep the word's own alef.
  for (const head of ["", "و", "ب", "ف", "ك"]) {
    if (word.startsWith(`${head}اال`)) {
      const rest = `ا${word.slice(head.length + 3)}`;
      return [...rest].filter(isLetter).length >= 3 ? rest : word;
    }
  }
  for (const p of ARTICLE_PREFIXES) {
    if (word.startsWith(p)) {
      const rest = word.slice(p.length);
      if ([...rest].filter(isLetter).length >= 3) return rest;
      return word;
    }
  }
  return word;
}

// ── tokens ──────────────────────────────────────────────────────────────────
const NUM = "\\d+(?:,\\d{3})*(?:\\.\\d+)?(?:/\\d+(?:\\.\\d+)?)?";
const TOKEN_RE = new RegExp(`(${NUM})|([+\\-*/=<>^%])|([a-z]+)|([\\p{L}\\p{M}]+)|(\\p{S})`, "gu");
export const NUMBER_RE = new RegExp(`^-?${NUM}$`);
export const OPERATORS = new Set(["+", "-", "*", "/", "=", "<", ">", "^", "%"]);

export const isNumberToken = (t) => NUMBER_RE.test(t);
const isOperand = (t) => isNumberToken(t) || /^[a-z]+$/.test(t);

/**
 * Tokens of already-normalized text (see `tokenize`). A unary minus (at the
 * start, or after an operator or a word) is part of its number: `-11` is one
 * token, `x - 3` and `5 - 3` keep the binary minus.
 */
export function tokenizeNormalized(norm) {
  const out = [];
  for (const m of norm.matchAll(TOKEN_RE)) {
    if (m[4] !== undefined) out.push(/^[a-z]/.test(m[4]) ? m[4] : stripPrefix(m[4]));
    else if (m[1] !== undefined && out[out.length - 1] === "-" && !isOperand(out[out.length - 2] ?? "")) out[out.length - 1] = `-${m[1]}`;
    else out.push(m[0]);
  }
  return out;
}

/** normalizeForDedup + tokens + commutative canonicalization. */
export function tokenize(text) {
  return canonicalizeMath(tokenizeNormalized(normalizeForDedup(text)));
}

// Boundaries that forbid reordering a chain (precedence / non-commutative neighbours).
const PLUS_BAD_BEFORE = new Set(["-", "*", "/", "^", "%"]);
const PLUS_BAD_AFTER = new Set(["*", "/", "^", "%"]);
const TIMES_BAD_BEFORE = new Set(["/", "^", "%"]);
const TIMES_BAD_AFTER = new Set(["^"]);

/**
 * Sort the operands of maximal chains `x op y (op z)*` with op ∈ {+, *}
 * (× and ÷ were already folded to * and /), when the neighbours cannot change
 * the value: `8 * 7` ≡ `7 * 8`, `3 + x` ≡ `x + 3`, but `10 - 3 + 2` and
 * `a + b * c` are left alone. Returns a new array.
 */
export function canonicalizeMath(tokens) {
  const t = [...tokens];
  let i = 0;
  while (i < t.length) {
    const op = t[i + 1];
    if (!isOperand(t[i]) || (op !== "+" && op !== "*") || !isOperand(t[i + 2] ?? "")) {
      i++;
      continue;
    }
    let end = i + 2; // index of the last operand of the chain
    while (t[end + 1] === op && isOperand(t[end + 2] ?? "")) end += 2;
    const before = t[i - 1];
    const after = t[end + 1];
    const badBefore = op === "+" ? PLUS_BAD_BEFORE : TIMES_BAD_BEFORE;
    const badAfter = op === "+" ? PLUS_BAD_AFTER : TIMES_BAD_AFTER;
    // An operand glued to a + chain is an implicit product (`2x + 1`, `x2 + 1`).
    const glued = op === "+" && (isOperand(before ?? "") || isOperand(after ?? ""));
    if (!glued && !badBefore.has(before) && !badAfter.has(after)) {
      const operands = [];
      for (let k = i; k <= end; k += 2) operands.push(t[k]);
      operands.sort(cmpC);
      operands.forEach((o, n) => (t[i + 2 * n] = o));
    }
    i = end + 1;
  }
  return t;
}

/** Numbers → "#" (for numeric_variant: same text, different numbers). */
export const maskNumbers = (tokens) => tokens.map((x) => (isNumberToken(x) ? "#" : x));
export const numbersOf = (tokens) => tokens.filter(isNumberToken);

// ── shingles ────────────────────────────────────────────────────────────────
/** Word 1-shingles and 2-shingles. */
export function wordShingles(tokens, ns = "") {
  const set = new Set();
  for (let i = 0; i < tokens.length; i++) {
    set.add(`${ns}1:${tokens[i]}`);
    if (i + 1 < tokens.length) set.add(`${ns}2:${tokens[i]} ${tokens[i + 1]}`);
  }
  return set;
}

/** Character n-grams over the space-joined tokens, padded with one space each side. */
export function charGrams(tokens, ns = "", n = CHAR_GRAM) {
  const set = new Set();
  if (!tokens.length) return set;
  const chars = [...` ${tokens.join(" ")} `];
  if (chars.length <= n) {
    set.add(`${ns}c:${chars.join("")}`);
    return set;
  }
  for (let i = 0; i + n <= chars.length; i++) set.add(`${ns}c:${chars.slice(i, i + n).join("")}`);
  return set;
}

const union = (...sets) => {
  const out = new Set();
  for (const s of sets) for (const x of s) out.add(x);
  return out;
};

/**
 * Shingles of a stem-like text: word 1+2-shingles, plus character 4-grams
 * when `withChars` (short stems, < 10 tokens).
 */
export function textShingles(tokens, { withChars = tokens.length < LONG_STEM_TOKENS, ns = "" } = {}) {
  return withChars ? union(wordShingles(tokens, ns), charGrams(tokens, ns)) : wordShingles(tokens, ns);
}

/**
 * Option shingles: per option its word 1+2-shingles, padded char 4-grams and
 * the whole normalized option (options are short, so the characters carry the
 * signal; an instruction stem shared by many items never dominates).
 */
export function optionShingles(optionTokenLists) {
  const set = new Set();
  for (const toks of optionTokenLists) {
    for (const s of wordShingles(toks, "o")) set.add(s);
    for (const s of charGrams(toks, "o")) set.add(s);
    set.add(`O:${toks.join(" ")}`);
  }
  return set;
}

/** Jaccard |A ∩ B| / |A ∪ B|; `emptyValue` when both are empty (J(∅, ∅) is defined by the caller). */
export function jaccard(a, b, emptyValue = 0) {
  if (a.size === 0 && b.size === 0) return emptyValue;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let inter = 0;
  for (const x of small) if (large.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Round a similarity to 4 decimals (stable JSON output). */
export const round4 = (x) => (x === null || x === undefined ? null : Math.round(x * 10000) / 10000);

/** Byte-wise UTF-8 order (PostgreSQL COLLATE "C"). */
export function cmpC(a, b) {
  return Buffer.compare(Buffer.from(String(a), "utf8"), Buffer.from(String(b), "utf8"));
}
