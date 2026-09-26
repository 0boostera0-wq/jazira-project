#!/usr/bin/env node
/* ============================================================================
 * Jazira — curriculum source manifest builder
 * ----------------------------------------------------------------------------
 * Generates src/content/curriculum/manifest.json: one row per resource type
 * (student_book · activity_book · exam_samples) per subject per term, with its
 * official source reference, availability and verification status.
 *
 * Inputs
 *   src/lib/curriculum.js                       the catalog (stages → subjects)
 *   src/content/curriculum/verified-k9.json     research: grades 1–9
 *   src/content/curriculum/verified-secondary.json  research: secondary
 *   src/content/curriculum/hosted.js            register of AUTHORISED hosted files
 *
 * Before writing anything it cross-checks every catalog leaf against the
 * verified research (subject ids, official Arabic names, annual periods, plan
 * labels) and refuses to build on any difference.
 *
 * USAGE
 *   node scripts/build-curriculum-manifest.mjs           write the manifest
 *   node scripts/build-curriculum-manifest.mjs --check   verify only (exit 1 if
 *                                                        the catalog disagrees with
 *                                                        the research or the file
 *                                                        is stale)
 * See docs/CURRICULUM.md.
 * ========================================================================== */

import { promises as fs, existsSync } from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CONTENT = path.join(ROOT, "src", "content", "curriculum");
const OUT = path.join(CONTENT, "manifest.json");
const PUBLIC_DIR = path.join(ROOT, "public", "resources");

// ── cross-check: catalog vs. verified research ─────────────────────────────
function leafSubjects(catalog, slug) {
  const r = catalog.resolveCurriculum(slug);
  return r?.node?.subjects || null;
}

function compareLeaf(label, actual, expected, problems) {
  if (!actual) {
    problems.push(`${label}: leaf missing from the catalog`);
    return;
  }
  const a = new Map(actual.map((s) => [s.id, s]));
  const e = new Map(expected.map((s) => [s.id, s]));
  for (const [id, x] of e) {
    const s = a.get(id);
    if (!s) { problems.push(`${label}: missing verified subject "${id}" (${x.name})`); continue; }
    if (s.name !== x.name) problems.push(`${label}/${id}: name "${s.name}" ≠ official "${x.name}"`);
    if (s.periods !== x.periods) problems.push(`${label}/${id}: periods ${s.periods} ≠ official ${x.periods}`);
    const al = JSON.stringify(s.labels || []);
    const el = JSON.stringify(x.labels || []);
    if (al !== el) problems.push(`${label}/${id}: plan labels ${al} ≠ official ${el}`);
  }
  for (const id of a.keys()) if (!e.has(id)) problems.push(`${label}: "${id}" is not in the official plan for this leaf`);
}

/** Every difference between the catalog and the verified research ([] = in sync). */
export function crossCheck(catalog, k9, secondary) {
  const problems = [];
  const checked = new Set();

  if (k9?.terms?.count !== 2 || secondary?.terms?.count !== 2) problems.push("research: term count is not 2");
  if (catalog.TERMS.length !== 2) problems.push("catalog: TERMS must have exactly two terms");

  for (const stage of k9.stages || []) {
    for (const grade of stage.grades || []) {
      for (const track of grade.tracks || []) {
        if (!track.catalog_path) continue; // e.g. tahfeez schools — not modelled (docs/CURRICULUM.md)
        const slug = track.catalog_path;
        checked.add(slug.join("/"));
        const expected = track.subjects
          .filter((s) => s.status === "verified")
          .map((s) => ({ id: s.id, name: s.name_ar, periods: s.annual_periods_max, labels: [] }));
        compareLeaf(slug.join("/"), leafSubjects(catalog, slug), expected, problems);
      }
    }
  }

  for (const stage of secondary.stages || []) {
    for (const grade of stage.grades || []) {
      for (const track of grade.tracks || []) {
        const slug = [stage.id, grade.id, track.id];
        checked.add(slug.join("/"));
        const expected = track.subjects
          .filter((s) => s.status === "verified" && !s.absent_from_official_plan)
          .map((s) => ({
            id: s.id,
            name: s.name_ar,
            periods: s.periods_per_year_max,
            labels: (s.plan_labels_ar || []).filter((l) => l !== s.name_ar),
          }));
        compareLeaf(slug.join("/"), leafSubjects(catalog, slug), expected, problems);
      }
    }
  }

  for (const leaf of catalog.allLeaves()) {
    const p = leaf.slug.join("/");
    if (!checked.has(p)) problems.push(`${p}: catalog leaf has no verified research to check against`);
  }
  return problems;
}

