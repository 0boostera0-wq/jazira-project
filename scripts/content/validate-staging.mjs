#!/usr/bin/env node
// ============================================================================
// validate-staging — schemas, integrity and copyright rules for data/staging
// (docs/CONTENT_ENGINE.md §3).
//
//   node scripts/content/validate-staging.mjs [--budget] [--changed] [--write-manifest]
//        [--root <staging dir>] [--runtime <bank dir>|--no-runtime] [--json]
//        [--registry-baseline <jsonl file>|none]
//
// Checks: (1) every line against its schema (every file must have a rule — an
// unknown file fails); (2) referential integrity (nodes, resources, term
// evidence, objectives, stimuli, templates, clusters, records; the question's
// term equals its lesson's); (3) id uniqueness and format; (4) sort order,
// canonical serialization (schema key order, LF, final newline) and shard
// layout; (5) budgets (--budget; shard ≤ 4 MB is always checked);
// (6) manifest.json hashes and the published-key set; (7) copyright rules:
// excerpts ≤ 80 chars, no `quote` in question records, no absolute paths or
// cache_dir, no .jpg/.png under data/ or src/ outside the image manifest.
// Also: the id registry is append-only; q-/t-/v- ids name the record's own grade
// and subject; the runtime bank index matches its files, c/ chunks are kind
// "content" with no answer field at any depth, k/ chunks are kind "keys".
// Exit 0 = ok, 1 = invalid, 2 = usage error.
// ============================================================================

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { inspectJsonlText, sha256, writeJson, MAX_SHARD_BYTES } from "./lib/jsonl.mjs";
import { REPO_ROOT, ruleFor, runtimeRuleFor, shardBase, stringifyRecord, validateRecord } from "./lib/schemas.mjs";
import { compareC } from "../../src/lib/content/prng.js";
import {
  isNodeId, isQuestionKey, isVariantId, termEvidenceId, validationRecordId, variantId, dedupClusterId, gradeCode, IdError,
} from "../../src/lib/content/ids.js";

export const MB = 1024 * 1024;
export const BUDGETS = Object.freeze({ shard: MAX_SHARD_BYTES, staging: 200 * MB, stagingWarn: 150 * MB, runtime: 40 * MB, contentChunk: 256 * 1024 });
const EXCERPT_MAX = 80;
const IMAGE_RE = /\.(?:jpe?g|png)$/i;
const NEXT_METADATA_IMAGE = /(?:^|\/)src\/app\/(?:.*\/)?(?:icon|apple-icon|opengraph-image|twitter-image)\d*\.(?:png|jpe?g)$/i;
const ABSOLUTE_PATH_RE = /^(?:[A-Za-z]:[\\/]|\\\\|file:\/\/|\/(?:Users|home|mnt|tmp|var|private|Volumes)\/)/;

// The same inside a longer string ("cached at C:/jazira/content-cache/…"): a drive
// letter not preceded by a letter or digit (so "https://" never matches), a UNC
// prefix, file:// or a home/temp directory after whitespace or punctuation.
const EMBEDDED_PATH_RE = /(?:^|[^A-Za-z0-9])(?:[A-Za-z]:[\\/][A-Za-z0-9._$~-]|\\\\[A-Za-z0-9]|file:\/\/|\/(?:Users|home|mnt|tmp|private|Volumes)\/[A-Za-z0-9._-])/;
const isAbsolutePathText = (v) => ABSOLUTE_PATH_RE.test(v) || EMBEDDED_PATH_RE.test(v);

const toPosix = (p) => p.split(sep).join("/");
const codePoints = (s) => [...String(s)].length;

// ── report ──────────────────────────────────────────────────────────────────
class Report {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }
  error(file, line, code, message) {
    this.errors.push({ file, line, code, message });
  }
  warn(file, line, code, message) {
    this.warnings.push({ file, line, code, message });
  }
}

// ── file discovery ──────────────────────────────────────────────────────────
function walk(dir, base = dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      walk(full, base, out);
    } else if (entry.isFile()) out.push(toPosix(relative(base, full)));
  }
  return out.sort(compareC);
}

