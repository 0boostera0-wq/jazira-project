// Migration 0013 (supabase/migrations/0013_abuse_limits_payments_privacy.sql)
// and the server / client code built on it. Every block pairs the ATTACK the
// review found with the legitimate flow that must keep working:
//   AI quota (ai_consume / ai_finish + POST /api/chat end to end) · payments
//   (apply_payment_event) · shared rate limits · reaction privacy · hashtag
//   order · profiles.updated_at · search_path drift · exam XP cap · sessions ·
//   the community read path of src/lib/social.js (no author of anonymous
//   content ever reaches another browser).
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createDb } from "./harness.js";

vi.mock("@/lib/supabase-lazy", () => ({
  getSupabase: async () => globalThis.__jz13Client ?? null,
  onSupabaseReady: () => () => {},
  hasAuthCookie: () => false,
  isSupabaseRequested: () => false,
}));
vi.mock("@/lib/supabase-server", () => ({
  createClient: async () => globalThis.__jz13Server ?? null,
  getRouteUser: async () => ({ supabase: globalThis.__jz13Server ?? null, user: null }),
}));
// A controllable model: "ok" streams a reply, "fail" breaks mid-stream.
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return {
        startChat: () => ({
          sendMessageStream: async () => {
            globalThis.__jz13ModelCalls = (globalThis.__jz13ModelCalls || 0) + 1;
            const mode = globalThis.__jz13Model || "ok";
            return {
              stream: (async function* stream() {
                yield { text: () => "partial " };
                if (mode === "fail") throw new Error("upstream reset");
                yield { text: () => "answer" };
              })(),
            };
          },
        }),
      };
    }
  },
}));

import { POST as chatRoute } from "@/app/api/chat/route";
import * as social from "@/lib/social";

let h;
beforeAll(async () => { h = await createDb({ skip: ["0011_seed_questions.sql"] }); });
afterAll(async () => {
  await h?.close();
  delete globalThis.__jz13Client;
  delete globalThis.__jz13Server;
});

const DENIED = { code: "42501" };
let seq = 0;
const newUser = (meta = {}) => h.createUser({ meta: { full_name: "Test User", username: `h13_${++seq}`, ...meta } });
const asU = (uid, q, p) => h.asUser(uid, (tx) => tx.sql(q, p));
const asA = (q, p) => h.asAnon((tx) => tx.sql(q, p));
const asS = (q, p) => h.asService((tx) => tx.sql(q, p));
const one = (rows) => rows[0].r;

// PostgREST-like rpc(name, { p_*: value }) with the caller's role.
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
async function rpcAs(uid, fn, args = {}) {
  const sig = await signature(fn);
  if (!sig) return { data: null, error: { code: "PGRST202", message: `Could not find the function public.${fn}` } };
  const parts = [];
  const params = [];
  for (const [k, v] of Object.entries(args)) {
    const i = (sig.names || []).indexOf(k);
    if (i < 0) return { data: null, error: { code: "PGRST202", message: `Could not find the function public.${fn}(${k})` } };
    params.push(v !== null && typeof v === "object" && sig.types[i] === "jsonb" ? JSON.stringify(v) : v);
    parts.push(`${k} => $${params.length}::${sig.types[i]}`);
  }
  const call = `public.${fn}(${parts.join(", ")})`;
  const q = sig.retset ? `select * from ${call}` : `select ${call} as r`;
  try {
    const rows = uid ? await h.asUser(uid, (tx) => tx.sql(q, params)) : await h.asAnon((tx) => tx.sql(q, params));
    return { data: sig.retset ? rows : rows[0].r, error: null };
  } catch (e) {
    return { data: null, error: { code: e.code, message: e.message, details: e.detail ?? null } };
  }
}
const thenable = (promise) => ({ then: (ok, ko) => promise.then(ok, ko), abortSignal() { return this; } });

