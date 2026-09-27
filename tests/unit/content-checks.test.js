// WP4 — Stage 1 checks (Appendix B), ingestion and packets (docs/CONTENT_ENGINE.md §4.3, §4.4).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { sha256Hex } from "@/lib/content/prng.js";
import {
  CHECK_CODES, REVIEW_CODES, WARN_CODES, runCheck, runChecks, applyO004, createPageStore, isHighRisk,
  forbiddenCandidateFields, locateQuote, normalizeWithMap, longestSharedRun, charGrams, matchForm, P004_RUN_CHARS,
} from "../../scripts/content/lib/checks.mjs";
import { parseUnit, sameDimension, unitsAfterNumbers } from "../../scripts/content/lib/units.mjs";
import {
  attachRecord, bumpRevision, checkContext, checkBank, evidenceRows, evidenceStore, latestRecord, loadStaging, main as checkMain, recordsFor, rehash,
} from "../../scripts/content/check-questions.mjs";
import { ingestCandidate, ingestLines, opaqueIds, main as ingestMain } from "../../scripts/content/ingest-candidates.mjs";
import { buildGenPacket, buildValidationPackets, buildEvidencePacket, buildPrepPacket, allocate, main as packetsMain } from "../../scripts/content/make-packets.mjs";
import { loadCatalog } from "../../scripts/build-question-seed.mjs";

const REPO = resolve(__dirname, "../..");
const FIXTURE = join(REPO, "tests/fixtures/content/staging");
const RUN = "run-20260927-gen-01";
const NOW = "2026-09-27T08:00:00Z";
const LESSON = "middle/grade-1/math/n54";
const RES = "ien-120607";
const STEM_DIR = "1448-GE-ME-K07-SM1-math-part1";

// Page text in the cache (synthetic; copyrighted book text never enters tests).
const PAGE14 = [
  "القوى والأسس",
  "الأس يدل على عدد مرات ضرب الأساس في نفسه، ففي العبارة 3^4 يكون العدد 3 هو الأساس والعدد 4 هو الأس.",
  "يستعمل العلماء القوى لكتابة الأعداد الكبيرة جدا بصورة مختصرة تسهل قراءتها ومقارنتها وإجراء العمليات عليها.",
  "المدينة | السكان",
  "الرياض | 7000000",
  "جدة | 4000000",
  "مكة | 2000000",
].join("\n");
const PAGE15 = "تدرب وحل المسائل\nاملقرر يعرض أمثلة على القوى في مواقف حياتية متنوعة.";
const PAGE16 = "õcôŸG ïôÿ ÜÅ";

let tmp;
let staging;
let cache;
let bank;
let pages;
let catalog;
let packet;

function writeCache(root) {
  const ex = join(root, "extract", RES);
  mkdirSync(ex, { recursive: true });
  const rows = [
    { pdf_page: 14, raw: PAGE14, repaired: PAGE14, normalized: null, method: "text", text_quality: "ok", run_id: "run-20260927-extract-01" },
    { pdf_page: 15, raw: "", repaired: PAGE15, normalized: null, method: "vision", text_quality: "ok", run_id: "run-20260927-extract-01" },
    { pdf_page: 16, raw: PAGE16, repaired: PAGE16, normalized: null, method: "text", text_quality: "untrusted", run_id: "run-20260927-extract-01" },
  ];
  writeFileSync(join(ex, "pages.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  const img = join(root, "ien", "pages", STEM_DIR);
  mkdirSync(img, { recursive: true });
  for (const p of ["p014", "p015", "p016"]) writeFileSync(join(img, `${p}.jpg`), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
}

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), "jz-checks-"));
  staging = join(tmp, "staging");
  cache = join(tmp, "cache");
  cpSync(FIXTURE, staging, { recursive: true });
  writeCache(cache);
  bank = loadStaging(staging);
  pages = createPageStore({ root: cache, resources: bank.resources });
  catalog = await loadCatalog();
  packet = buildGenPacket(bank, LESSON, { runId: RUN, pages, root: cache }).packet;
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

// ── base candidates (generator format) ─────────────────────────────────────
const src = (evidence = []) => ({ pdf_page_start: 14, pdf_page_end: 14, evidence });
const BASE = {
  mcq: {
    ref: "mcq", question_type: "mcq", item_style: "computation", difficulty: 2, stem: "ما قيمة 3^4؟",
    payload: { options: ["12", "64", "81", "7"], answer: { index: 2 }, fixed_order_reason: null },
    explanation: { text: "نضرب الأساس في نفسه بعدد مرات الأس.", steps: ["3 × 3 × 3 × 3 = 81"], method: "حساب القوة" },
    computation: { expr: "a^b", vars: { a: 3, b: 4 } },
    source: src([{ pdf_page: 14, quote: "العدد 3 هو الأساس", quote_kind: "fact" }]),
    objective_id: "obj-fa3d3bfb40", provenance: { origin: "transformed" }, tags: ["القوى"],
  },
  true_false: {
    question_type: "true_false", item_style: "conceptual", difficulty: 1, stem: "العدد 3 في العبارة 3^4 هو الأساس.",
    payload: { answer: true }, explanation: { text: "الأساس هو العدد الذي يضرب في نفسه.", steps: [], method: null },
    source: src(), provenance: { origin: "transformed" },
  },
  matching: {
    question_type: "matching", item_style: "definition", difficulty: 2, stem: "صل كل مصطلح بمعناه.",
    payload: { left: ["الأساس", "الأس", "القوة"], right: ["العدد الذي يضرب في نفسه", "عدد مرات الضرب", "عبارة فيها أساس وأس"], pairs: [[0, 0], [1, 1], [2, 2]], scoring: "partial" },
    explanation: { text: "الأساس يضرب في نفسه والأس يبين عدد المرات.", steps: [], method: null },
    source: src(), provenance: { origin: "transformed" },
  },
  ordering: {
    question_type: "ordering", item_style: "application", difficulty: 2, stem: "رتب القوى من الأصغر إلى الأكبر.",
    payload: { items: ["2^2", "2^3", "2^4", "2^5"], criterion: "ascending" },
    explanation: { text: "قيمها 4 ثم 8 ثم 16 ثم 32.", steps: [], method: null },
    source: src(), provenance: { origin: "transformed" },
  },
  short_answer: {
    question_type: "short_answer", item_style: "definition", difficulty: 1, stem: "ما اسم العدد الذي يضرب في نفسه في القوة؟",
    payload: { accepted: ["الأساس", "اساس"], match: "normalized_exact", max_chars: 20, answer_display: "الأساس" },
    explanation: { text: "الأساس هو العدد الذي يضرب في نفسه.", steps: [], method: null },
    source: src(), provenance: { origin: "transformed" },
  },
  numeric: {
    question_type: "numeric", item_style: "computation", difficulty: 2, stem: "ما طول ضلع مربع مساحته 2^6 سنتيمترا مربعا بالسنتيمتر؟",
    payload: { answer: { value: "8", tolerance: { kind: "abs", value: "0" } }, unit: { text: "سم", required: true, accepted: ["cm"] }, input: { allow_fraction: true, max_decimals: 0 } },
    computation: { expr: "sqrt(2^6)", vars: {} },
    explanation: { text: "طول الضلع هو الجذر التربيعي للمساحة.", steps: ["√64 = 8 سم"], method: "الجذر التربيعي" },
    source: src(), provenance: { origin: "generated_practice" },
  },
};

