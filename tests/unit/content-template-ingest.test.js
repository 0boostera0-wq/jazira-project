// Template drafts → staging (ingest-templates.mjs) and template validation
// from its three previews (promote-templates.mjs); docs/CONTENT_ENGINE.md §2.9, §4.6.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { previewInstances } from "@/lib/content/templates.js";
import { isTemplateId, variantId } from "@/lib/content/ids.js";

const REPO = resolve(__dirname, "../..");
const FIXTURE = join(REPO, "tests/fixtures/content/staging");
const TEMPLATE_FILE = "question-variants/templates/middle/grade-1/math.jsonl";
const VARIANT_FILE = "question-variants/middle/grade-1/math.jsonl";
const RUN = "run-20260928-var-01";
const NOW = "2026-09-28T08:00:00Z";
const quiet = { log: () => {}, error: () => {} };

const PACKET = {
  packet_id: "run-20260928-gen-01:middle__grade-1__math__n61",
  lesson: { id: "middle/grade-1/math/n61", language: "ar" },
  objectives: [],
  pages: [
    { resource_id: "ien-120607", pdf_page: 50, printed_page: 50, kind: "lesson", text: "…" },
    { resource_id: "ien-120607", pdf_page: 52, printed_page: 52, kind: "lesson", text: "…" },
  ],
};
const DRAFT = {
  question_type: "mcq",
  item_style: "computation",
  difficulty: 1,
  language: "ar",
  solution_method: "إيجاد القيمة المطلقة لعدد صحيح",
  params: { a: { type: "int", min: -40, max: 40, exclude: [0] } },
  constraints: [],
  stem: "ما قيمة |{a}|؟",
  answer: { expr: "abs(a)", format: "int" },
  distractors: [
    { expr: "-abs(a)", why: "إعطاء القيمة المطلقة إشارة سالبة" },
    { expr: "abs(a)+1", why: "خطأ في العد" },
    { expr: "2*abs(a)", why: "مضاعفة العدد" },
  ],
  explanation: { text: "القيمة المطلقة لعدد هي بعده عن الصفر.", steps: ["|{a}| = {ans}"] },
  max_variants: 8,
  tags: ["القيمة المطلقة"],
};

let I, P, C, B, V, work;
beforeAll(async () => {
  I = await import("../../scripts/content/ingest-templates.mjs");
  P = await import("../../scripts/content/promote-templates.mjs");
  C = await import("../../scripts/content/check-questions.mjs");
  B = await import("../../scripts/content/build-variants.mjs");
  V = await import("../../scripts/content/validate-staging.mjs");
  work = mkdtempSync(join(tmpdir(), "jz-tpl-ingest-"));
});
afterAll(() => rmSync(work, { recursive: true, force: true }));

const freshRoot = (name) => {
  const root = join(work, name);
  cpSync(FIXTURE, root, { recursive: true });
  return root;
};
const read = (root, rel) => readFileSync(join(root, rel), "utf8").trim().split("\n").map((l) => JSON.parse(l));

describe("ingestTemplate", () => {
  it("assigns id, source, provenance and lifecycle, and draws the previews after the id", () => {
    const bank = C.loadStaging(freshRoot("a"));
    const { template: t, previews } = I.ingestTemplate(structuredClone(DRAFT), PACKET, bank, { runId: RUN, now: NOW });
    expect(isTemplateId(t.id)).toBe(true);
    expect(t.id.startsWith("t-m1-math-")).toBe(true);
    expect(t).toMatchObject({
      schema: "question-template@1", revision: 1, lesson_node_id: "middle/grade-1/math/n61", status: "candidate",
      validation: { status: "pending", record_ids: [], checked_revision: null },
      provenance: { origin: "generated_practice", official: false, license_status: bank.resources.get("ien-120607").license_status, generator: { kind: "llm_subagent", run_id: RUN, prompt_version: "template.v1" } },
      source: { source_id: "ien", resource_id: "ien-120607", pdf_page_start: 50, pdf_page_end: 52, printed_page_start: 50, printed_page_end: 52, evidence: [] },
    });
    expect(t.content_hash).toMatch(/^n2:sha256:[0-9a-f]{64}$/);
    // The previews are exactly variants 01..03 of the minted template.
    expect(previews.map((p) => p.params)).toEqual(previewInstances(t, 3).map((p) => p.params));
  });

  it("rejects fields it assigns, broken templates, unsatisfiable ones and exact repeats", () => {
    const bank = C.loadStaging(freshRoot("b"));
    const code = (d, packet = PACKET) => {
      try {
        I.ingestTemplate(d, packet, bank, { runId: RUN, now: NOW });
        return "accepted";
      } catch (e) {
        return e.code;
      }
    };
    expect(code({ ...DRAFT, id: "t-m1-math-0000000000" })).toBe("S005");
    expect(code({ ...DRAFT, status: "validated" })).toBe("S005");
    expect(code({ ...DRAFT, question_type: "matching" })).toBe("S001");
    expect(code({ ...DRAFT, answer: { expr: "abs(b)", format: "int" } })).toBe("T001");
    expect(code({ ...DRAFT, constraints: ["a > 100"] })).toBe("T002");
    // «{a} ريالات» is wrong Arabic for a = 11…99 (accusative singular «ريالًا»)
    expect(code({ ...DRAFT, stem: "مع خالد {a} ريالات، فكم ريالًا معه؟" })).toBe("T003");
    expect(code({ ...DRAFT, explanation: { text: "", steps: ["|{a}| = {ans}", "{a} طالب"] } })).toBe("T003");
    expect(code({ ...DRAFT, stem: "طول الضلع {a} سم، فما قيمة |{a}|؟" })).toBe("accepted"); // symbolic units do not inflect
    expect(code(DRAFT, { ...PACKET, lesson: { id: "middle/grade-1/math" } })).toBe("S001");
    const lines = [JSON.stringify(DRAFT), "not json", JSON.stringify(DRAFT)];
    const r = I.ingestDraftLines(lines, PACKET, bank, { runId: RUN, now: NOW });
    expect(r.accepted).toHaveLength(1);
    expect(r.rejected.map((x) => [x.line, x.code])).toEqual([[2, "S001"], [3, "D001"]]);
  });
});

