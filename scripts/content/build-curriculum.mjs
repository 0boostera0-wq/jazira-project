#!/usr/bin/env node
// ============================================================================
// Curriculum normalization — run R2 (docs/CONTENT_ENGINE.md §2.4, §2.5, §4.2).
//
// Inputs (read only): the catalog (src/lib/curriculum.js), the verified
// research JSON (src/content/curriculum/verified-*.json), the crawl
// (data/staging/sources/ien/{nodes,books,lessons}.jsonl, crawl-report.json),
// catalog-map.jsonl (agent audit, verified here), research/term-evidence.json,
// book-frontmatter.jsonl (its `term_*` keys are ignored), and when present
// WP3's resources/{extraction.jsonl,term-evidence.jsonl,toc/*.json} and
// curriculum/owner-decisions.jsonl.
//
// Outputs (deterministic, byte-stable; a rerun with no input change writes
// nothing):
//   data/staging/curriculum/nodes/<stage>/<grade>[-<track>].jsonl   §2.5 nodes
//   data/staging/curriculum/{subject-terms.jsonl,ien-mapping.json,audit.jsonl,id-registry.jsonl}
//   data/staging/resources/resources.jsonl                           §2.4
//   data/staging/resources/term-evidence.jsonl  (WP3 page rows kept; the
//        page-0 routes listing/plan guide/course code/owner decision rebuilt)
//   src/content/curriculum/outline/<stage>/<grade>[-<track>].json    app outline
//   src/content/curriculum/outline/catalog-terms.js                  catalog term table (JS
//        module: src/lib/curriculum.js imports it in the browser, Next and Node)
//   src/content/curriculum/verified-*.json      terms only on VERIFIED membership
//
// USAGE
//   node scripts/content/build-curriculum.mjs            build and write
//   node scripts/content/build-curriculum.mjs --check    exit 1 when any output is stale
//   node scripts/content/build-curriculum.mjs --cache-pages
//        also re-derive cover terms from cached page text (content-cache
//        ien/text/<stem>/p001–p003.txt; cache only, nothing copied)
// ============================================================================

import { existsSync, readFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { normalizeTitle, trigramJaccard } from "../../src/lib/content/normalize.js";
import { compareC } from "../../src/lib/content/prng.js";
import { isSafePdfName, cacheRoot, cachePaths } from "./lib/cache.mjs";
import { IdRegistry } from "./lib/id-registry.mjs";
import { readJsonl, writeFileIfChanged, writeShards } from "./lib/jsonl.mjs";
import { stringifyRecord } from "./lib/schemas.mjs";
import { reconcileCatalogMap, mappingDocument, leafOfIenNode } from "./lib/ien-mapping.mjs";
import { partEvidence, resolvePart, yearEvidence, resolveYear } from "./lib/part-year.mjs";
import {
  DERIVED_P0_METHODS,
  catalogTermsFromMembership,
  dedupeById,
  evidenceFromCourseCode,
  evidenceFromListing,
  evidenceFromOwnerDecisions,
  evidenceFromPages,
  evidenceFromPlanGuide,
  resolveResourceTerm,
  strictTermMatches,
  subjectTermMembership,
  termSet,
  toDateTime,
} from "./lib/term-resolve.mjs";
import { termEvidenceId } from "../../src/lib/content/ids.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const PATHS = Object.freeze({
  staging: join(ROOT, "data/staging"),
  outline: join(ROOT, "src/content/curriculum/outline"),
  k9: join(ROOT, "src/content/curriculum/verified-k9.json"),
  secondary: join(ROOT, "src/content/curriculum/verified-secondary.json"),
});

const TERM_TITLES = {
  t1: { ar: "الفصل الدراسي الأول", en: "Term 1" },
  t2: { ar: "الفصل الدراسي الثاني", en: "Term 2" },
};
const OPENER_RE = new RegExp(`^${normalizeTitle("مدخل")}\\s+(?:${normalizeTitle("وحدة")}|${normalizeTitle("الوحدة")})(?:\\s|$)`, "u");
export const isUnitOpener = (title) => OPENER_RE.test(normalizeTitle(title));
const LATIN_RE = /[A-Za-z]/;
const ARABIC_RE = /[؀-ۿ]/;
/** An English (Latin-only) source title is also its `title_en`; Arabic titles never get a machine translation. */
const sourceTitleEn = (title) => (LATIN_RE.test(title) && !ARABIC_RE.test(title) ? title : null);
/** A catalog English name only when it really is English (the catalog falls back to the Arabic name). */
const latinOnly = (s) => (typeof s === "string" && LATIN_RE.test(s) && !ARABIC_RE.test(s) ? s : null);

/**
 * normalized Arabic title → the catalog's English name (`name_en`, and each plan
 * label's `labels_en`), from every catalog subject. Jazira's own renderings
 * (§2.5 "or the catalog has it"), never a machine translation. A title the
 * catalog renders two different ways is ambiguous and left out.
 */
export function catalogTitlesEn(leaves) {
  const out = new Map();
  const bad = new Set();
  const add = (ar, en) => {
    const k = ar ? normalizeTitle(ar) : "";
    const v = latinOnly(en);
    if (!k || !v || bad.has(k)) return;
    if (out.has(k) && out.get(k) !== v) {
      out.delete(k);
      bad.add(k);
    } else out.set(k, v);
  };
  for (const { subjects } of leaves) {
    for (const s of subjects ?? []) {
      add(s.name, s.name_en);
      (s.labels ?? []).forEach((l, i) => add(l, s.labels_en?.[i]));
    }
  }
  return out;
}
const clip = (s, n) => String(s ?? "").trim().slice(0, n);
const byC = (f) => (a, b) => compareC(f(a), f(b));

/** File (relative to nodes/ or outline/) holding a leaf: middle/grade-1, high-school/grade-2-general. */
export function leafFile(leaf) {
  const [stage, grade, track] = leaf.split("/");
  return track ? `${stage}/${grade}-${track}` : `${stage}/${grade}`;
}

// ── node factory ──────────────────────────────────────────────────────────
function node(p) {
  return {
    schema: "curriculum-node@1",
    id: p.id,
    parent_id: p.parent_id ?? null,
    kind: p.kind,
    stage: p.stage ?? null,
    grade: p.grade ?? null,
    track: p.track ?? null,
    subject: p.subject ?? null,
    order: p.order ?? 0,
    title_ar: clip(p.title_ar, 300),
    title_en: p.title_en ? clip(p.title_en, 300) : null,
    term: p.term ?? null,
    term_status: p.term_status ?? "unknown",
    term_evidence: p.term_evidence ?? [],
    pages: p.pages ?? [],
    source_refs: p.source_refs ?? [],
    in_plan: p.in_plan ?? true,
    status: p.status ?? "verified",
    ...(p.unit_opener ? { unit_opener: true } : {}),
    audit: p.audit ?? [],
  };
}

const ref = (source_id, { ien_id = null, ien_unit_id = null, code_id = null, retrieved_at = null } = {}) => ({
  source_id,
  ien_id,
  ien_unit_id,
  code_id: code_id ? clip(code_id, 40) : null,
  retrieved_at,
});

// ── structure: stage → grade → track → term / subject → unit → lesson ─────
/**
 * Catalog leaves as build input: [{ leaf, slug, trail, subjects }] from
 * `allLeaves()` of src/lib/curriculum.js (stages in catalog order).
 */
export function catalogLeaves(catalog) {
  return catalog.allLeaves().map(({ slug, node, trail }) => ({ leaf: slug.join("/"), slug, trail, subjects: node.subjects }));
}

