#!/usr/bin/env node
// ============================================================================
// Vision queue (docs/CONTENT_ENGINE.md §4.2 "vision instead of skipping").
// Pages whose text layer cannot be trusted (and cover/TOC pages with low
// repair confidence, and figure/equation/table pages of math and science
// books) are rendered with pdf-render.mjs and transcribed by Claude
// subagents with prompts/vision-transcribe.v1.md. Transcripts stay in the
// cache (<cache>/extract/<resource>/pages.jsonl, method: vision) and become
// the source of truth for that page's TOC, term evidence, P004 and E001.
//
//   node scripts/content/vision-queue.mjs build [--resource ien-1,…] [--run <run_id>] [--render] [--limit N]
//   node scripts/content/vision-queue.mjs import --run <run_id> --file <transcripts.jsonl>
//   node scripts/content/vision-queue.mjs status [--run <run_id>]
//
// Jobs: <cache>/llm/<run>/vision-jobs.jsonl, one per page read. Cover and TOC
// pages need two reads; their term evidence counts only when the two
// independent reads agree (one import file = one subagent session, so a
// file may not hold two reads of the same page). The subagent's own claims
// are never evidence: terms are re-derived from the transcript text.
// Page images and transcripts are copyrighted: cache only, never committed,
// never sent to third-party AI systems.
// ============================================================================

import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonl, writeJsonl } from "./lib/jsonl.mjs";
import { normalizeTitle } from "../../src/lib/content/normalize.js";
import { stripBidi } from "./lib/arabic-pdf.mjs";
import { buildOutputs, loadContext, nextRunId, readCachePages } from "./extract-pdf.mjs";
import { isRunId } from "../../src/lib/content/ids.js";

export const PROMPT_VERSION = "vision-transcribe.v1";
const MAX_TRANSCRIPT = 20000;
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const pad = (n) => String(n).padStart(3, "0");
export const visionJobId = (resourceId, page, readNo) => `${resourceId}:p${pad(page)}:r${readNo}`;
const JOB_RE = /^(ien-\d+):p(\d{3,5}):r(\d)$/;

const jobsPath = (ctx, runId) => join(ctx.paths.llmDir(runId), "vision-jobs.jsonl");
const readJobs = (ctx, runId) => (existsSync(jobsPath(ctx, runId)) ? readJsonl(jobsPath(ctx, runId)) : []);
function writeJobs(ctx, runId, jobs) {
  const p = jobsPath(ctx, runId);
  mkdirSync(dirname(p), { recursive: true });
  writeJsonl(p, jobs, { compare: (a, b) => (a.job_id < b.job_id ? -1 : a.job_id > b.job_id ? 1 : 0) });
}

function pageKindsOf(ctx, resourceId) {
  const p = join(ctx.stagingDir, "resources", "page-maps", `${resourceId}.jsonl`);
  return new Map((existsSync(p) ? readJsonl(p) : []).map((r) => [r.pdf_page, r.kind]));
}

/**
 * Vision jobs still needed for one resource (missing reads of routed pages).
 * @returns {object[]} jobs
 */
export function jobsForResource(ctx, book, { runId }) {
  const resourceId = `ien-${book.ien_book_id}`;
  const rows = readCachePages(ctx, resourceId);
  const kinds = pageKindsOf(ctx, resourceId);
  const reads = new Map(); // pdf_page → set of read numbers already imported
  for (const r of rows) if (r.method === "vision") reads.set(r.pdf_page, (reads.get(r.pdf_page) ?? new Set()).add(r.read_no ?? 1));
  const jobs = [];
  for (const r of rows) {
    if (r.method !== "text" || !r.needs_vision) continue;
    const required = Math.max(1, r.vision_reads_required ?? 1);
    const have = reads.get(r.pdf_page) ?? new Set();
    const purpose = kinds.get(r.pdf_page) === "toc" ? "toc" : r.pdf_page <= 3 ? "cover" : "page";
    for (let k = 1; k <= required; k++) {
      if (have.has(k)) continue;
      jobs.push({
        job_id: visionJobId(resourceId, r.pdf_page, k),
        run_id: runId,
        resource_id: resourceId,
        file: book.path,
        pdf_page: r.pdf_page,
        purpose,
        reason: r.vision_reason,
        read_no: k,
        reads_required: required,
        image: ctx.paths.pageImage(book.path, r.pdf_page).replace(/\\/g, "/"),
        rendered: existsSync(ctx.paths.pageImage(book.path, r.pdf_page)),
        prompt: PROMPT_VERSION,
        status: "pending",
      });
    }
  }
  return jobs;
}

