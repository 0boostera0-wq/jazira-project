#!/usr/bin/env node
// ============================================================================
// Work packets for Claude subagents (docs/CONTENT_ENGINE.md §4.3, §4.3b, §4.4),
// written to the content cache (packets/<run>/, never the repo).
//
//   --kind gen       one generation packet per lesson (or prep topic):
//     node scripts/content/make-packets.mjs --kind gen --run run-20260927-gen-01
//          (--lessons <id,id> | --subject <subject node> | --prep aptitude/quantitative[/topic])
//          [--count 15] [--types mcq:8,true_false:2,…] [--rewrite <question ids>] [--render]
//   --kind validate  blind + keyed packets per question (Stage 2, validate.v1):
//     node scripts/content/make-packets.mjs --kind validate --run run-20260928-val-01
//          (--ids a,b | --subject <node> | --status structural_pass) [--render]
//   --kind evidence  evidence-extractor packets for high-risk items (objective +
//          cited pages, never the question)
//   Common: [--staging data/staging] [--cache dir] [--allow-missing-images]
//
// Every packet page carries its text (repaired text or vision transcript from
// extract/<resource>/pages.jsonl; raw text-layer text only as `untrusted`),
// `text_method`, `text_quality` and `image`: the 1100 px render made by
// scripts/content/pdf-render.mjs (cache ien/pages/<stem>/pNNN.jpg). The image
// wins over the text layer, which is garbled for equations and figures.
// --render renders missing pages; otherwise a missing image is an error.
// Page text and images stay in the cache; they are never written to the repo
// and never go to ChatGPT or Gemini (exchange.mjs sends item text only).
// Exit: 0 ok, 1 error (e.g. missing images), 2 usage.
// ============================================================================

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeForDedup } from "../../src/lib/content/normalize.js";
import { isRunId } from "../../src/lib/content/ids.js";
import { sha256Hex } from "../../src/lib/content/prng.js";
import { QUESTION_TYPES } from "../../src/lib/content/enums.js";
import { cachePaths, cacheRoot } from "./lib/cache.mjs";
import { createPageStore, isHighRisk, isStemItem, lessonAncestor, subjectSlug } from "./lib/checks.mjs";
import { writeJson } from "./lib/jsonl.mjs";
import { REPO_ROOT } from "./lib/schemas.mjs";
import { DEFAULT_STAGING, loadStaging, recordsFor, updateRunManifest, isoNow } from "./check-questions.mjs";
import { displaySeed, displayView } from "./exchange.mjs";
import { loadCatalog } from "../build-question-seed.mjs";

const cOrder = (a, b) => Buffer.compare(Buffer.from(String(a), "utf8"), Buffer.from(String(b), "utf8"));
export const PROMPTS = {
  gen: "scripts/content/prompts/generate.v1.md",
  repair: "scripts/content/prompts/repair.v1.md",
  validate: "scripts/content/prompts/validate.v1.md",
};
export const DEFAULT_COUNT = 15;
const TYPE_WEIGHTS = {
  stem: { mcq: 8, true_false: 2, numeric: 3, matching: 1, ordering: 1 },
  other: { mcq: 9, true_false: 3, matching: 1, ordering: 1, short_answer: 1 },
};
const DIFFICULTY_WEIGHTS = { 1: 2, 2: 4, 3: 5, 4: 3, 5: 1 };

/** Packet file name for a lesson / prep scope / question: path separators → "__". */
export const packetName = (key) => key.replace(/^prep:/, "prep/").split("/").join("__").replace(/[^A-Za-z0-9._-]/g, "_");

/** Largest-remainder split of `total` by integer weights (ties by key, C order). */
export function allocate(total, weights) {
  const keys = Object.keys(weights).filter((k) => weights[k] > 0).sort(cOrder);
  const sum = keys.reduce((s, k) => s + weights[k], 0);
  const out = Object.fromEntries(keys.map((k) => [k, Math.floor((total * weights[k]) / sum)]));
  let left = total - keys.reduce((s, k) => s + out[k], 0);
  const order = [...keys].sort((a, b) => ((total * weights[b]) % sum) - ((total * weights[a]) % sum) || cOrder(a, b));
  for (let i = 0; left > 0; i = (i + 1) % order.length, left--) out[order[i]]++;
  return out;
}