const clone = (x) => JSON.parse(JSON.stringify(x));
/** Ingest a candidate against the fixture bank; returns { q, sidecar }. */
function make(candidate) {
  const { question, sidecar } = ingestCandidate(clone(candidate), packet, bank, { runId: RUN, now: NOW, pages });
  return { q: question, sidecar };
}
/** Check context with `q` in the bank and its evidence sidecar. */
function ctxFor(q, sidecar = [], extra = {}) {
  const b = { ...bank, questions: new Map([...bank.questions, [q.id, q]]) };
  const evidence = { get: (id) => (id === q.id ? sidecar : []) };
  return { ...checkContext(b, { catalog, pages, evidence }), ...extra };
}
const ok = (type = "mcq") => {
  const { q, sidecar } = make(BASE[type]);
  return { q, ctx: ctxFor(q, sidecar) };
};

describe("units (N003 table)", () => {
  it("parses SI and Arabic units and compares dimensions", () => {
    expect(parseUnit("سم")).toEqual({ key: "cm", dimension: "length" });
    expect(parseUnit("كم/س")?.dimension).toBe("speed");
    expect(parseUnit("ثانيه")?.key).toBe("s");
    expect(sameDimension("م", "cm")).toBe(true);
    expect(sameDimension("كجم", "cm")).toBe(false);
    expect(sameDimension("درجة", "°C")).toBe(true); // «درجة»: angle or temperature
    expect(unitsAfterNumbers("قطع 12 كم في 3 ساعات").map((u) => u.unit)).toEqual(["km", "h"]);
  });
});

describe("matching form with offsets (E001, P004)", () => {
  it("maps normalized text back to the original and folds lam-alef order", () => {
    const page = "مقدمة: املقرر يعرض أمثلة على القوى.";
    const at = locateQuote(page, "المقرر يعرض أمثلة");
    expect(at).not.toBeNull();
    expect(page.slice(at[0], at[1])).toBe("املقرر يعرض أمثلة");
    const { norm, starts } = normalizeWithMap("الأُسُّ ٣");
    expect(norm).toBe(matchForm("الاس 3")); // tashkeel, hamza and digits folded
    expect(matchForm("األول")).toBe(matchForm("الأول")); // ligature-order damage folds away
    expect(starts.length).toBe(norm.length);
  });
  it("measures the longest shared 5-gram run", () => {
    const pageGrams = charGrams(matchForm(PAGE14));
    expect(longestSharedRun(matchForm("يستعمل العلماء القوى لكتابة الأعداد الكبيرة جدا بصورة مختصرة تسهل قراءتها"), pageGrams)).toBeGreaterThanOrEqual(P004_RUN_CHARS);
    expect(longestSharedRun(matchForm("نضرب الأساس في نفسه"), pageGrams)).toBeLessThan(P004_RUN_CHARS);
  });
});

describe("base items pass every check", () => {
  for (const type of Object.keys(BASE)) {
    it(`${type}`, () => {
      const { q, ctx } = ok(type);
      const r = runChecks(q, ctx);
      expect(r.checks.filter((c) => c.result === "fail")).toEqual([]);
      expect(r.outcome).toBe("pass");
      expect(r.checks.map((c) => c.code)).toEqual([...CHECK_CODES]);
    });
  }
});

