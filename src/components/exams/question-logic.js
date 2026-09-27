// ============================================================================
// Question types — pure helpers for the runner inputs, the immediate check
// and the answer review (docs/CONTENT_ENGINE.md §2.8, §5.4, §5.7, §7).
// Unit-tested in tests/unit/exams-types.test.js.
//
// The client only ever sees and sends DISPLAY indexes (§5.4): options,
// matching columns and ordering items arrive as [{ index, text }] without
// ids, and responses are
//   mcq / true_false  { option_index }
//   matching          { pairs: [[left_index, right_index], …] }
//   ordering          { order: [item_index, …] }       (first shown item first)
//   short_answer      { text }
//   numeric           { value, unit? }
// The server maps them to canonical ids. Every helper here returns null for
// an empty response, so "answered" is simply `response !== null`.
//
// Legacy questions (the Qudurat/Tahsili bank, /api/exams/local, the 0010
// RPCs) have no `type`: they are mcq with `choices` and `selected_index`.
// ============================================================================
import { parseNumber } from "@/lib/content/answers";

export const QUESTION_TYPES = Object.freeze(["mcq", "true_false", "matching", "ordering", "short_answer", "numeric"]);
export const VERDICTS = Object.freeze(["correct", "incorrect", "partial", "unanswered", "voided"]);
export const MAX_NUMERIC_CHARS = 64;
export const MAX_UNIT_CHARS = 40;

const isIdx = (v) => Number.isInteger(v) && v >= 0 && v < 64;
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** The item's type; legacy items (no `type`) are mcq. */
export const typeOf = (q) => (QUESTION_TYPES.includes(q?.type) ? q.type : "mcq");
/** A template-engine item (it carries `type`) as opposed to a legacy bank item. */
export const isTemplateItem = (q) => typeof q?.type === "string";
export const isChoiceType = (type) => type === "mcq" || type === "true_false";

/**
 * Content language and base direction of one item (§7: from the item, no
 * longer hard-coded Arabic). Legacy items are Arabic.
 */
export function contentLang(q) {
  const lang = q?.language === "en" ? "en" : "ar";
  return { lang, dir: lang === "ar" ? "rtl" : "ltr" };
}

/** Display texts of a list of { index, text } rows, by display index. */
const textsOf = (list) => {
  const out = [];
  for (const row of Array.isArray(list) ? list : []) if (isIdx(row?.index)) out[row.index] = String(row.text ?? "");
  return out;
};

/** mcq / true_false option texts in display order. */
export function choicesOf(q) {
  if (Array.isArray(q?.choices) && q.choices.length) return q.choices.map((c) => String(c ?? ""));
  return textsOf(q?.options);
}
export const leftOf = (q) => (Array.isArray(q?.public?.left) ? q.public.left : []);
export const rightOf = (q) => (Array.isArray(q?.public?.right) ? q.public.right : []);
export const itemsOf = (q) => (Array.isArray(q?.public?.items) ? q.public.items : []);

// ── responses ───────────────────────────────────────────────────────────────

/**
 * Canonical client shape of a display response (whitelisted keys, empties →
 * null). Matching keeps one pair per left and per right item, sorted by left.
 */
export function normalizeResponse(type, r) {
  if (r === null || r === undefined) return null;
  if (typeof r === "number" && isChoiceType(type)) return isIdx(r) ? { option_index: r } : null;
  if (!isObj(r)) return null;
  switch (type) {
    case "mcq":
    case "true_false":
      return isIdx(r.option_index) ? { option_index: r.option_index } : null;
    case "matching": {
      if (!Array.isArray(r.pairs)) return null;
      const byLeft = new Map();
      const usedRight = new Set();
      for (const p of r.pairs) {
        if (!Array.isArray(p) || p.length !== 2 || !isIdx(p[0]) || !isIdx(p[1])) continue;
        if (byLeft.has(p[0]) || usedRight.has(p[1])) continue;
        byLeft.set(p[0], p[1]);
        usedRight.add(p[1]);
      }
      const pairs = [...byLeft.entries()].sort((a, b) => a[0] - b[0]);
      return pairs.length ? { pairs } : null;
    }
    case "ordering": {
      if (!Array.isArray(r.order) || !r.order.length || !r.order.every(isIdx)) return null;
      return new Set(r.order).size === r.order.length ? { order: [...r.order] } : null;
    }
    case "short_answer":
      return typeof r.text === "string" && r.text.trim() ? { text: r.text } : null;
    case "numeric": {
      const value = typeof r.value === "number" ? String(r.value) : r.value;
      if (typeof value !== "string" || !value.trim()) return null;
      const unit = typeof r.unit === "string" && r.unit.trim() ? r.unit.slice(0, MAX_UNIT_CHARS) : null;
      return unit ? { value: value.slice(0, MAX_NUMERIC_CHARS), unit } : { value: value.slice(0, MAX_NUMERIC_CHARS) };
    }
    default:
      return null;
  }
}

