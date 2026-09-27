// ============================================================================
// Arabic PDF text-layer repair (docs/CONTENT_ENGINE.md §4.2 step 2).
//
// The iEN textbooks' text layer is damaged in known ways; every fix here is
// recorded as a page flag and nothing is guessed that a lexicon or the line
// itself cannot confirm:
//   - presentation forms (U+FB50–FDFF, U+FE70–FEFF) and ligatures → NFKC
//     (only those ranges: ² ½ and friends stay)                      presentation_forms_fixed
//   - reversed runs (visual-order lines)                                reversed_fixed
//   - tatweel removed, bidi controls stripped, U+FFFD dropped (a damaged token)
//   - lam-ligature order («املقرر» → «المقرر», «األول» → «الأول»)       ligature_fixed
//   - letters split by spaces («المتخ ض ض ين» → «المتخضضين»)            split_letters_fixed
//   - font garbage (Arabic glyphs mapped to Latin: «õcôŸG»)             font_garbage
// and a per-page text_quality: ok | repaired | untrusted.
//
// Pure functions; the lexicon is passed in (scripts/content/lib/lexicon.mjs).
// ============================================================================

import { normalizeTitle } from "../../../src/lib/content/normalize.js";

// ── character classes ───────────────────────────────────────────────────────
const AR_LETTER = "\\u0621-\\u063A\\u0641-\\u064A\\u0671-\\u06D3";
export const ARABIC_LETTER_RE = new RegExp(`[${AR_LETTER}]`);
const ARABIC_LETTER_G = new RegExp(`[${AR_LETTER}]`, "g");
const PRESENTATION_RE = /[\uFB50-\uFDFF\uFE70-\uFEFC]/;
const PRESENTATION_G = /[\uFB50-\uFDFF\uFE70-\uFEFC]/g;
const BIDI_G = /[\u061C\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
const TATWEEL_G = /\u0640/g;
const LATIN_LETTER_G = /[A-Za-zÀ-ÖØ-öø-ɏ]/g;
const NON_ASCII_LATIN_G = /[À-ÖØ-öø-ɏ]/g;
const PUA_G = /[\uE000-\uF8FF]/g;
const CONTROL_G = /[\u0000-\u0008\u000B-\u001F\u007F]/g;
const DIGIT_G = /[0-9٠-٩۰-۹]/g;
const ALEFS = new Set(["ا", "أ", "إ", "آ"]);
const ALEF_LAM = new Set(["ا", "أ", "إ", "آ", "ٱ", "ل"]);
/** Letters that do not join the following letter (right-joining only). */
const NON_JOINING = new Set(["ا", "أ", "إ", "آ", "ٱ", "د", "ذ", "ر", "ز", "و", "ؤ", "ة", "ى", "ء"]);
/** Initial presentation forms of the dual-joining letters (FE70–FEFC). */
const INITIAL_FORMS = new Set([
  0xfe8b, 0xfe91, 0xfe97, 0xfe9b, 0xfe9f, 0xfea3, 0xfea7, 0xfeb3, 0xfeb7, 0xfebb, 0xfebf,
  0xfec3, 0xfec7, 0xfecb, 0xfecf, 0xfed3, 0xfed7, 0xfedb, 0xfedf, 0xfee3, 0xfee7, 0xfeeb, 0xfef3,
].map((c) => String.fromCodePoint(c)));

export const isArabicLetter = (c) => typeof c === "string" && c.length > 0 && ARABIC_LETTER_RE.test(c);
/** A letter that connects to the next one (so a gap after it is not a word break). */
export const joinsNext = (c) => isArabicLetter(c) && !NON_JOINING.has(c);
const count = (s, re) => (String(s).match(re) || []).length;

// ── small folds ─────────────────────────────────────────────────────────────
export const stripBidi = (s) => String(s ?? "").replace(BIDI_G, "").replace(CONTROL_G, "");
export const removeTatweel = (s) => String(s ?? "").replace(TATWEEL_G, "");

/** NFKC on presentation-form characters only. */
export function foldPresentationForms(s) {
  const src = String(s ?? "");
  if (!PRESENTATION_RE.test(src)) return { text: src, changed: false };
  let changed = false;
  const text = src.replace(PRESENTATION_G, (c) => {
    const n = c.normalize("NFKC");
    if (n !== c) changed = true;
    return n;
  });
  return { text, changed };
}

/** Letter shares of a text (Arabic letters, Latin letters, digits), rounded to 2 decimals. */
export function scriptShares(text) {
  const a = count(text, ARABIC_LETTER_G);
  const l = count(text, LATIN_LETTER_G);
  const d = count(text, DIGIT_G);
  const t = a + l + d;
  const r = (x) => (t ? Math.round((x / t) * 100) / 100 : 0);
  return { arabic: r(a), latin: r(l), digits: r(d) };
}

// ── reversed runs ───────────────────────────────────────────────────────────
function arabicTokens(line) {
  return String(line).split(/\s+/).filter((t) => ARABIC_LETTER_RE.test(t.normalize("NFKC")) || PRESENTATION_RE.test(t));
}

/**
 * A line is in visual (reversed) order when more than 30 % of its Arabic
 * tokens start with a letter that cannot start a word (ة, ى) or end with an
 * initial presentation form. Call on the raw line (before NFKC).
 */
export function isReversedLine(rawLine) {
  const tokens = arabicTokens(stripBidi(rawLine));
  if (!tokens.length) return false;
  let bad = 0;
  for (const t of tokens) {
    const letters = [...t].filter((c) => isArabicLetter(c.normalize("NFKC")[0]) || PRESENTATION_RE.test(c));
    if (!letters.length) continue;
    const first = letters[0].normalize("NFKC")[0];
    const last = letters[letters.length - 1];
    if (first === "ة" || first === "ى" || INITIAL_FORMS.has(last)) bad++;
  }
  return bad / tokens.length > 0.3;
}

const LTR_RUN = "[0-9\\u0660-\\u0669\\u06F0-\\u06F9A-Za-z]+(?:[.,:/\\u066B\\u066C-][0-9\\u0660-\\u0669\\u06F0-\\u06F9A-Za-z]+)*";
const RUNS_G = new RegExp(`${LTR_RUN}|[^0-9\\u0660-\\u0669\\u06F0-\\u06F9A-Za-z]+`, "g");
const MIRROR = { "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{", "«": "»", "»": "«", "<": ">", ">": "<" };

/** Reverse a visual-order line; digit and Latin runs keep their order. */
export function reverseLine(line) {
  const runs = String(line).match(RUNS_G) || [];
  return runs
    .reverse()
    .map((r) => (new RegExp(`^${LTR_RUN}$`).test(r) ? r : [...r].reverse().map((c) => MIRROR[c] ?? c).join("")))
    .join("");
}

// ── font garbage ────────────────────────────────────────────────────────────
/** Latin words that legitimately appear in Arabic textbooks (URLs, units, labels). */
export const LATIN_DICTIONARY = new Set(
  ("www http https com org net edu gov sa moe ien fb isbn pdf page unit lesson chapter part term " +
    "the and of to in on for with from by is are be this that it as at or an a i you we they he she " +
    "cm mm km kg mg ml m g s l n pa hz kw kwh ph co no dna rna atp " +
    "math mathematics science physics chemistry biology english grammar reading writing listening speaking " +
    "ai eps psd indd tif tiff jpg jpeg png svg " +
    "student book workbook activity teacher guide review test exam quiz answer answers key example exercise " +
    "exercises practice figure table contents index glossary appendix hello goodbye yes vocabulary " +
    "first second third semester level grade new english mega goal smart class super " +
    "x y z a b c d e f t v w k h r p q u o j").split(/\s+/),
);

/**
 * Font garbage: Arabic glyphs mapped to Latin code points («õcôŸG»,
 * «°üØdG π ådÉãdG»). In an Arabic-context resource a line is garbage when its
 * Latin-letter share is > 40 % (≥ 4 Latin letters) and fewer than half of its Latin tokens look
 * like words (ASCII, regular case, a dictionary word or ≥ 3 letters with a
 * vowel), or when it holds a token of ≥ 3 Latin letters with non-ASCII Latin
 * letters that is not a dictionary word. Private Use Area glyphs
 * (symbol-font encodings, U+F0xx) are garbage in any language.
 */
export function isFontGarbage(line, { language = "ar" } = {}) {
  const s = String(line ?? "");
  const pua = count(s, PUA_G);
  if (pua >= 3 || (pua > 0 && pua / Math.max(1, s.replace(/\s+/g, "").length) > 0.3)) return true;
  if (language !== "ar") return false;
  const latin = count(s, LATIN_LETTER_G);
  if (latin === 0) return false;
  const arabic = count(s, ARABIC_LETTER_G);
  const tokens = s.split(/[\s.\-/:,()@_]+/).filter((t) => count(t, LATIN_LETTER_G) >= 2 && !/[0-9]/.test(t));
  const plausible = tokens.filter(isPlausibleLatinWord).length;
  if (latin >= 4 && latin / (latin + arabic) > 0.4 && tokens.length && plausible / tokens.length < 0.5) return true;
  return tokens.some((t) => count(t, LATIN_LETTER_G) >= 3 && count(t, NON_ASCII_LATIN_G) >= 1 && !LATIN_DICTIONARY.has(t.toLowerCase()));
}

/** ASCII, regular case (lower, UPPER or Capitalized), and an acronym, a dictionary word or ≥ 3 letters with a vowel. */
export function isPlausibleLatinWord(token) {
  const t = String(token).replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
  if (!/^(?:[A-Z]?[a-z]+|[A-Z]+)$/.test(t)) return false;
  if (/^[A-Z]{2,5}$/.test(t)) return true; // acronyms and print-slug codes
  return LATIN_DICTIONARY.has(t.toLowerCase()) || (t.length >= 3 && /[aeiouyAEIOUY]/.test(t));
}

// ── lam-ligature order ──────────────────────────────────────────────────────
// The text layer emits the alef of a lam-alef glyph BEFORE the lam:
//   «املقرر» (ا م ل…) for «المقرر», «اجلزء» for «الجزء»,
//   «األول» (ا أ ل…) for «الأول», «االبتدائي» for «الابتدائي».
// Rule A (always safe: Arabic words never start with two alefs):
//   ^ا[أإآا]ل… → ال[أإآا]…  (a doubled hamza-alef, «األأعداد», is dropped)
// Rule B: ^ا X ل… (X a letter other than alef/lam, word ≥ 4 letters, not in
//   the lexicon) → ال X…; validated when the result is in the lexicon,
//   applied unvalidated only on a page that shows the defect elsewhere
//   (a rule-A or validated rule-B repair).
// Rule C: inside a word, an alef+lam pair is swapped to lam+alef only when
//   the result is in the lexicon.
// An optional one-letter prefix (و ف ب ك) is kept.
const WORD_PREFIXES = new Set(["و", "ف", "ب", "ك"]);
const LETTER_RUN_G = new RegExp(`[${AR_LETTER}\u064B-\u0652\u0670]+`, "g");

function lamCandidate(body) {
  if (body.length >= 4 && body[0] === "ا" && ALEFS.has(body[1]) && body[2] === "ل") {
    // «األأعداد», «اإلإيداع»: some fonts emit the hamza-alef twice (ligature + base glyph).
    const rest = body[3] === body[1] && body[1] !== "ا" ? body.slice(4) : body.slice(3);
    return { text: "ال" + body[1] + rest, rule: "A" };
  }
  if (body.length >= 4 && body[0] === "ا" && isArabicLetter(body[1]) && !ALEF_LAM.has(body[1]) && body[2] === "ل") {
    return { text: "ال" + body[1] + body.slice(3), rule: "B" };
  }
  return null;
}

/**
 * Repair one Arabic word. Returns { text, kind } where kind is null (no
 * change), "safe" (rule A), "lexicon" (validated) or "unvalidated".
 */
export function repairLamWord(word, lexicon, { aggressive = false } = {}) {
  const w = String(word ?? "");
  if (w.length < 4 || (lexicon && lexicon.has(w))) return { text: w, kind: null };
  const known = (s) => Boolean(lexicon && lexicon.has(s));
  const tries = [["", w]];
  if (WORD_PREFIXES.has(w[0]) && w.length >= 5) tries.push([w[0], w.slice(1)]);
  for (const [prefix, body] of tries) {
    const c = lamCandidate(body);
    if (!c) continue;
    const text = prefix + c.text;
    if (c.rule === "A") {
      if (known(text)) return { text, kind: "lexicon" };
      // A second lam-alef glyph inside the same word («اإلسالم» → «الإسالم» → «الإسلام»):
      // swapped only when the lexicon confirms the result.
      const inner = innerSwap(text, known, 3);
      return inner ? { text: inner, kind: "lexicon" } : { text, kind: "safe" };
    }
    if (known(text)) return { text, kind: "lexicon" };
    const inner = innerSwap(text, known, 3);
    if (inner) return { text: inner, kind: "lexicon" };
    if (aggressive) return { text, kind: "unvalidated" };
  }
  // Rule C: swap an inner alef+lam pair when that makes a known word.
  const inner = innerSwap(w, known, 1);
  if (inner) return { text: inner, kind: "lexicon" };
  return { text: w, kind: null };
}

/** Rule C: the first inner alef+lam → lam+alef swap (from index `from`) whose result is a known word, else null. */
function innerSwap(w, known, from) {
  for (let i = from; i + 1 < w.length; i++) {
    if (ALEFS.has(w[i]) && w[i + 1] === "ل") {
      const text = w.slice(0, i) + "ل" + w[i] + w.slice(i + 2);
      if (known(text)) return text;
    }
  }
  return null;
}

/** Apply repairLamWord to every Arabic letter run of a line. */
export function repairLamLine(line, lexicon, { aggressive = false } = {}) {
  const stats = { repairs: 0, validated: 0, unvalidated: 0 };
  const text = String(line ?? "").replace(LETTER_RUN_G, (run) => {
    const r = repairLamWord(run, lexicon, { aggressive });
    if (r.kind) {
      stats.repairs++;
      if (r.kind === "unvalidated") stats.unvalidated++;
      else stats.validated++;
    }
    return r.text;
  });
  return { text, ...stats };
}

/** Would this line produce a rule-A or lexicon-validated rule-B repair? (page defect evidence) */
export function lamDefectEvidence(line, lexicon) {
  let n = 0;
  for (const m of String(line ?? "").matchAll(LETTER_RUN_G)) {
    const r = repairLamWord(m[0], lexicon, { aggressive: false });
    if (r.kind === "safe" || r.kind === "lexicon") n++;
  }
  return n;
}

// ── split letters ───────────────────────────────────────────────────────────
const isSingleLetterToken = (t, next) => t.length === 1 && isArabicLetter(t) && t !== "و" && !/^[).\-:]/.test(next ?? "");
const isArabicWord = (t) => Boolean(t) && [...t].every((c) => isArabicLetter(c) || /[\u064B-\u0652\u0670]/.test(c));
/** Letters that only end a word (nothing can follow them inside the same word). */
const WORD_FINAL = new Set(["\u0629", "\u0649"]);

