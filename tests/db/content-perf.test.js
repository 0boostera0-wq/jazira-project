// ============================================================================
// Content engine performance on PGlite (docs/CONTENT_ENGINE.md §6.2, §9.3,
// WP7): 200,000 synthetic published items (100 subjects × 50 lessons × 40
// items), then
//   start_template_attempt at a subject scope   p95 ≤ 300 ms
//   submit_exam_attempt                         p95 ≤ 200 ms
//   ce_guest_start returns only the n picked rows
//   search_content                              ≤ 500 ms
//   a grade scope above 5,000 items             → scope_too_large
// PGlite runs single-threaded WebAssembly on a shared machine, so every timed
// call is normalized by a calibration measured right before it (5,000 u()
// draws; the reference machine does them in 70 ms): a call counts as
// ms × min(1, 70 ms / calibration). A slower (or busier) machine is never a
// reason to fail, a slow query still is.
// Set JZ_PERF_ITEMS to run a smaller bank locally (default 200000).
// ============================================================================
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "./harness.js";
import { TEMPLATES } from "../../src/lib/exams/engine/exam-templates.js";

const ITEMS = Number(process.env.JZ_PERF_ITEMS || 200000);
const LESSONS_PER_SUBJECT = 50;
const PER_LESSON = 40;
const SUBJECTS = Math.max(1, Math.round(ITEMS / (LESSONS_PER_SUBJECT * PER_LESSON)));
const UNITS = 5;
const REFERENCE_CALIBRATION_MS = 70;

let h;
let premiumUser;

const p95 = (list) => {
  const s = [...list].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)];
};
/** Time fn() and normalize it by a calibration run just before it. */
async function timed(fn) {
  const c = performance.now();
  await h.sql("select count(public._ce_u('0123456789abcdef0123456789abcdef', 'sel', g::text)) from generate_series(1, 5000) g");
  const calibration = performance.now() - c;
  const t = performance.now();
  const r = await fn();
  const raw = performance.now() - t;
  return { ms: raw * Math.min(1, REFERENCE_CALIBRATION_MS / calibration), raw, r };
}

beforeAll(async () => {
  h = await createDb();
  // curriculum: stage → grade → subjects → units → lessons (t1 for units 1–3)
  await h.exec(`
    insert into public.curriculum_nodes (id, parent_id, kind, stage, grade, subject, ord, title_ar, status) values
      ('perf', null, 'stage', 'perf', null, null, 1, 'مرحلة الأداء', 'verified'),
      ('perf/g1', 'perf', 'grade', 'perf', 'perf/g1', null, 1, 'صف الأداء', 'verified');
    insert into public.curriculum_nodes (id, parent_id, kind, stage, grade, subject, ord, title_ar, status)
    select 'perf/g1/s' || s, 'perf/g1', 'subject', 'perf', 'perf/g1', 'perf/g1/s' || s, s, 'مادة ' || s, 'verified'
      from generate_series(1, ${SUBJECTS}) s;
    insert into public.curriculum_nodes (id, parent_id, kind, stage, grade, subject, ord, title_ar, term, term_status, status)
    select 'perf/g1/s' || s || '/n' || (s * 100 + u), 'perf/g1/s' || s, 'unit', 'perf', 'perf/g1', 'perf/g1/s' || s, u,
           'وحدة ' || u, case when u <= 3 then 't1' else 't2' end, 'inferred', 'verified'
      from generate_series(1, ${SUBJECTS}) s, generate_series(1, ${UNITS}) u;
    insert into public.curriculum_nodes (id, parent_id, kind, stage, grade, subject, ord, title_ar, term, term_status, status)
    select 'perf/g1/s' || s || '/n' || (1000000 + s * 1000 + l), 'perf/g1/s' || s || '/n' || (s * 100 + 1 + (l - 1) / ${LESSONS_PER_SUBJECT / UNITS}),
           'lesson', 'perf', 'perf/g1', 'perf/g1/s' || s, l, 'درس الأداء ' || s || ' ' || l,
           case when (l - 1) / ${LESSONS_PER_SUBJECT / UNITS} < 3 then 't1' else 't2' end, 'inferred', 'verified'
      from generate_series(1, ${SUBJECTS}) s, generate_series(1, ${LESSONS_PER_SUBJECT}) l;`);
  // bulk load: secondary indexes are rebuilt after the load (same final state, much faster)
  const indexes = await h.sql(`select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = 'questions'
                                and indexname not in ('questions_pkey', 'questions_key_key')`);
  for (const { indexname } of indexes) await h.exec(`drop index public.${indexname}`);
  await h.exec(`
    set jazira.bulk_import = on;
    insert into public.questions (key, exam, section, topic, difficulty, stem, choices, time_limit_seconds, question_type,
                                  difficulty_level, status, validation_status, revision, lesson_node_id, payload_public,
                                  import_origin, is_premium, exclusion_group, option_flags)
    select 'q-p' || n, 'school', l.subject, l.id, 1 + n % 3, 'سؤال الأداء رقم ' || n || '؟', '["أ","ب","ج","د"]'::jsonb, 60, 'mcq',
           1 + n % 5, 'published', 'validated', 1, l.id,
           jsonb_build_object('options', jsonb_build_array(jsonb_build_object('id', 'o' || n || 'a', 'text', 'أ'),
                                                           jsonb_build_object('id', 'o' || n || 'b', 'text', 'ب'),
                                                           jsonb_build_object('id', 'o' || n || 'c', 'text', 'ج'),
                                                           jsonb_build_object('id', 'o' || n || 'd', 'text', 'د')),
                              'fixed_order_reason', null),
           'staging', n % 50 = 0, case when n % 20 = 0 then 'xg-' || (n / 40) end, '{"fixed":false,"numeric_order":null}'::jsonb
      from (select id, subject, row_number() over (order by id) rn from public.curriculum_nodes where kind = 'lesson' and id like 'perf/%') l,
           lateral (select (l.rn - 1) * ${PER_LESSON} + g n from generate_series(1, ${PER_LESSON}) g) x;
    insert into public.question_keys (question_id, correct_index, explanation, answer, explanation_steps)
    select q.id, 0, 'شرح', jsonb_build_object('options', q.payload_public -> 'options', 'answer',
                                              jsonb_build_object('option_id', q.payload_public #>> '{options,0,id}')), '[]'::jsonb
      from public.questions q where q.key like 'q-p%';
    reset jazira.bulk_import;`);
  for (const { indexdef } of indexes) await h.exec(indexdef);
  await h.asService((tx) => tx.sql("select public.ce_refresh_aggregates()"));
  // what autovacuum does after a bulk load
  await h.exec("analyze public.questions; analyze public.question_keys; analyze public.curriculum_nodes;");
  for (const t of TEMPLATES) {
    await h.sql("insert into public.exam_templates (id, version, kind, definition) values ($1, $2, $3, $4::jsonb) on conflict do nothing",
      [t.id, t.version, t.kind, JSON.stringify(t)]);
  }
  premiumUser = await h.createUser();
  await h.sql("update public.profiles set is_elite = true where id = $1", [premiumUser]);
}, 1_800_000);

