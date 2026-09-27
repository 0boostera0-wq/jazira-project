// WP5 — question templates and variants (docs/CONTENT_ENGINE.md §2.9, §4.6).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  checkTemplate, generateVariants, previewInstances, instantiate, variantRecord, constraintsHold, showsAnswer, opaqueIds,
  renderText, hasUnfilled, templateIsActive, TemplateError, VARIANT_CAP, MAX_TRIES_PER_VARIANT,
} from "@/lib/content/templates.js";
import { evaluateBoolean, evaluateNumber, formatValue, toNumber } from "@/lib/content/expr.js";
import { gradeResponse } from "@/lib/content/answers.js";
import { contentHash, variantId } from "@/lib/content/ids.js";

const REPO = resolve(__dirname, "../..");
const FIXTURE = join(REPO, "tests/fixtures/content/staging");
const TEMPLATE_FILE = "question-variants/templates/middle/grade-1/math.jsonl";
const VARIANT_FILE = "question-variants/middle/grade-1/math.jsonl";
const BASE = JSON.parse(readFileSync(join(FIXTURE, TEMPLATE_FILE), "utf8").trim().split("\n")[0]);
const tpl = (over = {}) => ({ ...structuredClone(BASE), ...over });
const CURRICULUM = {
  stage: "middle", grade: "middle/grade-1", track: null, term: "t2", term_status: "inferred",
  subject: "middle/grade-1/math", unit: "middle/grade-1/math/n92", chapter: null, lesson: "middle/grade-1/math/n61",
};
const NOW = "2026-09-28T08:00:00Z";
const RUN = "run-20260928-var-01";

let S;
beforeAll(async () => {
  S = await import("../../scripts/content/lib/schemas.mjs");
});

describe("checkTemplate", () => {
  it("accepts the fixture template", () => {
    expect(checkTemplate(BASE)).toEqual([]);
  });

  it("reports unsupported types, bad params, unknown identifiers and placeholders", () => {
    const codes = (t) => checkTemplate(t).map((e) => e.code);
    expect(codes(tpl({ question_type: "matching" }))).toContain("unsupported_type");
    expect(codes(tpl({ distractors: [] }))).toContain("too_few_distractors");
    expect(codes(tpl({ params: { a: { type: "int", min: 5, max: 1 }, b: BASE.params.b } }))).toContain("bad_param");
    expect(codes(tpl({ params: { ...BASE.params, c: { type: "int", min: 1, max: 2, exclude: [1, 2] } } }))).toContain("bad_param");
    expect(codes(tpl({ params: { ...BASE.params, d: { type: "decimal", min: 0, max: 1 } } }))).toContain("bad_param");
    expect(codes(tpl({ answer: { expr: "a*c", format: "int" } }))).toContain("unknown_identifier");
    expect(codes(tpl({ constraints: ["a >"] }))).toContain("bad_expr");
    expect(codes(tpl({ answer: { expr: "a*b", format: "roman" } }))).toContain("bad_expr");
    expect(codes(tpl({ stem: "ما ناتج {a} × {c}؟" }))).toContain("unknown_placeholder");
    expect(codes(tpl({ max_variants: 51 }))).toContain("bad_max_variants");
    expect(codes(tpl({ params: { ...BASE.params, ans: { type: "int", min: 1, max: 2 } } }))).toContain("bad_param");
    expect(() => generateVariants(tpl({ question_type: "ordering" }))).toThrow(TemplateError);
  });
});

