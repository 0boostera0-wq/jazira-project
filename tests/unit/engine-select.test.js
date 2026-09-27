// Exam engine selection (docs/CONTENT_ENGINE.md §5.3, §5.4, §2.12): templates
// and tier clamping, scope grammar and resolution over the node-tree fixture,
// allocation and selection against the conformance fixtures (shared with SQL,
// WP7), retakes, exclusion groups, option shuffling.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  TEMPLATES, TIERS, getTemplate, planCount, planTiming, planFeedback, offerFor, validateTemplate, tierMax, UNTIMED_SECONDS,
} from "@/lib/exams/engine/exam-templates";
import { parseScope, resolveScope, eligibleLessons, createTree, checkScopeCaps, scopeKind } from "@/lib/exams/engine/scope";
import { allocate, retakeAllocation, bandTargets, distribute, isStoredAllocation } from "@/lib/exams/engine/allocate";
import { selectSession, orderItems, representatives, stratumOf } from "@/lib/exams/engine/select";
import { displayMaps, publicQuestion, isShuffleable, hasFixedPattern } from "@/lib/exams/engine/shuffle";
import { u } from "@/lib/content/prng";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const fixture = (rel) => JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
const OUTLINE = fixture("tests/fixtures/content/outline-tree.json");
const POOLS = fixture("tests/fixtures/engine/pools.json").pools;
const HISTORIES = fixture("tests/fixtures/engine/histories.json").histories;
const SELECTIONS = fixture("tests/fixtures/engine/selections.json").cases;
const ALLOCATIONS = fixture("tests/fixtures/engine/allocations.json").cases;
const RETAKES = fixture("tests/fixtures/engine/retake-allocations.json").cases;
const PERMUTATIONS = fixture("tests/fixtures/engine/permutations.json").cases;
const BANK = "tests/fixtures/engine/runtime-bank";
const loadChunk = (p) => fixture(`${BANK}/${p}`);
const templateOf = (t) => (typeof t === "string" ? getTemplate(t) : { ...JSON.parse(JSON.stringify(getTemplate(t.base))), ...t.overrides });
const seed = (i) => i.toString(16).padStart(32, "0");

