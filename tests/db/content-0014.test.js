// ============================================================================
// 0014_content_engine.sql — schema, RLS and grants, normalization v2, the
// SQL grader and the SQL selection engine against the shared JS fixtures
// (docs/CONTENT_ENGINE.md §5, §6.1, Appendix A, WP7 acceptance).
// ============================================================================
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MIGRATIONS_DIR, REPO_ROOT, createDb } from "./harness.js";
import { searchNormalize } from "../../src/lib/content/normalize.js";
import { canonicalAnswer, gradeResponse, parseNumber } from "../../src/lib/content/answers.js";
import { contentHash, mintQuestionId, questionIdHash } from "../../src/lib/content/ids.js";
import { TEMPLATES, getTemplate, planCount, planTiming } from "../../src/lib/exams/engine/exam-templates.js";
import { displayMaps } from "../../src/lib/exams/engine/shuffle.js";
import { u } from "../../src/lib/content/prng.js";

const fx = (p) => JSON.parse(readFileSync(path.join(REPO_ROOT, "tests/fixtures", p), "utf8"));
const MIGRATION = "0014_content_engine.sql";
const DENIED = { code: "42501" };

let h;
beforeAll(async () => {
  h = await createDb();
});
afterAll(async () => {
  await h?.close();
});

const asU = (uid, sql, params) => h.asUser(uid, (tx) => tx.sql(sql, params));
const asA = (sql, params) => h.asAnon((tx) => tx.sql(sql, params));
const asS = (sql, params) => h.asService((tx) => tx.sql(sql, params));
const one = (rows) => rows[0].r;

const NEW_TABLES = [
  "content_sources", "curriculum_nodes", "subject_terms", "curriculum_resources", "lesson_resource_ranges",
  "learning_objectives", "question_stimuli", "question_curriculum", "exam_templates", "scope_pool_counts",
  "scope_pool_members", "learner_question_stats", "learner_node_stats", "question_item_stats",
  "content_import_runs", "content_import_batches", "content_import_errors", "question_revisions",
];
const AUTH_RPCS = [
  "start_template_attempt(text, text, int, text, text, uuid, text)", "save_exam_response(uuid, smallint, jsonb, int, boolean)",
  "check_exam_item(uuid, smallint)", "abandon_exam_attempt(uuid)", "list_exam_attempts_v2(int, timestamptz, uuid)",
  "get_learning_stats(text)", "get_practice_recommendations(int)", "search_content(text, text[], text, int, int, boolean)",
];
const SERVICE_RPCS = [
  "ce_import_begin(jsonb)", "ce_import_batch(uuid, text, int, jsonb)", "ce_import_retire(uuid, text[])",
  "ce_import_finish(uuid)", "ce_refresh_aggregates()", "ce_guest_start(text, text, text, text[], int)",
  "ce_guest_items(text[], boolean)",
];

