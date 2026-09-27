#!/usr/bin/env node
// ============================================================================
// Stage 1 deterministic validation (docs/CONTENT_ENGINE.md §4.4, Appendix B).
//
//   node scripts/content/check-questions.mjs --run run-20260928-check-01
//        [--staging data/staging] [--subject middle/grade-1/math | --ids a,b]
//        [--all] [--no-fixes] [--baseline git|none] [--now <iso>]
//
// For every current-revision candidate without a deterministic record for its
// content (or every selected item with --all) it runs all Appendix B checks
// against the staging bank and the content cache (page text / transcripts for
// E001, P004, P005; the evidence sidecar), then:
//   - writes `validation/records/<shard>.jsonl` (`<run>:<id>:deterministic`);
//   - fail            → status `rejected`, validation.status `failed`;
//   - review (P006, V001, not_checked pages) → `review_required` + review-queue row;
//   - pass / warn     → validation.status `structural_pass` (status stays candidate);
//   - O004 fixes (fixed_order_reason, shuffle_options=false) are applied first
//     as a new revision (unless --no-fixes);
//   - updates `validation/runs/<run>.json`.
// Also the shared staging-bank helpers used by the other WP4 scripts.
// Exit: 0 ok (rejections are data), 1 error, 2 usage.
// ============================================================================

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { contentHash, isRunId, validationRecordId } from "../../src/lib/content/ids.js";
import { sha256Hex } from "../../src/lib/content/prng.js";
import { cachePaths, cacheRoot, evidenceShard } from "./lib/cache.mjs";
import { applyO004, bankIndexes, createPageStore, isHighRisk, runChecks } from "./lib/checks.mjs";
import { readJsonl, writeJson, writeJsonl, writeShards } from "./lib/jsonl.mjs";
import { REPO_ROOT, shardBase, stringifyRecord } from "./lib/schemas.mjs";
import { loadCatalog } from "../build-question-seed.mjs";

export const DEFAULT_STAGING = join(REPO_ROOT, "data/staging");
export const isoNow = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const posix = (p) => p.split("\\").join("/");
const cOrder = (a, b) => Buffer.compare(Buffer.from(String(a), "utf8"), Buffer.from(String(b), "utf8"));

// ── shard locations (§3) ────────────────────────────────────────────────────
/** Staging-relative shard base of a question: questions/<grade or track>/<subject> | questions/prep/<exam>-<section>. */
export function questionShardBase(q) {
  if (q.curriculum) {
    const leaf = q.curriculum.track ?? q.curriculum.grade;
    return `questions/${leaf}/${String(q.curriculum.subject).split("/").pop()}`;
  }
  if (q.prep) return `questions/prep/${q.prep.exam}-${q.prep.section}`;
  throw new Error(`${q.id}: neither curriculum nor prep`);
}
export const recordShardBase = (questionBase) => questionBase.replace(/^(?:questions|question-variants)\//, "validation/records/");
export const stimulusShardBase = (questionBase) => questionBase.replace(/^questions\//, "questions/stimuli/");

function walkJsonl(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => cOrder(a.name, b.name))) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkJsonl(p, out);
    else if (e.name.endsWith(".jsonl")) out.push(p);
  }
  return out;
}

function loadInto(map, where, staging, dir, { skip } = {}) {
  for (const file of walkJsonl(join(staging, dir))) {
    const rel = posix(relative(staging, file));
    if (skip && skip(rel)) continue;
    const base = shardBase(rel);
    for (const r of readJsonl(file)) {
      map.set(r.id, r);
      if (where) where.set(r.id, base);
    }
  }
}

/**
 * Load the staging bank. Every map is keyed by record id; `where` maps
 * question / stimulus / record ids to their shard base so writes go back to
 * the same file.
 */
