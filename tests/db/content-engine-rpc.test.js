// ============================================================================
// Content-engine RPCs on PGlite (docs/CONTENT_ENGINE.md §5.7, §5.8, §6.2,
// WP7): the RPC contract fixtures of tests/fixtures/contracts/rpc/, the
// attack tests, the revision guard and the session lifecycle. The bank is
// the WP6 engine fixture (tests/fixtures/engine/bank-source.json) imported
// with scripts/content/import-staging.mjs, so ce_guest_start must equal the
// JS engine exactly.
// ============================================================================
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { REPO_ROOT, createDb } from "./harness.js";
import { createPgliteExecutor } from "../../scripts/content/lib/import-executors.mjs";
import { importStaging } from "../../scripts/content/import-staging.mjs";
import { writeStagingTree } from "../../scripts/content/lib/import-plan.mjs";
import { TEMPLATES, getTemplate } from "../../src/lib/exams/engine/exam-templates.js";
import { selectSession } from "../../src/lib/exams/engine/select.js";

const CONTRACT_DIR = path.join(REPO_ROOT, "tests/fixtures/contracts/rpc");
const contract = (name) => JSON.parse(readFileSync(path.join(CONTRACT_DIR, `${name}.json`), "utf8"));
const BANK = JSON.parse(readFileSync(path.join(REPO_ROOT, "tests/fixtures/engine/bank-source.json"), "utf8"));
const clone = (v) => JSON.parse(JSON.stringify(v));
const tmp = (p) => mkdtempSync(path.join(tmpdir(), `jz-${p}-`));
const DENIED = { code: "42501" };

let h;
let pg;
const cacheDir = tmp("cache");

/** Import a staging tree made of the bank records (+ edits). */
async function importBank(edit = (r) => r) {
  const records = edit({
    registry: clone(BANK.registry), nodes: clone(BANK.nodes), objectives: clone(BANK.objectives), resources: clone(BANK.resources),
    stimuli: clone(BANK.stimuli), questions: clone(BANK.questions), templates: clone(TEMPLATES),
  });
  const dir = tmp("tree");
  writeStagingTree(dir, records);
  const r = await importStaging({ target: "pglite", executor: pg, stagingDir: dir, cacheDir, validate: false, noRetire: true, sleep: async () => {} });
  expect(r.errors).toEqual([]);
  return r;
}

/** Extra published copies of the math items (other keys, same lessons): a larger pool. */
function augmented(r) {
  const extra = [];
  for (const q of r.questions) {
    if (q.scope !== "curriculum" || q.curriculum.subject !== "middle/grade-1/math" || q.status !== "published" || q.is_premium) continue;
    for (const n of [1, 2]) {
      const c = clone(q);
      c.id = `${q.id.slice(0, -2)}${n}${n}`;
      c.stem = `${q.stem} (${n})`;
      c.dedup = { ...c.dedup, exclusion_group: null };
      extra.push(c);
    }
  }
  return { ...r, questions: [...r.questions, ...extra] };
}

// ── callers ─────────────────────────────────────────────────────────────────
/** Named-argument call like PostgREST: fn({ p_a: 1 }) → select public.fn(p_a => $1::type). */
async function call(role, uid, fn, args = {}) {
  const [sig] = await h.sql(`select p.proargnames as names,
      array(select format_type(t, null) from unnest(p.proargtypes::oid[]) with ordinality u(t, o) order by o) as types
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1`, [fn]);
  const params = [];
  const parts = Object.entries(args).map(([k, v]) => {
    const i = sig.names.indexOf(k);
    if (i < 0) throw new Error(`${fn}: unknown argument ${k}`);
    params.push(v !== null && typeof v === "object" && sig.types[i] === "jsonb" ? JSON.stringify(v) : v);
    return `${k} => $${params.length}::${sig.types[i]}`;
  });
  const q = `select public.${fn}(${parts.join(", ")}) as r`;
  const run = (tx) => tx.sql(q, params);
  const rows = role === "anon" ? await h.asAnon(run) : role === "service_role" ? await h.asService(run) : await h.asUser(uid, run);
  const v = rows[0].r;
  return v === "" ? null : v;
}
/** → { data } | { error: { message, details, code } } (PostgREST's shape). */
async function rpc(role, uid, fn, args) {
  try {
    return { data: await call(role, uid, fn, args) };
  } catch (e) {
    let details = null;
    if (e.detail) {
      try {
        details = JSON.parse(e.detail);
      } catch {
        details = e.detail;
      }
    }
    return { error: { message: e.message, details, code: e.code } };
  }
}
const asUser = (uid) => ({
  call: (fn, args) => call("authenticated", uid, fn, args),
  rpc: (fn, args) => rpc("authenticated", uid, fn, args),
});

/**
 * Contract shape: every key of the fixture exists with the same JSON type
 * (placeholders vary); arrays compare their first element; a null in the
 * fixture accepts any value.
 */
function expectShape(got, expected, where = "$") {
  if (expected === null) return;
  if (typeof expected === "string" && /^<.*>$/s.test(expected)) return; // a placeholder ("<25 items>")
  if (Array.isArray(expected)) {
    expect(Array.isArray(got), `${where} is an array`).toBe(true);
    if (!expected.length || !got.length) return;
    // typed rows (questions, items) are compared with a row of the same type
    const sample = expected[0];
    const peer = sample && typeof sample === "object" && "type" in sample ? got.find((g) => g?.type === sample.type) : got[0];
    if (peer !== undefined) expectShape(peer, sample, `${where}[0]`);
    return;
  }
  if (typeof expected === "object") {
    if (got === null) return; // nullable (e.g. no stimulus, no source for this item)
    expect(got !== null && typeof got === "object" && !Array.isArray(got), `${where} is an object`).toBe(true);
    for (const k of Object.keys(expected)) {
      expect(Object.prototype.hasOwnProperty.call(got, k), `${where}.${k} present`).toBe(true);
      expectShape(got[k], expected[k], `${where}.${k}`);
    }
    return;
  }
  if (got === null) return; // nullable fields (e.g. a lesson title) may be null in another data set
  expect(typeof got, `${where} type`).toBe(typeof expected);
}

/** position → real question key of an attempt (payloads carry opaque handles only). */
async function realKeys(attemptId) {
  const rows = await h.sql(`select i.position, q.key from public.exam_attempt_items i join public.questions q on q.id = i.question_id
    where i.attempt_id = $1`, [attemptId]);
  return new Map(rows.map((r) => [r.position, r.key]));
}

async function newUser({ premium = false } = {}) {
  const u = await h.createUser();
  if (premium) await h.sql("update public.profiles set is_elite = true where id = $1", [u]);
  return u;
}

beforeAll(async () => {
  h = await createDb();
  pg = await createPgliteExecutor({ harness: h });
  await importBank();
}, 300000);

afterAll(async () => {
  await h?.close();
});