// ============================================================================
// A) AI quota
// ============================================================================
describe("ai_consume / ai_finish (ledger-verified retries, one decision at a time)", () => {
  const consume = (uid, content, session = "s1") => asU(uid, "select public.ai_consume($1, $2) as r", [session, content]).then(one);
  const finish = (uid, ticket, reply) => asU(uid, "select public.ai_finish($1::uuid, $2) as r", [ticket, reply]).then(one);
  const used = (uid) => asU(uid, "select public.ai_quota() as r").then(one).then((q) => q.used);

  it("charges a new message once; a retry of an UNDELIVERED reply is free; a delivered one is not retry-exempt", async () => {
    const u = await newUser();
    const a = await consume(u, "go");
    expect(a).toMatchObject({ ok: true, retry: false });
    expect(await used(u)).toBe(1);
    // the reply failed → the server releases the claim → the same text again is free
    expect(await finish(u, a.ticket, null)).toBe(true);
    const b = await consume(u, "go");
    expect(b).toMatchObject({ ok: true, retry: true });
    expect(await used(u)).toBe(1);
    // delivered → the next "go" is a new, charged message
    expect(await finish(u, b.ticket, "the answer")).toBe(true);
    expect(await finish(u, b.ticket, "again")).toBe(false);          // a ticket works once
    const c = await consume(u, "go");
    expect(c).toMatchObject({ ok: true, retry: false });
    expect(await used(u)).toBe(2);
    const rows = await asU(u, "select message_type, content from public.chat_history where user_id = $1 order by created_at, message_type desc", [u]);
    expect(rows.map((r) => r.message_type)).toEqual(["user", "assistant", "user"]);
  });

  it("ATTACK (review): delete the stored reply, re-send the same text → still charged; at 0 remaining → refused", async () => {
    const u = await newUser();
    for (let i = 0; i < 4; i++) await finish(u, (await consume(u, `q${i}`)).ticket, "a");
    const last = await consume(u, "go");                             // 5th = last free message
    await finish(u, last.ticket, "the answer");
    expect(await used(u)).toBe(5);
    const deleted = await h.asUser(u, (tx) => tx.query("delete from public.chat_history where user_id = $1", [u]));
    expect(deleted.affectedRows).toBe(10);                           // the client may delete its history…
    const again = await consume(u, "go");                            // …but the ledger remembers the delivery
    expect(again).toMatchObject({ ok: false, reason: "quota", quota: { remaining: 0, limit: 5 } });
    expect(await used(u)).toBe(5);
    expect(await asU(u, "select count(*)::int n from public.chat_history where user_id = $1", [u])).toEqual([{ n: 0 }]);
  });

  it("ATTACK: an in-flight message can't be replayed for free (claimed until finished or stale)", async () => {
    const u = await newUser();
    const a = await consume(u, "go");                                // streaming, not finished
    const b = await consume(u, "go");                                // parallel duplicate → a new, charged message
    expect(b).toMatchObject({ ok: true, retry: false });
    expect(await used(u)).toBe(2);
    await finish(u, a.ticket, "reply a");
    // a crashed instance never finishes: after 3 minutes the claim is stale → retry free
    await h.sql("update public.ai_usage set claimed_at = now() - interval '4 minutes' where ticket = $1", [b.ticket]);
    expect(await consume(u, "go")).toMatchObject({ ok: true, retry: true });
    expect(await used(u)).toBe(2);
  });

  it("the ledger and tickets are invisible to clients; other members' tickets do nothing; guests can't call", async () => {
    const u = await newUser();
    const other = await newUser();
    const a = await consume(u, "hello");
    await expect(asU(u, "select * from public.ai_usage")).rejects.toMatchObject(DENIED);
    await expect(asU(u, "update public.ai_usage set replied_at = null")).rejects.toMatchObject(DENIED);
    expect(await finish(other, a.ticket, null)).toBe(false);
    expect(await finish(other, a.ticket, "forged reply")).toBe(false);
    await expect(asA("select public.ai_consume('s', 'x')")).rejects.toMatchObject(DENIED);
    await expect(asU(u, "select public.ai_consume('bad id!', 'x')")).rejects.toThrow(/^invalid_argument$/);
    await expect(asU(u, "select public.ai_consume('s', '   ')")).rejects.toThrow(/^invalid_argument$/);
  });

  it("Elite is unlimited; the free limit counts the charged messages only", async () => {
    const u = await newUser();
    await h.sql("update public.profiles set is_elite = true where id = $1", [u]);
    for (let i = 0; i < 7; i++) expect(await consume(u, `m${i}`)).toMatchObject({ ok: true });
    const f = await newUser();
    for (let i = 0; i < 5; i++) expect(await consume(f, `m${i}`)).toMatchObject({ ok: true, retry: false });
    expect(await consume(f, "m5")).toMatchObject({ ok: false, reason: "quota" });
  });
});