export function loadStaging(staging = DEFAULT_STAGING) {
  const bank = {
    staging: resolve(staging),
    nodes: new Map(), objectives: new Map(), resources: new Map(), stimuli: new Map(), questions: new Map(),
    templates: new Map(), sources: new Map(), records: new Map(),
    where: new Map(), stimulusWhere: new Map(), recordWhere: new Map(),
    pageMaps: new Map(), exercises: new Map(), reviewQueue: [], reviewDecisions: [], prepAlignment: [],
  };
  const s = bank.staging;
  loadInto(bank.nodes, null, s, "curriculum/nodes");
  loadInto(bank.objectives, null, s, "curriculum/objectives");
  for (const f of walkJsonl(join(s, "resources")).filter((f) => /[\\/]resources(?:\.p\d{2})?\.jsonl$/.test(f))) {
    for (const r of readJsonl(f)) bank.resources.set(r.id, r);
  }
  loadInto(bank.stimuli, bank.stimulusWhere, s, "questions/stimuli");
  loadInto(bank.questions, bank.where, s, "questions", { skip: (rel) => rel.startsWith("questions/stimuli/") });
  loadInto(bank.questions, bank.where, s, "question-variants", { skip: (rel) => rel.startsWith("question-variants/templates/") });
  loadInto(bank.templates, null, s, "question-variants/templates");
  loadInto(bank.records, bank.recordWhere, s, "validation/records");
  const registry = join(s, "sources/registry.json");
  if (existsSync(registry)) for (const src of JSON.parse(readFileSync(registry, "utf8"))) bank.sources.set(src.id, src);
  for (const f of walkJsonl(join(s, "resources/page-maps"))) {
    for (const r of readJsonl(f)) {
      if (!bank.pageMaps.has(r.resource_id)) bank.pageMaps.set(r.resource_id, new Map());
      bank.pageMaps.get(r.resource_id).set(r.pdf_page, r);
    }
  }
  for (const f of walkJsonl(join(s, "resources/exercise-index"))) {
    for (const r of readJsonl(f)) {
      if (!bank.exercises.has(r.resource_id)) bank.exercises.set(r.resource_id, []);
      bank.exercises.get(r.resource_id).push(r);
    }
  }
  const opt = (rel) => (existsSync(join(s, rel)) ? readJsonl(join(s, rel)) : []);
  bank.reviewQueue = opt("validation/review-queue.jsonl");
  bank.reviewDecisions = opt("validation/review-decisions.jsonl");
  bank.prepAlignment = opt("curriculum/prep-alignment.jsonl");
  return bank;
}

function groupBy(map, where) {
  const groups = new Map();
  for (const [id, rec] of map) {
    const base = where.get(id);
    if (!base) throw new Error(`no shard for ${id}`);
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(rec);
  }
  return groups;
}

/** Write the shards named in `bases` (default: every shard) in schema key order. */
function saveGroups(bank, map, where, schema, bases) {
  const groups = groupBy(map, where);
  const written = [];
  for (const [base, recs] of groups) {
    if (bases && !bases.has(base)) continue;
    const r = writeShards(join(bank.staging, base), recs, { serialize: (x) => stringifyRecord(schema, x) });
    written.push(...r.files.filter((f) => f.changed).map((f) => f.path));
  }
  return written;
}
export const saveQuestions = (bank, bases) => saveGroups(bank, bank.questions, bank.where, "question", bases);
export const saveStimuli = (bank, bases) => saveGroups(bank, bank.stimuli, bank.stimulusWhere, "stimulus", bases);
export const saveRecords = (bank, bases) => saveGroups(bank, bank.records, bank.recordWhere, "validation-record", bases);

const byQuestionRevision = (a, b) => cOrder(a.question_id, b.question_id) || a.revision - b.revision;
export function saveReviewQueue(bank) {
  const rows = [...new Map(bank.reviewQueue.map((r) => [`${r.question_id}#${r.revision}`, r])).values()];
  return writeJsonl(join(bank.staging, "validation/review-queue.jsonl"), rows, { compare: byQuestionRevision, serialize: (r) => stringifyRecord("review-queue", r) });
}

/** Queue a question revision for human review (one row per question revision). */
export function enqueueReview(bank, q, reason, recordIds, now) {
  bank.reviewQueue = bank.reviewQueue.filter((r) => !(r.question_id === q.id && r.revision === q.revision));
  bank.reviewQueue.push({ schema: "review-queue@1", question_id: q.id, revision: q.revision, reason: reason.slice(0, 200), record_ids: [...recordIds], queued_at: now });
}

