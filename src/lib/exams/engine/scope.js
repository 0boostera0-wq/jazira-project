// ============================================================================
// Scope grammar and resolution (docs/CONTENT_ENGINE.md §2.12, §5.3 step 1).
//
//   scope := <node id> [ "@" ("t1" | "t2" | "year") ]
//          | "prep:" exam [ "/" section [ "/" topic ] ]
//          | "weak:" [ <node id> ]
//
//   parseScope(text)                  → parsed | null
//   resolveScope(tree, parsed)        → { ok, kind, node, lessons[], lessonIds[] } | { ok:false, error }
//   eligibleLessons(tree, text)       → lesson ids (the node-tree fixture's `eligibleLessons`)
//   scopeKind(parsed, node)           → "lesson" | "unit" | … | "subject@t1" | "prep_section" | "weak"
//   checkScopeCaps(kind, tier)        guests: subject level or narrower (+ prep:<exam>/<section>)
//   createTree(nodes, subjectTerms)   in-memory implementation of the node-tree interface
//
// `tree` is any object with the node-tree interface of
// tests/fixtures/content/outline-tree.json — nodeById(id), lessonsUnder(id),
// subjectTerms(id) (sync or async). The routes pass WP2's
// src/lib/curriculum-outline.js; this module never reads files.
// ============================================================================
import { EXAMS, SECTIONS } from "../catalog.js";
import { isNodeId } from "../../content/ids.js";

export const SCOPE_MAX_LENGTH = 200;
export const SCOPE_ITEM_CAP = 5000; // §5.3: any scope above 5,000 eligible items → scope_too_large
const TERM_SUFFIXES = ["t1", "t2", "year"];
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/**
 * Parse a scope string. Strict: no whitespace, no unknown prep vocabulary.
 * @returns {null | { raw, type: "node", node, term: null|"t1"|"t2"|"year" }
 *               | { raw, type: "prep", exam, section, topic, node }
 *               | { raw, type: "weak", node: string|null }}
 */
export function parseScope(text) {
  if (typeof text !== "string" || !text || text.length > SCOPE_MAX_LENGTH) return null;
  if (text.startsWith("prep:")) {
    const parts = text.slice(5).split("/");
    if (parts.length < 1 || parts.length > 3 || !parts.every((p) => SLUG.test(p))) return null;
    const [exam, section = null, topic = null] = parts;
    if (!hasOwn(EXAMS, exam)) return null;
    if (section !== null && (!EXAMS[exam].sections.includes(section) || !hasOwn(SECTIONS, section))) return null;
    if (topic !== null && !SECTIONS[section].topics.includes(topic)) return null;
    return { raw: text, type: "prep", exam, section, topic, node: text };
  }
  if (text.startsWith("weak:")) {
    const rest = text.slice(5);
    if (rest === "") return { raw: text, type: "weak", node: null };
    return isNodeId(rest) ? { raw: text, type: "weak", node: rest } : null;
  }
  const at = text.indexOf("@");
  const node = at < 0 ? text : text.slice(0, at);
  const term = at < 0 ? null : text.slice(at + 1);
  if (term !== null && !TERM_SUFFIXES.includes(term)) return null;
  if (!isNodeId(node)) return null;
  return { raw: text, type: "node", node, term };
}

/** The scope kind a template lists in `scope_kinds`. */
export function scopeKind(parsed, node = null) {
  if (!parsed) return null;
  if (parsed.type === "prep") return parsed.topic ? "prep_topic" : parsed.section ? "prep_section" : "prep";
  if (parsed.type === "weak") return "weak";
  if (!node) return null;
  return parsed.term ? `${node.kind}@${parsed.term}` : node.kind;
}

const WIDE = new Set(["stage", "grade", "track", "prep"]);

/**
 * Scope size caps (§5.3, §5.8): guests may use subject-level or narrower
 * scopes plus prep:<exam>/<section>; stage, grade, track and a whole prep
 * exam are refused for them.
 */
export function checkScopeCaps(kind, tier) {
  if (tier === "guest" && WIDE.has(String(kind).split("@")[0])) return { ok: false, error: "scope_too_large" };
  return { ok: true };
}

/** A lesson that may enter a pool: verified and not a unit opener (§2.5, §5.3). */
export const isPoolLesson = (n) => Boolean(n) && n.kind === "lesson" && n.status === "verified" && n.unit_opener !== true;
const termOk = (n, term) => (n.term === term || n.term === "both") && (n.term_status === "verified" || n.term_status === "inferred");