describe("generateVariants — deterministic and code-verified (§4.6)", () => {
  let run;
  beforeAll(() => {
    run = generateVariants(BASE);
  });

  it("yields max_variants unique tuples, the same on every run, seeded from id | revision", () => {
    expect(run.variants).toHaveLength(BASE.max_variants);
    expect(run.stats).toMatchObject({ produced: 12, shortfall: 0 });
    expect(generateVariants(structuredClone(BASE))).toEqual(run);
    const keys = run.variants.map((v) => JSON.stringify(v.params));
    expect(new Set(keys).size).toBe(keys.length);
    expect(run.variants.map((v) => v.variant_no)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    // pinned: sfc32 seeded from sha256("t-m1-math-9927f5ac29|1")
    expect(run.variants[0].params).toEqual({ a: 10, b: 5 });
    expect(run.variants[1].params).toEqual({ a: -12, b: 3 });
    const bumped = generateVariants(tpl({ revision: 2 }));
    expect(bumped.variants.map((v) => v.params)).not.toEqual(run.variants.map((v) => v.params));
  });

  it("respects params, exclusions and constraints for every variant", () => {
    for (const { params } of run.variants) {
      expect(Number.isInteger(params.a) && params.a >= -12 && params.a <= 12 && ![0, 1].includes(params.a)).toBe(true);
      expect(Number.isInteger(params.b) && params.b >= 2 && params.b <= 12).toBe(true);
      for (const c of BASE.constraints) expect(evaluateBoolean(c, params), c).toBe(true);
      expect(constraintsHold(BASE, params)).toBe(true);
    }
  });

  it("every variant passes the code checks", () => {
    for (const { params, instance } of run.variants) {
      const ans = formatValue(evaluateNumber(BASE.answer.expr, params), "int");
      expect(instance.answerText).toBe(ans);
      expect(hasUnfilled(instance.stem)).toBe(false);
      expect(instance.stem).toBe(`ما ناتج ${params.a} × ${params.b}؟`);
      const opts = instance.payload.options;
      expect(opts).toHaveLength(1 + BASE.distractors.length);
      expect(new Set(opts.map((o) => o.text)).size).toBe(opts.length);
      expect(new Set(opts.map((o) => o.id)).size).toBe(opts.length);
      expect(opts.map((o) => Number(o.text))).toEqual([...opts.map((o) => Number(o.text))].sort((x, y) => x - y));
      expect(instance.payload.fixed_order_reason).toBe("numeric_ascending");
      expect(opts.find((o) => o.id === instance.payload.answer.option_id).text).toBe(ans);
      expect(gradeResponse("mcq", instance.payload, { option_id: instance.payload.answer.option_id }).score).toBe(1);
      expect([instance.explanation.text, ...instance.explanation.steps].some((s) => showsAnswer(s, ans))).toBe(true);
      expect(instance.explanation.method).toBe(BASE.solution_method);
      expect(instance.computation).toEqual({ expr: "a*b", vars: params });
      expect(Math.abs(toNumber(evaluateNumber("a*b", params)) - params.a * params.b)).toBeLessThan(1e-9);
      expect(instantiate(BASE, params)).toEqual(instance);
    }
  });

  it("previewInstances gives the first n variants (what validates the template)", () => {
    expect(previewInstances(BASE, 3)).toEqual(run.variants.slice(0, 3));
  });

  it("skips and counts failing tuples, and stops with a shortfall when the space is exhausted", () => {
    // a + b equals a * b for a = b = 2: that tuple fails distractor_duplicate
    const t = tpl({
      id: "t-m1-math-00000000aa",
      params: { a: { type: "int", min: 1, max: 3 }, b: { type: "int", min: 1, max: 3 } },
      constraints: [],
      max_variants: 20,
    });
    const r = generateVariants(t);
    expect(r.stats.check_failures.distractor_duplicate).toBeGreaterThanOrEqual(1);
    expect(r.variants.length).toBeLessThan(9);
    expect(r.stats.shortfall).toBe(20 - r.variants.length);
    expect(r.stats.tries).toBeLessThanOrEqual(r.variants.length + 1 + MAX_TRIES_PER_VARIANT * 2);
    for (const v of r.variants) {
      const texts = v.instance.payload.options.map((o) => o.text);
      expect(new Set(texts).size).toBe(texts.length);
    }
  });

  it("counts evaluation failures (division by zero) instead of emitting them", () => {
    const t = tpl({
      id: "t-m1-math-00000000bb",
      params: { a: { type: "int", min: 1, max: 9 }, b: { type: "int", min: 0, max: 3 } },
      constraints: [],
      stem: "ما ناتج {a} ÷ {b}؟",
      answer: { expr: "a/b", format: "fraction" },
      distractors: [{ expr: "a*b + 100", why: "ضرب بدل القسمة" }],
      explanation: { text: "", steps: ["{a} ÷ {b} = {ans}"] },
      max_variants: 12,
    });
    const r = generateVariants(t);
    expect(r.stats.check_failures.answer_eval).toBeGreaterThanOrEqual(1);
    expect(r.variants.every((v) => v.params.b !== 0)).toBe(true);
  });

  it("caps max_variants at 50", () => {
    const t = tpl({ id: "t-m1-math-00000000cc", params: { a: { type: "int", min: 2, max: 400 }, b: { type: "int", min: 2, max: 9 } }, constraints: ["a != b"], max_variants: 50 });
    const r = generateVariants(t, { limit: 80 });
    expect(r.variants).toHaveLength(VARIANT_CAP);
  });
});

describe("numeric templates, decimal and choice params", () => {
  const speed = tpl({
    id: "t-m1-math-00000000dd",
    question_type: "numeric",
    item_style: "application",
    params: {
      d: { type: "decimal", min: 1.5, max: 9.5, step: 0.5 },
      t: { type: "choice", values: [2, 4, 8] },
      who: { type: "choice", values: ["سارة", "خالد"] },
    },
    constraints: ["d/t >= 0.25"],
    stem: "قطع {who} مسافة {d} كم في {t} ساعات. ما متوسط سرعته بالكيلومتر لكل ساعة؟",
    answer: { expr: "d/t", format: "decimal:2" },
    distractors: [{ expr: "d*t", why: "ضرب بدل القسمة" }],
    explanation: { text: "السرعة = المسافة ÷ الزمن.", steps: ["{d} ÷ {t} = {ans}"] },
    max_variants: 10,
  });

  it("draws decimals on the step grid, choices from the list, and grades the exact answer", () => {
    const r = generateVariants(speed);
    expect(r.variants.length).toBe(10);
    for (const { params, instance } of r.variants) {
      expect([2, 4, 8]).toContain(params.t);
      expect(["سارة", "خالد"]).toContain(params.who);
      expect(Number.isInteger(params.d * 2)).toBe(true);
      expect(instance.stem).toContain(params.who);
      expect(instance.computation.vars).toEqual({ d: params.d, t: params.t }); // strings never reach expressions
      const p = instance.payload;
      expect(p.answer.value).toBe(instance.answerText);
      expect(p.input).toEqual({ allow_fraction: false, max_decimals: 2 });
      expect(gradeResponse("numeric", p, { value: p.answer.value }).score).toBe(1);
      const exact = params.d / params.t;
      expect(gradeResponse("numeric", p, { value: String(exact + 1) }).score).toBe(0);
      if (Number(p.answer.value) !== exact) expect(p.answer.tolerance).toEqual({ kind: "abs", value: "0.005" });
      else expect(p.answer.tolerance).toEqual({ kind: "abs", value: "0" });
    }
  });

  it("stores fraction answers exactly and accepts fraction input", () => {
    const t = tpl({
      id: "t-m1-math-00000000ee",
      question_type: "numeric",
      params: { a: { type: "int", min: 1, max: 6 }, b: { type: "int", min: 7, max: 9 } },
      constraints: [],
      stem: "اكتب ناتج قسمة {a} على {b} في صورة كسر.",
      answer: { expr: "frac(a, b)", format: "fraction" },
      distractors: [],
      explanation: { text: "", steps: ["{a} ÷ {b} = {ans}"] },
      max_variants: 5,
    });
    for (const { params, instance } of generateVariants(t).variants) {
      expect(instance.payload.input.allow_fraction).toBe(true);
      expect(gradeResponse("numeric", instance.payload, { value: `${params.a}/${params.b}` }).score).toBe(1);
    }
  });
});

describe("rendering helpers", () => {
  it("fills placeholders and detects unfilled ones; literal braces are allowed", () => {
    expect(renderText("{a} × {b} = {ans}", { a: "3", b: "-4", ans: "-12" })).toBe("3 × -4 = -12");
    expect(hasUnfilled(renderText("{a} + {c}", { a: "1" }))).toBe(true);
    expect(hasUnfilled("مجموعة الحل {5, -2}")).toBe(false);
  });

  it("finds the answer only as a whole number", () => {
    expect(showsAnswer("3 × 4 = 12", "12")).toBe(true);
    expect(showsAnswer("-3 × 4 = -12", "-12")).toBe(true);
    expect(showsAnswer("-3 × 4 = -12", "12")).toBe(false);
    expect(showsAnswer("x = 120", "12")).toBe(false);
    expect(showsAnswer("x = 1.25", "1.2")).toBe(false);
    expect(showsAnswer("x = 12.", "12")).toBe(true);
    expect(showsAnswer("الناتج 3/4", "3/4")).toBe(true);
    expect(showsAnswer("الناتج 13/4", "3/4")).toBe(false);
  });

  it("assigns opaque, deterministic option ids from the template salt and normalized text", () => {
    const [id, other] = opaqueIds("o", "t-m1-math-9927f5ac29", ["12", "-12"]);
    expect(id).toMatch(/^o[0-9a-f]{6}$/);
    expect(other).not.toBe(id);
    expect(opaqueIds("o", "t-m1-math-9927f5ac29", ["١٢"])).toEqual([id]);
    expect(opaqueIds("o", "t-m1-math-0000000000", ["12"])).not.toEqual([id]);
    expect(() => opaqueIds("o", "salt", ["12", "١٢"])).toThrow(TemplateError);
  });
});

describe("variantRecord — materialized question@1 records", () => {
  const first = () => generateVariants(BASE, { limit: 2 }).variants;

  it("is schema-valid and keeps the template's lesson, objective, difficulty and method", () => {
    for (const v of first()) {
      const rec = variantRecord(BASE, v, { curriculum: CURRICULUM, runId: RUN, now: NOW });
      expect(S.validateRecord("question", rec).errors).toEqual([]);
      expect(rec.id).toBe(variantId(BASE.id, v.variant_no));
      expect(rec).toMatchObject({
        curriculum: { lesson: BASE.lesson_node_id }, objective_id: BASE.objective_id, difficulty: BASE.difficulty, difficulty_band: 1,
        item_style: BASE.item_style, status: "validated", shuffle_options: false,
        variant: { kind: "template", template_id: BASE.id, variant_no: v.variant_no, params: v.params },
        provenance: { origin: "generated_practice", official: false, template_id: BASE.id, generator: { kind: "script", run_id: RUN, prompt_version: null } },
        validation: { status: "validated", checked_revision: 1 },
      });
      expect(rec.explanation.method).toBe(BASE.solution_method);
      expect(rec.content_hash).toBe(contentHash(rec));
    }
  });

  it("gives candidate templates candidate variants and refuses a foreign lesson", () => {
    const v = first()[0];
    const rec = variantRecord(tpl({ status: "candidate" }), v, { curriculum: CURRICULUM, runId: RUN, now: NOW });
    expect(rec.status).toBe("candidate");
    expect(rec.validation).toEqual({ status: "pending", record_ids: [], checked_revision: null });
    expect(() => variantRecord(BASE, v, { curriculum: { ...CURRICULUM, lesson: "middle/grade-1/math/n53" }, runId: RUN, now: NOW })).toThrow(TemplateError);
    expect(templateIsActive(tpl({ status: "retired" }))).toBe(false);
    expect(templateIsActive(BASE)).toBe(true);
  });

  it("keeps revision, timestamps, run id and dedup fields when unchanged; bumps the revision when content changes", () => {
    const [v] = first();
    const prev = { ...variantRecord(BASE, v, { curriculum: CURRICULUM, runId: "run-20260927-var-01", now: "2026-09-27T08:00:00Z" }), status: "published", dedup: { class: "UNIQUE", cluster_id: null, exclusion_group: "xg-0123456789" } };
    const same = variantRecord(BASE, v, { curriculum: CURRICULUM, runId: RUN, now: NOW, previous: prev });
    expect(same).toEqual(prev);
    const t2 = tpl({ explanation: { text: "حاصل الضرب.", steps: ["{a} × {b} = {ans}"] } });
    const [v2] = generateVariants(t2, { limit: 1 }).variants;
    expect(v2.params).toEqual(v.params);
    const changed = variantRecord(t2, v2, { curriculum: CURRICULUM, runId: RUN, now: NOW, previous: prev });
    expect(changed).toMatchObject({ revision: 2, created_at: prev.created_at, updated_at: NOW, status: "validated", validation: { checked_revision: 2 }, dedup: { class: null, cluster_id: null, exclusion_group: null } });
  });
});

describe("build-variants.mjs over a staging tree", () => {
  let work;
  let B;
  let V;
  beforeAll(async () => {
    work = mkdtempSync(join(tmpdir(), "jz-variants-"));
    B = await import("../../scripts/content/build-variants.mjs");
    V = await import("../../scripts/content/validate-staging.mjs");
  });
  afterAll(() => rmSync(work, { recursive: true, force: true }));
  const validate = (root, extra = {}) => V.validateStaging({ root, runtimeDir: null, registryBaseline: null, imageRoots: [], ...extra });
  const read = (root, rel) => readFileSync(join(root, rel), "utf8").trim().split("\n").map((l) => JSON.parse(l));

  it("materializes every variant, keeps the tree valid and rewrites nothing on a rerun", async () => {
    const root = join(work, "a");
    cpSync(FIXTURE, root, { recursive: true });
    const r = B.runBuild({ root, runId: RUN, now: NOW });
    expect(r.errors).toEqual([]);
    expect(r.counts).toMatchObject({ templates: 1, variants: 12, shortfall: 0, invalid_templates: 0 });
    const recs = read(root, VARIANT_FILE);
    expect(recs.map((q) => q.id)).toEqual(Array.from({ length: 12 }, (_, i) => variantId(BASE.id, i + 1)).sort());
    expect(recs.every((q) => q.curriculum.unit === "middle/grade-1/math/n92" && q.curriculum.term === "t2")).toBe(true);
    const manifest = JSON.parse(readFileSync(join(root, `validation/runs/${RUN}.json`), "utf8"));
    expect(manifest).toMatchObject({ schema: "run-manifest@1", run_id: RUN, kind: "var", counts: { variants: 12 } });
    expect(manifest.templates[0]).toMatchObject({ template_id: BASE.id, produced: 12, shortfall: 0 });
    await validate(root, { writeManifest: true });
    expect((await validate(root)).errors).toEqual([]);
    const again = B.runBuild({ root, runId: RUN, now: NOW });
    expect(again.written).toEqual([]);
    const later = B.runBuild({ root, runId: "run-20260929-var-01", now: "2026-09-29T08:00:00Z" });
    expect(later.written).toEqual(["validation/runs/run-20260929-var-01.json"]);
    expect(read(root, VARIANT_FILE)).toEqual(recs);
  });

  it("drops the variants of a retired template and reports an invalid one", async () => {
    const root = join(work, "b");
    cpSync(FIXTURE, root, { recursive: true });
    writeFileSync(join(root, TEMPLATE_FILE), S.stringifyRecord("question-template", { ...BASE, status: "retired" }) + "\n");
    const r = B.runBuild({ root, runId: RUN, now: NOW });
    expect(r.counts.variants).toBe(0);
    expect(r.removed).toEqual([VARIANT_FILE]);
    expect(existsSync(join(root, VARIANT_FILE))).toBe(false);
    writeFileSync(join(root, TEMPLATE_FILE), S.stringifyRecord("question-template", { ...BASE, lesson_node_id: "middle/grade-1/math/n999999" }) + "\n");
    const bad = B.runBuild({ root, runId: "run-20260928-var-02", now: NOW });
    expect(bad.errors).toEqual([expect.objectContaining({ template_id: BASE.id, problems: [expect.objectContaining({ code: "bad_lesson" })] })]);
    const quiet = { log: () => {}, error: () => {} };
    expect(await B.main(["--root", root, "--run", "run-20260928-var-03", "--now", NOW], quiet)).toBe(1);
    expect(await B.main(["--bogus"], quiet)).toBe(2);
    expect(await B.main(["--now", "yesterday"], quiet)).toBe(2);
  });

  it("--only rebuilds one template and keeps the other templates' variants", () => {
    const root = join(work, "c");
    cpSync(FIXTURE, root, { recursive: true });
    const other = { ...BASE, id: "t-m1-math-00000000ff", stem: "ما ناتج جمع {a} و{b}؟", answer: { expr: "a+b", format: "int" }, distractors: [{ expr: "a*b + 50", why: "ضرب بدل الجمع" }], explanation: { text: "", steps: ["{a} + {b} = {ans}"] }, max_variants: 4 };
    writeFileSync(join(root, TEMPLATE_FILE), [BASE, other].map((t) => S.stringifyRecord("question-template", t)).join("\n") + "\n");
    B.runBuild({ root, runId: RUN, now: NOW });
    expect(read(root, VARIANT_FILE)).toHaveLength(16);
    writeFileSync(join(root, TEMPLATE_FILE), [BASE, { ...other, max_variants: 2, revision: 2 }].map((t) => S.stringifyRecord("question-template", t)).join("\n") + "\n");
    const r = B.runBuild({ root, runId: "run-20260928-var-02", now: NOW, only: other.id });
    expect(r.counts.processed).toBe(1);
    const recs = read(root, VARIANT_FILE);
    expect(recs.filter((q) => q.variant.template_id === BASE.id)).toHaveLength(12);
    expect(recs.filter((q) => q.variant.template_id === other.id)).toHaveLength(2);
    expect(() => B.runBuild({ root, runId: "run-20260928-var-03", now: NOW, only: "t-m1-math-0000000000" })).toThrow(/not found/);
  });
});

// ── verifier regressions ────────────────────────────────────────────────────
describe("verifier regressions — numeric keys, rounded answers, stale validation, failing templates", () => {
  const CHECKS = import("../../scripts/content/lib/checks.mjs");
  const numericTpl = (over) =>
    tpl({ id: "t-m1-math-000000a001", question_type: "numeric", item_style: "computation", constraints: [], distractors: [], max_variants: 6, ...over });

  it("never emits a schema-invalid numeric key: a non-terminating fraction is skipped (answer_not_decimal)", () => {
    const t = numericTpl({
      params: { a: { type: "int", min: 1, max: 6 }, b: { type: "int", min: 7, max: 8 } },
      stem: "ما ناتج قسمة {a} على {b}؟",
      answer: { expr: "frac(a, b)", format: "fraction" },
      explanation: { text: "", steps: ["{a} ÷ {b} = {ans}"] },
    });
    const r = generateVariants(t);
    expect(r.variants.length).toBeGreaterThan(0);
    expect(r.stats.check_failures.answer_not_decimal).toBeGreaterThan(0);
    for (const v of r.variants) {
      expect(v.params.b).toBe(8); // 1/7 … 6/7 never terminate
      const rec = variantRecord(t, v, { curriculum: CURRICULUM, runId: RUN, now: NOW });
      expect(S.validateRecord("question", rec).errors).toEqual([]);
      expect(gradeResponse("numeric", rec.payload, { value: `${v.params.a}/${v.params.b}` }).score).toBe(1);
    }
    const one = instantiate(t, { a: 2, b: 7 });
    expect(one).toMatchObject({ ok: false, code: "answer_not_decimal" });
  });

  it("rejects the mixed format for numeric templates (the grader cannot read «3 1/3»)", () => {
    const t = numericTpl({ params: { a: { type: "int", min: 7, max: 11 } }, stem: "ما ناتج {a} ÷ 3؟", answer: { expr: "frac(a, 3)", format: "mixed" }, explanation: { text: "", steps: ["{a} ÷ 3 = {ans}"] } });
    expect(checkTemplate(t).map((e) => e.code)).toContain("bad_format");
    expect(checkTemplate({ ...t, question_type: "mcq", distractors: [{ expr: "a*3", why: "ضرب" }] }).map((e) => e.code)).not.toContain("bad_format");
    expect(checkTemplate({ ...t, params: { ...t.params, exact: { type: "int", min: 1, max: 2 } } }).map((e) => e.code)).toContain("bad_param");
  });

  it("a rounded or mixed answer needs one step with both the shown answer and the exact value ({exact}), as P006 does", async () => {
    const { runCheck } = await CHECKS;
    const base = {
      params: { d: { type: "int", min: 1, max: 30 }, t: { type: "choice", values: [3, 6, 7] } },
      stem: "قطع عدّاء {d} كم في {t} ساعات. ما متوسط سرعته بالكيلومتر لكل ساعة؟",
      answer: { expr: "d/t", format: "decimal:2" },
      max_variants: 8,
    };
    const bare = numericTpl({ ...base, explanation: { text: "", steps: ["{d} ÷ {t} = {ans}"] } });
    const withExact = numericTpl({ ...base, explanation: { text: "", steps: ["{d} ÷ {t} = {exact} ≈ {ans}"] } });
    expect(instantiate(bare, { d: 1, t: 3 })).toMatchObject({ ok: false, code: "explanation_missing_exact" });
    expect(instantiate(bare, { d: 6, t: 3 })).toMatchObject({ ok: true }); // 2 is exact: no {exact} needed
    const ok = instantiate(withExact, { d: 1, t: 3 });
    expect(ok.ok).toBe(true);
    expect(ok.explanation.steps).toEqual(["1 ÷ 3 = 1/3 ≈ 0.33"]);
    expect(ok.payload.answer).toEqual({ value: "0.33", tolerance: { kind: "abs", value: "0.005" } });
    for (const v of generateVariants(withExact).variants) {
      const rec = variantRecord(withExact, v, { curriculum: CURRICULUM, runId: RUN, now: NOW });
      expect(runCheck("P006", rec).result, rec.explanation.steps[0]).toBe("pass");
      expect(runCheck("N002", rec).result).toBe("pass");
    }
    // mcq with the mixed format
    const mixed = tpl({ id: "t-m1-math-000000a002", params: { a: { type: "int", min: 7, max: 11 } }, constraints: [], stem: "ما ناتج {a} ÷ 3 في صورة عدد كسري؟", answer: { expr: "frac(a, 3)", format: "mixed" }, distractors: [{ expr: "a*3", why: "ضرب" }, { expr: "a+3", why: "جمع" }], explanation: { text: "", steps: ["{a} ÷ 3 = {exact} = {ans}"] } });
    for (const v of generateVariants(mixed).variants) {
      const rec = variantRecord(mixed, v, { curriculum: CURRICULUM, runId: RUN, now: NOW });
      expect(runCheck("P006", rec).result, rec.explanation.steps[0]).toBe("pass");
    }
  });

  it("variants inherit `validated` only from a validation of the current template revision", () => {
    const [v] = previewInstances(BASE, 1);
    expect(variantRecord(BASE, v, { curriculum: CURRICULUM, runId: RUN, now: NOW }).status).toBe("validated");
    const edited = { ...BASE, revision: 2 }; // validation.checked_revision is still 1
    const [v2] = previewInstances(edited, 1);
    const rec = variantRecord(edited, v2, { curriculum: CURRICULUM, runId: RUN, now: NOW });
    expect(rec.status).toBe("candidate");
    expect(rec.validation).toEqual({ status: "pending", record_ids: [], checked_revision: null });
  });

  it("build-variants: a template that fails keeps its earlier variants and the others still build; constant answer positions are flagged", async () => {
    const B = await import("../../scripts/content/build-variants.mjs");
    const root = mkdtempSync(join(tmpdir(), "jz-variants-reg-"));
    try {
      cpSync(FIXTURE, root, { recursive: true });
      const other = { ...BASE, id: "t-m1-math-00000000ff", stem: "ما ناتج جمع {a} و{b}؟", answer: { expr: "a+b", format: "int" }, distractors: [{ expr: "a*b + 500", why: "ضرب بدل الجمع" }], explanation: { text: "", steps: ["{a} + {b} = {ans}"] }, max_variants: 4 };
      const write = (list) => writeFileSync(join(root, TEMPLATE_FILE), list.map((t) => S.stringifyRecord("question-template", t)).join("\n") + "\n");
      write([BASE, other]);
      const first = B.runBuild({ root, runId: RUN, now: NOW });
      expect(first.errors).toEqual([]);
      // a+b < a*b+500 always: the answer is always option 1
      expect(first.manifest.templates.find((r) => r.template_id === other.id).warnings).toEqual([expect.objectContaining({ code: "answer_position_constant" })]);
      expect(first.counts.warnings).toBeGreaterThanOrEqual(1);
      const before = readFileSync(join(root, VARIANT_FILE), "utf8");
      // almost every value excluded: sampling throws a TemplateError at generation time
      const unsampleable = { ...BASE, revision: 2, params: { ...BASE.params, a: { type: "int", min: 1, max: 5000, exclude: Array.from({ length: 4999 }, (_, i) => i + 2) } } };
      write([unsampleable, other]);
      const r = B.runBuild({ root, runId: "run-20260928-var-02", now: NOW });
      expect(r.errors).toEqual([expect.objectContaining({ template_id: BASE.id })]);
      expect(r.manifest.templates.find((x) => x.template_id === BASE.id)).toMatchObject({ produced: 0, skipped: "failed" });
      expect(readFileSync(join(root, VARIANT_FILE), "utf8")).toBe(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
