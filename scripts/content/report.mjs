#!/usr/bin/env node
// ============================================================================
// Reports (docs/CONTENT_ENGINE.md §8, §5.6, §9.3; WP10). Generated from the
// staging files only; deterministic; every report records the manifest sha
// and its generation time and states its counting rules at the top.
//
//   node scripts/content/report.mjs [--staging data/staging] [--out <staging>/reports]
//        [--exams] [--write-manifest] [--bank data/runtime/bank] [--now <iso>]
//        [--only coverage,quality,…] [--json]
//
// Writes <out>/{coverage.json, coverage.md, quality.html, validation.md,
// duplicates.md, exam-templates.md, question-stats.json, resources.md,
// question-bank.md, verification.md}. --exams also writes the §5.6
// blueprints to <staging>/exams/blueprints/<stage>.jsonl (staging data: the
// manifest must be refreshed afterwards — --write-manifest runs
// validate-staging --write-manifest for you).
// A rerun over unchanged inputs changes no file: when a report's content is
// identical apart from its generation time, the file (and its time) is kept.
// Exit 0 = ok, 1 = error, 2 = usage.
// ============================================================================
import { existsSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { writeFileIfChanged, writeJsonl } from "./lib/jsonl.mjs";
import { REPO_ROOT, stringifyRecord } from "./lib/schemas.mjs";
import { renderQualityHtml } from "./lib/report-html.mjs";
import { GAP_LIST_MD_MAX, REPORT_FILES, buildBlueprints, buildReportModel, loadReportData, manifestStatus } from "./lib/report-model.mjs";
import { compareC } from "../../src/lib/content/prng.js";

export const DEFAULT_STAGING = join(REPO_ROOT, "data/staging");
export const DEFAULT_BANK = join(REPO_ROOT, "data/runtime/bank");
const isoNow = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

// ── markdown helpers ────────────────────────────────────────────────────────
export const mdCell = (v) => (v === null || v === undefined || v === "" ? "—" : String(v).replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " "));
export function mdTable(headers, rows) {
  if (!rows.length) return "_none_\n";
  const line = (cells) => `| ${cells.map(mdCell).join(" | ")} |`;
  return [line(headers), `|${headers.map(() => "---").join("|")}|`, ...rows.map(line)].join("\n") + "\n";
}
const kv = (o) => (o && Object.keys(o).length ? Object.entries(o).map(([k, v]) => `${k} ${v}`).join(", ") : "—");
const code = (s) => (s === null || s === undefined ? "—" : `\`${s}\``);
function idList(ids, max = GAP_LIST_MD_MAX) {
  if (!ids.length) return "_none_\n";
  const shown = ids.slice(0, max).map((id) => `- ${code(id)}`);
  if (ids.length > max) shown.push(`- … and ${ids.length - max} more (full list in coverage.json)`);
  return shown.join("\n") + "\n";
}

