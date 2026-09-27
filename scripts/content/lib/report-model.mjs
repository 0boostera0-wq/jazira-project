// ============================================================================
// Report model (docs/CONTENT_ENGINE.md §8, §5.6, §9.3; WP10). Pure functions
// over the staging files: every number in the reports is computed here, from
// records that exist in files, by the §8 counting rules (COUNTING_RULES).
//
//   loadReportData(stagingDir, { bankDir })   → data (read only; nothing written)
//   buildBlueprints(data)                     → per template × scope blueprints (§5.6)
//   buildReportModel(data, { generatedAt })   → { meta, coverage, quality, validation,
//                                                 duplicates, questionStats, resources,
//                                                 questionBank, examTemplates, verification }
//
// Rules this module enforces:
// - candidates / validated / published / canonical / variants per §8;
//   legacy items are also reported in their own section;
// - pages processed = page-map rows with text or a vision transcript, split by
//   method; a book's page_count is never counted as processed;
// - Term 1 / Term 2 membership only from subject-terms.jsonl (verified or
//   inferred); everything else is "term undeterminable", reported first;
// - exam-template figures come from src/lib/exams/engine/combinatorics.js,
//   per template × scope only: no field sums sets across templates or
//   overlapping scopes, and session figures never enter question totals;
// - the throughput projection is labelled "projection" and needs measured
//   wall time in a run manifest (`throughput` block), else it says so.
// ============================================================================
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { readJsonl } from "./jsonl.mjs";
import { ruleFor } from "./schemas.mjs";
import { isLegacyItem } from "./checks.mjs";
import { loadStaging } from "../check-questions.mjs";
import { languageNeed, resolverNeed } from "../exchange.mjs";
import { compareC } from "../../../src/lib/content/prng.js";
import { publicPayload } from "../../../src/lib/content/answers.js";
import { normalizeForDedup } from "../../../src/lib/content/normalize.js";
import { TEMPLATES, TIERS, offerFor, templateRef } from "../../../src/lib/exams/engine/exam-templates.js";
import { blueprint } from "../../../src/lib/exams/engine/combinatorics.js";
import { checkScopeCaps, createTree, parseScope, resolveScope } from "../../../src/lib/exams/engine/scope.js";

export const REPORT_VERSION = "report@1";
export const FULL_BANK_LABEL = "projection";
export const INSTRUCTION_STEM_MIN = 5; // §4.5 step 5
export const EXCLUSION_CAP = 8; // §4.5 step 7
export const GAP_LIST_MD_MAX = 50;
const TERMS = ["t1", "t2"];
const MEMBER = new Set(["verified", "inferred"]);

export const COUNTING_RULES = Object.freeze([
  "candidates = every question record in questions/** and question-variants/** (any status)",
  "validated = validation.status = validated",
  "published = status = published",
  "canonical = published, not a variant, and dedup.class = UNIQUE or the canonical of a dedup cluster",
  "variants = published records with variant ≠ null (template and rewrite variants; never canonical)",
  "legacy items (the 300) are counted in the totals and also reported in their own section by validation outcome",
  "sources = rows in sources/registry.json",
  "PDFs = resources with file_type = pdf, split by availability and by extraction.status",
  "pages processed = page-map rows with text_method text or vision (split by method); 'front-matter only' is the subset whose resource has extraction.status frontmatter_done; a book's page_count is never counted",
  "Term 1 / Term 2: a subject is listed under a term only when subject-terms.jsonl says verified or inferred; per-term figures count nodes, resources and questions whose term is that term or both",
  "exam-template figures are per template × scope (combinatorics.js); they are never summed across templates or overlapping scopes",
  "sessions are never added to question counts",
]);

// ── small helpers ───────────────────────────────────────────────────────────
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const toPosix = (p) => p.split(sep).join("/");
export const inc = (obj, key, by = 1) => {
  const k = key === null || key === undefined ? "none" : String(key);
  obj[k] = (obj[k] ?? 0) + by;
  return obj;
};
export const sortObject = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => compareC(a[0], b[0])));
const byId = (a, b) => compareC(a.id, b.id);
const round = (x, d = 4) => (x === null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

function walkFiles(dir, root = dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkFiles(p, root));
    else out.push(toPosix(relative(root, p)));
  }
  return out;
}

const readJsonFile = (p) => JSON.parse(readFileSync(p, "utf8").replace(/^﻿/, ""));
const countLines = (p) => (existsSync(p) ? readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).length : null);

/**
 * Manifest status: the sha of manifest.json, and whether its file entries
 * still match the data files (same rule set as validate-staging).
 */
export function manifestStatus(staging) {
  const path = join(staging, "manifest.json");
  if (!existsSync(path)) return { sha256: null, status: "missing", stale_paths: [] };
  const buf = readFileSync(path);
  const manifest = JSON.parse(buf.toString("utf8"));
  const listed = new Map((manifest.files ?? []).map((f) => [f.path, f.sha256]));
  const stale = [];
  const seen = new Set();
  for (const rel of walkFiles(staging)) {
    const rule = ruleFor(rel);
    if (!rule || !["jsonl", "json", "json-array"].includes(rule.format) || rule.id === "manifest") continue;
    seen.add(rel);
    if (listed.get(rel) !== sha256(readFileSync(join(staging, rel)))) stale.push(rel);
  }
  for (const rel of listed.keys()) if (!seen.has(rel)) stale.push(rel);
  return { sha256: sha256(buf), status: stale.length ? "stale" : "current", stale_paths: stale.sort(compareC) };
}

// ── loading ─────────────────────────────────────────────────────────────────
/**
 * Read every staging input the reports use. Nothing is written.
 * @param {string} stagingDir
 * @param {{ bankDir?: string|null }} [o]  runtime bank (for its bank_revision), optional
 */
