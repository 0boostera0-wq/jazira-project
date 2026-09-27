// ============================================================================
// Import pipeline (docs/CONTENT_ENGINE.md §6.3, WP7): scripts/content/
// import-staging.mjs driving ce_import_* on PGlite end to end — batch upsert,
// idempotent rerun, resume after an injected failure, bad-row isolation,
// dedup against manifest content, retire rules, aggregates refreshed once,
// legacy rows, revision history and an accurate report.
// ============================================================================
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { REPO_ROOT, createDb } from "./harness.js";
import { ImportRpcError, createPgliteExecutor, createSupabaseExecutor, toRpcError } from "../../scripts/content/lib/import-executors.mjs";
import { ImportError, RETRY_DELAYS_MS, importStaging, main, nextRunLabel, parseArgs } from "../../scripts/content/import-staging.mjs";
import {
  buildPlan, lessonRanges, loadStaging, markDuplicates, parseOnly, planRetire, removedKeys, writeStagingTree,
} from "../../scripts/content/lib/import-plan.mjs";
import { TEMPLATES } from "../../src/lib/exams/engine/exam-templates.js";

const FIXTURE_TREE = path.join(REPO_ROOT, "tests/fixtures/content/staging");
const BANK = JSON.parse(readFileSync(path.join(REPO_ROOT, "tests/fixtures/engine/bank-source.json"), "utf8"));
const tmp = (p) => mkdtempSync(path.join(tmpdir(), `jz-${p}-`));
const clone = (v) => JSON.parse(JSON.stringify(v));
const noSleep = async () => {};
const HASH = (c) => `n2:sha256:${c.repeat(64).slice(0, 64)}`;

/** A staging tree from the bank-source records (+ edits). */
function bankTree(edit = (r) => r, extra = {}) {
  const records = edit({
    registry: clone(BANK.registry), nodes: clone(BANK.nodes), objectives: clone(BANK.objectives), resources: clone(BANK.resources),
    stimuli: clone(BANK.stimuli), questions: clone(BANK.questions), templates: clone(TEMPLATES), removed: [],
  });
  const dir = tmp("tree");
  writeStagingTree(dir, { ...records, ...extra });
  return dir;
}

/** Executor wrapper recording calls; `before(fn, args)` may throw to inject failures. */
function recording(inner, before = null) {
  const calls = [];
  return {
    calls,
    target: inner.target,
    async rpc(fn, args) {
      calls.push({ fn, args });
      if (before) await before(fn, args, calls);
      return inner.rpc(fn, args);
    },
  };
}

const totals = (entities) => Object.values(entities).reduce((s, c) => ({
  inserted: s.inserted + c.inserted, updated: s.updated + c.updated, unchanged: s.unchanged + c.unchanged, rejected: s.rejected + c.rejected,
}), { inserted: 0, updated: 0, unchanged: 0, rejected: 0 });