describe("ingest-templates.mjs → build-variants → promote-templates.mjs", () => {
  it("writes a valid template shard, materializes candidate variants and promotes only on 3/3 validated previews", async () => {
    const root = freshRoot("c");
    const drafts = join(work, "drafts.jsonl");
    const packet = join(work, "packet.json");
    writeFileSync(drafts, JSON.stringify(DRAFT) + "\n");
    writeFileSync(packet, JSON.stringify(PACKET));
    const args = ["--run", RUN, "--file", drafts, "--packet", packet, "--staging", root, "--cache", join(work, "cache"), "--now", NOW];
    expect(await I.main([...args, "--dry-run"], quiet)).toBe(0);
    expect(read(root, TEMPLATE_FILE)).toHaveLength(1); // dry run wrote nothing
    expect(await I.main(args, quiet)).toBe(0);
    const templates = read(root, TEMPLATE_FILE);
    expect(templates).toHaveLength(2);
    const t = templates.find((x) => x.lesson_node_id === "middle/grade-1/math/n61" && x.stem === DRAFT.stem);
    expect(t.status).toBe("candidate");
    expect(existsSync(join(work, "cache/llm", RUN, "templates-rejected.jsonl"))).toBe(true);

    B.runBuild({ root, runId: "run-20260928-var-02", now: NOW });
    const variants = () => read(root, VARIANT_FILE).filter((q) => q.variant.template_id === t.id);
    expect(variants()).toHaveLength(8);
    expect(variants().every((q) => q.status === "candidate")).toBe(true);
    // The previews pass the deterministic checks (P001: the license follows the cited resource).
    const pre = C.loadStaging(root);
    const { outcomes } = C.checkBank(pre, { runId: "run-20260928-check-01", now: NOW, ids: [1, 2, 3].map((n) => variantId(t.id, n)), catalog: null });
    expect(outcomes.map((o) => o.failed).flat().filter((c) => c === "P001")).toEqual([]);

    // Two previews validated, one pending → unchanged.
    const setStatus = (ids, status) => {
      const all = read(root, VARIANT_FILE).map((q) => (ids.includes(q.id) ? { ...q, status, validation: { ...q.validation, status } } : q));
      const S = C.loadStaging(root);
      for (const q of all) S.questions.set(q.id, q);
      C.saveQuestions(S);
    };
    const pv = [1, 2, 3].map((n) => variantId(t.id, n));
    setStatus(pv.slice(0, 2), "validated");
    expect(P.promoteTemplates(C.loadStaging(root), { now: NOW })).toEqual([]);

    // One preview in review → the template goes to review.
    setStatus([pv[2]], "review_required");
    const bank = C.loadStaging(root);
    expect(P.promoteTemplates(bank, { now: NOW })).toEqual([expect.objectContaining({ id: t.id, from: "candidate", to: "review_required" })]);

    // All three validated → validated; build-variants then validates every variant.
    setStatus([pv[2]], "validated");
    expect(await P.main(["--staging", root, "--now", NOW], quiet)).toBe(0);
    const promoted = read(root, TEMPLATE_FILE).find((x) => x.id === t.id);
    expect(promoted).toMatchObject({ status: "validated", validation: { status: "validated", checked_revision: 1 } });
    B.runBuild({ root, runId: "run-20260928-var-03", now: NOW });
    expect(variants().every((q) => q.status === "validated")).toBe(true);
    const validate = (extra = {}) => V.validateStaging({ root, runtimeDir: null, registryBaseline: null, imageRoots: [], ...extra });
    await validate({ writeManifest: true });
    expect((await validate()).errors).toEqual([]);
  });

  it("sends a template with a counted noun after a parameter to review, whatever its previews", () => {
    const bank = C.loadStaging(freshRoot("d"));
    const t = { ...[...bank.templates.values()][0], stem: "مع خالد {a} ريالات، فكم ريالًا بقي؟", status: "candidate" };
    bank.templates.set(t.id, t);
    expect(P.decideTemplate(t, bank)).toMatchObject({ status: "review_required", reason: expect.stringContaining("T003") });
    expect(I.countedNounAfterParam({ stem: "اشترى {n} كتب", explanation: { text: "", steps: [] } })).toBe("{n} كتب");
    expect(I.countedNounAfterParam({ stem: "طوله {a} سم", explanation: { text: "", steps: [] } })).toBe(null);
  });

  it("refuses bad usage", async () => {
    expect(await I.main(["--run", "run-20260928-gen-01"], quiet)).toBe(2);
    expect(await I.main(["--run", RUN, "--file", "x.jsonl"], quiet)).toBe(2);
    expect(await P.main(["--bogus"], quiet)).toBe(2);
  });
});