export function loadReportData(stagingDir, { bankDir = null } = {}) {
  const bank = loadStaging(stagingDir);
  const S = (p) => join(bank.staging, p);
  const optJsonl = (rel) => (existsSync(S(rel)) ? readJsonl(S(rel)) : []);
  const optJson = (rel) => (existsSync(S(rel)) ? readJsonFile(S(rel)) : null);
  // `<stem>.jsonl` and its `.pNN.jsonl` shards (schemas.mjs SHARD). The pattern is
  // a plain string: inside a template literal `\.` and `\d` lose their backslash.
  const shardRe = (stem) => new RegExp("^" + stem + "(?:\\.p\\d{2})?\\.jsonl$");
  const shardFiles = (dir, stem) => walkFiles(S(dir)).filter((f) => shardRe(stem).test(f)).map((f) => join(S(dir), f));

  const questions = [...bank.questions.values()].map((q) => ({ q, shard: bank.where.get(q.id) ?? null })).sort((a, b) => compareC(a.q.id, b.q.id));
  const termEvidence = shardFiles("resources", "term-evidence").flatMap((f) => readJsonl(f));
  const tocs = new Map();
  for (const f of walkFiles(S("resources/toc")).filter((x) => x.endsWith(".json"))) {
    const t = readJsonFile(join(S("resources/toc"), f));
    tocs.set(t.resource_id ?? f.replace(/\.json$/, ""), t);
  }
  const changeFiles = walkFiles(S("sources/ien")).filter((f) => /^changes-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort(compareC);
  const latestChanges = changeFiles.length ? changeFiles[changeFiles.length - 1] : null;
  const runs = walkFiles(S("validation/runs")).filter((f) => f.endsWith(".json")).map((f) => readJsonFile(join(S("validation/runs"), f))).sort((a, b) => compareC(a.run_id, b.run_id));
  let bankRevision = null;
  if (bankDir && existsSync(join(bankDir, "index.json"))) bankRevision = readJsonFile(join(bankDir, "index.json")).bank_revision ?? null;

  return {
    staging: bank.staging,
    bank,
    nodes: bank.nodes,
    resources: [...bank.resources.values()].sort(byId),
    questions,
    registry: [...bank.sources.values()].sort(byId),
    subjectTerms: optJsonl("curriculum/subject-terms.jsonl"),
    ownerDecisions: optJsonl("curriculum/owner-decisions.jsonl"),
    audit: optJsonl("curriculum/audit.jsonl"),
    ienMapping: optJson("curriculum/ien-mapping.json"),
    termEvidence,
    extraction: optJsonl("resources/extraction.jsonl"),
    tocs,
    frontmatter: optJsonl("sources/ien/book-frontmatter.jsonl"),
    crawlReport: optJson("sources/ien/crawl-report.json"),
    ienBookRows: countLines(S("sources/ien/books.jsonl")),
    ienLessonRows: countLines(S("sources/ien/lessons.jsonl")),
    changes: latestChanges ? { file: `sources/ien/${latestChanges}`, rows: readJsonl(join(S("sources/ien"), latestChanges)) } : null,
    clusters: shardFiles("validation", "dedup-clusters").flatMap((f) => readJsonl(f)),
    runs,
    manifest: manifestStatus(bank.staging),
    bankRevision,
  };
}

// ── question classification (§8 counting rules) ─────────────────────────────
export const isVariant = (q) => q.variant !== null && q.variant !== undefined;
export const isPublished = (q) => q.status === "published";
export const isValidated = (q) => q.validation?.status === "validated";
export const canonicalIdsOf = (clusters) => new Set(clusters.map((c) => c.canonical_id));
export const isCanonical = (q, canonicalIds) => isPublished(q) && !isVariant(q) && (q.dedup?.class === "UNIQUE" || canonicalIds.has(q.id));
export const lessonOf = (q) => (q.scope === "curriculum" ? q.curriculum?.lesson ?? null : null);
export const prepNodeOf = (q) => (q.prep?.exam && q.prep?.section && q.prep?.topic ? `prep:${q.prep.exam}/${q.prep.section}/${q.prep.topic}` : null);
export const subjectKeyOf = (q) => (q.scope === "curriculum" ? q.curriculum?.subject ?? null : q.prep?.exam && q.prep?.section ? `prep:${q.prep.exam}/${q.prep.section}` : null);

/** The §8 totals over a list of question records. */
export function questionTotals(qs, canonicalIds) {
  const t = { candidates: 0, validated: 0, published: 0, canonical: 0, variants: 0, rejected: 0, review_required: 0, retired: 0, exact_duplicates: 0, near_duplicates: 0, related: 0 };
  for (const q of qs) {
    t.candidates += 1;
    if (isValidated(q)) t.validated += 1;
    if (isPublished(q)) t.published += 1;
    if (isCanonical(q, canonicalIds)) t.canonical += 1;
    if (isPublished(q) && isVariant(q)) t.variants += 1;
    if (q.status === "rejected") t.rejected += 1;
    if (q.status === "review_required") t.review_required += 1;
    if (q.status === "retired") t.retired += 1;
    if (q.dedup?.class === "EXACT_DUPLICATE") t.exact_duplicates += 1;
    if (q.dedup?.class === "NEAR_DUPLICATE") t.near_duplicates += 1;
    if (q.dedup?.class === "RELATED") t.related += 1;
  }
  return t;
}

// ── exam blueprints (§5.6) ──────────────────────────────────────────────────
/** Selection row of a published question (the columns of select.js). */
function poolRow(q) {
  return {
    key: q.id,
    band: q.difficulty_band,
    component: q.dedup?.exclusion_group ?? null,
    type: q.question_type,
    stimulus: q.stimulus_id ?? null,
    premium: q.is_premium === true,
    revision: q.revision,
    objective: q.objective_id ?? null,
    variant: isVariant(q),
  };
}

/** Content row for display permutations (public payload only). */
function contentRow(q) {
  return {
    key: q.id,
    type: q.question_type,
    public: publicPayload(q.question_type, q.payload),
    shuffle_options: q.shuffle_options !== false,
    fixed_order_reason: q.payload?.fixed_order_reason ?? null,
    topic: q.prep?.topic ?? null,
  };
}

const TERM_SCOPES = ["t1", "t2", "year"];

/**
 * Every template × scope with a non-empty published pool (§5.6). Scopes whose
 * pool is empty are only counted (`empty_scopes`), never listed. `weak:`
 * scopes depend on a learner's history and are not blueprinted.
 * @returns {Promise<{ rows: object[], empty_scopes: Record<string, number>, invalid_scopes: string[] }>}
 */
export async function buildBlueprints(data, { templates = TEMPLATES } = {}) {
  const nodes = [...data.nodes.values()];
  const tree = createTree(nodes, data.subjectTerms);
  const byLesson = new Map();
  const byPrep = new Map();
  const content = new Map();
  const keysOf = new Map(); // pool list → its keys (linear, not quadratic, in a large prep topic)
  const add = (map, k, row) => {
    if (!map.has(k)) {
      map.set(k, []);
      keysOf.set(map.get(k), new Set());
    }
    const list = map.get(k);
    if (keysOf.get(list).has(row.key)) return;
    keysOf.get(list).add(row.key);
    list.push(row);
  };
  for (const { q } of data.questions) {
    if (!isPublished(q)) continue;
    const row = poolRow(q);
    content.set(q.id, contentRow(q));
    const lesson = lessonOf(q);
    if (lesson) add(byLesson, lesson, row);
    const prep = prepNodeOf(q);
    if (prep) add(byPrep, prep, row);
    for (const l of q.links ?? []) {
      if (l.role !== "aligned" || typeof l.node_id !== "string") continue;
      if (l.node_id.startsWith("prep:")) add(byPrep, l.node_id, row);
      else if (data.nodes.get(l.node_id)?.kind === "lesson") add(byLesson, l.node_id, row);
    }
  }

  // candidate scopes: ancestors of lessons with items, their subjects' term scopes, prep levels
  const active = new Set();
  for (const lesson of byLesson.keys()) {
    let id = lesson;
    for (let depth = 0; id && depth < 10; depth++) {
      const n = data.nodes.get(id);
      if (!n) break;
      if (n.kind !== "term") active.add(id);
      id = n.parent_id;
    }
  }
  const scopes = [];
  for (const id of [...active].sort(compareC)) {
    scopes.push(id);
    if (data.nodes.get(id)?.kind === "subject") for (const t of TERM_SCOPES) scopes.push(`${id}@${t}`);
  }
  const prepScopes = new Set();
  for (const topic of byPrep.keys()) {
    const parts = topic.slice(5).split("/");
    for (let i = 1; i <= parts.length; i++) prepScopes.add(`prep:${parts.slice(0, i).join("/")}`);
  }
  scopes.push(...[...prepScopes].sort(compareC));

  const rows = [];
  const empty = {};
  const invalid = [];
  for (const scope of scopes) {
    const parsed = parseScope(scope);
    if (!parsed) {
      invalid.push(scope);
      continue;
    }
    const res = await resolveScope(tree, parsed);
    if (!res.ok) {
      invalid.push(scope);
      continue;
    }
    let pool = [];
    const seen = new Set();
    if (parsed.type === "prep") {
      for (const [topic, list] of [...byPrep].sort((a, b) => compareC(a[0], b[0]))) {
        if (topic !== parsed.node && !topic.startsWith(`${parsed.node}/`)) continue;
        for (const r of list) {
          if (seen.has(r.key)) continue;
          seen.add(r.key);
          pool.push({ ...r, lesson: topic, topic: topic.split("/")[2] ?? null, unit: null, chapter: null, term: null });
        }
      }
    } else {
      for (const l of res.lessons) {
        for (const r of byLesson.get(l.id) ?? []) {
          if (seen.has(r.key)) continue;
          seen.add(r.key);
          pool.push({ ...r, lesson: l.id, unit: l.unit, chapter: l.chapter, term: l.term, topic: null });
        }
      }
    }
    // §5.3: is_premium items leave the pool for guests and free users; the
    // figures are for that pool, and only the premium tier's offer counts them.
    const premiumExcluded = pool.filter((r) => r.premium).length;
    const withPremium = pool;
    pool = pool.filter((r) => !r.premium);
    const stageOf = parsed.type === "prep" ? "prep" : res.node?.stage ?? res.node?.id ?? "none";
    for (const template of templates) {
      if (template.kind === "weakness" || !template.scope_kinds.includes(res.kind)) continue;
      const types = new Set(template.types);
      const eligible = pool.filter((r) => types.has(r.type));
      const eligibleAll = withPremium.filter((r) => types.has(r.type));
      const ref = templateRef(template);
      if (!eligibleAll.length) {
        inc(empty, ref);
        continue;
      }
      const premiumComponents = premiumExcluded ? componentCount(eligibleAll) : null;
      rows.push(blueprintRecord({ template, scope, kind: res.kind, stage: stageOf, subject: parsed.type === "prep" ? `prep:${parsed.exam}${parsed.section ? `/${parsed.section}` : ""}` : res.node?.subject ?? null, eligible, premiumExcluded, premiumComponents, content }));
    }
  }
  rows.sort((a, b) => compareC(a.scope, b.scope) || compareC(a.template, b.template));
  return { rows, empty_scopes: sortObject(empty), invalid_scopes: invalid };
}

/** Exclusion components of pool rows (a row without a component is its own). */
export const componentCount = (rows) => new Set(rows.map((r) => r.component ?? r.key)).size;

/**
 * One exam-blueprint@1 record: the combinatorics.js blueprint plus the tier
 * offers. `eligible` is the non-premium pool (every figure is for it);
 * `premiumComponents` (components including is_premium items, null when there
 * are none) decides only the premium tier's offer.
 */
export function blueprintRecord({ template, scope, kind, stage, subject, eligible, premiumExcluded = 0, premiumComponents = null, content = null }) {
  const bp = blueprint({ template, pool: eligible, contentByKey: content });
  const variants = eligible.filter((r) => r.variant).length;
  const tiers = {};
  for (const tier of TIERS) {
    const caps = checkScopeCaps(kind, tier);
    const offer = offerFor(template, tier, tier === "premium" && premiumComponents !== null ? premiumComponents : bp.components);
    tiers[tier] = caps.ok ? { offered: offer.offered, mini: offer.mini, reason: offer.reason, required: offer.required } : { offered: false, mini: false, reason: caps.error, required: offer.required };
  }
  return {
    schema: "exam-blueprint@1",
    template: bp.template,
    scope,
    scope_kind: kind,
    stage,
    subject,
    pool: { items: bp.pool_items, questions: bp.pool_items - variants, variants, components: bp.components, premium_excluded: premiumExcluded },
    n: bp.n,
    offered: bp.offered,
    reason: bp.offered ? null : bp.reason,
    available: bp.offered ? null : bp.available,
    required: bp.offered ? null : bp.required,
    tiers,
    selected: bp.selected ?? null,
    short: bp.short ?? null,
    lower_bound: bp.offered ? bp.lower_bound : null,
    attempts_before_reuse: bp.offered ? bp.attempts_before_reuse : null,
    allocation: bp.allocation ?? [],
    sets_by_component: bp.sets_by_component ?? null,
    sets_with_variants: bp.sets_with_variants ?? null,
    display_permutations: bp.display_permutations ?? null,
  };
}

// ── coverage (§8 Coverage) ──────────────────────────────────────────────────
const STAGE_ORDER = ["elementary", "middle", "high-school"];
const EXTRACTION_KEYS = ["not_started", "frontmatter_done", "full_done", "failed", "not_applicable"];
const EXERCISE_KEYS = ["example", "exercise", "review", "answer_key"];
const ROUTES = ["cover_text", "title_page_text", "toc_marker", "vision", "listing_title", "plan_guide", "course_code", "owner_decision"];

function emptyFigures() {
  return {
    units: 0,
    chapters: 0,
    lessons: { total: 0, verified: 0, needs_review: 0, other: 0 },
    pdfs: { total: 0, available: 0, unavailable: 0, needs_review: 0, extraction: Object.fromEntries(EXTRACTION_KEYS.map((k) => [k, 0])) },
    pages_processed: { total: 0, text: 0, vision: 0, front_matter_only: 0 },
    questions: { published: 0, variants: 0 },
    exercises: { rows: 0, lessons_with: 0 },
    templates_offered: {},
  };
}

/** Sum figure objects of disjoint node sets (counts only). */
export function addFigures(a, b) {
  const out = Array.isArray(a) ? [] : {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k];
    const y = b[k];
    if (typeof x === "number" || typeof y === "number") out[k] = (x ?? 0) + (y ?? 0);
    else if (x && y) out[k] = addFigures(x, y);
    else out[k] = structuredClone(x ?? y);
  }
  return out;
}