// ============================================================================
describe("import plan (pure)", () => {
  it("--only groups, unknown names refused", () => {
    expect(parseOnly("curriculum,questions")).toEqual(["nodes", "subject_terms", "lesson_ranges", "questions"]);
    expect(parseOnly(null)).toBeNull();
    expect(() => parseOnly("questions,nope")).toThrow(/unknown entity/);
  });

  it("removed[] = the manifest's list plus keys unpublished since the previous import", () => {
    const prev = { published: { "questions/m/g/math.jsonl": ["q-a", "q-b", "q-c"] } };
    const next = { published: { "questions/m/g/math.jsonl": ["q-a"] }, removed: [{ key: "q-b", reason: "rejected" }, { key: "q-a", reason: "stale" }] };
    expect(removedKeys(next, prev)).toEqual([{ key: "q-b", reason: "rejected" }, { key: "q-c", reason: "unpublished" }]);
    expect(removedKeys(next, null)).toEqual([{ key: "q-b", reason: "rejected" }]);
  });

  it("retire scope: only keys of covered shards; unknown shards are skipped", () => {
    const previous = { published: { "questions/m/g/math.jsonl": ["q-a"], "questions/m/g/sci.jsonl": ["q-s"] } };
    const r = planRetire([{ key: "q-a" }, { key: "q-s" }, { key: "q-x" }, { key: "q-y" }], {
      previous, shardOf: new Map([["q-y", "questions/m/g/art"]]), coveredShards: new Set(["questions/m/g/math", "questions/m/g/sci"]),
    });
    expect(r).toEqual({ keys: ["q-a", "q-s"], skipped: [{ key: "q-x", reason: "shard_unknown" }, { key: "q-y", reason: "not_covered" }] });
  });

  it("dedup against manifest content marks every key but the first (C order)", () => {
    const d = markDuplicates([{ id: "q-b", content_hash: "h1" }, { id: "q-a", content_hash: "h1" }, { id: "q-c", content_hash: "h2" }, { id: "q-d", content_hash: null }]);
    expect([...d]).toEqual([["q-b", "q-a"]]);
  });

  it("the plan reads the fixture tree through its manifest, parents before children", () => {
    const staging = loadStaging(FIXTURE_TREE);
    const plan = buildPlan(staging, { target: "pglite" });
    expect(plan.entities.map((e) => e.entity)).toEqual(["sources", "nodes", "resources", "subject_terms", "lesson_ranges", "objectives", "stimuli", "questions", "templates"]);
    const nodes = plan.entities.find((e) => e.entity === "nodes").rows;
    const pos = new Map(nodes.map((n, i) => [n.id, i]));
    for (const n of nodes) if (n.parent_id && pos.has(n.parent_id)) expect(pos.get(n.parent_id)).toBeLessThan(pos.get(n.id));
    const questions = plan.entities.find((e) => e.entity === "questions").rows;
    expect(questions.every((q) => q.status === "published")).toBe(true);
    expect(questions.map((q) => q.id).sort()).toEqual(Object.values(staging.manifest.published).flat().sort());
    expect(lessonRanges([{ id: "a", pages: [{ resource_id: "r-1", pdf_start: 1, pdf_end: 2, method: "toc", status: "verified" }, { resource_id: "r-1", pdf_start: 5 }] }]))
      .toEqual([{ lesson_node_id: "a", resource_id: "r-1", pdf_start: 1, pdf_end: 2, printed_start: null, printed_end: null, method: "toc", status: "verified" }]);
  });

  it("run labels count up per day (logs and reports), never reusing a label", () => {
    const dir = tmp("labels");
    const day = new Date("2026-09-27T10:00:00Z");
    expect(nextRunLabel(dir, day)).toBe("run-20260927-import-01");
    writeFileSync(path.join(dir, "run-20260927-import-01.log.jsonl"), "");
    writeFileSync(path.join(dir, "pglite-run-20260927-import-02.json"), "{}");
    writeFileSync(path.join(dir, "run-20260926-import-07.log.jsonl"), "");
    expect(nextRunLabel(dir, day)).toBe("run-20260927-import-03");
    writeFileSync(path.join(dir, "run-20260927-import-12.log.jsonl"), "");
    expect(nextRunLabel(dir, day)).toBe("run-20260927-import-13");
  });

  it("only transient failures are retried; a statement timeout is split like a bad batch", () => {
    expect(toRpcError({ code: "57014", message: "canceling statement due to statement timeout", status: 500 }).network).toBe(false);
    expect(toRpcError({ code: "P0001", message: "invalid_argument", status: 400 }).network).toBe(false);
    expect(toRpcError({ code: "08006", message: "connection failure", status: 503 }).network).toBe(true);
    expect(toRpcError({ code: "40P01", message: "deadlock detected", status: 500 }).network).toBe(true);
    expect(toRpcError({ code: "PGRST000", message: "Could not connect", status: 503 }).network).toBe(true);
    expect(toRpcError({ message: "Bad gateway", status: 502 }).network).toBe(true);
    expect(toRpcError({ message: "TypeError: fetch failed" }).network).toBe(true);
    expect(toRpcError({ code: "23505", message: "duplicate", details: "{\"a\":1}", status: 409 })).toMatchObject({ network: false, details: { a: 1 } });
  });

  it("CLI arguments", async () => {
    expect(parseArgs(["--target", "pglite", "--only", "questions", "--batch", "50", "--dry-run"]).options)
      .toEqual({ target: "pglite", only: "questions", batch: 50, dryRun: true });
    expect(() => parseArgs(["--only", "questions"])).toThrow(ImportError);
    const out = { log: () => {}, error: () => {} };
    expect(await main(["--bogus"], out)).toBe(2);
    expect(await main(["--target", "pglite", "--only", "nope"], out)).toBe(2);
  });
});

