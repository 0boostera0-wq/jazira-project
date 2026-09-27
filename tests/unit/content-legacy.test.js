// WP4 — legacy bank conversion (lossless) and its validation path (docs/CONTENT_ENGINE.md §4.4, §5.9).
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { validateRecord } from "../../scripts/content/lib/schemas.mjs";
import { runChecks } from "../../scripts/content/lib/checks.mjs";
import { checkContext, loadStaging, main as checkMain } from "../../scripts/content/check-questions.mjs";
import { canonicalToLegacy, legacyToCanonical, main as convertMain, readLegacyFiles, verifyLossless } from "../../scripts/content/convert-legacy.mjs";
import { displaySeed, displayView, main as exchangeMain } from "../../scripts/content/exchange.mjs";
import { addPrimaryRecords, main as resolveMain } from "../../scripts/content/resolve-validation.mjs";
import { buildSeedSql, loadCatalog, main as seedMain, validateQuestionFiles } from "../../scripts/build-question-seed.mjs";

const REPO = resolve(__dirname, "../..");
const SEED = join(REPO, "supabase/migrations/0011_seed_questions.sql");
const NOW = "2026-09-27T00:00:00Z";
const quiet = { log: () => {}, error: () => {}, warn: () => {} };

let catalog;
let sources;
let tmp;