/** Shared indexes for coverage, gaps and quality. */
export function coverageContext(data, blueprints) {
  const nodes = [...data.nodes.values()];
  const bySubject = (kind) => {
    const m = new Map();
    for (const n of nodes) {
      if (n.kind !== kind || !n.subject) continue;
      if (!m.has(n.subject)) m.set(n.subject, []);
      m.get(n.subject).push(n);
    }
    return m;
  };
  const extractionOf = new Map(data.resources.map((r) => [r.id, r.extraction?.status ?? null]));
  for (const e of data.extraction) extractionOf.set(e.resource_id, e.status);
  const resBySubject = new Map();
  for (const r of data.resources) {
    if (!r.subject_node_id) continue;
    if (!resBySubject.has(r.subject_node_id)) resBySubject.set(r.subject_node_id, []);
    resBySubject.get(r.subject_node_id).push(r);
  }
  const exercisesByLesson = new Map();
  for (const rows of data.bank.exercises.values()) {
    for (const e of rows) {
      if (!e.lesson_node_id) continue;
      if (!exercisesByLesson.has(e.lesson_node_id)) exercisesByLesson.set(e.lesson_node_id, []);
      exercisesByLesson.get(e.lesson_node_id).push(e);
    }
  }
  const qBySubject = new Map();
  for (const { q } of data.questions) {
    const s = q.scope === "curriculum" ? q.curriculum?.subject : null;
    if (!s) continue;
    if (!qBySubject.has(s)) qBySubject.set(s, []);
    qBySubject.get(s).push(q);
  }
  const membership = new Map();
  for (const r of data.subjectTerms) {
    if (!membership.has(r.subject_node_id)) membership.set(r.subject_node_id, {});
    membership.get(r.subject_node_id)[r.term] = r.status;
  }
  const offered = new Map(); // subject → rows offered (premium figures)
  for (const b of blueprints.rows) {
    if (!b.offered || !b.subject) continue;
    if (!offered.has(b.subject)) offered.set(b.subject, []);
    offered.get(b.subject).push(b);
  }
  return { nodes, units: bySubject("unit"), chapters: bySubject("chapter"), lessons: bySubject("lesson"), extractionOf, resBySubject, exercisesByLesson, qBySubject, membership, offered };
}

/** Figures of one subject, whole (term = null) or for one term (nodes with term t or both). */
export function subjectFigures(ctx, data, subjectId, term = null) {
  const inTerm = (x) => term === null || x === term || x === "both";
  const f = emptyFigures();
  f.units = (ctx.units.get(subjectId) ?? []).filter((n) => inTerm(n.term)).length;
  f.chapters = (ctx.chapters.get(subjectId) ?? []).filter((n) => inTerm(n.term)).length;
  const lessons = (ctx.lessons.get(subjectId) ?? []).filter((n) => inTerm(n.term));
  const lessonIds = new Set(lessons.map((n) => n.id));
  for (const n of lessons) {
    f.lessons.total += 1;
    if (n.status === "verified") f.lessons.verified += 1;
    else if (n.status === "needs_review") f.lessons.needs_review += 1;
    else f.lessons.other += 1;
  }
  for (const r of (ctx.resBySubject.get(subjectId) ?? []).filter((x) => inTerm(x.term))) {
    if (r.file_type === "pdf") {
      f.pdfs.total += 1;
      if (r.availability === "external_official") f.pdfs.available += 1;
      else if (r.availability === "unavailable") f.pdfs.unavailable += 1;
      else f.pdfs.needs_review += 1;
      const st = ctx.extractionOf.get(r.id);
      if (st) inc(f.pdfs.extraction, st);
    }
    const frontOnly = ctx.extractionOf.get(r.id) === "frontmatter_done";
    for (const row of data.bank.pageMaps.get(r.id)?.values() ?? []) {
      if (row.text_method !== "text" && row.text_method !== "vision") continue;
      f.pages_processed.total += 1;
      f.pages_processed[row.text_method] += 1;
      if (frontOnly) f.pages_processed.front_matter_only += 1;
    }
  }
  for (const q of ctx.qBySubject.get(subjectId) ?? []) {
    if (!isPublished(q) || !inTerm(q.curriculum?.term ?? null)) continue;
    f.questions.published += 1;
    if (isVariant(q)) f.questions.variants += 1;
  }
  for (const id of lessonIds) {
    const ex = ctx.exercisesByLesson.get(id) ?? [];
    f.exercises.rows += ex.length;
    if (ex.length) f.exercises.lessons_with += 1;
  }
  for (const b of ctx.offered.get(subjectId) ?? []) {
    const node = data.nodes.get(b.scope.split("@")[0]);
    const scopeTerm = b.scope.includes("@") ? b.scope.split("@")[1] : null;
    const counts = term === null ? true : scopeTerm ? scopeTerm === term : node && node.kind !== "subject" && inTerm(node.term);
    if (counts) inc(f.templates_offered, b.template);
  }
  f.templates_offered = sortObject(f.templates_offered);
  return f;
}

