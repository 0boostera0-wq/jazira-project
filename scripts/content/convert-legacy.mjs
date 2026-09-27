#!/usr/bin/env node
// ============================================================================
// Legacy bank → canonical records (docs/CONTENT_ENGINE.md §4.4 "legacy 300",
// §5.9). The 300 `jazira-original` items of src/content/questions/*.json keep
// their keys (aq-001 …) and become question@1 records with provenance
// `internal_authored` in data/staging/questions/prep/<exam>-<section>.jsonl
// (shared reading passages → stimulus@1 records in questions/stimuli/prep/).
//
//   node scripts/content/convert-legacy.mjs [--in src/content/questions] [--staging data/staging]
//        [--now iso] [--verify-only]
//
// The conversion is lossless and verified before anything is written:
//   canonical → legacy JSON deep-equals every source file, and
//   canonical → buildSeedSql() is byte-identical to supabase/migrations/0011_seed_questions.sql.
// Mapping: choices → mcq options (order kept, opaque ids), answer index →
// option id, passage → stimulus, difficulty 1/2/3 → level 2/3/4 (author),
// explanation → { text, steps: [], method: null }; comparison and
// contextual-error topics keep their option order (§5.4); O004 applies.
// Reruns are idempotent: unchanged items keep revision, timestamps and
// validation state; a changed item gets a new revision. A source file that
// carries anything the canonical record cannot hold (extra fields, untrimmed
// text, a source other than jazira-original) is refused.
// Exit: 0 ok, 1 not lossless / error, 2 usage.
// ============================================================================

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { stimulusId } from "../../src/lib/content/ids.js";
import { difficultyBand, legacyDifficultyLevel } from "../../src/lib/content/enums.js";
import { applyO004, defaultShuffle, isLegacyItem } from "./lib/checks.mjs";
import { validateRecord, REPO_ROOT } from "./lib/schemas.mjs";
import { opaqueIds } from "./ingest-candidates.mjs";
import { DEFAULT_STAGING, isoNow, loadStaging, questionShardBase, rehash, saveQuestions, saveStimuli, stimulusShardBase } from "./check-questions.mjs";
import { buildSeedSql, DEFAULT_IN_DIR, DEFAULT_OUT, loadCatalog, validateQuestionFiles } from "../build-question-seed.mjs";

export const LEGACY_SOURCE = "jazira-original";
const LEGACY_FIELDS = ["key", "topic", "difficulty", "stem", "passage", "choices", "answer", "explanation", "time_limit_seconds", "tags"];
const FILE_FIELDS = ["source", "exam", "section", "questions"];
/** Topics whose option order is part of the item (§5.4). */
const FIXED_ORDER_TOPICS = { comparison: "conventional_scale", "contextual-error": "source_order" };
const levelToLegacy = { 2: 1, 3: 2, 4: 3 };
const cOrder = (a, b) => Buffer.compare(Buffer.from(String(a), "utf8"), Buffer.from(String(b), "utf8"));

export class LegacyError extends Error {}
const fail = (msg) => {
  throw new LegacyError(msg);
};

const trimmed = (v, what) => (typeof v === "string" && v === v.trim() && v !== "" ? v : fail(`${what} must be a trimmed non-empty string`));

/**
 * Legacy files → canonical questions and stimuli.
 * @param {{label, json}[]} files   the parsed source files
 * @param {object} o  { now, existing: Map<id, question> (current staging), existingStimuli }
 */