function buildStructure(ctx) {
  const { leaves, catalog, recon, lessons, crawlNodes, at, sourceDates, registry, taken } = ctx;
  const nodes = new Map();
  const put = (n) => {
    if (nodes.has(n.id)) throw new Error(`duplicate node ${n.id}`);
    nodes.set(n.id, n);
    return n;
  };
  const planRef = () => [ref("moe-plan-guide-5", { retrieved_at: sourceDates["moe-plan-guide-5"] })];
  const ienNodeFor = (leaf, types) => crawlNodes.find((n) => types.includes(n.code_type) && leafOfIenNode(n) === leaf) ?? null;
  // English titles of subjects and units: the source's own English title, else the catalog's.
  const catalogEn = catalogTitlesEn(leaves);
  const titleEnOf = (title) => sourceTitleEn(title) ?? catalogEn.get(normalizeTitle(title)) ?? null;

  const stages = catalog.CURRICULUM.filter((s) => !s.pending);
  stages.forEach((s, i) => put(node({ id: s.id, kind: "stage", stage: s.id, order: i + 1, title_ar: s.name, title_en: s.name_en, source_refs: planRef() })));
  for (const s of stages) {
    s.children.forEach((g, i) => {
      const gid = `${s.id}/${g.id}`;
      const kNode = s.id === "high-school" ? null : ienNodeFor(gid, ["K"]);
      put(node({ id: gid, parent_id: s.id, kind: "grade", stage: s.id, grade: gid, order: i + 1, title_ar: g.title ?? g.name, title_en: g.title_en ?? g.name_en,
        source_refs: kNode ? [ref("ien", { ien_id: kNode.ien_id, code_id: kNode.code_id, retrieved_at: at })] : planRef() }));
      if (Array.isArray(g.children)) {
        g.children.forEach((t, j) => {
          const tid = `${gid}/${t.id}`;
          const tNode = ienNodeFor(tid, ["K", "TRK"]);
          put(node({ id: tid, parent_id: gid, kind: "track", stage: s.id, grade: gid, track: tid, order: j + 1, title_ar: t.name, title_en: t.name_en,
            source_refs: tNode ? [ref("ien", { ien_id: tNode.ien_id, code_id: tNode.code_id, retrieved_at: at })] : planRef() }));
        });
      }
    });
  }

  const lessonsBySubject = new Map();
  for (const l of lessons) {
    if (!lessonsBySubject.has(l.subject_ien_id)) lessonsBySubject.set(l.subject_ien_id, []);
    lessonsBySubject.get(l.subject_ien_id).push(l);
  }
  const subjectInfo = new Map(); // subject node id → { ienIds, status, inPlan }

  for (const { leaf, subjects } of leaves) {
    const [stage, grade, track] = leaf.split("/");
    const base = { stage, grade: `${stage}/${grade}`, track: track ? leaf : null };
    let order = 0;
    for (const s of subjects) {
      const id = `${leaf}/${s.id}`;
      const m = recon.mapping.get(id);
      const ids = m?.ien_subject_ids ?? [];
      put(node({ ...base, id, parent_id: leaf, kind: "subject", subject: id, order: ++order, title_ar: s.name, title_en: latinOnly(s.name_en) ?? titleEnOf(s.name),
        source_refs: ids.length ? ids.slice(0, 20).map((x) => ref("ien", { ien_id: x, code_id: recon.subById.get(x)?.code_id || null, retrieved_at: at })) : planRef(),
        in_plan: true, status: m?.status ?? "needs_review" }));
      subjectInfo.set(id, { ienIds: ids, status: m?.status ?? "needs_review", inPlan: true, leaf, base });
    }
    for (const so of recon.sourceOnly.filter((x) => x.leaf === leaf)) {
      put(node({ ...base, id: so.subject_node_id, parent_id: leaf, kind: "subject", subject: so.subject_node_id, order: ++order, title_ar: so.title, title_en: titleEnOf(so.title),
        source_refs: [ref("ien", { ien_id: so.ien_id, code_id: so.code_id, retrieved_at: at })], in_plan: false, status: "source_only" }));
      subjectInfo.set(so.subject_node_id, { ienIds: [so.ien_id], status: "source_only", inPlan: false, leaf, base });
    }
    for (const t of ["t1", "t2"]) {
      put(node({ ...base, id: `${leaf}/${t}`, parent_id: leaf, kind: "term", order: ++order, title_ar: TERM_TITLES[t].ar, title_en: TERM_TITLES[t].en,
        term: t, term_status: "verified", source_refs: [ref("moe-two-terms", { retrieved_at: sourceDates["moe-two-terms"] })] }));
    }
  }

  // iEN units and lessons: flat ids under the subject (`n<ienId>`), parent as a field.
  const unitNodes = new Map();
  const idCollisions = [];
  for (const [subjectId, info] of [...subjectInfo].sort(byC((x) => x[0]))) {
    const childStatus = info.status === "source_only" ? "source_only" : info.status === "needs_review" ? "needs_review" : "verified";
    const units = [];
    info.ienIds.forEach((ienId, k) => {
      const rows = [...(lessonsBySubject.get(ienId) ?? [])].sort((a, b) => a.order - b.order || a.lesson_ien_id - b.lesson_ien_id);
      const byUnit = new Map();
      for (const r of rows) {
        if (!byUnit.has(r.unit_ien_id)) byUnit.set(r.unit_ien_id, { unit: r.unit_ien_id, title: r.unit_title, first: r.order, k, rows: [] });
        byUnit.get(r.unit_ien_id).rows.push(r);
      }
      units.push(...byUnit.values());
    });
    units.sort((a, b) => a.k - b.k || a.first - b.first || a.unit - b.unit);
    // iEN unit and lesson ids are separate id spaces that overlap (14 same-subject
    // collisions in the 2026-09-26 crawl). Lessons keep n<id> (questions cite
    // them); a colliding unit gets a frozen x<hex8> id from the id registry.
    const lessonIds = new Set(units.flatMap((u) => u.rows.map((r) => r.lesson_ien_id)));
    units.forEach((u, i) => {
      const collides = lessonIds.has(u.unit);
      const uid = collides
        ? registry.resolve({ kind: "x_node", scope: subjectId, nodeKind: "unit", title: `${u.title} (iEN unit ${u.unit})`, taken }).id
        : `${subjectId}/n${u.unit}`;
      if (collides) idCollisions.push({ subject: subjectId, unit: u.unit, id: uid });
      put(node({ ...info.base, id: uid, parent_id: subjectId, kind: "unit", subject: subjectId, order: i + 1, title_ar: u.title, title_en: titleEnOf(u.title),
        source_refs: [ref("ien", { ien_id: u.unit, retrieved_at: at })], in_plan: info.inPlan, status: childStatus }));
      unitNodes.set(u.unit, uid);
      u.rows.forEach((r, j) => {
        const opener = isUnitOpener(r.lesson_title);
        put(node({ ...info.base, id: `${subjectId}/n${r.lesson_ien_id}`, parent_id: uid, kind: "lesson", subject: subjectId, order: j + 1, title_ar: r.lesson_title,
          title_en: sourceTitleEn(r.lesson_title), source_refs: [ref("ien", { ien_id: r.lesson_ien_id, ien_unit_id: u.unit, retrieved_at: at })],
          in_plan: info.inPlan, status: opener && childStatus === "verified" ? "needs_review" : childStatus, unit_opener: opener }));
      });
    });
  }
  return { nodes, subjectInfo, unitNodes, idCollisions };
}

