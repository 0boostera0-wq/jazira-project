// Guest exam engine — adversarial tests (docs/CONTENT_ENGINE.md §5.4, §5.8):
//   1. a position checked twice (wrong, read the key, then right) must not score;
//   2. verdicts are an answer oracle: replayed submits past the key-reveal cap are bounded;
//   3. nothing shown before submit depends on the answer (the ordering swap rule leaked it);
//   4. token/receipt forgery around the deadline.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

vi.mock("@/lib/supabase-admin", () => ({ createAdminClient: () => globalThis.__jzAdmin ?? null }));
vi.mock("@/lib/supabase-env", () => ({ isSupabaseConfigured: true, SUPABASE_URL: "", SUPABASE_KEY: "" }));
vi.mock("@/lib/supabase-server", () => ({
  createClient: async () => null,
  getRouteUser: async () => ({ supabase: null, user: null }),
}));
vi.mock("@/lib/curriculum-outline", () => ({
  nodeById: async (id) => globalThis.__jzTree.nodeById(id),
  lessonsUnder: async (id) => globalThis.__jzTree.lessonsUnder(id),
  subjectTerms: async (id) => globalThis.__jzTree.subjectTerms(id),
}));
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
import { correctDisplay } from "@/lib/exams/engine/grade";
import { createRuntimeBank, resetRuntimeBank } from "@/lib/exams/engine/runtime-bank.server";
import { verifySessionToken } from "@/lib/exams/engine/session-token";
import { claimCheck, resetCheckLocks } from "@/lib/exams/engine/check-lock";
import { dailyGradeLimit, takeGrades } from "@/lib/exams/engine/key-budget";
import { buildRuntimeBank, writeRuntimeBank } from "../../scripts/content/pack-runtime-bank.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const BANK_DIR = path.join(ROOT, "tests/fixtures/engine/runtime-bank");
const SOURCE = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/engine/bank-source.json"), "utf8"));
const TMP = [];
const seedOf = (i) => i.toString(16).padStart(32, "0");