export function parseTypes(spec) {
  const out = {};
  for (const part of String(spec).split(",")) {
    const [type, n] = part.split(":");
    if (!QUESTION_TYPES.includes(type) || !/^\d+$/.test(n ?? "")) throw new Error(`bad --types entry ${part}`);
    out[type] = Number(n);
  }
  return out;
}

// ── pages ───────────────────────────────────────────────────────────────────
/** Packet page rows for a resource page list; `missing` collects pages without a render. */
export function packetPagesFor(bank, pages, resourceId, pdfPages, missing, { stem = false } = {}) {
  return pdfPages.map((p) => {
    const map = bank.pageMaps.get(resourceId)?.get(p) ?? null;
    const got = pages.get(resourceId, p);
    if (!got.image_exists) missing.push({ resource_id: resourceId, pdf_page: p, image: got.image });
    const quality = got.quality;
    return {
      resource_id: resourceId, pdf_page: p, printed_page: map?.printed_page ?? null, kind: map?.kind ?? "unknown",
      text: got.text, text_method: got.method, text_quality: quality,
      image: got.image,
      read_image: quality !== "ok" || stem || (map?.flags ?? []).includes("two_column"),
    };
  });
}

function lessonPages(bank, pages, lesson, missing, stem) {
  const out = [];
  for (const range of lesson.pages ?? []) {
    const list = [];
    for (let p = range.pdf_start; p <= range.pdf_end; p++) list.push(p);
    for (const row of packetPagesFor(bank, pages, range.resource_id, list, missing, { stem })) out.push({ ...row, range_status: range.status });
  }
  return out;
}

const stemDigest = (stem) => sha256Hex(normalizeForDedup(stem)).slice(0, 16);
const live = (q) => q.status !== "rejected" && q.status !== "retired";

// ── generation packets ──────────────────────────────────────────────────────
/**
 * A §4.3 generation packet for a lesson.
 * @returns {{ name, packet, missing: [{resource_id, pdf_page, image}] }}
 */
export function buildGenPacket(bank, lessonId, { runId, pages, root, count = DEFAULT_COUNT, types = null, rewriteOf = [] }) {
  const lesson = bank.nodes.get(lessonId);
  if (!lesson || lesson.kind !== "lesson") throw new Error(`${lessonId} is not a lesson`);
  if (lesson.status !== "verified" || lesson.unit_opener) throw new Error(`${lessonId} is ${lesson.unit_opener ? "a unit opener" : lesson.status}; generate only for verified lessons`);
  const subject = bank.nodes.get(lesson.subject);
  const grade = bank.nodes.get(lesson.grade);
  const unitId = lessonAncestor(lesson, "unit", bank.nodes);
  const probe = { curriculum: { subject: lesson.subject } };
  const stem = isStemItem(probe);
  const language = subjectSlug(probe) === "english" ? "en" : "ar";
  const missing = [];
  const packetPages = lessonPages(bank, pages, lesson, missing, stem);
  if (!packetPages.length) throw new Error(`${lessonId} has no page range yet (needs TOC/extraction, §4.2)`);
  const resources = new Set(packetPages.map((p) => p.resource_id));
  const exercises = [];
  for (const res of resources) {
    for (const e of bank.exercises.get(res) ?? []) {
      if (e.lesson_node_id === lessonId || packetPages.some((p) => p.resource_id === res && p.pdf_page === e.pdf_page)) {
        exercises.push({ resource_id: res, pdf_page: e.pdf_page, label: e.label, kind: e.kind });
      }
    }
  }
  const parents = rewriteOf.map((id) => {
    const q = bank.questions.get(id);
    if (!q || q.curriculum?.lesson !== lessonId) throw new Error(`rewrite target ${id} is not a question of ${lessonId}`);
    // Parent content for the rewrite (no hash, status or validation data).
    const rest = { ...q };
    for (const k of ["content_hash", "validation", "dedup", "status"]) delete rest[k];
    return rest;
  });
  const name = packetName(lessonId);
  const packet = {
    packet_id: `${runId}:${lessonId}`,
    kind: "generate",
    lesson: {
      id: lessonId, title_ar: lesson.title_ar, unit: unitId, unit_title_ar: unitId ? bank.nodes.get(unitId)?.title_ar ?? null : null,
      subject: subject?.title_ar ?? null, subject_node: lesson.subject, grade: grade?.title_ar ?? null,
      term: lesson.term ?? null, term_status: lesson.term_status, language,
    },
    objectives: [...bank.objectives.values()].filter((o) => o.lesson_node_id === lessonId).sort((a, b) => cOrder(a.id, b.id))
      .map((o) => ({ id: o.id, text_ar: o.text_ar, text_en: o.text_en ?? null })),
    pages: packetPages,
    exercises: exercises.sort((a, b) => a.pdf_page - b.pdf_page || cOrder(a.label, b.label)),
    target: {
      count,
      types: types ?? allocate(count, stem ? TYPE_WEIGHTS.stem : TYPE_WEIGHTS.other),
      difficulty: allocate(count, DIFFICULTY_WEIGHTS),
    },
    existing: [...bank.questions.values()].filter((q) => q.curriculum?.lesson === lessonId && live(q)).sort((a, b) => cOrder(a.id, b.id))
      .map((q) => ({ id: q.id, stem_norm_digest: stemDigest(q.stem) })),
    ...(parents.length ? { rewrite_of: rewriteOf, rewrite_parents: parents } : {}),
    rules_version: "generate.v1",
    prompt: PROMPTS.gen,
    output: join(cachePaths(root).llmDir(runId), `${name}.jsonl`).split("\\").join("/"),
  };
  return { name, packet, missing };
}