/** Build (or extend) the job file of a run; optionally render the missing images. */
export async function buildJobs(ctx, books, { runId, render = false, limit = Infinity, renderPages = null } = {}) {
  const existing = new Map(readJobs(ctx, runId).map((j) => [j.job_id, j]));
  const fresh = books.flatMap((b) => jobsForResource(ctx, b, { runId })).filter((j) => !existing.has(j.job_id)).slice(0, limit);
  if (render && fresh.length) {
    const render_ = renderPages ?? (await import("./pdf-render.mjs")).renderPages;
    const byFile = new Map();
    for (const j of fresh) if (!j.rendered) byFile.set(j.file, [...(byFile.get(j.file) ?? []), j.pdf_page]);
    for (const [file, pages] of byFile) {
      await render_(file, [...new Set(pages)].sort((a, b) => a - b));
      for (const j of fresh) if (j.file === file) j.rendered = existsSync(ctx.paths.pageImage(file, j.pdf_page));
    }
  }
  for (const j of fresh) existing.set(j.job_id, j);
  writeJobs(ctx, runId, [...existing.values()]);
  return { added: fresh.length, total: existing.size, jobs: fresh };
}

/**
 * Validate a transcript file against the run's jobs.
 * @returns {{ rows: object[], errors: string[] }}
 */
export function validateTranscripts(lines, jobs) {
  const byId = new Map(jobs.map((j) => [j.job_id, j]));
  const errors = [];
  const rows = [];
  const pagesInFile = new Set();
  lines.forEach((line, i) => {
    const where = `line ${i + 1}`;
    let o;
    try {
      o = typeof line === "string" ? JSON.parse(line) : line;
    } catch {
      errors.push(`${where}: not JSON`);
      return;
    }
    if (!o || typeof o !== "object" || Array.isArray(o)) return errors.push(`${where}: not an object`);
    const job = byId.get(o.job_id);
    if (!job) return errors.push(`${where}: unknown job_id ${JSON.stringify(o.job_id)}`);
    const m = JOB_RE.exec(o.job_id);
    if (!m || o.resource_id !== job.resource_id || o.pdf_page !== job.pdf_page || o.read_no !== job.read_no) return errors.push(`${where}: resource/page/read do not match ${o.job_id}`);
    if (typeof o.transcript !== "string" || o.transcript.length > MAX_TRANSCRIPT) return errors.push(`${where}: transcript must be a string ≤ ${MAX_TRANSCRIPT} chars`);
    if (o.printed_page !== undefined && o.printed_page !== null && !(Number.isInteger(o.printed_page) && o.printed_page >= 0)) return errors.push(`${where}: bad printed_page`);
    const pageKey = `${job.resource_id}:${job.pdf_page}`;
    if (pagesInFile.has(pageKey)) return errors.push(`${where}: a second read of ${pageKey} in the same file (reads must come from independent sessions)`);
    pagesInFile.add(pageKey);
    rows.push({ job, printed_page: o.printed_page ?? null, transcript: o.transcript });
  });
  return { rows, errors };
}

