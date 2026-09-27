// ============================================================================
// Learn pages — pure helpers (docs/CONTENT_ENGINE.md §7, §5.3, WP9).
//
//   parseLearnPath(segments)            /learn/<subject node id>[/<unit|lesson local id>] → { nodeId } | null
//   learnHref(nodeId)                   "/learn/<node id>"
//   resolveLearnNode(tree, nodeId)      { node, subject, unit, chapter, trail[] } | null (hidden nodes → null)
//   termBadge(node)                     { state: verified | inferred | unconfirmed | needs_review, term }
//   pdfHref(url, pdfPage)               https link-out with #page=<n> (never a rehosted file)
//   lessonPages(node, resourcesById)    printed/PDF page ranges with link-outs
//   resourceView(resource)              the three resource states (§7) + badges
//   scopeLessonIds(tree, scope)         §5.3 step 1 (same rule as the engine's resolveScope)
//   createPoolIndex(tree, rows)         pool counts per scope from runtime-bank selection rows
//   poolFromScopeCounts(tree, rows)     the same interface from scope_pool_counts rows (DB)
//   loadSubjectPool({ tree, subjectId, bank, db })   DB first, runtime bank second, empty last
//   entryPointsFor(tree, ctx, pool, subjectTerms)    the "Test yourself" entry points (pool rule)
//   compactOutline(tree, subjectId, pool)            JSON-safe outline for the subject drawer
//
// No React, no Node or browser APIs: the tree is the sync node-tree object of
// src/lib/curriculum-outline.js (loadOutline) and I/O is injected. Unit-tested
// in tests/unit/learn.test.js.
// ============================================================================
import { TIERS, getTemplate, offerFor, planCount } from "@/lib/exams/engine/exam-templates";

