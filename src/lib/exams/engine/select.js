// ============================================================================
// Selection (docs/CONTENT_ENGINE.md §5.3 steps 2–3 and 8–10). Server only.
//
//   selectSession({ template, n, minRequired, seed, pool, history, … })
//     → { ok:true, items, keys, allocation, stored, reused, short, lowerBound }
//     | { ok:false, error: "insufficient_pool", available, required }
//     | { ok:false, error: "scope_too_large" }
//
// `pool` rows are the eligible, published items of the scope:
//   { key, lesson, band (1..3), component (exclusion group | null), type,
//     stimulus (id | null), premium, revision, objective?, unit?, chapter?,
//     term?, topic? }
// (the runtime-bank selection rows plus the lesson context from scope.js).
// `history.seen`: Map key → last-seen time (ms) or an array of keys, most
// recent last (guests); `history.wrong`: Map key → last-seen time of items
// last answered wrong (weakness-review).
// Every draw is u(seed, tag, key); conformance fixtures:
// tests/fixtures/engine/selections.json (shared with SQL `_ce_pick`, WP7).
// ============================================================================
import { compareC, u } from "../../content/prng.js";
import { BANDS, allocate, allocationToStored, cellId, retakeAllocation } from "./allocate.js";
import { SCOPE_ITEM_CAP } from "./scope.js";

const DAY_MS = 24 * 3600 * 1000;

/** Stratum of an item under a template (§5.3 step 3; full-year uses (term, unit)). */
export function stratumOf(template, item) {
  const by = template.coverage.stratify_by;
  const unitOrTopic = item.unit ?? item.topic ?? item.lesson;
  if (template.kind === "full_year") return `${item.term ?? "none"}|${unitOrTopic}`;
  switch (by) {
    case "objective":
      return item.objective ?? item.lesson;
    case "lesson":
      return item.lesson;
    case "chapter":
      return item.chapter ?? item.unit ?? item.topic ?? item.lesson;
    case "unit":
      return unitOrTopic;
    case "topic":
      return item.topic ?? item.lesson;
    default:
      return "*";
  }
}

/** Normalize history.seen to Map key → recency number (larger = more recent). */
export function seenMap(seen) {
  if (!seen) return new Map();
  if (seen instanceof Map) return new Map(seen);
  if (Array.isArray(seen)) return new Map(seen.map((k, i) => [k, i + 1]));
  return new Map(Object.entries(seen));
}

/** seen_rank: 0 unseen; 1 + rank by last-seen ascending (oldest first; ties by key). */
function seenRanks(seen) {
  const list = [...seen.entries()].sort((a, b) => a[1] - b[1] || compareC(a[0], b[0]));
  return new Map(list.map(([k], i) => [k, i + 1]));
}

/**
 * Exclusion-group representatives (§5.3 step 2): per group, the member with
 * the smallest u("grp", group + ":" + key) among the unseen members, or among
 * all members when every member has been seen. Items without a group are
 * their own group.
 */
export function representatives(pool, seed, isSeen) {
  const groups = new Map();
  for (const item of pool) {
    const g = item.component ?? item.key;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(item);
  }
  const reps = [];
  for (const [g, members] of groups) {
    const fresh = members.filter((m) => !isSeen(m.key));
    const from = fresh.length ? fresh : members;
    let best = null;
    for (const m of from) {
      const r = u(seed, "grp", `${g}:${m.key}`);
      if (!best || r < best.r || (r === best.r && compareC(m.key, best.m.key) < 0)) best = { m, r };
    }
    reps.push({ ...best.m, group: g, groupSize: members.length });
  }
  return reps.sort((a, b) => compareC(a.key, b.key));
}

/** Question order (§5.3 step 9). */
export function orderItems(items, template, seed, stratum = (it) => stratumOf(template, it)) {
  const byU = [...items].map((it) => ({ it, r: u(seed, "ord", it.key) })).sort((a, b) => a.r - b.r || compareC(a.it.key, b.it.key)).map((x) => x.it);
  const mode = template.randomization.question_order;
  if (mode === "shuffle") return byU;
  const keyOf = mode === "by_stratum" ? (it) => `s:${stratum(it)}` : (it) => (it.stimulus ? `t:${it.stimulus}` : null);
  const members = new Map();
  for (const it of byU) {
    const k = keyOf(it);
    if (k === null) continue;
    if (!members.has(k)) members.set(k, []);
    members.get(k).push(it);
  }
  const out = [];
  const done = new Set();
  for (const it of byU) {
    const k = keyOf(it);
    if (k === null) {
      out.push(it);
      continue;
    }
    if (done.has(k)) continue;
    done.add(k);
    const block = members.get(k);
    // stimulus blocks keep source order (key order); strata keep draw order
    out.push(...(mode === "by_stratum" ? block : [...block].sort((a, b) => compareC(a.key, b.key))));
  }
  return out;
}