/**
 * The display response of a runner answer. Choice types keep the legacy
 * `selected` index (so the mcq path is unchanged); other types keep `response`.
 */
export function responseOf(q, answer) {
  const type = typeOf(q);
  if (isChoiceType(type)) return Number.isInteger(answer?.selected) ? { option_index: answer.selected } : null;
  return normalizeResponse(type, answer?.response);
}

export const isAnswered = (q, answer) => responseOf(q, answer) !== null;

/** Matching: the right index paired with a left index, or null. */
export function pairFor(response, left) {
  const p = (response?.pairs ?? []).find((x) => x[0] === left);
  return p ? p[1] : null;
}

/** Matching: pair `left` with `right` (null unpairs); a right item is used once. */
export function setPair(response, left, right) {
  const rest = (response?.pairs ?? []).filter(([l, r]) => l !== left && r !== right);
  if (isIdx(right)) rest.push([left, right]);
  return normalizeResponse("matching", { pairs: rest });
}

/** Matching progress: { done, total } (partial answers still count as answered). */
export function matchingProgress(q, response) {
  const total = leftOf(q).length;
  const lefts = new Set(leftOf(q).map((l) => l.index));
  const done = (response?.pairs ?? []).filter(([l]) => lefts.has(l)).length;
  return { done, total };
}

/**
 * Ordering: the order the learner currently sees — their answer, or the
 * shown order (display indexes 0…n−1) before they touch it.
 */
export function workingOrder(q, response) {
  const n = itemsOf(q).length;
  const order = response?.order;
  if (Array.isArray(order) && order.length === n && [...order].sort((a, b) => a - b).every((v, i) => v === i)) return [...order];
  return Array.from({ length: n }, (_, i) => i);
}

/** Move the item at position `from` to position `to` (both 0-based). */
export function moveItem(order, from, to) {
  const out = [...order];
  if (from < 0 || from >= out.length || to < 0 || to >= out.length || from === to) return out;
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
}

export const orderResponse = (order) => normalizeResponse("ordering", { order });

/** Short answer: the typed text (cut to max_chars), null when blank. */
export function textResponse(text, maxChars = 80) {
  const max = Number.isInteger(maxChars) && maxChars > 0 ? maxChars : 80;
  return normalizeResponse("short_answer", { text: String(text ?? "").slice(0, max) });
}

/** Numeric: { value, unit? }, null without a value. */
export const numericResponse = ({ value, unit } = {}) => normalizeResponse("numeric", { value, unit });

/**
 * Why a typed number will not be accepted, from a parseNumber() result
 * (src/lib/content/answers.js) and the item's input rules — shown before
 * saving so the learner can fix it. null = fine (or empty).
 * @returns {null | "ambiguous_separator" | "invalid_number" | "fraction_not_allowed" | "too_many_decimals"}
 */
export function numericIssue(parsed, input = null) {
  if (!parsed) return null;
  if (!parsed.ok) return parsed.reason === "ambiguous_separator" ? "ambiguous_separator" : "invalid_number";
  if (input && input.allow_fraction === false && parsed.fraction) return "fraction_not_allowed";
  if (input && Number.isInteger(input.max_decimals) && parsed.decimals > input.max_decimals) return "too_many_decimals";
  return null;
}

/**
 * Why a typed response cannot be stored or graded as it stands (the same
 * rules the server applies, src/lib/content/answers.js), else null. Only
 * numeric values can be malformed (an ambiguous "0,125", "12.5.", a fraction
 * where decimals are required, too many decimals); every other response the
 * inputs build is valid by construction.
 */