/** Allowed image paths: file names listed in src/lib/assets.js + Next.js metadata images. */
export function imageAllowlist(repoRoot = REPO_ROOT) {
  const allow = new Set();
  const manifest = join(repoRoot, "src/lib/assets.js");
  if (existsSync(manifest)) {
    for (const m of readFileSync(manifest, "utf8").matchAll(/["'`]([^"'`\s]+\.(?:png|jpe?g))["'`]/gi)) {
      allow.add(m[1].split("/").pop().toLowerCase());
    }
  }
  return allow;
}

function isAllowedImage(posixPath, allow) {
  if (NEXT_METADATA_IMAGE.test(posixPath)) return true;
  return allow.has(posixPath.split("/").pop().toLowerCase());
}

function gitChangedFiles(root) {
  try {
    const top = execFileSync("git", ["-C", root, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
    const out = execFileSync("git", ["-C", top, "status", "--porcelain", "--untracked-files=all", "--", resolve(root)], { encoding: "utf8" });
    const files = new Set();
    for (const line of out.split("\n")) {
      if (!line.trim()) continue;
      const path = line.slice(3).replace(/^"|"$/g, "").split(" -> ").pop();
      files.add(toPosix(relative(resolve(root), resolve(top, path))));
    }
    return files;
  } catch {
    return null;
  }
}

function gitBaselineRegistry(root) {
  try {
    const top = execFileSync("git", ["-C", root, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
    const rel = toPosix(relative(top, join(resolve(root), "curriculum/id-registry.jsonl")));
    const text = execFileSync("git", ["-C", top, "show", `HEAD:${rel}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return inspectJsonlText(text).records.map((r) => r.record.id);
  } catch {
    return null; // not committed yet, or not a git checkout
  }
}

// ── per-file checks ─────────────────────────────────────────────────────────
function sortTuple(record, fields) {
  return fields.map((f) => record?.[f]);
}
function compareTuple(a, b) {
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") return x < y ? -1 : 1;
    const c = compareC(String(x ?? ""), String(y ?? ""));
    if (c) return c;
  }
  return 0;
}

function checkFileRules(file, text, report) {
  if (text.startsWith("﻿")) report.error(file.rel, 1, "bom", "UTF-8 BOM (write UTF-8 without BOM)");
  if (text.includes("\r")) report.error(file.rel, 0, "crlf", "CR characters (use LF line endings)");
  if (text.length && !text.endsWith("\n")) report.error(file.rel, 0, "final_newline", "missing final newline");
}

/** Load a data file, validate its records against the schema, check canonical form and order. */
function loadDataFile(file, report, { maxShardBytes }) {
  const buf = readFileSync(file.abs);
  const text = buf.toString("utf8");
  file.bytes = buf.length;
  file.sha256 = sha256(buf);
  file.records = [];
  const { rule } = file;
  if (rule.format === "jsonl") {
    if (file.bytes > maxShardBytes) report.error(file.rel, 0, "oversized_shard", `${file.bytes} bytes > ${maxShardBytes} (split into .pNN.jsonl shards)`);
    const { records, issues } = inspectJsonlText(text);
    for (const i of issues) report.error(file.rel, i.line, i.code, i.message);
    file.lines = records.length + issues.filter((i) => i.code === "invalid_json" || i.code === "not_object").length;
    file.records = records.map(({ record, line, raw }) => ({ record, line, raw }));
  } else {
    checkFileRules(file, text, report);
    let value;
    try {
      value = JSON.parse(text.replace(/^﻿/, ""));
    } catch (e) {
      report.error(file.rel, 0, "invalid_json", e.message);
      file.lines = 0;
      return;
    }
    if (JSON.stringify(value, null, 2) + "\n" !== text) report.error(file.rel, 0, "non_canonical", "JSON files are 2-space pretty-printed with a final newline");
    if (rule.format === "json-array") {
      if (!Array.isArray(value)) {
        report.error(file.rel, 0, "schema", "expected a JSON array of records");
        return;
      }
      file.records = value.map((record, i) => ({ record, line: i + 1, raw: null }));
    } else file.records = [{ record: value, line: 0, raw: null }];
    file.lines = file.records.length;
  }
  let schemaErrors = 0;
  for (const r of file.records) {
    const v = validateRecord(rule.schema, r.record);
    if (!v.ok) {
      if (++schemaErrors <= 20) report.error(file.rel, r.line, "schema", `${rule.schema}@1: ${v.errors.join("; ")}`);
      r.invalid = true;
    }
    if (r.raw !== null && !r.invalid && stringifyRecord(rule.schema, r.record) !== r.raw) {
      report.error(file.rel, r.line, "non_canonical", "record is not in canonical form (schema key order, compact JSON)");
    }
  }
  if (schemaErrors > 20) report.error(file.rel, 0, "schema", `${schemaErrors - 20} more schema errors`);
  if (rule.sort) {
    for (let i = 1; i < file.records.length; i++) {
      const a = sortTuple(file.records[i - 1].record, rule.sort);
      const b = sortTuple(file.records[i].record, rule.sort);
      if (compareTuple(a, b) > 0) {
        report.error(file.rel, file.records[i].line, "unsorted", `records must be sorted by ${rule.sort.join(", ")} (${JSON.stringify(a)} > ${JSON.stringify(b)})`);
        break;
      }
    }
  }
}

function checkShardLayout(files, report) {
  const groups = new Map();
  for (const f of files) {
    if (!f.rule?.sharded) continue;
    const base = shardBase(f.rel);
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(f);
  }
  for (const [base, group] of groups) {
    const parts = group.filter((f) => /\.p\d{2}\.jsonl$/.test(f.rel)).sort((a, b) => compareC(a.rel, b.rel));
    if (!parts.length) continue;
    if (group.length !== parts.length) report.error(`${base}.jsonl`, 0, "shard_layout", "a base file and .pNN shards of the same set both exist");
    parts.forEach((f, i) => {
      if (!f.rel.endsWith(`.p${String(i + 1).padStart(2, "0")}.jsonl`)) report.error(f.rel, 0, "shard_layout", "shard numbers must run .p01, .p02, … without gaps");
    });
    for (let i = 1; i < parts.length; i++) {
      const prev = parts[i - 1].records.at(-1)?.record;
      const next = parts[i].records[0]?.record;
      const sortBy = parts[i].rule.sort ?? ["id"];
      if (prev && next && compareTuple(sortTuple(prev, sortBy), sortTuple(next, sortBy)) >= 0) {
        report.error(parts[i].rel, 1, "shard_layout", "shards must hold consecutive sorted ranges");
      }
    }
  }
}

// ── indexes, ids and references ─────────────────────────────────────────────
const ENTITY_OF = {
  source: "sources", "curriculum-node": "nodes", resource: "resources", "term-evidence": "termEvidence",
  objective: "objectives", stimulus: "stimuli", question: "questions", "question-template": "templates",
  "validation-record": "records", "dedup-cluster": "clusters", "id-registry": "registry", "owner-decision": "ownerDecisions",
};

function buildIndexes(files, report) {
  const idx = Object.fromEntries(Object.values(ENTITY_OF).map((k) => [k, new Map()]));
  for (const f of files) {
    const entity = ENTITY_OF[f.rule?.schema];
    if (!entity) continue;
    for (const r of f.records) {
      const id = r.record?.id;
      if (typeof id !== "string") continue;
      const prev = idx[entity].get(id);
      if (prev) report.error(f.rel, r.line, "duplicate_id", `${id} also at ${prev.file}:${prev.line}`);
      else idx[entity].set(id, { record: r.record, file: f.rel, line: r.line });
    }
  }
  // Canonical questions, legacy keys and variants share one key space (questions.key).
  for (const [id, t] of idx.templates) {
    if (idx.questions.has(id)) report.error(t.file, t.line, "duplicate_id", `${id} is also a question key`);
  }
  return idx;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
/** Unit / chapter / lesson ids are flat under the subject: <subject>/n<ienId> or <subject>/x<hex8>. */
const flatNodeRe = (subject) => new RegExp(`^${escapeRe(subject)}/(?:n\\d+|x[0-9a-f]{8})$`);

function checkIds(f, r, report) {
  const rec = r.record;
  const at = (code, msg) => report.error(f.rel, r.line, code, msg);
  const expect = (label, actual, build) => {
    let want;
    try {
      want = build();
    } catch (e) {
      at("bad_id", `${label}: ${e instanceof IdError ? e.message : e}`);
      return;
    }
    if (actual !== want) at("bad_id", `${label} ${actual} ≠ ${want}`);
  };
  switch (f.rule.schema) {
    case "curriculum-node":
      if (!isNodeId(rec.id)) at("bad_id", `node id ${rec.id}`);
      if (rec.parent_id && !rec.id.startsWith(`${rec.parent_id}/`) && !["unit", "chapter", "lesson"].includes(rec.kind)) {
        at("bad_id", `${rec.id} must extend its parent ${rec.parent_id}`);
      }
      if (["unit", "chapter", "lesson"].includes(rec.kind) && !(rec.subject && flatNodeRe(rec.subject).test(rec.id))) {
        at("bad_id", `${rec.kind} id ${rec.id} must be <subject node>/n<ienId> or /x<hex8>`);
      }
      if (rec.kind === "term" && !/\/t[12]$/.test(rec.id)) at("bad_id", `term node ${rec.id} must end in /t1 or /t2`);
      break;
    case "question":
      if (!isQuestionKey(rec.id)) at("bad_id", `question key ${rec.id} (≤ 39 chars for q-, ≤ 40 for v-, ^[a-z0-9][a-z0-9-]{1,39}$)`);
      if (f.rule.id === "variants") {
        if (!isVariantId(rec.id) || rec.variant?.kind !== "template") at("bad_id", `${rec.id}: variant files hold template variants (v-… ids)`);
        else expect("variant id", rec.id, () => variantId(rec.variant.template_id, rec.variant.variant_no));
      } else if (isVariantId(rec.id)) at("bad_id", `${rec.id}: template variants belong in question-variants/`);
      break;
    case "term-evidence":
      expect("term evidence id", rec.id, () => termEvidenceId(rec.resource_id, rec.pdf_page, rec.term));
      break;
    case "validation-record":
      expect("validation record id", rec.id, () => validationRecordId(rec.run_id, rec.question_id, rec.role));
      break;
    case "dedup-cluster":
      expect("cluster id", rec.id, () => dedupClusterId(rec.canonical_id));
      break;
    case "page-map":
    case "exercise-index":
    case "toc": {
      const stem = f.rel.split("/").pop().replace(/\.jsonl?$/, "");
      if (rec.resource_id !== stem) at("bad_ref", `resource_id ${rec.resource_id} ≠ file name ${stem}`);
      break;
    }
    case "resource":
      if (!rec.id?.startsWith(`${rec.source_id}-`)) at("bad_id", `resource id ${rec.id} must start with its source id ${rec.source_id}-`);
      break;
    default:
  }
}


function checkRefs(f, r, idx, report) {
  const rec = r.record;
  const bad = (msg) => report.error(f.rel, r.line, "bad_ref", msg);
  const need = (map, id, what) => {
    if (id !== null && id !== undefined && !idx[map].has(id)) bad(`${what} ${id} does not resolve`);
  };
  const node = (id, what, kind) => {
    if (id === null || id === undefined) return null;
    const n = idx.nodes.get(id)?.record;
    if (!n) bad(`${what} ${id} does not resolve`);
    else if (kind && n.kind !== kind) bad(`${what} ${id} is a ${n.kind}, not a ${kind}`);
    return n ?? null;
  };
  const evidenceOf = (ids, resourceId) => {
    for (const id of ids ?? []) {
      const te = idx.termEvidence.get(id)?.record;
      if (!te) bad(`term evidence ${id} does not resolve`);
      else if (resourceId && te.resource_id !== resourceId) bad(`term evidence ${id} belongs to ${te.resource_id}`);
    }
  };
  switch (f.rule.schema) {
    case "curriculum-node":
      if (rec.parent_id === null && rec.kind !== "stage") bad(`${rec.kind} node without parent_id`);
      node(rec.parent_id, "parent_id");
      for (const k of ["stage", "grade", "track", "subject"]) node(rec[k], k);
      evidenceOf(rec.term_evidence);
      for (const p of rec.pages ?? []) {
        need("resources", p.resource_id, "pages.resource_id");
        if (p.pdf_end < p.pdf_start) bad(`page range ${p.pdf_start}–${p.pdf_end} is not ascending`);
      }
      for (const s of rec.source_refs ?? []) need("sources", s.source_id, "source_refs.source_id");
      break;
    case "resource":
      need("sources", rec.source_id, "source_id");
      node(rec.subject_node_id, "subject_node_id", "subject");
      for (const k of ["stage", "grade", "track"]) node(rec[k], k);
      evidenceOf(rec.term_evidence, rec.id);
      break;
    case "term-evidence":
      need("resources", rec.resource_id, "resource_id");
      break;
    case "subject-term":
      node(rec.subject_node_id, "subject_node_id", "subject");
      evidenceOf(rec.evidence);
      break;
    case "page-map":
      need("resources", rec.resource_id, "resource_id");
      node(rec.lesson_node_id, "lesson_node_id", "lesson");
      break;
    case "exercise-index":
      need("resources", rec.resource_id, "resource_id");
      node(rec.lesson_node_id, "lesson_node_id", "lesson");
      break;
    case "toc":
      need("resources", rec.resource_id, "resource_id");
      for (const e of rec.entries ?? []) node(e.matched_node_id, "entries.matched_node_id");
      break;
    case "objective":
      node(rec.lesson_node_id, "lesson_node_id", "lesson");
      need("resources", rec.source?.resource_id, "source.resource_id");
      break;
    case "stimulus":
      need("resources", rec.source?.resource_id, "source.resource_id");
      break;
    case "question":
      checkQuestionRefs(rec, idx, bad, node, need);
      break;
    case "question-template": {
      const lesson = node(rec.lesson_node_id, "lesson_node_id", "lesson");
      const prefix = lesson ? idPrefixMismatch(rec.id, lesson.grade, lesson.subject) : null;
      if (prefix) bad(prefix);
    }
      need("objectives", rec.objective_id, "objective_id");
      need("sources", rec.source?.source_id, "source.source_id");
      need("resources", rec.source?.resource_id, "source.resource_id");
      for (const id of rec.validation?.record_ids ?? []) need("records", id, "validation.record_ids");
      break;
    case "validation-record":
      if (!idx.questions.has(rec.question_id) && !idx.templates.has(rec.question_id)) bad(`question_id ${rec.question_id} does not resolve`);
      break;
    case "dedup-cluster":
      need("questions", rec.canonical_id, "canonical_id");
      for (const m of rec.members ?? []) need("questions", m.id, "members.id");
      break;
    case "owner-decision":
      for (const id of rec.subject_node_ids ?? []) node(id, "subject_node_ids", "subject");
      break;
    case "prep-alignment":
      node(rec.node_id, "node_id");
      break;
    case "review-queue":
    case "review-decision":
      need("questions", rec.question_id, "question_id");
      break;
    case "id-registry":
      if (rec.kind === "x_node" && !rec.id.startsWith(`${rec.scope}/x`)) bad(`x_node ${rec.id} is not under its scope ${rec.scope}`);
      break;
    default:
  }
}

/**
 * §2.2: `q-/t-/v-<grade code>-<subject>-…` must name the record's own grade and
 * subject (curriculum: the lesson's grade and catalog subject id; prep: apt/ach
 * and the section), so an id never files an item under another subject.
 */
function idPrefixMismatch(id, grade, subjectNodeOrSection) {
  const m = /^[qtv]-([a-z0-9]+)-(.+)-[0-9a-f]{10}(?:-\d{2})?$/.exec(id ?? "");
  if (!m || !grade || !subjectNodeOrSection) return null; // legacy keys (aq-001) carry no prefix
  let code;
  try {
    code = gradeCode(grade);
  } catch {
    return `grade ${grade} has no grade code`;
  }
  const subject = String(subjectNodeOrSection).split("/").pop();
  return m[1] === code && m[2] === subject ? null : `${id} must start with ${id[0]}-${code}-${subject}-`;
}

function checkQuestionRefs(rec, idx, bad, node, need) {
  const c = rec.curriculum;
  const prefix = c ? idPrefixMismatch(rec.id, c.grade, c.subject) : rec.prep ? idPrefixMismatch(rec.id, rec.prep.exam, rec.prep.section) : null;
  if (prefix) bad(prefix);
  if (c) {
    const lesson = node(c.lesson, "curriculum.lesson", "lesson");
    for (const k of ["stage", "grade", "track", "subject", "unit", "chapter"]) node(c[k], `curriculum.${k}`);
    if (lesson) {
      if (lesson.subject !== c.subject) bad(`curriculum.subject ${c.subject} ≠ the lesson's subject ${lesson.subject}`);
      if (lesson.term !== c.term || lesson.term_status !== c.term_status) {
        bad(`term ${c.term}/${c.term_status} is not copied from the lesson (${lesson.term}/${lesson.term_status})`);
      }
    }
  }
  for (const l of rec.links ?? []) if (!l.node_id.startsWith("prep:") && !l.node_id.startsWith("weak:")) node(l.node_id, "links.node_id");
  const primary = (rec.links ?? []).filter((l) => l.role === "primary");
  if (c && primary.some((l) => l.node_id !== c.lesson)) bad("the primary link must be curriculum.lesson");
  if (rec.variant?.kind === "template") {
    const t = idx.templates.get(rec.variant.template_id)?.record;
    if (t && (t.lesson_node_id !== c?.lesson || t.difficulty !== rec.difficulty || (t.objective_id ?? null) !== (rec.objective_id ?? null))) {
      bad(`variant must keep the lesson, objective and difficulty of ${t.id}`);
    }
  }
  need("objectives", rec.objective_id, "objective_id");
  need("stimuli", rec.stimulus_id, "stimulus_id");
  need("sources", rec.source?.source_id, "source.source_id");
  need("resources", rec.source?.resource_id, "source.resource_id");
  need("templates", rec.provenance?.template_id, "provenance.template_id");
  for (const id of rec.provenance?.derived_from ?? []) need("questions", id, "provenance.derived_from");
  if (rec.variant?.kind === "template") need("templates", rec.variant.template_id, "variant.template_id");
  if (rec.variant?.kind === "rewrite") need("questions", rec.variant.of, "variant.of");
  need("clusters", rec.dedup?.cluster_id, "dedup.cluster_id");
  need("questions", rec.dedup?.duplicate_of, "dedup.duplicate_of");
  for (const id of rec.validation?.record_ids ?? []) need("records", id, "validation.record_ids");
}

/** Sibling `order` values are contiguous (0…n−1 or 1…n). */
function checkSiblingOrder(idx, report) {
  const byParent = new Map();
  for (const { record, file, line } of idx.nodes.values()) {
    const key = record.parent_id ?? "";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push({ order: record.order, file, line, id: record.id });
  }
  for (const [parent, kids] of byParent) {
    const orders = kids.map((k) => k.order).sort((a, b) => a - b);
    const start = orders[0];
    if (!(start === 0 || start === 1) || orders.some((o, i) => o !== start + i)) {
      const k = kids[0];
      report.error(k.file, k.line, "bad_order", `children of ${parent || "(root)"} have non-contiguous order ${JSON.stringify(orders)}`);
    }
  }
}

// ── copyright rules (§1.3) ──────────────────────────────────────────────────
const EXCERPT_KEYS = new Set(["excerpt", "snippet"]);
const QUESTION_SCHEMAS = new Set(["question", "question-template"]);

function scanValue(value, path, visit) {
  if (Array.isArray(value)) value.forEach((v, i) => scanValue(v, `${path}/${i}`, visit));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      visit(k, v, `${path}/${k}`);
      scanValue(v, `${path}/${k}`, visit);
    }
  }
}

function checkCopyright(f, r, report) {
  const isQuestion = QUESTION_SCHEMAS.has(f.rule.schema);
  const isToc = f.rule.schema === "toc";
  scanValue(r.record, "", (key, value, path) => {
    const at = (code, msg) => report.error(f.rel, r.line, code, `${path}: ${msg}`);
    if (key === "cache_dir") at("absolute_path", "cache_dir is never committed");
    if (typeof value === "string" && isAbsolutePathText(value)) at("absolute_path", `absolute path ${JSON.stringify(value.slice(0, 60))}`);
    if (EXCERPT_KEYS.has(key) && typeof value === "string" && codePoints(value) > EXCERPT_MAX) at("excerpt_too_long", `${codePoints(value)} chars > ${EXCERPT_MAX}`);
    if (key === "headings" && Array.isArray(value)) {
      value.forEach((h, i) => {
        if (typeof h === "string" && codePoints(h) > EXCERPT_MAX) at("excerpt_too_long", `headings/${i}: ${codePoints(h)} chars > ${EXCERPT_MAX}`);
      });
    }
    if (isToc && key === "title" && /^\/entries\/\d+\/title$/.test(path) && typeof value === "string" && codePoints(value) > EXCERPT_MAX) {
      at("excerpt_too_long", `TOC title ${codePoints(value)} chars > ${EXCERPT_MAX}`);
    }
    if (isQuestion && key === "quote") at("quote_in_question", "evidence quote text lives only in the cache sidecar; commit {pdf_page, quote_sha256, char_offsets}");
  });
}

function checkImages(roots, allow, report, repoRoot) {
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const rel of walk(root)) {
      if (!IMAGE_RE.test(rel)) continue;
      const repoRel = toPosix(relative(repoRoot, join(root, rel)));
      if (!isAllowedImage(repoRel, allow)) report.error(repoRel, 0, "stray_image", "image under data/ or src/ outside the image manifest (page renders stay in the cache)");
    }
  }
}