describe("POST /api/chat end to end (route + PGlite)", () => {
  const ENV = "GEMINI_API_KEY";
  let saved;
  beforeAll(() => { saved = process.env[ENV]; process.env[ENV] = "placeholder-not-a-real-key"; });
  afterAll(() => { if (saved === undefined) delete process.env[ENV]; else process.env[ENV] = saved; });

  const serverFor = (uid) => ({
    auth: { getUser: async () => ({ data: { user: uid ? { id: uid } : null } }) },
    rpc: (fn, args) => rpcAs(uid, fn, args),
    from: () => { throw new Error("the chat route must not write tables directly"); },
  });
  const post = (text, sessionId = "s-1") => chatRoute(new Request("http://localhost/api/chat", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: text }], sessionId }),
  }));
  const drain = async (res) => { try { return await res.text(); } catch { return null; } };
  const used = (uid) => asU(uid, "select public.ai_quota() as r").then(one).then((q) => q.used);

  it("a delivered reply is stored by ai_finish; the review's delete-and-retry attack gets 429", async () => {
    const u = await newUser();
    globalThis.__jz13Server = serverFor(u);
    globalThis.__jz13Model = "ok";
    for (let i = 0; i < 5; i++) {
      const res = await post(i === 4 ? "go" : `question ${i}`);
      expect(res.status).toBe(200);
      expect(await drain(res)).toBe("partial answer");
    }
    expect(await used(u)).toBe(5);
    const [reply] = await asU(u, "select id from public.chat_history where user_id = $1 and message_type = 'assistant' order by created_at desc limit 1", [u]);
    await asU(u, "delete from public.chat_history where id = $1", [reply.id]);
    const calls = globalThis.__jz13ModelCalls;
    const res = await post("go");
    expect([res.status, res.headers.get("x-error-code")]).toEqual([429, "ai_quota_exhausted"]);
    expect(globalThis.__jz13ModelCalls).toBe(calls);                // the model was not reached
  });

  it("a reply that breaks mid-stream is not stored and its retry is free", async () => {
    const u = await newUser();
    globalThis.__jz13Server = serverFor(u);
    globalThis.__jz13Model = "fail";
    expect(await drain(await post("explain photosynthesis"))).toBeNull();   // the stream errors
    expect(await used(u)).toBe(1);
    globalThis.__jz13Model = "ok";
    const res = await post("explain photosynthesis");
    expect(await drain(res)).toBe("partial answer");
    expect(await used(u)).toBe(1);                                   // not charged twice
    const rows = await asU(u, "select message_type from public.chat_history where user_id = $1 order by created_at", [u]);
    expect(rows.map((r) => r.message_type)).toEqual(["user", "assistant"]);
  });

  it("ATTACK (review): 8 parallel requests with 1 message left → exactly 1 reaches the model", async () => {
    const u = await newUser();
    globalThis.__jz13Server = serverFor(u);
    globalThis.__jz13Model = "ok";
    for (let i = 0; i < 4; i++) await drain(await post(`warm up ${i}`));
    const before = globalThis.__jz13ModelCalls;
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => post(`parallel ${i}`)));
    const ok = results.filter((r) => r.status === 200);
    await Promise.all(ok.map(drain));
    expect(ok).toHaveLength(1);
    expect(results.filter((r) => r.status === 429)).toHaveLength(7);
    expect(globalThis.__jz13ModelCalls - before).toBe(1);
    expect(await used(u)).toBe(5);
  });
});

