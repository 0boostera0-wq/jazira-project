// WP10 — reports and the data-quality dashboard (docs/CONTENT_ENGINE.md §8,
// §5.6, §9.3): every number equals a hand count on the fixture tree under the
// §8 counting rules; gaps are listed; Term 1 / Term 2 follow
// subject-terms.jsonl; the HTML makes no external request and renders in RTL
// and LTR; exam-template figures come from combinatorics.js with lower-bound
// flags; sessions are never summed into question totals.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  COUNTING_RULES, FULL_BANK_LABEL, REPORT_FILES, addFigures, assertNoCrossTotals, blueprintRecord, buildBlueprints, buildCoverage,
  buildDuplicates, buildQuality, buildQuestionBank, buildQuestionStats, buildReportModel, buildResources, buildValidation,
  canonicalIdsOf, componentCount, coverageContext, loadReportData, manifestStatus, questionTotals,
} from "../../scripts/content/lib/report-model.mjs";
import { escapeHtml, renderQualityHtml } from "../../scripts/content/lib/report-html.mjs";
import {
  RENDERERS, figureText, main, mdCell, mdTable, parseArgs, recordedTime, renderCoverageMd, renderExamTemplatesMd, UsageError,
} from "../../scripts/content/report.mjs";
import { validateRecord } from "../../scripts/content/lib/schemas.mjs";
import { validateStaging } from "../../scripts/content/validate-staging.mjs";
import { blueprint } from "@/lib/exams/engine/combinatorics.js";
import { TEMPLATES, getTemplate } from "@/lib/exams/engine/exam-templates.js";

const REPO = resolve(__dirname, "../..");
const FIXTURE = join(REPO, "tests/fixtures/content/staging");
const T0 = "2026-09-30T10:05:00Z";
const MATH = "middle/grade-1/math";
const quiet = { log: () => {}, error: () => {} };

let data;
let model;
beforeAll(async () => {
  data = loadReportData(FIXTURE);
  model = await buildReportModel(data, { generatedAt: T0, repoRoot: REPO });
});

/** A fresh copy of the fixture data (the tests mutate it in memory only). */
const freshData = () => loadReportData(FIXTURE);

// ── counting rules (§8) against hand counts ────────────────────────────────
describe("quality totals equal hand counts on the fixture tree", () => {
  it("counts sources, PDFs, pages, lessons and questions by the §8 rules", () => {
    const t = model.quality.totals;
    expect(t.sources).toBe(4); // registry.json rows
    expect(t.pdfs).toEqual({ total: 2, by_availability: { external_official: 2 }, by_extraction: { frontmatter_done: 1, not_started: 1 } });
    // 5 page-map rows: 4 text + 1 vision, all of a front-matter-only resource; page_count 183 is never "processed"
    expect(t.pages_processed).toEqual({ total: 5, text: 4, vision: 1, front_matter_only: 5 });
    expect(t.lessons).toEqual({ total: 7, verified: 5, needs_review: 2 });
    expect(t.candidates).toBe(10); // 7 math + 1 prep + 2 variants
    expect(t.validated).toBe(9); // all but the review_required rewrite
    expect(t.published).toBe(9);
    expect(t.review_required).toBe(1);
    expect(t.rejected).toBe(0);
    expect(t.exact_duplicates).toBe(0);
    expect(t.near_duplicates).toBe(0);
    expect(t.variants).toBe(2); // the two published template variants; the rewrite is not published
    expect(t.canonical).toBe(7); // 6 published math + av-901; variants are never canonical
    expect(t.exam_templates.defined).toBe(TEMPLATES.length);
  });

  it("canonical requires UNIQUE or cluster canonical; variants never count as canonical", () => {
    const qs = data.questions.map((x) => x.q);
    const noClass = qs.map((q) => ({ ...q, dedup: { ...q.dedup, class: null } }));
    // without a dedup class only the cluster canonical (fa3093174f) stays canonical
    expect(questionTotals(noClass, canonicalIdsOf(data.clusters)).canonical).toBe(1);
    expect(questionTotals(noClass, new Set()).canonical).toBe(0);
    const rewrite = qs.find((q) => q.id === "q-m1-math-a0fd3d5106");
    const published = { ...rewrite, status: "published" };
    const t = questionTotals([published], canonicalIdsOf(data.clusters));
    expect(t).toMatchObject({ published: 1, variants: 1, canonical: 0, related: 1 });
  });

  it("breaks the totals down by stage, grade, term, subject and chapter", () => {
    const b = model.quality.breakdowns;
    expect(Object.keys(b)).toEqual(["stage", "grade", "term", "subject", "chapter"]);
    const row = (dim, key) => b[dim].find((r) => r.key === key);
    expect(row("stage", "middle")).toMatchObject({ lessons: 7, candidates: 9, published: 8, variants: 2, canonical: 6, review_required: 1 });
    expect(row("stage", "prep")).toMatchObject({ lessons: 0, candidates: 1, published: 1, canonical: 1 });
    expect(row("term", "t1")).toMatchObject({ lessons: 4, candidates: 5, published: 4, review_required: 1 });
    expect(row("term", "t2")).toMatchObject({ lessons: 3, candidates: 4, published: 4, variants: 2 });
    expect(row("subject", MATH)).toMatchObject({ title_ar: "الرياضيات", lessons: 7, candidates: 9 });
    expect(row("chapter", `${MATH}/n91`)).toMatchObject({ lessons: 4, candidates: 5 });
    expect(row("chapter", `${MATH}/n92`)).toMatchObject({ lessons: 3, candidates: 4 });
    // the breakdown is a partition: its rows add up to the totals
    for (const dim of Object.keys(b)) {
      expect(b[dim].reduce((s, r) => s + r.candidates, 0)).toBe(10);
      expect(b[dim].reduce((s, r) => s + r.lessons, 0)).toBe(7);
    }
  });

  it("never adds exam sessions to question totals", async () => {
    const withoutExams = buildQuality(data, { rows: [], empty_scopes: {}, invalid_scopes: [] }, canonicalIdsOf(data.clusters));
    const { exam_templates: a, ...restA } = model.quality.totals;
    const { exam_templates: b, ...restB } = withoutExams.totals;
    expect(restA).toEqual(restB);
    expect(b.template_scope_pairs_offered).toBe(0);
    expect(a.template_scope_pairs_offered).toBe(model.blueprints.rows.filter((r) => r.offered).length);
    const keys = JSON.stringify(model.quality) + JSON.stringify(model.coverage);
    expect(keys).not.toMatch(/sets_by_component|sets_with_variants|display_permutations|session/);
  });

  it("states the counting rules at the top of every report", () => {
    for (const name of REPORT_FILES) {
      const text = RENDERERS[name](model);
      const firstRule = COUNTING_RULES[0];
      expect(text).toContain(firstRule);
      if (name.endsWith(".md")) {
        expect(text.startsWith("# ")).toBe(true);
        // the header (time, manifest, every rule) ends before the first section or table
        const body = Math.min(...["\n## ", "\n| "].map((s) => text.indexOf(s)).filter((i) => i >= 0));
        expect(Number.isFinite(body)).toBe(true);
        expect(text.indexOf("Counting rules")).toBeLessThan(body);
        expect(text.indexOf(COUNTING_RULES[COUNTING_RULES.length - 1])).toBeLessThan(body);
        expect(text).toContain(`Generated: ${T0}`);
        expect(text).toContain(model.meta.manifest_sha256);
      }
    }
  });
});

