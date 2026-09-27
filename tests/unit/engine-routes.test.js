// Guest session API (docs/CONTENT_ENGINE.md §5.7, §5.8): /api/exams/session/{start,check,submit}
// over the runtime-bank fixture — payload minimization and attack tests, receipts,
// deadlines, the key-reveal cap, revision voiding, the service-role RPC path, the
// secret policy, and tests/fixtures/content/grading-cases.json through the route path.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash, createHmac } from "node:crypto";

vi.mock("@/lib/supabase-admin", () => ({ createAdminClient: () => globalThis.__jzAdmin ?? null }));
vi.mock("@/lib/supabase-env", () => ({ isSupabaseConfigured: true, SUPABASE_URL: "", SUPABASE_KEY: "" }));
vi.mock("@/lib/supabase-server", () => ({
  createClient: async () => globalThis.__jzServer ?? null,
  getRouteUser: async () => ({ supabase: globalThis.__jzServer ?? null, user: globalThis.__jzRouteUser ?? null }),
}));
vi.mock("@/lib/curriculum-outline", () => ({
  nodeById: async (id) => globalThis.__jzTree.nodeById(id),
  lessonsUnder: async (id) => globalThis.__jzTree.lessonsUnder(id),
  subjectTerms: async (id) => globalThis.__jzTree.subjectTerms(id),
}));
vi.mock("@/lib/supabase-lazy", () => ({ getSupabase: async () => globalThis.__jzBrowser ?? null }));
vi.mock("@/lib/content/prng", async (importOriginal) => {
  const m = await importOriginal();
  return { ...m, newSeed: () => globalThis.__jzSeed ?? m.newSeed() };
});

import { POST as start } from "@/app/api/exams/session/start/route";
import { POST as check } from "@/app/api/exams/session/check/route";
import { POST as submit } from "@/app/api/exams/session/submit/route";
import { createTree } from "@/lib/exams/engine/scope";
import { getTemplate } from "@/lib/exams/engine/exam-templates";
import { displayMaps } from "@/lib/exams/engine/shuffle";
import { correctDisplay, toDisplay } from "@/lib/exams/engine/grade";
import { createRuntimeBank, resetRuntimeBank } from "@/lib/exams/engine/runtime-bank.server";
import { decodeTokenPayload, HANDLE_RE, itemHandles, openSeen, verifySessionToken } from "@/lib/exams/engine/session-token";
import { canonicalAnswer } from "@/lib/content/answers";
import { contentHash } from "@/lib/content/ids";
import { searchNormalize } from "@/lib/content/normalize";
import { buildRuntimeBank, writeRuntimeBank } from "../../scripts/content/pack-runtime-bank.mjs";
import * as exams from "@/lib/data/exams";
import { checkItem, seenBlob } from "@/lib/data/exam-sessions";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const BANK_DIR = path.join(ROOT, "tests/fixtures/engine/runtime-bank");
const SOURCE = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/engine/bank-source.json"), "utf8"));
const GRADING = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/content/grading-cases.json"), "utf8")).cases;
const RPC = (name) => JSON.parse(readFileSync(path.join(ROOT, `tests/fixtures/contracts/rpc/${name}.json`), "utf8"));
const SEED_A = "0123456789abcdef0123456789abcdef";
const TMP = [];

/** A staging tree from records (the same layout pack-runtime-bank reads). */
function materialize(source, dir) {
  const w = (rel, text) => {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  };
  const jl = (rows) => rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
  w("sources/registry.json", `${JSON.stringify(source.registry ?? [], null, 2)}\n`);
  w("curriculum/nodes/middle/grade-1.jsonl", jl(source.nodes));
  w("curriculum/objectives/middle/grade-1.jsonl", jl(source.objectives ?? []));
  w("resources/resources.jsonl", jl(source.resources ?? []));
  w("questions/stimuli/middle/grade-1/math.jsonl", jl(source.stimuli ?? []));
  const groups = new Map();
  for (const q of source.questions) {
    const rel = q.scope === "curriculum" ? `questions/${q.curriculum.subject}.jsonl` : `questions/prep/${q.prep.exam}-${q.prep.section}.jsonl`;
    if (!groups.has(rel)) groups.set(rel, []);
    groups.get(rel).push(q);
  }
  for (const [rel, rows] of groups) w(rel, jl(rows));
}
/** Pack a bank from records into a temp dir; returns the dir. */
function packTemp(source) {
  const staging = mkdtempSync(path.join(tmpdir(), "jz-staging-"));
  const out = mkdtempSync(path.join(tmpdir(), "jz-bank-"));
  TMP.push(staging, out);
  materialize(source, staging);
  const { files } = buildRuntimeBank({ stagingDir: staging, policy: "all" });
  writeRuntimeBank(out, files);
  return out;
}
const useBank = (dir) => {
  process.env.RUNTIME_BANK_DIR = dir;
  resetRuntimeBank();
};

