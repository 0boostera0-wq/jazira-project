#!/usr/bin/env node
/* ============================================================================
 * Seed a few REAL on-disk sample PDFs into /public/resources so the curriculum
 * works end-to-end immediately (before you import the official files). These
 * are valid, branded, openable PDFs committed to the repo. Replace them by
 * importing the approved files (scripts/import-curriculum.mjs) — the importer
 * overwrites the same key paths.
 *
 *   node scripts/seed-sample-pdfs.mjs [keyPrefix ...]
 *   default prefixes: a small cross-stage demo set.
 * ========================================================================== */
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public", "resources");

const DEFAULT_PREFIXES = [
  "1447/elementary/grade-1/math",
  "1447/elementary/grade-1/arabic",
  "1447/high-school/grade-2/sharia/fiqh",
];

const { allResources } = await import(pathToFileURL(path.join(ROOT, "src", "lib", "curriculum.js")).href);
const { pendingPdf } = await import(pathToFileURL(path.join(ROOT, "src", "lib", "pendingPdf.js")).href);

const prefixes = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_PREFIXES;
const rows = allResources().filter((r) => prefixes.some((p) => r.key.startsWith(p)));

if (!rows.length) {
  console.log("No catalog keys match:", prefixes.join(", "));
  process.exit(1);
}

let n = 0;
for (const r of rows) {
  const dest = path.join(PUBLIC_DIR, r.key);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, pendingPdf(r.key, r.title));
  n++;
}
console.log(`Seeded ${n} sample PDF(s) under /public/resources for ${prefixes.length} prefix(es).`);
console.log("These open in the in-app viewer now; import the official files to replace them.");
