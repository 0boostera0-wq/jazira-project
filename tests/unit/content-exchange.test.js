// WP4 — cross-AI exchange, primary records and the resolution matrix (docs/CONTENT_ENGINE.md §4.4).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { sha256Hex, U_MAX } from "@/lib/content/prng.js";
import { createPageStore } from "../../scripts/content/lib/checks.mjs";
import { loadStaging, main as checkMain, recordsFor, evidenceStore } from "../../scripts/content/check-questions.mjs";
import { main as ingestMain } from "../../scripts/content/ingest-candidates.mjs";
import { buildGenPacket } from "../../scripts/content/make-packets.mjs";
import {
  displaySeed, displayView, exportBatches, languageNeed, main as exchangeMain, planSampling, readResponse, resolverNeed, sampled, toCanonical,
} from "../../scripts/content/exchange.mjs";
import {
  addPrimaryRecords, evidenceOverlaps, main as resolveMain, resolveQuestion,
} from "../../scripts/content/resolve-validation.mjs";

const REPO = resolve(__dirname, "../..");
const FIXTURE = join(REPO, "tests/fixtures/content/staging");
const GEN = "run-20260927-gen-01";
const CHECK = "run-20260928-check-01";
const VAL = "run-20260928-val-01";
const XVAL = "run-20260928-xval-01";
const AT = "2026-09-27T09:30:00Z";
const LESSON = "middle/grade-1/math/n54";
const PAGE14 = "الأس يدل على عدد مرات ضرب الأساس في نفسه، ففي العبارة 3^4 يكون العدد 3 هو الأساس والعدد 4 هو الأس.";
const quiet = { log: () => {}, error: () => {}, warn: () => {} };

let tmp;
let stg;
let cache;
let ids; // { mcq, true_false, short_answer }

const CANDS = [
  {
    question_type: "mcq", item_style: "computation", difficulty: 2, stem: "ما قيمة 3^4؟",
    payload: { options: ["12", "64", "81", "7"], answer: { index: 2 }, fixed_order_reason: null },
    explanation: { text: "نضرب الأساس في نفسه بعدد مرات الأس.", steps: ["3 × 3 × 3 × 3 = 81"], method: "حساب القوة" },
    computation: { expr: "a^b", vars: { a: 3, b: 4 } },
    source: { pdf_page_start: 14, pdf_page_end: 14, evidence: [{ pdf_page: 14, quote: "العدد 3 هو الأساس", quote_kind: "fact" }] },
    objective_id: "obj-fa3d3bfb40", provenance: { origin: "transformed" },
  },
  {
    question_type: "true_false", item_style: "conceptual", difficulty: 1, stem: "العدد 3 في العبارة 3^4 هو الأساس.",
    payload: { answer: true }, explanation: { text: "الأساس هو العدد الذي يضرب في نفسه.", steps: [], method: null },
    source: { pdf_page_start: 14, pdf_page_end: 14, evidence: [] }, provenance: { origin: "transformed" },
  },
  {
    question_type: "short_answer", item_style: "definition", difficulty: 1, stem: "ما اسم العدد الذي يضرب في نفسه في القوة؟",
    payload: { accepted: ["الأساس"], match: "normalized_exact", max_chars: 20, answer_display: "الأساس" },
    explanation: { text: "الأساس هو العدد الذي يضرب في نفسه.", steps: [], method: null },
    source: { pdf_page_start: 14, pdf_page_end: 14, evidence: [] }, provenance: { origin: "transformed" },
  },
];

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), "jz-exchange-"));
  stg = join(tmp, "staging");
  cache = join(tmp, "cache");
  cpSync(FIXTURE, stg, { recursive: true });
  mkdirSync(join(cache, "extract", "ien-120607"), { recursive: true });
  writeFileSync(join(cache, "extract", "ien-120607", "pages.jsonl"), JSON.stringify({ pdf_page: 14, raw: PAGE14, repaired: PAGE14, method: "text", text_quality: "ok", run_id: "run-20260927-extract-01" }) + "\n");
  const img = join(cache, "ien", "pages", "1448-GE-ME-K07-SM1-math-part1");
  mkdirSync(img, { recursive: true });
  for (const p of ["p014", "p015", "p016"]) writeFileSync(join(img, `${p}.jpg`), Buffer.from([0xff, 0xd8]));
  const bank = loadStaging(stg);
  const pages = createPageStore({ root: cache, resources: bank.resources });
  const { packet } = buildGenPacket(bank, LESSON, { runId: GEN, pages, root: cache });
  writeFileSync(join(tmp, "packet.json"), JSON.stringify(packet));
  writeFileSync(join(tmp, "c.jsonl"), CANDS.map((c) => JSON.stringify(c)).join("\n") + "\n");
  expect(await ingestMain(["--run", GEN, "--packet", join(tmp, "packet.json"), "--file", join(tmp, "c.jsonl"), "--staging", stg, "--cache", cache, "--now", AT], quiet)).toBe(0);
  expect(await checkMain(["--run", CHECK, "--staging", stg, "--cache", cache, "--baseline", "none", "--now", "2026-09-28T09:00:00Z"], quiet)).toBe(0);
  const b = loadStaging(stg);
  ids = Object.fromEntries([...b.questions.values()].filter((q) => q.created_at === AT).map((q) => [q.question_type, q.id]));
  expect(Object.keys(ids).sort()).toEqual(["mcq", "short_answer", "true_false"]);
  for (const id of Object.values(ids)) expect(b.questions.get(id).validation.status).toBe("structural_pass");
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const xdir = () => join(stg, "validation/exchange", XVAL);
const readJsonl = (p) => readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const recordCount = () => [...loadStaging(stg).records.keys()].length;

