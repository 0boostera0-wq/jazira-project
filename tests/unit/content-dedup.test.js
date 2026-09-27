// WP5 — dedup (docs/CONTENT_ENGINE.md §4.5): MurmurHash3, MinHash/LSH,
// tokens and shingles, pair classes calibrated on dedup-pairs.json, the
// legacy 300, clusters, exclusion components and the staging run.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { murmur3_32, minhashSignature, estimateJaccard, lshCandidatePairs, lshRecall, MINHASH_FUNCTIONS } from "../../scripts/content/lib/minhash.mjs";
import {
  tokenize, stripPrefix, canonicalizeMath, textShingles, jaccard, maskNumbers, PREFIX_STOPLIST, LONG_STEM_TOKENS,
} from "../../scripts/content/lib/shingles.mjs";
import { buildExclusionGroups, EXCLUSION_CAP } from "../../scripts/content/lib/exclusion.mjs";
import {
  prepareItem, markInstructionStems, classifyPair, pairScores, dedupBank, candidatePairs, runDedup, pairKey, THRESHOLDS, participates,
} from "../../scripts/content/dedup.mjs";
import { exclusionGroupId } from "@/lib/content/ids.js";
import { normalizeForDedup } from "@/lib/content/normalize.js";

const REPO = resolve(__dirname, "../..");
const FIXTURE = join(REPO, "tests/fixtures/content/staging");
const PAIRS = JSON.parse(readFileSync(join(REPO, "tests/fixtures/content/dedup-pairs.json"), "utf8"));
const RUN = "run-20260928-dedup-01";

// ── legacy bank and item helpers ────────────────────────────────────────────
const LEGACY = new Map();
const TOPIC = new Map();
for (const f of readdirSync(join(REPO, "src/content/questions")).sort()) {
  const j = JSON.parse(readFileSync(join(REPO, "src/content/questions", f), "utf8"));
  for (const q of j.questions) {
    LEGACY.set(q.key, { stem: q.stem, options: q.choices, answer: q.answer, stimulus: q.passage, prep: { exam: j.exam, section: j.section, topic: q.topic } });
    TOPIC.set(q.key, `${j.section}/${q.topic}`);
  }
}

/** A minimal question@1-shaped record (what dedup reads). */
function record(id, o, extra = {}) {
  return {
    id,
    question_type: o.type ?? "mcq",
    stem: o.stem,
    stimulus_id: o.stimulus ? `st-${id}` : null,
    payload: o.payload ?? { options: o.options.map((text, i) => ({ id: `o${i}`, text })), answer: { option_id: `o${o.answer}` } },
    curriculum: o.lesson ? { lesson: o.lesson } : null,
    prep: o.lesson ? null : o.prep ?? null,
    source: o.pages ? { resource_id: o.pages.resource_id, pdf_page_start: o.pages.start, pdf_page_end: o.pages.end } : null,
    status: o.status ?? "published",
    provenance: { origin: o.origin ?? "internal_authored" },
    validation: { record_ids: o.records ?? [] },
    created_at: o.created_at ?? "2026-09-27T08:00:00Z",
    variant: o.variant ?? null,
    dedup: { class: null, cluster_id: null, exclusion_group: null },
    ...extra,
  };
}
const itemOf = (ref) => {
  if (LEGACY.has(ref)) return LEGACY.get(ref);
  const it = PAIRS.items[ref];
  if (!it) throw new Error(`unknown pair item ${ref}`);
  return { ...(it.from ? LEGACY.get(it.from) : {}), ...it };
};
const legacyRecords = () => [...LEGACY].map(([k, o]) => record(k, o));
const legacyStimuli = () => new Map([...LEGACY].filter(([, o]) => o.stimulus).map(([k, o]) => [`st-${k}`, o.stimulus]));

// ── MurmurHash3 and MinHash ─────────────────────────────────────────────────
describe("MurmurHash3 x86_32 and MinHash/LSH", () => {
  it("matches the reference vectors", () => {
    const vectors = [
      ["", 0, 0x00000000], ["", 1, 0x514e28b7], ["", 0xffffffff, 0x81f16f39],
      ["\u0000\u0000\u0000\u0000", 0, 0x2362f9de], ["a", 0x9747b28c, 0x7fa09ea6], ["aaaa", 0x9747b28c, 0x5a97808a],
      ["abc", 0x9747b28c, 0xc84a62dd], ["abcd", 0x9747b28c, 0xf0478627], ["Hello, world!", 0x9747b28c, 0x24884cba],
      ["The quick brown fox jumps over the lazy dog", 0x9747b28c, 0x2fa826cd], ["Hello, world!", 1234, 0xfaf6cdb3], ["test", 0, 0xba6bd213],
    ];
    for (const [s, seed, want] of vectors) expect(murmur3_32(s, seed), `${JSON.stringify(s)} / ${seed}`).toBe(want);
    expect(murmur3_32(new Uint8Array([0xff, 0xff, 0xff, 0xff]), 0)).toBe(0x76293b50);
    expect(murmur3_32(new Uint8Array([0x21, 0x43, 0x65, 0x87]), 0)).toBe(0xf55b516b);
    // strings are hashed as UTF-8 bytes
    expect(murmur3_32("قارن", 7)).toBe(murmur3_32(new TextEncoder().encode("قارن"), 7));
  });

  it("builds 128-slot signatures whose agreement estimates Jaccard", () => {
    const a = new Set(Array.from({ length: 200 }, (_, i) => `w${i}`));
    const b = new Set(Array.from({ length: 200 }, (_, i) => `w${i + 50}`)); // J = 150 / 250 = 0.6
    const sa = minhashSignature(a);
    expect(sa).toHaveLength(MINHASH_FUNCTIONS);
    expect(minhashSignature(a)).toEqual(sa);
    expect(Math.abs(estimateJaccard(sa, minhashSignature(b)) - 0.6)).toBeLessThan(0.12);
    expect(minhashSignature(new Set())).toBeNull();
  });

  it("uses 32 bands × 3 rows (recall ≈ 0.88 at J = 0.40, ≈ 0.997 at J = 0.55)", () => {
    expect(lshRecall(0.4)).toBeCloseTo(0.88, 2);
    expect(lshRecall(0.55)).toBeGreaterThan(0.996);
    const s = (xs) => minhashSignature(new Set(xs));
    const pairs = lshCandidatePairs([
      { id: "b", sig: s(["x", "y", "z"]) },
      { id: "a", sig: s(["x", "y", "z"]) },
      { id: "c", sig: s(["p", "q", "r"]) },
      { id: "d", sig: null },
    ]);
    expect(pairs).toEqual([["a", "b"]]);
  });
});