// ── coverage (§8): term bucket first, Term 1 / Term 2 per subject-terms, gaps ─
describe("coverage", () => {
  it("reports front-matter coverage as n/315 and the latest crawl changes", () => {
    expect(model.coverage.frontmatter).toEqual({ done: 1, failed: 0, total: 315 });
    expect(model.coverage.changes).toEqual({ file: "sources/ien/changes-2026-09-26.jsonl", rows: 1, by: { "book:edition_mismatch": 1 } });
  });

  it("lists a subject under Term 1 and Term 2 only per subject-terms.jsonl, with per-term figures", () => {
    const leaf = model.coverage.leaves.find((l) => l.id === "middle/grade-1");
    expect(leaf.terms.t1.map((r) => [r.id, r.membership])).toEqual([[MATH, "inferred"]]);
    expect(leaf.terms.t2.map((r) => [r.id, r.membership])).toEqual([[MATH, "inferred"]]);
    expect(leaf.terms.undeterminable).toEqual([]);
    const t1 = leaf.terms.t1[0].figures;
    const t2 = leaf.terms.t2[0].figures;
    expect([t1.units, t1.lessons]).toEqual([1, { total: 4, verified: 3, needs_review: 1, other: 0 }]);
    expect([t2.units, t2.lessons]).toEqual([1, { total: 3, verified: 2, needs_review: 1, other: 0 }]);
    expect(t1.pdfs).toMatchObject({ total: 1, available: 1 });
    expect(t1.pages_processed).toEqual({ total: 5, text: 4, vision: 1, front_matter_only: 5 });
    expect(t2.pages_processed.total).toBe(0);
    expect(t1.questions).toEqual({ published: 4, variants: 0 });
    expect(t2.questions).toEqual({ published: 4, variants: 2 });
    expect(t1.exercises).toEqual({ rows: 2, lessons_with: 1 });
    // whole-subject figures: units 2, lessons 7, 8 published curriculum questions
    const whole = leaf.subjects.find((s) => s.id === MATH).figures;
    expect(whole).toMatchObject({ units: 2, lessons: { total: 7, verified: 5, needs_review: 2, other: 0 }, questions: { published: 8, variants: 2 } });
    expect(whole.templates_offered).toEqual({ "practice@1": 2, "random-practice@1": 2, "timed@1": 2 });
    expect(model.coverage.totals).toEqual(leaf.totals);
  });

  it("puts subjects without verified or inferred membership into the term-undeterminable bucket", () => {
    const d = freshData();
    d.subjectTerms = d.subjectTerms.map((r) => (r.term === "t2" ? { ...r, status: "needs_review" } : r));
    const science = { ...d.nodes.get(MATH), id: "middle/grade-1/science", subject: "middle/grade-1/science", order: 2, title_ar: "العلوم", title_en: "Science", source_refs: [] };
    d.nodes.set(science.id, science);
    d.nodes.set("middle/grade-1/ien-999", { ...science, id: "middle/grade-1/ien-999", subject: "middle/grade-1/ien-999", status: "source_only", order: 3 });
    d.resources = d.resources.map((r) => (r.id === "ien-121391" ? { ...r, term: null, term_status: "needs_review", term_evidence: [] } : r));
    const bp = { rows: [], empty_scopes: {}, invalid_scopes: [] };
    const c = buildCoverage(d, bp);
    const leaf = c.leaves[0];
    expect(leaf.terms.t1.map((r) => r.id)).toEqual([MATH]);
    expect(leaf.terms.t2.map((r) => r.id)).toEqual([]); // needs_review is not membership
    expect(leaf.terms.undeterminable).toEqual(["middle/grade-1/science"]);
    expect(c.term_undeterminable.subjects).toEqual({ count: 1, ids: ["middle/grade-1/science"] });
    expect(c.term_undeterminable.subjects_partial).toEqual({ count: 1, ids: [MATH] });
    expect(c.term_undeterminable.resources.count).toBe(1);
    expect(c.term_undeterminable.resources.ids).toEqual(["ien-121391"]);
    // tried: the listing title and the owner decision covering math; no front matter, TOC or vision for part 2
    expect(c.term_undeterminable.resources.routes_tried).toMatchObject({ listing_title: 1, owner_decision: 1, cover_text: 0, toc_marker: 0, vision: 0 });
    expect(c.term_undeterminable.resources.evidence_found.owner_decision).toBe(1); // the conflicting/insufficient hit is still counted
    expect(c.gaps.subjects_without_books).toEqual(["middle/grade-1/science"]);
    expect(c.gaps.source_only_subjects).toEqual(["middle/grade-1/ien-999"]);
    expect(leaf.subjects.map((s) => s.id)).not.toContain("middle/grade-1/ien-999"); // source-only subjects are not in the catalog view
  });

  it("lists the gaps: lessons without pages or exercises, below the lesson-quiz minimum, pages awaiting vision", () => {
    const g = model.coverage.gaps;
    expect(g.subjects_without_books).toEqual([]);
    expect(g.lessons_without_pages).toEqual([`${MATH}/n61`, `${MATH}/n62`, `${MATH}/x5a3afdd4`]);
    expect(g.lessons_without_exercises).toEqual([`${MATH}/n53`, `${MATH}/n55`, `${MATH}/n61`, `${MATH}/n62`, `${MATH}/x5a3afdd4`, `${MATH}/xb321f898`]);
    expect(g.lessons_below_lesson_quiz_min).toEqual({
      template: "lesson-quiz@1",
      required: 3,
      lessons: [
        { id: `${MATH}/n53`, components: 1 },
        { id: `${MATH}/n54`, components: 2 }, // fa3093174f + d02dedd49d (the rewrite is not published)
        { id: `${MATH}/n55`, components: 1 },
        { id: `${MATH}/n61`, components: 2 }, // 0979d559d5 + the template-variant component
        { id: `${MATH}/n62`, components: 1 },
      ],
    });
    expect(g.pages_awaiting_vision).toEqual([]); // the untrusted TOC page was read by vision
    const d = freshData();
    d.bank.pageMaps.get("ien-120607").set(2, { ...d.bank.pageMaps.get("ien-120607").get(2), text_quality: "untrusted" });
    const c = buildCoverage(d, model.blueprints);
    expect(c.gaps.pages_awaiting_vision).toEqual([{ resource_id: "ien-120607", pdf_page: 2 }]);
    expect(model.coverage.exercises_by_lesson).toEqual({ [`${MATH}/n54`]: { example: 1, exercise: 1, review: 0, answer_key: 0 } });
  });

  it("renders the term-undeterminable bucket first, then front matter, the hierarchy and the gaps", () => {
    const md = renderCoverageMd(model);
    const at = (s) => md.indexOf(s);
    expect(at("## Term undeterminable")).toBeGreaterThan(0);
    expect(at("## Term undeterminable")).toBeLessThan(at("## Front-matter coverage"));
    expect(at("## Front-matter coverage")).toBeLessThan(at("## Stage `middle`"));
    expect(at("#### Term 1")).toBeLessThan(at("#### Term 2"));
    expect(at("#### Term 2")).toBeLessThan(at("#### Term undeterminable"));
    expect(at("## Gaps")).toBeGreaterThan(at("#### Term undeterminable"));
    expect(md).toContain("**1/315**");
    expect(md).toContain("### Lessons without pages (3)");
    expect(md).toContain("- `middle/grade-1/math/n61`");
    expect(md).toContain("### Lessons with fewer than the lesson-quiz minimum (5;");
  });

  it("sums figures of disjoint subjects without mutating them", () => {
    const a = { units: 1, pdfs: { total: 1, extraction: { full_done: 1 } }, templates_offered: { "x@1": 1 } };
    const b = { units: 2, pdfs: { total: 3, extraction: { failed: 1 } }, templates_offered: {} };
    expect(addFigures(a, b)).toEqual({ units: 3, pdfs: { total: 4, extraction: { full_done: 1, failed: 1 } }, templates_offered: { "x@1": 1 } });
    expect(a.units).toBe(1);
  });
});

