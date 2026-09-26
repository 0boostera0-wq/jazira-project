// 0012 learning-platform changes (supabase/migrations/0012_privacy_topics_analytics_search.sql,
// parts B–D) and the client data layer that uses them:
//   * start_exam_attempt(…, p_topic) + the local practice API topic filter
//   * get_exam_stats(): Elite-only advanced analytics ("locked")
//   * search_all(): Arabic-normalised matching, trigram indexes on the
//     normalised expressions, per-group totals, p_types / p_offset paging
//   * src/lib/data/exams.js startExam({ topic }), getExamStats() locked
//   * src/lib/data/search.js viewer-scoped cache, auth-change clearing,
//     PGRST205 / 42P01 → unavailable, types / offset
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createDb } from "./harness.js";
import { LIMITS, SECTIONS } from "@/lib/exams/catalog";
import * as examsApi from "@/lib/data/exams";
import * as searchApi from "@/lib/data/search";
import { parseStartBody, pickLocalQuestions, createBank, sectionOfTopic } from "@/lib/exams/local-bank";

vi.mock("@/lib/supabase-lazy", () => ({ getSupabase: async () => globalThis.__jz12Supabase ?? null }));
vi.mock("@/lib/supabase-server", () => ({
  createClient: async () => null,
  getRouteUser: async () => ({ supabase: null, user: null }),
}));
import { POST as localStartRoute } from "@/app/api/exams/local/start/route";
import { POST as localGradeRoute } from "@/app/api/exams/local/grade/route";

let h;
beforeAll(async () => { h = await createDb({ skip: ["0011_seed_questions.sql"] }); });
afterAll(async () => { await h?.close(); });

// ── helpers ──────────────────────────────────────────────────────────────────
const DENIED = { code: "42501" };
const CHECK = { code: "23514" };
const raised = (msg) => new RegExp(`^${msg}$`);
const detailOf = (e) => JSON.parse(e.detail);
const one = (rows) => rows[0].r;

let seq = 0;
const newUser = (meta = {}) => h.createUser({ meta: { full_name: "Test User", username: `l12_${++seq}`, ...meta } });
const asU = (uid, q, p) => h.asUser(uid, (tx) => tx.sql(q, p));
const asA = (q, p) => h.asAnon((tx) => tx.sql(q, p));
const as = (uid, q, p) => (uid ? asU(uid, q, p) : asA(q, p));
const makePremium = (uid) => h.sql("update public.profiles set is_elite = true where id = $1", [uid]);

/** n questions of ONE topic (keys: correct_index = number % 4). */
async function addTopicQuestions({ prefix, exam, section, topic, count, premium = false, difficulty = null }) {
  await h.sql(
    `insert into public.questions (key, exam, section, topic, difficulty, stem, choices, time_limit_seconds, is_premium)
     select $1 || '-' || lpad(g::text, 3, '0'), $2, $3, $4, coalesce($7::smallint, (1 + g % 3)::smallint),
            'سؤال ' || $1 || ' رقم ' || g, '["أ","ب","ج","د"]'::jsonb, 30, $5::boolean
       from generate_series(1, $6::int) g`,
    [prefix, exam, section, topic, premium, count, difficulty]);
  await h.sql(
    `insert into public.question_keys (question_id, correct_index, explanation)
     select id, (substring(key from '[0-9]+$')::int % 4)::smallint, 'شرح ' || key
       from public.questions where key like $1 || '-%' on conflict do nothing`, [prefix]);
}

const START_TYPES = { p_exam: "text", p_section: "text", p_difficulty: "smallint", p_count: "int", p_time_limit_seconds: "int", p_topic: "text" };
function start(uid, args) {
  const params = [];
  const parts = Object.entries(args).map(([k, v]) => { params.push(v); return `${k} => $${params.length}::${START_TYPES[k]}`; });
  return asU(uid, `select public.start_exam_attempt(${parts.join(", ")}) as r`, params).then(one);
}
const submit = (uid, attempt, answers = null) =>
  asU(uid, "select public.submit_exam_attempt($1::uuid, $2::jsonb) as r", [attempt, answers === null ? null : JSON.stringify(answers)]).then(one);