// ============================================================================
// B) Payments
// ============================================================================
describe("apply_payment_event (webhook state change, service role only)", () => {
  const apply = (o) => asS(
    `select public.apply_payment_event($1, $2, $3, $4::jsonb, $5::uuid, $6::boolean, $7, $8, $9::timestamptz, $10::timestamptz) as r`,
    [o.provider ?? "lemonsqueezy", o.id, o.type ?? "subscription_updated", JSON.stringify(o.raw ?? {}), o.user ?? null,
      o.entitled ?? null, o.sub ?? null, o.status ?? null, o.periodEnd ?? null, o.at ?? null]).then(one);
  const state = async (uid) => {
    const [p] = await h.sql("select is_elite from public.profiles where id = $1", [uid]);
    const [s] = await h.sql("select tier, status, provider_status, provider_subscription_id, provider_updated_at from public.subscriptions where user_id = $1", [uid]);
    return { elite: p.is_elite, ...s };
  };

  it("lifecycle events of ONE subscription each apply (per-delivery keys); duplicates are ignored", async () => {
    const u = await newUser();
    expect(await apply({ id: "e1", type: "subscription_created", user: u, entitled: true, sub: "77", status: "active", at: "2026-01-01T00:00:00Z" })).toBe("applied");
    expect(await state(u)).toMatchObject({ elite: true, tier: "elite", status: "active", provider_subscription_id: "77" });
    expect(await apply({ id: "e1", user: u, entitled: false, at: "2026-02-01T00:00:00Z" })).toBe("duplicate");
    expect((await state(u)).elite).toBe(true);
    expect(await apply({ id: "e2", type: "subscription_expired", user: u, entitled: false, sub: "77", status: "expired", at: "2026-03-01T00:00:00Z" })).toBe("applied");
    expect(await state(u)).toMatchObject({ elite: false, tier: "free", status: "inactive", provider_status: "expired" });
  });

  it("a late (older) event never re-grants Elite; record-only and unknown users change nothing", async () => {
    const u = await newUser();
    await apply({ id: "o1", user: u, entitled: false, status: "expired", at: "2026-05-01T00:00:00Z" });
    expect(await apply({ id: "o2", type: "subscription_payment_success", user: u, entitled: true, status: "active", at: "2026-04-01T00:00:00Z" })).toBe("stale");
    expect((await state(u)).elite).toBe(false);
    expect(await apply({ id: "o3", type: "subscription_invoice", user: u, entitled: null })).toBe("recorded");
    expect(await apply({ id: "o4", user: "00000000-0000-4000-8000-000000000000", entitled: true })).toBe("unknown_user");
    const recorded = await h.sql("select event_id from public.payment_events where event_id in ('o1','o2','o3','o4') order by 1");
    expect(recorded.map((r) => r.event_id)).toEqual(["o1", "o2", "o3", "o4"]);
  });

  it("a failed state change rolls the event back, so the provider's retry is processed", async () => {
    const u = await newUser();
    // force a failure after the event row is written: a bad timestamp for the subscription row
    await h.sql("alter table public.subscriptions add constraint jz13_test_fail check (current_period_end is null or current_period_end > '2000-01-01')");
    try {
      await expect(apply({ id: "f1", user: u, entitled: true, periodEnd: "1999-01-01T00:00:00Z" })).rejects.toThrow();
      expect(await h.sql("select 1 from public.payment_events where event_id = 'f1'")).toEqual([]);
    } finally {
      await h.sql("alter table public.subscriptions drop constraint jz13_test_fail");
    }
    expect(await apply({ id: "f1", user: u, entitled: true })).toBe("applied");
  });

  it("only the service role may call it", async () => {
    const u = await newUser();
    await expect(asU(u, "select public.apply_payment_event('x', 'z1', 't', '{}'::jsonb, $1::uuid, true, null, null, null, null)", [u]))
      .rejects.toMatchObject(DENIED);
    await expect(asA("select public.apply_payment_event('x', 'z2', 't', '{}'::jsonb, null, null, null, null, null, null)"))
      .rejects.toMatchObject(DENIED);
  });
});

