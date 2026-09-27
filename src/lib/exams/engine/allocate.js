// ============================================================================
// Allocation (docs/CONTENT_ENGINE.md §5.3 steps 4–7). Server only (HASH-CTR).
//
//   bandTargets(n, mix)                         t_b = largest remainder of n over the mix
//   distribute(total, cells, seed)              capped largest remainder with redistribution
//   allocate({ n, mix, strata, seed, … })       coverage pre-pass + proportional + reuse pass
//   retakeAllocation({ stored, strata, … })     a retake reuses the stored per-cell quotas
//
// A cell is (stratum, band); its id is `${stratum}#${band}`. Every tie is
// broken by keyed draws u(seed, tag, key) and then by the id in C order, so
// the SQL twin (_ce_allocate, WP7) reproduces the result bit for bit; the
// conformance cases live in tests/fixtures/engine/allocations.json.
// All arithmetic is on small integers (no floating point in decisions).
// ============================================================================
import { compareC, u } from "../../content/prng.js";

export const BANDS = Object.freeze([1, 2, 3]);
/** Tie order between bands: medium, then easy, then hard (§5.3 step 5). */
export const BAND_PREFERENCE = Object.freeze([2, 1, 3]);
export const cellId = (stratum, band) => `${stratum}#${band}`;
export const splitCellId = (id) => {
  const i = id.lastIndexOf("#");
  return { stratum: id.slice(0, i), band: Number(id.slice(i + 1)) };
};

const mixOf = (mix) => [mix.easy, mix.medium, mix.hard];

/**
 * Band targets: floor(n·mix_b/100), then the leftover one each to the
 * largest (n·mix_b) mod 100; ties go medium, easy, hard.
 * @returns {number[]} [t1, t2, t3]
 */
export function bandTargets(n, mix) {
  const m = mixOf(mix);
  const total = m[0] + m[1] + m[2];
  if (total <= 0) return [0, 0, 0];
  const base = m.map((w) => Math.floor((n * w) / total));
  const rem = m.map((w) => (n * w) % total);
  let left = n - base[0] - base[1] - base[2];
  const order = [...BAND_PREFERENCE].sort((a, b) => rem[b - 1] - rem[a - 1] || BAND_PREFERENCE.indexOf(a) - BAND_PREFERENCE.indexOf(b));
  for (const b of order) {
    if (left <= 0) break;
    base[b - 1] += 1;
    left -= 1;
  }
  return base;
}

/**
 * Capped largest remainder (§5.3 step 6): floor(total·w/W), the leftover one
 * each to the largest (total·w) mod W (ties: smallest u(seed,"tie",id), then
 * id); every cell is capped, and the excess is redistributed by the same
 * method over the uncapped cells until placed or no capacity is left.
 * @param {number} total
 * @param {{id:string, weight:number, cap:number}[]} cells
 * @returns {{ quotas: Map<string, number>, placed: number }}
 */
export function distribute(total, cells, seed) {
  const quotas = new Map(cells.map((c) => [c.id, 0]));
  let remaining = Math.max(0, total);
  let active = cells.filter((c) => c.weight > 0 && c.cap > 0);
  const tie = new Map();
  const tieOf = (id) => {
    if (!tie.has(id)) tie.set(id, u(seed, "tie", id));
    return tie.get(id);
  };
  while (remaining > 0 && active.length) {
    const W = active.reduce((s, c) => s + c.weight, 0);
    const shares = active.map((c) => ({ c, give: Math.floor((remaining * c.weight) / W), rem: (remaining * c.weight) % W }));
    let left = remaining - shares.reduce((s, x) => s + x.give, 0);
    const order = [...shares].sort((a, b) => b.rem - a.rem || tieOf(a.c.id) - tieOf(b.c.id) || compareC(a.c.id, b.c.id));
    for (const s of order) {
      if (left <= 0) break;
      s.give += 1;
      left -= 1;
    }
    let placed = 0;
    for (const s of shares) {
      const room = s.c.cap - quotas.get(s.c.id);
      const take = Math.min(s.give, room);
      quotas.set(s.c.id, quotas.get(s.c.id) + take);
      placed += take;
    }
    remaining -= placed;
    active = active.filter((c) => c.cap - quotas.get(c.id) > 0);
    if (placed === 0) break;
  }
  return { quotas, placed: Math.max(0, total) - remaining };
}

/**
 * Normalize stratum weights: an all-zero weighting (e.g. error rates with no
 * history) falls back to equal weights.
 */
function stratumWeights(strata) {
  const w = new Map(strata.map((s) => [s.id, Math.max(0, Math.round(s.weight ?? 1))]));
  if ([...w.values()].every((x) => x === 0)) for (const k of w.keys()) w.set(k, 1);
  return w;
}

/**
 * Fresh allocation (§5.3 steps 4–7).
 * @param {object} o
 * @param {number} o.n                     session size after tier clamping
 * @param {{easy,medium,hard}} o.mix       template difficulty mix (integer percentages)
 * @param {{id:string, weight:number, cap:{[band]: {unseen:number, seen:number}}}[]} o.strata
 * @param {string} o.seed
 * @param {number} [o.minPerStratum=1]
 * @param {boolean} [o.allowReuse=true]
 * @param {number} [o.maxReuseShare=30]
 * @returns {{ n, targets:number[], cells: Map<string,{unseen:number, seen:number}>, placed:number,
 *             reused:number, lowerBound:boolean, prepass:string[] }}
 */
