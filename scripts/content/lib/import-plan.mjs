// ============================================================================
// Import plan (docs/CONTENT_ENGINE.md §6.3): what `import-staging` sends, in
// which order, and which keys it may retire. Pure over the staging files.
//
//   loadStaging(stagingDir)                       → { manifest, manifestSha, files, records, shardOf }
//   buildPlan(staging, { target, only, registry }) → { entities: [{entity, rows}], filtered, duplicates, … }
//   removedKeys(manifest, previousManifest)        → [{key, reason}]   (manifest diff → removed[])
//   planRetire(removed, { manifest, previous, shardOf, coveredShards }) → { keys, skipped }
//   markDuplicates(questions)                      → Map key → canonical key (content_hash within the manifest)
//
// Entity order (§6.3 step 3): sources, nodes, resources, subject_terms,
// lesson_ranges, objectives, stimuli, [retire], questions, templates.
// Nodes precede resources because curriculum_resources.subject_node_id
// references curriculum_nodes (documented deviation from the design's list).
// ============================================================================
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readJsonl } from "./jsonl.mjs";
import { ruleFor, shardBase } from "./schemas.mjs";

export const ENTITY_ORDER = Object.freeze(["sources", "nodes", "resources", "subject_terms", "lesson_ranges", "objectives", "stimuli", "questions", "templates"]);
/** `--only` names → entities. */
export const ONLY_GROUPS = Object.freeze({
  sources: ["sources"],
  resources: ["resources"],
  curriculum: ["nodes", "subject_terms", "lesson_ranges"],
  objectives: ["objectives"],
  stimuli: ["stimuli"],
  questions: ["questions"],
  templates: ["templates"],
});
export const BATCH_SIZE = 500;

/** PostgreSQL "C" collation order (UTF-8 bytes). */
export const compareC = (a, b) => Buffer.compare(Buffer.from(String(a), "utf8"), Buffer.from(String(b), "utf8"));
const byId = (a, b) => compareC(a.id, b.id);

/** Parse `--only a,b` into the entity set (null = everything). Throws on unknown names. */
export function parseOnly(value) {
  if (value === null || value === undefined || value === "") return null;
  const names = String(value).split(",").map((s) => s.trim()).filter(Boolean);
  const out = new Set();
  for (const n of names) {
    if (!ONLY_GROUPS[n]) throw new Error(`--only: unknown entity "${n}" (use ${Object.keys(ONLY_GROUPS).join(", ")})`);
    for (const e of ONLY_GROUPS[n]) out.add(e);
  }
  return ENTITY_ORDER.filter((e) => out.has(e));
}

function readData(abs, format) {
  if (format === "jsonl") return readJsonl(abs);
  const value = JSON.parse(readFileSync(abs, "utf8").replace(/^﻿/, ""));
  return format === "json-array" ? value : [value];
}

/**
 * Read the staging tree through its manifest (only listed files are read, so
 * the import sees exactly what validate-staging checked and hashed).
 */
