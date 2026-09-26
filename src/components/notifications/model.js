// ============================================================================
// Notifications — pure view model (no React, no Supabase). Unit-tested in
// tests/unit/notifications-model.test.js.
//
//   filterItems(items, filter)        all · unread · mentions · exams
//   newerItems(loaded, page)          rows newer than the loaded head (live check)
//   dayOf(iso, now)                   "today" | "yesterday" | "earlier" (viewer's calendar)
//   buildFeed(items, now)             [{ day, groups: [group] }] — same type + target aggregated per day
//   notificationHref(n)               where an item leads (null = nothing to open)
//   describe(group, t, locale)        { text, detail } localized sentence (Arabic plural forms)
//
// Items are the normalized rows of listNotifications() (src/lib/data/notifications.js).
// ============================================================================

import { formatPercent } from "@/i18n/format";

export const FILTERS = ["all", "unread", "mentions", "exams"];
const EXAM_TYPES = new Set(["exam_result", "achievement"]);

export function matchesFilter(n, filter) {
  if (filter === "unread") return !n.read;
  if (filter === "mentions") return n.type === "mention";
  if (filter === "exams") return EXAM_TYPES.has(n.type);
  return true;
}

export const filterItems = (items, filter) => (items || []).filter((n) => matchesFilter(n, filter));

/** Merge a new page into the loaded list (keyset pages never overlap, but stay safe). */
export function mergePages(prev, next) {
  const seen = new Set((prev || []).map((n) => n.id));
  return [...(prev || []), ...(next || []).filter((n) => !seen.has(n.id))];
}

/**
 * Rows of a freshly fetched first page that are newer than the loaded list's
 * head and not loaded yet (the "new notifications" button).
 */
export function newerItems(loaded, page) {
  const list = loaded || [];
  const known = new Set(list.map((n) => n.id));
  const headMs = list.length ? Date.parse(list[0].created_at) : -Infinity;
  return (page || []).filter((n) => !known.has(n.id) && !(Date.parse(n.created_at) < headMs));
}

/** Mark ids read (or unread with read=false) immutably. */
export function setRead(items, ids, read = true) {
  const set = ids === null ? null : new Set(ids);
  return (items || []).map((n) => (set === null || set.has(n.id) ? (n.read === read ? n : { ...n, read }) : n));
}

// ── day buckets (the viewer's local calendar) ──────────────────────────────
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function dayOf(iso, now = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "earlier";
  const today = startOfDay(now instanceof Date ? now : new Date(now));
  const day = startOfDay(d);
  if (day >= today) return "today";
  const yesterday = startOfDay(new Date(today - 12 * 3600 * 1000)); // DST-safe "previous day"
  if (day >= yesterday) return "yesterday";
  return "earlier";
}

export const DAY_ORDER = ["today", "yesterday", "earlier"];

// ── aggregation ────────────────────────────────────────────────────────────
// Which types collapse into one row per day, and on what target.
const AGGREGATE_ON = {
  like: "post",
  repost: "post",
  comment: "post",
  follow: "self",
  message: "conversation",
};

export function aggregateKey(n, day) {
  const on = AGGREGATE_ON[n.type];
  if (!on) return `one:${n.id}`;
  if (on === "post") return n.post_id ? `${day}|${n.type}|post:${n.post_id}` : `one:${n.id}`;
  if (on === "conversation") return n.conversation_id ? `${day}|${n.type}|conv:${n.conversation_id}` : `one:${n.id}`;
  return `${day}|${n.type}`;
}

/**
 * The actor of a row. Since 0012 anonymous content stores no actor at all
 * (actor_id null + data.anonymous = true): that is "an anonymous member",
 * not "someone".
 */
export const actorOf = (n) => n?.actor || (n?.data?.anonymous === true ? { id: null, anonymous: true } : null);

