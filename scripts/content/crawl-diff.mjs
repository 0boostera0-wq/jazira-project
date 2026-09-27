#!/usr/bin/env node
// ============================================================================
// iEN crawl-to-crawl diff (docs/CONTENT_ENGINE.md §4.1 "Change detection").
//
// Compares two crawl snapshots (nodes / books / lessons.jsonl) and writes
// data/staging/sources/ien/changes-<date>.jsonl (crawl-changes@1): nodes,
// books, units and lessons added, removed, retitled or moved, book file
// changes, plus edition mismatches (file-name year ≠ cover year, read from
// resources.jsonl). <date> is the newer crawl's retrieval date. Offline: it
// never fetches anything.
//
// USAGE
//   node scripts/content/crawl-diff.mjs --prev <dir>        previous snapshot directory
//   node scripts/content/crawl-diff.mjs --prev-rev <git rev> previous snapshot from git (read-only `git show`)
//        [--next <dir>]   newer snapshot (default data/staging/sources/ien)
//        [--out <file>]   output path (default <next>/changes-<date>.jsonl)
//        [--check]        exit 1 when the output file is missing or stale
// Exit 0 ok · 1 stale (--check) · 2 usage/input error.
// ============================================================================

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inspectJsonlText, writeFileIfChanged } from "./lib/jsonl.mjs";
import { stringifyRecord } from "./lib/schemas.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const IEN_DIR = "data/staging/sources/ien";
const ENTITY_ORDER = ["node", "unit", "lesson", "book"];
const CHANGE_ORDER = ["added", "removed", "retitled", "moved", "changed", "edition_mismatch"];
const clip = (s, n = 1000) => (s == null ? null : String(s).slice(0, n));

function rec(entity, change, ienId, before, after, detail = null) {
  return { schema: "crawl-changes@1", entity, change, ien_id: ienId, before: before ?? null, after: after ?? null, detail: clip(detail) };
}

function diffMaps(entity, prev, next, { fields, moveFields = [], summary }) {
  const out = [];
  for (const [id, a] of prev) if (!next.has(id)) out.push(rec(entity, "removed", id, summary(a), null));
  for (const [id, b] of next) {
    const a = prev.get(id);
    if (!a) {
      out.push(rec(entity, "added", id, null, summary(b)));
      continue;
    }
    if (a.title !== b.title) out.push(rec(entity, "retitled", id, { title: a.title }, { title: b.title }));
    const moved = moveFields.filter((f) => JSON.stringify(a[f]) !== JSON.stringify(b[f]));
    if (moved.length) out.push(rec(entity, "moved", id, pick(a, moved), pick(b, moved)));
    const changed = fields.filter((f) => JSON.stringify(a[f]) !== JSON.stringify(b[f]));
    if (changed.length) out.push(rec(entity, "changed", id, pick(a, changed), pick(b, changed), `changed: ${changed.join(", ")}`));
  }
  return out;
}
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k] ?? null]));

function unitsOf(lessons) {
  const m = new Map();
  for (const l of lessons) if (!m.has(l.unit_ien_id)) m.set(l.unit_ien_id, { title: l.unit_title, subject_ien_id: l.subject_ien_id });
  return m;
}

/**
 * Pure diff of two snapshots ({ nodes, books, lessons }). `resources`
 * (resource@1 rows of the newer snapshot) add edition mismatches.
 * @returns {object[]} crawl-changes@1 records, sorted (entity, ien_id, change)
 */
export function diffCrawls(prev, next, { resources = [] } = {}) {
  const out = [
    ...diffMaps("node", new Map(prev.nodes.map((n) => [n.ien_id, n])), new Map(next.nodes.map((n) => [n.ien_id, n])), {
      fields: ["code_id", "is_active"],
      moveFields: ["parent_ien_id", "grade_code", "track_code"],
      summary: (n) => ({ title: n.title, code_type: n.code_type, parent_ien_id: n.parent_ien_id ?? null }),
    }),
    ...diffMaps("book", new Map(prev.books.map((b) => [b.ien_book_id, b])), new Map(next.books.map((b) => [b.ien_book_id, b])), {
      fields: ["path", "bytes", "last_modified", "http_status", "is_active"],
      moveFields: ["subject_ien_id"],
      summary: (b) => ({ title: b.title, path: b.path, subject_ien_id: b.subject_ien_id }),
    }),
    ...diffMaps("unit", unitsOf(prev.lessons), unitsOf(next.lessons), {
      fields: [],
      moveFields: ["subject_ien_id"],
      summary: (u) => ({ title: u.title, subject_ien_id: u.subject_ien_id }),
    }),
    ...diffMaps(
      "lesson",
      new Map(prev.lessons.map((l) => [l.lesson_ien_id, { title: l.lesson_title, unit_ien_id: l.unit_ien_id, subject_ien_id: l.subject_ien_id }])),
      new Map(next.lessons.map((l) => [l.lesson_ien_id, { title: l.lesson_title, unit_ien_id: l.unit_ien_id, subject_ien_id: l.subject_ien_id }])),
      { fields: [], moveFields: ["unit_ien_id"], summary: (l) => ({ title: l.title, unit_ien_id: l.unit_ien_id }) },
    ),
  ];
  for (const r of resources) {
    const y = r.year_evidence;
    const bookId = r.provider_ref?.ien_book_id;
    if (!Number.isInteger(bookId) || !y?.cover || !y?.file_name || y.cover === y.file_name) continue;
    out.push(rec("book", "edition_mismatch", bookId, { file_name: y.file_name }, { cover: y.cover }, `${r.id}: file name says ${y.file_name}, cover says ${y.cover}`));
  }
  return out.sort(
    (a, b) => ENTITY_ORDER.indexOf(a.entity) - ENTITY_ORDER.indexOf(b.entity) || a.ien_id - b.ien_id || CHANGE_ORDER.indexOf(a.change) - CHANGE_ORDER.indexOf(b.change),
  );
}