/** Evidence routes tried for a resource (what the files show was attempted). */
function routesTried(data, r, fmBooks, evidenceByResource) {
  const tried = new Set();
  const pages = [...(data.bank.pageMaps.get(r.id)?.values() ?? [])];
  const bookId = r.provider_ref?.ien_book_id ?? null;
  if ((bookId !== null && fmBooks.has(bookId)) || pages.some((p) => p.pdf_page <= 3 && p.text_method === "text")) tried.add("cover_text");
  if (data.tocs.has(r.id)) tried.add("toc_marker");
  if (pages.some((p) => p.text_method === "vision" && (p.pdf_page <= 3 || p.kind === "toc"))) tried.add("vision");
  if (r.title) tried.add("listing_title");
  if (data.ownerDecisions.some((d) => (d.subject_node_ids ?? []).includes(r.subject_node_id))) tried.add("owner_decision");
  for (const e of evidenceByResource.get(r.id) ?? []) tried.add(e.method); // routes that record hits only (plan_guide, course_code …)
  return tried;
}

/** Leaves (grades without tracks, and tracks) in stage → grade → track order. */
function leavesOf(data, subjects) {
  const ids = new Set(subjects.map((s) => s.parent_id).filter(Boolean));
  const key = (n) => {
    const stage = STAGE_ORDER.indexOf(n.stage);
    const grade = data.nodes.get(n.grade)?.order ?? 0;
    const track = n.kind === "track" ? n.order : -1;
    return [stage < 0 ? 99 : stage, grade, track];
  };
  return [...ids].map((id) => data.nodes.get(id)).filter(Boolean).sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2] || compareC(a.id, b.id);
  });
}

export function buildCoverage(data, blueprints, ctx = coverageContext(data, blueprints)) {
  const subjects = ctx.nodes.filter((n) => n.kind === "subject").sort((a, b) => a.order - b.order || compareC(a.id, b.id));
  const listed = subjects.filter((s) => s.status !== "source_only");
  const memberIn = (s, t) => MEMBER.has(ctx.membership.get(s.id)?.[t]);

  // the "term undeterminable" bucket comes first
  const undeterminable = listed.filter((s) => !TERMS.some((t) => memberIn(s, t))).map((s) => s.id);
  const partial = listed.filter((s) => TERMS.some((t) => memberIn(s, t)) && TERMS.some((t) => !memberIn(s, t) && ctx.membership.get(s.id)?.[t] !== "absent")).map((s) => s.id);
  // a front-matter row with `error` (e.g. "fetch failed") records a failed read: not coverage, not a tried route
  const fmBooks = new Set(data.frontmatter.filter((f) => !f.error).map((f) => f.ien_book_id));
  const fmFailed = new Set(data.frontmatter.filter((f) => f.error && !fmBooks.has(f.ien_book_id)).map((f) => f.ien_book_id));
  const evidenceByResource = new Map();
  for (const e of data.termEvidence) {
    if (!evidenceByResource.has(e.resource_id)) evidenceByResource.set(e.resource_id, []);
    evidenceByResource.get(e.resource_id).push(e);
  }
  const needsReview = data.resources.filter((r) => r.term_status === "needs_review");
  const tried = Object.fromEntries(ROUTES.map((k) => [k, 0]));
  const found = Object.fromEntries(ROUTES.map((k) => [k, 0]));
  for (const r of needsReview) {
    for (const route of routesTried(data, r, fmBooks, evidenceByResource)) inc(tried, route);
    for (const e of evidenceByResource.get(r.id) ?? []) inc(found, e.method);
  }

  const leaves = [];
  let totals = emptyFigures();
  for (const leaf of leavesOf(data, listed)) {
    const rows = listed.filter((s) => s.parent_id === leaf.id);
    const subjectsOut = [];
    const terms = { t1: [], t2: [], undeterminable: [] };
    let leafTotals = emptyFigures();
    for (const s of rows) {
      const figures = subjectFigures(ctx, data, s.id);
      leafTotals = addFigures(leafTotals, figures);
      const m = ctx.membership.get(s.id) ?? {};
      subjectsOut.push({ id: s.id, title_ar: s.title_ar, title_en: s.title_en ?? null, status: s.status, in_plan: s.in_plan === true, membership: { t1: m.t1 ?? null, t2: m.t2 ?? null }, figures });
      let any = false;
      for (const t of TERMS) {
        if (!memberIn(s, t)) continue;
        any = true;
        terms[t].push({ id: s.id, membership: m[t], figures: subjectFigures(ctx, data, s.id, t) });
      }
      if (!any) terms.undeterminable.push(s.id);
    }
    totals = addFigures(totals, leafTotals);
    leaves.push({ id: leaf.id, kind: leaf.kind, stage: leaf.stage, grade: leaf.grade, track: leaf.track ?? null, title_ar: leaf.title_ar, title_en: leaf.title_en ?? null, totals: leafTotals, terms, subjects: subjectsOut });
  }

  const exercisesByLesson = {};
  for (const [lesson, rows] of [...ctx.exercisesByLesson].sort((a, b) => compareC(a[0], b[0]))) {
    const o = Object.fromEntries(EXERCISE_KEYS.map((k) => [k, 0]));
    for (const e of rows) inc(o, e.kind);
    exercisesByLesson[lesson] = o;
  }
  const changes = data.changes
    ? { file: data.changes.file, rows: data.changes.rows.length, by: sortObject(data.changes.rows.reduce((o, r) => inc(o, `${r.entity}:${r.change}`), {})) }
    : null;
  return {
    term_undeterminable: {
      subjects: { count: undeterminable.length, ids: undeterminable },
      subjects_partial: { count: partial.length, ids: partial },
      resources: { count: needsReview.length, ids: needsReview.map((r) => r.id), routes_tried: tried, evidence_found: found },
    },
    frontmatter: { done: fmBooks.size, failed: fmFailed.size, total:data.crawlReport?.counts?.books ?? data.ienBookRows ?? null },
    totals,
    unmapped_resources: data.resources.filter((r) => !r.subject_node_id).map((r) => r.id),
    leaves,
    gaps: coverageGaps(data, ctx, listed),
    exercises_by_lesson: exercisesByLesson,
    changes,
  };
}

/** Published, non-premium exclusion components per lesson (primary or aligned link). */
export function lessonComponents(data) {
  const groups = new Map();
  for (const { q } of data.questions) {
    if (!isPublished(q) || q.is_premium === true) continue;
    const lessons = new Set([lessonOf(q), ...(q.links ?? []).filter((l) => l.role === "aligned").map((l) => l.node_id)].filter(Boolean));
    for (const l of lessons) {
      if (!groups.has(l)) groups.set(l, new Set());
      groups.get(l).add(q.dedup?.exclusion_group ?? q.id);
    }
  }
  return new Map([...groups].map(([l, s]) => [l, s.size]));
}

