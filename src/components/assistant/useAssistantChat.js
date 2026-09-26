"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CHAT_LIMITS, newSessionId } from "@/lib/chatStore";

// Conversation state + streaming for /api/chat.
//
// message = { id, role: "user"|"assistant", content,
//             status: "done" | "pending" | "streaming" | "stopped" | "error",
//             error?: "quota"|"signedOut"|"invalid"|"rateLimited"|"busy"|"unavailable"|"generic"|"network"|"interrupted",
//             quota?: { limit, resetsAt } }

let seq = 0;
const localId = (prefix) => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** Map a failed /api/chat response to a UI error (X-Error-Code first, then the status). */
export function errorFromResponse(res) {
  const code = res.headers.get("X-Error-Code");
  switch (code) {
    case "ai_quota_exhausted":
      return {
        error: "quota",
        quota: { limit: Number(res.headers.get("X-Quota-Limit")) || null, resetsAt: res.headers.get("X-Quota-Reset") || null },
      };
    case "not_authenticated":
      return { error: "signedOut" };
    case "invalid_request":
    case "empty_message":
    case "message_too_long":
    case "payload_too_large":
      return { error: "invalid" };
    case "rate_limited":
      return { error: "rateLimited" };
    case "ai_busy":
      return { error: "busy" };
    case "ai_unavailable":
      return { error: "unavailable" };
    default:
      if (res.status === 401) return { error: "signedOut" };
      if (res.status === 503) return { error: "unavailable" };
      return { error: "generic" };
  }
}

/**
 * Context sent to the server: user turns + assistant replies that exist,
 * newest last, bounded well under the route's body cap (the server trims
 * further to what the model receives).
 */
export function toHistory(messages, { maxTurns = 40, maxChars = 60000 } = {}) {
  const usable = messages
    .filter((m) => m.role === "user" || ((m.status === "done" || m.status === "stopped") && m.content.trim()))
    .map((m) => ({ role: m.role, content: m.content.slice(0, CHAT_LIMITS.maxReplyChars) }));
  const out = [];
  let chars = 0;
  for (let i = usable.length - 1; i >= 0 && out.length < maxTurns; i--) {
    if (out.length && chars + usable[i].content.length > maxChars) break;
    out.unshift(usable[i]);
    chars += usable[i].content.length;
  }
  return out;
}

export function useAssistantChat({ locale, onReplyDone, onQuotaExhausted }) {
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const listRef = useRef(messages);
  const sessionRef = useRef(null);
  const ctrlRef = useRef(null);
  const cbRef = useRef({ onReplyDone, onQuotaExhausted });
  cbRef.current = { onReplyDone, onQuotaExhausted };
  listRef.current = messages;

  const patch = useCallback((id, fields) => {
    setMessages((list) => list.map((m) => (m.id === id ? { ...m, ...fields } : m)));
  }, []);

  useEffect(() => () => ctrlRef.current?.abort(), []);

  const run = useCallback(async (history, assistantId) => {
    const controller = new AbortController();
    ctrlRef.current = controller;
    setBusy(true);
    let sid = sessionRef.current;
    const isNew = !sid;
    if (!sid) {
      sid = newSessionId();
      sessionRef.current = sid;
      setSessionId(sid);
    }
    const firstUser = history.find((m) => m.role === "user")?.content || "";
    let acc = "";
    let timer = 0;
    const flush = () => {
      timer = 0;
      patch(assistantId, { content: acc, status: "streaming" });
    };
    const done = (fields) => {
      if (timer) clearTimeout(timer);
      timer = 0;
      patch(assistantId, fields);
    };

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, sessionId: sid, locale }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const info = errorFromResponse(res);
        done({ status: "error", ...info });
        if (info.error === "quota") cbRef.current.onQuotaExhausted?.(info.quota);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { value, done: finished } = await reader.read();
        if (finished) break;
        acc += decoder.decode(value, { stream: true });
        // Batch renders (~16 per second) instead of one per network chunk.
        if (!timer) timer = setTimeout(flush, 60);
      }
      acc += decoder.decode();
      if (!acc.trim()) {
        done({ status: "error", error: "generic", content: "" });
        return;
      }
      done({ content: acc, status: "done" });
      cbRef.current.onReplyDone?.({ sessionId: sid, isNew, firstUser });
    } catch {
      if (controller.signal.aborted) {
        done({ content: acc, status: "stopped" });
        if (acc.trim()) cbRef.current.onReplyDone?.({ sessionId: sid, isNew, firstUser });
      } else {
        done({ content: acc, status: "error", error: acc ? "interrupted" : "network" });
      }
    } finally {
      if (ctrlRef.current === controller) ctrlRef.current = null;
      setBusy(false);
    }
  }, [locale, patch]);

  const send = useCallback((raw) => {
    const text = String(raw || "").trim();
    if (!text || ctrlRef.current) return false;
    const user = { id: localId("u"), role: "user", content: text, status: "done" };
    const bot = { id: localId("a"), role: "assistant", content: "", status: "pending" };
    const history = toHistory([...listRef.current, user]);
    setMessages((list) => [...list, user, bot]);
    run(history, bot.id);
    return true;
  }, [run]);

  /** Re-ask the user message that precedes a failed reply. */
  const retry = useCallback((assistantId) => {
    if (ctrlRef.current) return;
    const list = listRef.current;
    const idx = list.findIndex((m) => m.id === assistantId);
    if (idx < 1 || list[idx - 1].role !== "user") return;
    const bot = { id: localId("a"), role: "assistant", content: "", status: "pending" };
    const history = toHistory(list.slice(0, idx));
    setMessages([...list.slice(0, idx), bot, ...list.slice(idx + 1)]);
    run(history, bot.id);
  }, [run]);

  const stop = useCallback(() => ctrlRef.current?.abort(), []);

  const reset = useCallback(() => {
    ctrlRef.current?.abort();
    sessionRef.current = null;
    setSessionId(null);
    setTruncated(false);
    setMessages([]);
  }, []);

  /** Show a stored conversation and continue it. */
  const load = useCallback((id, rows, { truncated: cut = false } = {}) => {
    ctrlRef.current?.abort();
    sessionRef.current = id;
    setSessionId(id);
    setTruncated(cut);
    setMessages(rows.map((r) => ({ id: r.id || localId("h"), role: r.role, content: r.content || "", status: "done" })));
  }, []);

  return { messages, sessionId, busy, truncated, send, retry, stop, reset, load };
}