// question id → record ids, per records Map (a record id embeds its question
// id, so replacing a record under the same id never moves it). Kept in step
// by attachRecord; rebuilt when the Map changed size behind its back. This
// keeps the per-question lookups linear over a bank instead of quadratic.
const RECORD_INDEX = new WeakMap();
function recordIndex(records) {
  let idx = RECORD_INDEX.get(records);
  if (!idx || idx.size !== records.size) {
    const byQuestion = new Map();
    for (const [id, r] of records) {
      if (!byQuestion.has(r.question_id)) byQuestion.set(r.question_id, new Set());
      byQuestion.get(r.question_id).add(id);
    }
    idx = { size: records.size, byQuestion };
    RECORD_INDEX.set(records, idx);
  }
  return idx;
}

/** Records of one question revision (matching content hash). */
export function recordsFor(bank, q) {
  const ids = recordIndex(bank.records).byQuestion.get(q.id);
  if (!ids) return [];
  const out = [];
  for (const id of ids) {
    const r = bank.records.get(id);
    if (r && r.question_id === q.id && r.revision === q.revision && r.content_hash === q.content_hash) out.push(r);
  }
  return out;
}

/**
 * The latest record of one role for a question revision (by checked_at, then
 * id), or null: a re-check (--all) adds a newer deterministic record next to
 * the earlier one, and only the newest describes the item.
 */
export function latestRecord(bank, q, role) {
  const list = recordsFor(bank, q).filter((r) => r.role === role);
  return list.sort((a, b) => cOrder(a.checked_at, b.checked_at) || cOrder(a.id, b.id)).at(-1) ?? null;
}

/** Add a validation record and link it from the question (current revision only). */
export function attachRecord(bank, q, record) {
  const base = bank.where.get(q.id);
  const idx = recordIndex(bank.records);
  const isNew = !bank.records.has(record.id);
  bank.records.set(record.id, record);
  if (!idx.byQuestion.has(record.question_id)) idx.byQuestion.set(record.question_id, new Set());
  idx.byQuestion.get(record.question_id).add(record.id);
  if (isNew) idx.size++;
  bank.recordWhere.set(record.id, recordShardBase(base));
  const current = new Set(recordsFor(bank, q).map((r) => r.id));
  q.validation.record_ids = [...new Set([...q.validation.record_ids.filter((id) => current.has(id)), record.id])].slice(-50);
}

/** Merge a patch into `validation/runs/<run>.json` (created when missing). */
export function updateRunManifest(staging, runId, patch) {
  const path = join(staging, "validation/runs", `${runId}.json`);
  const current = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { schema: "run-manifest@1", run_id: runId };
  const merge = (a, b) => {
    for (const [k, v] of Object.entries(b)) {
      if (v && typeof v === "object" && !Array.isArray(v) && a[k] && typeof a[k] === "object" && !Array.isArray(a[k])) merge(a[k], v);
      else a[k] = v;
    }
    return a;
  };
  const next = merge(current, patch);
  writeJson(path, next);
  return next;
}

// ── evidence sidecar (cache: evidence/<shard>.jsonl) ───────────────────────
/**
 * The evidence quote sidecar (§2.8): quotes live only in the cache, keyed by
 * question id and revision. Rows: { question_id, revision, pdf_page, quote_sha256, quote_kind, quote }.
 */
export function evidenceStore(root = cacheRoot()) {
  const paths = cachePaths(root);
  const shards = new Map();
  const dirty = new Set();
  const load = (shard) => {
    if (shards.has(shard)) return shards.get(shard);
    const file = paths.evidence(shard);
    const rows = existsSync(file) ? readJsonl(file) : [];
    shards.set(shard, rows);
    return rows;
  };
  return {
    get(questionId, revision) {
      return load(evidenceShard(questionId)).filter((r) => r.question_id === questionId && (revision === undefined || r.revision === revision));
    },
    put(questionId, revision, rows) {
      const shard = evidenceShard(questionId);
      const kept = load(shard).filter((r) => !(r.question_id === questionId && r.revision === revision));
      shards.set(shard, [...kept, ...rows.map((r) => ({ question_id: questionId, revision, pdf_page: r.pdf_page, quote_sha256: r.quote_sha256, quote_kind: r.quote_kind, quote: r.quote }))]);
      dirty.add(shard);
    },
    save() {
      for (const shard of dirty) {
        const rows = shards.get(shard).sort((a, b) => cOrder(a.question_id, b.question_id) || a.revision - b.revision || a.pdf_page - b.pdf_page || cOrder(a.quote_sha256, b.quote_sha256));
        writeJsonl(paths.evidence(shard), rows);
      }
      dirty.clear();
    },
  };
}

