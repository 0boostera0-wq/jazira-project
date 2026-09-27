// ============================================================================
// Safe option shuffling and the client projection (docs/CONTENT_ENGINE.md
// §5.4, §5.7). Server only (HASH-CTR).
//
//   isShuffleable(item, template)          the §5.4 exclusions
//   displayMaps(seed, item, { template })  { choice_order } | { left, right } | { items } | {}
//                                          (never a function of the answer)
//   publicQuestion(item, position, maps, { handle })   what the client sees: display indexes only,
//                                          no ids; guests get `key` = the session's opaque handle
//
// `item` is a content row (runtime bank c/ chunk or ce_guest_items):
//   { key, revision, type, language, stem, stimulus:{id,text}|null,
//     public (publicPayload with canonical ids — server side only),
//     shuffle_options, fixed_order_reason, topic, lesson:{id,title}, time_limit_seconds }
// choice_order[display] = canonical index (mcq / true_false; null = identity);
// display_map.left/right/items[display] = canonical id (matching / ordering).
// ============================================================================
import { compareC, u } from "../../content/prng.js";
import { parseNumber } from "../../content/answers.js";
import { cmp } from "../../content/expr.js";
import { searchNormalize } from "../../content/normalize.js";

/**
 * Pattern folding: search normalization plus the removal of a bare hamza, so
 * the common spellings «شيء», «شئ» and «شي» compare equal (searchNormalize
 * folds «ئ» to «ي» but keeps a bare «ء»).
 */
const patternFold = (text) => searchNormalize(text).replace(/ء/g, "").replace(/\s+/g, " ").trim();

/** "All / none of the above" and combined-option patterns (§5.4), folded. */
export const FIXED_OPTION_PATTERNS = Object.freeze([
  "كل ما سبق", "جميع ما سبق", "جميع الإجابات", "لا شيء مما سبق", "ليس مما سبق", "(أ) و(ب)",
  "all of the above", "none of the above", "both a and b",
].map(patternFold));
/** Legacy prep topics whose options are never shuffled. */
export const FIXED_ORDER_TOPICS = Object.freeze(["comparison", "contextual-error"]);

const optionsOf = (item) => item.public?.options ?? [];

export function hasFixedPattern(text) {
  const norm = ` ${patternFold(text)} `;
  return FIXED_OPTION_PATTERNS.some((p) => norm.includes(` ${p} `));
}

/** Every option parses as a number (then options are shown ascending). */
export function allNumeric(options) {
  return options.length > 0 && options.every((o) => parseNumber(o.text).ok);
}

/** §5.4: may this mcq's options be permuted at all? */
export function isShuffleable(item, template) {
  if (item.type !== "mcq") return false;
  if (template && template.randomization && template.randomization.option_shuffle === false) return false;
  if (item.shuffle_options === false) return false;
  if (item.fixed_order_reason || item.public?.fixed_order_reason) return false;
  if (item.topic && FIXED_ORDER_TOPICS.includes(item.topic)) return false;
  return !optionsOf(item).some((o) => hasFixedPattern(o.text));
}

const sortIdsByU = (seed, tag, ids) =>
  ids.map((id) => ({ id, r: u(seed, tag, id) })).sort((a, b) => a.r - b.r || compareC(a.id, b.id)).map((x) => x.id);

/**
 * Display maps of one item for a session seed. They depend on the seed, the
 * key and the public ids only — NEVER on the answer. (An earlier rule swapped
 * the first two ordering items when the shuffle equalled the answer order;
 * that made the answer the one arrangement never shown and the swapped one
 * twice as frequent, so a client collecting displays of an item across
 * sessions — or, with two items, from a single session — read the answer
 * before submitting. A shown order may now equal the answer, with
 * probability 1/n!, exactly like a guess.) Callers may still pass
 * `answerOrder`; it is ignored.
 * @param {string} seed
 * @param {object} item     content row
 * @param {object} [o]
 * @param {object} [o.template]
 */