describe("exam templates (§2.12)", () => {
  it("has the ten v1 templates, each structurally valid, matching the WP1 export fixture", () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual(["chapter-quiz", "full-year", "lesson-quiz", "mock", "practice", "random-practice", "subject-quiz", "term-exam", "timed", "weakness-review"]);
    for (const t of TEMPLATES) expect(validateTemplate(t)).toEqual([]);
    const exported = fixture("tests/fixtures/content/staging/exams/templates.json");
    for (const e of exported) {
      const t = getTemplate(e.id, e.version);
      for (const k of ["kind", "scope_kinds", "count", "difficulty_mix", "coverage", "term_rule", "timing", "feedback", "retry", "quota"]) expect(t[k]).toEqual(e[k]);
    }
    expect(Object.isFrozen(TEMPLATES[0].count)).toBe(true);
    expect(getTemplate("nope")).toBeNull();
    expect(getTemplate("chapter-quiz", 2)).toBeNull();
  });

  it("clamps every template × tier as specified (mini full year for free and guests)", () => {
    for (const t of TEMPLATES) {
      for (const tier of TIERS) {
        const plan = planCount(t, tier, null);
        const cap = tierMax(t, tier);
        expect(plan.ok, `${t.id}/${tier}`).toBe(true);
        if (cap < t.count.min) {
          expect(t.id).toBe("full-year");
          expect(plan).toMatchObject({ mini: true, n: Math.min(25, cap), limited: true });
        } else {
          expect(plan.mini).toBe(false);
          expect(plan.n).toBe(Math.min(t.count.default, cap));
          expect(plan.n).toBeGreaterThanOrEqual(Math.min(t.count.min, plan.n));
        }
        expect(plan.n).toBeLessThanOrEqual(tier === "guest" ? 20 : tier === "free" ? 25 : t.count.max);
      }
    }
    // the table of §2.12: free exam sessions are capped at 25; term-exam and mock clamp to it
    expect(planCount(getTemplate("term-exam"), "free")).toMatchObject({ n: 25, mini: false, limited: true });
    expect(planCount(getTemplate("mock"), "free")).toMatchObject({ n: 25, mini: false });
    expect(planCount(getTemplate("full-year"), "free")).toMatchObject({ n: 25, mini: true });
    expect(planCount(getTemplate("full-year"), "premium")).toMatchObject({ n: 60, mini: false });
    expect(planCount(getTemplate("full-year"), "guest")).toMatchObject({ n: 20, mini: true });
    expect(planCount(getTemplate("chapter-quiz"), "premium", 40)).toMatchObject({ n: 40, limited: false });
    expect(planCount(getTemplate("chapter-quiz"), "free", 40)).toMatchObject({ n: 25, limited: true });
    expect(planCount(getTemplate("chapter-quiz"), "free", 4)).toMatchObject({ ok: false, field: "count" });
    expect(planCount(getTemplate("chapter-quiz"), "free", 41)).toMatchObject({ ok: false, field: "count" });
    const noMini = { ...JSON.parse(JSON.stringify(getTemplate("full-year"))), count: { default: 60, min: 30, max: 100, guest_max: 20, free_max: 25, mini: null } };
    expect(planCount(noMini, "free")).toEqual({ ok: false, error: "premium_required" });
  });

  it("timing, feedback and the pool rule", () => {
    expect(planTiming(getTemplate("chapter-quiz"), 15)).toMatchObject({ mode: "timed", seconds: 1125 });
    expect(planTiming(getTemplate("chapter-quiz"), 2)).toMatchObject({ seconds: 300 });   // min_seconds
    expect(planTiming(getTemplate("term-exam"), 80)).toMatchObject({ seconds: 7200 });    // ≤ 120 min
    expect(planTiming(getTemplate("lesson-quiz"), 10)).toMatchObject({ mode: "untimed", seconds: UNTIMED_SECONDS });
    expect(planTiming(getTemplate("lesson-quiz"), 10, "timed")).toMatchObject({ mode: "timed", seconds: 600 });
    expect(planTiming(getTemplate("timed"), 10, "untimed")).toMatchObject({ ok: false });  // strict
    expect(planFeedback(getTemplate("chapter-quiz"), "immediate")).toEqual({ ok: false, error: "feedback_not_allowed" });
    expect(planFeedback(getTemplate("lesson-quiz"))).toEqual({ ok: true, mode: "immediate" });
    expect(offerFor(getTemplate("chapter-quiz"), "free", 5)).toMatchObject({ offered: true, required: 5 });
    expect(offerFor(getTemplate("chapter-quiz"), "free", 4)).toMatchObject({ offered: false, reason: "insufficient_pool" });
    expect(offerFor(getTemplate("full-year"), "free", 25)).toMatchObject({ offered: true, mini: true, required: 25 });
  });
});

