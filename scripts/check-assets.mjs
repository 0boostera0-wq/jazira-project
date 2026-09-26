#!/usr/bin/env node
// Image library integrity check (src/lib/assets.js):
//  1. every raster entry has all renditions (public/images/<category>/<name>-<w>.webp
//     for each IMAGE_WIDTHS width) with the right pixel size, within the size budget,
//  2. every brand-kit file exists; its SVGs hold no <text>, raster, script or font
//     (wordmarks are outlined) and it is referenced in src/ or documented in docs/,
//  3. every entry documents itself: category/folder, pages, purpose, sizes,
//     priority, languageNeutral, and a generated placeholder colour,
//  4. no file in public/images is missing from the manifest (orphans / retired art),
//  5. every id is referenced somewhere in src/ (unused art),
//  6. no source file references a missing /images/ path.
//
//   node scripts/check-assets.mjs            → the checks above (exit 1 on problems)
//   node scripts/check-assets.mjs --usage    → also print, per asset id, the source
//                                              files that actually reference it
//                                              (compare with `pages` when moving art)
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { ASSET_LIST } from "../src/lib/assets.js";
import { IMAGE_WIDTHS } from "../src/lib/image-loader.js";
import COLORS from "../src/lib/asset-colors.js";

const CATEGORIES = ["brand", "landing", "welcome", "elementary", "middle", "high-school", "aptitude", "achievement", "exams", "community", "assistant", "subscriptions", "payment", "support", "legal"];
// Per-rendition byte budgets (KB): generous for painterly art, strict enough to catch a bad encode.
const BUDGET_KB = (w) => (w >= 1536 ? 320 : w >= 1280 ? 240 : w >= 960 ? 170 : w >= 640 ? 100 : 50);

const showUsage = process.argv.includes("--usage");
const problems = [];
const walk = (dir, exts) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p, exts) : exts.some((e) => p.endsWith(e)) ? [p] : [];
  });

const MANIFEST = join("src", "lib", "assets.js");
const GENERATED = join("src", "lib", "asset-colors.js");
const srcText = walk("src", [".js", ".jsx", ".css"]).map((f) => [f, readFileSync(f, "utf8")]);
const refText = srcText.filter(([f]) => f !== MANIFEST && f !== GENERATED);
const docText = walk("docs", [".md"]).map((f) => [f, readFileSync(f, "utf8")]);

function referencesOf(a) {
  const out = [];
  for (const [file, text] of refText) {
    text.split("\n").forEach((line, i) => {
      if (line.includes(`"${a.id}"`) || line.includes(`'${a.id}'`) || line.includes(a.src)) {
        out.push(`${file.replace(/\\/g, "/").replace(/^src\//, "")}:${i + 1}`);
      }
    });
  }
  return out;
}

const expected = new Set(); // every file public/images may contain, as URL paths
const logical = new Set(); // raster `src` values (resolved by the loader, not files)
const usage = [];
let bytes = 0;

for (const a of ASSET_LIST) {
  const where = `${a.id}:`;
  if (!CATEGORIES.includes(a.category)) problems.push(`${where} unknown category "${a.category}"`);
  if (a.id !== `${a.category}.${a.src.split("?")[0].split("/").pop().replace(/\.(webp|svg|png|jpg)$/, "")}`) problems.push(`${where} id does not match its file name`);
  if (a.kind !== "brand" && !a.src.startsWith(`/images/${a.category}/`)) problems.push(`${where} src ${a.src} is not under /images/${a.category}/`);
  if (!Array.isArray(a.pages) || !a.pages.length) problems.push(`${where} pages is empty`);
  if (!a.purpose) problems.push(`${where} purpose is empty`);
  if (a.kind === "raster" && a.languageNeutral !== true) problems.push(`${where} art must be language-neutral (no text in the image)`);
  if (a.kind === "brand" && a.languageNeutral !== !a.lang) problems.push(`${where} a lockup with a script wordmark must name its lang`);
  if (!["lcp", "lazy"].includes(a.priority)) problems.push(`${where} priority must be "lcp" or "lazy"`);

  if (a.kind === "raster") {
    logical.add(a.src.split("?")[0]);
    if (!a.sizes) problems.push(`${where} sizes is empty`);
    if (!COLORS[a.id]) problems.push(`${where} no placeholder colour — run \`npm run assets:process ${a.id}\``);
    const stem = a.src.split("?")[0].slice(0, -".webp".length);
    for (const w of IMAGE_WIDTHS) {
      const url = `${stem}-${w}.webp`;
      expected.add(url);
      const file = join("public", url);
      if (!existsSync(file)) { problems.push(`${where} missing rendition ${url}`); continue; }
      const kb = statSync(file).size / 1024;
      bytes += kb;
      if (kb > BUDGET_KB(w)) problems.push(`${where} ${url} is ${kb.toFixed(0)} KB (budget ${BUDGET_KB(w)} KB)`);
      const m = await sharp(file).metadata();
      const h = Math.round((w * a.height) / a.width);
      if (m.format !== "webp" || m.width !== w || Math.abs(m.height - h) > 1) problems.push(`${where} ${url} is ${m.format} ${m.width}×${m.height}, expected webp ${w}×${h}`);
    }
  } else if (a.kind === "brand") {
    expected.add(a.src);
    const file = join("public", a.src);
    if (!existsSync(file)) { problems.push(`${where} missing file ${a.src}`); continue; }
    bytes += statSync(file).size / 1024;
    if (a.src.endsWith(".svg")) {
      const svg = readFileSync(file, "utf8");
      if (/<(text|image|script|foreignObject)\b/i.test(svg) || /font-family|@font-face/i.test(svg)) problems.push(`${where} forbidden element (text/image/script/font) in ${a.src}`);
    }
  } else {
    problems.push(`${where} unknown kind "${a.kind}"`);
  }

  const refs = referencesOf(a);
  const documented = a.kind === "brand" && docText.some(([, t]) => t.includes(a.src));
  if (!refs.length && !documented) problems.push(`${where} unused (not referenced in src/${a.kind === "brand" ? " nor documented in docs/" : ""})`);
  usage.push([a.id, refs]);
}

if (existsSync("public/images")) {
  for (const f of walk("public/images", [""])) {
    const url = "/" + f.replace(/\\/g, "/").replace(/^public\//, "");
    if (!expected.has(url)) problems.push(`orphan file not in the manifest: ${url}`);
  }
}

for (const [file, text] of srcText) {
  for (const m of text.matchAll(/["'`](\/images\/[^"'`\s)]+)["'`]/g)) {
    if (m[1].includes("${") || logical.has(m[1])) continue;
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
const raster = ASSET_LIST.filter((a) => a.kind === "raster").length;
const brand = ASSET_LIST.length - raster;
console.log(
  `✓ ${ASSET_LIST.length} assets OK (${raster} images × ${IMAGE_WIDTHS.length} renditions + ${brand} brand-kit files, ${(bytes / 1024).toFixed(1)} MB) — ` +
    "all present, sized, within budget, referenced, documented, no orphans or broken paths"
);