// ── manifest ────────────────────────────────────────────────────────────────
const SOURCES = (catalog) => ({
  madrasati: {
    name_ar: `${catalog.OFFICIAL.madrasati.service} — ${catalog.OFFICIAL.madrasati.name}`,
    name_en: `${catalog.OFFICIAL.madrasati.service_en} on ${catalog.OFFICIAL.madrasati.name_en}`,
    url: catalog.OFFICIAL.madrasati.url,
    service_url: catalog.OFFICIAL.madrasati.serviceUrl,
    requires_account: true,
    note: "Official MoE channel for digital textbooks; needs an active Madrasati account. Book-level deep links are not published.",
  },
  ien: {
    name_ar: catalog.OFFICIAL.ien.name,
    name_en: catalog.OFFICIAL.ien.name_en,
    url: catalog.OFFICIAL.ien.url,
    note: "Alternative official channel named by the MoE. Redirected to a maintenance page on the access date.",
  },
  "moe-plan-guide-5": {
    name_ar: catalog.PLAN_SOURCE.name,
    name_en: catalog.PLAN_SOURCE.name_en,
    url: catalog.PLAN_SOURCE.url,
    listed_on: catalog.PLAN_SOURCE.listedOn,
    note: "Subject lists, official names and annual periods per grade/track. Annual figures only — no split by term.",
  },
  "moe-two-terms": {
    name_ar: "وزارة التعليم — إقرار فصلين دراسيين لمدارس التعليم العام (11/02/1447)",
    name_en: "MoE news — two terms approved for general-education schools (11/02/1447)",
    url: catalog.PLAN_SOURCE.termsUrl,
    also: "https://spa.gov.sa/N2373796",
  },
  research: {
    k9: "docs/research/curriculum-k9.md",
    secondary: "docs/research/curriculum-secondary.md",
  },
});

const POLICY = {
  availability: {
    external_official: "Available on the official platform (Madrasati «مقرراتي» / Muqarrarati, alternative: iEN). Jazira links out and does not host the file.",
    hosted: "Jazira hosts an authorised copy (registered in src/content/curriculum/hosted.js and present in the content store). Served by /api/content/fetch.",
    unavailable: "No authorised source identified. Nothing is linked or served.",
  },
  status: "Row status: verified = the resource itself is confirmed (hosted, authorised file); unverified = the subject is in the official plan (subject_status) but the book listing on the official platform could not be observed, so the existence of this specific resource per term is not confirmed.",
  term_status: "The plan gives periods per academic year only. Every subject is listed in both terms; term_status is unverified for every row.",
  redistribution: "Rehosting MoE/NCC textbooks is not permitted without written permission (docs/research §7–8). Only files with such permission, or Jazira's own original work, may be registered as hosted.",
};

function availabilityOf(resource, hosted, fileExists) {
  const entry = hosted.get(resource.key);
  if (!entry) return { availability: resource.availability === "hosted" ? "unavailable" : resource.availability, entry: null };
  if (entry.store === "remote") return { availability: "hosted", entry };
  if (!fileExists(resource.key)) {
    throw new Error(`hosted.js registers "${resource.key}" but no file exists at public/resources/${resource.key}`);
  }
  return { availability: "hosted", entry };
}