// ── tokens and shingles ─────────────────────────────────────────────────────
describe("tokens, shingles and Jaccard (§4.5 steps 1–4)", () => {
  it("keeps x² and x2 apart (superscripts before NFKC) and folds digits, marks and letters", () => {
    expect(tokenize("x² + 1")).toEqual(["x", "^", "2", "+", "1"]);
    expect(tokenize("x2 + 1")).toEqual(["x", "2", "+", "1"]);
    expect(tokenize("x² + 1")).not.toEqual(tokenize("x2 + 1"));
    expect(tokenize("٥³")).toEqual(["5", "^", "3"]);
    expect(tokenize("ما قيمة ½ من ١٬٢٥٠؟")).toEqual(tokenize("ما قيمه 1/2 من 1250"));
    expect(tokenize("مَدْرَسَةٌ")).toEqual(tokenize("مدرسة"));
  });

  it("sorts commutative operands: 8 × 7 ≡ 7 × 8, but never across precedence or minus", () => {
    expect(tokenize("ما ناتج 8 × 7؟")).toEqual(tokenize("ما ناتج 7 × 8؟"));
    expect(tokenize("12 + 9 = 21")).toEqual(tokenize("9 + 12 = 21"));
    expect(canonicalizeMath(["10", "-", "3", "+", "2"])).toEqual(["10", "-", "3", "+", "2"]);
    expect(canonicalizeMath(["3", "+", "2", "*", "4"])).toEqual(["3", "+", "2", "*", "4"]);
    expect(canonicalizeMath(["8", "/", "4", "*", "2"])).toEqual(["8", "/", "4", "*", "2"]);
    expect(canonicalizeMath(["b", "*", "a", "^", "2"])).toEqual(["b", "*", "a", "^", "2"]);
    expect(canonicalizeMath(["5", "-", "b", "*", "a"])).toEqual(["5", "-", "a", "*", "b"]);
    expect(tokenize("-11 × 5")).toEqual(["-11", "*", "5"]);
    expect(tokenize("x - 3 = -7")).toEqual(["x", "-", "3", "=", "-7"]);
  });

  it("strips ال/وال/بال/فال/كال/لل only before ≥ 3 letters and never for stoplist words", () => {
    expect(stripPrefix("قلم")).toBe("قلم");
    expect(tokenize("بالقلم والكتاب للطالب")).toEqual(["قلم", "كتاب", "طالب"]);
    expect(tokenize("كالسيوم")).toEqual([normalizeForDedup("كالسيوم")]);
    expect(tokenize("بالون")).toEqual(["بالون"]);
    expect(tokenize("لله")).toEqual(["لله"]);
    expect(tokenize("الدم")).toEqual(["الدم"]); // only 2 letters would remain
    expect(tokenize("الأولى")).toEqual(tokenize("أولى"));
    for (const w of PREFIX_STOPLIST) expect(stripPrefix(w)).toBe(w);
  });

  it("uses word 1+2-shingles for long stems and adds character 4-grams for short ones", () => {
    const short = tokenize("ما القيمة المطلقة للعدد -7؟");
    const long = tokenize("تحركت سيارة من السكون بتسارع ثابت فبلغت سرعتها 20 متر بعد 5 ثوان");
    expect(short.length).toBeLessThan(LONG_STEM_TOKENS);
    expect(long.length).toBeGreaterThanOrEqual(LONG_STEM_TOKENS);
    expect([...textShingles(short)].some((s) => s.startsWith("c:"))).toBe(true);
    expect([...textShingles(long)].some((s) => s.startsWith("c:"))).toBe(false);
    expect([...textShingles(long)].some((s) => s.startsWith("2:"))).toBe(true);
  });

  it("defines J(∅, ∅) as exact-string equality of the normalized stems, never 0/0", () => {
    expect(jaccard(new Set(), new Set(), 1)).toBe(1);
    expect(jaccard(new Set(), new Set(), 0)).toBe(0);
    expect(jaccard(new Set(["a"]), new Set(), 1)).toBe(0);
    const a = prepareItem(record("q1", { stem: "؟", options: ["1", "2"], answer: 0 }));
    const b = prepareItem(record("q2", { stem: "?!", options: ["1", "2"], answer: 0 }));
    const c = prepareItem(record("q3", { stem: "", options: ["3", "4"], answer: 0 }));
    markInstructionStems([a, b, c]);
    expect(a.stemTokens).toEqual([]);
    expect(pairScores(a, b).stem_jaccard).toBe(1);
    expect(Number.isNaN(pairScores(a, c).stem_jaccard)).toBe(false);
    expect(maskNumbers(["ما", "3", "*", "-4"])).toEqual(["ما", "#", "*", "#"]);
  });
});

