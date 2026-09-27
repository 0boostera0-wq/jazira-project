// ============================================================================
// Catalog ↔ iEN subject mapping (docs/CONTENT_ENGINE.md §2.5).
//
// `data/staging/sources/research/catalog-map.jsonl` (catalog-map@1, origin:
// agent_audit) is the starting mapping. It is never trusted unchecked: every
// row is verified deterministically against the crawl —
//   (1) each ien_subject_id is a SUB node under the SAME catalog leaf,
//   (2) its books equal books.jsonl (file paths),
//   (3) lesson_count / unit_count equal lessons.jsonl,
//   (4) it agrees with the title heuristic (normalized iEN title = catalog
//       plan label, secondary first, then the catalog name).
// A failing or disagreeing row keeps its (existing, same-leaf) ids with
// `needs_review` and an audit row. iEN subjects no catalog subject claims are
// `source_only` (never added to the catalog). Catalog subjects without an iEN
// subject are `catalog_only` with a reason. The result is the single output
// mapping (ien-mapping.json).
// ============================================================================

import { normalizeTitle } from "../../../src/lib/content/normalize.js";
import { compareC } from "../../../src/lib/content/prng.js";

export const TRACK_CODES = Object.freeze({ GNRL: "general", RLGS: "sharia", BM: "business", CSE: "cs-eng", HL: "health" });

/** Catalog leaf slug of an iEN node (grade / track / subject), or null. */
export function leafOfIenNode(n) {
  if (!n) return null;
  const k = /^K0([1-9])$/.exec(n.grade_code ?? "");
  if (k) {
    const g = Number(k[1]);
    return g <= 6 ? `elementary/grade-${g}` : `middle/grade-${g - 6}`;
  }
  if (!n.grade_code && n.track_code === "TRC1") return "high-school/grade-1/first-year";
  const y = /^TRC([23])$/.exec(n.grade_code ?? "");
  if (y && TRACK_CODES[n.track_code]) return `high-school/grade-${y[1]}/${TRACK_CODES[n.track_code]}`;
  return null;
}