// ============================================================================
describe("0014 schema, RLS and grants", () => {
  it("applies on top of 0000–0013 and every new table has RLS", async () => {
    expect(h.migrations).toContain(MIGRATION);
    const rows = await h.sql("select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname = any($1)", [NEW_TABLES]);
    expect(rows).toHaveLength(NEW_TABLES.length);
    for (const r of rows) expect(r.relrowsecurity, r.relname).toBe(true);
    const noRls = await h.sql("select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity");
    expect(noRls).toEqual([]);
  });

  it("every SECURITY DEFINER function of 0014 runs with search_path ''", async () => {
    const rows = await h.sql(`select p.proname, p.proconfig from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.prosecdef
        and (p.proname like 'ce\\_%' or p.proname like '\\_ce\\_%' or p.proname = any($1))`,
    [["start_template_attempt", "save_exam_response", "check_exam_item", "abandon_exam_attempt", "list_exam_attempts_v2",
      "get_learning_stats", "get_practice_recommendations", "get_scope_availability", "search_content",
      "submit_exam_attempt", "get_exam_attempt", "start_exam_attempt"]]);
    expect(rows.length).toBeGreaterThanOrEqual(19);
    for (const r of rows) expect(r.proconfig, r.proname).toContain('search_path=""');
    const all = await h.sql("select p.proname, p.proconfig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef");
    for (const r of all) expect((r.proconfig ?? []).some((c) => c.startsWith("search_path=")), r.proname).toBe(true);
  });

  it("anon cannot execute the authenticated RPCs; clients cannot execute service RPCs or helpers", async () => {
    for (const fn of AUTH_RPCS) {
      const [{ a, u, s }] = await h.sql(`select has_function_privilege('anon', 'public.${fn}', 'execute') a,
        has_function_privilege('authenticated', 'public.${fn}', 'execute') u, has_function_privilege('service_role', 'public.${fn}', 'execute') s`);
      expect({ fn, a, u, s }).toEqual({ fn, a: false, u: true, s: true });
    }
    for (const fn of SERVICE_RPCS) {
      const [{ a, u, s }] = await h.sql(`select has_function_privilege('anon', 'public.${fn}', 'execute') a,
        has_function_privilege('authenticated', 'public.${fn}', 'execute') u, has_function_privilege('service_role', 'public.${fn}', 'execute') s`);
      expect({ fn, a, u, s }).toEqual({ fn, a: false, u: false, s: true });
    }
    const [{ a }] = await h.sql("select has_function_privilege('anon', 'public.get_scope_availability(text)', 'execute') a");
    expect(a).toBe(true);
    const helpers = await h.sql(`select p.oid::regprocedure::text sig from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.proname like '\\_ce\\_%'`);
    expect(helpers.length).toBeGreaterThan(40);
    for (const { sig } of helpers) {
      const [{ a: an, u: au }] = await h.sql("select has_function_privilege('anon', $1, 'execute') a, has_function_privilege('authenticated', $1, 'execute') u", [sig]);
      expect({ sig, an, au }).toEqual({ sig, an: sig.startsWith("_ce_pre_nfkc"), au: sig.startsWith("_ce_pre_nfkc") });
    }
    await expect(asA("select public.start_template_attempt('chapter-quiz', 'middle/grade-1/math/n91')")).rejects.toMatchObject(DENIED);
    const u = await h.createUser();
    await expect(asU(u, "select public.ce_refresh_aggregates()")).rejects.toMatchObject(DENIED);
    await expect(asU(u, "select public._ce_u('a', 'b', 'c')")).rejects.toMatchObject(DENIED);
  });

  it("the school bank is not readable through PostgREST and hidden columns are not granted", async () => {
    await h.exec(`insert into public.curriculum_nodes (id, parent_id, kind, ord, title_ar, status) values
      ('zz', null, 'stage', 1, 'مرحلة', 'verified'), ('zz/g1', 'zz', 'grade', 1, 'صف', 'verified'),
      ('zz/g1/s', 'zz/g1', 'subject', 1, 'مادة', 'verified'), ('zz/g1/s/n1', 'zz/g1/s', 'lesson', 1, 'درس', 'verified')
      on conflict do nothing;
      insert into public.questions (key, exam, section, topic, difficulty, stem, choices, question_type, lesson_node_id, import_origin, content_hash)
      values ('zz-school-1', 'school', 'zz/g1/s', 'zz/g1/s/n1', 1, 'سؤال؟', '["أ","ب"]', 'mcq', 'zz/g1/s/n1', 'staging',
              'n2:sha256:${"a".repeat(64)}') on conflict do nothing;`);
    const u = await h.createUser();
    expect(await asA("select key from public.questions where exam = 'school'")).toEqual([]);
    expect(await asU(u, "select key from public.questions where exam = 'school'")).toEqual([]);
    for (const col of ["content_hash", "exclusion_group", "provenance", "validation_status", "import_origin", "revision", "source_resource_id", "stem_norm"]) {
      await expect(asA(`select ${col} from public.questions limit 1`), col).rejects.toMatchObject(DENIED);
      await expect(asU(u, `select ${col} from public.questions limit 1`), col).rejects.toMatchObject(DENIED);
    }
    const ok = await asA("select id, key, question_type, payload_public, difficulty_level, lesson_node_id from public.questions limit 1");
    expect(ok.length).toBe(1);
    for (const col of ["choice_order", "display_map", "response"]) {
      await expect(asU(u, `select ${col} from public.exam_attempt_items limit 1`), col).rejects.toMatchObject(DENIED);
    }
    for (const t of ["question_stimuli", "question_curriculum", "scope_pool_members", "question_item_stats", "content_import_runs", "question_revisions", "question_keys"]) {
      await expect(asA(`select 1 from public.${t} limit 1`), t).rejects.toMatchObject(DENIED);
      await expect(asU(u, `select 1 from public.${t} limit 1`), t).rejects.toMatchObject(DENIED);
    }
  });

  it("clients cannot write the learner statistics or any content table", async () => {
    const u = await h.createUser();
    const [{ id: qid }] = await h.sql("select id from public.questions limit 1");
    await expect(asU(u, "insert into public.learner_question_stats (user_id, question_id, seen_count) values ($1, $2, 99)", [u, qid])).rejects.toMatchObject(DENIED);
    await expect(asU(u, "insert into public.learner_node_stats (user_id, node_id, answered) values ($1, 'x', 99)", [u])).rejects.toMatchObject(DENIED);
    await expect(asU(u, "update public.learner_node_stats set correct = 99")).rejects.toMatchObject(DENIED);
    await expect(asU(u, "delete from public.learner_question_stats")).rejects.toMatchObject(DENIED);
    await expect(asU(u, "insert into public.curriculum_nodes (id, kind, title_ar, status) values ('evil', 'stage', 'x', 'verified')")).rejects.toMatchObject(DENIED);
    await expect(asU(u, "update public.exam_attempt_items set score = 1")).rejects.toMatchObject(DENIED);
    await expect(asA("insert into public.exam_templates (id, version, kind, definition) values ('x', 1, 'lesson', '{}')")).rejects.toMatchObject(DENIED);
  });

  it("question_revisions is append-only", async () => {
    const [{ id }] = await h.sql("select id from public.questions where key = 'zz-school-1'");
    await h.sql("insert into public.question_revisions (question_id, revision, question_type, language, stem) values ($1, 1, 'mcq', 'ar', 's')", [id]);
    await expect(h.sql("update public.question_revisions set stem = 'x' where question_id = $1", [id])).rejects.toThrow(/append_only/);
    await expect(h.sql("delete from public.question_revisions where question_id = $1", [id])).rejects.toThrow(/append_only/);
  });

  it("re-running 0014 (and 0012, 0013 before it) converges", async () => {
    const before = await h.sql("select (select count(*) from public.questions)::int q, (select count(*) from public.curriculum_nodes)::int n");
    const read = (f) => readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
    await h.exec(read(MIGRATION));
    await h.exec(read("0012_privacy_topics_analytics_search.sql"));
    await h.exec(read("0013_abuse_limits_payments_privacy.sql"));
    await h.exec(read(MIGRATION));
    const overloads = await h.sql(`select proname, count(*)::int n from pg_proc where pronamespace = 'public'::regnamespace
      and proname in ('start_template_attempt', 'save_exam_response', 'check_exam_item', 'submit_exam_attempt', 'get_exam_attempt',
                      'start_exam_attempt', '_exam_finalize', 'search_content', 'ce_guest_start', 'search_normalize_v2')
      group by proname order by proname`);
    expect(overloads).toHaveLength(10);
    for (const r of overloads) expect(r.n, r.proname).toBe(1);
    expect(await h.sql("select (select count(*) from public.questions)::int q, (select count(*) from public.curriculum_nodes)::int n")).toEqual(before);
    expect(await asA("select key from public.questions where exam = 'school'")).toEqual([]);
    await expect(asA("select content_hash from public.questions limit 1")).rejects.toMatchObject(DENIED);
  });
});