export function responseIssue(q, response) {
  if (typeOf(q) !== "numeric" || !response || typeof response.value !== "string" || !response.value.trim()) return null;
  return numericIssue(parseNumber(response.value), q?.public?.input ?? null);
}

/**
 * Is the response complete (every left matched, an order chosen, …)?
 * Incomplete answers still count as answered and are graded as they are.
 */
export function isComplete(q, response) {
  if (response === null || response === undefined) return false;
  if (typeOf(q) === "matching") {
    const { done, total } = matchingProgress(q, response);
    return total > 0 && done === total;
  }
  return true;
}

// ── review ──────────────────────────────────────────────────────────────────

/**
 * The review verdict of a result item: template items carry `verdict`
 * (§5.7) and `voided` (revision changed); legacy items `selected_index` and
 * `is_correct`.
 */
export function verdictOf(item) {
  if (!item) return "unanswered";
  if (item.voided) return "voided";
  if (typeof item.verdict === "string" && VERDICTS.includes(item.verdict)) return item.verdict;
  if (isTemplateItem(item)) return item.response ? "incorrect" : "unanswered";
  if (item.selected_index === null || item.selected_index === undefined) return "unanswered";
  return item.is_correct ? "correct" : "incorrect";
}

/** The learner's response of a result item (legacy: selected_index). */
export function reviewResponse(item) {
  if (isTemplateItem(item)) return normalizeResponse(typeOf(item), item.response);
  return Number.isInteger(item?.selected_index) ? { option_index: item.selected_index } : null;
}

/** The correct response of a result item, or null when it was not revealed. */
export function reviewCorrect(item) {
  if (isTemplateItem(item)) {
    const c = item.correct_response;
    if (!c) return null;
    const type = typeOf(item);
    if (type === "short_answer") return typeof c.text === "string" ? { text: c.text } : null;
    if (type === "numeric") return c.value === null || c.value === undefined ? null : { value: String(c.value), ...(c.unit ? { unit: String(c.unit) } : {}) };
    return normalizeResponse(type, c);
  }
  return Number.isInteger(item?.correct_index) ? { option_index: item.correct_index } : null;
}

/**
 * mcq / true_false review rows: every option in display order with whether
 * the learner chose it and whether it is correct.
 * @returns {{ index: number, text: string, chosen: boolean, correct: boolean }[]}
 */
export function optionRows(item) {
  const chosen = reviewResponse(item)?.option_index ?? null;
  const correct = reviewCorrect(item)?.option_index ?? null;
  const verdict = verdictOf(item);
  return choicesOf(item).map((text, index) => ({
    index,
    text,
    chosen: index === chosen,
    correct: index === correct,
    state: choiceState(index, chosen, { correct, verdict }),
  }));
}

/**
 * How one choice is coloured once its answer is known (review rows, and the
 * inputs after an immediate check): "correct" | "wrong" | "chosen" | "idle".
 * With the correct option revealed it decides; without it (past the
 * key-reveal cap, or a voided item) only the chosen option carries the
 * verdict — a right answer is never shown red, and a voided one stays
 * neutral ("chosen").
 * @param {number} index      the option's display index
 * @param {number|null} selected  the learner's display index
 * @param {{ correct?: number|null, verdict?: string|null }} reveal
 */
export function choiceState(index, selected, { correct = null, verdict = null } = {}) {
  const on = Number.isInteger(selected) && index === selected;
  if (Number.isInteger(correct)) return index === correct ? "correct" : on ? "wrong" : "idle";
  if (!on) return "idle";
  if (verdict === "correct") return "correct";
  if (verdict === "incorrect" || verdict === "partial") return "wrong";
  return "chosen";
}

/**
 * Matching review rows, one per left item in display order: the right item
 * the learner paired with it, the correct one, and whether they agree.
 * @returns {{ index: number, left: string, chosen: string|null, correct: string|null, ok: boolean|null }[]}
 */