// ── resources (§2.4) ──────────────────────────────────────────────────────
/** Resource kind from the listing title / file name (zip anomalies: audio, workbook, test bank). */
export function bookKind(b) {
  const t = `${b.title ?? ""} ${b.path ?? ""}`;
  if (/test\s*bank|بنك\s*(?:ال)?اختبار/i.test(t)) return "test_resource";
  if (/audio|صوت/i.test(t)) return "audio";
  if (/دليل\s*المعلم|teachers?\s*(?:guide|book)/i.test(t)) return "teacher_guide";
  if (/كتاب\s*النشاط|\bWB\b|work\s*book|activity\s*book/i.test(t)) return "activity_book";
  if (/كتاب\s*الطالب|student\s*book/i.test(t)) return "student_book";
  if (/تمارين|practice/i.test(t)) return "practice_resource";
  return "other";
}

const FILE_TYPE = (ext) => (ext === "pdf" ? "pdf" : ext === "zip" ? "zip" : "other");
const bankUrl = (ienId) => `https://www.ien.edu.sa/?choice=2#/subjectselfassessments/${ienId}`;

function frontmatterPages(fm) {
  if (!fm || fm.error) return [];
  return Object.entries(fm.evidence ?? {})
    .filter(([key, v]) => !key.startsWith("term_") && v && Number(v.page) >= 1 && Number(v.page) <= 3)
    .map(([, v]) => ({ pdf_page: Number(v.page), text: String(v.snippet ?? ""), run_id: fm.run_id ?? null }))
    .sort((a, b) => a.pdf_page - b.pdf_page || compareC(a.text, b.text));
}

function extractionOf(fileType, ext, fm) {
  const empty = { status: "not_started", run_id: null, pages_with_text: null, pages_vision: null, text_quality: null, toc_status: null };
  if (fileType !== "pdf") return { ...empty, status: "not_applicable" };
  if (ext) {
    return {
      status: ext.status,
      run_id: ext.run_id ?? null,
      pages_with_text: ext.pages_with_text ?? null,
      pages_vision: ext.pages_vision ?? null,
      text_quality: ext.text_quality ?? null,
      toc_status: ext.toc_status ?? null,
    };
  }
  if (fm && !fm.error) {
    return { ...empty, status: "frontmatter_done", run_id: fm.run_id ?? null, pages_with_text: (fm.page_chars ?? []).filter((c) => c > 0).length, text_quality: fm.text_quality ?? null };
  }
  return empty;
}

const baseOfLeaf = (leaf) => {
  if (!leaf) return { stage: null, grade: null, track: null };
  const p = leaf.split("/");
  return { stage: p[0], grade: p.slice(0, 2).join("/"), track: p.length > 2 ? leaf : null };
};

function resourceShell(ctx, fields) {
  return {
    schema: "resource@1",
    ...fields,
    term: null,
    term_status: "unknown",
    term_evidence: [],
    license_status: ctx.ienSource.license_status,
    provenance_status: ctx.ienSource.provenance_status,
    redistribution: ctx.ienSource.redistribution,
    retrieved_at: ctx.at,
  };
}

function buildResources(ctx, structure) {
  const { books, recon, frontmatter, extraction, crawlNodes } = ctx;
  const sourceOnlyBy = new Map(recon.sourceOnly.map((s) => [s.ien_id, s.subject_node_id]));
  const subjectOf = (ienId) => recon.ienToSubject.get(ienId) ?? sourceOnlyBy.get(ienId) ?? null;
  const crawlById = new Map(crawlNodes.map((n) => [n.ien_id, n]));
  const resources = [];
  const issuesBy = new Map();

  for (const b of [...books].sort((x, y) => x.ien_book_id - y.ien_book_id)) {
    const id = `ien-${b.ien_book_id}`;
    const subjectNode = subjectOf(b.subject_ien_id);
    const info = subjectNode ? structure.subjectInfo.get(subjectNode) : null;
    const base = info?.base ?? baseOfLeaf(leafOfIenNode(crawlById.get(b.subject_ien_id)));
    const fm = frontmatter.get(b.ien_book_id) ?? null;
    const part = resolvePart(partEvidence({ title: b.title, path: b.path, frontmatter: fm }));
    const year = resolveYear(yearEvidence({ path: b.path, frontmatter: fm }));
    const fileType = FILE_TYPE(b.file_ext);
    const ext = extraction.get(id) ?? null;
    const issues = [...part.issues, ...year.issues];
    if (fileType !== "pdf") issues.push("not_a_pdf");
    else if (!isSafePdfName(b.path)) issues.push("unsafe_file_name");
    if (!b.parsed) issues.push("unparsed_path");
    if (!subjectNode) issues.push("unmapped_subject");
    const ok = Number.isInteger(b.http_status) && b.http_status >= 200 && b.http_status < 300 && b.is_active !== false;
    const pageCount = [ext?.page_count, fm?.error ? null : fm?.page_count].find((x) => Number.isInteger(x) && x > 0) ?? null;
    resources.push({
      ...resourceShell(ctx, {
        id,
        source_id: "ien",
        provider_ref: { ien_book_id: b.ien_book_id, subject_ien_id: b.subject_ien_id, path: clip(b.path, 300), tree_path: b.tree_path ? clip(b.tree_path, 1000) : null },
        subject_node_id: subjectNode,
        stage: base.stage,
        grade: base.grade,
        track: base.track,
        kind: bookKind(b),
        title: clip(b.title, 500),
        part: part.part,
        part_evidence: part.part_evidence,
        year_label: year.year_label,
        year_evidence: year.year_evidence,
        url: b.url,
        file_type: fileType,
        bytes: Number.isInteger(b.bytes) ? b.bytes : null,
        last_modified: b.last_modified ?? null,
        http_status: b.http_status ?? null,
        range_supported: b.accept_ranges == null ? null : /bytes/i.test(b.accept_ranges),
        page_count: pageCount,
        sha256: typeof ext?.sha256 === "string" && /^[0-9a-f]{64}$/.test(ext.sha256) ? ext.sha256 : null,
        external_count: null,
        availability: ok ? "external_official" : "unavailable",
      }),
      extraction: extractionOf(fileType, ext, fm),
      status: !ok ? "unavailable" : issues.length ? "needs_review" : "active",
    });
    issuesBy.set(id, issues);
  }

  // iEN's own question bank: an external resource (count + link), never mined or copied.
  for (const [subjectNode, info] of [...structure.subjectInfo].sort(byC((x) => x[0]))) {
    for (const ienId of info.ienIds) {
      const n = crawlById.get(ienId);
      const count = n?.ien_question_bank_count ?? 0;
      if (!(count > 0)) continue;
      resources.push({
        ...resourceShell(ctx, {
          id: `ien-bank-${ienId}`,
          source_id: "ien",
          provider_ref: { ien_book_id: null, subject_ien_id: ienId, path: null, tree_path: null },
          subject_node_id: subjectNode,
          ...info.base,
          kind: "question_bank_external",
          title: clip(n.title, 500),
          part: null,
          part_evidence: { listing: null, cover: null, file_name: null },
          year_label: null,
          year_evidence: { cover: null, file_name: null },
          url: bankUrl(ienId),
          file_type: "other",
          bytes: null,
          last_modified: null,
          http_status: null,
          range_supported: null,
          page_count: null,
          sha256: null,
          external_count: count,
          availability: "external_official",
        }),
        extraction: { status: "not_applicable", run_id: null, pages_with_text: null, pages_vision: null, text_quality: null, toc_status: null },
        status: "active",
      });
    }
  }
  resources.sort(byC((r) => r.id));
  return { resources, issuesBy };
}