function packTemp(source) {
  const staging = mkdtempSync(path.join(tmpdir(), "jz-staging-"));
  const out = mkdtempSync(path.join(tmpdir(), "jz-bank-"));
  TMP.push(staging, out);
  const w = (rel, text) => {
    mkdirSync(path.dirname(path.join(staging, rel)), { recursive: true });
    writeFileSync(path.join(staging, rel), text);
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
  const { files } = buildRuntimeBank({ stagingDir: staging, policy: "all" });
  writeRuntimeBank(out, files);
  return out;
}
const switchBank = (dir) => {
  process.env.RUNTIME_BANK_DIR = dir;
  resetRuntimeBank();
};

let ipCounter = 0;
const nextIp = () => `203.0.113.${(ipCounter++ % 250) + 1}`;
const call = async (handler, url, body, { ip = nextIp() } = {}) => {
  const res = await handler(new Request(`https://jazira.test${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip, host: "jazira.test" },
    body: JSON.stringify(body),
  }));
  return { status: res.status, body: await res.json() };
};
const doStart = (body, o) => call(start, "/api/exams/session/start", body, o);
const doCheck = (body, o) => call(check, "/api/exams/session/check", body, o);
const doSubmit = (body, o) => call(submit, "/api/exams/session/submit", body, o);

/** The server's view of a session: per position the item, its key row, display maps and correct display. */
async function sessionView(token, dir = BANK_DIR) {
  const bank = createRuntimeBank({ dir });
  const t = verifySessionToken(token, { anyTime: true }).data;
  const template = getTemplate(t.tpl, t.tv);
  const rows = new Map();
  for (const n of Object.keys((await bank.index()).nodes)) for (const r of (await bank.rowsForNode(n)) ?? []) rows.set(r.key, r);
  const picked = t.q.map((k) => rows.get(k));
  const content = await bank.content(picked);
  const keys = await bank.keys(picked);
  return t.q.map((k, i) => {
    const item = content.get(k);
    const answer = keys.get(k);
    const maps = displayMaps(t.sd, item, { template });
    return { position: i + 1, key: k, item, answer, maps, correct: correctDisplay(item, answer, maps) };
  });
}
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

/** A service-role fake that keeps ce_guest_check_lock rows (the shared lock) and allows every limiter hit. */
function lockingAdmin(rows = new Map(), calls = []) {
  return {
    rows,
    calls,
    rpc: async (fn, args) => {
      calls.push([fn, args]);
      if (fn === "rate_limit_hit") return { data: true, error: null };
      if (fn === "ce_guest_check_lock") {
        const id = `${args.p_sid}|${args.p_position}`;
        if (!rows.has(id)) {
          rows.set(id, args.p_resp_hash);
          return { data: "first", error: null };
        }
        return { data: rows.get(id) === args.p_resp_hash ? "repeat" : "locked", error: null };
      }
      return { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
    },
  };
}

const ENV = ["LOCAL_EXAM_SECRET", "EXAM_SECRET_REQUIRED", "RUNTIME_BANK_DIR", "EXAM_KEY_REVEAL_DAILY", "EXAM_GRADE_DAILY"];
const savedEnv = {};
beforeAll(() => {
  for (const k of ENV) savedEnv[k] = process.env[k];
});
beforeEach(() => {
  process.env.LOCAL_EXAM_SECRET = "attack-test-secret-".padEnd(40, "y");
  delete process.env.EXAM_SECRET_REQUIRED;
  delete process.env.EXAM_KEY_REVEAL_DAILY;
  delete process.env.EXAM_GRADE_DAILY;
  switchBank(BANK_DIR);
  resetCheckLocks();
  globalThis.__jzTree = createTree(SOURCE.nodes);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  delete globalThis.__jzAdmin;
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
  resetCheckLocks();
  for (const d of TMP) rmSync(d, { recursive: true, force: true });
});

// ============================================================================
describe("attack: score a checked position twice", () => {
  it("check wrong → read the key → check right is item_locked (no verdict, no receipt); the first receipt stands", async () => {
    const s = await doStart({ template: "lesson-quiz", scope: "middle/grade-1/math/n53" });
    expect(s.body.feedback_mode).toBe("immediate");
    const [v] = await sessionView(s.body.token);
    const wrong = await doCheck({ token: s.body.token, position: v.position, response: wrongOf(v) });
    expect(wrong.status).toBe(200);
    expect(wrong.body.score).toBeLessThan(1);
    expect(wrong.body.correct_response).toEqual(v.correct); // the key is now known to the client
    const right = await doCheck({ token: s.body.token, position: v.position, response: wrong.body.correct_response });
    expect(right).toEqual({ status: 409, body: { error: "item_locked", position: v.position } });
    // from another IP too: the lock belongs to the session position, not to the caller
    expect((await doCheck({ token: s.body.token, position: v.position, response: v.correct })).status).toBe(409);
    // the same wrong response again (a retry after a lost reply): same verdict and score, a receipt again
    const retry = await doCheck({ token: s.body.token, position: v.position, response: wrongOf(v) });
    expect(retry.status).toBe(200);
    expect(retry.body).toMatchObject({ verdict: wrong.body.verdict, score: wrong.body.score });
    const r = await doSubmit({ token: s.body.token, answers: [{ position: v.position, response: v.correct }], receipts: [retry.body.receipt] });
    expect(r.body.items.find((i) => i.position === v.position)).toMatchObject({ score: wrong.body.score, locked: true });
    expect(r.body.correct_count).toBe(0);
  });

  it("the lock is shared across server instances through ce_guest_check_lock (only sid, position and a response hash are sent)", async () => {
    const admin = lockingAdmin();
    globalThis.__jzAdmin = admin;
    const s = await doStart({ template: "lesson-quiz", scope: "middle/grade-1/math/n53" });
    delete globalThis.__jzAdmin;
    const [v] = await sessionView(s.body.token);
    globalThis.__jzAdmin = admin;
    expect((await doCheck({ token: s.body.token, position: v.position, response: wrongOf(v) })).status).toBe(200);
    resetCheckLocks(); // "another instance": no memory of the first check
    expect((await doCheck({ token: s.body.token, position: v.position, response: v.correct })).body).toEqual({ error: "item_locked", position: v.position });
    const lockCalls = admin.calls.filter(([fn]) => fn === "ce_guest_check_lock").map(([, a]) => a);
    expect(lockCalls).toHaveLength(2);
    for (const a of lockCalls) {
      expect(Object.keys(a).sort()).toEqual(["p_expires_at", "p_position", "p_resp_hash", "p_sid"]);
      expect(a.p_resp_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(a)).not.toContain(v.key);
    }
    const t = verifySessionToken(s.body.token).data;
    expect(Date.parse(lockCalls[0].p_expires_at)).toBe(t.dl + t.g * 1000);
  });

  it("claimCheck: first / repeat / locked; the memory fallback expires with the session", async () => {
    const store = new Map();
    const c = { sid: "g-AAAAAAAAAAAAAAAAAAAAAA", pos: 3, respHash: "a".repeat(64), expiresAt: 1000 };
    expect(await claimCheck(c, { admin: null, store, now: 0 })).toBe("first");
    expect(await claimCheck(c, { admin: null, store, now: 1 })).toBe("repeat");
    expect(await claimCheck({ ...c, respHash: "b".repeat(64) }, { admin: null, store, now: 2 })).toBe("locked");
    expect(await claimCheck({ ...c, pos: 4, respHash: "b".repeat(64) }, { admin: null, store, now: 2 })).toBe("first");
    // after deadline + grace the token is refused anyway; the slot may be reused
    expect(await claimCheck({ ...c, respHash: "b".repeat(64) }, { admin: null, store, now: 1001 })).toBe("first");
    await expect(claimCheck({ ...c, sid: "nope" }, { admin: null, store })).rejects.toThrow();
    // a failing shared lock falls back to memory (logged), never to "no lock"
    const broken = { rpc: async () => ({ data: null, error: { code: "57P01", message: "down" } }) };
    const s2 = new Map();
    expect(await claimCheck(c, { admin: broken, store: s2, now: 0 })).toBe("first");
    expect(await claimCheck({ ...c, respHash: "c".repeat(64) }, { admin: broken, store: s2, now: 0 })).toBe("locked");
  });
});

// ============================================================================
describe("attack: verdicts as an answer oracle past the key-reveal cap", () => {
  it("replayed submits of one token cannot read keys off verdicts beyond the daily grading cap", async () => {
    process.env.EXAM_KEY_REVEAL_DAILY = "10"; // grading cap: 20 graded answers a day
    expect(dailyGradeLimit()).toBe(20);
    const ip = "192.0.2.150";
    const s = await doStart({ template: "chapter-quiz", scope: "middle/grade-1/math/n91", count: 10 }, { ip });
    const view = await sessionView(s.body.token);
    // burn the key-reveal cap with empty submits (no verdicts, so no grading cost)
    expect((await doSubmit({ token: s.body.token, answers: [] }, { ip })).body.key_reveal_limit).toBe(false);
    expect((await doSubmit({ token: s.body.token, answers: [] }, { ip })).body.key_reveal_limit).toBe(true);
    // the oracle: submit option k for every choice item, k = 0, 1, 2, …
    const choice = view.filter((v) => v.item.type === "mcq" || v.item.type === "true_false");
    expect(choice.length).toBeGreaterThan(3);
    let verdicts = 0;
    const learned = new Set();
    let refused = null;
    for (let k = 0; k < 6; k++) {
      const answers = choice.map((v) => ({ position: v.position, response: { option_index: k % v.item.public.options.length } }));
      const r = await doSubmit({ token: s.body.token, answers }, { ip });
      if (r.status !== 200) {
        refused = r;
        break;
      }
      expect(r.body.key_reveal_limit).toBe(true);
      for (const it of r.body.items) {
        if (it.verdict === "correct" || it.verdict === "incorrect") verdicts += 1;
        if (it.verdict === "correct") learned.add(it.position);
      }
    }
    expect(refused).toEqual({ status: 429, body: { error: "rate_limited" } });
    expect(verdicts).toBeLessThanOrEqual(20);
    // an empty submit still works (it grades nothing) and still hides keys past the cap
    const after = await doSubmit({ token: s.body.token, answers: [] }, { ip });
    expect(after.status).toBe(200);
    expect(after.body.items.every((i) => i.verdict === "unanswered" && i.correct_response === null)).toBe(true);
    // another client (IP) is unaffected
    expect((await doSubmit({ token: s.body.token, answers: [{ position: 1, response: null }] }, { ip: nextIp() })).status).toBe(200);
  });

  it("every /check verdict is charged too (EXAM_GRADE_DAILY)", async () => {
    process.env.EXAM_GRADE_DAILY = "10";
    const ip = "192.0.2.151";
    let ok = 0;
    let last = null;
    for (let i = 0; i < 4 && last === null; i++) {
      const s = await doStart({ template: "lesson-quiz", scope: "middle/grade-1/math/n53" }, { ip: nextIp() });
      for (const v of await sessionView(s.body.token)) {
        const r = await doCheck({ token: s.body.token, position: v.position, response: v.correct }, { ip });
        if (r.status === 200) ok += 1;
        else {
          last = r;
          break;
        }
      }
    }
    expect(ok).toBe(10);
    expect(last).toEqual({ status: 429, body: { error: "rate_limited" } });
  });

  it("takeGrades charges one limiter hit per graded answer and nothing for zero", async () => {
    const hits = [];
    const limiter = async (o) => {
      hits.push(o);
      return hits.length > 5;
    };
    expect(await takeGrades("ip", 0, { limiter })).toBe(true);
    expect(hits).toHaveLength(0);
    expect(await takeGrades("ip", 4, { limiter, env: { EXAM_GRADE_DAILY: "50" } })).toBe(true);
    expect(hits).toHaveLength(4);
    expect(hits.every((h) => h.bucket === "exams.grades" && h.max === 50 && h.windowSeconds === 86400)).toBe(true);
    expect(await takeGrades("ip", 4, { limiter })).toBe(false);
  });
});

// ============================================================================
describe("attack: nothing shown before submit depends on the answer", () => {
  const ORD_KEY = "q-m1-math-66220e7159"; // ordering, lesson n53

  it("an ordering item whose shuffle lands on the answer is shown in the answer order (no swap to avoid it)", async () => {
    const bank = createRuntimeBank({ dir: BANK_DIR });
    const rows = (await bank.rowsForNode("middle/grade-1/math")).filter((r) => r.key === ORD_KEY);
    const item = (await bank.content(rows)).get(ORD_KEY);
    const answer = (await bank.keys(rows)).get(ORD_KEY).payload.answer.order;
    // a seed whose plain shuffle equals the answer (the old rule then swapped the first two)
    let i = 0;
    while (!displayMaps(seedOf(i), item).display_map.items.every((id, j) => id === answer[j])) i += 1;
    globalThis.__jzSeed = seedOf(i);
    const s = await doStart({ template: "lesson-quiz", scope: "middle/grade-1/math/n53", count: 6 });
    expect(s.status).toBe(200);
    const view = await sessionView(s.body.token);
    const v = view.find((x) => x.key === ORD_KEY);
    expect(v).toBeTruthy();
    expect(v.correct).toEqual({ order: answer.map((_, j) => j) }); // shown exactly in the answer order
    const shown = s.body.questions.find((q) => q.position === v.position).public.items.map((x) => x.text);
    const text = new Map(item.public.items.map((x) => [x.id, x.text]));
    expect(shown).toEqual(answer.map((id) => text.get(id)));
  });

  it("two banks that differ only in the ordering answers serve identical sessions for every seed", async () => {
    const other = JSON.parse(JSON.stringify(SOURCE));
    for (const q of other.questions) if (q.question_type === "ordering") q.payload.answer.order = [...q.payload.answer.order].reverse();
    const dirB = packTemp(other);
    vi.useFakeTimers({ now: Date.parse("2026-10-01T12:00:00Z"), toFake: ["Date"] });
    for (let i = 0; i < 40; i++) {
      globalThis.__jzSeed = seedOf(i);
      switchBank(BANK_DIR);
      const a = await doStart({ template: "lesson-quiz", scope: "middle/grade-1/math/n53", count: 6 });
      switchBank(dirB);
      const b = await doStart({ template: "lesson-quiz", scope: "middle/grade-1/math/n53", count: 6 });
      const strip = (qs) => qs.map(({ key: _k, ...rest }) => rest);
      expect(strip(b.body.questions), `seed ${i}`).toEqual(strip(a.body.questions));
    }
  });
});

// ============================================================================
describe("attack: tokens and receipts around the deadline", () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const header = (token) => JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));

  it("a re-encoded header with a later deadline (or another sid) fails the signature", async () => {
    const s = await doStart({ template: "lesson-quiz", scope: "middle/grade-1/math/n53", timing: "timed" });
    const sig = s.body.token.split(".")[1];
    const h = header(s.body.token);
    for (const forged of [{ ...h, dl: h.dl + 3600_000 }, { ...h, g: 3600 }, { ...h, fb: "immediate", tm: "untimed" }, { ...h, lim: { ...h.lim, tier: "free" } }]) {
      const tok = `${b64(forged)}.${sig}`;
      expect(await doCheck({ token: tok, position: 1, response: { option_index: 0 } })).toEqual({ status: 400, body: { error: "token_invalid" } });
      expect(await doSubmit({ token: tok })).toEqual({ status: 400, body: { error: "token_invalid" } });
    }
  });

  it("a receipt re-encoded for another position or a higher score is ignored", async () => {
    const s = await doStart({ template: "lesson-quiz", scope: "middle/grade-1/math/n53" });
    const [a, b] = await sessionView(s.body.token);
    const c = await doCheck({ token: s.body.token, position: a.position, response: wrongOf(a) });
    const [body, sig] = c.body.receipt.split(".");
    const d = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    const forged = [`${b64({ ...d, score: 1 })}.${sig}`, `${b64({ ...d, pos: b.position })}.${sig}`];
    const r = await doSubmit({ token: s.body.token, answers: [{ position: b.position, response: b.correct }], receipts: forged });
    expect(r.body.items.every((i) => !i.locked)).toBe(true);
    expect(r.body.correct_count).toBe(0); // immediate: without a valid receipt a position is unanswered
  });

  it("a check after deadline + grace is refused, so no receipt can be minted late", async () => {
    const t0 = Date.parse("2026-10-01T12:00:00Z");
    vi.useFakeTimers({ now: t0, toFake: ["Date"] });
    const s = await doStart({ template: "lesson-quiz", scope: "middle/grade-1/math/n53", timing: "timed" });
    const [a] = await sessionView(s.body.token);
    vi.setSystemTime(t0 + s.body.time_limit_seconds * 1000 + 31_000);
    expect(await doCheck({ token: s.body.token, position: a.position, response: a.correct })).toEqual({ status: 410, body: { error: "token_expired" } });
    const late = await doSubmit({ token: s.body.token, answers: [{ position: a.position, response: a.correct }] });
    expect(late.body).toMatchObject({ status: "expired", correct_count: 0 });
  });
});