const stats = (uid) => asU(uid, "select public.get_exam_stats() as r").then(one);
const search = (uid, q, { limit = 5, types = null, offset = 0 } = {}) =>
  as(uid, "select public.search_all($1, $2::int, $3::text[], $4::int) r", [q, limit, types, offset]).then(one);

// Banks (fixed sizes → exact assertions):
//   achievement/physics  optics 6 free + 4 premium, kinematics 8 free, thermodynamics 2 free
//   aptitude/verbal      analogy 7 free
beforeAll(async () => {
  await addTopicQuestions({ prefix: "l12opt", exam: "achievement", section: "physics", topic: "optics", count: 6 });
  await addTopicQuestions({ prefix: "l12opp", exam: "achievement", section: "physics", topic: "optics", count: 4, premium: true });
  await addTopicQuestions({ prefix: "l12kin", exam: "achievement", section: "physics", topic: "kinematics", count: 8 });
  await addTopicQuestions({ prefix: "l12thr", exam: "achievement", section: "physics", topic: "thermodynamics", count: 2 });
  await addTopicQuestions({ prefix: "l12ana", exam: "aptitude", section: "verbal", topic: "analogy", count: 7 });
});

// ============================================================================
describe("start_exam_attempt: topic filter", () => {
  it("replaces the 0010 signature: one function, p_topic last with default null, signed-in only", async () => {
    const rows = await h.sql(
      `select pg_get_function_arguments(p.oid) a from pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.proname = 'start_exam_attempt'`);
    expect(rows).toHaveLength(1);
    expect(rows[0].a).toMatch(/p_time_limit_seconds integer DEFAULT NULL::integer, p_topic text DEFAULT NULL::text$/);
    const [g] = await h.sql(
      `select has_function_privilege('anon', 'public.start_exam_attempt(text,text,smallint,int,int,text)', 'EXECUTE') anon,
              has_function_privilege('authenticated', 'public.start_exam_attempt(text,text,smallint,int,int,text)', 'EXECUTE') auth`);
    expect(g).toEqual({ anon: false, auth: true });
    await expect(asA("select public.start_exam_attempt('achievement')")).rejects.toMatchObject(DENIED);
    const [old] = await h.sql("select to_regprocedure('public._exam_pick(text,text,smallint,boolean,double precision,boolean,uuid[],int)') o");
    expect(old.o).toBeNull();
  });

  it("section + topic → only that topic's questions; the topic is stored and echoed", async () => {
    const u = await newUser();
    const r = await start(u, { p_exam: "achievement", p_section: "physics", p_topic: "kinematics", p_count: 5 });
    expect(r).toMatchObject({ mode: "db", section: "physics", topic: "kinematics", question_count: 5 });
    expect(r.questions.every((q) => q.topic === "kinematics")).toBe(true);
    const [row] = await h.sql("select section, topic from public.exam_attempts where id = $1", [r.attempt_id]);
    expect(row).toEqual({ section: "physics", topic: "kinematics" });
    const res = await submit(u, r.attempt_id);
    expect(res.attempt).toMatchObject({ section: "physics", topic: "kinematics" });
    expect(res.by_topic.map((t) => t.topic)).toEqual(["kinematics"]);
  });

  it("a topic without a section infers the exam's one section that has it", async () => {
    const u = await newUser();
    const r = await start(u, { p_exam: "aptitude", p_topic: "analogy", p_count: 5 });
    expect(r).toMatchObject({ section: "verbal", topic: "analogy" });
    expect(r.questions.every((q) => q.section === "verbal" && q.topic === "analogy")).toBe(true);
  });

  it("validates the topic against the section (and the exam)", async () => {
    const u = await newUser();
    const bad = [
      { p_exam: "achievement", p_section: "physics", p_topic: "algebra" },        // a math topic
      { p_exam: "achievement", p_section: "physics", p_topic: "no-such-topic" },
      { p_exam: "achievement", p_topic: "analogy" },                             // an aptitude topic
      { p_exam: "aptitude", p_section: "verbal", p_topic: "" },
    ];
    for (const args of bad) {
      const e = await start(u, { ...args, p_count: 5 }).catch((x) => x);
      expect(e.message, JSON.stringify(args)).toBe("invalid_argument");
      expect(detailOf(e)).toEqual({ field: "topic" });
    }
    // an invalid section is still reported as the section
    const e = await start(u, { p_exam: "aptitude", p_section: "physics", p_topic: "optics", p_count: 5 }).catch((x) => x);
    expect(detailOf(e)).toEqual({ field: "section" });
  });

  it("premium rules still apply inside a topic; small topics use what exists; empty ones fail", async () => {
    const free = await newUser();
    const f = await start(free, { p_exam: "achievement", p_section: "physics", p_topic: "optics", p_count: 10 });
    expect(f.question_count).toBe(6);                                            // the 6 free optics items
    const prem = await newUser();
    await makePremium(prem);
    expect((await start(prem, { p_exam: "achievement", p_section: "physics", p_topic: "optics", p_count: 10 })).question_count).toBe(10);
    expect((await start(free, { p_exam: "achievement", p_section: "physics", p_topic: "thermodynamics", p_count: 5 })).question_count).toBe(2);
    const e = await start(free, { p_exam: "achievement", p_section: "physics", p_topic: "optics", p_difficulty: 1, p_count: 5 })
      .then(() => null, (x) => x);
    expect(e).toBeNull();                                                        // optics has difficulty-1 items
    await expect(start(free, { p_exam: "achievement", p_section: "physics", p_topic: "electricity", p_count: 5 }))
      .rejects.toThrow(raised("not_enough_questions"));
  });

  it("callers of the old five positional arguments keep working (topic = null)", async () => {
    const u = await newUser();
    const [r] = await asU(u, "select public.start_exam_attempt('achievement', 'physics', null::smallint, 5, null::int) as r");
    expect(r.r).toMatchObject({ section: "physics", topic: null, question_count: 5 });
  });

  it("exam_attempts.topic must belong to the attempt's section", async () => {
    const u = await newUser();
    const ins = (section, topic) => h.sql(
      `insert into public.exam_attempts (user_id, exam, section, topic, question_count, time_limit_seconds, expires_at)
       values ($1, 'achievement', $2, $3, 5, 300, now() + interval '5 minutes')`, [u, section, topic]);
    await expect(ins("physics", "algebra")).rejects.toMatchObject(CHECK);
    await expect(ins(null, "optics")).rejects.toMatchObject(CHECK);
    await ins("physics", "optics");
    const idx = await h.sql("select indexname from pg_indexes where indexname in ('questions_pick_est_idx', 'questions_pick_estd_idx') order by 1");
    expect(idx.map((r) => r.indexname)).toEqual(["questions_pick_est_idx", "questions_pick_estd_idx"]);
  });
});