export function matchingRows(item) {
  const right = textsOf(rightOf(item));
  const response = reviewResponse(item);
  const correct = reviewCorrect(item);
  return leftOf(item).map((l) => {
    const c = pairFor(response, l.index);
    const k = pairFor(correct, l.index);
    return {
      index: l.index,
      left: String(l.text ?? ""),
      chosen: c === null ? null : right[c] ?? null,
      correct: k === null ? null : right[k] ?? null,
      ok: correct ? c !== null && c === k : null,
    };
  });
}

/**
 * Ordering review rows, one per position: the learner's item, the correct
 * item and whether they agree.
 * @returns {{ position: number, chosen: string|null, correct: string|null, ok: boolean|null }[]}
 */
export function orderingRows(item) {
  const texts = textsOf(itemsOf(item));
  const response = reviewResponse(item);
  const correct = reviewCorrect(item);
  const n = Math.max(texts.length, response?.order.length ?? 0, correct?.order.length ?? 0);
  return Array.from({ length: n }, (_, position) => {
    const c = response?.order[position];
    const k = correct?.order[position];
    return {
      position,
      chosen: c === undefined ? null : texts[c] ?? null,
      correct: k === undefined ? null : texts[k] ?? null,
      ok: correct && response ? c === k : null,
    };
  });
}

/** A short-answer / numeric response as display text ("12.5 cm"). */
export function valueText(response) {
  if (!response) return null;
  if (typeof response.text === "string") return response.text;
  if (response.value === null || response.value === undefined) return null;
  return response.unit ? `${response.value} ${response.unit}` : String(response.value);
}

/**
 * A check (immediate feedback) or a result row: is a correct response,
 * explanation or objective there to show? (Past the key-reveal cap only the
 * verdict comes back.)
 */
export const hasReveal = (r) => Boolean(r && (r.correct_response || r.explanation || r.objective));

/** Explanation text + steps in one shape (template: {text, steps}; legacy: a string). */
export function explanationOf(item) {
  const e = item?.explanation;
  if (!e) return null;
  if (typeof e === "string") return e.trim() ? { text: e, steps: [] } : null;
  const text = typeof e.text === "string" ? e.text : "";
  const steps = Array.isArray(e.steps) ? e.steps.filter((s) => typeof s === "string" && s.trim()) : [];
  return text.trim() || steps.length ? { text, steps } : null;
}

/** "12–13" / "12" printed page label of a source reference; null without pages. */
export function pagesLabel(source) {
  const a = Number.isInteger(source?.printed_start) ? source.printed_start : null;
  const b = Number.isInteger(source?.printed_end) ? source.printed_end : null;
  if (a === null) return null;
  return b !== null && b !== a ? `${a}–${b}` : String(a);
}

/** Only https link-outs (source references come from staging data). */
export const safeHttps = (url) => (typeof url === "string" && /^https:\/\/[^\s]+$/i.test(url) ? url : null);

/**
 * An in-app path from result / recommendation data (lesson links): "/…"
 * only — never a protocol-relative ("//host") or backslash path, a scheme or
 * whitespace. null otherwise (the row is then shown without a link).
 */
export const safeAppPath = (href) => (typeof href === "string" && /^\/(?![/\\])[^\s\\]*$/.test(href) ? href : null);

/** A prep-scope node ("prep:<exam>/<section>/<topic>") → its topic slug; null for curriculum nodes. */
export function prepTopicOf(id) {
  if (typeof id !== "string" || !id.startsWith("prep:")) return null;
  const parts = id.slice(5).split("/");
  return parts.length >= 3 && parts[2] ? parts[2] : null;
}

/**
 * The learn page of a lesson node id (§7 `/learn/[...path]`); null for prep
 * topics and weak: scopes, which have no lesson page.
 */
export const lessonHref = (id) => (typeof id === "string" && id && !id.includes(":") ? safeAppPath(`/learn/${id}`) : null);

/**
 * An explicit "no answer" for saving a cleared answer through
 * save_exam_response (the database needs a typed body; guests save null).
 */
export function emptyResponse(type) {
  switch (type) {
    case "mcq":
    case "true_false":
      return { option_index: null };
    case "matching":
      return { pairs: [] };
    case "ordering":
      return { order: [] };
    case "short_answer":
      return { text: "" };
    case "numeric":
      return { value: "" };
    default:
      return null;
  }
}
