#!/usr/bin/env node
// ============================================================================
// Ingest question-template drafts (docs/CONTENT_ENGINE.md §2.9, §4.6).
//
//   node scripts/content/ingest-templates.mjs --run run-20260927-var-01
//        [--file drafts.jsonl --packet <gen packet.json>]   one draft file
//        [--staging data/staging] [--cache dir] [--now iso] [--dry-run]
//   Without --file: every llm/<run>/<lesson packet name>.templates.jsonl in
//   the content cache, each paired with the generation packet of the same
//   name (packets/<gen run>/<name>.json, found through `--gen-run`, default
//   the newest gen run holding that packet).
//
// A draft line holds only template content (DRAFT_FIELDS): question_type,
// item_style, difficulty, language, solution_method, params, constraints,
// stem, answer, distractors, explanation, max_variants, time_limit_seconds,
// tags, objective_id. This script assigns everything else — id (§2.2
// mintTemplateId over lesson | type | stem | answer expression), revision,
// content_hash, lesson_node_id (the packet's lesson), source (the packet's
// resource and page span; templates cite no quotes, so `evidence` is empty
// and the origin is `generated_practice`), provenance (license_status = the
// cited resource's, as P001 requires), status `candidate`,
// validation `pending`, timestamps — and:
//   - rejects a line that sets any other field (S005) or fails the schema;
//   - runs the static checks (checkTemplate) and requires the three preview
//     instantiations (previewInstances, = variants 01..03) to pass the code
//     checks: they are what validates the template (§4.6);
//   - rejects «{param} <counted noun>» (T003: Arabic number–noun agreement
//     depends on the number, so some variants would be ungrammatical);
//   - rejects an exact repeat of an existing template (same id and content).
// Accepted templates are upserted into question-variants/templates/<leaf>/<subject>.jsonl.
// Rejected lines go to llm/<run>/templates-rejected.jsonl; counts go to the
// run manifest. Exit: 0 ok, 1 error, 2 usage.
// ============================================================================

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalJson, gradeCode, isRunId, mintTemplateId } from "../../src/lib/content/ids.js";
import { sha256Hex } from "../../src/lib/content/prng.js";
import { ITEM_STYLES } from "../../src/lib/content/enums.js";
import { checkTemplate, previewInstances, TEMPLATE_TYPES } from "../../src/lib/content/templates.js";
import { cachePaths, cacheRoot } from "./lib/cache.mjs";
import { writeShards } from "./lib/jsonl.mjs";
import { stringifyRecord, validateRecord } from "./lib/schemas.mjs";
import { DEFAULT_STAGING, isoNow, loadStaging, updateRunManifest } from "./check-questions.mjs";

class UsageError extends Error {}
export class DraftError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}
const reject = (code, message) => {
  throw new DraftError(code, message);
};
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export const DRAFT_FIELDS = Object.freeze([
  "question_type", "item_style", "difficulty", "language", "solution_method", "params", "constraints",
  "stem", "answer", "distractors", "explanation", "max_variants", "time_limit_seconds", "tags", "objective_id",
]);
const LIFECYCLE = new Set(["revision", "content_hash", "status", "validation", "created_at", "updated_at", "provenance"]);

// Counted nouns whose Arabic form depends on the number (3–10 plural, 11–99
// accusative singular …): after a parameter they are wrong for some variants.
// Symbolic units (سم، م، كجم، °) do not inflect and are fine.
const COUNTED_NOUNS = [
  "ريال", "ريالا", "ريالًا", "ريالات", "هللة", "هللات", "طالب", "طالبا", "طالبًا", "طلاب", "طالبة", "طالبات",
  "كتاب", "كتب", "قلم", "أقلام", "تفاحة", "تفاحات", "سنة", "سنوات", "عام", "أعوام", "يوم", "أيام", "يومًا", "يوما",
  "ساعة", "ساعات", "دقيقة", "دقائق", "ثانية", "ثوان", "مرة", "مرات", "شخص", "أشخاص", "قطعة", "قطع", "كيس", "أكياس",
  "صندوق", "صناديق", "بطاقة", "بطاقات", "لاعب", "لاعبين", "لاعبًا", "سيارة", "سيارات", "ورقة", "أوراق", "نقطة", "نقاط",
  "كرة", "كرات", "صفحة", "صفحات", "سؤال", "أسئلة", "رجل", "رجال", "امرأة", "نساء", "بيضة", "بيضات", "حبة", "حبات",
  "علبة", "علب", "زجاجة", "زجاجات", "شجرة", "أشجار", "غرفة", "غرف", "أسبوع", "أسابيع", "شهر", "أشهر",
];
const COUNTED_RE = new RegExp(`\\{[A-Za-z_][A-Za-z0-9_]*\\}\\s*(?:${COUNTED_NOUNS.join("|")})(?=$|[\\s،.؛:!؟?)»])`, "u");

