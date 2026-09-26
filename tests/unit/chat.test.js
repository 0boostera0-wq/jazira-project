// Direct messages — pure logic (src/components/chat/messaging.js): thread layout,
// delete window, receipts, previews, unread, inbox ordering, composer state.
import { describe, it, expect } from "vitest";
import {
  buildThreadItems, canDeleteForAll, tickState, previewOf, isUnread, sortConversations, applyIncoming,
  mergeMessages, outgoingText, composerState, dayKey, relativeDay, listTimeFormat, dirOfText, DELETE_WINDOW_MS, MESSAGE_MAX,
} from "@/components/chat/messaging";

const ME = "me";
const OTHER = "other";
const at = (y, mo, d, h = 10, mi = 0) => new Date(y, mo - 1, d, h, mi).toISOString();
const msg = (id, sender, created_at, extra = {}) => ({ id, conversation_id: "c1", sender_id: sender, content: `m${id}`, created_at, ...extra });

describe("buildThreadItems", () => {
  it("inserts day separators and groups consecutive messages from one sender", () => {
    const items = buildThreadItems([
      msg("1", OTHER, at(2026, 9, 24, 22, 0)),
      msg("2", OTHER, at(2026, 9, 24, 22, 2)),
      msg("3", ME, at(2026, 9, 24, 22, 3)),
      msg("4", ME, at(2026, 9, 24, 22, 20)), // > 5 min later → new group
      msg("5", ME, at(2026, 9, 25, 8, 0)), // next day
    ], ME);
    expect(items.map((i) => (i.type === "day" ? `day:${i.key}` : `${i.message.id}${i.mine ? "m" : "t"}${i.groupStart ? "S" : ""}${i.groupEnd ? "E" : ""}`)))
      .toEqual(["day:2026-09-24", "1tS", "2tE", "3mSE", "4mSE", "day:2026-09-25", "5mSE"]);
  });
  it("handles an empty thread", () => expect(buildThreadItems([], ME)).toEqual([]));
});

describe("delete for everyone", () => {
  const now = Date.parse("2026-09-25T10:00:00Z");
  it("is allowed for my own messages within 30 minutes only", () => {
    expect(canDeleteForAll(msg("1", ME, "2026-09-25T09:40:00Z"), ME, now)).toBe(true);
    expect(canDeleteForAll(msg("1", ME, new Date(now - DELETE_WINDOW_MS - 1000).toISOString()), ME, now)).toBe(false);
    expect(canDeleteForAll(msg("1", OTHER, "2026-09-25T09:59:00Z"), ME, now)).toBe(false);
    expect(canDeleteForAll(msg("1", ME, "2026-09-25T09:59:00Z", { deleted_for_all: true }), ME, now)).toBe(false);
    expect(canDeleteForAll(msg("1", ME, "2026-09-25T09:59:00Z", { pending: true }), ME, now)).toBe(false);
  });
});

describe("receipts and previews", () => {
  it("derives tick state", () => {
    expect(tickState({ pending: true })).toBe("sending");
    expect(tickState({ failed: true })).toBe("failed");
    expect(tickState({ read_at: "x", delivered_at: "x" })).toBe("read");
    expect(tickState({ delivered_at: "x" })).toBe("delivered");
    expect(tickState({})).toBe("sent");
  });
  it("builds list previews", () => {
    expect(previewOf(null, ME)).toEqual({ kind: "none", mine: false, text: "" });
    expect(previewOf(msg("1", ME, at(2026, 9, 25), { content: "  hello \n there " }), ME)).toEqual({ kind: "text", mine: true, text: "hello there" });
    expect(previewOf(msg("1", OTHER, at(2026, 9, 25), { deleted_for_all: true, content: null }), ME)).toMatchObject({ kind: "deleted", mine: false });
    expect(previewOf(msg("1", OTHER, at(2026, 9, 25), { content: null, media_url: "https://x/y.png" }), ME)).toMatchObject({ kind: "media" });
  });
  it("marks unread only for newer messages from the other side", () => {
    const last = msg("1", OTHER, "2026-09-25T10:00:00Z");
    expect(isUnread({ last, lastReadAt: null }, ME)).toBe(true);
    expect(isUnread({ last, lastReadAt: "2026-09-25T09:00:00Z" }, ME)).toBe(true);
    expect(isUnread({ last, lastReadAt: "2026-09-25T10:00:01Z" }, ME)).toBe(false);
    expect(isUnread({ last: { ...last, sender_id: ME }, lastReadAt: null }, ME)).toBe(false);
    expect(isUnread({ last: { ...last, deleted_for_all: true }, lastReadAt: null }, ME)).toBe(false);
    expect(isUnread({ last: null }, ME)).toBe(false);
  });
});

