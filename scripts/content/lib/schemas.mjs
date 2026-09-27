// ============================================================================
// Content schemas: loading, validation, key order and the staging path rules
// (docs/CONTENT_ENGINE.md §3). JSON Schema draft 2020-12, AJV 8.
//
//   validateRecord("question", rec)   → { ok, errors: ["/path message", …] }
//   stringifyRecord("question", rec)  → one canonical JSONL line (schema key order)
//   ruleFor("questions/middle/grade-1/math.jsonl") → { schema, format, sort, … }
// ============================================================================

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const SCHEMA_DIR = join(REPO_ROOT, "data/schemas");
const ID_PREFIX = "urn:jazira:schema:";

let cache = null;

/** Load and compile every data/schemas/*.schema.json once. */
export function loadSchemas(dir = SCHEMA_DIR) {
  if (cache && cache.dir === dir) return cache;
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
  const schemas = new Map();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".schema.json")).sort()) {
    const schema = JSON.parse(readFileSync(join(dir, file), "utf8"));
    const name = file.replace(/\.schema\.json$/, "");
    if (schema.$id !== ID_PREFIX + name) throw new Error(`${file}: $id must be ${ID_PREFIX}${name}`);
    schemas.set(name, schema);
    ajv.addSchema(schema);
  }
  const validators = new Map();
  // Compile everything now so a strict-mode problem in any schema fails loudly at load.
  for (const name of schemas.keys()) if (name !== "common") validators.set(name, ajv.getSchema(ID_PREFIX + name));
  cache = { dir, ajv, schemas, validators };
  return cache;
}

export const schemaNames = () => [...loadSchemas().schemas.keys()].filter((n) => n !== "common");

function validatorFor(name) {
  const c = loadSchemas();
  let v = c.validators.get(name);
  if (!v) {
    v = c.ajv.getSchema(ID_PREFIX + name);
    if (!v) throw new Error(`unknown schema ${name}`);
    c.validators.set(name, v);
  }
  return v;
}