/** The first «{param} <counted noun>» in a template's texts, or null (T003). */
export function countedNounAfterParam(t) {
  for (const text of [t.stem, t.explanation?.text, ...(t.explanation?.steps ?? [])]) {
    const m = COUNTED_RE.exec(String(text ?? ""));
    if (m) return m[0];
  }
  return null;
}

/** Staging-relative shard base of a template: question-variants/templates/<grade or track>/<subject>. */
export function templateShardBase(lesson) {
  const leaf = lesson.track ?? lesson.grade;
  return `question-variants/templates/${leaf}/${String(lesson.subject).split("/").pop()}`;
}

/** n2:sha256 over the canonical template content (lifecycle fields excluded). */
export function templateContentHash(t) {
  const rest = {};
  for (const [k, v] of Object.entries(t)) if (!LIFECYCLE.has(k) && k !== "id") rest[k] = v;
  return `n2:sha256:${sha256Hex(canonicalJson(rest))}`;
}

/** The lesson's resource and page span from a generation packet (no quotes: templates cite none). */
function sourceOf(packet) {
  const pages = (packet.pages ?? []).filter((p) => p.resource_id && Number.isInteger(p.pdf_page));
  if (!pages.length) return null;
  const rid = pages[0].resource_id;
  const same = pages.filter((p) => p.resource_id === rid);
  const pdf = same.map((p) => p.pdf_page);
  const printed = same.map((p) => p.printed_page).filter(Number.isInteger);
  return {
    source_id: "ien",
    resource_id: rid,
    pdf_page_start: Math.min(...pdf),
    pdf_page_end: Math.max(...pdf),
    printed_page_start: printed.length ? Math.min(...printed) : null,
    printed_page_end: printed.length ? Math.max(...printed) : null,
    evidence: [],
  };
}

/**
 * One draft → a candidate question-template@1 (throws DraftError).
 * @param {object} d  the draft line
 * @param {object} packet  the lesson's generation packet
 * @param {object} bank  loadStaging()
 */