// ── Appendix B: one passing and one failing fixture per code ───────────────
// Each case names the base type, optionally a pass-side context tweak, and a
// mutation that must make exactly that code fail (or warn for warn codes).
const opt = (q, i) => q.payload.options[i];
const CASES = {
  S001: { fail: (q) => { q.stem = ""; } },
  S002: { fail: (q) => { q.id = "q-m1-math-0000000000"; } },
  S003: { fail: (q) => { q.curriculum.term = "t2"; } },
  S004: { fail: (q) => { q.source.pdf_page_end = 40; } },
  S005: {
    pass: (q, ctx) => { ctx.candidate = clone(BASE.mcq); },
    fail: (q, ctx) => { ctx.candidate = { ...clone(BASE.mcq), id: "q-m1-math-1111111111", status: "published", provenance: { origin: "transformed", official: false } }; },
  },
  O001: { fail: (q) => { opt(q, 1).text = `  ${opt(q, 0).text} `; } }, // repeats option 0 after normalization
  O002: { fail: (q) => { q.payload.answer.option_id = "o000000"; } },
  O003: { fail: (q) => { opt(q, 0).text = "81.0"; } },
  O004: { fail: (q) => { opt(q, 3).text = "جميع ما سبق"; q.payload.fixed_order_reason = null; q.shuffle_options = true; } },
  O005: { expect: "warn", fail: (q) => { opt(q, 0).text = "العدد اثنا عشر مكتوبا بالحروف وبصورة مطولة جدا"; } },
  O006: { type: "short_answer", expect: "warn", fail: (q) => { q.stem = "ما معنى الأساس في القوة؟"; } },
  O007: { type: "matching", fail: (q) => { q.payload.right = q.payload.right.slice(0, 2); } },
  O008: { fail: (q) => { q.explanation.text = "الإجابة الصحيحة هي الخيار ج لأن الناتج 81."; } },
  O009: { type: "ordering", fail: (q) => { q.payload.items.forEach((it, i) => { it.id = `s00000${i}`; }); q.payload.answer.order = q.payload.items.map((it) => it.id); } },
  O010: { type: "short_answer", pass: (q) => { q.tags = ["إملاء"]; q.payload.match = "exact_marks"; }, fail: (q) => { q.tags = ["إملاء"]; } },
  E001: { fail: (q, ctx) => { const quote = "نص غير موجود في الصفحة"; ctx.evidence = () => [{ pdf_page: 14, quote_sha256: sha256Hex(quote), quote_kind: "fact", quote }]; q.source.evidence[0].quote_sha256 = sha256Hex(quote); } },
  V001: {
    pass: (q, ctx) => { const parent = ctx.questions.get(q.id); q.variant = { kind: "rewrite", of: parent.id, change: "context" }; ctx.questions = new Map([...ctx.questions, ["q-m1-math-aaaaaaaaaa", { ...parent, id: "q-m1-math-aaaaaaaaaa" }]]); q.variant.of = "q-m1-math-aaaaaaaaaa"; },
    fail: (q, ctx) => { ctx.questions = new Map([...ctx.questions, ["q-m1-math-aaaaaaaaaa", { ...q, id: "q-m1-math-aaaaaaaaaa", difficulty: 4 }]]); q.variant = { kind: "rewrite", of: "q-m1-math-aaaaaaaaaa", change: "context" }; },
  },
  N001: { type: "numeric", fail: (q) => { q.payload.answer.value = "8.25"; } },
  N002: { fail: (q) => { q.computation.vars.b = 3; } },
  N003: { type: "numeric", fail: (q) => { q.payload.unit.accepted = ["kg"]; } },
  N004: { fail: (q) => { opt(q, 1).text = `${opt(q, 0).text}.0`; } }, // same value as option 0
  L001: { fail: (q) => { q.stem = "What is the value of this power expression written here?"; } },
  L002: { fail: (q) => { q.stem = "ما  قيمة 3^4؟"; } },
  L003: { expect: "warn", fail: (q) => { q.stem = "ما قيمة 3^4?"; } },
  L004: { fail: (q) => { q.stem = "ﻻ يساوي 3^4 العدد 12، فما قيمته؟"; } },
  L005: { fail: (q) => { q.stem = "ما قيمة ٣^4؟"; } },
  L006: { expect: "warn", fail: (q) => { q.explanation.steps.push("81 - 0 = 81"); } },
  L007: { fail: (q) => { q.stem = "ما قيمة (3^4؟"; } },
  L008: { fail: (q) => { q.stem = `${"ا".repeat(4001)}؟`; } },
  P001: { fail: (q) => { q.provenance.origin = "review_required"; } },
  P002: { fail: (q) => { q.provenance.official = true; } },
  P003: { fail: (q) => { q.stem = "سؤال وزاري: ما قيمة 3^4؟"; } },
  P004: { fail: (q) => { q.explanation.text = "يستعمل العلماء القوى لكتابة الأعداد الكبيرة جدا بصورة مختصرة تسهل قراءتها ومقارنتها."; } },
  P005: { fail: (q) => { q.stem = "في الشكل المجاور، ما قيمة 3^4؟"; } },
  P006: { fail: (q) => { q.explanation.steps = ["نضرب الأساس في نفسه أربع مرات"]; } },
  D001: { fail: (q, ctx) => { ctx.byContentHash = new Map([[q.content_hash, [q.id, "q-m1-math-bbbbbbbbbb"]]]); ctx.questions = new Map([...ctx.questions, ["q-m1-math-bbbbbbbbbb", { ...q, status: "validated" }]]); } },
};

describe("Appendix B — every code has a passing and a failing fixture", () => {
  it("covers every code", () => {
    expect(Object.keys(CASES).sort()).toEqual([...CHECK_CODES].sort());
  });
  for (const code of CHECK_CODES) {
    const c = CASES[code];
    it(`${code} passes`, () => {
      const { q, ctx } = ok(c.type ?? "mcq");
      c.pass?.(q, ctx);
      expect(runCheck(code, q, ctx).result).toBe("pass");
    });
    it(`${code} ${c.expect ?? "fails"}`, () => {
      const { q, ctx } = ok(c.type ?? "mcq");
      c.fail(q, ctx);
      const r = runCheck(code, q, ctx);
      expect(r.result, r.detail).toBe(c.expect ?? "fail");
      expect(WARN_CODES.has(code)).toBe((c.expect ?? "fail") === "warn");
    });
  }
});

describe("L002 tatweel and N002 mixed-number options", () => {
  it("allows tatweel on single-letter labels, the Hijri year and detached prefixes, never inside a word", () => {
    const l002 = (stem) => {
      const { q, ctx } = ok();
      q.stem = stem;
      return runCheck("L002", q, ctx).result;
    };
    expect(l002("في المثلث أ ب جـ، ما ق∠جـ؟")).toBe("pass");
    expect(l002("إذا كان △ أ ب جـ ~ △ د هـ و، فما طول هـ و؟")).toBe("pass");
    expect(l002("في عام 1445هـ، كم عدد الطلاب؟")).toBe("pass");
    expect(l002("استعمل 3.14 قيمةً تقريبية لـ ط، فما المحيط؟")).toBe("pass");
    expect(l002("ما الـحساب الصحيح؟")).toBe("fail");
    expect(l002("مـحمد يقرأ، فما عدد الصفحات؟")).toBe("fail");
    expect(l002("ما قيمة جــ؟")).toBe("fail");
  });

  it("reads a mixed-number answer option («3 3/16») as its exact value", () => {
    const { q, ctx } = ok();
    q.item_style = "computation";
    q.computation = { expr: "a/b", vars: { a: 51, b: 16 } };
    q.payload.options[0].text = "3 3/16";
    q.payload.answer.option_id = q.payload.options[0].id;
    expect(runCheck("N002", q, ctx).result).toBe("pass");
    q.payload.options[0].text = "3 5/16";
    expect(runCheck("N002", q, ctx).result).toBe("fail");
    q.computation = { expr: "-a/b", vars: { a: 3, b: 2 } };
    q.payload.options[0].text = "−1 1/2";
    expect(runCheck("N002", q, ctx).result).toBe("pass");
  });

  it("reads customary units, rates and count nouns after the number", () => {
    const { q, ctx } = ok();
    q.item_style = "computation";
    q.payload.answer.option_id = q.payload.options[0].id;
    const shows = (text, expr, vars) => {
      q.computation = { expr, vars };
      q.payload.options[0].text = text;
      return runCheck("N002", q, ctx).result;
    };
    expect(shows("180 بوصة", "a*b", { a: 15, b: 12 })).toBe("pass");
    expect(shows("7.5 أميال", "a*b/c", { a: 2200, b: 6, c: 1760 })).toBe("pass");
    expect(shows("30 ريالًا / ساعة", "a/b", { a: 960, b: 32 })).toBe("pass");
    expect(shows("6 مثلثات", "n-2", { n: 8 })).toBe("pass");
    expect(shows("35 كوبًا", "b*c/(a+b)", { a: 2, b: 7, c: 45 })).toBe("pass");
    expect(shows("36 كوبًا", "b*c/(a+b)", { a: 2, b: 7, c: 45 })).toBe("fail");
    expect(shows("3 من 5", "a", { a: 3 })).toBe("fail"); // not a number + unit or count noun
    expect(parseUnit("ياردة")).toEqual({ key: "yd", dimension: "length" });
    expect(parseUnit("ريالًا / ساعة")).toEqual({ key: "sar/h", dimension: "currency/time" });
    expect(sameDimension("قدم", "سم")).toBe(true);
  });
});