// ============================================================================
describe("get_exam_stats: advanced analytics are Elite-only", () => {
  async function graded(uid) {
    const a = await start(uid, { p_exam: "achievement", p_section: "physics", p_topic: "kinematics", p_count: 5 });
    const keys = Object.fromEntries((await h.sql(
      "select question_id::text id, correct_index c from public.question_keys where question_id = any($1::uuid[])",
      [a.questions.map((q) => q.id)])).map((r) => [r.id, r.c]));
    await submit(uid, a.attempt_id, a.questions.map((q, i) => ({ position: q.position, selected_index: i < 4 ? keys[q.id] : (keys[q.id] + 1) % 4 })));
  }

  it("free plan: the basic block, advanced keys empty and listed in `locked`", async () => {
    const u = await newUser();
    await graded(u);
    const s = await stats(u);
    expect(s).toMatchObject({ premium: false, locked: ["by_topic", "best_topics", "weakest_topics"], completed_attempts: 1 });
    expect(s.totals).toMatchObject({ attempts: 1, questions: 5, correct: 4, accuracy: 80 });
    expect(s.by_section).toEqual([{ exam: "achievement", section: "physics", total: 5, answered: 5, correct: 4, accuracy: 80 }]);
    expect(s.trend.windows.last_7).toMatchObject({ attempts: 1, total: 5, correct: 4 });
    expect(s.trend.daily).toHaveLength(1);
    expect(s.by_topic).toEqual([]);
    expect(s.best_topics).toEqual([]);
    expect(s.weakest_topics).toEqual([]);
  });

  it("Elite (is_elite or an active elite subscription): everything, nothing locked", async () => {
    const u = await newUser();
    await makePremium(u);
    await graded(u);
    const s = await stats(u);
    expect(s).toMatchObject({ premium: true, locked: [] });
    expect(s.by_topic).toEqual([{ section: "physics", topic: "kinematics", total: 5, answered: 5, correct: 4, accuracy: 80 }]);
    expect(s.best_topics).toHaveLength(1);
    expect(s.weakest_topics).toHaveLength(1);

    const sub = await newUser();
    await graded(sub);
    await h.sql("insert into public.subscriptions (user_id, tier, status, current_period_end) values ($1, 'elite', 'active', now() + interval '20 days')", [sub]);
    expect((await stats(sub)).locked).toEqual([]);
    await h.sql("update public.subscriptions set current_period_end = now() - interval '1 day' where user_id = $1", [sub]);
    expect((await stats(sub)).locked).toEqual(["by_topic", "best_topics", "weakest_topics"]);
  });

  it("the basic block is identical for both plans (same numbers)", async () => {
    const u = await newUser();
    await graded(u);
    const free = await stats(u);
    await makePremium(u);
    const elite = await stats(u);
    for (const k of ["completed_attempts", "in_progress", "totals", "by_section", "trend"]) expect(free[k]).toEqual(elite[k]);
    await expect(asA("select public.get_exam_stats()")).rejects.toMatchObject(DENIED);
  });
});

