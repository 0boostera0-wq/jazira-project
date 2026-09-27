#!/usr/bin/env node
// ============================================================================
// build-variants — materialize template variants as question@1 records
// (docs/CONTENT_ENGINE.md §2.9, §4.6).
//
//   node scripts/content/build-variants.mjs [--root data/staging] [--run <run-id>]
//        [--only <template id>] [--now <ISO time>] [--dry-run] [--json]
//
// Reads question-variants/templates/** and the curriculum nodes, generates
// each active template's variants with src/lib/content/templates.js
// (deterministic: sfc32 seeded from sha256(template_id | revision), every
// variant code-checked, failing tuples skipped and counted) and writes
// question-variants/<subject node>.jsonl. Unchanged variants keep their
// revision, timestamps, run id and dedup fields, so a rerun without template
// changes rewrites nothing. A run manifest goes to validation/runs/<run>.json.
// Exit 0 = ok, 1 = a template failed (the others are still written), 2 = usage.
// ============================================================================

import { existsSync, readdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { readJsonl, sha256, writeJson, writeShards } from "./lib/jsonl.mjs";
import { REPO_ROOT, ruleFor, shardBase, stringifyRecord } from "./lib/schemas.mjs";
import {
  checkTemplate, generateVariants, templateIsActive, variantRecord, TemplateError, DEFAULT_MAX_VARIANTS, MAX_TRIES_PER_VARIANT, VARIANT_CAP,
} from "../../src/lib/content/templates.js";
import { compareC } from "../../src/lib/content/prng.js";
import { isRunId, runId as makeRunId } from "../../src/lib/content/ids.js";

function walk(dir, base = dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort(compareC)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, base, out);
    else out.push(relative(base, p).split(sep).join("/"));
  }
  return out;
}

/** Templates, nodes and existing variants of a staging tree. */
export function loadInputs(root) {
  const templates = [];
  const nodes = new Map();
  const previous = new Map();
  const variantFiles = new Map(); // shard base → [rel]
  const baseOf = new Map(); // variant id → shard base
  const inputs = [];
  for (const rel of walk(root)) {
    const rule = ruleFor(rel);
    if (!rule) continue;
    if (rule.id === "templates") {
      templates.push(...readJsonl(join(root, rel)));
      inputs.push({ path: rel, sha256: sha256(readFileSync(join(root, rel))) });
    } else if (rule.id === "nodes") {
      for (const n of readJsonl(join(root, rel))) nodes.set(n.id, n);
    } else if (rule.id === "variants") {
      const base = shardBase(rel);
      if (!variantFiles.has(base)) variantFiles.set(base, []);
      variantFiles.get(base).push(rel);
      for (const q of readJsonl(join(root, rel))) {
        previous.set(q.id, q);
        baseOf.set(q.id, base);
      }
    }
  }
  templates.sort((a, b) => compareC(a.id, b.id));
  return { templates, nodes, previous, variantFiles, baseOf, inputs };
}

/**
 * The `curriculum` block of a lesson (§2.8): ancestors from the node tree,
 * term and term_status copied from the lesson.
 */
export function curriculumOf(lessonId, nodes) {
  const lesson = nodes.get(lessonId);
  if (!lesson) throw new Error(`lesson ${lessonId} is not in the curriculum nodes`);
  if (lesson.kind !== "lesson") throw new Error(`${lessonId} is a ${lesson.kind}, not a lesson`);
  let unit = null;
  let chapter = null;
  const guard = new Set();
  for (let n = nodes.get(lesson.parent_id); n && !guard.has(n.id); n = nodes.get(n.parent_id)) {
    guard.add(n.id);
    if (n.kind === "unit" && !unit) unit = n.id;
    if (n.kind === "chapter" && !chapter) chapter = n.id;
  }
  return {
    stage: lesson.stage,
    grade: lesson.grade,
    track: lesson.track ?? null,
    term: lesson.term ?? null,
    term_status: lesson.term_status ?? "unknown",
    subject: lesson.subject,
    unit,
    chapter,
    lesson: lesson.id,
  };
}

/** Next free run id `run-<yyyymmdd>-var-NN`. */
export function nextRunId(root, date = new Date()) {
  const ymd = date.toISOString().slice(0, 10).replace(/-/g, "");
  const dir = join(root, "validation", "runs");
  const taken = new Set(existsSync(dir) ? readdirSync(dir) : []);
  for (let n = 1; n <= 99; n++) {
    const id = makeRunId(ymd, "var", n);
    if (!taken.has(`${id}.json`)) return id;
  }
  throw new Error("no free variant run number today");
}

