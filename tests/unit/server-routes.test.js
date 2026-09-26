// Server-side hardening from the security review, without a database:
//   payments (signature, per-delivery keys, entitlement decisions, webhook route)
//   · local exam set tokens · shared-guard helpers · account deletion · session
//   touch · contact route · WhatsApp link · device codes.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";

vi.mock("@/lib/supabase-admin", () => ({ createAdminClient: () => globalThis.__jzAdmin ?? null }));
vi.mock("@/lib/supabase-server", () => ({
  createClient: async () => globalThis.__jzServer ?? null,
  getRouteUser: async () => ({ supabase: globalThis.__jzServer ?? null, user: globalThis.__jzRouteUser ?? null }),
}));

import { decideEntitlement, eventKey, isProductionEnv, verifySignature } from "@/lib/payments/lemonsqueezy";
import { POST as webhook } from "@/app/api/webhooks/lemonsqueezy/route";
import { signLocalSet, verifyLocalSet, GRADE_GRACE_MS } from "@/lib/exams/local-token";
import { clientIp, isSameOrigin, readJsonBody } from "@/lib/http-guards";
import { isRateLimited } from "@/lib/rate-limit";
import { POST as deleteAccount } from "@/app/api/account/delete/route";
import { POST as touchSession } from "@/app/api/session/touch/route";
import { POST as contact } from "@/app/api/contact/route";
import { supportWhatsAppUrl } from "@/lib/constants";
import { parseDevice } from "@/lib/device";

afterEach(() => {
  delete globalThis.__jzAdmin;
  delete globalThis.__jzServer;
  delete globalThis.__jzRouteUser;
});

// ── payments ────────────────────────────────────────────────────────────────
const SECRET = "whsec_test_only";
const UID = "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const CFG = { storeId: "123", variantId: "456", allowTestMode: false, now: Date.parse("2026-06-01T00:00:00Z") };
const sub = (attributes = {}, meta = {}) => ({
  meta: { event_name: "subscription_updated", custom_data: { user_id: UID }, ...meta },
  data: { type: "subscriptions", id: "999", attributes: { store_id: 123, variant_id: 456, status: "active", updated_at: "2026-05-01T00:00:00Z", renews_at: "2026-07-01T00:00:00Z", ...attributes } },
});
const order = (attributes = {}, meta = {}) => ({
  meta: { event_name: "order_created", custom_data: { user_id: UID }, ...meta },
  data: { type: "orders", id: "1", attributes: { store_id: 123, status: "paid", first_order_item: { variant_id: 456 }, updated_at: "2026-05-01T00:00:00Z", ...attributes } },
});