beforeAll(async () => {
  catalog = await loadCatalog();
  sources = readLegacyFiles(catalog);
  tmp = mkdtempSync(join(tmpdir(), "jz-legacy-"));
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const clone = (x) => JSON.parse(JSON.stringify(x));

describe("legacy conversion is lossless", () => {
  it("canonical → legacy JSON deep-equals the six source files", () => {
    expect(sources.map((s) => s.label)).toEqual(catalog.QUESTION_FILES.map((n) => `${n}.json`));
    const { questions, stimuli } = legacyToCanonical(sources, catalog, { now: NOW });
    expect(questions).toHaveLength(300);
    const back = canonicalToLegacy(questions, stimuli, catalog);
    expect(back).toHaveLength(6);
    for (const src of sources) expect(back.find((b) => b.label === src.label).json).toStrictEqual(src.json);
  });

  it("canonical → buildSeedSql() is byte-identical to 0011_seed_questions.sql", () => {
    const { questions, stimuli } = legacyToCanonical(sources, catalog, { now: NOW });
    const { errors, files } = validateQuestionFiles(canonicalToLegacy(questions, stimuli, catalog), catalog);
    expect(errors).toEqual([]);
    expect(buildSeedSql(files)).toBe(readFileSync(SEED, "utf8"));
    expect(verifyLossless(sources, questions, stimuli, catalog).ok).toBe(true);
  });

  it("produces valid canonical records with the legacy keys and internal provenance", () => {
    const { questions, stimuli } = legacyToCanonical(sources, catalog, { now: NOW });
    for (const q of questions) {
      const v = validateRecord("question", q);
      expect(v.errors, q.id).toEqual([]);
      expect(q.provenance).toEqual({ origin: "internal_authored", official: false, license_status: "internal", generator: { kind: "legacy_unknown", run_id: null, prompt_version: null }, derived_from: [], template_id: null });
      expect(q.links).toEqual([{ node_id: `prep:${q.prep.exam}/${q.prep.section}/${q.prep.topic}`, role: "aligned" }]);
      for (const o of q.payload.options) expect(o.id).toMatch(/^o[0-9a-f]{6,11}$/);
    }
    expect(questions.map((q) => q.id)).toEqual(sources.flatMap((s) => s.json.questions.map((x) => x.key)).sort());
    const aq1 = questions.find((q) => q.id === "aq-001");
    expect(aq1).toMatchObject({ difficulty: 2, difficulty_band: 1, difficulty_source: "author", scope: "aptitude", item_style: "reasoning" });
    expect(aq1.payload.fixed_order_reason).toBe("numeric_ascending"); // O004: all-numeric options keep their order
    const withPassage = sources.flatMap((s) => s.json.questions).filter((x) => x.passage);
    expect(stimuli.length).toBe(new Set(withPassage.map((x) => x.passage)).size);
    for (const s of stimuli) expect(validateRecord("stimulus", s).errors).toEqual([]);
    const comparison = questions.filter((q) => q.prep.topic === "comparison");
    expect(comparison.length).toBeGreaterThan(0);
    for (const q of comparison) expect(q).toMatchObject({ shuffle_options: false, payload: { fixed_order_reason: expect.any(String) } });
  });

  it("refuses sources it cannot hold losslessly", () => {
    const extra = clone(sources);
    extra[0].json.questions[0].premium = true;
    expect(() => legacyToCanonical(extra, catalog)).toThrow(/fields must be exactly/);
    const untrimmed = clone(sources);
    untrimmed[1].json.questions[0].stem += " ";
    expect(() => legacyToCanonical(untrimmed, catalog)).toThrow(/trimmed/);
    const foreign = clone(sources);
    foreign[2].json.source = "someone-else";
    expect(() => legacyToCanonical(foreign, catalog)).toThrow(/jazira-original/);
  });

  it("keeps revision and timestamps on reruns and makes a new revision on edits", () => {
    const first = legacyToCanonical(sources, catalog, { now: NOW });
    const existing = new Map(first.questions.map((q) => [q.id, q]));
    const again = legacyToCanonical(sources, catalog, { now: "2026-10-01T00:00:00Z", existing });
    expect(again.questions).toStrictEqual(first.questions);
    const edited = clone(sources);
    edited[0].json.questions[0].stem = "ما الحد التالي في المتتابعة: 3، 6، 12، 24، ...؟";
    const next = legacyToCanonical(edited, catalog, { now: "2026-10-01T00:00:00Z", existing });
    expect(next.questions.find((q) => q.id === "aq-001")).toMatchObject({ revision: 2, created_at: NOW, updated_at: "2026-10-01T00:00:00Z", status: "candidate" });
  });

  it("CLI writes staging shards that round-trip back to the sources and the seed", async () => {
    const stg = join(tmp, "stg-cli");
    mkdirSync(join(stg, "sources"), { recursive: true });
    cpSync(join(REPO, "data/staging/sources/registry.json"), join(stg, "sources/registry.json"));
    expect(await convertMain(["--staging", stg, "--now", NOW], quiet)).toBe(0);
    expect(readdirSync(join(stg, "questions/prep")).sort()).toEqual(catalog.QUESTION_FILES.map((n) => `${n}.jsonl`).sort());
    const snapshot = readFileSync(join(stg, "questions/prep/aptitude-verbal.jsonl"), "utf8");
    expect(await convertMain(["--staging", stg, "--now", "2026-10-02T00:00:00Z"], quiet)).toBe(0);
    expect(readFileSync(join(stg, "questions/prep/aptitude-verbal.jsonl"), "utf8")).toBe(snapshot); // byte-deterministic, idempotent
    const b = loadStaging(stg);
    const back = canonicalToLegacy([...b.questions.values()], [...b.stimuli.values()], catalog);
    for (const src of sources) expect(back.find((x) => x.label === src.label).json).toStrictEqual(src.json);
    expect(await convertMain(["--verify-only"], quiet)).toBe(0);
  });
});

describe("the legacy 300 go through Stage 1, Stage 2 and a blind solve", () => {
  const VAL = "run-20260928-val-01";
  const XVAL = "run-20260928-xval-01";
  const WRONG = new Set(["aq-001", "av-002"]);
  let stg;

  beforeAll(async () => {
    stg = join(tmp, "stg-flow");
    mkdirSync(join(stg, "sources"), { recursive: true });
    cpSync(join(REPO, "data/staging/sources/registry.json"), join(stg, "sources/registry.json"));
    expect(await convertMain(["--staging", stg, "--now", NOW], quiet)).toBe(0);
  });

  it("passes Stage 1 without rejections", async () => {
    expect(await checkMain(["--run", "run-20260928-check-01", "--staging", stg, "--baseline", "none", "--cache", join(tmp, "cache")], quiet)).toBe(0);
    const b = loadStaging(stg);
    const statuses = [...b.questions.values()].map((q) => q.validation.status);
    expect(statuses.filter((s) => s !== "structural_pass")).toEqual([]);
    const q = b.questions.get("ac-003");
    expect(runChecks(q, checkContext(b, { catalog })).outcome).toBe("pass");
  });

  it("stays pending without the ChatGPT blind solve; disagreements become review_required", async () => {
    const b = loadStaging(stg);
    const lines = [...b.questions.values()].map((q) => {
      const view = displayView(q, displaySeed(VAL));
      return { schema: "validation-record@1", question_id: q.id, revision: q.revision, content_hash: q.content_hash, role: "primary", agent: "claude_subagent", run_id: VAL, prompt_version: "validate.v1", checked_at: "2026-09-28T10:00:00Z", verdict: "pass", checks: [], blind_answer: view.keyDisplay, support: "not_checked", ambiguity: "none", difficulty_estimate: 3, issues: [], notes: null };
    });
    const file = join(tmp, "legacy-primary.jsonl");
    writeFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n"));
    expect(addPrimaryRecords(b, lines, { runId: VAL })).toHaveLength(300);
    expect(await resolveMain(["add-records", "--run", VAL, "--file", file, "--staging", stg], quiet)).toBe(0);
    expect(await resolveMain(["resolve", "--run", VAL, "--staging", stg], quiet)).toBe(0);
    let after = loadStaging(stg);
    expect([...after.questions.values()].every((q) => q.status === "candidate" && q.validation.status === "auto_pass")).toBe(true);

    expect(await exchangeMain(["plan", "--run", XVAL, "--seed", "f".repeat(32), "--rate-language", "0", "--staging", stg], quiet)).toBe(0);
    for (const agent of ["chatgpt", "gemini"]) expect(await exchangeMain(["export", "--agent", agent, "--run", XVAL, "--staging", stg], quiet)).toBe(0);
    const dir = join(stg, "validation/exchange", XVAL);
    const metas = readdirSync(dir).filter((f) => f.endsWith(".meta.json")).sort();
    const chatgptItems = metas.filter((f) => f.startsWith("chatgpt")).reduce((n, f) => n + JSON.parse(readFileSync(join(dir, f), "utf8")).items.length, 0);
    expect(chatgptItems).toBe(300); // every legacy item, in batches of ≤ 25
    expect(metas.filter((f) => f.startsWith("chatgpt"))).toHaveLength(12);
    for (const f of metas) {
      const meta = JSON.parse(readFileSync(join(dir, f), "utf8"));
      const resp = meta.items.map((it) => {
        const q = after.questions.get(it.id);
        if (f.startsWith("gemini")) return { id: it.id, verdict: "pass", issues: [] };
        const k = it.map.options.indexOf(q.payload.answer.option_id);
        return { id: it.id, answer: { option_index: WRONG.has(it.id) ? (k + 1) % it.map.options.length : k }, confidence: 0.9, method: "حل" };
      });
      const rf = join(dir, f.replace(".meta.json", ".response.jsonl"));
      writeFileSync(rf, resp.map((r) => JSON.stringify(r)).join("\n") + "\n");
      expect(await exchangeMain(["import", "--file", rf, "--staging", stg], quiet)).toBe(0);
    }
    expect(await resolveMain(["resolve", "--run", VAL, "--xval", XVAL, "--staging", stg], quiet)).toBe(0);
    after = loadStaging(stg);
    const byStatus = {};
    for (const q of after.questions.values()) byStatus[q.status] = (byStatus[q.status] ?? 0) + 1;
    expect(byStatus).toEqual({ validated: 298, review_required: 2 });
    for (const id of WRONG) expect(after.questions.get(id).status).toBe("review_required");
    expect(after.reviewQueue.map((r) => r.question_id).sort()).toEqual([...WRONG].sort());
  });
});

describe("build-question-seed bug B1", () => {
  it("--stdout writes only SQL to stdout; the summary goes to stderr", async () => {
    const out = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      out.push(String(chunk));
      return true;
    });
    const log = { log: vi.fn(), error: vi.fn(), warn: vi.fn() };
    try {
      expect(await seedMain(["--stdout"], log)).toBe(0);
    } finally {
      spy.mockRestore();
    }
    expect(out.join("")).toBe(readFileSync(SEED, "utf8"));
    expect(log.log).not.toHaveBeenCalled();
    expect(log.error.mock.calls.flat().join("\n")).toMatch(/aptitude-quantitative\.json: 80/);
  });
});