export function displayMaps(seed, item, { template = null } = {}) {
  const p = item.public ?? {};
  switch (item.type) {
    case "mcq": {
      const opts = optionsOf(item);
      const canonical = opts.map((o) => o.id);
      // a fixed order (true_false, fixed_order_reason, patterns, legacy topics) is the source order
      if (!isShuffleable(item, template)) return { choice_order: null };
      // all-numeric options are shown ascending, which is also deterministic
      if (allNumeric(opts)) {
        const sorted = opts
          .map((o, i) => ({ i, v: parseNumber(o.text).value, id: o.id }))
          .sort((a, b) => cmp(a.v, b.v) || compareC(a.id, b.id))
          .map((x) => x.i);
        return { choice_order: sorted.every((c, d) => c === d) ? null : sorted };
      }
      const order = sortIdsByU(seed, `opt:${item.key}`, canonical).map((id) => canonical.indexOf(id));
      return { choice_order: order.every((c, d) => c === d) ? null : order };
    }
    case "true_false":
      return { choice_order: null };
    case "matching":
      return {
        display_map: {
          left: sortIdsByU(seed, `optl:${item.key}`, (p.left ?? []).map((x) => x.id)),
          right: sortIdsByU(seed, `optr:${item.key}`, (p.right ?? []).map((x) => x.id)),
        },
      };
    case "ordering":
      return { display_map: { items: sortIdsByU(seed, `opt:${item.key}`, (p.items ?? []).map((x) => x.id)) } };
    default:
      return {};
  }
}

const byId = (list) => new Map((list ?? []).map((x) => [x.id, x]));
const indexed = (ids, list) => {
  const m = byId(list);
  return ids.map((id, index) => ({ index, text: m.get(id)?.text ?? "" }));
};

/** mcq / true_false options in display order: [{index, text}]. */
export function displayOptions(item, maps) {
  const opts = optionsOf(item);
  const order = maps?.choice_order ?? opts.map((_, i) => i);
  return order.map((c, index) => ({ index, text: opts[c]?.text ?? "" }));
}

/**
 * The client payload of one question (§5.7): display indexes only — no
 * option / left / right / item ids, no answer, explanation, objective,
 * source pages, provenance or hashes. `handle` replaces the canonical key in
 * `key` (guest sessions: the browser never sees canonical keys, §5.8).
 */
export function publicQuestion(item, position, maps, { handle = null } = {}) {
  const p = item.public ?? {};
  let options = [];
  let pub = {};
  switch (item.type) {
    case "mcq":
    case "true_false":
      options = displayOptions(item, maps);
      break;
    case "matching":
      pub = { left: indexed(maps.display_map.left, p.left), right: indexed(maps.display_map.right, p.right), scoring: p.scoring ?? "partial" };
      break;
    case "ordering":
      pub = { items: indexed(maps.display_map.items, p.items), criterion: p.criterion ?? "other" };
      break;
    case "short_answer":
      pub = { max_chars: p.max_chars ?? 80 };
      break;
    case "numeric":
      pub = {
        // the display unit only; accepted unit spellings stay with the key
        unit: p.unit ? { text: p.unit.text, required: Boolean(p.unit.required) } : null,
        input: { allow_fraction: p.input?.allow_fraction !== false, max_decimals: Number.isInteger(p.input?.max_decimals) ? p.input.max_decimals : null },
      };
      break;
    default:
      break;
  }
  return {
    position,
    key: handle ?? item.key,
    type: item.type,
    language: item.language ?? "ar",
    stem: item.stem,
    stimulus: item.stimulus ? { text: item.stimulus.text } : null,
    options,
    choices: options.map((o) => o.text),
    public: pub,
    time_limit_seconds: item.time_limit_seconds ?? null,
    lesson: item.lesson ? { id: item.lesson.id, title: item.lesson.title ?? null } : null,
  };
}