/**
 * Evidence sidecar rows for a question's current revision. A revision made
 * without new generator output (O004 fix, human set_key) keeps the committed
 * `source.evidence`; its quotes are then found under an earlier revision with
 * the same page and quote_sha256 (the hash proves it is the same quote).
 */
export function evidenceRows(store, q) {
  if (!store || !q) return [];
  const own = store.get(q.id, q.revision);
  const same = (r, e) => r.pdf_page === e.pdf_page && r.quote_sha256 === e.quote_sha256;
  const missing = (q.source?.evidence ?? []).filter((e) => !own.some((r) => same(r, e)));
  if (!missing.length) return own;
  const older = store.get(q.id).filter((r) => r.revision < q.revision).sort((a, b) => b.revision - a.revision);
  const carried = [];
  for (const e of missing) {
    const r = older.find((x) => same(x, e));
    if (r && !carried.some((c) => same(c, e))) carried.push({ ...r, revision: q.revision });
  }
  return [...own, ...carried];
}

/** Question records of the last commit (git HEAD), for S002's frozen-id rule. Empty when git is unavailable. */
export function loadBaseline(staging) {
  const out = new Map();
  const top = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: staging, encoding: "utf8" });
  if (top.status !== 0) return out;
  const root = top.stdout.trim();
  const rel = posix(relative(root, staging));
  const ls = spawnSync("git", ["ls-tree", "-r", "--name-only", "HEAD", "--", `${rel}/questions`, `${rel}/question-variants`], { cwd: root, encoding: "utf8" });
  if (ls.status !== 0) return out;
  for (const file of ls.stdout.split("\n").filter((f) => f.endsWith(".jsonl") && !f.includes("/stimuli/") && !f.includes("/templates/"))) {
    const show = spawnSync("git", ["show", `HEAD:${file}`], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (show.status !== 0) continue;
    for (const line of show.stdout.split("\n")) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        out.set(r.id, r);
      } catch {
        /* a broken committed line is validate-staging's problem */
      }
    }
  }
  return out;
}

/** The check context for a bank (see lib/checks.mjs). */
export function checkContext(bank, { catalog, pages, evidence, previous = new Map(), candidate = null } = {}) {
  const { idCounts, byContentHash } = bankIndexes([...bank.questions.values()]);
  const previousByHash = new Map();
  for (const [id, r] of previous) {
    if (r.status === "rejected" || r.status === "retired") continue;
    if (!previousByHash.has(r.content_hash)) previousByHash.set(r.content_hash, []);
    previousByHash.get(r.content_hash).push(id);
  }
  return {
    nodes: bank.nodes, resources: bank.resources, stimuli: bank.stimuli, objectives: bank.objectives,
    questions: bank.questions, templates: bank.templates, sources: bank.sources, catalog, pages,
    evidence: evidence ? (id, rev) => {
      const q = bank.questions.get(id);
      return q && q.revision === rev ? evidenceRows(evidence, q) : evidence.get(id, rev);
    } : null,
    previous, previousByHash, candidate, idCounts, byContentHash,
  };
}

/** Recompute content_hash after an edit (stimulus text included). */
export function rehash(bank, q) {
  q.content_hash = contentHash(q, { stimulusText: bank.stimuli.get(q.stimulus_id)?.text ?? null });
  return q.content_hash;
}

