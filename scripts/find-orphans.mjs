#!/usr/bin/env node
// Lists modules under src/ that nothing imports (dead code). Entry points —
// app routes, middleware, i18n catalogues — are never orphans.
//   node scripts/find-orphans.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname, resolve } from "node:path";

const norm = (p) => p.split("\\").join("/");
const walk = (d) =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(m?jsx?)$/.test(f) ? [norm(p)] : [];
  });

const files = walk("src");
const scan = [...files, ...walk("scripts"), ...walk("tests")];
const SPEC_RE = /(?:import|export)[^'"`]*?from\s*["'`]([^"'`]+)["'`]|import\(\s*["'`]([^"'`]+)["'`]\s*\)|require\(\s*["'`]([^"'`]+)["'`]\s*\)/g;

const resolveSpec = (from, spec) => {
  let base;
  if (spec.startsWith("@/")) base = "src/" + spec.slice(2);
  else if (spec.startsWith(".")) base = norm(relative(".", resolve(dirname(from), spec)));
  else return null;
  const cands = [base, `${base}.js`, `${base}.jsx`, `${base}.mjs`, `${base}/index.js`, `${base}/index.jsx`];
  return cands.find((c) => files.includes(c)) || null;
};

const referenced = new Set();
for (const f of scan) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(SPEC_RE)) {
    const r = resolveSpec(f, m[1] || m[2] || m[3]);
    if (r && r !== f) referenced.add(r);
  }
}
const isEntry = (f) => f.startsWith("src/app/") || f === "src/middleware.js" || f.startsWith("src/i18n/messages/");
console.log(files.filter((f) => !isEntry(f) && !referenced.has(f)).join("\n"));
