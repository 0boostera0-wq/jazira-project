// Direct messages — client data layer (src/components/chat/data.js) against a
// small chainable Supabase fake: query shape (explicit columns, keyset cursor),
// "delete for me" filtering, request/hidden filtering and block delegation.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase-lazy", () => ({ getSupabase: async () => globalThis.__jzChatSb ?? null }));
const social = {
  getBlockedIds: vi.fn(async () => new Set(["u-blocked"])),
  blockUser: vi.fn(async () => {}),
  unblockUser: vi.fn(async () => {}),
};
vi.mock("@/lib/social", () => social);

import { fetchProfiles, isBlockedByMe, listConversations, listMessages, setBlocked } from "@/components/chat/data";

/** Chainable PostgREST-like fake: every call is recorded; awaiting resolves `respond(calls)`. */
function fakeClient(respond) {
  const log = [];
  const from = (table) => {
    const calls = [["from", table]];
    log.push(calls);
    const settle = () => Promise.resolve(respond(table, calls));
    const chain = new Proxy({}, {
      get(_, prop) {
        if (prop === "then") return (ok, bad) => settle().then(ok, bad);
        if (prop === "maybeSingle" || prop === "single") return () => { calls.push([prop]); return settle(); };
        return (...args) => { calls.push([prop, ...args]); return chain; };
      },
    });
    return chain;
  };
  return { log, from };
}
const call = (calls, name) => calls.find(([n]) => n === name);
const ME = "me";
const msg = (id, created_at, extra = {}) => ({ id, conversation_id: "c1", sender_id: "other", content: id, created_at, deleted_for_all: false, ...extra });

beforeEach(() => {
  delete globalThis.__jzChatSb;
  vi.clearAllMocks();
});

describe("listMessages", () => {
  it("returns oldest → newest, drops messages I deleted for myself, keeps the cursor of the full page", async () => {
    const rows = [msg("m5", "2026-09-20T10:05:00Z"), msg("m4", "2026-09-20T10:04:00Z"), msg("m3", "2026-09-20T10:03:00Z")];
    const sb = fakeClient((table) => {
      if (table === "messages") return { data: rows, error: null };
      if (table === "message_deletes") return { data: [{ message_id: "m4" }], error: null };
      return { data: [], error: null };
    });
    globalThis.__jzChatSb = sb;
    const page = await listMessages("c1", { limit: 2 });
    expect(page.items.map((m) => m.id)).toEqual(["m5"]); // m4 hidden for me; m3 is the look-ahead row
    expect(page.nextCursor).toEqual({ before: "2026-09-20T10:04:00Z", beforeId: "m4" });
    const q = sb.log.find((c) => c[0][1] === "messages");
    expect(call(q, "select")[1]).not.toContain("*");
    expect(call(q, "limit")[1]).toBe(3);
    const md = sb.log.find((c) => c[0][1] === "message_deletes");
    expect(call(md, "in")).toEqual(["in", "message_id", ["m5", "m4"]]);
  });

  it("pages with a quoted (created_at, id) keyset filter and survives a missing message_deletes table", async () => {
    const sb = fakeClient((table) =>
      table === "message_deletes" ? { data: null, error: { code: "42P01" } } : { data: [msg("m1", "2026-09-19T08:00:00.123456+00:00")], error: null });
    globalThis.__jzChatSb = sb;
    const page = await listMessages("c1", { cursor: { before: "2026-09-20T10:04:00.5+00:00", beforeId: "m4" } });
    expect(page.items.map((m) => m.id)).toEqual(["m1"]);
    expect(page.nextCursor).toBeNull();
    const or = call(sb.log[0], "or")[1];
    expect(or).toBe('created_at.lt."2026-09-20T10:04:00.5+00:00",and(created_at.eq."2026-09-20T10:04:00.5+00:00",id.lt."m4")');
  });

  it("throws unavailable without Supabase", async () => {
    await expect(listMessages("c1")).rejects.toMatchObject({ code: "unavailable" });
  });
});

describe("listConversations", () => {
  it("hides hidden conversations and incoming requests, attaches profiles, last message and my request", async () => {
    const conv = (id, last, extra = {}, mine = {}) => ({
      id, is_request: false, last_message_at: last, created_at: "2026-09-01T00:00:00Z", created_by: ME,
      conversation_participants: [{ user_id: ME, last_read_at: null, muted: false, hidden: false, ...mine }, { user_id: `o-${id}`, last_read_at: null, muted: false, hidden: false }],
      ...extra,
    });
    const convs = [
      conv("a", "2026-09-20T10:00:00Z"),
      conv("b", "2026-09-19T10:00:00Z", {}, { hidden: true }),
      conv("c", "2026-09-18T10:00:00Z", { is_request: true }),
      conv("d", "2026-09-17T10:00:00Z", { is_request: true }),
    ];
    const sb = fakeClient((table, calls) => {
      if (table === "conversations") return { data: call(calls, "is") ? [] : convs, error: null };
      if (table === "profiles") return { data: [{ id: "o-a", full_name: "A" }, { id: "o-d", full_name: "D" }], error: null };
      if (table === "messages") {
        if (call(calls, "maybeSingle")) return { data: null, error: null }; // per-conversation fallback
        return { data: [{ id: "m1", conversation_id: "a", sender_id: "o-a", created_at: "2026-09-20T10:00:00Z" }], error: null };
      }
      if (table === "message_requests") {
        return { data: [
          { id: "r-c", conversation_id: "c", requester_id: "o-c", recipient_id: ME, status: "pending", created_at: "2026-09-18T09:00:00Z" },
          { id: "r-d", conversation_id: "d", requester_id: ME, recipient_id: "o-d", status: "rejected", created_at: "2026-09-17T09:00:00Z" },
        ], error: null };
      }
      return { data: null, error: null };
    });
    globalThis.__jzChatSb = sb;
    const { items, nextCursor } = await listConversations(ME, { limit: 10 });
    expect(items.map((c) => c.id)).toEqual(["a", "d"]);
    expect(items[0]).toMatchObject({ other: { id: "o-a" }, last: { id: "m1" }, request: null });
    expect(items[1].request).toEqual({ id: "r-d", status: "rejected", requesterId: ME, recipientId: "o-d" });
    expect(nextCursor).toBeNull();
    const profileQuery = sb.log.find((c) => c[0][1] === "profiles");
    expect(call(profileQuery, "select")[1]).toBe("id, username, full_name, avatar_url, is_elite, show_elite_badge");
  });
});

describe("profiles and blocks", () => {
  it("reads explicit public profile columns only", async () => {
    const sb = fakeClient(() => ({ data: [{ id: "x" }], error: null }));
    globalThis.__jzChatSb = sb;
    const map = await fetchProfiles(["x", "x", null]);
    expect([...map.keys()]).toEqual(["x"]);
    expect(call(sb.log[0], "in")).toEqual(["in", "id", ["x"]]);
    expect(call(sb.log[0], "select")[1]).not.toMatch(/\*|phone/);
  });

  it("goes through src/lib/social.js (shared blocked-ids cache, block ends the follow)", async () => {
    expect(await isBlockedByMe("u-blocked")).toBe(true);
    expect(await isBlockedByMe("someone")).toBe(false);
    expect(await isBlockedByMe(null)).toBe(false);
    expect(await setBlocked("u2", true)).toBe(true);
    expect(social.blockUser).toHaveBeenCalledWith("u2");
    expect(await setBlocked("u2", false)).toBe(false);
    expect(social.unblockUser).toHaveBeenCalledWith("u2");
  });
});
