// Learning-platform database tests (supabase/migrations/0010_learning_platform.sql):
// exam engine, question bank + seed builder, contact inbox, notification
// preferences + feed RPCs, global search, AI quota.
// Every feature: positive path, other user, anon, invalid input, empty state.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDb, MIGRATIONS_DIR, REPO_ROOT } from "./harness.js";
import { EXAMS, SECTIONS, LIMITS } from "@/lib/exams/catalog";
import * as catalog from "@/lib/exams/catalog";
import {
  validateQuestionFile, validateQuestionFiles, buildSeedSql, dollarQuote, main as seedMain,
} from "../../scripts/build-question-seed.mjs";
import * as examsApi from "@/lib/data/exams";
import * as notificationsApi from "@/lib/data/notifications";
import * as searchApi from "@/lib/data/search";
import { getAiQuota } from "@/lib/data/ai";
import { POST as localStartRoute } from "@/app/api/exams/local/start/route";
import { POST as localGradeRoute } from "@/app/api/exams/local/grade/route";

// The client data layer gets its Supabase client from getSupabase(); the
// contract tests at the end swap in a PostgREST-like fake bound to PGlite.
vi.mock("@/lib/supabase-lazy", () => ({ getSupabase: async () => globalThis.__jzFakeSupabase ?? null }));
// /api/chat: a fake server client, and a model SDK that fails loudly if it is
// ever reached (so no test can contact a real provider).
vi.mock("@/lib/supabase-server", () => ({
  createClient: async () => globalThis.__jzFakeServer ?? null,
  getRouteUser: async () => ({ supabase: null, user: null }),
}));
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    constructor() {
      throw new Error("model_contacted");
    }
  },
}));
import { POST as chatRoute } from "@/app/api/chat/route";

const MIGRATION = "0010_learning_platform.sql";
const FIXTURE = path.join(REPO_ROOT, "tests", "fixtures", "questions-sample.json");

let h;
// The generated bank seed (if present) is skipped so every count below is exact.
// JZ_DB_SKIP=a.sql,b.sql additionally skips migrations (e.g. to prove 0010
// does not depend on 0009: JZ_DB_SKIP=0009_security_hardening.sql,0012_privacy_topics_analytics_search.sql
// — 0012 itself builds on 0009's has_block_with() / is_own_storage_url()).
const EXTRA_SKIP = (process.env.JZ_DB_SKIP || "").split(",").map((s) => s.trim()).filter(Boolean);
beforeAll(async () => { h = await createDb({ skip: ["0011_seed_questions.sql", ...EXTRA_SKIP] }); });
afterAll(async () => { await h?.close(); });

// ── helpers ──────────────────────────────────────────────────────────────────
const DENIED = { code: "42501" };
const UNIQUE = { code: "23505" };
const CHECK = { code: "23514" };
const FK = { code: "23503" };
const raised = (msg) => new RegExp(`^${msg}$`);
const detailOf = (e) => JSON.parse(e.detail);

const newUser = (meta = {}) => h.createUser({ meta: { full_name: "Test User", ...meta } });
const asU = (uid, q, p) => h.asUser(uid, (tx) => tx.sql(q, p));
const asA = (q, p) => h.asAnon((tx) => tx.sql(q, p));
const n = (uid, q, p) => h.asUser(uid, (tx) => tx.query(q, p)).then((r) => r.affectedRows);
const one = (rows) => rows[0].r;
const quiet = { log() {}, warn() {}, error() {} };

async function makePremium(uid) {
  await h.sql("update public.profiles set is_elite = true where id = $1", [uid]);
}

/** Insert n synthetic questions (+ keys: correct_index = number % 4). */
async function addQuestions({ prefix, exam, section, count, premium = false, time = 30, active = true }) {
  await h.sql(
    `insert into public.questions (key, exam, section, topic, difficulty, stem, choices, time_limit_seconds,
                                   source_id, is_premium, is_active)
     select $1 || '-' || lpad(g::text, 3, '0'), $2, $3,
            (public.exam_section_topics($3))[1 + (g % cardinality(public.exam_section_topics($3)))],
            (1 + g % 3)::smallint,
            'سؤال تجريبي ' || $1 || ' رقم ' || g,
            '["أ","ب","ج","د"]'::jsonb, $4::int,
            (select id from public.question_sources where slug = 'jazira-original'), $5::boolean, $7::boolean
       from generate_series(1, $6::int) g`,
    [prefix, exam, section, time, premium, count, active]);
  await h.sql(
    `insert into public.question_keys (question_id, correct_index, explanation)
     select id, (substring(key from '[0-9]+$')::int % 4)::smallint, 'شرح ' || key
       from public.questions where key like $1 || '-%'
     on conflict do nothing`, [prefix]);
}

async function correctIndexes(ids) {
  const rows = await h.sql("select question_id::text id, correct_index c from public.question_keys where question_id = any($1::uuid[])", [ids]);
  return Object.fromEntries(rows.map((r) => [r.id, r.c]));
}

const start = (uid, { exam = "achievement", section = "physics", difficulty = null, count = 10, time = null } = {}) =>
  h.asUser(uid, (tx) => tx.sql(
    `select public.start_exam_attempt(p_exam => $1, p_section => $2, p_difficulty => $3::smallint,
                                      p_count => $4::int, p_time_limit_seconds => $5::int) as r`,
    [exam, section, difficulty, count, time])).then(one);
const save = (uid, attempt, position, selected, time = 0, flagged = null) =>
  h.asUser(uid, (tx) => tx.sql("select public.save_exam_answer($1::uuid, $2::smallint, $3::smallint, $4::int, $5::boolean) as r",
    [attempt, position, selected, time, flagged])).then(one);
const submit = (uid, attempt, answers = null) =>
  h.asUser(uid, (tx) => tx.sql("select public.submit_exam_attempt($1::uuid, $2::jsonb) as r",
    [attempt, answers === null ? null : JSON.stringify(answers)])).then(one);
const getAttempt = (uid, attempt) =>
  h.asUser(uid, (tx) => tx.sql("select public.get_exam_attempt($1::uuid) as r", [attempt])).then(one);
const listAttempts = (uid, limit = 20, before = null, beforeId = null) =>
  asU(uid, "select * from public.list_exam_attempts($1::int, $2::timestamptz, $3::uuid)", [limit, before, beforeId]);
const stats = (uid) => asU(uid, "select public.get_exam_stats() as r").then(one);
const xpOf = async (uid) => (await h.sql("select xp from public.profiles where id = $1", [uid]))[0].xp;

// Banks used below (fixed sizes → exact assertions):
//   achievement/physics    40 free (tph) + 10 premium (tpp)
//   achievement/chemistry   3 free (tch)
//   achievement/math        6 premium only (tmp)
//   achievement/biology     none
//   aptitude/quantitative  the 12-item fixture, loaded through the seed builder
beforeAll(async () => {
  await addQuestions({ prefix: "tph", exam: "achievement", section: "physics", count: 40 });
  await addQuestions({ prefix: "tpp", exam: "achievement", section: "physics", count: 10, premium: true });
  await addQuestions({ prefix: "tch", exam: "achievement", section: "chemistry", count: 3 });
  await addQuestions({ prefix: "tmp", exam: "achievement", section: "math", count: 6, premium: true });
});

// ============================================================================
describe("schema, catalog mirror and privileges", () => {
  it("0010 is applied after 0000–0008", () => {
    expect(h.migrations).toContain(MIGRATION);
    expect(h.migrations.indexOf(MIGRATION)).toBeGreaterThan(h.migrations.indexOf("0008_social_layer.sql"));
  });

  it("the database accepts exactly the catalog's exam/section/topic vocabulary", async () => {
    for (const [section, def] of Object.entries(SECTIONS)) {
      const [r] = await h.sql("select public.exam_of_section($1) e, public.exam_section_topics($1) t", [section]);
      expect(r.e).toBe(def.exam);
      expect(r.t).toEqual(def.topics);
      expect(EXAMS[def.exam].sections).toContain(section);
    }
    const [x] = await h.sql("select public.exam_of_section('history') e, public.exam_section_topics('history') t");
    expect(x).toEqual({ e: null, t: null });
  });

  it("check constraints reject unknown topics, cross-exam sections, bad difficulty and malformed choices", async () => {
    const ins = (over) => {
      const q = { key: `bad-${Math.random().toString(36).slice(2, 8)}`, exam: "aptitude", section: "verbal", topic: "analogy",
        difficulty: 1, choices: '["a","b"]', ...over };
      return h.sql("insert into public.questions (key, exam, section, topic, difficulty, stem, choices) values ($1,$2,$3,$4,$5::smallint,'stem',$6::jsonb)",
        [q.key, q.exam, q.section, q.topic, q.difficulty, q.choices]);
    };
    await expect(ins({})).resolves.toBeDefined();
    await expect(ins({ topic: "algebra" })).rejects.toMatchObject(CHECK);         // algebra is not a verbal topic
    await expect(ins({ section: "physics" })).rejects.toMatchObject(CHECK);       // physics belongs to achievement
    await expect(ins({ exam: "tahsili" })).rejects.toMatchObject(CHECK);
    await expect(ins({ difficulty: 4 })).rejects.toMatchObject(CHECK);
    await expect(ins({ choices: '["only one"]' })).rejects.toMatchObject(CHECK);
    await expect(ins({ choices: '["1","2","3","4","5","6","7"]' })).rejects.toMatchObject(CHECK);
    await expect(ins({ choices: '{"a":1}' })).rejects.toMatchObject(CHECK);
    await expect(ins({ choices: '["a", 2]' })).rejects.toMatchObject(CHECK);
    await expect(ins({ choices: '["a", ""]' })).rejects.toMatchObject(CHECK);
    await expect(ins({ key: "Has Spaces" })).rejects.toMatchObject(CHECK);
    await expect(ins({ key: "tph-001" })).rejects.toMatchObject(UNIQUE);
  });

  it("answer keys must point at an existing choice", async () => {
    const [q] = await h.sql("insert into public.questions (key, exam, section, topic, difficulty, stem, choices) values ('range-1','aptitude','verbal','analogy',1,'s','[\"a\",\"b\",\"c\"]') returning id");
    await expect(h.sql("insert into public.question_keys values ($1, 3, 'x')", [q.id])).rejects.toMatchObject(CHECK);
    await h.sql("insert into public.question_keys values ($1, 2, 'x')", [q.id]);
    await expect(h.sql("update public.questions set choices = '[\"a\",\"b\"]' where id = $1", [q.id])).rejects.toMatchObject(CHECK);
    await h.sql("delete from public.questions where id = $1", [q.id]);   // key cascades
    const [k] = await h.sql("select count(*)::int c from public.question_keys where question_id = $1", [q.id]);
    expect(k.c).toBe(0);
  });

  it("the original-content source is seeded once", async () => {
    const rows = await asA("select slug, kind, license from public.question_sources");
    expect(rows).toEqual([{ slug: "jazira-original", kind: "original", license: "All rights reserved — original practice items authored for Jazira" }]);
  });

  it("RLS is enabled on every new table", async () => {
    const rows = await h.sql(`select relname, relrowsecurity from pg_class
      where relnamespace = 'public'::regnamespace and relname = any($1)`, [[
      "question_sources", "questions", "question_keys", "question_bank_counts", "exam_attempts", "exam_attempt_items",
      "contact_messages", "notification_preferences", "ai_usage"]]);
    expect(rows).toHaveLength(9);
    for (const r of rows) expect(r.relrowsecurity, r.relname).toBe(true);
  });

  it("question_keys: no privilege at all for anon/authenticated; unreadable by every client role", async () => {
    const grants = await h.sql(`select grantee, privilege_type from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'question_keys' and grantee in ('anon','authenticated','PUBLIC')`);
    expect(grants).toEqual([]);
    const u = await newUser();
    await expect(asA("select * from public.question_keys limit 1")).rejects.toMatchObject(DENIED);
    await expect(asU(u, "select * from public.question_keys limit 1")).rejects.toMatchObject(DENIED);
    await makePremium(u);
    await expect(asU(u, "select correct_index from public.question_keys limit 1")).rejects.toMatchObject(DENIED);
    await expect(asU(u, "insert into public.question_keys values (gen_random_uuid(), 0, 'x')")).rejects.toMatchObject(DENIED);
    // the server-side service role (webhooks/admin scripts) can
    const rows = await h.asService((tx) => tx.sql("select count(*)::int c from public.question_keys"));
    expect(rows[0].c).toBeGreaterThan(0);
  });

  it("clients cannot write questions, sources, attempts or items directly", async () => {
    const u = await newUser();
    await expect(asU(u, "insert into public.questions (key, exam, section, topic, difficulty, stem, choices) values ('x-1','aptitude','verbal','analogy',1,'s','[\"a\",\"b\"]')")).rejects.toMatchObject(DENIED);
    await expect(asU(u, "update public.questions set is_premium = false")).rejects.toMatchObject(DENIED);
    await expect(asU(u, "delete from public.questions")).rejects.toMatchObject(DENIED);
    await expect(asU(u, "insert into public.question_sources (slug, name_ar, name_en, kind) values ('evil','a','b','original')")).rejects.toMatchObject(DENIED);
    await expect(asU(u, "insert into public.exam_attempts (user_id, exam, question_count, time_limit_seconds, expires_at) values ($1,'aptitude',5,60,now()+interval '1 hour')", [u])).rejects.toMatchObject(DENIED);
    await expect(asU(u, "update public.exam_attempts set score_percent = 100")).rejects.toMatchObject(DENIED);
    await expect(asU(u, "update public.exam_attempt_items set is_correct = true")).rejects.toMatchObject(DENIED);
    await expect(asU(u, "delete from public.exam_attempts")).rejects.toMatchObject(DENIED);
    await expect(asA("select * from public.exam_attempts")).rejects.toMatchObject(DENIED);
    await expect(asA("select * from public.question_bank_counts")).rejects.toMatchObject(DENIED);
  });

  it("internal helpers are not callable by clients", async () => {
    const u = await newUser();
    for (const call of [
      "select public._exam_result(gen_random_uuid())",
      "select public._exam_finalize(gen_random_uuid(), false)",
      "select public._exam_expire_stale(auth.uid())",
      "select public.notification_allowed(auth.uid(), 'like')",
      "select public._refresh_question_bank_counts_now()",
    ]) {
      await expect(asU(u, call), call).rejects.toMatchObject(DENIED);
    }
  });
});

