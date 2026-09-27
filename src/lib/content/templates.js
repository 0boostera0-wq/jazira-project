// ============================================================================
// Question templates → deterministic, code-verified variants
// (docs/CONTENT_ENGINE.md §2.9, §4.6).
//
//   checkTemplate(t)            static checks (types, params, expressions, placeholders)
//   generateVariants(t)         sfc32 seeded from sha256(template_id | revision),
//                               rejection sampling (≤ 1000 tries per variant)
//                               under `constraints`, unique parameter tuples,
//                               at most max_variants (default 12, cap 50);
//                               every variant passes the code checks
//   previewInstances(t, 3)      the first n instantiations (= variants 01..n),
//                               used to validate the template itself
//   instantiate(t, params)      one instantiation + its code checks
//   variantRecord(t, inst, o)   the materialized question@1 record
//
// Supported template types: `mcq` (answer + distractors → numeric options in
// ascending order, fixed) and `numeric` (formats int, decimal:d, fraction —
// terminating only; never mixed, which the grader cannot read). Arithmetic is
// exact (expr.js rationals); the answer is cross-checked by an independent
// float evaluation. Placeholders: the params, {ans} (the displayed answer) and
// {exact} (the exact value as a fraction); when the display is rounded or
// mixed, one explanation step must show both (as check P006 requires).
// Server/scripts only (node:crypto for the opaque option ids).
// ============================================================================

import { createHmac } from "node:crypto";
import {
  ExprError, cmp, evaluateBoolean, evaluateFloat, evaluateNumber, formatValue, isInteger, parseExpr, rat, add, mul,
  toDecimalString, toNumber, toRational, variables, eq, roundR, sub,
} from "./expr.js";
import { seededRng, templateSeedText } from "./prng.js";
import { searchNormalize } from "./normalize.js";
import { canonicalJson, contentHash, variantId } from "./ids.js";
import { difficultyBand } from "./enums.js";

export const TEMPLATE_TYPES = Object.freeze(["mcq", "numeric"]);
export const MAX_TRIES_PER_VARIANT = 1000;
export const DEFAULT_MAX_VARIANTS = 12;
export const VARIANT_CAP = 50;
export const FLOAT_TOLERANCE = 1e-9;
const RESERVED = new Set(["ans", "exact"]);
const PLACEHOLDER_RE = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const MAX_DOMAIN = 2 ** 32;

export class TemplateError extends Error {
  constructor(code, message) {
    super(message ? `${code}: ${message}` : code);
    this.name = "TemplateError";
    this.code = code;
  }
}

const sortedNames = (params) => Object.keys(params ?? {}).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const decimalsOf = (x) => {
  const s = String(x);
  if (/e/i.test(s)) return 20;
  return s.includes(".") ? s.split(".")[1].length : 0;
};

// ── static checks ───────────────────────────────────────────────────────────
function paramErrors(name, p) {
  const errs = [];
  const bad = (code, msg) => errs.push({ code, detail: `${name}: ${msg}` });
  if (p.type === "choice") {
    if (!Array.isArray(p.values) || !p.values.length) bad("bad_param", "choice needs values");
    else if (new Set(p.values.map((v) => JSON.stringify(v))).size !== p.values.length) bad("bad_param", "choice values repeat");
    return errs;
  }
  if (!Number.isFinite(p.min) || !Number.isFinite(p.max) || p.min > p.max) bad("bad_param", "needs min ≤ max");
  if (p.type === "int") {
    if (![p.min, p.max, p.step ?? 1].every(Number.isInteger)) bad("bad_param", "int min, max and step must be integers");
  } else if (p.type === "decimal") {
    if (!(p.step > 0)) bad("bad_param", "decimal needs a positive step");
  } else bad("bad_param", `unknown type ${p.type}`);
  if (!errs.length && domainSize(p) > MAX_DOMAIN) bad("bad_param", "domain too large");
  if (!errs.length && domainSize(p) <= (p.exclude?.length ?? 0) && domainValues(p).every((v) => (p.exclude ?? []).includes(v))) {
    bad("bad_param", "every value is excluded");
  }
  return errs;
}