// ── exam templates (§5.6): figures from combinatorics.js, per template × scope ─
describe("exam blueprints and exam-templates.md", () => {
  it("takes every figure from combinatorics.blueprint() and records tier offers", () => {
    const row = model.blueprints.rows.find((r) => r.scope === MATH && r.template === "practice@1");
    expect(row).toBeTruthy();
    const pool = [];
    const units = { n53: "n91", n54: "n91", n55: "n91", n61: "n92", n62: "n92" };
    for (const { q } of data.questions) {
      if (q.status !== "published" || q.scope !== "curriculum") continue;
      const l = q.curriculum.lesson;
      pool.push({ key: q.id, band: q.difficulty_band, component: q.dedup.exclusion_group, type: q.question_type, stimulus: q.stimulus_id, premium: false, revision: q.revision, objective: q.objective_id, lesson: l, unit: `${MATH}/${units[l.split("/").pop()]}`, chapter: null, term: q.curriculum.term, topic: null });
    }
    const direct = blueprint({ template: getTemplate("practice"), pool });
    expect(row.pool).toEqual({ items: 8, questions: 6, variants: 2, components: 7, premium_excluded: 0 });
    expect(row.offered).toBe(true);
    expect(row.sets_by_component).toEqual(direct.sets_by_component);
    expect(row.sets_with_variants).toEqual(direct.sets_with_variants);
    expect(row.attempts_before_reuse).toBe(direct.attempts_before_reuse);
    expect(row.allocation).toEqual(direct.allocation);
    expect(row.lower_bound).toBe(direct.lower_bound);
    expect(typeof row.lower_bound).toBe("boolean");
    // 7 components, 10 requested: every component is used once; the variant pair doubles the with-variants count
    expect([row.selected, row.short, row.sets_by_component.exact, row.sets_with_variants.exact, row.attempts_before_reuse]).toEqual([7, true, "1", "2", 1]);
    expect(row.tiers.guest).toEqual({ offered: true, mini: false, reason: null, required: 5 });
    const stage = model.blueprints.rows.find((r) => r.scope === "middle" && r.template === "practice@1");
    expect(stage.tiers.guest).toMatchObject({ offered: false, reason: "scope_too_large" }); // §5.3 guest caps
    expect(stage.tiers.premium.offered).toBe(true);
  });

  it("refuses scopes with an insufficient pool and blueprints no weak: scope", () => {
    const n54 = model.blueprints.rows.find((r) => r.scope === `${MATH}/n54` && r.template === "lesson-quiz@1");
    expect(n54).toMatchObject({ offered: false, reason: "insufficient_pool", available: 2, required: 3, sets_by_component: null, lower_bound: null });
    const termExam = model.blueprints.rows.find((r) => r.scope === `${MATH}@t1` && r.template === "term-exam@1");
    expect(termExam).toMatchObject({ offered: false, pool: { components: 4 } }); // t1 lessons only (verified/inferred)
    const fullYear = model.blueprints.rows.find((r) => r.scope === `${MATH}@year` && r.template === "full-year@1");
    expect(fullYear.tiers.free).toMatchObject({ offered: false, mini: true, required: 25 });
    expect(model.blueprints.rows.some((r) => r.template.startsWith("weakness-review"))).toBe(false);
    expect(model.blueprints.rows.filter((r) => r.offered).map((r) => `${r.scope} ${r.template}`)).toEqual([
      "middle practice@1", "middle random-practice@1", "middle timed@1",
      "middle/grade-1 practice@1", "middle/grade-1 random-practice@1", "middle/grade-1 timed@1",
      `${MATH} practice@1`, `${MATH} random-practice@1`, `${MATH} timed@1`,
      `${MATH}@year practice@1`, `${MATH}@year random-practice@1`, `${MATH}@year timed@1`,
    ]);
    expect(model.blueprints.invalid_scopes).toEqual([]);
  });

  it("flags a lower bound when the coverage pre-pass picks a stratum subset", () => {
    const template = getTemplate("chapter-quiz"); // 15 questions, stratified by lesson
    const eligible = Array.from({ length: 20 }, (_, i) => ({
      key: `q-m1-math-${String(i).padStart(10, "0")}`, band: (i % 3) + 1, component: null, type: "mcq", stimulus: null, premium: false, revision: 1,
      objective: null, variant: false, lesson: `${MATH}/n${100 + i}`, unit: `${MATH}/n91`, chapter: null, term: "t1", topic: null,
    }));
    const rec = blueprintRecord({ template, scope: `${MATH}/n91`, kind: "unit", stage: "middle", subject: MATH, eligible });
    expect(rec.offered).toBe(true);
    expect(rec.lower_bound).toBe(true);
    expect(rec.sets_by_component).toEqual(blueprint({ template, pool: eligible }).sets_by_component);
    expect(rec.attempts_before_reuse).toBe(1);
  });

  it("writes schema-valid exam-blueprint@1 records", () => {
    for (const r of model.blueprints.rows) expect(validateRecord("exam-blueprint", r)).toEqual({ ok: true, errors: [] });
  });

  it("never totals figures across templates or overlapping scopes (asserted)", () => {
    expect(assertNoCrossTotals(model.examTemplates)).toBe(true);
    const doctored = structuredClone(model.examTemplates);
    doctored.templates[0].sets_by_component = { exact: "1", log10: 0 };
    expect(() => assertNoCrossTotals(doctored)).toThrow(/outside a template × scope row/);
    expect(() => assertNoCrossTotals({ total: { sets_with_variants: { exact: "9" } } })).toThrow();
    const md = renderExamTemplatesMd(model);
    expect(md).not.toMatch(/^\|[^\n]*\btotal\b/im); // no table header or row carries a total
    expect(md).toContain("attempts before forced reuse");
    expect(md).toContain("Display permutations");
    for (const t of model.examTemplates.templates) expect(md).toContain(`## \`${t.ref}\``);
  });

  it("prints long figures as powers of ten and short ones exactly", () => {
    expect(figureText({ exact: "29400", log10: 4.468347 })).toBe("29400 (log10 4.468347)");
    expect(figureText({ exact: "1".repeat(40), log10: 39.045757 })).toBe("≈ 10^39.045757");
    expect(figureText(null)).toBe("—");
  });

  it("builds blueprints deterministically", async () => {
    const again = await buildBlueprints(freshData());
    expect(again).toEqual(model.blueprints);
  });
});