// ── Stage 1 over a bank ─────────────────────────────────────────────────────
/** A `validation-record@1` for a check result. */
export function deterministicRecord(q, result, { runId, checkedAt }) {
  return {
    schema: "validation-record@1",
    id: validationRecordId(runId, q.id, "deterministic"),
    question_id: q.id, revision: q.revision, content_hash: q.content_hash,
    role: "deterministic", agent: "script", run_id: runId, prompt_version: null, checked_at: checkedAt,
    verdict: result.verdict, checks: result.checks,
    blind_answer: null, support: null, ambiguity: null, difficulty_estimate: null, issues: [],
    notes: result.outcome === "review" ? `review_required: ${result.review.join(", ")}`
      : result.outcome === "reject" ? `rejected: ${result.failed.join(", ")}` : null,
  };
}

/** New revision after an edit: revision+1, updated_at, hash, validation reset. */
export function bumpRevision(bank, q, now) {
  q.revision += 1;
  q.updated_at = now;
  q.status = "candidate";
  q.validation = { status: "pending", record_ids: [], checked_revision: null };
  rehash(bank, q);
}

/**
 * Run Stage 1 on selected questions of a loaded bank (mutates the bank; the
 * caller saves). Returns per-item outcomes and counts.
 */
export function checkBank(bank, { runId, now = isoNow(), ids = null, subject = null, all = false, fixes = true, catalog, pages = null, evidence = null, previous = new Map() }) {
  if (!isRunId(runId) || !runId.includes("-check-")) throw new Error(`--run must be a check run id (run-<yyyymmdd>-check-<nn>), got ${runId}`);
  const wanted = (q) => {
    if (ids && !ids.includes(q.id)) return false;
    if (subject && q.curriculum?.subject !== subject && `prep:${q.prep?.exam}/${q.prep?.section}` !== subject) return false;
    if (!ids && q.status !== "candidate") return false;
    if (!all && recordsFor(bank, q).some((r) => r.role === "deterministic")) return false;
    return true;
  };
  const targets = [...bank.questions.values()].filter(wanted).sort((a, b) => cOrder(a.id, b.id));
  const outcomes = [];
  const counts = { checked: 0, pass: 0, warn: 0, rejected: 0, review_required: 0, fixed: 0, high_risk: 0 };
  const failures = {};
  // One context for the whole run (indexes over the bank are built once and
  // kept in step when an O004 fix changes a content hash).
  const ctx = checkContext(bank, { catalog, pages, evidence, previous });
  for (const q of targets) {
    const oldHash = q.content_hash;
    if (fixes && applyO004(q).changed) {
      bumpRevision(bank, q, now);
      counts.fixed++;
      const ids = (ctx.byContentHash.get(oldHash) ?? []).filter((id, i, all) => id !== q.id || all.indexOf(q.id) !== i);
      if (ids.length) ctx.byContentHash.set(oldHash, ids);
      else ctx.byContentHash.delete(oldHash);
      ctx.byContentHash.set(q.content_hash, [...(ctx.byContentHash.get(q.content_hash) ?? []), q.id]);
    }
    const result = runChecks(q, ctx);
    const record = deterministicRecord(q, result, { runId, checkedAt: now });
    attachRecord(bank, q, record);
    q.validation.checked_revision = q.revision;
    counts.checked++;
    for (const c of result.checks) if (c.result === "fail") failures[c.code] = (failures[c.code] ?? 0) + 1;
    if (isHighRisk(q, result.checks)) counts.high_risk++;
    if (result.outcome === "reject") {
      q.status = "rejected";
      q.validation.status = "failed";
      counts.rejected++;
    } else if (result.outcome === "review") {
      q.status = "review_required";
      q.validation.status = "review_required";
      enqueueReview(bank, q, `deterministic: ${result.review.join(", ")}`, [record.id], now);
      counts.review_required++;
    } else {
      // A re-check (--all) that now passes lifts an earlier deterministic
      // rejection or review; resolve-validation re-applies everything else.
      if (q.status === "rejected" || q.status === "review_required") {
        q.status = "candidate";
        bank.reviewQueue = bank.reviewQueue.filter((r) => !(r.question_id === q.id && r.revision === q.revision && /^deterministic:/.test(r.reason)));
      }
      q.validation.status = "structural_pass";
      counts[result.verdict === "warn" ? "warn" : "pass"]++;
    }
    outcomes.push({ id: q.id, revision: q.revision, outcome: result.outcome, verdict: result.verdict, failed: result.failed, review: result.review });
  }
  return { outcomes, counts, failures };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
export class UsageError extends Error {}

export function parseArgs(argv) {
  const o = { staging: DEFAULT_STAGING, run: null, ids: null, subject: null, all: false, fixes: true, baseline: "git", now: null, cache: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new UsageError(`${a} needs a value`);
      return v;
    };
    if (a === "--run") o.run = next();
    else if (a === "--staging") o.staging = resolve(next());
    else if (a === "--ids") o.ids = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--subject") o.subject = next();
    else if (a === "--all") o.all = true;
    else if (a === "--no-fixes") o.fixes = false;
    else if (a === "--baseline") o.baseline = next();
    else if (a === "--now") o.now = next();
    else if (a === "--cache") o.cache = resolve(next());
    else if (a === "--help" || a === "-h") o.help = true;
    else throw new UsageError(`unknown option ${a}`);
  }
  if (!o.help && !o.run) throw new UsageError("--run <run-yyyymmdd-check-nn> is required");
  if (!["git", "none"].includes(o.baseline)) throw new UsageError("--baseline git|none");
  return o;
}