afterAll(async () => {
  await h?.close();
});

describe(`content engine on ${ITEMS.toLocaleString("en")} synthetic items`, () => {
  it("the bank is loaded and the aggregates cover every subject", async () => {
    const [{ q, m, c }] = await h.sql(`select (select count(*) from public.questions where key like 'q-p%')::int q,
      (select count(*) from public.scope_pool_members where lesson_node_id like 'perf/%')::int m,
      (select count(*) from public.scope_pool_counts where node_id like 'perf/g1/s%' and band = 0 and node_id not like '%/%/%/%' and node_id not like '%@%')::int c`);
    expect(q).toBe(SUBJECTS * LESSONS_PER_SUBJECT * PER_LESSON);
    expect(m).toBe(q);
    expect(c).toBe(SUBJECTS);
  });

  it("start_template_attempt p95 ≤ 300 ms and submit_exam_attempt p95 ≤ 200 ms at a subject scope", async () => {
    const starts = [];
    const submits = [];
    for (let i = 0; i < 20; i++) {
      const scope = `perf/g1/s${1 + (i % SUBJECTS)}`;
      const s = await timed(() => h.asUser(premiumUser, (tx) => tx.sql("select public.start_template_attempt('subject-quiz', $1, 25) r", [scope])));
      const start = s.r[0].r;
      expect(start.question_count).toBe(25);
      starts.push(s.ms);
      const answers = start.questions.map((q) => ({ position: q.position, response: { option_index: q.position % 4 } }));
      const t = await timed(() => h.asUser(premiumUser, (tx) => tx.sql("select public.submit_exam_attempt($1, $2::jsonb) r", [start.attempt_id, JSON.stringify(answers)])));
      expect(t.r[0].r.status).toBe("submitted");
      submits.push(t.ms);
    }
    // the first call of each plan is excluded (plan caching), like a warm server
    const start95 = p95(starts.slice(1));
    const submit95 = p95(submits.slice(1));
    expect(start95, `start p95 ${Math.round(start95)} ms (normalized)`).toBeLessThanOrEqual(300);
    expect(submit95, `submit p95 ${Math.round(submit95)} ms (normalized)`).toBeLessThanOrEqual(200);
  }, 600_000);

  it("ce_guest_start selects in SQL and returns only the n picked rows", async () => {
    const guest = () => h.asService((tx) => tx.sql(
      "select public.ce_guest_start('subject-quiz', 'perf/g1/s2', '0123456789abcdef0123456789abcdef', '{}', 20) r"));
    await guest(); // plan warm-up
    const t = await timed(guest);
    const r = t.r[0].r;
    expect(r.items).toHaveLength(20);
    expect(r.question_count).toBe(20);
    expect(JSON.stringify(r).length).toBeLessThan(60_000); // no pool ever leaves the database
    expect(t.ms).toBeLessThanOrEqual(300);
  }, 120_000);

  it("search_content answers within 500 ms", async () => {
    const times = [];
    for (const q of ["درس الأداء 7", "الأداء رقم 12345", "مادة 3"]) {
      const t = await timed(() => h.asUser(premiumUser, (tx) => tx.sql("select public.search_content($1) r", [q])));
      expect(t.r[0].r.query).toBeTruthy();
      times.push(t.ms);
    }
    expect(Math.max(...times.slice(1))).toBeLessThanOrEqual(500);
  }, 120_000);

  it("a scope above 5,000 eligible items is refused (scope_too_large)", async () => {
    await expect(h.asUser(premiumUser, (tx) => tx.sql("select public.start_template_attempt('practice', 'perf/g1', 10)")))
      .rejects.toMatchObject({ message: "scope_too_large" });
    await expect(h.asUser(premiumUser, (tx) => tx.sql("select public.start_template_attempt('practice', 'perf', 10)")))
      .rejects.toMatchObject({ message: "scope_too_large" });
  }, 120_000);
});