// ============================================================================
describe("search_normalize()", () => {
  it("folds Arabic spelling variants, digits, case and whitespace; keeps punctuation", async () => {
    const cases = [
      ["مَدْرَسَةٌ", "مدرسه"],
      ["المـــدرسة", "المدرسه"],
      ["أحمد إبراهيم آمن ٱلله", "احمد ابراهيم امن الله"],
      ["مستشفى جامعيّ", "مستشفي جامعي"],
      ["سؤال مسئول", "سوال مسيول"],
      ["فارسی کتاب", "فارسي كتاب"],
      ["٢٠٢٦ و ۱۴۰۵", "2026 و 1405"],
      ["  Hello\t\nWORLD  ", "hello world"],
      ["100% under_score \\x", "100% under_score \\x"],
    ];
    for (const [input, out] of cases) {
      const [r] = await h.sql("select public.search_normalize($1) n", [input]);
      expect(r.n, input).toBe(out);
    }
    const [nul] = await h.sql("select public.search_normalize(null) n");
    expect(nul.n).toBeNull();
    const [p] = await h.sql("select provolatile v, proisstrict s from pg_proc where oid = 'public.search_normalize(text)'::regprocedure");
    expect(p).toEqual({ v: "i", s: true });
  });
});

// ============================================================================
describe("search_all: Arabic-normalised matching, totals and paging", () => {
  let u, premium, token;
  beforeAll(async () => {
    token = "زيتونيات";
    u = await newUser({ full_name: "إبراهيم الزيتوني", username: "ibrahim_zaytoni" });
    premium = await newUser({ full_name: "Premium Searcher" });
    await makePremium(premium);
    await asU(u, "insert into public.community_posts (user_id, content) values ($1, $2), ($1, $3), ($1, $4)", [u,
      "زيارة إلى المَدْرَسَةِ الجديدة",
      "سؤالٌ عن المستشفى",
      "حشو ".repeat(80) + "المَدْرَسَةُ النموذجية" + " ذيل".repeat(80)]);
    await h.sql("insert into public.hashtags (tag, post_count) values ('مدرسة', 3), ('مدارس', 1)");
    await h.sql(`insert into public.questions (key, exam, section, topic, difficulty, stem, choices, is_premium) values
      ('l12s-free', 'aptitude', 'verbal', 'analogy', 1, 'كم عدد طلاب المدرسة ٣٠؟', '["a","b"]', false),
      ('l12s-prem', 'aptitude', 'verbal', 'analogy', 1, 'سؤال مميز عن المدرسة', '["a","b"]', true)`);
    await h.sql(`insert into public.community_posts (user_id, content)
                 select $1, $2 || ' رقم ' || g from generate_series(1, 105) g`, [u, token]);
  });

  it("finds text across spelling variants (diacritics, ة/ه, ى/ي, ؤ/و, alef forms, tatweel, digits)", async () => {
    const posts = async (q) => (await search(null, q)).posts.map((p) => p.snippet);
    expect(await posts("المدرسه")).toHaveLength(2);                       // query without ة, text with harakat + ة
    expect((await posts("مستشفي")).join(" ")).toContain("المستشفى");
    expect((await posts("سوال عن")).join(" ")).toContain("سؤالٌ");
    expect((await search(null, "ابراهيم")).people.map((p) => p.id)).toEqual([u]);
    expect((await search(null, "ـإبراهيـم")).people.map((p) => p.id)).toEqual([u]);
    expect((await search(null, "#مدرسه")).tags.map((t) => t.tag)).toEqual(["مدرسة"]);
    expect((await search(null, "المدرسة 30")).questions.map((q) => q.snippet)).toEqual(["كم عدد طلاب المدرسة ٣٠؟"]);
  });

  it("snippets window the ORIGINAL text around a normalised match", async () => {
    const r = await search(null, "المدرسه النموذجيه");
    expect(r.posts).toHaveLength(1);
    const s = r.posts[0].snippet;
    expect(s).toContain("المَدْرَسَةُ النموذجية");
    expect(s.startsWith("…") && s.endsWith("…")).toBe(true);
  });

  it("premium questions stay premium-only (the function is definer, the rule is explicit)", async () => {
    expect((await search(null, "المدرسه", { types: ["questions"] })).questions).toHaveLength(1);
    expect((await search(u, "المدرسه", { types: ["questions"] })).questions).toHaveLength(1);
    expect((await search(premium, "المدرسه", { types: ["questions"] })).questions).toHaveLength(2);
    expect((await search(premium, "المدرسه", { types: ["questions"] })).totals.questions).toBe(2);
  });

  it("per-group totals, capped at 100 (totals_capped), null for groups not requested", async () => {
    const r = await search(null, token);
    expect(r.posts).toHaveLength(5);
    expect(r.totals).toEqual({ people: 0, posts: 100, tags: 0, questions: 0 });
    expect(r.totals_capped).toEqual({ people: false, posts: true, tags: false, questions: false });
    const only = await search(null, "المدرسه", { types: ["posts", "people"] });
    expect(only.totals).toEqual({ people: 0, posts: 2, tags: null, questions: null });
    expect(only.tags).toEqual([]);
    expect(only.types).toEqual(["people", "posts"]);
  });

  it("p_types + p_offset page one group without gaps or duplicates", async () => {
    const all = (await search(null, token, { types: ["posts"], limit: 20 })).posts.map((p) => p.id);
    const pages = [];
    for (let off = 0; off < 20; off += 5) pages.push(...(await search(null, token, { types: ["posts"], limit: 5, offset: off })).posts.map((p) => p.id));
    expect(pages).toEqual(all);
    expect(new Set(pages).size).toBe(20);
    const deep = await search(null, token, { types: ["posts"], limit: 20, offset: 100 });
    expect(deep.posts).toHaveLength(5);                                     // 105 matches → the last 5
    expect(deep.offset).toBe(100);
  });

  it("validates limit, offset and types; short queries report zero totals without searching", async () => {
    for (const [opts, field] of [[{ limit: 0 }, "limit"], [{ limit: 21 }, "limit"], [{ offset: -1 }, "offset"], [{ offset: 101 }, "offset"],
      [{ types: [] }, "types"], [{ types: ["people", "bogus"] }, "types"], [{ types: [null] }, "types"]]) {
      const e = await search(null, token, opts).catch((x) => x);
      expect(e.message, JSON.stringify(opts)).toBe("invalid_argument");
      expect(detailOf(e).field).toBe(field);
    }
    const short = await search(null, " ً ", { types: ["tags"] });
    expect(short).toMatchObject({ posts: [], tags: [], totals: { tags: 0, posts: null } });
  });

  it("one search_all (the 0010 two-argument overload is gone); callable by guests; 2-argument calls still work", async () => {
    const rows = await h.sql("select pg_get_function_identity_arguments(oid) a from pg_proc where proname = 'search_all' and pronamespace = 'public'::regnamespace");
    expect(rows).toEqual([{ a: "p_q text, p_limit integer, p_types text[], p_offset integer" }]);
    const [r] = await asA("select public.search_all($1, 3) r", [token]);
    expect(r.r.posts).toHaveLength(3);
  });

  it("trigram GIN indexes on the normalised expressions serve the searches", async () => {
    const idx = await h.sql(`select indexname, indexdef from pg_indexes where indexname like '%\\_norm\\_idx' order by 1`);
    expect(idx.map((r) => r.indexname)).toEqual(["community_posts_content_norm_idx", "hashtags_tag_norm_idx",
      "profiles_full_name_norm_idx", "profiles_username_norm_idx", "questions_stem_norm_idx"]);
    for (const r of idx) expect(r.indexdef).toMatch(/USING gin \(search_normalize\(.*gin_trgm_ops\)/);
    const plan = await h.db.transaction(async (tx) => {
      await tx.exec("set local enable_seqscan = off");
      const res = await tx.query("explain select id from public.community_posts where public.search_normalize(content) like '%مدرسه%'");
      return res.rows.map((x) => x["QUERY PLAN"]).join("\n");
    });
    expect(plan).toContain("community_posts_content_norm_idx");
  });
});

// ============================================================================
// Client data layer ↔ database. A PostgREST-like fake executes
// supabase.rpc(name, args) against PGlite as the caller, choosing the overload
// whose parameter names cover the arguments (like PostgREST). Local practice
// mode goes through the real route handlers.
// ============================================================================
describe("client data layer (0012)", () => {
  async function overloads(fn) {
    return h.sql(
      `select p.proargnames as names, p.proretset as retset,
              array(select format_type(t, null) from unnest(p.proargtypes::oid[]) with ordinality u(t, o) order by o) as types
         from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1`, [fn]);
  }
  function fakeSupabase(uid, { missing = [], errors = {}, listeners = null } = {}) {
    const calls = [];
    return {
      calls,
      auth: {
        getSession: async () => ({ data: { session: uid ? { user: { id: uid } } : null } }),
        onAuthStateChange(cb) {
          listeners?.push(cb);
          return { data: { subscription: { unsubscribe() {} } } };
        },
      },
      rpc(fn, args = {}) {
        calls.push({ fn, args });
        const run = async () => {
          if (errors[fn]) return { data: null, error: errors[fn] };
          const keys = Object.keys(args);
          const sig = missing.includes(fn) ? null : (await overloads(fn)).find((s) => keys.every((k) => (s.names || []).includes(k)));
          if (!sig) return { data: null, error: { code: "PGRST202", message: `Could not find the function public.${fn}`, details: null } };
          const params = [];
          const parts = keys.map((k) => {
            const i = sig.names.indexOf(k);
            const v = args[k];
            params.push(v !== null && typeof v === "object" && sig.types[i] === "jsonb" ? JSON.stringify(v) : v);
            return `${k} => $${params.length}::${sig.types[i]}`;
          });
          const call = `public.${fn}(${parts.join(", ")})`;
          const q = sig.retset ? `select * from ${call}` : `select ${call} as r`;
          try {
            const rows = uid ? await h.asUser(uid, (tx) => tx.sql(q, params)) : await h.asAnon((tx) => tx.sql(q, params));
            return { data: sig.retset ? rows : rows[0].r, error: null };
          } catch (e) {
            return { data: null, error: { code: e.code, message: e.message, details: e.detail ?? null } };
          }
        };
        const promise = run();
        return { then: (ok, ko) => promise.then(ok, ko), abortSignal() { return this; } };
      },
    };
  }
  const as = (uid, opts) => (globalThis.__jz12Supabase = fakeSupabase(uid, opts));
  const realFetch = globalThis.fetch;
  beforeAll(() => {
    globalThis.fetch = async (url, init) => {
      const route = String(url).endsWith("/start") ? localStartRoute : localGradeRoute;
      return route(new Request(new URL(url, "http://localhost"), init));
    };
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
    delete globalThis.__jz12Supabase;
  });

  it("exams (db mode): startExam({ topic }) filters and echoes the topic; no topic → topic null", async () => {
    const u = await newUser();
    const fake = as(u);
    const s = await examsApi.startExam({ exam: "achievement", section: "physics", topic: "optics", count: 5 });
    expect(s).toMatchObject({ mode: "db", topic: "optics", section: "physics", question_count: 5 });
    expect(s.questions.every((q) => q.topic === "optics")).toBe(true);
    expect(fake.calls.at(-1).args).toMatchObject({ p_topic: "optics" });
    const plain = await examsApi.startExam({ exam: "achievement", section: "physics", count: 5 });
    expect(plain).toMatchObject({ mode: "db", topic: null });
    expect(fake.calls.at(-1).args).not.toHaveProperty("p_topic");          // pre-0012 databases accept this call
    const bad = await examsApi.startExam({ exam: "achievement", section: "physics", topic: "algebra", count: 5 }).catch((e) => e);
    expect(bad).toMatchObject({ name: "DataError", code: "invalid_argument", details: { field: "topic" } });
    const empty = await examsApi.startExam({ exam: "achievement", section: "physics", topic: "", count: 5 }).catch((e) => e);
    expect(empty).toMatchObject({ code: "invalid_argument", details: { field: "topic" } });   // never silently unfiltered
  });

  it("exams (local mode): the local practice API filters by topic (section inferred when missing)", async () => {
    as(null);
    const s = await examsApi.startExam({ exam: "aptitude", section: "quantitative", topic: "algebra", count: 5 });
    expect(s).toMatchObject({ mode: "local", topic: "algebra", section: "quantitative" });
    expect(s.questions.length).toBeGreaterThan(0);
    expect(s.questions.every((q) => q.topic === "algebra")).toBe(true);
    const inferred = await examsApi.startExam({ exam: "aptitude", topic: "analogy", count: 5 });
    expect(inferred).toMatchObject({ mode: "local", section: "verbal", topic: "analogy" });
    expect(inferred.questions.every((q) => q.section === "verbal" && q.topic === "analogy")).toBe(true);
    expect((await examsApi.getAttempt(inferred.attempt_id)).attempt).toMatchObject({ topic: "analogy" });
    const bad = await examsApi.startExam({ exam: "aptitude", section: "verbal", topic: "optics", count: 5 }).catch((e) => e);
    expect(bad).toMatchObject({ code: "invalid_argument", details: { field: "topic" } });
    const res = await examsApi.startExam({ exam: "aptitude", count: 5 });
    expect(res).toMatchObject({ mode: "local", topic: null });
  });

  it("local practice helpers: parseStartBody / pickLocalQuestions / sectionOfTopic", () => {
    expect(parseStartBody({ exam: "aptitude", count: 5 }).value).not.toHaveProperty("topic");   // unchanged shape without a topic
    expect(parseStartBody({ exam: "aptitude", section: "verbal", topic: "analogy", count: 5 }).value).toMatchObject({ section: "verbal", topic: "analogy" });
    expect(parseStartBody({ exam: "achievement", topic: "optics", count: 5 }).value).toMatchObject({ section: "physics", topic: "optics" });
    for (const body of [{ exam: "aptitude", topic: "optics", count: 5 }, { exam: "aptitude", section: "verbal", topic: "algebra", count: 5 },
      { exam: "aptitude", topic: 3, count: 5 }, { exam: "aptitude", topic: "", count: 5 }]) {
      expect(parseStartBody(body), JSON.stringify(body)).toEqual({ ok: false, error: "invalid_argument", field: "topic" });
    }
    expect(sectionOfTopic("achievement", "algebra")).toBe("math");
    expect(sectionOfTopic("aptitude", "algebra")).toBe("quantitative");
    expect(sectionOfTopic("aptitude", "nope")).toBeNull();
    const bank = createBank([{ exam: "aptitude", section: "quantitative", questions: SECTIONS.quantitative.topics.map((topic, i) => ({
      key: `lb-${i}`, topic, difficulty: 1, stem: "q", choices: ["a", "b"], answer: 0, explanation: "e" })) }]);
    const set = pickLocalQuestions(bank, { exam: "aptitude", section: "quantitative", topic: "geometry", count: 5 });
    expect(set).toMatchObject({ topic: "geometry", question_count: 1 });
    expect(pickLocalQuestions(bank, { exam: "aptitude", count: 5 }).topic).toBeNull();
    expect(LIMITS.minQuestions).toBe(5);
  });

  it("getExamStats(): `locked` is always an array", async () => {
    const u = await newUser();
    as(u);
    expect(await examsApi.getExamStats()).toMatchObject({ mode: "db", premium: false, locked: ["by_topic", "best_topics", "weakest_topics"] });
    await makePremium(u);
    expect(await examsApi.getExamStats()).toMatchObject({ mode: "db", premium: true, locked: [] });
  });

  it("search: totals, types and offset reach search_all; results carry totals", async () => {
    searchApi.clearSearchCache();
    const fake = as(null);
    const r = await searchApi.searchAll("زيتونيات", { types: ["posts"], limit: 3, offset: 3 });
    expect(fake.calls.at(-1).args).toEqual({ p_q: "زيتونيات", p_limit: 3, p_types: ["posts"], p_offset: 3 });
    expect(r).toMatchObject({ available: true, offset: 3, types: ["posts"], people: [], totals: { posts: 100, people: null }, totalsCapped: { posts: true } });
    expect(r.posts).toHaveLength(3);
    await searchApi.searchAll("زيتونيات");
    expect(fake.calls.at(-1).args).toEqual({ p_q: "زيتونيات", p_limit: 5 });   // defaults are not sent
    await expect(searchApi.searchAll("x y", { types: ["nope"] })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(searchApi.searchAll("x y", { limit: 50 })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(searchApi.searchAll("x y", { offset: 101 })).rejects.toMatchObject({ code: "invalid_argument" });
    expect(searchApi.normalizeTypes(["questions", "people", "people"])).toEqual(["people", "questions"]);
    expect(searchApi.normalizeTypes(["tags", "questions", "posts", "people"])).toBeNull();
  });

  it("search: the cache is per viewer — another account never gets the previous one's results", async () => {
    searchApi.clearSearchCache();
    const free = await newUser();
    const elite = await newUser();
    await makePremium(elite);
    const a = as(free);
    const r1 = await searchApi.searchAll("المدرسه", { types: ["questions"] });
    expect(r1.questions).toHaveLength(1);
    expect(await searchApi.searchAll("المدرسه", { types: ["questions"] })).toBe(r1);          // cache hit, same viewer
    expect(a.calls).toHaveLength(1);
    const b = as(elite);
    const r2 = await searchApi.searchAll("المدرسه", { types: ["questions"] });
    expect(b.calls).toHaveLength(1);                                                         // not served from free's entry
    expect(r2.questions).toHaveLength(2);
    const a2 = as(free);
    await searchApi.searchAll("المدرسه", { types: ["questions"] });
    expect(a2.calls).toHaveLength(1);                                                        // the switch dropped free's entries
    expect(searchApi.searchCacheKey("u1", "Abc", { limit: 5 })).not.toBe(searchApi.searchCacheKey("anon", "Abc", { limit: 5 }));
  });

  it("search: an auth change (sign-out / other user) clears the cache", async () => {
    searchApi.clearSearchCache();
    const u = await newUser();
    const listeners = [];
    const fake = as(u, { listeners });
    await searchApi.searchAll("زيتونيات");
    await searchApi.searchAll("زيتونيات");
    expect(fake.calls).toHaveLength(1);
    expect(listeners.length).toBeGreaterThan(0);
    for (const cb of listeners) cb("SIGNED_OUT", null);
    await searchApi.searchAll("زيتونيات");
    expect(fake.calls).toHaveLength(2);                                                      // re-fetched
    await searchApi.searchAll("زيتونيات");
    expect(fake.calls).toHaveLength(2);
    for (const cb of listeners) cb("TOKEN_REFRESHED", { user: { id: u } });                 // same user → kept
    await searchApi.searchAll("زيتونيات");
    expect(fake.calls).toHaveLength(2);
  });

  it("search: a missing function or table (PGRST202/205, 42883/42P01) → unavailable, not an error", async () => {
    for (const code of ["PGRST205", "42P01", "42883"]) {
      searchApi.clearSearchCache();
      as(null, { errors: { search_all: { code, message: "missing", details: null } } });
      expect(await searchApi.searchAll("زيتونيات"), code).toMatchObject({ available: false, posts: [], totals: null });
    }
    searchApi.clearSearchCache();
    as(null, { missing: ["search_all"] });
    expect(await searchApi.searchAll("زيتونيات")).toMatchObject({ available: false });
    searchApi.clearSearchCache();
    as(null, { errors: { search_all: { code: "XX000", message: "boom", details: null } } });
    await expect(searchApi.searchAll("زيتونيات")).rejects.toMatchObject({ code: "unknown" });
  });
});