describe("Lemon Squeezy webhook logic", () => {
  it("verifySignature: hex HMAC in constant time; malformed or multi-byte signatures are false, never a throw", () => {
    const raw = JSON.stringify(sub());
    const good = createHmac("sha256", SECRET).update(raw).digest("hex");
    expect(verifySignature(raw, good, SECRET)).toBe(true);
    expect(verifySignature(raw, good.toUpperCase(), SECRET)).toBe(true);
    expect(verifySignature(raw + " ", good, SECRET)).toBe(false);
    expect(verifySignature(raw, "é".repeat(64), SECRET)).toBe(false);
    expect(verifySignature(raw, "x".repeat(64), SECRET)).toBe(false);
    expect(verifySignature(raw, good.slice(2), SECRET)).toBe(false);
    expect(verifySignature(raw, good, "")).toBe(false);
  });

  it("eventKey is per delivery: lifecycle events of one subscription differ, a retried delivery repeats", () => {
    const a = JSON.stringify(sub({ status: "active" }));
    const b = JSON.stringify(sub({ status: "cancelled", ends_at: "2026-07-01T00:00:00Z", updated_at: "2026-05-02T00:00:00Z" }));
    expect(eventKey(a)).not.toBe(eventKey(b));
    expect(eventKey(a)).toBe(eventKey(a));
    expect(eventKey(a)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("decides Elite from store, variant, test mode and status", () => {
    expect(decideEntitlement(sub(), CFG)).toMatchObject({ userId: UID, entitled: true, subscriptionId: "999", periodEnd: "2026-07-01T00:00:00.000Z", eventAt: "2026-05-01T00:00:00.000Z" });
    expect(decideEntitlement(sub({ status: "on_trial" }), CFG).entitled).toBe(true);
    expect(decideEntitlement(sub({ status: "past_due" }), CFG).entitled).toBe(true);
    // cancelled = paid period still running
    expect(decideEntitlement(sub({ status: "cancelled", ends_at: "2026-06-20T00:00:00Z" }), CFG)).toMatchObject({ entitled: true, reason: "cancelled_grace", periodEnd: "2026-06-20T00:00:00.000Z" });
    expect(decideEntitlement(sub({ status: "cancelled", ends_at: "2026-05-20T00:00:00Z" }), CFG)).toMatchObject({ entitled: false, reason: "cancelled_ended" });
    for (const status of ["expired", "unpaid", "paused"]) expect(decideEntitlement(sub({ status }), CFG).entitled).toBe(false);
    // record only
    expect(decideEntitlement(sub({ store_id: 777 }), CFG)).toMatchObject({ entitled: null, reason: "other_store" });
    expect(decideEntitlement(sub({ variant_id: 1 }), CFG)).toMatchObject({ entitled: null, reason: "other_variant" });
    expect(decideEntitlement(sub({}, { test_mode: true }), CFG)).toMatchObject({ entitled: null, reason: "test_mode" });
    expect(decideEntitlement(sub({}, { test_mode: true }), { ...CFG, allowTestMode: true }).entitled).toBe(true);
    expect(decideEntitlement(sub({ status: "weird" }), CFG)).toMatchObject({ entitled: null, reason: "unknown_status" });
    expect(decideEntitlement(sub({}, { custom_data: { user_id: "not-a-uuid" } }), CFG)).toMatchObject({ entitled: null, reason: "no_user" });
    expect(decideEntitlement(sub(), { ...CFG, variantId: "" })).toMatchObject({ entitled: null, reason: "not_configured" });
    // orders: only a PAID order of the Elite variant; refunds end it; invoices never decide
    expect(decideEntitlement(order(), CFG)).toMatchObject({ entitled: true, reason: "order_paid", subscriptionId: null });
    for (const status of ["pending", "failed"]) expect(decideEntitlement(order({ status }), CFG)).toMatchObject({ entitled: null, reason: "order_not_paid" });
    expect(decideEntitlement(order({ first_order_item: { variant_id: 1 } }), CFG)).toMatchObject({ entitled: null, reason: "other_variant" });
    expect(decideEntitlement(order({ status: "refunded" }, { event_name: "order_refunded" }), CFG)).toMatchObject({ entitled: false });
    const invoice = { meta: { event_name: "subscription_payment_success", custom_data: { user_id: UID } }, data: { type: "subscription-invoices", attributes: { store_id: 123, status: "paid" } } };
    expect(decideEntitlement(invoice, CFG)).toMatchObject({ entitled: null, reason: "not_entitling" });
  });

  it("isProductionEnv follows VERCEL_ENV, then NODE_ENV", () => {
    expect(isProductionEnv({ VERCEL_ENV: "production", NODE_ENV: "production" })).toBe(true);
    expect(isProductionEnv({ VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe(false);
    expect(isProductionEnv({ NODE_ENV: "production" })).toBe(true);
    expect(isProductionEnv({ NODE_ENV: "development" })).toBe(false);
  });
});

describe("POST /api/webhooks/lemonsqueezy", () => {
  const env = { LEMONSQUEEZY_WEBHOOK_SECRET: SECRET, LEMONSQUEEZY_STORE_ID: "123", LEMONSQUEEZY_VARIANT_ID: "456" };
  const saved = {};
  beforeEach(() => { for (const [k, v] of Object.entries(env)) { saved[k] = process.env[k]; process.env[k] = v; } });
  afterEach(() => { for (const k of Object.keys(env)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });
  const admin = (result = { data: "applied", error: null }) => {
    const calls = [];
    globalThis.__jzAdmin = { rpc: vi.fn(async (fn, args) => { calls.push([fn, args]); return result; }) };
    return calls;
  };
  const send = (body, sig) => {
    const raw = typeof body === "string" ? body : JSON.stringify(body);
    return webhook(new Request("http://localhost/api/webhooks/lemonsqueezy", {
      method: "POST", headers: { "x-signature": sig ?? createHmac("sha256", SECRET).update(raw).digest("hex") }, body: raw,
    }));
  };

  it("applies a verified event through apply_payment_event with a per-delivery key", async () => {
    const calls = admin();
    const res = await send(sub());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, result: "applied" });
    const [[fn, args]] = calls;
    expect(fn).toBe("apply_payment_event");
    expect(args).toMatchObject({ p_provider: "lemonsqueezy", p_user: UID, p_entitled: true, p_subscription_id: "999", p_provider_status: "active" });
    expect(args.p_event_id).toBe(eventKey(JSON.stringify(sub())));
  });

  it("rejects bad signatures (incl. multi-byte) with 401 and oversized bodies with 413; nothing recorded", async () => {
    const calls = admin();
    expect((await send(sub(), "é".repeat(64))).status).toBe(401);
    expect((await send(sub(), "0".repeat(64))).status).toBe(401);
    expect((await send("x".repeat(300 * 1024))).status).toBe(413);
    expect(calls).toEqual([]);
  });

  it("a failed database write is a 500 (so the provider retries), never a silent 200", async () => {
    admin({ data: null, error: { code: "XX000", message: "boom" } });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await send(sub())).status).toBe(500);
    } finally {
      err.mockRestore();
    }
  });

  it("records other-store / test events without a user (no entitlement change)", async () => {
    const calls = admin({ data: "recorded", error: null });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await send(sub({ store_id: 1 }));
      expect(calls[0][1]).toMatchObject({ p_user: null, p_entitled: null });
    } finally {
      warn.mockRestore();
    }
  });

  it("is off (501) without its configuration", async () => {
    delete process.env.LEMONSQUEEZY_VARIANT_ID;
    admin();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await send(sub())).status).toBe(501);
    } finally {
      err.mockRestore();
    }
  });
});