export function ingestTemplate(d, packet, bank, { runId, now }) {
  if (!isObj(d)) reject("S001", "a draft line must be a JSON object");
  const extra = Object.keys(d).filter((k) => !DRAFT_FIELDS.includes(k));
  if (extra.length) reject("S005", `fields assigned at ingestion or unknown: ${extra.join(", ")}`);
  const lessonId = packet.lesson?.id;
  const lesson = bank.nodes.get(lessonId);
  if (!lesson || lesson.kind !== "lesson") reject("S001", `packet lesson ${lessonId} is not a lesson node`);
  if (!TEMPLATE_TYPES.includes(d.question_type)) reject("S001", `question_type must be one of ${TEMPLATE_TYPES.join(", ")}`);
  if (!ITEM_STYLES.includes(d.item_style)) reject("S001", `bad item_style ${d.item_style}`);
  if (d.objective_id != null && !(packet.objectives ?? []).some((o) => o.id === d.objective_id)) reject("S001", `objective ${d.objective_id} is not one of the packet's objectives`);
  const source = sourceOf(packet);
  const t = {
    schema: "question-template@1",
    id: null,
    revision: 1,
    content_hash: null,
    lesson_node_id: lessonId,
    objective_id: d.objective_id ?? null,
    question_type: d.question_type,
    item_style: d.item_style,
    difficulty: d.difficulty,
    language: d.language ?? packet.lesson?.language ?? "ar",
    solution_method: d.solution_method,
    params: d.params,
    constraints: d.constraints ?? [],
    stem: d.stem,
    answer: d.answer,
    distractors: d.distractors ?? [],
    explanation: d.explanation,
    max_variants: d.max_variants ?? 12,
    ...(d.time_limit_seconds != null ? { time_limit_seconds: d.time_limit_seconds } : {}),
    ...(d.tags != null ? { tags: d.tags } : {}),
    source,
    provenance: {
      origin: "generated_practice",
      official: false,
      // An item that cites a resource carries that resource's license (P001);
      // publication is then governed by the publish policy, not by the template.
      license_status: (source && (bank.resources.get(source.resource_id)?.license_status ?? bank.sources.get(source.source_id)?.license_status)) || "internal",
      generator: { kind: "llm_subagent", run_id: runId, prompt_version: "template.v1" },
      derived_from: [],
      template_id: null,
    },
    status: "candidate",
    validation: { status: "pending", record_ids: [], checked_revision: null },
    created_at: now,
    updated_at: now,
  };
  const problems = checkTemplate(t);
  if (problems.length) reject("T001", problems.map((p) => `${p.code} ${p.detail}`).join("; "));
  const counted = countedNounAfterParam(t);
  if (counted) reject("T003", `«${counted}»: a counted noun after a parameter is ungrammatical for some numbers (rephrase, e.g. «المبلغ بالريال {a}»)`);
  t.content_hash = templateContentHash(t);
  const lookup = (id) => bank.templates.get(id) ?? null;
  const minted = mintTemplateId(
    { grade: gradeCode(lessonId), subject: String(lesson.subject).split("/").pop(), anchor: lessonId, type: t.question_type, stem: t.stem, answerExpr: t.answer?.expr },
    { lookup, contentHash: t.content_hash },
  );
  if (!minted.id) reject("D001", `exact duplicate of ${minted.duplicate_of}`);
  t.id = minted.id;
  // Variants are seeded by the id (sha256(id | revision)), so the previews =
  // variants 01..03 can only be drawn once the id exists.
  const previews = previewInstances(t, 3);
  if (previews.length < 3) reject("T002", `only ${previews.length} of 3 preview instantiations pass the code checks`);
  const v = validateRecord("question-template", t);
  if (!v.ok) reject("S001", v.errors.slice(0, 3).join("; "));
  return { template: t, previews };
}

/** Ingest the lines of one draft file (never throws for a bad line). */
export function ingestDraftLines(lines, packet, bank, { runId, now }) {
  const accepted = [];
  const rejected = [];
  lines.forEach((raw, i) => {
    if (!raw.trim()) return;
    try {
      let d;
      try {
        d = JSON.parse(raw);
      } catch {
        reject("S001", "not valid JSON");
      }
      const { template, previews } = ingestTemplate(d, packet, bank, { runId, now });
      bank.templates.set(template.id, template);
      accepted.push({ template, previews });
    } catch (e) {
      if (!(e instanceof DraftError)) throw e;
      rejected.push({ line: i + 1, code: e.code, reason: e.message.slice(0, 500) });
    }
  });
  return { accepted, rejected };
}

/** Write every template shard (sorted by id, schema key order). */
export function saveTemplates(bank) {
  const groups = new Map();
  for (const t of bank.templates.values()) {
    const base = templateShardBase(bank.nodes.get(t.lesson_node_id) ?? reject("S001", `${t.id}: unknown lesson ${t.lesson_node_id}`));
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(t);
  }
  const written = [];
  for (const [base, recs] of groups) {
    const r = writeShards(join(bank.staging, base), recs, { serialize: (x) => stringifyRecord("question-template", x) });
    written.push(...r.files.filter((f) => f.changed).map((f) => f.path));
  }
  return written;
}

/** Generation packet of a lesson packet name: the newest packets/<gen run>/<name>.json. */
function findGenPacket(root, name, genRun) {
  const dir = cachePaths(root).packetsDir("x").replace(/[\\/]x$/, "");
  const runs = genRun ? [genRun] : readdirSync(dir).filter((r) => isRunId(r) && r.includes("-gen-")).sort().reverse();
  for (const r of runs) {
    const p = join(dir, r, `${name}.json`);
    if (existsSync(p)) return p;
  }
  return null;
}

