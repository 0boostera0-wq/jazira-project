// ============================================================================
// The only JS grader (docs/CONTENT_ENGINE.md §2.8). The engine's grade.js
// (WP6) maps display indexes ↔ canonical ids and calls gradeResponse(); SQL
// `_ce_grade` (WP7) mirrors these rules. Shared cases:
// tests/fixtures/content/grading-cases.json.
//
//   gradeResponse(type, payload, response) → { score, verdict, reason? }
//
// `payload` is the canonical question payload (with its answer); `response`
// is canonical (option / left / right / item ids, never display indexes):
//   mcq, true_false  { option_id }
//   matching         { pairs: [[left_id, right_id], …] }
//   ordering         { order: [item_id, …] }
//   short_answer     { text }
//   numeric          { value, unit? }
// Scores are in [0, 1], rounded to 4 decimals (DB numeric(5,4)).
// Pure: no Node or browser APIs.
// ============================================================================

import { searchNormalize, normalizeExactMarks, mapSuperscriptsAndFractions } from "./normalize.js";
import { absR, cmp, formatValue, mul, parseDecimal, rat, sub, toRational } from "./expr.js";

const round4 = (x) => Math.round(x * 10000) / 10000;
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const blank = (v) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

// ── numbers ─────────────────────────────────────────────────────────────────
const INVISIBLE_RE = /[​-‏‪-‮⁦-⁩﻿]/g;
const foldDigitsRe = /[٠-٩۰-۹]/g;

/**
 * Parse a learner's number (§2.8 numeric): Arabic-Indic / Persian digits,
 * `a/b` fractions, `٫` and `.` decimal marks, `٬` thousands separator, and
 * `,` as a thousands separator only in strict groups of three after a
 * non-zero leading group (`1,250`, `12,345,678`); `,` followed by 1, 2 or ≥ 4
 * digits is a decimal mark (`2,5`). `0,125`, `1234,567` and `,` mixed with
 * `.`/`٫`/`٬` are ambiguous.
 * @returns {{ok:true, value, fraction:boolean, decimals:number} | {ok:false, reason:string}}
 */
export function parseNumber(input) {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return { ok: false, reason: "invalid_number" };
    const value = toRational(input);
    const s = String(input);
    return { ok: true, value, fraction: false, decimals: s.includes(".") ? s.split(".")[1].length : 0 };
  }
  if (typeof input !== "string") return { ok: false, reason: "invalid_number" };
  // Superscripts and vulgar fractions are mapped BEFORE NFKC (Appendix A): NFKC
  // would turn "10²" into "102" and "2³" into "23", silently misreading a power.
  // "10^2" is then not a number (invalid_number); "½" becomes the fraction 1/2.
  let s = mapSuperscriptsAndFractions(input)
    .normalize("NFKC")
    .replace(INVISIBLE_RE, "")
    .replace(foldDigitsRe, (c) => String(c.codePointAt(0) - (c.codePointAt(0) >= 0x6f0 ? 0x6f0 : 0x660)))
    .replace(/−/g, "-")
    .replace(/⁄/g, "/")
    .trim();
  if (s.length === 0 || s.length > 64) return { ok: false, reason: "invalid_number" };
  let sign = "";
  if (s[0] === "-" || s[0] === "+") {
    sign = s[0] === "-" ? "-" : "";
    s = s.slice(1);
  }
  const frac = /^(\d+)\/(\d+)$/.exec(s);
  if (frac) {
    if (/^0+$/.test(frac[2])) return { ok: false, reason: "invalid_number" };
    const v = rat(BigInt(frac[1]), BigInt(frac[2]));
    return { ok: true, value: sign ? rat(-v.n, v.d) : v, fraction: true, decimals: 0 };
  }
  const hasComma = s.includes(",");
  const hasDot = /[.٫]/.test(s);
  const hasArThousands = s.includes("٬");
  if (hasComma && (hasDot || hasArThousands)) return { ok: false, reason: "ambiguous_separator" };
  if (hasArThousands) {
    if (!/^[1-9]\d{0,2}(٬\d{3})+([.٫]\d+)?$/.test(s)) return { ok: false, reason: "invalid_number" };
    s = s.replace(/٬/g, "");
  }
  if (hasComma) {
    if (/^[1-9]\d{0,2}(,\d{3})+$/.test(s)) s = s.replace(/,/g, "");
    else {
      const one = /^(\d+),(\d+)$/.exec(s);
      if (!one) return { ok: false, reason: "invalid_number" };
      if (one[2].length === 3) return { ok: false, reason: "ambiguous_separator" };
      s = `${one[1]}.${one[2]}`;
    }
  }
  s = s.replace(/٫/g, ".");
  const m = /^(\d*)(?:\.(\d+))?$/.exec(s);
  if (!m || (m[1] === "" && m[2] === undefined)) return { ok: false, reason: "invalid_number" };
  const value = parseDecimal(`${sign}${m[1] || "0"}${m[2] ? "." + m[2] : ""}`);
  if (!value) return { ok: false, reason: "invalid_number" };
  return { ok: true, value, fraction: false, decimals: m[2]?.length ?? 0 };
}

