"use client";

import { useCallback, useEffect, useState } from "react";
import { AI_FREE_LIMIT, AI_WINDOW_MS, STORAGE } from "@/lib/constants";

// Tracks free-tier AI usage: AI_FREE_LIMIT messages per rolling AI_WINDOW_MS
// window, keyed per user id so the limit follows the account. Elite users
// (identified by their subscription, tied to their user id) bypass it entirely.
export function useAiUsage(isElite, userId) {
  const storageKey = `${STORAGE.aiUsage}:${userId || "guest"}`;
  const [count, setCount] = useState(0);
  const [windowStart, setWindowStart] = useState(0);
  const [now, setNow] = useState(Date.now());

  // Load + reset expired window whenever the user changes.
  useEffect(() => {
    let saved = { count: 0, windowStart: 0 };
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) saved = JSON.parse(raw);
    } catch {}

    const t = Date.now();
    if (!saved.windowStart || t - saved.windowStart > AI_WINDOW_MS) {
      saved = { count: 0, windowStart: 0 };
    }
    setCount(saved.count);
    setWindowStart(saved.windowStart);
  }, [storageKey]);

  // Tick every second so the countdown UI stays live.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const persist = (c, ws) =>
    localStorage.setItem(storageKey, JSON.stringify({ count: c, windowStart: ws }));

  // Records a message if allowed. Elite => always allowed (no tracking needed).
  const consume = useCallback(() => {
    if (isElite) return true;

    const t = Date.now();
    let ws = windowStart;
    let c = count;

    if (!ws || t - ws > AI_WINDOW_MS) {
      ws = t;
      c = 0;
    }

    if (c >= AI_FREE_LIMIT) {
      setWindowStart(ws);
      setCount(c);
      persist(c, ws);
      return false;
    }

    c += 1;
    setWindowStart(ws);
    setCount(c);
    persist(c, ws);
    return true;
  }, [isElite, count, windowStart, storageKey]);

  const remaining = isElite ? Infinity : Math.max(0, AI_FREE_LIMIT - count);
  const limited = !isElite && remaining <= 0 && windowStart > 0;
  const msUntilReset = limited ? Math.max(0, windowStart + AI_WINDOW_MS - now) : 0;

  return { remaining, limited, msUntilReset, consume, isElite, limit: AI_FREE_LIMIT };
}

export function formatCountdown(ms) {
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