export function parseArgs(argv) {
  const o = { run: null, file: null, packet: null, genRun: null, staging: DEFAULT_STAGING, cache: null, now: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new UsageError(`${a} needs a value`);
      return v;
    };
    if (a === "--run") o.run = next();
    else if (a === "--file") o.file = resolve(next());
    else if (a === "--packet") o.packet = resolve(next());
    else if (a === "--gen-run") o.genRun = next();
    else if (a === "--staging") o.staging = resolve(next());
    else if (a === "--cache") o.cache = resolve(next());
    else if (a === "--now") o.now = next();
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--help" || a === "-h") o.help = true;
    else throw new UsageError(`unknown option ${a}`);
  }
  if (o.help) return o;
  if (!o.run || !isRunId(o.run) || !o.run.includes("-var-")) throw new UsageError("--run <run-yyyymmdd-var-nn> is required");
  if (Boolean(o.packet) !== Boolean(o.file)) throw new UsageError("--packet and --file go together");
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
    log.log("usage: node scripts/content/ingest-templates.mjs --run <var run id> [--file drafts.jsonl --packet gen-packet.json] [--gen-run <gen run>] [--staging dir] [--cache dir] [--now iso] [--dry-run]");
    return 0;
  }
  try {
    const now = o.now ?? isoNow();
    const root = o.cache ?? cacheRoot();
    const bank = loadStaging(o.staging);
    const llm = cachePaths(root).llmDir(o.run);
    const jobs = o.file
      ? [{ file: o.file, packet: o.packet }]
      : (existsSync(llm) ? readdirSync(llm) : []).filter((f) => f.endsWith(".templates.jsonl")).sort().map((f) => ({ file: join(llm, f), packet: findGenPacket(root, f.replace(/\.templates\.jsonl$/, ""), o.genRun) }));
    if (!jobs.length) {
      log.error(`no drafts for ${o.run} (expected llm/${o.run}/<lesson packet>.templates.jsonl in the cache)`);
      return 1;
    }
    const counts = { files: jobs.length, lines: 0, accepted: 0, rejected: 0, rejected_by_code: {} };
    const allRejected = [];
    for (const job of jobs) {
      if (!job.packet) {
        allRejected.push({ file: basename(job.file), line: 0, code: "S001", reason: "no generation packet for this lesson" });
        counts.rejected++;
        continue;
      }
      const packet = JSON.parse(readFileSync(job.packet, "utf8"));
      const lines = readFileSync(job.file, "utf8").split(/\r?\n/);
      const { accepted, rejected } = ingestDraftLines(lines, packet, bank, { runId: o.run, now });
      counts.lines += lines.filter((l) => l.trim()).length;
      counts.accepted += accepted.length;
      counts.rejected += rejected.length;
      for (const r of rejected) {
        counts.rejected_by_code[r.code] = (counts.rejected_by_code[r.code] ?? 0) + 1;
        allRejected.push({ file: basename(job.file), ...r });
      }
      log.log(`${basename(job.file)}: ${accepted.length} accepted, ${rejected.length} rejected${accepted.length ? ` (${accepted.map((a) => a.template.id).join(", ")})` : ""}`);
      // A dry run shows the three previews so the author can read them as a student would.
      if (o.dryRun) {
        for (const { template, previews } of accepted) {
          for (const p of previews) {
            const shown = p.instance.payload.options ? p.instance.payload.options.map((x) => (x.id === p.instance.payload.answer.option_id ? `[${x.text}]` : x.text)).join(" | ") : `= ${p.instance.answerText}`;
            log.log(`  ${template.id} #${p.variant_no}: ${p.instance.stem}  →  ${shown}`);
            log.log(`    ${p.instance.explanation.steps.join(" ⟶ ") || p.instance.explanation.text}`);
          }
        }
      }
    }
    for (const r of allRejected) log.log(`  rejected ${r.file}:${r.line} ${r.reason}`);
    if (o.dryRun) return 0;
    saveTemplates(bank);
    mkdirSync(llm, { recursive: true });
    writeFileSync(join(llm, "templates-rejected.jsonl"), allRejected.map((r) => JSON.stringify(r)).join("\n") + (allRejected.length ? "\n" : ""));
    updateRunManifest(bank.staging, o.run, { kind: "var", tool: "ingest-templates@1", ingested_at: now, counts: { ingest_templates: counts } });
    log.log(`${counts.accepted} template(s) accepted, ${counts.rejected} rejected`);
    return 0;
  } catch (e) {
    log.error(`error: ${e.message}`);
    return 1;
  }
}

const invokedDirectly = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) main().then((code) => { process.exitCode = code; });
