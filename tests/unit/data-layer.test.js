// Client data layer fixes from the review, without a database:
//   notifications (anonymous actors, fallback keyset) · local practice mode
//   judged in server time (device clock skew) + signed question sets.
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/supabase-lazy", () => ({ getSupabase: async () => globalThis.__jzDataClient ?? null }));

import { listNotifications } from "@/lib/data/notifications";
import * as exams from "@/lib/data/exams";

afterEach(() => {
  delete globalThis.__jzDataClient;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const UID = "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const ACTOR = "11111111-2222-4333-8444-555555555555";

/** Chainable PostgREST-like fake: records calls per table; awaiting resolves respond(table, calls). */
function fakeClient({ rpc, respond }) {
  const log = [];
  return {
    log,
    auth: { getSession: async () => ({ data: { session: { user: { id: UID } } } }) },
    rpc: async (fn, args) => rpc(fn, args),
    from(table) {
      const calls = [];
      log.push({ table, calls });
      const chain = new Proxy({}, {
        get(_, prop) {
          if (prop === "then") return (ok, bad) => Promise.resolve(respond(table, calls)).then(ok, bad);
          return (...args) => { calls.push([prop, ...args]); return chain; };
        },
      });
      return chain;
    },
  };
}

describe("notifications: anonymous actors", () => {
  it("anonymous content (0012: no actor_id, data.anonymous) comes back as an anonymous actor, not 'someone'", async () => {
    globalThis.__jzDataClient = fakeClient({
      rpc: async () => ({
        data: [
          { id: "n1", type: "comment", read: false, created_at: "2026-09-01T10:00:00Z", actor_id: null, actor_anonymous: true, data: { anonymous: true } },
          { id: "n2", type: "like", read: false, created_at: "2026-09-01T09:00:00Z", actor_id: ACTOR, actor_anonymous: true, actor_full_name: "Hidden Name", actor_is_elite: true },
          { id: "n3", type: "follow", read: true, created_at: "2026-09-01T08:00:00Z", actor_id: ACTOR, actor_anonymous: false, actor_full_name: "Sara Ali" },
          { id: "n4", type: "exam_result", read: true, created_at: "2026-09-01T07:00:00Z", actor_id: null, actor_anonymous: false, data: {} },
        ],
        error: null,
      }),
      respond: () => ({ data: [], error: null }),
    });
    const { items } = await listNotifications({ limit: 10 });
    expect(items[0].actor).toMatchObject({ anonymous: true, id: null, full_name: null, is_elite: false });
    expect(items[1].actor).toMatchObject({ anonymous: true, id: null, full_name: null, is_elite: false });  // never linkable
    expect(items[2].actor).toMatchObject({ anonymous: false, id: ACTOR, full_name: "Sara Ali" });
    expect(items[3].actor).toBeNull();                                                                    // system
  });

  it("the table fallback pages on (created_at, id), so rows sharing the cursor's timestamp are not skipped", async () => {
    const client = fakeClient({
      rpc: async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }),
      respond: (table) => (table === "notifications"
        ? { data: [{ id: "n9", type: "comment", read: false, created_at: "2026-09-01T10:00:00Z", actor_id: null, data: { anonymous: true } }], error: null }
        : { data: [], error: null }),
    });
    globalThis.__jzDataClient = client;
    const res = await listNotifications({ limit: 1, before: "2026-09-01T10:00:00.5+00:00", beforeId: ACTOR });
    const q = client.log.find((l) => l.table === "notifications").calls;
    expect(q).toContainEqual(["or", `created_at.lt."2026-09-01T10:00:00.5+00:00",and(created_at.eq."2026-09-01T10:00:00.5+00:00",id.lt.${ACTOR})`]);
    expect(q.find(([m]) => m === "select")[1]).toMatch(/\bdata\b/);
    expect(res.items[0].actor).toMatchObject({ anonymous: true, id: null });
    // a tampered cursor never reaches the filter
    await listNotifications({ limit: 1, before: '2026-09-01"),or(id.gt.0', beforeId: "x" });
    const q2 = client.log.filter((l) => l.table === "notifications").at(-1).calls;
    expect(q2.some(([m]) => m === "or")).toBe(false);
  });
});

