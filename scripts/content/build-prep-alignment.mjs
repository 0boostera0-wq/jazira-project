#!/usr/bin/env node
// ============================================================================
// Achievement (Tahsili-style) prep alignment (docs/CONTENT_ENGINE.md §4.3b).
//
// Writes data/staging/curriculum/prep-alignment.jsonl (prep-alignment@1):
// `prep:achievement/<section>/<topic>` ↔ curriculum node. The alignment is
// VERIFIED only from a publicly retrievable Qiyas specification with
// provenance (`--spec <file>`: https source_url + retrieved_at). Without one,
// every row is a candidate at subject level with `needs_review`, and no
// question links to prep topics may be created from it (WP4 reads `status`).
// The spec itself is never invented here: the tool refuses a spec without
// provenance.
//
// Spec file (JSON, kept outside data/staging or under reports/, owner-supplied):
//   { "source_url": "https://…", "retrieved_at": "2026-10-01", "publisher": "…",
//     "topics": [ { "prep_topic": "prep:achievement/math/algebra",
//                   "subjects": ["math"], "units": ["<unit title as printed>", …] } ] }
//
// USAGE
//   node scripts/content/build-prep-alignment.mjs [--spec <file>] [--check]
// Exit 0 ok · 1 stale (--check) · 2 usage/input error.
// ============================================================================

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { trigramJaccard } from "../../src/lib/content/normalize.js";
import { compareC } from "../../src/lib/content/prng.js";
import { readJsonl, writeFileIfChanged } from "./lib/jsonl.mjs";
import { stringifyRecord } from "./lib/schemas.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const UNIT_MATCH = 0.6;
const HTTPS = /^https:\/\/[^\s]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/;

export class SpecError extends Error {}

/** Validate an owner-supplied Qiyas spec; returns it normalized or throws SpecError. */
export function checkSpec(spec, sections) {
  if (!spec || typeof spec !== "object") throw new SpecError("spec must be a JSON object");
  if (!HTTPS.test(String(spec.source_url ?? ""))) throw new SpecError("spec.source_url must be the https URL the specification was retrieved from");
  if (!DATE.test(String(spec.retrieved_at ?? ""))) throw new SpecError("spec.retrieved_at must be an ISO date");
  if (!Array.isArray(spec.topics) || !spec.topics.length) throw new SpecError("spec.topics must be a non-empty array");
  for (const t of spec.topics) {
    const m = /^prep:achievement\/([a-z0-9-]+)\/([a-z0-9-]+)$/.exec(String(t?.prep_topic ?? ""));
    if (!m || sections[m[1]]?.exam !== "achievement" || !sections[m[1]].topics.includes(m[2])) throw new SpecError(`unknown achievement topic ${JSON.stringify(t?.prep_topic)}`);
    if (!Array.isArray(t.units) || t.units.some((u) => typeof u !== "string" || !u.trim())) throw new SpecError(`${t.prep_topic}: units must be non-empty strings`);
  }
  return spec;
}

/**
 * Pure builder.
 * @param {object} p
 * @param {object} p.sections   SECTIONS of src/lib/exams/catalog.js
 * @param {object[]} p.nodes    curriculum-node@1 rows (subjects and units are used)
 * @param {object|null} p.spec  checked spec, or null
 * @returns {object[]} prep-alignment@1 rows sorted by (prep_topic, node_id)
 */