describe("display views", () => {
  it("map display indexes back to canonical ids for every type", () => {
    const b = loadStaging(stg);
    const q = b.questions.get(ids.mcq);
    const v = displayView(q, displaySeed(VAL));
    expect(v.item.options[v.keyDisplay.option_index]).toBe("81");
    expect(toCanonical("mcq", v.map, v.keyDisplay)).toEqual({ option_id: q.payload.answer.option_id });
    expect(() => toCanonical("mcq", v.map, { option_index: 9 })).toThrow(/range/);
    expect(() => toCanonical("mcq", v.map, { option_index: 1, extra: 1 })).toThrow(/unexpected/);
    const order = { question_type: "ordering", id: "q-x", payload: { items: [{ id: "s1", text: "a" }, { id: "s2", text: "b" }, { id: "s3", text: "c" }], answer: { order: ["s1", "s2", "s3"] } } };
    const ov = displayView(order, "0".repeat(32));
    expect(ov.map.items).not.toEqual(["s1", "s2", "s3"]); // never shown in the answer order
    expect(toCanonical("ordering", ov.map, ov.keyDisplay)).toEqual({ order: ["s1", "s2", "s3"] });
    expect(() => toCanonical("ordering", ov.map, { order: [0, 0, 1] })).toThrow(/permutation/);
  });
});