// ============================================================================
describe("import into PGlite", () => {
  let h;
  let pg;
  const cacheDir = tmp("cache");
  beforeAll(async () => {
    h = await createDb();
    pg = await createPgliteExecutor({ harness: h });
  });
  afterAll(async () => {
    await h?.close();
  });
  const run = (o) => importStaging({ target: "pglite", executor: pg, cacheDir, sleep: noSleep, ...o });

  it("dry run plans without calling the database", async () => {
    const r = await importStaging({ target: "pglite", stagingDir: FIXTURE_TREE, cacheDir, dryRun: true, executor: { rpc: () => { throw new Error("no calls"); } } });
    expect(r).toMatchObject({ dryRun: true, target: "pglite", entities: { questions: 9, nodes: 14, templates: 2 }, removed: 0 });
  });

  it("imports the validated fixture tree: batch upsert, accurate report and log", async () => {
    const staging = loadStaging(FIXTURE_TREE);
    const plan = buildPlan(staging, { target: "pglite" });
    const r = await run({ stagingDir: FIXTURE_TREE, run: "run-20260927-import-01" });
    for (const { entity, rows } of plan.entities) {
      expect(r.entities[entity], entity).toMatchObject({ rows: rows.length, inserted: rows.length, updated: 0, unchanged: 0, rejected: 0 });
    }
    expect(r.errors).toEqual([]);
    expect(r.aggregates_refreshed).toBe(true);
    expect(r.manifest_sha).toBe(staging.manifestSha);
    const report = JSON.parse(readFileSync(r.report_path, "utf8"));
    expect(r.report_path).toBe(path.join(cacheDir, "import", "pglite", "pglite-run-20260927-import-01.json"));
    expect(report.entities).toEqual(r.entities);
    const events = readFileSync(r.log_path, "utf8").trim().split("\n").map((l) => JSON.parse(l).event);
    expect(events[0]).toBe("begin");
    expect(events.at(-1)).toBe("finish");
    expect(events.filter((e) => e === "batch").length).toBe(plan.entities.filter((e) => e.rows.length).length);
    const [{ q, k, l, n }] = await h.sql(`select (select count(*) from public.questions where import_origin = 'staging')::int q,
      (select count(*) from public.question_keys k join public.questions q on q.id = k.question_id where q.import_origin = 'staging')::int k,
      (select count(*) from public.question_curriculum)::int l, (select count(*) from public.curriculum_nodes)::int n`);
    expect({ q, k, n }).toEqual({ q: plan.entities.find((e) => e.entity === "questions").rows.length, k: q, n: 14 });
    expect(l).toBeGreaterThan(0);
    // accepted_norm is computed in SQL for short answers
    const sa = await h.sql("select k.accepted_norm from public.question_keys k join public.questions q on q.id = k.question_id where q.question_type = 'short_answer' and q.import_origin = 'staging'");
    for (const row of sa) expect(Array.isArray(row.accepted_norm)).toBe(true);
    expect(existsSync(path.join(cacheDir, "import", "pglite", "checkpoint.json"))).toBe(false);
  }, 180000);

  it("an unchanged rerun is idempotent: 0 inserted, 0 updated; smaller batches change nothing", async () => {
    const r = await run({ stagingDir: FIXTURE_TREE, batch: 3 });
    const t = totals(r.entities);
    expect(t.inserted).toBe(0);
    expect(t.updated).toBe(0);
    expect(t.rejected).toBe(0);
    expect(t.unchanged).toBeGreaterThan(30);
    const [{ runs }] = await h.sql("select count(*)::int runs from public.content_import_runs where status = 'done'");
    expect(runs).toBe(2);
  }, 180000);

  it("aggregates are refreshed once, at finish (never per statement)", async () => {
    const dir = bankTree();
    const count = () => h.sql(`select (select coalesce(sum(free_count), 0) from public.question_bank_counts
                                          where exam = 'aptitude' and section = 'verbal')::int bank,
                                       (select count(*) from public.scope_pool_members where lesson_node_id like 'middle/grade-1/math/%')::int pool`);
    const [pre] = await count();
    let before = null;
    const ex = recording(pg, async (fn) => {
      if (fn === "ce_import_finish") {
        [before] = await h.sql(`select (select coalesce(sum(free_count), 0) from public.question_bank_counts
                                        where exam = 'aptitude' and section = 'verbal')::int bank,
                                     (select count(*) from public.scope_pool_members where lesson_node_id like 'middle/grade-1/math/%')::int pool`);
      }
    });
    const r = await importStaging({ target: "pglite", executor: ex, stagingDir: dir, cacheDir: tmp("cache"), validate: false, sleep: noSleep });
    expect(r.errors).toEqual([]);
    expect(ex.calls.filter((c) => c.fn === "ce_import_finish")).toHaveLength(1);
    expect(ex.calls.filter((c) => c.fn === "ce_refresh_aggregates")).toHaveLength(0);
    const [after] = await h.sql(`select (select coalesce(sum(free_count), 0) from public.question_bank_counts
                                           where exam = 'aptitude' and section = 'verbal')::int bank,
                                        (select count(*) from public.scope_pool_members where lesson_node_id like 'middle/grade-1/math/%')::int pool`);
    expect(before).toEqual(pre); // nothing was refreshed while the batches ran
    expect(after.pool).toBeGreaterThan(pre.pool + 20);
    expect(after.bank - before.bank).toBe(9); // the 9 new aptitude items appear only after finish
    const [{ n }] = await h.sql("select count(*)::int n from public.scope_pool_counts where node_id = 'middle/grade-1/math' and band = 0");
    expect(n).toBe(1);
  }, 180000);

  it("a content change appends the previous version and bumps the revision; metadata changes do not", async () => {
    const key = "q-m1-math-2c3a4249d7";
    const dir = bankTree((r) => {
      const q = r.questions.find((x) => x.id === key);
      q.stem = "سؤال a2 معدل؟";
      r.questions.find((x) => x.id === "q-m1-math-f55ff16f66").tags = ["retagged"];
      return r;
    });
    const r = await importStaging({ target: "pglite", executor: pg, stagingDir: dir, cacheDir: tmp("cache"), validate: false, sleep: noSleep });
    expect(r.entities.questions).toMatchObject({ updated: 2, inserted: 0, rejected: 0 });
    const [q] = await h.sql("select id, stem, revision from public.questions where key = $1", [key]);
    expect(q).toMatchObject({ stem: "سؤال a2 معدل؟", revision: 2 });
    const revs = await h.sql("select revision, stem from public.question_revisions where question_id = $1", [q.id]);
    expect(revs).toEqual([{ revision: 1, stem: "سؤال a2؟" }]);
    const [m] = await h.sql("select revision, tags from public.questions where key = 'q-m1-math-f55ff16f66'");
    expect(m).toEqual({ revision: 1, tags: ["retagged"] });
  }, 180000);

  it("legacy (0011) rows keep their seeded stem, choices and key; only new columns are set", async () => {
    const [seed] = await h.sql(`select q.key, q.stem, q.choices, q.section, q.topic, q.difficulty, k.correct_index, k.explanation
      from public.questions q join public.question_keys k on k.question_id = q.id where q.key = 'av-001'`);
    expect(seed).toBeTruthy();
    const ids = seed.choices.map((_, i) => `o00000${i}`);
    const legacy = {
      ...clone(BANK.questions.find((x) => x.id === "av-101")), id: "av-001", stem: "a different staging stem",
      prep: { exam: "aptitude", section: seed.section, topic: seed.topic }, difficulty_band: seed.difficulty,
      payload: { options: seed.choices.map((text, i) => ({ id: ids[i], text })), answer: { option_id: ids[seed.correct_index] }, fixed_order_reason: null },
      explanation: { text: "شرح", steps: [], method: null }, content_hash: HASH("7"),
    };
    const bad = { ...clone(legacy), id: "av-002", payload: { ...legacy.payload, options: legacy.payload.options.slice().reverse() }, content_hash: HASH("8") };
    // same choices as the seed, but the staging key names another option: the legacy RPCs
    // (correct_index) and template sessions (answer) would grade the item differently
    const [seed3] = await h.sql(`select q.stem, q.choices, q.section, q.topic, q.difficulty, k.correct_index
      from public.questions q join public.question_keys k on k.question_id = q.id where q.key = 'av-003'`);
    const ids3 = seed3.choices.map((_, i) => `o00003${i}`);
    const wrongKey = {
      ...clone(legacy), id: "av-003", prep: { exam: "aptitude", section: seed3.section, topic: seed3.topic }, difficulty_band: seed3.difficulty,
      payload: { options: seed3.choices.map((text, i) => ({ id: ids3[i], text })), answer: { option_id: ids3[(seed3.correct_index + 1) % ids3.length] }, fixed_order_reason: null },
      content_hash: HASH("9"),
    };
    const dir = tmp("legacy");
    writeStagingTree(dir, { questions: [legacy, bad, wrongKey] });
    const r = await importStaging({ target: "pglite", executor: pg, stagingDir: dir, cacheDir: tmp("cache"), validate: false, only: "questions", sleep: noSleep });
    expect(r.entities.questions).toMatchObject({ updated: 1, rejected: 2 });
    expect(r.errors).toEqual([
      expect.objectContaining({ key: "av-002", code: "legacy_mismatch", detail: { field: "choices" } }),
      expect.objectContaining({ key: "av-003", code: "legacy_mismatch", detail: { field: "answer" } }),
    ]);
    const [{ origin }] = await h.sql("select import_origin origin from public.questions where key = 'av-003'");
    expect(origin).toBe(null); // untouched
    const [after] = await h.sql(`select q.stem, q.choices, q.import_origin, q.provenance, q.status, q.payload_public, k.correct_index, k.explanation, k.answer
      from public.questions q join public.question_keys k on k.question_id = q.id where q.key = 'av-001'`);
    expect(after).toMatchObject({ stem: seed.stem, choices: seed.choices, import_origin: "legacy_seed", provenance: "internal_authored", status: "published",
      correct_index: seed.correct_index, explanation: seed.explanation });
    expect(after.payload_public.options.map((o) => o.id)).toEqual(ids);
    expect(after.answer.answer.option_id).toBe(ids[seed.correct_index]);
  }, 180000);

  it("the legacy builder and bank counts never use typed staging items; staging rows are RPC-only", async () => {
    const base = clone(BANK.questions.find((x) => x.id === "av-101"));
    const mcq = { ...clone(base), id: "av-801", stem: "سؤال av-801؟", content_hash: HASH("c") };
    const ordering = {
      ...clone(base), id: "av-802", stem: "رتب av-802؟", question_type: "ordering", content_hash: HASH("d"),
      payload: { items: [{ id: "s0a0a0a", text: "ب" }, { id: "s1b1b1b", text: "أ" }, { id: "s2c2c2c", text: "ج" }], answer: { order: ["s1b1b1b", "s0a0a0a", "s2c2c2c"] }, criterion: "other" },
    };
    const dir = tmp("typed");
    writeStagingTree(dir, { questions: [mcq, ordering] });
    const r = await importStaging({ target: "pglite", executor: pg, stagingDir: dir, cacheDir: tmp("cache"), validate: false, only: "questions", sleep: noSleep });
    expect(r.errors).toEqual([]);
    await h.sql("select public.ce_refresh_aggregates()");
    const [{ served, counted }] = await h.sql(`select
        (select count(*) from public.questions where exam = 'aptitude' and section = 'verbal' and topic = 'analogy' and is_active
            and question_type in ('mcq', 'true_false'))::int served,
        (select coalesce(sum(free_count + premium_count), 0) from public.question_bank_counts
          where exam = 'aptitude' and section = 'verbal' and topic = 'analogy')::int counted`);
    expect(served).toBeLessThanOrEqual(25);
    expect(counted).toBe(served);
    const u = await h.createUser();
    const [{ s }] = await h.asUser(u, (tx) => tx.sql("select public.start_exam_attempt(p_exam => 'aptitude', p_section => 'verbal', p_count => 25, p_topic => 'analogy') s"));
    expect(s.question_count).toBe(served); // every servable item, and nothing else
    const picked = await h.sql("select q.key, q.question_type from public.exam_attempt_items i join public.questions q on q.id = i.question_id where i.attempt_id = $1", [s.attempt_id]);
    expect(picked.map((x) => x.key)).toContain("av-801");
    expect(picked.map((x) => x.key)).not.toContain("av-802");
    expect(picked.every((x) => x.question_type === "mcq" || x.question_type === "true_false")).toBe(true);
    // staging rows (answer-derived keys in production) are not readable through PostgREST; legacy rows are
    const visible = await h.asAnon((tx) => tx.sql("select key from public.questions where key in ('av-801', 'av-802', 'av-001') order by key"));
    expect(visible.map((x) => x.key)).toEqual(["av-001"]);
  }, 180000);
});