// ============================================================================
describe("normalization v2 (Appendix A): search_normalize_v2 = normalize.js", () => {
  const CASES = [
    "x² + y³ = z⁴", "10⁻³", "2½ كوب", "¼ + ¾", "⅓ من ⅔", "ﻻ إله", "ﷺ", "１２３ ABC", "Ｘ²", "ﬁne",
    "مُحَمَّدٌ", "الـــعـــلـــم", "أحمد إبراهيم آمن ٱلله", "مستشفى على", "رئيس یا", "مؤمن", "مدرسة", "کتاب",
    "٣٫٥ + ٤", "۱۲۳۴", "٠١٢", "HeLLo WORLD", "ΣΊΣΥΦΟΣ", "a‏b‫c⁧d​",
    "مرحبا، كيف حالك؟ (جيد)! «نعم» \"x\" 'y': ؛ z?", "3.5", "1,250", "12,345,678", "a.b", "3. 5", ".5", "5.",
    "٫٥", "٣٫", "  spaced \t\n out  ", "", "ـ", "(أ) و(ب)", "لا شيء مما سبق", "0,125", "٢٬٥٠٠", "x²y⁻¹", "½½",
  ];
  it("gives the same string as the JS twin on every case", async () => {
    for (const c of CASES) {
      const [{ r }] = await h.sql("select public.search_normalize_v2($1) r", [c]);
      expect(r, JSON.stringify(c)).toBe(searchNormalize(c));
    }
  });
  it("superscripts are mapped before NFKC (x² ≠ x2) and v1 is untouched", async () => {
    const [{ a, b, v1 }] = await h.sql("select public.search_normalize_v2('x²') a, public.search_normalize_v2('x2') b, public.search_normalize('x²') v1");
    expect(a).toBe("x^2");
    expect(b).toBe("x2");
    expect(typeof v1).toBe("string");
  });
});