function coverageGaps(data, ctx, listedSubjects) {
  const lessonQuiz = TEMPLATES.find((t) => t.id === "lesson-quiz");
  const required = offerFor(lessonQuiz, "premium", 0).required;
  const components = lessonComponents(data);
  const lessons = ctx.nodes.filter((n) => n.kind === "lesson" && n.status !== "source_only" && n.status !== "unavailable").sort(byId);
  const poolLessons = lessons.filter((n) => n.status === "verified" && n.unit_opener !== true);
  const awaiting = [];
  for (const [resourceId, pages] of [...data.bank.pageMaps].sort((a, b) => compareC(a[0], b[0]))) {
    for (const p of [...pages.values()].sort((a, b) => a.pdf_page - b.pdf_page)) {
      if (p.text_quality === "untrusted" && p.text_method !== "vision") awaiting.push({ resource_id: resourceId, pdf_page: p.pdf_page });
    }
  }
  const sourceOnly = ctx.nodes.filter((n) => n.kind === "subject" && n.status === "source_only").map((n) => n.id).sort(compareC);
  return {
    subjects_without_books: listedSubjects.filter((s) => !(ctx.resBySubject.get(s.id) ?? []).some((r) => r.file_type === "pdf")).map((s) => s.id).sort(compareC),
    lessons_without_pages: lessons.filter((n) => !(n.pages ?? []).length).map((n) => n.id),
    lessons_without_exercises: lessons.filter((n) => !(ctx.exercisesByLesson.get(n.id) ?? []).length).map((n) => n.id),
    lessons_below_lesson_quiz_min: {
      template: templateRef(lessonQuiz),
      required,
      lessons: poolLessons.filter((n) => (components.get(n.id) ?? 0) < required).map((n) => ({ id: n.id, components: components.get(n.id) ?? 0 })),
    },
    pages_awaiting_vision: awaiting,
    source_only_subjects: sourceOnly,
  };
}

// ── data-quality dashboard (§8 quality.html) ────────────────────────────────
const QUALITY_COLUMNS = ["lessons", "candidates", "validated", "rejected", "review_required", "published", "canonical", "variants"];

export function buildQuality(data, blueprints, canonicalIds) {
  const lessons = [...data.nodes.values()].filter((n) => n.kind === "lesson" && n.status !== "source_only");
  const qs = data.questions.map((x) => x.q);
  const pdfs = data.resources.filter((r) => r.file_type === "pdf");
  const extractionOf = new Map(data.resources.map((r) => [r.id, r.extraction?.status ?? null]));
  for (const e of data.extraction) extractionOf.set(e.resource_id, e.status);
  const pages = { total: 0, text: 0, vision: 0, front_matter_only: 0 };
  for (const [rid, rows] of data.bank.pageMaps) {
    for (const p of rows.values()) {
      if (p.text_method !== "text" && p.text_method !== "vision") continue;
      pages.total += 1;
      pages[p.text_method] += 1;
      if (extractionOf.get(rid) === "frontmatter_done") pages.front_matter_only += 1;
    }
  }
  const qt = questionTotals(qs, canonicalIds);
  const totals = {
    sources: data.registry.length,
    pdfs: {
      total: pdfs.length,
      by_availability: sortObject(pdfs.reduce((o, r) => inc(o, r.availability), {})),
      by_extraction: sortObject(pdfs.reduce((o, r) => inc(o, extractionOf.get(r.id)), {})),
    },
    pages_processed: pages,
    lessons: { total: lessons.length, verified: lessons.filter((n) => n.status === "verified").length, needs_review: lessons.filter((n) => n.status === "needs_review").length },
    candidates: qt.candidates,
    validated: qt.validated,
    rejected: qt.rejected,
    exact_duplicates: qt.exact_duplicates,
    near_duplicates: qt.near_duplicates,
    review_required: qt.review_required,
    canonical: qt.canonical,
    published: qt.published,
    variants: qt.variants,
    exam_templates: { defined: TEMPLATES.length, template_scope_pairs_offered: blueprints.rows.filter((b) => b.offered).length },
  };

  const title = (id) => {
    const n = data.nodes.get(id);
    return { title_ar: n?.title_ar ?? null, title_en: n?.title_en ?? null };
  };
  const unitOf = (n) => {
    const p = n.parent_id ? data.nodes.get(n.parent_id) : null;
    return p && (p.kind === "unit" || p.kind === "chapter") ? p.id : "none";
  };
  const dims = {
    stage: { node: (n) => n.stage, q: (q) => (q.scope === "curriculum" ? q.curriculum?.stage : "prep") },
    grade: { node: (n) => n.track ?? n.grade, q: (q) => (q.scope === "curriculum" ? q.curriculum?.track ?? q.curriculum?.grade : q.prep ? `prep:${q.prep.exam}` : null) },
    term: { node: (n) => n.term ?? "none", q: (q) => (q.scope === "curriculum" ? q.curriculum?.term ?? "none" : "prep") },
    subject: { node: (n) => n.subject, q: (q) => subjectKeyOf(q) },
    chapter: { node: unitOf, q: (q) => (q.scope === "curriculum" ? q.curriculum?.chapter ?? q.curriculum?.unit ?? "none" : prepNodeOf(q)) },
  };
  const breakdowns = {};
  for (const [dim, fn] of Object.entries(dims)) {
    const rows = new Map();
    const row = (k) => {
      const key = k ?? "none";
      if (!rows.has(key)) rows.set(key, { key, ...(dim === "term" ? { title_ar: null, title_en: null } : title(key)), ...Object.fromEntries(QUALITY_COLUMNS.map((c) => [c, 0])) });
      return rows.get(key);
    };
    for (const n of lessons) row(fn.node(n)).lessons += 1;
    const grouped = new Map();
    for (const q of qs) {
      const k = fn.q(q) ?? "none";
      if (!grouped.has(k)) grouped.set(k, []);
      grouped.get(k).push(q);
    }
    for (const [k, list] of grouped) {
      const t = questionTotals(list, canonicalIds);
      const r = row(k);
      for (const c of QUALITY_COLUMNS) if (c !== "lessons") r[c] = t[c];
    }
    breakdowns[dim] = [...rows.values()].sort((a, b) => compareC(a.key, b.key));
  }
  return { totals, columns: QUALITY_COLUMNS, breakdowns };
}

// ── validation (§8 validation.md) ───────────────────────────────────────────
const TOP_CODES = 10;
const DAY_MS = 86400000;

const topCounts = (obj, n = TOP_CODES) => Object.entries(obj).sort((a, b) => b[1] - a[1] || compareC(a[0], b[0])).slice(0, n).map(([code, count]) => ({ code, count }));

function summarizeRecords(recs) {
  const byRoleAgent = new Map();
  const verdicts = {};
  const fails = {};
  const warns = {};
  const disagreements = {};
  for (const r of recs) {
    const k = `${r.role}|${r.agent}`;
    if (!byRoleAgent.has(k)) byRoleAgent.set(k, { role: r.role, agent: r.agent, items: new Set(), records: 0 });
    const e = byRoleAgent.get(k);
    e.items.add(r.question_id);
    e.records += 1;
    if (!verdicts[r.role]) verdicts[r.role] = {};
    inc(verdicts[r.role], r.verdict);
    if (r.verdict === "disagree") inc(disagreements, r.role);
    for (const c of r.checks ?? []) {
      if (c.result === "fail") inc(fails, c.code);
      else if (c.result === "warn") inc(warns, c.code);
    }
  }
  return {
    records: recs.length,
    by_role_agent: [...byRoleAgent.values()].map((e) => ({ role: e.role, agent: e.agent, items: e.items.size, records: e.records })).sort((a, b) => compareC(`${a.role}|${a.agent}`, `${b.role}|${b.agent}`)),
    verdicts: sortObject(Object.fromEntries(Object.entries(verdicts).map(([k, v]) => [k, sortObject(v)]))),
    top_fail_codes: topCounts(fails),
    top_warn_codes: topCounts(warns),
    disagreements: sortObject(disagreements),
  };
}