/** Topic labels from the exams i18n namespace (ar and en). */
export async function loadTopicLabels() {
  const load = async (locale) => {
    const src = readFileSync(join(REPO_ROOT, `src/i18n/messages/${locale}/exams.js`), "utf8");
    const mod = await import(`data:text/javascript;base64,${Buffer.from(src, "utf8").toString("base64")}`);
    return mod.default ?? {};
  };
  const [ar, en] = await Promise.all([load("ar"), load("en")]);
  return { ar, en };
}

/** A §4.3b aptitude packet for one prep topic. */
export function buildPrepPacket(bank, prep, { runId, root, catalog, labels, count = DEFAULT_COUNT, types = null }) {
  const sec = catalog.SECTIONS[prep.section];
  if (!sec || sec.exam !== prep.exam || (prep.topic && !sec.topics.includes(prep.topic))) throw new Error(`unknown prep scope ${prep.exam}/${prep.section}/${prep.topic}`);
  const key = `prep:${prep.exam}/${prep.section}/${prep.topic}`;
  const name = packetName(key);
  const label = (loc, group, k) => labels?.[loc]?.[group]?.[k] ?? null;
  const packet = {
    packet_id: `${runId}:${key}`,
    kind: "generate",
    prep: { exam: prep.exam, section: prep.section, topic: prep.topic },
    language: "ar",
    topic_description: {
      exam: { ar: label("ar", "types", prep.exam), en: label("en", "types", prep.exam) },
      section: { ar: label("ar", "sections", prep.section), en: label("en", "sections", prep.section) },
      topic: { ar: label("ar", "topics", prep.topic), en: label("en", "topics", prep.topic) },
    },
    target: {
      count,
      types: types ?? allocate(count, prep.section === "quantitative" ? { mcq: 12, numeric: 3 } : { mcq: 15 }),
      difficulty: allocate(count, DIFFICULTY_WEIGHTS),
    },
    existing: [...bank.questions.values()].filter((q) => q.prep?.exam === prep.exam && q.prep?.section === prep.section && q.prep?.topic === prep.topic && live(q))
      .sort((a, b) => cOrder(a.id, b.id)).map((q) => ({ id: q.id, stem_norm_digest: stemDigest(q.stem) })),
    rules_version: "generate.v1",
    prompt: PROMPTS.gen,
    output: join(cachePaths(root).llmDir(runId), `${name}.jsonl`).split("\\").join("/"),
  };
  return { name, packet, missing: [] };
}