describe("check outcomes", () => {
  it("routes P006 and V001 failures to review, other failures to rejection", () => {
    const { q, ctx } = ok();
    q.explanation.steps = ["نضرب الأساس في نفسه أربع مرات"];
    expect(runChecks(q, ctx)).toMatchObject({ outcome: "review", review: ["P006"] });
    expect(REVIEW_CODES.has("V001")).toBe(true);
    q.stem = "سؤال وزاري: ما قيمة 3^4؟";
    rehash({ stimuli: new Map() }, q);
    const r = runChecks(q, ctx);
    expect(r.outcome).toBe("reject");
    expect(r.failed).toContain("P003");
    expect(r.failed).toContain("S002"); // a revision-1 id must derive from the stem
  });

  it("E001 finds quotes in vision transcripts (lam-alef fold) and says not_checked on untrusted pages", () => {
    const { q, ctx } = ok();
    const quote = "المقرر يعرض أمثلة على القوى";
    q.source.pdf_page_end = 15;
    q.source.evidence = [{ pdf_page: 15, quote_sha256: sha256Hex(quote), char_offsets: [0, 0], quote_kind: "fact" }];
    ctx.evidence = () => [{ pdf_page: 15, quote_sha256: sha256Hex(quote), quote_kind: "fact", quote }];
    expect(runCheck("E001", q, ctx).result).toBe("pass");
    const q16 = "õcôŸG";
    q.source.pdf_page_end = 16;
    q.source.evidence = [{ pdf_page: 16, quote_sha256: sha256Hex(q16), char_offsets: [0, 0], quote_kind: "fact" }];
    ctx.evidence = () => [{ pdf_page: 16, quote_sha256: sha256Hex(q16), quote_kind: "fact", quote: q16 }];
    const r = runCheck("E001", q, ctx);
    expect(r).toMatchObject({ result: "warn", review: true });
    expect(r.detail).toMatch(/^not_checked/);
    expect(runChecks(q, ctx).outcome).toBe("review");
  });

  it("E001 warns (not rejects) on a miss in a repaired text layer; a miss in a transcript still fails", () => {
    const { q, ctx } = ok();
    const quote = "الأعداد الموجبة تكتب مسبوقة بإشارة (+) أو بدونها";
    q.provenance.origin = "transformed";
    q.source.evidence = [{ pdf_page: 14, quote_sha256: sha256Hex(quote), char_offsets: [0, 0], quote_kind: "fact" }];
    ctx.evidence = () => [{ pdf_page: 14, quote_sha256: sha256Hex(quote), quote_kind: "fact", quote }];
    const page = (method, quality) => ({ get: () => ({ text: "اأعداد سحيحة وتكتب مسبوقة باإسارة (+) اأو بدونها", method, quality, readable: true, image: null, image_exists: false }) });
    ctx.pages = page("text", "repaired");
    const r = runCheck("E001", q, ctx);
    expect(r.result).toBe("warn");
    expect(r.detail).toMatch(/repaired text layer/);
    expect(isHighRisk(q, [r])).toBe(true); // → the evidence extractor reads the image
    expect(runChecks(q, ctx).failed).not.toContain("E001");
    ctx.pages = page("vision", "ok");
    expect(runCheck("E001", q, ctx).result).toBe("fail");
    ctx.pages = page("text", "ok");
    expect(runCheck("E001", q, ctx).result).toBe("fail");
  });

  it("P004 is a char-5-gram check with permitted quote kinds and not_checked on unread pages", () => {
    const { q, ctx } = ok();
    const copied = "يستعمل العلماء القوى لكتابة الأعداد الكبيرة جدا بصورة مختصرة تسهل قراءتها ومقارنتها.";
    q.explanation.text = copied;
    expect(runCheck("P004", q, ctx).result).toBe("fail");
    ctx.evidence = () => [{ pdf_page: 14, quote_sha256: sha256Hex(copied), quote_kind: "definition", quote: copied }];
    expect(runCheck("P004", q, ctx).result).toBe("pass");
    q.source.pdf_page_end = 16;
    expect(runCheck("P004", q, ctx)).toMatchObject({ result: "warn", review: true });
  });

  it("P005 fails a table stimulus that keeps the book's data", () => {
    const { q, ctx } = ok();
    const table = "المدينة | السكان\nالرياض | 7000000\nجدة | 4000000\nمكة | 2000000";
    ctx.stimuli = new Map([["st-0000000000", { id: "st-0000000000", text: table }]]);
    q.stimulus_id = "st-0000000000";
    expect(runCheck("P005", q, ctx).result).toBe("fail");
    ctx.stimuli.set("st-0000000000", { id: "st-0000000000", text: "المدينة | السكان\nأ | 350\nب | 420\nج | 510" });
    expect(runCheck("P005", q, ctx).result).toBe("pass");
  });

  it("O004 fixes numeric, scale and all/none patterns and refuses all + none", () => {
    const { q } = ok();
    expect(q.payload.fixed_order_reason).toBe("numeric_ascending"); // applied at ingestion
    expect(q.shuffle_options).toBe(false);
    const q2 = clone(q);
    q2.payload.fixed_order_reason = null;
    q2.shuffle_options = true;
    q2.payload.options[3].text = "لا شيء مما سبق";
    expect(applyO004(q2)).toEqual({ changed: true, reason: "none_of_above" });
    q2.payload.options[2].text = "جميع ما سبق";
    expect(runCheck("O004", q2, {}).result).toBe("fail");
  });

  it("marks high-risk items (§4.4)", () => {
    expect(isHighRisk(ok("numeric").q)).toBe(true);
    expect(isHighRisk(ok("mcq").q)).toBe(true); // computation style
    const tf = ok("true_false").q;
    expect(isHighRisk(tf)).toBe(false);
    expect(isHighRisk(tf, [{ code: "L003", result: "warn" }])).toBe(true);
    expect(isHighRisk({ ...tf, difficulty: 4 })).toBe(true);
    expect(isHighRisk({ ...tf, scope: "aptitude" })).toBe(true);
  });
});

