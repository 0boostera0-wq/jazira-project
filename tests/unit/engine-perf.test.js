// Runtime bank at scale (docs/CONTENT_ENGINE.md §5.8, §3): a 60k-item synthetic
// bank packed by scripts/content/pack-runtime-bank.mjs; selections load only the
// picked content chunks and the parsed-file cache stays under the 64 MB LRU;
// path safety of the whitelist index (traversal attack tests).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildRuntimeBank, writeRuntimeBank } from "../../scripts/content/pack-runtime-bank.mjs";
import { createRuntimeBank, bankPoolSource, LRU_MAX_BYTES, READ_LOG_MAX, BankError } from "@/lib/exams/engine/runtime-bank.server";
import { createTree, parseScope, resolveScope } from "@/lib/exams/engine/scope";
import { selectSession } from "@/lib/exams/engine/select";
import { getTemplate, planCount } from "@/lib/exams/engine/exam-templates";

const SUBJECTS = 60;
const UNITS = 10;
const LESSONS = 10;
const PER_LESSON = 10;   // 60 × 10 × 10 × 10 = 60,000 items
const TMP = [];
let dir;
let nodes;
let tree;

const hex = (n) => n.toString(16).padStart(10, "0");
function syntheticStaging(root) {
  nodes = [
    { id: "middle", parent_id: null, kind: "stage", order: 1, title_ar: "م", status: "verified", term: null, term_status: "unknown" },
    { id: "middle/grade-1", parent_id: "middle", kind: "grade", order: 1, title_ar: "ص", status: "verified", term: null, term_status: "unknown" },
  ];
  const q = [];
  let n = 0;
  for (let s = 0; s < SUBJECTS; s++) {
    const subject = `middle/grade-1/sub${s}`;
    nodes.push({ id: subject, parent_id: "middle/grade-1", kind: "subject", order: s + 1, title_ar: `م${s}`, status: "verified", term: null, term_status: "unknown" });
    for (let u = 0; u < UNITS; u++) {
      const unit = `${subject}/n${s * 1000 + u}`;
      nodes.push({ id: unit, parent_id: subject, kind: "unit", order: u + 1, title_ar: `و${u}`, status: "verified", term: u < 5 ? "t1" : "t2", term_status: "inferred" });
      for (let l = 0; l < LESSONS; l++) {
        const lesson = `${subject}/n${s * 1000 + 100 + u * 10 + l}`;
        nodes.push({ id: lesson, parent_id: unit, kind: "lesson", order: l + 1, title_ar: `د${l}`, status: "verified", term: u < 5 ? "t1" : "t2", term_status: "inferred" });
        for (let i = 0; i < PER_LESSON; i++) {
          n += 1;
          const band = (i % 3) + 1;
          q.push(JSON.stringify({
            id: `q-m1-sub${s}-${hex(n)}`, revision: 1, scope: "curriculum", curriculum: { subject, lesson, term: u < 5 ? "t1" : "t2" }, prep: null, objective_id: null,
            question_type: "mcq", language: "ar", stem: `س${n}`,
            payload: { options: [{ id: "oa1", text: "أ" }, { id: "ob2", text: "ب" }, { id: "oc3", text: "ج" }], answer: { option_id: "oa1" }, fixed_order_reason: null },
            explanation: { text: "ش", steps: [] }, shuffle_options: true, time_limit_seconds: 60, difficulty_band: band,
            dedup: { exclusion_group: i === 9 ? `xg-${hex(n - 1)}` : i === 8 ? `xg-${hex(n)}` : null }, is_premium: i === 7, status: "published", source: null, stimulus_id: null,
          }));
        }
      }
    }
    const file = path.join(root, "questions", "middle", "grade-1", `sub${s}.jsonl`);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${q.splice(0).join("\n")}\n`);
  }
  mkdirSync(path.join(root, "curriculum", "nodes", "middle"), { recursive: true });
  writeFileSync(path.join(root, "curriculum", "nodes", "middle", "grade-1.jsonl"), `${nodes.map((x) => JSON.stringify(x)).join("\n")}\n`);
}

beforeAll(() => {
  const staging = mkdtempSync(path.join(tmpdir(), "jz-perf-staging-"));
  dir = mkdtempSync(path.join(tmpdir(), "jz-perf-bank-"));
  TMP.push(staging, dir);
  syntheticStaging(staging);
  const { files, report } = buildRuntimeBank({ stagingDir: staging, policy: "all" });
  expect(report.packed).toBe(SUBJECTS * UNITS * LESSONS * PER_LESSON);
  writeRuntimeBank(dir, files);
  tree = createTree(nodes);
}, 120_000);
afterAll(() => {
  for (const d of TMP) rmSync(d, { recursive: true, force: true });
});

async function startOn(bank, scope, template = "practice", seed = "0123456789abcdef0123456789abcdef") {
  const t = getTemplate(template);
  const parsed = parseScope(scope);
  const res = await resolveScope(tree, parsed);
  const src = bankPoolSource(bank);
  const rows = await src.rows(parsed, res);
  const plan = planCount(t, "guest", null);
  const sel = selectSession({ template: t, n: plan.n, minRequired: plan.min_required, seed, pool: rows });
  const content = await src.content(sel.items);
  return { sel, content };
}

describe("runtime bank with 60,000 items", () => {
  it("serves subject, unit and lesson scopes within the 64 MB LRU, loading only picked chunks", async () => {
    const bank = createRuntimeBank({ dir });
    expect(bank.stats().maxBytes).toBe(LRU_MAX_BYTES);
    const times = [];
    for (let i = 0; i < 180; i++) {
      const s = (i * 7) % SUBJECTS;
      const u = i % UNITS;
      const scope = i % 3 === 0 ? `middle/grade-1/sub${s}` : i % 3 === 1 ? `middle/grade-1/sub${s}/n${s * 1000 + u}` : `middle/grade-1/sub${s}/n${s * 1000 + 100 + u * 10 + (i % LESSONS)}`;
      const before = bank.stats().reads.length;
      const t0 = performance.now();
      const { sel, content } = await startOn(bank, scope, i % 3 === 2 ? "lesson-quiz" : "practice", i.toString(16).padStart(32, "0"));
      times.push(performance.now() - t0);
      expect(sel.ok).toBe(true);
      expect(content.size).toBe(sel.items.length);
      expect(sel.items.some((it) => it.premium)).toBe(false);
      const reads = bank.stats().reads.slice(before);
      expect(reads.every((p) => p.startsWith("sel/") || p.startsWith("c/"))).toBe(true);   // never a key chunk at start
      const chunks = new Set(sel.items.map((it) => `c/${it.chunk}.json`));
      for (const p of reads.filter((r) => r.startsWith("c/"))) expect(chunks.has(p)).toBe(true);
      expect(bank.stats().bytes).toBeLessThanOrEqual(LRU_MAX_BYTES);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)];
    expect(p95).toBeLessThan(400);
  }, 120_000);

  it("a small LRU evicts least-recently-used files and still answers correctly", async () => {
    const small = createRuntimeBank({ dir, maxBytes: 3 * 1024 * 1024 });
    for (let s = 0; s < 12; s++) {
      const { sel } = await startOn(small, `middle/grade-1/sub${s}`);
      expect(sel.ok).toBe(true);
      expect(small.stats().bytes).toBeLessThanOrEqual(3 * 1024 * 1024);
    }
    const again = await startOn(small, "middle/grade-1/sub0");
    const fresh = await startOn(createRuntimeBank({ dir }), "middle/grade-1/sub0");
    expect(again.sel.keys).toEqual(fresh.sel.keys);
  }, 60_000);
});

describe("runtime bank path safety (whitelist index)", () => {
  function evilBank(index, extra = {}) {
    const d = mkdtempSync(path.join(tmpdir(), "jz-evil-"));
    TMP.push(d);
    writeFileSync(path.join(d, "index.json"), JSON.stringify(index));
    for (const [rel, text] of Object.entries(extra)) {
      mkdirSync(path.dirname(path.join(d, rel)), { recursive: true });
      writeFileSync(path.join(d, rel), text);
    }
    return d;
  }
  const base = { schema: "runtime-bank-index@1", bank_revision: "0".repeat(32) };

  it("never resolves a path from a scope string or outside the bank", async () => {
    const outside = path.join(tmpdir(), "jz-outside-secret.json");
    writeFileSync(outside, JSON.stringify({ schema: "runtime-bank-sel@1", rows: [] }));
    const d = evilBank({ ...base, files: { "s-x": { path: "../jz-outside-secret.json", sha256: "0".repeat(64), bytes: 1 }, "s-y": { path: "sel/..json", sha256: "0".repeat(64), bytes: 1 } },
      nodes: { "middle/grade-1/math": { counts: { 1: 0, 2: 0, 3: 0 }, sel: "s-x" }, "middle/grade-1/sci": { counts: { 1: 0, 2: 0, 3: 0 }, sel: "../../etc" } } });
    const opened = [];
    const bank = createRuntimeBank({ dir: d, readFile: async (p) => { opened.push(p); return readFile(p); } });
    await expect(bank.rowsForNode("middle/grade-1/math")).rejects.toBeInstanceOf(BankError);
    await expect(bank.rowsForNode("middle/grade-1/sci")).rejects.toMatchObject({ code: "bank_file_unknown" });
    await expect(bank.selection("s-y")).rejects.toMatchObject({ code: "bank_file_unknown" });
    for (const scope of ["__proto__", "constructor", "../index", "middle/grade-1/math/../../..", "toString"]) {
      expect(await bank.nodeInfo(scope)).toBeNull();
      expect(await bank.rowsForNode(scope)).toBeNull();
    }
    await expect(bank.selection("__proto__")).rejects.toMatchObject({ code: "bank_file_unknown" });
    expect(opened.every((p) => path.resolve(p).startsWith(path.resolve(d) + path.sep))).toBe(true);
    rmSync(outside, { force: true });
  });

  it("refuses a file whose bytes or sha256 differ from the index", async () => {
    const body = JSON.stringify({ schema: "runtime-bank-sel@1", file_id: "s-a", scope: "middle/grade-1/math", columns: [], rows: [] });
    const d = evilBank({ ...base, files: { "s-a": { path: "sel/a.json", sha256: "f".repeat(64), bytes: Buffer.byteLength(body) } }, nodes: { "middle/grade-1/math": { counts: { 1: 0, 2: 0, 3: 0 }, sel: "s-a" } } }, { "sel/a.json": body });
    await expect(createRuntimeBank({ dir: d }).rowsForNode("middle/grade-1/math")).rejects.toMatchObject({ code: "bank_invalid" });
  });

  it("the read log of a long-lived bank stays bounded (no growth per request)", async () => {
    const bank = createRuntimeBank({ dir, maxBytes: 1 }); // nothing fits: every access re-reads
    const node = "middle/grade-1/sub0";
    for (let i = 0; i < READ_LOG_MAX + 500; i++) await bank.rowsForNode(node);
    expect(bank.stats().reads.length).toBeLessThanOrEqual(READ_LOG_MAX);
    expect(bank.stats().bytes).toBe(0);
  }, 60_000);

  it("a missing bank is an error the routes turn into 503", async () => {
    await expect(createRuntimeBank({ dir: path.join(tmpdir(), "jz-no-such-bank") }).index()).rejects.toBeTruthy();
  });
});
