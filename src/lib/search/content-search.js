// ============================================================================
// Content search without a database (docs/CONTENT_ENGINE.md §7 "Search").
// SERVER ONLY in practice (the route builds the index once per instance); the
// module itself is pure apart from the lazy outline loader.
//
//   buildContentIndex(outlines, { bankNodes })  normalized in-memory index over
//       subjects, units, chapters and lessons (group "node"), official files
//       (group "resource") and quizzes offered by published-question counts
//       (group "exam"). outlines: outline@1 data or curriculum-outline trees.
//   searchContentIndex(index, { q, kinds, node, limit, offset })
//       → { query, groups: { node, resource, exam: { total, capped, items[] } } }
//       every query token must occur in the entry (search_normalize_v2 rules,
//       src/lib/content/normalize.js); totals are capped at 100.
//   parseContentQuery(searchParams) → { ok, value } | { ok:false, error, field }
//   getContentIndex({ bankIndex })   memoized index over every catalog leaf
//
// Same payload shape as the search_content RPC (§6.2), minus the question
// group: questions are never searchable without the database, and stems never.
// ============================================================================
import { searchNormalize } from "@/lib/content/normalize";

export const CONTENT_KINDS = Object.freeze(["node", "resource", "exam"]);
export const QUERY_MIN = 2;
export const QUERY_MAX = 100;
export const LIMIT_MAX = 20;
export const DEFAULT_LIMIT = 10;
export const OFFSET_MAX = 100;
export const TOTAL_CAP = 100;

const NODE_KINDS = new Set(["subject", "unit", "chapter", "lesson"]);
const HIDDEN = new Set(["source_only", "unavailable"]);
const KIND_WEIGHT = { subject: 6, unit: 4, chapter: 4, lesson: 2 };
/** The quiz a node scope leads to, and the published items it needs at least (the template's min count). */
const EXAM_FOR = { subject: ["subject-quiz", 10], unit: ["chapter-quiz", 5], chapter: ["chapter-quiz", 5], lesson: ["lesson-quiz", 3] };
const NODE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*){0,5}$/;
const hasOwn = (o, k) => o !== null && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);

const learnHref = (id) => `/learn/${id}`;

function nodesOf(d) {
  if (!d) return [];
  const list = typeof d.nodes === "function" ? d.nodes() : d.nodes;
  return Array.isArray(list) ? list : [];
}
function resourcesOf(d, subjects) {
  if (Array.isArray(d?.resources)) return d.resources;
  if (typeof d?.resourcesFor === "function") return subjects.flatMap((s) => d.resourcesFor(s.id) || []);
  return [];
}

/**
 * @param {Array<object>} outlines  outline@1 data ({ leaf, nodes, resources }) or outline trees
 * @param {{ bankNodes?: object|null }} [o]  runtime-bank index `nodes` ({ <node id>: { counts } })
 */
export function buildContentIndex(outlines, { bankNodes = null } = {}) {
  const entries = [];
  for (const d of outlines || []) {
    const nodes = nodesOf(d);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const chain = (n) => {
      const out = [];
      for (let p = n, i = 0; p && i < 12; p = p.parent_id ? byId.get(p.parent_id) : null, i++) out.unshift(p);
      return out;
    };
    const subjects = [];
    for (const n of nodes) {
      if (!NODE_KINDS.has(n.kind) || HIDDEN.has(n.status)) continue;
      const trail = chain(n);
      if (trail.some((a) => NODE_KINDS.has(a.kind) && HIDDEN.has(a.status))) continue;
      const subject = trail.find((a) => a.kind === "subject");
      if (!subject) continue;
      if (n.kind === "subject") subjects.push(n);
      const places = trail.filter((a) => a.kind === "grade" || a.kind === "track");
      const parent = n.parent_id ? byId.get(n.parent_id) : null;
      const base = {
        kind: n.kind,
        id: n.id,
        title: n.title_ar ?? "",
        title_en: n.title_en ?? null,
        subject: subject.id,
        subject_title: subject.title_ar ?? "",
        subject_title_en: subject.title_en ?? null,
        parent_title: parent && NODE_KINDS.has(parent.kind) && parent.kind !== "subject" ? parent.title_ar ?? null : null,
        place: places.map((a) => a.title_ar).join(" · "),
        place_en: places.map((a) => a.title_en || a.title_ar).join(" · "),
        href: learnHref(n.id),
      };
      const name = searchNormalize(`${base.title} ${base.title_en ?? ""}`);
      const hay = searchNormalize(`${name} ${base.subject_title} ${base.subject_title_en ?? ""} ${places.map((a) => `${a.title_ar} ${a.title_en ?? ""}`).join(" ")}`);
      const w = KIND_WEIGHT[n.kind] ?? 0;
      entries.push({ group: "node", path: n.id, name, hay, w, item: { ...base, status: n.status } });
      const counts = bankNodes && hasOwn(bankNodes, n.id) ? bankNodes[n.id]?.counts : null;
      const published = counts ? [1, 2, 3].reduce((s, b) => s + (Number(counts[b]) || 0), 0) : 0;
      const [template, min] = EXAM_FOR[n.kind];
      if (published >= min && (n.kind !== "lesson" || (n.status === "verified" && n.unit_opener !== true))) {
        entries.push({ group: "exam", path: n.id, name, hay, w, item: { ...base, id: `${template}:${n.id}`, kind: template, template, scope: n.id, count: published } });
      }
    }
    for (const r of resourcesOf(d, subjects)) {
      const subject = byId.get(r.subject_node_id);
      if (!subject || HIDDEN.has(subject.status) || HIDDEN.has(r.status)) continue;
      const places = chain(subject).filter((a) => a.kind === "grade" || a.kind === "track");
      const item = {
        kind: r.kind,
        id: r.id,
        title: r.title ?? "",
        subject: subject.id,
        subject_title: subject.title_ar ?? "",
        subject_title_en: subject.title_en ?? null,
        place: places.map((a) => a.title_ar).join(" · "),
        place_en: places.map((a) => a.title_en || a.title_ar).join(" · "),
        part: Number.isInteger(r.part) ? r.part : null,
        availability: r.availability ?? "unavailable",
        url: r.availability !== "unavailable" && typeof r.url === "string" && /^https:\/\//.test(r.url) ? r.url : null,
        external_count: Number.isInteger(r.external_count) ? r.external_count : null,
        href: learnHref(subject.id),
      };
      const name = searchNormalize(item.title);
      const hay = searchNormalize(`${name} ${item.subject_title} ${item.subject_title_en ?? ""} ${places.map((a) => `${a.title_ar} ${a.title_en ?? ""}`).join(" ")}`);
      entries.push({ group: "resource", path: subject.id, name, hay, w: r.kind === "student_book" ? 2 : 1, item });
    }
  }
  if (entries.length > 999999) throw new Error("content index: too many entries");
  return { entries, size: entries.length, ...buildPostings(entries) };
}