/** Validate one record against `<name>@1`. */
export function validateRecord(name, record) {
  const v = validatorFor(name);
  if (v(record)) return { ok: true, errors: [] };
  const errors = [...new Set((v.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message}${e.params?.additionalProperty ? ` (${e.params.additionalProperty})` : ""}`))];
  return { ok: false, errors: errors.slice(0, 12) };
}

// ── key order ───────────────────────────────────────────────────────────────
function resolveRef(node) {
  const c = loadSchemas();
  let n = node;
  for (let i = 0; n && n.$ref && i < 10; i++) {
    const [base, frag] = n.$ref.split("#");
    let target = c.schemas.get(base.replace(ID_PREFIX, ""));
    for (const part of (frag ?? "").split("/").filter(Boolean)) target = target?.[part];
    n = target;
  }
  return n;
}

function objectBranch(node, value) {
  node = resolveRef(node);
  if (!node) return null;
  if (node.properties) return node;
  const branches = node.anyOf ?? node.oneOf;
  if (!branches) return node.additionalProperties && typeof node.additionalProperties === "object" ? node : null;
  let best = null;
  let bestScore = -1;
  for (const b of branches) {
    const r = resolveRef(b);
    if (!r?.properties) continue;
    const keys = Object.keys(value);
    const score = keys.filter((k) => k in r.properties).length - keys.filter((k) => !(k in r.properties)).length;
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return best;
}

function arrayItems(node) {
  node = resolveRef(node);
  if (!node) return null;
  if (node.items) return node.items;
  for (const b of node.anyOf ?? node.oneOf ?? []) {
    const r = resolveRef(b);
    if (r?.items) return r.items;
  }
  return null;
}

function orderValue(node, value) {
  if (Array.isArray(value)) {
    const items = arrayItems(node);
    return items ? value.map((v) => orderValue(items, v)) : value;
  }
  if (value === null || typeof value !== "object") return value;
  const schema = objectBranch(node, value);
  if (!schema) return value;
  const out = {};
  if (schema.properties) {
    for (const k of Object.keys(schema.properties)) if (k in value) out[k] = orderValue(schema.properties[k], value[k]);
  }
  const extra = schema.additionalProperties && typeof schema.additionalProperties === "object" ? schema.additionalProperties : null;
  for (const k of Object.keys(value)) if (!(k in out)) out[k] = extra ? orderValue(extra, value[k]) : value[k];
  return out;
}

/** A copy of `record` with keys in schema order (unknown keys keep their order, last). */
export function orderKeys(name, record) {
  return orderValue(loadSchemas().schemas.get(name), record);
}

/** Top-level property order of a schema. */
export function keyOrder(name) {
  const s = loadSchemas().schemas.get(name);
  return Object.keys(objectBranch(s, {})?.properties ?? s?.oneOf?.[0]?.properties ?? {});
}

/** One canonical JSONL line (no newline). */
export function stringifyRecord(name, record) {
  return JSON.stringify(orderKeys(name, record));
}

// ── staging path rules (§3): every file under data/staging has a rule ──────
const SEG = "[a-z0-9][a-z0-9_-]*";
const SUB = `${SEG}(?:/${SEG}){0,4}`;
const SHARD = "(?:\\.p\\d{2})?\\.jsonl";
const rx = (s) => new RegExp(`^${s}$`);

/**
 * format: jsonl | json | json-array | text | report | ignored.
 * sort: fields the records must be sorted by (null = the producer's order).
 * sharded: `.pNN.jsonl` shards allowed (split at 4 MB by sorted id ranges).
 */
export const PATH_RULES = Object.freeze([
  { id: "readme", re: rx("README\\.md"), format: "text" },
  { id: "manifest", re: rx("manifest\\.json"), schema: "manifest", format: "json" },
  { id: "registry", re: rx("sources/registry\\.json"), schema: "source", format: "json-array", sort: ["id"] },
  { id: "ien-nodes", re: rx("sources/ien/nodes\\.jsonl"), schema: "ien-node", format: "jsonl", sort: null },
  { id: "ien-books", re: rx("sources/ien/books\\.jsonl"), schema: "ien-book", format: "jsonl", sort: null },
  { id: "ien-lessons", re: rx("sources/ien/lessons\\.jsonl"), schema: "ien-lesson", format: "jsonl", sort: null },
  { id: "crawl-report", re: rx("sources/ien/crawl-report\\.json"), schema: "crawl-report", format: "json" },
  { id: "frontmatter", re: rx("sources/ien/book-frontmatter\\.jsonl"), schema: "book-frontmatter", format: "jsonl", sort: ["ien_book_id"] },
  { id: "changes", re: rx("sources/ien/changes-\\d{4}-\\d{2}-\\d{2}\\.jsonl"), schema: "crawl-changes", format: "jsonl", sort: null },
  { id: "catalog-map", re: rx("sources/research/catalog-map\\.jsonl"), schema: "catalog-map", format: "jsonl", sort: null },
  { id: "research", re: rx("sources/research/term-evidence\\.json"), schema: "research-claims", format: "json" },
  { id: "nodes", re: rx(`curriculum/nodes/${SUB}${SHARD}`), schema: "curriculum-node", format: "jsonl", sort: ["id"], sharded: true },
  { id: "objectives", re: rx(`curriculum/objectives/${SUB}${SHARD}`), schema: "objective", format: "jsonl", sort: ["id"], sharded: true },
  { id: "owner-decisions", re: rx("curriculum/owner-decisions\\.jsonl"), schema: "owner-decision", format: "jsonl", sort: ["id"] },
  { id: "id-registry", re: rx("curriculum/id-registry\\.jsonl"), schema: "id-registry", format: "jsonl", sort: ["id"] },
  { id: "subject-terms", re: rx("curriculum/subject-terms\\.jsonl"), schema: "subject-term", format: "jsonl", sort: ["subject_node_id", "term"] },
  { id: "ien-mapping", re: rx("curriculum/ien-mapping\\.json"), schema: "ien-mapping", format: "json" },
  { id: "audit", re: rx("curriculum/audit\\.jsonl"), schema: "curriculum-audit", format: "jsonl", sort: null },
  { id: "prep-alignment", re: rx("curriculum/prep-alignment\\.jsonl"), schema: "prep-alignment", format: "jsonl", sort: ["prep_topic", "node_id"] },
  { id: "resources", re: rx(`resources/resources${SHARD}`), schema: "resource", format: "jsonl", sort: ["id"], sharded: true },
  { id: "term-evidence", re: rx(`resources/term-evidence${SHARD}`), schema: "term-evidence", format: "jsonl", sort: ["id"], sharded: true },
  { id: "extraction", re: rx("resources/extraction\\.jsonl"), schema: "extraction", format: "jsonl", sort: ["resource_id"] },
  { id: "toc", re: rx(`resources/toc/${SEG}\\.json`), schema: "toc", format: "json" },
  { id: "page-maps", re: rx(`resources/page-maps/${SEG}\\.jsonl`), schema: "page-map", format: "jsonl", sort: ["pdf_page"] },
  { id: "exercise-index", re: rx(`resources/exercise-index/${SEG}\\.jsonl`), schema: "exercise-index", format: "jsonl", sort: ["pdf_page", "label"] },
  { id: "stimuli", re: rx(`questions/stimuli/${SUB}${SHARD}`), schema: "stimulus", format: "jsonl", sort: ["id"], sharded: true },
  { id: "questions", re: rx(`questions/${SUB}${SHARD}`), schema: "question", format: "jsonl", sort: ["id"], sharded: true },
  { id: "templates", re: rx(`question-variants/templates/${SUB}${SHARD}`), schema: "question-template", format: "jsonl", sort: ["id"], sharded: true },
  { id: "variants", re: rx(`question-variants/${SUB}${SHARD}`), schema: "question", format: "jsonl", sort: ["id"], sharded: true },
  { id: "exam-templates", re: rx("exams/templates\\.json"), schema: "exam-template", format: "json-array", sort: ["id", "version"] },
  { id: "blueprints", re: rx(`exams/blueprints/${SEG}\\.jsonl`), schema: "exam-blueprint", format: "jsonl", sort: null },
  { id: "validation-records", re: rx(`validation/records/${SUB}${SHARD}`), schema: "validation-record", format: "jsonl", sort: ["id"], sharded: true },
  { id: "dedup-clusters", re: rx(`validation/dedup-clusters${SHARD}`), schema: "dedup-cluster", format: "jsonl", sort: ["id"], sharded: true },
  { id: "review-queue", re: rx("validation/review-queue\\.jsonl"), schema: "review-queue", format: "jsonl", sort: ["question_id", "revision"] },
  { id: "review-decisions", re: rx("validation/review-decisions\\.jsonl"), schema: "review-decision", format: "jsonl", sort: ["question_id", "revision"] },
  { id: "runs", re: rx("validation/runs/run-\\d{8}-[a-z]+-\\d{2}\\.json"), schema: "run-manifest", format: "json" },
  { id: "exchange", re: /^validation\/exchange\//, format: "ignored" },
  { id: "reports", re: rx(`reports/${SUB}\\.(?:md|html|json|jsonl)`), format: "report" },
]);

/** The rule for a staging-relative POSIX path, or null (unknown file). */
export function ruleFor(relPath) {
  return PATH_RULES.find((r) => r.re.test(relPath)) ?? null;
}

/** Rules for data/runtime/bank (§5.8). */
export const RUNTIME_RULES = Object.freeze([
  { id: "bank-index", re: rx("index\\.json"), schema: "runtime-bank-index", format: "json" },
  { id: "bank-sel", re: rx("sel/[a-z0-9][a-z0-9_-]{0,63}\\.json"), schema: "runtime-bank-sel", format: "json" },
  { id: "bank-content", re: rx("(?:c|k)/[a-z0-9][a-z0-9_-]{0,63}\\.json"), schema: "runtime-bank-content", format: "json" },
]);

export function runtimeRuleFor(relPath) {
  return RUNTIME_RULES.find((r) => r.re.test(relPath)) ?? null;
}

/** Shard base of a sharded path: "questions/m/g/math.p02.jsonl" → "questions/m/g/math". */
export const shardBase = (relPath) => relPath.replace(/(?:\.p\d{2})?\.jsonl$/, "");