// ── pair classes ────────────────────────────────────────────────────────────
function prepared(entries) {
  const items = entries.map(([id, o]) => prepareItem(record(id, o), { stimulusText: o.stimulus ?? null }));
  markInstructionStems(items);
  return Object.fromEntries(items.map((it) => [it.id, it]));
}
const L = "middle/grade-1/math/n61";

describe("pair classes (§4.5 steps 3–6)", () => {
  it("EXACT ignores option order, marks, digits and spelling folds", () => {
    const P = prepared([
      ["a", { stem: "ما ناتج 3 × 4؟", options: ["7", "12", "1"], answer: 1, lesson: L }],
      ["b", { stem: "مَا نَاتِج ٣ × ٤ ?", options: ["1", "12", "7"], answer: 1, lesson: L }],
    ]);
    const r = classifyPair(P.a, P.b);
    expect(r.class).toBe("EXACT_DUPLICATE");
    expect(r.signals).toContain("exact_hash");
    expect(r.dup).toBe(true);
  });

  it("8 × 7 vs 7 × 8 with the same answer is NEAR, not a numeric variant", () => {
    const P = prepared([
      ["a", { stem: "ما ناتج 8 × 7؟", options: ["1", "15", "56"], answer: 2, lesson: L }],
      ["b", { stem: "ما ناتج 7 × 8؟", options: ["1", "15", "56"], answer: 2, lesson: L }],
    ]);
    const r = classifyPair(P.a, P.b);
    expect(r.class).toBe("NEAR_DUPLICATE");
    expect(r.signals).not.toContain("numeric_variant");
  });

  it("numeric_variant is RELATED and alone creates no exclusion edge; with the same answer it does", () => {
    const P = prepared([
      ["a", { stem: "ما ناتج 3 × 4؟", options: ["7", "12"], answer: 1, lesson: L }],
      ["b", { stem: "ما ناتج 3 × 5؟", options: ["8", "15"], answer: 1, lesson: L }],
      ["c", { stem: "إذا كان ثمن 3 أقلام 12 ريالًا، فما ثمن القلم؟", options: ["3", "4"], answer: 1, lesson: L }],
      ["d", { stem: "إذا كان ثمن 5 أقلام 20 ريالًا، فما ثمن القلم؟", options: ["4", "5"], answer: 0, lesson: L }],
    ]);
    const ab = classifyPair(P.a, P.b);
    expect(ab.class).toBe("RELATED");
    expect(ab.signals).toEqual(["numeric_variant"]);
    expect(ab.edge).toBe(false);
    expect(ab.numericOnly).toBe(true);
    const cd = classifyPair(P.c, P.d);
    expect(cd.class).toBe("RELATED");
    expect(cd.signals).toEqual(["numeric_variant", "same_answer"]);
    expect(cd.edge).toBe(true);
  });

  it("same lesson + same answer + stem J ≥ 0.40, and same pages + same answer, are RELATED", () => {
    const pages = { resource_id: "ien-120607", start: 20, end: 20 };
    const P = prepared([
      ["a", { stem: "ما وحدة قياس القوة في النظام الدولي؟", options: ["الجول", "النيوتن"], answer: 1, lesson: L, pages }],
      ["b", { stem: "تُقاس القوة بوحدة تسمى:", options: ["النيوتن", "الواط"], answer: 0, lesson: L, pages: { ...pages, start: 19 } }],
      ["c", { stem: "تُقاس القوة بوحدة تسمى:", options: ["النيوتن", "الواط"], answer: 0, lesson: L, pages: { ...pages, start: 40, end: 40 } }],
    ]);
    const ab = classifyPair(P.a, P.b);
    expect(ab.class).toBe("RELATED");
    expect(ab.signals).toContain("same_pages");
    expect(ab.edge).toBe(true);
    expect(classifyPair(P.a, P.c).signals).not.toContain("same_pages");
  });

  it("opposite questions (same options, near-identical stem, different answer) are RELATED, not NEAR", () => {
    const P = prepared([
      ["a", { stem: "أي الترتيبات الآتية يرتب الأعداد 3، -1، 0 ترتيبًا تصاعديًا؟", options: ["-1، 0، 3", "3، 0، -1"], answer: 0, lesson: L }],
      ["b", { stem: "أي الترتيبات الآتية يرتب الأعداد 3، -1، 0 ترتيبًا تنازليًا؟", options: ["-1، 0، 3", "3، 0، -1"], answer: 1, lesson: L }],
    ]);
    expect(classifyPair(P.a, P.b).class).toBe("RELATED");
  });

  it("a declared rewrite is never NEAR (it joins the parent's component instead)", () => {
    const P = prepared([
      ["q-m1-math-aaaaaaaaaa", { stem: "ما الوحدة الأساسية لبناء أجسام المخلوقات الحية؟", options: ["الخلية", "النسيج"], answer: 0, lesson: L }],
      ["q-m1-math-bbbbbbbbbb", { stem: "ما الوحدة الأساسية لبناء أجسام الكائنات الحية؟", options: ["الخلية", "النسيج"], answer: 0, lesson: L, variant: { kind: "rewrite", of: "q-m1-math-aaaaaaaaaa", change: "context" } }],
    ]);
    const r = classifyPair(P["q-m1-math-aaaaaaaaaa"], P["q-m1-math-bbbbbbbbbb"]);
    expect(r.class).toBe("RELATED");
    expect(r.dup).toBe(false);
    expect(r.edge).toBe(true);
  });

  it("a semantic adjudication overrides the class and adds semantic_judged", () => {
    const P = prepared([
      ["a", { stem: "ما العدد المقابل للعدد 5؟", options: ["-5", "5"], answer: 0, lesson: L }],
      ["b", { stem: "ما المعكوس الجمعي للعدد 5؟", options: ["-5", "5"], answer: 0, lesson: L }],
    ]);
    expect(classifyPair(P.a, P.b).class).toBe("UNIQUE");
    const r = classifyPair(P.a, P.b, { adjudicated: "NEAR_DUPLICATE" });
    expect(r.class).toBe("NEAR_DUPLICATE");
    expect(r.signals).toContain("semantic_judged");
    expect(() => classifyPair(P.a, P.b, { adjudicated: "EXACT_DUPLICATE" })).toThrow(/adjudicated/);
  });
});