/** The shared header: title, generation time, manifest, counting rules. */
export function mdHeader(title, meta, extra = []) {
  return [
    `# ${title}`,
    "",
    `Generated: ${meta.generated_at}`,
    `Manifest: ${code(meta.manifest_sha256)} (${meta.manifest_status}${meta.manifest_status === "stale" ? `: ${meta.manifest_stale_paths.length} file(s) changed since the manifest was written; run \`npm run content:validate -- --write-manifest\`` : ""})`,
    ...extra,
    "",
    "Counting rules:",
    "",
    ...meta.counting_rules.map((r, i) => `${i + 1}. ${r}`),
    "",
  ].join("\n");
}

// ── coverage.md ─────────────────────────────────────────────────────────────
const FIG_HEAD = ["Units", "Lessons (verified / needs review)", "PDFs (available / unavailable / needs review)", "Pages processed (text / vision; front-matter only)", "Published (of which variants)", "Lessons with exercises", "Templates offered (scopes)"];
function figCells(f) {
  return [
    f.units,
    `${f.lessons.total} (${f.lessons.verified} / ${f.lessons.needs_review})`,
    `${f.pdfs.total} (${f.pdfs.available} / ${f.pdfs.unavailable} / ${f.pdfs.needs_review})`,
    `${f.pages_processed.total} (${f.pages_processed.text} / ${f.pages_processed.vision}; ${f.pages_processed.front_matter_only})`,
    `${f.questions.published} (${f.questions.variants})`,
    `${f.exercises.lessons_with} of ${f.lessons.total}`,
    kv(f.templates_offered),
  ];
}

export function renderCoverageMd(model) {
  const c = model.coverage;
  const u = c.term_undeterminable;
  const out = [mdHeader("Coverage", model.meta)];
  out.push("## Term undeterminable\n");
  out.push("Most textbook covers do not name a term (docs/CONTENT_ENGINE.md §0, §2.4); this bucket is the expected state until evidence or an owner decision exists.\n");
  out.push(`- Subjects with no verified or inferred term membership: **${u.subjects.count}**`);
  out.push(`- Subjects with one term determined and the other not: **${u.subjects_partial.count}**`);
  out.push(`- Resources with \`term_status: needs_review\`: **${u.resources.count}**\n`);
  out.push("Evidence routes tried for those resources (a route counts as tried when its input exists: front matter, a TOC, a vision read, the listing title, an owner decision; routes that record hits only are counted from their evidence rows):\n");
  out.push(mdTable(["Route", "Resources tried", "Evidence rows found"], Object.keys(u.resources.routes_tried).map((k) => [k, u.resources.routes_tried[k], u.resources.evidence_found[k]])));
  out.push("Subjects:\n");
  out.push(idList(u.subjects.ids));
  const fmFailed = c.frontmatter.failed ? ` ${c.frontmatter.failed} further row(s) record a failed read (\`error\`) and are not counted.` : "";
  out.push(`## Front-matter coverage\n\n**${c.frontmatter.done}/${c.frontmatter.total ?? "?"}** books have a front-matter row with pages read (\`sources/ien/book-frontmatter.jsonl\`).${fmFailed}\n`);
  out.push("## Totals (curriculum questions and nodes)\n");
  out.push(mdTable(FIG_HEAD, [figCells(c.totals)]));
  if (c.unmapped_resources.length) out.push(`Resources without a subject node: ${c.unmapped_resources.length}.\n`);
  let stage = null;
  for (const leaf of c.leaves) {
    if (leaf.stage !== stage) {
      stage = leaf.stage;
      out.push(`## Stage ${code(stage)}\n`);
    }
    out.push(`### ${leaf.title_ar}${leaf.title_en ? ` / ${leaf.title_en}` : ""} (${code(leaf.id)})\n`);
    out.push(mdTable(["Scope", ...FIG_HEAD], [["whole leaf", ...figCells(leaf.totals)]]));
    const titleOf = new Map(leaf.subjects.map((s) => [s.id, s]));
    for (const term of ["t1", "t2"]) {
      out.push(`#### Term ${term === "t1" ? "1" : "2"}\n`);
      out.push(mdTable(["Subject", "Membership", ...FIG_HEAD], leaf.terms[term].map((r) => [`${titleOf.get(r.id)?.title_ar ?? ""} ${code(r.id)}`, r.membership, ...figCells(r.figures)])));
    }
    out.push("#### Term undeterminable\n");
    out.push(mdTable(["Subject", "Status", ...FIG_HEAD], leaf.terms.undeterminable.map((id) => {
      const s = titleOf.get(id);
      return [`${s.title_ar} ${code(id)}`, s.status, ...figCells(s.figures)];
    })));
  }
  out.push(renderGapsMd(c));
  return out.join("\n");
}