/**
 * Select a session.
 * @param {object} o
 * @param {object} o.template
 * @param {number} o.n                 clamped count (planCount)
 * @param {number} o.minRequired       fewer placed items → insufficient_pool
 * @param {string} o.seed              32 hex chars
 * @param {object[]} o.pool
 * @param {{ seen?: Map|string[], wrong?: Map }} [o.history]
 * @param {boolean} [o.premiumAllowed=false]
 * @param {[string, number][]|null} [o.retake]   stored allocation of the original attempt
 * @param {Map<string, number>} [o.errorRates]   stratum → error rate 0..1 (weight error_rate)
 * @param {number} [o.now]
 */
export function selectSession({ template, n, minRequired, seed, pool, history = {}, premiumAllowed = false, retake = null, errorRates = null, now = Date.now() }) {
  const types = new Set(template.types);
  const eligible = pool.filter((it) => types.has(it.type) && (premiumAllowed || !it.premium));
  if (eligible.length > SCOPE_ITEM_CAP) return { ok: false, error: "scope_too_large" };

  const seen = seenMap(history.seen);
  const preferred = new Set();
  if (template.kind === "weakness" && history.wrong) {
    // previously wrong items last seen more than 24 h ago come first and are not avoided
    for (const [k, t] of history.wrong) {
      if (typeof t === "number" && now - t > DAY_MS) {
        preferred.add(k);
        seen.delete(k);
      }
    }
  }
  const isSeen = (k) => seen.has(k);
  const ranks = seenRanks(seen);
  const reps = representatives(eligible, seed, isSeen);

  // Step 3: cells with unseen/seen capacity over the representatives.
  const strata = new Map();
  for (const r of reps) {
    const s = stratumOf(template, r);
    if (!strata.has(s)) strata.set(s, { id: s, lessons: new Set(), size: 0, cap: { 1: { unseen: 0, seen: 0 }, 2: { unseen: 0, seen: 0 }, 3: { unseen: 0, seen: 0 } }, members: new Map() });
    const st = strata.get(s);
    st.lessons.add(r.lesson);
    st.size += 1;
    st.cap[r.band][isSeen(r.key) ? "seen" : "unseen"] += 1;
    const cid = cellId(s, r.band);
    if (!st.members.has(cid)) st.members.set(cid, []);
    st.members.get(cid).push(r);
  }
  const weightOf = (st) => {
    switch (template.coverage.weight) {
      case "lesson_count":
        return st.lessons.size;
      case "pool_size":
        return st.size;
      case "error_rate":
        return Math.round((errorRates?.get(st.id) ?? 0) * 1000);
      default:
        return 1;
    }
  };
  const strataList = [...strata.values()].sort((a, b) => compareC(a.id, b.id)).map((st) => ({ id: st.id, weight: weightOf(st), cap: st.cap }));

  const allow = template.retry.allow_reuse !== false;
  const share = template.retry.max_reuse_share ?? 0;
  const alloc = retake
    ? retakeAllocation({ stored: retake, strata: strataList, seed, allowReuse: allow, maxReuseShare: share })
    : allocate({ n, mix: template.difficulty_mix, strata: strataList, seed, minPerStratum: template.coverage.min_per_stratum ?? 1, allowReuse: allow, maxReuseShare: share });

  if (alloc.placed < minRequired) return { ok: false, error: "insufficient_pool", available: alloc.placed, required: minRequired };

  // Step 8: pick per cell by (preferred, seen_rank, u("sel", key), key).
  const picked = [];
  for (const [cid, q] of alloc.cells) {
    const stratum = cid.slice(0, cid.lastIndexOf("#"));
    const list = strata.get(stratum)?.members.get(cid) ?? [];
    const sorted = list
      .map((it) => ({ it, p: preferred.has(it.key) ? 0 : 1, s: ranks.get(it.key) ?? 0, r: u(seed, "sel", it.key) }))
      .sort((a, b) => a.p - b.p || a.s - b.s || a.r - b.r || compareC(a.it.key, b.it.key));
    picked.push(...sorted.slice(0, q.unseen + q.seen).map((x) => x.it));
  }

  // Step 10: one item per group, a key at most once (guaranteed by construction; asserted).
  const groups = new Set(picked.map((p) => p.group));
  const keys = new Set(picked.map((p) => p.key));
  if (groups.size !== picked.length || keys.size !== picked.length) throw new Error("selection produced a duplicate");

  const items = orderItems(picked, template, seed);
  const reusedCount = picked.filter((p) => isSeen(p.key)).length;
  return {
    ok: true,
    items,
    keys: items.map((i) => i.key),
    allocation: alloc,
    stored: retake ? retake.map(([id, q]) => [id, q]) : allocationToStored(alloc),
    reused: reusedCount > 0,
    reusedCount,
    short: items.length < (retake ? alloc.n : n),
    lowerBound: alloc.lowerBound,
    poolSize: eligible.length,
    groupCount: reps.length,
  };
}

/** Band counts of a pool (for index counts and availability). */
export function bandCounts(pool) {
  const out = { 1: 0, 2: 0, 3: 0 };
  for (const it of pool) if (BANDS.includes(it.band)) out[it.band] += 1;
  return out;
}