// ============================================================================
// C) Shared rate limits
// ============================================================================
describe("rate_limit_hit (shared fixed window, service role only)", () => {
  it("counts per bucket + key within the window", async () => {
    const hit = (key, max = 3) => asS("select public.rate_limit_hit('test.bucket', $1, $2, 60) as r", [key, max]).then(one);
    expect([await hit("k1"), await hit("k1"), await hit("k1"), await hit("k1")]).toEqual([true, true, true, false]);
    expect(await hit("k2")).toBe(true);
    await expect(asS("select public.rate_limit_hit('BAD BUCKET', 'k', 1, 60)")).rejects.toThrow(/invalid_argument/);
  });
  it("is not callable (or readable) by browsers", async () => {
    const u = await newUser();
    await expect(asU(u, "select public.rate_limit_hit('x', 'k', 1, 60)")).rejects.toMatchObject(DENIED);
    await expect(asA("select public.rate_limit_hit('x', 'k', 1, 60)")).rejects.toMatchObject(DENIED);
    await expect(asU(u, "select * from public.rate_limits")).rejects.toMatchObject(DENIED);
  });
});

// ============================================================================
// E) Reaction privacy
// ============================================================================
describe("who liked / reposted / disliked what", () => {
  it("likes and reposts are visible only when the member shows that tab; dislikes only to their owner", async () => {
    const author = await newUser();
    const fan = await newUser();
    const viewer = await newUser();
    const [p] = await asU(author, "insert into public.community_posts (user_id, content) values ($1, 'hello') returning id", [author]);
    for (const t of ["post_likes", "post_reposts"]) await asU(fan, `insert into public.${t} (post_id, user_id) values ($1, $2)`, [p.id, fan]);
    await asU(viewer, "insert into public.post_dislikes (post_id, user_id) values ($1, $2)", [p.id, viewer]);
    const see = (uid, t, who) => (uid ? asU(uid, `select user_id from public.${t} where user_id = $1`, [who]) : asA(`select user_id from public.${t} where user_id = $1`, [who]));

    // defaults (tabs shown): visible to everyone
    expect(await see(viewer, "post_likes", fan)).toHaveLength(1);
    expect(await see(null, "post_reposts", fan)).toHaveLength(1);
    // hidden tabs: nobody else sees the rows; the member still does
    await asU(fan, "insert into public.user_social_settings (user_id, show_likes_on_profile, show_reposts_on_profile) values ($1, false, false)", [fan]);
    for (const t of ["post_likes", "post_reposts"]) {
      expect(await see(viewer, t, fan)).toEqual([]);
      expect(await see(null, t, fan)).toEqual([]);
      expect(await see(fan, t, fan)).toHaveLength(1);
    }
    // dislikes: own only (not even the post's author)
    expect(await see(author, "post_dislikes", viewer)).toEqual([]);
    expect(await see(null, "post_dislikes", viewer)).toEqual([]);
    expect(await see(viewer, "post_dislikes", viewer)).toHaveLength(1);
    // the counters and the member's own toggles keep working
    const [c] = await h.sql("select likes_count, dislikes_count, reposts_count from public.community_posts where id = $1", [p.id]);
    expect(c).toEqual({ likes_count: 1, dislikes_count: 1, reposts_count: 1 });
    expect((await h.asUser(viewer, (tx) => tx.query("delete from public.post_dislikes where post_id = $1 and user_id = $2", [p.id, viewer]))).affectedRows).toBe(1);
  });
});

