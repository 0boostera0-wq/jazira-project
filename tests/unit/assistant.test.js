// Jazira Assistant — pure logic: the safe Markdown subset (src/components/
// assistant/markdown-parser.js) and the conversation store helpers (src/lib/chatStore.js).
import { describe, it, expect } from "vitest";
import { parseMarkdown, parseInline, safeInternalHref, inlineText, textDirection } from "@/components/assistant/markdown-parser";
import {
  prepareChatInput, groupSessions, mergeSessions, bucketSessions, deriveTitle, isValidSessionId, newSessionId, CHAT_LIMITS,
} from "@/lib/chatStore";

describe("safeInternalHref", () => {
  it("allows known in-app paths only", () => {
    expect(safeInternalHref("/exams")).toBe("/exams");
    expect(safeInternalHref("/exams/aptitude")).toBe("/exams/aptitude");
    expect(safeInternalHref("/curriculum?stage=middle#top")).toBe("/curriculum?stage=middle#top");
    expect(safeInternalHref("/")).toBe("/");
  });
  it("rejects external, protocol-relative, script and unknown paths", () => {
    for (const bad of [
      "https://evil.example", "//evil.example/x", "javascript:alert(1)", "/api/chat", "/auth/callback",
      "/unknown-page", "/exams/../api", "/exams//x", "mailto:a@b.c", "/exams\\x", "/en/exams", " /exams x",
    ]) expect(safeInternalHref(bad)).toBeNull();
  });
});

describe("parseInline", () => {
  it("parses bold, italic, inline code and internal links", () => {
    const nodes = parseInline("اقرأ **القاعدة** ثم *جرّب* `x+1` في [الاختبارات](/exams)");
    expect(nodes.map((n) => n.type)).toEqual(["text", "strong", "text", "em", "text", "code", "text", "link"]);
    expect(nodes[1].children[0].text).toBe("القاعدة");
    expect(nodes[5].text).toBe("x+1");
    expect(nodes[7]).toMatchObject({ type: "link", href: "/exams" });
  });
  it("drops external URLs but keeps their text", () => {
    const [node] = parseInline("[click](https://evil.example)");
    expect(node.type).toBe("span");
    expect(inlineText([node])).toBe("click");
    expect(JSON.stringify(node)).not.toContain("evil");
  });
  it("keeps HTML and unclosed markers as literal text", () => {
    expect(parseInline("<img src=x onerror=alert(1)>")).toEqual([{ type: "text", text: "<img src=x onerror=alert(1)>" }]);
    expect(parseInline("2 * 3 = 6 and **open")).toEqual([{ type: "text", text: "2 * 3 = 6 and **open" }]);
    expect(parseInline("a_b_c snake_case")).toEqual([{ type: "text", text: "a_b_c snake_case" }]);
  });
  it("turns single newlines into line breaks", () => {
    expect(parseInline("a\nb").map((n) => n.type)).toEqual(["text", "br", "text"]);
  });
});

describe("parseMarkdown", () => {
  it("splits paragraphs, lists, code, quotes, headings and rules", () => {
    const md = [
      "## خطوات الحل", "", "أولًا نقرأ السؤال.", "", "1. نحدد المعطيات", "2. نختار القانون", "   - مثال: السرعة", "3. نعوّض",
      "", "- نقطة", "- نقطة ثانية", "", "> ملاحظة", "", "---", "", "```js", "const a = 1;", "```",
    ].join("\n");
    const blocks = parseMarkdown(md);
    expect(blocks.map((b) => b.type)).toEqual(["h", "p", "ol", "ul", "quote", "hr", "code"]);
    const ol = blocks[2];
    expect(ol.items).toHaveLength(3);
    expect(ol.items[1].sub).toMatchObject({ type: "ul" });
    expect(inlineText(ol.items[1].sub.items[0].children)).toBe("مثال: السرعة");
    expect(blocks[6]).toMatchObject({ type: "code", lang: "js", text: "const a = 1;", open: false });
  });
  it("keeps the start number of an ordered list (Arabic-Indic digits too)", () => {
    expect(parseMarkdown("3. ج\n4. د")[0]).toMatchObject({ type: "ol", start: 3 });
    expect(parseMarkdown("١. أ\n٢. ب")[0]).toMatchObject({ type: "ol", start: 1 });
  });
  it("treats an unclosed fence (mid-stream) as an open code block", () => {
    const [p, code] = parseMarkdown("مثال:\n```python\nprint(1)");
    expect(p.type).toBe("p");
    expect(code).toMatchObject({ type: "code", lang: "python", text: "print(1)", open: true });
  });
  it("continues a list across blank lines and indented continuation lines", () => {
    const [list] = parseMarkdown("- a\n  more a\n\n- b");
    expect(list.items).toHaveLength(2);
    expect(inlineText(list.items[0].children)).toBe("a\nmore a");
  });
  it("tolerates empty and non-string input", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown(null)).toEqual([]);
  });
});