// ============================================================================
describe("seed builder (scripts/build-question-seed.mjs)", () => {
  const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));

  it("accepts the fixture and normalises it", () => {
    const r = validateQuestionFile(fixture, catalog, "fixture");
    expect(r.errors).toEqual([]);
    expect(r.file.questions).toHaveLength(12);
    expect(r.file.questions[0]).toMatchObject({ key: "fx-aq-01", premium: false, language: "ar", time_limit_seconds: 45 });
  });

  it("reports precise errors for invalid content", () => {
    const bad = structuredClone(fixture);
    bad.questions[0].topic = "calculus";
    bad.questions[1].answer = 4;
    bad.questions[2].key = "fx-aq-01";
    bad.questions[3].choices = ["same", "same"];
    bad.questions[4].difficulty = 5;
    bad.questions[5].time_limit_seconds = 5;
    bad.questions[6].stem = "  ";
    const r = validateQuestionFile(bad, catalog, "bad.json");
    expect(r.file).toBeNull();
    const text = r.errors.join("\n");
    for (const needle of ["is not a quantitative topic", "0-based index", 'duplicate key "fx-aq-01"', "choices must be unique",
      "difficulty must be one of", "time_limit_seconds", "stem must be a non-empty string"]) {
      expect(text).toContain(needle);
    }
    expect(validateQuestionFile({ ...fixture, section: "physics" }, catalog, "x").errors.join()).toMatch(/belongs to exam "achievement"/);
    expect(validateQuestionFile({ ...fixture, source: "Bad Slug" }, catalog, "x").errors.join()).toMatch(/invalid source slug/);
    // keys must be unique across files, too
    const both = validateQuestionFiles([{ label: "a.json", json: fixture }, { label: "b.json", json: fixture }], catalog);
    expect(both.errors.join()).toMatch(/key already used in a.json/);
    expect(both.files).toEqual([]);
  });

  it("dollar-quotes any text safely", () => {
    expect(dollarQuote("abc")).toBe("$q$abc$q$");
    expect(dollarQuote("has $q$ inside")).toBe("$q1$has $q$ inside$q1$");
    expect(dollarQuote("$q$ and $q1$")).toBe("$q2$$q$ and $q1$$q2$");
  });

  it("builds deterministic SQL that applies cleanly and re-applies idempotently", async () => {
    const { files, errors } = validateQuestionFiles([{ label: "questions-sample.json", json: fixture }], catalog);
    expect(errors).toEqual([]);
    const sql = buildSeedSql(files);
    expect(buildSeedSql(files)).toBe(sql);                 // deterministic
    expect(sql).not.toMatch(/\d{4}-\d{2}-\d{2}T/);          // no timestamps
    await h.exec(sql);
    const rows = await h.sql(`select q.key, q.exam, q.section, q.topic, q.difficulty, q.choices, q.time_limit_seconds, q.tags,
        k.correct_index, s.slug, q.updated_at
      from public.questions q join public.question_keys k on k.question_id = q.id
      join public.question_sources s on s.id = q.source_id
      where q.key like 'fx-%' order by q.key`);
    expect(rows).toHaveLength(12);
    rows.forEach((r, i) => {
      const src = fixture.questions[i];
      expect(r).toMatchObject({ key: src.key, exam: "aptitude", section: "quantitative", topic: src.topic, difficulty: src.difficulty,
        choices: src.choices, time_limit_seconds: src.time_limit_seconds, tags: src.tags, correct_index: src.answer, slug: "jazira-original" });
    });
    // re-applying changes nothing (not even updated_at)
    await h.exec(sql);
    const again = await h.sql("select key, updated_at from public.questions where key like 'fx-%' order by key");
    expect(again.map((r) => String(r.updated_at))).toEqual(rows.map((r) => String(r.updated_at)));
    // an edited file updates in place (same id), including the key
    const edited = structuredClone(fixture);
    edited.questions[0].stem = "ما ناتج: 3 × 4 + 6 ÷ 3 ؟";
    edited.questions[0].choices = ["14", "15", "12", "18"];
    edited.questions[0].answer = 0;
    const r2 = validateQuestionFiles([{ label: "questions-sample.json", json: edited }], catalog);
    const [before] = await h.sql("select id from public.questions where key = 'fx-aq-01'");
    await h.exec(buildSeedSql(r2.files));
    const [after] = await h.sql("select q.id, q.stem, k.correct_index from public.questions q join public.question_keys k on k.question_id = q.id where q.key = 'fx-aq-01'");
    expect(after).toEqual({ id: before.id, stem: "ما ناتج: 3 × 4 + 6 ÷ 3 ؟", correct_index: 0 });
    await h.exec(sql);   // restore the fixture
  });

  it("round-trips hostile text (quotes, backslashes, dollar tags, newlines)", async () => {
    const nasty = "It's a \"test\" \\ with $q$, $$ and $q1$ — ولكنّ «العربية» أيضًا\nسطر ثانٍ";
    const file = { source: "jazira-original", exam: "aptitude", section: "verbal", questions: [{
      key: "fx-nasty-1", topic: "analogy", difficulty: 2, stem: nasty, passage: nasty, choices: [nasty, "b'", "c\\"],
      answer: 2, explanation: nasty, tags: [nasty.slice(0, 40), "$q$"], premium: true, year: 2024, source_ref: "p. 12", language: "ar",
    }] };
    const r = validateQuestionFiles([{ label: "nasty.json", json: file }], catalog);
    expect(r.errors).toEqual([]);
    await h.exec(buildSeedSql(r.files));
    const [row] = await h.sql(`select q.stem, q.passage, q.choices, q.tags, q.is_premium, q.year, q.source_ref, k.correct_index, k.explanation
      from public.questions q join public.question_keys k on k.question_id = q.id where q.key = 'fx-nasty-1'`);
    expect(row).toEqual({ stem: nasty, passage: nasty, choices: [nasty, "b'", "c\\"], tags: [nasty.slice(0, 40).trim(), "$q$"],
      is_premium: true, year: 2024, source_ref: "p. 12", correct_index: 2, explanation: nasty });
    await h.sql("delete from public.questions where key = 'fx-nasty-1'");
  });

  it("CLI: --check validates without writing; errors exit 1; --out writes the seed", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "jz-seed-"));
    try {
      const out = path.join(dir, "seed.sql");
      expect(await seedMain(["--check", "--file", FIXTURE, "--out", out], quiet)).toBe(0);
      expect(() => readFileSync(out)).toThrow();                       // nothing written
      const badPath = path.join(dir, "bad.json");
      writeFileSync(badPath, JSON.stringify({ ...JSON.parse(readFileSync(FIXTURE, "utf8")), exam: "nope" }));
      expect(await seedMain(["--check", "--file", badPath], quiet)).toBe(1);
      writeFileSync(path.join(dir, "broken.json"), "{ not json");
      expect(await seedMain(["--check", "--file", path.join(dir, "broken.json")], quiet)).toBe(1);
      expect(await seedMain(["--bogus"], quiet)).toBe(2);
      expect(await seedMain(["--file", FIXTURE, "--out", out], quiet)).toBe(0);
      expect(readFileSync(out, "utf8")).toContain("-- questions-sample.json — 12 questions");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ============================================================================
describe("questions: RLS and premium visibility", () => {
  const physicsVisible = (fn) => fn("select count(*)::int c, count(*) filter (where is_premium)::int p from public.questions where section = 'physics'");

  it("anon and free users see active, non-premium questions only", async () => {
    const [a] = await physicsVisible(asA);
    expect(a).toEqual({ c: 40, p: 0 });
    const u = await newUser();
    const [f] = await physicsVisible((q) => asU(u, q));
    expect(f).toEqual({ c: 40, p: 0 });
    await h.sql("update public.questions set is_active = false where key = 'tph-001'");
    expect((await physicsVisible(asA))[0].c).toBe(39);
    await h.sql("update public.questions set is_active = true where key = 'tph-001'");
  });

  it("Elite users (is_elite) see premium questions", async () => {
    const u = await newUser();
    await makePremium(u);
    const [r] = await physicsVisible((q) => asU(u, q));
    expect(r).toEqual({ c: 50, p: 10 });
  });

  it("an active elite subscription grants premium; an expired or inactive one does not", async () => {
    const u = await newUser();
    const vis = async () => (await physicsVisible((q) => asU(u, q)))[0].p;
    await h.sql("insert into public.subscriptions (user_id, tier, status, current_period_end) values ($1,'elite','active', now() + interval '1 day')", [u]);
    expect(await vis()).toBe(10);
    await h.sql("update public.subscriptions set current_period_end = now() - interval '1 minute' where user_id = $1", [u]);
    expect(await vis()).toBe(0);
    await h.sql("update public.subscriptions set current_period_end = null, status = 'cancelled' where user_id = $1", [u]);
    expect(await vis()).toBe(0);
  });

  it("has_premium() only answers about the caller", async () => {
    const a = await newUser();
    const b = await newUser();
    await makePremium(b);
    const [r] = await asU(a, "select public.has_premium($1) other, public.has_premium(auth.uid()) me", [b]);
    expect(r).toEqual({ other: false, me: false });
    const [s] = await asU(b, "select public.has_premium(auth.uid()) me", []);
    expect(s.me).toBe(true);
    const [x] = await asA("select public.has_premium($1) v", [b]);
    expect(x.v).toBe(false);
  });

  it("get_question_bank_stats(): public counts only", async () => {
    const [{ r }] = await asA("select public.get_question_bank_stats() r");
    const phys = r.by_section.find((s) => s.section === "physics");
    expect(phys).toEqual({ exam: "achievement", section: "physics", free: 40, premium: 10 });
    expect(r.by_section.find((s) => s.section === "math")).toEqual({ exam: "achievement", section: "math", free: 0, premium: 6 });
    expect(r.by_section.find((s) => s.section === "biology")).toBeUndefined();
    expect(r.total).toBe(r.free + r.premium);
    const physDiff = r.by_difficulty.filter((d) => d.section === "physics");
    expect(physDiff.reduce((s, d) => s + d.free + d.premium, 0)).toBe(50);
    expect(JSON.stringify(r)).not.toMatch(/stem|choices|correct/);
    // cache follows writes
    await h.sql("update public.questions set is_active = false where key = 'tch-001'");
    const [{ r: r2 }] = await asA("select public.get_question_bank_stats() r");
    expect(r2.by_section.find((s) => s.section === "chemistry").free).toBe(2);
    await h.sql("update public.questions set is_active = true where key = 'tch-001'");
  });
});

// ============================================================================
describe("start_exam_attempt", () => {
  it("anon cannot call it; arguments are validated", async () => {
    await expect(asA("select public.start_exam_attempt('achievement')")).rejects.toMatchObject(DENIED);
    const u = await newUser();
    const bad = async (args, field) => {
      const e = await start(u, args).catch((x) => x);
      expect(e.message, JSON.stringify(args)).toMatch(raised("invalid_argument"));
      expect(detailOf(e).field).toBe(field);
    };
    await bad({ exam: "tahsili" }, "exam");
    await bad({ exam: null }, "exam");
    await bad({ exam: "aptitude", section: "physics" }, "section");
    await bad({ section: "history" }, "section");
    await bad({ difficulty: 4 }, "difficulty");
    await bad({ difficulty: 0 }, "difficulty");
    await bad({ count: LIMITS.minQuestions - 1 }, "count");
    await bad({ count: LIMITS.maxQuestions + 1 }, "count");
    await bad({ count: null }, "count");
    await bad({ time: LIMITS.minMinutes * 60 - 1 }, "time_limit_seconds");
    await bad({ time: LIMITS.maxMinutes * 60 + 1 }, "time_limit_seconds");
    const [{ c }] = await h.sql("select count(*)::int c from public.exam_attempts where user_id = $1", [u]);
    expect(c).toBe(0);                                           // nothing was created
  });

  it("returns questions without answer keys, positioned 1..n, matching the filters", async () => {
    const u = await newUser();
    const r = await start(u, { section: "physics", difficulty: 2, count: 5 });
    expect(r).toMatchObject({ mode: "db", status: "in_progress", exam: "achievement", section: "physics", difficulty: 2,
      question_count: 5, requested_count: 5 });
    expect(r.questions.map((q) => q.position)).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(r.questions.map((q) => q.id)).size).toBe(5);
    for (const q of r.questions) {
      expect(Object.keys(q).sort()).toEqual(["choices", "difficulty", "id", "passage", "position", "section", "stem", "time_limit_seconds", "topic"]);
      expect(q).toMatchObject({ section: "physics", difficulty: 2 });
      expect(SECTIONS.physics.topics).toContain(q.topic);
    }
    expect(JSON.stringify(r)).not.toMatch(/correct|explanation|answer/);
    // default time limit = sum of the questions' limits (5 × 30 s = 150 s)
    expect(r.time_limit_seconds).toBe(150);
    expect(new Date(r.expires_at) - new Date(r.started_at)).toBe(150_000);
    const [row] = await h.sql("select status, question_count, time_limit_seconds, user_id::text uid from public.exam_attempts where id = $1", [r.attempt_id]);
    expect(row).toEqual({ status: "in_progress", question_count: 5, time_limit_seconds: 150, uid: u });
  });

  it("honours an explicit time limit and clamps the default to at least 60 s", async () => {
    const u = await newUser();
    expect((await start(u, { count: 5, time: 900 })).time_limit_seconds).toBe(900);
    await h.sql("update public.questions set time_limit_seconds = 10 where key like 'tch-%'");
    expect((await start(u, { section: "chemistry", count: 5 })).time_limit_seconds).toBe(60);
    await h.sql("update public.questions set time_limit_seconds = 30 where key like 'tch-%'");
  });

  it("mixed sections (section null) draw from the whole exam", async () => {
    const u = await newUser();
    const r = await start(u, { section: null, count: 25 });
    expect(r.question_count).toBe(25);
    const secs = new Set(r.questions.map((q) => q.section));
    for (const s of secs) expect(EXAMS.achievement.sections).toContain(s);
  });

  it("free plan: never premium questions, at most 25 per attempt", async () => {
    const u = await newUser();
    const e = await start(u, { count: LIMITS.freeMaxQuestions + 1 }).catch((x) => x);
    expect(e.message).toMatch(raised("premium_required"));
    expect(detailOf(e)).toEqual({ max_questions: LIMITS.freeMaxQuestions });
    const r = await start(u, { count: 25 });
    const ids = r.questions.map((q) => q.id);
    const [p] = await h.sql("select count(*)::int c from public.questions where id = any($1::uuid[]) and is_premium", [ids]);
    expect(p.c).toBe(0);
    // premium-only section → nothing available for free users
    const e2 = await start(u, { section: "math", count: 5 }).catch((x) => x);
    expect(e2.message).toMatch(raised("not_enough_questions"));
  });

  it("premium plan: up to 100 questions, premium questions included", async () => {
    const u = await newUser();
    await makePremium(u);
    const r = await start(u, { count: 50 });
    expect(r.question_count).toBe(50);                         // 40 free + 10 premium physics
    const [p] = await h.sql("select count(*)::int c from public.questions where id = any($1::uuid[]) and is_premium", [r.questions.map((q) => q.id)]);
    expect(p.c).toBe(10);
    expect((await start(u, { section: "math", count: 5 })).question_count).toBe(5);
  });

  it("uses what is available when fewer questions exist; none → not_enough_questions", async () => {
    const u = await newUser();
    const r = await start(u, { section: "chemistry", count: 10 });
    expect(r).toMatchObject({ question_count: 3, requested_count: 10 });
    const e = await start(u, { section: "biology", count: 5 }).catch((x) => x);
    expect(e.message).toMatch(raised("not_enough_questions"));
    expect(detailOf(e)).toEqual({ available: 0, requested: 5 });
  });

  it("free plan: 5 attempts per Asia/Riyadh day; yesterday's attempts don't count; premium is unlimited", async () => {
    const u = await newUser();
    for (let i = 0; i < LIMITS.freeDailyAttempts; i++) await start(u, { section: "chemistry", count: 5 });
    const e = await start(u, { section: "chemistry", count: 5 }).catch((x) => x);
    expect(e.message).toMatch(raised("daily_limit_reached"));
    const d = detailOf(e);
    expect(d).toMatchObject({ limit: 5, used: 5 });
    const [{ ok }] = await h.sql("select ($1::timestamptz = (date_trunc('day', now() at time zone 'Asia/Riyadh') + interval '1 day') at time zone 'Asia/Riyadh') ok", [d.resets_at]);
    expect(ok).toBe(true);
    await h.sql(`update public.exam_attempts set started_at = started_at - interval '2 days', expires_at = expires_at - interval '2 days'
                 where id = (select id from public.exam_attempts where user_id = $1 order by started_at limit 1)`, [u]);
    await expect(start(u, { section: "chemistry", count: 5 })).resolves.toMatchObject({ status: "in_progress" });
    const p = await newUser();
    await makePremium(p);
    for (let i = 0; i < LIMITS.freeDailyAttempts + 2; i++) await start(p, { section: "chemistry", count: 5 });
  });

  it("avoids questions seen in the last 3 attempts while enough remain", async () => {
    const u = await newUser();                                 // free: exactly the 40 free physics questions
    const sets = [];
    for (let i = 0; i < 4; i++) sets.push(new Set((await start(u, { count: 10 })).questions.map((q) => q.id)));
    const all = new Set(sets.flatMap((s) => [...s]));
    expect(all.size).toBe(40);                                 // 4 disjoint draws cover the bank
    const fifth = new Set((await start(u, { count: 10 })).questions.map((q) => q.id));
    expect([...fifth].sort()).toEqual([...sets[0]].sort());    // only the oldest draw is outside the last 3
  });

  it("falls back to recently seen questions when the fresh pool is too small", async () => {
    const u = await newUser();
    const a = await start(u, { section: "chemistry", count: 5 });
    const b = await start(u, { section: "chemistry", count: 5 });
    expect(b.question_count).toBe(3);
    expect(new Set(b.questions.map((q) => q.id))).toEqual(new Set(a.questions.map((q) => q.id)));
  });
});