/** Output text (one canonical line per record). */
export const changesText = (records) => records.map((r) => stringifyRecord("crawl-changes", r)).join("\n") + (records.length ? "\n" : "");

/** Retrieval date (YYYY-MM-DD) of a crawl-report.json object. */
export function crawlDate(report) {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(report?.retrieved_at ?? ""));
  if (!m) throw new Error("crawl-report.json has no retrieved_at");
  return m[1];
}

const parseJsonl = (text, what) => {
  const { records, issues } = inspectJsonlText(text);
  const bad = issues.find((i) => i.code === "invalid_json" || i.code === "not_object");
  if (bad) throw new Error(`${what}:${bad.line}: ${bad.message}`);
  return records.map((r) => r.record);
};

/** Snapshot from a directory holding nodes/books/lessons.jsonl + crawl-report.json. */
export function readSnapshotDir(dir) {
  const read = (f) => {
    const p = join(dir, f);
    if (!existsSync(p)) throw new Error(`missing ${p}`);
    return readFileSync(p, "utf8");
  };
  return {
    nodes: parseJsonl(read("nodes.jsonl"), "nodes.jsonl"),
    books: parseJsonl(read("books.jsonl"), "books.jsonl"),
    lessons: parseJsonl(read("lessons.jsonl"), "lessons.jsonl"),
    report: JSON.parse(read("crawl-report.json")),
  };
}

/** Snapshot at a git revision (read-only `git show <rev>:<path>`). */
export function readSnapshotRev(rev, { root = ROOT } = {}) {
  // No leading "-": `git show --output=<file>:…` would be read as an option (argument injection).
  if (!/^[A-Za-z0-9._~^/][A-Za-z0-9._\-~^/]*$/.test(String(rev)) || String(rev).includes("..")) throw new Error(`bad git revision ${JSON.stringify(rev)}`);
  const show = (f) => execFileSync("git", ["show", `${rev}:${IEN_DIR}/${f}`], { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  return {
    nodes: parseJsonl(show("nodes.jsonl"), `${rev}:nodes.jsonl`),
    books: parseJsonl(show("books.jsonl"), `${rev}:books.jsonl`),
    lessons: parseJsonl(show("lessons.jsonl"), `${rev}:lessons.jsonl`),
    report: JSON.parse(show("crawl-report.json")),
  };
}

function arg(args, name) {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const v = args[i + 1];
  if (!v || v.startsWith("--")) throw new Error(`${name} needs a value`);
  return v;
}

async function main() {
  const args = process.argv.slice(2);
  let prev;
  let next;
  let out;
  try {
    const known = new Set(["--prev", "--prev-rev", "--next", "--out", "--check"]);
    for (const a of args) if (a.startsWith("--") && !known.has(a)) throw new Error(`unknown option ${a}`);
    const prevDir = arg(args, "--prev");
    const prevRev = arg(args, "--prev-rev");
    if (!prevDir === !prevRev) throw new Error("give exactly one of --prev <dir> or --prev-rev <git rev>");
    const nextDir = resolve(arg(args, "--next") ?? join(ROOT, IEN_DIR));
    prev = prevDir ? readSnapshotDir(resolve(prevDir)) : readSnapshotRev(prevRev);
    next = readSnapshotDir(nextDir);
    if (prev.report.retrieved_at === next.report.retrieved_at) throw new Error("both snapshots have the same retrieved_at: nothing to compare");
    out = resolve(arg(args, "--out") ?? join(nextDir, `changes-${crawlDate(next.report)}.jsonl`));
  } catch (e) {
    console.error(`crawl-diff: ${e.message}`);
    console.error("usage: node scripts/content/crawl-diff.mjs (--prev <dir> | --prev-rev <rev>) [--next <dir>] [--out <file>] [--check]");
    process.exit(2);
  }
  const resourcesPath = join(ROOT, "data/staging/resources/resources.jsonl");
  const resources = existsSync(resourcesPath) ? parseJsonl(readFileSync(resourcesPath, "utf8"), "resources.jsonl") : [];
  const records = diffCrawls(prev, next, { resources });
  const text = changesText(records);
  const counts = records.reduce((m, r) => ((m[`${r.entity}.${r.change}`] = (m[`${r.entity}.${r.change}`] ?? 0) + 1), m), {});
  if (args.includes("--check")) {
    const current = existsSync(out) ? readFileSync(out, "utf8") : null;
    if (current !== text) {
      console.error(`✗ ${out} is ${current === null ? "missing" : "stale"}`);
      process.exit(1);
    }
    console.log(`✓ ${out} is current (${records.length} changes)`);
    return;
  }
  writeFileIfChanged(out, text);
  console.log(`✓ ${records.length} change(s) → ${out} ${JSON.stringify(counts)}`);
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch((e) => {
    console.error(e?.stack ?? String(e));
    process.exit(1);
  });
}