/** Distinct actors, newest first (anonymous actors stay distinct by id). */
export function uniqueActors(items) {
  const seen = new Set();
  const out = [];
  for (const n of items) {
    const a = actorOf(n);
    if (!a) continue;
    const key = a.id || `anon:${n.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

/**
 * Group items (newest first) per day, collapsing repeats of the same type +
 * target. Group order follows each group's newest item.
 * @returns {{ day: string, groups: object[] }[]}
 */
export function buildFeed(items, now = new Date()) {
  const byKey = new Map();
  const order = [];
  for (const n of items || []) {
    const day = dayOf(n.created_at, now);
    const key = aggregateKey(n, day);
    let g = byKey.get(key);
    if (!g) {
      g = { key, day, type: n.type, lead: n, items: [] };
      byKey.set(key, g);
      order.push(g);
    }
    g.items.push(n);
  }
  const groups = order.map((g) => {
    const unreadIds = g.items.filter((n) => !n.read).map((n) => n.id);
    return {
      ...g,
      id: g.lead.id,
      created_at: g.lead.created_at,
      actors: uniqueActors(g.items),
      unreadIds,
      read: unreadIds.length === 0,
      count: g.items.length,
      snippet: g.items.find((n) => n.post_snippet)?.post_snippet || null,
      href: notificationHref(g.lead),
    };
  });
  return DAY_ORDER.map((day) => ({ day, groups: groups.filter((g) => g.day === day) })).filter((s) => s.groups.length);
}

// ── targets ────────────────────────────────────────────────────────────────
const enc = encodeURIComponent;
const isInternalPath = (u) => typeof u === "string" && /^\/(?![/\\])[^\s]*$/.test(u) && u.length <= 300;

/** Where a notification leads. Never trusts `data` except for system types. */
export function notificationHref(n) {
  if (!n) return null;
  switch (n.type) {
    case "like":
    case "repost":
    case "comment":
    case "mention":
      // The post permalink (/community/post/[id]) shows the post with its comments.
      return n.post_id ? `/community/post/${enc(n.post_id)}` : "/community";
    case "follow":
      return n.actor?.username && !n.actor.anonymous ? `/u/${enc(n.actor.username)}` : null;
    case "message":
    case "message_request":
    case "request_accepted":
      // Opens the conversation read-only. Never /chat?to=… — that calls
      // start_conversation(), which would ACCEPT a pending request.
      return n.conversation_id ? `/chat?c=${enc(n.conversation_id)}` : "/chat";
    case "exam_result": {
      const id = n.data?.attempt_id;
      return typeof id === "string" && /^[0-9a-f-]{16,64}$/i.test(id) ? `/exams/attempt/${enc(id)}` : "/exams/history";
    }
    case "achievement":
      return "/achievements";
    case "system": {
      const u = n.data?.url ?? n.data?.href;
      return isInternalPath(u) ? u : null;
    }
    default:
      return null;
  }
}

/** Direction for user content: any Arabic letter → rtl (a post may start with an @handle). */
export const textDir = (s) => (/[\u0600-\u06FF]/.test(String(s || "")) ? "rtl" : "ltr");

/**
 * Wrap @handles in LTR isolates (U+2066 \u2026 U+2069) so "@sara_a" never renders
 * as "sara_a@" inside Arabic text. Same handle grammar as community/model.js.
 */
export const isolateHandles = (s) =>
  String(s || "").replace(/(^|\s)(@[0-9A-Za-z_]{2,30})/g, (m, pre, handle) => `${pre}\u2066${handle}\u2069`);

// ── copy ───────────────────────────────────────────────────────────────────
export function actorName(actor, t) {
  if (!actor) return t("actors.someone");
  if (actor.anonymous) return t("actors.anonymous");
  return actor.full_name || t("actors.member");
}

/** "سارة" · "سارة وعمر" · "سارة و3 آخرين" (Arabic plural forms come from the message file). */
export function actorsPhrase(actors, t) {
  const list = actors || [];
  if (list.length === 0) return t("actors.someone");
  const name = actorName(list[0], t);
  if (list.length === 1) return name;
  if (list.length === 2) return t("actors.two", { name, name2: actorName(list[1], t) });
  return t("actors.many", { name, count: list.length - 1 });
}

const EXAMS = ["aptitude", "achievement"];
const SECTIONS = ["quantitative", "verbal", "math", "physics", "chemistry", "biology"];

function examLabel(data, t) {
  const exam = EXAMS.includes(data?.exam) ? t(`exams.${data.exam}`) : t("exams.generic");
  const section = SECTIONS.includes(data?.section) ? t(`exams.sections.${data.section}`) : null;
  return section ? t("exams.withSection", { exam, section }) : exam;
}

const str = (v, max = 160) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** "ar" | "en" from the first strong letter (null when there is none). */
export function langOfText(s) {
  const m = /[A-Za-zÀ-ɏ]|[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/.exec(String(s || ""));
  if (!m) return null;
  return /[A-Za-zÀ-ɏ]/.test(m[0]) ? "en" : "ar";
}

/**
 * Server-authored copy of achievement / system rows, in the viewer's language:
 * data.<field>_<locale> (e.g. title_ar / title_en), else the other language,
 * else the legacy single-language data.<field>. → { text, lang } | null —
 * `lang` marks copy that isn't in the UI language (lang + dir on render).
 */
export function localizedData(data, field, locale, max = 160) {
  const other = locale === "ar" ? "en" : "ar";
  const own = str(data?.[`${field}_${locale}`], max);
  if (own) return { text: own, lang: locale };
  const alt = str(data?.[`${field}_${other}`], max);
  if (alt) return { text: alt, lang: other };
  const legacy = str(data?.[field], max);
  return legacy ? { text: legacy, lang: langOfText(legacy) } : null;
}

/**
 * Localized sentence for a group.
 * @returns {{ text: string, detail: string|null, emphasis: string|null, lang?: string|null, detailLang?: string|null }}
 *   emphasis = the actors phrase inside `text` (rendered bold), or null;
 *   lang / detailLang = language of server-authored copy (achievement, system)
 */
export function describe(group, t, locale) {
  const n = group.lead;
  const actors = actorsPhrase(group.actors, t);
  const count = group.count;
  switch (group.type) {
    case "like":
    case "repost":
    case "mention":
    case "message_request":
    case "request_accepted":
      return { text: t(`types.${group.type}`, { actors }), detail: null, emphasis: actors };
    case "comment":
    case "follow":
    case "message":
      return { text: t(`types.${group.type}`, { actors, count }), detail: null, emphasis: actors };
    case "exam_result": {
      const d = n.data || {};
      const pct = Number(d.score_percent);
      const score = Number.isFinite(pct) ? formatPercent(pct / 100, locale) : null;
      const text = score
        ? t("types.exam_result.title", { exam: examLabel(d, t), score })
        : t("types.exam_result.titleNoScore", { exam: examLabel(d, t) });
      const correct = Number(d.correct);
      const total = Number(d.total);
      const parts = [];
      if (Number.isInteger(correct) && Number.isInteger(total) && total > 0) parts.push(t("types.exam_result.correct", { count: correct, total }));
      if (d.status === "expired") parts.push(t("types.exam_result.expired"));
      return { text, detail: parts.length ? parts.join(" · ") : null, emphasis: null };
    }
    case "achievement":
    case "system": {
      const title = localizedData(n.data, "title", locale);
      const body = localizedData(n.data, "body", locale, 200);
      return {
        text: title?.text || t(`types.${group.type}`),
        lang: title ? title.lang : locale,
        detail: body?.text || null,
        detailLang: body?.lang || null,
        emphasis: null,
      };
    }
    default:
      return { text: t("types.unknown"), detail: null, emphasis: null };
  }
}