export function buildValidation(data, { generatedAt }) {
  const records = [...data.bank.records.values()].sort(byId);
  const manifests = new Map(data.runs.map((m) => [m.run_id, m]));
  const byRun = new Map();
  for (const r of records) {
    if (!byRun.has(r.run_id)) byRun.set(r.run_id, []);
    byRun.get(r.run_id).push(r);
  }
  const runs = [...byRun].sort((a, b) => compareC(a[0], b[0])).map(([runId, recs]) => ({ run_id: runId, kind: manifests.get(runId)?.kind ?? runId.split("-")[2] ?? null, ...summarizeRecords(recs) }));

  // sample sizes versus the sampling policy (§4.4), per cross-AI run manifest
  const detOf = new Map();
  for (const r of records) {
    if (r.role !== "deterministic") continue;
    const prev = detOf.get(r.question_id);
    if (!prev || compareC(`${r.revision}|${r.checked_at}`, `${prev.revision}|${prev.checked_at}`) > 0) detOf.set(r.question_id, r);
  }
  const live = data.questions.map((x) => x.q).filter((q) => q.status !== "rejected" && q.status !== "retired");
  const sampling = [];
  for (const m of data.runs.filter((x) => x.sampling)) {
    const count = (need) => live.reduce((o, q) => {
      const det = detOf.get(q.id);
      const v = need(q, m, det && det.revision === q.revision ? det : null);
      if (v) inc(o, v);
      return o;
    }, { required: 0, sampled: 0 });
    const present = (role) => new Set(records.filter((r) => r.run_id === m.run_id && r.role === role).map((r) => r.question_id)).size;
    sampling.push({
      run_id: m.run_id,
      pilot: m.sampling.pilot === true,
      seed: m.sampling.seed ?? null,
      rates: m.sampling.rates ?? null,
      chatgpt: { policy: count(resolverNeed), present: present("resolver") },
      gemini: { policy: count(languageNeed), present: present("language") },
    });
  }

  const unavailable = new Map();
  for (const m of data.runs) {
    for (const [agent, v] of Object.entries(m.agents ?? {})) {
      if (v !== "unavailable") continue;
      if (!unavailable.has(agent)) unavailable.set(agent, []);
      unavailable.get(agent).push(m.run_id);
    }
  }

  const queue = data.bank.reviewQueue;
  const now = Date.parse(generatedAt);
  const ages = queue.map((e) => Date.parse(e.queued_at)).filter(Number.isFinite).map((t) => Math.max(0, (now - t) / DAY_MS)).sort((a, b) => a - b);
  const queuedAt = queue.map((e) => e.queued_at).filter(Boolean).sort(compareC);
  const legacy = data.questions.map((x) => x.q).filter((q) => isLegacyItem(q));
  return {
    runs,
    cumulative: summarizeRecords(records),
    sampling,
    agents_unavailable: [...unavailable].sort((a, b) => compareC(a[0], b[0])).map(([agent, list]) => ({ agent, runs: list })),
    review_queue: {
      size: queue.length,
      by_reason: sortObject(queue.reduce((o, e) => inc(o, e.reason), {})),
      oldest_queued_at: queuedAt[0] ?? null,
      newest_queued_at: queuedAt[queuedAt.length - 1] ?? null,
      max_age_days: ages.length ? round(ages[ages.length - 1], 1) : null,
      median_age_days: ages.length ? round(ages.length % 2 ? ages[(ages.length - 1) / 2] : (ages[ages.length / 2 - 1] + ages[ages.length / 2]) / 2, 1) : null,
      decisions: sortObject(data.bank.reviewDecisions.reduce((o, d) => inc(o, d.decision), {})),
    },
    legacy: {
      items: legacy.length,
      by_validation_status: sortObject(legacy.reduce((o, q) => inc(o, q.validation?.status), {})),
      by_status: sortObject(legacy.reduce((o, q) => inc(o, q.status), {})),
    },
  };
}

// ── duplicates (§8 duplicates.md) ───────────────────────────────────────────
const LARGEST = 10;
const STEM_SHOW = 80;

export function buildDuplicates(data) {
  const qs = data.questions.map((x) => x.q);
  const byIdMap = new Map(qs.map((q) => [q.id, q]));
  const clusters = [...data.clusters].sort(byId);
  const membersByClass = {};
  for (const c of clusters) for (const m of c.members ?? []) inc(membersByClass, m.class);
  const itemsByClass = sortObject(qs.reduce((o, q) => inc(o, q.dedup?.class ?? "unclassified"), {}));

  const largest = clusters
    .map((c) => ({ id: c.id, canonical_id: c.canonical_id, members: (c.members ?? []).length, classes: sortObject((c.members ?? []).reduce((o, m) => inc(o, m.class), {})), exclusion_group: c.exclusion_group ?? null }))
    .sort((a, b) => b.members - a.members || compareC(a.id, b.id))
    .slice(0, LARGEST);

  const crossLesson = [];
  const numericFamilies = [];
  for (const c of clusters) {
    const canonLesson = lessonOf(byIdMap.get(c.canonical_id) ?? {}) ?? prepNodeOf(byIdMap.get(c.canonical_id) ?? {});
    const numeric = [];
    for (const m of c.members ?? []) {
      const q = byIdMap.get(m.id);
      const memberLesson = q ? lessonOf(q) ?? prepNodeOf(q) : null;
      if (q && canonLesson && memberLesson && memberLesson !== canonLesson) crossLesson.push({ cluster: c.id, member: m.id, class: m.class, canonical_lesson: canonLesson, member_lesson: memberLesson });
      if ((m.signals ?? []).includes("numeric_variant")) numeric.push(m.id);
    }
    if (numeric.length) numericFamilies.push({ cluster: c.id, canonical_id: c.canonical_id, members: numeric.length, ids: numeric.sort(compareC) });
  }

  // instruction-stem families (§4.5 step 5): a normalized stem in ≥ 5 items
  const stems = new Map();
  for (const q of qs) {
    const norm = normalizeForDedup(q.stem ?? "");
    if (!norm) continue;
    if (!stems.has(norm)) stems.set(norm, { stem: String(q.stem).slice(0, STEM_SHOW), items: 0 });
    stems.get(norm).items += 1;
  }
  const instructionFamilies = [...stems.values()].filter((s) => s.items >= INSTRUCTION_STEM_MIN).sort((a, b) => b.items - a.items || compareC(a.stem, b.stem));

  const templateFamilies = new Map();
  for (const q of qs) {
    if (q.variant?.kind !== "template") continue;
    const id = q.variant.template_id;
    if (!templateFamilies.has(id)) templateFamilies.set(id, { template_id: id, variants: 0, published: 0 });
    const e = templateFamilies.get(id);
    e.variants += 1;
    if (isPublished(q)) e.published += 1;
  }
  const rewriteFamilies = new Map();
  for (const q of qs) {
    if (q.variant?.kind !== "rewrite") continue;
    if (!rewriteFamilies.has(q.variant.of)) rewriteFamilies.set(q.variant.of, { parent_id: q.variant.of, rewrites: 0, published: 0 });
    const e = rewriteFamilies.get(q.variant.of);
    e.rewrites += 1;
    if (isPublished(q)) e.published += 1;
  }

  // exclusion components (§4.5 step 7): sizes, and any above the cap K
  const groups = new Map();
  for (const q of qs) {
    const g = q.dedup?.exclusion_group;
    if (!g) continue;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(q);
  }
  const histogram = {};
  const overCap = [];
  for (const [g, members] of [...groups].sort((a, b) => compareC(a[0], b[0]))) {
    inc(histogram, members.length);
    const templates = new Set(members.map((q) => (q.variant?.kind === "template" ? q.variant.template_id : null)));
    const templateOnly = templates.size === 1 && !templates.has(null);
    if (members.length > EXCLUSION_CAP && !templateOnly) overCap.push({ exclusion_group: g, size: members.length });
  }
  return {
    clusters: clusters.length,
    members_by_class: sortObject(membersByClass),
    items_by_class: itemsByClass,
    largest,
    cross_lesson: crossLesson.sort((a, b) => compareC(a.cluster, b.cluster) || compareC(a.member, b.member)),
    instruction_stem_families: instructionFamilies,
    numeric_variant_families: numericFamilies,
    template_variant_families: [...templateFamilies.values()].sort((a, b) => compareC(a.template_id, b.template_id)),
    rewrite_families: [...rewriteFamilies.values()].sort((a, b) => compareC(a.parent_id, b.parent_id)),
    exclusion_components: { count: groups.size, cap: EXCLUSION_CAP, size_histogram: Object.fromEntries(Object.entries(histogram).sort((a, b) => Number(a[0]) - Number(b[0]))), over_cap: overCap },
  };
}