function domainSize(p) {
  if (p.type === "choice") return p.values.length;
  const step = toRational(p.step ?? 1);
  const span = sub(toRational(p.max), toRational(p.min));
  const q = mul(span, rat(step.d, step.n)); // span / step
  return Number(q.n / q.d) + 1;
}

function domainValue(p, k) {
  if (p.type === "choice") return p.values[k];
  const v = add(toRational(p.min), mul(rat(BigInt(k)), toRational(p.step ?? 1)));
  if (p.type === "int") return Number(v.n);
  return Number(toDecimalString(roundR(v, Math.max(decimalsOf(p.step), decimalsOf(p.min)))));
}

function domainValues(p) {
  const n = Math.min(domainSize(p), 1000);
  return Array.from({ length: n }, (_, k) => domainValue(p, k));
}

/** Names usable inside expressions: numeric params (choice params only when all values are numbers). */
export function numericParamNames(t) {
  return sortedNames(t.params).filter((n) => t.params[n].type !== "choice" || t.params[n].values.every((v) => typeof v === "number"));
}

/**
 * Static template checks. Returns [{code, detail}] (empty = ok).
 * Codes: unsupported_type, too_few_distractors, bad_param, bad_expr,
 * unknown_identifier, unknown_placeholder, bad_max_variants, bad_format.
 */
export function checkTemplate(t) {
  const errs = [];
  const bad = (code, detail) => errs.push({ code, detail });
  if (!TEMPLATE_TYPES.includes(t?.question_type)) bad("unsupported_type", `${t?.question_type} (templates support ${TEMPLATE_TYPES.join(", ")})`);
  if (t?.question_type === "mcq" && !(t.distractors?.length >= 1)) bad("too_few_distractors", "mcq needs at least one distractor");
  const mv = t?.max_variants ?? DEFAULT_MAX_VARIANTS;
  if (!Number.isInteger(mv) || mv < 1 || mv > VARIANT_CAP) bad("bad_max_variants", String(mv));
  const names = sortedNames(t?.params);
  if (!names.length) bad("bad_param", "no params");
  for (const n of names) {
    if (RESERVED.has(n)) bad("bad_param", `${n} is reserved`);
    errs.push(...paramErrors(n, t.params[n]));
  }
  const numeric = new Set(numericParamNames(t ?? {}));
  const exprs = [
    ["answer.expr", t?.answer?.expr],
    ...(t?.distractors ?? []).map((d, i) => [`distractors[${i}].expr`, d.expr]),
    ...(t?.constraints ?? []).map((c, i) => [`constraints[${i}]`, c]),
  ];
  for (const [where, src] of exprs) {
    try {
      parseExpr(String(src ?? ""));
      for (const v of variables(String(src))) if (!numeric.has(v)) bad("unknown_identifier", `${where}: ${v}`);
    } catch (e) {
      bad("bad_expr", `${where}: ${e.message}`);
    }
  }
  try {
    formatValue(rat(0n), t?.answer?.format ?? "");
  } catch (e) {
    bad("bad_expr", `answer.format: ${e.message}`);
  }
  // A numeric answer is typed by the learner: the grader (answers.js) reads
  // integers, decimals and a/b fractions, never a mixed number «3 1/3», so the
  // shown answer would be marked wrong. Mixed numbers are for mcq options only.
  if (t?.question_type === "numeric" && t?.answer?.format === "mixed") bad("bad_format", "numeric answers cannot use the mixed format (use fraction)");
  const texts = [["stem", t?.stem], ["explanation.text", t?.explanation?.text], ...(t?.explanation?.steps ?? []).map((s, i) => [`explanation.steps[${i}]`, s])];
  for (const [where, text] of texts) {
    for (const m of String(text ?? "").matchAll(PLACEHOLDER_RE)) {
      if (!RESERVED.has(m[1]) && !Object.hasOwn(t.params ?? {}, m[1])) bad("unknown_placeholder", `${where}: {${m[1]}}`);
    }
  }
  return errs;
}

