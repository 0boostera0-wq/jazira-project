#!/usr/bin/env node
// ============================================================================
// Question bank → SQL seed.
//
//   node scripts/build-question-seed.mjs            validate + write supabase/migrations/0011_seed_questions.sql
//   node scripts/build-question-seed.mjs --check    validate only (exit 1 on any error), writes nothing
//
// Options
//   --in <dir>       question directory (default src/content/questions); reads
//                    <dir>/<name>.json for every QUESTION_FILES entry that exists
//   --file <path>    use these files instead (repeatable), e.g. a test fixture
//   --out <path>     output file (default supabase/migrations/0011_seed_questions.sql)
//   --stdout         print the SQL instead of writing a file
//
// Input format (one file per exam section):
//   { "source": "jazira-original", "exam": "aptitude", "section": "quantitative",
//     "questions": [ { "key": "aq-001", "topic": "arithmetic", "difficulty": 1,
//                      "stem": "…", "passage": null, "choices": ["…","…","…","…"],
//                      "answer": 0, "explanation": "…", "time_limit_seconds": 60,
//                      "tags": ["…"] } ] }
//   Optional per question: "premium" (bool), "year" (int), "source_ref" (string),
//   "language" ("ar" | "en").
//
// Output is deterministic (same input → byte-identical SQL; no timestamps) and
// idempotent: questions upsert on `key`, answer keys upsert on question_id, and
// unchanged rows are not rewritten. Every string is dollar-quoted with a tag
// that does not occur in it, so any Arabic/Latin text, quotes or backslashes
// are safe. Questions removed from the JSON are NOT deleted or deactivated
// (attempt history references them) — set is_active = false explicitly.
// ============================================================================
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "..");
export const DEFAULT_IN_DIR = path.join(REPO_ROOT, "src", "content", "questions");
export const DEFAULT_OUT = path.join(REPO_ROOT, "supabase", "migrations", "0011_seed_questions.sql");
const CATALOG_FILE = path.join(REPO_ROOT, "src", "lib", "exams", "catalog.js");

const KEY_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;
const KNOWN_FIELDS = new Set([
  "key", "topic", "difficulty", "stem", "passage", "choices", "answer", "explanation",
  "time_limit_seconds", "tags", "premium", "year", "source_ref", "language",
]);
const LIMITS = { stem: 4000, passage: 8000, choice: 1000, explanation: 8000, tag: 60, tags: 12, sourceRef: 200 };

/**
 * Load src/lib/exams/catalog.js without Node's "typeless package" reparse
 * warning (the repo has no "type": "module"): import it as a data: URL module.
 */
