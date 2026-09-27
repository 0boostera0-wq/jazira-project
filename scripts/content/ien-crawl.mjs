#!/usr/bin/env node
// ============================================================================
// iEN source discovery — crawls the PUBLIC iEN (عين الإثرائية) API for the
// official curriculum tree, the published textbooks and the unit → lesson
// lists, and writes normalized source tables for the content pipeline
// (docs/CONTENT_ENGINE.md §4.1).
//
//   node scripts/content/ien-crawl.mjs              # crawl (uses the response cache)
//   node scripts/content/ien-crawl.mjs --refresh    # ignore the cache (monthly run)
//   node scripts/content/ien-crawl.mjs --no-head    # skip HEAD checks of book files
//   node scripts/content/ien-crawl.mjs --head-max-age=24   # reuse HEAD results younger than N hours
//   node scripts/content/ien-crawl.mjs --budget=600 # hourly request budget of the shared queue
//   node scripts/content/ien-crawl.mjs --status     # shared fetch-queue status
//
// Reads only public, unauthenticated endpoints that the iEN portal itself
// calls (no login, no bypass). Politeness: every request goes through the
// shared, persisted fetch queue (scripts/content/lib/fetch-queue.mjs): at
// most 2 requests in flight across all tools, 500 ms spacing, an identifying
// User-Agent, backoff with jitter honouring Retry-After, a circuit breaker
// and an hourly budget. Raw responses are cached outside the repo
// (<cache>/ien/api, keyed by sha1(url); HEAD results by sha1("HEAD " + url)),
// so an interrupted or paused crawl resumes where it stopped; no HEAD request
// is repeated within a run. When the queue pauses (breaker, budget), the crawl
// stops without writing outputs and exits with code 3 — rerun later.
// Book files are only HEAD-checked here — PDFs are never stored in the repo.
//
// Outputs (data/staging/sources/ien/), format unchanged:
//   nodes.jsonl        every tree node: stage → grade/track → year node → subject
//   books.jsonl        every listed textbook file (title, url, size, parsed file-name fields)
//   lessons.jsonl      unit → lesson rows from iEN's question-bank tree (titles and counts only)
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
import { cachePaths, cacheRoot } from "./lib/cache.mjs";
import { HttpError, QueuePausedError, RetryLaterError, createFetchQueue, formatStatus } from "./lib/fetch-queue.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const OUT_DIR = join(ROOT, "data/staging/sources/ien");
export const ENDPOINTS = Object.freeze({
  portal: "https://www.ien.edu.sa/",
  lms: "https://ibs.ien.edu.sa/",
  files: "https://iencontent.ien.edu.sa/books/",
});
/** Local request pool: never more waiters than the queue's in-flight limit. */
export const CONCURRENCY = 2;
const MAX_DEPTH = 8;

const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();

// ── response cache ─────────────────────────────────────────────────────────
/** Cache file of a request: sha1(url) for GET, sha1("HEAD " + url) for HEAD. */
export function apiCacheFile(dir, url, method = "GET") {
  const key = createHash("sha1").update(method === "HEAD" ? `HEAD ${url}` : url).digest("hex");
  return join(dir, `${key}.json`);
}

/**
 * The crawler's request client on top of the shared queue: GET JSON and
 * HEAD with the response cache. Failures are recorded in `errors` and give
 * null (GET) / { http_status: null } (HEAD); a paused queue throws
 * QueuePausedError (the caller stops cleanly).
 * @param {{ queue, cacheDir, refresh?, headMaxAgeMs?, now? }} o
 */
export function createIenClient({ queue, cacheDir, refresh = false, headMaxAgeMs = 24 * 3600 * 1000, now = Date.now }) {
  mkdirSync(cacheDir, { recursive: true });
  const stats = { requests: 0, cacheHits: 0 };
  const errors = [];
  const heads = new Map(); // url → promise: no HEAD is repeated within a run
  let active = 0;
  const waiting = [];
  async function slot(fn) {
    while (active >= CONCURRENCY) await new Promise((r) => waiting.push(r));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      waiting.shift()?.();
    }
  }

  async function getJson(url) {
    const file = apiCacheFile(cacheDir, url);
    if (!refresh && existsSync(file)) {
      stats.cacheHits++;
      return JSON.parse(readFileSync(file, "utf8")).body;
    }
    return slot(async () => {
      try {
        stats.requests++;
        const res = await queue.request(url, { kind: "api", headers: { Accept: "application/json" } });
        const body = JSON.parse(res.body.toString("utf8"));
        writeFileSync(file, JSON.stringify({ url, fetched_at: new Date(now()).toISOString(), body }));
        return body;
      } catch (e) {
        if (e instanceof QueuePausedError) throw e;
        if (e instanceof HttpError && e.status === 404) return null;
        errors.push({ url, error: String(e.message || e) });
        return null;
      }
    });
  }

  function head(url) {
    if (heads.has(url)) return heads.get(url);
    const p = (async () => {
      const file = apiCacheFile(cacheDir, url, "HEAD");
      if (!refresh && existsSync(file)) {
        const cached = JSON.parse(readFileSync(file, "utf8"));
        if (now() - Date.parse(cached.fetched_at) <= headMaxAgeMs) {
          stats.cacheHits++;
          return cached.head;
        }
      }
      return slot(async () => {
        try {
          stats.requests++;
          const res = await queue.request(url, { method: "HEAD", kind: "head", consume: async (r) => ({ status: r.status, headers: r.headers }) });
          const h = headFields(res.status, (k) => res.headers.get(k));
          writeFileSync(file, JSON.stringify({ url, method: "HEAD", fetched_at: new Date(now()).toISOString(), head: h }));
          return h;
        } catch (e) {
          if (e instanceof QueuePausedError) throw e;
          if (e instanceof HttpError) return headFields(e.status, () => null);
          errors.push({ url, error: `HEAD ${e instanceof RetryLaterError ? e.message : String(e.message || e)}` });
          return { http_status: null };
        }
      });
    })();
    heads.set(url, p);
    return p;
  }

  return { getJson, head, stats, errors };
}