// ============================================================================
describe("save → submit → review", () => {
  let u, other, r, keys;
  beforeAll(async () => {
    u = await newUser({ full_name: "Exam Taker" });
    other = await newUser();
    r = await start(u, { count: 10 });
    keys = await correctIndexes(r.questions.map((q) => q.id));
  });

  it("the owner saves answers; wrong owner, anon and bad input are rejected", async () => {
    const q1 = r.questions[0];
    const s = await save(u, r.attempt_id, 1, keys[q1.id], 12, true);
    expect(s).toMatchObject({ position: 1, selected_index: keys[q1.id], flagged: true, time_spent_seconds: 12 });
    expect(s.seconds_remaining).toBeGreaterThan(0);
    // time is cumulative/monotonic; flagged null keeps; selected null clears
    const s2 = await save(u, r.attempt_id, 1, null, 5, null);
    expect(s2).toMatchObject({ selected_index: null, flagged: true, time_spent_seconds: 12 });
    await save(u, r.attempt_id, 1, keys[q1.id], 20, false);

    await expect(save(other, r.attempt_id, 1, 0)).rejects.toThrow(raised("attempt_not_found"));
    await expect(h.asAnon((tx) => tx.sql("select public.save_exam_answer($1::uuid, 1::smallint, 0::smallint)", [r.attempt_id]))).rejects.toMatchObject(DENIED);
    await expect(save(u, r.attempt_id, 11, 0)).rejects.toThrow(raised("invalid_argument"));
    await expect(save(u, r.attempt_id, 2, 4)).rejects.toThrow(raised("invalid_argument"));   // 4 choices → 0..3
    await expect(save(u, r.attempt_id, 2, -1)).rejects.toThrow(raised("invalid_argument"));
    await expect(save(u, r.attempt_id, 2, 0, -3)).rejects.toThrow(raised("invalid_argument"));
    await expect(save(u, "00000000-0000-0000-0000-000000000000", 1, 0)).rejects.toThrow(raised("attempt_not_found"));
  });

  it("correctness is not stored (or readable) before submission; items are private", async () => {
    const own = await asU(u, "select position, selected_index, is_correct from public.exam_attempt_items where attempt_id = $1 order by position", [r.attempt_id]);
    expect(own).toHaveLength(10);
    expect(own.every((i) => i.is_correct === null)).toBe(true);
    expect(await asU(other, "select 1 from public.exam_attempt_items where attempt_id = $1", [r.attempt_id])).toHaveLength(0);
    expect(await asU(other, "select 1 from public.exam_attempts where id = $1", [r.attempt_id])).toHaveLength(0);
    await expect(asA("select 1 from public.exam_attempt_items")).rejects.toMatchObject(DENIED);
  });

  it("get_exam_attempt resumes an in-progress attempt without keys", async () => {
    const g = await getAttempt(u, r.attempt_id);
    expect(g).toMatchObject({ mode: "db", status: "in_progress" });
    expect(g.questions).toHaveLength(10);
    expect(g.answers[0]).toMatchObject({ position: 1, selected_index: keys[r.questions[0].id], flagged: false, time_spent_seconds: 20 });
    expect(g.seconds_remaining).toBeGreaterThan(0);
    expect(JSON.stringify(g)).not.toMatch(/correct_index|explanation|is_correct/);
    await expect(getAttempt(other, r.attempt_id)).rejects.toThrow(raised("attempt_not_found"));
  });

  it("submit validates bulk answers before writing anything", async () => {
    for (const bad of [
      { position: 1 }, [{ position: 99 }], [{ position: 1.5 }], [{ position: "1" }], [{ position: 1, selected_index: 7 }],
      [{ position: 1, selected_index: 1.2 }], [{ position: 1, time_spent_seconds: -1 }], [{ position: 1, flagged: "yes" }],
      [{ position: 2 }, { position: 2 }], [{ position: 1e30 }], [{ position: 0 }], Array.from({ length: 101 }, (_, i) => ({ position: i + 1 })),
    ]) {
      await expect(submit(u, r.attempt_id, bad), JSON.stringify(bad).slice(0, 60)).rejects.toThrow(raised("invalid_argument"));
    }
    const [a] = await h.sql("select status from public.exam_attempts where id = $1", [r.attempt_id]);
    expect(a.status).toBe("in_progress");
  });

  it("grades against the key, awards XP once, records activity and notifies", async () => {
    const xp0 = await xpOf(u);
    // positions 1–6 correct (1 already saved), 7–8 wrong, 9–10 unanswered
    const answers = r.questions.slice(1, 8).map((q, i) => ({
      position: q.position,
      selected_index: i < 5 ? keys[q.id] : (keys[q.id] + 1) % 4,
      time_spent_seconds: 15,
    }));
    const res = await submit(u, r.attempt_id, answers);
    expect(res.status).toBe("submitted");
    expect(res.attempt).toMatchObject({ id: r.attempt_id, status: "submitted", correct_count: 6, total: 10, score_percent: 60,
      answered_count: 8, xp_awarded: 12, question_count: 10 });
    expect(res.attempt.duration_seconds).toBeGreaterThanOrEqual(0);
    expect(res.attempt.duration_seconds).toBeLessThanOrEqual(res.attempt.time_limit_seconds);
    expect(res.items).toHaveLength(10);
    for (const it of res.items) {
      expect(it.correct_index).toBe(keys[it.question_id]);
      expect(it.is_correct).toBe(it.selected_index === it.correct_index);
      expect(it.explanation).toMatch(/^شرح /);
    }
    expect(res.items.filter((i) => i.selected_index === null).map((i) => i.position)).toEqual([9, 10]);
    const byTopic = res.by_topic.reduce((s, t) => ({ c: s.c + t.correct, t: s.t + t.total }), { c: 0, t: 0 });
    expect(byTopic).toEqual({ c: 6, t: 10 });
    expect(await xpOf(u)).toBe(xp0 + 12);
    const [st] = await h.sql("select count(*)::int c from public.streaks where user_id = $1", [u]);
    expect(st.c).toBe(1);
    const notes = await asU(u, "select type, actor_id, data from public.notifications where user_id = $1 and type = 'exam_result'", [u]);
    expect(notes).toHaveLength(1);
    expect(notes[0].data).toMatchObject({ attempt_id: r.attempt_id, correct: 6, total: 10, score_percent: 60, status: "submitted" });
  });

  it("is idempotent: a second submit returns the stored result and awards nothing", async () => {
    const xp1 = await xpOf(u);
    const again = await submit(u, r.attempt_id, [{ position: 9, selected_index: 0 }]);
    expect(again.attempt).toMatchObject({ correct_count: 6, xp_awarded: 12, status: "submitted" });
    expect(again.items[8].selected_index).toBeNull();
    expect(await xpOf(u)).toBe(xp1);
    const [c] = await h.sql("select count(*)::int c from public.notifications where user_id = $1 and type = 'exam_result'", [u]);
    expect(c.c).toBe(1);
    await expect(save(u, r.attempt_id, 9, 0)).rejects.toThrow(raised("attempt_closed"));
    const review = await getAttempt(u, r.attempt_id);
    expect(review).toEqual(again);
    await expect(submit(other, r.attempt_id)).rejects.toThrow(raised("attempt_not_found"));
  });
});