function renderGapsMd(c) {
  const g = c.gaps;
  const out = ["## Gaps\n"];
  out.push(`### Subjects without books (${g.subjects_without_books.length})\n`, idList(g.subjects_without_books));
  out.push(`### Lessons without pages (${g.lessons_without_pages.length})\n`, idList(g.lessons_without_pages));
  out.push(`### Lessons without exercises (${g.lessons_without_exercises.length})\n`, idList(g.lessons_without_exercises));
  const below = g.lessons_below_lesson_quiz_min;
  out.push(`### Lessons with fewer than the lesson-quiz minimum (${below.lessons.length}; ${below.template} needs ${below.required} exclusion components)\n`);
  out.push(idList(below.lessons.map((l) => `${l.id} (${l.components})`)));
  out.push(`### Pages awaiting vision (${g.pages_awaiting_vision.length})\n`, idList(g.pages_awaiting_vision.map((p) => `${p.resource_id} p${p.pdf_page}`)));
  out.push(`### Source-only subjects (${g.source_only_subjects.length})\n`, idList(g.source_only_subjects));
  out.push("## Practice material per lesson (exercise index)\n");
  const lessons = Object.entries(c.exercises_by_lesson);
  out.push(mdTable(["Lesson", "Examples", "Exercises", "Review", "Answer key"], lessons.slice(0, GAP_LIST_MD_MAX).map(([id, o]) => [code(id), o.example, o.exercise, o.review, o.answer_key])));
  if (lessons.length > GAP_LIST_MD_MAX) out.push(`… and ${lessons.length - GAP_LIST_MD_MAX} more lessons (coverage.json).\n`);
  out.push("## Latest crawl changes\n");
  out.push(c.changes ? `${code(c.changes.file)}: ${c.changes.rows} rows — ${kv(c.changes.by)}\n` : "_no changes file_\n");
  return out.join("\n");
}

// ── validation.md ───────────────────────────────────────────────────────────
function recordSummaryMd(s) {
  const out = [];
  out.push(mdTable(["Role", "Agent", "Items checked", "Records"], s.by_role_agent.map((r) => [r.role, r.agent, r.items, r.records])));
  out.push(mdTable(["Role", "Verdicts"], Object.entries(s.verdicts).map(([role, v]) => [role, kv(v)])));
  out.push(`Top failing check codes: ${s.top_fail_codes.length ? s.top_fail_codes.map((c) => `${c.code} ${c.count}`).join(", ") : "none"}.  `);
  out.push(`Top warning codes: ${s.top_warn_codes.length ? s.top_warn_codes.map((c) => `${c.code} ${c.count}`).join(", ") : "none"}.  `);
  out.push(`Disagreements (verdict \`disagree\`) by role: ${kv(s.disagreements)}.\n`);
  return out.join("\n");
}

export function renderValidationMd(model) {
  const v = model.validation;
  const out = [mdHeader("Validation", model.meta)];
  out.push(`## Cumulative (${v.cumulative.records} records)\n`);
  out.push(recordSummaryMd(v.cumulative));
  out.push("## Per run\n");
  if (!v.runs.length) out.push("_no validation records_\n");
  for (const r of v.runs) {
    out.push(`### ${code(r.run_id)} (${r.kind ?? "?"}, ${r.records} records)\n`);
    out.push(recordSummaryMd(r));
  }
  out.push("## Sample sizes versus the sampling policy\n");
  out.push("Policy counts use the run's seeded sampling plan (§4.4): `required` = high-risk, aptitude and legacy items (ChatGPT) or items with an L* warning and every `en` item (Gemini); `sampled` = the seeded sample. `present` = items with a record of that role in the run.\n");
  out.push(mdTable(["Run", "Pilot", "Rates", "ChatGPT required", "ChatGPT sampled", "ChatGPT present", "Gemini required", "Gemini sampled", "Gemini present"], v.sampling.map((s) => [
    code(s.run_id), s.pilot ? "yes" : "no", kv(s.rates), s.chatgpt.policy.required, s.chatgpt.policy.sampled, s.chatgpt.present, s.gemini.policy.required, s.gemini.policy.sampled, s.gemini.present,
  ])));
  out.push("## Agents unavailable\n");
  out.push(mdTable(["Agent", "Runs"], v.agents_unavailable.map((a) => [a.agent, a.runs.join(", ")])));
  const q = v.review_queue;
  out.push("## Review queue\n");
  out.push(`- Size: **${q.size}** (by reason: ${kv(q.by_reason)})`);
  out.push(`- Oldest queued: ${q.oldest_queued_at ?? "—"}; newest: ${q.newest_queued_at ?? "—"}`);
  out.push(`- Age at generation time (days): max ${q.max_age_days ?? "—"}, median ${q.median_age_days ?? "—"}`);
  out.push(`- Human decisions recorded: ${kv(q.decisions)}\n`);
  out.push("## Legacy items (the 300)\n");
  out.push(`${v.legacy.items} legacy items. By validation outcome: ${kv(v.legacy.by_validation_status)}. By status: ${kv(v.legacy.by_status)}.\n`);
  return out.join("\n");
}