/** Subject title key: normalized, «مقرر» prefix dropped, letters and digits split («الحديث2» = «الحديث 2»). */
export function subjectTitleKey(title) {
  return normalizeTitle(String(title ?? "").replace(/^\s*مقرر\s*/u, ""))
    .replace(/([؀-ۿa-z])([0-9])/gu, "$1 $2")
    .replace(/([0-9])([؀-ۿa-z])/gu, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

const sameSet = (a, b) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);

/**
 * Title heuristic for one leaf: iEN SUB node id → catalog subject id | null.
 * Plan labels are tried first (secondary numbered courses), then the name.
 */
export function titleHeuristic(subjects, subNodes) {
  const byLabel = new Map();
  const byName = new Map();
  const add = (m, key, id) => m.set(key, [...new Set([...(m.get(key) ?? []), id])]);
  for (const s of subjects) {
    for (const l of s.labels ?? []) add(byLabel, subjectTitleKey(l), s.id);
    add(byName, subjectTitleKey(s.name), s.id);
  }
  const out = new Map();
  for (const n of subNodes) {
    const key = subjectTitleKey(n.title);
    const hit = byLabel.get(key) ?? byName.get(key) ?? [];
    out.set(n.ien_id, hit.length === 1 ? hit[0] : null);
  }
  return out;
}

/**
 * Reconcile catalog-map rows with the crawl.
 * @param {object} p
 * @param {{ leaf: string, subjects: {id, name, name_en?, labels}[] }[]} p.leaves  catalog leaves (src/lib/curriculum.js)
 * @param {object[]} p.nodes    nodes.jsonl
 * @param {object[]} p.books    books.jsonl
 * @param {object[]} p.lessons  lessons.jsonl
 * @param {object[]} p.rows     catalog-map.jsonl
 */
export function reconcileCatalogMap({ leaves, nodes, books, lessons, rows }) {
  const subNodes = nodes.filter((n) => n.code_type === "SUB");
  const subById = new Map(subNodes.map((n) => [n.ien_id, n]));
  const leafSet = new Map(leaves.map((l) => [l.leaf, l]));
  const subsByLeaf = new Map();
  for (const n of subNodes) {
    const leaf = leafOfIenNode(n);
    if (!subsByLeaf.has(leaf)) subsByLeaf.set(leaf, []);
    subsByLeaf.get(leaf).push(n);
  }
  const nodeOrder = (a, b) => (subById.get(a)?.order_in_parent ?? 0) - (subById.get(b)?.order_in_parent ?? 0) || a - b;

  const booksBy = new Map();
  for (const b of books) {
    if (!booksBy.has(b.subject_ien_id)) booksBy.set(b.subject_ien_id, []);
    booksBy.get(b.subject_ien_id).push(b.path);
  }
  const lessonStats = new Map();
  for (const l of lessons) {
    const s = lessonStats.get(l.subject_ien_id) ?? { lessons: 0, units: new Set() };
    s.lessons++;
    s.units.add(l.unit_ien_id);
    lessonStats.set(l.subject_ien_id, s);
  }

  const heuristic = new Map(); // ien id → catalog subject id | null
  for (const { leaf, subjects } of leaves) {
    for (const [id, sid] of titleHeuristic(subjects, subsByLeaf.get(leaf) ?? [])) heuristic.set(id, sid);
  }

  const audit = [];
  const rowResults = [];
  const mapping = new Map(); // subject node id → entry
  const sortedRows = [...rows].sort((a, b) => compareC(a.jazira_leaf, b.jazira_leaf) || compareC(a.jazira_subject_id, b.jazira_subject_id));

  for (const row of sortedRows) {
    const leaf = leafSet.get(row.jazira_leaf);
    const subject = leaf?.subjects.find((s) => s.id === row.jazira_subject_id) ?? null;
    const subjectNode = subject ? `${row.jazira_leaf}/${subject.id}` : null;
    const failures = [];
    const valid = [];
    for (const id of row.ien_subject_ids) {
      const n = subById.get(id);
      if (!n) failures.push({ code: "map_missing_node", detail: `iEN subject ${id} is not in nodes.jsonl` });
      else if (leafOfIenNode(n) !== (subject ? row.jazira_leaf : leafOfIenNode(n))) {
        failures.push({ code: "map_wrong_grade", detail: `iEN subject ${id} is under ${leafOfIenNode(n)}, not ${row.jazira_leaf}` });
      } else valid.push(id);
    }
    // Multi-course subjects (التوحيد 1 / 2) follow the catalog label order.
    const labelKeys = (subject?.labels ?? []).map(subjectTitleKey);
    const labelIdx = (id) => {
      const k = labelKeys.indexOf(subjectTitleKey(subById.get(id)?.title));
      return k < 0 ? labelKeys.length : k;
    };
    const ids = [...new Set(valid)].sort((a, b) => labelIdx(a) - labelIdx(b) || nodeOrder(a, b));
    const listed = ids.flatMap((id) => booksBy.get(id) ?? []);
    if (!sameSet(listed, row.books)) failures.push({ code: "map_books_mismatch", detail: `books ${JSON.stringify([...row.books].sort())} ≠ crawl ${JSON.stringify([...listed].sort())}` });
    const lessonsN = ids.reduce((n, id) => n + (lessonStats.get(id)?.lessons ?? 0), 0);
    const unitsN = ids.reduce((n, id) => n + (lessonStats.get(id)?.units.size ?? 0), 0);
    if (lessonsN !== row.lesson_count) failures.push({ code: "map_lesson_count_mismatch", detail: `lesson_count ${row.lesson_count} ≠ crawl ${lessonsN}` });
    if (unitsN !== row.unit_count) failures.push({ code: "map_unit_count_mismatch", detail: `unit_count ${row.unit_count} ≠ crawl ${unitsN}` });
    if (subject) {
      const disagree = ids.filter((id) => heuristic.get(id) !== subject.id);
      if (disagree.length) failures.push({ code: "map_title_disagrees", detail: `title heuristic does not give ${subject.id} for ${disagree.map((id) => `${id} «${subById.get(id).title}»`).join(", ")}` });
      const missed = (subsByLeaf.get(row.jazira_leaf) ?? []).filter((n) => heuristic.get(n.ien_id) === subject.id && !ids.includes(n.ien_id));
      if (missed.length) failures.push({ code: "map_heuristic_extra", detail: `title heuristic also gives ${subject.id} for ${missed.map((n) => n.ien_id).join(", ")}` });
    }

    // A second row for the same catalog subject is never merged or allowed to
    // overwrite the first (sorted, so the choice is deterministic): audit only.
    if (subject && mapping.has(subjectNode)) {
      audit.push({ schema: "curriculum-audit@1", node_id: null, subject_node_id: subjectNode, resource_id: null, code: "map_duplicate_row", detail: `${row.jazira_leaf}/${row.jazira_subject_id}: a second catalog-map row for this subject was ignored (ien ${JSON.stringify(row.ien_subject_ids)})`.slice(0, 1000), status: "needs_review" });
      mapping.get(subjectNode).status = "needs_review";
      rowResults.push({ leaf: row.jazira_leaf, subject_id: row.jazira_subject_id, match: row.match, outcome: "duplicate", ien_subject_ids: [], failures: [{ code: "map_duplicate_row" }] });
      continue;
    }
    let outcome;
    if (!subject) outcome = "not_in_catalog";
    // No usable id: catalog_only only when the audit itself claimed none; ids that
    // all failed verification (wrong grade, missing node) are not proof of absence.
    else if (!ids.length) outcome = row.ien_subject_ids.length ? "needs_review" : "catalog_only";
    else outcome = failures.length ? "needs_review" : "verified";
    rowResults.push({ leaf: row.jazira_leaf, subject_id: row.jazira_subject_id, match: row.match, outcome, ien_subject_ids: ids, failures });

    for (const f of failures) {
      audit.push({ schema: "curriculum-audit@1", node_id: null, subject_node_id: subjectNode, resource_id: null, code: f.code, detail: `${row.jazira_leaf}/${row.jazira_subject_id}: ${f.detail}`.slice(0, 1000), status: "needs_review" });
    }
    if (subject) {
      mapping.set(subjectNode, {
        subject_node_id: subjectNode,
        leaf: row.jazira_leaf,
        subject_id: subject.id,
        ien_subject_ids: ids,
        status: outcome === "verified" || outcome === "catalog_only" ? "verified" : "needs_review",
        outcome,
        origin: "agent_audit",
        match: row.match,
        reason: outcome === "catalog_only" ? reasonOf(row) : null,
      });
    }
  }

  // Catalog subjects without a catalog-map row: title heuristic only (needs_review) or catalog_only.
  for (const { leaf, subjects } of leaves) {
    for (const s of subjects) {
      const id = `${leaf}/${s.id}`;
      if (mapping.has(id)) continue;
      const ids = (subsByLeaf.get(leaf) ?? []).filter((n) => heuristic.get(n.ien_id) === s.id).map((n) => n.ien_id).sort(nodeOrder);
      const outcome = ids.length ? "heuristic_only" : "catalog_only";
      mapping.set(id, { subject_node_id: id, leaf, subject_id: s.id, ien_subject_ids: ids, status: "needs_review", outcome, origin: ids.length ? "title_heuristic" : null, match: null, reason: ids.length ? null : `no catalog-map row and no iEN subject titled «${s.name}» in ${leaf}` });
      audit.push({ schema: "curriculum-audit@1", node_id: null, subject_node_id: id, resource_id: null, code: ids.length ? "map_heuristic_only" : "catalog_only", detail: ids.length ? `${id}: no catalog-map row; title heuristic gives ${ids.join(", ")}` : `${id}: no catalog-map row and no iEN subject`, status: "needs_review" });
    }
  }

  // One owner per iEN subject.
  const owner = new Map();
  for (const m of [...mapping.values()].sort((a, b) => compareC(a.subject_node_id, b.subject_node_id))) {
    m.ien_subject_ids = m.ien_subject_ids.filter((id) => {
      if (!owner.has(id)) {
        owner.set(id, m.subject_node_id);
        return true;
      }
      audit.push({ schema: "curriculum-audit@1", node_id: null, subject_node_id: m.subject_node_id, resource_id: null, code: "map_duplicate_claim", detail: `iEN subject ${id} is already mapped to ${owner.get(id)}`, status: "needs_review" });
      m.status = "needs_review";
      return false;
    });
  }

  const sourceOnly = [];
  const unplaced = [];
  for (const n of [...subNodes].sort((a, b) => a.ien_id - b.ien_id)) {
    if (owner.has(n.ien_id)) continue;
    const leaf = leafOfIenNode(n);
    if (!leaf || !leafSet.has(leaf)) {
      unplaced.push({ ien_id: n.ien_id, title: n.title, grade_code: n.grade_code, track_code: n.track_code });
      audit.push({ schema: "curriculum-audit@1", node_id: null, subject_node_id: null, resource_id: null, code: "unplaced_ien_subject", detail: `iEN subject ${n.ien_id} «${n.title}» has no catalog leaf`, status: "needs_review" });
      continue;
    }
    sourceOnly.push({ ien_id: n.ien_id, subject_node_id: `${leaf}/ien-${n.ien_id}`, leaf, title: n.title, code_id: n.code_id || null, reason: heuristic.get(n.ien_id) === undefined ? "not in a catalog leaf" : "no catalog subject for this iEN subject (not in the study plan, or not modelled)" });
  }

  const count = (arr, f) => arr.reduce((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {});
  const summary = {
    rows: rowResults.length,
    rows_by_match: count(rowResults, (r) => r.match),
    rows_by_outcome: count(rowResults, (r) => r.outcome),
    catalog_subjects: mapping.size,
    catalog_subjects_by_outcome: count([...mapping.values()], (m) => m.outcome),
    source_only: sourceOnly.length,
    unplaced: unplaced.length,
  };
  return { mapping, ienToSubject: owner, sourceOnly, unplaced, rowResults, audit, summary, subById };
}

function reasonOf(row) {
  const note = String(row.notes ?? "").trim();
  return (note || `no iEN subject for ${row.jazira_name} in ${row.jazira_leaf}`).slice(0, 300);
}

/** Serializable ien-mapping.json object (sorted, deterministic). */
export function mappingDocument(result, { retrievedAt }) {
  const subjects = {};
  const units = {};
  for (const [id, sn] of [...result.ienToSubject].sort((a, b) => a[0] - b[0])) subjects[String(id)] = sn;
  for (const [id, node] of [...(result.unitNodes ?? new Map())].sort((a, b) => a[0] - b[0])) units[String(id)] = node;
  const catalog = [...result.mapping.values()]
    .sort((a, b) => compareC(a.subject_node_id, b.subject_node_id))
    .map((m) => ({ subject_node_id: m.subject_node_id, ien_subject_ids: [...m.ien_subject_ids], status: m.status, outcome: m.outcome, origin: m.origin, match: m.match }));
  return {
    schema: "ien-mapping@1",
    retrieved_at: retrievedAt,
    counting_rules: "rows_by_outcome counts catalog-map.jsonl rows; catalog_subjects counts the 20 catalog leaves' subjects; source_only counts iEN SUB nodes no catalog subject claims.",
    summary: result.summary,
    subjects,
    source_only: result.sourceOnly.map((s) => ({ ien_id: s.ien_id, subject_node_id: s.subject_node_id, title: s.title, reason: s.reason })),
    catalog_only: [...result.mapping.values()]
      .filter((m) => m.outcome === "catalog_only")
      .sort((a, b) => compareC(a.subject_node_id, b.subject_node_id))
      .map((m) => ({ subject_node_id: m.subject_node_id, reason: m.reason })),
    catalog,
    rows: result.rowResults.map((r) => ({ leaf: r.leaf, subject_id: r.subject_id, match: r.match, outcome: r.outcome, ien_subject_ids: r.ien_subject_ids, failed_checks: [...new Set(r.failures.map((f) => f.code))].sort() })),
    unplaced: result.unplaced,
    units,
  };
}