// ── the dashboard (§8 quality.html) ─────────────────────────────────────────
describe("quality.html", () => {
  let html;
  beforeAll(() => {
    html = renderQualityHtml(model);
  });

  it("is self-contained: no external request of any kind", () => {
    expect(html).not.toMatch(/https?:\/\//i);
    expect(html).not.toMatch(/\s(?:src|href)\s*=/i);
    expect(html).not.toMatch(/<link\b|<img\b|<iframe\b|@import|url\(/i);
    expect(html).not.toMatch(/\bfetch\(|XMLHttpRequest|import\(/);
    expect(html).toContain(`content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"`);
    expect(html.match(/<script\b[^>]*>/g)).toEqual(['<script type="application/json" id="report-data">', "<script>"]);
  });

  it("renders RTL (Arabic) by default with an LTR (English) toggle and light and dark themes", () => {
    expect(html.startsWith(`<!doctype html>\n<html lang="ar" dir="rtl" data-generated="${T0}">`)).toBe(true);
    expect(html).toContain('id="toggle-lang"');
    expect(html).toContain('id="toggle-theme"');
    expect(html).toContain('root.dir=lang==="ar"?"rtl":"ltr"');
    expect(html).toContain("@media (prefers-color-scheme: dark)");
    expect(html).toContain(':root[data-theme="dark"]');
    const spans = html.match(/<span class="t"[^>]*>/g);
    expect(spans.length).toBeGreaterThan(20);
    for (const s of spans) expect(s).toMatch(/data-ar="[^"]*" data-en="[^"]*"/);
    expect(html).toContain('data-ar="الإجماليات" data-en="Totals"');
  });

  it("embeds the totals and renders the numbers and sortable breakdown tables", () => {
    const json = JSON.parse(html.match(/<script type="application\/json" id="report-data">([^<]*)<\/script>/)[1]);
    expect(json.totals).toEqual(model.quality.totals);
    expect(json.meta.generated_at).toBe(T0);
    for (const dim of ["stage", "grade", "term", "subject", "chapter"]) expect(html).toContain(`<section aria-labelledby="h-${dim}">`);
    expect(html.match(/<table data-sortable>/g).length).toBe(5);
    expect(html).toContain('<div class="v">10</div>'); // candidates card
    expect(html).toContain('<code dir="ltr">middle/grade-1/math</code>');
  });

  it("escapes every data string", () => {
    const m = structuredClone(model);
    m.quality.breakdowns.subject[0].title_ar = '<script>alert("x")</script>';
    const out = renderQualityHtml(m);
    expect(out).not.toContain('<script>alert("x")</script>');
    expect(out).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(escapeHtml(`a&b<'"`)).toBe("a&amp;b&lt;&#39;&quot;");
  });
});

// ── validation.md (§8): per run and cumulative, sampling, review queue, legacy ─
describe("validation report", () => {
  it("counts records per run, role and agent, verdicts and disagreements", () => {
    const v = model.validation;
    // 8 deterministic (check-01) + 8 primary (val-01) records: 7 math items + av-901
    expect(v.cumulative.records).toBe(16);
    expect(v.cumulative.by_role_agent).toEqual([
      { role: "deterministic", agent: "script", items: 8, records: 8 },
      { role: "primary", agent: "claude_subagent", items: 8, records: 8 },
    ]);
    expect(v.cumulative.verdicts).toEqual({ deterministic: { pass: 8 }, primary: { disagree: 1, pass: 7 } });
    expect(v.cumulative.disagreements).toEqual({ primary: 1 });
    expect(v.cumulative.top_fail_codes).toEqual([]);
    expect(v.runs.map((r) => [r.run_id, r.kind, r.records])).toEqual([
      ["run-20260928-check-01", "check", 8],
      ["run-20260928-val-01", "val", 8],
    ]);
    expect(v.agents_unavailable).toEqual([{ agent: "deepseek", runs: ["run-20260927-gen-01"] }]);
  });

  it("reports the review queue size and age, human decisions and the legacy section", () => {
    const q = model.validation.review_queue;
    expect(q).toEqual({
      size: 1,
      by_reason: { primary_disagree: 1 },
      oldest_queued_at: "2026-09-28T10:05:00Z",
      newest_queued_at: "2026-09-28T10:05:00Z",
      max_age_days: 2, // queued 2026-09-28T10:05Z, generated 2026-09-30T10:05Z
      median_age_days: 2,
      decisions: { repair: 1 },
    });
    expect(model.validation.legacy).toEqual({ items: 1, by_validation_status: { validated: 1 }, by_status: { published: 1 } }); // av-901
  });

  it("compares sample sizes with the seeded sampling policy of a run manifest", () => {
    const d = freshData();
    const seed = "0123456789abcdef0123456789abcdef";
    d.runs = [...d.runs, { schema: "run-manifest@1", run_id: "run-20260929-xval-01", kind: "xval", sampling: { seed, pilot: true, rates: { chatgpt_stem: 1, chatgpt_other: 1, language: 0 } } }];
    const v = buildValidation(d, { generatedAt: T0 });
    expect(v.sampling).toHaveLength(1);
    const s = v.sampling[0];
    expect(s).toMatchObject({ run_id: "run-20260929-xval-01", pilot: true, seed });
    // pilot: every live item (10, none rejected or retired) is required or sampled for the blind solve
    expect(s.chatgpt.policy.required + s.chatgpt.policy.sampled).toBe(10);
    // required: the aptitude/legacy av-901, the numeric item and every computation-style item
    const required = data.questions.map((x) => x.q).filter((q) => q.scope === "aptitude" || q.question_type === "numeric" || q.item_style === "computation");
    expect(s.chatgpt.policy.required).toBe(required.length);
    expect(s.chatgpt.present).toBe(0);
    // Gemini: no en item, no L* warning, language rate 0
    expect(s.gemini.policy).toEqual({ required: 0, sampled: 0 });
  });
});

// ── duplicates.md (§8) ──────────────────────────────────────────────────────
describe("duplicates report", () => {
  it("lists clusters by class, families and exclusion components by hand count", () => {
    const d = buildDuplicates(data);
    expect(d.clusters).toBe(1);
    expect(d.members_by_class).toEqual({ RELATED: 1 });
    expect(d.items_by_class).toEqual({ RELATED: 1, UNIQUE: 9 });
    expect(d.largest).toEqual([{ id: "dc-q-m1-math-fa3093174f", canonical_id: "q-m1-math-fa3093174f", members: 1, classes: { RELATED: 1 }, exclusion_group: "xg-6f8567184d" }]);
    expect(d.cross_lesson).toEqual([]); // the rewrite sits in the parent's lesson
    expect(d.template_variant_families).toEqual([{ template_id: "t-m1-math-9927f5ac29", variants: 2, published: 2 }]);
    expect(d.rewrite_families).toEqual([{ parent_id: "q-m1-math-fa3093174f", rewrites: 1, published: 0 }]);
    expect(d.exclusion_components).toEqual({ count: 2, cap: 8, size_histogram: { 2: 2 }, over_cap: [] });
    expect(d.instruction_stem_families).toEqual([]);
  });

  it("finds instruction-stem families, cross-lesson members and components over the cap", () => {
    const d = freshData();
    const base = d.questions.find((x) => x.q.id === "q-m1-math-8ec8ada9ed").q;
    const extra = Array.from({ length: 9 }, (_, i) => ({
      q: { ...base, id: `q-m1-math-${String(i).padStart(10, "7")}`, stem: "اختر الكلمة المختلفة:", curriculum: { ...base.curriculum, lesson: `${MATH}/n62` }, dedup: { class: "RELATED", cluster_id: null, exclusion_group: "xg-0000000001" } },
      shard: "questions/middle/grade-1/math",
    }));
    d.questions = [...d.questions, ...extra];
    d.clusters = [...d.clusters, { id: "dc-q-m1-math-8ec8ada9ed", canonical_id: "q-m1-math-8ec8ada9ed", members: [{ id: extra[0].q.id, class: "RELATED", signals: ["numeric_variant"] }], exclusion_group: "xg-0000000001" }];
    const out = buildDuplicates(d);
    expect(out.instruction_stem_families).toEqual([{ stem: "اختر الكلمة المختلفة:", items: 9 }]);
    expect(out.cross_lesson).toEqual([{ cluster: "dc-q-m1-math-8ec8ada9ed", member: extra[0].q.id, class: "RELATED", canonical_lesson: `${MATH}/n55`, member_lesson: `${MATH}/n62` }]);
    expect(out.numeric_variant_families).toEqual([{ cluster: "dc-q-m1-math-8ec8ada9ed", canonical_id: "q-m1-math-8ec8ada9ed", members: 1, ids: [extra[0].q.id] }]);
    expect(out.exclusion_components.over_cap).toEqual([{ exclusion_group: "xg-0000000001", size: 9 }]);
  });
});

// ── question-stats.json (§8, §9.3): distributions, yield, projection ────────
describe("generated-question statistics", () => {
  it("breaks candidates and published items down by origin, type, band, language and subject", () => {
    const s = model.questionStats;
    expect(s.by.origin).toEqual({ generated_practice: { candidates: 2, published: 2 }, internal_authored: { candidates: 1, published: 1 }, transformed: { candidates: 7, published: 6 } });
    expect(s.by.band).toEqual({ 1: { candidates: 7, published: 6 }, 2: { candidates: 3, published: 3 } });
    expect(s.by.language).toEqual({ ar: { candidates: 10, published: 9 } });
    expect(s.by.subject).toEqual({ [MATH]: { candidates: 9, published: 8 }, "prep:aptitude/verbal": { candidates: 1, published: 1 } });
    expect(s.generator_runs).toEqual([{ run_id: "run-20260927-gen-01", source: "manifest", generated: 7, accepted: 7, yield: 1, records_in_staging: 7 }]);
    expect(s.repair).toEqual({ revised_items: 0, candidates: 10, rate: 0, repair_decisions: 1 });
    expect(s.mcq_answer_position.published_mcq).toBe(4);
    expect(Object.values(s.mcq_answer_position.positions).reduce((a, b) => a + b, 0)).toBe(4);
  });

  it("labels the full-bank figures a projection and refuses one without measured runs", () => {
    const p = model.questionStats.projection;
    expect(p).toMatchObject({ label: FULL_BANK_LABEL, lessons_total: 10102, available: false });
    expect(FULL_BANK_LABEL).toBe("projection");
    const json = RENDERERS["question-stats.json"](model);
    expect(JSON.parse(json).projection_note).toMatch(/projection/);
  });

  it("projects the full bank from measured throughput only", () => {
    const d = freshData();
    d.runs = d.runs.map((m) => (m.run_id === "run-20260927-gen-01"
      ? { ...m, throughput: { items_generated: 20, items_accepted: 10, lessons: 5, wall_seconds: 7200, subagent_calls: { generation: 5, validation: 5 }, xai_batches: 2, human_review_minutes: 30 } }
      : m));
    const s = buildQuestionStats(d);
    expect(s.throughput).toEqual([{
      run_id: "run-20260927-gen-01", kind: "gen", items: 20, accepted: 10, lessons: 5, wall_seconds: 7200, items_per_hour: 10,
      subagent_calls: { generation: 5, validation: 5 }, subagent_calls_per_100: 50, xai_batches: 2, xai_batches_per_100: 10,
      human_review_minutes: 30, human_review_minutes_per_100: 150,
    }]);
    // 10 accepted over 5 lessons = 2 per lesson → 20,204 items over 10,102 lessons
    expect(s.projection).toMatchObject({
      label: "projection", available: true, accepted_per_lesson: 2, yield: 0.5, projected_accepted_items: 20204,
      projected_hours: 4040.8, projected_subagent_calls: 20204, projected_xai_batches: 4041, projected_human_review_hours: 1010.2,
    });
  });
});

// ── resources.md, question-bank.md, verification.md ─────────────────────────
describe("resource, question-bank and verification manifests", () => {
  it("lists every resource with pages by method and its term evidence routes", () => {
    const r = buildResources(data);
    expect(r.map((x) => x.id)).toEqual(["ien-120607", "ien-121391", "ien-bank-90"]);
    expect(r[0]).toMatchObject({ part: 1, year_label: "1448", extraction_status: "frontmatter_done", page_count: 183, pages: { text: 4, vision: 1, none: 0 }, term: "t1", term_status: "inferred", evidence_routes: ["owner_decision"] });
    expect(r[1]).toMatchObject({ extraction_status: "not_started", pages: { text: 0, vision: 0, none: 0 } });
    expect(r[2]).toMatchObject({ kind: "question_bank_external", term_status: "unknown", evidence_routes: [] });
  });

  it("counts the question bank per shard and subject and hashes the published set", () => {
    const b = buildQuestionBank(data);
    expect(b.shards.map((s) => [s.shard, s.subject, s.total, s.by_status])).toEqual([
      ["question-variants/middle/grade-1/math", MATH, 2, { published: 2 }],
      ["questions/middle/grade-1/math", MATH, 7, { published: 6, review_required: 1 }],
      ["questions/prep/aptitude-verbal", "prep:aptitude/verbal", 1, { published: 1 }],
    ]);
    const published = data.questions.map((x) => x.q).filter((q) => q.status === "published").map((q) => `${q.id}:${q.revision}`).sort();
    expect(published).toHaveLength(9);
    expect(b.published_set_sha256).toBe(createHash("sha256").update(published.join("\n")).digest("hex"));
    expect(b.bank_revision).toBeNull(); // no runtime bank given
    expect(b.manifest_sha256).toBe(model.meta.manifest_sha256);
  });

  it("maps every §9.3 requirement to its command, tests and artifacts without claiming a pass", () => {
    const v = model.verification;
    expect(v).toHaveLength(10);
    const reports = v.find((r) => r.requirement === "Reports and counts");
    expect(reports.tests_present).toEqual([{ path: "tests/unit/content-reports.test.js", present: true }]);
    expect(reports.artifacts_present.every((a) => a.present)).toBe(true); // written by this run
    const md = RENDERERS["verification.md"](model);
    expect(md).toContain("does not claim that a test passed");
    const tableRows = md.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Requirement"));
    expect(tableRows).toHaveLength(10);
    for (const row of tableRows) expect(row).not.toMatch(/\b(pass|passed|passing|green|ok)\b/i);
  });

  it("reports the manifest as current, and stale once a data file changes", () => {
    expect(model.meta.manifest_status).toBe("current");
    expect(model.meta.manifest_sha256).toMatch(/^[0-9a-f]{64}$/);
    const dir = mkdtempSync(join(tmpdir(), "jz-report-manifest-"));
    try {
      cpSync(FIXTURE, dir, { recursive: true });
      const p = join(dir, "curriculum/subject-terms.jsonl");
      writeFileSync(p, readFileSync(p, "utf8").replace('"inferred"', '"verified"'));
      expect(manifestStatus(dir)).toMatchObject({ status: "stale", stale_paths: ["curriculum/subject-terms.jsonl"] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── the CLI: deterministic, byte-identical reruns, blueprints, usage errors ──
describe("report.mjs CLI", () => {
  let dir;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "jz-report-cli-"));
    cpSync(FIXTURE, join(dir, "staging"), { recursive: true });
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const staging = () => join(dir, "staging");
  const reports = () => join(staging(), "reports");
  const snapshot = () => Object.fromEntries(readdirSync(reports()).sort().map((f) => [f, readFileSync(join(reports(), f), "utf8")]));

  it("writes every §8 report, and a rerun at a later time changes no byte", async () => {
    expect(await main(["--staging", staging(), "--no-bank", "--now", T0], quiet)).toBe(0);
    for (const name of REPORT_FILES) expect(existsSync(join(reports(), name))).toBe(true);
    const first = snapshot();
    expect(recordedTime("coverage.md", first["coverage.md"])).toBe(T0);
    expect(recordedTime("quality.html", first["quality.html"])).toBe(T0);
    expect(recordedTime("coverage.json", first["coverage.json"])).toBe(T0);
    expect(await main(["--staging", staging(), "--no-bank", "--now", "2026-10-02T08:00:00Z"], quiet)).toBe(0);
    expect(snapshot()).toEqual(first);
    // the reports themselves are staging "report" files: validate-staging stays clean
    const v = await validateStaging({ root: staging(), runtimeDir: null, registryBaseline: null, writeManifest: false });
    expect(v.errors).toEqual([]);
  });

  it("records a new time only in the reports whose content changed", async () => {
    const q = join(staging(), "validation/review-queue.jsonl");
    const before = snapshot();
    const saved = readFileSync(q, "utf8");
    try {
      writeFileSync(q, "");
      const later = "2026-10-03T08:00:00Z";
      expect(await main(["--staging", staging(), "--no-bank", "--now", later, "--only", "validation"], quiet)).toBe(0);
      const after = snapshot();
      expect(recordedTime("validation.md", after["validation.md"])).toBe(later);
      expect(after["validation.md"]).toContain("- Size: **0**");
      expect(after["coverage.md"]).toBe(before["coverage.md"]);
    } finally {
      writeFileSync(q, saved);
      await main(["--staging", staging(), "--no-bank", "--now", T0, "--only", "validation.md"], quiet);
    }
  });

  it("--exams writes schema-valid blueprints per stage and --write-manifest keeps staging valid", async () => {
    expect(await main(["--staging", staging(), "--no-bank", "--now", T0, "--exams", "--write-manifest"], quiet)).toBe(0);
    const dirB = join(staging(), "exams/blueprints");
    expect(readdirSync(dirB).sort()).toEqual(["middle.jsonl", "prep.jsonl"]);
    const rows = readFileSync(join(dirB, "middle.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows).toEqual(model.blueprints.rows.filter((r) => r.stage === "middle"));
    for (const r of rows) expect(validateRecord("exam-blueprint", r).ok).toBe(true);
    const v = await validateStaging({ root: staging(), runtimeDir: null, registryBaseline: null, writeManifest: false });
    expect(v.errors).toEqual([]);
    const data2 = loadReportData(staging());
    expect(data2.manifest.status).toBe("current");
  });

  it("rejects bad arguments with exit 2", async () => {
    expect(() => parseArgs(["--bogus"])).toThrow(UsageError);
    expect(() => parseArgs(["--now", "yesterday"])).toThrow(/ISO UTC/);
    expect(() => parseArgs(["--only", "nope"])).toThrow(/unknown report/);
    expect(() => parseArgs(["--write-manifest"])).toThrow(/--exams/);
    expect(parseArgs(["--only", "coverage,quality.html"]).only).toEqual(["coverage.json", "coverage.md", "quality.html"]);
    expect(parseArgs(["--staging", "x"]).out).toBe(join(resolve("x"), "reports"));
    expect(await main(["--staging", join(dir, "missing")], quiet)).toBe(2);
    expect(await main(["--bogus"], quiet)).toBe(2);
  });

  it("escapes markdown cells", () => {
    expect(mdCell("a|b\nc")).toBe("a\\|b c");
    expect(mdCell(null)).toBe("—");
    expect(mdTable(["x"], [])).toBe("_none_\n");
    expect(mdTable(["x", "y"], [[1, "|"]])).toBe("| x | y |\n|---|---|\n| 1 | \\| |\n");
  });
});

// ── verifier regressions ────────────────────────────────────────────────────
describe("verifier regressions", () => {
  it("reads sharded term-evidence and dedup-cluster files (.pNN.jsonl)", () => {
    const dir = mkdtempSync(join(tmpdir(), "jz-report-shards-"));
    try {
      cpSync(FIXTURE, dir, { recursive: true });
      renameSync(join(dir, "resources/term-evidence.jsonl"), join(dir, "resources/term-evidence.p01.jsonl"));
      renameSync(join(dir, "validation/dedup-clusters.jsonl"), join(dir, "validation/dedup-clusters.p01.jsonl"));
      const d = loadReportData(dir);
      expect(d.termEvidence.map((e) => e.id)).toEqual(data.termEvidence.map((e) => e.id));
      expect(d.termEvidence).toHaveLength(2);
      expect(d.clusters.map((c) => c.id)).toEqual(["dc-q-m1-math-fa3093174f"]);
      // a look-alike name is not a shard
      writeFileSync(join(dir, "resources/term-evidenceXjsonl"), "");
      expect(loadReportData(dir).termEvidence).toHaveLength(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not count failed front-matter reads as coverage or as a tried cover route", () => {
    const d = freshData();
    d.resources = d.resources.map((r) => (r.id === "ien-121391" ? { ...r, term: null, term_status: "needs_review", term_evidence: [] } : r));
    d.frontmatter = [...d.frontmatter, { schema: "book-frontmatter@1", ien_book_id: 121391, path: "1448-GE-ME-K07-SM1-math-part2.pdf", error: "fetch failed" }];
    const bp = { rows: [], empty_scopes: {}, invalid_scopes: [] };
    const c = buildCoverage(d, bp);
    expect(c.frontmatter).toEqual({ done: 1, failed: 1, total: 315 });
    expect(c.term_undeterminable.resources.routes_tried.cover_text).toBe(0);
    const md = renderCoverageMd({ ...model, coverage: c });
    expect(md).toContain("**1/315**");
    expect(md).toContain("1 further row(s) record a failed read");
    // a successful read of the same book counts, and the failure no longer does
    d.frontmatter = [...d.frontmatter.filter((f) => !f.error), { schema: "book-frontmatter@1", ien_book_id: 121391, pages_read: 14 }];
    const c2 = buildCoverage(d, bp);
    expect(c2.frontmatter).toEqual({ done: 2, failed: 0, total: 315 });
    expect(c2.term_undeterminable.resources.routes_tried.cover_text).toBe(1);
  });

  it("reports no generator yield when a run manifest has no accepted count", () => {
    const d = freshData();
    d.runs = d.runs.map((m) => (m.kind === "gen" ? { ...m, counts: { generated: 7 } } : m));
    const s = buildQuestionStats(d);
    expect(s.generator_runs[0]).toMatchObject({ generated: 7, accepted: null, yield: null });
  });

  it("offers the premium tier on the pool with is_premium items; figures stay on the non-premium pool", async () => {
    const template = getTemplate("practice"); // min 5 components
    const row = (i, premium) => ({ key: `q-m1-math-${String(i).padStart(10, "0")}`, band: 1, component: null, type: "mcq", stimulus: null, premium, revision: 1, objective: null, variant: false, lesson: `${MATH}/n53`, unit: `${MATH}/n91`, chapter: null, term: "t1", topic: null });
    const free = [0, 1, 2].map((i) => row(i, false));
    const all = [...free, ...[3, 4, 5].map((i) => row(i, true))];
    expect(componentCount(all)).toBe(6);
    const rec = blueprintRecord({ template, scope: `${MATH}/n53`, kind: "lesson", stage: "middle", subject: MATH, eligible: free, premiumExcluded: 3, premiumComponents: componentCount(all) });
    expect(rec.offered).toBe(false);
    expect(rec.pool).toEqual({ items: 3, questions: 3, variants: 0, components: 3, premium_excluded: 3 });
    expect(rec.tiers.free).toMatchObject({ offered: false, reason: "insufficient_pool" });
    expect(rec.tiers.premium).toMatchObject({ offered: true, required: 5 });
    expect(validateRecord("exam-blueprint", rec).ok).toBe(true);
    // end to end: every published math item premium → the scopes stay listed, only premium is offered
    const d = freshData();
    d.questions = d.questions.map((x) => (x.q.scope === "curriculum" ? { ...x, q: { ...x.q, is_premium: true } } : x));
    const bp = await buildBlueprints(d);
    const subj = bp.rows.find((r) => r.scope === MATH && r.template === "practice@1");
    expect(subj.pool).toMatchObject({ items: 0, premium_excluded: 8 });
    expect(subj.offered).toBe(false);
    expect(subj.tiers.premium.offered).toBe(true);
    expect(subj.tiers.free.offered).toBe(false);
  });

  it("--only takes a report stem for every file of that report", () => {
    expect(parseArgs(["--only", "coverage"]).only).toEqual(["coverage.json", "coverage.md"]);
    expect(parseArgs(["--only", "question-stats,exam-templates"]).only).toEqual(["exam-templates.md", "question-stats.json"]);
    expect(() => parseArgs(["--only", ","])).toThrow(/unknown report/);
  });
});