export function allocate({ n, mix, strata, seed, minPerStratum = 1, allowReuse = true, maxReuseShare = 30 }) {
  const targets = bandTargets(n, mix);
  const m = mixOf(mix);
  const weights = stratumWeights(strata);
  const capU = new Map();
  const capS = new Map();
  for (const s of strata) {
    for (const b of BANDS) {
      capU.set(cellId(s.id, b), s.cap[b]?.unseen ?? 0);
      capS.set(cellId(s.id, b), s.cap[b]?.seen ?? 0);
    }
  }
  const unseen = new Map([...capU.keys()].map((k) => [k, 0]));

  // Step 5: coverage pre-pass over the strata with unseen capacity.
  const withCap = strata.filter((s) => BANDS.some((b) => capU.get(cellId(s.id, b)) > 0)).map((s) => s.id);
  const ranked = withCap
    .map((id) => ({ id, r: u(seed, "strat", id) }))
    .sort((a, b) => a.r - b.r || compareC(a.id, b.id))
    .map((x) => x.id);
  const prepass = minPerStratum > 0 ? (n >= ranked.length ? ranked : ranked.slice(0, n)) : [];
  const lowerBound = minPerStratum > 0 && n < ranked.length;
  const assigned = [0, 0, 0];
  for (const s of prepass) {
    let best = null;
    for (const b of BAND_PREFERENCE) {
      const id = cellId(s, b);
      if (capU.get(id) - unseen.get(id) <= 0) continue;
      const need = targets[b - 1] - assigned[b - 1];
      if (best === null || need > best.need) best = { b, need };
    }
    if (!best) continue;
    const id = cellId(s, best.b);
    unseen.set(id, unseen.get(id) + 1);
    assigned[best.b - 1] += 1;
  }
  const pre = prepass.length;

  // Step 6: proportional pass over the unseen capacity.
  const cellList = (capOf, used) => {
    const out = [];
    for (const s of strata) {
      for (const b of BANDS) {
        const id = cellId(s.id, b);
        out.push({ id, weight: weights.get(s.id) * m[b - 1], cap: capOf.get(id) - (used ? used.get(id) : 0) });
      }
    }
    return out;
  };
  const prop = distribute(n - pre, cellList(capU, unseen), seed);
  for (const [id, q] of prop.quotas) unseen.set(id, unseen.get(id) + q);
  const placedUnseen = pre + prop.placed;

  // Step 7: reuse pass over the seen capacity, up to ceil(n·share/100).
  const seen = new Map([...capS.keys()].map((k) => [k, 0]));
  let reused = 0;
  if (placedUnseen < n && allowReuse) {
    const budget = Math.ceil((n * maxReuseShare) / 100);
    const r = distribute(Math.min(n - placedUnseen, budget), cellList(capS, null), seed);
    for (const [id, q] of r.quotas) seen.set(id, q);
    reused = r.placed;
  }
  const cells = new Map();
  for (const id of capU.keys()) {
    const a = unseen.get(id);
    const b = seen.get(id);
    if (a || b) cells.set(id, { unseen: a, seen: b });
  }
  return { n, targets, cells, placed: placedUnseen + reused, reused, lowerBound, prepass };
}

/**
 * Retake (§5.3 step 4): the stored per-cell quotas are reused, capped by the
 * current capacity. Unseen items fill each cell first; the shortfall is
 * filled from seen items up to ceil(n·share/100), distributed over the cells
 * by their shortfall (capped largest remainder).
 * @param {{ stored: [string, number][], strata, seed, allowReuse?, maxReuseShare? }} o
 */
export function retakeAllocation({ stored, strata, seed, allowReuse = true, maxReuseShare = 30 }) {
  const capU = new Map();
  const capS = new Map();
  for (const s of strata) {
    for (const b of BANDS) {
      capU.set(cellId(s.id, b), s.cap[b]?.unseen ?? 0);
      capS.set(cellId(s.id, b), s.cap[b]?.seen ?? 0);
    }
  }
  const n = stored.reduce((acc, [, q]) => acc + q, 0);
  const unseen = new Map();
  const shortCells = [];
  let placedUnseen = 0;
  for (const [id, q] of [...stored].sort((a, b) => compareC(a[0], b[0]))) {
    const take = Math.min(q, capU.get(id) ?? 0);
    unseen.set(id, take);
    placedUnseen += take;
    const short = q - take;
    if (short > 0) shortCells.push({ id, weight: short, cap: Math.min(short, capS.get(id) ?? 0) });
  }
  const seen = new Map();
  let reused = 0;
  if (allowReuse && shortCells.length) {
    const budget = Math.ceil((n * maxReuseShare) / 100);
    const r = distribute(Math.min(budget, n - placedUnseen), shortCells, seed);
    for (const [id, q] of r.quotas) seen.set(id, q);
    reused = r.placed;
  }
  const cells = new Map();
  for (const [id] of stored) {
    const a = unseen.get(id) ?? 0;
    const b = seen.get(id) ?? 0;
    if (a || b) cells.set(id, { unseen: a, seen: b });
  }
  return { n, targets: null, cells, placed: placedUnseen + reused, reused, lowerBound: false, prepass: [] };
}

/** Storable form of an allocation (meta.allocation / token `al`): per-cell quotas, C order. */
export function allocationToStored(result) {
  return [...result.cells.entries()]
    .map(([id, q]) => [id, q.unseen + q.seen])
    .filter(([, q]) => q > 0)
    .sort((a, b) => compareC(a[0], b[0]));
}

/** Validate a stored allocation (from a token or the DB). */
export function isStoredAllocation(v, maxCells = 200) {
  return Array.isArray(v) && v.length <= maxCells && v.every((c) => Array.isArray(c) && c.length === 2
    && typeof c[0] === "string" && c[0].length <= 220 && /#[123]$/.test(c[0]) && Number.isInteger(c[1]) && c[1] > 0 && c[1] <= 100);
}