// ============================================================================
describe("SQL grading = answers.js (grading-cases.json)", () => {
  const { cases } = fx("content/grading-cases.json");
  it("every shared grading case", async () => {
    expect(cases.length).toBeGreaterThan(40);
    for (const c of cases) {
      const [{ r }] = await h.sql("select public._ce_grade_full($1, $2::jsonb, null, $3::jsonb) r",
        [c.type, JSON.stringify(c.payload), c.response === null ? null : JSON.stringify(c.response)]);
      expect(r, c.id).toEqual(c.expected);
      expect(gradeResponse(c.type, c.payload, c.response), c.id).toEqual(c.expected);
    }
  });

  it("short answers agree in JS and SQL on punctuation / NFKC / digit / mark variants", async () => {
    const payload = { accepted: ["الماء", "H₂O", "٣٫٥ متر", "Newton's law"], match: "normalized_exact", max_chars: 40, answer_display: "الماء" };
    const responses = ["الماءُ", " الماء. ", "(الماء)", "H2O", "h₂o", "3.5 متر", "٣.٥ متر", "newtons law", "Newton's law!", "الما", "", "ﺍﻟﻤﺎﺀ", "الماء؟"];
    for (const text of responses) {
      const [{ r }] = await h.sql("select public._ce_grade_full('short_answer', $1::jsonb, null, $2::jsonb) r", [JSON.stringify(payload), JSON.stringify({ text })]);
      expect(r, text).toEqual(gradeResponse("short_answer", payload, { text }));
    }
    // accepted_norm stored by the importer (computed in SQL) wins and gives the same verdicts
    const [{ norm }] = await h.sql("select array(select public.search_normalize_v2(x) from jsonb_array_elements_text($1::jsonb) x) norm", [JSON.stringify(payload.accepted)]);
    for (const text of responses) {
      const [{ r }] = await h.sql("select public._ce_grade_full('short_answer', $1::jsonb, $2::text[], $3::jsonb) r", [JSON.stringify(payload), norm, JSON.stringify({ text })]);
      expect(r, text).toEqual(gradeResponse("short_answer", payload, { text }));
    }
  });

  it("parseNumber agrees on separators (1,250 · 2,5 · 0,125 · ٣٫٥ · 1/4)", async () => {
    for (const v of ["1,250", "2,5", "0,125", "٣٫٥", "1/4", "-3", "12,345,678", "1,2345", "½", "10²", "٢٬٥٠٠", "1.5,0"]) {
      const [{ r }] = await h.sql("select public._ce_parse_number(to_jsonb($1::text)) r", [v]);
      const js = parseNumber(v);
      expect(r.ok, v).toBe(js.ok);
      if (js.ok) expect(Number(r.num) / Number(r.den), v).toBeCloseTo(Number(js.value.n) / Number(js.value.d), 12);
      else expect(r.reason, v).toBe(js.reason);
    }
  });
});