/**
 * Resolve a parsed node scope to its eligible lessons with their context
 * (unit, chapter, term) for stratification.
 * @returns {Promise<{ ok:true, kind, node, lessons: object[], lessonIds: string[] } | { ok:false, error, field? }>}
 */
export async function resolveScope(tree, parsed) {
  if (!parsed) return { ok: false, error: "invalid_argument", field: "scope" };
  if (parsed.type === "prep") return { ok: true, kind: scopeKind(parsed), node: null, lessons: [], lessonIds: [], prep: parsed };
  const nodeId = parsed.node;
  if (parsed.type === "weak" && nodeId === null) return { ok: true, kind: "weak", node: null, lessons: [], lessonIds: [] };
  const node = await tree.nodeById(nodeId);
  if (!node || node.kind === "term" || node.status === "source_only" || node.status === "unavailable") return { ok: false, error: "scope_not_found" };
  if (parsed.type === "node" && parsed.term && node.kind !== "subject") return { ok: false, error: "invalid_argument", field: "scope" };
  const cache = new Map([[node.id, node]]);
  const get = async (id) => {
    if (!cache.has(id)) cache.set(id, (await tree.nodeById(id)) ?? null);
    return cache.get(id);
  };
  const ids = (await tree.lessonsUnder(nodeId)) ?? [];
  const lessons = [];
  for (const id of ids) {
    const n = await get(id);
    if (!isPoolLesson(n)) continue;
    const term = parsed.type === "node" ? parsed.term : null;
    if ((term === "t1" || term === "t2") && !termOk(n, term)) continue;
    let unit = null;
    let chapter = null;
    let subject = null;
    let p = n.parent_id ? await get(n.parent_id) : null;
    for (let depth = 0; p && depth < 8; depth++) {
      if (p.kind === "chapter" && !chapter) chapter = p.id;
      else if (p.kind === "unit" && !unit) unit = p.id;
      else if (p.kind === "subject") {
        subject = p.id;
        break;
      }
      p = p.parent_id ? await get(p.parent_id) : null;
    }
    lessons.push({ id: n.id, title: n.title_ar ?? null, term: n.term ?? null, term_status: n.term_status ?? null, unit, chapter, subject });
  }
  return { ok: true, kind: parsed.type === "weak" ? "weak" : scopeKind(parsed, node), node, lessons, lessonIds: lessons.map((l) => l.id) };
}

/** §5.3 step 1 for a scope string (the fixture's `eligibleLessons`). */
export async function eligibleLessons(tree, text) {
  const r = await resolveScope(tree, parseScope(text));
  return r.ok ? r.lessonIds : null;
}

/** Does a pool row's lesson column belong to a prep scope (topic rows are `prep:<exam>/<section>/<topic>`)? */
export function inPrepScope(parsed, lessonColumn) {
  return typeof lessonColumn === "string" && (lessonColumn === parsed.node || lessonColumn.startsWith(`${parsed.node}/`));
}

/**
 * In-memory node tree over `curriculum-node@1` rows (tests, scripts). Same
 * interface as WP2's curriculum-outline.js.
 */
export function createTree(nodes, subjectTermRows = []) {
  const byId = new Map();
  const children = new Map();
  for (const n of nodes) {
    byId.set(n.id, n);
    if (n.parent_id && n.kind !== "term") {
      if (!children.has(n.parent_id)) children.set(n.parent_id, []);
      children.get(n.parent_id).push(n);
    }
  }
  for (const list of children.values()) list.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const lessonsUnder = (id) => {
    const n = byId.get(id);
    if (!n) return [];
    if (n.kind === "lesson") return [n.id];
    const out = [];
    const walk = (pid) => {
      for (const c of children.get(pid) ?? []) {
        if (c.kind === "lesson") out.push(c.id);
        else walk(c.id);
      }
    };
    walk(id);
    return out;
  };
  const subjectOutline = (id) => {
    const build = (nid) => ({ id: nid, children: (children.get(nid) ?? []).map((c) => build(c.id)) });
    return byId.has(id) ? build(id) : null;
  };
  return {
    nodeById: (id) => byId.get(id) ?? null,
    lessonsUnder,
    subjectOutline,
    subjectTerms: (id) => subjectTermRows.filter((r) => r.subject_node_id === id),
    outlineFor: (leaf) => ({ leaf, subjects: (children.get(leaf) ?? []).filter((c) => c.kind === "subject").map((c) => c.id) }),
  };
}
