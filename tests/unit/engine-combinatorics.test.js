// How many unique sessions (docs/CONTENT_ENGINE.md §5.6): exact counts,
// checked against brute-force enumeration on small pools and against the
// sets the selection engine actually produces.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { binomial, blueprint, displayPermutations, elementarySymmetric, factorial, log10Big } from "@/lib/exams/engine/combinatorics";
import { getTemplate } from "@/lib/exams/engine/exam-templates";
import { selectSession } from "@/lib/exams/engine/select";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const FIX = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/engine/combinatorics.json"), "utf8"));
const POOLS = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/engine/pools.json"), "utf8")).pools;
const seed = (i) => i.toString(16).padStart(32, "0");

/** Brute force: every choice of n_c components per cell × one member per chosen component. */
function enumerateSets(cells) {
  let sets = [[]];
  for (const { quota, groups } of cells) {
    const next = [];
    const choose = (start, picked) => {
      if (picked.length === quota) {
        // expand member choices of the picked components
        let partial = [[]];
        for (const g of picked) partial = partial.flatMap((p) => g.map((m) => [...p, m]));
        next.push(...partial);
        return;
      }
      for (let i = start; i < groups.length; i++) choose(i + 1, [...picked, groups[i]]);
    };
    choose(0, []);
    sets = sets.flatMap((s) => next.map((n) => [...s, ...n]));
  }
  return new Set(sets.map((s) => [...s].sort().join(",")));
}

// A template without ties in the allocation: mix 50/30/20, n = 10 → 5/3/2 for one stratum.
const T = { ...JSON.parse(JSON.stringify(getTemplate("practice"))), difficulty_mix: { easy: 50, medium: 30, hard: 20 }, coverage: { stratify_by: "lesson", weight: "equal", min_per_stratum: 1 }, retry: { avoid_last_attempts: 0, allow_reuse: false, max_reuse_share: 0 } };
const row = (key, band, component = null) => ({ key, lesson: "L", band, component, type: "mcq", stimulus: null, premium: false, revision: 1 });