// ============================================================================
describe("SQL selection = the JS engine (tests/fixtures/engine)", () => {
  it("u() is SHA-256 counter-mode (§5.2)", async () => {
    const [{ r }] = await h.sql("select public._ce_u('0123456789abcdef0123456789abcdef', 'sel', 'q-1') r");
    expect(Number(r)).toBe(u("0123456789abcdef0123456789abcdef", "sel", "q-1"));
  });

  it("allocations.json", async () => {
    for (const c of fx("engine/allocations.json").cases) {
      const cu = c.strata.flatMap((s) => [1, 2, 3].map((b) => s.cap[b]?.unseen ?? 0));
      const cs = c.strata.flatMap((s) => [1, 2, 3].map((b) => s.cap[b]?.seen ?? 0));
      const [{ r }] = await h.sql("select public._ce_allocate($1::int, $2::int[], $3::text[], $4::bigint[], $5::int[], $6::int[], $7, $8::int, $9::boolean, $10::int) r",
        [c.n, [c.mix.easy, c.mix.medium, c.mix.hard], c.strata.map((s) => s.id), c.strata.map((s) => s.weight), cu, cs, c.seed, c.min_per_stratum, c.allow_reuse, c.max_reuse_share]);
      expect({ targets: r.targets, cells: r.cells, placed: r.placed, reused: r.reused, lower_bound: r.lower_bound, prepass: r.prepass }, c.name).toEqual(c.expected);
    }
  });

  it("retake-allocations.json (the stored per-cell quotas are reused)", async () => {
    for (const c of fx("engine/retake-allocations.json").cases) {
      const cu = c.strata.flatMap((s) => [1, 2, 3].map((b) => s.cap[b]?.unseen ?? 0));
      const cs = c.strata.flatMap((s) => [1, 2, 3].map((b) => s.cap[b]?.seen ?? 0));
      const [{ r }] = await h.sql("select public._ce_retake_allocation($1::jsonb, $2::text[], $3::int[], $4::int[], $5, $6::boolean, $7::int) r",
        [JSON.stringify(c.stored), c.strata.map((s) => s.id), cu, cs, c.seed, c.allow_reuse, c.max_reuse_share]);
      expect({ n: r.n, cells: r.cells, placed: r.placed, reused: r.reused }, c.name).toEqual(c.expected);
    }
  });

  it("selections.json (pools × histories × seeds, retakes, weakness review)", async () => {
    const pools = fx("engine/pools.json").pools;
    const hist = fx("engine/histories.json").histories;
    const templateOf = (t) => (typeof t === "string" ? getTemplate(t) : { ...JSON.parse(JSON.stringify(getTemplate(t.base))), ...t.overrides });
    const cases = fx("engine/selections.json").cases;
    expect(cases.length).toBeGreaterThan(10);
    for (const c of cases) {
      const hh = hist[c.history];
      const [{ r }] = await h.sql("select public._ce_select($1::jsonb, $2::int, $3::int, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, null, $9::bigint, false) r",
        [JSON.stringify(templateOf(c.template)), c.n, c.min_required, c.seed, JSON.stringify(pools[c.pool]), JSON.stringify(hh.seen),
          JSON.stringify(hh.wrong), c.retake ? JSON.stringify(c.retake) : null, hh.now]);
      const got = !c.expected.ok
        ? { ok: r.ok, error: r.error, available: r.available ?? null, required: r.required ?? null }
        : { ok: true, keys: r.keys, stored: r.stored, reused: r.reused, reused_count: r.reused_count, short: r.short, lower_bound: r.lower_bound };
      expect(got, c.name).toEqual(c.expected);
      if (r.ok) expect(new Set(r.keys).size, c.name).toBe(r.keys.length);
    }
  });

  it("permutations.json (safe option shuffling, §5.4)", async () => {
    const content = new Map();
    for (const f of ["c/middle_grade-1_math-01.json", "c/aptitude_verbal-01.json", "c/middle_grade-1_science-01.json"]) {
      for (const it of fx(`engine/runtime-bank/${f}`).items) content.set(it.key, it);
    }
    for (const c of fx("engine/permutations.json").cases) {
      const it = content.get(c.key);
      const t = getTemplate(c.template);
      const [{ r }] = await h.sql("select public._ce_display_maps($1, $2, $3, $4::jsonb, $5::boolean, $6, $7, $8::boolean, $9::jsonb) r",
        [c.seed, it.key, it.type, JSON.stringify(it.public), it.shuffle_options, it.fixed_order_reason, it.topic, t.randomization.option_shuffle,
          c.answer_order ? JSON.stringify(c.answer_order) : null]);
      expect(r, c.key).toEqual(c.expected);
      expect(r, c.key).toEqual(displayMaps(c.seed, it, { template: t, answerOrder: c.answer_order }));
    }
  });

  it("tier clamping and timing equal planCount / planTiming for every template × tier", async () => {
    for (const t of TEMPLATES) {
      for (const tier of ["guest", "free", "premium"]) {
        for (const req of [null, t.count.min, t.count.default, t.count.max, t.count.max + 1, 0]) {
          const [{ r }] = await h.sql("select public._ce_plan_count($1::jsonb, $2, $3::int) r", [JSON.stringify(t), tier, req]);
          const js = planCount(t, tier, req);
          const want = js.ok
            ? { ok: true, n: js.n, mini: js.mini, limited: js.limited, requested: js.requested, min_required: js.min_required }
            : { ok: false, error: js.error, ...(js.field ? { field: js.field } : {}) };
          expect(r, `${t.id} ${tier} ${req}`).toEqual(want);
        }
      }
      for (const mode of [null, "timed", "untimed"]) {
        for (const n of [1, t.count.default, t.count.max]) {
          const [{ r }] = await h.sql("select public._ce_plan_timing($1::jsonb, $2::int, $3) r", [JSON.stringify(t), n, mode]);
          const js = planTiming(t, n, mode);
          expect(r, `${t.id} ${mode} ${n}`).toEqual(js.ok ? { ok: true, mode: js.mode, seconds: js.seconds, grace_seconds: js.grace_seconds } : { ok: false, error: js.error, field: js.field });
        }
      }
    }
    const [{ r }] = await h.sql("select public._ce_plan_count($1::jsonb, 'free', null) r", [JSON.stringify(getTemplate("full-year"))]);
    expect(r).toMatchObject({ ok: true, n: 25, mini: true }); // free full year = the 25-question mini version
  });
});