// ── sampling ────────────────────────────────────────────────────────────────
/** One parameter value (uniform over the domain, excluded values redrawn). */
function sampleParam(name, p, rng) {
  const n = domainSize(p);
  for (let i = 0; i < MAX_TRIES_PER_VARIANT; i++) {
    const v = domainValue(p, rng.int(0, n - 1));
    if (!(p.exclude ?? []).includes(v)) return v;
  }
  throw new TemplateError("bad_param", `${name}: could not draw a non-excluded value`);
}

/** A parameter tuple; params are drawn in sorted-name order. */
export function sampleParams(t, rng) {
  const out = {};
  for (const name of sortedNames(t.params)) out[name] = sampleParam(name, t.params[name], rng);
  return out;
}

const numericVars = (t, params) => Object.fromEntries(numericParamNames(t).map((n) => [n, params[n]]));

/** True when every constraint holds (a constraint that cannot be evaluated fails). */
export function constraintsHold(t, params) {
  const vars = numericVars(t, params);
  for (const c of t.constraints ?? []) {
    try {
      if (!evaluateBoolean(c, vars)) return false;
    } catch (e) {
      if (e instanceof ExprError) return false;
      throw e;
    }
  }
  return true;
}

// ── rendering ───────────────────────────────────────────────────────────────
/** Display text of a parameter value (numbers in Western digits, as the bank convention). */
export function displayValue(v) {
  if (typeof v === "number") return Object.is(v, -0) ? "0" : String(v);
  return String(v);
}

/** Fill `{name}` placeholders; unknown names stay as they are (then caught as unfilled). */
export function renderText(text, values) {
  return String(text ?? "").replace(PLACEHOLDER_RE, (m, name) => (Object.hasOwn(values, name) ? values[name] : m));
}

export const hasUnfilled = (text) => new RegExp(PLACEHOLDER_RE.source).test(String(text ?? ""));

/**
 * True when `answer` appears in `text` as a whole number: not glued to other
 * digits, a decimal point, a fraction bar or (for a positive answer) a minus.
 */
export function showsAnswer(text, answer) {
  const s = String(text ?? "");
  let from = 0;
  for (;;) {
    const i = s.indexOf(answer, from);
    if (i < 0) return false;
    const before = s[i - 1] ?? "";
    const after = s[i + answer.length] ?? "";
    const after2 = s[i + answer.length + 1] ?? "";
    const badBefore = /[0-9.,/−-]/.test(before);
    const badAfter = /[0-9/]/.test(after) || ((after === "." || after === ",") && /[0-9]/.test(after2));
    if (!badBefore && !badAfter) return true;
    from = i + 1;
  }
}

/**
 * Opaque option / left / right / item ids (§2.8): prefix + the first 6 hex of
 * HMAC-SHA256(salt, normalized text), lengthened (up to 11) only on a
 * collision. The same derivation as `opaqueIds` in
 * scripts/content/ingest-candidates.mjs, so a variant's ids look exactly like
 * an ingested item's. The salt of a variant is its template id.
 */
export function opaqueIds(prefix, salt, texts) {
  const macs = texts.map((t) => createHmac("sha256", `jazira-opaque-ids:v1|${salt}`).update(searchNormalize(t), "utf8").digest("hex"));
  for (let len = 6; len <= 11; len++) {
    const ids = macs.map((m) => prefix + m.slice(0, len));
    if (new Set(ids).size === ids.length) return ids;
  }
  throw new TemplateError("option_id_collision", "entries are not distinct");
}

// ── instantiation and code checks ──────────────────────────────────────────
/**
 * The numeric payload (§2.8): `answer.value` is a decimal string. A `fraction`
 * answer is stored exactly, so it must terminate (2/8 → "0.25"); a
 * non-terminating one (2/7) cannot be a numeric key and the tuple is skipped
 * (`answer_not_decimal`, checked in `instantiate`). A `decimal:d` answer is
 * rounded for display and accepts anything within half a unit of the last place.
 */