describe("inbox ordering", () => {
  const a = { id: "a", last: msg("1", OTHER, "2026-09-25T08:00:00Z"), createdAt: "2026-09-01T00:00:00Z" };
  const b = { id: "b", last: null, createdAt: "2026-09-25T09:00:00Z" };
  const c = { id: "c", last: msg("2", OTHER, "2026-09-24T08:00:00Z"), createdAt: "2026-09-01T00:00:00Z" };
  it("sorts by latest activity", () => {
    expect(sortConversations([c, a, b]).map((x) => x.id)).toEqual(["b", "a", "c"]);
  });
  it("moves a conversation up when a message arrives and ignores older echoes", () => {
    const incoming = { ...msg("9", OTHER, "2026-09-25T11:00:00Z"), conversation_id: "c" };
    const res = applyIncoming([a, b, c], incoming);
    expect(res.known).toBe(true);
    expect(res.list.map((x) => x.id)).toEqual(["c", "b", "a"]);
    expect(res.list[0].last.id).toBe("9");
    const older = applyIncoming(res.list, { ...msg("0", OTHER, "2026-09-20T00:00:00Z"), conversation_id: "c" });
    expect(older.list[0].last.id).toBe("9");
    expect(applyIncoming([a], { ...incoming, conversation_id: "zzz" }).known).toBe(false);
  });
  it("merges messages by id in time order", () => {
    const merged = mergeMessages([msg("2", ME, "2026-09-25T10:01:00Z"), msg("1", OTHER, "2026-09-25T10:00:00Z")], [msg("2", ME, "2026-09-25T10:01:00Z", { read_at: "r" })]);
    expect(merged.map((m) => m.id)).toEqual(["1", "2"]);
    expect(merged[1].read_at).toBe("r");
  });
});

describe("composer", () => {
  it("normalises outgoing text", () => {
    expect(outgoingText("  hi \r\n there ")).toBe("hi \n there");
    expect(outgoingText("   ")).toBeNull();
    expect(outgoingText("x".repeat(MESSAGE_MAX + 1))).toBeNull();
  });
  it("derives who may write", () => {
    const req = (status, requesterId, recipientId) => ({ isRequest: true, request: { status, requesterId, recipientId } });
    expect(composerState({ isRequest: false }, ME)).toBe("ok");
    expect(composerState(req("pending", OTHER, ME), ME)).toBe("incomingRequest");
    expect(composerState(req("pending", ME, OTHER), ME)).toBe("requestSent");
    expect(composerState(req("rejected", ME, OTHER), ME)).toBe("declined");
    expect(composerState({ isRequest: false }, ME, { blockedByMe: true })).toBe("blockedByMe");
  });
});

describe("dirOfText", () => {
  it("follows the first strong letter", () => {
    expect(dirOfText("مرحبا Omar")).toBe("rtl");
    expect(dirOfText("12:30 Omar مرحبا")).toBe("ltr");
    expect(dirOfText("123")).toBeUndefined();
    expect(dirOfText(null)).toBeUndefined();
  });
});

describe("dates", () => {
  const now = new Date(2026, 8, 25, 12, 0);
  it("keys and labels days", () => {
    expect(dayKey(at(2026, 9, 5, 23, 59))).toBe("2026-09-05");
    expect(relativeDay("2026-09-25", now)).toBe("today");
    expect(relativeDay("2026-09-24", now)).toBe("yesterday");
    expect(relativeDay("2026-09-20", now)).toBeNull();
    expect(dayKey("nope")).toBe("");
  });
  it("picks a compact list time format", () => {
    expect(listTimeFormat(at(2026, 9, 25, 9), now).kind).toBe("time");
    expect(listTimeFormat(at(2026, 9, 21, 9), now).kind).toBe("weekday");
    expect(listTimeFormat(at(2026, 8, 1, 9), now).opts.year).toBeUndefined();
    expect(listTimeFormat(at(2025, 8, 1, 9), now).opts.year).toBe("numeric");
    expect(listTimeFormat("nope", now)).toBeNull();
  });
});
