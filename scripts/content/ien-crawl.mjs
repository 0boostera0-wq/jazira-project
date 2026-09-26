#!/usr/bin/env node
// ============================================================================
// iEN source discovery — crawls the PUBLIC iEN (عين الإثرائية) API for the
// official curriculum tree, the published textbooks and the unit → lesson
// lists, and writes normalized source tables for the content pipeline.
//
//   node scripts/content/ien-crawl.mjs              # crawl (uses the response cache)
//   node scripts/content/ien-crawl.mjs --refresh    # ignore the cache
//   node scripts/content/ien-crawl.mjs --no-head    # skip HEAD checks of book files
//
// Reads only public, unauthenticated endpoints that the iEN portal itself
// calls (no login, no bypass). Politeness: 4 requests in flight, a delay
// between requests, retries with backoff. Raw responses are cached outside the
// repo (C:/jazira/content-cache/ien/api, or $CONTENT_CACHE_DIR/ien/api); book
// files are only HEAD-checked here — PDFs are never stored in the repo.
//
// Outputs (data/staging/sources/ien/):
//   nodes.jsonl        every tree node: stage → grade/track → year node → subject
//   books.jsonl        every listed textbook file (title, url, size, parsed file-name fields)
//   lessons.jsonl      unit → lesson rows from iEN's question-bank tree
//   crawl-report.json  retrieval date, counts, errors, provenance/licence notes
//
// Provenance: iEN is operated by Tatweer for the Ministry of Education ("جميع
// الحقوق محفوظة"). Titles and structure are recorded as curriculum metadata;
// textbook files are linked, not redistributed (docs/CURRICULUM.md §3).
// ============================================================================
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "data/staging/sources/ien");
const CACHE = join(process.env.CONTENT_CACHE_DIR || "C:/jazira/content-cache", "ien/api");
const PORTAL = "https://www.ien.edu.sa/";
const LMS = "https://ibs.ien.edu.sa/";
const FILES = "https://iencontent.ien.edu.sa/books/";
const UA = "JaziraContentPipeline/1.0 (curriculum metadata; contact: support@jazira.sa)";

const args = new Set(process.argv.slice(2));
const REFRESH = args.has("--refresh");
const HEAD = !args.has("--no-head");
const CONCURRENCY = 4;
const DELAY_MS = 150;
const MAX_DEPTH = 8;

const retrievedAt = new Date().toISOString();
const errors = [];
let requests = 0;
let cacheHits = 0;

mkdirSync(OUT, { recursive: true });
mkdirSync(CACHE, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── a tiny promise pool ────────────────────────────────────────────────────
let active = 0;
const waiting = [];
async function slot(fn) {
  if (active >= CONCURRENCY) await new Promise((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    await sleep(DELAY_MS);
    waiting.shift()?.();
  }
}

/** GET JSON with cache + retries. Returns null (and records an error) on failure. */
async function getJson(url) {
  const key = createHash("sha1").update(url).digest("hex");
  const file = join(CACHE, `${key}.json`);
  if (!REFRESH && existsSync(file)) {
    cacheHits++;
    return JSON.parse(readFileSync(file, "utf8")).body;
  }
  return slot(async () => {
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        requests++;
        const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        writeFileSync(file, JSON.stringify({ url, fetched_at: new Date().toISOString(), body }));
        return body;
      } catch (e) {
        if (attempt === 4) {
          errors.push({ url, error: String(e.message || e) });
          return null;
        }
        await sleep(500 * 2 ** attempt);
      }
    }
    return null;
  });
}

/** HEAD a file: size, type, last-modified. */
async function head(url) {
  return slot(async () => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        requests++;
        const res = await fetch(url, { method: "HEAD", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
        return {
          http_status: res.status,
          content_type: res.headers.get("content-type"),
          bytes: Number(res.headers.get("content-length")) || null,
          last_modified: res.headers.get("last-modified"),
          accept_ranges: res.headers.get("accept-ranges"),
        };
      } catch (e) {
        if (attempt === 3) {
          errors.push({ url, error: `HEAD ${e.message || e}` });
          return { http_status: null };
        }
        await sleep(500 * 2 ** attempt);
      }
    }
    return { http_status: null };
  });
}