/**
 * Join runs of single Arabic letters separated by spaces inside a word
 * («المتخ ض ض ين» → «المتخضضين»). A run is joined with its neighbouring
 * fragments when the joined form is a lexicon word; unconfirmed, when it holds
 * two single letters between two fragments (two single-letter words in a row
 * do not occur in Arabic prose; «و» is never counted) or three or more, or when one letter sits between an unknown fragment and a short
 * unknown fragment and the joined form is no longer than the line's longest
 * token (at least 10). Nothing is joined across ة / ى, digits or a known word.
 */
export function joinSplitLetters(line, lexicon) {
  const tokens = String(line ?? "").split(/ +/);
  const known = (s) => Boolean(lexicon && lexicon.has(s));
  const maxLen = Math.max(0, ...tokens.map((t) => t.length));
  const out = [];
  let joins = 0;
  let validated = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (!isSingleLetterToken(tokens[i], tokens[i + 1])) {
      out.push(tokens[i]);
      continue;
    }
    let j = i;
    while (j < tokens.length && isSingleLetterToken(tokens[j], tokens[j + 1])) j++;
    const singles = tokens.slice(i, j).join("");
    const prev = out.length && isArabicWord(out[out.length - 1]) ? out[out.length - 1] : null;
    const next = j < tokens.length && isArabicWord(tokens[j]) ? tokens[j] : null;
    const options = [
      [prev, next],
      [prev, null],
      [null, next],
    ].filter(([p, n]) => p || n);
    let chosen = null;
    for (const [p, n] of options) {
      if (p && WORD_FINAL.has(p[p.length - 1])) continue; // «النقطة أ»: ة / ى end a word
      if (known((p ?? "") + singles + (n ?? ""))) {
        chosen = [p, n];
        validated++;
        break;
      }
    }
    if (!chosen) {
      // Unconfirmed joins are heuristics: a split word has fragments on both
      // sides («المو ص وع»), or a run of single letters («المتخ ض ض ين»).
      // Never across a word-final letter, a digit or a known word, and a lone
      // letter without Arabic neighbours («1447 ه», «ص 45») is left alone.
      const prevFrag = prev && !WORD_FINAL.has(prev[prev.length - 1]) ? prev : null;
      const nextFrag = next && next.length <= 3 && !known(next) ? next : null;
      if (j - i >= 3 || (j - i === 2 && prevFrag && nextFrag)) {
        chosen = [prevFrag, nextFrag];
      } else if (j - i === 1 && prevFrag && nextFrag && !known(prevFrag)) {
        const joined = prevFrag + singles + nextFrag;
        if (joined.length <= Math.max(maxLen, 10)) chosen = [prevFrag, nextFrag];
      }
    }
    if (!chosen) {
      out.push(...tokens.slice(i, j));
      i = j - 1;
      continue;
    }
    const [p, n] = chosen;
    if (p) out.pop();
    out.push((p ?? "") + singles + (n ?? ""));
    joins++;
    i = n ? j : j - 1;
  }
  return { text: out.join(" "), joins, validated };
}