// ============================================================================
describe("guest selection in SQL = the JS engine (ce_guest_start, ce_guest_items)", () => {
  for (const name of ["ce_guest_start", "ce_guest_items"]) {
    it(`${name}: every contract case, exactly`, async () => {
      const f = contract(name);
      for (const c of f.cases) {
        const res = await rpc(c.role ?? "service_role", null, name, c.args);
        if (c.error) expect({ message: res.error?.message, details: res.error?.details ?? null }, c.name).toEqual({ message: c.error.message, details: c.error.details ?? null });
        else expect(res.data, c.name).toEqual(c.response);
      }
      const denied = await rpc("anon", null, name, f.cases[0].args);
      expect(denied.error).toMatchObject({ code: "42501" });
    });
  }

  it("lesson-quiz strata are the items' objectives (else their lesson), in SQL exactly as in the JS engine", async () => {
    const lesson = "middle/grade-1/math/n54";
    const t = getTemplate("lesson-quiz");
    expect(t.coverage.stratify_by).toBe("objective");
    const want = new Map(BANK.questions.filter((q) => q.curriculum?.lesson_node_id === lesson || q.curriculum?.lesson === lesson)
      .map((q) => [q.id, q.objective_id ?? null]));
    const pool = await h.sql(`select to_jsonb(p) r from unnest(public._ce_pool(
        public._ce_resolve_scope(public._ce_parse_scope($1), $2::jsonb, 'premium', null), $2::jsonb, true)) p`, [lesson, JSON.stringify(t)]);
    const rows = pool.map((x) => x.r);
    expect(rows.length).toBeGreaterThan(5);
    // scope_pool_members carries each item's objective_id (ce_refresh_aggregates)
    for (const r of rows) expect(r.objective, r.key).toBe(want.get(r.key) ?? null);
    const withObjective = rows.filter((r) => r.objective);
    expect(withObjective.length).toBeGreaterThan(0);
    expect(rows.some((r) => !r.objective)).toBe(true);
    const [{ n }] = await h.sql("select count(*)::int n from public.scope_pool_members where objective_id is not null");
    expect(n).toBe(new Set(BANK.questions.filter((q) => q.objective_id && q.status === "published").map((q) => q.id)).size);

    for (const [seed, premium, count] of [["0123456789abcdef0123456789abcdef", true, 10], ["fedcba9876543210fedcba9876543210", false, 6], ["00000000000000000000000000000001", true, 3]]) {
      const min = Math.min(t.count.min, count);
      const js = selectSession({ template: t, n: count, minRequired: min, seed, pool: rows, premiumAllowed: premium, now: 0 });
      const [{ r: sql }] = await h.sql(`select public._ce_select_rows($1::jsonb, $2::int, $3::int, $4,
          array(select jsonb_populate_record(null::public.ce_pool_item, e) from jsonb_array_elements($5::jsonb) e),
          '[]'::jsonb, null, null, null, 0, $6) r`, [JSON.stringify(t), count, min, seed, JSON.stringify(rows), premium]);
      expect({ ok: sql.ok, keys: sql.keys, stored: sql.stored }, seed).toEqual({ ok: js.ok, keys: js.keys, stored: js.stored });
      const strata = new Set(sql.stored.map(([cell]) => cell.slice(0, cell.lastIndexOf("#"))));
      for (const s of strata) expect(s === lesson || withObjective.some((r) => r.objective === s), s).toBe(true);
    }
    // the objective strata reach the guest selection and a member's attempt
    const guest = await call("service_role", null, "ce_guest_start", { p_template: "lesson-quiz", p_scope: lesson, p_seed: "0".repeat(32), p_seen: [], p_count: 10 });
    const free = rows.filter((r) => !r.premium && r.objective).map((r) => r.objective);
    if (free.length) expect(guest.allocation.some(([cell]) => free.includes(cell.slice(0, cell.lastIndexOf("#"))))).toBe(true);
    const u = await newUser({ premium: true });
    const s = await asUser(u).call("start_template_attempt", { p_template: "lesson-quiz", p_scope: lesson, p_count: 20 });
    const [{ alloc }] = await h.sql("select meta -> 'allocation' alloc from public.exam_attempts where id = $1", [s.attempt_id]);
    expect(alloc.some(([cell]) => cell.startsWith("obj-"))).toBe(true);
  });

  it("the guest pool never ships the pool: only the picked rows come back", async () => {
    const r = await call("service_role", null, "ce_guest_start", { p_template: "practice", p_scope: "middle/grade-1/math", p_seed: "0".repeat(32), p_seen: [], p_count: 5 });
    expect(r.items).toHaveLength(5);
    expect(r.items.every((it) => it.key.startsWith("q-m1-math-"))).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/"answer"|accepted|explanation/);
  });
});