function numericAnswerPayload(value, format) {
  const dec = /^decimal:(\d+)$/.exec(format);
  const fractional = format === "fraction";
  let valueStr;
  let tolerance = "0";
  if (fractional) valueStr = toDecimalString(value);
  else {
    valueStr = formatValue(value, format);
    // rounded for display: accept anything within half a unit of the last place
    if (dec && !eq(toRational(valueStr), value)) tolerance = toDecimalString(rat(5n, 10n ** BigInt(Number(dec[1]) + 1)));
  }
  return {
    answer: { value: valueStr, tolerance: { kind: "abs", value: tolerance } },
    unit: null,
    input: { allow_fraction: fractional, max_decimals: dec ? Number(dec[1]) : format === "int" ? 0 : null },
  };
}

/**
 * Instantiate a template with one parameter tuple and run the §4.6 code checks.
 * @returns {{ ok: true, params, stem, payload, explanation, computation, answerText }
 *          | { ok: false, code, detail }}
 */
export function instantiate(t, params) {
  const fail = (code, detail) => ({ ok: false, code, detail });
  const vars = numericVars(t, params);
  const format = t.answer.format;
  let value;
  let answerText;
  try {
    value = evaluateNumber(t.answer.expr, vars);
    answerText = formatValue(value, format);
  } catch (e) {
    if (e instanceof ExprError) return fail("answer_eval", e.message);
    throw e;
  }
  let float;
  try {
    float = evaluateFloat(t.answer.expr, vars);
  } catch {
    float = NaN;
  }
  const exact = toNumber(value);
  if (!Number.isFinite(float) || Math.abs(float - exact) > FLOAT_TOLERANCE * Math.max(1, Math.abs(exact))) {
    return fail("float_mismatch", `${t.answer.expr}: exact ${exact}, float ${float}`);
  }
  const distractors = [];
  for (const d of t.distractors ?? []) {
    try {
      const v = evaluateNumber(d.expr, vars);
      distractors.push({ value: v, text: formatValue(v, format) });
    } catch (e) {
      if (e instanceof ExprError) return fail("distractor_eval", `${d.expr}: ${e.message}`);
      throw e;
    }
  }
  const texts = new Set([answerText]);
  for (const d of distractors) {
    if (texts.has(d.text)) return fail("distractor_duplicate", d.text);
    texts.add(d.text);
  }
  if (t.question_type === "numeric" && format === "fraction" && toDecimalString(value) === null) {
    return fail("answer_not_decimal", `${formatValue(value, "fraction")} has no exact decimal form`);
  }
  // The exact value as a fraction ({exact}); a rounded (decimal:d) or mixed
  // display differs from it, and then the explanation must show both (P006:
  // one step holds every number of the key and the computed value).
  const exactText = formatValue(value, "fraction");
  const displayIsExact = format === "mixed" ? isInteger(value) : format === "int" || format === "fraction" || eq(toRational(answerText), value);
  const values = { ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, displayValue(v)])), ans: answerText, exact: exactText };
  const stem = renderText(t.stem, values);
  const explanation = {
    text: renderText(t.explanation?.text ?? "", values),
    steps: (t.explanation?.steps ?? []).map((s) => renderText(s, values)),
    method: t.solution_method ?? null,
  };
  if ([stem, explanation.text, ...explanation.steps].some(hasUnfilled)) return fail("unfilled_placeholder", stem);
  // Like P006: the steps when there are any, else the text.
  const pool = explanation.steps.some((s) => s.trim()) ? explanation.steps : [explanation.text];
  if (!pool.some((s) => showsAnswer(s, answerText))) return fail("explanation_missing_answer", answerText);
  if (!displayIsExact && !pool.some((s) => showsAnswer(s, answerText) && showsAnswer(s, exactText))) {
    return fail("explanation_missing_exact", `${answerText} is rounded or mixed: one step must also show ${exactText} (use {exact})`);
  }
  let payload;
  if (t.question_type === "mcq") {
    const opts = [{ value, text: answerText, correct: true }, ...distractors].sort((a, b) => cmp(a.value, b.value));
    let ids;
    try {
      ids = opaqueIds("o", t.id, opts.map((o) => o.text));
    } catch (e) {
      if (e instanceof TemplateError) return fail(e.code, opts.map((o) => o.text).join(","));
      throw e;
    }
    const options = opts.map((o, i) => ({ id: ids[i], text: o.text }));
    payload = { options, answer: { option_id: options[opts.findIndex((o) => o.correct)].id }, fixed_order_reason: "numeric_ascending" };
  } else {
    payload = numericAnswerPayload(value, format);
  }
  return { ok: true, params, stem, payload, explanation, computation: { expr: t.answer.expr, vars }, answerText };
}