// ── calibration on the labelled pair set ───────────────────────────────────
describe("thresholds calibrated on dedup-pairs.json", () => {
  let results;
  beforeAll(() => {
    // Context = the whole legacy bank plus every fixture item (instruction lines
    // and fixed option sets are bank-level frequencies, as in a real run).
    const refs = new Set([...LEGACY.keys(), ...Object.keys(PAIRS.items)]);
    const items = [...refs].map((id) => {
      const o = itemOf(id);
      return prepareItem(record(id, o), { stimulusText: o.stimulus ?? null });
    });
    markInstructionStems(items);
    const byId = new Map(items.map((it) => [it.id, it]));
    results = PAIRS.pairs.map((p) => ({ ...p, got: classifyPair(byId.get(p.a), byId.get(p.b)).class }));
  });
  const metric = (isPos) => {
    const tp = results.filter((r) => isPos(r.label) && isPos(r.got)).length;
    const fp = results.filter((r) => !isPos(r.label) && isPos(r.got)).length;
    const fn = results.filter((r) => isPos(r.label) && !isPos(r.got)).length;
    return { precision: tp / (tp + fp), recall: tp / (tp + fn), tp, fp, fn };
  };

  it("has ≥ 200 labelled pairs from the legacy bank and pilot-style items, every class represented", () => {
    expect(PAIRS.pairs.length).toBeGreaterThanOrEqual(200);
    const labels = new Set(PAIRS.pairs.map((p) => p.label));
    expect([...labels].sort()).toEqual(["EXACT_DUPLICATE", "NEAR_DUPLICATE", "RELATED", "UNIQUE"]);
    expect(new Set(PAIRS.pairs.map((p) => p.id)).size).toBe(PAIRS.pairs.length);
    for (const p of PAIRS.pairs) for (const ref of [p.a, p.b]) expect(() => itemOf(ref), ref).not.toThrow();
  });

  it("pins precision and recall", () => {
    const exact = metric((c) => c === "EXACT_DUPLICATE");
    expect(exact.precision).toBe(1);
    expect(exact.recall).toBe(1);
    const dup = metric((c) => c === "EXACT_DUPLICATE" || c === "NEAR_DUPLICATE");
    expect(dup.precision).toBe(1); // a false duplicate would reject a good item
    expect(dup.recall).toBeGreaterThanOrEqual(0.95);
    const any = metric((c) => c !== "UNIQUE");
    expect(any.precision).toBe(1);
    expect(any.recall).toBeGreaterThanOrEqual(0.96);
    // no labelled RELATED or UNIQUE pair is ever classified as a duplicate
    expect(results.filter((r) => ["RELATED", "UNIQUE"].includes(r.label) && ["EXACT_DUPLICATE", "NEAR_DUPLICATE"].includes(r.got))).toEqual([]);
  });

  it("classifies the named edge cases as specified", () => {
    const got = (why) => results.filter((r) => r.why.startsWith(why)).map((r) => r.got);
    expect(got("commutative operands")).toEqual(["NEAR_DUPLICATE", "NEAR_DUPLICATE"]);
    expect(new Set(got("numbers changed"))).toEqual(new Set(["RELATED"]));
    expect(new Set(got("same instruction stem"))).toEqual(new Set(["UNIQUE"]));
    expect(new Set(got("one distractor replaced"))).toEqual(new Set(["NEAR_DUPLICATE"]));
    expect(THRESHOLDS.related_stem).toBe(0.55);
  });
});