describe("sampling (§4.4)", () => {
  const plain = { id: "q-m1-math-0123456789", scope: "curriculum", question_type: "true_false", item_style: "conceptual", difficulty: 1, provenance: { origin: "transformed" }, curriculum: { subject: "middle/grade-1/arabic" }, language: "ar" };
  const manifest = { sampling: planSampling({ seed: "a".repeat(32) }) };

  it("routes high-risk, aptitude and legacy items to 100 % blind solve", () => {
    expect(resolverNeed({ ...plain, question_type: "numeric" }, manifest, null)).toBe("required");
    expect(resolverNeed({ ...plain, difficulty: 4 }, manifest, null)).toBe("required");
    expect(resolverNeed({ ...plain, scope: "aptitude" }, null, null)).toBe("required");
    expect(resolverNeed({ ...plain, id: "aq-001", provenance: { origin: "internal_authored" } }, null, null)).toBe("required");
    expect(resolverNeed(plain, manifest, { checks: [{ code: "L003", result: "warn" }] })).toBe("required");
  });

  it("the pilot manifest requests a blind solve for every item", () => {
    const pilot = { sampling: planSampling({ pilot: true, seed: "b".repeat(32) }) };
    expect(pilot.sampling.rates).toMatchObject({ chatgpt_stem: 1, chatgpt_other: 1 });
    for (let i = 0; i < 200; i++) expect(resolverNeed({ ...plain, id: `q-m1-arabic-${String(i).padStart(10, "0")}` }, pilot, null)).toBe("sampled");
  });

  it("samples reproducibly at the planned rate and enforces the floors", () => {
    const n = 4000;
    let hits = 0;
    for (let i = 0; i < n; i++) if (sampled("c".repeat(32), "xval:chatgpt", `q-${i}`, 0.1)) hits++;
    expect(hits / n).toBeGreaterThan(0.08);
    expect(hits / n).toBeLessThan(0.12);
    expect(sampled("c".repeat(32), "xval:chatgpt", "q-7", 0.1)).toBe(sampled("c".repeat(32), "xval:chatgpt", "q-7", 0.1));
    expect(() => planSampling({ rateStem: 0.1 })).toThrow(/floors/);
    expect(U_MAX).toBe(2 ** 52);
    expect(languageNeed({ ...plain, language: "en" }, null, null)).toBe("required");
  });
});

// ── export / import ─────────────────────────────────────────────────────────
/** A response line answering an exported item correctly (or wrongly) from its meta map. */
function answerFor(meta, id, { wrong = false } = {}) {
  const b = loadStaging(stg);
  const q = b.questions.get(id);
  const it = meta.items.find((x) => x.id === id);
  if (q.question_type === "short_answer") return { text: wrong ? "الأس" : "الأساس" };
  const correct = it.map.options.indexOf(q.payload.answer.option_id);
  return { option_index: wrong ? (correct + 1) % it.map.options.length : correct };
}