// ── ingestion ───────────────────────────────────────────────────────────────
describe("ingest-candidates", () => {
  const ingest = (cands, b = { ...bank, questions: new Map(bank.questions), where: new Map(bank.where), stimuli: new Map(bank.stimuli), stimulusWhere: new Map(bank.stimulusWhere) }, evidence = null) =>
    ({ b, ...ingestLines(cands.map((c) => (typeof c === "string" ? c : JSON.stringify(c))), packet, b, { runId: RUN, now: NOW, pages, evidence }) });

  it("rejects every field the generator may not set (S005)", () => {
    expect(forbiddenCandidateFields(BASE.mcq)).toEqual([]);
    const bad = [
      { id: "q-m1-math-1234567890" }, { curriculum: { lesson: LESSON } }, { status: "published" }, { content_hash: "x" },
      { term: "t1" }, { is_premium: true }, { provenance: { origin: "transformed", generator: { kind: "human" } } },
      { payload: { ...BASE.mcq.payload, options: [{ id: "a", text: "12" }, "64", "81", "7"] } },
      { source: { ...BASE.mcq.source, evidence: [{ pdf_page: 14, quote: "العدد 3 هو الأساس", quote_sha256: "0".repeat(64) }] } },
      { validation: { status: "validated" } }, { links: [] }, { created_at: NOW },
    ];
    const { accepted, rejected } = ingest(bad.map((extra) => ({ ...clone(BASE.mcq), ...extra })));
    expect(accepted).toEqual([]);
    expect(rejected).toHaveLength(bad.length);
    expect(rejected.every((r) => r.code === "S005")).toBe(true);
    const junk = ingest(["not json", "[1,2]"]);
    expect(junk.rejected.map((r) => r.code)).toEqual(["S001", "S001"]);
  });

  it("assigns ids, curriculum, term and provenance itself", () => {
    const { q } = make(BASE.mcq);
    const lesson = bank.nodes.get(LESSON);
    expect(q.id).toMatch(/^q-m1-math-[0-9a-f]{10}$/);
    expect(q.curriculum).toMatchObject({ lesson: LESSON, subject: "middle/grade-1/math", unit: "middle/grade-1/math/n91", term: lesson.term, term_status: lesson.term_status });
    expect(q.links).toEqual([{ node_id: LESSON, role: "primary" }]); // the fixture alignment is needs_review: no prep link
    expect(q.provenance).toMatchObject({ origin: "transformed", official: false, license_status: "all_rights_reserved", generator: { kind: "llm_subagent", run_id: RUN, prompt_version: "generate.v1" } });
    expect(q).toMatchObject({ revision: 1, status: "candidate", created_at: NOW, updated_at: NOW, difficulty_band: 1, difficulty_source: "generator_estimate" });
    expect(q.content_hash).toMatch(/^n2:sha256:[0-9a-f]{64}$/);
    expect(q.source).toMatchObject({ source_id: "ien", resource_id: RES, pdf_page_start: 14, printed_page_start: 12 });
  });

  it("assigns opaque, deterministic ids that do not reveal the answer (O009)", () => {
    const a = make(BASE.mcq).q;
    const b = make(BASE.mcq).q;
    expect(a.id).toBe(b.id);
    expect(a.payload).toEqual(b.payload);
    for (const o of a.payload.options) expect(o.id).toMatch(/^o[0-9a-f]{6}$/);
    expect(a.payload.options.find((o) => o.id === a.payload.answer.option_id).text).toBe("81");
    expect(opaqueIds("o", "salt-1", ["x", "y"])).not.toEqual(opaqueIds("o", "salt-2", ["x", "y"]));
    const m = make(BASE.matching).q;
    expect(m.payload.left.every((x) => /^l[0-9a-f]{6}$/.test(x.id)) && m.payload.right.every((x) => /^r[0-9a-f]{6}$/.test(x.id))).toBe(true);
    const o = make(BASE.ordering).q;
    expect(o.payload.items.map((x) => x.id)).not.toEqual(o.payload.answer.order);
    for (const q of [m, o]) expect(runCheck("O009", q, {}).result).toBe("pass");
  });

  it("moves evidence quotes to the cache sidecar", () => {
    const store = evidenceStore(cache);
    const { b, accepted } = ingest([BASE.mcq], undefined, store);
    const q = b.questions.get(accepted[0]);
    const ev = q.source.evidence[0];
    expect(Object.keys(ev).sort()).toEqual(["char_offsets", "pdf_page", "quote_kind", "quote_sha256"]);
    expect(ev.quote_sha256).toBe(sha256Hex("العدد 3 هو الأساس"));
    expect(PAGE14.slice(ev.char_offsets[0], ev.char_offsets[1])).toBe("العدد 3 هو الأساس");
    expect(JSON.stringify(q)).not.toContain("العدد 3 هو الأساس");
    expect(store.get(q.id, 1)).toEqual([{ question_id: q.id, revision: 1, pdf_page: 14, quote_sha256: ev.quote_sha256, quote_kind: "fact", quote: "العدد 3 هو الأساس" }]);
  });

  it("rejects exact duplicates (D001) and pages outside the packet", () => {
    const { rejected } = ingest([BASE.mcq, BASE.mcq, { ...clone(BASE.mcq), source: { pdf_page_start: 30, pdf_page_end: 30 } }]);
    expect(rejected.map((r) => r.code)).toEqual(["D001", "S004"]);
  });

  it("mints ids from answer-free material and stores shufflable options in an id-seeded order", () => {
    const texts = ["الأسد", "النمر", "الفيل", "الزرافة"];
    const cand = (i, index = 0) => ({ ...clone(BASE.mcq), stem: `أي هذه الحيوانات من السنوريات؟ (${i})`, computation: null, payload: { options: texts, answer: { index }, fixed_order_reason: null } });
    const positions = new Set();
    for (let i = 0; i < 12; i++) {
      const { b, accepted, rejected } = ingest([cand(i)]);
      expect(rejected).toEqual([]);
      const q = b.questions.get(accepted[0]);
      expect(q.shuffle_options).toBe(true);
      expect(q.payload.options.map((o) => o.text).sort()).toEqual([...texts].sort());
      positions.add(q.payload.options.findIndex((o) => o.id === q.payload.answer.option_id));
      // deterministic: the same line gives the same record
      expect(ingest([cand(i)]).b.questions.get(accepted[0]).payload).toEqual(q.payload);
    }
    // the generator always authored the key first; the stored order does not keep that
    expect(positions.size).toBeGreaterThan(1);
    // attack: the id is the same whichever option is the key, so it cannot be used to test candidates
    const minted = [0, 1, 2, 3].map((index) => ingest([cand(99, index)]).accepted[0]);
    expect(new Set(minted).size).toBe(1);
    // an authoring-order change of the same options is the same item
    expect(ingest([{ ...cand(99), payload: { options: [...texts].reverse(), answer: { index: 3 }, fixed_order_reason: null } }]).accepted[0]).toBe(minted[0]);
    // fixed-order items keep their (ascending) order
    const { b, accepted } = ingest([BASE.mcq]);
    expect(b.questions.get(accepted[0]).payload.options.map((o) => o.text)).toEqual(["7", "12", "64", "81"]);
  });

  it("allows one repair round as a new revision of the same id", () => {
    const { b, accepted } = ingest([BASE.mcq]);
    const id = accepted[0];
    b.questions.get(id).status = "rejected";
    const fixed = { ...clone(BASE.mcq), repair_of: id, stem: "ما ناتج 3^4؟" };
    const r1 = ingestLines([JSON.stringify(fixed)], packet, b, { runId: RUN, now: "2026-09-28T08:00:00Z", pages });
    expect(r1.accepted).toEqual([id]);
    expect(b.questions.get(id)).toMatchObject({ revision: 2, created_at: NOW, updated_at: "2026-09-28T08:00:00Z", status: "candidate" });
    b.questions.get(id).status = "rejected";
    const r2 = ingestLines([JSON.stringify(fixed)], packet, b, { runId: RUN, now: NOW, pages });
    expect(r2.rejected[0].code).toBe("S002");
  });

  it("declares rewrite variants with their parent", () => {
    const parent = [...bank.questions.values()].find((q) => q.curriculum?.lesson === LESSON) ?? make(BASE.mcq).q;
    const b = { ...bank, questions: new Map([...bank.questions, [parent.id, parent]]), where: new Map(bank.where), stimuli: bank.stimuli, stimulusWhere: bank.stimulusWhere };
    const res = ingestLines([JSON.stringify({ ...clone(BASE.mcq), stem: "ما قيمة 3^4 في موقف حياتي؟", variant: { kind: "rewrite", of: parent.id, change: "context" } })], packet, b, { runId: RUN, now: NOW, pages });
    const q = b.questions.get(res.accepted[0]);
    expect(q.variant).toEqual({ kind: "rewrite", of: parent.id, change: "context" });
    expect(q.provenance.derived_from).toEqual([parent.id]);
  });
});