describe("textDirection", () => {
  it("follows the first strong letter", () => {
    expect(textDirection("١٢ النسبة **15%**")).toBe("rtl");
    expect(textDirection("**1.** Percent means النسبة")).toBe("ltr");
    expect(textDirection("123 + 456")).toBeUndefined();
  });
});

describe("prepareChatInput", () => {
  const u = (content) => ({ role: "user", content });
  const a = (content) => ({ role: "assistant", content });

  it("validates the last user message", () => {
    expect(prepareChatInput(null)).toEqual({ ok: false, error: "invalid_request" });
    expect(prepareChatInput([a("hi")])).toEqual({ ok: false, error: "invalid_request" });
    expect(prepareChatInput([u("   ")])).toEqual({ ok: false, error: "empty_message" });
    expect(prepareChatInput([u("x".repeat(CHAT_LIMITS.maxMessageChars + 1))])).toEqual({ ok: false, error: "message_too_long" });
    expect(prepareChatInput([u("  مرحبا  ")])).toEqual({ ok: true, text: "مرحبا", history: [] });
  });
  it("drops junk roles, merges same-role turns and starts with the user", () => {
    const res = prepareChatInput([a("greeting"), { role: "system", content: "evil" }, u("q1"), u("q1b"), a("r1"), { role: "user", content: 5 }, u("q2")]);
    expect(res.history).toEqual([{ role: "user", content: "q1\n\nq1b" }, { role: "assistant", content: "r1" }]);
    expect(res.text).toBe("q2");
  });
  it("never ends the context with a user turn (the new message follows)", () => {
    expect(prepareChatInput([u("failed earlier"), u("again")]).history).toEqual([]);
  });
  it("keeps only the newest turns within the budgets", () => {
    const many = [];
    for (let i = 0; i < 60; i++) many.push(u(`q${i}`), a(`r${i}`));
    many.push(u("last"));
    const res = prepareChatInput(many);
    expect(res.history.length).toBeLessThanOrEqual(CHAT_LIMITS.maxHistoryTurns);
    expect(res.history[res.history.length - 1]).toEqual({ role: "assistant", content: "r59" });
    expect(res.history[0].role).toBe("user");

    const big = [u("a".repeat(4000)), a("b".repeat(8000)), u("c".repeat(4000)), a("d".repeat(8000)), u("e".repeat(4000)), a("f".repeat(8000)), u("now")];
    const trimmed = prepareChatInput(big);
    const chars = trimmed.history.reduce((n, m) => n + m.content.length, 0);
    expect(chars).toBeLessThanOrEqual(CHAT_LIMITS.maxHistoryChars);
    expect(trimmed.history[0].role).toBe("user");
  });
});