describe("exchange export / import", () => {
  it("plans the pilot run (100 % blind solve, DeepSeek unavailable)", async () => {
    expect(await exchangeMain(["plan", "--run", XVAL, "--pilot", "--seed", "d".repeat(32), "--rate-language", "1", "--staging", stg], quiet)).toBe(0);
    const m = JSON.parse(readFileSync(join(stg, "validation/runs", `${XVAL}.json`), "utf8"));
    expect(m.sampling).toEqual({ seed: "d".repeat(32), pilot: true, rates: { chatgpt_stem: 1, chatgpt_other: 1, language: 1 } });
    expect(m.agents.deepseek).toBe("unavailable");
    expect(await exchangeMain(["plan", "--run", XVAL, "--rate-other", "0.05", "--staging", stg], quiet)).toBe(1);
  });

  it("exports ≤ 25-item batches with only Jazira-authored item text", async () => {
    expect(await exchangeMain(["export", "--agent", "chatgpt", "--run", XVAL, "--batch-size", "2", "--staging", stg], quiet)).toBe(0);
    const files = readdirSync(xdir()).filter((f) => f.startsWith("chatgpt-") && f.endsWith(".request.jsonl")).sort();
    expect(files).toEqual(["chatgpt-001.request.jsonl", "chatgpt-002.request.jsonl"]);
    const lines = readFileSync(join(xdir(), files[0]), "utf8").split("\n").filter(Boolean);
    const header = JSON.parse(lines[0])._batch;
    expect(header).toMatchObject({ run: XVAL, agent: "chatgpt_web", prompt_version: "chatgpt-resolve.v1", count: 2 });
    expect(header.sha256).toBe(sha256Hex(lines.slice(1).join("\n") + "\n"));
    const all = files.flatMap((f) => readFileSync(join(xdir(), f), "utf8").split("\n").filter(Boolean).slice(1));
    const text = all.join("\n");
    for (const forbidden of ["answer", "explanation", "content_hash", "payload", "pages", "image", "quote", "evidence", "option_id"]) expect(text).not.toContain(`"${forbidden}"`);
    expect(text).not.toContain("العدد 3 هو الأساس"); // the evidence quote (textbook text) never leaves the cache
    expect(text).not.toContain("يكون العدد 3");
    for (const line of all) expect(Object.keys(JSON.parse(line)).sort()).toEqual(expect.arrayContaining(["id", "input", "language", "stem", "stimulus"]));
    // a second export in the same run does not repeat items
    expect(await exchangeMain(["export", "--agent", "chatgpt", "--run", XVAL, "--staging", stg], quiet)).toBe(0);
    expect(readdirSync(xdir()).filter((f) => f.endsWith(".request.jsonl") && f.startsWith("chatgpt"))).toHaveLength(2);
  });

  it("gives Gemini the key and explanation, still without page text", async () => {
    expect(await exchangeMain(["export", "--agent", "gemini", "--run", XVAL, "--staging", stg], quiet)).toBe(0);
    const items = readFileSync(join(xdir(), "gemini-001.request.jsonl"), "utf8").split("\n").filter(Boolean).slice(1).map((l) => JSON.parse(l));
    expect(items.length).toBe(3);
    for (const it of items) {
      expect(it).toHaveProperty("key");
      expect(it).toHaveProperty("explanation");
    }
    expect(JSON.stringify(items)).not.toContain("يكون العدد 3");
  });

  it("rejects malformed, foreign-id, repeated, extra-field and out-of-range responses (nothing written)", async () => {
    const meta = JSON.parse(readFileSync(join(xdir(), "chatgpt-001.meta.json"), "utf8"));
    const [a, b] = meta.items.map((x) => x.id);
    const resp = join(xdir(), "chatgpt-001.response.jsonl");
    const good = (id) => ({ id, answer: answerFor(meta, id), confidence: 0.9, method: "حل مباشر" });
    const before = recordCount();
    const cases = [
      [JSON.stringify(good(a)), "Here are my answers:"].join("\n"),
      [JSON.stringify(good(a)), JSON.stringify({ ...good(b), id: "q-m1-math-ffffffffff" })].join("\n"),
      [JSON.stringify(good(a)), JSON.stringify(good(a))].join("\n"),
      JSON.stringify({ ...good(a), extra: true }),
      JSON.stringify({ ...good(a), answer: { option_index: 99 } }),
      JSON.stringify({ ...good(a), confidence: 3 }),
      "",
    ];
    for (const body of cases) {
      writeFileSync(resp, body);
      expect(await exchangeMain(["import", "--file", resp, "--staging", stg], quiet)).toBe(1);
      expect(recordCount()).toBe(before);
    }
    // a tampered request batch is refused too
    const req = join(xdir(), "chatgpt-001.request.jsonl");
    const original = readFileSync(req, "utf8");
    writeFileSync(req, original.replace("ما قيمة", "ما ناتج"));
    writeFileSync(resp, JSON.stringify(good(a)));
    expect(() => readResponse(loadStaging(stg), resp)).toThrow(/modified/);
    writeFileSync(req, original);
  });

  it("imports valid responses as resolver records (pass / disagree)", async () => {
    for (const name of ["chatgpt-001", "chatgpt-002"]) {
      const meta = JSON.parse(readFileSync(join(xdir(), `${name}.meta.json`), "utf8"));
      const lines = meta.items.map((it) => JSON.stringify({ id: it.id, answer: answerFor(meta, it.id, { wrong: it.id === ids.true_false }), confidence: 0.8, method: "حل" }));
      writeFileSync(join(xdir(), `${name}.response.jsonl`), lines.join("\n") + "\n");
      expect(await exchangeMain(["import", "--file", join(xdir(), `${name}.response.jsonl`), "--staging", stg, "--now", "2026-09-28T11:00:00Z"], quiet)).toBe(0);
    }
    const b = loadStaging(stg);
    const rec = (id) => b.records.get(`${XVAL}:${id}:resolver`);
    expect(rec(ids.mcq)).toMatchObject({ role: "resolver", agent: "chatgpt_web", verdict: "pass", blind_answer: { option_id: b.questions.get(ids.mcq).payload.answer.option_id } });
    expect(rec(ids.true_false).verdict).toBe("disagree");
    expect(rec(ids.short_answer)).toMatchObject({ verdict: "pass", blind_answer: { text: "الأساس" } });
    const gmeta = JSON.parse(readFileSync(join(xdir(), "gemini-001.meta.json"), "utf8"));
    writeFileSync(join(xdir(), "gemini-001.response.jsonl"), gmeta.items.map((it) => JSON.stringify({ id: it.id, verdict: it.id === ids.short_answer ? "warn" : "pass", issues: it.id === ids.short_answer ? [{ code: "style", span: "في القوة", suggestion: "في العبارة الأسية" }] : [] })).join("\n"));
    expect(await exchangeMain(["import", "--file", join(xdir(), "gemini-001.response.jsonl"), "--staging", stg], quiet)).toBe(0);
    expect(loadStaging(stg).records.get(`${XVAL}:${ids.short_answer}:language`)).toMatchObject({ role: "language", agent: "gemini_web", verdict: "warn" });
  });
});