export function legacyToCanonical(files, catalog, { now = isoNow(), existing = new Map() } = {}) {
  const questions = [];
  const stimuli = new Map();
  for (const { label, json } of files) {
    const extraFile = Object.keys(json).filter((k) => !FILE_FIELDS.includes(k));
    if (extraFile.length) fail(`${label}: unsupported file fields ${extraFile.join(", ")}`);
    if (json.source !== LEGACY_SOURCE) fail(`${label}: source ${json.source} is not ${LEGACY_SOURCE}`);
    const sec = catalog.SECTIONS[json.section];
    if (!catalog.EXAMS[json.exam] || !sec || sec.exam !== json.exam) fail(`${label}: unknown exam/section ${json.exam}/${json.section}`);
    for (const src of json.questions) {
      const at = `${label} ${src.key}`;
      const keys = Object.keys(src);
      if (keys.length !== LEGACY_FIELDS.length || !LEGACY_FIELDS.every((k) => keys.includes(k))) fail(`${at}: fields must be exactly ${LEGACY_FIELDS.join(", ")}`);
      if (!sec.topics.includes(src.topic)) fail(`${at}: topic ${src.topic}`);
      const level = legacyDifficultyLevel(src.difficulty) ?? fail(`${at}: difficulty ${src.difficulty}`);
      const choices = src.choices.map((c, i) => trimmed(c, `${at} choice ${i}`));
      if (!Number.isInteger(src.answer) || src.answer < 0 || src.answer >= choices.length) fail(`${at}: answer index`);
      let stimulus = null;
      if (src.passage !== null) {
        const text = trimmed(src.passage, `${at} passage`);
        stimulus = { schema: "stimulus@1", id: stimulusId(text), language: "ar", text, origin: "internal_authored", source: null };
        const seen = stimuli.get(stimulus.id);
        if (seen && seen.text !== text) fail(`${at}: passage collides with another passage after normalization`);
        stimuli.set(stimulus.id, stimulus);
      }
      const ids = opaqueIds("o", src.key, choices);
      const q = {
        schema: "question@1", id: src.key, revision: 1, content_hash: null, scope: json.exam, curriculum: null,
        links: [{ node_id: `prep:${json.exam}/${json.section}/${src.topic}`, role: "aligned" }],
        prep: { exam: json.exam, section: json.section, topic: src.topic }, objective_id: null,
        question_type: "mcq", item_style: json.exam === "aptitude" ? "reasoning" : "application",
        difficulty: level, difficulty_band: difficultyBand(level), difficulty_source: "author", language: "ar",
        stimulus_id: stimulus?.id ?? null, stem: trimmed(src.stem, `${at} stem`),
        payload: { options: choices.map((text, i) => ({ id: ids[i], text })), answer: { option_id: ids[src.answer] }, fixed_order_reason: FIXED_ORDER_TOPICS[src.topic] ?? null },
        explanation: { text: trimmed(src.explanation, `${at} explanation`), steps: [], method: null },
        shuffle_options: false, time_limit_seconds: src.time_limit_seconds, tags: [...src.tags], computation: null, source: null,
        provenance: { origin: "internal_authored", official: false, license_status: "internal", generator: { kind: "legacy_unknown", run_id: null, prompt_version: null }, derived_from: [], template_id: null },
        status: "candidate", validation: { status: "pending", record_ids: [], checked_revision: null },
        dedup: { class: null, cluster_id: null, exclusion_group: null }, variant: null, is_premium: false, created_at: now, updated_at: now,
      };
      q.tags.forEach((t, i) => trimmed(t, `${at} tag ${i}`));
      q.shuffle_options = defaultShuffle(q);
      applyO004(q);
      rehash({ stimuli }, q);
      const old = existing.get(q.id);
      if (old) {
        if (old.content_hash === q.content_hash) {
          questions.push(old);
          continue;
        }
        Object.assign(q, { revision: old.revision + 1, created_at: old.created_at, dedup: { ...old.dedup } });
      }
      const v = validateRecord("question", q);
      if (!v.ok) fail(`${at}: ${v.errors.join("; ")}`);
      questions.push(q);
    }
  }
  return { questions: questions.sort((a, b) => cOrder(a.id, b.id)), stimuli: [...stimuli.values()].sort((a, b) => cOrder(a.id, b.id)) };
}

/** Canonical legacy records → the legacy JSON files ({label, json}), in QUESTION_FILES order. */
export function canonicalToLegacy(questions, stimuli, catalog) {
  const stimulusText = new Map([...stimuli].map((s) => [s.id, s.text]));
  const groups = new Map();
  for (const q of questions.filter(isLegacyItem)) {
    const name = `${q.prep.exam}-${q.prep.section}`;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(q);
  }
  return catalog.QUESTION_FILES.filter((name) => groups.has(name)).map((name) => {
    const list = groups.get(name).sort((a, b) => cOrder(a.id, b.id));
    const { exam, section } = list[0].prep;
    return {
      label: `${name}.json`,
      json: {
        source: LEGACY_SOURCE, exam, section,
        questions: list.map((q) => ({
          key: q.id, topic: q.prep.topic, difficulty: levelToLegacy[q.difficulty], stem: q.stem,
          passage: q.stimulus_id ? stimulusText.get(q.stimulus_id) ?? fail(`${q.id}: stimulus ${q.stimulus_id} missing`) : null,
          choices: q.payload.options.map((o) => o.text),
          answer: q.payload.options.findIndex((o) => o.id === q.payload.answer.option_id),
          explanation: q.explanation.text, time_limit_seconds: q.time_limit_seconds, tags: [...q.tags],
        })),
      },
    };
  });
}