// ── validation and evidence packets ─────────────────────────────────────────
/** Pages an item cites: its source range plus evidence pages. */
function citedPageList(q) {
  const s = q.source;
  if (!s?.resource_id || !Number.isInteger(s.pdf_page_start)) return [];
  const set = new Set();
  for (let p = s.pdf_page_start; p <= s.pdf_page_end; p++) set.add(p);
  for (const e of s.evidence ?? []) set.add(e.pdf_page);
  return [...set].sort((a, b) => a - b);
}

function objectiveOf(bank, q) {
  const o = q.objective_id ? bank.objectives.get(q.objective_id) : null;
  return o ? { id: o.id, text_ar: o.text_ar, text_en: o.text_en ?? null } : null;
}

function lessonOf(bank, q) {
  const l = q.curriculum?.lesson ? bank.nodes.get(q.curriculum.lesson) : null;
  return l ? { id: l.id, title_ar: l.title_ar, subject: bank.nodes.get(l.subject)?.title_ar ?? null } : null;
}

/**
 * Stage 2 packets for one question (§4.4): the blind packet (stem, stimulus,
 * options in display order, no key, no pages) and the keyed packet (key,
 * explanation, objective, cited pages WITH images, display mapping).
 */
export function buildValidationPackets(bank, q, { runId, pages, root }) {
  const stimulus = q.stimulus_id ? bank.stimuli.get(q.stimulus_id)?.text ?? null : null;
  const view = displayView(q, displaySeed(runId));
  const llm = cachePaths(root).llmDir(runId);
  const missing = [];
  const det = recordsFor(bank, q).find((r) => r.role === "deterministic");
  const name = packetName(q.id);
  const blind = {
    packet_id: `${runId}:${q.id}:blind`, kind: "validate_blind", step: 1,
    question_id: q.id, revision: q.revision, language: q.language, question_type: q.question_type,
    stem: q.stem, stimulus, ...view.item,
    rules_version: "validate.v1", prompt: PROMPTS.validate,
    output: join(llm, `${name}.blind.json`).split("\\").join("/"),
  };
  const parent = q.variant?.kind === "rewrite" ? bank.questions.get(q.variant.of) : null;
  const keyed = {
    packet_id: `${runId}:${q.id}:keyed`, kind: "validate_keyed", step: 2,
    question_id: q.id, revision: q.revision, content_hash: q.content_hash,
    question: {
      scope: q.scope, prep: q.prep, question_type: q.question_type, item_style: q.item_style, difficulty: q.difficulty, language: q.language,
      stem: q.stem, stimulus, payload: q.payload, explanation: q.explanation, tags: q.tags, computation: q.computation,
      origin: q.provenance.origin, variant: q.variant, source: q.source,
    },
    display: view.item, key_display: view.keyDisplay,
    objective: objectiveOf(bank, q), lesson: lessonOf(bank, q),
    rewrite_parent: parent ? { id: parent.id, objective_id: parent.objective_id, difficulty: parent.difficulty, method: parent.explanation?.method ?? null, stem: parent.stem } : null,
    pages: q.source?.resource_id ? packetPagesFor(bank, pages, q.source.resource_id, citedPageList(q), missing, { stem: isStemItem(q) }) : [],
    high_risk: isHighRisk(q, det?.checks ?? []),
    deterministic: det ? { record_id: det.id, verdict: det.verdict, warnings: det.checks.filter((c) => c.result !== "pass").map((c) => c.code) } : null,
    rules_version: "validate.v1", prompt: PROMPTS.validate,
    output: join(llm, `${name}.record.json`).split("\\").join("/"),
  };
  return { name, blind, keyed, missing };
}