export async function main(argv = process.argv.slice(2), log = console) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    log.error(`error: ${e.message}`);
    return 2;
  }
  if (o.help) {
    log.log("usage: node scripts/content/check-questions.mjs --run <run id> [--staging dir] [--subject node | --ids a,b] [--all] [--no-fixes] [--baseline git|none] [--now iso] [--cache dir]");
    return 0;
  }
  try {
    const now = o.now ?? isoNow();
    const bank = loadStaging(o.staging);
    const root = o.cache ?? cacheRoot();
    const catalog = await loadCatalog();
    const pages = createPageStore({ root, resources: bank.resources });
    const evidence = evidenceStore(root);
    const previous = o.baseline === "git" ? loadBaseline(bank.staging) : new Map();
    const inputHash = sha256Hex([...bank.questions.keys()].sort(cOrder).join("\n"));
    const { outcomes, counts, failures } = checkBank(bank, { runId: o.run, now, ids: o.ids, subject: o.subject, all: o.all, fixes: o.fixes, catalog, pages, evidence, previous });
    saveQuestions(bank);
    saveRecords(bank);
    saveReviewQueue(bank);
    // One run may be invoked per scope (subject, ids, all): each scope keeps
    // its own counts and `counts` is their sum, so a later invocation never
    // hides an earlier one; a rerun that checked nothing leaves a scope's
    // earlier counts as they are.
    const scope = o.subject ?? (o.ids ? `ids:${sha256Hex([...o.ids].sort(cOrder).join(",")).slice(0, 12)}` : o.all ? "all" : "pending");
    const manifestPath = join(bank.staging, "validation/runs", `${o.run}.json`);
    const known = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")).scopes?.[scope] : null;
    if (counts.checked > 0 || !known) {
      const next = updateRunManifest(bank.staging, o.run, {
        kind: "check", tool: "check-questions@1", checked_at: now,
        inputs: { question_ids_sha256: inputHash, cache: "content-cache" },
        scopes: { [scope]: { checked_at: now, counts, failures } },
      });
      const sum = (key) => {
        const t = {};
        for (const s of Object.values(next.scopes ?? {})) for (const [k, v] of Object.entries(s[key] ?? {})) t[k] = (t[k] ?? 0) + v;
        return t;
      };
      updateRunManifest(bank.staging, o.run, { counts: sum("counts"), failures: sum("failures") });
    }
    log.log(`checked ${counts.checked}: pass ${counts.pass}, warn ${counts.warn}, rejected ${counts.rejected}, review_required ${counts.review_required}, O004 fixes ${counts.fixed}, high-risk ${counts.high_risk}`);
    for (const r of outcomes.filter((x) => x.outcome !== "pass")) log.log(`  ${r.id} r${r.revision}: ${r.outcome} (${[...r.failed, ...r.review].join(", ")})`);
    return 0;
  } catch (e) {
    log.error(`error: ${e.message}`);
    return 1;
  }
}

const invokedDirectly = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) main().then((code) => { process.exitCode = code; });