// ============================================================================
describe("RPC contracts (tests/fixtures/contracts/rpc)", () => {
  beforeAll(async () => {
    await importBank(augmented); // a larger pool for full-year / chapter sessions
  }, 300000);

  it("grants of every contract RPC match the fixture", async () => {
    const files = readdirSync(CONTRACT_DIR).filter((f) => f.endsWith(".json"));
    expect(files.length).toBe(18);
    for (const f of files) {
      const c = JSON.parse(readFileSync(path.join(CONTRACT_DIR, f), "utf8"));
      const [{ sig }] = await h.sql("select p.oid::regprocedure::text sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1", [c.rpc]);
      for (const role of ["anon", "authenticated", "service_role"]) {
        const [{ ok }] = await h.sql("select has_function_privilege($1, $2, 'execute') ok", [role, `public.${sig}`]);
        expect(ok, `${c.rpc} ${role}`).toBe(c.grants.includes(role));
      }
    }
  });

  it("start_template_attempt", async () => {
    const f = contract("start_template_attempt");
    const u = await newUser();
    const other = await newUser();
    const byName = Object.fromEntries(f.cases.map((c) => [c.name, c]));
    const chapter = await asUser(u).rpc("start_template_attempt", byName["chapter quiz for a free member"].args);
    expectShape(chapter.data, byName["chapter quiz for a free member"].response);
    expect(chapter.data).toMatchObject({ mode: "db", question_count: 10, mini: false, template: { id: "chapter-quiz", version: 1, kind: "chapter" } });
    expect(chapter.data.questions.map((q) => q.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    const year = await asUser(u).rpc("start_template_attempt", byName["full year for a free member runs as the mini version"].args);
    expectShape(year.data, byName["full year for a free member runs as the mini version"].response);
    expect(year.data).toMatchObject({ mini: true, limited: true, requested_count: 60, question_count: 25, term_scope: "year" });

    expect((await asUser(u).rpc("start_template_attempt", byName["a client seed is refused"].args)).error).toMatchObject({ message: "seed_not_allowed", details: null });
    const theirs = await asUser(other).call("start_template_attempt", { p_template: "chapter-quiz", p_scope: "middle/grade-1/math/n91" });
    const retake = { ...byName["retake of another member's attempt"].args, p_retake_of: theirs.attempt_id };
    expect((await asUser(u).rpc("start_template_attempt", retake)).error).toMatchObject({ message: "not_found", details: null });
    expect((await asUser(u).rpc("start_template_attempt", byName["immediate feedback on an end-only template"].args)).error)
      .toMatchObject({ message: "feedback_not_allowed", details: null });
    // the augmented math pool is large enough for a term exam; science (t1) is not
    const short = await asUser(u).rpc("start_template_attempt", { ...byName["not enough items"].args, p_scope: "middle/grade-1/science@t1" });
    expect(short.error.message).toBe("insufficient_pool");
    expectShape(short.error.details, byName["not enough items"].error.details);
    expect(short.error.details.required).toBe(20);
    expect((await rpc("anon", null, "start_template_attempt", byName.anon.args)).error).toMatchObject(DENIED);
    // "a scope above 5,000 eligible items" needs a large bank: tests/db/content-perf.test.js
    expect(byName["a scope above 5,000 eligible items"].error.message).toBe("scope_too_large");
  });

  it("save_exam_response, check_exam_item, get_exam_attempt, submit_exam_attempt, abandon_exam_attempt", async () => {
    const u = await newUser();
    const other = await newUser();
    const s = await asUser(u).call("start_template_attempt", { p_template: "chapter-quiz", p_scope: "middle/grade-1/math/n91", p_count: 10 });
    const at = (type) => s.questions.find((q) => q.type === type);
    const mcq = at("mcq");
    const save = contract("save_exam_response");
    const ok = await asUser(u).rpc("save_exam_response", { p_attempt: s.attempt_id, p_position: mcq.position, p_response: { option_index: 2 }, p_time_spent: 14 });
    expectShape(ok.data, save.cases[0].response);
    expect(ok.data).toMatchObject({ position: mcq.position, response: { option_index: 2 }, time_spent_seconds: 14, flagged: false });
    const matching = at("matching");
    if (matching) {
      const m = await asUser(u).rpc("save_exam_response", { p_attempt: s.attempt_id, p_position: matching.position, p_response: { pairs: [[0, 2], [1, 0], [2, 1]] } });
      expectShape(m.data, save.cases[1].response);
    }
    expect((await asUser(u).rpc("save_exam_response", { p_attempt: s.attempt_id, p_position: mcq.position, p_response: { option_index: 9 } })).error)
      .toMatchObject({ message: "invalid_response", details: { position: mcq.position, reason: "index_out_of_range" } });
    const numeric = at("numeric");
    if (numeric) {
      expect((await asUser(u).rpc("save_exam_response", { p_attempt: s.attempt_id, p_position: numeric.position, p_response: { value: "0,125" } })).error)
        .toMatchObject({ message: "invalid_response", details: { position: numeric.position, reason: "ambiguous_separator" } });
    }
    expect((await asUser(other).rpc("save_exam_response", { p_attempt: s.attempt_id, p_position: 1, p_response: { option_index: 1 } })).error)
      .toMatchObject({ message: "attempt_not_found", details: null });

    // check_exam_item is for immediate-feedback sessions only
    const check = contract("check_exam_item");
    expect((await asUser(u).rpc("check_exam_item", { p_attempt: s.attempt_id, p_position: mcq.position })).error)
      .toMatchObject({ message: "feedback_not_allowed", details: null });
    const lq = await asUser(u).call("start_template_attempt", { p_template: "lesson-quiz", p_scope: "middle/grade-1/math/n54", p_count: 20 });
    expect(lq.feedback_mode).toBe("immediate");
    const q1 = lq.questions.find((q) => q.type === "matching"); // the fixture's check case is a matching item
    const resp = { pairs: [[0, 0], [1, 1], [2, 2]] };
    const empty = lq.questions.find((q) => q.position !== q1.position).position;
    await asUser(u).call("save_exam_response", { p_attempt: lq.attempt_id, p_position: q1.position, p_response: resp });
    const checked = await asUser(u).rpc("check_exam_item", { p_attempt: lq.attempt_id, p_position: q1.position });
    expectShape(checked.data, check.cases[0].response);
    expect(["correct", "incorrect", "partial"]).toContain(checked.data.verdict);
    expect(checked.data.response).toEqual(resp);
    expect((await asUser(u).rpc("check_exam_item", { p_attempt: lq.attempt_id, p_position: empty })).error)
      .toMatchObject({ message: "invalid_response", details: { position: empty, reason: "empty" } });
    expect((await asUser(u).rpc("check_exam_item", { p_attempt: lq.attempt_id, p_position: q1.position })).error)
      .toMatchObject({ message: "item_locked", details: { position: q1.position } });
    // a locked item keeps its response; the runner may still (re)save it with its flag
    const flaggedSave = await asUser(u).rpc("save_exam_response", { p_attempt: lq.attempt_id, p_position: q1.position, p_response: resp, p_flagged: true });
    expectShape(flaggedSave.data, save.cases[1].response);
    expect(flaggedSave.data).toMatchObject({ position: q1.position, response: resp, flagged: true });
    expect((await asUser(u).rpc("save_exam_response", { p_attempt: lq.attempt_id, p_position: q1.position, p_response: { pairs: [[0, 1], [1, 0], [2, 2]] } })).error)
      .toMatchObject({ message: "item_locked", details: { position: q1.position } });
    const resumed = await asUser(u).call("get_exam_attempt", { p_attempt: lq.attempt_id });
    expect(resumed.answers.find((a) => a.position === q1.position)).toMatchObject({ locked: true, check: { verdict: checked.data.verdict } });

    // resume, submit, double submit, another member
    const get = contract("get_exam_attempt");
    const inProgress = await asUser(u).call("get_exam_attempt", { p_attempt: s.attempt_id });
    expectShape(inProgress, get.cases[0].response);
    expect(inProgress.answers.find((a) => a.position === mcq.position).response).toEqual({ option_index: 2 });
    const submit = contract("submit_exam_attempt");
    const answers = s.questions.map((q) => ({ position: q.position, response: q.type === "mcq" ? { option_index: 0 } : null }));
    const result = await asUser(u).call("submit_exam_attempt", { p_attempt: s.attempt_id, p_answers: answers });
    expectShape(result, submit.cases[0].response);
    expect(result.items).toHaveLength(10);
    const again = await asUser(u).call("submit_exam_attempt", { p_attempt: s.attempt_id, p_answers: null });
    expect(again).toEqual(result);
    expectShape(await asUser(u).call("get_exam_attempt", { p_attempt: s.attempt_id }), get.cases[1].response);
    expect((await asUser(other).rpc("submit_exam_attempt", { p_attempt: s.attempt_id, p_answers: null })).error)
      .toMatchObject({ message: "attempt_not_found", details: null });

    const abandon = contract("abandon_exam_attempt");
    const ab = await asUser(u).call("abandon_exam_attempt", { p_attempt: lq.attempt_id });
    expectShape(ab, abandon.cases[0].response);
    expect(ab).toMatchObject({ status: "abandoned", xp_awarded: 0 });
    expect((await asUser(u).rpc("abandon_exam_attempt", { p_attempt: s.attempt_id })).error)
      .toMatchObject({ message: "attempt_closed", details: { status: "submitted" } });
  });

  it("list_exam_attempts_v2, get_learning_stats, get_practice_recommendations", async () => {
    const u = await newUser();
    const legacy = await asUser(u).call("start_exam_attempt", { p_exam: "aptitude", p_section: "verbal", p_count: 5 });
    await asUser(u).call("submit_exam_attempt", { p_attempt: legacy.attempt_id, p_answers: null });
    for (let i = 0; i < 2; i++) {
      const s = await asUser(u).call("start_template_attempt", { p_template: "chapter-quiz", p_scope: "middle/grade-1/math/n91", p_count: 10 });
      await asUser(u).call("submit_exam_attempt", { p_attempt: s.attempt_id, p_answers: s.questions.map((q) => ({ position: q.position, response: q.type === "mcq" ? { option_index: 1 } : null })) });
    }
    const list = contract("list_exam_attempts_v2");
    const page = await asUser(u).call("list_exam_attempts_v2", { p_limit: 2 });
    expect(page).toHaveLength(2);
    expectShape(page, list.cases[0].response);
    expect(page[0]).toMatchObject({ exam: "school", template_id: "chapter-quiz", scope: "middle/grade-1/math/n91", scope_title: expect.any(String) });
    const rest = await asUser(u).call("list_exam_attempts_v2", { p_limit: 2, p_before: page[1].started_at, p_before_id: page[1].id });
    expect(rest.map((a) => a.template_id)).toEqual([null]);
    expect(rest[0]).toMatchObject({ exam: "aptitude", section: "verbal", scope: null });
    expect((await asUser(u).rpc("list_exam_attempts_v2", { p_limit: 500 })).error).toMatchObject({ message: "invalid_argument", details: { field: "limit" } });

    const stats = contract("get_learning_stats");
    const st = await asUser(u).call("get_learning_stats", { p_node: "middle/grade-1/math" });
    expectShape(st, { ...stats.cases[0].response, by_lesson: [], repeated_mistakes: [] });
    expect(st.totals.answered).toBeGreaterThan(0);
    expect(st.locked).toEqual(["by_topic"]);
    expect((await asUser(u).rpc("get_learning_stats", { p_node: "middle/grade-1/math/n999" })).error).toMatchObject({ message: "scope_not_found", details: null });
    const all = await asUser(u).call("get_learning_stats", {});
    expect(all.totals.answered).toBeGreaterThanOrEqual(st.totals.answered);

    const recs = await asUser(u).call("get_practice_recommendations", { p_limit: 5 });
    expect(Array.isArray(recs)).toBe(true);
    if (recs.length) expectShape(recs, contract("get_practice_recommendations").cases[0].response);
    expect((await asUser(u).rpc("get_practice_recommendations", { p_limit: 0 })).error).toMatchObject({ message: "invalid_argument" });
    // Wilson lower bound, z = 1.645 (§2.14): 3 correct of 8 → 0.1612
    const wilson = (c, n, z = 1.645) => { const p = c / n; return (p + z * z / (2 * n) - z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / (1 + z * z / n); };
    const [{ w }] = await h.sql("select public._ce_wilson(3, 8) w");
    expect(Number(w)).toBe(Math.round(wilson(3, 8) * 10000) / 10000);
    expect(Number(w)).toBe(0.1612);
  });

  it("get_scope_availability, search_content", async () => {
    const av = contract("get_scope_availability");
    const unit = await call("anon", null, "get_scope_availability", av.cases[0].args);
    expectShape(unit, av.cases[0].response);
    expect(unit.templates.map((t) => t.id)).toEqual(["chapter-quiz", "practice", "random-practice", "timed"]);
    expect(unit.templates.every((t) => t.offered)).toBe(true);
    expect((await rpc("anon", null, "get_scope_availability", av.cases[1].args)).error).toMatchObject({ message: "scope_not_found", details: null });
    const term = await call("anon", null, "get_scope_availability", { p_node: "middle/grade-1/science@t1" });
    expect(term.templates.find((t) => t.id === "term-exam")).toMatchObject({ offered: false, reason: "insufficient_pool", min_pool: 20 });
    const math = await call("anon", null, "get_scope_availability", { p_node: "middle/grade-1/math@t1" });
    for (const t of math.templates) expect(t.offered, t.id).toBe(math.groups >= t.min_pool && t.reason === null);
    const grade = await call("anon", null, "get_scope_availability", { p_node: "middle/grade-1" });
    expect(grade.templates.find((t) => t.id === "practice")).toMatchObject({ offered: false, reason: "scope_too_large" });

    const sc = contract("search_content");
    const u = await newUser();
    const found = await asUser(u).call("search_content", sc.cases[0].args);
    expectShape(found, sc.cases[0].response);
    expect(found.query).toBe("الاسس");
    expect(found.groups.node.items[0]).toMatchObject({ id: "middle/grade-1/math/n54", kind: "lesson" });
    const anonymous = await call("service_role", null, "search_content", sc.cases[1].args);
    expect(Object.keys(anonymous.groups).sort()).toEqual(["exam", "node", "resource"]);
    expect((await asUser(u).rpc("search_content", sc.cases[2].args)).error).toMatchObject({ message: "invalid_argument", details: { field: "q" } });
    const stems = await asUser(u).call("search_content", { p_q: "سؤال", p_kinds: ["question"] });
    expect(stems.groups.question.total).toBeGreaterThan(0);
    expect(JSON.stringify(stems)).not.toContain("سؤال a"); // lesson-level counts, never stems
    expect((await rpc("anon", null, "search_content", sc.cases[0].args)).error).toMatchObject(DENIED);
  });

  it("ce_import_* and ce_refresh_aggregates", async () => {
    const begin = contract("ce_import_begin");
    const manifest = { schema: "manifest@1", sha256: "a".repeat(64), removed: [{ key: "q-m1-math-0000000001", reason: "retired" }] };
    const run = await call("service_role", null, "ce_import_begin", { p_manifest: manifest });
    expectShape(run, begin.cases[0].response);
    expect(run).toMatch(/^[0-9a-f-]{36}$/);
    expect((await asUser(await newUser()).rpc("ce_import_begin", { p_manifest: manifest })).error).toMatchObject(DENIED);
    const batch = contract("ce_import_batch");
    const rows = clone(BANK.questions.filter((q) => q.id.startsWith("q-m1-math-") && q.status === "published").slice(0, 3));
    const first = await call("service_role", null, "ce_import_batch", { p_run: run, p_entity: "questions", p_batch_no: 1, p_rows: rows });
    expectShape(first, batch.cases[0].response);
    expect(first).toMatchObject({ rows: 3, inserted: 0, rejected: 0 });
    const replay = await call("service_role", null, "ce_import_batch", { p_run: run, p_entity: "questions", p_batch_no: 1, p_rows: rows });
    expect(replay).toMatchObject({ rows: 3, inserted: 0, updated: 0, unchanged: 3, rejected: 0 });
    const dup = [{ ...rows[0], id: "q-m1-math-0000000002", _import: { duplicate_of: rows[0].id } }];
    const d = await call("service_role", null, "ce_import_batch", { p_run: run, p_entity: "questions", p_batch_no: 2, p_rows: dup });
    expectShape(d, batch.cases[2].response);
    expect(d.errors).toEqual([{ key: "q-m1-math-0000000002", code: "duplicate_content", detail: { same_as: rows[0].id } }]);
    expect((await rpc("service_role", null, "ce_import_batch", { p_run: run, p_entity: "nope", p_batch_no: 1, p_rows: [] })).error)
      .toMatchObject({ message: "invalid_argument", details: { field: "entity" } });
    expect((await rpc("service_role", null, "ce_import_retire", { p_run: run, p_keys: ["q-m1-math-0000000001"] })).error)
      .toMatchObject({ message: "retire_refused", details: { reason: "import_errors" } });
    const fin = await call("service_role", null, "ce_import_finish", { p_run: run });
    expectShape(fin, contract("ce_import_finish").cases[0].response);
    expect(fin).toMatchObject({ status: "done", aggregates_refreshed: true });
    expect(await call("service_role", null, "ce_refresh_aggregates", {})).toBeNull();
  });
});

// ============================================================================
describe("attacks", () => {
  const start = (u, template, scope, extra = {}) => asUser(u).call("start_template_attempt", { p_template: template, p_scope: scope, ...extra });

  it("another member's attempt is invisible to every RPC", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const s = await start(owner, "lesson-quiz", "middle/grade-1/math/n53");
    for (const [fn, args] of [
      ["get_exam_attempt", { p_attempt: s.attempt_id }],
      ["save_exam_response", { p_attempt: s.attempt_id, p_position: 1, p_response: { option_index: 0 } }],
      ["check_exam_item", { p_attempt: s.attempt_id, p_position: 1 }],
      ["submit_exam_attempt", { p_attempt: s.attempt_id, p_answers: null }],
      ["abandon_exam_attempt", { p_attempt: s.attempt_id }],
    ]) {
      expect((await asUser(intruder).rpc(fn, args)).error, fn).toMatchObject({ message: "attempt_not_found" });
    }
    expect(await asUser(intruder).call("list_exam_attempts_v2", { p_limit: 10 })).toEqual([]);
    const rows = await h.asUser(intruder, (tx) => tx.sql("select attempt_id from public.exam_attempt_items where attempt_id = $1", [s.attempt_id]));
    expect(rows).toEqual([]);
  });

  it("forged responses are refused (shape, indexes, duplicates, permutations, sizes, separators)", async () => {
    const u = await newUser();
    const s = await start(u, "chapter-quiz", "middle/grade-1/math/n91", { p_count: 10 });
    const pos = (type) => s.questions.find((q) => q.type === type)?.position;
    const bad = async (position, response) => (await asUser(u).rpc("save_exam_response", { p_attempt: s.attempt_id, p_position: position, p_response: response })).error;
    const mcq = pos("mcq");
    expect(await bad(mcq, { option_index: -1 })).toMatchObject({ message: "invalid_response", details: { reason: "bad_index" } });
    expect(await bad(mcq, { option_index: 1.5 })).toMatchObject({ message: "invalid_response", details: { reason: "bad_index" } });
    expect(await bad(mcq, { option_id: "o123456" })).toMatchObject({ message: "invalid_response", details: { reason: "bad_shape" } });
    expect(await bad(mcq, [0])).toMatchObject({ message: "invalid_response", details: { reason: "bad_shape" } });
    expect(await bad(mcq, { option_index: 0, x: "a".repeat(9000) })).toMatchObject({ message: "invalid_response", details: { reason: "too_large" } });
    if (pos("matching")) {
      expect(await bad(pos("matching"), { pairs: [[0, 1], [1, 1]] })).toMatchObject({ details: { reason: "duplicate_right" } });
      expect(await bad(pos("matching"), { pairs: [[0, 9]] })).toMatchObject({ details: { reason: "index_out_of_range" } });
    }
    if (pos("ordering")) {
      expect(await bad(pos("ordering"), { order: [0, 0, 1] })).toMatchObject({ details: { reason: expect.stringMatching(/not_a_permutation|index_out_of_range/) } });
    }
    if (pos("numeric")) {
      expect(await bad(pos("numeric"), { value: "abc" })).toMatchObject({ details: { reason: "invalid_number" } });
      expect(await bad(pos("numeric"), { value: "1", unit: 5 })).toMatchObject({ details: { reason: "bad_shape" } });
    }
    expect(await bad(99, { option_index: 0 })).toMatchObject({ message: "invalid_argument", details: { field: "position" } });
  });

  it("no save after the deadline + 30 s; an overdue attempt expires lazily and ignores late answers", async () => {
    const u = await newUser();
    const s = await start(u, "chapter-quiz", "middle/grade-1/math/n91", { p_count: 5 });
    await h.sql("update public.exam_attempts set started_at = now() - interval '2 hours', expires_at = now() - interval '31 seconds' where id = $1", [s.attempt_id]);
    expect((await asUser(u).rpc("save_exam_response", { p_attempt: s.attempt_id, p_position: 1, p_response: null })).error)
      .toMatchObject({ message: "attempt_closed", details: { status: "expired" } });
    const late = await asUser(u).call("submit_exam_attempt", { p_attempt: s.attempt_id, p_answers: [{ position: 1, response: { option_index: 0 } }] });
    expect(late.status).toBe("expired");
    expect(late.answered_count).toBe(0);
    // untimed sessions are abandoned after their 7-day deadline
    const lq = await start(u, "lesson-quiz", "middle/grade-1/math/n55");
    await h.sql("update public.exam_attempts set started_at = now() - interval '8 days', expires_at = now() - interval '1 day' where id = $1", [lq.attempt_id]);
    expect((await asUser(u).call("get_exam_attempt", { p_attempt: lq.attempt_id })).status).toBe("abandoned");
  });

  it("a double submit returns the stored result and awards no XP twice", async () => {
    const u = await newUser();
    const s = await start(u, "chapter-quiz", "middle/grade-1/math/n91", { p_count: 10 });
    const first = await asUser(u).call("submit_exam_attempt", { p_attempt: s.attempt_id, p_answers: s.questions.map((q) => ({ position: q.position, response: q.type === "mcq" ? { option_index: 0 } : null })) });
    const [{ xp }] = await h.sql("select xp from public.profiles where id = $1", [u]);
    const second = await asUser(u).call("submit_exam_attempt", { p_attempt: s.attempt_id, p_answers: s.questions.map((q) => ({ position: q.position, response: q.type === "mcq" ? { option_index: 1 } : null })) });
    expect(second).toEqual(first);
    const [{ xp: after }] = await h.sql("select xp from public.profiles where id = $1", [u]);
    expect(after).toBe(xp);
    expect(first.attempt.xp_awarded).toBeGreaterThanOrEqual(0);
  });

  it("keys, canonical ids and scores never reach the client before they may", async () => {
    const u = await newUser({ premium: true });
    const s = await start(u, "chapter-quiz", "middle/grade-1/math/n91", { p_count: 40 });
    const keys = await h.sql(`select q.key, k.answer from public.exam_attempt_items i join public.questions q on q.id = i.question_id
      join public.question_keys k on k.question_id = q.id where i.attempt_id = $1`, [s.attempt_id]);
    const ids = new Set();
    for (const { answer } of keys) for (const list of ["options", "left", "right", "items"]) for (const o of answer[list] ?? []) ids.add(o.id);
    expect(ids.size).toBeGreaterThan(10);
    const types = new Set(s.questions.map((q) => q.type));
    expect(types.has("matching") || types.has("ordering")).toBe(true);
    const saved = s.questions.find((q) => q.type === "mcq");
    await asUser(u).call("save_exam_response", { p_attempt: s.attempt_id, p_position: saved.position, p_response: { option_index: 0 } });
    const resume = await asUser(u).call("get_exam_attempt", { p_attempt: s.attempt_id });
    for (const payload of [s, resume]) {
      const text = JSON.stringify(payload);
      for (const id of ids) expect(text.includes(`"${id}"`), id).toBe(false);
      expect(text).not.toMatch(/"(answer|correct_response|explanation|accepted|accepted_norm|content_hash|score|is_correct|seed)"/);
    }
    // the owner's own rows: score and is_correct stay null until the item is locked or the attempt finalized
    const rows = await h.asUser(u, (tx) => tx.sql("select score, is_correct from public.exam_attempt_items where attempt_id = $1", [s.attempt_id]));
    expect(rows.every((r) => r.score === null && r.is_correct === null)).toBe(true);
    await expect(h.asUser(u, (tx) => tx.sql("select correct_index from public.question_keys limit 1"))).rejects.toMatchObject(DENIED);
  });

  it("payloads carry opaque per-attempt handles, never the answer-derived question key; the seed is unreadable", async () => {
    const u = await newUser();
    const s = await start(u, "chapter-quiz", "middle/grade-1/math/n91", { p_count: 10 });
    const keys = await realKeys(s.attempt_id);
    const [{ seed }] = await h.sql("select seed from public.exam_attempts where id = $1", [s.attempt_id]);
    for (const q of s.questions) {
      expect(q.key).toMatch(/^h-[0-9a-f]{20}$/);
      expect(q.key).not.toBe(keys.get(q.position));
      // a handle is keyed with this attempt's seed: another seed gives another handle
      const [{ same, other }] = await h.sql("select public._ce_item_handle($1, $2) same, public._ce_item_handle($3, $2) other",
        [seed, keys.get(q.position), "f".repeat(32)]);
      expect(same).toBe(q.key);
      expect(other).not.toBe(q.key);
    }
    const text = JSON.stringify(s);
    for (const k of keys.values()) expect(text.includes(`"${k}"`), k).toBe(false);
    expect(text.includes(seed)).toBe(false);
    // stable within the attempt: start = resume = result
    const resume = await asUser(u).call("get_exam_attempt", { p_attempt: s.attempt_id });
    expect(resume.questions.map((q) => q.key)).toEqual(s.questions.map((q) => q.key));
    const result = await asUser(u).call("submit_exam_attempt", { p_attempt: s.attempt_id, p_answers: null });
    expect(result.items.map((it) => it.key)).toEqual(s.questions.map((q) => q.key));
    // the owner reads the attempt row but not its seed
    await expect(h.asUser(u, (tx) => tx.sql("select seed from public.exam_attempts where id = $1", [s.attempt_id]))).rejects.toMatchObject(DENIED);
    const [row] = await h.asUser(u, (tx) => tx.sql("select id, status, template_id, scope, meta from public.exam_attempts where id = $1", [s.attempt_id]));
    expect(row).toMatchObject({ id: s.attempt_id, template_id: "chapter-quiz", status: "submitted" });
    expect(JSON.stringify(row).includes(seed)).toBe(false);
  });

  it("the owner-readable selected_index never reveals the canonical option order (choice_order)", async () => {
    const u = await newUser({ premium: true });
    const s = await start(u, "chapter-quiz", "middle/grade-1/math/n91", { p_count: 40 });
    const shuffled = await h.sql(`select position, choice_order from public.exam_attempt_items
      where attempt_id = $1 and choice_order is not null order by position`, [s.attempt_id]);
    expect(shuffled.length).toBeGreaterThan(0);
    for (const { position, choice_order: order } of shuffled.slice(0, 3)) {
      for (let d = 0; d < order.length; d++) {
        await asUser(u).call("save_exam_response", { p_attempt: s.attempt_id, p_position: position, p_response: { option_index: d } });
        const [{ sel }] = await h.asUser(u, (tx) => tx.sql("select selected_index sel from public.exam_attempt_items where attempt_id = $1 and position = $2", [s.attempt_id, position]));
        expect(sel).toBe(d); // the display index the client sent, never order[d]
      }
      const [{ response }] = await h.sql("select response from public.exam_attempt_items where attempt_id = $1 and position = $2", [s.attempt_id, position]);
      expect(typeof response.option_id).toBe("string"); // the canonical response is still stored server-side
    }
    // the canonical response grades the item (not selected_index)
    const pos = shuffled[0].position;
    const result = await asUser(u).call("submit_exam_attempt", { p_attempt: s.attempt_id, p_answers: [{ position: pos, selected_index: 0 }] });
    const item = result.items.find((it) => it.position === pos);
    expect(item.response).toEqual({ option_index: 0 });
    expect(item.verdict).toBe(item.correct_response.option_index === 0 ? "correct" : "incorrect");
  });

  it("check → change → submit keeps the checked (locked) answer and score", async () => {
    const u = await newUser();
    const s = await start(u, "lesson-quiz", "middle/grade-1/math/n53");
    const q = s.questions.find((x) => x.type === "mcq" || x.type === "true_false");
    await asUser(u).call("save_exam_response", { p_attempt: s.attempt_id, p_position: q.position, p_response: { option_index: 0 } });
    const checked = await asUser(u).call("check_exam_item", { p_attempt: s.attempt_id, p_position: q.position });
    const other = checked.correct_response.option_index === 0 ? 1 : 0;
    const wanted = checked.verdict === "correct" ? { option_index: other } : checked.correct_response;
    const result = await asUser(u).call("submit_exam_attempt", { p_attempt: s.attempt_id, p_answers: [{ position: q.position, response: wanted }] });
    const item = result.items.find((it) => it.position === q.position);
    expect(item).toMatchObject({ locked: true, response: { option_index: 0 }, verdict: checked.verdict, score: checked.score });
  });

  it("no client-readable column or RPC result carries a school/staging key, a content hash or any other answer-derived value", async () => {
    // what must never leave the database: staging / school keys (older id rules hashed the answer),
    // their hex, content hashes (they include the answer), accepted answers
    const secretRows = await h.sql(`select q.key, q.content_hash, k.accepted_norm from public.questions q
      left join public.question_keys k on k.question_id = q.id where q.exam = 'school' or q.import_origin = 'staging'`);
    expect(secretRows.length).toBeGreaterThan(20);
    const secrets = new Set();
    for (const r of secretRows) {
      secrets.add(`"${r.key}"`);
      const tail = r.key.split("-").pop();
      if (/^[0-9a-f]{10}$/.test(tail)) secrets.add(tail); // a minted id's hash part
      if (r.content_hash) {
        const hex = r.content_hash.split(":").pop();
        secrets.add(hex);
        secrets.add(hex.slice(0, 16));
      }
    }
    const leaks = (label, value) => {
      const text = JSON.stringify(value);
      const found = [...secrets].filter((s) => text.includes(s));
      expect(found, label).toEqual([]);
      expect(text, label).not.toMatch(/sha256|n2:|"accepted(_norm)?"|"answer"|"content_hash"|"exclusion_group"/);
    };
    const readable = async (role, run) => {
      const tables = await h.sql(`select table_name t, array_agg(quote_ident(column_name::text) order by column_name) cols
        from information_schema.column_privileges where table_schema = 'public' and grantee = $1 and privilege_type = 'SELECT'
        group by table_name order by table_name`, [role]);
      expect(tables.length).toBeGreaterThan(10);
      for (const { t, cols } of tables) leaks(`${role} ${t}`, await run(`select ${cols.join(", ")} from public.${t}`));
    };

    // a member's whole session lifecycle first, so their own rows are populated
    const u = await newUser({ premium: true });
    const lesson = "middle/grade-1/math/n54";
    const outputs = [];
    const s = await start(u, "lesson-quiz", lesson, { p_count: 20 });
    outputs.push(["start", s]);
    const q = s.questions.find((x) => x.type === "mcq" || x.type === "true_false");
    outputs.push(["save", await asUser(u).call("save_exam_response", { p_attempt: s.attempt_id, p_position: q.position, p_response: { option_index: 0 }, p_flagged: true })]);
    outputs.push(["check", await asUser(u).call("check_exam_item", { p_attempt: s.attempt_id, p_position: q.position })]);
    outputs.push(["save locked", await asUser(u).call("save_exam_response", { p_attempt: s.attempt_id, p_position: q.position, p_response: null, p_flagged: false })]);
    outputs.push(["get", await asUser(u).call("get_exam_attempt", { p_attempt: s.attempt_id })]);
    const wrong = s.questions.map((x) => ({ position: x.position, response: x.type === "mcq" ? { option_index: 3 } : null }));
    outputs.push(["submit", await asUser(u).call("submit_exam_attempt", { p_attempt: s.attempt_id, p_answers: wrong })]);
    outputs.push(["result", await asUser(u).call("get_exam_attempt", { p_attempt: s.attempt_id })]);
    await h.sql("update public.learner_question_stats set wrong_streak = 3 where user_id = $1", [u]); // repeated mistakes
    const stats = await asUser(u).call("get_learning_stats", { p_node: null });
    expect(stats.repeated_mistakes.length).toBeGreaterThan(0);
    for (const m of stats.repeated_mistakes) expect(m.question_key).toMatch(/^h-[0-9a-f]{20}$/);
    outputs.push(["stats", stats], ["stats node", await asUser(u).call("get_learning_stats", { p_node: lesson })]);
    outputs.push(["recommendations", await asUser(u).call("get_practice_recommendations", { p_limit: 20 })]);
    outputs.push(["history", await asUser(u).call("list_exam_attempts_v2", { p_limit: 50 })]);
    outputs.push(["search", await asUser(u).call("search_content", { p_q: "سؤال", p_kinds: null })]);
    const stem = s.questions[0].stem.slice(0, 12);
    outputs.push(["search_all member", await asUser(u).call("search_all", { p_q: stem, p_limit: 20, p_types: ["questions"], p_offset: 0 })]);
    for (const [label, value] of outputs) leaks(label, value);
    await readable("authenticated", (sql) => h.asUser(u, (tx) => tx.sql(sql)));

    // bank_revision (owner-readable) is not a hash of the pool's keys
    const [{ bank }] = await h.asUser(u, (tx) => tx.sql("select bank_revision bank from public.exam_attempts where id = $1", [s.attempt_id]));
    const [{ keyed }] = await h.sql(`select left(encode(sha256(convert_to(string_agg(m.question_key || ':' || m.revision, ',' order by m.question_key collate "C"), 'UTF8')), 'hex'), 32) keyed
      from public.scope_pool_members m where m.lesson_node_id = $1`, [lesson]);
    expect(bank).toMatch(/^[0-9a-f]{32}$/);
    expect(bank).not.toBe(keyed);

    // guests: every anon-readable column and every anon RPC
    await readable("anon", (sql) => h.asAnon((tx) => tx.sql(sql)));
    const anonCalls = [
      ["search_all", { p_q: stem, p_limit: 20, p_types: ["questions"], p_offset: 0 }],
      ["search_all", { p_q: "سؤال", p_limit: 20, p_types: null, p_offset: 0 }],
      ["get_question_bank_stats", {}],
      ...[lesson, "middle/grade-1/math/n91", "middle/grade-1/math", "middle/grade-1/math@t1", "prep:aptitude/verbal"]
        .map((node) => ["get_scope_availability", { p_node: node }]),
    ];
    for (const [fn, args] of anonCalls) {
      const res = await rpc("anon", null, fn, args);
      leaks(`anon ${fn} ${JSON.stringify(args)}`, res.data ?? res.error);
    }
    // search_all orders its question group by key: staging rows (answer-derived keys under older
    // id rules) and school rows never enter it, for guests or members
    const staged = await h.sql(`select id, stem from public.questions
      where is_active and not is_premium and (import_origin = 'staging' or exam = 'school') and char_length(stem) >= 8 order by (exam = 'school'), key limit 6`);
    expect(staged.some((x) => x.id)).toBe(true);
    for (const { id, stem: st } of staged) {
      for (const who of [(a) => call("anon", null, "search_all", a), (a) => asUser(u).call("search_all", a)]) {
        const r = await who({ p_q: st.slice(0, 10), p_limit: 20, p_types: ["questions"], p_offset: 0 });
        expect(r.questions.map((x) => x.id)).not.toContain(id);
      }
    }
  });

  it("a locked item: flag-only saves are kept; its response, score and lock never change", async () => {
    const u = await newUser();
    const s = await start(u, "lesson-quiz", "middle/grade-1/math/n53");
    const q = s.questions.find((x) => x.type === "mcq" || x.type === "true_false");
    const save = (response, extra = {}) => asUser(u).rpc("save_exam_response", { p_attempt: s.attempt_id, p_position: q.position, p_response: response, ...extra });
    await asUser(u).call("save_exam_response", { p_attempt: s.attempt_id, p_position: q.position, p_response: { option_index: 0 } });
    const checked = await asUser(u).call("check_exam_item", { p_attempt: s.attempt_id, p_position: q.position });
    const row = () => h.sql(`select response, selected_index, score, is_correct, locked_at, answered_at, flagged, time_spent_seconds
      from public.exam_attempt_items where attempt_id = $1 and position = $2`, [s.attempt_id, q.position]).then((r) => r[0]);
    const locked = await row();
    const same = (a) => ({ ...a, flagged: undefined });

    // flag with no response (SQL null / JSON null), and with exactly the locked response (what the runner sends)
    expect((await save(null, { p_flagged: true })).data).toMatchObject({ position: q.position, flagged: true, response: { option_index: 0 } });
    expect(await row()).toMatchObject({ flagged: true });
    expect((await save(null, { p_flagged: false })).data.flagged).toBe(false);
    expect((await h.asUser(u, (tx) => tx.sql("select public.save_exam_response($1, $2::smallint, 'null'::jsonb, 0, true) r", [s.attempt_id, q.position])))[0].r)
      .toMatchObject({ flagged: true });
    expect((await save({ option_index: 0 }, { p_flagged: false, p_time_spent: 3000 })).data).toMatchObject({ flagged: false, response: { option_index: 0 } });
    expect(same(await row())).toEqual(same(locked)); // response, score, lock and time untouched

    // any other response is refused, and nothing is written (not even the flag)
    const other = q.type === "true_false" ? 1 : (checked.correct_response?.option_index === 1 ? 2 : 1);
    for (const body of [{ option_index: other }, { option_index: null }, { option_index: 99 }, { option_id: "o123456" }, [0]]) {
      expect((await save(body, { p_flagged: true })).error, JSON.stringify(body)).toMatchObject({ message: "item_locked", details: { position: q.position } });
    }
    expect(await row()).toEqual({ ...locked, flagged: false });
    expect((await asUser(u).rpc("check_exam_item", { p_attempt: s.attempt_id, p_position: q.position })).error).toMatchObject({ message: "item_locked" });

    // the flag survives to the result; the score is the lock-time one
    await save(null, { p_flagged: true });
    const result = await asUser(u).call("submit_exam_attempt", { p_attempt: s.attempt_id, p_answers: [{ position: q.position, response: { option_index: other } }] });
    expect(result.items.find((it) => it.position === q.position)).toMatchObject({ locked: true, response: { option_index: 0 }, verdict: checked.verdict, score: checked.score });
    expect(await row()).toMatchObject({ flagged: true, response: locked.response, locked_at: locked.locked_at });
    expect((await save(null, { p_flagged: false })).error).toMatchObject({ message: "attempt_closed" });
  });

  it("a retake must be one's own attempt; premium items never reach a free member", async () => {
    const free = await newUser();
    const premium = await newUser({ premium: true });
    const mine = await start(premium, "lesson-quiz", "middle/grade-1/math/n54", { p_count: 20 });
    const keysOf = async (s) => [...(await realKeys(s.attempt_id)).values()];
    expect((await asUser(free).rpc("start_template_attempt", { p_template: "lesson-quiz", p_scope: "middle/grade-1/math/n54", p_retake_of: mine.attempt_id })).error)
      .toMatchObject({ message: "not_found" });
    const premiumKeys = new Set((await h.sql("select key from public.questions where is_premium and lesson_node_id = 'middle/grade-1/math/n54'")).map((r) => r.key));
    expect(premiumKeys.size).toBeGreaterThan(0);
    expect((await keysOf(mine)).some((k) => premiumKeys.has(k))).toBe(true); // premium members get them
    for (let i = 0; i < 4; i++) {
      const s = await start(free, "lesson-quiz", "middle/grade-1/math/n54", { p_count: 20 });
      expect((await keysOf(s)).some((k) => premiumKeys.has(k))).toBe(false);
    }
  });
});

// ============================================================================
describe("revision guard, retakes, quotas and statistics", () => {
  const start = (u, template, scope, extra = {}) => asUser(u).call("start_template_attempt", { p_template: template, p_scope: scope, ...extra });

  it("importing revision 2 mid-attempt voids that item at submit; the result shows revision 1", async () => {
    const u = await newUser({ premium: true });
    // every item of the unit (premium: up to 40), so an original (non-copied) mcq is always served
    const s = await start(u, "chapter-quiz", "middle/grade-1/math/n91", { p_count: 40 });
    const target = s.questions.find((q) => q.type === "mcq" && !/\(\d\)$/.test(q.stem));
    expect(target).toBeTruthy();
    const oldStem = target.stem;
    const targetKey = (await realKeys(s.attempt_id)).get(target.position);
    await asUser(u).call("save_exam_response", { p_attempt: s.attempt_id, p_position: target.position, p_response: { option_index: 0 } });
    await importBank((r) => {
      const a = augmented(r);
      a.questions.find((q) => q.id === targetKey).stem = `${oldStem} — revised`;
      return a;
    });
    const [{ revision }] = await h.sql("select revision from public.questions where key = $1", [targetKey]);
    expect(revision).toBe(2);
    const result = await asUser(u).call("submit_exam_attempt", { p_attempt: s.attempt_id, p_answers: null });
    const item = result.items.find((it) => it.position === target.position);
    expect(item).toMatchObject({ voided: "question_updated", verdict: null, score: null, stem: oldStem, correct_response: null, explanation: null });
    expect(result.voided_count).toBe(1);
    expect(result.attempt.question_count).toBe(s.question_count);
    const [{ total }] = await h.sql("select total from public.exam_attempts where id = $1", [s.attempt_id]);
    expect(total).toBe(s.question_count - 1);
    const history = await asUser(u).call("get_exam_attempt", { p_attempt: s.attempt_id });
    expect(history.items.find((it) => it.position === target.position).stem).toBe(oldStem);
    // restore revision-1 content for the tests below (becomes revision 3)
    await importBank(augmented);
  });

  it("a retake reuses the stored allocation and avoids the questions just seen", async () => {
    const u = await newUser({ premium: true });
    const first = await start(u, "chapter-quiz", "middle/grade-1/math/n91", { p_count: 10 });
    await asUser(u).call("submit_exam_attempt", { p_attempt: first.attempt_id, p_answers: null });
    const retake = await start(u, "chapter-quiz", "middle/grade-1/math/n91", { p_retake_of: first.attempt_id });
    expect(retake).toMatchObject({ retake_of: first.attempt_id, question_count: 10 });
    const [a, b] = await h.sql("select id, meta -> 'allocation' alloc, seed from public.exam_attempts where id = any($1) order by started_at", [[first.attempt_id, retake.attempt_id]]);
    expect(b.alloc).toEqual(a.alloc);
    expect(b.seed).not.toBe(a.seed);
    const seen = new Set((await realKeys(first.attempt_id)).values());
    expect([...(await realKeys(retake.attempt_id)).values()].filter((k) => seen.has(k)).length).toBeLessThanOrEqual(3); // reuse only within max_reuse_share (30 %)
    expect((await asUser(u).rpc("start_template_attempt", { p_template: "lesson-quiz", p_scope: "middle/grade-1/math/n53", p_retake_of: first.attempt_id })).error)
      .toMatchObject({ message: "invalid_argument", details: { field: "retake_of" } });
  });

  it("quotas: practice sessions do not use the free exam limit; exam sessions do (legacy included)", async () => {
    const u = await newUser();
    for (let i = 0; i < 6; i++) {
      const s = await start(u, "lesson-quiz", "middle/grade-1/math/n55");
      expect(s.quota).toBe("practice");
    }
    const legacy = await asUser(u).call("start_exam_attempt", { p_exam: "aptitude", p_section: "verbal", p_count: 5 });
    expect(legacy.mode).toBe("db");
    for (let i = 0; i < 4; i++) await start(u, "chapter-quiz", "middle/grade-1/math/n91", { p_count: 5 });
    const blocked = await asUser(u).rpc("start_template_attempt", { p_template: "chapter-quiz", p_scope: "middle/grade-1/math/n91", p_count: 5 });
    expect(blocked.error).toMatchObject({ message: "daily_limit_reached", details: { limit: 5, used: 5, quota: "exam" } });
    expect((await asUser(u).rpc("start_exam_attempt", { p_exam: "aptitude", p_count: 5 })).error).toMatchObject({ message: "daily_limit_reached" });
    // practice still works
    expect((await start(u, "practice", "middle/grade-1/math/n53")).quota).toBe("practice");
  });

  it("finalize updates question, node (lesson → unit → subject) and item statistics", async () => {
    const u = await newUser();
    const s = await start(u, "chapter-quiz", "middle/grade-1/math/n91", { p_count: 5 });
    const answers = s.questions.map((q) => ({ position: q.position, response: q.type === "mcq" || q.type === "true_false" ? { option_index: 0 } : null, time_spent_seconds: 20 }));
    const res = await asUser(u).call("submit_exam_attempt", { p_attempt: s.attempt_id, p_answers: answers });
    const answered = res.items.filter((it) => it.verdict !== "unanswered");
    const qs = await h.asUser(u, (tx) => tx.sql("select count(*)::int n, sum(seen_count)::int seen from public.learner_question_stats"));
    expect(qs[0]).toEqual({ n: 5, seen: 5 });
    const nodes = await h.asUser(u, (tx) => tx.sql("select node_id, answered, correct from public.learner_node_stats order by node_id"));
    const byId = Object.fromEntries(nodes.map((r) => [r.node_id, r]));
    expect(byId["middle/grade-1/math"]).toMatchObject({ answered: answered.length, correct: answered.filter((it) => it.verdict === "correct").length });
    expect(byId["middle/grade-1/math/n91"]).toMatchObject({ answered: answered.length });
    for (const it of answered) expect(byId[it.lesson.id], it.lesson.id).toBeTruthy();
    const other = await newUser();
    expect(await h.asUser(other, (tx) => tx.sql("select * from public.learner_node_stats"))).toEqual([]);
    const [{ n }] = await h.sql("select count(*)::int n from public.question_item_stats where answered > 0");
    expect(n).toBeGreaterThan(0);
  });

  it("legacy attempts keep today's payloads (template_id null) and feed the prep statistics", async () => {
    const u = await newUser();
    const s = await asUser(u).call("start_exam_attempt", { p_exam: "aptitude", p_section: "verbal", p_count: 5 });
    expect(Object.keys(s).sort()).toEqual(["attempt_id", "difficulty", "exam", "expires_at", "mode", "question_count", "questions", "requested_count",
      "section", "server_now", "started_at", "status", "time_limit_seconds", "topic"]);
    await asUser(u).call("save_exam_answer", { p_attempt: s.attempt_id, p_position: 1, p_selected: 0 });
    const r = await asUser(u).call("submit_exam_attempt", { p_attempt: s.attempt_id, p_answers: null });
    expect(Object.keys(r).sort()).toEqual(["attempt", "by_topic", "items", "mode", "status"]);
    expect(r.items[0]).toHaveProperty("correct_index");
    const nodes = await h.asUser(u, (tx) => tx.sql("select node_id from public.learner_node_stats order by 1"));
    expect(nodes.map((x) => x.node_id)).toEqual(expect.arrayContaining(["prep:aptitude/verbal"]));
  });
});

// ============================================================================
describe("weakness review (weak: scopes)", () => {
  it("resolves the learner's weakest lessons (answered ≥ 5) and prefers previously wrong items", async () => {
    const u = await newUser({ premium: true });
    expect((await asUser(u).rpc("start_template_attempt", { p_template: "weakness-review", p_scope: "weak:" })).error)
      .toMatchObject({ message: "insufficient_pool" }); // no history yet
    const s = await asUser(u).call("start_template_attempt", { p_template: "chapter-quiz", p_scope: "middle/grade-1/math/n91", p_count: 40 });
    const answers = s.questions.map((q) => ({ position: q.position, response: q.type === "mcq" ? { option_index: 3 } : q.type === "true_false" ? { option_index: 1 } : null }));
    await asUser(u).call("submit_exam_attempt", { p_attempt: s.attempt_id, p_answers: answers });
    const weakLessons = (await h.asUser(u, (tx) => tx.sql(
      "select s.node_id from public.learner_node_stats s join public.curriculum_nodes n on n.id = s.node_id and n.kind = 'lesson' where s.answered >= 5")))
      .map((r) => r.node_id);
    expect(weakLessons.length).toBeGreaterThan(0);
    // the wrong items were seen just now (< 24 h), so they are avoided rather than preferred
    const w = await asUser(u).call("start_template_attempt", { p_template: "weakness-review", p_scope: "weak:" });
    expect(w).toMatchObject({ quota: "practice", feedback_mode: "immediate", timing_mode: "untimed" });
    expect(w.questions.every((q) => weakLessons.includes(q.lesson.id))).toBe(true);
    const scoped = await asUser(u).call("start_template_attempt", { p_template: "weakness-review", p_scope: `weak:${weakLessons[0]}` });
    expect(scoped.questions.every((q) => q.lesson.id === weakLessons[0])).toBe(true);
    expect((await asUser(u).rpc("start_template_attempt", { p_template: "weakness-review", p_scope: "weak:middle/grade-1/math/n999" })).error)
      .toMatchObject({ message: "scope_not_found" });
  });
});