/** Term evidence per book: WP3's page rows are kept; page-0 routes are re-derived here. */
function collectEvidence(ctx, resources, issuesBy) {
  const { existingEvidence, frontmatter, cachePages, planGuide, courseTerms, ownerDecisions, at } = ctx;
  const byResource = new Map();
  const thirdTerm = [];
  const kept = new Map();
  for (const e of existingEvidence) {
    if (DERIVED_P0_METHODS.includes(e.method)) continue; // rebuilt below from the current inputs
    // TOC markers are re-derived from the resource's current TOC (alignTocs); a marker the
    // TOC no longer has must not survive as stale evidence.
    if (e.method === "toc_marker" && ctx.tocs.has(e.resource_id)) continue;
    if (!kept.has(e.resource_id)) kept.set(e.resource_id, []);
    kept.get(e.resource_id).push(e);
  }
  for (const r of resources) {
    if (r.kind === "question_bank_external") continue;
    const fm = frontmatter.get(r.provider_ref.ien_book_id) ?? null;
    const pages = cachePages?.get(r.id) ?? frontmatterPages(fm);
    const fromPages = evidenceFromPages(r.id, pages, { at });
    thirdTerm.push(...fromPages.thirdTerm.map((x) => ({ resource_id: r.id, ...x })));
    const partClean = r.part !== null && !(issuesBy.get(r.id) ?? []).some((i) => i.startsWith("part_"));
    byResource.set(r.id, [
      ...(kept.get(r.id) ?? []),
      ...fromPages.rows,
      ...evidenceFromListing(r.id, r.title, { at }),
      ...evidenceFromPlanGuide(r.id, planGuide.get(r.subject_node_id), { at }),
      ...evidenceFromCourseCode(r.id, r.provider_ref.path, courseTerms, { at }),
      ...(partClean ? evidenceFromOwnerDecisions(r, ownerDecisions) : []),
    ]);
  }
  return { byResource, thirdTerm };
}

// ── TOC cross-check (§2.5, §4.2 step 4) ─────────────────────────────────────
export const TOC_MATCH = 0.6;
export const TOC_REVIEW = 0.4;
const LEVEL_KIND = (level) => {
  if (level === "unit" || level === 1) return "unit";
  if (level === "chapter") return "chapter";
  if (level === "lesson" || (Number.isInteger(level) && level >= 2)) return "lesson";
  return null;
};

/**
 * Align book TOC entries (resources/toc/<id>.json, WP3) with the iEN units
 * and lessons of the resource's subject: trigram Jaccard ≥ 0.6 after
 * normalize + lam_order_fold adds a verified page range, 0.4–0.6 a
 * needs_review range and a `title_mismatch` audit, below 0.4 a TOC-only
 * `x…` node (id registry) with `missing_in_ien`. «الفصل الدراسي …» entries
 * are TOC markers: they become `toc_marker` evidence and assign their term to
 * the units that follow. Both sources are kept.
 */
function alignTocs(ctx, structure, resources, evidence) {
  const { tocs, registry, at, taken } = ctx;
  const nodes = structure.nodes;
  const audit = [];
  const markerOf = new Map(); // node id → { term, evidenceId }
  const insertAfter = new Map(); // x node id → preceding sibling id | null
  const tocResources = new Map(); // subject → [{ resource_id, status }]
  const nodeAudit = (n, code, detail) => {
    if (n.audit.length < 20 && !n.audit.some((a) => a.code === code && a.detail === detail)) n.audit.push({ code, detail: clip(detail, 500) });
  };

  for (const r of resources) {
    const toc = tocs.get(r.id);
    if (!toc || !r.subject_node_id || !nodes.has(r.subject_node_id)) continue;
    const subject = r.subject_node_id;
    if (!tocResources.has(subject)) tocResources.set(subject, []);
    tocResources.get(subject).push({ resource_id: r.id, status: toc.toc_status ?? "partial" });
    const children = [...nodes.values()].filter((n) => n.subject === subject && n.id !== subject);
    const pool = { unit: children.filter((n) => n.kind === "unit" || n.kind === "chapter"), lesson: children.filter((n) => n.kind === "lesson") };
    const offset = Number.isInteger(toc.page_offset) ? toc.page_offset : null;
    const aligned = [];
    let marker = null;
    let lastUnit = null;
    const lastChild = new Map(); // parent → last aligned child id
    for (const e of toc.entries ?? []) {
      const m = strictTermMatches(e.title).find((x) => x.term !== "t3");
      if (m) {
        const page = e.pdf_page ?? toc.toc_pages?.[0] ?? 1;
        const row = {
          schema: "term-evidence@1", id: termEvidenceId(r.id, page, m.term), resource_id: r.id, pdf_page: page, method: "toc_marker", term: m.term,
          excerpt: m.excerpt, reads: null, confidence: e.method === "vision" ? "medium" : "high", run_id: toc.run_id ?? null, extracted_at: at,
        };
        evidence.byResource.get(r.id)?.push(row);
        marker = { term: m.term, evidenceId: row.id };
        continue;
      }
      const kind = LEVEL_KIND(e.level);
      if (!kind) continue;
      const pdf = Number.isInteger(e.pdf_page) ? e.pdf_page : Number.isInteger(e.printed_page) && offset !== null ? e.printed_page + offset : null;
      const candidates = kind === "lesson" ? pool.lesson : pool.unit;
      let best = null;
      const given = e.matched_node_id ? candidates.find((n) => n.id === e.matched_node_id) : null;
      if (given) best = { n: given, score: trigramJaccard(e.title, given.title_ar) };
      else {
        for (const n of candidates) {
          const score = trigramJaccard(e.title, n.title_ar);
          if (!best || score > best.score || (score === best.score && compareC(n.id, best.n.id) < 0)) best = { n, score };
        }
      }
      let target;
      let status = "verified";
      if (best && (given || best.score >= TOC_REVIEW)) {
        target = best.n;
        if (!given && best.score < TOC_MATCH) {
          status = "needs_review";
          nodeAudit(target, "title_mismatch", `TOC «${clip(e.title, 80)}» ≈ ${best.score.toFixed(2)} (${r.id})`);
          if (target.status === "verified") target.status = "needs_review";
        } else if (target.unit_opener && target.status === "needs_review" && best.score >= TOC_MATCH && nodes.get(subject).status === "verified") {
          target.status = "verified"; // a TOC confirms the unit opener (still excluded from pools)
        }
      } else {
        const parent = kind === "lesson" && lastUnit ? lastUnit : subject;
        const { id } = registry.resolve({ kind: "x_node", scope: subject, nodeKind: kind, title: e.title, taken });
        target = nodes.get(id);
        if (!target) {
          const p = nodes.get(subject);
          target = node({ id, parent_id: parent, kind, stage: p.stage, grade: p.grade, track: p.track, subject, order: 0, title_ar: clip(e.title, 80),
            title_en: sourceTitleEn(e.title), source_refs: [ref("ien", { retrieved_at: at })], in_plan: p.in_plan, status: p.status === "source_only" ? "source_only" : "needs_review",
            audit: [{ code: "missing_in_ien", detail: clip(`TOC-only ${kind} in ${r.id}`, 500) }] });
          nodes.set(id, target);
          insertAfter.set(id, { after: lastChild.get(parent) ?? null, seq: insertAfter.size });
        }
        status = "needs_review";
      }
      if (kind !== "lesson") lastUnit = target.id;
      lastChild.set(target.parent_id, target.id);
      if (marker) markerOf.set(target.id, marker);
      aligned.push({ n: target, kind, pdf, status });
    }
    // Page ranges: an entry runs to the next entry's start − 1 (units: to the next unit), the last to the page count.
    const end = r.page_count ?? null;
    aligned.forEach((a, i) => {
      if (a.pdf === null) return;
      const next = aligned.slice(i + 1).find((b) => b.pdf !== null && b.pdf > a.pdf && (a.kind === "lesson" || b.kind !== "lesson"));
      let stop = next ? next.pdf - 1 : end ?? a.pdf;
      if (end !== null) stop = Math.min(stop, end);
      if (stop < a.pdf || (end !== null && a.pdf > end)) {
        nodeAudit(a.n, "order_mismatch", `TOC page ${a.pdf} outside the book or out of order (${r.id})`);
        return;
      }
      if (a.n.pages.length >= 20) return;
      a.n.pages.push({ resource_id: r.id, pdf_start: a.pdf, pdf_end: stop, printed_start: offset !== null && a.pdf - offset >= 0 ? a.pdf - offset : null,
        printed_end: offset !== null && stop - offset >= 0 ? stop - offset : null, method: "toc", status: a.status });
    });
  }

  // A complete TOC for every book of a subject: iEN lessons it does not list go to the audit.
  for (const [subject, list] of tocResources) {
    const books = resources.filter((r) => r.subject_node_id === subject && r.file_type === "pdf" && r.kind === "student_book");
    if (!books.length || !books.every((b) => list.some((t) => t.resource_id === b.id && t.status === "found"))) continue;
    for (const n of nodes.values()) {
      if (n.subject !== subject || n.kind !== "lesson" || n.pages.length || !n.id.includes("/n")) continue;
      nodeAudit(n, "missing_in_toc", "iEN lesson not found in the book TOC");
      if (n.status === "verified") n.status = "needs_review";
    }
  }
  for (const n of nodes.values()) {
    for (const a of n.audit) audit.push({ schema: "curriculum-audit@1", node_id: n.id, subject_node_id: n.subject, resource_id: n.pages[0]?.resource_id ?? null, code: a.code, detail: a.detail, status: "needs_review" });
  }
  return { markerOf, insertAfter, audit };
}

