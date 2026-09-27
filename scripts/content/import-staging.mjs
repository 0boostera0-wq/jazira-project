#!/usr/bin/env node
// ============================================================================
// Import staging into the database (docs/CONTENT_ENGINE.md §6.3).
//
//   node scripts/content/import-staging.mjs --target pglite|supabase [--run <id>] [--resume]
//        [--only sources,resources,curriculum,objectives,stimuli,questions,templates]
//        [--batch 500] [--dry-run] [--no-retire] [--staging <dir>] [--json]
//
// 1. Preflight: validate-staging must pass (manifest.json included). Only
//    `published` questions are sent; for --target supabase a question's
//    source must also have publish_policy derived_questions_allowed
//    (internal sources always qualify).
// 2. ce_import_begin(manifest) → run id. Checkpoint after every acknowledged
//    batch: <cache>/import/<target>/checkpoint.json {run_id, manifest_sha,
//    entity, shard, line, batch_no, …}; --resume continues from it (the
//    manifest sha must match).
// 3. Order: sources, nodes, resources, subject terms, lesson ranges,
//    objectives, stimuli, retirement of removed[] keys, questions (+ keys,
//    links, revision history), exam templates.
// 4. ≤ 500 rows per ce_import_batch (one transaction, bulk-import mode).
// 5. A failed batch is split in halves down to single rows; a row that still
//    fails is sent once more marked `_import.reject` so the database logs it
//    in content_import_errors, and the run continues. Network errors are
//    retried with backoff 1/2/4/8 s; after that the run stops (resumable).
// 6. Retire only removed[] keys inside the covered shards, before question
//    inserts; the database refuses it for --only runs, runs with errors and
//    filtered publish sets. ce_import_finish refreshes the aggregates once.
// 7. NDJSON log <cache>/import/<target>/<run>.log.jsonl; report
//    data/staging/reports/import/<target>-<run>.json for supabase, the cache
//    for pglite / test runs.
// Exit: 0 done, 1 done with rejected rows, 2 usage / preflight, 3 stopped
// (resume with --resume).
// ============================================================================
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cachePaths, cacheRoot } from "./lib/cache.mjs";
import { createExecutor } from "./lib/import-executors.mjs";
import { BATCH_SIZE, buildPlan, loadStaging, parseOnly, planRetire, removedKeys, rowKey } from "./lib/import-plan.mjs";

const REPO = resolve(fileURLToPath(import.meta.url), "../../..");
export const RETRY_DELAYS_MS = Object.freeze([1000, 2000, 4000, 8000]);
const RUN_LABEL_RE = /^run-\d{8}-import-\d{2}$|^[a-z0-9][a-z0-9-]{2,62}$/;

export class ImportError extends Error {
  constructor(code, message, detail = null) {
    super(message);
    this.name = "ImportError";
    this.code = code;
    this.detail = detail;
  }
}

