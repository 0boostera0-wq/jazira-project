#!/usr/bin/env node
// Asset integrity check:
//  1. every manifest entry has a file on disk with a matching viewBox aspect,
//  2. no file in public/images is missing from the manifest (orphans),
//  3. every manifest id is referenced somewhere in src/ (unused art),
//  4. no source file references a missing /images/ or /illustrations/ path,
//  5. SVGs contain no <text>, <image>, <script>, <foreignObject> or fonts.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ASSET_LIST } from "../src/lib/assets.js";

const problems = [];
const walk = (dir, exts) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p, exts) : exts.some((e) => p.endsWith(e)) ? [p] : [];
  });

const srcFiles = walk("src", [".js", ".jsx", ".css"]);
const srcText = srcFiles.map((f) => [f, readFileSync(f, "utf8")]);
const allSrc = srcText.map(([, t]) => t).join("\n");

const manifestSrcs = new Set();
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
  const referenced = allSrc.includes(`"${a.id}"`) || allSrc.includes(`'${a.id}'`) || allSrc.includes(a.src);
  if (!referenced) problems.push(`unused asset (not referenced in src/): ${a.id}`);
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

if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join("\n"));
  console.error(`\n${problems.length} problem(s)`);
  process.exit(1);
}
console.log(`✓ ${ASSET_LIST.length} assets OK — all present, referenced, text-free, no broken paths`);