/** Contiguous sibling orders; TOC-only nodes sit right after the sibling they followed in the TOC. */
function renumber(nodes, insertAfter) {
  const kids = new Map();
  for (const n of nodes.values()) {
    if (!n.parent_id) continue;
    if (!kids.has(n.parent_id)) kids.set(n.parent_id, []);
    kids.get(n.parent_id).push(n);
  }
  for (const list of kids.values()) {
    const base = list.filter((n) => !insertAfter.has(n.id)).sort((a, b) => a.order - b.order || compareC(a.id, b.id));
    const extra = list.filter((n) => insertAfter.has(n.id)).sort((a, b) => insertAfter.get(a.id).seq - insertAfter.get(b.id).seq);
    const seq = [...base];
    for (const x of extra) {
      const { after } = insertAfter.get(x.id);
      let at = after ? seq.findIndex((n) => n.id === after) + 1 : 0;
      while (at < seq.length && insertAfter.has(seq[at].id) && insertAfter.get(seq[at].id).after === after) at++;
      seq.splice(at, 0, x);
    }
    seq.forEach((n, i) => (n.order = i + 1));
  }
}

// ── terms: resources → units → lessons → subject membership → catalog ────
const USABLE = (s) => s === "verified" || s === "inferred";

/** One term for several sources: shared term, verified only when all are verified. */
function combine(list) {
  if (!list.length) return null;
  if (!list.every((x) => USABLE(x.term_status) && x.term) || new Set(list.map((x) => x.term)).size !== 1) return null;
  return {
    term: list[0].term,
    term_status: list.every((x) => x.term_status === "verified") ? "verified" : "inferred",
    term_evidence: [...new Set(list.flatMap((x) => x.term_evidence))].sort(compareC),
    basis: list.every((x) => x.basis === "owner_decision") ? "owner_decision" : "evidence",
  };
}

function assignTerms(ctx, structure, resources, evidence, markerOf) {
  const audit = [];
  const finalEvidence = [];
  const basisBy = new Map();
  const third = new Map();
  for (const t of evidence.thirdTerm) third.set(t.resource_id, t);

  for (const r of resources) {
    if (r.kind === "question_bank_external") continue;
    const rows = dedupeById(evidence.byResource.get(r.id) ?? []);
    finalEvidence.push(...rows);
    const res = resolveResourceTerm(rows);
    Object.assign(r, { term: res.term, term_status: res.term_status, term_evidence: res.term_evidence.slice(0, 50) });
    basisBy.set(r.id, res.basis);
    if (res.conflict) audit.push({ code: "term_conflict", resource_id: r.id, subject_node_id: r.subject_node_id, detail: `conflicting term evidence: ${rows.map((x) => `${x.method}:${x.term}`).join(", ")}` });
    if (third.has(r.id)) {
      const t = third.get(r.id);
      Object.assign(r, { term: null, term_status: "needs_review", term_evidence: [] });
      audit.push({ code: "third_term", resource_id: r.id, subject_node_id: r.subject_node_id, detail: `page ${t.pdf_page}: «${t.excerpt}» (possibly an older edition)` });
    }
  }

  const books = new Map();
  for (const r of resources) {
    if (r.file_type !== "pdf" || !r.subject_node_id) continue;
    if (!books.has(r.subject_node_id)) books.set(r.subject_node_id, []);
    books.get(r.subject_node_id).push({ ...r, basis: basisBy.get(r.id) });
  }
  const byId = new Map(resources.map((r) => [r.id, { ...r, basis: basisBy.get(r.id) }]));
  const nodes = structure.nodes;
  const setTerm = (n, t, basis) => {
    n.term = t.term;
    n.term_status = t.term_status;
    n.term_evidence = t.term_evidence.slice(0, 50);
    basisBy.set(n.id, basis ?? null);
  };
  // No page range and no shared book term: missing evidence is needs_review (§1.5).
  const fallback = () => ({ term: null, term_status: "needs_review", term_evidence: [] });

  const ordered = [...nodes.values()].filter((n) => ["unit", "chapter", "lesson"].includes(n.kind)).sort((a, b) => (a.kind === "lesson") - (b.kind === "lesson") || compareC(a.id, b.id));
  for (const n of ordered) {
    const subjectBooks = books.get(n.subject) ?? [];
    const marker = markerOf.get(n.id);
    const fromPages = combine([...new Set(n.pages.map((p) => p.resource_id))].map((id) => byId.get(id)).filter(Boolean));
    if (marker) {
      setTerm(n, { term: marker.term, term_status: "verified", term_evidence: [marker.evidenceId] }, "evidence");
      if (fromPages && fromPages.term_status === "verified" && !termSet(fromPages.term).has(marker.term)) {
        n.audit.push({ code: "term_conflict", detail: `TOC marker ${marker.term} vs book ${fromPages.term}` });
        n.status = n.status === "source_only" ? n.status : "needs_review";
        audit.push({ code: "term_conflict", node_id: n.id, subject_node_id: n.subject, detail: `TOC marker ${marker.term} vs book ${fromPages.term}` });
      }
      continue;
    }
    if (fromPages) {
      setTerm(n, fromPages, fromPages.basis);
      continue;
    }
    if (n.kind === "lesson" && nodes.get(n.parent_id)?.kind !== "subject") {
      const parent = nodes.get(n.parent_id);
      setTerm(n, { term: parent.term, term_status: parent.term_status, term_evidence: parent.term_evidence }, basisBy.get(parent.id));
      continue;
    }
    const all = combine(subjectBooks);
    if (all) setTerm(n, all, all.basis);
    else setTerm(n, fallback(), null);
  }

  // Subject-term membership for every subject node; catalog terms for catalog subjects.
  const subjectTerms = [];
  const catalogTerms = new Map();
  for (const [subjectId, info] of [...structure.subjectInfo].sort(byC((x) => x[0]))) {
    const units = [...nodes.values()].filter((n) => n.subject === subjectId && (n.kind === "unit" || n.kind === "chapter"));
    const rows = subjectTermMembership(subjectId, books.get(subjectId) ?? [], units);
    subjectTerms.push(...rows);
    if (!info.inPlan) continue;
    // The catalog is corrected only through a VERIFIED iEN mapping: evidence from
    // books of a disputed mapping (needs_review) may belong to another subject.
    const ct = catalogTermsFromMembership(rows);
    if (info.status === "verified" || ct.terms_status !== "verified") catalogTerms.set(subjectId, ct);
    else {
      catalogTerms.set(subjectId, { terms: ["t1", "t2"], terms_status: "unverified", terms_evidence: [] });
      audit.push({ code: "catalog_correction_blocked", subject_node_id: subjectId, detail: `verified split ${JSON.stringify(ct.terms)} not applied: the iEN mapping of this subject needs review` });
    }
  }
  return { finalEvidence: dedupeById(finalEvidence), subjectTerms, catalogTerms, basisBy, audit };
}