// ── manifest (§3, §6.3) ─────────────────────────────────────────────────────
const MANIFEST_FORMATS = new Set(["jsonl", "json", "json-array"]);

export function computeManifest(files, previous) {
  const data = files.filter((f) => MANIFEST_FORMATS.has(f.rule?.format) && f.rule.id !== "manifest").sort((a, b) => compareC(a.rel, b.rel));
  const entries = data.map((f) => ({ path: f.rel, schema: `${f.rule.schema}@1`, sha256: f.sha256, lines: f.lines, bytes: f.bytes }));
  const published = {};
  const statusOf = new Map();
  for (const f of data) {
    if (f.rule.schema !== "question") continue;
    const keys = [];
    for (const { record } of f.records) {
      statusOf.set(record.id, record.status);
      if (record.status === "published") keys.push(record.id);
    }
    if (keys.length) published[f.rel] = keys.sort(compareC);
  }
  const now = new Set(Object.values(published).flat());
  const removed = new Map();
  for (const item of previous?.removed ?? []) if (!now.has(item.key)) removed.set(item.key, item.reason);
  for (const key of Object.values(previous?.published ?? {}).flat()) {
    if (!now.has(key)) removed.set(key, statusOf.get(key) ?? "deleted");
  }
  return {
    schema: "manifest@1",
    generated_by: "validate-staging@1",
    normalization: "n2",
    files: entries,
    totals: {
      files: entries.length,
      lines: entries.reduce((s, e) => s + e.lines, 0),
      bytes: entries.reduce((s, e) => s + e.bytes, 0),
    },
    published,
    removed: [...removed].sort((a, b) => compareC(a[0], b[0])).map(([key, reason]) => ({ key, reason })),
  };
}