// ── line and page repair ────────────────────────────────────────────────────
const FLAG_ORDER = [
  "reversed_fixed", "presentation_forms_fixed", "ligature_fixed", "split_letters_fixed",
  "font_garbage", "low_text", "no_text_layer", "two_column", "vision_read",
];
export const sortFlags = (flags) => FLAG_ORDER.filter((f) => flags.has(f));
const countArabicTokens = (s) => String(s).split(/\s+/).filter((t) => ARABIC_LETTER_RE.test(t)).length;

/** Steps that need no lexicon: bidi, reversal, presentation forms, tatweel, garbage, U+FFFD. */
export function prepareLine(raw, { language = "ar" } = {}) {
  const flags = new Set();
  let s = stripBidi(raw);
  if (language === "ar" && isReversedLine(s)) {
    s = reverseLine(s);
    flags.add("reversed_fixed");
  }
  const pf = foldPresentationForms(s);
  if (pf.changed) flags.add("presentation_forms_fixed");
  s = removeTatweel(pf.text);
  const garbage = isFontGarbage(s, { language });
  if (garbage) flags.add("font_garbage");
  const damaged = s.split(/\s+/).filter((t) => t.includes("\uFFFD")).length;
  s = s.replace(PUA_G, "").replace(/\uFFFD/g, "").replace(/[ \t\u00A0]+/g, " ").trim();
  return { text: s, flags, garbage, damaged };
}