// ── duplicates.md ───────────────────────────────────────────────────────────
export function renderDuplicatesMd(model) {
  const d = model.duplicates;
  const out = [mdHeader("Duplicates", model.meta)];
  out.push("## Clusters by class\n");
  out.push(`${d.clusters} clusters. Cluster members by class: ${kv(d.members_by_class)}. Items by their own class: ${kv(d.items_by_class)}.\n`);
  out.push("## Largest clusters\n");
  out.push(mdTable(["Cluster", "Canonical", "Members", "Classes", "Exclusion group"], d.largest.map((c) => [code(c.id), code(c.canonical_id), c.members, kv(c.classes), code(c.exclusion_group)])));
  out.push("## Cross-lesson duplicates\n");
  out.push(mdTable(["Cluster", "Member", "Class", "Canonical lesson", "Member lesson"], d.cross_lesson.map((x) => [code(x.cluster), code(x.member), x.class, code(x.canonical_lesson), code(x.member_lesson)])));
  out.push(`## Instruction-stem families (normalized stem in ≥ 5 items)\n`);
  out.push(mdTable(["Stem (≤ 80 chars)", "Items"], d.instruction_stem_families.map((s) => [s.stem, s.items])));
  out.push("## Numeric-variant families\n");
  out.push(mdTable(["Cluster", "Canonical", "Numeric variants"], d.numeric_variant_families.map((f) => [code(f.cluster), code(f.canonical_id), f.members])));
  out.push("## Template-variant families\n");
  out.push(mdTable(["Template", "Variants", "Published"], d.template_variant_families.map((f) => [code(f.template_id), f.variants, f.published])));
  out.push("## Declared rewrite variants\n");
  out.push(mdTable(["Parent", "Rewrites", "Published"], d.rewrite_families.map((f) => [code(f.parent_id), f.rewrites, f.published])));
  const x = d.exclusion_components;
  out.push("## Exclusion components\n");
  out.push(`${x.count} components; size histogram: ${kv(x.size_histogram)}. Cap K = ${x.cap} (template-variant components are exempt).\n`);
  out.push(mdTable(["Component over the cap", "Size"], x.over_cap.map((c) => [code(c.exclusion_group), c.size])));
  return out.join("\n");
}

// ── exam-templates.md ───────────────────────────────────────────────────────
const EXACT_MAX_DIGITS = 30;
/** A combinatorics figure: exact when short, else 10^log10; plus log10. */
export const figureText = (f) => (!f ? "—" : f.exact.length <= EXACT_MAX_DIGITS ? `${f.exact} (log10 ${f.log10})` : `≈ 10^${f.log10}`);
function bandQuotas(allocation) {
  const b = { 1: 0, 2: 0, 3: 0 };
  for (const c of allocation) b[c.cell.split("#").pop()] += c.quota;
  return `${allocation.length} cells; e/m/h ${b[1]}/${b[2]}/${b[3]}`;
}
const tiersText = (tiers) => Object.entries(tiers).map(([k, v]) => `${k} ${v.offered ? (v.mini ? "mini" : "yes") : `no (${v.reason})`}`).join(", ");