// ============================================================================
describe("expiry", () => {
  const backdate = (id, secondsPastDeadline) => h.sql(
    `update public.exam_attempts set started_at = now() - make_interval(secs => time_limit_seconds + $2::int),
            expires_at = now() - make_interval(secs => $2::int) where id = $1`, [id, secondsPastDeadline]);

  it("within the 30 s grace answers are still accepted", async () => {
    const u = await newUser();
    const r = await start(u, { section: "chemistry", count: 5 });
    await backdate(r.attempt_id, 10);
    await expect(save(u, r.attempt_id, 1, 0)).resolves.toMatchObject({ seconds_remaining: 0 });
    expect((await submit(u, r.attempt_id)).status).toBe("submitted");
  });

  it("after the deadline the attempt is graded as expired (saved answers count, late ones don't)", async () => {
    const u = await newUser();
    const r = await start(u, { section: "chemistry", count: 5 });
    const keys = await correctIndexes(r.questions.map((q) => q.id));
    await save(u, r.attempt_id, 1, keys[r.questions[0].id]);
    await backdate(r.attempt_id, 120);
    await expect(save(u, r.attempt_id, 2, 0)).rejects.toThrow(raised("attempt_closed"));
    const late = r.questions.slice(1).map((q) => ({ position: q.position, selected_index: keys[q.id] }));
    const res = await submit(u, r.attempt_id, late);
    expect(res.status).toBe("expired");
    expect(res.attempt).toMatchObject({ correct_count: 1, total: 3, xp_awarded: 2 });
    expect(res.attempt.duration_seconds).toBe(res.attempt.time_limit_seconds);
  });

  it("get_exam_attempt and list_exam_attempts close overdue attempts", async () => {
    const u = await newUser();
    const a = await start(u, { section: "chemistry", count: 5 });
    await backdate(a.attempt_id, 60);
    const g = await getAttempt(u, a.attempt_id);
    expect(g.status).toBe("expired");
    expect(g.items).toHaveLength(3);
    const b = await start(u, { section: "chemistry", count: 5 });
    await backdate(b.attempt_id, 60);
    const rows = await listAttempts(u);
    expect(rows.find((x) => x.id === b.attempt_id).status).toBe("expired");
  });
});

// ============================================================================
describe("history, stats and relationships", () => {
  it("new users have empty history and empty stats", async () => {
    const u = await newUser();
    expect(await listAttempts(u)).toEqual([]);
    const s = await stats(u);
    expect(s).toMatchObject({ completed_attempts: 0, in_progress: 0, by_section: [], by_topic: [], best_topics: [], weakest_topics: [] });
    expect(s.totals).toMatchObject({ attempts: 0, questions: 0, correct: 0, accuracy: null, average_score: null, best_score: null, avg_seconds_per_question: null });
    expect(s.trend.daily).toEqual([]);
    expect(s.trend.windows.last_7).toEqual({ attempts: 0, total: 0, correct: 0, accuracy: null });
    await expect(asA("select public.get_exam_stats()")).rejects.toMatchObject(DENIED);
    await expect(asA("select * from public.list_exam_attempts()")).rejects.toMatchObject(DENIED);
  });

  it("list_exam_attempts: newest first, keyset pagination without gaps or duplicates (ties included)", async () => {
    const u = await newUser();
    await makePremium(u);
    const ids = [];
    for (let i = 0; i < 7; i++) ids.push((await start(u, { section: "chemistry", count: 5 })).attempt_id);
    // three attempts share one timestamp → the id tiebreaker matters
    await h.sql(`update public.exam_attempts set started_at = now() - interval '1 hour', expires_at = now() + interval '1 hour'
                 where id = any($1::uuid[])`, [ids.slice(2, 5)]);
    await h.sql("update public.exam_attempts set started_at = now() - interval '90 minutes', expires_at = now() + interval '1 hour' where id = $1", [ids[0]]);
    const all = await listAttempts(u, 100);
    expect(all).toHaveLength(7);
    for (let i = 1; i < all.length; i++) {
      const prev = all[i - 1], cur = all[i];
      const ok = new Date(prev.started_at) > new Date(cur.started_at)
        || (String(prev.started_at) === String(cur.started_at) && prev.id > cur.id);
      expect(ok, `row ${i}`).toBe(true);
    }
    const seen = [];
    let cursor = { before: null, id: null };
    for (let page = 0; page < 10; page++) {
      const rows = await listAttempts(u, 2, cursor.before, cursor.id);
      if (!rows.length) break;
      seen.push(...rows.map((x) => x.id));
      const last = rows[rows.length - 1];
      cursor = { before: last.started_at, id: last.id };
    }
    expect(seen).toEqual(all.map((x) => x.id));
    await expect(listAttempts(u, 0)).rejects.toThrow(raised("invalid_argument"));
    await expect(listAttempts(u, 101)).rejects.toThrow(raised("invalid_argument"));
    const stranger = await newUser();
    expect(await listAttempts(stranger)).toEqual([]);
  });

  it("get_exam_stats aggregates graded attempts by section/topic with trends", async () => {
    const u = await newUser();
    // 0012: topic-level analytics (by_topic / best / weakest) are Elite-only;
    // the free-plan split is covered in tests/db/learning-0012.test.js.
    await makePremium(u);
    const a = await start(u, { count: 10 });
    const keys = await correctIndexes(a.questions.map((q) => q.id));
    await submit(u, a.attempt_id, a.questions.map((q, i) => ({ position: q.position, selected_index: i < 7 ? keys[q.id] : (keys[q.id] + 1) % 4 })));
    const b = await start(u, { section: "chemistry", count: 5 });
    await submit(u, b.attempt_id, []);                        // 0 / 3
    await start(u, { section: "chemistry", count: 5 });       // in progress → not in stats
    const s = await stats(u);
    expect(s.completed_attempts).toBe(2);
    expect(s.in_progress).toBe(1);
    expect(s.totals).toMatchObject({ attempts: 2, questions: 13, correct: 7, answered: 10, accuracy: 53.8, best_score: 70, xp_earned: 14 });
    expect(s.totals.average_score).toBe(35);
    expect(s.by_section).toEqual([
      { exam: "achievement", section: "chemistry", total: 3, answered: 0, correct: 0, accuracy: 0 },
      { exam: "achievement", section: "physics", total: 10, answered: 10, correct: 7, accuracy: 70 },
    ]);
    expect(s.by_topic.reduce((x, t) => x + t.total, 0)).toBe(13);
    expect(s.trend.windows.last_7).toMatchObject({ attempts: 2, total: 13, correct: 7 });
    expect(s.trend.windows.prev_7).toMatchObject({ attempts: 0 });
    expect(s.trend.daily).toHaveLength(1);
    for (const t of [...s.best_topics, ...s.weakest_topics]) expect(t.total).toBeGreaterThanOrEqual(3);
    // stats are private to the caller
    const other = await newUser();
    expect((await stats(other)).completed_attempts).toBe(0);
  });

  it("deleting a user cascades to attempts and items; questions in use cannot be deleted", async () => {
    const u = await newUser();
    const r = await start(u, { section: "chemistry", count: 5 });
    await expect(h.sql("delete from public.questions where id = $1", [r.questions[0].id])).rejects.toMatchObject(FK);
    await h.sql("delete from auth.users where id = $1", [u]);
    const [c] = await h.sql(`select (select count(*) from public.exam_attempts where user_id = $1)::int a,
                                    (select count(*) from public.exam_attempt_items where attempt_id = $2)::int i`, [u, r.attempt_id]);
    expect(c).toEqual({ a: 0, i: 0 });
  });
});