/** Evidence-extractor packet (high-risk items): objective + cited pages, never the question. */
export function buildEvidencePacket(bank, q, { runId, pages, root }) {
  const missing = [];
  const lesson = q.curriculum?.lesson ? bank.nodes.get(q.curriculum.lesson) : null;
  const pagesOut = q.source?.resource_id ? packetPagesFor(bank, pages, q.source.resource_id, citedPageList(q), missing, { stem: isStemItem(q) }) : [];
  const name = packetName(q.id);
  return {
    name,
    missing,
    packet: {
      packet_id: `${runId}:${q.id}:evidence`, kind: "evidence", question_id: q.id, revision: q.revision,
      objective: objectiveOf(bank, q), lesson: lesson ? { id: lesson.id, title_ar: lesson.title_ar } : null,
      pages: pagesOut,
      instructions: "Return the supporting span for the objective: {\"question_id\", \"revision\", \"spans\": [{\"pdf_page\", \"quote\"}]} (quotes ≤ 200 chars, copied from the page text or the image).",
      output: join(cachePaths(root).llmDir(runId), `${name}.evidence.jsonl`).split("\\").join("/"),
    },
  };
}

// ── rendering missing images ────────────────────────────────────────────────
/** Render missing pages with scripts/content/pdf-render.mjs (grouped by book). */
export async function renderMissing(bank, missing, renderer = null) {
  const render = renderer ?? (await import("./pdf-render.mjs")).renderPages;
  const byFile = new Map();
  for (const m of missing) {
    const file = bank.resources.get(m.resource_id)?.provider_ref?.path;
    if (!file) continue;
    if (!byFile.has(file)) byFile.set(file, new Set());
    byFile.get(file).add(m.pdf_page);
  }
  for (const [file, set] of byFile) await render(file, [...set].sort((a, b) => a - b));
}

// ── CLI ─────────────────────────────────────────────────────────────────────
export class UsageError extends Error {}

export function parseArgs(argv) {
  const o = { kind: "gen", run: null, staging: DEFAULT_STAGING, cache: null, lessons: null, subject: null, prep: null, ids: null, status: null, count: DEFAULT_COUNT, types: null, rewrite: [], render: false, allowMissing: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new UsageError(`${a} needs a value`);
      return v;
    };
    const list = () => next().split(",").map((s) => s.trim()).filter(Boolean);
    if (a === "--kind") o.kind = next();
    else if (a === "--run") o.run = next();
    else if (a === "--staging") o.staging = resolve(next());
    else if (a === "--cache") o.cache = resolve(next());
    else if (a === "--lessons") o.lessons = list();
    else if (a === "--subject") o.subject = next();
    else if (a === "--prep") o.prep = next();
    else if (a === "--ids") o.ids = list();
    else if (a === "--status") o.status = next();
    else if (a === "--count") o.count = Number(next());
    else if (a === "--types") o.types = parseTypes(next());
    else if (a === "--rewrite") o.rewrite = list();
    else if (a === "--render") o.render = true;
    else if (a === "--allow-missing-images") o.allowMissing = true;
    else if (a === "--help" || a === "-h") o.help = true;
    else throw new UsageError(`unknown option ${a}`);
  }
  if (o.help) return o;
  if (!["gen", "validate", "evidence"].includes(o.kind)) throw new UsageError("--kind gen|validate|evidence");
  const want = o.kind === "gen" ? "-gen-" : "-val-";
  if (!o.run || !isRunId(o.run) || !o.run.includes(want)) throw new UsageError(`--run must be a run id of kind ${want.slice(1, -1)}`);
  if (!Number.isInteger(o.count) || o.count < 1 || o.count > 60) throw new UsageError("--count 1..60");
  if (o.kind === "gen" && !o.lessons && !o.subject && !o.prep) throw new UsageError("--lessons, --subject or --prep is required");
  if (o.kind !== "gen" && !o.ids && !o.subject && !o.status) throw new UsageError("--ids, --subject or --status is required");
  return o;
}

function selectQuestions(bank, o) {
  return [...bank.questions.values()].filter((q) => {
    if (o.ids && !o.ids.includes(q.id)) return false;
    if (o.subject && q.curriculum?.subject !== o.subject && `prep:${q.prep?.exam}/${q.prep?.section}` !== o.subject) return false;
    if (o.status && q.validation.status !== o.status) return false;
    return true;
  }).sort((a, b) => cOrder(a.id, b.id));
}