const isoSeconds = (d) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

/**
 * Build the variants of every active template (or only `only`).
 * @returns {{ bySubject: Map<subject, object[]>, report: object[], errors: object[], counts: object }}
 */
export function buildVariants({ templates, nodes, previous, runId, now, only = null }) {
  const bySubject = new Map();
  const report = [];
  const errors = [];
  for (const t of templates) {
    if (only && t.id !== only) continue;
    if (!templateIsActive(t)) {
      report.push({ template_id: t.id, revision: t.revision, status: t.status, produced: 0, skipped: "inactive" });
      continue;
    }
    const problems = checkTemplate(t);
    let curriculum = null;
    try {
      curriculum = curriculumOf(t.lesson_node_id, nodes);
    } catch (e) {
      problems.push({ code: "bad_lesson", detail: e.message });
    }
    if (problems.length) {
      errors.push({ template_id: t.id, problems });
      report.push({ template_id: t.id, revision: t.revision, status: t.status, produced: 0, skipped: "invalid" });
      continue;
    }
    // One template that cannot be sampled (e.g. a parameter whose values are
    // almost all excluded) or materialized is reported; the others still run.
    let variants;
    let stats;
    let records;
    try {
      ({ variants, stats } = generateVariants(t));
      records = variants.map((v) => {
        const rec = variantRecord(t, v, { curriculum, runId, now, previous: null });
        return variantRecord(t, v, { curriculum, runId, now, previous: previous.get(rec.id) ?? null });
      });
    } catch (e) {
      if (!(e instanceof TemplateError)) throw e;
      errors.push({ template_id: t.id, problems: [{ code: e.code, detail: e.message }] });
      report.push({ template_id: t.id, revision: t.revision, status: t.status, produced: 0, skipped: "failed" });
      continue;
    }
    if (!bySubject.has(curriculum.subject)) bySubject.set(curriculum.subject, []);
    bySubject.get(curriculum.subject).push(...records);
    const entry = { template_id: t.id, revision: t.revision, status: t.status, max_variants: Math.min(t.max_variants ?? DEFAULT_MAX_VARIANTS, VARIANT_CAP), ...stats };
    // mcq options are in ascending numeric order (fixed): when the answer sits
    // at the same position in every variant, the position gives it away.
    const positions = records.filter((r) => r.question_type === "mcq").map((r) => r.payload.options.findIndex((o) => o.id === r.payload.answer.option_id));
    if (positions.length >= 3 && new Set(positions).size === 1) entry.warnings = [{ code: "answer_position_constant", detail: `answer is option ${positions[0] + 1} in all ${positions.length} variants` }];
    report.push(entry);
  }
  const counts = {
    templates: templates.length,
    processed: report.length,
    variants: [...bySubject.values()].reduce((n, l) => n + l.length, 0),
    shortfall: report.reduce((n, r) => n + (r.shortfall ?? 0), 0),
    failed_tuples: report.reduce((n, r) => n + Object.values(r.check_failures ?? {}).reduce((a, b) => a + b, 0), 0),
    invalid_templates: errors.length,
    warnings: report.reduce((n, r) => n + (r.warnings?.length ?? 0), 0),
  };
  return { bySubject, report, errors, counts };
}

/**
 * Run over a staging tree and write the variant shards and the run manifest.
 * Without `only`, the variant tree is exactly what the current templates
 * produce (files of subjects without variants are removed). With `only`, the
 * other templates' variants in the touched files are kept as they are.
 */