/** Build the manifest object (pure given its inputs). */
export function buildManifest({ catalog, k9, secondary, hostedFiles = [], fileExists = () => false }) {
  const problems = crossCheck(catalog, k9, secondary);
  if (problems.length) {
    const err = new Error(`catalog differs from the verified research:\n  - ${problems.join("\n  - ")}`);
    err.problems = problems;
    throw err;
  }

  const hosted = new Map(hostedFiles.map((f) => [f.key, f]));
  for (const key of hosted.keys()) {
    if (!catalog.findResourceByKey(key)) throw new Error(`hosted.js registers "${key}", which is not a catalog key`);
  }

  const types = new Map(catalog.RESOURCE_TYPES.map((t) => [t.id, t]));
  const terms = new Map(catalog.TERMS.map((t) => [t.id, t]));
  const rows = [];

  for (const { slug, node } of catalog.allLeaves()) {
    for (const s of node.subjects) {
      for (const r of s.resources) {
        const type = types.get(r.type);
        const term = terms.get(r.term);
        const { availability, entry } = availabilityOf(r, hosted, fileExists);
        const book = r.type !== "exam_samples";
        rows.push({
          internal_key: r.key,
          title: `${type.title} — ${s.name} — ${node.title} — ${term.name}`,
          title_en: `${type.title_en} — ${s.name_en} — ${node.title_en} — ${term.name_en}`,
          stage: slug[0],
          grade: slug[1] || null,
          track: slug[2] || null,
          term: r.term,
          subject: s.id,
          subject_name: s.name,
          subject_name_en: s.name_en,
          resource_type: r.type,
          file_type: r.file_type,
          availability,
          language: s.id === "english" ? "en" : "ar",
          year: catalog.YEAR,
          status: availability === "hosted" ? "verified" : "unverified",
          subject_status: s.status,
          term_status: s.terms_status,
          source_reference:
            availability === "hosted"
              ? { hosted: { licence: entry.licence || null, source: entry.source || null, added: entry.added || null }, plan: "moe-plan-guide-5", plan_pages: node.plan.pages }
              : availability === "external_official"
                ? { portal: "madrasati", alternate: "ien", plan: "moe-plan-guide-5", plan_pages: node.plan.pages }
                : { portal: null, plan: "moe-plan-guide-5", plan_pages: node.plan.pages },
          notes: book && s.notes.includes("noTextbook") ? ["no_textbook_likely_unverified"] : [],
        });
      }
    }
  }

  const count = (f) => rows.reduce((m, r) => ((m[r[f]] = (m[r[f]] || 0) + 1), m), {});
  return {
    $comment: "Generated by scripts/build-curriculum-manifest.mjs from src/lib/curriculum.js + the verified research. Do not edit by hand. See docs/CURRICULUM.md.",
    year: catalog.YEAR,
    academic_year_label: "1447/1448هـ (2025–2026)",
    sources_checked: catalog.SOURCES_CHECKED,
    policy: POLICY,
    sources: SOURCES(catalog),
    counts: {
      rows: rows.length,
      leaves: catalog.allLeaves().length,
      subjects: new Set(rows.map((r) => `${r.stage}/${r.grade}/${r.track}/${r.subject}`)).size,
      by_availability: count("availability"),
      by_type: count("resource_type"),
      by_status: count("status"),
    },
    rows,
  };
}

/** Stable JSON: readable header, one row per line (small, reviewable diffs). */
export function serializeManifest(manifest) {
  const { rows, ...head } = manifest;
  const top = JSON.stringify(head, null, 2).replace(/\n}$/, "");
  return `${top},\n  "rows": [\n${rows.map((r) => `    ${JSON.stringify(r)}`).join(",\n")}\n  ]\n}\n`;
}

async function loadInputs() {
  const catalog = await import(pathToFileURL(path.join(ROOT, "src", "lib", "curriculum.js")).href);
  const { HOSTED_FILES } = await import(pathToFileURL(path.join(CONTENT, "hosted.js")).href);
  const read = async (f) => JSON.parse(await fs.readFile(path.join(CONTENT, f), "utf8"));
  const [k9, secondary] = await Promise.all([read("verified-k9.json"), read("verified-secondary.json")]);
  const fileExists = (key) => {
    const p = path.join(PUBLIC_DIR, key);
    const rel = path.relative(PUBLIC_DIR, p);
    return !rel.startsWith("..") && !path.isAbsolute(rel) && existsSync(p);
  };
  return { catalog, k9, secondary, hostedFiles: HOSTED_FILES, fileExists };
}

async function main() {
  const check = process.argv.includes("--check");
  let manifest;
  try {
    manifest = buildManifest(await loadInputs());
  } catch (e) {
    console.error(`\x1b[31m✗ ${e.message}\x1b[0m`);
    process.exit(1);
  }
  const text = serializeManifest(manifest);
  const { counts } = manifest;
  const summary = `${counts.rows} rows · ${counts.subjects} subject entries · ${counts.leaves} leaves · availability ${JSON.stringify(counts.by_availability)}`;

  if (check) {
    let current = "";
    try { current = await fs.readFile(OUT, "utf8"); } catch {}
    if (current.replace(/\r\n/g, "\n") !== text) {
      console.error("\x1b[31m✗ manifest.json is stale — run: node scripts/build-curriculum-manifest.mjs\x1b[0m");
      process.exit(1);
    }
    console.log(`\x1b[32m✓ catalog matches the verified research; manifest is current\x1b[0m (${summary})`);
    return;
  }
  await fs.writeFile(OUT, text, "utf8");
  console.log(`\x1b[32m✓ wrote ${path.relative(ROOT, OUT)}\x1b[0m (${summary})`);
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) main();