describe("scope grammar and resolution (§5.3 step 1) on the node-tree fixture", () => {
  const tree = createTree(OUTLINE.nodes, OUTLINE.subject_terms);

  it("parses the grammar strictly", () => {
    expect(parseScope("middle/grade-1/math@t1")).toMatchObject({ type: "node", node: "middle/grade-1/math", term: "t1" });
    expect(parseScope("prep:aptitude/verbal/analogy")).toMatchObject({ type: "prep", exam: "aptitude", section: "verbal", topic: "analogy" });
    expect(parseScope("weak:")).toMatchObject({ type: "weak", node: null });
    expect(parseScope("weak:middle/grade-1/math")).toMatchObject({ type: "weak", node: "middle/grade-1/math" });
    for (const bad of ["", "middle/grade-1/math@t3", "middle/../etc", "middle/grade-1/math/", " middle", "prep:aptitude/physics", "prep:achievement/math/analogy", "prep:", "Middle", "a".repeat(201), "middle\\grade-1", "middle/grade-1/math@t1@t2"]) {
      expect(parseScope(bad), bad).toBeNull();
    }
  });

  it("eligibleLessons matches every pinned query of the fixture", async () => {
    for (const [scope, expected] of Object.entries(OUTLINE.expected.eligibleLessons)) {
      expect(await eligibleLessons(tree, scope), scope).toEqual(expected);
    }
  });

  it("resolves context, kinds and refusals; guests keep to subject level or narrower", async () => {
    const r = await resolveScope(tree, parseScope("middle/grade-1/science"));
    expect(r.lessons.find((l) => l.id.endsWith("xe389fa43"))).toMatchObject({ unit: "middle/grade-1/science/x9368a8a7", chapter: "middle/grade-1/science/xc8b1a031", subject: "middle/grade-1/science" });
    expect((await resolveScope(tree, parseScope("middle/grade-1/math@t2"))).kind).toBe("subject@t2");
    expect(await resolveScope(tree, parseScope("middle/grade-1/math/n999"))).toEqual({ ok: false, error: "scope_not_found" });
    expect(await resolveScope(tree, parseScope("middle/grade-1/t1"))).toEqual({ ok: false, error: "scope_not_found" });
    expect(await resolveScope(tree, parseScope("middle/grade-1/math/n91@t1"))).toMatchObject({ ok: false, field: "scope" });
    expect(scopeKind(parseScope("prep:aptitude/verbal"))).toBe("prep_section");
    for (const k of ["stage", "grade", "track", "prep"]) expect(checkScopeCaps(k, "guest")).toEqual({ ok: false, error: "scope_too_large" });
    for (const k of ["subject", "subject@t1", "unit", "lesson", "prep_section"]) expect(checkScopeCaps(k, "guest").ok).toBe(true);
    expect(checkScopeCaps("grade", "free").ok).toBe(true);
  });

  it("works with an async tree (WP2's reader is async)", async () => {
    const asyncTree = { nodeById: async (id) => tree.nodeById(id), lessonsUnder: async (id) => tree.lessonsUnder(id) };
    expect(await eligibleLessons(asyncTree, "middle/grade-1/math@t1")).toEqual(OUTLINE.expected.eligibleLessons["middle/grade-1/math@t1"]);
  });
});