/** The HEAD fields recorded on a book row (key order is part of the output format). */
export function headFields(status, get) {
  return {
    http_status: status,
    content_type: get("content-type"),
    bytes: Number(get("content-length")) || null,
    last_modified: get("last-modified"),
    accept_ranges: get("accept-ranges"),
  };
}

// ── pure row builders ──────────────────────────────────────────────────────
// file-name fields: 1448-GE-ME-K07-SM1-math-part1.pdf
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

/** A tree node row (tree?parentId). */
export function nodeRow(node, parent, depth, trail) {
  return {
    ien_id: node.id,
    parent_ien_id: parent ? parent.id : null,
    title: clean(node.title),
    code_id: node.codeId ?? null,
    code_type: node.codeType ?? null,
    full_path: node.fullPath ?? null,
    order_in_parent: node.orderInParent ?? null,
    depth,
    path_titles: [...trail, clean(node.title)],
  };
}

/**
 * A subject row (tree/AllChildren). Subjects are listed flattened under the
 * grade / track-year node; their real parent is the segment before their own
 * id in fullPath.
 */
export function subjectRow(s, listedUnderId) {
  const segs = String(s.fullPath || "").split("-").map(Number);
  return {
    ien_id: s.id,
    parent_ien_id: segs.length >= 2 ? segs[segs.length - 2] : listedUnderId,
    listed_under_ien_id: listedUnderId,
    title: clean(s.title),
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
  };
}

/** A book row (SubjectBooks), before its HEAD fields. */
export function bookRow(bk, subjectId, filesBase = ENDPOINTS.files) {
  return {
    ien_book_id: bk.id,
    subject_ien_id: subjectId,
    title: clean(bk.title),
    path: bk.path,
    url: filesBase + encodeURI(bk.path),
    is_active: bk.isActive,
    download_count: bk.downloadCount ?? null,
    tree_path: bk.treePath ?? null,
    ...parseBookPath(bk.path),
  };
}

/** Unit → lesson rows (Questions/SelfAssessments): titles and counts only, never question text. */
export function lessonRows(sa, subjectId) {
  return (Array.isArray(sa) ? sa : []).map((l, i) => ({
    subject_ien_id: subjectId,
    unit_ien_id: l.treeId,
    unit_title: clean(String(l.subjectPath || "").split(" - ")[0]),
    lesson_ien_id: l.lessonId,
    lesson_title: clean(l.lesson),
    order: i,
    ien_bank_count: l.count ?? null,
    ien_bank_total: l.totalCount ?? null,
  }));
}

/** Propagate the stage down the tree and name each node's grade / track / year node (mutates). */
export function annotateNodes(nodes) {
  for (const row of nodes.values()) {
    let p = row;
    while (p && !p.stage) p = nodes.get(p.parent_ien_id);
    row.stage = p ? p.stage : null;
    const up = [];
    for (let q = row; q && up.length < 64; q = nodes.get(q.parent_ien_id)) up.push(q);
    const grade = up.find((q) => q.code_type === "K");
    const track = up.find((q) => q.code_type === "TRK");
    const year = up.find((q) => q.code_type === "SM");
    row.grade_ien_id = grade ? grade.ien_id : null;
    row.grade_code = grade ? grade.code_id : null;
    row.track_ien_id = track ? track.ien_id : null;
    row.track_code = track ? track.code_id : null;
    row.year_node_ien_id = year ? year.ien_id : null;
  }
  return nodes;
}

/** Deterministic output order. */
export function sortOutputs({ nodeRows, books, lessons }) {
  return {
    nodeRows: [...nodeRows].sort((a, b) => a.depth - b.depth || String(a.full_path).localeCompare(String(b.full_path)) || a.ien_id - b.ien_id),
    books: [...books].sort((a, b) => a.subject_ien_id - b.subject_ien_id || a.path.localeCompare(b.path)),
    lessons: [...lessons].sort((a, b) => a.subject_ien_id - b.subject_ien_id || a.order - b.order),
  };
}