export function renderExamTemplatesMd(model) {
  const e = model.examTemplates;
  const out = [mdHeader("Exam templates", model.meta, [
    "",
    "Every figure below belongs to **one template × one scope** and counts possible configurations over that scope's N published questions and M variants (docs/CONTENT_ENGINE.md §5.6).",
    "Figures are never added across templates or across overlapping scopes (subject vs `subject@t1`, unit vs chapter), and they are not question counts.",
    "Headline per scope: the pool size and **attempts before forced reuse**. Allocation is for a fresh learner and seed 0…0; `lower bound` marks scopes where the coverage pre-pass picked a stratum subset.",
  ])];
  for (const t of e.templates) {
    out.push(`## ${code(t.ref)} (${t.kind})\n`);
    out.push(`Scope kinds: ${t.scope_kinds.join(", ")}. Count ${t.count.default} (${t.count.min}–${t.count.max}${t.count.mini ? `, mini ${t.count.mini}` : ""}); mix e/m/h ${t.difficulty_mix.easy}/${t.difficulty_mix.medium}/${t.difficulty_mix.hard}.\n`);
    if (!t.blueprinted) {
      out.push("Not blueprinted: its scope depends on one learner's history (`weak:`).\n");
      continue;
    }
    out.push(`Scopes offered: **${t.scopes_offered}**; refused: ${t.scopes_refused}; scopes with an empty pool (not listed): ${t.empty_scopes}.\n`);
    const offered = t.scopes.filter((b) => b.offered);
    const refused = t.scopes.filter((b) => !b.offered);
    out.push("### Offered\n");
    out.push(mdTable(
      ["Scope", "Pool: questions + variants (components)", "Attempts before forced reuse", "n (selected)", "Allocation", "Distinct sets by component", "Distinct sets with variants", "Lower bound", "Tiers"],
      offered.map((b) => [code(b.scope), `${b.pool.questions} + ${b.pool.variants} (${b.pool.components})`, b.attempts_before_reuse, `${b.n} (${b.selected}${b.short ? ", short" : ""})`, bandQuotas(b.allocation), figureText(b.sets_by_component), figureText(b.sets_with_variants), b.lower_bound ? "yes" : "no", tiersText(b.tiers)]),
    ));
    out.push("### Refused (insufficient pool)\n");
    out.push(mdTable(["Scope", "Pool: questions + variants (components)", "Reason", "Required", "Available"], refused.map((b) => [code(b.scope), `${b.pool.questions} + ${b.pool.variants} (${b.pool.components})`, b.reason, b.required, b.available])));
    out.push("### Display permutations\n");
    out.push("Display orders of the **same** selected questions (question order × option orders) — not exams and not questions.\n");
    out.push(mdTable(["Scope", "Display permutations of one set"], offered.map((b) => [code(b.scope), figureText(b.display_permutations)])));
  }
  if (e.invalid_scopes.length) out.push(`Scopes that did not resolve (not blueprinted): ${e.invalid_scopes.map(code).join(", ")}.\n`);
  return out.join("\n");
}

// ── resources.md, question-bank.md, verification.md ────────────────────────
export function renderResourcesMd(model) {
  const rows = model.resources;
  const out = [mdHeader("Resources", model.meta, ["", `${rows.length} resources. Titles are the listing titles as published by the source.`])];
  out.push(mdTable(
    ["Id", "Title", "Subject", "Kind", "Part", "Year label (cover / file name)", "Availability", "Status", "Extraction", "Pages text / vision", "Term (status)", "Evidence routes"],
    rows.map((r) => [code(r.id), r.title, code(r.subject), r.kind, r.part, `${r.year_label ?? "—"} (${r.year_evidence?.cover ?? "—"} / ${r.year_evidence?.file_name ?? "—"})`, r.availability, r.status, r.extraction_status, `${r.pages.text} / ${r.pages.vision}`, `${r.term ?? "—"} (${r.term_status})`, r.evidence_routes.join(", ")]),
  ));
  return out.join("\n");
}

export function renderQuestionBankMd(model) {
  const b = model.questionBank;
  const out = [mdHeader("Question bank", model.meta, [
    `Runtime bank revision: ${code(b.bank_revision ?? "not packed")}`,
    `Published set sha256 (sorted \`id:revision\` of published records): ${code(b.published_set_sha256)}`,
  ])];
  out.push(mdTable(["Shard", "Subject", "Records", "By status", "By origin", "By type"], b.shards.map((s) => [code(s.shard), code(s.subject), s.total, kv(s.by_status), kv(s.by_origin), kv(s.by_type)])));
  return out.join("\n");
}

export function renderVerificationMd(model) {
  const out = [mdHeader("Verification map", model.meta, ["", "Generated from docs/CONTENT_ENGINE.md §9.3. It records which tests and artifacts exist; it does not claim that a test passed — run the command."])];
  const present = (list) => (list.length ? list.map((x) => `${x.path} (${x.present ? "present" : "missing"})`).join("; ") : "—");
  out.push(mdTable(["Requirement", "Command / test", "Test files", "Artifacts"], model.verification.map((r) => [r.requirement, `\`${r.command}\``, present(r.tests_present), present(r.artifacts_present)])));
  return out.join("\n");
}