// ── packets ─────────────────────────────────────────────────────────────────
const quiet = { log: () => {}, error: () => {}, warn: () => {} };
const INGEST_AT = "2026-09-27T09:30:00Z";

describe("make-packets", () => {
  it("generation packets carry page text, text_quality and page images", () => {
    expect(packet.packet_id).toBe(`${RUN}:${LESSON}`);
    expect(packet.pages.map((p) => p.pdf_page)).toEqual([14, 15, 16]);
    for (const p of packet.pages) {
      expect(p.image).toBe(join(cache, "ien/pages", STEM_DIR, `p${String(p.pdf_page).padStart(3, "0")}.jpg`).split("\\").join("/"));
      expect(existsSync(p.image)).toBe(true);
      expect(["ok", "repaired", "untrusted"]).toContain(p.text_quality);
    }
    expect(packet.pages[0]).toMatchObject({ text: PAGE14, text_method: "text", text_quality: "ok", printed_page: 12, kind: "lesson" });
    expect(packet.pages[1]).toMatchObject({ text_method: "vision", text: PAGE15 });
    expect(packet.pages[2]).toMatchObject({ text_quality: "untrusted", read_image: true });
    expect(packet.objectives.map((o) => o.id)).toContain("obj-fa3d3bfb40");
    expect(packet.exercises.map((e) => e.label)).toEqual(["مثال 1", "تدرب 3"]);
    expect(Object.values(packet.target.types).reduce((a, b) => a + b, 0)).toBe(packet.target.count);
    expect(Object.values(packet.target.difficulty).reduce((a, b) => a + b, 0)).toBe(packet.target.count);
    expect(packet.rules_version).toBe("generate.v1");
    expect(packet.output.startsWith(cache.split("\\").join("/"))).toBe(true);
    expect(allocate(7, { a: 1, b: 1, c: 1 })).toEqual({ a: 3, b: 2, c: 2 });
  });

  it("validation packets carry the same images; the blind packet has no key", () => {
    const { q } = make(BASE.mcq);
    const b = { ...bank, questions: new Map([...bank.questions, [q.id, q]]) };
    const v = buildValidationPackets(b, q, { runId: "run-20260928-val-01", pages, root: cache });
    const genImages = new Map(packet.pages.map((p) => [p.pdf_page, p.image]));
    expect(v.keyed.pages.map((p) => p.image)).toEqual([genImages.get(14)]);
    expect(v.keyed.pages[0]).toMatchObject({ text_quality: "ok", text_method: "text" });
    const blindText = JSON.stringify(v.blind);
    for (const k of ["payload", "answer", "explanation", "pages", "content_hash"]) expect(v.blind).not.toHaveProperty(k);
    expect(blindText).not.toContain(q.payload.answer.option_id);
    expect(v.blind.options.sort()).toEqual(["12", "64", "7", "81"].sort());
    expect(v.keyed.display.options[v.keyed.key_display.option_index]).toBe("81");
    const e = buildEvidencePacket(b, q, { runId: "run-20260928-val-01", pages, root: cache });
    expect(JSON.stringify(e.packet)).not.toContain(q.stem);
    expect(e.packet.pages[0].image).toBe(genImages.get(14));
  });

  it("builds aptitude topic packets without pages", async () => {
    const { packet: p } = buildPrepPacket(bank, { exam: "aptitude", section: "quantitative", topic: "arithmetic" }, { runId: RUN, root: cache, catalog, labels: { ar: { topics: { arithmetic: "الحساب" } }, en: {} } });
    expect(p).toMatchObject({ prep: { exam: "aptitude", section: "quantitative", topic: "arithmetic" }, rules_version: "generate.v1" });
    expect(p.topic_description.topic.ar).toBe("الحساب");
    expect(p.pages).toBeUndefined();
  });

  it("refuses missing images unless --render renders them with pdf-render", async () => {
    const root = join(tmp, "cache-missing");
    cpSync(cache, root, { recursive: true });
    rmSync(join(root, "ien/pages", STEM_DIR, "p016.jpg"));
    const args = ["--kind", "gen", "--run", RUN, "--lessons", LESSON, "--staging", staging, "--cache", root];
    expect(await packetsMain(args, quiet)).toBe(1);
    expect(existsSync(join(root, "packets", RUN))).toBe(false);
    const calls = [];
    const renderer = async (file, list) => {
      calls.push([file, list]);
      for (const p of list) writeFileSync(join(root, "ien/pages", STEM_DIR, `p${String(p).padStart(3, "0")}.jpg`), Buffer.from([0xff, 0xd8]));
    };
    expect(await packetsMain([...args, "--render"], quiet, { renderer })).toBe(0);
    expect(calls).toEqual([["1448-GE-ME-K07-SM1-math-part1.pdf", [16]]]);
    const written = JSON.parse(readFileSync(join(root, "packets", RUN, "middle__grade-1__math__n54.json"), "utf8"));
    expect(written.pages.every((p) => existsSync(p.image))).toBe(true);
  });
});