export const LEARN_BASE = "/learn";
export const MAX_SEGMENTS = 6;
const SEG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NODE_ID_MAX = 160;
const CONTENT_KINDS = new Set(["subject", "unit", "chapter", "lesson"]);
const HIDDEN = new Set(["source_only", "unavailable"]);
const TERM_OK = new Set(["verified", "inferred"]);
const TERM_SETS = { t1: ["t1"], t2: ["t2"], both: ["t1", "t2"] };
const hasOwn = (o, k) => o !== null && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);
const isHttps = (u) => typeof u === "string" && u.length <= 2048 && /^https:\/\/[^\s"'<>\\]+$/.test(u);

// ── routing ─────────────────────────────────────────────────────────────────
/**
 * The catch-all segments of /learn/[...path]. The path is a subject node id
 * (stage/grade[/track]/subject) plus an optional unit, chapter or lesson local
 * id (`n<ienId>` / `x<hex8>`): node ids are flat under the subject, so the
 * joined path IS the node id. Anything malformed → null (404).
 */
export function parseLearnPath(segments) {
  const segs = Array.isArray(segments) ? segments : typeof segments === "string" ? segments.split("/") : null;
  if (!segs || segs.length < 3 || segs.length > MAX_SEGMENTS) return null;
  if (!segs.every((s) => typeof s === "string" && s.length > 0 && s.length <= 64 && SEG_RE.test(s))) return null;
  const nodeId = segs.join("/");
  return nodeId.length <= NODE_ID_MAX ? { nodeId } : null;
}

/** Unlocalised href of a learn page (a scope suffix is never part of it). */
export const learnHref = (nodeId) => `${LEARN_BASE}/${String(nodeId).split("@")[0]}`;

/** Ancestors of a node, root first, the node last. */
export function trailOf(tree, node) {
  const out = [];
  const seen = new Set();
  for (let n = node; n && !seen.has(n.id) && out.length < 12; n = n.parent_id ? tree.nodeById(n.parent_id) : null) {
    seen.add(n.id);
    out.unshift(n);
  }
  return out;
}

const visible = (n) => Boolean(n) && CONTENT_KINDS.has(n.kind) && !HIDDEN.has(n.status);

/**
 * Resolve a learn node: a visible subject, unit, chapter or lesson (source-only
 * and unavailable nodes are not pages). → { node, subject, unit, chapter, leaf, trail } | null
 */
export function resolveLearnNode(tree, nodeId) {
  if (!tree || typeof nodeId !== "string") return null;
  const node = tree.nodeById(nodeId);
  if (!visible(node)) return null;
  const trail = trailOf(tree, node);
  const subject = trail.find((n) => n.kind === "subject") ?? null;
  if (!subject || HIDDEN.has(subject.status)) return null;
  if (trail.some((n) => CONTENT_KINDS.has(n.kind) && HIDDEN.has(n.status))) return null;
  const leafIndex = trail.indexOf(subject) - 1;
  const up = [...trail].reverse(); // nearest first (the node itself included)
  return {
    node,
    subject,
    unit: up.find((n) => n.kind === "unit") ?? null,
    chapter: up.find((n) => n.kind === "chapter") ?? null,
    leaf: leafIndex >= 0 ? trail[leafIndex] : null,
    trail,
  };
}

// ── terms ───────────────────────────────────────────────────────────────────
/**
 * Term badge of a unit, lesson or resource (§2.4, §7): verified; inferred
 * (listing title, plan guide, course code); unconfirmed (owner decision
 * "part N = term N"); otherwise needs review — never a guessed term.
 */
export function termBadge(n) {
  const term = n?.term ?? null;
  const status = n?.term_status ?? "unknown";
  if (term && hasOwn(TERM_SETS, term) && status === "verified") return { state: "verified", term };
  if (term && hasOwn(TERM_SETS, term) && status === "inferred") return { state: n.term_basis === "owner_decision" ? "unconfirmed" : "inferred", term };
  return { state: "needs_review", term: null };
}

/** Is a lesson in term t with usable evidence (§5.3: verified or inferred)? */
export const termOk = (n, t) => (TERM_SETS[n?.term] ?? []).includes(t) && TERM_OK.has(n?.term_status);

/** Subject-term membership row usable for a term exam (§2.5: verified or inferred only). */
export function termMembership(subjectTerms, term) {
  const row = (subjectTerms || []).find((r) => r?.term === term);
  return { status: row?.status ?? "needs_review", ok: TERM_OK.has(row?.status) };
}

// ── book pages and resources ────────────────────────────────────────────────
/** Link-out to the official PDF, opened at a page (`#page=<n>`). null unless https. */
export function pdfHref(url, pdfPage = null) {
  if (!isHttps(url)) return null;
  // A URL that already has a fragment (the iEN question-bank route) is linked as is.
  return Number.isInteger(pdfPage) && pdfPage >= 1 && !url.includes("#") ? `${url}#page=${pdfPage}` : url;
}

const RESOURCE_STATES = new Set(["external_official", "unavailable", "needs_review"]);

/**
 * One resource as the UI shows it (§7 "PDF resource states"):
 *   external_official → an "Open on iEN" link-out (new tab, noopener) with
 *                       part, edition, term badge and page count;
 *   unavailable       → an empty state with the reason;
 *   needs_review      → a badge: the file or its term is not confirmed yet.
 * Nothing is embedded or rehosted: `href` is always the official https URL.
 */
export function resourceView(r) {
  const availability = RESOURCE_STATES.has(r?.availability) ? r.availability : "unavailable";
  const href = availability === "unavailable" ? null : pdfHref(r?.url);
  // An "official" row without a usable https link is shown as unavailable, never as a dead button.
  const state = availability === "external_official" && !href ? "unavailable" : availability;
  const bank = r?.kind === "question_bank_external";
  return {
    id: r?.id ?? null,
    kind: r?.kind ?? "other",
    title: r?.title ?? "",
    state,
    reason: state === "unavailable" ? (availability === "unavailable" ? "unavailable" : "no_link") : null,
    href: state === "unavailable" ? null : href,
    bank,
    part: Number.isInteger(r?.part) ? r.part : null,
    year: typeof r?.year_label === "string" ? r.year_label : null,
    pages: Number.isInteger(r?.page_count) && r.page_count > 0 ? r.page_count : null,
    externalCount: bank && Number.isInteger(r?.external_count) ? r.external_count : null,
    term: bank ? null : termBadge(r),
    review: r?.status === "needs_review" || availability === "needs_review",
  };
}

/** Books first (by part), then other files, then the external question bank. */
export function sortResources(list) {
  const rank = (r) => (r.kind === "student_book" ? 0 : r.kind === "question_bank_external" ? 2 : 1);
  return [...(list || [])].sort((a, b) => rank(a) - rank(b) || (a.part ?? 99) - (b.part ?? 99) || String(a.id).localeCompare(String(b.id)));
}

/** Printed page range of a node (the first mapped range), or null. */
export function printedRange(node) {
  const p = (node?.pages || []).find((x) => Number.isInteger(x?.printed_start));
  if (!p) return null;
  return { start: p.printed_start, end: Number.isInteger(p.printed_end) ? p.printed_end : p.printed_start };
}

/**
 * Book pages of a lesson with link-outs at the first PDF page of each range.
 * → [{ resource_id, title, part, printed: {start,end}|null, pdf: {start,end}, href|null, status }]
 */
export function lessonPages(node, resourcesById) {
  const out = [];
  for (const p of node?.pages || []) {
    if (!Number.isInteger(p?.pdf_start) || p.pdf_start < 1) continue;
    const r = resourcesById?.get?.(p.resource_id) ?? null;
    const view = r ? resourceView(r) : null;
    out.push({
      resource_id: p.resource_id,
      title: r?.title ?? null,
      part: view?.part ?? null,
      printed: Number.isInteger(p.printed_start) ? { start: p.printed_start, end: Number.isInteger(p.printed_end) ? p.printed_end : p.printed_start } : null,
      pdf: { start: p.pdf_start, end: Number.isInteger(p.pdf_end) && p.pdf_end >= p.pdf_start ? p.pdf_end : p.pdf_start },
      href: view && view.state !== "unavailable" && r.file_type === "pdf" ? pdfHref(r.url, p.pdf_start) : null,
      status: p.status === "verified" ? "verified" : "needs_review",
    });
  }
  return out.sort((a, b) => String(a.resource_id).localeCompare(String(b.resource_id)) || a.pdf.start - b.pdf.start);
}

// ── pools ───────────────────────────────────────────────────────────────────
/** A lesson that may enter a pool (§2.5, §5.3): verified and not a unit opener. */
export const isPoolLesson = (n) => Boolean(n) && n.kind === "lesson" && n.status === "verified" && n.unit_opener !== true;

/**
 * §5.3 step 1 for `<node id>[@t1|@t2|@year]` — the same rule as the engine's
 * resolveScope (tested against it): lessons under the node that are verified
 * and not unit openers; @t1/@t2 keep lessons of that term (or both) with
 * term_status verified|inferred; @year keeps every eligible lesson
 * (term-needs_review lessons stay in subject and full-year exams).
 */
export function scopeLessonIds(tree, scope) {
  const [nodeId, term = null, extra] = String(scope ?? "").split("@");
  if (extra !== undefined || (term !== null && !["t1", "t2", "year"].includes(term))) return [];
  const node = tree?.nodeById(nodeId);
  if (!visible(node) || (term && node.kind !== "subject")) return [];
  return (tree.lessonsUnder(nodeId) || [])
    .map((id) => tree.nodeById(id))
    .filter(isPoolLesson)
    .filter((n) => (term === "t1" || term === "t2" ? termOk(n, term) : true))
    .map((n) => n.id);
}

const EMPTY_STATS = Object.freeze({ counts: Object.freeze({ 1: 0, 2: 0, 3: 0 }), total: 0, groups: 0, free_groups: 0, free_total: 0 });

function poolIndex(tree, statsOf) {
  const memo = new Map();
  return {
    /** { counts: {1,2,3}, total, groups, free_groups, free_total } for a scope (published items). */
    stats(scope, types = null) {
      const k = `${scope}|${types ? types.join(",") : "*"}`;
      if (!memo.has(k)) memo.set(k, statsOf(scopeLessonIds(tree, scope), types));
      return memo.get(k);
    },
  };
}

/**
 * Pool index over runtime-bank selection rows ({ key, lesson, band, component,
 * type, premium }): groups = exclusion components (a row without a component
 * is its own group); free_* exclude premium items (guests and free users never
 * get them, §5.3).
 */
export function createPoolIndex(tree, rows = []) {
  const byLesson = new Map();
  for (const r of rows || []) {
    if (!r || typeof r.lesson !== "string" || ![1, 2, 3].includes(r.band)) continue;
    if (!byLesson.has(r.lesson)) byLesson.set(r.lesson, []);
    byLesson.get(r.lesson).push(r);
  }
  if (!byLesson.size) return { stats: () => EMPTY_STATS, source: "none" };
  const index = poolIndex(tree, (lessonIds, types) => {
    const counts = { 1: 0, 2: 0, 3: 0 };
    const all = new Set();
    const free = new Set();
    let freeTotal = 0;
    for (const id of lessonIds) {
      for (const r of byLesson.get(id) || []) {
        if (types && !types.includes(r.type)) continue;
        counts[r.band] += 1;
        const g = r.component ?? r.key;
        all.add(g);
        if (!r.premium) {
          free.add(g);
          freeTotal += 1;
        }
      }
    }
    return { counts, total: counts[1] + counts[2] + counts[3], groups: all.size, free_groups: free.size, free_total: freeTotal };
  });
  return { ...index, source: "bank" };
}

/**
 * Pool index over `scope_pool_counts` rows ({ node_id, band, published_count,
 * group_count, free_count, free_group_count }). ce_refresh_aggregates writes a
 * row per ancestor node of every eligible lesson and per `<subject>@t1|@t2`,
 * with band 0 = all bands (§6.1, §6.2). The stats of a scope are read from its
 * own node row — exactly what get_scope_availability and the start RPC use —
 * never summed over lessons: an exclusion component can span lessons and
 * bands, so a sum would overstate the pool. free_* exclude premium items
 * (guests and free users never get them, §5.3). A scope without a band-0 row
 * falls back to the largest per-band group count (a lower bound, never more).
 */
export function poolFromScopeCounts(tree, rows = []) {
  const byNode = new Map();
  const num = (x) => Math.max(0, Math.trunc(Number(x)) || 0);
  for (const r of rows || []) {
    const band = Number(r?.band);
    if (!r || typeof r.node_id !== "string" || ![0, 1, 2, 3].includes(band)) continue;
    if (!tree?.nodeById(r.node_id.split("@")[0])) continue; // not a node of this outline
    if (!byNode.has(r.node_id)) byNode.set(r.node_id, {});
    byNode.get(r.node_id)[band] = {
      published: num(r.published_count),
      groups: num(r.group_count),
      free: num(r.free_count ?? r.published_count),
      free_groups: num(r.free_group_count ?? r.group_count),
    };
  }
  if (!byNode.size) return { stats: () => EMPTY_STATS, source: "none" };
  const memo = new Map();
  return {
    source: "db",
    /** Same shape as createPoolIndex().stats; `types` cannot be applied to the aggregate (every v1 template takes all types). */
    stats(scope) {
      const key = String(scope ?? "");
      if (memo.has(key)) return memo.get(key);
      let out = EMPTY_STATS;
      // The scope must resolve to eligible lessons in the outline (hidden nodes, openers, bad scopes → empty).
      if (scopeLessonIds(tree, key).length) {
        const [nodeId, term = null] = key.split("@");
        const e = byNode.get(term === "t1" || term === "t2" ? key : nodeId);
        if (e) {
          const counts = { 1: e[1]?.published ?? 0, 2: e[2]?.published ?? 0, 3: e[3]?.published ?? 0 };
          const bandMax = (f) => Math.max(e[1]?.[f] ?? 0, e[2]?.[f] ?? 0, e[3]?.[f] ?? 0);
          const sum = (f) => (e[1]?.[f] ?? 0) + (e[2]?.[f] ?? 0) + (e[3]?.[f] ?? 0);
          out = {
            counts,
            total: e[0] ? e[0].published : counts[1] + counts[2] + counts[3],
            groups: e[0] ? e[0].groups : bandMax("groups"),
            free_groups: e[0] ? e[0].free_groups : bandMax("free_groups"),
            free_total: e[0] ? e[0].free : sum("free"),
          };
        }
      }
      memo.set(key, out);
      return out;
    },
  };
}

const MISSING = new Set(["PGRST202", "PGRST205", "42P01", "42883"]);
/** SQL LIKE pattern of a literal prefix (\ % _ escaped; PostgREST uses the default \ escape). */
export const likePrefix = (s) => `${String(s).replace(/[\\%_]/g, (c) => "\\" + c)}%`;

/**
 * Pool for one subject's pages: `scope_pool_counts` through the public client
 * when a database is configured (§7 "Performance"; the subject row, its
 * `@t1`/`@t2` rows and every node below it), else the runtime bank's
 * selection file for the subject (only that file is read), else an empty
 * pool — every entry point then says "not enough questions yet".
 * @param {{ tree, subjectId: string, bank?: { rowsForNode(id): Promise<object[]|null> } | null, db?: object | null }} o
 */
export async function loadSubjectPool({ tree, subjectId, bank = null, db = null }) {
  if (db) {
    try {
      const { data, error } = await db
        .from("scope_pool_counts")
        .select("node_id, band, published_count, group_count, free_count, free_group_count")
        .like("node_id", likePrefix(subjectId))
        .limit(20000);
      const mine = (id) => id === subjectId || id.startsWith(`${subjectId}/`) || id.startsWith(`${subjectId}@`);
      if (!error && Array.isArray(data)) return poolFromScopeCounts(tree, data.filter((r) => mine(String(r?.node_id))));
      if (error && !MISSING.has(error.code)) console.warn("[learn] scope_pool_counts unavailable:", error.code || "error");
    } catch {
      /* database unreachable → the runtime bank */
    }
  }
  if (bank) {
    try {
      const rows = await bank.rowsForNode(subjectId);
      if (Array.isArray(rows)) return createPoolIndex(tree, rows);
    } catch {
      /* no bank packed yet (or unreadable) → an honest empty pool */
    }
  }
  return createPoolIndex(tree, []);
}

// ── "Test yourself" entry points ────────────────────────────────────────────
function offersFor(t, stats, block) {
  const out = {};
  for (const tier of TIERS) {
    const groups = tier === "premium" ? stats.groups : stats.free_groups;
    if (block) {
      out[tier] = { offered: false, mini: false, reason: block, required: t.count.min, available: groups, count: null };
      continue;
    }
    const o = offerFor(t, tier, groups);
    const plan = planCount(t, tier, null);
    out[tier] = { ...o, count: o.offered && plan.ok ? Math.min(plan.n, groups) : null };
  }
  return out;
}

function entry(templateId, scope, node, pool, block = null) {
  const t = getTemplate(templateId);
  if (!t) return null;
  const types = t.types.length === 6 ? null : [...t.types];
  const stats = pool.stats(scope, types);
  const at = scope.indexOf("@");
  return {
    key: `${t.id}:${scope}`,
    template: t.id,
    version: t.version,
    kind: t.kind,
    scope,
    node_id: node.id,
    node_kind: node.kind,
    title: node.title_ar ?? "",
    title_en: node.title_en ?? null,
    term: at < 0 ? null : scope.slice(at + 1),
    timed: t.timing.mode === "timed",
    feedback: t.feedback.default,
    offers: offersFor(t, stats, block),
  };
}

/**
 * Entry points of a learn page (§7): the node's own templates first, then the
 * wider scopes. Every entry carries per-tier offers from the pool rule
 * (exclusion components ≥ ceil(min × min_pool_factor); the mini count for a
 * mini version) — a client island picks the viewer's tier. A term exam is
 * offered only when the subject's membership in that term is verified or
 * inferred (§2.5); otherwise it is listed as blocked ("term_unverified").
 * @returns {{ primary: object[], related: object[] }}
 */
export function entryPointsFor(tree, ctx, pool, subjectTerms = []) {
  const { node, subject } = ctx;
  const unitLike = ctx.chapter ?? ctx.unit;
  const termEntry = (term) => entry("term-exam", `${subject.id}@${term}`, subject, pool, termMembership(subjectTerms, term).ok ? null : "term_unverified");
  const subjectEntries = [entry("subject-quiz", subject.id, subject, pool), termEntry("t1"), termEntry("t2"), entry("full-year", `${subject.id}@year`, subject, pool)];
  let primary;
  let related;
  if (node.kind === "lesson") {
    primary = [entry("lesson-quiz", node.id, node, pool), entry("practice", node.id, node, pool)];
    related = [unitLike ? entry("chapter-quiz", unitLike.id, unitLike, pool) : null, ...subjectEntries];
  } else if (node.kind === "unit" || node.kind === "chapter") {
    primary = [entry("chapter-quiz", node.id, node, pool), entry("practice", node.id, node, pool)];
    related = subjectEntries;
  } else {
    primary = [...subjectEntries, entry("practice", subject.id, subject, pool)];
    related = [];
  }
  return { primary: primary.filter(Boolean), related: related.filter(Boolean) };
}

/** The offer of an entry for a viewer tier ("elite" counts as premium; unknown → guest). */
export function offerForTier(e, tier) {
  const t = tier === "elite" ? "premium" : TIERS.includes(tier) ? tier : "guest";
  return e?.offers?.[t] ?? null;
}

// ── compact outline (subject drawer on /curriculum) ─────────────────────────
function lessonItem(n, pool, chapter = null) {
  return {
    id: n.id,
    title: n.title_ar ?? "",
    title_en: n.title_en ?? null,
    chapter,
    pages: printedRange(n),
    pool: pool.stats(n.id).total,
    opener: n.unit_opener === true,
    review: n.status !== "verified",
  };
}

/**
 * JSON-safe outline of one subject for the curriculum drawer: units with their
 * term badge and lessons (printed pages, pool size). Lessons directly under
 * the subject go into a unit-less group (`id: null`); chapters are flattened
 * into their unit with the chapter title on each lesson.
 * → { units: [{ id, title, title_en, term, pool, lessons[] }], lessons: n } | null
 */
export function compactOutline(tree, subjectId, pool) {
  const root = tree?.subjectOutline(subjectId);
  if (!root) return null;
  const units = [];
  let loose = null;
  let count = 0;
  const collect = (children, into, chapter) => {
    for (const c of children || []) {
      const n = tree.nodeById(c.id);
      if (!visible(n)) continue;
      if (n.kind === "lesson") {
        into.push(lessonItem(n, pool, chapter));
        count += 1;
      } else collect(c.children, into, n.kind === "chapter" ? n.title_ar ?? null : chapter);
    }
  };
  for (const c of root.children) {
    const n = tree.nodeById(c.id);
    if (!visible(n)) continue;
    if (n.kind === "lesson") {
      loose ??= { id: null, title: null, title_en: null, term: null, pool: 0, lessons: [] };
      loose.lessons.push(lessonItem(n, pool));
      loose.pool += pool.stats(n.id).total;
      count += 1;
      continue;
    }
    const lessons = [];
    collect(c.children, lessons, null);
    units.push({ id: n.id, title: n.title_ar ?? "", title_en: n.title_en ?? null, term: termBadge(n), pool: pool.stats(n.id).total, lessons });
  }
  if (loose) units.push(loose);
  return { units, lessons: count };
}

// ── page model ──────────────────────────────────────────────────────────────
const slim = (n) => ({ id: n.id, kind: n.kind, title: n.title_ar ?? "", title_en: n.title_en ?? null });

/** Outline of one unit or chapter (same shape as compactOutline, one group). */
export function unitOutline(tree, node, pool) {
  const lessons = (tree.lessonsUnder(node.id) || []).map((id) => tree.nodeById(id)).filter(visible).map((n) => lessonItem(n, pool));
  return { units: [{ id: node.id, title: node.title_ar ?? "", title_en: node.title_en ?? null, term: termBadge(node), pool: pool.stats(node.id).total, lessons }], lessons: lessons.length };
}

/** Where a curriculum crumb links: catalog nodes → /curriculum/…, content nodes → /learn/…. */
export function crumbHref(n) {
  if (n.kind === "stage" || n.kind === "grade" || n.kind === "track") return `/curriculum/${n.id}`;
  return CONTENT_KINDS.has(n.kind) ? learnHref(n.id) : null;
}

/**
 * Everything a learn page renders, JSON-safe:
 *   { kind, node, trail[], subject, term, entries: {primary, related}, resources[], counts,
 *     outline (subject / unit / chapter), lesson (lesson pages only) }
 */
export function learnPageModel(tree, ctx, pool) {
  const { node, subject } = ctx;
  const subjectTerms = tree.subjectTerms?.(subject.id) ?? [];
  const rawResources = tree.resourcesFor?.(subject.id) ?? [];
  const byId = new Map(rawResources.map((r) => [r.id, r]));
  const allLessons = (tree.lessonsUnder(subject.id) || []).map((id) => tree.nodeById(id)).filter(visible);
  const model = {
    kind: node.kind,
    node: { ...slim(node), status: node.status },
    trail: ctx.trail.map((n) => ({ ...slim(n), href: n === node ? null : crumbHref(n) })),
    subject: slim(subject),
    term: termBadge(node),
    entries: entryPointsFor(tree, ctx, pool, subjectTerms),
    resources: sortResources(rawResources.map(resourceView)),
    counts: {
      units: (tree.subjectOutline(subject.id)?.children || []).filter((c) => visible(tree.nodeById(c.id)) && tree.nodeById(c.id).kind !== "lesson").length,
      lessons: allLessons.length,
    },
    outline: null,
    lesson: null,
  };
  if (node.kind === "subject") model.outline = compactOutline(tree, subject.id, pool);
  else if (node.kind === "unit" || node.kind === "chapter") model.outline = unitOutline(tree, node, pool);
  else {
    const at = allLessons.findIndex((n) => n.id === node.id);
    const unitLike = ctx.chapter ?? ctx.unit;
    model.lesson = {
      unit: unitLike ? slim(unitLike) : null,
      objectives: (Array.isArray(node.objectives) ? node.objectives : [])
        .filter((o) => o && typeof o.text_ar === "string" && o.text_ar.trim())
        .map((o) => ({ id: o.id ?? null, text: o.text_ar, text_en: o.text_en ?? null })),
      pages: lessonPages(node, byId),
      pool: pool.stats(node.id),
      opener: node.unit_opener === true,
      review: node.status !== "verified",
      prev: at > 0 ? slim(allLessons[at - 1]) : null,
      next: at >= 0 && at < allLessons.length - 1 ? slim(allLessons[at + 1]) : null,
    };
  }
  return model;
}