export async function loadCatalog() {
  const src = readFileSync(CATALOG_FILE, "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(src, "utf8").toString("base64")}`);
}

const isInt = (v) => typeof v === "number" && Number.isInteger(v);
const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;
const hasNul = (v) => typeof v === "string" && v.includes("\u0000");

/**
 * Validate one parsed question file.
 * @returns {{ errors: string[], warnings: string[], file: object|null }}
 *   `file` is the normalised file (trimmed strings, defaults applied) when valid.
 */
export function validateQuestionFile(json, catalog, label = "file") {
  const { EXAMS, SECTIONS, DIFFICULTIES } = catalog;
  const errors = [];
  const warnings = [];
  const err = (where, msg) => errors.push(`${label}${where ? ` ${where}` : ""}: ${msg}`);
  const warn = (where, msg) => warnings.push(`${label}${where ? ` ${where}` : ""}: ${msg}`);

  if (!json || typeof json !== "object" || Array.isArray(json)) {
    err("", "must be a JSON object");
    return { errors, warnings, file: null };
  }
  const { source, exam, section, questions } = json;
  if (typeof source !== "string" || !SLUG_RE.test(source)) err("source", `invalid source slug ${JSON.stringify(source)}`);
  if (!Object.prototype.hasOwnProperty.call(EXAMS, exam)) err("exam", `unknown exam ${JSON.stringify(exam)}`);
  const sec = Object.prototype.hasOwnProperty.call(SECTIONS, section) ? SECTIONS[section] : null;
  if (!sec) err("section", `unknown section ${JSON.stringify(section)}`);
  else if (sec.exam !== exam) err("section", `section "${section}" belongs to exam "${sec.exam}", not "${exam}"`);
  if (!Array.isArray(questions) || questions.length === 0) {
    err("questions", "must be a non-empty array");
    return { errors, warnings, file: null };
  }

  const out = [];
  const keys = new Set();
  const stems = new Map();
  questions.forEach((q, i) => {
    const at = `questions[${i}]${q && typeof q.key === "string" ? ` (${q.key})` : ""}`;
    if (!q || typeof q !== "object" || Array.isArray(q)) {
      err(at, "must be an object");
      return;
    }
    const before = errors.length;
    for (const k of Object.keys(q)) if (!KNOWN_FIELDS.has(k)) warn(at, `unknown field "${k}" ignored`);
    for (const [k, v] of Object.entries(q)) {
      if (hasNul(v) || (Array.isArray(v) && v.some(hasNul))) err(at, `field "${k}" contains a NUL character`);
    }

    if (typeof q.key !== "string" || !KEY_RE.test(q.key)) err(at, "key must match ^[a-z0-9][a-z0-9-]{1,39}$");
    else if (keys.has(q.key)) err(at, `duplicate key "${q.key}"`);
    else keys.add(q.key);

    if (sec && !sec.topics.includes(q.topic)) err(at, `topic ${JSON.stringify(q.topic)} is not a ${section} topic`);
    if (!DIFFICULTIES.includes(q.difficulty)) err(at, `difficulty must be one of ${DIFFICULTIES.join(", ")}`);

    if (!isNonEmptyString(q.stem)) err(at, "stem must be a non-empty string");
    else if (q.stem.trim().length > LIMITS.stem) err(at, `stem longer than ${LIMITS.stem} characters`);

    let passage = null;
    if (q.passage !== undefined && q.passage !== null) {
      if (typeof q.passage !== "string") err(at, "passage must be a string or null");
      else if (q.passage.trim().length > LIMITS.passage) err(at, `passage longer than ${LIMITS.passage} characters`);
      else passage = q.passage.trim() || null;
    }

    let choices = [];
    if (!Array.isArray(q.choices) || q.choices.length < 2 || q.choices.length > 6) {
      err(at, "choices must be an array of 2–6 strings");
    } else if (!q.choices.every(isNonEmptyString)) {
      err(at, "every choice must be a non-empty string");
    } else {
      choices = q.choices.map((c) => c.trim());
      if (choices.some((c) => c.length > LIMITS.choice)) err(at, `a choice is longer than ${LIMITS.choice} characters`);
      if (new Set(choices).size !== choices.length) err(at, "choices must be unique");
    }

    if (!isInt(q.answer) || q.answer < 0 || (choices.length && q.answer >= choices.length)) {
      err(at, "answer must be the 0-based index of one of the choices");
    }
    if (!isNonEmptyString(q.explanation)) err(at, "explanation must be a non-empty string");
    else if (q.explanation.trim().length > LIMITS.explanation) err(at, `explanation longer than ${LIMITS.explanation} characters`);

    let time = 60;
    if (q.time_limit_seconds !== undefined && q.time_limit_seconds !== null) {
      if (!isInt(q.time_limit_seconds) || q.time_limit_seconds < 10 || q.time_limit_seconds > 600) {
        err(at, "time_limit_seconds must be an integer between 10 and 600");
      } else time = q.time_limit_seconds;
    }

    let tags = [];
    if (q.tags !== undefined && q.tags !== null) {
      if (!Array.isArray(q.tags) || !q.tags.every(isNonEmptyString)) err(at, "tags must be an array of non-empty strings");
      else {
        tags = [...new Set(q.tags.map((t) => t.trim()))];
        if (tags.length > LIMITS.tags) err(at, `at most ${LIMITS.tags} tags`);
        if (tags.some((t) => t.length > LIMITS.tag)) err(at, `a tag is longer than ${LIMITS.tag} characters`);
      }
    }

    if (q.premium !== undefined && typeof q.premium !== "boolean") err(at, "premium must be a boolean");
    if (q.year !== undefined && q.year !== null && (!isInt(q.year) || q.year < 1950 || q.year > 2100)) err(at, "year must be an integer 1950–2100");
    if (q.source_ref !== undefined && q.source_ref !== null && (typeof q.source_ref !== "string" || q.source_ref.length > LIMITS.sourceRef)) {
      err(at, `source_ref must be a string of at most ${LIMITS.sourceRef} characters`);
    }
    if (q.language !== undefined && q.language !== "ar" && q.language !== "en") err(at, 'language must be "ar" or "en"');

    if (isNonEmptyString(q.stem)) {
      // same stem + passage + choices = a real duplicate (instructions like
      // "choose the odd word" legitimately repeat with different choices)
      const norm = `${q.stem.trim()}\u0001${passage || ""}\u0001${choices.join("\u0002")}`;
      if (stems.has(norm)) warn(at, `duplicate of ${stems.get(norm)} (same stem, passage and choices)`);
      else stems.set(norm, q.key);
    }

    if (errors.length === before) {
      out.push({
        key: q.key,
        topic: q.topic,
        difficulty: q.difficulty,
        stem: q.stem.trim(),
        passage,
        choices,
        answer: q.answer,
        explanation: q.explanation.trim(),
        time_limit_seconds: time,
        tags,
        premium: q.premium === true,
        year: q.year ?? null,
        source_ref: q.source_ref ?? null,
        language: q.language || "ar",
      });
    }
  });

  return {
    errors,
    warnings,
    file: errors.length ? null : { source, exam, section, questions: out },
  };
}

/**
 * Validate several files together (also checks keys are unique across files).
 * @param {{ label: string, json: any }[]} inputs
 */
export function validateQuestionFiles(inputs, catalog) {
  const errors = [];
  const warnings = [];
  const files = [];
  const owner = new Map();
  for (const { label, json } of inputs) {
    const r = validateQuestionFile(json, catalog, label);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
    if (!r.file) continue;
    for (const q of r.file.questions) {
      if (owner.has(q.key)) errors.push(`${label} (${q.key}): key already used in ${owner.get(q.key)}`);
      else owner.set(q.key, label);
    }
    files.push({ label, ...r.file });
  }
  return { errors, warnings, files: errors.length ? [] : files };
}

/** Dollar-quote any string with a tag that cannot occur inside it. */
export function dollarQuote(value) {
  const s = String(value);
  let tag = "q";
  for (let i = 1; s.includes(`$${tag}$`); i++) tag = `q${i}`;
  return `$${tag}$${s}$${tag}$`;
}

const lit = (v) => (v === null || v === undefined ? "null" : dollarQuote(v));
const textArray = (arr) => (arr.length ? `array[${arr.map(dollarQuote).join(", ")}]::text[]` : "'{}'::text[]");

/**
 * Build the seed SQL for validated files (output of validateQuestionFiles).
 * @param {{ label: string, source: string, exam: string, section: string, questions: object[] }[]} files
 */
export function buildSeedSql(files, { generator = "scripts/build-question-seed.mjs" } = {}) {
  const hash = createHash("sha256").update(JSON.stringify(files.map(({ label, ...f }) => f))).digest("hex");
  const total = files.reduce((n, f) => n + f.questions.length, 0);
  const sources = [...new Set(files.map((f) => f.source))].sort();
  const L = [];
  L.push("-- ============================================================================");
  L.push(`-- GENERATED by ${generator} — do not edit by hand.`);
  L.push("-- Re-generate after changing src/content/questions/*.json:");
  L.push("--   node scripts/build-question-seed.mjs");
  L.push("--");
  for (const f of files) L.push(`--   ${f.label}: ${f.questions.length} questions (${f.exam}/${f.section})`);
  L.push(`--   total: ${total}`);
  L.push(`-- content sha256: ${hash}`);
  L.push("-- Idempotent: upserts questions on key and answer keys on question_id.");
  L.push("-- ============================================================================");
  L.push("begin;");
  L.push("");
  L.push("do $seed$");
  L.push("begin");
  for (const s of sources) {
    L.push(`  if not exists (select 1 from public.question_sources where slug = '${s}') then`);
    L.push(`    raise exception 'question source "${s}" is missing — apply 0010_learning_platform.sql first';`);
    L.push("  end if;");
  }
  L.push("end");
  L.push("$seed$;");

  const cols = "key, exam, section, topic, difficulty, stem, passage, choices, time_limit_seconds, tags, source_id, source_ref, year, language, is_premium, is_active";
  const upd = ["exam", "section", "topic", "difficulty", "stem", "passage", "choices", "time_limit_seconds", "tags",
    "source_id", "source_ref", "year", "language", "is_premium", "is_active"];

  for (const f of files) {
    const src = `(select s.id from public.question_sources s where s.slug = '${f.source}')`;
    L.push("");
    L.push(`-- ${f.label} — ${f.questions.length} questions`);
    L.push(`insert into public.questions as q (${cols})`);
    L.push("values");
    f.questions.forEach((q, i) => {
      const row = [
        `'${q.key}'`, `'${f.exam}'`, `'${f.section}'`, `'${q.topic}'`, String(q.difficulty),
        lit(q.stem), lit(q.passage), `${dollarQuote(JSON.stringify(q.choices))}::jsonb`, String(q.time_limit_seconds),
        textArray(q.tags), src, lit(q.source_ref), q.year === null ? "null" : String(q.year),
        `'${q.language}'`, q.premium ? "true" : "false", "true",
      ];
      L.push(`  (${row.join(", ")})${i === f.questions.length - 1 ? "" : ","}`);
    });
    L.push("on conflict (key) do update set");
    L.push(upd.map((c) => `  ${c} = excluded.${c}`).join(",\n"));
    L.push(`where (${upd.map((c) => `q.${c}`).join(", ")})`);
    L.push(`  is distinct from (${upd.map((c) => `excluded.${c}`).join(", ")});`);

    L.push("");
    L.push("insert into public.question_keys as k (question_id, correct_index, explanation)");
    L.push("select q.id, v.correct_index, v.explanation");
    L.push("  from (values");
    f.questions.forEach((q, i) => {
      L.push(`    ('${q.key}', ${q.answer}, ${lit(q.explanation)})${i === f.questions.length - 1 ? "" : ","}`);
    });
    L.push("  ) as v (key, correct_index, explanation)");
    L.push("  join public.questions q on q.key = v.key");
    L.push("on conflict (question_id) do update set");
    L.push("  correct_index = excluded.correct_index,");
    L.push("  explanation   = excluded.explanation");
    L.push("where (k.correct_index, k.explanation) is distinct from (excluded.correct_index, excluded.explanation);");
  }
  L.push("");
  L.push("commit;");
  L.push("");
  return L.join("\n");
}

function parseArgs(argv) {
  const opts = { check: false, stdout: false, inDir: DEFAULT_IN_DIR, out: DEFAULT_OUT, files: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--check") opts.check = true;
    else if (a === "--stdout") opts.stdout = true;
    else if (a === "--in") opts.inDir = path.resolve(next());
    else if (a === "--out") opts.out = path.resolve(next());
    else if (a === "--file") opts.files.push(path.resolve(next()));
    else if (a === "--help" || a === "-h") opts.help = true;
    else throw new Error(`unknown option ${a}`);
  }
  return opts;
}

/** CLI entry. Returns the process exit code. */
export async function main(argv = process.argv.slice(2), log = console) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    log.error(`error: ${e.message}`);
    return 2;
  }
  if (opts.help) {
    log.log("usage: node scripts/build-question-seed.mjs [--check] [--in dir] [--file path]... [--out path] [--stdout]");
    return 0;
  }
  const catalog = await loadCatalog();

  const targets = opts.files.length
    ? opts.files.map((p) => ({ label: path.basename(p), p }))
    : catalog.QUESTION_FILES.map((name) => ({ label: `${name}.json`, p: path.join(opts.inDir, `${name}.json`) }));

  const inputs = [];
  const skipped = [];
  const parseErrors = [];
  for (const t of targets) {
    if (!existsSync(t.p)) {
      if (opts.files.length) parseErrors.push(`${t.label}: file not found (${t.p})`);
      else skipped.push(t.label);
      continue;
    }
    try {
      inputs.push({ label: t.label, json: JSON.parse(readFileSync(t.p, "utf8")) });
    } catch (e) {
      parseErrors.push(`${t.label}: invalid JSON — ${e.message}`);
    }
  }

  const { errors, warnings, files } = validateQuestionFiles(inputs, catalog);
  const allErrors = [...parseErrors, ...errors];
  for (const w of warnings) log.warn(`warning: ${w}`);
  for (const s of skipped) log.warn(`skipped: ${s} (not found)`);
  for (const e of allErrors) log.error(`error: ${e}`);

  const summary = inputs.map((i) => {
    const f = files.find((x) => x.label === i.label);
    return f ? `${i.label}: ${f.questions.length}` : `${i.label}: invalid`;
  });
  // With --stdout the SQL owns stdout; the summary goes to stderr so the output stays valid SQL.
  if (summary.length) {
    if (opts.stdout) log.error(summary.join("\n"));
    else log.log(summary.join("\n"));
  }

  if (allErrors.length) {
    log.error(`${allErrors.length} error(s) — ${opts.check ? "check failed" : "nothing written"}`);
    return 1;
  }
  if (!files.length) {
    log.error("no question files found — nothing to do");
    return 1;
  }
  const total = files.reduce((n, f) => n + f.questions.length, 0);
  if (opts.check) {
    log.log(`ok: ${files.length} file(s), ${total} question(s) valid`);
    return 0;
  }
  const sql = buildSeedSql(files);
  if (opts.stdout) {
    process.stdout.write(sql);
    return 0;
  }
  writeFileSync(opts.out, sql, "utf8");
  log.log(`wrote ${path.relative(process.cwd(), opts.out) || opts.out}: ${files.length} file(s), ${total} question(s)`);
  return 0;
}

const invokedDirectly = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) {
  main().then((code) => { process.exitCode = code; });
}