// ── primary records and resolution (CLI) ───────────────────────────────────
describe("resolve-validation", () => {
  function primaryLine(b, id, { wrong = false, support = "supported" } = {}) {
    const q = b.questions.get(id);
    const view = displayView(q, displaySeed(VAL));
    const blind = q.question_type === "short_answer" ? { text: "الأساس" } : { option_index: wrong ? (view.keyDisplay.option_index + 1) % view.map.options.length : view.keyDisplay.option_index };
    return { schema: "validation-record@1", question_id: id, revision: q.revision, content_hash: q.content_hash, role: "primary", agent: "claude_subagent", run_id: VAL, prompt_version: "validate.v1", checked_at: "2026-09-28T10:00:00Z", verdict: "pass", checks: [], blind_answer: blind, support, ambiguity: "none", difficulty_estimate: 2, issues: [], notes: null };
  }

  it("imports primary records (display → canonical) and applies the evidence extractor", () => {
    const b = loadStaging(stg);
    const q = b.questions.get(ids.mcq);
    const store = evidenceStore(cache);
    const pages = createPageStore({ root: cache, resources: b.resources });
    const [rec] = addPrimaryRecords(b, [primaryLine(b, ids.mcq)], { runId: VAL, spans: [{ question_id: q.id, revision: 1, spans: [{ pdf_page: 14, quote: "يكون العدد 3 هو الأساس والعدد 4" }] }], pages, evidence: store });
    expect(rec.blind_answer).toEqual({ option_id: q.payload.answer.option_id });
    expect(rec.issues).toContainEqual({ code: "evidence_extractor", span: "overlap", suggestion: null });
    const [miss] = addPrimaryRecords(b, [primaryLine(b, ids.mcq)], { runId: VAL, spans: [{ question_id: q.id, revision: 1, spans: [{ pdf_page: 14, quote: "الأس يدل على عدد مرات ضرب" }] }], pages, evidence: store });
    expect(miss.support).toBe("unsupported");
    // a short generator quote inside the extractor's longer span overlaps (both directions)
    const short = "مح = 2 ل + 2 ض";
    const qs = { ...q, source: { ...q.source, evidence: [{ pdf_page: 99, quote_sha256: sha256Hex(short), char_offsets: [0, 0], quote_kind: "fact" }] } };
    const ev = { get: () => [{ question_id: q.id, revision: 1, pdf_page: 99, quote_sha256: sha256Hex(short), quote_kind: "fact", quote: short }] };
    expect(evidenceOverlaps(qs, [{ pdf_page: 99, quote: "مح = ل + ل + ض + ض = 2 ل + 2 ض" }], { pages: null, evidence: ev })).toBe(false); // differs after «=»: not the same text
    expect(evidenceOverlaps(qs, [{ pdf_page: 99, quote: "المحيط مح = 2 ل + 2 ض للمستطيل" }], { pages: null, evidence: ev })).toBe(true);
    expect(evidenceOverlaps(qs, [{ pdf_page: 98, quote: "المحيط مح = 2 ل + 2 ض للمستطيل" }], { pages: null, evidence: ev })).toBe(false); // another page
    expect(() => addPrimaryRecords(b, [{ ...primaryLine(b, ids.mcq), revision: 2 }], { runId: VAL })).toThrow(/revision/);
    expect(() => addPrimaryRecords(b, [{ ...primaryLine(b, ids.mcq), run_id: "run-20260928-val-09" }], { runId: VAL })).toThrow(/run/);
    expect(() => addPrimaryRecords(b, [{ ...primaryLine(b, ids.mcq), blind_answer: { option_id: "o123456" } }], { runId: VAL })).toThrow(/display form/);
  });

  it("resolves: agreement → validated, disagreement → review_required, missing → pending", async () => {
    const b = loadStaging(stg);
    const file = join(tmp, "primary.jsonl");
    writeFileSync(file, [primaryLine(b, ids.mcq), primaryLine(b, ids.true_false), primaryLine(b, ids.short_answer)].map((r) => JSON.stringify(r)).join("\n"));
    const spans = join(tmp, "spans.jsonl");
    writeFileSync(spans, JSON.stringify({ question_id: ids.mcq, revision: 1, spans: [{ pdf_page: 14, quote: "العدد 3 هو الأساس" }] }) + "\n");
    expect(await resolveMain(["add-records", "--run", VAL, "--file", file, "--evidence", spans, "--staging", stg, "--cache", cache], quiet)).toBe(0);
    expect(await resolveMain(["resolve", "--run", VAL, "--xval", XVAL, "--staging", stg, "--now", "2026-09-28T12:00:00Z"], quiet)).toBe(0);
    const after = loadStaging(stg);
    expect(after.questions.get(ids.mcq)).toMatchObject({ status: "validated", validation: { status: "validated", checked_revision: 1 } });
    expect(after.questions.get(ids.true_false).status).toBe("review_required"); // ChatGPT disagreed
    expect(after.questions.get(ids.short_answer).status).toBe("validated"); // language warn recorded
    expect(after.reviewQueue.map((r) => r.question_id)).toContain(ids.true_false);
    expect(after.reviewQueue.find((r) => r.question_id === ids.true_false).reason).toMatch(/resolver/);
  });

  it("applies review decisions as human records (accept_key, set_key, reject)", async () => {
    const b = loadStaging(stg);
    const tf = b.questions.get(ids.true_false);
    writeFileSync(join(stg, "validation/review-decisions.jsonl"), [
      ...readJsonl(join(FIXTURE, "validation/review-decisions.jsonl")),
      { schema: "review-decision@1", question_id: tf.id, revision: 1, decision: "set_key", answer: { option_id: "f" }, reviewer: "owner", decided_at: "2026-09-28T13:00:00Z", note: "the reviewer corrects the key" },
    ].map((r) => JSON.stringify(r)).join("\n") + "\n");
    expect(await resolveMain(["resolve", "--run", "run-20260928-val-02", "--staging", stg, "--now", "2026-09-28T13:30:00Z"], quiet)).toBe(0);
    const after = loadStaging(stg);
    const q = after.questions.get(tf.id);
    expect(q).toMatchObject({ revision: 2, status: "candidate", payload: { answer: { option_id: "f" } }, validation: { status: "pending" } });
    expect(after.records.get(`run-20260928-val-02:${tf.id}:human`)).toMatchObject({ role: "human", agent: "human:owner", verdict: "disagree", revision: 1 });
    expect(after.reviewQueue.map((r) => r.question_id)).not.toContain(tf.id);
  });
});