/**
 * Deterministic variants of a template (§4.6). The same template id and
 * revision always yield the same variants in the same order.
 * @param {object} t  question-template@1
 * @param {{limit?: number}} [o]  default: max_variants (cap 50)
 * @returns {{ variants: {variant_no, params, instance}[], stats }}
 */
export function generateVariants(t, { limit } = {}) {
  const errors = checkTemplate(t);
  if (errors.length) throw new TemplateError(errors[0].code, `${t?.id}: ${errors.map((e) => `${e.code} ${e.detail}`).join("; ")}`);
  const want = Math.min(limit ?? t.max_variants ?? DEFAULT_MAX_VARIANTS, VARIANT_CAP);
  const rng = seededRng(templateSeedText(t.id, t.revision));
  const seenTuples = new Set();
  const seenRenders = new Set();
  const stats = { tries: 0, duplicate_tuples: 0, constraint_rejects: 0, check_failures: {}, produced: 0, shortfall: 0 };
  const variants = [];
  while (variants.length < want) {
    let accepted = null;
    for (let i = 0; i < MAX_TRIES_PER_VARIANT && !accepted; i++) {
      stats.tries++;
      const params = sampleParams(t, rng);
      const key = canonicalJson(params);
      if (seenTuples.has(key)) {
        stats.duplicate_tuples++;
        continue;
      }
      seenTuples.add(key);
      if (!constraintsHold(t, params)) {
        stats.constraint_rejects++;
        continue;
      }
      const inst = instantiate(t, params);
      const render = inst.ok ? searchNormalize(`${inst.stem}|${inst.answerText}`) : null;
      const code = !inst.ok ? inst.code : seenRenders.has(render) ? "duplicate_render" : null;
      if (code) {
        stats.check_failures[code] = (stats.check_failures[code] ?? 0) + 1;
        continue;
      }
      seenRenders.add(render);
      accepted = inst;
    }
    if (!accepted) break;
    variants.push({ variant_no: variants.length + 1, params: accepted.params, instance: accepted });
  }
  stats.produced = variants.length;
  stats.shortfall = want - variants.length;
  return { variants, stats };
}

/** The first `n` instantiations (= variants 01..n): what validates the template itself (§4.6). */
export function previewInstances(t, n = 3) {
  return generateVariants(t, { limit: n }).variants;
}

// ── materialized records ────────────────────────────────────────────────────
/**
 * Everything that makes a variant's content (§2.1: a change bumps `revision`):
 * the record minus its lifecycle fields (revision, timestamps, status,
 * validation, dedup, the generating run and the derived content hash).
 */
const LIFECYCLE_FIELDS = ["revision", "created_at", "updated_at", "status", "validation", "dedup", "content_hash"];
function contentKey(rec) {
  const rest = { ...rec, provenance: { ...(rec.provenance ?? {}) } };
  for (const k of LIFECYCLE_FIELDS) delete rest[k];
  delete rest.provenance.generator;
  return canonicalJson(rest);
}

/** A template produces variants only while it is not rejected or retired. */
export const templateIsActive = (t) => t.status !== "rejected" && t.status !== "retired";