function checkManifest(stored, computed, report) {
  if (!stored) {
    report.error("manifest.json", 0, "manifest_missing", "run with --write-manifest");
    return;
  }
  const byPath = new Map(stored.files.map((e) => [e.path, e]));
  const seen = new Set();
  for (const e of computed.files) {
    const s = byPath.get(e.path);
    seen.add(e.path);
    if (!s) report.error("manifest.json", 0, "stale_manifest", `${e.path} is not listed`);
    else if (s.sha256 !== e.sha256 || s.lines !== e.lines || s.bytes !== e.bytes || s.schema !== e.schema) {
      report.error("manifest.json", 0, "stale_manifest", `${e.path}: listed ${s.sha256.slice(0, 12)}/${s.lines} lines, actual ${e.sha256.slice(0, 12)}/${e.lines} lines`);
    }
  }
  for (const path of byPath.keys()) if (!seen.has(path)) report.error("manifest.json", 0, "stale_manifest", `${path} is listed but missing`);
  if (JSON.stringify(stored.published) !== JSON.stringify(computed.published)) report.error("manifest.json", 0, "stale_manifest", "published key set differs");
  if (JSON.stringify(stored.totals) !== JSON.stringify(computed.totals)) report.error("manifest.json", 0, "stale_manifest", "totals differ");
  const pub = new Set(Object.values(computed.published).flat());
  for (const r of stored.removed ?? []) if (pub.has(r.key)) report.error("manifest.json", 0, "stale_manifest", `removed key ${r.key} is published`);
}