// ── generated-question statistics (§8 question-stats.json, §9.3) ────────────
const sumValues = (o) => (o && typeof o === "object" ? Object.values(o).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0) : Number.isFinite(o) ? o : null);
const per100 = (x, items) => (x === null || x === undefined || !items ? null : round((x / items) * 100, 2));

/** Throughput of one run manifest (the `throughput` block, §9.3), or null when nothing was measured. */
export function runThroughput(m) {
  const tp = m.throughput ?? null;
  const wall = tp?.wall_seconds ?? m.wall_seconds ?? null;
  if (!tp && wall === null) return null;
  const items = tp?.items_generated ?? m.counts?.generated ?? m.counts?.ingest?.lines ?? null;
  const accepted = tp?.items_accepted ?? m.counts?.accepted ?? m.counts?.ingest?.accepted ?? null;
  const calls = tp?.subagent_calls ?? null;
  const callsTotal = sumValues(calls);
  return {
    run_id: m.run_id,
    kind: m.kind ?? null,
    items,
    accepted,
    lessons: tp?.lessons ?? m.scope?.lessons ?? null,
    wall_seconds: wall,
    items_per_hour: items && wall ? round(items / (wall / 3600), 2) : null,
    subagent_calls: calls ? sortObject(calls) : null,
    subagent_calls_per_100: per100(callsTotal, items),
    xai_batches: tp?.xai_batches ?? null,
    xai_batches_per_100: per100(tp?.xai_batches ?? null, items),
    human_review_minutes: tp?.human_review_minutes ?? null,
    human_review_minutes_per_100: per100(tp?.human_review_minutes ?? null, items),
  };
}

export function buildQuestionStats(data) {
  const qs = data.questions.map((x) => x.q);
  const dims = {
    origin: (q) => q.provenance?.origin,
    type: (q) => q.question_type,
    style: (q) => q.item_style,
    difficulty: (q) => q.difficulty,
    band: (q) => q.difficulty_band,
    language: (q) => q.language,
    subject: (q) => subjectKeyOf(q),
  };
  const by = {};
  for (const [dim, fn] of Object.entries(dims)) {
    const o = {};
    for (const q of qs) {
      const k = String(fn(q) ?? "none");
      if (!o[k]) o[k] = { candidates: 0, published: 0 };
      o[k].candidates += 1;
      if (isPublished(q)) o[k].published += 1;
    }
    by[dim] = sortObject(o);
  }

  const ingested = qs.reduce((o, q) => (q.provenance?.generator?.run_id ? inc(o, q.provenance.generator.run_id) : o), {});
  const genRuns = new Map();
  for (const m of data.runs.filter((x) => x.kind === "gen")) {
    const generated = m.throughput?.items_generated ?? m.counts?.generated ?? m.counts?.ingest?.lines ?? null;
    const accepted = m.throughput?.items_accepted ?? m.counts?.accepted ?? m.counts?.ingest?.accepted ?? null;
    genRuns.set(m.run_id, { run_id: m.run_id, source: "manifest", generated, accepted, yield: generated && Number.isFinite(accepted) ? round(accepted / generated) : null, records_in_staging: ingested[m.run_id] ?? 0 });
  }
  for (const [runId, n] of Object.entries(ingested)) {
    if (genRuns.has(runId) || !/-gen-/.test(runId)) continue;
    genRuns.set(runId, { run_id: runId, source: "records", generated: null, accepted: null, yield: null, records_in_staging: n });
  }

  const revised = qs.filter((q) => (q.revision ?? 1) > 1).length;
  const withExpl = qs.filter((q) => (q.explanation?.text ?? "").length > 0);
  const positions = {};
  const mcq = qs.filter((q) => isPublished(q) && q.question_type === "mcq");
  for (const q of mcq) {
    const idx = (q.payload?.options ?? []).findIndex((o) => o.id === q.payload?.answer?.option_id);
    inc(positions, idx < 0 ? "none" : idx + 1);
  }

  const throughput = data.runs.map(runThroughput).filter(Boolean);
  return {
    by,
    generator_runs: [...genRuns.values()].sort((a, b) => compareC(a.run_id, b.run_id)),
    repair: { revised_items: revised, candidates: qs.length, rate: qs.length ? round(revised / qs.length) : null, repair_decisions: data.bank.reviewDecisions.filter((d) => d.decision === "repair").length },
    explanation: { items_with: withExpl.length, avg_chars: withExpl.length ? round(withExpl.reduce((s, q) => s + q.explanation.text.length, 0) / withExpl.length, 1) : null },
    mcq_answer_position: { published_mcq: mcq.length, positions: sortObject(positions) },
    throughput,
    projection: projectFullBank(data, throughput),
  };
}

/** The full-bank effort, projected from measured runs only (§9.3). Always labelled "projection". */
export function projectFullBank(data, throughput) {
  const lessonsTotal = data.crawlReport?.counts?.lessons ?? data.ienLessonRows ?? null;
  const gen = throughput.filter((t) => t.kind === "gen");
  const sum = (list, k) => list.reduce((s, t) => s + (Number.isFinite(t[k]) ? t[k] : 0), 0);
  const accepted = sum(gen, "accepted");
  const generated = sum(gen, "items");
  const lessons = sum(gen, "lessons");
  const wall = sum(throughput, "wall_seconds");
  const calls = throughput.reduce((s, t) => s + (sumValues(t.subagent_calls) ?? 0), 0);
  const xai = sum(throughput, "xai_batches");
  const human = sum(throughput, "human_review_minutes");
  const base = { label: FULL_BANK_LABEL, lessons_total: lessonsTotal, measured_runs: throughput.map((t) => t.run_id) };
  if (!lessonsTotal || !accepted || !lessons || !wall) {
    return { ...base, available: false, reason: "no measured generation run with accepted items, lessons and wall time (run manifests need a throughput block)" };
  }
  const perLesson = accepted / lessons;
  const projectedAccepted = Math.round(lessonsTotal * perLesson);
  return {
    ...base,
    available: true,
    basis: { accepted, generated, lessons, wall_seconds: wall, subagent_calls: calls, xai_batches: xai, human_review_minutes: human },
    accepted_per_lesson: round(perLesson, 2),
    yield: generated ? round(accepted / generated) : null,
    projected_accepted_items: projectedAccepted,
    projected_hours: round((projectedAccepted * wall) / accepted / 3600, 1),
    projected_subagent_calls: Math.round((projectedAccepted * calls) / accepted),
    projected_xai_batches: Math.round((projectedAccepted * xai) / accepted),
    projected_human_review_hours: round((projectedAccepted * human) / accepted / 60, 1),
  };
}

// ── resource and question-bank manifests (§8) ───────────────────────────────
export function buildResources(data) {
  const evidence = new Map(data.termEvidence.map((e) => [e.id, e]));
  const extractionOf = new Map(data.extraction.map((e) => [e.resource_id, e.status]));
  return data.resources.map((r) => {
    const pages = { text: 0, vision: 0, none: 0 };
    for (const p of data.bank.pageMaps.get(r.id)?.values() ?? []) inc(pages, p.text_method ?? "none");
    const routes = [...new Set((r.term_evidence ?? []).map((id) => evidence.get(id)?.method ?? "missing"))].sort(compareC);
    return {
      id: r.id,
      title: r.title,
      subject: r.subject_node_id ?? null,
      kind: r.kind,
      file_type: r.file_type,
      part: r.part ?? null,
      year_label: r.year_label ?? null,
      year_evidence: r.year_evidence ?? null,
      availability: r.availability,
      status: r.status,
      extraction_status: extractionOf.get(r.id) ?? r.extraction?.status ?? null,
      page_count: r.page_count ?? null,
      pages,
      term: r.term ?? null,
      term_status: r.term_status,
      evidence_routes: routes,
    };
  });
}

