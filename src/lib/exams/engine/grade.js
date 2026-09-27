// ============================================================================
// Display ↔ canonical mapping and grading (docs/CONTENT_ENGINE.md §2.8, §5.4,
// §5.5, §5.7). Grading itself is WP1's src/lib/content/answers.js — the only
// JS grader; this module only maps display indexes to canonical ids and back.
//
//   parseDisplayResponse(type, raw)             strict whitelist of the client shape
//   toCanonical(item, maps, display)            → { ok, response } | { ok:false, reason }
//   toDisplay(item, maps, canonical)            → display response (results)
//   gradeItem(item, key, maps, display)         → { score, verdict, reason?, canonical }
//   resultItem(…)                               one §5.7 result row
//   summarize(rows, o)                          score, by_lesson, by_band, by_term, by_topic
// ============================================================================
import { correctResponse, gradeResponse } from "../../content/answers.js";
import { publicQuestion } from "./shuffle.js";

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isIdx = (v) => Number.isInteger(v) && v >= 0 && v < 64;
const onlyKeys = (o, keys) => Object.keys(o).every((k) => keys.includes(k));
export const MAX_TEXT = 400;

/**
 * Strict parse of a client (display) response. null/undefined = unanswered.
 * @returns {{ ok:true, response: object|null } | { ok:false, reason: string }}
 */
export function parseDisplayResponse(type, raw) {
  if (raw === null || raw === undefined) return { ok: true, response: null };
  if (!isObj(raw)) return { ok: false, reason: "bad_shape" };
  switch (type) {
    case "mcq":
    case "true_false":
      if (!onlyKeys(raw, ["option_index"])) return { ok: false, reason: "bad_shape" };
      if (raw.option_index === null || raw.option_index === undefined) return { ok: true, response: null };
      if (!isIdx(raw.option_index)) return { ok: false, reason: "bad_index" };
      return { ok: true, response: { option_index: raw.option_index } };
    case "matching": {
      if (!onlyKeys(raw, ["pairs"])) return { ok: false, reason: "bad_shape" };
      if (raw.pairs === null || raw.pairs === undefined) return { ok: true, response: null };
      if (!Array.isArray(raw.pairs) || raw.pairs.length > 12) return { ok: false, reason: "bad_shape" };
      if (!raw.pairs.every((p) => Array.isArray(p) && p.length === 2 && isIdx(p[0]) && isIdx(p[1]))) return { ok: false, reason: "bad_index" };
      return raw.pairs.length ? { ok: true, response: { pairs: raw.pairs.map((p) => [p[0], p[1]]) } } : { ok: true, response: null };
    }
    case "ordering":
      if (!onlyKeys(raw, ["order"])) return { ok: false, reason: "bad_shape" };
      if (raw.order === null || raw.order === undefined) return { ok: true, response: null };
      if (!Array.isArray(raw.order) || raw.order.length > 12 || !raw.order.every(isIdx)) return { ok: false, reason: "bad_index" };
      return raw.order.length ? { ok: true, response: { order: [...raw.order] } } : { ok: true, response: null };
    case "short_answer":
      if (!onlyKeys(raw, ["text"])) return { ok: false, reason: "bad_shape" };
      if (raw.text === null || raw.text === undefined) return { ok: true, response: null };
      if (typeof raw.text !== "string" || raw.text.length > MAX_TEXT) return { ok: false, reason: "too_long" };
      return raw.text.trim() ? { ok: true, response: { text: raw.text } } : { ok: true, response: null };
    case "numeric": {
      if (!onlyKeys(raw, ["value", "unit"])) return { ok: false, reason: "bad_shape" };
      const v = raw.value;
      if (v === null || v === undefined || (typeof v === "string" && !v.trim())) return { ok: true, response: null };
      if ((typeof v !== "string" && typeof v !== "number") || String(v).length > 64) return { ok: false, reason: "bad_shape" };
      if (raw.unit !== undefined && raw.unit !== null && (typeof raw.unit !== "string" || raw.unit.length > 40)) return { ok: false, reason: "bad_shape" };
      return { ok: true, response: raw.unit ? { value: v, unit: raw.unit } : { value: v } };
    }
    default:
      return { ok: false, reason: "unknown_type" };
  }
}

const listOf = (item, key, field) => key?.payload?.[field] ?? item.public?.[field] ?? [];

/**
 * Map a display response to canonical ids (§5.4: the server maps display
 * indexes through choice_order / display_map before grading or storing).
 */
export function toCanonical(item, maps, display, key = null) {
  if (display === null) return { ok: true, response: null };
  switch (item.type) {
    case "mcq":
    case "true_false": {
      const opts = listOf(item, key, "options");
      const order = maps?.choice_order ?? opts.map((_, i) => i);
      const c = order[display.option_index];
      if (c === undefined || !opts[c]) return { ok: false, reason: "index_out_of_range" };
      return { ok: true, response: { option_id: opts[c].id } };
    }
    case "matching": {
      const { left, right } = maps.display_map;
      const pairs = [];
      for (const [li, ri] of display.pairs) {
        if (left[li] === undefined || right[ri] === undefined) return { ok: false, reason: "index_out_of_range" };
        pairs.push([left[li], right[ri]]);
      }
      return { ok: true, response: { pairs } };
    }
    case "ordering": {
      const ids = maps.display_map.items;
      const order = [];
      for (const i of display.order) {
        if (ids[i] === undefined) return { ok: false, reason: "index_out_of_range" };
        order.push(ids[i]);
      }
      return { ok: true, response: { order } };
    }
    case "short_answer":
    case "numeric":
      return { ok: true, response: { ...display } };
    default:
      return { ok: false, reason: "unknown_type" };
  }
}

