// ============================================================================
// How many unique sessions — computed, not guessed (docs/CONTENT_ENGINE.md §5.6).
// Used by scripts/content/report.mjs --exams (WP10). Server/scripts only.
//
//   elementarySymmetric(gs, k)      e_k(g_1 … g_m), exact BigInt
//   blueprint({ template, pool, … }) allocation for a fresh learner (seed 0…0) plus:
//     sets_by_component   Π_cells C(m_c, n_c)          (sets that differ in which problems)
//     sets_with_variants  Π_cells e_{n_c}(sizes)       (also numeric/rewrite variants)
//     attempts_before_reuse  min_c floor(groups_c / n_c)
//     display_permutations   units! × Π k_i!  (a separate figure: display orders of one set)
//   Every figure is exact (decimal string) and log10; `lower_bound` is true
//   when the coverage pre-pass had to pick a stratum subset (n < |S|).
// Figures are per template × scope only — never summed across templates or
// overlapping scopes (§5.6, asserted by WP10's report test).
// ============================================================================
import { cellId } from "./allocate.js";
import { representatives, selectSession, stratumOf } from "./select.js";
import { allNumeric, isShuffleable } from "./shuffle.js";

export const ZERO_SEED = "0".repeat(32);

/** e_k(g_1 … g_m): e[0]=1; for g: for j=k..1: e[j] += e[j−1]·g (BigInt). */
export function elementarySymmetric(gs, k) {
  if (!Number.isInteger(k) || k < 0) throw new RangeError("k must be a non-negative integer");
  if (k > gs.length) return 0n;
  const e = new Array(k + 1).fill(0n);
  e[0] = 1n;
  for (const g of gs) {
    const b = BigInt(g);
    for (let j = k; j >= 1; j--) e[j] += e[j - 1] * b;
  }
  return e[k];
}

export function factorial(n) {
  let r = 1n;
  for (let i = 2n; i <= BigInt(n); i++) r *= i;
  return r;
}

export function binomial(n, k) {
  if (k < 0 || k > n) return 0n;
  return elementarySymmetric(new Array(n).fill(1), k);
}

/** log10 of a non-negative BigInt (−Infinity for 0), to ~12 significant digits. */
export function log10Big(b) {
  if (b <= 0n) return b === 0n ? -Infinity : NaN;
  const s = b.toString();
  const head = Number(`${s.slice(0, 15)}`);
  return Math.log10(head) + (s.length - Math.min(s.length, 15));
}

const figure = (b) => ({ exact: b.toString(), log10: Math.round(log10Big(b) * 1e6) / 1e6 });

/** Display orders of one selected set: units! × Π k_i! (stimulus blocks are one unit). */
export function displayPermutations(items, template, contentByKey = new Map()) {
  const keep = template.randomization.question_order === "shuffle_keep_stimulus";
  const blocks = new Set();
  let units = 0;
  let product = 1n;
  for (const it of items) {
    if (keep && it.stimulus) {
      if (!blocks.has(it.stimulus)) {
        blocks.add(it.stimulus);
        units += 1;
      }
    } else units += 1;
    const c = contentByKey.get(it.key);
    if (!c) continue;
    const p = c.public ?? {};
    // all-numeric options are always shown ascending: one display order, not k!
    if (c.type === "mcq" && isShuffleable(c, template) && !allNumeric(p.options ?? [])) product *= factorial((p.options ?? []).length);
    else if (c.type === "matching") product *= factorial((p.left ?? []).length) * factorial((p.right ?? []).length);
    else if (c.type === "ordering") product *= factorial((p.items ?? []).length);
  }
  return factorial(units) * product;
}

/**
 * Blueprint of one template × scope (§5.6).
 * @param {object} o
 * @param {object} o.template
 * @param {object[]} o.pool               eligible rows (see select.js), premium already excluded
 * @param {number} [o.n]                  default: template.count.default
 * @param {Map} [o.contentByKey]          content rows for display permutations (optional)
 */
export function blueprint({ template, pool, n = template.count.default, contentByKey = null }) {
  const types = new Set(template.types);
  const eligible = pool.filter((p) => types.has(p.type));
  const components = new Map();
  for (const it of eligible) {
    const g = it.component ?? it.key;
    components.set(g, (components.get(g) ?? 0) + 1);
  }
  const head = { template: `${template.id}@${template.version}`, n, pool_items: eligible.length, components: components.size, variants: eligible.length - components.size };
  const sel = selectSession({ template, n, minRequired: Math.min(template.count.min, n), seed: ZERO_SEED, pool: eligible });
  if (!sel.ok) return { ...head, offered: false, reason: sel.error, available: sel.available ?? null, required: sel.required ?? null };

  // Components per cell, assigned to the cell of their seed-0 representative.
  const reps = representatives(eligible, ZERO_SEED, () => false);
  const perCell = new Map();
  for (const r of reps) {
    const id = cellId(stratumOf(template, r), r.band);
    if (!perCell.has(id)) perCell.set(id, []);
    perCell.get(id).push(components.get(r.group));
  }
  let byComponent = 1n;
  let withVariants = 1n;
  let attempts = Infinity;
  const cells = [];
  for (const [id, q] of [...sel.allocation.cells.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    const quota = q.unseen + q.seen;
    const sizes = perCell.get(id) ?? [];
    byComponent *= binomial(sizes.length, quota);
    withVariants *= elementarySymmetric(sizes, quota);
    attempts = Math.min(attempts, Math.floor(sizes.length / quota));
    cells.push({ cell: id, quota, groups: sizes.length, items: sizes.reduce((s, g) => s + g, 0) });
  }
  return {
    ...head,
    offered: true,
    selected: sel.items.length,
    short: sel.short,
    lower_bound: sel.lowerBound,
    allocation: cells,
    sets_by_component: figure(byComponent),
    sets_with_variants: figure(withVariants),
    attempts_before_reuse: Number.isFinite(attempts) ? attempts : 0,
    display_permutations: contentByKey ? figure(displayPermutations(sel.items, template, contentByKey)) : null,
  };
}