// ============================================================================
describe("contact_messages", () => {
  // 0013: the inbox is written only by POST /api/contact with the service role
  // (after a per-IP limit); browsers can no longer insert directly.
  let seq = 0;
  const msg = (over = {}) => ({ name: "Sara Ali", email: `c${++seq}@example.com`, topic: "general",
    message: "Hello, I have a question about Jazira.", locale: "ar", ...over });
  const insertAs = (runner, m) => runner((tx) => tx.query(
    "insert into public.contact_messages (user_id, name, email, topic, message, locale, status, created_at) values ($1,$2,$3,$4,$5,$6,coalesce($7,'new'),coalesce($8::timestamptz, now()))",
    [m.user_id ?? null, m.name, m.email, m.topic, m.message, m.locale, m.status ?? null, m.created_at ?? null]));
  const anon = (m) => insertAs((fn) => h.asAnon(fn), m);
  const user = (uid, m) => insertAs((fn) => h.asUser(uid, fn), m);
  const server = (m) => insertAs((fn) => h.asService(fn), m);

  it("the server route (service role) writes the inbox; senders are attributed by the route", async () => {
    await expect(server(msg())).resolves.toMatchObject({ affectedRows: 1 });
    const u = await newUser();
    const m = msg({ email: `  MiXeD${++seq}@Example.COM `, user_id: u });
    await server(m);
    const [row] = await h.sql("select user_id::text uid, email, status from public.contact_messages where email = $1", [m.email.trim().toLowerCase()]);
    expect(row).toEqual({ uid: u, email: m.email.trim().toLowerCase(), status: "new" });
  });

  it("browsers cannot insert (no per-IP limit there), read, edit or delete", async () => {
    const a = await newUser();
    const b = await newUser();
    await expect(anon(msg())).rejects.toMatchObject(DENIED);
    await expect(user(a, msg())).rejects.toMatchObject(DENIED);
    await expect(user(a, msg({ user_id: b }))).rejects.toMatchObject(DENIED);
    await expect(anon(msg({ status: "resolved" }))).rejects.toMatchObject(DENIED);
    await expect(asA("select * from public.contact_messages")).rejects.toMatchObject(DENIED);
    await expect(asU(a, "select * from public.contact_messages")).rejects.toMatchObject(DENIED);
    await expect(asU(a, "update public.contact_messages set status = 'spam'")).rejects.toMatchObject(DENIED);
    await expect(asU(a, "delete from public.contact_messages")).rejects.toMatchObject(DENIED);
  });

  it("validates name, email, topic, message and locale", async () => {
    for (const bad of [
      { name: "A" }, { name: "x".repeat(81) }, { name: "Bad\u0007Name" }, { email: "not-an-email" }, { email: "a@b" },
      { email: `${"x".repeat(250)}@example.com` }, { topic: "sales" }, { message: "too short" }, { message: "x".repeat(4001) },
      { locale: "fr" },
    ]) {
      await expect(server(msg(bad)), JSON.stringify(bad).slice(0, 40)).rejects.toMatchObject(CHECK);
    }
    // whitespace is normalised rather than rejected
    const email = `norm${++seq}@example.com`;
    await server(msg({ name: "  Sara \n  Ali ", email, message: "   Hello there, this is fine.   " }));
    const [row] = await h.sql("select name, message from public.contact_messages where email = $1", [email]);
    expect(row).toEqual({ name: "Sara Ali", message: "Hello there, this is fine." });
  });

  it("rate limit: a 4th message within an hour from the same email or account is refused", async () => {
    const email = `limit${++seq}@example.com`;
    for (let i = 0; i < 3; i++) await server(msg({ email }));
    await expect(server(msg({ email }))).rejects.toThrow(raised("rate_limited"));
    await expect(server(msg({ email: email.toUpperCase() }))).rejects.toThrow(raised("rate_limited"));
    // a forged old created_at is ignored (the trigger stamps now())
    await expect(server(msg({ email, created_at: "2000-01-01T00:00:00Z" }))).rejects.toThrow(raised("rate_limited"));
    // same account, different emails
    const u = await newUser();
    for (let i = 0; i < 3; i++) await server(msg({ user_id: u }));
    await expect(server(msg({ user_id: u }))).rejects.toThrow(raised("rate_limited"));
    // others are unaffected; an hour later it's allowed again
    await expect(server(msg())).resolves.toMatchObject({ affectedRows: 1 });
    await h.sql("update public.contact_messages set created_at = now() - interval '61 minutes' where email = $1", [email]);
    await expect(server(msg({ email }))).resolves.toMatchObject({ affectedRows: 1 });
  });

  it("rotating emails no longer floods the inbox: guests share one hourly budget (60)", async () => {
    // age out what earlier tests sent, so the budget is exact here
    await h.sql("update public.contact_messages set created_at = now() - interval '2 hours'");
    for (let i = 0; i < 60; i++) await server(msg({ email: `bot${i}.${++seq}@x.io` }));
    await expect(server(msg({ email: `bot-last.${++seq}@x.io` }))).rejects.toThrow(raised("rate_limited"));
    const u = await newUser();
    await expect(server(msg({ user_id: u }))).resolves.toMatchObject({ affectedRows: 1 });   // members unaffected
  });
});