const EMPTY = new Int32Array(0);

/**
 * Character postings over the normalized haystacks: every entry index under
 * each character (unigrams) and each pair of adjacent non-space characters
 * (bigrams). A query scans only the candidates of its rarest bigram (or
 * character), then verifies every token with includes().
 */
function buildPostings(entries) {
  const uni = new Map();
  const bi = new Map();
  const add = (m, k, i) => {
    let a = m.get(k);
    if (!a) m.set(k, (a = []));
    if (a[a.length - 1] !== i) a.push(i); // entries are added in order, so this dedups
  };
  for (let i = 0; i < entries.length; i++) {
    const h = entries[i].hay;
    for (let j = 0; j < h.length; j++) {
      const c = h[j];
      if (c === " ") continue;
      add(uni, c, i);
      const d = h[j + 1];
      if (d !== undefined && d !== " ") add(bi, c + d, i);
    }
  }
  const pack = (m) => new Map([...m].map(([k, a]) => [k, Int32Array.from(a)]));
  return { uni: pack(uni), bi: pack(bi) };
}

/** The shortest postings list that every match of a token must be in. */
function postingsFor(index, token) {
  if (token.length === 1) return index.uni.get(token) ?? EMPTY;
  let best = null;
  for (let j = 0; j < token.length - 1; j++) {
    const list = index.bi.get(token.slice(j, j + 2)) ?? EMPTY;
    if (!best || list.length < best.length) best = list;
  }
  return best ?? EMPTY;
}

const emptyGroup = () => ({ total: 0, capped: false, items: [] });

/**
 * Rank and page the index for a query. Every token must occur in the entry;
 * a name that starts with / contains the whole query ranks first, then token
 * hits in the name, then the kind (subject > unit > lesson), then a shorter
 * title; ties keep outline order. Totals are capped at 100 (`capped` = more).
 */