describe("allocation (§5.3 steps 4–7) — conformance fixtures", () => {
  it("band targets by largest remainder; ties medium, easy, hard", () => {
    expect(bandTargets(10, { easy: 40, medium: 40, hard: 20 })).toEqual([4, 4, 2]);
    expect(bandTargets(10, { easy: 34, medium: 33, hard: 33 })).toEqual([4, 3, 3]);
    expect(bandTargets(5, { easy: 40, medium: 40, hard: 20 })).toEqual([2, 2, 1]);
    expect(bandTargets(3, { easy: 40, medium: 40, hard: 20 })).toEqual([1, 1, 1]);
    expect(bandTargets(1, { easy: 40, medium: 40, hard: 20 })).toEqual([0, 1, 0]);
    expect(bandTargets(7, { easy: 30, medium: 45, hard: 25 })).toEqual([2, 3, 2]);
  });

  it("distribute caps and redistributes until placed or out of capacity", () => {
    const r = distribute(7, [{ id: "a", weight: 1, cap: 1 }, { id: "b", weight: 1, cap: 10 }, { id: "c", weight: 2, cap: 2 }], seed(1));
    expect(Object.fromEntries(r.quotas)).toEqual({ a: 1, b: 4, c: 2 });
    expect(distribute(9, [{ id: "a", weight: 1, cap: 2 }], seed(1)).placed).toBe(2);
    expect(distribute(3, [{ id: "a", weight: 0, cap: 5 }], seed(1)).placed).toBe(0);
  });

  it.each(ALLOCATIONS.map((c) => [c.name, c]))("%s", (_name, c) => {
    const r = allocate({ n: c.n, mix: c.mix, strata: c.strata, seed: c.seed, minPerStratum: c.min_per_stratum, allowReuse: c.allow_reuse, maxReuseShare: c.max_reuse_share });
    const cells = [...r.cells.entries()].map(([id, q]) => [id, q.unseen, q.seen]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    expect({ targets: r.targets, cells, placed: r.placed, reused: r.reused, lower_bound: r.lowerBound, prepass: r.prepass }).toEqual(c.expected);
  });

  it.each(RETAKES.map((c) => [c.name, c]))("retake: %s", (_name, c) => {
    const r = retakeAllocation({ stored: c.stored, strata: c.strata, seed: c.seed, allowReuse: c.allow_reuse, maxReuseShare: c.max_reuse_share });
    const cells = [...r.cells.entries()].map(([id, q]) => [id, q.unseen, q.seen]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    expect({ n: r.n, cells, placed: r.placed, reused: r.reused }).toEqual(c.expected);
    // reuse beyond ceil(n·share/100) is forced only once every unseen item is placed
    const unseenCap = c.strata.reduce((s, st) => s + [1, 2, 3].reduce((t, b) => t + (st.cap[b]?.unseen ?? 0), 0), 0);
    const placedUnseen = r.placed - r.reused;
    if (r.reused > Math.ceil((r.n * c.max_reuse_share) / 100)) expect(placedUnseen).toBe(unseenCap);
    if (!c.allow_reuse) expect(r.reused).toBe(0);
    // short only when the pool itself is too small
    const seenCap = c.strata.reduce((s, st) => s + [1, 2, 3].reduce((t, b) => t + (st.cap[b]?.seen ?? 0), 0), 0);
    expect(r.placed).toBe(Math.min(r.n, unseenCap + (c.allow_reuse ? seenCap : 0)));
  });

  it("stored allocations are validated before reuse", () => {
    expect(isStoredAllocation([["middle/grade-1/math/n54#2", 3]])).toBe(true);
    for (const bad of [[["x#4", 1]], [["x#1", 0]], [["x#1", 1.5]], "x", [["x#1"]], new Array(201).fill(["x#1", 1])]) expect(isStoredAllocation(bad)).toBe(false);
  });
});

describe("selection (§5.3 steps 2–10) — conformance fixtures", () => {
  const historyOf = (name) => {
    const h = HISTORIES[name];
    return { seen: new Map(h.seen), wrong: new Map(h.wrong), now: h.now };
  };

  it.each(SELECTIONS.map((c) => [c.name, c]))("%s", (_name, c) => {
    const h = historyOf(c.history);
    const r = selectSession({ template: templateOf(c.template), n: c.n, minRequired: c.min_required, seed: c.seed, pool: POOLS[c.pool], history: h, retake: c.retake, now: h.now });
    if (!c.expected.ok) {
      expect({ ok: r.ok, error: r.error, available: r.available ?? null, required: r.required ?? null }).toEqual(c.expected);
      return;
    }
    expect({ ok: true, keys: r.keys, stored: r.stored, reused: r.reused, reused_count: r.reusedCount, short: r.short, lower_bound: r.lowerBound }).toEqual(c.expected);
  });

  it("no repeats and at most one item per exclusion group, over many seeds", () => {
    const t = getTemplate("practice");
    const groupOf = new Map(POOLS.variants.map((r) => [r.key, r.component ?? r.key]));
    for (let i = 0; i < 300; i++) {
      const r = selectSession({ template: t, n: 12, minRequired: 5, seed: seed(i + 1), pool: POOLS.variants });
      expect(new Set(r.keys).size).toBe(r.keys.length);
      expect(new Set(r.keys.map((k) => groupOf.get(k))).size).toBe(r.keys.length);
      // a stimulus block is contiguous and in source (key) order
      const st = r.items.map((it, idx) => [it.stimulus, idx, it.key]).filter(([s]) => s);
      if (st.length > 1) {
        expect(st[st.length - 1][1] - st[0][1]).toBe(st.length - 1);
        expect(st.map((x) => x[2])).toEqual([...st.map((x) => x[2])].sort());
      }
    }
  });

  it("premium items never enter a pool unless allowed", () => {
    const pool = POOLS["math-subject"];
    const premium = new Set(pool.filter((r) => r.premium).map((r) => r.key));
    expect(premium.size).toBeGreaterThan(0);
    for (let i = 0; i < 50; i++) {
      const r = selectSession({ template: getTemplate("subject-quiz"), n: 20, minRequired: 10, seed: seed(i + 7), pool });
      expect(r.keys.some((k) => premium.has(k))).toBe(false);
    }
    const all = selectSession({ template: getTemplate("subject-quiz"), n: 60, minRequired: 10, seed: seed(3), pool, premiumAllowed: true });
    expect(all.keys.some((k) => premium.has(k))).toBe(true);
  });

  it("a retake avoids seen items when enough alternatives exist and reuses within max_reuse_share otherwise", () => {
    const t = getTemplate("lesson-quiz");
    const pool = POOLS["lesson-20"];
    const first = selectSession({ template: t, n: 10, minRequired: 3, seed: seed(11), pool });
    const seen = new Map(first.keys.map((k, i) => [k, i + 1]));
    const retake = selectSession({ template: t, n: 10, minRequired: 3, seed: seed(12), pool, history: { seen }, retake: first.stored });
    expect(retake.keys.filter((k) => seen.has(k))).toEqual([]);          // 10 fresh items were available
    expect(retake.stored).toEqual(first.stored);                          // the same per-cell quotas
    const bandOf = new Map(pool.map((r) => [r.key, r.band]));
    const bands = (keys) => [1, 2, 3].map((b) => keys.filter((k) => bandOf.get(k) === b).length);
    expect(bands(retake.keys)).toEqual(bands(first.keys));                // identical distribution
    // a third attempt: everything seen → controlled reuse (ceil(10 × 30 %) = 3), then forced
    // reuse keeps the session whole, with the same distribution
    const seen2 = new Map([...seen, ...retake.keys.map((k, i) => [k, 100 + i])]);
    const third = selectSession({ template: t, n: 10, minRequired: 3, seed: seed(13), pool, history: { seen: seen2 }, retake: first.stored });
    expect(third).toMatchObject({ ok: true, reusedCount: 10, reused: true, short: false });
    expect(bands(third.keys)).toEqual(bands(first.keys));
    // forced reuse takes the oldest-seen items: the first attempt's, never the retake's
    expect(third.keys.filter((k) => seen.has(k))).toHaveLength(10);
    // within a cell the oldest-seen item is reused first (seen_rank before u(sel))
    const single = selectSession({ template: t, n: 1, minRequired: 1, seed: seed(14), pool: pool.slice(0, 2), history: { seen: new Map([[pool[0].key, 5], [pool[1].key, 1]]) } });
    expect(single.keys).toEqual([pool[1].key]);
  });

  it("small pools: a retake reuses seen items instead of failing, and is short only when the pool is", () => {
    const lesson = getTemplate("lesson-quiz");
    const small = POOLS["lesson-6"];
    expect(small).toHaveLength(6);
    for (let i = 0; i < 20; i++) {
      // browser bug 1: a guest lesson-quiz retake on a 6-item lesson answered 422 insufficient_pool
      const first = selectSession({ template: lesson, n: 10, minRequired: 3, seed: seed(100 + i), pool: small });
      expect(first).toMatchObject({ ok: true, short: true });
      expect(first.keys).toHaveLength(6);
      const n = first.stored.reduce((s, [, q]) => s + q, 0);
      const seen = new Map(first.keys.map((k, j) => [k, j + 1]));
      const again = selectSession({ template: lesson, n, minRequired: Math.min(lesson.count.min, n), seed: seed(200 + i), pool: small, history: { seen }, retake: first.stored });
      expect(again).toMatchObject({ ok: true, short: false, reused: true, reusedCount: 6, stored: first.stored });
      expect(new Set(again.keys)).toEqual(new Set(first.keys));
    }
    // browser bug 2: a unit-quiz retake returned 6 of 15 although reuse is allowed
    const chapter = getTemplate("chapter-quiz");
    const unit = POOLS["unit-n91"];
    for (let i = 0; i < 20; i++) {
      const first = selectSession({ template: chapter, n: 15, minRequired: 5, seed: seed(300 + i), pool: unit });
      expect(first.keys).toHaveLength(15);
      const seen = new Map(first.keys.map((k, j) => [k, j + 1]));
      const fresh = new Set(unit.filter((r) => !seen.has(r.key) && !r.premium && chapter.types.includes(r.type)).map((r) => r.component ?? r.key)).size; // exclusion groups with an unseen member
      const again = selectSession({ template: chapter, n: 15, minRequired: 5, seed: seed(400 + i), pool: unit, history: { seen }, retake: first.stored });
      expect(again).toMatchObject({ ok: true, short: false, stored: first.stored });
      expect(again.keys).toHaveLength(15);
      // every fresh item of the unit is used before any seen one is repeated
      expect(again.keys.filter((k) => !seen.has(k)).length).toBe(Math.min(fresh, 15));
      // a fresh start with that history fills up to the requested count too
      const next = selectSession({ template: chapter, n: 15, minRequired: 5, seed: seed(500 + i), pool: unit, history: { seen } });
      expect(next).toMatchObject({ ok: true, short: false });
      expect(next.keys).toHaveLength(15);
    }
    // short (never insufficient_pool) only when the whole pool is below n but at least the minimum
    const all = new Map(small.map((r, j) => [r.key, j + 1]));
    expect(selectSession({ template: lesson, n: 10, minRequired: 3, seed: seed(9), pool: small, history: { seen: all } })).toMatchObject({ ok: true, short: true, reusedCount: 6 });
    expect(selectSession({ template: lesson, n: 10, minRequired: 3, seed: seed(9), pool: small.slice(0, 2), history: { seen: all } }))
      .toEqual({ ok: false, error: "insufficient_pool", available: 2, required: 3 });
    // allow_reuse off: never a seen item, so the session is short
    const strict = { ...JSON.parse(JSON.stringify(lesson)), retry: { ...lesson.retry, allow_reuse: false } };
    expect(selectSession({ template: strict, n: 10, minRequired: 3, seed: seed(9), pool: small, history: { seen: new Map([...all].slice(0, 2)) } }))
      .toMatchObject({ ok: true, short: true, reusedCount: 0, keys: expect.any(Array) });
  });

  it("insufficient_pool when fewer than the minimum can be placed", () => {
    const r = selectSession({ template: getTemplate("chapter-quiz"), n: 15, minRequired: 5, seed: seed(1), pool: POOLS["strata-6"].slice(0, 4) });
    expect(r).toEqual({ ok: false, error: "insufficient_pool", available: 4, required: 5 });
  });

  it("the scope item cap applies to every caller", () => {
    const big = Array.from({ length: 5001 }, (_, i) => ({ key: `q-m1-math-${String(i).padStart(10, "0")}`, lesson: "l", band: 1, component: null, type: "mcq", stimulus: null, premium: false, revision: 1 }));
    expect(selectSession({ template: getTemplate("practice"), n: 10, minRequired: 5, seed: seed(1), pool: big })).toEqual({ ok: false, error: "scope_too_large" });
  });

  it("strata per template: objective, lesson, unit, (term, unit) for full year, topic for prep", () => {
    const item = { key: "k", lesson: "L", unit: "U", chapter: null, term: "t2", objective: "obj-1", topic: null };
    expect(stratumOf(getTemplate("lesson-quiz"), item)).toBe("obj-1");
    expect(stratumOf(getTemplate("lesson-quiz"), { ...item, objective: null })).toBe("L");
    expect(stratumOf(getTemplate("chapter-quiz"), item)).toBe("L");
    expect(stratumOf(getTemplate("subject-quiz"), item)).toBe("U");
    expect(stratumOf(getTemplate("full-year"), item)).toBe("t2|U");
    expect(stratumOf(getTemplate("mock"), { key: "k", lesson: "prep:aptitude/verbal/analogy", unit: null, topic: "analogy" })).toBe("analogy");
    expect(stratumOf(getTemplate("random-practice"), item)).toBe("*");
  });

  it("representatives prefer unseen members, by u(grp)", () => {
    const pool = POOLS.variants.filter((r) => r.component === "xg-cd00000000");
    expect(pool.length).toBe(3);
    const s = seed(5);
    const byU = [...pool].sort((a, b) => u(s, "grp", `${a.component}:${a.key}`) - u(s, "grp", `${b.component}:${b.key}`));
    expect(representatives(pool, s, () => false).map((r) => r.key)).toEqual([byU[0].key]);
    expect(representatives(pool, s, (k) => k === byU[0].key).map((r) => r.key)).toEqual([byU[1].key]);
    expect(representatives(pool, s, () => true).map((r) => r.key)).toEqual([byU[0].key]);
  });

  it("orders by u(ord); by_stratum keeps strata contiguous", () => {
    const items = POOLS.variants.slice(0, 8);
    const plain = orderItems(items, { randomization: { question_order: "shuffle" }, coverage: { stratify_by: "lesson" } }, seed(2));
    expect(plain.map((i) => i.key)).toEqual([...items].sort((a, b) => u(seed(2), "ord", a.key) - u(seed(2), "ord", b.key)).map((i) => i.key));
    const t = { kind: "practice", randomization: { question_order: "by_stratum" }, coverage: { stratify_by: "lesson" } };
    const byStratum = orderItems(POOLS.variants, t, seed(2)).map((i) => i.lesson);
    const runs = byStratum.filter((l, i) => i === 0 || l !== byStratum[i - 1]);
    expect(new Set(runs).size).toBe(runs.length);
  });
});

describe("safe option shuffling (§5.4)", () => {
  const content = new Map();
  for (const f of ["c/middle_grade-1_math-01.json", "c/aptitude_verbal-01.json"]) for (const it of loadChunk(f).items) content.set(it.key, it);

  it.each(PERMUTATIONS.map((c, i) => [`${c.key} #${i % 2}`, c]))("display maps of %s", (_n, c) => {
    expect(displayMaps(c.seed, content.get(c.key), { template: getTemplate(c.template), answerOrder: c.answer_order })).toEqual(c.expected);
  });

  it("fixed-order options are never shuffled, whatever the seed", () => {
    const fixed = [...content.values()].filter((it) => it.type === "true_false" || (it.type === "mcq" && !isShuffleable(it, getTemplate("practice"))));
    expect(fixed.some((it) => it.type === "true_false")).toBe(true);
    expect(fixed.some((it) => it.topic === "contextual-error")).toBe(true);
    expect(fixed.some((it) => it.public.options.some((o) => hasFixedPattern(o.text)))).toBe(true);
    for (const it of fixed) for (let i = 0; i < 40; i++) expect(displayMaps(seed(i), it).choice_order).toBeNull();
    const numeric = [...content.values()].find((it) => it.type === "mcq" && it.public.options.every((o) => /^-?\d+$/.test(o.text)) && isShuffleable(it));
    for (let i = 0; i < 10; i++) {
      const order = displayMaps(seed(i), numeric).choice_order ?? numeric.public.options.map((_, j) => j);
      const shown = order.map((c) => Number(numeric.public.options[c].text));
      expect(shown).toEqual([...shown].sort((a, b) => a - b));
    }
    const noShuffle = { ...JSON.parse(JSON.stringify(getTemplate("practice"))), randomization: { question_order: "shuffle", option_shuffle: false } };
    const shuffleable = [...content.values()].find((it) => it.type === "mcq" && isShuffleable(it) && !it.public.options.every((o) => /^-?\d+$/.test(o.text)));
    for (let i = 0; i < 10; i++) expect(displayMaps(seed(i), shuffleable, { template: noShuffle }).choice_order).toBeNull();
  });

  it("fixed-option patterns match common Arabic spellings (hamza, diacritics, spacing, punctuation)", () => {
    for (const t of ["لا شيء مما سبق", "لا شئ مما سبق", "لا شي مما سبق", "لا شَيْءَ مِمّا سَبَقَ", "كلُّ ما سبق", "جميع الاجابات صحيحة", "(أ) و (ب)", "أ و ب", "None of the above."]) {
      expect(hasFixedPattern(t), t).toBe(true);
    }
    for (const t of ["ما سبق", "شيء آخر", "كل ماء", "أ"]) expect(hasFixedPattern(t), t).toBe(false);
    const item = { key: "q-m1-math-00000000aa", type: "mcq", shuffle_options: true, fixed_order_reason: null,
      public: { options: [{ id: "oa", text: "٣ سم" }, { id: "ob", text: "٤ سم" }, { id: "oc", text: "٥ سم" }, { id: "od", text: "لا شئ مما سبق" }] } };
    expect(isShuffleable(item)).toBe(false);
    for (let i = 0; i < 20; i++) expect(displayMaps(seed(i), item).choice_order).toBeNull();
  });

  it("ordering display is independent of the answer (no swap rule); matching permutes both columns", () => {
    const ord = [...content.values()].find((it) => it.type === "ordering");
    // Attack: with the old swap rule the answer was the one order never shown, so
    // collecting displays across sessions revealed it. Every candidate answer —
    // including the shuffled order itself — must now give the same display.
    let shownAsAnswer = 0;
    for (let i = 0; i < 200; i++) {
      const plain = displayMaps(seed(i), ord).display_map.items;
      for (const answer of [plain, [...plain].reverse(), ord.public.items.map((x) => x.id)]) {
        expect(displayMaps(seed(i), ord, { answerOrder: answer })).toEqual({ display_map: { items: plain } });
      }
      if (plain.every((id, j) => id === ord.public.items[j].id)) shownAsAnswer += 1;
    }
    // the listed order occurs like any other permutation (≈ 200 / n!), not never
    expect(shownAsAnswer).toBeGreaterThan(0);
    const m = [...content.values()].find((it) => it.type === "matching");
    const maps = displayMaps(seed(4), m);
    expect([...maps.display_map.left].sort()).toEqual(m.public.left.map((x) => x.id).sort());
    expect([...maps.display_map.right].sort()).toEqual(m.public.right.map((x) => x.id).sort());
  });

  it("the client projection carries display indexes only — no canonical ids", () => {
    for (const it of content.values()) {
      const q = publicQuestion(it, 1, displayMaps(seed(9), it, { answerOrder: null }));
      const text = JSON.stringify(q);
      const ids = [...(it.public.options ?? []), ...(it.public.left ?? []), ...(it.public.right ?? []), ...(it.public.items ?? [])].map((o) => o.id).filter((id) => id.length > 1);
      for (const id of ids) expect(text.includes(`"${id}"`), `${it.key} leaks ${id}`).toBe(false);
      expect(text).not.toMatch(/"(answer|accepted|explanation|content_hash|option_id)"/);
    }
  });
});