// ============================================================================
describe("attack: an answer is not derivable from anon-readable question columns", () => {
  it("brute force over every candidate answer finds no match in any granted column", async () => {
    const q = {
      schema: "question@1", id: "av-990", question_type: "mcq", language: "ar", stem: "ليل : نهار",
      payload: { options: [{ id: "oa1b2c3", text: "حار : بارد" }, { id: "od4e5f6", text: "كبير : ضخم" }, { id: "o0a0b0c", text: "سريع : عاجل" }], answer: { option_id: "oa1b2c3" }, fixed_order_reason: null },
    };
    const hash = contentHash(q);
    const [{ id }] = await h.sql(`insert into public.questions (key, exam, section, topic, difficulty, stem, choices, question_type, payload_public, content_hash, import_origin)
      values ('av-990', 'aptitude', 'verbal', 'analogy', 1, $1, $2::jsonb, 'mcq', public._ce_public_payload('mcq', $3::jsonb), $4, 'staging') returning id`,
    [q.stem, JSON.stringify(q.payload.options.map((o) => o.text)), JSON.stringify(q.payload), hash]);
    await h.sql("insert into public.question_keys (question_id, correct_index, explanation, answer) values ($1, 0, 'x', $2::jsonb)", [id, JSON.stringify(q.payload)]);
    const cols = (await h.sql(`select column_name from information_schema.column_privileges
      where table_schema = 'public' and table_name = 'questions' and grantee = 'anon' and privilege_type = 'SELECT'`)).map((r) => r.column_name);
    expect(cols).not.toContain("content_hash");
    // staging rows are served only through RPCs (their keys are answer-derived); a legacy-origin
    // row with the same content stays readable and must not leak the hash either
    expect(await asA("select key from public.questions where key = 'av-990'")).toEqual([]);
    await h.sql("update public.questions set import_origin = 'legacy_seed' where key = 'av-990'");
    const [row] = await asA(`select ${cols.join(", ")} from public.questions where key = 'av-990'`);
    expect(row).toBeTruthy();
    const visible = JSON.stringify(row);
    const candidates = q.payload.options.map((o) => contentHash({ ...q, payload: { ...q.payload, answer: { option_id: o.id } } }));
    expect(candidates).toContain(hash);
    for (const c of candidates) expect(visible.includes(c.split(":").pop())).toBe(false);
    expect(visible).not.toMatch(/sha256|"answer"|accepted/);
  });

  it("a staging key never reaches a client role (even one minted from the answer by an older id rule)", async () => {
    const payload = { options: [{ id: "o1a2b3c", text: "٣٢" }, { id: "o4d5e6f", text: "٢٣" }, { id: "o7a8b9c", text: "٥" }], answer: { option_id: "o4d5e6f" }, fixed_order_reason: null };
    const stem = "ما ناتج ٢٠ + ٣؟";
    const [{ ok: topicOk }] = await h.sql("select 'arithmetic' = any (public.exam_section_topics('quantitative')) ok");
    const topic = topicOk ? "arithmetic" : (await h.sql("select (public.exam_section_topics('quantitative'))[1] t"))[0].t;
    const anchor = `prep:aptitude/quantitative/${topic}`;
    // today's rule (§2.2) mints the same id whichever option is correct, and refuses an answer
    const minted = mintQuestionId({ grade: "apt", subject: "quantitative", anchor, type: "mcq", stem, payload });
    for (const o of payload.options) {
      expect(questionIdHash({ anchor, type: "mcq", stem, payload: { ...payload, answer: { option_id: o.id } } })).toBe(minted.id_hash);
    }
    expect(() => questionIdHash({ anchor, type: "mcq", stem, payload, answer: canonicalAnswer("mcq", payload) })).toThrow(/answer_in_id/);
    // defense in depth: keys minted before that rule hashed the answer, so a staging key is never client-readable
    const oldRule = (option) => createHash("sha256").update(`${anchor}|mcq|${stem}|${option}`).digest("hex").slice(0, 10);
    const legacyMinted = `q-apt-quantitative-${oldRule(payload.answer.option_id)}`;
    expect(payload.options.filter((o) => `q-apt-quantitative-${oldRule(o.id)}` === legacyMinted).map((o) => o.id)).toEqual([payload.answer.option_id]);
    for (const [i, key] of [minted.id, legacyMinted].entries()) {
      await h.sql(`insert into public.questions (key, exam, section, topic, difficulty, stem, choices, question_type, payload_public, import_origin)
        values ($1, 'aptitude', 'quantitative', $2, 1, $3, $4::jsonb, 'mcq', public._ce_public_payload('mcq', $5::jsonb), 'staging')`,
      [key, topic, `${stem}${" ".repeat(i)}`, JSON.stringify(payload.options.map((o) => o.text)), JSON.stringify(payload)]);
    }
    const u = await h.createUser();
    for (const key of [minted.id, legacyMinted]) {
      expect(await asA("select key from public.questions where key = $1", [key])).toEqual([]);
      expect(await asU(u, "select key from public.questions where key = $1", [key])).toEqual([]);
    }
    // legacy rows (seeded keys, not answer-derived) are still readable
    expect((await asA("select key from public.questions where key = 'av-001'")).length).toBe(1);
  });
});