/** Read the legacy source files named in the catalog. */
export function readLegacyFiles(catalog, inDir = DEFAULT_IN_DIR) {
  return catalog.QUESTION_FILES.filter((n) => existsSync(join(inDir, `${n}.json`)))
    .map((n) => ({ label: `${n}.json`, json: JSON.parse(readFileSync(join(inDir, `${n}.json`), "utf8")) }));
}

/**
 * Both losslessness proofs. @returns {{ ok, problems: string[], sql }}
 */
export function verifyLossless(sourceFiles, questions, stimuli, catalog, { seedFile = DEFAULT_OUT } = {}) {
  const problems = [];
  const back = canonicalToLegacy(questions, stimuli, catalog);
  if (back.length !== sourceFiles.length) problems.push(`${back.length} files rebuilt for ${sourceFiles.length} sources`);
  for (const src of sourceFiles) {
    const got = back.find((b) => b.label === src.label);
    if (!got || !isDeepStrictEqual(got.json, src.json)) problems.push(`${src.label}: canonical → legacy JSON differs from the source`);
  }
  const { errors, files } = validateQuestionFiles(back, catalog);
  if (errors.length) problems.push(...errors.map((e) => `seed validation: ${e}`));
  const sql = files.length ? buildSeedSql(files) : "";
  if (existsSync(seedFile) && sql !== readFileSync(seedFile, "utf8")) problems.push(`buildSeedSql(canonical) is not byte-identical to ${seedFile}`);
  return { ok: problems.length === 0, problems, sql };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
export function parseArgs(argv) {
  const o = { in: DEFAULT_IN_DIR, staging: DEFAULT_STAGING, now: null, verifyOnly: false, seed: DEFAULT_OUT };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--in") o.in = resolve(next());
    else if (a === "--staging") o.staging = resolve(next());
    else if (a === "--now") o.now = next();
    else if (a === "--seed") o.seed = resolve(next());
    else if (a === "--verify-only") o.verifyOnly = true;
    else if (a === "--help" || a === "-h") o.help = true;
    else throw new Error(`unknown option ${a}`);
  }
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
    log.log("usage: node scripts/content/convert-legacy.mjs [--in dir] [--staging dir] [--now iso] [--seed 0011.sql] [--verify-only]");
    return 0;
  }
  try {
    const catalog = await loadCatalog();
    const sources = readLegacyFiles(catalog, o.in);
    if (!sources.length) throw new LegacyError(`no legacy files in ${o.in}`);
    const bank = loadStaging(o.staging);
    const { questions, stimuli } = legacyToCanonical(sources, catalog, { now: o.now ?? isoNow(), existing: bank.questions });
    const proof = verifyLossless(sources, questions, stimuli, catalog, { seedFile: o.seed });
    for (const p of proof.problems) log.error(`not lossless: ${p}`);
    if (!proof.ok) return 1;
    log.log(`lossless: ${questions.length} items; legacy JSON deep-equal; seed SQL byte-identical to ${o.seed.replace(REPO_ROOT, ".")}`);
    if (o.verifyOnly) return 0;
    for (const q of questions) {
      bank.questions.set(q.id, q);
      bank.where.set(q.id, bank.where.get(q.id) ?? questionShardBase(q));
    }
    for (const s of stimuli) {
      bank.stimuli.set(s.id, s);
      bank.stimulusWhere.set(s.id, bank.stimulusWhere.get(s.id) ?? stimulusShardBase(questionShardBase(questions.find((q) => q.stimulus_id === s.id))));
    }
    const written = [...saveQuestions(bank), ...saveStimuli(bank)];
    log.log(written.length ? written.map((f) => `wrote ${f}`).join("\n") : "no changes");
    return 0;
  } catch (e) {
    log.error(`error: ${e.message}`);
    return 1;
  }
}

const invokedDirectly = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) main().then((code) => { process.exitCode = code; });