describe("local practice mode in server time", () => {
  function stubRoutes(serverNow) {
    const graded = [];
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      const body = JSON.parse(init.body);
      if (String(url).endsWith("/start")) {
        const started = new Date(serverNow);
        return new Response(JSON.stringify({
          mode: "local", exam: "aptitude", section: "quantitative", topic: null, difficulty: null,
          question_count: 2, requested_count: 2, limited: false, max_questions: 10, time_limit_seconds: 600,
          started_at: started.toISOString(), expires_at: new Date(serverNow + 600_000).toISOString(), token: "signed.set",
          questions: [1, 2].map((p) => ({ position: p, id: `k${p}`, key: `k${p}`, stem: "s", passage: null, choices: ["a", "b"], section: "quantitative", topic: "t", difficulty: 1, time_limit_seconds: 300 })),
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      graded.push(body);
      return new Response(JSON.stringify({
        mode: "local",
        items: body.answers.map((a, i) => ({ position: i + 1, question_id: a.key, key: a.key, selected_index: a.selected_index, correct_index: 0, is_correct: a.selected_index === 0 })),
        by_topic: [], summary: { correct: 1, total: 2, answered: 1, score_percent: 50 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }));
    return graded;
  }

  it("a device clock 15 min AHEAD of the server does not close a 10-minute attempt", async () => {
    const serverNow = Date.now();
    vi.useFakeTimers({ now: serverNow + 15 * 60_000, toFake: ["Date"] });            // the device is ahead
    const graded = stubRoutes(serverNow);
    const s = await exams.startExam({ exam: "aptitude", count: 2 });
    expect(s.mode).toBe("local");
    const saved = await exams.saveAnswer(s.attempt_id, 1, 0, { timeSpentSeconds: 5 });  // used to throw attempt_closed
    expect(saved.seconds_remaining).toBeGreaterThan(590);
    const g = await exams.getAttempt(s.attempt_id);
    expect(g.status).toBe("in_progress");
    const res = await exams.submitExam(s.attempt_id);
    expect(res.status).toBe("submitted");
    expect(res.attempt.duration_seconds).toBeLessThan(10);                          // not "15 minutes"
    expect(graded[0]).toEqual({ answers: [{ key: "k1", selected_index: 0 }, { key: "k2", selected_index: null }], token: "signed.set" });
  });

  it("a device clock BEHIND the server does not stretch the deadline", async () => {
    const serverNow = Date.now();
    vi.useFakeTimers({ now: serverNow - 20 * 60_000, toFake: ["Date"] });            // the device is 20 min behind
    stubRoutes(serverNow);
    const s = await exams.startExam({ exam: "aptitude", count: 2 });
    vi.setSystemTime(serverNow - 20 * 60_000 + 11 * 60_000);                        // 11 min later (server: past 10 + grace)
    await expect(exams.saveAnswer(s.attempt_id, 1, 0)).rejects.toMatchObject({ code: "attempt_closed" });
    expect((await exams.getAttempt(s.attempt_id)).status).toBe("expired");
  });
});

describe("search cache is scoped to the viewer (premium snippets never leak across a sign-out)", () => {
  it("another session user — or signing out — never gets the previous member's cached results", async () => {
    const { searchAll } = await import("@/lib/data/search");
    let user = { id: UID };
    const calls = [];
    globalThis.__jzDataClient = {
      auth: { getSession: async () => ({ data: { session: user ? { user } : null } }) },
      rpc: (fn, args) => {
        calls.push(user?.id ?? "anon");
        const p = Promise.resolve({ data: { questions: user ? [{ id: "premium-q" }] : [] }, error: null });
        return { then: (ok, ko) => p.then(ok, ko), abortSignal() { return this; } };
      },
    };
    expect((await searchAll("algebra")).questions).toEqual([{ id: "premium-q" }]);
    expect((await searchAll("algebra")).questions).toEqual([{ id: "premium-q" }]);   // cached for the same member
    user = null;                                                                     // SPA sign-out (no reload)
    expect((await searchAll("algebra")).questions).toEqual([]);
    user = { id: ACTOR };
    await searchAll("algebra");
    expect(calls).toEqual([UID, "anon", ACTOR]);
  });
});