// ── runtime bank (§5.8) ─────────────────────────────────────────────────────
/** Fields that reveal an answer; never in a public content chunk (at any depth). */
const KEY_FIELDS = new Set(["answer", "accepted", "accepted_norm", "answer_display", "explanation", "computation", "content_hash", "tolerance", "is_correct", "correct"]);

function checkRuntimeBank(dir, report, { budget }) {
  if (!dir || !existsSync(dir)) return { bytes: 0 };
  const label = (rel) => `runtime/${rel}`;
  let bytes = 0;
  const loaded = new Map();
  for (const rel of walk(dir)) {
    const abs = join(dir, rel);
    const size = statSync(abs).size;
    bytes += size;
    const rule = runtimeRuleFor(rel);
    if (!rule) {
      report.error(label(rel), 0, "unknown_file", "no schema rule for this runtime-bank file");
      continue;
    }
    const buf = readFileSync(abs);
    let value;
    try {
      value = JSON.parse(buf.toString("utf8"));
    } catch (e) {
      report.error(label(rel), 0, "invalid_json", e.message);
      continue;
    }
    const v = validateRecord(rule.schema, value);
    if (!v.ok) report.error(label(rel), 0, "schema", `${rule.schema}@1: ${v.errors.join("; ")}`);
    if (rule.id === "bank-content" && size > BUDGETS.contentChunk) report.error(label(rel), 0, "oversized_chunk", `${size} bytes > ${BUDGETS.contentChunk}`);
    if (rule.id === "bank-content") {
      // c/ holds public content only, k/ holds the keys (§5.8): the directory and
      // the declared kind must agree, and no key field may hide at any depth.
      const want = rel.startsWith("c/") ? "content" : "keys";
      if (value?.kind !== want) report.error(label(rel), 0, "chunk_kind", `${rel.split("/")[0]}/ chunks must have kind "${want}", found ${JSON.stringify(value?.kind)}`);
      const id = rel.slice(2).replace(/\.json$/, "");
      if (value?.chunk_id !== id) report.error(label(rel), 0, "chunk_kind", `chunk_id ${JSON.stringify(value?.chunk_id)} ≠ file name ${id}`);
    }
    const publicChunk = rule.id === "bank-content" && rel.startsWith("c/");
    scanValue(value, "", (key, val, path) => {
      if (typeof val === "string" && isAbsolutePathText(val)) report.error(label(rel), 0, "absolute_path", path);
      if (publicChunk && KEY_FIELDS.has(key)) report.error(label(rel), 0, "key_in_content", `${path}: answer data never goes into a content chunk`);
    });
    loaded.set(rel, { size, sha: sha256(buf), value });
  }
  const index = loaded.get("index.json")?.value;
  if (loaded.size && !index) report.error(label("index.json"), 0, "missing_index", "the runtime bank needs index.json");
  if (index?.files) {
    const listed = new Set();
    for (const [id, entry] of Object.entries(index.files)) {
      const file = loaded.get(entry.path);
      listed.add(entry.path);
      if (!file) report.error(label("index.json"), 0, "bad_ref", `files.${id}: ${entry.path} does not exist`);
      else if (file.sha !== entry.sha256 || file.size !== entry.bytes) report.error(label("index.json"), 0, "stale_index", `files.${id}: sha256/bytes differ from ${entry.path}`);
    }
    for (const [node, n] of Object.entries(index.nodes ?? {})) {
      if (!index.files[n.sel]) report.error(label("index.json"), 0, "bad_ref", `nodes.${node}.sel ${n.sel} is not in files`);
    }
    for (const rel of loaded.keys()) if (rel !== "index.json" && !listed.has(rel)) report.error(label(rel), 0, "unlisted_file", "not listed in index.json files");
  }
  if (budget && bytes > BUDGETS.runtime) report.error("runtime/", 0, "budget", `runtime bank ${bytes} bytes > ${BUDGETS.runtime}`);
  return { bytes };
}

