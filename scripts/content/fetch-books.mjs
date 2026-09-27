#!/usr/bin/env node
// ============================================================================
// Full textbook downloads (docs/CONTENT_ENGINE.md §4.2 "Fetch", run R4) —
// ONLY for subjects in the current generation batch (the corpus is 37.5 GB
// and the iEN CDN throttles bursts).
//
//   node scripts/content/fetch-books.mjs --subject middle/grade-1/math [--max-gb 5] [--dry-run]
//   node scripts/content/fetch-books.mjs --resource ien-120607,ien-121391
//   node scripts/content/fetch-books.mjs --status | --verify
//
// Every download is one `full` job of the shared fetch queue
// (<cache>/fetch/queue.jsonl): one download at a time, the queue's global
// limits (≤ 2 requests in flight across all tools, spacing, backoff, circuit
// breaker, hourly budget). Files land in <cache>/ien/pdf/<file> via a `.part`
// file that resumes with Range + If-Range, and are verified (%PDF- magic,
// byte count, SHA-256) before use. A download plan above --max-gb (default 5)
// is refused. Nothing is written to the repository.
// ============================================================================
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isSafePdfName } from "./lib/cache.mjs";
import { createFetchQueue, ensurePdf, formatStatus, ienBookUrl, readDownloads, sha256File } from "./lib/fetch-queue.mjs";
import { loadContext, resolveBooks } from "./extract-pdf.mjs";

const GB = 1024 ** 3;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const [k, v] = a.slice(2).split("=");
    if (v !== undefined) args[k] = v;
    else if (argv[i + 1] && !argv[i + 1].startsWith("--")) args[k] = argv[++i];
    else args[k] = true;
  }
  return args;
}

/**
 * The download plan of a book set: which PDFs are missing (or truncated) and their bytes.
 * @returns {{ todo: object[], cached: object[], skipped: {book, reason}[], bytes: number }}
 */
export function planDownloads(ctx, books) {
  const todo = [];
  const cached = [];
  const skipped = [];
  for (const b of books) {
    if (b.file_ext !== "pdf") skipped.push({ book: b, reason: `not a PDF (${b.file_ext ?? "unknown"})` });
    else if (!isSafePdfName(b.path)) skipped.push({ book: b, reason: "unsafe file name (needs_review)" });
    else if (b.http_status !== 200) skipped.push({ book: b, reason: `listing HEAD status ${b.http_status}` });
    else {
      const f = ctx.paths.pdf(b.path);
      if (existsSync(f) && (!b.bytes || statSync(f).size === b.bytes)) cached.push(b);
      else todo.push(b);
    }
  }
  const bytes = todo.reduce((n, b) => n + (b.bytes || 0) - (existsSync(`${ctx.paths.pdf(b.path)}.part`) ? statSync(`${ctx.paths.pdf(b.path)}.part`).size : 0), 0);
  const unknownSize = todo.filter((b) => !b.bytes);
  return { todo, cached, skipped, bytes, unknownSize };
}

/** Download a plan through the queue, one file at a time. */
export async function downloadBooks(ctx, books, { queue, maxBytes = 5 * GB, expectedSha = new Map(), log = console.log } = {}) {
  const plan = planDownloads(ctx, books);
  if (plan.bytes > maxBytes) {
    const e = new Error(`download plan is ${(plan.bytes / GB).toFixed(2)} GB, above the --max-gb guard (${(maxBytes / GB).toFixed(2)} GB)`);
    e.code = "over_budget";
    throw e;
  }
  const byUrl = new Map(plan.todo.map((b) => [b.url ?? ienBookUrl(b.path), b]));
  await queue.enqueue([...byUrl].map(([url, b]) => ({ url, kind: "full", resource_id: `ien-${b.ien_book_id}` })), { retry: true });
  // The guard covers the whole run: a book without a listed size may use only
  // what is left of it (its Content-Length is checked before the body is written).
  let used = 0;
  const result = await queue.runJobs(
    async (job) => {
      const b = byUrl.get(job.url);
      const r = await ensurePdf(b.path, { queue, url: job.url, expectedBytes: b.bytes ?? null, lastModified: b.last_modified ?? null, expectedSha256: expectedSha.get(`ien-${b.ien_book_id}`) ?? null, cacheRoot: ctx.paths.root, maxBytes: Math.max(0, maxBytes - used) });
      if (r.downloaded) used += r.bytes;
      log(`${b.path}: ${r.downloaded ? "downloaded" : "cached"} ${r.bytes} bytes sha256 ${r.sha256 ?? "-"}`);
    },
    { filter: (j) => j.kind === "full" && byUrl.has(j.url), concurrency: 1 },
  );
  return { plan, result };
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const ctx = loadContext({ stagingDir: args.staging ? resolve(args.staging) : undefined });
  const queue = createFetchQueue({ budgetPerHour: args.budget ? Number(args.budget) : undefined, log: (m) => console.log(`  queue: ${m}`) });
  if (args.status) {
    console.log(formatStatus(queue.status()));
    const cachedPdfs = ctx.books.filter((b) => b.file_ext === "pdf" && isSafePdfName(b.path) && existsSync(ctx.paths.pdf(b.path))).length;
    console.log(`cached PDFs: ${cachedPdfs}/${ctx.books.length} files`);
    return 0;
  }
  if (args.verify) {
    const ledger = readDownloads(ctx.paths.root);
    let bad = 0;
    for (const [file, row] of ledger) {
      const f = ctx.paths.pdf(file);
      if (!existsSync(f)) continue;
      const sha = await sha256File(f);
      const ok = sha === row.sha256 && statSync(f).size === row.bytes;
      if (!ok) bad++;
      console.log(`${ok ? "ok " : "BAD"} ${file}`);
    }
    return bad ? 1 : 0;
  }
  if (!args.subject && !args.resource) {
    console.error("usage: fetch-books.mjs --subject <node> | --resource <id>[,…] [--max-gb 5] [--dry-run] | --status | --verify");
    return 2;
  }
  const books = resolveBooks(ctx, { subject: args.subject, resource: args.resource });
  const maxBytes = Number(args["max-gb"] ?? 5) * GB;
  const plan = planDownloads(ctx, books);
  for (const s of plan.skipped) console.log(`skip ${s.book.path}: ${s.reason}`);
  console.log(`${books.length} books: ${plan.cached.length} cached, ${plan.todo.length} to download (${(plan.bytes / GB).toFixed(2)} GB${plan.unknownSize.length ? ` + ${plan.unknownSize.length} of unknown size, limited by the guard` : ""})`);
  if (args["dry-run"]) return 0;
  const expectedSha = new Map([...ctx.resources.values()].filter((r) => r.sha256).map((r) => [r.id, r.sha256]));
  try {
    const { result } = await downloadBooks(ctx, books, { queue, maxBytes, expectedSha });
    console.log(`done ${result.done}, deferred ${result.deferred}, parked ${result.parked}, failed ${result.failed}`);
    if (result.paused) console.log(`paused (${result.paused.reason}) until ${new Date(result.paused.until).toISOString()} — rerun later to resume`);
    return result.failed ? 1 : 0;
  } catch (e) {
    if (e.code === "over_budget") {
      console.error(e.message);
      return 2;
    }
    throw e;
  }
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