function withinTolerance(value, answer, tolerance) {
  const a = parseDecimal(answer.value) ?? toRational(answer.value);
  const diff = absR(sub(value, a));
  if (!tolerance) return cmp(diff, rat(0n)) === 0;
  const tol = absR(toRational(tolerance.value)); // a negative tolerance never makes every answer wrong
  const bound = tolerance.kind === "rel" ? mul(tol, absR(a)) : tol;
  return cmp(diff, bound) <= 0;
}

const unitKey = (u) => searchNormalize(u);

// ── response validation ────────────────────────────────────────────────────
const ids = (list) => new Set((list ?? []).map((x) => x.id));

/**
 * Shape check of a canonical response against the payload.
 * @returns {{ok:true, empty:boolean} | {ok:false, reason:string}}
 */
export function validateResponse(type, payload, response) {
  if (response === undefined || response === null) return { ok: true, empty: true };
  if (!isObj(response)) return { ok: false, reason: "bad_shape" };
  switch (type) {
    case "mcq":
    case "true_false": {
      if (blank(response.option_id)) return { ok: true, empty: true };
      if (typeof response.option_id !== "string" || !ids(payload.options).has(response.option_id)) return { ok: false, reason: "unknown_option" };
      return { ok: true, empty: false };
    }
    case "matching": {
      const pairs = response.pairs;
      if (pairs === undefined || pairs === null || (Array.isArray(pairs) && pairs.length === 0)) return { ok: true, empty: true };
      if (!Array.isArray(pairs) || pairs.length > (payload.left?.length ?? 0)) return { ok: false, reason: "bad_shape" };
      const left = ids(payload.left);
      const right = ids(payload.right);
      const seenL = new Set();
      const seenR = new Set();
      for (const p of pairs) {
        if (!Array.isArray(p) || p.length !== 2 || !left.has(p[0]) || !right.has(p[1])) return { ok: false, reason: "unknown_pair" };
        if (seenL.has(p[0])) return { ok: false, reason: "duplicate_left" };
        if (seenR.has(p[1])) return { ok: false, reason: "duplicate_right" };
        seenL.add(p[0]);
        seenR.add(p[1]);
      }
      return { ok: true, empty: false };
    }
    case "ordering": {
      const order = response.order;
      if (order === undefined || order === null || (Array.isArray(order) && order.length === 0)) return { ok: true, empty: true };
      const items = ids(payload.items);
      if (!Array.isArray(order) || order.length !== items.size || new Set(order).size !== order.length || !order.every((id) => items.has(id))) {
        return { ok: false, reason: "not_a_permutation" };
      }
      return { ok: true, empty: false };
    }
    case "short_answer": {
      if (blank(response.text)) return { ok: true, empty: true };
      if (typeof response.text !== "string") return { ok: false, reason: "bad_shape" };
      if ([...response.text.trim()].length > (payload.max_chars ?? 80)) return { ok: false, reason: "too_long" };
      return { ok: true, empty: false };
    }
    case "numeric": {
      if (blank(response.value)) return { ok: true, empty: true };
      const parsed = parseNumber(response.value);
      if (!parsed.ok) return parsed;
      if (parsed.fraction && payload.input && payload.input.allow_fraction === false) return { ok: false, reason: "fraction_not_allowed" };
      if (payload.input && Number.isInteger(payload.input.max_decimals) && parsed.decimals > payload.input.max_decimals) {
        return { ok: false, reason: "too_many_decimals" };
      }
      if (response.unit !== undefined && response.unit !== null && typeof response.unit !== "string") return { ok: false, reason: "bad_shape" };
      return { ok: true, empty: false };
    }
    default:
      return { ok: false, reason: "unknown_type" };
  }
}

// ── grading ─────────────────────────────────────────────────────────────────
const verdictOf = (score) => (score >= 1 ? "correct" : score > 0 ? "partial" : "incorrect");