// ============================================================================
describe("failures, isolation, dedup and retirement", () => {
  let h;
  let pg;
  beforeAll(async () => {
    h = await createDb();
    pg = await createPgliteExecutor({ harness: h });
  });
  afterAll(async () => {
    await h?.close();
  });

  it("resumes from the checkpoint after an injected failure (backoff 1/2/4/8 s, same run, nothing lost or doubled)", async () => {
    const dir = bankTree();
    const cacheDir = tmp("cache");
    const delays = [];
    let batches = 0;
    const flaky = recording(pg, async (fn) => {
      if (fn === "ce_import_batch" && ++batches >= 5) throw new ImportRpcError({ code: "network", message: "fetch failed", network: true });
    });
    const failed = importStaging({ target: "pglite", executor: flaky, stagingDir: dir, cacheDir, validate: false, batch: 7, sleep: async (ms) => delays.push(ms) });
    await expect(failed).rejects.toMatchObject({ code: "stopped" });
    expect(delays).toEqual(RETRY_DELAYS_MS);
    const cpPath = path.join(cacheDir, "import", "pglite", "checkpoint.json");
    expect(existsSync(cpPath)).toBe(true);
    const cp = JSON.parse(readFileSync(cpPath, "utf8"));
    expect(cp).toMatchObject({ manifest_sha: expect.stringMatching(/^[0-9a-f]{64}$/), batch_no: expect.any(Number), line: expect.any(Number) });
    expect(cp.run_id).toMatch(/^[0-9a-f-]{36}$/);

    // a changed manifest cannot resume
    const other = bankTree((r) => ({ ...r, questions: r.questions.slice(1) }));
    await expect(importStaging({ target: "pglite", executor: pg, stagingDir: other, cacheDir, validate: false, resume: true }))
      .rejects.toMatchObject({ code: "manifest_changed" });

    // resuming with other entities, or into a fresh in-memory database, is refused
    await expect(importStaging({ target: "pglite", executor: pg, stagingDir: dir, cacheDir, validate: false, resume: true, only: "questions" }))
      .rejects.toMatchObject({ code: "usage" });
    await expect(importStaging({ target: "pglite", stagingDir: dir, cacheDir, validate: false, resume: true }))
      .rejects.toMatchObject({ code: "usage", message: expect.stringMatching(/fresh in-memory database/) });
    expect(existsSync(cpPath)).toBe(true);

    const done = await importStaging({ target: "pglite", executor: pg, stagingDir: dir, cacheDir, validate: false, resume: true, batch: 7, sleep: noSleep });
    expect(done.run_id).toBe(cp.run_id);
    expect(done.run).toBe(cp.run);
    const plan = buildPlan(loadStaging(dir), { target: "pglite" });
    for (const { entity, rows } of plan.entities) {
      expect(done.entities[entity], entity).toMatchObject({ rows: rows.length, inserted: rows.length, rejected: 0 });
    }
    const [{ n, runs }] = await h.sql("select (select count(*) from public.questions where import_origin = 'staging')::int n, (select count(*) from public.content_import_runs)::int runs");
    expect(n).toBe(45);
    expect(runs).toBe(1);
    expect(existsSync(cpPath)).toBe(false);
  }, 240000);

  it("isolates bad rows: rejected and logged, the rest imported; a failing batch is split down to the row", async () => {
    const dir = bankTree((r) => {
      const orphan = { ...clone(r.questions.find((q) => q.id === "q-m1-math-2c3a4249d7")), id: "q-m1-math-aaaaaaaaaa", stem: "بلا درس؟" };
      orphan.curriculum = { ...orphan.curriculum, lesson: "middle/grade-1/math/n999" };
      const poison = { ...clone(r.questions.find((q) => q.id === "q-m1-math-f55ff16f66")), id: "q-m1-math-bbbbbbbbbb", stem: "سؤال سام؟" };
      r.objectives.push({ ...clone(r.objectives[0]), id: "obj-ffffffffff", lesson_node_id: "middle/grade-1/math/n999" });
      r.questions.push(orphan, poison);
      return r;
    });
    const ex = recording(pg, async (fn, args) => {
      // a row the database cannot take as part of a batch (e.g. a statement error): only its own marked retry passes
      if (fn === "ce_import_batch" && args.p_rows.some((row) => row.id === "q-m1-math-bbbbbbbbbb" && !row._import?.reject)) {
        throw new ImportRpcError({ code: "XX000", message: "batch failed" });
      }
    });
    const r = await importStaging({ target: "pglite", executor: ex, stagingDir: dir, cacheDir: tmp("cache"), validate: false, sleep: noSleep });
    const codes = Object.fromEntries(r.errors.map((e) => [e.key, e.code]));
    expect(codes).toEqual({ "obj-ffffffffff": "missing_reference", "q-m1-math-aaaaaaaaaa": "missing_reference", "q-m1-math-bbbbbbbbbb": "batch_error" });
    expect(r.entities.questions.rejected).toBe(2);
    expect(r.retire.refused).toBe(null); // nothing to retire in this manifest
    const logged = await h.sql("select entity, key, code from public.content_import_errors where run_id = $1 order by key", [r.run_id]);
    expect(logged.map((e) => [e.entity, e.key, e.code])).toEqual([
      ["objectives", "obj-ffffffffff", "missing_reference"],
      ["questions", "q-m1-math-aaaaaaaaaa", "missing_reference"],
      ["questions", "q-m1-math-bbbbbbbbbb", "batch_error"],
    ]);
    const events = readFileSync(r.log_path, "utf8").trim().split("\n").map((l) => JSON.parse(l).event);
    expect(events).toContain("split");
    expect(events).toContain("isolate");
    const present = await h.sql("select key from public.questions where key in ('q-m1-math-aaaaaaaaaa', 'q-m1-math-bbbbbbbbbb')");
    expect(present).toEqual([]);
  }, 240000);

  it("dedups against manifest content and retires only removed[] keys, before inserts", async () => {
    // import A, B, C with distinct hashes
    const base = (r) => {
      const qs = r.questions.filter((q) => q.scope === "curriculum" && q.curriculum.subject === "middle/grade-1/math").slice(0, 3);
      qs.forEach((q, i) => { q.content_hash = HASH(String(i + 1)); });
      return { ...r, questions: qs };
    };
    const cacheDir = tmp("cache");
    const first = await importStaging({ target: "pglite", executor: pg, stagingDir: bankTree(base), cacheDir, validate: false, sleep: noSleep });
    expect(first.errors).toEqual([]);
    const [a, b, c] = base(clone({ questions: BANK.questions })).questions.map((q) => q.id);

    // next manifest: C removed (its content reused by a new key D), plus E duplicating B's content
    const next = (r) => {
      const qs = base(r).questions;
      const d = { ...clone(qs[2]), id: "q-m1-math-dddddddddd" };
      const e = { ...clone(qs[1]), id: "q-m1-math-eeeeeeeeee" };
      return { ...r, questions: [qs[0], qs[1], d, e] };
    };
    const second = await importStaging({ target: "pglite", executor: pg, stagingDir: bankTree(next), cacheDir, validate: false, sleep: noSleep });
    expect(second.retire).toMatchObject({ requested: 1, retired: 1, refused: null });
    expect(second.errors).toEqual([{ entity: "questions", key: "q-m1-math-eeeeeeeeee", code: "duplicate_content", detail: { same_as: b } }]);
    const rows = await h.sql("select key, is_active, status from public.questions where key = any($1) order by key", [[a, b, c, "q-m1-math-dddddddddd"]]);
    expect(Object.fromEntries(rows.map((q) => [q.key, [q.is_active, q.status]]))).toEqual({
      [a]: [true, "published"], [b]: [true, "published"], [c]: [false, "retired"], "q-m1-math-dddddddddd": [true, "published"],
    });

    // keys outside removed[] are never retired by the RPC
    const run = await pg.rpc("ce_import_begin", { p_manifest: { schema: "manifest@1", sha256: "0".repeat(64), removed: [{ key: "q-m1-math-zzzzzzzzzz", reason: "gone" }] } });
    const res = await pg.rpc("ce_import_retire", { p_run: run, p_keys: [a, "q-m1-math-zzzzzzzzzz"] });
    expect(res).toEqual({ run, retired: 0, skipped: [{ key: a, reason: "not_in_manifest" }, { key: "q-m1-math-zzzzzzzzzz", reason: "not_found" }] });
    const [{ active }] = await h.sql("select is_active active from public.questions where key = $1", [a]);
    expect(active).toBe(true);
  }, 240000);

  it("retirement is refused for --only runs, runs with errors and filtered publish sets", async () => {
    const cacheDir = tmp("cache");
    const keep = (r) => ({ ...r, questions: r.questions.filter((q) => q.scope !== "curriculum" || q.curriculum.subject !== "middle/grade-1/science") });
    await importStaging({ target: "pglite", executor: pg, stagingDir: bankTree(), cacheDir, validate: false, sleep: noSleep });
    const science = BANK.questions.filter((q) => q.scope === "curriculum" && q.curriculum.subject === "middle/grade-1/science" && q.status === "published").map((q) => q.id);

    const only = await importStaging({ target: "pglite", executor: pg, stagingDir: bankTree(keep), cacheDir, validate: false, only: "questions", sleep: noSleep });
    expect(only.retire).toMatchObject({ refused: "only", retired: 0 });

    const withError = bankTree((r) => {
      r = keep(r);
      r.objectives.push({ ...clone(r.objectives[0]), id: "obj-eeeeeeeeee", lesson_node_id: "middle/grade-1/math/n999" });
      return r;
    });
    const errored = await importStaging({ target: "pglite", executor: pg, stagingDir: withError, cacheDir, validate: false, sleep: noSleep });
    expect(errored.retire).toMatchObject({ refused: "import_errors", retired: 0 });

    // --target supabase through a supabase-js-like client over the same database: iEN-derived
    // items are held back (publish_policy pending), so the publish set is filtered
    const client = { rpc: async (fn, args) => { try { return { data: await pg.rpc(fn, args), error: null }; } catch (e) { return { data: null, error: { code: e.code, message: e.message, details: e.details } }; } } };
    const supa = await createSupabaseExecutor({ client });
    const removedScience = science.map((key) => ({ key, reason: "rejected" }));
    const filtered = await importStaging({ target: "supabase", executor: supa, stagingDir: bankTree(keep, { removed: removedScience }), cacheDir, validate: false, reportDir: tmp("report"), sleep: noSleep });
    expect(filtered.filtered).toMatchObject({ publish_policy: true });
    expect(filtered.filtered.held_back).toBeGreaterThan(0);
    expect(filtered.retire).toMatchObject({ refused: "filtered_publish_set", retired: 0 });
    expect(filtered.entities.questions.rows).toBe(9); // only the internal aptitude items qualify
    expect(readdirSync(path.dirname(filtered.report_path))).toEqual([path.basename(filtered.report_path)]);

    const still = await h.sql("select count(*)::int n from public.questions where key = any($1) and is_active", [science]);
    expect(still[0].n).toBe(science.length);
    // a complete, clean run then retires them
    const clean = await importStaging({ target: "pglite", executor: pg, stagingDir: bankTree(keep), cacheDir, validate: false, sleep: noSleep });
    expect(clean.retire).toMatchObject({ refused: null, retired: science.length });
  }, 300000);
});