/**
 * Repair one page of text lines (reading order, from pdf-text.mjs).
 * @param {string[]} lines raw lines
 * @param {{ lexicon, language?: "ar"|"en", images?: number, hasTextLayer?: boolean, extraFlags?: string[] }} o
 * @returns {{ raw, repaired, normalized, lines: string[], flags: string[], text_quality, char_count, stats }}
 */
export function repairPage(lines, { lexicon = null, language = "ar", images = 0, hasTextLayer = true, extraFlags = [] } = {}) {
  const rawLines = lines.map((l) => String(l ?? ""));
  const prepared = rawLines.map((l) => prepareLine(l, { language }));
  const flags = new Set(extraFlags);
  for (const p of prepared) for (const f of p.flags) flags.add(f);
  const aggressive = language === "ar" && prepared.some((p) => !p.garbage && lamDefectEvidence(p.text, lexicon) > 0);
  const stats = { lines: rawLines.length, arabic_tokens: 0, lam_repairs: 0, lam_validated: 0, lam_unvalidated: 0, split_joins: 0, split_validated: 0, damaged_tokens: 0, garbage_lines: 0 };
  const out = prepared.map((p) => {
    stats.damaged_tokens += p.damaged;
    if (p.garbage) stats.garbage_lines++;
    if (language !== "ar") return p.text;
    const lam = repairLamLine(p.text, lexicon, { aggressive });
    stats.lam_repairs += lam.repairs;
    stats.lam_validated += lam.validated;
    stats.lam_unvalidated += lam.unvalidated;
    const split = joinSplitLetters(lam.text, lexicon);
    stats.split_joins += split.joins;
    stats.split_validated += split.validated;
    return split.text;
  });
  if (stats.lam_repairs) flags.add("ligature_fixed");
  if (stats.split_joins) flags.add("split_letters_fixed");
  const repaired = out.join("\n");
  stats.arabic_tokens = countArabicTokens(repaired);
  const char_count = repaired.replace(/\s+/g, "").length;
  if (char_count < 20) flags.add("low_text");
  if (!hasTextLayer) flags.add("no_text_layer");
  // repair_rate: every fix per Arabic token (recorded per page and per book).
  // risk_rate: only the fixes a lexicon did not confirm (unvalidated lam
  // repairs, heuristic joins, damaged U+FFFD tokens); > 20 % → untrusted.
  const fixes = stats.lam_repairs + stats.split_joins + stats.damaged_tokens;
  const risky = stats.lam_unvalidated + (stats.split_joins - stats.split_validated) + stats.damaged_tokens;
  const rate = (n) => (stats.arabic_tokens ? Math.round((n / stats.arabic_tokens) * 1000) / 1000 : n ? 1 : 0);
  stats.repair_rate = rate(fixes);
  stats.risk_rate = rate(risky);
  stats.confidence = stats.lam_repairs ? Math.round((stats.lam_validated / stats.lam_repairs) * 1000) / 1000 : 1;
  let text_quality = "ok";
  if (!hasTextLayer || stats.garbage_lines > 0 || stats.risk_rate > 0.2 || (char_count < 20 && images > 0)) text_quality = "untrusted";
  else if (fixes > 0 || flags.has("reversed_fixed") || flags.has("presentation_forms_fixed")) text_quality = "repaired";
  return {
    raw: rawLines.join("\n"),
    repaired,
    normalized: normalizeTitle(repaired),
    lines: out,
    flags: sortFlags(flags),
    text_quality,
    char_count,
    stats,
  };
}

/** Repair a free text (e.g. a cached pNNN.txt): split into lines, then repairPage. */
export function repairText(text, o = {}) {
  return repairPage(String(text ?? "").split(/\r?\n/), o);
}

/** Worst of several text qualities (ok < repaired < untrusted). */
export function worstQuality(qualities) {
  const rank = { ok: 0, repaired: 1, untrusted: 2 };
  let worst = "ok";
  for (const q of qualities) if (rank[q] > rank[worst]) worst = q;
  return worst;
}

/** Trim to ≤ 80 chars (committed textbook excerpt limit, §1.3) on a word boundary when possible. */
export function excerpt80(text, max = 80) {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trim();
}