// ── outline (published slim subset for the app) ────────────────────────────
const slimNode = (n, basis) => ({
  id: n.id,
  parent_id: n.parent_id,
  kind: n.kind,
  order: n.order,
  title_ar: n.title_ar,
  title_en: n.title_en,
  term: n.term,
  term_status: n.term_status,
  term_basis: basis ?? null,
  status: n.status,
  unit_opener: Boolean(n.unit_opener),
  pages: n.pages.map((p) => ({ resource_id: p.resource_id, pdf_start: p.pdf_start, pdf_end: p.pdf_end, printed_start: p.printed_start, printed_end: p.printed_end })),
  source_ref: n.source_refs[0] ? { source_id: n.source_refs[0].source_id, ien_id: n.source_refs[0].ien_id } : null,
});
const slimResource = (r, basis) => ({
  id: r.id,
  subject_node_id: r.subject_node_id,
  kind: r.kind,
  title: r.title,
  part: r.part,
  year_label: r.year_label,
  url: r.url,
  file_type: r.file_type,
  page_count: r.page_count,
  external_count: r.external_count,
  availability: r.availability,
  term: r.term,
  term_status: r.term_status,
  term_basis: basis ?? null,
  status: r.status,
});

function outlineDocs(leaves, nodes, resources, subjectTerms, basisBy, at) {
  const docs = new Map();
  for (const { leaf } of leaves) {
    const parts = leaf.split("/");
    const ancestors = parts.map((_, i) => parts.slice(0, i + 1).join("/"));
    const list = [...nodes.values()].filter((n) => ancestors.includes(n.id) || n.id.startsWith(`${leaf}/`)).sort(byC((n) => n.id));
    const subjects = new Set(list.filter((n) => n.kind === "subject").map((n) => n.id));
    const res = resources.filter((r) => subjects.has(r.subject_node_id));
    docs.set(leafFile(leaf), {
      schema: "outline@1",
      leaf,
      crawl_retrieved_at: at,
      counts: {
        subjects: subjects.size,
        units: list.filter((n) => n.kind === "unit" || n.kind === "chapter").length,
        lessons: list.filter((n) => n.kind === "lesson").length,
        resources: res.length,
      },
      subject_terms: subjectTerms.filter((r) => subjects.has(r.subject_node_id)).map(({ schema: _s, ...rest }) => rest),
      resources: res.map((r) => slimResource(r, basisBy.get(r.id))),
      nodes: list.map((n) => slimNode(n, basisBy.get(n.id))),
    });
  }
  return docs;
}

/** Stable JSON: readable header, one array element per line. */
export function serializeOutline(doc) {
  const arrays = ["subject_terms", "resources", "nodes"];
  const head = Object.fromEntries(Object.entries(doc).filter(([k]) => !arrays.includes(k)));
  const top = JSON.stringify(head, null, 2).replace(/\n}$/, "");
  const block = (k) => `  "${k}": [${doc[k].length ? `\n${doc[k].map((x) => `    ${JSON.stringify(x)}`).join(",\n")}\n  ` : ""}]`;
  return `${top},\n${arrays.map(block).join(",\n")}\n}\n`;
}

// ── catalog correction (§4.2): research JSON + slim catalog-terms table ────
function researchTracks(doc, kind) {
  const out = [];
  for (const stage of doc.stages ?? []) {
    for (const grade of stage.grades ?? []) {
      for (const track of grade.tracks ?? []) {
        const slug = kind === "k9" ? track.catalog_path : [stage.id, grade.id, track.id];
        if (slug) out.push({ leaf: slug.join("/"), track });
      }
    }
  }
  return out;
}

/**
 * Write catalog terms into a research JSON (verified-k9 / verified-secondary)
 * ONLY for verified membership: `terms`, `terms_status: "verified"` and
 * `terms_evidence` (evidence ids). A research entry that was verified but has
 * lost its evidence falls back to both terms, "unverified". Unverified
 * research entries are left untouched: their `terms` are the researcher's
 * hint and are never applied to the catalog (crossCheck, docs/CURRICULUM.md).
 * @returns {{ doc: object, changed: boolean }}
 */
export function applyCatalogTerms(research, catalogTerms, kind) {
  const doc = structuredClone(research);
  let changed = false;
  for (const { leaf, track } of researchTracks(doc, kind)) {
    for (const s of track.subjects ?? []) {
      const ct = catalogTerms.get(`${leaf}/${s.id}`);
      if (!ct) continue;
      if (ct.terms_status === "verified") {
        const same = JSON.stringify(s.terms) === JSON.stringify(ct.terms) && s.terms_status === "verified" && JSON.stringify(s.terms_evidence ?? null) === JSON.stringify(ct.terms_evidence);
        if (same) continue;
        s.terms = [...ct.terms];
        s.terms_status = "verified";
        s.terms_evidence = [...ct.terms_evidence];
        changed = true;
      } else if (s.terms_status === "verified") {
        s.terms = ["t1", "t2"];
        s.terms_status = "unverified";
        delete s.terms_evidence;
        changed = true;
      }
    }
  }
  return { doc, changed };
}

/** JS module text of the catalog term table (importable by the browser, Next and plain Node). */
export function catalogTermsModule(doc) {
  return `// Generated by scripts/content/build-curriculum.mjs from data/staging/curriculum/subject-terms.jsonl.\n// Do not edit by hand. See docs/CURRICULUM.md (term policy).\nexport const CATALOG_TERMS = ${JSON.stringify(doc, null, 2)};\n`;
}

