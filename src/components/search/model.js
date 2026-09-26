// ============================================================================
// /search — pure helpers (no React, no browser APIs, no strings).
// Unit-tested in tests/unit/search.test.js.
// ============================================================================
import { foldWithMap, normalizeText, queryTokens, rankEntries } from "@/lib/search/curriculum-index";
import { SECTIONS } from "@/lib/exams/catalog";
import { builderHref } from "@/components/exams/builder-logic";

export const TABS = ["all", "curriculum", "people", "posts", "tags", "questions"];
export const REMOTE_GROUPS = ["people", "posts", "tags", "questions"];
export const REMOTE_LIMIT = 20; // search_all caps every group at 20 rows
export const RECENT_MAX = 8;
export const RECENT_KEY = "jazira_recent_searches_v1";
export const CURRICULUM_PAGE = 12;

/** How many rows each group shows in the "all" tab. */
export const ALL_TAB_LIMITS = { pages: 6, curriculum: 5, practice: 3, questions: 3, people: 6, posts: 3, tags: 10 };

export const parseTab = (v) => (TABS.includes(v) ? v : "all");

/** Display form of a query: trimmed, single spaces, ≤ 100 chars (same as the database). */
export const cleanQuery = (q) => String(q ?? "").trim().replace(/\s+/g, " ").slice(0, 100);

/** Unlocalised href of the search page for a query + tab. */
export function searchHref(q, tab = "all") {
  const params = new URLSearchParams();
  const clean = cleanQuery(q);
  if (clean) params.set("q", clean);
  if (clean && tab && tab !== "all") params.set("tab", tab); // a tab means nothing without a query
  const qs = params.toString();
  return `/search${qs ? `?${qs}` : ""}`;
}

/**
 * Identity of a search URL state ("q|tab"), in the same normal form searchHref()
 * writes — so a URL read back from the address bar compares equal to what
 * was written (used to recognise late echoes of our own replaceState).
 */
export function searchKey(q, tab) {
  const clean = cleanQuery(q);
  return `${clean}|${clean ? parseTab(tab) : "all"}`;
}

// ── highlighting ────────────────────────────────────────────────────────────
const MARK_AFTER = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0300-\u036F]/;

/**
 * Split `text` into plain/matched parts for the query tokens, matching on the
 * Arabic-normalised form but slicing the ORIGINAL text (never HTML).
 *   highlightParts("مدرسةٌ جميلة", "مدرسه") → [{ text: "مدرسةٌ", match: true }, { text: " جميلة", match: false }]
 */
