#!/usr/bin/env node
// Optimise every SVG under public/images (or the paths given as args) in place
// with SVGO, and report sizes against the design-system budget.
//   npm run assets:optimize                      → all
//   node scripts/optimize-svgs.mjs public/images/brand/island-hero.svg
import { optimize } from "svgo";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = "public/images";
const BUDGET = 25 * 1024;
const HERO_BUDGET = 45 * 1024;

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".svg") ? [p] : [];
  });
}

const files = process.argv.length > 2 ? process.argv.slice(2) : walk(ROOT);
let over = 0;
for (const file of files) {
  const before = readFileSync(file, "utf8");
  const { data } = optimize(before, {
    path: file,
    multipass: true,
    floatPrecision: 1,
    plugins: [
      { name: "preset-default", params: { overrides: { removeViewBox: false, cleanupIds: { minify: true } } } },
      "removeDimensions",
      { name: "removeAttrs", params: { attrs: ["data-name", "class"] } },
    ],
  });
  // keep intrinsic size for <img> aspect ratio: viewBox is retained above
  writeFileSync(file, data);
  const budget = /hero/.test(file) ? HERO_BUDGET : BUDGET;
  const flag = data.length > budget ? "  ⚠ over budget" : "";
  if (flag) over++;
  console.log(`${relative(".", file).padEnd(52)} ${(before.length / 1024).toFixed(1).padStart(6)} KB → ${(data.length / 1024).toFixed(1).padStart(6)} KB${flag}`);
}
if (over) {
  console.error(`\n${over} file(s) over budget`);
  process.exitCode = 1;
}