describe("session helpers", () => {
  it("validates session ids", () => {
    expect(isValidSessionId(newSessionId())).toBe(true);
    expect(isValidSessionId("c_lz3k9a1b2")).toBe(true);
    expect(isValidSessionId("")).toBe(false);
    expect(isValidSessionId("a b")).toBe(false);
    expect(isValidSessionId("x".repeat(101))).toBe(false);
    expect(isValidSessionId(null)).toBe(false);
  });
  it("derives a one-line title", () => {
    expect(deriveTitle("  **اشرح**\n\n لي   الكسور ")).toBe("اشرح لي الكسور");
    expect(deriveTitle("x".repeat(100), 20)).toHaveLength(20);
    expect(deriveTitle("```js\ncode\n```")).toBe("");
  });

  const row = (session_id, created_at) => ({ session_id, created_at });
  it("groups rows by latest activity with a keyset cursor", () => {
    const rows = [
      row("a", "2026-09-25T10:00:00Z"), row("b", "2026-09-25T09:00:00Z"), row("a", "2026-09-25T08:00:00Z"),
      row("c", "2026-09-24T10:00:00Z"), row("d", "2026-09-23T10:00:00Z"),
    ];
    const page = groupSessions(rows, { limit: 2 });
    expect(page.sessions.map((s) => s.id)).toEqual(["a", "b"]);
    expect(page.sessions[0]).toMatchObject({ lastAt: "2026-09-25T10:00:00Z", firstSeenAt: "2026-09-25T08:00:00Z" });
    expect(page.nextCursor).toBe("2026-09-25T09:00:00Z");

    const rest = groupSessions(rows.filter((r) => r.created_at < page.nextCursor), { limit: 2 });
    expect(rest.sessions.map((s) => s.id)).toEqual(["a", "c"]);
    const merged = mergeSessions(page.sessions, rest.sessions);
    expect(merged.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });
  it("ends pagination when the scan was not full, continues when it was", () => {
    const rows = [row("a", "2026-09-25T10:00:00Z"), row("a", "2026-09-25T09:00:00Z")];
    expect(groupSessions(rows, { limit: 5 }).nextCursor).toBeNull();
    expect(groupSessions(rows, { limit: 5, scanFull: true }).nextCursor).toBe("2026-09-25T09:00:00Z");
    expect(groupSessions([], { limit: 5 })).toEqual({ sessions: [], nextCursor: null });
  });
  it("buckets sessions by local calendar day", () => {
    const now = new Date(2026, 8, 25, 12, 0, 0);
    const at = (d, h = 9) => ({ id: `${d}-${h}`, lastAt: new Date(2026, 8, d, h).toISOString() });
    const groups = bucketSessions([at(25), at(24, 23), at(24, 1), at(20), at(10)], now);
    expect(groups.map((g) => [g.key, g.items.length])).toEqual([["today", 1], ["yesterday", 2], ["week", 1], ["older", 1]]);
  });
});

describe("chat client helpers", async () => {
  const { toHistory, errorFromResponse } = await import("@/components/assistant/useAssistantChat");
  const msg = (role, content, status = "done") => ({ id: Math.random().toString(36), role, content, status });

  it("sends user turns and finished replies only, newest last", () => {
    const h = toHistory([msg("user", "q1"), msg("assistant", "", "error"), msg("user", "q2"), msg("assistant", "r2"), msg("assistant", "part", "stopped"), msg("assistant", "x", "streaming"), msg("user", "q3")]);
    expect(h).toEqual([
      { role: "user", content: "q1" }, { role: "user", content: "q2" }, { role: "assistant", content: "r2" },
      { role: "assistant", content: "part" }, { role: "user", content: "q3" },
    ]);
  });
  it("stays under the request body budget for long stored conversations", () => {
    const long = [];
    for (let i = 0; i < 200; i++) long.push(msg("user", `q${i}`), msg("assistant", "ب".repeat(19000)));
    long.push(msg("user", "latest"));
    const h = toHistory(long);
    expect(h[h.length - 1]).toEqual({ role: "user", content: "latest" });
    expect(h.length).toBeLessThanOrEqual(40);
    expect(new TextEncoder().encode(JSON.stringify({ messages: h })).length).toBeLessThan(CHAT_LIMITS.maxBodyBytes);
  });
  it("maps error responses to UI states", () => {
    const res = (status, headers = {}) => new Response("x", { status, headers });
    expect(errorFromResponse(res(429, { "X-Error-Code": "ai_quota_exhausted", "X-Quota-Limit": "5", "X-Quota-Reset": "2026-09-25T12:00:00.000Z" })))
      .toEqual({ error: "quota", quota: { limit: 5, resetsAt: "2026-09-25T12:00:00.000Z" } });
    expect(errorFromResponse(res(429, { "X-Error-Code": "rate_limited" }))).toEqual({ error: "rateLimited" });
    expect(errorFromResponse(res(503, { "X-Error-Code": "ai_busy" }))).toEqual({ error: "busy" });
    expect(errorFromResponse(res(400, { "X-Error-Code": "message_too_long" }))).toEqual({ error: "invalid" });
    expect(errorFromResponse(res(401))).toEqual({ error: "signedOut" });
    expect(errorFromResponse(res(503))).toEqual({ error: "unavailable" });
    expect(errorFromResponse(res(500))).toEqual({ error: "generic" });
  });
});