// ============================================================================
describe("notifications: types, preferences, feed", () => {
  let a, b, post;
  beforeAll(async () => {
    a = await newUser({ full_name: "Actor One" });
    b = await newUser({ full_name: "Owner Two" });
    [{ id: post }] = await asU(b, "insert into public.community_posts (user_id, content) values ($1, $2) returning id",
      [b, "منشور طويل عن الفيزياء ".repeat(10)]);
  });
  const count = (uid, type) => h.sql("select count(*)::int c from public.notifications where user_id = $1 and type = $2", [uid, type]).then((r) => r[0].c);

  it("the type check keeps the 0008 types and adds exam_result, achievement, system", async () => {
    const [{ d }] = await h.sql("select pg_get_constraintdef(oid) d from pg_constraint where conname = 'notifications_type_check'");
    for (const t of ["like", "follow", "mention", "repost", "comment", "message_request", "request_accepted", "message", "exam_result", "achievement", "system"]) {
      expect(d).toContain(`'${t}'`);
    }
    await expect(h.sql("insert into public.notifications (user_id, type) values ($1, 'bogus')", [b])).rejects.toMatchObject(CHECK);
    await h.sql("insert into public.notifications (user_id, type, data) values ($1, 'system', '{\"k\":1}')", [b]);
  });

  it("clients cannot author system-only types (even where a client INSERT grant exists)", async () => {
    for (const t of ["exam_result", "achievement", "system"]) {
      await expect(asU(a, "insert into public.notifications (user_id, actor_id, type) values ($1, $2, $3)", [b, a, t])).rejects.toMatchObject(DENIED);
    }
    // 0009 already revokes client INSERT on notifications; prove the 0010 guard on its own
    const [{ g: hadGrant }] = await h.sql("select has_table_privilege('authenticated', 'public.notifications', 'INSERT') g");
    await h.sql("grant insert on public.notifications to authenticated");
    await h.sql("create policy tmp_notif_insert on public.notifications for insert to authenticated with check (auth.uid() = actor_id)");
    try {
      await expect(asU(a, "insert into public.notifications (user_id, actor_id, type) values ($1, $2, 'system')", [b, a]))
        .rejects.toThrow(raised("forbidden"));
      await expect(asU(a, "insert into public.notifications (user_id, actor_id, type) values ($1, $2, 'mention')", [b, a]))
        .resolves.toBeDefined();
    } finally {
      await h.sql("drop policy tmp_notif_insert on public.notifications");
      if (!hadGrant) await h.sql("revoke insert on public.notifications from authenticated");
      await h.sql("delete from public.notifications where user_id = $1 and type = 'mention'", [b]);
    }
  });

  it("notification_preferences: own row only", async () => {
    await asU(a, "insert into public.notification_preferences (user_id, likes) values ($1, false)", [a]);
    await expect(asU(b, "insert into public.notification_preferences (user_id) values ($1)", [a])).rejects.toMatchObject(DENIED);
    expect(await asU(b, "select * from public.notification_preferences where user_id = $1", [a])).toHaveLength(0);
    expect(await n(b, "update public.notification_preferences set likes = true where user_id = $1", [a])).toBe(0);
    await expect(asA("select * from public.notification_preferences")).rejects.toMatchObject(DENIED);
    const [own] = await asU(a, "select likes, comments, follows, mentions, messages, exam_results, product_updates, email_digest from public.notification_preferences where user_id = $1", [a]);
    expect(own).toEqual({ likes: false, comments: true, follows: true, mentions: true, messages: true, exam_results: true, product_updates: true, email_digest: false });
    expect(await n(a, "update public.notification_preferences set likes = true where user_id = $1", [a])).toBe(1);
  });

  it("disabled types are not delivered (0008 triggers or any other insert); re-enabling restores them", async () => {
    await asU(b, "insert into public.notification_preferences (user_id, likes, comments, follows, mentions) values ($1, false, false, false, false)", [b]);
    const before = { like: await count(b, "like"), comment: await count(b, "comment"), follow: await count(b, "follow"), mention: await count(b, "mention") };
    await asU(a, "insert into public.post_likes (post_id, user_id) values ($1, $2)", [post, a]);
    await asU(a, "insert into public.post_comments (post_id, user_id, content) values ($1, $2, 'nice')", [post, a]);
    await asU(a, "insert into public.follows (follower_id, followee_id) values ($1, $2)", [a, b]);
    await h.sql("insert into public.notifications (user_id, actor_id, type, post_id) values ($1, $2, 'mention', $3)", [b, a, post]);
    expect({ like: await count(b, "like"), comment: await count(b, "comment"), follow: await count(b, "follow"), mention: await count(b, "mention") }).toEqual(before);
    // the interactions themselves still happened
    const [p] = await h.sql("select likes_count, comments_count from public.community_posts where id = $1", [post]);
    expect(p).toEqual({ likes_count: 1, comments_count: 1 });
    await asU(b, "update public.notification_preferences set likes = true, comments = true where user_id = $1", [b]);
    await asU(a, "insert into public.post_reposts (post_id, user_id) values ($1, $2)", [post, a]);   // repost ↔ likes switch
    await asU(a, "insert into public.post_comments (post_id, user_id, content) values ($1, $2, 'again')", [post, a]);
    expect(await count(b, "repost")).toBe(1);
    expect(await count(b, "comment")).toBe(before.comment + 1);
  });

  it("exam_results off → no exam_result notification", async () => {
    const u = await newUser();
    await asU(u, "insert into public.notification_preferences (user_id, exam_results) values ($1, false)", [u]);
    const r = await start(u, { section: "chemistry", count: 5 });
    await submit(u, r.attempt_id);
    expect(await count(u, "exam_result")).toBe(0);
  });

  it("get_notifications: empty for a new user; anon has no access; limit validated", async () => {
    const u = await newUser();
    expect(await asU(u, "select * from public.get_notifications()")).toEqual([]);
    await expect(asA("select * from public.get_notifications()")).rejects.toMatchObject(DENIED);
    await expect(asU(u, "select * from public.get_notifications(0)")).rejects.toThrow(raised("invalid_argument"));
    await expect(asU(u, "select * from public.get_notifications(101)")).rejects.toThrow(raised("invalid_argument"));
  });

  it("get_notifications: actor public identity, anonymous masking, post snippet, only own rows", async () => {
    const rows = await asU(b, "select * from public.get_notifications(50)");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.type !== undefined)).toBe(true);
    const comment = rows.find((r) => r.type === "comment");
    expect(comment).toMatchObject({ actor_id: a, actor_full_name: "Actor One", actor_anonymous: false, actor_is_elite: false, post_id: post });
    expect(comment.actor_username).toBeTruthy();
    expect(comment.post_snippet.length).toBeLessThanOrEqual(121);
    expect(comment.post_snippet.endsWith("…")).toBe(true);
    expect(Object.keys(comment)).not.toContain("phone");
    await h.sql("update public.profiles set anonymous_community = true where id = $1", [a]);
    const masked = (await asU(b, "select * from public.get_notifications(50)")).find((r) => r.type === "comment");
    expect(masked).toMatchObject({ actor_full_name: null, actor_username: null, actor_avatar_url: null, actor_anonymous: true });
    await h.sql("update public.profiles set anonymous_community = false where id = $1", [a]);
    expect((await asU(a, "select * from public.get_notifications(50)")).some((r) => r.post_id === post && r.type === "comment")).toBe(false);
  });

  it("get_notifications: newest first; keyset pages cover every row exactly once (identical timestamps)", async () => {
    const u = await newUser();
    await h.sql(`insert into public.notifications (user_id, type, created_at)
                 select $1, 'system', case when g <= 6 then timestamptz '2026-01-01 10:00:00+00' else timestamptz '2026-01-01 09:00:00+00' + make_interval(mins => g) end
                   from generate_series(1, 11) g`, [u]);
    const all = await asU(u, "select id, created_at from public.get_notifications(100)");
    expect(all).toHaveLength(11);
    const seen = [];
    let before = null, beforeId = null;
    for (let i = 0; i < 20; i++) {
      const page = await asU(u, "select id, created_at from public.get_notifications($1::int, $2::timestamptz, $3::uuid)", [3, before, beforeId]);
      if (!page.length) break;
      seen.push(...page.map((r) => r.id));
      ({ created_at: before, id: beforeId } = page[page.length - 1]);
    }
    expect(seen).toEqual(all.map((r) => r.id));
    expect(new Set(seen).size).toBe(11);
  });

  it("mark_notifications_read: selected ids, then all; never other users' rows", async () => {
    const u = await newUser();
    await h.sql("insert into public.notifications (user_id, type) select $1, 'system' from generate_series(1, 4)", [u]);
    const ids = (await asU(u, "select id from public.get_notifications(10)")).map((r) => r.id);
    const unread = () => asU(u, "select public.unread_notification_count() c").then((r) => r[0].c);
    expect(await unread()).toBe(4);
    expect((await asU(a, "select public.mark_notifications_read($1::uuid[]) c", [ids]))[0].c).toBe(0);
    expect((await asU(u, "select public.mark_notifications_read($1::uuid[]) c", [ids.slice(0, 1)]))[0].c).toBe(1);
    expect((await asU(u, "select public.mark_notifications_read($1::uuid[]) c", [[]]))[0].c).toBe(0);
    expect(await unread()).toBe(3);
    expect((await asU(u, "select public.mark_notifications_read() c"))[0].c).toBe(3);
    expect(await unread()).toBe(0);
    await expect(asA("select public.mark_notifications_read()")).rejects.toMatchObject(DENIED);
    const tooMany = Array.from({ length: 501 }, () => "00000000-0000-0000-0000-000000000000");
    await expect(asU(u, "select public.mark_notifications_read($1::uuid[])", [tooMany])).rejects.toThrow(raised("invalid_argument"));
  });
});

// ============================================================================
describe("search_all", () => {
  let u, premium, anonAuthor;
  const search = (runner, q, limit = 5) => runner((tx) => tx.sql("select public.search_all($1, $2::int) r", [q, limit])).then(one);
  beforeAll(async () => {
    u = await newUser({ full_name: "Zaytuna Searcher", username: "zaytuna_one" });
    premium = await newUser({ full_name: "Premium Reader" });
    await makePremium(premium);
    anonAuthor = await newUser({ full_name: "Zaytuna Hidden" });
    await h.sql("update public.profiles set anonymous_community = true where id = $1", [anonAuthor]);
    await asU(u, "insert into public.community_posts (user_id, content) values ($1, 'أحب مادة الزيتونولوجيا كثيرًا'), ($1, '100% sure about under_score')", [u]);
    await asU(anonAuthor, "insert into public.community_posts (user_id, content) values ($1, 'سر الزيتونولوجيا المجهول')", [anonAuthor]);
    await h.sql("insert into public.hashtags (tag, post_count) values ('zaytunology', 7), ('zaytun', 2), ('other', 1)");
    await h.sql(`insert into public.questions (key, exam, section, topic, difficulty, stem, choices, is_premium, is_active) values
      ('srch-free', 'aptitude', 'verbal', 'analogy', 1, 'سؤال عن الزيتونولوجيا المجانية', '["a","b"]', false, true),
      ('srch-prem', 'aptitude', 'verbal', 'analogy', 1, 'سؤال عن الزيتونولوجيا المميزة', '["a","b"]', true, true),
      ('srch-off',  'aptitude', 'verbal', 'analogy', 1, 'سؤال عن الزيتونولوجيا المتوقفة', '["a","b"]', false, false)`);
  });

  it("short or empty queries return empty groups without querying", async () => {
    for (const q of ["", " ", "a", "  ز  ", null]) {
      const r = await search((fn) => h.asAnon(fn), q);
      expect(r).toMatchObject({ people: [], posts: [], tags: [], questions: [] });
    }
    await expect(search((fn) => h.asAnon(fn), "zaytuna", 0)).rejects.toThrow(raised("invalid_argument"));
    await expect(search((fn) => h.asAnon(fn), "zaytuna", 21)).rejects.toThrow(raised("invalid_argument"));
  });

  it("finds people by name/handle (never anonymous-community users), with public columns only", async () => {
    const r = await search((fn) => h.asUser(u, fn), "zaytuna");
    expect(r.people.map((p) => p.full_name)).toEqual(["Zaytuna Searcher"]);
    expect(Object.keys(r.people[0]).sort()).toEqual(["avatar_url", "full_name", "id", "is_elite", "show_elite_badge", "username"]);
    expect((await search((fn) => h.asAnon(fn), "ZAYTUNA_O")).people).toHaveLength(1);   // case-insensitive, handle match
  });

  it("finds posts (anonymous authors masked), tags (# optional) and questions", async () => {
    const r = await search((fn) => h.asAnon(fn), "الزيتونولوجيا");
    expect(r.posts).toHaveLength(2);
    const hidden = r.posts.find((p) => p.snippet.includes("المجهول"));
    expect(hidden.author).toBeNull();
    const shown = r.posts.find((p) => !p.snippet.includes("المجهول"));
    expect(shown.author).toMatchObject({ id: u, full_name: "Zaytuna Searcher" });
    const t = await search((fn) => h.asAnon(fn), "#Zaytun");
    expect(t.tags.map((x) => x.tag)).toEqual(["zaytunology", "zaytun"]);   // prefix matches by popularity
    expect(r.questions.map((q) => Object.keys(q).sort())).toEqual([["id", "section", "snippet", "topic"]]);
  });

  it("questions respect RLS: premium only for premium users, inactive never", async () => {
    const snippets = async (runner) => (await search(runner, "الزيتونولوجيا")).questions.map((q) => q.snippet).sort();
    expect(await snippets((fn) => h.asAnon(fn))).toEqual(["سؤال عن الزيتونولوجيا المجانية"]);
    expect(await snippets((fn) => h.asUser(u, fn))).toEqual(["سؤال عن الزيتونولوجيا المجانية"]);
    expect(await snippets((fn) => h.asUser(premium, fn))).toEqual(["سؤال عن الزيتونولوجيا المجانية", "سؤال عن الزيتونولوجيا المميزة"]);
  });

  it("LIKE wildcards in the query are literal", async () => {
    expect((await search((fn) => h.asAnon(fn), "0%")).posts).toHaveLength(1);           // "100% sure…"
    expect((await search((fn) => h.asAnon(fn), "%%")).posts).toHaveLength(0);           // not "everything"
    expect((await search((fn) => h.asAnon(fn), "t_u")).posts).toHaveLength(0);          // _ is not "any char" ("about under")
    expect((await search((fn) => h.asAnon(fn), "r_sc")).posts).toHaveLength(1);         // "under_score"
  });

  it("respects p_limit and long snippets are windowed around the match", async () => {
    await h.sql(`insert into public.community_posts (user_id, content)
                 select $1, repeat('حشو ', 80) || 'كلمةنادرةجدا ' || g || repeat(' ذيل', 80) from generate_series(1, 4) g`, [u]);
    const r = await search((fn) => h.asAnon(fn), "كلمةنادرةجدا", 3);
    expect(r.posts).toHaveLength(3);
    for (const p of r.posts) {
      expect(p.snippet).toContain("كلمةنادرةجدا");
      expect(p.snippet.startsWith("…")).toBe(true);
      expect(p.snippet.endsWith("…")).toBe(true);
    }
  });

  it("trigram indexes exist and are usable for ILIKE '%…%'", async () => {
    const idx = await h.sql(`select indexname from pg_indexes where schemaname = 'public' and indexname like '%trgm%' order by 1`);
    expect(idx.map((r) => r.indexname)).toEqual([
      "community_posts_content_trgm_idx", "hashtags_tag_trgm_idx", "profiles_full_name_trgm_idx",
      "profiles_username_trgm_idx", "questions_stem_trgm_idx"]);
    const plan = await h.db.transaction(async (tx) => {
      await tx.exec("set local enable_seqscan = off");
      const res = await tx.query("explain select id from public.community_posts where content ilike '%zaytun%'");
      return res.rows.map((r) => r["QUERY PLAN"]).join("\n");
    });
    expect(plan).toContain("community_posts_content_trgm_idx");
  });
});

