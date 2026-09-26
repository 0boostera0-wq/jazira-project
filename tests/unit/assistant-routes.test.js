// Route handlers of the Jazira Assistant: /api/chat-history (pagination,
// validation, delete, no POST) and /api/chat input validation. Supabase is a
// small chainable fake; the model SDK fails loudly if it is ever reached.
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/supabase-server", () => ({
  createClient: async () => globalThis.__jzAsstSb ?? null,
  getRouteUser: async () => ({ supabase: null, user: null }),
}));
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    constructor() {
      throw new Error("model_contacted");
    }
  },
}));

import * as history from "@/app/api/chat-history/route";
import { POST as chatPost } from "@/app/api/chat/route";

afterEach(() => { delete globalThis.__jzAsstSb; });

/** Chainable PostgREST-like fake: every call is recorded; awaiting resolves `respond(calls)`. */
function fakeClient({ user = { id: "u1" }, respond = () => ({ data: [], error: null }) } = {}) {
  const log = [];
  const from = (table) => {
    const calls = [["from", table]];
    log.push(calls);
    const settle = () => Promise.resolve(respond(calls));
    const chain = new Proxy({}, {
      get(_, prop) {
        if (prop === "then") return (ok, bad) => settle().then(ok, bad);
        if (prop === "maybeSingle" || prop === "single") return () => { calls.push([prop]); return settle(); };
        return (...args) => { calls.push([prop, ...args]); return chain; };
      },
    });
    return chain;
  };
  return { log, from, auth: { getUser: async () => ({ data: { user } }) }, rpc: async () => ({ data: null, error: null }) };
}
const has = (calls, name, ...args) => calls.some(([n, ...a]) => n === name && args.every((x, i) => a[i] === x));
const get = (qs, headers = {}) => history.GET(new Request(`http://localhost/api/chat-history${qs}`, { headers }));
const del = (qs, headers = {}) => history.DELETE(new Request(`http://localhost/api/chat-history${qs}`, { method: "DELETE", headers }));

describe("GET /api/chat-history", () => {
  it("503 without Supabase, 401 when signed out", async () => {
    expect((await get("")).status).toBe(503);
    globalThis.__jzAsstSb = fakeClient({ user: null });
    expect((await get("")).status).toBe(401);
  });

  it("validates limit, before and session", async () => {
    globalThis.__jzAsstSb = fakeClient();
    for (const [qs, field] of [["?limit=0", "limit"], ["?limit=51", "limit"], ["?limit=abc", "limit"], ["?before=yesterday", "before"], ["?session=a%20b", "session"], ["?session=", "session"]]) {
      const res = await get(qs);
      expect(res.status, qs).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_argument", field });
    }
  });

  it("groups user messages into sessions with titles and a keyset cursor", async () => {
    const scan = [
      { session_id: "a", created_at: "2026-09-25T10:00:00Z" },
      { session_id: "b", created_at: "2026-09-25T09:00:00Z" },
      { session_id: "a", created_at: "2026-09-25T08:00:00Z" },
      { session_id: "c", created_at: "2026-09-24T08:00:00Z" },
    ];
    const sb = fakeClient({
      respond: (calls) => {
        if (has(calls, "select", "session_id, created_at")) return { data: scan, error: null };
        const sid = calls.find(([n, k]) => n === "eq" && k === "session_id")?.[2];
        return { data: { content: `  **first** question of ${sid}  ` }, error: null };
      },
    });
    globalThis.__jzAsstSb = sb;
    const res = await get("?limit=2&before=2026-09-26T00:00:00Z");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toEqual({
      sessions: [
        { id: "a", title: "first question of a", lastAt: "2026-09-25T10:00:00Z" },
        { id: "b", title: "first question of b", lastAt: "2026-09-25T09:00:00Z" },
      ],
      nextCursor: "2026-09-25T09:00:00Z",
    });
    const scanCalls = sb.log[0];
    expect(has(scanCalls, "eq", "user_id", "u1")).toBe(true);
    expect(has(scanCalls, "eq", "message_type", "user")).toBe(true);
    expect(has(scanCalls, "lt", "created_at", "2026-09-26T00:00:00Z")).toBe(true);
    expect(has(scanCalls, "limit", 24)).toBe(true);
    expect(scanCalls.some(([n, cols]) => n === "select" && cols === "*")).toBe(false);
  });

  it("returns one conversation oldest-first, capped at 200 messages", async () => {
    const rows = Array.from({ length: 201 }, (_, i) => ({
      id: `m${i}`, message_type: i % 2 ? "assistant" : "user", content: `c${i}`, created_at: new Date(Date.UTC(2026, 8, 25, 0, 0, 201 - i)).toISOString(),
    }));
    globalThis.__jzAsstSb = fakeClient({ respond: () => ({ data: rows, error: null }) });
    const body = await (await get("?session=abc-123")).json();
    expect(body.truncated).toBe(true);
    expect(body.messages).toHaveLength(200);
    expect(body.messages[0]).toMatchObject({ id: "m199", role: "assistant" });
    expect(body.messages[199]).toMatchObject({ id: "m0", role: "user", content: "c0" });
  });

  it("maps a missing table to 503 and other errors to 500", async () => {
    globalThis.__jzAsstSb = fakeClient({ respond: () => ({ data: null, error: { code: "42P01", message: "missing" } }) });
    expect((await get("")).status).toBe(503);
    globalThis.__jzAsstSb = fakeClient({ respond: () => ({ data: null, error: { code: "XX000", message: "boom" } }) });
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await get("")).status).toBe(500);
    quiet.mockRestore();
  });
});