/**
 * The question@1 record of one variant (§2.9): the template's lesson,
 * objective, difficulty and solution method; `generated_practice`; a
 * `member_of` link to the template via `variant.template_id`. Variants of a
 * validated (or published) template inherit `validated` — every emitted
 * variant already passed the code checks — and the template's validation
 * record ids.
 *
 * With `previous` (the same variant id from an earlier run): unchanged content
 * keeps revision, timestamps, run id, dedup fields and a later `published`
 * status or dedup rejection, so a rerun rewrites nothing; changed content
 * bumps the revision and resets the dedup fields.
 *
 * @param {object} t  question-template@1
 * @param {{variant_no, params, instance}} v  from generateVariants
 * @param {{curriculum: object, runId: string, now: string, previous?: object|null}} o
 */
export function variantRecord(t, v, { curriculum, runId, now, previous = null }) {
  if (!curriculum?.lesson || curriculum.lesson !== t.lesson_node_id) throw new TemplateError("bad_curriculum", `${t.id}: curriculum must be the template's lesson`);
  // Inherit `validated` only from a validation of this template revision
  // (§2.15: an edit bumps the revision and the old records no longer apply).
  const checked = t.validation?.checked_revision;
  const validated = (t.status === "validated" || t.status === "published") && (checked === null || checked === undefined || checked === t.revision);
  const rec = {
    schema: "question@1",
    id: variantId(t.id, v.variant_no),
    revision: 1,
    content_hash: null,
    scope: "curriculum",
    curriculum,
    links: [{ node_id: curriculum.lesson, role: "primary" }],
    prep: null,
    objective_id: t.objective_id ?? null,
    question_type: t.question_type,
    item_style: t.item_style,
    difficulty: t.difficulty,
    difficulty_band: difficultyBand(t.difficulty),
    difficulty_source: t.provenance?.generator?.kind === "human" ? "author" : "generator_estimate",
    language: t.language,
    stimulus_id: null,
    stem: v.instance.stem,
    payload: v.instance.payload,
    explanation: v.instance.explanation,
    shuffle_options: false,
    time_limit_seconds: t.time_limit_seconds ?? 60,
    tags: [...(t.tags ?? [])],
    computation: v.instance.computation,
    source: t.source ?? null,
    provenance: {
      origin: "generated_practice",
      official: false,
      license_status: t.provenance?.license_status ?? "unknown",
      generator: { kind: "script", run_id: runId, prompt_version: null },
      derived_from: [],
      template_id: t.id,
    },
    status: validated ? "validated" : "candidate",
    validation: validated
      ? { status: "validated", record_ids: [...(t.validation?.record_ids ?? [])], checked_revision: 1 }
      : { status: "pending", record_ids: [], checked_revision: null },
    dedup: { class: null, cluster_id: null, exclusion_group: null },
    variant: { kind: "template", template_id: t.id, variant_no: v.variant_no, params: { ...v.params } },
    is_premium: t.is_premium ?? false,
    created_at: now,
    updated_at: now,
  };
  rec.content_hash = contentHash(rec);
  if (!previous) return rec;
  if (contentKey(previous) === contentKey(rec)) {
    rec.revision = previous.revision;
    rec.created_at = previous.created_at;
    rec.updated_at = previous.updated_at;
    rec.provenance.generator.run_id = previous.provenance?.generator?.run_id ?? runId;
    rec.dedup = previous.dedup ?? rec.dedup;
    if (validated && previous.status === "published") rec.status = "published";
    if (previous.status === "rejected" && previous.dedup?.duplicate_of) rec.status = "rejected";
    if (rec.validation.checked_revision !== null) rec.validation.checked_revision = rec.revision;
    return rec;
  }
  rec.revision = (previous.revision ?? 0) + 1;
  rec.created_at = previous.created_at ?? now;
  if (rec.validation.checked_revision !== null) rec.validation.checked_revision = rec.revision;
  return rec;
}