export function loadStaging(stagingDir) {
  const manifestPath = join(stagingDir, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error(`manifest.json not found in ${stagingDir} (run validate-staging --write-manifest)`);
  const manifestBytes = readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const manifestSha = createHash("sha256").update(manifestBytes).digest("hex");
  const records = { sources: [], nodes: [], resources: [], subject_terms: [], objectives: [], stimuli: [], questions: [], templates: [] };
  const shardOf = new Map(); // question key → shard base (e.g. "questions/middle/grade-1/math")
  const files = [];
  for (const entry of manifest.files ?? []) {
    const rule = ruleFor(entry.path);
    if (!rule) continue;
    const target = {
      registry: "sources", nodes: "nodes", resources: "resources", "subject-terms": "subject_terms",
      objectives: "objectives", stimuli: "stimuli", questions: "questions", variants: "questions", "exam-templates": "templates",
    }[rule.id];
    if (!target) continue;
    const abs = join(stagingDir, entry.path);
    const list = readData(abs, rule.format);
    files.push({ path: entry.path, entity: target, count: list.length });
    for (const r of list) {
      records[target].push(target === "questions" ? { ...r, _shard: shardBase(entry.path) } : r);
      if (target === "questions") shardOf.set(r.id, shardBase(entry.path));
    }
  }
  return { stagingDir, manifest, manifestSha, files, records, shardOf };
}

/** Depth of each node (parents first when sorted by depth, then id). */
function nodeDepths(nodes) {
  const parent = new Map(nodes.map((n) => [n.id, n.parent_id]));
  const depth = new Map();
  const of = (id, guard = 0) => {
    if (depth.has(id)) return depth.get(id);
    const p = parent.get(id);
    const d = p && parent.has(p) && guard < 32 ? of(p, guard + 1) + 1 : 0;
    depth.set(id, d);
    return d;
  };
  for (const n of nodes) of(n.id);
  return depth;
}

/** Page ranges of nodes → lesson_resource_ranges rows (first range per (node, resource)). */
export function lessonRanges(nodes) {
  const out = [];
  const seen = new Set();
  for (const n of [...nodes].sort(byId)) {
    for (const p of n.pages ?? []) {
      const k = `${n.id}@${p.resource_id}`;
      if (seen.has(k) || !p.resource_id) continue;
      seen.add(k);
      out.push({
        lesson_node_id: n.id, resource_id: p.resource_id, pdf_start: p.pdf_start ?? null, pdf_end: p.pdf_end ?? null,
        printed_start: p.printed_start ?? null, printed_end: p.printed_end ?? null, method: p.method, status: p.status,
      });
    }
  }
  return out;
}

/**
 * Dedup against manifest content (§6.3 step 4): questions sharing a
 * content_hash under different keys → every key but the first (C order) is a
 * duplicate of it. Compared over the whole manifest, never against live rows.
 */
export function markDuplicates(questions) {
  const first = new Map();
  const dup = new Map();
  for (const q of [...questions].sort(byId)) {
    if (!q.content_hash) continue;
    if (first.has(q.content_hash)) dup.set(q.id, first.get(q.content_hash));
    else first.set(q.content_hash, q.id);
  }
  return dup;
}

/** Does a question's source allow production (§1.4, §2.3)? internal / no textbook source always do. */
export function publishAllowed(q, registry) {
  const sid = q.source?.source_id ?? null;
  if (!sid) return true;
  const src = registry.get(sid);
  return Boolean(src) && (src.kind === "internal" || src.publish_policy === "derived_questions_allowed");
}

/**
 * Build the batches' inputs.
 * @param {object} staging  loadStaging() result
 * @param {object} o
 * @param {"pglite"|"supabase"|"test"} o.target
 * @param {string[]|null} [o.only]   entity subset (parseOnly)
 */
export function buildPlan(staging, { target, only = null } = {}) {
  const r = staging.records;
  const registry = new Map(r.sources.map((s) => [s.id, s]));
  const depth = nodeDepths(r.nodes);
  const nodes = [...r.nodes].sort((a, b) => depth.get(a.id) - depth.get(b.id) || compareC(a.id, b.id));
  const published = r.questions.filter((q) => q.status === "published");
  const duplicates = markDuplicates(published);
  let filteredOut = [];
  let questions = published;
  if (target === "supabase") {
    filteredOut = published.filter((q) => !publishAllowed(q, registry)).map((q) => q.id);
    const drop = new Set(filteredOut);
    questions = published.filter((q) => !drop.has(q.id));
  }
  const rows = {
    sources: [...r.sources].sort(byId),
    nodes,
    resources: [...r.resources].sort(byId),
    subject_terms: [...r.subject_terms].sort((a, b) => compareC(`${a.subject_node_id}@${a.term}`, `${b.subject_node_id}@${b.term}`)),
    lesson_ranges: lessonRanges(r.nodes),
    objectives: [...r.objectives].sort(byId),
    stimuli: [...r.stimuli].sort(byId),
    questions: questions
      .map(({ _shard, ...q }) => (duplicates.has(q.id) ? { ...q, _import: { duplicate_of: duplicates.get(q.id) } } : q))
      .sort(byId),
    templates: [...r.templates].sort((a, b) => compareC(a.id, b.id) || a.version - b.version),
  };
  const entities = ENTITY_ORDER.filter((e) => !only || only.includes(e)).map((entity) => ({ entity, rows: rows[entity] }));
  const coveredShards = new Set(!only || only.includes("questions") ? r.questions.map((q) => q._shard) : []);
  return {
    target,
    only,
    entities,
    filtered: filteredOut.length > 0,
    filteredOut,
    duplicates: [...duplicates].map(([key, same]) => ({ key, same_as: same })),
    coveredShards,
    publishedCount: published.length,
  };
}

/**
 * removed[] of a manifest (§6.3 step 6): the manifest's own list plus keys
 * published in the previously imported manifest and no longer published now.
 */
export function removedKeys(manifest, previous = null) {
  const now = new Set(Object.values(manifest?.published ?? {}).flat());
  const out = new Map();
  for (const item of manifest?.removed ?? []) if (!now.has(item.key)) out.set(item.key, item.reason);
  for (const key of Object.values(previous?.published ?? {}).flat()) if (!now.has(key) && !out.has(key)) out.set(key, "unpublished");
  return [...out].sort((a, b) => compareC(a[0], b[0])).map(([key, reason]) => ({ key, reason }));
}

/**
 * Retire scope (§6.3 step 6): only keys listed in removed[], and only inside
 * the shard / subject set the run fully covers. A removed key's shard comes
 * from the previous manifest's published map or from the current files
 * (where the record still exists with another status).
 * @returns {{ keys: string[], skipped: {key, reason}[] }}
 */
export function planRetire(removed, { previous = null, shardOf = new Map(), coveredShards = new Set() } = {}) {
  const prevShard = new Map();
  for (const [path, keys] of Object.entries(previous?.published ?? {})) for (const k of keys) prevShard.set(k, shardBase(path));
  const keys = [];
  const skipped = [];
  for (const { key } of removed) {
    const shard = prevShard.get(key) ?? shardOf.get(key) ?? null;
    if (!shard) skipped.push({ key, reason: "shard_unknown" });
    else if (!coveredShards.has(shard) && shardOf.has(key)) skipped.push({ key, reason: "not_covered" });
    else if (!coveredShards.has(shard) && !prevShard.has(key)) skipped.push({ key, reason: "not_covered" });
    else keys.push(key);
  }
  return { keys, skipped };
}

/** Split rows into batches of `size`. */
export function batches(rows, size = BATCH_SIZE) {
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/** Natural key of a row per entity (logs, checkpoints). */
export function rowKey(entity, row) {
  if (entity === "subject_terms") return `${row.subject_node_id}@${row.term}`;
  if (entity === "lesson_ranges") return `${row.lesson_node_id}@${row.resource_id}`;
  if (entity === "templates") return `${row.id}@${row.version}`;
  return row.id;
}

/**
 * Materialize a staging tree from record sets (tests, synthetic imports):
 * the §3 layout plus a manifest@1 listing every file and the published keys.
 * Questions are sharded by subject (`questions/<stage>/<grade>/<subject>.jsonl`)
 * or prep section (`questions/prep/<exam>-<section>.jsonl`).
 * @returns {string} the manifest sha256
 */
export function writeStagingTree(dir, { registry = [], nodes = [], objectives = [], resources = [], stimuli = [], subjectTerms = [], questions = [], templates = [], removed = [] } = {}) {
  const files = [];
  const put = (rel, schema, text, lines) => {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, text, "utf8");
    files.push({ path: rel, schema, sha256: createHash("sha256").update(text).digest("hex"), lines, bytes: Buffer.byteLength(text) });
  };
  const jsonl = (list) => list.map((r) => JSON.stringify(r)).join("\n") + (list.length ? "\n" : "");
  const group = (list, keyOf) => {
    const m = new Map();
    for (const r of list) {
      const k = keyOf(r);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return [...m].sort((a, b) => compareC(a[0], b[0]));
  };
  const leafOf = (id) => id.split("/").slice(0, 2).join("/");
  if (registry.length) put("sources/registry.json", "source@1", `${JSON.stringify([...registry].sort(byId), null, 2)}\n`, 1);
  for (const [leaf, list] of group(nodes, (n) => leafOf(n.id))) put(`curriculum/nodes/${leaf}.jsonl`, "curriculum-node@1", jsonl([...list].sort(byId)), list.length);
  for (const [leaf, list] of group(objectives, (o) => leafOf(o.lesson_node_id))) put(`curriculum/objectives/${leaf}.jsonl`, "objective@1", jsonl([...list].sort(byId)), list.length);
  if (subjectTerms.length) put("curriculum/subject-terms.jsonl", "subject-term@1", jsonl(subjectTerms), subjectTerms.length);
  if (resources.length) put("resources/resources.jsonl", "resource@1", jsonl([...resources].sort(byId)), resources.length);
  if (stimuli.length) put("questions/stimuli/shared/all.jsonl", "stimulus@1", jsonl([...stimuli].sort(byId)), stimuli.length);
  const published = {};
  const shardOfQ = (q) => (q.scope === "curriculum" ? `questions/${q.curriculum.subject}.jsonl` : `questions/prep/${q.prep.exam}-${q.prep.section}.jsonl`);
  for (const [rel, list] of group(questions, shardOfQ)) {
    const sorted = [...list].sort(byId);
    put(rel, "question@1", jsonl(sorted), sorted.length);
    const keys = sorted.filter((q) => q.status === "published").map((q) => q.id);
    if (keys.length) published[rel] = keys;
  }
  if (templates.length) put("exams/templates.json", "exam-template@1", `${JSON.stringify(templates, null, 2)}\n`, 1);
  files.sort((a, b) => compareC(a.path, b.path));
  const manifest = {
    schema: "manifest@1", generated_by: "validate-staging@1", normalization: "n2", files,
    totals: { files: files.length, lines: files.reduce((s, f) => s + f.lines, 0), bytes: files.reduce((s, f) => s + f.bytes, 0) },
    published, removed,
  };
  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(join(dir, "manifest.json"), text, "utf8");
  return createHash("sha256").update(text).digest("hex");
}