export function runBuild({ root, runId = null, now = isoSeconds(new Date()), only = null, dryRun = false }) {
  const inp = loadInputs(root);
  const id = runId ?? nextRunId(root, new Date(now));
  if (!isRunId(id) || !/-var-\d{2}$/.test(id)) throw new Error(`bad run id ${id}`);
  if (only && !inp.templates.some((t) => t.id === only)) throw new Error(`template ${only} not found`);
  const res = buildVariants({ ...inp, runId: id, now, only });

  const targets = new Map();
  const put = (base, recs) => {
    if (!ruleFor(`${base}.jsonl`) || ruleFor(`${base}.jsonl`).id !== "variants") throw new Error(`${base}.jsonl is not a variant shard path`);
    if (!targets.has(base)) targets.set(base, []);
    targets.get(base).push(...recs);
  };
  for (const [subject, recs] of res.bySubject) put(`question-variants/${subject}`, recs);
  // A template that failed keeps its previously materialized variants as they
  // are (the run exits 1); an error never silently deletes published items.
  const failed = new Set(res.errors.map((e) => e.template_id));
  for (const [vid, q] of [...inp.previous].sort((a, b) => compareC(a[0], b[0]))) {
    if (failed.has(q.variant?.template_id)) put(inp.baseOf.get(vid), [q]);
  }
  if (only) {
    const touched = new Set(targets.keys());
    for (const [vid, q] of inp.previous) if (q.variant?.template_id === only) touched.add(inp.baseOf.get(vid));
    for (const [vid, q] of inp.previous) {
      const base = inp.baseOf.get(vid);
      if (touched.has(base) && q.variant?.template_id !== only) put(base, [q]);
    }
    for (const base of touched) if (!targets.has(base)) targets.set(base, []);
  } else {
    for (const base of inp.variantFiles.keys()) if (!targets.has(base)) targets.set(base, []);
  }

  const written = [];
  const removed = [];
  for (const [base, recs] of [...targets].sort((a, b) => compareC(a[0], b[0]))) {
    if (!recs.length) {
      for (const rel of inp.variantFiles.get(base) ?? []) {
        if (!dryRun) unlinkSync(join(root, rel));
        removed.push(rel);
      }
      continue;
    }
    const r = writeShards(join(root, base), recs, { serialize: (q) => stringifyRecord("question", q), dryRun });
    for (const f of r.files) if (f.changed) written.push(relative(root, f.path).split(sep).join("/"));
    removed.push(...r.removed.map((p) => relative(root, p).split(sep).join("/")));
  }
  const manifest = {
    schema: "run-manifest@1",
    run_id: id,
    kind: "var",
    generated_at: now,
    params: { seed: "sha256(template_id|revision) → sfc32", max_tries_per_variant: MAX_TRIES_PER_VARIANT, default_max_variants: DEFAULT_MAX_VARIANTS, cap: VARIANT_CAP, only },
    inputs: inp.inputs,
    counts: res.counts,
    templates: res.report,
    errors: res.errors,
  };
  if (!dryRun && writeJson(join(root, "validation", "runs", `${id}.json`), manifest)) written.push(`validation/runs/${id}.json`);
  return { runId: id, counts: res.counts, errors: res.errors, written, removed, manifest };
}

export function parseArgs(argv) {
  const o = { root: join(REPO_ROOT, "data", "staging"), runId: null, only: null, now: null, dryRun: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--root") o.root = resolve(val());
    else if (a === "--run") o.runId = val();
    else if (a === "--only") o.only = val();
    else if (a === "--now") o.now = val();
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--json") o.json = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (o.runId && !/^run-\d{8}-var-\d{2}$/.test(o.runId)) throw new Error("--run must be run-<yyyymmdd>-var-<nn>");
  if (o.now && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(o.now)) throw new Error("--now must be an ISO time like 2026-09-28T08:00:00Z");
  return o;
}

export async function main(argv = process.argv.slice(2), out = console) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    out.error(`build-variants: ${e.message}`);
    out.error("usage: build-variants.mjs [--root <staging>] [--run run-<yyyymmdd>-var-<nn>] [--only <template id>] [--now <ISO>] [--dry-run] [--json]");
    return 2;
  }
  try {
    const r = runBuild({ root: args.root, runId: args.runId, now: args.now ?? isoSeconds(new Date()), only: args.only, dryRun: args.dryRun });
    if (args.json) out.log(JSON.stringify({ run_id: r.runId, counts: r.counts, errors: r.errors, written: r.written, removed: r.removed }, null, 2));
    else {
      out.log(`build-variants ${r.runId}${args.dryRun ? " (dry run)" : ""}: ${r.counts.processed} template(s) → ${r.counts.variants} variant(s)`);
      out.log(`  shortfall ${r.counts.shortfall} · failed tuples ${r.counts.failed_tuples} · invalid templates ${r.counts.invalid_templates}`);
      out.log(`  ${r.written.length} file(s) ${args.dryRun ? "would change" : "written"}${r.removed.length ? `, ${r.removed.length} removed` : ""}`);
      for (const e of r.errors) out.error(`  ${e.template_id}: ${e.problems.map((p) => `${p.code} ${p.detail}`).join("; ")}`);
    }
    return r.errors.length ? 1 : 0;
  } catch (e) {
    out.error(`build-variants: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then((code) => {
    process.exitCode = code;
  });
}