// ============================================================================
// F) Hashtag / mention order
// ============================================================================
describe("index_post_entities keeps the first 10 tags in text order (what the UI links)", () => {
  it("the review's 12-tag example", async () => {
    const u = await newUser();
    const text = "#zeta #yak #xray #whale #vine #umbra #tango #sierra #romeo #quebec #papa #alpha #Zeta";
    const [p] = await asU(u, "insert into public.community_posts (user_id, content) values ($1, $2) returning id", [u, text]);
    const tags = await h.sql("select h.tag from public.post_hashtags ph join public.hashtags h on h.id = ph.hashtag_id where ph.post_id = $1", [p.id]);
    expect(tags.map((r) => r.tag).sort()).toEqual(["quebec", "romeo", "sierra", "tango", "umbra", "vine", "whale", "xray", "yak", "zeta"]);
  });
  it("mentions: the first 10 handles in order are notified", async () => {
    const actor = await newUser();
    const people = [];
    for (let i = 0; i < 12; i++) people.push(await newUser({ username: `mention_${String.fromCharCode(108 - i)}_${seq}` }));
    const handles = await Promise.all(people.map(async (id) => (await h.sql("select username from public.profiles where id = $1", [id]))[0].username));
    await asU(actor, "insert into public.community_posts (user_id, content) values ($1, $2)", [actor, handles.map((x) => `@${x}`).join(" ")]);
    const notified = await h.sql("select user_id from public.notifications where actor_id = $1 and type = 'mention'", [actor]);
    expect(notified.map((r) => r.user_id).sort()).toEqual(people.slice(0, 10).sort());
  });
});