/** Map a canonical response back to display indexes (results). */
export function toDisplay(item, maps, canonical, key = null) {
  if (!canonical) return null;
  switch (item.type) {
    case "mcq":
    case "true_false": {
      const opts = listOf(item, key, "options");
      const c = opts.findIndex((o) => o.id === canonical.option_id);
      if (c < 0) return null;
      const order = maps?.choice_order ?? opts.map((_, i) => i);
      return { option_index: order.indexOf(c) };
    }
    case "matching": {
      const { left, right } = maps.display_map;
      return { pairs: (canonical.pairs ?? []).map(([l, r]) => [left.indexOf(l), right.indexOf(r)]).sort((a, b) => a[0] - b[0]) };
    }
    case "ordering":
      return { order: (canonical.order ?? []).map((id) => maps.display_map.items.indexOf(id)) };
    case "short_answer":
    case "numeric":
      return { ...canonical };
    default:
      return null;
  }
}

/**
 * Grade one display response.
 * @param {object} item  content row
 * @param {object} key   key row { payload (canonical, with answer), explanation, objective, source }
 * @param {object} maps  displayMaps(seed, item, …)
 * @param {object|null} display  parsed display response
 */
export function gradeItem(item, key, maps, display) {
  const mapped = toCanonical(item, maps, display, key);
  if (!mapped.ok) return { score: 0, verdict: "incorrect", reason: mapped.reason, canonical: null };
  const g = gradeResponse(item.type, key.payload, mapped.response);
  return { ...g, canonical: mapped.response };
}

/** The correct response in display indexes. */
export function correctDisplay(item, key, maps) {
  return toDisplay(item, maps, correctResponse(item.type, key.payload), key);
}

/**
 * One result row (§5.7). `reveal` false (key-reveal cap) drops the correct
 * response and the explanation; a voided item (revision changed) is shown
 * without a verdict and excluded from the score. `handle` (guest sessions)
 * replaces the canonical key in `key`.
 */
export function resultItem({ position, item, key, maps, response, grade, voided = null, reveal = true, locked = false, lessonHref = null, handle = null }) {
  const base = publicQuestion(item, position, maps, { handle });
  const out = {
    ...base,
    voided,
    locked,
    response,
    verdict: voided ? null : grade.verdict,
    score: voided ? null : grade.score,
    ...(grade?.reason ? { invalid_reason: grade.reason } : {}),
    correct_response: null,
    explanation: null,
    objective: null,
    source: null,
  };
  if (item.lesson) out.lesson = { id: item.lesson.id, title: item.lesson.title ?? null, href: lessonHref ?? (item.lesson.id.startsWith("prep:") ? null : `/learn/${item.lesson.id}`) };
  if (reveal && key && !voided) {
    out.correct_response = correctDisplay(item, key, maps);
    out.explanation = key.explanation ? { text: key.explanation.text ?? "", steps: [...(key.explanation.steps ?? [])] } : null;
    out.objective = key.objective ? { text: key.objective.text } : null;
    out.source = key.source ?? null;
  }
  return out;
}

const round2 = (x) => Math.round(x * 100) / 100;

/**
 * Session score and breakdowns (§5.5, §5.7): score_percent = round(100 ×
 * Σscore / question_count, 2) over non-voided items; correct = score 1.
 */
export function summarize(rows, { contentByKey = new Map(), withTerm = false, withTopic = false } = {}) {
  const live = rows.filter((r) => !r.voided);
  const sum = live.reduce((s, r) => s + (r.score ?? 0), 0);
  const group = (keyOf, labelOf) => {
    const m = new Map();
    for (const r of live) {
      const k = keyOf(r);
      if (k === null || k === undefined) continue;
      if (!m.has(k)) m.set(k, { ...labelOf(r, k), total: 0, correct: 0, score_sum: 0 });
      const g = m.get(k);
      g.total += 1;
      g.score_sum = round2(g.score_sum + (r.score ?? 0));
      if (r.score === 1) g.correct += 1;
    }
    return [...m.values()].sort((a, b) => String(a.id ?? a.band ?? a.term ?? a.topic).localeCompare(String(b.id ?? b.band ?? b.term ?? b.topic)));
  };
  const contentOf = (r) => contentByKey.get(r.key) ?? {};
  return {
    question_count: live.length,
    voided_count: rows.length - live.length,
    correct_count: live.filter((r) => r.score === 1).length,
    answered_count: live.filter((r) => r.verdict && r.verdict !== "unanswered").length,
    score_percent: live.length ? round2((100 * sum) / live.length) : 0,
    by_lesson: group((r) => r.lesson?.id ?? null, (r) => ({ id: r.lesson.id, title: r.lesson.title ?? null, href: r.lesson.href ?? null })),
    by_band: group((r) => contentOf(r).band ?? null, (r, k) => ({ band: k })),
    ...(withTerm ? { by_term: group((r) => contentOf(r).lesson?.term ?? "none", (r, k) => ({ term: k })) } : {}),
    ...(withTopic ? { by_topic: group((r) => contentOf(r).topic ?? null, (r, k) => ({ topic: k })) } : {}),
  };
}