// ── JSON reports ────────────────────────────────────────────────────────────
const jsonHeader = (schema, meta) => ({ schema, generated_at: meta.generated_at, manifest_sha256: meta.manifest_sha256, manifest_status: meta.manifest_status, counting_rules: meta.counting_rules });
export const renderCoverageJson = (model) => `${JSON.stringify({ ...jsonHeader("report-coverage@1", model.meta), ...model.coverage }, null, 2)}\n`;
export const renderQuestionStatsJson = (model) => `${JSON.stringify({ ...jsonHeader("report-question-stats@1", model.meta), projection_note: "Full-bank figures are a projection from measured runs, never done work (§9.3).", ...model.questionStats }, null, 2)}\n`;

export const RENDERERS = Object.freeze({
  "coverage.json": renderCoverageJson,
  "coverage.md": renderCoverageMd,
  "quality.html": renderQualityHtml,
  "validation.md": renderValidationMd,
  "duplicates.md": renderDuplicatesMd,
  "exam-templates.md": renderExamTemplatesMd,
  "question-stats.json": renderQuestionStatsJson,
  "resources.md": renderResourcesMd,
  "question-bank.md": renderQuestionBankMd,
  "verification.md": renderVerificationMd,
});

/** The generation time recorded in an existing report file, or null. */
export function recordedTime(name, text) {
  const m = name.endsWith(".json") ? /"generated_at": "([^"]+)"/.exec(text) : name.endsWith(".html") ? /data-generated="([^"]+)"/.exec(text) : /^Generated: (\S+)$/m.exec(text);
  return m && ISO_RE.test(m[1]) ? m[1] : null;
}

/**
 * Render and write the reports. A file whose content is unchanged apart from
 * its generation time keeps its old time (byte-identical rerun).
 * @param {string} outDir
 * @param {(generatedAt: string) => Promise<object>} modelFor  builds the model for a time
 * @param {string} now
 * @param {string[]} [only]
 */
export async function writeReports(outDir, modelFor, now, only = REPORT_FILES) {
  const models = new Map();
  const model = async (ts) => {
    if (!models.has(ts)) models.set(ts, await modelFor(ts));
    return models.get(ts);
  };
  const result = [];
  for (const name of only) {
    const path = join(outDir, name);
    const render = RENDERERS[name];
    const old = existsSync(path) ? readFileSync(path, "utf8") : null;
    const oldTs = old ? recordedTime(name, old) : null;
    if (old && oldTs && oldTs !== now && render(await model(oldTs)) === old) {
      result.push({ name, changed: false });
      continue;
    }
    result.push({ name, changed: writeFileIfChanged(path, render(await model(now))) });
  }
  return result;
}

/** Write blueprints to <staging>/exams/blueprints/<stage>.jsonl; stale stage files are removed. */
export function writeBlueprints(staging, rows) {
  const dir = join(staging, "exams/blueprints");
  const byStage = new Map();
  for (const r of rows) {
    if (!byStage.has(r.stage)) byStage.set(r.stage, []);
    byStage.get(r.stage).push(r);
  }
  const written = [];
  for (const [stage, list] of [...byStage].sort((a, b) => compareC(a[0], b[0]))) {
    const res = writeJsonl(join(dir, `${stage}.jsonl`), list, { serialize: (r) => stringifyRecord("exam-blueprint", r) });
    written.push({ file: `exams/blueprints/${stage}.jsonl`, lines: res.lines, changed: res.changed });
  }
  const removed = [];
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).sort()) {
      if (f.endsWith(".jsonl") && !byStage.has(f.replace(/\.jsonl$/, ""))) {
        unlinkSync(join(dir, f));
        removed.push(`exams/blueprints/${f}`);
      }
    }
  }
  return { written, removed };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
export class UsageError extends Error {}
const USAGE = "usage: report [--staging <dir>] [--out <dir>] [--exams] [--write-manifest] [--bank <dir>|--no-bank] [--now <iso>] [--only coverage.md,…] [--json]";