export function highlightParts(text, query) {
  const src = String(text ?? "");
  if (!src) return [];
  const tokens = queryTokens(query);
  if (!tokens.length || normalizeText(query).length < 2) return [{ text: src, match: false }];
  const { text: folded, start, end } = foldWithMap(src);
  const hits = new Array(folded.length).fill(false);
  const paint = (needle) => {
    let found = false;
    for (let from = 0; ; ) {
      const at = folded.indexOf(needle, from);
      if (at === -1) break;
      found = true;
      for (let k = at; k < at + needle.length; k++) hits[k] = true;
      from = at + needle.length;
    }
    return found;
  };
  const phrase = normalizeText(query);
  if (tokens.length > 1) paint(phrase); // the whole phrase reads as one mark
  for (const { full, stem } of tokens) {
    for (const needle of full === stem ? [full] : [full, stem]) {
      if (needle.length < 2 && tokens.length > 1 && !/\d/.test(needle)) continue; // lone letters would paint everything
      if (paint(needle)) break; // the full word matched — don't also paint the stem
    }
  }
  // Folded ranges → source ranges (extend over trailing combining marks).
  const ranges = [];
  for (let k = 0; k < folded.length; k++) {
    if (!hits[k]) continue;
    let j = k;
    while (j + 1 < folded.length && hits[j + 1]) j++;
    let s = start[k];
    let e = end[j];
    while (e < src.length && MARK_AFTER.test(src[e])) e++;
    const last = ranges[ranges.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else ranges.push([s, e]);
    k = j;
  }
  if (!ranges.length) return [{ text: src, match: false }];
  const parts = [];
  let pos = 0;
  for (const [s, e] of ranges) {
    if (s > pos) parts.push({ text: src.slice(pos, s), match: false });
    parts.push({ text: src.slice(s, e), match: true });
    pos = e;
  }
  if (pos < src.length) parts.push({ text: src.slice(pos), match: false });
  return parts;
}

// ── local indexes (practice catalog, app pages) ─────────────────────────────
/**
 * Exam sections + topics → searchable entries. `practice` comes from the
 * server (labels of both locales, so either language finds them):
 *   { types: { aptitude: { ar, en } }, sections: [{ id, exam, ar, en, topics }], topics: [{ id, section, exam, ar, en }] }
 */
export function buildPracticeIndex(practice) {
  if (!practice) return [];
  const out = [];
  for (const s of practice.sections || []) {
    const type = practice.types?.[s.exam] || {};
    out.push({
      id: `section:${s.id}`,
      kind: "section",
      exam: s.exam,
      section: s.id,
      topic: null,
      href: builderHref(s.exam, { section: s.id }),
      ar: s.ar,
      en: s.en,
      name: normalizeText(`${s.ar} ${s.en}`),
      hay: normalizeText(`${s.ar} ${s.en} ${type.ar || ""} ${type.en || ""}`),
    });
  }
  for (const tp of practice.topics || []) {
    out.push({
      id: `topic:${tp.section}:${tp.id}`,
      kind: "topic",
      exam: tp.exam,
      section: tp.section,
      topic: tp.id,
      href: builderHref(tp.exam, { section: tp.section, topic: tp.id }),
      ar: tp.ar,
      en: tp.en,
      name: normalizeText(`${tp.ar} ${tp.en}`),
      hay: normalizeText(`${tp.ar} ${tp.en}`),
    });
  }
  return out;
}

/**
 * App pages → entries. items: [{ key, href, label, keywords?, auth? }] with
 * labels already translated for the active locale.
 */
export function buildPagesIndex(items) {
  return (items || []).map((it) => ({
    id: `page:${it.key}`,
    kind: "page",
    key: it.key,
    href: it.href,
    icon: it.icon || null,
    auth: Boolean(it.auth),
    label: it.label,
    name: normalizeText(it.label),
    hay: normalizeText(`${it.label} ${it.keywords || ""}`),
  }));
}

export const searchLocal = (entries, query, limit) => rankEntries(entries, query, { limit }).map((h) => h.entry);

// ── curriculum result shaping ───────────────────────────────────────────────
export const STAGE_ORDER = ["elementary", "middle", "high-school", "continuing", "special"];
const stageRank = (s) => (STAGE_ORDER.includes(s) ? STAGE_ORDER.indexOf(s) : STAGE_ORDER.length);

/**
 * Collapse ranked curriculum hits that share a kind + name (e.g. "Mathematics"
 * in 16 grades) into one cluster, in first-appearance (rank) order.
 * → [{ key, kind, first, entries, stages: [stageId…] }]
 */
export function clusterCurriculum(hits) {
  const map = new Map();
  for (const e of hits || []) {
    const key = `${e.kind}|${normalizeText(e.ar)}`;
    let c = map.get(key);
    if (!c) {
      c = { key, kind: e.kind, first: e, entries: [], stages: [] };
      map.set(key, c);
    }
    c.entries.push(e);
    if (!c.stages.includes(e.stage)) c.stages.push(e.stage);
  }
  for (const c of map.values()) c.stages.sort((a, b) => stageRank(a) - stageRank(b));
  return [...map.values()];
}

/** Ranked hits split by stage (catalog stage order; rank order inside). */
export function groupByStage(hits) {
  const map = new Map();
  for (const e of hits || []) {
    if (!map.has(e.stage)) map.set(e.stage, []);
    map.get(e.stage).push(e);
  }
  return [...map.entries()].sort(([a], [b]) => stageRank(a) - stageRank(b)).map(([stage, entries]) => ({ stage, entries }));
}

// ── remote results (search_all) ─────────────────────────────────────────────
/** Exam builder deep link for a question result (section + topic prefilled). */
export function questionHref(q) {
  const exam = SECTIONS[q?.section]?.exam;
  if (!exam) return "/exams";
  const topic = q.topic && SECTIONS[q.section].topics.includes(q.topic) ? q.topic : null;
  return builderHref(exam, { section: q.section, topic });
}

/**
 * Author identity of a post result. Anonymous = `is_anonymous` (0012) or no
 * author: shown as anonymous even to its author — who does get the author
 * back for their own posts (`is_mine` → "You (anonymous)").
 */
export function postAuthor(post) {
  const a = post?.author;
  const mine = Boolean(post?.is_mine);
  if (!a || post?.is_anonymous) return { anonymous: true, mine, name: null, username: null, avatar: null, elite: false };
  return {
    anonymous: false,
    mine,
    name: a.full_name || a.username || null,
    username: a.username || null,
    avatar: a.avatar_url || null,
    elite: Boolean(a.is_elite) && a.show_elite_badge !== false,
  };
}

/** People rows that can be linked (a public handle is required for /u/[username]). */
export const linkablePeople = (people) => (people || []).filter((p) => p && p.id && p.username);

/** "20+" when a remote group hit the RPC cap, else the number. */
export const countLabel = (n, capped) => (capped ? `${n}+` : String(n));

/**
 * Counts per tab. local = { curriculum, practice } (arrays), remote = the
 * search_all payload or null. With the per-group totals of 0012 (`totals`,
 * `totalsCapped`: "more than 100") those are the counts; against an older
 * database, the rows received, `capped` when a group hit REMOTE_LIMIT.
 */
export function tabCounts(local, remote) {
  const totals = remote?.totals && typeof remote.totals === "object" ? remote.totals : null;
  const cap = (arr) => (arr?.length || 0) >= REMOTE_LIMIT;
  const group = (g, rows) => {
    const n = totals ? Number(totals[g]) : NaN;
    return Number.isFinite(n) && n >= 0
      ? { n, capped: Boolean(remote?.totalsCapped?.[g]) }
      : { n: rows?.length || 0, capped: cap(remote?.[g]) };
  };
  const questions = group("questions", remote?.questions);
  return {
    curriculum: { n: local.curriculum.length, capped: false },
    questions: { n: local.practice.length + questions.n, capped: questions.capped },
    people: group("people", linkablePeople(remote?.people)),
    posts: group("posts", remote?.posts),
    tags: group("tags", remote?.tags),
  };
}

/**
 * Can a remote group page further? `loaded` = rows received so far (the next
 * p_offset). Needs the 0012 totals; search_all accepts offsets up to 100.
 */
export function hasMoreRows(remote, groupName, loaded, maxOffset = 100) {
  const n = Number(remote?.totals?.[groupName]);
  if (!Number.isFinite(n) || loaded > maxOffset) return false;
  return remote?.totalsCapped?.[groupName] ? true : loaded < n;
}

/** Total results across every group (the "all" tab; pages excluded). */
export const totalCount = (counts) => Object.values(counts).reduce((s, c) => s + c.n, 0);

// ── recent searches (per device) ────────────────────────────────────────────
/** Most recent first, deduplicated on the normalised form, capped. */
export function addRecent(list, q, max = RECENT_MAX) {
  const clean = cleanQuery(q);
  const key = normalizeText(clean);
  if (key.length < 2) return list || [];
  const rest = (list || []).filter((x) => normalizeText(x) !== key);
  return [clean, ...rest].slice(0, max);
}

export function removeRecent(list, q) {
  const key = normalizeText(q);
  return (list || []).filter((x) => normalizeText(x) !== key);
}

/** Parse what localStorage holds (anything malformed → []). */
export function parseRecent(raw) {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string" && cleanQuery(x).length >= 2).map(cleanQuery).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}