// ── file-name fields: 1448-GE-ME-K07-SM1-math-part1.pdf ────────────────────
// Parsed only as EVIDENCE (the term of each part is confirmed later from the
// book's own cover pages — never assumed from "SM1"/"part1").
export function parseBookPath(path) {
  const p = String(path || "");
  const ext = (/\.([a-z0-9]+)$/i.exec(p)?.[1] || "").toLowerCase();
  const segs = p.replace(/\.[a-z0-9]+$/i, "").split("-");
  const semAt = segs.findIndex((s) => /^SM\d$/i.test(s));
  if (!/^\d{4}$/.test(segs[0] || "") || semAt < 2) return { parsed: false, file_ext: ext || null };
  const levels = segs.slice(2, semAt); // e.g. ["ME","K07"] or ["CBM","GNRL","TRC2"]
  const rest = segs.slice(semAt + 1).join("-"); // e.g. "math-part1", "MATH2.1", "math2.1.part"
  const part = /part(\d+)/i.exec(rest);
  return {
    parsed: true,
    file_ext: ext,
    year_hijri: Number(segs[0]),
    system: segs[1],
    level_segments: levels,
    grade_code: levels.find((s) => /^(K\d{2}|TRC\d)$/i.test(s)) || null,
    track_code: levels.find((s) => /^(GNRL|RLGS|BM|CSE|HL)$/i.test(s)) || null,
    semester_code: segs[semAt].toUpperCase(),
    slug: rest,
    part: part ? Number(part[1]) : /\.part$/i.test(rest) ? "unnumbered" : null,
  };
}

const nodes = new Map(); // id → row

async function walk(node, parent, depth, trail) {
  if (nodes.has(node.id)) return;
  const row = {
    ien_id: node.id,
    parent_ien_id: parent ? parent.id : null,
    title: (node.title || "").replace(/\s+/g, " ").trim(),
    code_id: node.codeId ?? null,
    code_type: node.codeType ?? null,
    full_path: node.fullPath ?? null,
    order_in_parent: node.orderInParent ?? null,
    depth,
    path_titles: [...trail, (node.title || "").replace(/\s+/g, " ").trim()],
  };
  nodes.set(node.id, row);
  if (depth >= MAX_DEPTH || node.codeType === "SUB") return;
  const kids = (await getJson(`${LMS}api/tree?parentId=${node.id}`)) || [];
  await Promise.all(kids.map((k) => walk(k, node, depth + 1, row.path_titles)));
  // Subjects are not returned by tree?parentId under the year node («مقررات
  // العام الدراسي»); the portal lists them with tree/AllChildren on the grade /
  // track-year node, flattened, with their counts. Their real parent is the
  // segment before their own id in fullPath.
  if (depth >= 1) {
    const subs = (await getJson(`${LMS}api/tree/AllChildren?parentId=${node.id}`)) || [];
    for (const s of subs) {
      if (s.codeType !== "SUB" || subjectRows.has(s.id)) continue;
      const segs = String(s.fullPath || "").split("-").map(Number);
      const parentId = segs.length >= 2 ? segs[segs.length - 2] : node.id;
      subjectRows.set(s.id, {
        ien_id: s.id,
        parent_ien_id: parentId,
        listed_under_ien_id: node.id,
        title: (s.title || "").replace(/\s+/g, " ").trim(),
        code_id: s.codeId ?? null,
        code_type: "SUB",
        full_path: s.fullPath ?? null,
        order_in_parent: s.orderInParent ?? null,
        is_active: s.isActive ?? null,
        h_date: s.hDate ?? null,
        g_date: s.gDate ?? null,
        gender: s.gender ?? null,
        subject_group_id: s.subjectGroupId ?? null,
        has_subject_books: s.hasSubjectBooks ?? null,
        subject_books_count: s.subjectBooksCount ?? null,
        ien_question_bank_count: s.questionsCount ?? null,
        teacher_guides_count: s.teacherGuidCount ?? null,
        interactive_activities_count: s.flashActivityCount ?? null,
      });
    }
  }
}
const subjectRows = new Map(); // subject id → row