// ============================================================================
describe("ai_quota", () => {
  const quota = (uid) => asU(uid, "select public.ai_quota() r").then(one);
  const chat = (uid, type = "user") => asU(uid,
    "insert into public.chat_history (user_id, session_id, message_type, content) values ($1, 's1', $2, 'hi')", [uid, type]);

  it("new free user: 5 per rolling 8 h, nothing used", async () => {
    const u = await newUser();
    expect(await quota(u)).toEqual({ unlimited: false, limit: 5, used: 0, remaining: 5, resets_at: null, window_hours: 8, referral_bonus: false });
    await expect(asA("select public.ai_quota()")).rejects.toMatchObject(DENIED);
  });

  it("counts the caller's user messages only; deleting chat history does not refund them", async () => {
    const u = await newUser();
    const other = await newUser();
    for (let i = 0; i < 3; i++) await chat(u);
    await chat(u, "assistant");
    await chat(other);
    const q = await quota(u);
    expect(q).toMatchObject({ used: 3, remaining: 2 });
    const [first] = await h.sql("select min(created_at) t from public.ai_usage where user_id = $1", [u]);
    expect(new Date(q.resets_at).getTime()).toBe(new Date(first.t).getTime() + 8 * 3600_000);
    expect(await n(u, "delete from public.chat_history where user_id = $1", [u])).toBe(4);
    expect((await quota(u)).used).toBe(3);
    await expect(asU(u, "select * from public.ai_usage")).rejects.toMatchObject(DENIED);
    await expect(asU(u, "delete from public.ai_usage")).rejects.toMatchObject(DENIED);
  });

  it("exhaustion, the rolling window and resets_at", async () => {
    const u = await newUser();
    for (let i = 0; i < 6; i++) await chat(u);
    // spread: 2 messages 7 h ago, 4 recent
    await h.sql(`update public.ai_usage set created_at = now() - interval '7 hours'
                 where id in (select id from public.ai_usage where user_id = $1 order by id limit 2)`, [u]);
    const q = await quota(u);
    expect(q).toMatchObject({ used: 6, remaining: 0, limit: 5 });
    // 6 used, limit 5 → a slot frees when the 2nd-oldest leaves the window (7 h ago + 8 h)
    const [{ t }] = await h.sql("select (now() - interval '7 hours' + interval '8 hours') t");
    expect(Math.abs(new Date(q.resets_at) - new Date(t))).toBeLessThan(5000);
    await h.sql("update public.ai_usage set created_at = now() - interval '9 hours' where user_id = $1 and created_at < now() - interval '1 hour'", [u]);
    expect(await quota(u)).toMatchObject({ used: 4, remaining: 1 });
  });

  it("5+ referrals add the bonus; Elite is unlimited", async () => {
    const u = await newUser();
    for (let i = 0; i < 5; i++) {
      const friend = await newUser();
      await h.sql("insert into public.referrals (referrer_id, referred_id) values ($1, $2)", [u, friend]);
    }
    expect(await quota(u)).toMatchObject({ limit: 10, remaining: 10, referral_bonus: true });
    const p = await newUser();
    await makePremium(p);
    await chat(p);
    expect(await quota(p)).toEqual({ unlimited: true, limit: null, used: 1, remaining: null, resets_at: null, window_hours: 8, referral_bonus: false });
  });
});

// ============================================================================
describe("re-running 0010", () => {
  it("is idempotent and preserves data", async () => {
    const before = await h.sql("select (select count(*) from public.questions)::int q, (select count(*) from public.question_keys)::int k, (select count(*) from public.question_sources)::int s, (select count(*) from public.question_bank_counts)::int c");
    await h.exec(readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), "utf8"));
    await h.exec(readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), "utf8"));
    // Later migrations replace some 0010 signatures (0012: start_exam_attempt,
    // search_all, _exam_pick). Re-running 0010 alone re-creates the old ones,
    // so re-apply the rest of the chain in order — it must converge.
    for (const f of h.migrations.filter((m) => m > MIGRATION)) {
      await h.exec(readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"));
    }
    const overloads = await h.sql(
      `select proname, count(*)::int n from pg_proc
        where pronamespace = 'public'::regnamespace and proname in ('start_exam_attempt', 'search_all', '_exam_pick')
        group by proname order by proname`);
    expect(overloads.every((r) => r.n === 1)).toBe(true);
    const after = await h.sql("select (select count(*) from public.questions)::int q, (select count(*) from public.question_keys)::int k, (select count(*) from public.question_sources)::int s, (select count(*) from public.question_bank_counts)::int c");
    expect(after).toEqual(before);
    const [{ n: checks }] = await h.sql("select count(*)::int n from pg_constraint where conrelid = 'public.notifications'::regclass and contype = 'c'");
    expect(checks).toBe(1);
    const trig = await h.sql("select tgname from pg_trigger where tgrelid = 'public.notifications'::regclass and not tgisinternal order by 1");
    expect(trig.map((r) => r.tgname)).toEqual(expect.arrayContaining(["notifications_a_system_types_guard", "notifications_b_prefs_gate"]));
  });
});