export function buildQuestionBank(data) {
  const shards = new Map();
  const published = [];
  for (const { q, shard } of data.questions) {
    const key = `${shard ?? "none"}|${subjectKeyOf(q) ?? "none"}`;
    if (!shards.has(key)) shards.set(key, { shard: shard ?? "none", subject: subjectKeyOf(q) ?? "none", total: 0, by_status: {}, by_origin: {}, by_type: {} });
    const s = shards.get(key);
    s.total += 1;
    inc(s.by_status, q.status);
    inc(s.by_origin, q.provenance?.origin);
    inc(s.by_type, q.question_type);
    if (isPublished(q)) published.push(`${q.id}:${q.revision}`);
  }
  return {
    bank_revision: data.bankRevision,
    published_set_sha256: sha256(published.sort(compareC).join("\n")),
    manifest_sha256: data.manifest.sha256,
    shards: [...shards.values()].map((s) => ({ ...s, by_status: sortObject(s.by_status), by_origin: sortObject(s.by_origin), by_type: sortObject(s.by_type) })).sort((a, b) => compareC(a.shard, b.shard) || compareC(a.subject, b.subject)),
  };
}

// ── exam templates (§5.6, §8 exam-templates.md) ─────────────────────────────
/** Per template: its scopes, offered or refused. No figure is summed across templates or scopes. */
export function buildExamTemplates(blueprints, templates = TEMPLATES) {
  return {
    templates: templates.map((t) => {
      const ref = templateRef(t);
      const scopes = blueprints.rows.filter((b) => b.template === ref);
      return {
        ref,
        kind: t.kind,
        scope_kinds: t.scope_kinds,
        count: t.count,
        difficulty_mix: t.difficulty_mix,
        blueprinted: t.kind !== "weakness",
        scopes_offered: scopes.filter((b) => b.offered).length,
        scopes_refused: scopes.filter((b) => !b.offered).length,
        empty_scopes: blueprints.empty_scopes[ref] ?? 0,
        scopes,
      };
    }),
    invalid_scopes: blueprints.invalid_scopes,
  };
}

/**
 * Throws when a session figure appears outside a per-scope row (a total
 * across templates or overlapping scopes). The report test runs it too.
 */
export function assertNoCrossTotals(examTemplates) {
  const FIGURES = /^(sets_by_component|sets_with_variants|display_permutations|attempts_before_reuse)$/;
  const walk = (o, path, inRow) => {
    if (!o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o)) {
      if (FIGURES.test(k) && !inRow) throw new Error(`session figure ${k} outside a template × scope row at ${path}`);
      const row = inRow || (v && typeof v === "object" && !Array.isArray(v) && typeof v.scope === "string" && typeof v.template === "string");
      walk(v, `${path}.${k}`, row);
    }
  };
  walk(examTemplates, "examTemplates", false);
  return true;
}

// ── verification map (§9.3) ─────────────────────────────────────────────────
export const VERIFICATION_MAP = Object.freeze([
  { requirement: "Schemas and staging integrity, copyright rules", command: "npm run content:validate -- --budget", tests: [], artifacts: ["manifest.json"] },
  { requirement: "Curriculum mapping and terms", command: "npx vitest run tests/unit/content-curriculum-build.test.js tests/unit/curriculum-outline.test.js", tests: ["tests/unit/content-curriculum-build.test.js", "tests/unit/curriculum-outline.test.js"], artifacts: ["curriculum/subject-terms.jsonl", "reports/coverage.md"] },
  { requirement: "PDF extraction, Arabic repair, polite fetching", command: "npx vitest run tests/unit/content-pdf.test.js tests/unit/content-fetch-queue.test.js", tests: ["tests/unit/content-pdf.test.js", "tests/unit/content-fetch-queue.test.js"], artifacts: ["resources/extraction.jsonl"] },
  { requirement: "Generation/validation contract", command: "npx vitest run tests/unit/content-checks.test.js tests/unit/content-exchange.test.js tests/unit/content-legacy.test.js", tests: ["tests/unit/content-checks.test.js", "tests/unit/content-exchange.test.js", "tests/unit/content-legacy.test.js"], artifacts: ["reports/validation.md", "validation/runs"] },
  { requirement: "Dedup and variants", command: "npx vitest run tests/unit/content-dedup.test.js tests/unit/content-templates.test.js", tests: ["tests/unit/content-dedup.test.js", "tests/unit/content-templates.test.js"], artifacts: ["reports/duplicates.md"] },
  { requirement: "Engine, tokens, guest API", command: "npx vitest run tests/unit/engine-select.test.js tests/unit/engine-token.test.js tests/unit/engine-routes.test.js tests/unit/engine-combinatorics.test.js tests/unit/engine-perf.test.js tests/unit/server-routes.test.js", tests: ["tests/unit/engine-select.test.js", "tests/unit/engine-token.test.js", "tests/unit/engine-routes.test.js", "tests/unit/engine-combinatorics.test.js", "tests/unit/engine-perf.test.js", "tests/unit/server-routes.test.js"], artifacts: ["reports/exam-templates.md"] },
  { requirement: "DB, RLS, attacks, import, perf", command: "npm run test:db", tests: ["tests/db/content-0014.test.js", "tests/db/content-engine-rpc.test.js", "tests/db/content-import.test.js", "tests/db/content-perf.test.js"], artifacts: ["reports/import"] },
  { requirement: "UI", command: "npx vitest run tests/unit/exams-types.test.js tests/unit/learn.test.js; node scripts/shot.mjs (375 px, RTL and LTR)", tests: ["tests/unit/exams-types.test.js", "tests/unit/learn.test.js"], artifacts: [] },
  { requirement: "Reports and counts", command: "npx vitest run tests/unit/content-reports.test.js", tests: ["tests/unit/content-reports.test.js"], artifacts: ["reports/coverage.md", "reports/quality.html", "reports/resources.md", "reports/question-bank.md"] },
  { requirement: "Everything", command: "npm test; npm run test:db; npm run build", tests: [], artifacts: [] },
]);

/**
 * The verification map with what exists on disk: test files (repo) and
 * artifacts (staging; `reports/…` counts when this run writes it). It states
 * presence only — it never claims a test passed.
 */
export function buildVerification(data, { repoRoot, reportFiles = [] }) {
  const written = new Set(reportFiles.map((f) => `reports/${f}`));
  const present = (rel) => written.has(rel) || existsSync(join(data.staging, rel));
  return VERIFICATION_MAP.map((row) => ({
    ...row,
    tests_present: row.tests.map((t) => ({ path: t, present: existsSync(join(repoRoot, t)) })),
    artifacts_present: row.artifacts.map((a) => ({ path: a, present: present(a) })),
  }));
}

// ── the whole model ─────────────────────────────────────────────────────────
export const REPORT_FILES = Object.freeze(["coverage.json", "coverage.md", "quality.html", "validation.md", "duplicates.md", "exam-templates.md", "question-stats.json", "resources.md", "question-bank.md", "verification.md"]);

/**
 * @param {object} data            loadReportData()
 * @param {object} o
 * @param {string} o.generatedAt   ISO time recorded in every report
 * @param {string} o.repoRoot
 * @param {object} [o.blueprints]  precomputed buildBlueprints(data)
 */
export async function buildReportModel(data, { generatedAt, repoRoot, blueprints = null }) {
  const bp = blueprints ?? (await buildBlueprints(data));
  const canonicalIds = canonicalIdsOf(data.clusters);
  const ctx = coverageContext(data, bp);
  const examTemplates = buildExamTemplates(bp);
  assertNoCrossTotals(examTemplates);
  return {
    meta: {
      version: REPORT_VERSION,
      generated_at: generatedAt,
      manifest_sha256: data.manifest.sha256,
      manifest_status: data.manifest.status,
      manifest_stale_paths: data.manifest.stale_paths,
      counting_rules: COUNTING_RULES,
    },
    blueprints: bp,
    coverage: buildCoverage(data, bp, ctx),
    quality: buildQuality(data, bp, canonicalIds),
    validation: buildValidation(data, { generatedAt }),
    duplicates: buildDuplicates(data),
    questionStats: buildQuestionStats(data),
    resources: buildResources(data),
    questionBank: buildQuestionBank(data),
    examTemplates,
    verification: buildVerification(data, { repoRoot, reportFiles: REPORT_FILES }),
  };
}
