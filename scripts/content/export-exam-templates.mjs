#!/usr/bin/env node
// ============================================================================
// Export the exam templates (docs/CONTENT_ENGINE.md §2.12): the engine's
// source of truth, src/lib/exams/engine/exam-templates.js, is written to
// data/staging/exams/templates.json (exam-template@1, a JSON array sorted by
// id and version, keys in schema order). The importer loads that file into
// the exam_templates table (WP7).
//
//   node scripts/content/export-exam-templates.mjs [--out data/staging/exams/templates.json] [--check]
//
// --check: exit 1 when the file on disk differs from the engine (stale export).
// ============================================================================
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileIfChanged } from "./lib/jsonl.mjs";
import { orderKeys } from "./lib/schemas.mjs";
import { TEMPLATES, validateTemplate } from "../../src/lib/exams/engine/exam-templates.js";

const REPO = resolve(fileURLToPath(import.meta.url), "../../..");
export const DEFAULT_OUT = join(REPO, "data/staging/exams/templates.json");

const byIdVersion = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.version - b.version);

/** The exported text (2-space JSON, final newline). Throws on an invalid template. */
export function renderTemplates(list = TEMPLATES) {
  const problems = list.flatMap(validateTemplate);
  if (problems.length) throw new Error(`invalid templates:\n${problems.join("\n")}`);
  const records = [...list].sort(byIdVersion).map((t) => orderKeys("exam-template", JSON.parse(JSON.stringify(t))));
  return `${JSON.stringify(records, null, 2)}\n`;
}

export function exportTemplates({ out = DEFAULT_OUT, check = false } = {}) {
  const text = renderTemplates();
  if (check) return { ok: existsSync(out) && readFileSync(out, "utf8") === text, changed: false, count: TEMPLATES.length };
  const changed = writeFileIfChanged(out, text);
  return { ok: true, changed, count: TEMPLATES.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let out = DEFAULT_OUT;
  let check = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--out" && args[i + 1]) out = resolve(args[++i]);
    else if (args[i] === "--check") check = true;
    else {
      console.error("usage: export-exam-templates [--out <file>] [--check]");
      process.exit(2);
    }
  }
  const r = exportTemplates({ out, check });
  if (check) console.log(r.ok ? `templates.json is current (${r.count} templates)` : "templates.json is stale — run export-exam-templates");
  else console.log(`${r.count} templates → ${out}${r.changed ? "" : " (unchanged)"}`);
  process.exit(r.ok ? 0 : 1);
}