async function main() {
  const primary = (await getJson(`${PORTAL}api/Lmstree/GetPrimaryStudentStages`)) || [];
  const midSec = (await getJson(`${PORTAL}api/Lmstree/GetMidSecondaryStudentStages`)) || [];
  const roots = [
    ...primary.map((n) => ({ ...n, _stage: "elementary" })),
    ...midSec.map((n) => ({ ...n, _stage: n.codeType === "STG" ? "high-school" : "middle" })),
  ];
  await Promise.all(roots.map((r) => walk(r, null, 0, [r._stage])));
  for (const r of roots) nodes.get(r.id).stage = r._stage;
  // subjects join the tree under their real parent (the year node)
  for (const s of subjectRows.values()) {
    const parent = nodes.get(s.parent_ien_id) || nodes.get(s.listed_under_ien_id);
    nodes.set(s.ien_id, { ...s, depth: parent ? parent.depth + 1 : null, path_titles: parent ? [...parent.path_titles, s.title] : [s.title] });
  }
  // propagate the stage down the tree; name each subject's grade / track / year
  const byId = nodes;
  for (const row of byId.values()) {
    let p = row;
    while (p && !p.stage) p = byId.get(p.parent_ien_id);
    row.stage = p ? p.stage : null;
    const up = [];
    for (let q = row; q; q = byId.get(q.parent_ien_id)) up.push(q);
    const grade = up.find((q) => q.code_type === "K");
    const track = up.find((q) => q.code_type === "TRK");
    const year = up.find((q) => q.code_type === "SM");
    row.grade_ien_id = grade ? grade.ien_id : null;
    row.grade_code = grade ? grade.code_id : null;
    row.track_ien_id = track ? track.ien_id : null;
    row.track_code = track ? track.code_id : null;
    row.year_node_ien_id = year ? year.ien_id : null;
  }

  const subjects = [...nodes.values()].filter((n) => n.code_type === "SUB");
  const books = [];
  const lessons = [];
  await Promise.all(
    subjects.map(async (s) => {
      const b = await getJson(`${LMS}api/SubjectBooks?top=100&skip=0&treeId=${s.ien_id}`);
      for (const bk of b?.subjectBooks || []) {
        const url = FILES + encodeURI(bk.path);
        books.push({
          ien_book_id: bk.id,
          subject_ien_id: s.ien_id,
          title: (bk.title || "").replace(/\s+/g, " ").trim(),
          path: bk.path,
          url,
          is_active: bk.isActive,
          download_count: bk.downloadCount ?? null,
          tree_path: bk.treePath ?? null,
          ...parseBookPath(bk.path),
        });
      }
      const sa = await getJson(`${LMS}api/Questions/SelfAssessments/${s.ien_id}`);
      for (const [i, l] of (Array.isArray(sa) ? sa : []).entries()) {
        const unitTitle = String(l.subjectPath || "").split(" - ")[0].replace(/\s+/g, " ").trim();
        lessons.push({
          subject_ien_id: s.ien_id,
          unit_ien_id: l.treeId,
          unit_title: unitTitle,
          lesson_ien_id: l.lessonId,
          lesson_title: String(l.lesson || "").replace(/\s+/g, " ").trim(),
          order: i,
          ien_bank_count: l.count ?? null,
          ien_bank_total: l.totalCount ?? null,
        });
      }
    })
  );

  if (HEAD) await Promise.all(books.map(async (b) => Object.assign(b, await head(b.url))));

  // deterministic order
  const nodeRows = [...nodes.values()].sort((a, b) => a.depth - b.depth || String(a.full_path).localeCompare(String(b.full_path)) || a.ien_id - b.ien_id);
  books.sort((a, b) => a.subject_ien_id - b.subject_ien_id || a.path.localeCompare(b.path));
  lessons.sort((a, b) => a.subject_ien_id - b.subject_ien_id || a.order - b.order);

  const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
  writeFileSync(join(OUT, "nodes.jsonl"), jsonl(nodeRows));
  writeFileSync(join(OUT, "books.jsonl"), jsonl(books));
  writeFileSync(join(OUT, "lessons.jsonl"), jsonl(lessons));

  const count = (rows, key) => rows.reduce((m, r) => ((m[r[key] ?? "?"] = (m[r[key] ?? "?"] || 0) + 1), m), {});
  const report = {
    source: "iEN — https://www.ien.edu.sa (public portal API) · https://ibs.ien.edu.sa · https://iencontent.ien.edu.sa",
    operator: "Tatweer Educational Services for the Ministry of Education",
    licence: "All rights reserved (iEN footer). Metadata recorded; files linked, not redistributed.",
    provenance_status: "PROVENANCE_REVIEW_REQUIRED",
    retrieved_at: retrievedAt,
    requests,
    cache_hits: cacheHits,
    counts: {
      nodes: nodeRows.length,
      subjects: subjects.length,
      subjects_by_stage: count(subjects, "stage"),
      books: books.length,
      books_by_year: count(books, "year_hijri"),
      books_by_semester_code: count(books, "semester_code"),
      books_head_ok: books.filter((b) => b.http_status === 200).length,
      books_bytes_total: books.reduce((s, b) => s + (b.bytes || 0), 0),
      lessons: lessons.length,
      units: new Set(lessons.map((l) => l.unit_ien_id)).size,
      subjects_with_lessons: new Set(lessons.map((l) => l.subject_ien_id)).size,
      subjects_with_books: new Set(books.map((b) => b.subject_ien_id)).size,
    },
    errors,
  };
  writeFileSync(join(OUT, "crawl-report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report.counts, null, 2));
  if (errors.length) console.log(`${errors.length} error(s) — see crawl-report.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