// ============================================================================
// Client data layer (src/lib/data/*) ↔ database contract. A minimal PostgREST
// stand-in executes supabase.rpc(name, { p_*: … }) against PGlite with the
// caller's role, so parameter names, error mapping and payload shapes are
// verified end to end. Local practice mode goes through the real route handlers.
// ============================================================================
describe("client data layer against the database", () => {
  const signatures = new Map();
  async function signature(fn) {
    if (!signatures.has(fn)) {
      const rows = await h.sql(
        `select p.proargnames as names, p.proretset as retset,
                array(select format_type(t, null) from unnest(p.proargtypes::oid[]) with ordinality u(t, o) order by o) as types
           from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1`, [fn]);
      signatures.set(fn, rows[0] || null);
    }
    return signatures.get(fn);
  }
  function fakeSupabase(uid, { missing = [] } = {}) {
    return {
      auth: { getSession: async () => ({ data: { session: uid ? { user: { id: uid } } : null } }) },
      rpc(fn, args = {}) {
        const run = async () => {
          const sig = missing.includes(fn) ? null : await signature(fn);
          if (!sig) return { data: null, error: { code: "PGRST202", message: `Could not find the function public.${fn}`, details: null } };
          const parts = [];
          const params = [];
          for (const [k, v] of Object.entries(args)) {
            const i = (sig.names || []).indexOf(k);
            if (i < 0) return { data: null, error: { code: "PGRST202", message: `Could not find the function public.${fn}(${k})`, details: null } };
            params.push(v !== null && typeof v === "object" && sig.types[i] === "jsonb" ? JSON.stringify(v) : v);
            parts.push(`${k} => $${params.length}::${sig.types[i]}`);
          }
          const call = `public.${fn}(${parts.join(", ")})`;
          const q = sig.retset ? `select * from ${call}` : `select ${call} as r`;
          try {
            const rows = uid ? await h.asUser(uid, (tx) => tx.sql(q, params)) : await h.asAnon((tx) => tx.sql(q, params));
            return { data: sig.retset ? rows : rows[0].r, error: null };
          } catch (e) {
            return { data: null, error: { code: e.code, message: e.message, details: e.detail ?? null, hint: e.hint ?? null } };
          }
        };
        const promise = run();
        return { then: (ok, ko) => promise.then(ok, ko), abortSignal() { return this; } };
      },
    };
  }
  const as = (uid, opts) => { globalThis.__jzFakeSupabase = fakeSupabase(uid, opts); };
  const realFetch = globalThis.fetch;
  beforeAll(() => {
    globalThis.fetch = async (url, init) => {
      const route = String(url).endsWith("/start") ? localStartRoute : localGradeRoute;
      return route(new Request(new URL(url, "http://localhost"), init));
    };
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
    delete globalThis.__jzFakeSupabase;
  });

  it("exams (db mode): start → save → submit → review → history → stats", async () => {
    const u = await newUser();
    as(u);
    const s = await examsApi.startExam({ exam: "achievement", section: "chemistry", count: 5 });
    expect(s).toMatchObject({ mode: "db", status: "in_progress", question_count: 3 });
    const keys = await correctIndexes(s.questions.map((q) => q.id));
    const first = s.questions[0];
    await expect(examsApi.saveAnswer(s.attempt_id, 1, keys[first.id], { timeSpentSeconds: 9, flagged: true }))
      .resolves.toMatchObject({ mode: "db", selected_index: keys[first.id], flagged: true, time_spent_seconds: 9 });
    const g = await examsApi.getAttempt(s.attempt_id);
    expect(g).toMatchObject({ mode: "db", status: "in_progress" });
    const res = await examsApi.submitExam(s.attempt_id, [{ position: 2, selected_index: keys[s.questions[1].id] }]);
    expect(res).toMatchObject({ mode: "db", status: "submitted", attempt: { correct_count: 2, total: 3 } });
    expect(await examsApi.submitExam(s.attempt_id)).toEqual(res);
    const page = await examsApi.listAttempts({ limit: 1 });
    expect(page).toMatchObject({ mode: "db", items: [{ id: s.attempt_id, status: "submitted" }] });
    expect(page.nextCursor).toEqual({ before: page.items[0].started_at, beforeId: s.attempt_id });
    expect((await examsApi.listAttempts({ ...page.nextCursor, limit: 1 })).items).toEqual([]);
    expect(await examsApi.getExamStats()).toMatchObject({ mode: "db", completed_attempts: 1 });
  });

  it("exams: database errors become stable DataError codes with details", async () => {
    const u = await newUser();
    as(u);
    const bad = await examsApi.startExam({ exam: "achievement", count: 500 }).catch((e) => e);
    expect(examsApi.isDataError(bad)).toBe(true);
    expect(bad).toMatchObject({ code: "invalid_argument", details: { field: "count" } });
    expect(await examsApi.startExam({ exam: "achievement", count: 26 }).catch((e) => e.code)).toBe("premium_required");
    expect(await examsApi.getAttempt("00000000-0000-0000-0000-000000000000").catch((e) => e.code)).toBe("attempt_not_found");
    for (let i = 0; i < 5; i++) await examsApi.startExam({ exam: "achievement", section: "chemistry", count: 5 });
    const limit = await examsApi.startExam({ exam: "achievement", section: "chemistry", count: 5 }).catch((e) => e);
    expect(limit).toMatchObject({ code: "daily_limit_reached", details: { limit: 5, used: 5 } });
  });

  it("exams (local mode): guests practise through the local API; nothing is saved", async () => {
    as(null);
    const s = await examsApi.startExam({ exam: "aptitude", count: 25 });
    expect(s).toMatchObject({ mode: "local", status: "in_progress", limited: true });
    expect(s.attempt_id.startsWith("local-")).toBe(true);
    expect(s.questions.length).toBeLessThanOrEqual(LIMITS.guestMaxQuestions);
    expect(JSON.stringify(s)).not.toMatch(/correct_index|explanation|"answer"/);
    await examsApi.saveAnswer(s.attempt_id, 1, 0, { timeSpentSeconds: 4 });
    expect(await examsApi.saveAnswer(s.attempt_id, 99, 0).catch((e) => e.code)).toBe("invalid_argument");
    const g = await examsApi.getAttempt(s.attempt_id);
    expect(g).toMatchObject({ mode: "local", status: "in_progress" });
    expect(g.answers[0]).toMatchObject({ position: 1, selected_index: 0, time_spent_seconds: 4 });
    const res = await examsApi.submitExam(s.attempt_id);
    expect(res).toMatchObject({ mode: "local", status: "submitted", attempt: { total: s.question_count, xp_awarded: 0 } });
    expect(res.items[0]).toMatchObject({ position: 1, selected_index: 0 });
    expect(typeof res.items[0].correct_index).toBe("number");
    expect(await examsApi.submitExam(s.attempt_id)).toBe(res);
    expect(await examsApi.saveAnswer(s.attempt_id, 2, 0).catch((e) => e.code)).toBe("attempt_closed");
    expect(await examsApi.listAttempts()).toEqual({ mode: "local", items: [], nextCursor: null });
    expect(await examsApi.getExamStats()).toEqual({ mode: "local" });
    expect(await examsApi.getBankStats()).toMatchObject({ mode: "db", available: true });   // public counts work signed out
  });

  it("exams: signed in but the RPCs are not deployed → local mode", async () => {
    const u = await newUser();
    as(u, { missing: ["start_exam_attempt", "list_exam_attempts", "get_exam_stats", "get_question_bank_stats"] });
    expect((await examsApi.startExam({ exam: "aptitude", count: 5 })).mode).toBe("local");
    expect((await examsApi.listAttempts()).mode).toBe("local");
    expect(await examsApi.getExamStats()).toEqual({ mode: "local" });
    expect(await examsApi.getBankStats()).toEqual({ mode: "local", available: false });
  });

  it("notifications: pages, normalised actors, mark read, unread count", async () => {
    const owner = await newUser({ full_name: "Feed Owner" });
    const actor = await newUser({ full_name: "Feed Actor" });
    const [{ id: postId }] = await asU(owner, "insert into public.community_posts (user_id, content) values ($1, 'hello feed') returning id", [owner]);
    await asU(actor, "insert into public.post_likes (post_id, user_id) values ($1, $2)", [postId, actor]);
    await h.sql("insert into public.notifications (user_id, type) select $1, 'system' from generate_series(1, 3)", [owner]);
    as(owner);
    const p1 = await notificationsApi.listNotifications({ limit: 2 });
    expect(p1.items).toHaveLength(2);
    expect(p1.nextCursor).not.toBeNull();
    const p2 = await notificationsApi.listNotifications({ limit: 2, ...p1.nextCursor });
    const all = [...p1.items, ...p2.items];
    expect(all).toHaveLength(4);
    const like = all.find((x) => x.type === "like");
    expect(like).toMatchObject({ read: false, post_id: postId, post_snippet: "hello feed",
      actor: { id: actor, full_name: "Feed Actor", anonymous: false, is_elite: false, show_elite_badge: true } });
    expect(all.find((x) => x.type === "system").actor).toBeNull();
    expect(await notificationsApi.getUnreadCount()).toBe(4);
    expect(await notificationsApi.markNotificationsRead([like.id])).toBe(1);
    expect(await notificationsApi.markNotificationsRead([])).toBe(0);
    expect(await notificationsApi.markAllNotificationsRead()).toBe(3);
    expect(await notificationsApi.getUnreadCount()).toBe(0);
    await expect(notificationsApi.markNotificationsRead("x")).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(notificationsApi.updateNotificationPreferences({ likes: "no" })).rejects.toMatchObject({ code: "invalid_argument" });
    as(null);
    expect(await notificationsApi.listNotifications()).toEqual({ items: [], nextCursor: null, available: true });
    expect(await notificationsApi.getUnreadCount()).toBe(0);
  });

  it("search: results, short queries, cache and a debounced searcher that drops stale requests", async () => {
    as(null);
    searchApi.clearSearchCache();
    const r = await searchApi.searchAll("  الزيتونولوجيا  ");
    expect(r.query).toBe("الزيتونولوجيا");
    expect(r.available).toBe(true);
    expect(r.posts.length).toBeGreaterThan(0);
    expect(await searchApi.searchAll("الزيتونولوجيا")).toBe(r);            // LRU hit
    expect(await searchApi.searchAll("z")).toMatchObject({ people: [], posts: [], tags: [], questions: [] });
    const s = searchApi.createSearcher({ delay: 20 });
    const stale = s.search("zaytun").catch((e) => e.code);
    const fresh = s.search("zaytuna");
    expect(await stale).toBe("aborted");
    expect((await fresh).people.map((p) => p.full_name)).toContain("Zaytuna Searcher");
    as(null, { missing: ["search_all"] });
    searchApi.clearSearchCache();
    expect(await searchApi.searchAll("zaytuna")).toMatchObject({ available: false, people: [] });
  });

  it("search helpers: LRU eviction/TTL and debounce", async () => {
    let t = 0;
    const lru = searchApi.createLruCache(2, 100, () => t);
    lru.set("a", 1);
    lru.set("b", 2);
    lru.get("a");
    lru.set("c", 3);
    expect([lru.get("a"), lru.get("b"), lru.get("c")]).toEqual([1, undefined, 3]);
    t = 500;
    expect(lru.get("a")).toBeUndefined();
    const calls = [];
    const d = searchApi.debounce((x) => calls.push(x), 10);
    d(1);
    d(2);
    d(3);
    await new Promise((r) => setTimeout(r, 30));
    d(4);
    d.cancel();
    await new Promise((r) => setTimeout(r, 30));
    expect(calls).toEqual([3]);
  });

  it("ai quota: signed in → quota object; signed out → null", async () => {
    const u = await newUser();
    as(u);
    expect(await getAiQuota()).toMatchObject({ unlimited: false, limit: 5, used: 0, remaining: 5 });
    as(null);
    expect(await getAiQuota()).toBeNull();
    as(u, { missing: ["ai_quota"] });
    expect(await getAiQuota()).toBeNull();
  });
});

// ============================================================================
// POST /api/chat — server-side quota (ai_quota) before the model is contacted,
// neutral user-visible wording (no provider/model names).
// ============================================================================
describe("POST /api/chat quota enforcement", () => {
  const ENV_KEY = "GEMINI_API_KEY";
  let savedKey;
  beforeAll(() => {
    savedKey = process.env[ENV_KEY];
    process.env[ENV_KEY] = "placeholder-not-a-real-key";   // the SDK is mocked; nothing leaves the process
  });
  afterAll(() => {
    if (savedKey === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = savedKey;
    delete globalThis.__jzFakeServer;
  });

  function serverClient(uid, { rpcError = null } = {}) {
    const inserted = [];
    return {
      inserted,
      auth: { getUser: async () => ({ data: { user: uid ? { id: uid } : null } }) },
      // rpc(name, { p_*: text | uuid }) as the user (ai_consume / ai_finish / ai_quota)
      rpc: async (fn, args = {}) => {
        if (rpcError) return { data: null, error: rpcError };
        const keys = Object.keys(args);
        const call = `public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}${k === "p_ticket" ? "::uuid" : "::text"}`).join(", ")})`;
        try {
          const [row] = await h.asUser(uid, (tx) => tx.sql(`select ${call} as r`, keys.map((k) => args[k])));
          return { data: row.r, error: null };
        } catch (e) {
          return { data: null, error: { code: e.code, message: e.message } };
        }
      },
      from: (table) => ({ insert: async (row) => { inserted.push({ table, row }); return { error: null }; } }),
    };
  }
  const call = (headers = {}, body = { messages: [{ role: "user", content: "مرحبا" }], sessionId: "s-1" }) =>
    chatRoute(new Request("http://localhost/api/chat", {
      method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
    }));
  const chat = (uid) => asU(uid, "insert into public.chat_history (user_id, session_id, message_type, content) values ($1, 's', 'user', 'x')", [uid]);

  it("exhausted free quota → 429 with a localized, provider-neutral message and quota headers", async () => {
    const u = await newUser();
    for (let i = 0; i < 5; i++) await chat(u);
    const client = serverClient(u);
    globalThis.__jzFakeServer = client;

    const ar = await call();
    expect(ar.status).toBe(429);
    const arText = await ar.text();
    expect(arText).toContain("باقة النخبة");
    expect(arText).not.toMatch(/gemini|google/i);
    expect(ar.headers.get("x-error-code")).toBe("ai_quota_exhausted");
    expect(ar.headers.get("x-quota-limit")).toBe("5");
    expect(ar.headers.get("x-quota-remaining")).toBe("0");
    expect(Number(ar.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(new Date(ar.headers.get("x-quota-reset")).getTime()).toBeGreaterThan(Date.now());

    const en = await call({ cookie: "NEXT_LOCALE=en" });
    expect(en.status).toBe(429);
    expect(await en.text()).toMatch(/free limit for the assistant \(5 messages every 8 hours\)/);
    const viaBody = await call({}, { messages: [{ role: "user", content: "hi" }], locale: "en" });
    expect(await viaBody.text()).toMatch(/^You've reached/);
    expect(client.inserted).toEqual([]);            // nothing stored, model never reached
  });

  it("within quota the request proceeds to the model (after ai_consume stored + charged the message)", async () => {
    const u = await newUser();
    const client = serverClient(u);
    globalThis.__jzFakeServer = client;
    await expect(call()).rejects.toThrow("model_contacted");
    expect(client.inserted).toEqual([]);                                  // no direct table writes (0013)
    expect(await h.sql("select message_type, session_id from public.chat_history where user_id = $1", [u]))
      .toEqual([{ message_type: "user", session_id: "s-1" }]);
    expect((await h.asUser(u, (tx) => tx.sql("select public.ai_quota() as r")))[0].r.used).toBe(1);
  });

  it("quota lookup failures fail closed: not deployed or other errors → 503 (neutral text), model never reached", async () => {
    const u = await newUser();
    globalThis.__jzFakeServer = serverClient(u, { rpcError: { code: "PGRST202", message: "Could not find the function" } });
    expect((await call()).status).toBe(503);
    globalThis.__jzFakeServer = serverClient(u, { rpcError: { code: "XX000", message: "boom" } });
    const res = await call({ cookie: "NEXT_LOCALE=en" });
    expect(res.status).toBe(503);
    expect(await res.text()).toBe("The assistant is unavailable right now. Please try again shortly.");
  });

  it("missing key / no Supabase / signed out: neutral messages, never provider names", async () => {
    const u = await newUser();
    globalThis.__jzFakeServer = serverClient(u);
    delete process.env[ENV_KEY];
    const saved = process.env.GOOGLE_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    try {
      const res = await call();
      expect(res.status).toBe(503);
      expect(await res.text()).not.toMatch(/gemini|google|GEMINI_API_KEY/i);
    } finally {
      process.env[ENV_KEY] = "placeholder-not-a-real-key";
      if (saved !== undefined) process.env.GOOGLE_API_KEY = saved;
    }
    globalThis.__jzFakeServer = null;
    expect((await call()).status).toBe(503);
    globalThis.__jzFakeServer = serverClient(null);
    expect((await call()).status).toBe(401);
    expect((await call({ origin: "https://evil.example" })).status).toBe(403);
  });
});