async function buildAll(bank, o, ctx) {
  const out = [];
  if (o.kind === "gen" && o.prep) {
    const [exam, section, topic] = o.prep.replace(/^prep:/, "").split("/");
    const topics = topic ? [topic] : ctx.catalog.SECTIONS[section]?.topics ?? [];
    for (const t of topics) out.push(buildPrepPacket(bank, { exam, section, topic: t }, { ...ctx, count: o.count, types: o.types }));
  } else if (o.kind === "gen") {
    const lessons = o.lessons ?? [...bank.nodes.values()].filter((n) => n.kind === "lesson" && n.subject === o.subject && n.status === "verified" && !n.unit_opener && (n.pages ?? []).length)
      .map((n) => n.id).sort(cOrder);
    for (const id of lessons) out.push(buildGenPacket(bank, id, { ...ctx, count: o.count, types: o.types, rewriteOf: o.rewrite.filter((q) => bank.questions.get(q)?.curriculum?.lesson === id) }));
  } else {
    for (const q of selectQuestions(bank, o)) {
      if (o.kind === "validate") {
        const v = buildValidationPackets(bank, q, ctx);
        out.push({ name: `${v.name}.blind`, packet: v.blind, missing: [] }, { name: `${v.name}.keyed`, packet: v.keyed, missing: v.missing });
      } else if (isHighRisk(q, recordsFor(bank, q).find((r) => r.role === "deterministic")?.checks ?? []) && q.source?.resource_id) {
        const e = buildEvidencePacket(bank, q, ctx);
        out.push({ name: `${e.name}.evidence`, packet: e.packet, missing: e.missing });
      }
    }
  }
  return out;
}

export async function main(argv = process.argv.slice(2), log = console, { renderer = null } = {}) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    log.error(`error: ${e.message}`);
    return 2;
  }
  if (o.help) {
    log.log("usage: node scripts/content/make-packets.mjs --kind gen|validate|evidence --run <run id> (see the header for selectors) [--render] [--staging dir] [--cache dir]");
    return 0;
  }
  try {
    const root = o.cache ?? cacheRoot();
    const bank = loadStaging(o.staging);
    const pages = createPageStore({ root, resources: bank.resources });
    const ctx = { runId: o.run, pages, root, catalog: await loadCatalog(), labels: o.prep ? await loadTopicLabels() : null };
    let built = await buildAll(bank, o, ctx);
    let missing = built.flatMap((b) => b.missing);
    if (missing.length && o.render) {
      await renderMissing(bank, missing, renderer);
      built = await buildAll(bank, o, { ...ctx, pages: createPageStore({ root, resources: bank.resources }) });
      missing = built.flatMap((b) => b.missing);
    }
    if (missing.length && !o.allowMissing) {
      for (const m of missing.slice(0, 20)) log.error(`missing page image: ${m.resource_id} p${m.pdf_page} (${m.image ?? "no file name"})`);
      log.error(`${missing.length} page image(s) missing — rerun with --render (scripts/content/pdf-render.mjs); no packets written`);
      return 1;
    }
    const dir = cachePaths(root).packetsDir(o.run);
    for (const b of built) writeJson(join(dir, `${b.name}.json`), b.packet);
    const lessons = new Set(built.map((b) => b.packet.lesson?.id).filter(Boolean));
    updateRunManifest(bank.staging, o.run, {
      kind: o.kind === "gen" ? "gen" : "val", tool: "make-packets@1", packets_at: isoNow(),
      prompt_version: o.kind === "gen" ? "generate.v1" : "validate.v1",
      scope: { subject: o.subject ?? null, prep: o.prep ?? null, lessons: lessons.size, questions: o.kind === "gen" ? null : new Set(built.map((b) => b.packet.question_id)).size },
      counts: { packets: built.length, pages: built.reduce((n, b) => n + (b.packet.pages?.length ?? 0), 0), missing_images: missing.length },
      agents: { claude_subagent: "available", deepseek: "unavailable" },
    });
    log.log(`${built.length} packet(s) → ${dir}`);
    return 0;
  } catch (e) {
    log.error(`error: ${e.message}`);
    return 1;
  }
}

const invokedDirectly = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) main().then((code) => { process.exitCode = code; });
