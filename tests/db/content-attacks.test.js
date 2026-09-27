// ============================================================================
// Content engine — adversarial DB tests (docs/CONTENT_ENGINE.md §5.4, §5.8):
//   - ce_guest_check_lock: the guest check lock (first / repeat / locked), service role only;
//   - nothing a member is shown before submitting depends on the answer: the
//     ordering display never avoids the answer order (the old swap rule made the
//     answer the one arrangement never shown, readable across attempts).
// ============================================================================
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { REPO_ROOT, createDb } from "./harness.js";
import { createPgliteExecutor } from "../../scripts/content/lib/import-executors.mjs";
import { importStaging } from "../../scripts/content/import-staging.mjs";
import { writeStagingTree } from "../../scripts/content/lib/import-plan.mjs";
import { TEMPLATES } from "../../src/lib/exams/engine/exam-templates.js";

const BANK = JSON.parse(readFileSync(path.join(REPO_ROOT, "tests/fixtures/engine/bank-source.json"), "utf8"));
const clone = (v) => JSON.parse(JSON.stringify(v));
const tmp = (p) => mkdtempSync(path.join(tmpdir(), `jz-${p}-`));
const DENIED = { code: "42501" };
const SID = "g-AAAAAAAAAAAAAAAAAAAAAA";
const H1 = "1".repeat(64);
const H2 = "2".repeat(64);
const seedOf = (i) => i.toString(16).padStart(32, "0");

let h;

beforeAll(async () => {
  h = await createDb();
  const pg = await createPgliteExecutor({ harness: h });
  const dir = tmp("tree");
  writeStagingTree(dir, {
    registry: clone(BANK.registry), nodes: clone(BANK.nodes), objectives: clone(BANK.objectives), resources: clone(BANK.resources),
    stimuli: clone(BANK.stimuli), questions: clone(BANK.questions), templates: clone(TEMPLATES),
  });
  const r = await importStaging({ target: "pglite", executor: pg, stagingDir: dir, cacheDir: tmp("cache"), validate: false, noRetire: true, sleep: async () => {} });
  expect(r.errors).toEqual([]);
}, 300000);

afterAll(async () => {
  await h?.close();
});

const lock = (tx, sid, pos, hash, exp = "now() + interval '1 hour'") =>
  tx.sql(`select public.ce_guest_check_lock($1, $2, $3, ${exp}) r`, [sid, pos, hash]).then((rows) => rows[0].r);

// ============================================================================
describe("ce_guest_check_lock (guest immediate checks, §5.8)", () => {
  it("first / repeat / locked per (session, position); invalid arguments are refused", async () => {
    await h.asService(async (tx) => {
      expect(await lock(tx, SID, 1, H1)).toBe("first");
      expect(await lock(tx, SID, 1, H1)).toBe("repeat");   // a retry of the same response
      expect(await lock(tx, SID, 1, H2)).toBe("locked");   // check wrong, read the key, check right: refused
      expect(await lock(tx, SID, 2, H2)).toBe("first");
      expect(await lock(tx, "g-BBBBBBBBBBBBBBBBBBBBBB", 1, H2)).toBe("first");
    });
    for (const [sid, pos, hash] of [["x", 1, H1], [SID, 0, H1], [SID, 101, H1], [SID, 1, "abc"], [null, 1, H1]]) {
      await expect(h.asService((tx) => lock(tx, sid, pos, hash))).rejects.toThrow(/invalid_argument/);
    }
    // the lock is kept at most 8 days, whatever the caller asks
    await h.asService((tx) => lock(tx, SID, 3, H1, "now() + interval '400 days'"));
    const [{ ok }] = await h.sql("select expires_at <= now() + interval '8 days 1 minute' ok from public.ce_guest_check_locks where sid = $1 and position = 3", [SID]);
    expect(ok).toBe(true);
  });

  it("clients can neither call it nor read or write the lock rows", async () => {
    for (const role of ["anon", "authenticated"]) {
      const [{ ok }] = await h.sql("select has_function_privilege($1, 'public.ce_guest_check_lock(text, int, text, timestamptz)', 'execute') ok", [role]);
      expect(ok, role).toBe(false);
    }
    const [{ s }] = await h.sql("select has_function_privilege('service_role', 'public.ce_guest_check_lock(text, int, text, timestamptz)', 'execute') s");
    expect(s).toBe(true);
    const u = await h.createUser();
    await expect(h.asAnon((tx) => lock(tx, SID, 9, H1))).rejects.toMatchObject(DENIED);
    await expect(h.asUser(u, (tx) => lock(tx, SID, 9, H1))).rejects.toMatchObject(DENIED);
    await expect(h.asAnon((tx) => tx.sql("select * from public.ce_guest_check_locks"))).rejects.toMatchObject(DENIED);
    await expect(h.asUser(u, (tx) => tx.sql("select * from public.ce_guest_check_locks"))).rejects.toMatchObject(DENIED);
    await expect(h.asUser(u, (tx) => tx.sql("delete from public.ce_guest_check_locks"))).rejects.toMatchObject(DENIED);
    const [{ rls }] = await h.sql("select relrowsecurity rls from pg_class where oid = 'public.ce_guest_check_locks'::regclass");
    expect(rls).toBe(true);
  });
});