// ============================================================================
// G) Drift fixes
// ============================================================================
describe("drift fixes", () => {
  it("profiles.updated_at is not client-writable; allowed changes still stamp it", async () => {
    const u = await newUser();
    await expect(asU(u, "update public.profiles set updated_at = '2000-01-01' where id = $1", [u])).rejects.toMatchObject(DENIED);
    const [{ updated_at: before }] = await h.sql("select updated_at from public.profiles where id = $1", [u]);
    await new Promise((r) => setTimeout(r, 5));
    await asU(u, "update public.profiles set show_elite_badge = false where id = $1", [u]);
    const [{ updated_at: after, show_elite_badge: shown }] = await h.sql("select updated_at, show_elite_badge from public.profiles where id = $1", [u]);
    expect(shown).toBe(false);
    expect(new Date(after).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
  });

  it("no SECURITY DEFINER function in public runs with a mutable search_path", async () => {
    const rows = await h.sql(
      `select p.proname, coalesce(array_to_string(p.proconfig, ','), '') cfg
         from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef`);
    const bad = rows.filter((r) => !/search_path=("")?(,|$)/.test(r.cfg)).map((r) => `${r.proname} [${r.cfg}]`);
    expect(bad).toEqual([]);
  });
});

// ============================================================================
// H) Exam XP cap
// ============================================================================
describe("exam XP: at most 300 per Riyadh day", () => {
  it("full marks keep scoring, XP stops at the cap", async () => {
    await h.sql(
      `insert into public.questions (key, exam, section, topic, difficulty, stem, choices, time_limit_seconds, source_id)
       select 'xpcap-' || lpad(g::text, 3, '0'), 'achievement', 'biology',
              (public.exam_section_topics('biology'))[1], 1::smallint, 'سؤال ' || g, '["أ","ب","ج","د"]'::jsonb, 30,
              (select id from public.question_sources where slug = 'jazira-original')
         from generate_series(1, 40) g
       on conflict do nothing`);
    await h.sql(
      `insert into public.question_keys (question_id, correct_index, explanation)
       select id, 0::smallint, 'x' from public.questions where key like 'xpcap-%' on conflict do nothing`);
    const u = await newUser();
    await h.sql("update public.profiles set is_elite = true where id = $1", [u]);
    const awarded = [];
    for (let i = 0; i < 5; i++) {
      const s = await asU(u, "select public.start_exam_attempt(p_exam => 'achievement', p_section => 'biology', p_count => 40) as r").then(one);
      const answers = s.questions.map((q) => ({ position: q.position, selected_index: 0 }));
      const res = await asU(u, "select public.submit_exam_attempt($1::uuid, $2::jsonb) as r", [s.attempt_id, JSON.stringify(answers)]).then(one);
      expect(res.attempt.correct_count).toBe(40);
      awarded.push(res.attempt.xp_awarded);
    }
    expect(awarded).toEqual([80, 80, 80, 60, 0]);
    expect((await h.sql("select xp from public.profiles where id = $1", [u]))[0].xp).toBe(300);
  });
});

// ============================================================================
// I) Sessions
// ============================================================================
describe("user_sessions geo columns", () => {
  it("accept a city and an ISO country code only", async () => {
    const u = await newUser();
    await asU(u, "insert into public.user_sessions (user_id, session_id, device_type, os, browser) values ($1, 's_geo', 'mobile', 'iOS', 'Safari')", [u]);
    await asU(u, "update public.user_sessions set city = 'Riyadh', country_code = 'SA', location = 'Riyadh, SA' where user_id = $1", [u]);
    await expect(asU(u, "update public.user_sessions set country_code = 'Saudi' where user_id = $1", [u])).rejects.toMatchObject({ code: "23514" });
  });
});

// ============================================================================
// Community read path of src/lib/social.js (0012 RPCs) — nothing linkable leaves the database
// ============================================================================
describe("src/lib/social.js reads anonymous content without its author", () => {
  const clientFor = (uid) => ({
    auth: { getSession: async () => ({ data: { session: uid ? { user: { id: uid } } : null } }) },
    rpc: (fn, args) => thenable(rpcAs(uid, fn, args)),
    from: () => { throw new Error("social.js must read posts/comments through the RPCs"); },
  });

  it("feed, permalink, comments and new-post count", async () => {
    const author = await newUser({ full_name: "Sara Otaibi" });
    const reader = await newUser();
    await h.sql("update public.profiles set anonymous_community = true where id = $1", [author]);
    const [p] = await asU(author, "insert into public.community_posts (user_id, content) values ($1, 'secret question') returning id, created_at", [author]);
    await asU(author, "insert into public.post_comments (post_id, user_id, content) values ($1, $2, 'my note')", [p.id, author]);
    const [pub] = await asU(reader, "insert into public.community_posts (user_id, content) values ($1, 'public post') returning id", [reader]);

    for (const [who, uid] of [["reader", reader], ["guest", null]]) {
      globalThis.__jz13Client = clientFor(uid);
      const page = await social.listPosts({ limit: 50 });
      const mine = page.items.find((x) => x.id === p.id);
      expect(mine, who).toMatchObject({ anonymous: true, mine: false, author: { anonymous: true } });
      expect(JSON.stringify(mine)).not.toContain(author);
      expect(JSON.stringify(mine)).not.toContain("Sara");
      const { post } = await social.getPost(p.id);
      expect(post).toMatchObject({ id: p.id, author: { anonymous: true } });
      const comments = await social.listComments(p.id);
      expect(comments.items).toHaveLength(1);
      expect(comments.items[0]).toMatchObject({ anonymous: true, author: { anonymous: true } });
      expect(JSON.stringify(comments)).not.toContain(author);
    }
    // the author sees it as their own (still shown anonymously)
    globalThis.__jz13Client = clientFor(author);
    const own = (await social.listPosts({ scope: "author", userId: author })).items;
    expect(own.map((x) => x.id)).toEqual([p.id]);
    expect(own[0]).toMatchObject({ mine: true, anonymous: true });
    // another member's author list never contains the anonymous post
    globalThis.__jz13Client = clientFor(reader);
    expect((await social.listPosts({ scope: "author", userId: author })).items).toEqual([]);
    // polling: new posts since the public post, own excluded; refresh by id
    expect(await social.countNewPosts({ since: "2000-01-01T00:00:00Z" })).toBeGreaterThanOrEqual(1);
    const rows = await social.refreshPosts([p.id, pub.id]);
    expect(rows.map((r) => r.id).sort()).toEqual([p.id, pub.id].sort());
    expect(rows.find((r) => r.id === p.id).author_id).toBeNull();
    // a tampered cursor is a first page, not an error
    await expect(social.listPosts({ cursor: { before: "'; drop table x", beforeId: "nope" } })).resolves.toMatchObject({ available: true });
    delete globalThis.__jz13Client;
  });
});