/** Catalog term table (outline/catalog-terms.js): only subjects whose split is verified. */
export function catalogTermsDoc(catalogTerms) {
  const subjects = {};
  for (const [id, ct] of [...catalogTerms].sort(byC((x) => x[0]))) {
    if (ct.terms_status === "verified") subjects[id] = { terms: ct.terms, terms_status: ct.terms_status, terms_evidence: ct.terms_evidence };
  }
  return {
    $comment: "Generated by scripts/content/build-curriculum.mjs from subject-terms.jsonl. Subjects not listed use `default`. A subject leaves a term only on verified evidence. Do not edit by hand.",
    default: { terms: ["t1", "t2"], terms_status: "unverified" },
    subjects,
  };
}

// ── assembly ──────────────────────────────────────────────────────────────
/**
 * Pure build: every output as data. `input`:
 *   catalog (module), nodes, books, lessons, catalogMap, crawlReport, registry
 *   (source records), frontmatter[], extraction[], existingEvidence[],
 *   tocs[], ownerDecisions[], research { k9, secondary }, idRegistry
 *   (IdRegistry), cachePages (Map resource id → pages) | null.
 */
export function buildCurriculum(input) {
  const at = toDateTime(input.crawlReport.retrieved_at);
  const leaves = catalogLeaves(input.catalog);
  const recon = reconcileCatalogMap({ leaves, nodes: input.nodes, books: input.books, lessons: input.lessons, rows: input.catalogMap });
  const sources = new Map((input.registry ?? []).map((s) => [s.id, s]));
  const ien = sources.get("ien");
  if (!ien) throw new Error("sources/registry.json has no `ien` source");
  const sourceDates = Object.fromEntries([...sources].map(([id, s]) => [id, s.retrieval?.retrieved_at ?? null]));
  const planGuide = new Map();
  const courseTerms = {};
  for (const [kind, doc] of Object.entries(input.research ?? {})) {
    for (const { leaf, track } of researchTracks(doc, kind)) {
      for (const s of track.subjects ?? []) if (Array.isArray(s.plan_guide_terms)) planGuide.set(`${leaf}/${s.id}`, s.plan_guide_terms);
    }
    Object.assign(courseTerms, doc.plan_guide_course_terms ?? {});
  }
  const ctx = {
    ...input,
    at,
    leaves,
    recon,
    crawlNodes: input.nodes,
    sourceDates,
    ienSource: { license_status: ien.license_status, provenance_status: ien.provenance_status, redistribution: ien.redistribution },
    frontmatter: new Map((input.frontmatter ?? []).map((r) => [r.ien_book_id, r])),
    extraction: new Map((input.extraction ?? []).map((r) => [r.resource_id, r])),
    tocs: new Map((input.tocs ?? []).map((t) => [t.resource_id, t])),
    existingEvidence: input.existingEvidence ?? [],
    ownerDecisions: input.ownerDecisions ?? [],
    cachePages: input.cachePages ?? null,
    planGuide,
    courseTerms,
    registry: input.idRegistry,
    taken: new Set(),
  };

  const structure = buildStructure(ctx);
  const { resources, issuesBy } = buildResources(ctx, structure);
  const evidence = collectEvidence(ctx, resources, issuesBy);
  const toc = alignTocs(ctx, structure, resources, evidence);
  renumber(structure.nodes, toc.insertAfter);
  const terms = assignTerms(ctx, structure, resources, evidence, toc.markerOf);

  const resourceAudit = [];
  for (const r of resources) {
    for (const code of issuesBy.get(r.id) ?? []) {
      const detail =
        code.startsWith("year_") ? `cover ${r.year_evidence.cover ?? "—"} · file ${r.year_evidence.file_name ?? "—"}`
        : code.startsWith("part_") ? `listing ${r.part_evidence.listing ?? "—"} · cover ${r.part_evidence.cover ?? "—"} · file ${r.part_evidence.file_name ?? "—"}`
        : `${r.provider_ref.path ?? r.id}`;
      resourceAudit.push({ code, resource_id: r.id, subject_node_id: r.subject_node_id, detail });
    }
  }
  const audit = [
    ...recon.audit,
    ...toc.audit,
    ...structure.idCollisions.map((c) => ({ schema: "curriculum-audit@1", node_id: c.id, subject_node_id: c.subject, resource_id: null, code: "id_collision", detail: `iEN unit ${c.unit} shares its id with a lesson of the subject; the unit uses a frozen x id`, status: "info" })),
    ...[...resourceAudit, ...terms.audit].map((a) => ({ schema: "curriculum-audit@1", node_id: a.node_id ?? null, subject_node_id: a.subject_node_id ?? null, resource_id: a.resource_id ?? null, code: a.code, detail: clip(a.detail, 1000), status: "needs_review" })),
  ].sort((a, b) => compareC(a.code, b.code) || compareC(a.subject_node_id ?? "", b.subject_node_id ?? "") || compareC(a.node_id ?? "", b.node_id ?? "") || compareC(a.resource_id ?? "", b.resource_id ?? "") || compareC(String(a.detail), String(b.detail)));
  const unique = audit.filter((a, i) => i === 0 || JSON.stringify(a) !== JSON.stringify(audit[i - 1]));

  recon.unitNodes = structure.unitNodes;
  const nodes = [...structure.nodes.values()].sort(byC((n) => n.id));
  const research = {};
  for (const [kind, doc] of Object.entries(input.research ?? {})) research[kind] = applyCatalogTerms(doc, terms.catalogTerms, kind);
  return {
    at,
    recon,
    nodes,
    resources,
    termEvidence: terms.finalEvidence,
    subjectTerms: terms.subjectTerms,
    catalogTerms: terms.catalogTerms,
    audit: unique,
    mapping: mappingDocument(recon, { retrievedAt: at }),
    outline: outlineDocs(leaves, structure.nodes, resources, terms.subjectTerms, terms.basisBy, at),
    catalogTermsDoc: catalogTermsDoc(terms.catalogTerms),
    research,
  };
}

/** File under nodes/ for a node (stage → its grade-1 file, grade → <stage>/<grade>, else its leaf). */
export function nodeFile(n) {
  if (n.kind === "stage") return `${n.id}/grade-1`;
  if (n.kind === "grade") return n.id;
  return leafFile(n.track ?? n.grade);
}

// ── I/O ───────────────────────────────────────────────────────────────────
const readJsonIf = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback);
const readJsonlIf = (p) => (existsSync(p) ? readJsonl(p) : []);