// ── the legacy 300 ──────────────────────────────────────────────────────────
describe("legacy bank (300 items)", () => {
  let res;
  beforeAll(() => {
    res = dedupBank(legacyRecords(), { runId: RUN, stimuli: legacyStimuli() });
  });

  it("has 0 EXACT and 0 NEAR duplicates and rejects nothing", () => {
    expect(res.stats.items).toBe(300);
    expect(res.stats.exact_pairs).toBe(0);
    expect(res.stats.near_pairs).toBe(0);
    expect(res.stats.rejected_duplicates).toBe(0);
    expect(res.questions.filter((q) => q.status !== "published")).toEqual([]);
  });

  it("does not flag the 8 odd-word-out or 11 comparison items NEAR", () => {
    const keys = [...TOPIC].filter(([, t]) => t === "verbal/odd-word-out" || t === "quantitative/comparison").map(([k]) => k);
    expect(keys).toHaveLength(19);
    const involved = res.pairs.filter((p) => keys.includes(p.a) || keys.includes(p.b));
    expect(involved.filter((p) => p.class === "NEAR_DUPLICATE" || p.class === "EXACT_DUPLICATE")).toEqual([]);
  });

  it("classifies the formulaic math stems RELATED / numeric_variant at most", () => {
    const math = new Set([...TOPIC].filter(([, t]) => /^(quantitative|math|physics|chemistry)\//.test(t)).map(([k]) => k));
    for (const p of res.pairs.filter((x) => math.has(x.a) || math.has(x.b))) expect(["RELATED", "UNIQUE"]).toContain(p.class);
    // every stem is compared exhaustively within its prep topic
    const sizes = [...new Set(TOPIC.values())].map((t) => [...TOPIC.values()].filter((x) => x === t).length);
    expect(res.stats.pairs_compared).toBeGreaterThanOrEqual(sizes.reduce((n, s) => n + (s * (s - 1)) / 2, 0));
  });

  it("keeps every exclusion component within K = 8", () => {
    expect(res.exclusion.components.every((c) => c.size <= EXCLUSION_CAP)).toBe(true);
  });
});

// ── the bank: canonical members, clusters, statuses ────────────────────────
const STEM = "ما الغاز الذي تمتصه الأوراق من الهواء لتستخدمه في عملية البناء الضوئي؟";
const OPTS = ["الأكسجين", "النيتروجين", "بخار الماء", "ثاني أكسيد الكربون"];
const dupOf = (id, extra) => record(id, { stem: STEM, options: OPTS, answer: 3, lesson: L, ...extra });

describe("dedupBank — canonical choice, clusters and statuses (§4.5 step 7)", () => {
  const canonicalOf = (records) => {
    const r = dedupBank(records, { runId: RUN });
    return r.clusters.map((c) => c.canonical_id);
  };

  it("chooses published > validated, then origin, then evidence, then created_at, then id", () => {
    expect(canonicalOf([dupOf("q-a", { status: "validated", created_at: "2026-01-01T00:00:00Z" }), dupOf("q-b", { status: "published" })])).toEqual(["q-b"]);
    expect(canonicalOf([dupOf("q-a", { status: "validated", origin: "transformed" }), dupOf("q-b", { status: "validated", origin: "source_derived" })])).toEqual(["q-b"]);
    expect(canonicalOf([dupOf("q-a", { origin: "internal_authored" }), dupOf("q-b", { origin: "generated_practice" })])).toEqual(["q-b"]);
    expect(canonicalOf([dupOf("q-a"), dupOf("q-b", { records: ["r1"] })])).toEqual(["q-b"]);
    expect(canonicalOf([dupOf("q-a", { created_at: "2026-09-28T00:00:00Z" }), dupOf("q-b", { created_at: "2026-09-27T00:00:00Z" })])).toEqual(["q-b"]);
    expect(canonicalOf([dupOf("q-b"), dupOf("q-a")])).toEqual(["q-a"]);
  });

  it("rejects the other EXACT/NEAR members with duplicate_of; the canonical stays and is UNIQUE", () => {
    const near = record("q-c", { stem: "ما الغاز الذي تمتصه أوراق النبات من الهواء لاستخدامه في عملية البناء الضوئي؟", options: OPTS, answer: 3, lesson: L, status: "validated" });
    const r = dedupBank([dupOf("q-a"), dupOf("q-b", { status: "validated" }), near], { runId: RUN });
    const byId = Object.fromEntries(r.questions.map((q) => [q.id, q]));
    expect(byId["q-a"].status).toBe("published");
    expect(byId["q-a"].dedup).toEqual({ class: "UNIQUE", cluster_id: "dc-q-a", exclusion_group: null });
    expect(byId["q-b"]).toMatchObject({ status: "rejected", dedup: { class: "EXACT_DUPLICATE", cluster_id: "dc-q-a", exclusion_group: null, duplicate_of: "q-a" } });
    expect(byId["q-c"]).toMatchObject({ status: "rejected", dedup: { class: "NEAR_DUPLICATE", duplicate_of: "q-a" } });
    expect(r.clusters).toHaveLength(1);
    expect(r.clusters[0].members.map((m) => [m.id, m.class])).toEqual([["q-b", "EXACT_DUPLICATE"], ["q-c", "NEAR_DUPLICATE"]]);
    expect(r.clusters[0].members[0].signals).toContain("exact_hash");
  });

  it("is idempotent and restores an item whose canonical left the bank", () => {
    const first = dedupBank([dupOf("q-a"), dupOf("q-b", { status: "validated" })], { runId: RUN });
    const second = dedupBank(first.questions, { runId: RUN });
    expect(second.questions).toEqual(first.questions);
    expect(second.clusters).toEqual(first.clusters);
    const retired = first.questions.map((q) => (q.id === "q-a" ? { ...q, status: "retired" } : { ...q, validation: { ...q.validation, status: "validated" } }));
    const third = dedupBank(retired, { runId: RUN });
    const b = third.questions.find((q) => q.id === "q-b");
    expect(b.status).toBe("validated");
    expect(b.dedup).toEqual({ class: "UNIQUE", cluster_id: null, exclusion_group: null });
    expect(third.questions.find((q) => q.id === "q-a").status).toBe("retired");
    expect(participates({ status: "rejected", dedup: {} })).toBe(false);
  });

  it("attaches RELATED neighbours to the best-ranked item's cluster and gives both an exclusion group", () => {
    const r = dedupBank(
      [
        record("q-x", { stem: "أي العددين أكبر: -3 أم -8؟", options: ["-3", "-8"], answer: 0, lesson: L }),
        record("q-y", { stem: "أي العددين أصغر: -3 أم -8؟", options: ["-3", "-8"], answer: 1, lesson: L, status: "validated" }),
      ],
      { runId: RUN },
    );
    const [c] = r.clusters;
    expect(c).toMatchObject({ id: "dc-q-x", canonical_id: "q-x", members: [{ id: "q-y", class: "RELATED" }] });
    const xg = exclusionGroupId(["q-x", "q-y"]);
    expect(c.exclusion_group).toBe(xg);
    expect(r.questions.map((q) => q.dedup)).toEqual([
      { class: "UNIQUE", cluster_id: "dc-q-x", exclusion_group: xg },
      { class: "RELATED", cluster_id: "dc-q-x", exclusion_group: xg },
    ]);
    expect(r.questions.map((q) => q.status)).toEqual(["published", "validated"]);
  });

  it("finds cross-lesson duplicates through LSH and compares a lesson exhaustively", () => {
    const a = record("q-a", { stem: STEM, options: OPTS, answer: 3, lesson: "middle/grade-1/science/n1" });
    const b = record("q-b", { stem: STEM.replace("الأوراق", "أوراق النبات"), options: OPTS, answer: 3, lesson: "middle/grade-2/science/n9" });
    const items = markInstructionStems([prepareItem(a), prepareItem(b)]);
    expect(candidatePairs(items, { lsh: false }).size).toBe(0);
    const pairs = candidatePairs(items);
    expect([...pairs.values()]).toEqual([{ a: "q-a", b: "q-b", viaLsh: true }]);
    const r = dedupBank([a, b], { runId: RUN });
    expect(r.pairs[0].signals).toContain("minhash");
    expect(r.stats.rejected_duplicates).toBe(1);
  });

  it("applies semantic adjudications by pair key", () => {
    const a = record("q-a", { stem: "ما العدد المقابل للعدد 5؟", options: ["-5", "5"], answer: 0, lesson: L });
    const b = record("q-b", { stem: "ما المعكوس الجمعي للعدد 5؟", options: ["-5", "5"], answer: 0, lesson: L });
    const r = dedupBank([a, b], { runId: RUN, adjudications: new Map([[pairKey("q-b", "q-a"), "RELATED"]]) });
    expect(r.pairs).toEqual([expect.objectContaining({ a: "q-a", b: "q-b", class: "RELATED", signals: expect.arrayContaining(["semantic_judged"]) })]);
    expect(r.stats.semantic_judged_pairs).toBe(1);
  });
});

// ── exclusion components ────────────────────────────────────────────────────
describe("exclusion components (cap K = 8)", () => {
  const ids = (n, p = "q") => Array.from({ length: n }, (_, i) => `${p}${String(i).padStart(2, "0")}`);
  const clique = (list, weight = () => 0.6, samePage = () => false) =>
    list.flatMap((a, i) => list.slice(i + 1).map((b) => ({ a, b, kind: "related", weight: weight(a, b), samePage: samePage(a, b) })));

  it("keeps a small component whole and leaves isolated questions without a group", () => {
    const nodes = ids(4).map((id) => ({ id, question: true }));
    const r = buildExclusionGroups({ nodes, edges: [{ a: "q00", b: "q01", kind: "related", weight: 0.7 }] });
    const xg = exclusionGroupId(["q00", "q01"]);
    expect(r.groupOf.get("q00")).toBe(xg);
    expect(r.groupOf.get("q01")).toBe(xg);
    expect(r.groupOf.get("q02")).toBeNull();
    expect(r.splits).toEqual([]);
  });

  it("splits a component above K into pieces ≤ K, same-page edges first, and lists the cut edges", () => {
    const list = ids(9);
    const page = (id) => (list.indexOf(id) < 5 ? 1 : 2);
    const nodes = list.map((id) => ({ id, question: true }));
    const r = buildExclusionGroups({ nodes, edges: clique(list, () => 0.6, (a, b) => page(a) === page(b)) });
    expect(r.splits).toHaveLength(1);
    expect(r.splits[0].pieces.map((p) => p.members)).toEqual([list.slice(0, 5), list.slice(5)]);
    expect(r.splits[0].cut_edges).toHaveLength(5 * 4);
    expect(r.components.every((c) => c.size <= EXCLUSION_CAP)).toBe(true);
    // deterministic
    expect(buildExclusionGroups({ nodes: [...nodes].reverse(), edges: clique(list, () => 0.6, (a, b) => page(a) === page(b)).reverse() }).splits).toEqual(r.splits);
  });

  it("keeps the strongest stem similarities when no page information separates the items", () => {
    const list = ids(10);
    const strong = new Set(["q00", "q01", "q02"]);
    const r = buildExclusionGroups({ nodes: list.map((id) => ({ id, question: true })), edges: clique(list, (a, b) => (strong.has(a) && strong.has(b) ? 0.95 : 0.56)) });
    const pieceOf = (id) => r.splits[0].pieces.find((p) => p.members.includes(id));
    expect(pieceOf("q00")).toBe(pieceOf("q01"));
    expect(pieceOf("q00")).toBe(pieceOf("q02"));
    expect(Math.max(...r.splits[0].pieces.map((p) => p.members.length))).toBeLessThanOrEqual(EXCLUSION_CAP);
  });

  it("never splits a template's variants (exempt from the cap) and never cuts member_of edges", () => {
    const variants = ids(12, "v");
    const nodes = [...variants.map((id) => ({ id, question: true })), { id: "t-template", question: false }, { id: "q-other", question: true }];
    const edges = [...variants.map((v) => ({ a: v, b: "t-template", kind: "member_of" })), { a: "v00", b: "q-other", kind: "related", weight: 0.9 }];
    const r = buildExclusionGroups({ nodes, edges });
    const xg = exclusionGroupId(variants);
    expect(new Set(variants.map((v) => r.groupOf.get(v)))).toEqual(new Set([xg]));
    expect(r.groupOf.get("t-template")).toBeUndefined();
    expect(r.groupOf.get("q-other")).toBeNull();
    expect(r.components.find((c) => c.id === xg)).toMatchObject({ size: 12, exempt: true });
    expect(r.splits[0].cut_edges).toEqual([{ a: "q-other", b: "v00", weight: 0.9, same_page: false }]);
  });

  it("numeric_variant alone adds no edge; a declared rewrite joins its parent's component", () => {
    const r = dedupBank(
      [
        record("q-a", { stem: "ما ناتج 3 × 4؟", options: ["7", "12"], answer: 1, lesson: L }),
        record("q-b", { stem: "ما ناتج 3 × 5؟", options: ["8", "15"], answer: 1, lesson: L }),
        record("q-p", { stem: "اشترى أحمد 3 كتب ثمن الواحد 5 ريالات، فكم دفع؟", options: ["8", "15"], answer: 1, lesson: L }),
        record("q-r", { stem: "في مكتبة المدرسة، يكلّف الكتاب 5 ريالات. كم تكلفة 3 كتب؟", options: ["15", "8"], answer: 0, lesson: "middle/grade-1/math/n53", variant: { kind: "rewrite", of: "q-p", change: "context" } }),
      ],
      { runId: RUN },
    );
    const g = Object.fromEntries(r.questions.map((q) => [q.id, q.dedup.exclusion_group]));
    expect(g["q-a"]).toBeNull();
    expect(g["q-b"]).toBeNull();
    expect(g["q-p"]).toBe(exclusionGroupId(["q-p", "q-r"]));
    expect(g["q-r"]).toBe(g["q-p"]);
    expect(r.stats.numeric_variant_only_pairs).toBeGreaterThanOrEqual(1);
  });

  it("no component exceeds K on the fixtures (legacy bank + labelled pair items + staging fixture)", async () => {
    const extra = Object.keys(PAIRS.items).map((id) => record(id, itemOf(id)));
    const r = dedupBank([...legacyRecords(), ...extra], { runId: RUN, stimuli: legacyStimuli() });
    expect(r.exclusion.components.filter((c) => !c.exempt).every((c) => c.size <= EXCLUSION_CAP)).toBe(true);
    expect(r.stats.largest_group).toBeLessThanOrEqual(EXCLUSION_CAP);
    const { loadBank } = await import("../../scripts/content/dedup.mjs");
    const bank = loadBank(FIXTURE);
    const f = dedupBank(bank.questions, { runId: RUN, stimuli: bank.stimuli });
    expect(f.exclusion.components.filter((c) => !c.exempt).every((c) => c.size <= EXCLUSION_CAP)).toBe(true);
  });
});

// ── the staging run ─────────────────────────────────────────────────────────
describe("dedup.mjs over a staging tree", () => {
  let work;
  let V;
  let S;
  beforeAll(async () => {
    work = mkdtempSync(join(tmpdir(), "jz-dedup-"));
    V = await import("../../scripts/content/validate-staging.mjs");
    S = await import("../../scripts/content/lib/schemas.mjs");
  });
  afterAll(() => rmSync(work, { recursive: true, force: true }));
  const NOW = new Date("2026-09-28T09:00:00Z");
  const validate = (root, extra = {}) => V.validateStaging({ root, runtimeDir: null, registryBaseline: null, imageRoots: [], ...extra });

  it("reproduces the fixture cluster, writes valid records and is byte-stable on a rerun", async () => {
    const root = join(work, "a");
    cpSync(FIXTURE, root, { recursive: true });
    const before = readFileSync(join(FIXTURE, "validation/dedup-clusters.jsonl"), "utf8");
    const r1 = runDedup({ root, runId: RUN, now: NOW });
    const clusters = readFileSync(join(root, "validation/dedup-clusters.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const fixture = JSON.parse(before);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toMatchObject({ id: fixture.id, canonical_id: fixture.canonical_id, exclusion_group: fixture.exclusion_group });
    expect(clusters[0].members.map((m) => [m.id, m.class])).toEqual(fixture.members.map((m) => [m.id, m.class]));
    for (const c of clusters) expect(S.validateRecord("dedup-cluster", c).errors).toEqual([]);
    expect(r1.written).toContain(`validation/runs/${RUN}.json`);
    const manifest = JSON.parse(readFileSync(join(root, `validation/runs/${RUN}.json`), "utf8"));
    expect(manifest).toMatchObject({ schema: "run-manifest@1", run_id: RUN, kind: "dedup", counts: { items: r1.stats.items } });
    expect(manifest.params.minhash).toMatchObject({ functions: 128, lsh_bands: 32, lsh_rows: 3 });
    // the questions' dedup fields already matched: only clusters (scores) and the manifest changed
    expect(r1.written.filter((f) => f.startsWith("question"))).toEqual([]);
    await validate(root, { writeManifest: true });
    expect((await validate(root)).errors).toEqual([]);
    const r2 = runDedup({ root, runId: RUN, now: NOW });
    expect(r2.written).toEqual([]);
    expect(r2.removed).toEqual([]);
  });

  it("rejects a duplicate in the shards and keeps the tree valid", async () => {
    const root = join(work, "b");
    cpSync(FIXTURE, root, { recursive: true });
    const rel = "questions/middle/grade-1/math.jsonl";
    const lines = readFileSync(join(root, rel), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const src = lines.find((q) => q.question_type === "short_answer");
    const copy = { ...src, id: "q-m1-math-ffffffffff", status: "validated", created_at: "2026-09-28T08:00:00Z", updated_at: "2026-09-28T08:00:00Z", validation: { status: "validated", record_ids: [], checked_revision: 1 } };
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(root, rel), [...lines, copy].sort((a, b) => (a.id < b.id ? -1 : 1)).map((q) => S.stringifyRecord("question", q)).join("\n") + "\n");
    const r = runDedup({ root, runId: RUN, now: NOW });
    expect(r.stats.rejected_duplicates).toBe(1);
    const out = readFileSync(join(root, rel), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(out.find((q) => q.id === copy.id)).toMatchObject({ status: "rejected", dedup: { class: "EXACT_DUPLICATE", duplicate_of: src.id, cluster_id: `dc-${src.id}` } });
    await validate(root, { writeManifest: true });
    expect((await validate(root)).errors).toEqual([]);
  });

  it("reports usage errors with exit code 2", async () => {
    const { main } = await import("../../scripts/content/dedup.mjs");
    const quiet = { log: () => {}, error: () => {} };
    expect(await main(["--bogus"], quiet)).toBe(2);
    expect(await main(["--run", "run-20260928-gen-01"], quiet)).toBe(2);
    expect(await main(["--root", join(work, "a"), "--run", RUN, "--dry-run"], quiet)).toBe(0);
  });
});

// ── verifier regressions ────────────────────────────────────────────────────
describe("verifier regressions — stimuli and bounded candidate sets", () => {
  it("equal stems and answers over different stimuli are not duplicates; on a shared stimulus they are", () => {
    const P = prepared([
      ["a", { stem: "ما المنوال للبيانات السابقة؟", options: ["3", "4", "5", "6"], answer: 1, lesson: L, stimulus: "درجات طلاب في اختبار الرياضيات: محمد 4، علي 7، خالد 4، سعد 9" }],
      ["b", { stem: "ما المنوال للبيانات السابقة؟", options: ["2", "4", "7", "9"], answer: 1, lesson: L, stimulus: "أعمار أطفال في حديقة الحي: سارة 2، نورة 4، هند 4، ريم 7" }],
      ["c", { stem: "ما عنوان مناسب للنص؟", options: ["الماء", "الشمس", "القمر"], answer: 0, lesson: L, stimulus: "الماء سر الحياة، ولا يمكن لكائن حي أن يعيش بدونه، ويغطي معظم سطح الأرض." }],
      ["d", { stem: "ما عنوان مناسب للنص؟", options: ["الماء", "الهواء", "النار"], answer: 0, lesson: L, stimulus: "يحتاج النبات إلى الماء لينمو، ويمتصه بجذوره من التربة ثم ينقله إلى الأوراق." }],
      ["e", { stem: "ما عنوان مناسب للنص؟", options: ["الماء", "الهواء", "النار"], answer: 0, lesson: L, stimulus: "يحتاج النبات إلى الماء لينمو، ويمتصه بجذوره من التربة ثم ينقله إلى الأوراق." }],
      ["f", { stem: "ما العنوان المناسب للنص؟", options: ["الماء", "الهواء", "النار"], answer: 0, lesson: L, stimulus: "يحتاج النبات إلى الماء لينمو، ويمتصه بجذوره من التربة ثم ينقله إلى الأوراق." }],
    ]);
    for (const [x, y] of [["a", "b"], ["c", "d"]]) {
      const r = classifyPair(P[x], P[y]);
      expect(["RELATED", "UNIQUE"], `${x}/${y}`).toContain(r.class);
      expect(r.dup).toBe(false);
    }
    expect(classifyPair(P.d, P.e).class).toBe("EXACT_DUPLICATE");
    expect(classifyPair(P.d, P.f).class).toBe("NEAR_DUPLICATE"); // same passage: stems alone
    // the bank keeps both items of a different-stimulus pair
    const bank = [
      record("q-a", { stem: "ما المنوال للبيانات السابقة؟", options: ["3", "4", "5", "6"], answer: 1, lesson: L, stimulus: true }),
      record("q-b", { stem: "ما المنوال للبيانات السابقة؟", options: ["2", "4", "7", "9"], answer: 1, lesson: L, stimulus: true }),
    ];
    const stimuli = new Map([["st-q-a", "درجات طلاب: محمد 4، علي 7، خالد 4، سعد 9"], ["st-q-b", "أعمار أطفال: سارة 2، نورة 4، هند 4، ريم 7"]]);
    const res = dedupBank(bank, { runId: RUN, stimuli });
    expect(res.stats.rejected_duplicates).toBe(0);
    expect(res.questions.map((q) => q.status)).toEqual(["published", "published"]);
  });

  it("equal instruction stems do not form a quadratic bucket; large prep topics fall back to LSH", () => {
    const words = ["قلم", "كتاب", "دفتر", "مسطرة", "ممحاة", "حقيبة", "سبورة", "طاولة", "كرسي", "نافذة", "باب", "مصباح", "شجرة", "زهرة", "نهر", "جبل"];
    const prep = { exam: "qudurat", section: "verbal", topic: "odd-word-out" };
    const recs = Array.from({ length: 40 }, (_, i) =>
      record(`q-${String(i).padStart(2, "0")}`, { stem: "اختر الكلمة المختلفة عن الكلمات الأخرى:", options: [0, 1, 2, 3].map((k) => `${words[(i + k * 3) % 16]}${i}`), answer: 0, prep }),
    );
    const items = markInstructionStems(recs.map((r) => prepareItem(r)));
    expect(items.every((it) => it.instruction)).toBe(true);
    const all = (40 * 39) / 2;
    expect(candidatePairs(items, { lsh: false }).size).toBe(all); // topic ≤ max: exhaustive
    const capped = candidatePairs(items, { lsh: false, prepGroupMax: 10 });
    expect(capped.size).toBe(0); // no stem bucket for boilerplate stems, topic above the cap
    const viaLsh = candidatePairs(items, { prepGroupMax: 10 });
    expect([...viaLsh.values()].every((p) => p.viaLsh)).toBe(true);
    expect(viaLsh.size).toBeLessThan(all);
    // a lesson is always compared exhaustively, whatever its size
    const lesson = markInstructionStems(recs.map((r) => prepareItem({ ...r, prep: null, curriculum: { lesson: L } })));
    expect(candidatePairs(lesson, { lsh: false, prepGroupMax: 10 }).size).toBe(all);
  });
});