export function searchContentIndex(index, { q, kinds = null, node = null, limit = DEFAULT_LIMIT, offset = 0 } = {}) {
  const query = searchNormalize(String(q ?? "").slice(0, QUERY_MAX));
  const wanted = kinds && kinds.length ? CONTENT_KINDS.filter((k) => kinds.includes(k)) : [...CONTENT_KINDS];
  const groups = Object.fromEntries(wanted.map((k) => [k, emptyGroup()]));
  if (query.length < QUERY_MIN) return { query, groups };
  const tokens = [...new Set(query.split(" ").filter(Boolean))];
  const want = new Set(wanted);
  const prefix = node ? `${node}/` : null;
  // Ranking key packed into one double (larger = better) so the sort is a
  // native numeric sort: score, then a shorter name, then outline order.
  const entries = index?.entries || [];
  const keys = Object.fromEntries(wanted.map((k) => [k, new Float64Array(entries.length)]));
  const counts = Object.fromEntries(wanted.map((k) => [k, 0]));
  // Candidates: the postings of the rarest token (every entry when the index has none).
  let candidates = null;
  if (index?.bi && index?.uni) {
    for (const tk of tokens) {
      const list = postingsFor(index, tk);
      if (!candidates || list.length < candidates.length) candidates = list;
    }
  }
  const scan = candidates ? candidates.length : entries.length;
  for (let c = 0; c < scan; c++) {
    const i = candidates ? candidates[c] : c;
    const e = entries[i];
    if (!want.has(e.group)) continue;
    // Subtree filter; a subject's files also match a filter below the subject (as search_content does).
    if (prefix && e.path !== node && !e.path.startsWith(prefix) && !(e.group === "resource" && node.startsWith(`${e.path}/`))) continue;
    let ok = true;
    for (let t = 0; t < tokens.length; t++) {
      if (!e.hay.includes(tokens[t])) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    let score = e.name.startsWith(query) ? 60 : e.name.includes(query) ? 40 : 0;
    for (let t = 0; t < tokens.length; t++) if (e.name.includes(tokens[t])) score += 10;
    score += e.w;
    keys[e.group][counts[e.group]++] = score * 1e10 + (9999 - Math.min(e.name.length, 9999)) * 1e6 + (999999 - i);
  }
  for (const k of wanted) {
    const found = counts[k];
    const sorted = keys[k].subarray(0, found).sort().reverse();
    const items = [];
    for (let j = offset; j < Math.min(found, offset + limit); j++) items.push(entries[999999 - (sorted[j] % 1e6)].item);
    groups[k] = { total: Math.min(found, TOTAL_CAP), capped: found > TOTAL_CAP, items };
  }
  return { query, groups };
}

/**
 * Strict parse of GET /api/content/search parameters:
 *   q (2..100 chars after trimming) · kinds (comma list of node,resource,exam) ·
 *   node (a node id: subtree filter) · limit 1..20 (default 10) · offset 0..100.
 */
export function parseContentQuery(sp) {
  const get = (k) => (typeof sp?.get === "function" ? sp.get(k) : sp?.[k] ?? null);
  const q = String(get("q") ?? "").trim().replace(/\s+/g, " ");
  if (q.length < QUERY_MIN || q.length > QUERY_MAX) return { ok: false, error: "invalid_argument", field: "q" };
  let kinds = null;
  const rawKinds = get("kinds");
  if (rawKinds !== null && rawKinds !== "") {
    const list = String(rawKinds).split(",").map((s) => s.trim()).filter(Boolean);
    if (!list.length || list.length > CONTENT_KINDS.length || list.some((k) => !CONTENT_KINDS.includes(k))) return { ok: false, error: "invalid_argument", field: "kinds" };
    kinds = CONTENT_KINDS.filter((k) => list.includes(k));
  }
  const rawNode = get("node");
  let node = null;
  if (rawNode !== null && rawNode !== "") {
    if (String(rawNode).length > 160 || !NODE_RE.test(String(rawNode))) return { ok: false, error: "invalid_argument", field: "node" };
    node = String(rawNode);
  }
  const int = (k, dflt, min, max) => {
    const raw = get(k);
    if (raw === null || raw === "") return dflt;
    if (!/^\d{1,4}$/.test(String(raw))) return NaN;
    const n = Number(raw);
    return n >= min && n <= max ? n : NaN;
  };
  const limit = int("limit", DEFAULT_LIMIT, 1, LIMIT_MAX);
  if (Number.isNaN(limit)) return { ok: false, error: "invalid_argument", field: "limit" };
  const offset = int("offset", 0, 0, OFFSET_MAX);
  if (Number.isNaN(offset)) return { ok: false, error: "invalid_argument", field: "offset" };
  return { ok: true, value: { q, kinds, node, limit, offset } };
}

// ── the process-wide index ──────────────────────────────────────────────────
let cached = null; // { key, promise }

/**
 * Index over every catalog leaf's outline (loaded once per instance; rebuilt
 * when the runtime bank revision changes). `load` is injectable for tests.
 * @param {{ bankIndex?: object|null, load?: () => Promise<object[]> }} [o]
 */
export function getContentIndex({ bankIndex = null, load = null } = {}) {
  const key = bankIndex?.bank_revision ?? "none";
  if (!cached || cached.key !== key || load) {
    const loader =
      load ??
      (async () => {
        const { OUTLINE_LEAVES, loadOutline } = await import("@/lib/curriculum-outline");
        return (await Promise.all(OUTLINE_LEAVES.map((leaf) => loadOutline(leaf)))).filter(Boolean);
      });
    const promise = loader()
      .then((outlines) => buildContentIndex(outlines, { bankNodes: bankIndex?.nodes ?? null }))
      .catch((e) => {
        if (cached?.promise === promise) cached = null;
        throw e;
      });
    cached = { key, promise };
  }
  return cached.promise;
}

/** Tests: drop the memoized index. */
export function resetContentIndex() {
  cached = null;
}