function listFiles(dir, re) {
  if (!existsSync(dir)) return [];
  const out = [];
  const walk = (d) => {
    for (const f of readdirSync(d).sort()) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (re.test(f)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/** Cached cover/TOC page text (pages 1–3): WP3's extract rows first, else the raw text pages. */
export function readCachePages(books, root = cacheRoot()) {
  const paths = cachePaths(root);
  const out = new Map();
  for (const b of books) {
    if (!isSafePdfName(b.path)) continue;
    const id = `ien-${b.ien_book_id}`;
    let pages = [];
    try {
      const extract = paths.extractPages(id);
      if (existsSync(extract)) {
        pages = readJsonl(extract)
          .filter((r) => r.pdf_page >= 1 && r.pdf_page <= 3 && (r.repaired || r.raw))
          .map((r) => ({ pdf_page: r.pdf_page, text: r.repaired ?? r.raw, run_id: r.run_id ?? null }));
      }
      if (!pages.length) {
        for (let p = 1; p <= 3; p++) {
          const file = paths.textPage(b.path, p);
          if (existsSync(file)) pages.push({ pdf_page: p, text: readFileSync(file, "utf8"), run_id: null });
        }
      }
    } catch {
      pages = [];
    }
    if (pages.length) out.set(id, pages);
  }
  return out;
}

/** Load every input from the repository (and optionally the cache). */
export async function loadInputs({ root = ROOT, cachePages = false } = {}) {
  const S = join(root, "data/staging");
  const catalog = await import(pathToFileURL(join(root, "src/lib/curriculum.js")).href);
  const books = readJsonl(join(S, "sources/ien/books.jsonl"));
  const tocDir = join(S, "resources/toc");
  return {
    catalog,
    nodes: readJsonl(join(S, "sources/ien/nodes.jsonl")),
    books,
    lessons: readJsonl(join(S, "sources/ien/lessons.jsonl")),
    catalogMap: readJsonl(join(S, "sources/research/catalog-map.jsonl")),
    crawlReport: JSON.parse(readFileSync(join(S, "sources/ien/crawl-report.json"), "utf8")),
    registry: JSON.parse(readFileSync(join(S, "sources/registry.json"), "utf8")),
    frontmatter: readJsonlIf(join(S, "sources/ien/book-frontmatter.jsonl")),
    extraction: readJsonlIf(join(S, "resources/extraction.jsonl")),
    existingEvidence: listFiles(join(S, "resources"), /^term-evidence(?:\.p\d{2})?\.jsonl$/).flatMap((p) => readJsonl(p)),
    tocs: listFiles(tocDir, /\.json$/).map((p) => JSON.parse(readFileSync(p, "utf8"))),
    ownerDecisions: readJsonlIf(join(S, "curriculum/owner-decisions.jsonl")),
    research: { k9: readJsonIf(join(root, "src/content/curriculum/verified-k9.json"), {}), secondary: readJsonIf(join(root, "src/content/curriculum/verified-secondary.json"), {}) },
    idRegistry: IdRegistry.load(join(S, "curriculum/id-registry.jsonl")),
    cachePages: cachePages ? readCachePages(books) : null,
  };
}

const jsonlText = (records, schema) => (records.length ? records.map((r) => stringifyRecord(schema, r)).join("\n") + "\n" : "");

/**
 * Write (or, with `dryRun`, only compare) every output. Returns the list of
 * changed/removed paths (relative to `root`).
 */
export function writeOutputs(result, { root = ROOT, dryRun = false, idRegistry = null } = {}) {
  const S = join(root, "data/staging");
  const O = join(root, "src/content/curriculum/outline");
  const changed = [];
  const put = (path, content) => {
    const same = existsSync(path) && readFileSync(path, "utf8") === content;
    if (same) return;
    changed.push(relative(root, path).replace(/\\/g, "/"));
    if (!dryRun) writeFileIfChanged(path, content);
  };
  const shards = (base, records, schema) => {
    const r = writeShards(base, records, { serialize: (x) => stringifyRecord(schema, x), dryRun });
    for (const f of r.files) if (f.changed) changed.push(relative(root, f.path).replace(/\\/g, "/"));
    for (const f of r.removed) changed.push(`removed ${relative(root, f).replace(/\\/g, "/")}`);
    return r.files.map((f) => resolve(f.path));
  };
  const prune = (dir, re, keep) => {
    for (const p of listFiles(dir, re)) {
      if (keep.has(resolve(p))) continue;
      changed.push(`removed ${relative(root, p).replace(/\\/g, "/")}`);
      if (!dryRun) unlinkSync(p);
    }
  };

  // Curriculum nodes, one file per leaf (+ grade/stage files).
  const byFile = new Map();
  for (const n of result.nodes) {
    const f = nodeFile(n);
    if (!byFile.has(f)) byFile.set(f, []);
    byFile.get(f).push(n);
  }
  const keepNodes = new Set();
  for (const [f, list] of [...byFile].sort(byC((x) => x[0]))) for (const p of shards(join(S, "curriculum/nodes", f), list, "curriculum-node")) keepNodes.add(p);
  prune(join(S, "curriculum/nodes"), /\.jsonl$/, keepNodes);

  put(join(S, "curriculum/subject-terms.jsonl"), jsonlText(result.subjectTerms, "subject-term"));
  put(join(S, "curriculum/audit.jsonl"), jsonlText(result.audit, "curriculum-audit"));
  put(join(S, "curriculum/ien-mapping.json"), JSON.stringify(result.mapping, null, 2) + "\n");
  if (idRegistry && (idRegistry.size || existsSync(join(S, "curriculum/id-registry.jsonl")))) {
    put(join(S, "curriculum/id-registry.jsonl"), jsonlText(idRegistry.entries(), "id-registry"));
  }
  shards(join(S, "resources/resources"), result.resources, "resource");
  shards(join(S, "resources/term-evidence"), result.termEvidence, "term-evidence");

  const keepOutline = new Set();
  for (const [f, doc] of [...result.outline].sort(byC((x) => x[0]))) {
    const p = join(O, `${f}.json`);
    keepOutline.add(resolve(p));
    put(p, serializeOutline(doc));
  }
  const termsPath = join(O, "catalog-terms.js");
  keepOutline.add(resolve(termsPath));
  put(termsPath, catalogTermsModule(result.catalogTermsDoc));
  prune(O, /\.(?:json|js)$/, keepOutline);

  for (const [kind, { doc, changed: dirty }] of Object.entries(result.research)) {
    if (dirty) put(join(root, `src/content/curriculum/verified-${kind === "k9" ? "k9" : "secondary"}.json`), JSON.stringify(doc, null, 2) + "\n");
  }
  return changed;
}

function summaryLine(result) {
  const count = (arr, f) => arr.reduce((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {});
  const lessons = result.nodes.filter((n) => n.kind === "lesson");
  return [
    `catalog-map rows ${JSON.stringify(result.recon.summary.rows_by_outcome)}`,
    `catalog subjects ${JSON.stringify(result.recon.summary.catalog_subjects_by_outcome)} · source-only ${result.recon.summary.source_only}`,
    `nodes ${result.nodes.length} (lessons ${lessons.length}, ${JSON.stringify(count(lessons, (n) => n.status))})`,
    `resources ${result.resources.length} · status ${JSON.stringify(count(result.resources, (r) => r.status))} · term ${JSON.stringify(count(result.resources, (r) => r.term_status))}`,
    `subject-terms ${JSON.stringify(count(result.subjectTerms, (r) => r.status))} · term evidence ${result.termEvidence.length} · audit ${result.audit.length}`,
  ].join("\n  ");
}

async function main() {
  const args = process.argv.slice(2);
  const known = new Set(["--check", "--cache-pages", "--help"]);
  const bad = args.filter((a) => !known.has(a));
  if (bad.length || args.includes("--help")) {
    console.error("usage: node scripts/content/build-curriculum.mjs [--check] [--cache-pages]");
    process.exit(bad.length ? 2 : 0);
  }
  const check = args.includes("--check");
  const input = await loadInputs({ cachePages: args.includes("--cache-pages") });
  const result = buildCurriculum(input);
  const changed = writeOutputs(result, { dryRun: check, idRegistry: input.idRegistry });
  console.log(`build-curriculum: ${summaryLine(result)}`);
  if (check) {
    if (changed.length) {
      console.error(`✗ ${changed.length} output(s) stale:\n  ${changed.slice(0, 40).join("\n  ")}\nrun: node scripts/content/build-curriculum.mjs`);
      process.exit(1);
    }
    console.log("✓ curriculum outputs are current");
    return;
  }
  console.log(changed.length ? `✓ wrote ${changed.length} file(s)` : "✓ no changes (outputs already current)");
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch((e) => {
    console.error(e?.stack ?? String(e));
    process.exit(1);
  });
}