/** Store validated reads in the cache and rebuild the resources' outputs. */
export function importTranscripts(ctx, runId, lines, { importedAt = nowIso() } = {}) {
  const jobs = readJobs(ctx, runId);
  const { rows, errors } = validateTranscripts(lines, jobs);
  if (errors.length) return { imported: 0, errors, rebuilt: [] };
  const byResource = new Map();
  for (const r of rows) byResource.set(r.job.resource_id, [...(byResource.get(r.job.resource_id) ?? []), r]);
  for (const [resourceId, list] of byResource) {
    const cache = readCachePages(ctx, resourceId);
    const replaced = new Set(list.map((r) => `${r.job.pdf_page}:${r.job.read_no}`));
    const keep = cache.filter((c) => !(c.method === "vision" && replaced.has(`${c.pdf_page}:${c.read_no}`)));
    for (const r of list) {
      const text = stripBidi(r.transcript).normalize("NFC").replace(/\r\n?/g, "\n");
      keep.push({
        pdf_page: r.job.pdf_page,
        method: "vision",
        read_no: r.job.read_no,
        job_id: r.job.job_id,
        raw: r.transcript,
        repaired: text,
        normalized: normalizeTitle(text),
        text_quality: "ok",
        printed_page: r.printed_page,
        prompt: PROMPT_VERSION,
        run_id: runId,
        imported_at: importedAt,
      });
    }
    const p = ctx.paths.extractPages(resourceId);
    mkdirSync(dirname(p), { recursive: true });
    writeJsonl(p, keep, { compare: (a, b) => a.pdf_page - b.pdf_page || (a.method < b.method ? -1 : a.method > b.method ? 1 : 0) || (a.read_no ?? 0) - (b.read_no ?? 0) });
  }
  const done = new Set(rows.map((r) => r.job.job_id));
  writeJobs(ctx, runId, jobs.map((j) => (done.has(j.job_id) ? { ...j, status: "done", imported_at: importedAt } : j)));
  const rebuilt = [];
  for (const resourceId of byResource.keys()) {
    const book = ctx.booksById.get(resourceId);
    if (!book) continue;
    buildOutputs(ctx, book, { run_id: runId });
    rebuilt.push(resourceId);
  }
  return { imported: rows.length, errors: [], rebuilt };
}

export function jobStatus(ctx, runId = null) {
  const root = join(ctx.paths.root, "llm");
  const runs = runId ? [runId] : existsSync(root) ? readdirSync(root).filter(isRunId) : [];
  const out = {};
  for (const r of runs) {
    const jobs = readJobs(ctx, r);
    if (!jobs.length) continue;
    out[r] = { total: jobs.length, done: jobs.filter((j) => j.status === "done").length, pending: jobs.filter((j) => j.status !== "done").length, unrendered: jobs.filter((j) => j.status !== "done" && !j.rendered).length };
  }
  return out;
}

// ── CLI ────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      args._.push(a);
      continue;
    }
    const [k, v] = a.slice(2).split("=");
    if (v !== undefined) args[k] = v;
    else if (argv[i + 1] && !argv[i + 1].startsWith("--")) args[k] = argv[++i];
    else args[k] = true;
  }
  return args;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const cmd = args._[0];
  const ctx = loadContext({ stagingDir: args.staging ? resolve(args.staging) : undefined });
  if (cmd === "status") {
    console.log(JSON.stringify(jobStatus(ctx, typeof args.run === "string" ? args.run : null), null, 2));
    return 0;
  }
  if (cmd === "build") {
    const runId = typeof args.run === "string" ? args.run : nextRunId(ctx.stagingDir, "extract");
    let books;
    if (typeof args.resource === "string") {
      books = args.resource.split(",").map((id) => ctx.booksById.get(id.trim()));
      if (books.some((b) => !b)) throw new Error(`unknown resource in ${args.resource}`);
    } else {
      const extracted = join(ctx.stagingDir, "resources", "extraction.jsonl");
      const ids = existsSync(extracted) ? readJsonl(extracted).filter((r) => (r.pages_awaiting_vision ?? 0) > 0).map((r) => r.resource_id) : [];
      books = ids.map((id) => ctx.booksById.get(id)).filter(Boolean);
    }
    const r = await buildJobs(ctx, books, { runId, render: Boolean(args.render), limit: args.limit ? Number(args.limit) : Infinity });
    console.log(`${runId}: ${r.added} new vision jobs (${r.total} in the run) → ${jobsPath(ctx, runId)}`);
    console.log(`Each job is one Claude subagent read with scripts/content/prompts/${PROMPT_VERSION}.md; reads 1 and 2 of a page come from different sessions and different import files.`);
    return 0;
  }
  if (cmd === "import") {
    if (!isRunId(String(args.run)) || typeof args.file !== "string") {
      console.error("usage: vision-queue.mjs import --run <run_id> --file <transcripts.jsonl>");
      return 2;
    }
    const lines = (await import("node:fs")).readFileSync(resolve(args.file), "utf8").split("\n").filter((l) => l.trim());
    const r = importTranscripts(ctx, args.run, lines);
    if (r.errors.length) {
      console.error(r.errors.join("\n"));
      return 1;
    }
    console.log(`imported ${r.imported} reads; rebuilt ${r.rebuilt.join(", ") || "nothing"}`);
    return 0;
  }
  console.error("usage: vision-queue.mjs build|import|status [options]");
  return 2;
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