describe("DELETE /api/chat-history", () => {
  it("is same-origin only and deletes the caller's rows of one session", async () => {
    const sb = fakeClient({ respond: () => ({ data: null, error: null }) });
    globalThis.__jzAsstSb = sb;
    expect((await del("?session=abc", { origin: "https://evil.example" })).status).toBe(403);
    expect((await del("?session=abc", { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await del("?session=../x")).status).toBe(400);
    const res = await del("?session=abc", { origin: "http://localhost" });
    expect(res.status).toBe(200);
    const calls = sb.log[0];
    expect(has(calls, "delete")).toBe(true);
    expect(has(calls, "eq", "user_id", "u1")).toBe(true);
    expect(has(calls, "eq", "session_id", "abc")).toBe(true);
  });

  it("no longer accepts POST (clients cannot insert forged rows)", () => {
    expect(history.POST).toBeUndefined();
  });
});

describe("POST /api/chat input validation", () => {
  const post = (body, headers = {}) =>
    chatPost(new Request("http://localhost/api/chat", {
      method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body),
    }));

  it("rejects cross-site requests before anything else", async () => {
    const res = await post({ messages: [] }, { "sec-fetch-site": "cross-site" });
    expect(res.status).toBe(403);
    expect(res.headers.get("x-error-code")).toBe("forbidden");
  });

  it("returns stable error codes with localized neutral text", async () => {
    globalThis.__jzAsstSb = fakeClient();
    const bad = await post("{nope");
    expect([bad.status, bad.headers.get("x-error-code")]).toEqual([400, "invalid_request"]);
    const empty = await post({ messages: [{ role: "user", content: "   " }], locale: "en" });
    expect([empty.status, empty.headers.get("x-error-code"), await empty.text()]).toEqual([400, "empty_message", "The message is empty."]);
    const long = await post({ messages: [{ role: "user", content: "x".repeat(4001) }] });
    expect([long.status, long.headers.get("x-error-code")]).toEqual([400, "message_too_long"]);
    const forged = await post({ messages: [{ role: "assistant", content: "hi" }] });
    expect(forged.headers.get("x-error-code")).toBe("invalid_request");
    // the body cap is in bytes: ~140k Arabic letters are ~280 KB of UTF-8
    const big = await post({ messages: [{ role: "assistant", content: "ب".repeat(140000) }, { role: "user", content: "hi" }] });
    expect([big.status, big.headers.get("x-error-code")]).toEqual([413, "payload_too_large"]);
    globalThis.__jzAsstSb = fakeClient({ user: null });
    const out = await post({ messages: [{ role: "user", content: "hi" }] });
    expect([out.status, out.headers.get("x-error-code")]).toEqual([401, "not_authenticated"]);
    expect(await out.text()).not.toMatch(/gemini|google/i);
  });
});


// Migration 0013: the quota decision, the stored user message and the charge
// are ONE database call (ai_consume); retries of an undelivered reply are
// decided by the server's ledger (tests/db/hardening-0013.test.js), never by
// chat rows the client could delete.
describe("POST /api/chat quota contract (ai_consume / ai_finish)", () => {
  const post = (body = { messages: [{ role: "user", content: "hi" }], sessionId: "s-1" }) =>
    chatPost(new Request("http://localhost/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  const saved = process.env.GEMINI_API_KEY;
  afterEach(() => {
    if (saved === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = saved;
  });
  const withRpc = (impl) => {
    const sb = fakeClient();
    sb.rpc = vi.fn(impl);
    globalThis.__jzAsstSb = sb;
    return sb;
  };
  const inserts = (sb) => sb.log.filter((calls) => calls.some(([n]) => n === "insert"));

  it("a granted request (new or retry) reaches the model; the route never writes chat_history itself", async () => {
    process.env.GEMINI_API_KEY = "placeholder-not-a-real-key"; // the SDK is mocked and throws "model_contacted"
    for (const retry of [false, true]) {
      const sb = withRpc(async () => ({ data: { ok: true, retry, ticket: "7b0e3f8c-1b1d-4c55-9a51-0e8f2b9b6f10" }, error: null }));
      await expect(post()).rejects.toThrow("model_contacted");
      expect(sb.rpc).toHaveBeenCalledWith("ai_consume", { p_session: "s-1", p_content: "hi" });
      expect(inserts(sb)).toEqual([]);
    }
  });

  it("an exhausted quota → 429 with the quota headers, model never reached", async () => {
    process.env.GEMINI_API_KEY = "placeholder-not-a-real-key";
    const resets = new Date(Date.now() + 3600_000).toISOString();
    withRpc(async () => ({ data: { ok: false, reason: "quota", quota: { unlimited: false, limit: 5, used: 5, remaining: 0, resets_at: resets } }, error: null }));
    const res = await post();
    expect([res.status, res.headers.get("x-error-code")]).toEqual([429, "ai_quota_exhausted"]);
    expect(res.headers.get("x-quota-limit")).toBe("5");
    expect(res.headers.get("x-quota-remaining")).toBe("0");
    expect(res.headers.get("x-quota-reset")).toBe(resets);
  });

  it("fails closed: no ai_consume() (not migrated) or a database error → 503; bad input → 400", async () => {
    process.env.GEMINI_API_KEY = "placeholder-not-a-real-key";
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      for (const error of [{ code: "PGRST202", message: "Could not find the function" }, { code: "42883", message: "x" }, { code: "XX000", message: "boom" }]) {
        const sb = withRpc(async () => ({ data: null, error }));
        const res = await post();
        expect([res.status, res.headers.get("x-error-code")]).toEqual([503, "ai_unavailable"]);
        expect(inserts(sb)).toEqual([]);
      }
      withRpc(async () => ({ data: null, error: { code: "P0001", message: "invalid_argument" } }));
      expect((await post()).status).toBe(400);
      withRpc(async () => ({ data: { unexpected: true }, error: null }));
      expect((await post()).status).toBe(503);
    } finally {
      warn.mockRestore();
    }
  });
});
