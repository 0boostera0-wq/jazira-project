#!/usr/bin/env node
// Asset integrity check:
//  1. every manifest entry has a file on disk with a matching viewBox aspect,
//  2. no file in public/images is missing from the manifest (orphans),
//  3. every manifest id is referenced somewhere in src/ (unused art),
//  4. no source file references a missing /images/ or /illustrations/ path,
//  5. SVGs contain no <text>, <image>, <script>, <foreignObject> or fonts,
//  6. every manifest entry documents where it is used (`usedIn` not empty).
//
//   node scripts/check-assets.mjs            → the checks above (exit 1 on problems)
//   node scripts/check-assets.mjs --usage    → also print, per asset id, the source
//                                              files that actually reference it
//                                              (compare with `usedIn` when moving art)
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ASSET_LIST } from "../src/lib/assets.js";

const showUsage = process.argv.includes("--usage");
const problems = [];
const walk = (dir, exts) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p, exts) : exts.some((e) => p.endsWith(e)) ? [p] : [];
  });

const MANIFEST = join("src", "lib", "assets.js");
const srcFiles = walk("src", [".js", ".jsx", ".css"]);
const srcText = srcFiles.map((f) => [f, readFileSync(f, "utf8")]);
// References outside the manifest itself (its own ids and src template don't count).
const refText = srcText.filter(([f]) => f !== MANIFEST);

function referencesOf(a) {
  const out = [];
  for (const [file, text] of refText) {
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      if (line.includes(`"${a.id}"`) || line.includes(`'${a.id}'`) || line.includes(a.src)) {
        out.push(`${file.replace(/\\/g, "/").replace(/^src\//, "")}:${i + 1}`);
      }
    });
  }
  return out;
}

const manifestSrcs = new Set();
const usage = [];
for (const a of ASSET_LIST) {
  manifestSrcs.add(a.src);
  const file = join("public", a.src);
  if (!existsSync(file)) { problems.push(`missing file: ${a.src} (${a.id})`); continue; }
  const svg = readFileSync(file, "utf8");
  const vb = svg.match(/viewBox="([\d.\s-]+)"/);
  if (!vb) problems.push(`no viewBox: ${a.src}`);
  else {
    const [, , w, h] = vb[1].trim().split(/\s+/).map(Number);
    if (Math.abs(w / h - a.width / a.height) > 0.01) problems.push(`aspect mismatch: ${a.src} viewBox ${w}x${h} vs manifest ${a.width}x${a.height}`);
  }
  if (/<(text|image|script|foreignObject)\b/i.test(svg) || /font-family|@font-face/i.test(svg)) problems.push(`forbidden element (text/image/script/font): ${a.src}`);
  const refs = referencesOf(a);
  if (!refs.length) problems.push(`unused asset (not referenced in src/): ${a.id}`);
  if (!Array.isArray(a.usedIn) || !a.usedIn.length) problems.push(`usedIn is empty: ${a.id}`);
  usage.push([a.id, refs]);
}

if (existsSync("public/images")) {
  for (const f of walk("public/images", [".svg", ".png", ".jpg", ".jpeg", ".webp", ".avif"])) {
    const url = "/" + f.replace(/\\/g, "/").replace(/^public\//, "");
    if (!manifestSrcs.has(url)) problems.push(`orphan file not in manifest: ${url}`);
  }
}

for (const [file, text] of srcText) {
  for (const m of text.matchAll(/["'`](\/(?:images|illustrations)\/[^"'`\s)]+)["'`]/g)) {
    if (m[1].includes("${")) continue; // template in the manifest itself
    if (!existsSync(join("public", m[1]))) problems.push(`broken reference in ${file}: ${m[1]}`);
  }
}

if (showUsage) {
  const pad = Math.max(...usage.map(([id]) => id.length));
  for (const [id, refs] of usage) console.log(`${id.padEnd(pad)}  ${refs.join("  ") || "—"}`);
  console.log("");
}

if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join("\n"));
  console.error(`\n${problems.length} problem(s)`);
  process.exit(1);
}
console.log(`✓ ${ASSET_LIST.length} assets OK — all present, referenced, documented, text-free, no broken paths`);