// ============================================================================
describe("ordering displays never depend on the answer (§5.4)", () => {
  const ITEM = { key: "q-x-ordering-0000000001", public: { items: [{ id: "s1", text: "a" }, { id: "s2", text: "b" }, { id: "s3", text: "c" }, { id: "s4", text: "d" }] } };
  const maps = async (seed, answer) => (await h.sql(
    "select public._ce_display_maps($1, $2, 'ordering', $3::jsonb, true, null, null, true, $4::jsonb) r",
    [seed, ITEM.key, JSON.stringify(ITEM.public), answer ? JSON.stringify(answer) : null]))[0].r;

  it("_ce_display_maps ignores the answer order, even when the shuffle lands on it", async () => {
    let hit = 0;
    for (let i = 0; i < 400 && hit < 2; i++) {
      const plain = await maps(seedOf(i), null);
      const order = plain.display_map.items;
      expect(await maps(seedOf(i), [...order].reverse())).toEqual(plain);
      if (order.join() === "s1,s2,s3,s4") {
        hit += 1;
        expect(await maps(seedOf(i), ["s1", "s2", "s3", "s4"])).toEqual(plain); // the old rule swapped s1 and s2 here
      }
    }
    expect(hit).toBeGreaterThan(0);
  });

  it("start_template_attempt stores the same display for an ordering item whatever its answer", async () => {
    const u = await h.createUser();
    await h.sql("update public.profiles set is_elite = true where id = $1", [u]);
    const [{ key, answer }] = await h.sql(`select q.key, k.answer #> '{answer,order}' answer from public.questions q
      join public.question_keys k on k.question_id = q.id where q.question_type = 'ordering' and q.lesson_node_id = 'middle/grade-1/math/n53'`);
    let matched = 0;
    for (let n = 0; n < 300 && matched === 0; n++) {
      const [{ r }] = await h.asUser(u, (tx) => tx.sql("select public.start_template_attempt('lesson-quiz', 'middle/grade-1/math/n53') r"));
      const rows = await h.sql(`select i.display_map, public._ce_display_maps(a.seed, q.key, q.question_type, q.payload_public, q.shuffle_options,
          q.fixed_order_reason, null, true, null, q.option_flags) plain
        from public.exam_attempt_items i join public.exam_attempts a on a.id = i.attempt_id join public.questions q on q.id = i.question_id
        where i.attempt_id = $1 and q.key = $2`, [r.attempt_id, key]);
      await h.asUser(u, (tx) => tx.sql("select public.abandon_exam_attempt($1::uuid)", [r.attempt_id]));
      if (!rows.length) continue;
      expect(rows[0].display_map).toEqual(rows[0].plain.display_map);
      if (JSON.stringify(rows[0].display_map.items) === JSON.stringify(answer)) matched += 1; // shown in the answer order
    }
    expect(matched).toBe(1);
  }, 240000);
});