function scoreOf(type, payload, response) {
  const answer = payload.answer ?? {};
  switch (type) {
    case "mcq":
    case "true_false":
      return response.option_id === answer.option_id ? 1 : 0;
    case "matching": {
      const key = new Map((answer.pairs ?? []).map(([l, r]) => [l, r]));
      const leftCount = payload.left?.length || key.size || 1;
      const correct = response.pairs.filter(([l, r]) => key.get(l) === r).length;
      if (payload.scoring === "all_or_nothing") return correct === leftCount ? 1 : 0;
      return correct / leftCount;
    }
    case "ordering": {
      const want = answer.order ?? [];
      return want.length === response.order.length && want.every((id, i) => response.order[i] === id) ? 1 : 0;
    }
    case "short_answer": {
      const accepted = payload.accepted ?? [];
      if (payload.match === "exact_marks") {
        const got = normalizeExactMarks(response.text);
        return accepted.some((a) => normalizeExactMarks(a) === got) ? 1 : 0;
      }
      const got = searchNormalize(response.text);
      const norms = Array.isArray(payload.accepted_norm) ? payload.accepted_norm : accepted.map(searchNormalize);
      return got !== "" && norms.includes(got) ? 1 : 0;
    }
    case "numeric": {
      const parsed = parseNumber(response.value);
      if (!withinTolerance(parsed.value, answer, answer.tolerance)) return 0;
      const unit = payload.unit;
      if (unit && unit.required) {
        const got = unitKey(response.unit ?? "");
        const allowed = [unit.text, ...(unit.accepted ?? [])].map(unitKey);
        if (!got || !allowed.includes(got)) return 0;
      }
      return 1;
    }
    default:
      return 0;
  }
}

/**
 * Grade one canonical response.
 * @returns {{ score:number, verdict:"correct"|"incorrect"|"partial"|"unanswered", reason?:string }}
 *   `reason` is set for an invalid response (graded 0), e.g. `ambiguous_separator`.
 */
export function gradeResponse(type, payload, response) {
  const check = validateResponse(type, payload ?? {}, response);
  if (!check.ok) return { score: 0, verdict: "incorrect", reason: check.reason };
  if (check.empty) return { score: 0, verdict: "unanswered" };
  const score = round4(scoreOf(type, payload, response));
  return { score, verdict: verdictOf(score) };
}

/** The canonical correct response (results show it display-mapped). */
export function correctResponse(type, payload) {
  const answer = payload?.answer ?? {};
  switch (type) {
    case "mcq":
    case "true_false":
      return { option_id: answer.option_id };
    case "matching":
      return { pairs: (answer.pairs ?? []).map((p) => [...p]) };
    case "ordering":
      return { order: [...(answer.order ?? [])] };
    case "short_answer":
      return { text: payload.answer_display ?? payload.accepted?.[0] ?? "" };
    case "numeric":
      return payload.unit ? { value: answer.value, unit: payload.unit.text } : { value: answer.value };
    default:
      return null;
  }
}

/**
 * Canonical answer string used in question ids (§2.2: sha256(lesson | type |
 * normalize(stem) | canonicalAnswer)). Text-based, so it is independent of the
 * opaque option ids assigned at ingestion.
 */
export function canonicalAnswer(type, payload) {
  const answer = payload?.answer ?? {};
  const textOf = (list, id) => searchNormalize((list ?? []).find((x) => x.id === id)?.text ?? "");
  switch (type) {
    case "mcq":
    case "true_false":
      return textOf(payload.options, answer.option_id);
    case "matching":
      return (answer.pairs ?? []).map(([l, r]) => `${textOf(payload.left, l)}=${textOf(payload.right, r)}`).sort().join("|");
    case "ordering":
      return (answer.order ?? []).map((id) => textOf(payload.items, id)).join("|");
    case "short_answer":
      return [...new Set((payload.accepted ?? []).map(searchNormalize))].sort().join("|");
    case "numeric": {
      const v = parseDecimal(answer.value) ?? toRational(answer.value);
      return formatValue(v, "fraction") + (payload.unit ? ` ${searchNormalize(payload.unit.text)}` : "");
    }
    default:
      throw new Error(`unknown question type ${type}`);
  }
}

const idText = ({ id, text }) => ({ id, text });

/**
 * The client-visible part of a payload (no answer, no accepted answers).
 * The importer stores it as `payload_public`; keys stay server-side. Every
 * field is projected explicitly, so an extra canonical field never leaks.
 */
export function publicPayload(type, payload) {
  const p = payload ?? {};
  switch (type) {
    case "mcq":
    case "true_false":
      return { options: (p.options ?? []).map(idText), fixed_order_reason: p.fixed_order_reason ?? null };
    case "matching":
      // Project to {id, text}: nothing else from the canonical entries reaches a client.
      return { left: (p.left ?? []).map(idText), right: (p.right ?? []).map(idText), scoring: p.scoring ?? "partial" };
    case "ordering":
      return { items: (p.items ?? []).map(idText), criterion: p.criterion ?? "other" };
    case "short_answer":
      return { max_chars: p.max_chars ?? 80 };
    case "numeric":
      return {
        unit: p.unit ? { text: p.unit.text, required: Boolean(p.unit.required), accepted: p.unit.accepted ?? [] } : null,
        input: p.input
          ? { allow_fraction: p.input.allow_fraction !== false, max_decimals: Number.isInteger(p.input.max_decimals) ? p.input.max_decimals : null }
          : { allow_fraction: true, max_decimals: null },
      };
    default:
      throw new Error(`unknown question type ${type}`);
  }
}