/** crawl-report.json (§4.1 provenance). */
export function crawlReport({ nodeRows, books, lessons, retrievedAt, requests, cacheHits, errors }) {
  const subjects = nodeRows.filter((n) => n.code_type === "SUB");
  const count = (rows, key) => rows.reduce((m, r) => ((m[r[key] ?? "?"] = (m[r[key] ?? "?"] || 0) + 1), m), {});
  return {
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
}

// ── the crawl ──────────────────────────────────────────────────────────────
/**
 * Crawl the tree, books and lesson lists through `client` (createIenClient).
 * @param {{ client, head?: boolean, endpoints?: { portal, lms, files } }} o
 * @returns {Promise<{ nodeRows, books, lessons }>} sorted rows
 */
export async function crawl({ client, head = true, endpoints = ENDPOINTS }) {
  const { portal, lms, files } = endpoints;
  const nodes = new Map(); // id → row
  const subjectRows = new Map(); // subject id → row

  async function walk(node, parent, depth, trail) {
    if (nodes.has(node.id)) return;
    const row = nodeRow(node, parent, depth, trail);
    nodes.set(node.id, row);
    if (depth >= MAX_DEPTH || node.codeType === "SUB") return;
    const kids = (await client.getJson(`${lms}api/tree?parentId=${node.id}`)) || [];
    await Promise.all(kids.map((k) => walk(k, node, depth + 1, row.path_titles)));
    // Subjects are not returned by tree?parentId under the year node («مقررات
    // العام الدراسي»); the portal lists them with tree/AllChildren on the grade /
    // track-year node, flattened, with their counts.
    if (depth >= 1) {
      const subs = (await client.getJson(`${lms}api/tree/AllChildren?parentId=${node.id}`)) || [];
      for (const s of subs) {
        if (s.codeType !== "SUB" || subjectRows.has(s.id)) continue;
        subjectRows.set(s.id, subjectRow(s, node.id));
      }
    }
  }

  const primary = (await client.getJson(`${portal}api/Lmstree/GetPrimaryStudentStages`)) || [];
  const midSec = (await client.getJson(`${portal}api/Lmstree/GetMidSecondaryStudentStages`)) || [];
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
  annotateNodes(nodes);

  const subjects = [...nodes.values()].filter((n) => n.code_type === "SUB");
  const books = [];
  const lessons = [];
  await Promise.all(
    subjects.map(async (s) => {
      const b = await client.getJson(`${lms}api/SubjectBooks?top=100&skip=0&treeId=${s.ien_id}`);
      for (const bk of b?.subjectBooks || []) books.push(bookRow(bk, s.ien_id, files));
      const sa = await client.getJson(`${lms}api/Questions/SelfAssessments/${s.ien_id}`);
      lessons.push(...lessonRows(sa, s.ien_id));
    }),
  );
  if (head) await Promise.all(books.map(async (b) => Object.assign(b, await client.head(b.url))));
  return sortOutputs({ nodeRows: [...nodes.values()], books, lessons });
}

const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");

/** Write the four output files. */
export function writeOutputs(outDir, { nodeRows, books, lessons }, report) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "nodes.jsonl"), jsonl(nodeRows));
  writeFileSync(join(outDir, "books.jsonl"), jsonl(books));
  writeFileSync(join(outDir, "lessons.jsonl"), jsonl(lessons));
  writeFileSync(join(outDir, "crawl-report.json"), JSON.stringify(report, null, 2) + "\n");
}

// ── CLI ────────────────────────────────────────────────────────────────────
export async function main(argv = process.argv.slice(2)) {
  const flags = Object.fromEntries(argv.filter((a) => a.startsWith("--")).map((a) => {
    const [k, v] = a.slice(2).split("=");
    return [k, v ?? true];
  }));
  const queue = createFetchQueue({ budgetPerHour: flags.budget ? Number(flags.budget) : undefined, log: (m) => console.log(`  queue: ${m}`) });
  if (flags.status) {
    console.log(formatStatus(queue.status()));
    return 0;
  }
  const retrievedAt = new Date().toISOString();
  const client = createIenClient({
    queue,
    cacheDir: cachePaths(cacheRoot()).ienApiDir(),
    refresh: Boolean(flags.refresh),
    headMaxAgeMs: Number(flags["head-max-age"] ?? 24) * 3600 * 1000,
  });
  let rows;
  try {
    rows = await crawl({ client, head: !flags["no-head"] });
  } catch (e) {
    if (e instanceof QueuePausedError) {
      console.log(`fetch queue paused (${e.reason}) until ${new Date(e.until).toISOString()}: ${client.stats.requests} requests made, responses cached — rerun later to resume. No outputs written.`);
      return 3;
    }
    throw e;
  }
  const report = crawlReport({ ...rows, retrievedAt, requests: client.stats.requests, cacheHits: client.stats.cacheHits, errors: client.errors });
  writeOutputs(OUT_DIR, rows, report);
  console.log(JSON.stringify(report.counts, null, 2));
  if (client.errors.length) console.log(`${client.errors.length} error(s) — see crawl-report.json`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );
}