export function buildPrepAlignment({ sections, nodes, spec = null }) {
  const rows = new Map();
  const add = (r) => {
    const key = `${r.prep_topic}|${r.node_id}`;
    const prev = rows.get(key);
    if (!prev || (prev.status !== "verified" && r.status === "verified")) rows.set(key, r);
  };
  const subjectsFor = (sectionId, ids = [sectionId]) =>
    nodes.filter((n) => n.kind === "subject" && n.stage === "high-school" && n.status !== "source_only" && ids.includes(n.id.split("/").pop()));
  const unitsOf = (subjectId) => nodes.filter((n) => n.subject === subjectId && (n.kind === "unit" || n.kind === "chapter"));

  for (const [sectionId, section] of Object.entries(sections).sort((a, b) => compareC(a[0], b[0]))) {
    if (section.exam !== "achievement") continue;
    for (const topic of section.topics) {
      const prepTopic = `prep:achievement/${sectionId}/${topic}`;
      const specTopic = spec?.topics.find((t) => t.prep_topic === prepTopic) ?? null;
      const subjects = subjectsFor(sectionId, specTopic?.subjects?.length ? specTopic.subjects : [sectionId]);
      for (const s of subjects) {
        add({ schema: "prep-alignment@1", prep_topic: prepTopic, node_id: s.id, source_url: null, retrieved_at: null, status: "needs_review" });
        if (!specTopic) continue;
        for (const title of specTopic.units) {
          let best = null;
          for (const u of unitsOf(s.id)) {
            const score = trigramJaccard(title, u.title_ar);
            if (score >= UNIT_MATCH && (!best || score > best.score || (score === best.score && compareC(u.id, best.u.id) < 0))) best = { u, score };
          }
          if (best) add({ schema: "prep-alignment@1", prep_topic: prepTopic, node_id: best.u.id, source_url: spec.source_url, retrieved_at: spec.retrieved_at, status: "verified" });
        }
      }
    }
  }
  return [...rows.values()].sort((a, b) => compareC(a.prep_topic, b.prep_topic) || compareC(a.node_id, b.node_id));
}

function readNodes(dir) {
  const out = [];
  const walk = (d) => {
    if (!existsSync(d)) return;
    for (const f of readdirSync(d).sort()) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith(".jsonl")) out.push(...readJsonl(p));
    }
  };
  walk(dir);
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--spec");
  const known = new Set(["--spec", "--check"]);
  const bad = args.filter((a) => a.startsWith("--") && !known.has(a)).concat(i >= 0 && !args[i + 1] ? ["--spec <file>"] : []);
  if (bad.length) {
    console.error(`usage: node scripts/content/build-prep-alignment.mjs [--spec <file>] [--check]  (bad: ${bad.join(", ")})`);
    process.exit(2);
  }
  const { SECTIONS } = await import(pathToFileURL(join(ROOT, "src/lib/exams/catalog.js")).href);
  let spec = null;
  if (i >= 0) {
    try {
      spec = checkSpec(JSON.parse(readFileSync(resolve(args[i + 1]), "utf8")), SECTIONS);
    } catch (e) {
      console.error(`build-prep-alignment: ${e.message}`);
      process.exit(2);
    }
  }
  const nodes = readNodes(join(ROOT, "data/staging/curriculum/nodes"));
  if (!nodes.length) {
    console.error("build-prep-alignment: no curriculum nodes — run node scripts/content/build-curriculum.mjs first");
    process.exit(2);
  }
  const rows = buildPrepAlignment({ sections: SECTIONS, nodes, spec });
  const text = rows.map((r) => stringifyRecord("prep-alignment", r)).join("\n") + (rows.length ? "\n" : "");
  const out = join(ROOT, "data/staging/curriculum/prep-alignment.jsonl");
  const counts = rows.reduce((m, r) => ((m[r.status] = (m[r.status] ?? 0) + 1), m), {});
  if (args.includes("--check")) {
    const current = existsSync(out) ? readFileSync(out, "utf8") : null;
    if (current !== text) {
      console.error(`✗ prep-alignment.jsonl is ${current === null ? "missing" : "stale"}`);
      process.exit(1);
    }
    console.log(`✓ prep-alignment.jsonl is current ${JSON.stringify(counts)}`);
    return;
  }
  writeFileIfChanged(out, text);
  console.log(`✓ ${rows.length} prep alignment row(s) ${JSON.stringify(counts)}${spec ? "" : " — no Qiyas specification given: every row needs review"}`);
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch((e) => {
    console.error(e?.stack ?? String(e));
    process.exit(1);
  });
}