// ============================================================================
describe("legacy entry points never expose the curriculum bank", () => {
  it("search_all (anon + authenticated) returns no school stems", async () => {
    await h.exec(`insert into public.curriculum_nodes (id, parent_id, kind, ord, title_ar, status) values
      ('zz', null, 'stage', 1, 'مرحلة', 'verified'), ('zz/g1', 'zz', 'grade', 1, 'صف', 'verified'),
      ('zz/g1/s', 'zz/g1', 'subject', 1, 'مادة', 'verified'), ('zz/g1/s/n1', 'zz/g1/s', 'lesson', 1, 'درس', 'verified')
      on conflict do nothing;
      insert into public.questions (key, exam, section, topic, difficulty, stem, choices, question_type, lesson_node_id, import_origin)
      values ('zz-school-search', 'school', 'zz/g1/s', 'zz/g1/s/n1', 1, 'زرافةمدرسية سؤال؟', '["أ","ب"]', 'mcq', 'zz/g1/s/n1', 'staging')
      on conflict do nothing;`);
    const u = await h.createUser();
    for (const run of [(sql) => asA(sql), (sql) => asU(u, sql)]) {
      const [{ r }] = await run("select public.search_all('زرافةمدرسية', 5, array['questions'], 0) r");
      expect(r.questions).toEqual([]);
      expect(r.totals.questions).toBe(0);
    }
    const [{ r: legacy }] = await asA("select public.search_all($1, 5, array['questions'], 0) r", [(await h.sql("select stem from public.questions where key = 'av-001'"))[0].stem.slice(0, 12)]);
    expect(legacy.questions.length).toBeGreaterThan(0); // prep (legacy) questions are still found
    const [{ def }] = await h.sql("select pg_get_functiondef('public.search_all(text, int, text[], int)'::regprocedure) def");
    expect(def.split("q.exam <> 'school'").length - 1).toBe(2);
  });
});