// ── main ────────────────────────────────────────────────────────────────────
/**
 * Validate a staging tree.
 * @param {object} o
 * @param {string} [o.root]              staging root (default data/staging)
 * @param {string|null} [o.runtimeDir]   runtime bank dir (default data/runtime/bank; null = skip)
 * @param {string} [o.repoRoot]          repo root (image manifest, image scan)
 * @param {string[]} [o.imageRoots]      dirs scanned for stray images (default <repo>/data, <repo>/src; always the root)
 * @param {boolean} [o.budget] [o.changed] [o.writeManifest]
 * @param {string[]|null|"git"} [o.registryBaseline] ids the id registry must still contain
 * @param {number} [o.maxShardBytes]
 * @returns {Promise<{ok, errors, warnings, files, records, manifestWritten}>}
 */
export async function validateStaging(o = {}) {
  const repoRoot = resolve(o.repoRoot ?? REPO_ROOT);
  const root = resolve(o.root ?? join(repoRoot, "data/staging"));
  const runtimeDir = o.runtimeDir === undefined ? join(repoRoot, "data/runtime/bank") : o.runtimeDir;
  const maxShardBytes = o.maxShardBytes ?? BUDGETS.shard;
  const report = new Report();
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new UsageError(`staging root not found: ${root}`);

  let changed = null;
  if (o.changed) {
    changed = gitChangedFiles(root);
    if (!changed) report.warn("", 0, "changed_unavailable", "git status failed; validating every file");
  }
  const files = [];
  let stagingBytes = 0;
  for (const rel of walk(root)) {
    const abs = join(root, rel);
    if (rel.endsWith(".part")) {
      report.warn(rel, 0, "partial_file", "interrupted write (*.part, git-ignored)");
      continue;
    }
    const rule = ruleFor(rel);
    if (rule?.format === "ignored") continue;
    stagingBytes += statSync(abs).size;
    if (!rule) {
      report.error(rel, 0, "unknown_file", "no schema rule for this path (every staging file needs one)");
      continue;
    }
    const file = { rel, abs, rule, check: !changed || changed.has(rel) };
    files.push(file);
    if (rule.format === "text" || rule.format === "report") {
      if (rule.format === "report" && rel.endsWith(".json")) {
        try {
          JSON.parse(readFileSync(abs, "utf8"));
        } catch (e) {
          report.error(rel, 0, "invalid_json", e.message);
        }
      }
      continue;
    }
    const sub = file.check ? report : new Report();
    loadDataFile(file, sub, { maxShardBytes });
  }
  checkShardLayout(files.filter((f) => f.check), report);

  const idx = buildIndexes(files, report);
  let records = 0;
  for (const f of files) {
    if (!f.records) continue;
    records += f.records.length;
    if (!f.check) continue;
    for (const r of f.records) {
      if (!r.record || typeof r.record !== "object") continue;
      checkIds(f, r, report);
      checkRefs(f, r, idx, report);
      checkCopyright(f, r, report);
    }
  }
  if (!changed) checkSiblingOrder(idx, report);

  const imageRoots = [...new Set([root, ...(o.imageRoots ?? [join(repoRoot, "data"), join(repoRoot, "src")])].map((p) => resolve(p)))];
  checkImages(imageRoots, o.imageAllow ?? imageAllowlist(repoRoot), report, repoRoot);

  const baseline = o.registryBaseline === undefined || o.registryBaseline === "git" ? gitBaselineRegistry(root) : o.registryBaseline;
  if (baseline) {
    const missing = baseline.filter((id) => !idx.registry.has(id));
    for (const id of missing) report.error("curriculum/id-registry.jsonl", 0, "registry_id_removed", `${id} disappeared (the registry is append-only)`);
  }

  const manifestFile = files.find((f) => f.rule.id === "manifest");
  const stored = manifestFile?.records?.[0]?.record ?? null;
  const computed = computeManifest(files, stored);
  let manifestWritten = false;
  if (o.writeManifest) manifestWritten = writeJson(join(root, "manifest.json"), computed);
  else checkManifest(stored, computed, report);

  const runtime = checkRuntimeBank(runtimeDir, report, { budget: o.budget });
  if (o.budget) {
    if (stagingBytes > BUDGETS.staging) report.error("", 0, "budget", `data/staging is ${stagingBytes} bytes > ${BUDGETS.staging}`);
    else if (stagingBytes > BUDGETS.stagingWarn) report.warn("", 0, "budget", `data/staging is ${stagingBytes} bytes (warning above ${BUDGETS.stagingWarn})`);
  }
  return {
    ok: report.errors.length === 0,
    errors: report.errors,
    warnings: report.warnings,
    files: files.length,
    records,
    bytes: { staging: stagingBytes, runtime: runtime.bytes },
    manifestWritten,
  };
}