describe("combinatorics (§5.6)", () => {
  it("elementary symmetric polynomials, factorials and binomials are exact", () => {
    for (const c of FIX.elementary_symmetric) expect(String(elementarySymmetric(c.g, c.k))).toBe(c.expected);
    expect(binomial(8, 4)).toBe(70n);
    expect(binomial(60, 30)).toBe(118264581564861424n);
    expect(factorial(20)).toBe(2432902008176640000n);
    expect(log10Big(10n ** 40n)).toBeCloseTo(40, 9);
    expect(log10Big(29400n)).toBeCloseTo(Math.log10(29400), 9);
    expect(() => elementarySymmetric([1], -1)).toThrow();
  });

  it("the §5.6 example: 20 items 8/8/4, a 10-question lesson quiz → 29,400 sets and 2 attempts", () => {
    const b = blueprint({ template: getTemplate("lesson-quiz"), pool: POOLS["lesson-20"], n: 10 });
    expect(b.sets_by_component.exact).toBe("29400");
    expect(b.sets_with_variants.exact).toBe("29400");
    expect(b.attempts_before_reuse).toBe(2);
    expect(b.lower_bound).toBe(false);
    expect(b.allocation.map((c) => c.quota)).toEqual([4, 4, 2]);
  });

  it.each(FIX.blueprints.map((b) => [`${b.template} on ${b.pool}`, b]))("blueprint fixture: %s", (_n, b) => {
    expect(blueprint({ template: getTemplate(b.template), pool: POOLS[b.pool], n: b.n })).toEqual(b.expected);
  });

  it("reports both figures: by component and with variants (e_k over component sizes)", () => {
    // band 1: 6 single items; band 2: 3 components of 2 variants each + 1 single; band 3: 2 singles
    const pool = [
      ...[1, 2, 3, 4, 5, 6].map((i) => row(`q-a-${i}`, 1)),
      row("q-b-1a", 2, "g1"), row("q-b-1b", 2, "g1"), row("q-b-2a", 2, "g2"), row("q-b-2b", 2, "g2"), row("q-b-3a", 2, "g3"), row("q-b-3b", 2, "g3"), row("q-b-4", 2),
      row("q-c-1", 3), row("q-c-2", 3), row("q-c-3", 3),
    ];
    const b = blueprint({ template: T, pool, n: 10 });
    expect(b.allocation.map((c) => [c.quota, c.groups])).toEqual([[5, 6], [3, 4], [2, 3]]);
    // by component: C(6,5)·C(4,3)·C(3,2) = 6·4·3
    expect(b.sets_by_component.exact).toBe(String(6 * 4 * 3));
    // with variants: band 2 is e_3(2,2,2,1) = 8 + 3·4 = 20
    expect(b.sets_with_variants.exact).toBe(String(6 * 20 * 3));
    expect(b.attempts_before_reuse).toBe(1);

    // brute force over the same cells
    const cells = [
      { quota: 5, groups: [1, 2, 3, 4, 5, 6].map((i) => [`q-a-${i}`]) },
      { quota: 3, groups: [["q-b-1a", "q-b-1b"], ["q-b-2a", "q-b-2b"], ["q-b-3a", "q-b-3b"], ["q-b-4"]] },
      { quota: 2, groups: [["q-c-1"], ["q-c-2"], ["q-c-3"]] },
    ];
    const all = enumerateSets(cells);
    expect(String(all.size)).toBe(b.sets_with_variants.exact);
    const byComponent = enumerateSets(cells.map((c) => ({ quota: c.quota, groups: c.groups.map((g) => [g[0]]) })));
    expect(String(byComponent.size)).toBe(b.sets_by_component.exact);

    // every set the engine produces is one of them, and enough seeds reach them all
    const seen = new Set();
    for (let i = 0; i < 4000 && seen.size < all.size; i++) {
      const r = selectSession({ template: T, n: 10, minRequired: 10, seed: seed(i + 1), pool });
      const k = [...r.keys].sort().join(",");
      expect(all.has(k)).toBe(true);
      seen.add(k);
    }
    expect(seen.size).toBe(all.size);
  });

  it("a stratum subset (n < |S|) is labelled a lower bound", () => {
    const b = blueprint({ template: getTemplate("chapter-quiz"), pool: POOLS["strata-6"], n: 4 });
    expect(b.lower_bound).toBe(true);
    expect(b.offered).toBe(true);
  });

  it("an insufficient pool is reported, never counted", () => {
    const b = blueprint({ template: getTemplate("chapter-quiz"), pool: POOLS["strata-6"].slice(0, 3), n: 15 });
    expect(b).toMatchObject({ offered: false, reason: "insufficient_pool", available: 3, required: 5 });
    expect(b.sets_by_component).toBeUndefined();
  });

  it("display permutations: units! × Π k_i!, stimulus blocks as one unit, fixed orders excluded", () => {
    const items = [
      { key: "a", stimulus: null }, { key: "b", stimulus: "st-1" }, { key: "c", stimulus: "st-1" }, { key: "d", stimulus: null },
    ];
    const content = new Map([
      ["a", { key: "a", type: "mcq", public: { options: [{ id: "o1", text: "x" }, { id: "o2", text: "y" }, { id: "o3", text: "z" }] }, shuffle_options: true }],
      ["b", { key: "b", type: "true_false", public: { options: [{ id: "t", text: "صح" }, { id: "f", text: "خطأ" }] } }],
      ["c", { key: "c", type: "ordering", public: { items: [{ id: "s1", text: "1" }, { id: "s2", text: "2" }, { id: "s3", text: "3" }] } }],
      ["d", { key: "d", type: "matching", public: { left: [{ id: "l1", text: "a" }, { id: "l2", text: "b" }], right: [{ id: "r1", text: "c" }, { id: "r2", text: "d" }, { id: "r3", text: "e" }] } }],
    ]);
    // 3 units (a, the st-1 block, d) → 3! × 3! (mcq) × 3! (ordering) × 2!·3! (matching)
    expect(displayPermutations(items, getTemplate("practice"), content)).toBe(6n * 6n * 6n * 12n);
  });

  it("all-numeric mcq options are shown ascending: they add no display permutations", () => {
    const items = [{ key: "a", stimulus: null }, { key: "b", stimulus: null }];
    const content = new Map([
      ["a", { key: "a", type: "mcq", shuffle_options: true, public: { options: [{ id: "o1", text: "١٢" }, { id: "o2", text: "3" }, { id: "o3", text: "1,250" }, { id: "o4", text: "2/3" }] } }],
      ["b", { key: "b", type: "mcq", shuffle_options: true, public: { options: [{ id: "o1", text: "x" }, { id: "o2", text: "y" }] } }],
    ]);
    // 2 units → 2! × 2! (b only; a has exactly one display order)
    expect(displayPermutations(items, getTemplate("practice"), content)).toBe(2n * 2n);
  });
});