// ── the CLIs end to end on a temporary staging tree ────────────────────────
describe("ingest-candidates → check-questions (CLI)", () => {
  it("ingests, checks, rejects and queues for review", async () => {
    const stg = join(tmp, "staging-e2e");
    cpSync(FIXTURE, stg, { recursive: true });
    const pfile = join(tmp, "packet.json");
    writeFileSync(pfile, JSON.stringify(packet));
    const cands = [
      BASE.mcq,
      { ...clone(BASE.true_false), stem: "سؤال وزاري: العدد 3 في العبارة 3^4 هو الأساس." },
      { ...clone(BASE.short_answer), source: { pdf_page_start: 14, pdf_page_end: 16, evidence: [{ pdf_page: 16, quote: "õcôŸG", quote_kind: "fact" }] } },
    ];
    const cfile = join(tmp, "candidates.jsonl");
    writeFileSync(cfile, cands.map((c) => JSON.stringify(c)).join("\n") + "\n");
    expect(await ingestMain(["--run", RUN, "--packet", pfile, "--file", cfile, "--staging", stg, "--cache", cache, "--now", INGEST_AT], quiet)).toBe(0);
    expect(await checkMain(["--run", "run-20260928-check-01", "--staging", stg, "--cache", cache, "--baseline", "none", "--now", "2026-09-28T09:00:00Z"], quiet)).toBe(0);
    const b = loadStaging(stg);
    const mine = [...b.questions.values()].filter((q) => q.provenance.generator.run_id === RUN && q.created_at === INGEST_AT);
    expect(mine).toHaveLength(3);
    const by = Object.fromEntries(mine.map((q) => [q.question_type, q]));
    expect(by.mcq.validation.status).toBe("structural_pass");
    expect(by.true_false).toMatchObject({ status: "rejected", validation: { status: "failed" } });
    expect(by.short_answer).toMatchObject({ status: "review_required" });
    expect(b.reviewQueue.some((r) => r.question_id === by.short_answer.id && /E001|P004/.test(r.reason))).toBe(true);
    const rec = b.records.get(`run-20260928-check-01:${by.mcq.id}:deterministic`);
    expect(rec).toMatchObject({ role: "deterministic", agent: "script", revision: 1, content_hash: by.mcq.content_hash });
    expect(rec.checks.map((c) => c.code)).toEqual([...CHECK_CODES]);
    const manifest = JSON.parse(readFileSync(join(stg, "validation/runs/run-20260928-check-01.json"), "utf8"));
    expect(manifest.counts).toMatchObject({ checked: 3, rejected: 1, review_required: 1 });
    // nothing textbook-derived in the committed tree: quotes stay in the cache sidecar
    const committed = readFileSync(join(stg, "questions/middle/grade-1/math.jsonl"), "utf8");
    expect(committed).not.toContain("العدد 3 هو الأساس");
    expect(existsSync(join(cache, "evidence", "q-m1-math.jsonl"))).toBe(true);
    // rerun is a no-op: already-checked revisions are skipped
    expect(await checkMain(["--run", "run-20260928-check-02", "--staging", stg, "--cache", cache, "--baseline", "none"], quiet)).toBe(0);
    expect(JSON.parse(readFileSync(join(stg, "validation/runs/run-20260928-check-02.json"), "utf8")).counts.checked).toBe(0);
    // a re-check (--all) that now passes lifts an earlier deterministic rejection or review
    const b2 = loadStaging(stg);
    const q = b2.questions.get(by.mcq.id);
    q.status = "review_required";
    b2.reviewQueue.push({ schema: "review-queue@1", question_id: q.id, revision: q.revision, reason: "deterministic: E001", record_ids: [], queued_at: "2026-09-28T09:00:00Z" });
    const { outcomes } = checkBank(b2, { runId: "run-20260928-check-03", now: "2026-09-28T10:00:00Z", ids: [q.id], all: true, catalog, pages, evidence: evidenceStore(cache) });
    expect(outcomes[0].outcome).toBe("pass");
    expect(q).toMatchObject({ status: "candidate", validation: { status: "structural_pass" } });
    expect(b2.reviewQueue.some((r) => r.question_id === q.id)).toBe(false);
    // the newest deterministic record describes the item (not the first one)
    expect(latestRecord(b2, q, "deterministic").run_id).toBe("run-20260928-check-03");
  });

  it("P006 fails an item without an explanation", () => {
    const { q, ctx } = ok("true_false");
    q.explanation = null;
    expect(runCheck("P006", q, ctx)).toMatchObject({ result: "fail", detail: "explanation missing" });
    expect(runChecks(q, ctx).outcome).toBe("review");
  });

  it("usage errors exit 2", async () => {
    expect(await checkMain([], quiet)).toBe(2);
    expect(await ingestMain(["--run", "run-20260927-check-01"], quiet)).toBe(2);
    expect(await packetsMain(["--kind", "gen", "--run", RUN], quiet)).toBe(2);
  });
});