// ── the resolution matrix, exhaustively ────────────────────────────────────
describe("resolution matrix (§4.4) — exhaustive", () => {
  const Q = {
    id: "q-m1-arabic-0123456789", revision: 1, content_hash: `n2:sha256:${"0".repeat(64)}`, scope: "curriculum", question_type: "true_false",
    item_style: "conceptual", difficulty: 1, language: "ar", curriculum: { subject: "middle/grade-1/arabic", lesson: "middle/grade-1/arabic/n1" },
    payload: { options: [{ id: "t", text: "صح" }, { id: "f", text: "خطأ" }], answer: { option_id: "t" } }, status: "candidate",
    provenance: { origin: "transformed" }, source: { source_id: "ien", resource_id: "ien-1", pdf_page_start: 1, pdf_page_end: 1, evidence: [] },
  };
  const rec = (role, extra) => ({ role, checked_at: "2026-09-28T10:00:00Z", id: role, verdict: "pass", checks: [], blind_answer: null, support: null, ambiguity: null, issues: [], ...extra });
  const RIGHT = { option_id: "t" };
  const WRONG = { option_id: "f" };
  const pass = { code: "S001", result: "pass", detail: null };
  const DET = {
    none: null,
    pass: rec("deterministic", { checks: [pass] }),
    warn: rec("deterministic", { verdict: "warn", checks: [pass, { code: "L003", result: "warn", detail: "x" }] }),
    hard: rec("deterministic", { verdict: "fail", checks: [{ code: "O003", result: "fail", detail: "x" }] }),
    review: rec("deterministic", { verdict: "fail", checks: [{ code: "P006", result: "fail", detail: "x" }] }),
    not_checked: rec("deterministic", { verdict: "warn", checks: [{ code: "E001", result: "warn", detail: "not_checked: page 1" }] }),
  };
  const EX = { code: "evidence_extractor", span: "overlap", suggestion: null };
  const PRIMARY = {
    none: null,
    right: rec("primary", { blind_answer: RIGHT, support: "supported", ambiguity: "none", issues: [EX] }),
    wrong: rec("primary", { blind_answer: WRONG, support: "supported", ambiguity: "none", issues: [EX] }),
    no_blind: rec("primary", { support: "supported", ambiguity: "none", issues: [EX] }),
    fail: rec("primary", { verdict: "fail", blind_answer: RIGHT, support: "supported", ambiguity: "none", issues: [EX] }),
    disagree: rec("primary", { verdict: "disagree", blind_answer: WRONG, support: "supported", ambiguity: "none", issues: [EX] }),
    abstain: rec("primary", { verdict: "abstain", blind_answer: RIGHT, support: "supported", ambiguity: "none", issues: [EX] }),
    ambiguous: rec("primary", { blind_answer: RIGHT, support: "supported", ambiguity: "ambiguous", issues: [EX] }),
    unsupported: rec("primary", { blind_answer: RIGHT, support: "unsupported", ambiguity: "none", issues: [EX] }),
    not_checked: rec("primary", { blind_answer: RIGHT, support: "not_checked", ambiguity: "none", issues: [EX] }),
    no_overlap: rec("primary", { blind_answer: RIGHT, support: "supported", ambiguity: "none", issues: [{ ...EX, span: "no_overlap" }] }),
  };
  const RESOLVER = { none: null, right: rec("resolver", { blind_answer: RIGHT }), wrong: rec("resolver", { verdict: "disagree", blind_answer: WRONG }) };
  const LANGUAGE = { none: null, pass: rec("language", {}), warn: rec("language", { verdict: "warn" }), fail: rec("language", { verdict: "fail" }) };
  const MANIFESTS = { none: null, pilot: { sampling: { seed: "e".repeat(32), pilot: true, rates: { chatgpt_stem: 1, chatgpt_other: 1, language: 0 } } } };

  /** The expected outcome, written from the §4.4 table independently of the implementation. */
  function oracle({ det, primary, resolver, language, manifest }) {
    if (det === "none") return "pending";
    if (det === "hard") return "rejected";
    if (det === "review" || det === "not_checked") return "review_required";
    if (primary === "none") return "pending";
    if (["fail", "disagree", "abstain", "no_blind", "wrong", "ambiguous", "unsupported", "not_checked"].includes(primary)) return "review_required";
    const highRisk = det === "warn"; // any Stage 1 warn makes the item high-risk
    if (highRisk && primary === "no_overlap") return "review_required";
    const needResolver = manifest === "pilot" || highRisk;
    const needLanguage = det === "warn"; // an L* warning
    // a resolver answer that exists is always compared, sampled or not (§1.7)
    if (resolver === "wrong") return "review_required";
    if (needResolver && resolver === "none") return "pending";
    if (needLanguage && language === "none") return "pending";
    if (language === "fail") return "review_required";
    return "validated";
  }

  it("matches the table on every combination and never validates a disagreement", () => {
    let n = 0;
    for (const det of Object.keys(DET)) {
      for (const primary of Object.keys(PRIMARY)) {
        for (const resolver of Object.keys(RESOLVER)) {
          for (const language of Object.keys(LANGUAGE)) {
            for (const manifest of Object.keys(MANIFESTS)) {
              const records = [DET[det], PRIMARY[primary], RESOLVER[resolver], LANGUAGE[language]].filter(Boolean);
              const r = resolveQuestion(Q, records, { manifest: MANIFESTS[manifest] });
              const want = oracle({ det, primary, resolver, language, manifest });
              const got = r.pending ? "pending" : r.status;
              expect(got, JSON.stringify({ det, primary, resolver, language, manifest, reason: r.reason })).toBe(want);
              const disagreement = ["wrong", "disagree"].includes(primary) || resolver === "wrong";
              if (disagreement) expect(got).not.toBe("validated");
              n++;
            }
          }
        }
      }
    }
    expect(n).toBe(6 * 11 * 3 * 4 * 2);
  });

  it("human decisions override the matrix", () => {
    const d = (decision) => resolveQuestion(Q, [], { decision: { decision } });
    expect(d("accept_key")).toMatchObject({ status: "validated", validation: "validated" });
    expect(d("reject")).toMatchObject({ status: "rejected" });
    expect(d("repair")).toMatchObject({ status: "review_required" });
    expect(d("set_key")).toMatchObject({ action: "set_key" });
  });

  it("accept_key cannot validate an item whose explanation is missing (P006)", () => {
    const accept = { decision: { decision: "accept_key" } };
    expect(resolveQuestion(Q, [DET.review], accept)).toMatchObject({ status: "review_required" });
    expect(resolveQuestion(Q, [DET.review], accept).reason).toMatch(/P006/);
    expect(resolveQuestion(Q, [DET.not_checked], accept)).toMatchObject({ status: "validated" }); // the human read the page
  });

  it("an unsampled resolver that disagrees still sends the item to review", () => {
    expect(resolveQuestion(Q, [DET.pass, PRIMARY.right, RESOLVER.wrong], {})).toMatchObject({ status: "review_required" });
    expect(resolveQuestion(Q, [DET.pass, PRIMARY.right, RESOLVER.right], {})).toMatchObject({ status: "validated" });
  });

  it("aptitude items need both blind solves", () => {
    const apt = { ...Q, scope: "aptitude", curriculum: null, prep: { exam: "aptitude", section: "verbal", topic: "analogy" }, provenance: { origin: "generated_practice" }, source: null };
    expect(resolveQuestion(apt, [DET.pass, PRIMARY.right], {}).pending).toBe(true);
    expect(resolveQuestion(apt, [DET.pass, PRIMARY.right, RESOLVER.right], {}).status).toBe("validated");
    expect(resolveQuestion(apt, [DET.pass, PRIMARY.right, RESOLVER.wrong], {}).status).toBe("review_required");
  });
});