export function parseArgs(argv) {
  const o = { staging: DEFAULT_STAGING, out: null, exams: false, writeManifest: false, bank: DEFAULT_BANK, now: null, only: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new UsageError(`${a} needs a value\n${USAGE}`);
      return v;
    };
    if (a === "--staging") o.staging = resolve(value());
    else if (a === "--out") o.out = resolve(value());
    else if (a === "--exams") o.exams = true;
    else if (a === "--write-manifest") o.writeManifest = true;
    else if (a === "--bank") o.bank = resolve(value());
    else if (a === "--no-bank") o.bank = null;
    else if (a === "--now") {
      o.now = value();
      if (!ISO_RE.test(o.now) || Number.isNaN(Date.parse(o.now))) throw new UsageError(`--now must be an ISO UTC time like 2026-09-30T12:00:00Z`);
      o.now = o.now.replace(/\.\d{3}Z$/, "Z");
    } else if (a === "--only") {
      // a file name, or a stem that selects every file of that report (coverage → coverage.json + coverage.md)
      const asked = value().split(",").map((s) => s.trim()).filter(Boolean);
      const bad = [];
      const picked = new Set();
      for (const s of asked) {
        const files = REPORT_FILES.includes(s) ? [s] : REPORT_FILES.filter((f) => f.slice(0, f.lastIndexOf(".")) === s);
        if (!files.length) bad.push(s);
        for (const f of files) picked.add(f);
      }
      if (bad.length || !picked.size) throw new UsageError(`unknown report(s): ${bad.join(", ") || "(none)"}; known: ${REPORT_FILES.join(", ")}`);
      o.only = REPORT_FILES.filter((f) => picked.has(f));
    } else if (a === "--json") o.json = true;
    else if (a === "--help" || a === "-h") throw new UsageError(USAGE);
    else throw new UsageError(`unknown argument ${a}\n${USAGE}`);
  }
  if (o.writeManifest && !o.exams) throw new UsageError("--write-manifest only applies with --exams (the blueprints are staging data)");
  if (!o.out) o.out = join(o.staging, "reports");
  return o;
}

/** Run the reports; returns a summary object. */
export async function runReports(o) {
  if (!existsSync(o.staging)) throw new UsageError(`staging root not found: ${o.staging}`);
  const now = o.now ?? isoNow();
  const data = loadReportData(o.staging, { bankDir: o.bank });
  const blueprints = await buildBlueprints(data);
  const summary = { staging: o.staging, out: o.out, generated_at: now, blueprints: blueprints.rows.length, blueprint_files: null, manifest: null, reports: [] };
  if (o.exams) {
    summary.blueprint_files = writeBlueprints(o.staging, blueprints.rows);
    if (o.writeManifest) {
      const { validateStaging } = await import("./validate-staging.mjs");
      const v = await validateStaging({ root: o.staging, runtimeDir: null, registryBaseline: null, writeManifest: true });
      summary.manifest = { written: v.manifestWritten, errors: v.errors.length, warnings: v.warnings.length };
    }
    data.manifest = manifestStatus(o.staging);
  }
  const modelFor = (ts) => buildReportModel(data, { generatedAt: ts, repoRoot: REPO_ROOT, blueprints });
  summary.reports = await writeReports(o.out, modelFor, now, o.only ?? REPORT_FILES);
  summary.manifest_status = data.manifest.status;
  return summary;
}

export async function main(argv = process.argv.slice(2), log = console) {
  try {
    const o = parseArgs(argv);
    const s = await runReports(o);
    if (o.json) log.log(JSON.stringify(s, null, 2));
    else {
      if (s.blueprint_files) {
        for (const f of s.blueprint_files.written) log.log(`${f.changed ? "wrote" : "unchanged"} ${f.file} (${f.lines} blueprints)`);
        for (const f of s.blueprint_files.removed) log.log(`removed ${f}`);
      }
      if (s.manifest) log.log(`manifest.json ${s.manifest.written ? "written" : "unchanged"} (validate-staging: ${s.manifest.errors} errors, ${s.manifest.warnings} warnings)`);
      for (const r of s.reports) log.log(`${r.changed ? "wrote" : "unchanged"} ${join(o.out, r.name)}`);
      if (s.manifest_status !== "current") log.error(`note: manifest is ${s.manifest_status}; run npm run content:validate -- --write-manifest`);
    }
    return 0;
  } catch (e) {
    if (e instanceof UsageError) {
      log.error(e.message);
      return 2;
    }
    log.error(`error: ${e.stack || e.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then((code) => {
    process.exitCode = code;
  });
}