export class UsageError extends Error {}

// ── CLI ─────────────────────────────────────────────────────────────────────
const USAGE = "usage: validate-staging [--budget] [--changed] [--write-manifest] [--root <dir>] [--runtime <dir>|--no-runtime] [--registry-baseline <file>|none] [--json]";

export function parseArgs(argv) {
  const o = {};
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new UsageError(`${a} needs a value`);
      return v;
    };
    if (a === "--budget") o.budget = true;
    else if (a === "--changed") o.changed = true;
    else if (a === "--write-manifest") o.writeManifest = true;
    else if (a === "--json") json = true;
    else if (a === "--root") o.root = resolve(value());
    else if (a === "--runtime") o.runtimeDir = resolve(value());
    else if (a === "--no-runtime") o.runtimeDir = null;
    else if (a === "--registry-baseline") {
      const v = value();
      if (v === "none") o.registryBaseline = null;
      else {
        if (!existsSync(v)) throw new UsageError(`baseline not found: ${v}`);
        o.registryBaseline = inspectJsonlText(readFileSync(v, "utf8")).records.map((r) => r.record.id);
      }
    } else if (a === "--help" || a === "-h") throw new UsageError(USAGE);
    else throw new UsageError(`unknown argument ${a}\n${USAGE}`);
  }
  return { options: o, json };
}

export async function main(argv = process.argv.slice(2), out = console) {
  let parsed;
  try {
    parsed = parseArgs(argv);
    const result = await validateStaging(parsed.options);
    if (parsed.json) out.log(JSON.stringify(result, null, 2));
    else {
      const fmt = (e) => `  ${e.file || "."}${e.line ? `:${e.line}` : ""}  ${e.code}  ${e.message}`;
      for (const w of result.warnings.slice(0, 50)) out.log(`warn ${fmt(w)}`);
      for (const e of result.errors.slice(0, 200)) out.error(`error${fmt(e)}`);
      if (result.errors.length > 200) out.error(`… ${result.errors.length - 200} more errors`);
      out.log(`validate-staging: ${result.files} files, ${result.records} records, ${result.errors.length} errors, ${result.warnings.length} warnings${result.manifestWritten ? ", manifest.json written" : ""}`);
    }
    return result.ok ? 0 : 1;
  } catch (e) {
    if (e instanceof UsageError) {
      out.error(e.message);
      return 2;
    }
    throw e;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then((code) => {
    process.exitCode = code;
  });
}