// ── local exam set tokens ─────────────────────────────────────────────────
describe("local exam set tokens", () => {
  it("round-trips, rejects tampering and expires a day after the deadline", () => {
    const expiresAt = Date.now() + 60_000;
    const token = signLocalSet({ keys: ["aq-001", "aq-002"], expiresAt });
    const ok = verifyLocalSet(token);
    expect(ok.ok).toBe(true);
    expect([...ok.keys]).toEqual(["aq-001", "aq-002"]);
    const [payload, sig] = token.split(".");
    const other = Buffer.from(JSON.stringify({ v: 1, k: ["aq-003"], e: expiresAt })).toString("base64url");
    expect(verifyLocalSet(`${other}.${sig}`)).toEqual({ ok: false, error: "invalid_token" });
    expect(verifyLocalSet(`${payload}.`)).toEqual({ ok: false, error: "invalid_token" });
    expect(verifyLocalSet(`${payload}.${sig}.x`)).toEqual({ ok: false, error: "invalid_token" });
    expect(verifyLocalSet(null)).toEqual({ ok: false, error: "invalid_token" });
    expect(verifyLocalSet(token, { now: expiresAt + GRADE_GRACE_MS + 1 })).toEqual({ ok: false, error: "expired" });
  });
});

// ── shared guards ─────────────────────────────────────────────────────────
describe("http guards and the shared rate limiter", () => {
  const req = (headers = {}, body) => new Request("https://jazira.example/api/x", { method: "POST", headers, body });
  it("same-origin, byte-capped JSON, client IP", async () => {
    expect(isSameOrigin(req({ "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isSameOrigin(req({ origin: "https://evil.example" }))).toBe(false);
    expect(isSameOrigin(req({ origin: "https://jazira.example", "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(await readJsonBody(req({}, JSON.stringify({ a: "ب".repeat(600) })), 1024)).toMatchObject({ ok: false, status: 413 });
    expect(await readJsonBody(req({}, "{bad"), 1024)).toMatchObject({ ok: false, status: 400 });
    expect(await readJsonBody(req({}, '{"a":1}'), 1024)).toEqual({ ok: true, value: { a: 1 } });
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
  });
  it("uses rate_limit_hit when the service role is there; falls back to memory otherwise", async () => {
    globalThis.__jzAdmin = { rpc: vi.fn(async () => ({ data: false, error: null })) };
    expect(await isRateLimited({ bucket: "t.shared", key: "k", max: 1, windowSeconds: 60 })).toBe(true);
    const [fn, args] = globalThis.__jzAdmin.rpc.mock.calls[0];
    expect(fn).toBe("rate_limit_hit");
    expect(args.p_key).toMatch(/^[0-9a-f]{40}$/);                      // hashed, never the raw key
    delete globalThis.__jzAdmin;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await isRateLimited({ bucket: "t.mem", key: "k", max: 2, windowSeconds: 60 })).toBe(false);
      expect(await isRateLimited({ bucket: "t.mem", key: "k", max: 2, windowSeconds: 60 })).toBe(false);
      expect(await isRateLimited({ bucket: "t.mem", key: "k", max: 2, windowSeconds: 60 })).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });
});

// ── account deletion ──────────────────────────────────────────────────────
describe("POST /api/account/delete", () => {
  const recent = new Date().toISOString();
  function setup({ lastSignIn = recent, files = {}, anon = [], removeError = null } = {}) {
    const removed = [];
    const deleted = [];
    const signOut = vi.fn(async () => ({}));
    globalThis.__jzServer = { auth: { getUser: async () => ({ data: { user: { id: UID, last_sign_in_at: lastSignIn } } }), signOut } };
    const storage = (bucket) => ({
      list: async (folder, { limit, offset }) => ({ data: (files[bucket] || []).slice(offset, offset + limit).map((name) => ({ id: name, name })), error: null }),
      remove: async (paths) => { if (removeError) return { error: removeError }; removed.push(...paths.map((p) => `${bucket}/${p}`)); return { error: null }; },
    });
    const query = { select: () => query, eq: () => query, like: () => query, order: () => query, range: async () => ({ data: anon.map((p) => ({ id: p, media_path: p })), error: null }) };
    globalThis.__jzAdmin = {
      storage: { from: storage },
      from: () => query,
      auth: { admin: { deleteUser: async (id) => { deleted.push(id); return { error: null }; } } },
    };
    return { removed, deleted, signOut };
  }
  const call = (headers = {}) => deleteAccount(new Request("http://localhost/api/account/delete", { method: "POST", headers }));

  it("cross-site → 403 before anything else", async () => {
    const s = setup();
    expect((await call({ origin: "https://evil.example" })).status).toBe(403);
    expect(s.deleted).toEqual([]);
  });

  it("an old sign-in → 401 reauth_required, the session is ended, nothing deleted", async () => {
    const s = setup({ lastSignIn: new Date(Date.now() - 3600_000).toISOString() });
    const res = await call();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "reauth_required" });
    expect(s.signOut).toHaveBeenCalled();
    expect(s.deleted).toEqual([]);
  });

  it("removes EVERY object (paged past 100/1000) incl. anonymous-post media, then deletes the user", async () => {
    const many = Array.from({ length: 1005 }, (_, i) => `${i}.jpg`);
    const s = setup({ files: { avatars: ["a.webp"], "post-media": many }, anon: ["anon/11111111-2222-4333-8444-555555555555/1.jpg"] });
    const res = await call();
    expect(res.status).toBe(200);
    expect(s.removed).toHaveLength(1 + 1005 + 1);
    expect(s.removed).toContain(`avatars/${UID}/a.webp`);
    expect(s.removed).toContain(`post-media/${UID}/1004.jpg`);
    expect(s.removed).toContain("post-media/anon/11111111-2222-4333-8444-555555555555/1.jpg");
    expect(s.deleted).toEqual([UID]);
  });

  it("a storage failure keeps the account (500 cleanup_failed) so a retry can finish the job", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const s = setup({ files: { avatars: ["a.webp"] }, removeError: { message: "boom" } });
      const res = await call();
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "cleanup_failed" });
      expect(s.deleted).toEqual([]);
    } finally {
      err.mockRestore();
    }
  });
});

// ── session touch ─────────────────────────────────────────────────────────
describe("POST /api/session/touch", () => {
  function server(missingColumns = false) {
    const updates = [];
    const q = (payload) => {
      const chain = { eq: () => chain, then: (ok) => ok({ error: missingColumns && "city" in payload ? { code: "42703" } : null }) };
      updates.push(payload);
      return chain;
    };
    globalThis.__jzServer = { auth: { getUser: async () => ({ data: { user: { id: UID } } }) }, from: () => ({ update: q }) };
    return updates;
  }
  const call = (body, headers = {}) => touchSession(new Request("http://localhost/api/session/touch", {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
  }));

  it("same-origin only; validates the session id; stores city + ISO country separately", async () => {
    const updates = server();
    expect((await call({ session_id: "s_1" }, { origin: "https://evil.example" })).status).toBe(403);
    expect(await (await call({ session_id: "x".repeat(500) })).json()).toEqual({ ok: false });
    expect(await (await call({ session_id: { $ne: 1 } })).json()).toEqual({ ok: false });
    const res = await call({ session_id: "s_abc-123" }, { "x-vercel-ip-city": "Riyadh", "x-vercel-ip-country": "SA" });
    expect(await res.json()).toEqual({ ok: true });
    expect(updates.at(-1)).toEqual({ location: "Riyadh, SA", city: "Riyadh", country_code: "SA" });
  });

  it("works on a database without the new columns", async () => {
    const updates = server(true);
    await call({ session_id: "s_1" }, { "x-vercel-ip-city": "Jeddah", "x-vercel-ip-country": "SA" });
    expect(updates.at(-1)).toEqual({ location: "Jeddah, SA" });
  });
});

// ── contact ───────────────────────────────────────────────────────────────
describe("POST /api/contact", () => {
  const good = { name: "Sara Ali", email: "sara@example.com", topic: "general", message: "Hello, a question about exams.", locale: "en" };
  const call = (body, headers = {}) => contact(new Request("http://localhost/api/contact", {
    method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 250)}`, ...headers }, body: JSON.stringify(body),
  }));
  function admin(result = { error: null }) {
    const rows = [];
    globalThis.__jzAdmin = { from: () => ({ insert: async (row) => { rows.push(row); return result; } }), rpc: async () => ({ data: true, error: null }) };
    return rows;
  }

  it("stores a valid message with the VERIFIED account, never a client-sent id", async () => {
    const rows = admin();
    globalThis.__jzRouteUser = { id: UID };
    const res = await call({ ...good, user_id: "00000000-0000-4000-8000-000000000000" });
    expect(res.status).toBe(200);
    expect(rows[0]).toEqual({ user_id: UID, name: "Sara Ali", email: "sara@example.com", topic: "general", message: "Hello, a question about exams.", locale: "en" });
  });

  it("validates, blocks cross-site, maps the database limit, and says unavailable without the service role", async () => {
    admin();
    expect((await call({ ...good, email: "nope" })).status).toBe(400);
    expect((await call(good, { origin: "https://evil.example" })).status).toBe(403);
    admin({ error: { message: "rate_limited", code: "P0001" } });
    expect((await call(good)).status).toBe(429);
    delete globalThis.__jzAdmin;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect((await call(good)).status).toBe(503);
    } finally {
      err.mockRestore();
      warn.mockRestore();
    }
  });

  it("limits each client IP to 5 messages an hour (shared limiter)", async () => {
    admin();
    globalThis.__jzAdmin.rpc = (() => { let n = 0; return async () => ({ data: ++n <= 5, error: null }); })();
    const ip = { "x-forwarded-for": "203.0.113.77" };
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await call(good, ip)).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });
});

// ── small helpers ─────────────────────────────────────────────────────────
describe("support link and device codes", () => {
  it("the WhatsApp link pre-fills only a message the caller localized", () => {
    expect(supportWhatsAppUrl()).toMatch(/^https:\/\/wa\.me\/\d+$/);
    expect(supportWhatsAppUrl("Hi, I need some help with Jazira")).toMatch(/\?text=Hi%2C%20I%20need%20some%20help%20with%20Jazira$/);
    expect(supportWhatsAppUrl("   ")).not.toContain("?text=");
  });
  it("parseDevice stores language-neutral codes", () => {
    expect(parseDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1"))
      .toMatchObject({ os: "iOS", browser: "Safari", deviceType: "mobile" });
    expect(parseDevice("curl/8.0")).toMatchObject({ os: "unknown", browser: "unknown", deviceType: "desktop", label: "unknown — unknown" });
  });
});