let ipCounter = 0;
const nextIp = () => `198.51.100.${(ipCounter++ % 250) + 1}`;
function req(url, body, { ip = nextIp(), headers = {} } = {}) {
  return new Request(`https://jazira.test${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip, host: "jazira.test", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
const call = async (handler, url, body, opts) => {
  const res = await handler(req(url, body, opts));
  return { status: res.status, body: await res.json() };
};
const doStart = (body, opts) => call(start, "/api/exams/session/start", body, opts);
const doCheck = (body, opts) => call(check, "/api/exams/session/check", body, opts);
const doSubmit = (body, opts) => call(submit, "/api/exams/session/submit", body, opts);

/** The server's view of a token (keys, seed and revisions decrypted): the test is the server here, never the browser. */
const serverView = (token) => verifySessionToken(token, { anyTime: true }).data;
/** handle → canonical key of a session (server side). */
const keyOfHandle = (token) => {
  const t = serverView(token);
  return new Map(itemHandles(t.sid, t.q).map((h, i) => [h, t.q[i]]));
};
/** Questions without their per-session handle (two sessions of the same selection compare equal). */
const unkeyed = (questions) => questions.map(({ key: _k, ...rest }) => rest);

/** Content, keys and display maps of a started session (the server's view of the token: keys and seed). */
async function sessionView(startBody, dir = BANK_DIR) {
  const bank = createRuntimeBank({ dir });
  const t = serverView(startBody.token);
  const template = getTemplate(t.tpl, t.tv);
  const nodes = Object.keys((await bank.index()).nodes);
  const rows = new Map();
  for (const n of nodes) for (const r of (await bank.rowsForNode(n)) ?? []) rows.set(r.key, r);
  const picked = t.q.map((k) => rows.get(k));
  const content = await bank.content(picked);
  const keys = await bank.keys(picked);
  return t.q.map((k, i) => {
    const item = content.get(k);
    const key = keys.get(k);
    const maps = displayMaps(t.sd, item, { template, answerOrder: key.payload?.answer?.order ?? null });
    return { position: i + 1, key: k, item, answer: key, maps, correct: correctDisplay(item, key, maps) };
  });
}

const ENV = ["LOCAL_EXAM_SECRET", "EXAM_SECRET_REQUIRED", "RUNTIME_BANK_DIR", "EXAM_KEY_REVEAL_DAILY", "GEMINI_API_KEY"];
const savedEnv = {};
beforeAll(() => {
  for (const k of ENV) savedEnv[k] = process.env[k];
});
beforeEach(() => {
  process.env.LOCAL_EXAM_SECRET = "route-test-secret-".padEnd(40, "x");
  delete process.env.EXAM_SECRET_REQUIRED;
  delete process.env.EXAM_KEY_REVEAL_DAILY;
  useBank(BANK_DIR);
  globalThis.__jzTree = createTree(SOURCE.nodes);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  delete globalThis.__jzAdmin;
  delete globalThis.__jzServer;
  delete globalThis.__jzRouteUser;
  delete globalThis.__jzSeed;
  vi.useRealTimers();
  vi.restoreAllMocks();
});
afterAll(() => {
  for (const k of ENV) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  resetRuntimeBank();
  for (const d of TMP) rmSync(d, { recursive: true, force: true });
});

const bankIds = () => {
  const ids = new Set();
  for (const f of readdirSync(path.join(BANK_DIR, "c"))) {
    for (const it of JSON.parse(readFileSync(path.join(BANK_DIR, "c", f), "utf8")).items) {
      for (const list of [it.public.options, it.public.left, it.public.right, it.public.items]) for (const o of list ?? []) if (o.id.length > 1) ids.add(o.id);
    }
  }
  return ids;
};
const premiumKeys = new Set(SOURCE.questions.filter((q) => q.is_premium).map((q) => q.id));

describe("the fixture bank is exactly what pack-runtime-bank produces from bank-source.json", () => {
  it("re-packs byte for byte (deterministic writer)", () => {
    const dir = packTemp(SOURCE);
    const list = (d) => readdirSync(d, { recursive: true }).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\\/g, "/")).sort();
    expect(list(dir)).toEqual(list(BANK_DIR));
    for (const f of list(dir)) expect(readFileSync(path.join(dir, f)).equals(readFileSync(path.join(BANK_DIR, f))), f).toBe(true);
  });

  it("never links out to a resource recorded as unavailable (missing is shown as missing)", async () => {
    const gone = JSON.parse(JSON.stringify(SOURCE));
    gone.resources.find((r) => r.id === "ien-120607").availability = "unavailable";
    const bank = createRuntimeBank({ dir: packTemp(gone) });
    const rows = (await bank.rowsForNode("middle/grade-1/math")).filter((r) => SOURCE.questions.find((q) => q.id === r.key)?.source?.resource_id === "ien-120607");
    expect(rows.length).toBeGreaterThan(0);
    for (const k of (await bank.keys(rows)).values()) expect(k.source).toMatchObject({ resource_id: "ien-120607", url: null });
    const live = createRuntimeBank({ dir: BANK_DIR });
    for (const k of (await live.keys(rows)).values()) expect(k.source.url).toMatch(/^https:\/\/iencontent\.ien\.edu\.sa\/books\/.+#page=\d+$/);
  });
});

describe("POST /api/exams/session/start", () => {
  it("serves a session: display indexes only — no keys, ids, explanations or sources", async () => {
    const { status, body } = await doStart({ template: "subject-quiz", scope: "middle/grade-1/math", count: 20 });
    expect(status).toBe(200);
    expect(body).toMatchObject({ mode: "guest", template: { id: "subject-quiz", version: 1, kind: "subject" }, scope: "middle/grade-1/math", timing_mode: "timed", feedback_mode: "end", mini: false });
    expect(body.session_id).toMatch(/^g-[A-Za-z0-9_-]{22}$/);
    expect(body.questions.length).toBe(body.question_count);
    expect(body.question_count).toBeGreaterThanOrEqual(10);
    expect(body.questions.map((q) => q.position)).toEqual(body.questions.map((_, i) => i + 1));
    const types = new Set(body.questions.map((q) => q.type));
    expect(types.has("matching") && types.has("ordering")).toBe(true);
    const text = JSON.stringify(body.questions);
    expect(text).not.toMatch(/"(answer|accepted|accepted_norm|answer_display|explanation|objective|source|content_hash|option_id|payload|tolerance|revision)"/);
    for (const id of bankIds()) expect(text.includes(`"${id}"`), `leaks ${id}`).toBe(false);
    // the browser reads the token header only: no keys, no seed, no revisions; items are named by opaque handles
    const t = decodeTokenPayload(body.token);
    expect(t).toMatchObject({ v: 2, sid: body.session_id, tpl: "subject-quiz", sc: "middle/grade-1/math", fb: "end", tm: "timed", lim: { tier: "guest" } });
    expect(t.q).toBeUndefined();
    expect(t.sd).toBeUndefined();
    expect(t.r).toBeUndefined();
    const server = serverView(body.token);
    expect(body.questions.map((q) => q.key)).toEqual(itemHandles(server.sid, server.q));
    for (const q of body.questions) expect(q.key).toMatch(HANDLE_RE);
    const whole = JSON.stringify(body);
    for (const q of SOURCE.questions) expect(whole.includes(q.id), `start leaks ${q.id}`).toBe(false);
    expect(openSeen(body.seen)).toEqual(server.q);
    expect(Date.parse(body.expires_at) - Date.parse(body.started_at)).toBe(body.time_limit_seconds * 1000);
  });

  it("never serves premium items, needs-review lessons or unit openers to a guest", async () => {
    const excluded = new Set([...premiumKeys, ...SOURCE.questions.filter((q) => /xb321f898|x5a3afdd4|xa3e7e839/.test(q.curriculum?.lesson ?? "")).map((q) => q.id)]);
    for (let i = 0; i < 25; i++) {
      const { status, body } = await doStart({ template: "subject-quiz", scope: "middle/grade-1/math", count: 20 });
      expect(status).toBe(200);
      for (const k of serverView(body.token).q) expect(excluded.has(k), k).toBe(false);
    }
  });

  it("refuses a client seed, unknown fields and bad values (strict whitelist)", async () => {
    expect(await doStart({ template: "chapter-quiz", scope: "middle/grade-1/math/n91", seed: SEED_A })).toEqual({ status: 400, body: { error: "seed_not_allowed" } });
    expect(await doStart({ template: "chapter-quiz", scope: "middle/grade-1/math/n91", extra: 1 })).toEqual({ status: 400, body: { error: "invalid_argument", field: "extra" } });
    expect((await doStart({ template: "chapter-quiz", scope: "middle/grade-1/math/n91", count: 0 })).body).toEqual({ error: "invalid_argument", field: "count" });
    expect((await doStart({ template: "chapter-quiz", scope: "middle/grade-1/math/n91", count: 41 })).body).toEqual({ error: "invalid_argument", field: "count" });
    expect((await doStart({ template: "chapter-quiz", scope: "middle/grade-1/math/n91", seen: ["q-m1-math-0000000001"] })).body).toEqual({ error: "invalid_argument", field: "seen" }); // plain key lists are gone
    expect((await doStart({ template: "chapter-quiz", scope: "middle/grade-1/math/n91", seen: "s1.".padEnd(13000, "A") })).body).toEqual({ error: "invalid_argument", field: "seen" });
    expect((await doStart({ template: "chapter-quiz", scope: "middle/grade-1/math/n91", seen: "s1.forged" })).status).toBe(200); // a blob that does not open is no history
    expect((await doStart({ template: "Chapter", scope: "x" })).body).toEqual({ error: "invalid_argument", field: "template" });
    expect((await doStart([1, 2])).body).toEqual({ error: "invalid_argument", field: "body" });
    expect((await doStart("{bad")).body).toEqual({ error: "invalid_json" });
    expect((await doStart({ template: "chapter-quiz", scope: "x".repeat(20000) })).status).toBe(413);
  });

  it("template, scope and pool errors", async () => {
    expect(await doStart({ template: "no-such", scope: "middle/grade-1/math/n91" })).toEqual({ status: 404, body: { error: "template_not_found" } });
    expect(await doStart({ template: "chapter-quiz", scope: "middle/grade-1/math/n999" })).toEqual({ status: 404, body: { error: "scope_not_found" } });
    expect(await doStart({ template: "chapter-quiz", scope: "middle/grade-1/../../etc/passwd" })).toEqual({ status: 400, body: { error: "invalid_argument", field: "scope" } });
    expect(await doStart({ template: "lesson-quiz", scope: "middle/grade-1/math/n91" })).toEqual({ status: 400, body: { error: "invalid_argument", field: "scope" } });
    expect(await doStart({ template: "weakness-review", scope: "weak:" })).toEqual({ status: 400, body: { error: "invalid_argument", field: "scope" } });
    expect(await doStart({ template: "practice", scope: "middle/grade-1" })).toEqual({ status: 422, body: { error: "scope_too_large" } });
    expect(await doStart({ template: "practice", scope: "middle" })).toEqual({ status: 422, body: { error: "scope_too_large" } });
    expect(await doStart({ template: "practice", scope: "prep:aptitude" })).toEqual({ status: 422, body: { error: "scope_too_large" } });
    expect(await doStart({ template: "chapter-quiz", scope: "middle/grade-1/math/n91", feedback: "immediate" })).toEqual({ status: 400, body: { error: "feedback_not_allowed" } });
    expect(await doStart({ template: "timed", scope: "middle/grade-1/math/n91", timing: "untimed" })).toEqual({ status: 400, body: { error: "invalid_argument", field: "timing" } });
    expect(await doStart({ template: "term-exam", scope: "middle/grade-1/math@t1" })).toEqual({ status: 422, body: { error: "insufficient_pool", available: 15, required: 20 } });
    expect(await doStart({ template: "full-year", scope: "middle/grade-1/science@year" })).toMatchObject({ status: 422, body: { error: "insufficient_pool" } });
  });

  it("full year runs as the labelled mini version for guests; prep sections work", async () => {
    const fy = await doStart({ template: "full-year", scope: "middle/grade-1/math@year" });
    expect(fy.status).toBe(200);
    expect(fy.body).toMatchObject({ mini: true, limited: true, term_scope: "year", max_questions: 20 });
    const prep = await doStart({ template: "practice", scope: "prep:aptitude/verbal" });
    expect(prep.status).toBe(200);
    expect(serverView(prep.body.token).q.every((k) => k.startsWith("av-"))).toBe(true);
    expect(prep.body.questions.every((q) => HANDLE_RE.test(q.key) && q.lesson.id.startsWith("prep:aptitude/verbal/"))).toBe(true);
    // legacy contextual-error items keep their option order
    const view = await sessionView(prep.body);
    for (const v of view) if (v.item.topic === "contextual-error") expect(v.maps.choice_order).toBeNull();
  });

  it("members: 409 when their database works; the free tier when it is down", async () => {
    globalThis.__jzRouteUser = { id: "u1" };
    globalThis.__jzServer = { rpc: async () => ({ data: {}, error: null }) };
    expect(await doStart({ template: "chapter-quiz", scope: "middle/grade-1/math/n91" })).toEqual({ status: 409, body: { error: "use_database" } });
    globalThis.__jzServer = { rpc: async () => ({ data: null, error: { code: "PGRST000", message: "down" } }) };
    const r = await doStart({ template: "chapter-quiz", scope: "middle/grade-1/math/n91", count: 25 });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ max_questions: 25, short: true });
    expect(decodeTokenPayload(r.body.token).lim.tier).toBe("free");
    expect(await doStart({ template: "practice", scope: "middle/grade-1" })).toMatchObject({ status: 422, body: { error: "insufficient_pool" } }); // free: no guest cap, but the bank serves subject-or-narrower
  });

  it("same origin only; secret policy: EXAM_SECRET_REQUIRED=1 without the secret answers 503", async () => {
    expect((await doStart({ template: "chapter-quiz", scope: "middle/grade-1/math/n91" }, { headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
    process.env.EXAM_SECRET_REQUIRED = "1";
    delete process.env.LOCAL_EXAM_SECRET;
    process.env.GEMINI_API_KEY = "fallback";
    expect(await doStart({ template: "chapter-quiz", scope: "middle/grade-1/math/n91" })).toEqual({ status: 503, body: { error: "unavailable" } });
    expect((await doCheck({ token: "a.b", position: 1, response: null })).status).toBe(503);
    expect((await doSubmit({ token: "a.b" })).status).toBe(503);
    // flag off: live practice keeps working without the variable (derived key)
    delete process.env.EXAM_SECRET_REQUIRED;
    expect((await doStart({ template: "chapter-quiz", scope: "middle/grade-1/math/n91" })).status).toBe(200);
  });

  it("rate limits per IP (exams.session, 60 per 5 minutes)", async () => {
    const ip = "192.0.2.77";
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await doStart({ template: "no-such", scope: "x" }, { ip })).status;
    expect(last).toBe(429);
  });

  it("with the same seed, two banks that differ only in their answers give identical sessions (nothing answer-derived)", async () => {
    const swapped = JSON.parse(JSON.stringify(SOURCE));
    for (const q of swapped.questions) {
      if (q.question_type === "mcq") q.payload.answer.option_id = q.payload.options.find((o) => o.id !== q.payload.answer.option_id).id;
      if (q.question_type === "ordering") q.payload.answer.order = [...q.payload.answer.order].reverse();
      if (q.question_type === "short_answer") q.payload.accepted = ["شيء آخر"];
      if (q.question_type === "numeric") q.payload.answer.value = "999";
    }
    const other = packTemp(swapped);
    globalThis.__jzSeed = SEED_A;
    vi.useFakeTimers({ now: Date.parse("2026-10-01T12:00:00Z"), toFake: ["Date"] });
    const a = await doStart({ template: "chapter-quiz", scope: "middle/grade-1/math/n91" });
    useBank(other);
    const b = await doStart({ template: "chapter-quiz", scope: "middle/grade-1/math/n91" });
    expect(unkeyed(b.body.questions)).toEqual(unkeyed(a.body.questions));
    const strip = (tok) => {
      const { sid: _s, x: _x, ...rest } = decodeTokenPayload(tok);
      return rest;
    };
    expect(strip(b.body.token)).toEqual(strip(a.body.token));
    const { sid: _sa, ...sa } = serverView(a.body.token);
    const { sid: _sb, ...sb } = serverView(b.body.token);
    expect(sb).toEqual(sa);
  });

  it("uses ce_guest_start / ce_guest_items with the service role (the SQL selection) and falls back when 0014 is missing", async () => {
    const startCase = RPC("ce_guest_start").cases[0];
    const itemsRows = new Map();
    for (const c of RPC("ce_guest_items").cases) if (c.args.p_with_keys) for (const r of c.response) itemsRows.set(r.key, r);
    const calls = [];
    const bank = createRuntimeBank({ dir: BANK_DIR });
    globalThis.__jzAdmin = {
      rpc: async (fn, args) => {
        calls.push([fn, args]);
        if (fn === "rate_limit_hit") return { data: true, error: null };
        if (fn === "ce_guest_start") return { data: startCase.response, error: null };
        if (fn === "ce_guest_items") {
          const rows = (await bank.rowsForNode("middle/grade-1/math")).filter((r) => args.p_keys.includes(r.key));
          const content = await bank.content(rows);
          const keys = await bank.keys(rows);
          return { data: args.p_keys.map((k) => ({ ...content.get(k), ...(args.p_with_keys ? { key_data: (({ key: _k, revision: _r, ...kd }) => kd)(keys.get(k)) } : {}) })), error: null };
        }
        return { data: null, error: { code: "PGRST202", message: "missing" } };
      },
    };
    globalThis.__jzSeed = startCase.args.p_seed;
    const viaRpc = await doStart({ template: "chapter-quiz", scope: "middle/grade-1/math/n91", count: 10 });
    expect(viaRpc.status).toBe(200);
    const startCall = calls.find(([fn]) => fn === "ce_guest_start");
    expect(startCall[1]).toEqual(startCase.args);
    // the same selection as the JS engine over the bank
    delete globalThis.__jzAdmin;
    const viaBank = await doStart({ template: "chapter-quiz", scope: "middle/grade-1/math/n91", count: 10 });
    expect(unkeyed(viaRpc.body.questions)).toEqual(unkeyed(viaBank.body.questions));
    expect(serverView(viaRpc.body.token).q).toEqual(serverView(viaBank.body.token).q);
    // submit through ce_guest_items
    globalThis.__jzAdmin = { rpc: async (fn, args) => (fn === "rate_limit_hit" ? { data: true, error: null } : fn === "ce_guest_items" ? { data: args.p_keys.map((k) => itemsRows.get(k)).filter(Boolean), error: null } : { data: null, error: { code: "PGRST202" } }) };
    const sub = await doSubmit({ token: viaRpc.body.token, answers: [] });
    expect(sub.status).toBe(200);
    // rows missing from the RPC answer are voided, never guessed
    const handles = keyOfHandle(viaRpc.body.token);
    expect(sub.body.items.every((i) => handles.has(i.key))).toBe(true); // results name items by handle too
    expect(sub.body.items.filter((i) => !i.voided).every((i) => itemsRows.has(handles.get(i.key)))).toBe(true);
    // 0014 missing everywhere → the runtime bank serves
    globalThis.__jzAdmin = { rpc: async (fn) => (fn === "rate_limit_hit" ? { data: true, error: null } : { data: null, error: { code: "PGRST202", message: "Could not find the function" } }) };
    const fallback = await doStart({ template: "chapter-quiz", scope: "middle/grade-1/math/n91", count: 10 });
    expect(unkeyed(fallback.body.questions)).toEqual(unkeyed(viaBank.body.questions));
    const sub2 = await doSubmit({ token: fallback.body.token, answers: [] });
    expect(sub2.body.items.every((i) => !i.voided)).toBe(true);
    // a malformed SQL row (no revision) is an honest 503, never a bare 500 or a token without revisions
    const broken = JSON.parse(JSON.stringify(startCase.response));
    broken.items[0].revision = null;
    globalThis.__jzAdmin = { rpc: async (fn) => (fn === "rate_limit_hit" ? { data: true, error: null } : fn === "ce_guest_start" ? { data: broken, error: null } : { data: [], error: null }) };
    expect(await doStart({ template: "chapter-quiz", scope: "middle/grade-1/math/n91", count: 10 })).toEqual({ status: 503, body: { error: "unavailable" } });
  });
});

describe("POST /api/exams/session/check and /submit", () => {
  const wrongOf = (v) => {
    switch (v.item.type) {
      case "mcq":
      case "true_false":
        return { option_index: (v.correct.option_index + 1) % v.item.public.options.length };
      case "matching":
        return { pairs: v.correct.pairs.map(([l], i, a) => [l, a[(i + 1) % a.length][1]]) };
      case "ordering":
        return { order: [...v.correct.order].reverse() };
      case "short_answer":
        return { text: "خطأ تماما" };
      default:
        return { value: "123456" };
    }
  };

  it("grades every type end to end; the result carries explanations and display-mapped answers", async () => {
    const s = await doStart({ template: "subject-quiz", scope: "middle/grade-1/math", count: 20 });
    const view = await sessionView(s.body);
    const answers = view.map((v, i) => ({ position: v.position, response: i % 2 === 0 ? v.correct : wrongOf(v), time_spent_seconds: 10 }));
    const r = await doSubmit({ token: s.body.token, answers });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ mode: "guest", saved: false, status: "submitted", key_reveal_limit: false, voided_count: 0 });
    const even = view.filter((_, i) => i % 2 === 0).length;
    expect(r.body.correct_count).toBe(even);
    expect(r.body.items.map((i) => i.verdict)).toEqual(view.map((_, i) => (i % 2 === 0 ? "correct" : expect.stringMatching(/incorrect|partial/))));
    for (const [i, it] of r.body.items.entries()) {
      expect(it.correct_response).toEqual(view[i].correct);
      expect(it.explanation.text).toMatch(/^شرح/);
      expect(it.lesson.href).toBe(`/learn/${it.lesson.id}`);
    }
    const sum = r.body.items.reduce((a, it) => a + it.score, 0);
    expect(r.body.score_percent).toBe(Math.round((10000 * sum) / r.body.question_count) / 100);
    expect(r.body.by_lesson.reduce((a, g) => a + g.total, 0)).toBe(r.body.question_count);
    expect(r.body.by_band.map((g) => g.band)).toEqual(expect.arrayContaining([1]));
    const text = JSON.stringify(r.body);
    for (const id of bankIds()) expect(text.includes(`"${id}"`), `result leaks ${id}`).toBe(false);
  });

  it("check → change → submit keeps the receipt's score; dropping receipts gains nothing", async () => {
    const s = await doStart({ template: "lesson-quiz", scope: "middle/grade-1/math/n53" });
    expect(s.body.feedback_mode).toBe("immediate");
    const view = await sessionView(s.body);
    const [a, b, c] = view;
    const ca = await doCheck({ token: s.body.token, position: a.position, response: a.correct });
    expect(ca.status).toBe(200);
    expect(ca.body).toMatchObject({ position: a.position, verdict: "correct", score: 1, correct_response: a.correct, key_reveal_limit: false });
    expect(ca.body.explanation.text).toMatch(/^شرح/);
    const cb = await doCheck({ token: s.body.token, position: b.position, response: wrongOf(b) });
    expect(cb.body.score).toBeLessThan(1);
    // change both answers after checking, and leave c unchecked but answered correctly
    const answers = [{ position: a.position, response: wrongOf(a) }, { position: b.position, response: b.correct }, { position: c.position, response: c.correct }];
    const r = await doSubmit({ token: s.body.token, answers, receipts: [ca.body.receipt, cb.body.receipt] });
    const byPos = new Map(r.body.items.map((i) => [i.position, i]));
    expect(byPos.get(a.position)).toMatchObject({ score: 1, verdict: "correct", locked: true, response: null });
    expect(byPos.get(b.position)).toMatchObject({ score: cb.body.score, locked: true });
    expect(byPos.get(c.position)).toMatchObject({ verdict: "unanswered", score: 0 });   // immediate: unchecked = unanswered
    // a client that drops its receipts: the checked positions become unanswered
    const dropped = await doSubmit({ token: s.body.token, answers: [{ position: a.position, response: a.correct }] });
    expect(dropped.body.items.find((i) => i.position === a.position)).toMatchObject({ verdict: "unanswered", score: 0 });
    // a receipt of another session is ignored
    const other = await doStart({ template: "lesson-quiz", scope: "middle/grade-1/math/n53" });
    const foreign = await doSubmit({ token: other.body.token, answers: [], receipts: [ca.body.receipt] });
    expect(foreign.body.items.every((i) => !i.locked)).toBe(true);
  });

  it("check refuses end-of-session templates, bad positions and invalid responses", async () => {
    const end = await doStart({ template: "chapter-quiz", scope: "middle/grade-1/math/n91" });
    expect(await doCheck({ token: end.body.token, position: 1, response: { option_index: 0 } })).toEqual({ status: 400, body: { error: "feedback_not_allowed" } });
    const s = await doStart({ template: "lesson-quiz", scope: "middle/grade-1/math/n53" });
    const view = await sessionView(s.body);
    const mcq = view.find((v) => v.item.type === "mcq");
    expect((await doCheck({ token: s.body.token, position: 0, response: null })).body).toEqual({ error: "invalid_argument", field: "position" });
    expect((await doCheck({ token: s.body.token, position: mcq.position, response: null })).body).toEqual({ error: "invalid_response", position: mcq.position, reason: "empty" });
    expect((await doCheck({ token: s.body.token, position: mcq.position, response: { option_index: 9 } })).body).toEqual({ error: "invalid_response", position: mcq.position, reason: "index_out_of_range" });
    expect((await doCheck({ token: s.body.token, position: mcq.position, response: { option_id: "x" } })).body).toEqual({ error: "invalid_response", position: mcq.position, reason: "bad_shape" });
    expect((await doCheck({ token: "x.y", position: 1, response: null })).body).toEqual({ error: "token_invalid" });
    expect((await doCheck({ token: s.body.token, position: 1, response: null, extra: 1 })).body).toEqual({ error: "invalid_argument", field: "extra" });
  });

  it("a submit after the deadline plus grace is `expired` with the answers ignored; check refuses", async () => {
    const t0 = Date.parse("2026-10-01T12:00:00Z");
    vi.useFakeTimers({ now: t0, toFake: ["Date"] });
    const s = await doStart({ template: "chapter-quiz", scope: "middle/grade-1/math/n91", count: 10 });
    const view = await sessionView(s.body);
    const answers = view.map((v) => ({ position: v.position, response: v.correct }));
    vi.setSystemTime(t0 + s.body.time_limit_seconds * 1000 + 30_000);                       // exactly at deadline + grace
    expect((await doSubmit({ token: s.body.token, answers })).body).toMatchObject({ status: "submitted", correct_count: 10 });
    vi.setSystemTime(t0 + s.body.time_limit_seconds * 1000 + 31_000);
    const late = await doSubmit({ token: s.body.token, answers });
    expect(late.body).toMatchObject({ status: "expired", correct_count: 0, score_percent: 0, duration_seconds: s.body.time_limit_seconds });
    expect(late.body.items.every((i) => i.verdict === "unanswered")).toBe(true);
    const imm = await (async () => {
      vi.setSystemTime(t0);
      return doStart({ template: "lesson-quiz", scope: "middle/grade-1/math/n53", timing: "timed" });
    })();
    vi.setSystemTime(t0 + imm.body.time_limit_seconds * 1000 + 31_000);
    expect(await doCheck({ token: imm.body.token, position: 1, response: { option_index: 0 } })).toEqual({ status: 410, body: { error: "token_expired" } });
    vi.setSystemTime(t0 + s.body.time_limit_seconds * 1000 + 30_000 + 86_400_001);
    expect(await doSubmit({ token: s.body.token, answers })).toEqual({ status: 410, body: { error: "token_expired" } });
  });

  it("the key-reveal cap hides keys and explanations but keeps verdicts", async () => {
    process.env.EXAM_KEY_REVEAL_DAILY = "10";
    const ip = "192.0.2.200";
    const s = await doStart({ template: "chapter-quiz", scope: "middle/grade-1/math/n91", count: 10 }, { ip });
    const view = await sessionView(s.body);
    const answers = view.map((v) => ({ position: v.position, response: v.correct }));
    const first = await doSubmit({ token: s.body.token, answers }, { ip });
    expect(first.body.key_reveal_limit).toBe(false);
    const again = await doSubmit({ token: s.body.token, answers }, { ip });
    expect(again.body).toMatchObject({ key_reveal_limit: true, correct_count: 10 });
    expect(again.body.items.every((i) => i.correct_response === null && i.explanation === null && i.source === null && i.verdict === "correct")).toBe(true);
    // another IP is not affected
    expect((await doSubmit({ token: s.body.token, answers }, { ip: "192.0.2.201" })).body.key_reveal_limit).toBe(false);
  });

  it("a revised item is voided (excluded from the score); check answers bank_changed", async () => {
    const s = await doStart({ template: "chapter-quiz", scope: "middle/grade-1/math/n91", count: 10 });
    const view = await sessionView(s.body);
    const target = view[0];
    const revised = JSON.parse(JSON.stringify(SOURCE));
    const q = revised.questions.find((x) => x.id === target.key);
    q.revision += 1;
    q.stem = "صيغة جديدة؟";
    useBank(packTemp(revised));
    const answers = view.map((v) => ({ position: v.position, response: v.correct }));
    const r = await doSubmit({ token: s.body.token, answers });
    expect(r.body).toMatchObject({ voided_count: 1, question_count: 9, correct_count: 9, score_percent: 100 });
    expect(r.body.items[0]).toMatchObject({ voided: "question_updated", verdict: null, score: null, correct_response: null });
    const imm = await doStart({ template: "lesson-quiz", scope: "middle/grade-1/math/n53" });
    const iv = await sessionView(imm.body, process.env.RUNTIME_BANK_DIR);
    const again = JSON.parse(JSON.stringify(revised));
    again.questions.find((x) => x.id === iv[0].key).revision += 1;
    useBank(packTemp(again));
    expect(await doCheck({ token: imm.body.token, position: 1, response: iv[0].correct })).toEqual({ status: 409, body: { error: "bank_changed", position: 1 } });
  });

  it("a retake reuses the stored allocation, gets a new seed and avoids the items just seen", async () => {
    // a bank with room for a fresh retake: 6 items per (lesson, band) in unit n91
    const roomy = JSON.parse(JSON.stringify(SOURCE));
    const base = roomy.questions.find((x) => x.id.startsWith("q-m1-math") && x.question_type === "mcq");
    roomy.questions = [];
    ["n53", "n54", "n55"].forEach((l, li) => [1, 2, 3].forEach((band) => {
      for (let k = 0; k < 6; k++) {
        const id = `q-m1-math-${(li * 100 + band * 10 + k).toString(16).padStart(10, "0")}`;
        roomy.questions.push({ ...base, id, difficulty_band: band, dedup: { exclusion_group: null }, is_premium: false, curriculum: { ...base.curriculum, lesson: `middle/grade-1/math/${l}` } });
      }
    }));
    useBank(packTemp(roomy));
    const first = await doStart({ template: "chapter-quiz", scope: "middle/grade-1/math/n91", count: 6 });
    const t1 = serverView(first.body.token);
    expect(decodeTokenPayload(first.body.token).al).toBeTruthy();
    const retake = await doStart({ template: "chapter-quiz", scope: "middle/grade-1/math/n91", seen: first.body.seen, retake_of: first.body.token });
    expect(retake.status).toBe(200);
    const t2 = serverView(retake.body.token);
    expect(t2.sd).not.toBe(t1.sd);
    expect(t2.al).toEqual(t1.al);                                  // the same per-cell quotas
    expect(retake.body).toMatchObject({ retake_of: t1.sid, question_count: 6, reused: false });
    expect(t2.q.filter((k) => t1.q.includes(k))).toEqual([]);      // enough fresh items in every cell
    // the server knows the original items from the signed token: a client that sends no `seen` still gets fresh ones
    for (let i = 0; i < 5; i++) {
      const bare = await doStart({ template: "chapter-quiz", scope: "middle/grade-1/math/n91", retake_of: first.body.token });
      expect(bare.status).toBe(200);
      expect(serverView(bare.body.token).q.filter((k) => t1.q.includes(k))).toEqual([]);
    }
    // a lesson too small for a fresh retake reuses within 30 % of n, and refuses below the minimum
    useBank(BANK_DIR);
    const small = await doStart({ template: "lesson-quiz", scope: "middle/grade-1/math/n53" });
    const ts = serverView(small.body.token);
    expect(await doStart({ template: "lesson-quiz", scope: "middle/grade-1/math/n53", seen: small.body.seen, retake_of: small.body.token }))
      .toEqual({ status: 422, body: { error: "insufficient_pool", available: Math.ceil((ts.q.length * 30) / 100), required: 3 } });
    expect((await doStart({ template: "chapter-quiz", scope: "middle/grade-1/math/n92", retake_of: first.body.token })).body).toEqual({ error: "invalid_argument", field: "retake_of" });
    expect((await doStart({ template: "chapter-quiz", scope: "middle/grade-1/math/n91", retake_of: "forged.token" })).body).toEqual({ error: "token_invalid" });
  });

  it("submit validates its body and response shapes before revealing anything", async () => {
    const s = await doStart({ template: "chapter-quiz", scope: "middle/grade-1/math/n91", count: 10 });
    expect((await doSubmit({ token: s.body.token, answers: [{ position: 11, response: null }] })).body).toEqual({ error: "invalid_argument", field: "answers[0].position" });
    expect((await doSubmit({ token: s.body.token, answers: [{ position: 1 }, { position: 1 }] })).body).toEqual({ error: "invalid_argument", field: "answers[1].position" });
    expect((await doSubmit({ token: s.body.token, answers: [{ position: 1, response: { option_index: "0" } }] })).body.error).toBe("invalid_response");
    expect((await doSubmit({ token: s.body.token, nope: 1 })).body).toEqual({ error: "invalid_argument", field: "nope" });
    expect((await doSubmit({ token: s.body.token, receipts: "x" })).body).toEqual({ error: "invalid_argument", field: "receipts" });
    const empty = await doSubmit({ token: s.body.token });
    expect(empty.body).toMatchObject({ status: "submitted", answered_count: 0, correct_count: 0 });
  });
});

describe("grading-cases.json through the route path (start → display mapping → submit)", () => {
  // one unit per case: the case item plus four fillers, served by `practice` (min 5) at the unit
  const SUBJECT = "middle/grade-1/math";
  const nodes = [
    { id: "middle", parent_id: null, kind: "stage", order: 1, title_ar: "م", status: "verified", term: null, term_status: "unknown" },
    { id: "middle/grade-1", parent_id: "middle", kind: "grade", order: 1, title_ar: "ص", status: "verified", term: null, term_status: "unknown" },
    { id: SUBJECT, parent_id: "middle/grade-1", kind: "subject", order: 1, title_ar: "ر", status: "verified", term: null, term_status: "unknown" },
  ];
  const questions = [];
  const hex = (n, w = 10) => n.toString(16).padStart(w, "0");
  const q = (id, lesson, type, payload) => ({
    id, revision: 1, scope: "curriculum", curriculum: { subject: SUBJECT, lesson, term: "t1" }, prep: null, objective_id: null, question_type: type, language: "ar",
    stem: `سؤال ${id}`, payload, explanation: { text: "شرح", steps: [] }, shuffle_options: type === "mcq", time_limit_seconds: 60, difficulty_band: 1,
    dedup: { exclusion_group: null }, is_premium: false, status: "published", source: null, stimulus_id: null,
  });
  GRADING.forEach((c, i) => {
    const unit = `${SUBJECT}/xa${hex(i, 7)}`;
    const lesson = `${SUBJECT}/xb${hex(i, 7)}`;
    nodes.push({ id: unit, parent_id: SUBJECT, kind: "unit", order: i + 1, title_ar: `و${i}`, status: "verified", term: "t1", term_status: "inferred" });
    nodes.push({ id: lesson, parent_id: unit, kind: "lesson", order: 1, title_ar: `د${i}`, status: "verified", term: "t1", term_status: "inferred" });
    questions.push(q(`q-m1-math-${hex(i * 8 + 1)}`, lesson, c.type, c.payload));
    for (let f = 0; f < 4; f++) {
      questions.push(q(`q-m1-math-${hex(i * 8 + 2 + f)}`, lesson, "mcq", { options: [{ id: "oaaaaa1", text: "1" }, { id: "obbbbb2", text: "2" }], answer: { option_id: "oaaaaa1" }, fixed_order_reason: null }));
    }
  });

  it.each(GRADING.map((c, i) => [c.id, c, i]))("%s", async (_id, c, i) => {
    globalThis.__jzTree = createTree(nodes);
    if (!globalThis.__jzGradingBank) globalThis.__jzGradingBank = packTemp({ nodes, questions });
    useBank(globalThis.__jzGradingBank);
    const s = await doStart({ template: "practice", scope: `${SUBJECT}/xa${hex(i, 7)}`, feedback: "end" });
    expect(s.status).toBe(200);
    const view = await sessionView(s.body, globalThis.__jzGradingBank);
    const target = view.find((v) => v.key === `q-m1-math-${hex(i * 8 + 1)}`);
    const display = toDisplay(target.item, target.maps, c.response, target.answer);
    const r = await doSubmit({ token: s.body.token, answers: [{ position: target.position, response: display }] });
    const representable = (c.response === null || display !== null) && !/-1\b/.test(JSON.stringify(display));
    if (!representable) {
      // a canonical id that is not on the item cannot even be expressed in display indexes:
      // whatever the client sends instead is refused or graded 0
      expect(c.expected.score).toBe(0);
      if (r.status === 400) expect(r.body).toMatchObject({ error: "invalid_response", position: target.position });
      else expect(r.body.items.find((x) => x.position === target.position).score).toBe(0);
      return;
    }
    expect(r.status).toBe(200);
    const item = r.body.items.find((x) => x.position === target.position);
    expect({ score: item.score, verdict: item.verdict }).toEqual({ score: c.expected.score, verdict: c.expected.verdict });
    if (c.expected.reason) expect(item.invalid_reason).toBe(c.expected.reason);
  });
});

describe("client data layer: src/lib/data/exams.js (mode guest) over src/lib/data/exam-sessions.js", () => {
  const memoryStorage = () => {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
  };
  const ROUTES = { "/api/exams/session/start": start, "/api/exams/session/check": check, "/api/exams/session/submit": submit };

  it("start → save → check → change refused → resume → submit (idempotent); nothing saved server-side", async () => {
    vi.stubGlobal("sessionStorage", memoryStorage());
    vi.stubGlobal("localStorage", memoryStorage());
    const ip = nextIp();
    const sent = [];
    vi.stubGlobal("fetch", async (url, init) => {
      sent.push([url, JSON.parse(init.body)]);
      return ROUTES[url](new Request(`https://jazira.test${url}`, { ...init, headers: { ...init.headers, host: "jazira.test", "x-forwarded-for": ip } }));
    });
    try {
      const s = await exams.startExam({ template: "lesson-quiz", scope: "middle/grade-1/math/n53" });
      expect(s).toMatchObject({ mode: "guest", status: "in_progress", feedback_mode: "immediate", template: { id: "lesson-quiz" } });
      expect(s.attempt_id).toMatch(/^g-/);
      const stored = JSON.parse(localStorage.getItem(`jz:exam-guest:${s.attempt_id}`));
      expect(openSeen(seenBlob())).toEqual(expect.arrayContaining(serverView(stored.token).q)); // sealed: only the server opens it
      const view = await sessionView({ token: stored.token });
      const [a, b] = view;
      await exams.saveAnswer(s.attempt_id, a.position, a.correct, { timeSpentSeconds: 12 });
      const c = await checkItem(s.attempt_id, a.position);
      expect(c).toMatchObject({ verdict: "correct", score: 1 });
      expect(c.receipt).toBeUndefined();
      await expect(exams.saveAnswer(s.attempt_id, a.position, null)).rejects.toMatchObject({ name: "DataError", code: "item_locked" });
      await expect(checkItem(s.attempt_id, b.position)).rejects.toMatchObject({ code: "invalid_response" });
      await exams.saveAnswer(s.attempt_id, b.position, b.correct, { flagged: true });
      const resumed = await exams.getAttempt(s.attempt_id);
      expect(resumed.status).toBe("in_progress");
      expect(resumed.answers.find((x) => x.position === a.position).check).toMatchObject({ verdict: "correct" });
      expect(resumed.answers.find((x) => x.position === b.position)).toMatchObject({ flagged: true, response: b.correct });
      // b was answered but not checked: submit checks it first (immediate sessions count receipts only)
      const r = await exams.submitExam(s.attempt_id);
      expect(r).toMatchObject({ mode: "guest", saved: false, status: "submitted" });
      expect(r.items.find((i) => i.position === a.position)).toMatchObject({ score: 1, locked: true, time_spent_seconds: 12 });
      expect(r.items.find((i) => i.position === b.position)).toMatchObject({ score: 1, locked: true, flagged: true });
      expect(r.attempt).toMatchObject({ status: "submitted", correct_count: 2, xp_awarded: 0 });
      expect(await exams.submitExam(s.attempt_id)).toBe(r);
      await expect(exams.saveAnswer(s.attempt_id, 1, null)).rejects.toMatchObject({ code: "attempt_closed" });
      // server errors keep their codes
      await expect(exams.startExam({ template: "term-exam", scope: "middle/grade-1/math@t1" })).rejects.toMatchObject({ code: "insufficient_pool", details: { available: 15, required: 20 } });
      await expect(exams.startExam({ template: "no-such", scope: "middle/grade-1/math" })).rejects.toMatchObject({ code: "template_not_found" });
      expect(exams.EXAM_ERROR_CODES).toEqual(expect.arrayContaining(["template_not_found", "scope_not_found", "insufficient_pool", "feedback_not_allowed", "invalid_response", "item_locked", "scope_too_large", "seed_not_allowed", "not_found", "key_reveal_limit", "token_invalid", "token_expired", "bank_changed"]));
      // a guest retake names the earlier session id
      const again = await exams.startExam({ template: "chapter-quiz", scope: "middle/grade-1/math/n91", count: 5 });
      // the fixture unit is too small for a fresh retake of these quotas: the route answers honestly
      await expect(exams.startExam({ template: "chapter-quiz", scope: "middle/grade-1/math/n91", retakeOf: again.attempt_id })).rejects.toMatchObject({ code: "insufficient_pool" });
      const [, body] = sent.at(-1);
      expect(body.retake_of).toBe(JSON.parse(localStorage.getItem(`jz:exam-guest:${again.attempt_id}`)).token);
      expect(body.seen).toBe(seenBlob());
      expect(openSeen(body.seen)).toEqual(expect.arrayContaining(serverView(body.retake_of).q));
      await expect(exams.startExam({ template: "chapter-quiz", scope: "middle/grade-1/math/n91", retakeOf: "g-AAAAAAAAAAAAAAAAAAAAAA" })).rejects.toMatchObject({ code: "not_found" });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("signed in: start_template_attempt when 0014 is deployed; guest session when it is missing", async () => {
    const calls = [];
    let missing = false;
    globalThis.__jzBrowser = {
      auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) },
      rpc: async (fn, args) => {
        calls.push([fn, args]);
        if (missing) return { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
        return { data: { attempt_id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d", status: "in_progress", questions: [] }, error: null };
      },
    };
    vi.stubGlobal("sessionStorage", memoryStorage());
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("fetch", async (url, init) => ROUTES[url](new Request(`https://jazira.test${url}`, { ...init, headers: { ...init.headers, host: "jazira.test", "x-forwarded-for": nextIp() } })));
    try {
      const db = await exams.startExam({ template: "chapter-quiz", scope: "middle/grade-1/math/n91", count: 5, feedback: "end" });
      expect(db.mode).toBe("db");
      expect(calls[0]).toEqual(["start_template_attempt", { p_template: "chapter-quiz", p_scope: "middle/grade-1/math/n91", p_count: 5, p_timing: null, p_feedback: "end", p_retake_of: null }]);
      await exams.saveAnswer(db.attempt_id, 2, { pairs: [[0, 1]] }, { timeSpentSeconds: 3 });
      expect(calls[1]).toEqual(["save_exam_response", { p_attempt: db.attempt_id, p_position: 2, p_response: { pairs: [[0, 1]] }, p_time_spent: 3, p_flagged: null }]);
      await exams.saveAnswer(db.attempt_id, 1, 2);
      expect(calls[2][0]).toBe("save_exam_answer");
      await checkItem(db.attempt_id, 1);
      expect(calls[3]).toEqual(["check_exam_item", { p_attempt: db.attempt_id, p_position: 1 }]);
      missing = true;
      const guest = await exams.startExam({ template: "chapter-quiz", scope: "middle/grade-1/math/n91", count: 5 });
      expect(guest.mode).toBe("guest");
      // the legacy builder path is unchanged
      missing = false;
      const legacy = await exams.startExam({ exam: "aptitude", count: 10 });
      expect(legacy.mode).toBe("db");
      expect(calls.at(-1)[0]).toBe("start_exam_attempt");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// ============================================================================
describe("attack: nothing a guest browser receives names a canonical key or reveals an answer", () => {
  beforeEach(() => {
    delete globalThis.__jzBrowser; // guests: no browser session (an earlier test may have signed in)
  });
  const memoryStorage = () => {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; }, dump: () => [...m.values()] };
  };
  const ROUTES = { "/api/exams/session/start": start, "/api/exams/session/check": check, "/api/exams/session/submit": submit };
  const DIGESTS = (s) => ["sha256", "sha1", "md5"].flatMap((alg) => ["hex", "base64", "base64url"].map((enc) => createHash(alg).update(s).digest(enc).slice(0, 10)));
  const permutations = (list) => (list.length <= 1 ? [list] : list.flatMap((x, i) => permutations([...list.slice(0, i), ...list.slice(i + 1)]).map((p) => [x, ...p])));
  /** Every answer an attacker would try for an item, as canonical payloads. */
  const candidatePayloads = (type, payload) => {
    if (type === "mcq" || type === "true_false") return payload.options.map((o) => ({ ...payload, answer: { option_id: o.id } }));
    if (type === "ordering") return permutations(payload.items.map((x) => x.id)).map((order) => ({ ...payload, answer: { order } }));
    return [];
  };

  it("start payload, token, seen blob, receipts and resume state: no key, no seed, no answer by hashing candidates", async () => {
    const local = memoryStorage();
    const session = memoryStorage();
    vi.stubGlobal("localStorage", local);
    vi.stubGlobal("sessionStorage", session);
    const ip = nextIp();
    const seenByBrowser = [];
    vi.stubGlobal("fetch", async (url, init) => {
      seenByBrowser.push(init.body);
      const res = await ROUTES[url](new Request(`https://jazira.test${url}`, { ...init, headers: { ...init.headers, host: "jazira.test", "x-forwarded-for": ip } }));
      seenByBrowser.push(await res.clone().text());
      return res;
    });
    try {
      // an end-of-session quiz (answers saved, never checked) and an immediate one (a receipt for position 1)
      const end = await exams.startExam({ template: "subject-quiz", scope: "middle/grade-1/math", count: 20 });
      const imm = await exams.startExam({ template: "lesson-quiz", scope: "middle/grade-1/math/n53" });
      const tokenOf = (s) => JSON.parse(local.getItem(`jz:exam-guest:${s.attempt_id}`)).token;
      const endView = await sessionView({ token: tokenOf(end) });
      const immView = await sessionView({ token: tokenOf(imm) });
      for (const v of endView) await exams.saveAnswer(end.attempt_id, v.position, v.correct);
      await exams.saveAnswer(imm.attempt_id, 1, immView[0].correct);
      await checkItem(imm.attempt_id, 1);
      seenByBrowser.push(JSON.stringify(await exams.getAttempt(end.attempt_id)), JSON.stringify(await exams.getAttempt(imm.attempt_id)));
      const corpus = [...seenByBrowser, ...local.dump(), ...session.dump()].join("\n");

      const servers = [end, imm].map((s) => serverView(tokenOf(s)));
      // 1. no canonical key, in any encoding, and no seed
      for (const q of SOURCE.questions) {
        for (const form of [q.id, Buffer.from(q.id).toString("base64url"), Buffer.from(q.id).toString("base64"), ...DIGESTS(q.id)]) expect(corpus.includes(form), `leaks ${q.id}`).toBe(false);
      }
      for (const t of servers) expect(corpus.includes(t.sd)).toBe(false);
      // 2. a handle is not a hash of a candidate key (plain, or keyed by the public session id)
      for (const t of servers) {
        const handles = itemHandles(t.sid, t.q);
        expect(corpus.includes(handles[0])).toBe(true);
        for (const q of SOURCE.questions) {
          for (const input of [q.id, `${t.sid}|${q.id}`]) {
            const tries = [...DIGESTS(input), createHmac("sha256", t.sid).update(q.id).digest("base64url").slice(0, 16)];
            for (const h of handles) for (const x of tries) expect(h.slice(2).startsWith(x.slice(0, 10))).toBe(false);
          }
        }
      }
      // 3. answers of mcq / true_false / ordering items: no digest of any candidate answer, of the
      //    answer-bearing id material or of a candidate content hash appears (the checked item aside)
      const lockedKey = servers[1].q[0];
      let tried = 0;
      for (const v of [...endView, ...immView]) {
        if (v.key === lockedKey) continue;
        const src = SOURCE.questions.find((q) => q.id === v.key);
        for (const cand of candidatePayloads(v.item.type, v.answer.payload)) {
          const ans = canonicalAnswer(v.item.type, cand);
          const oldIdInput = `${v.item.lesson.id}|${v.item.type}|${searchNormalize(v.item.stem)}|${ans}`;
          const hashes = [...DIGESTS(ans), ...DIGESTS(JSON.stringify(cand.answer)), ...DIGESTS(oldIdInput), contentHash({ ...src, payload: cand }).split(":").pop().slice(0, 12)];
          for (const h of hashes) expect(corpus.includes(h), `${v.key}: ${h}`).toBe(false);
          tried += 1;
        }
      }
      expect(tried).toBeGreaterThan(20);
      // 4. the resume state names items by handle only
      const resumed = await exams.getAttempt(imm.attempt_id);
      expect(resumed.questions.every((q) => HANDLE_RE.test(q.key))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("tampering and replay are still rejected: spliced tokens, foreign receipts, forged seen blobs", async () => {
    const a = await doStart({ template: "lesson-quiz", scope: "middle/grade-1/math/n53" });
    const b = await doStart({ template: "lesson-quiz", scope: "middle/grade-1/math/n53" });
    const view = await sessionView(a.body);
    // the sealed list of one session under the signed header of another: refused
    const [ha] = a.body.token.split(".");
    const [, sb] = b.body.token.split(".");
    const spliced = Buffer.from(JSON.stringify({ ...decodeTokenPayload(b.body.token), x: decodeTokenPayload(a.body.token).x })).toString("base64url");
    expect(await doCheck({ token: `${spliced}.${sb}`, position: 1, response: view[0].correct })).toEqual({ status: 400, body: { error: "token_invalid" } });
    expect(await doSubmit({ token: `${ha}.${sb}` })).toEqual({ status: 400, body: { error: "token_invalid" } });
    // a receipt replayed into another session is ignored; within its session it locks the item
    const ca = await doCheck({ token: a.body.token, position: 1, response: view[0].correct });
    const foreign = await doSubmit({ token: b.body.token, receipts: [ca.body.receipt] });
    expect(foreign.body.items.every((i) => !i.locked)).toBe(true);
    const own = await doSubmit({ token: a.body.token, answers: [{ position: 1, response: view[0].correct }], receipts: [ca.body.receipt, ca.body.receipt] });
    expect(own.body.items[0]).toMatchObject({ locked: true, score: 1 });
    // a seen blob with a flipped bit counts as no history (and grants nothing)
    const raw = Buffer.from(a.body.seen.slice(3), "base64url");
    raw[14] ^= 1;
    const forged = await doStart({ template: "lesson-quiz", scope: "middle/grade-1/math/n53", seen: `s1.${raw.toString("base64url")}` });
    expect(forged.status).toBe(200);
    expect(openSeen(forged.body.seen)).toEqual(serverView(forged.body.token).q);
  });

  it("resume keeps the start notices (reused, short, limited)", async () => {
    vi.stubGlobal("sessionStorage", memoryStorage());
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("fetch", async (url, init) => ROUTES[url](new Request(`https://jazira.test${url}`, { ...init, headers: { ...init.headers, host: "jazira.test", "x-forwarded-for": nextIp() } })));
    try {
      const s = await exams.startExam({ template: "chapter-quiz", scope: "middle/grade-1/math/n91", count: 20 });
      expect(s.short).toBe(true);
      // a second start in the same browser has seen the unit: items are reused
      const again = await exams.startExam({ template: "chapter-quiz", scope: "middle/grade-1/math/n91", count: 20 });
      expect(again.reused).toBe(true);
      for (const st of [s, again]) {
        const resumed = await exams.getAttempt(st.attempt_id);
        expect(resumed).toMatchObject({ status: "in_progress", short: st.short, reused: st.reused, limited: st.limited });
        expect(resumed.attempt).toMatchObject({ short: st.short, reused: st.reused });
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("lesson-quiz stratifies by objective over the runtime bank (§2.12)", () => {
  it("selection rows carry objective ids; every session covers the objective stratum", async () => {
    const bank = createRuntimeBank({ dir: BANK_DIR });
    const rows = (await bank.rowsForNode("middle/grade-1/math")).filter((r) => r.lesson === "middle/grade-1/math/n54");
    const withObjective = new Set(SOURCE.questions.filter((q) => q.objective_id && q.curriculum?.lesson === "middle/grade-1/math/n54").map((q) => q.id));
    expect(withObjective.size).toBeGreaterThan(0);
    for (const r of rows) expect(r.objective).toBe(withObjective.has(r.key) ? SOURCE.questions.find((q) => q.id === r.key).objective_id : null);
    const objectives = [...new Set(SOURCE.questions.filter((q) => withObjective.has(q.id)).map((q) => q.objective_id))];
    for (let i = 0; i < 12; i++) {
      globalThis.__jzSeed = createHash("sha256").update(`obj-${i}`).digest("hex").slice(0, 32);
      const s = await doStart({ template: "lesson-quiz", scope: "middle/grade-1/math/n54", count: 3 });
      expect(s.status).toBe(200);
      expect(serverView(s.body.token).q.some((k) => withObjective.has(k))).toBe(true);
      const strata = decodeTokenPayload(s.body.token).al.map(([cell]) => cell.split("#")[0]);
      expect(strata).toEqual(expect.arrayContaining(objectives));
    }
  });
});