const readJsonIf = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);
const writeJsonFile = (p, v) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`, "utf8");
};
const isFatal = (e) => e?.code === "P0001" || e?.code === "42501" || e?.code === "42883" || e?.code === "PGRST202" || e?.code === "unavailable";

/** The next free run label for today: run-<yyyymmdd>-import-<nn>. */
export function nextRunLabel(dir, date = new Date()) {
  const day = date.toISOString().slice(0, 10).replace(/-/g, "");
  const re = new RegExp(`^(?:[a-z]+-)?run-${day}-import-(\\d{2})\\.`); // logs and pglite / test reports
  const used = existsSync(dir) ? readdirSync(dir).map((f) => re.exec(f)?.[1]).filter(Boolean).map(Number) : [];
  const nn = String((used.length ? Math.max(...used) : 0) + 1).padStart(2, "0");
  return `run-${day}-import-${nn}`;
}

const emptyCounts = () => ({ rows: 0, inserted: 0, updated: 0, unchanged: 0, rejected: 0 });

/**
 * Import a staging tree.
 * @param {object} o
 * @param {"pglite"|"supabase"} o.target
 * @param {string} [o.stagingDir]         default data/staging
 * @param {object} [o.executor]           { rpc(name, args) } (default: createExecutor(target))
 * @param {string} [o.run]                run label (logs, report); default run-<yyyymmdd>-import-<nn>
 * @param {boolean} [o.resume]            continue from the checkpoint
 * @param {string|string[]|null} [o.only] entity groups (see ONLY_GROUPS)
 * @param {number} [o.batch]              rows per batch (1..500)
 * @param {boolean} [o.dryRun] [o.noRetire]
 * @param {boolean} [o.validate=true]     run validate-staging first (tests may import synthetic trees)
 * @param {string} [o.cacheDir]           content cache root (default $CONTENT_CACHE_DIR or C:/jazira/content-cache)
 * @param {string} [o.reportDir]          where the report goes (default per target, §6.3 step 7)
 * @param {(ms:number)=>Promise} [o.sleep]
 */
export async function importStaging(o = {}) {
  const target = o.target;
  if (target !== "pglite" && target !== "supabase") throw new ImportError("usage", "--target must be pglite or supabase");
  const stagingDir = resolve(o.stagingDir ?? join(REPO, "data/staging"));
  const batch = o.batch ?? BATCH_SIZE;
  if (!Number.isInteger(batch) || batch < 1 || batch > BATCH_SIZE) throw new ImportError("usage", `--batch must be 1..${BATCH_SIZE}`);
  const only = Array.isArray(o.only) ? o.only : parseOnly(o.only ?? null);
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const started = Date.now();

  if (o.validate !== false) {
    const { validateStaging } = await import("./validate-staging.mjs");
    const v = await validateStaging({ root: stagingDir, runtimeDir: null, registryBaseline: null });
    if (!v.ok) throw new ImportError("preflight_failed", `validate-staging failed with ${v.errors.length} errors`, v.errors.slice(0, 20));
  }
  const staging = loadStaging(stagingDir);
  const plan = buildPlan(staging, { target, only });
  const importDir = cachePaths(o.cacheDir ?? cacheRoot()).importDir(target);
  const previous = readJsonIf(join(importDir, "last-manifest.json"));
  const removed = removedKeys(staging.manifest, previous);
  const retirePlan = planRetire(removed, { previous, shardOf: staging.shardOf, coveredShards: plan.coveredShards });
  const summary = {
    target, manifest_sha: staging.manifestSha, only, filtered: plan.filtered, filtered_out: plan.filteredOut.length,
    duplicates: plan.duplicates, removed: removed.length, retire_planned: retirePlan.keys.length,
    entities: Object.fromEntries(plan.entities.map((e) => [e.entity, e.rows.length])),
  };
  if (o.dryRun) return { dryRun: true, ...summary, retire_skipped: retirePlan.skipped };

  const checkpointPath = join(importDir, "checkpoint.json");
  let cp = null;
  if (o.resume) {
    // the CLI's pglite target is a fresh in-memory database per process: the stopped run is gone
    if (target === "pglite" && !o.executor) throw new ImportError("usage", "--resume: --target pglite starts a fresh in-memory database, so there is no run to resume; start a new run");
    cp = readJsonIf(checkpointPath);
    if (!cp) throw new ImportError("usage", "--resume: no checkpoint for this target");
    if (cp.manifest_sha !== staging.manifestSha) throw new ImportError("manifest_changed", "--resume: manifest.json changed since the checkpoint; start a new run");
    if (JSON.stringify(cp.only ?? null) !== JSON.stringify(only)) throw new ImportError("usage", `--resume: the stopped run used --only ${cp.only ? cp.only.join(",") : "(none)"}; resume with the same entities`);
  }
  const run = cp?.run ?? o.run ?? nextRunLabel(importDir);
  if (!RUN_LABEL_RE.test(run)) throw new ImportError("usage", `bad run label ${run}`);
  const logPath = join(importDir, `${run}.log.jsonl`);
  mkdirSync(importDir, { recursive: true });
  const log = (event, data = {}) => appendFileSync(logPath, `${JSON.stringify({ at: new Date().toISOString(), run, event, ...data })}\n`, "utf8");

  const exec = o.executor ?? (await createExecutor(target));
  const ownExecutor = !o.executor;
  const call = async (fn, args) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await exec.rpc(fn, args);
      } catch (e) {
        if (!e?.network || attempt >= RETRY_DELAYS_MS.length) throw e;
        log("retry", { fn, attempt: attempt + 1, delay_ms: RETRY_DELAYS_MS[attempt], message: e.message });
        await sleep(RETRY_DELAYS_MS[attempt]);
      }
    }
  };

  const state = cp ?? {
    run, run_id: null, manifest_sha: staging.manifestSha, target, only, entity: null, shard: null, line: 0, batch_no: 0,
    retired: false, counts: {}, errors: [], retire: null,
  };
  const save = () => writeJsonFile(checkpointPath, state);
  try {
    if (!state.run_id) {
      state.run_id = await call("ce_import_begin", {
        p_manifest: {
          schema: "manifest@1", sha256: staging.manifestSha, removed,
          run: { target, label: run, only, filtered: plan.filtered, no_retire: Boolean(o.noRetire) },
        },
      });
      log("begin", { run_id: state.run_id, manifest_sha: staging.manifestSha, ...summary });
      save();
    } else log("resume", { run_id: state.run_id, entity: state.entity, line: state.line });

    const order = plan.entities.map((e) => e.entity);
    const startIndex = state.entity ? order.indexOf(state.entity) : 0;
    for (let ei = Math.max(0, startIndex); ei < plan.entities.length; ei++) {
      const { entity, rows } = plan.entities[ei];
      if (entity === "questions" && !state.retired && !o.noRetire) {
        state.retire = await retire(call, state, retirePlan, removed, log);
        state.retired = true;
        save();
      }
      let line = state.entity === entity ? state.line : 0;
      let batchNo = state.entity === entity ? state.batch_no : 0;
      state.counts[entity] ??= emptyCounts();
      while (line < rows.length) {
        const chunk = rows.slice(line, line + batch);
        batchNo += 1;
        const results = await sendSplit(call, state.run_id, entity, batchNo, chunk, log);
        for (const res of results) {
          const c = state.counts[entity];
          c.rows += res.rows;
          c.inserted += res.inserted;
          c.updated += res.updated;
          c.unchanged += res.unchanged;
          c.rejected += res.rejected;
          for (const err of res.errors ?? []) state.errors.push({ entity, ...err });
        }
        line += chunk.length;
        const last = chunk[chunk.length - 1];
        Object.assign(state, { entity, line, batch_no: batchNo, shard: entity === "questions" ? staging.shardOf.get(last.id) ?? null : rowKey(entity, last) });
        save();
        log("batch", { entity, batch_no: batchNo, rows: chunk.length, line });
      }
      if (ei + 1 < plan.entities.length) Object.assign(state, { entity: plan.entities[ei + 1].entity, line: 0, batch_no: 0 });
      save();
    }
    if (!state.retired && !o.noRetire && !plan.entities.some((e) => e.entity === "questions")) {
      state.retire = await retire(call, state, retirePlan, removed, log);
      state.retired = true;
      save();
    }
    const fin = await call("ce_import_finish", { p_run: state.run_id });
    log("finish", fin ?? {});
    const report = {
      schema: "import-report@1",
      run,
      run_id: state.run_id,
      target,
      manifest_sha: staging.manifestSha,
      only,
      filtered: { publish_policy: plan.filtered, held_back: plan.filteredOut.length },
      entities: state.counts,
      retire: state.retire ?? { requested: 0, retired: 0, skipped: [], refused: o.noRetire ? "no_retire" : null },
      errors: state.errors,
      aggregates_refreshed: Boolean(fin?.aggregates_refreshed),
      database_counts: fin?.counts ?? null,
      duration_ms: Date.now() - started,
    };
    if (state.counts.questions) state.counts.questions.retired = report.retire.retired ?? 0;
    const reportPath = join(o.reportDir ?? (target === "supabase" ? join(REPO, "data/staging/reports/import") : importDir), `${target}-${run}.json`);
    // the diff base of the next run's removed[]: only a run that applied the whole manifest (no --only, no
    // filtered publish set, no rejected rows, retirement done) moves it, so refused removals carry over
    const complete = !only && !plan.filtered && !state.errors.length && !o.noRetire && !report.retire.refused;
    if (complete) writeJsonFile(join(importDir, "last-manifest.json"), { sha256: staging.manifestSha, published: staging.manifest.published ?? {} });
    report.diff_base_updated = complete;
    writeJsonFile(reportPath, report);
    rmSync(checkpointPath, { force: true });
    return { ...report, report_path: reportPath, log_path: logPath };
  } catch (e) {
    log("stopped", { code: e.code ?? null, message: e.message });
    throw new ImportError(e instanceof ImportError ? e.code : "stopped", `import stopped (${e.message}); rerun with --resume`, { run, run_id: state.run_id, cause: e.code ?? null });
  } finally {
    if (ownExecutor) await exec.close?.();
  }
}

/** Retirement step: SQL refuses it for --only, errors or filtered sets (retire_refused). */
async function retire(call, state, retirePlan, removed, log) {
  const out = { requested: retirePlan.keys.length, retired: 0, skipped: [...retirePlan.skipped], refused: null };
  if (!removed.length) return out;
  try {
    const res = await call("ce_import_retire", { p_run: state.run_id, p_keys: retirePlan.keys });
    out.retired = res?.retired ?? 0;
    out.skipped.push(...(res?.skipped ?? []));
  } catch (e) {
    if (e?.message !== "retire_refused") throw e;
    out.refused = e.details?.reason ?? "refused";
  }
  log("retire", out);
  return out;
}

/** Send a batch; on a non-fatal failure split it in halves down to single rows. */
async function sendSplit(call, runId, entity, batchNo, rows, log) {
  try {
    return [await call("ce_import_batch", { p_run: runId, p_entity: entity, p_batch_no: batchNo, p_rows: rows })];
  } catch (e) {
    if (e?.network || isFatal(e)) throw e;
    if (rows.length === 1) {
      log("isolate", { entity, key: rowKey(entity, rows[0]), message: e.message });
      const marked = { ...rows[0], _import: { ...(rows[0]._import ?? {}), reject: "batch_error", detail: { message: String(e.message).slice(0, 300) } } };
      return [await call("ce_import_batch", { p_run: runId, p_entity: entity, p_batch_no: batchNo, p_rows: [marked] })];
    }
    const mid = Math.ceil(rows.length / 2);
    log("split", { entity, batch_no: batchNo, rows: rows.length, message: e.message });
    return [
      ...(await sendSplit(call, runId, entity, batchNo, rows.slice(0, mid), log)),
      ...(await sendSplit(call, runId, entity, batchNo, rows.slice(mid), log)),
    ];
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────────
const USAGE = "usage: import-staging --target pglite|supabase [--run <id>] [--resume] [--only a,b] [--batch 500] [--dry-run] [--no-retire] [--staging <dir>] [--json]";

export function parseArgs(argv) {
  const o = {};
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new ImportError("usage", `${a} needs a value\n${USAGE}`);
      return v;
    };
    if (a === "--target") o.target = value();
    else if (a === "--run") o.run = value();
    else if (a === "--resume") o.resume = true;
    else if (a === "--only") o.only = value();
    else if (a === "--batch") o.batch = Number(value());
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--no-retire") o.noRetire = true;
    else if (a === "--staging") o.stagingDir = resolve(value());
    else if (a === "--json") json = true;
    else throw new ImportError("usage", `unknown argument ${a}\n${USAGE}`);
  }
  if (!o.target) throw new ImportError("usage", USAGE);
  return { options: o, json };
}

export async function main(argv = process.argv.slice(2), out = console) {
  let parsed;
  try {
    parsed = parseArgs(argv);
    if (parsed.options.only) parseOnly(parsed.options.only);
  } catch (e) {
    out.error(e.message);
    return 2;
  }
  try {
    const r = await importStaging(parsed.options);
    if (parsed.json) out.log(JSON.stringify(r, null, 2));
    else if (r.dryRun) out.log(`dry run (${r.target}): ${Object.entries(r.entities).map(([k, v]) => `${k} ${v}`).join(", ")}; removed ${r.removed}, retire ${r.retire_planned}`);
    else {
      out.log(`import ${r.run} (${r.target}) done in ${r.duration_ms} ms — ${Object.entries(r.entities).map(([k, c]) => `${k}: +${c.inserted} ~${c.updated} =${c.unchanged} x${c.rejected}`).join("; ")}; retired ${r.retire.retired}${r.retire.refused ? ` (refused: ${r.retire.refused})` : ""}; report ${r.report_path}`);
      for (const e of r.errors.slice(0, 50)) out.error(`rejected ${e.entity} ${e.key}: ${e.code}`);
    }
    return r.dryRun || !r.errors.length ? 0 : 1;
  } catch (e) {
    out.error(e.message);
    if (e.detail) out.error(JSON.stringify(e.detail).slice(0, 2000));
    return e.code === "usage" || e.code === "preflight_failed" || e.code === "manifest_changed" ? 2 : 3;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => {
    process.exitCode = code;
  });
}