// ── regressions found in verification ──────────────────────────────────────
describe("verifier regressions", () => {
  const texts = (q) => q.payload.options.map((o) => o.text);
  const keyText = (q) => q.payload.options.find((o) => o.id === q.payload.answer.option_id).text;

  it("stores numeric_ascending options in ascending order (the engine shows fixed orders as stored)", () => {
    // BASE.mcq is authored as 12, 64, 81, 7 with the key third.
    const { q, ctx } = ok();
    expect(q.payload.fixed_order_reason).toBe("numeric_ascending");
    expect(texts(q)).toEqual(["7", "12", "64", "81"]);
    expect(keyText(q)).toBe("81");
    expect(runCheck("O004", q, ctx).result).toBe("pass");
    // an unsorted numeric_ascending item fails O004 and the fix sorts it, keeping the key
    const bad = clone(q);
    bad.payload.options.reverse();
    expect(runCheck("O004", bad, {})).toMatchObject({ result: "fail" });
    expect(runCheck("O004", bad, {}).detail).toMatch(/ascending/);
    expect(applyO004(bad).changed).toBe(true);
    expect(texts(bad)).toEqual(["7", "12", "64", "81"]);
    expect(keyText(bad)).toBe("81");
    // legacy items keep their source order (lossless conversion, legacy RPCs)
    const legacy = { ...clone(bad), id: "aq-999", provenance: { ...bad.provenance, origin: "internal_authored" } };
    legacy.payload.options.reverse();
    expect(runCheck("O004", legacy, {}).result).toBe("pass");
  });

  it("never invents source pages: source-based items must cite them; generated practice cites the lesson range", () => {
    const b = { ...bank, questions: new Map(bank.questions), where: new Map(bank.where), stimuli: new Map(bank.stimuli), stimulusWhere: new Map(bank.stimulusWhere) };
    const noSource = (base) => { const c = clone(base); delete c.source; return JSON.stringify(c); };
    const r = ingestLines([noSource(BASE.true_false), noSource(BASE.numeric)], packet, b, { runId: RUN, now: NOW, pages });
    expect(r.rejected.map((x) => x.code)).toEqual(["S004"]);
    expect(r.rejected[0].reason).toMatch(/must cite/);
    const gp = b.questions.get(r.accepted[0]);
    expect(gp.provenance.origin).toBe("generated_practice");
    expect(gp.source).toMatchObject({ resource_id: RES, pdf_page_start: 14, pdf_page_end: 16 });
  });

  it("a new revision without new generator output keeps its evidence quotes (E001 after set_key / O004)", () => {
    const root = join(tmp, "cache-rev");
    cpSync(cache, root, { recursive: true });
    const store = evidenceStore(root);
    const b = { ...bank, questions: new Map(bank.questions), where: new Map(bank.where), stimuli: new Map(bank.stimuli), stimulusWhere: new Map(bank.stimulusWhere) };
    const { accepted } = ingestLines([JSON.stringify(BASE.mcq)], packet, b, { runId: RUN, now: NOW, pages, evidence: store });
    const q = b.questions.get(accepted[0]);
    bumpRevision(b, q, "2026-09-28T13:30:00Z"); // e.g. a human set_key
    expect(q.revision).toBe(2);
    expect(store.get(q.id, 2)).toEqual([]);
    const rows = evidenceRows(store, q);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ revision: 2, pdf_page: 14, quote: "العدد 3 هو الأساس" });
    const ctx = checkContext(b, { catalog, pages, evidence: store });
    expect(runCheck("E001", q, ctx).result).toBe("pass");
    // a different quote hash is never borrowed from an older revision
    q.source.evidence[0].quote_sha256 = "0".repeat(64);
    expect(runCheck("E001", q, ctx).result).toBe("fail");
  });

  it("recordsFor stays correct with the per-question index (direct sets and attachRecord)", () => {
    const b = loadStaging(staging);
    const q = [...b.questions.values()][0];
    const base = { schema: "validation-record@1", question_id: q.id, revision: q.revision, content_hash: q.content_hash, role: "primary" };
    const before = recordsFor(b, q).length;
    b.records.set(`run-20260928-val-07:${q.id}:primary`, { ...base, id: `run-20260928-val-07:${q.id}:primary` });
    expect(recordsFor(b, q)).toHaveLength(before + 1);
    attachRecord(b, q, { ...base, id: `run-20260928-val-08:${q.id}:primary` });
    expect(recordsFor(b, q)).toHaveLength(before + 2);
    b.records.set(`run-20260928-val-09:${q.id}:primary`, { ...base, id: `run-20260928-val-09:${q.id}:primary`, revision: q.revision + 1 });
    expect(recordsFor(b, q)).toHaveLength(before + 2); // other revisions never count
  });

  it("checkBank keeps its indexes in step when an O004 fix changes a content hash", () => {
    const b = { ...bank, questions: new Map(bank.questions), where: new Map(bank.where), stimuli: new Map(bank.stimuli), stimulusWhere: new Map(bank.stimulusWhere), records: new Map(bank.records), recordWhere: new Map(bank.recordWhere), reviewQueue: [] };
    const { accepted } = ingestLines([JSON.stringify(BASE.true_false)], packet, b, { runId: RUN, now: NOW, pages });
    const q = b.questions.get(accepted[0]);
    q.shuffle_options = true; // O004 will fix it (true_false never shuffles) → revision 2, new hash
    rehash(b, q);
    const res = checkBank(b, { runId: "run-20260928-check-05", now: "2026-09-28T09:00:00Z", ids: [q.id], catalog, pages, evidence: null });
    expect(res.counts.fixed).toBe(1);
    expect(q.revision).toBe(2);
    expect(res.outcomes[0].failed).not.toContain("D001");
    expect(res.outcomes[0].failed).not.toContain("S002");
  });
});


// ── prompts carry the design's rules verbatim ──────────────────────────────
describe("prompts (§4.3, §4.3b, §4.4 verbatim)", () => {
  const doc = readFileSync(join(REPO, "docs/CONTENT_ENGINE.md"), "utf8").replace(/\r/g, "");
  const flat = (s) => s.replace(/\s+/g, " ").trim();
  const para = (start) => {
    const i = doc.indexOf(start);
    expect(i, start).toBeGreaterThan(-1);
    return doc.slice(i, doc.indexOf("\n\n", i));
  };
  const bullet = (start) => {
    const i = doc.indexOf(start);
    const rest = doc.slice(i + 1);
    const m = /\n(?:- |\n)/.exec(rest);
    return doc.slice(i, i + 1 + m.index);
  };
  const prompt = (name) => flat(readFileSync(join(REPO, "scripts/content/prompts", name), "utf8"));
  const RULES = {
    "generate.v1.md": ["**Page images.**", "**Output:** JSONL", "**Required:**", "**Forbidden**", "**Rewrite variants**"].map(para)
      .concat(["- **Aptitude**", "- **Achievement**"].map(bullet)),
    "repair.v1.md": ["**Page images.**", "**Required:**", "**Forbidden**"].map(para),
    "validate.v1.md": ["**Stage 2 — primary validator**", "**High-risk** = any of:", "For **high-risk** items an independent"].map(para),
  };
  for (const [name, rules] of Object.entries(RULES)) {
    it(`${name} contains its rules verbatim`, () => {
      const text = prompt(name);
      for (const rule of rules) expect(text).toContain(flat(rule));
    });
  }
  it("the cross-AI prompts demand JSON lines in the §4.4 formats and carry no textbook text", () => {
    expect(prompt("chatgpt-resolve.v1.md")).toContain("{id, answer: <response per §2.8>, confidence: 0..1, method ≤ 300 chars}");
    expect(prompt("gemini-language.v1.md")).toContain("{id, verdict: pass|warn|fail, issues:[{code, span, suggestion}]}");
    for (const name of ["chatgpt-resolve.v1.md", "gemini-language.v1.md"]) expect(prompt(name)).not.toMatch(/image|pdf_page|pages\.jsonl/);
  });
});
