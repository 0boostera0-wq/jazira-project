#!/usr/bin/env node
// ============================================================================
// Cross-AI exchange (docs/CONTENT_ENGINE.md §4.4 Stage 3): JSONL batch files
// for the user's own signed-in ChatGPT (blind re-solver) and Gemini (language
// and ambiguity reviewer) sessions. Nothing here talks to those sites.
//
//   plan    --run run-20260928-xval-01 [--pilot] [--seed <32 hex>] [--rate-stem 0.2] [--rate-other 0.1] [--rate-language 0.1]
//           → validation/runs/<run>.json (sampling seed and rates; DeepSeek unavailable)
//   export  --agent chatgpt|gemini --run <xval run> [--batch-size 25] [--status structural_pass,auto_pass]
//           → validation/exchange/<run>/<agent>-<nnn>.request.jsonl (+ .meta.json, never sent)
//   import  --file validation/exchange/<run>/<agent>-<nnn>.response.jsonl
//           → validation records (role resolver / language) in validation/records/**
//   Common: [--staging data/staging] [--now iso]
//
// A request batch holds ≤ 25 items; its first line is
// {"_batch":{run, agent, prompt_version, count, sha256}} (sha256 of the item
// lines). Items carry only Jazira-authored item text: ChatGPT gets
// {id, language, stem, stimulus, options|left/right|items (display order), input}
// — no key, no explanation, no textbook text; Gemini also gets the key (in
// display form) and the explanation. Page text, page images and evidence
// quotes never leave the cache. The client-side display order comes from the
// same HASH-CTR keys as the exam engine (§5.2, §5.4); the meta file keeps the
// display → canonical id mapping so answers are graded canonically.
// Import is all-or-nothing: a malformed line, a foreign or repeated id, an
// extra field or an out-of-range answer rejects the whole file.
// Sampling (§4.4): ChatGPT blind solve for every high-risk, aptitude and
// legacy item plus a seeded sample (pilot 100 %; later ≥ 20 % STEM, ≥ 10 %
// elsewhere); Gemini for items with an L* warning, every `en` item and a
// seeded 10 % of the rest. Exit: 0 ok, 1 error / rejected file, 2 usage.
// ============================================================================

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gradeResponse } from "../../src/lib/content/answers.js";
import { isRunId, validationRecordId } from "../../src/lib/content/ids.js";
import { isSeed, newSeed, sha256Hex, sortByU, u, U_MAX } from "../../src/lib/content/prng.js";
import { isHighRisk, isLegacyItem, isStemItem, optionNumber } from "./lib/checks.mjs";
import { cmp } from "../../src/lib/content/expr.js";
import { writeFileIfChanged, writeJson } from "./lib/jsonl.mjs";
import { validateRecord } from "./lib/schemas.mjs";
import { attachRecord, DEFAULT_STAGING, isoNow, latestRecord, loadStaging, recordsFor, saveQuestions, saveRecords, updateRunManifest } from "./check-questions.mjs";

export const AGENTS = Object.freeze({
  chatgpt: { agent: "chatgpt_web", role: "resolver", prompt_version: "chatgpt-resolve.v1", prompt: "scripts/content/prompts/chatgpt-resolve.v1.md" },
  gemini: { agent: "gemini_web", role: "language", prompt_version: "gemini-language.v1", prompt: "scripts/content/prompts/gemini-language.v1.md" },
});
export const MAX_BATCH = 25;
export const RATE_FLOORS = Object.freeze({ stem: 0.2, other: 0.1 });
const cOrder = (a, b) => Buffer.compare(Buffer.from(String(a), "utf8"), Buffer.from(String(b), "utf8"));
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export class ExchangeError extends Error {}
const bad = (msg) => {
  throw new ExchangeError(msg);
};

// ── display views (§5.4) ────────────────────────────────────────────────────
/** Deterministic display seed of a run (packets and batches of one run agree). */
export const displaySeed = (runId) => sha256Hex(`display|${runId}`).slice(0, 32);

function numericAscending(options) {
  return [...options].sort((a, b) => {
    const x = optionNumber(a.text);
    const y = optionNumber(b.text);
    return x && y ? cmp(x, y) || cOrder(a.id, b.id) : cOrder(a.id, b.id);
  }).map((o) => o.id);
}

/**
 * What a solver sees: options / columns / items in display order, without
 * ids, plus the key in display form and the display → canonical id `map`.
 * @returns {{ item, keyDisplay, map }}
 */
export function displayView(q, seed) {
  const p = q.payload ?? {};
  const textOf = (list) => (id) => list.find((x) => x.id === id).text;
  switch (q.question_type) {
    case "mcq":
    case "true_false": {
      const opts = p.options ?? [];
      const ids = opts.map((o) => o.id);
      let order = ids;
      if (q.question_type === "mcq" && p.fixed_order_reason === "numeric_ascending") order = numericAscending(opts);
      else if (q.question_type === "mcq" && q.shuffle_options && !p.fixed_order_reason) order = sortByU(seed, `opt:${q.id}`, ids);
      return {
        item: { options: order.map(textOf(opts)), input: { type: "choice", count: order.length } },
        keyDisplay: { option_index: order.indexOf(p.answer?.option_id) },
        map: { options: order },
      };
    }
    case "matching": {
      const L = sortByU(seed, `optl:${q.id}`, (p.left ?? []).map((x) => x.id));
      const R = sortByU(seed, `optr:${q.id}`, (p.right ?? []).map((x) => x.id));
      return {
        item: { left: L.map(textOf(p.left)), right: R.map(textOf(p.right)), input: { type: "pairs", left: L.length, right: R.length } },
        keyDisplay: { pairs: (p.answer?.pairs ?? []).map(([l, r]) => [L.indexOf(l), R.indexOf(r)]).sort((a, b) => a[0] - b[0]) },
        map: { left: L, right: R },
      };
    }
    case "ordering": {
      const I = sortByU(seed, `ord:${q.id}`, (p.items ?? []).map((x) => x.id));
      const answer = p.answer?.order ?? [];
      if (I.length > 1 && I.every((id, i) => id === answer[i])) [I[0], I[1]] = [I[1], I[0]];
      return {
        item: { items: I.map(textOf(p.items)), input: { type: "order", count: I.length } },
        keyDisplay: { order: answer.map((id) => I.indexOf(id)) },
        map: { items: I },
      };
    }
    case "short_answer":
      return { item: { input: { type: "text", max_chars: p.max_chars ?? 80 } }, keyDisplay: { text: p.answer_display ?? p.accepted?.[0] ?? "" }, map: {} };
    case "numeric":
      return {
        item: { input: { type: "number", unit: p.unit ? { text: p.unit.text, required: Boolean(p.unit.required) } : null, allow_fraction: p.input?.allow_fraction !== false, max_decimals: p.input?.max_decimals ?? null } },
        keyDisplay: p.unit ? { value: p.answer?.value, unit: p.unit.text } : { value: p.answer?.value },
        map: {},
      };
    default:
      return bad(`unknown question type ${q.question_type}`);
  }
}

const isIndex = (v, n) => Number.isInteger(v) && v >= 0 && v < n;

/** A display-form response → canonical (throws ExchangeError on a bad shape or range). */
export function toCanonical(type, map, response) {
  if (!isObj(response)) bad("answer must be an object");
  const keys = Object.keys(response);
  const only = (...allowed) => keys.every((k) => allowed.includes(k)) || bad(`unexpected answer fields ${keys.join(",")}`);
  switch (type) {
    case "mcq":
    case "true_false":
      only("option_index");
      if (!isIndex(response.option_index, map.options.length)) bad("option_index out of range");
      return { option_id: map.options[response.option_index] };
    case "matching": {
      only("pairs");
      const pairs = response.pairs;
      if (!Array.isArray(pairs) || pairs.length > map.left.length) bad("pairs must be an array of [left, right] indexes");
      const L = new Set();
      const R = new Set();
      for (const pr of pairs) {
        if (!Array.isArray(pr) || pr.length !== 2 || !isIndex(pr[0], map.left.length) || !isIndex(pr[1], map.right.length)) bad("pair index out of range");
        if (L.has(pr[0]) || R.has(pr[1])) bad("a pair repeats an entry");
        L.add(pr[0]);
        R.add(pr[1]);
      }
      return { pairs: pairs.map(([l, r]) => [map.left[l], map.right[r]]) };
    }
    case "ordering": {
      only("order");
      const o = response.order;
      if (!Array.isArray(o) || o.length !== map.items.length || new Set(o).size !== o.length || !o.every((i) => isIndex(i, map.items.length))) bad("order must be a permutation of the item indexes");
      return { order: o.map((i) => map.items[i]) };
    }
    case "short_answer":
      only("text");
      if (typeof response.text !== "string" || response.text.length > 200) bad("text must be a string");
      return { text: response.text };
    case "numeric":
      only("value", "unit");
      if (typeof response.value !== "string" && typeof response.value !== "number") bad("value must be a string or number");
      if (response.unit !== undefined && response.unit !== null && typeof response.unit !== "string") bad("unit must be a string");
      return response.unit ? { value: String(response.value), unit: response.unit } : { value: String(response.value) };
    default:
      return bad(`unknown type ${type}`);
  }
}

// ── sampling ────────────────────────────────────────────────────────────────
/** Seeded inclusion: u(seed, tag, id) < rate × 2^52 (reproducible from the run manifest). */
export const sampled = (seed, tag, id, rate) => rate >= 1 || (rate > 0 && u(seed, tag, id) < Math.round(rate * U_MAX));

const deterministicOf = (bank, q) => latestRecord(bank, q, "deterministic");

/** "required" | "sampled" | null: whether the ChatGPT blind solve applies to an item. */
export function resolverNeed(q, manifest, det) {
  if (q.scope === "aptitude" || isLegacyItem(q) || isHighRisk(q, det?.checks ?? [])) return "required";
  if (!manifest?.sampling) return null;
  const s = manifest.sampling;
  const rate = s.pilot ? 1 : isStemItem(q) ? s.rates.chatgpt_stem : s.rates.chatgpt_other;
  return sampled(s.seed, "xval:chatgpt", q.id, rate) ? "sampled" : null;
}

/** "required" | "sampled" | null: whether the Gemini language review applies. */
export function languageNeed(q, manifest, det) {
  if (q.language === "en" || (det?.checks ?? []).some((c) => c.code.startsWith("L") && c.result === "warn")) return "required";
  if (!manifest?.sampling) return null;
  return sampled(manifest.sampling.seed, "xval:gemini", q.id, manifest.sampling.rates.language) ? "sampled" : null;
}

/** The sampling block of a run manifest. */
export function planSampling({ pilot = false, seed = newSeed(), rateStem = RATE_FLOORS.stem, rateOther = RATE_FLOORS.other, rateLanguage = 0.1 } = {}) {
  if (!isSeed(seed)) bad("seed must be 32 lowercase hex chars");
  if (rateStem < RATE_FLOORS.stem || rateOther < RATE_FLOORS.other) bad(`sampling rates below the floors (STEM ${RATE_FLOORS.stem}, other ${RATE_FLOORS.other})`);
  if (rateLanguage < 0 || rateLanguage > 1 || rateStem > 1 || rateOther > 1) bad("rates are fractions 0..1");
  return { seed, pilot, rates: { chatgpt_stem: pilot ? 1 : rateStem, chatgpt_other: pilot ? 1 : rateOther, language: rateLanguage } };
}

// ── export ──────────────────────────────────────────────────────────────────
const exchangeDir = (bank, runId) => join(bank.staging, "validation/exchange", runId);
const BATCH_FILE = /^(chatgpt|gemini)-(\d{3})\.request\.jsonl$/;

function existingBatches(dir, agent) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).map((f) => BATCH_FILE.exec(f)).filter((m) => m && m[1] === agent).map((m) => Number(m[2]));
}

function exportedIds(dir, agent) {
  const ids = new Set();
  if (!existsSync(dir)) return ids;
  for (const f of readdirSync(dir).filter((x) => x.startsWith(`${agent}-`) && x.endsWith(".meta.json"))) {
    for (const it of JSON.parse(readFileSync(join(dir, f), "utf8")).items ?? []) ids.add(`${it.id}#${it.revision}`);
  }
  return ids;
}

/** The item a solver / reviewer receives (Jazira-authored item text only). */
export function exchangeItem(q, agent, seed, stimulusText) {
  const view = displayView(q, seed);
  const item = { id: q.id, language: q.language, stem: q.stem, stimulus: stimulusText ?? null, ...view.item };
  if (agent === "gemini") {
    item.key = view.keyDisplay;
    item.explanation = { text: q.explanation?.text ?? "", steps: q.explanation?.steps ?? [] };
  }
  return { item, map: view.map };
}

/**
 * Build request batches (not written). Items: current revisions that passed
 * Stage 1 and need this agent under the run's sampling, not yet exported in
 * this run and without a record of this role for their revision.
 */
export function exportBatches(bank, { agent, runId, manifest, batchSize = MAX_BATCH, statuses = ["structural_pass", "auto_pass"], now = isoNow() }) {
  const spec = AGENTS[agent] ?? bad(`unknown agent ${agent}`);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH) bad(`batch size 1..${MAX_BATCH}`);
  const dir = exchangeDir(bank, runId);
  const done = exportedIds(dir, agent);
  const need = agent === "chatgpt" ? resolverNeed : languageNeed;
  const picked = [...bank.questions.values()]
    .filter((q) => q.status === "candidate" && statuses.includes(q.validation.status))
    .filter((q) => !done.has(`${q.id}#${q.revision}`))
    .filter((q) => !recordsFor(bank, q).some((r) => r.role === spec.role && r.run_id === runId))
    .filter((q) => need(q, manifest, deterministicOf(bank, q)))
    .sort((a, b) => cOrder(a.id, b.id));
  const seed = displaySeed(runId);
  let n = Math.max(0, ...existingBatches(dir, agent));
  const batches = [];
  for (let i = 0; i < picked.length; i += batchSize) {
    const chunk = picked.slice(i, i + batchSize);
    const rows = chunk.map((q) => ({ q, ...exchangeItem(q, agent, seed, q.stimulus_id ? bank.stimuli.get(q.stimulus_id)?.text : null) }));
    const itemLines = rows.map((r) => JSON.stringify(r.item));
    const sha256 = sha256Hex(itemLines.join("\n") + "\n");
    const name = `${agent}-${String(++n).padStart(3, "0")}`;
    const header = JSON.stringify({ _batch: { run: runId, agent: spec.agent, prompt_version: spec.prompt_version, count: chunk.length, sha256 } });
    batches.push({
      name,
      request: `${[header, ...itemLines].join("\n")}\n`,
      meta: {
        run: runId, agent: spec.agent, prompt_version: spec.prompt_version, prompt: spec.prompt, sha256, created_at: now,
        items: rows.map((r) => ({ id: r.q.id, revision: r.q.revision, content_hash: r.q.content_hash, question_type: r.q.question_type, map: r.map })),
      },
    });
  }
  return batches;
}

export function writeBatches(bank, runId, batches) {
  const dir = exchangeDir(bank, runId);
  return batches.map((b) => {
    writeFileIfChanged(join(dir, `${b.name}.request.jsonl`), b.request);
    writeJson(join(dir, `${b.name}.meta.json`), b.meta);
    return join(dir, `${b.name}.request.jsonl`);
  });
}

// ── import ──────────────────────────────────────────────────────────────────
const clip = (s, n) => (s == null ? null : String(s).slice(0, n));

function checkLine(o, i, agent, item) {
  const at = `line ${i + 1}`;
  if (agent === "chatgpt") {
    const extra = Object.keys(o).filter((k) => !["id", "answer", "confidence", "method"].includes(k));
    if (extra.length) bad(`${at}: unexpected fields ${extra.join(", ")}`);
    if (typeof o.confidence !== "number" || o.confidence < 0 || o.confidence > 1) bad(`${at}: confidence must be a number 0..1`);
    if (o.method !== undefined && (typeof o.method !== "string" || o.method.length > 300)) bad(`${at}: method must be a string ≤ 300 chars`);
    try {
      return { canonical: toCanonical(item.question_type, item.map, o.answer) };
    } catch (e) {
      return bad(`${at}: ${e.message}`);
    }
  }
  const extra = Object.keys(o).filter((k) => !["id", "verdict", "issues"].includes(k));
  if (extra.length) bad(`${at}: unexpected fields ${extra.join(", ")}`);
  if (!["pass", "warn", "fail"].includes(o.verdict)) bad(`${at}: verdict must be pass, warn or fail`);
  if (!Array.isArray(o.issues) || o.issues.length > 30) bad(`${at}: issues must be an array (≤ 30)`);
  for (const is of o.issues) {
    if (!isObj(is) || typeof is.code !== "string" || !is.code.trim()) bad(`${at}: every issue needs a code`);
    const extraIssue = Object.keys(is).filter((k) => !["code", "span", "suggestion"].includes(k));
    if (extraIssue.length) bad(`${at}: unexpected issue fields ${extraIssue.join(", ")}`);
  }
  return {};
}

/**
 * Validate a response file against its request batch and convert it to
 * validation records. All-or-nothing: any problem throws ExchangeError.
 * @returns {{ runId, agent, records: object[], stale: string[] }}
 */
export function readResponse(bank, file, { now = isoNow() } = {}) {
  if (!/\.response\.jsonl$/.test(file)) bad("the response file must be <agent>-<nnn>.response.jsonl");
  const reqFile = file.replace(/\.response\.jsonl$/, ".request.jsonl");
  const metaFile = file.replace(/\.response\.jsonl$/, ".meta.json");
  if (!existsSync(reqFile) || !existsSync(metaFile)) bad(`no request batch next to ${basename(file)}`);
  const meta = JSON.parse(readFileSync(metaFile, "utf8"));
  const reqLines = readFileSync(reqFile, "utf8").split("\n").filter((l) => l !== "");
  const header = JSON.parse(reqLines[0] ?? "{}")._batch;
  if (!header || sha256Hex(reqLines.slice(1).join("\n") + "\n") !== header.sha256 || header.sha256 !== meta.sha256) bad("the request batch was modified after export");
  const agent = Object.keys(AGENTS).find((k) => AGENTS[k].agent === meta.agent) ?? bad(`unknown agent ${meta.agent}`);
  const spec = AGENTS[agent];
  const lines = readFileSync(file, "utf8").replace(/^﻿/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) bad("empty response");
  const items = new Map(meta.items.map((it) => [it.id, it]));
  const seen = new Set();
  const parsed = lines.map((line, i) => {
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      return bad(`line ${i + 1}: not JSON (the reply must be JSON lines only)`);
    }
    if (!isObj(o)) bad(`line ${i + 1}: not a JSON object`);
    if (!items.has(o.id)) bad(`line ${i + 1}: id ${JSON.stringify(o.id)} is not in this batch`);
    if (seen.has(o.id)) bad(`line ${i + 1}: id ${o.id} repeated`);
    seen.add(o.id);
    return { o, ...checkLine(o, i, agent, items.get(o.id)) };
  });
  const records = [];
  const stale = [];
  for (const { o, canonical } of parsed) {
    const it = items.get(o.id);
    const q = bank.questions.get(o.id);
    if (!q || q.revision !== it.revision || q.content_hash !== it.content_hash) {
      stale.push(o.id);
      continue;
    }
    const base = {
      schema: "validation-record@1", id: validationRecordId(meta.run, q.id, spec.role), question_id: q.id, revision: q.revision,
      content_hash: q.content_hash, role: spec.role, agent: spec.agent, run_id: meta.run, prompt_version: spec.prompt_version, checked_at: now,
    };
    const record = agent === "chatgpt"
      ? {
        ...base, verdict: gradeResponse(q.question_type, q.payload, canonical).score === 1 ? "pass" : "disagree", checks: [],
        blind_answer: canonical, support: null, ambiguity: null, difficulty_estimate: null, issues: [],
        notes: clip(`confidence ${o.confidence}${o.method ? `; method: ${o.method}` : ""}`, 1000),
      }
      : {
        ...base, verdict: o.verdict, checks: [], blind_answer: null, support: null, ambiguity: null, difficulty_estimate: null,
        issues: o.issues.map((is) => ({ code: clip(is.code, 40), span: clip(is.span ?? null, 300), suggestion: clip(is.suggestion ?? null, 1000) })),
        notes: null,
      };
    const v = validateRecord("validation-record", record);
    if (!v.ok) bad(`${q.id}: ${v.errors.join("; ")}`);
    records.push(record);
  }
  return { runId: meta.run, agent, records, stale };
}

/** Import a response file into the bank (records attached; the caller saves). */
export function importResponse(bank, file, opts = {}) {
  const result = readResponse(bank, file, opts);
  for (const r of result.records) attachRecord(bank, bank.questions.get(r.question_id), r);
  return result;
}

const readManifest = (bank, runId) => {
  const p = join(bank.staging, "validation/runs", `${runId}.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
};

// ── CLI ─────────────────────────────────────────────────────────────────────
export class UsageError extends Error {}

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const o = { command, staging: DEFAULT_STAGING, run: null, agent: null, file: null, pilot: false, seed: undefined, rateStem: RATE_FLOORS.stem, rateOther: RATE_FLOORS.other, rateLanguage: 0.1, batchSize: MAX_BATCH, statuses: ["structural_pass", "auto_pass"], now: null };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const next = () => {
      const v = rest[++i];
      if (v === undefined) throw new UsageError(`${a} needs a value`);
      return v;
    };
    if (a === "--staging") o.staging = resolve(next());
    else if (a === "--run") o.run = next();
    else if (a === "--agent") o.agent = next();
    else if (a === "--file") o.file = resolve(next());
    else if (a === "--pilot") o.pilot = true;
    else if (a === "--seed") o.seed = next();
    else if (a === "--rate-stem") o.rateStem = Number(next());
    else if (a === "--rate-other") o.rateOther = Number(next());
    else if (a === "--rate-language") o.rateLanguage = Number(next());
    else if (a === "--batch-size") o.batchSize = Number(next());
    else if (a === "--status") o.statuses = next().split(",");
    else if (a === "--now") o.now = next();
    else throw new UsageError(`unknown option ${a}`);
  }
  if (command === "--help" || command === "-h" || command === undefined) return { help: true };
  if (!["plan", "export", "import"].includes(command)) throw new UsageError(`unknown command ${command} (plan | export | import)`);
  if (command !== "import" && (!o.run || !isRunId(o.run) || !o.run.includes("-xval-"))) throw new UsageError("--run <run-yyyymmdd-xval-nn> is required");
  if (command === "export" && !AGENTS[o.agent]) throw new UsageError("--agent chatgpt|gemini");
  if (command === "import" && !o.file) throw new UsageError("--file <…response.jsonl> is required");
  return o;
}

export async function main(argv = process.argv.slice(2), log = console) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    log.error(`error: ${e.message}`);
    return 2;
  }
  if (o.help) {
    log.log("usage: node scripts/content/exchange.mjs plan|export|import --run <xval run> [--agent chatgpt|gemini] [--file response.jsonl] [--pilot] (see the header)");
    return 0;
  }
  try {
    const now = o.now ?? isoNow();
    const bank = loadStaging(o.staging);
    if (o.command === "plan") {
      const sampling = planSampling({ pilot: o.pilot, seed: o.seed ?? newSeed(), rateStem: o.rateStem, rateOther: o.rateOther, rateLanguage: o.rateLanguage });
      updateRunManifest(bank.staging, o.run, {
        kind: "xval", tool: "exchange@1", planned_at: now, sampling,
        agents: { chatgpt_web: "user_session", gemini_web: "user_session", claude_subagent: "available", deepseek: "unavailable" },
        budget_note: "about 20 batches (≈ 500 items) per system per day; record the measured rate",
      });
      log.log(`planned ${o.run}: ${o.pilot ? "pilot, 100 % blind solve" : `ChatGPT STEM ${sampling.rates.chatgpt_stem}, other ${sampling.rates.chatgpt_other}`}; Gemini sample ${sampling.rates.language}`);
      return 0;
    }
    if (o.command === "export") {
      const manifest = readManifest(bank, o.run);
      if (!manifest?.sampling) {
        log.error(`run ${o.run} has no sampling plan — run "exchange.mjs plan --run ${o.run}" first`);
        return 1;
      }
      const batches = exportBatches(bank, { agent: o.agent, runId: o.run, manifest, batchSize: o.batchSize, statuses: o.statuses, now });
      const files = writeBatches(bank, o.run, batches);
      const count = batches.reduce((n, b) => n + b.meta.items.length, 0);
      const prev = manifest.exchange?.[o.agent] ?? { batches: 0, items_exported: 0, items_imported: 0 };
      updateRunManifest(bank.staging, o.run, { exchange: { [o.agent]: { ...prev, batches: prev.batches + batches.length, items_exported: prev.items_exported + count } } });
      for (const f of files) log.log(f);
      log.log(`${batches.length} batch(es), ${count} item(s) for ${o.agent}; paste ${AGENTS[o.agent].prompt} then each request file into a new chat`);
      return 0;
    }
    const result = importResponse(bank, o.file, { now });
    saveRecords(bank);
    saveQuestions(bank);
    const manifest = readManifest(bank, result.runId) ?? {};
    const prev = manifest.exchange?.[result.agent] ?? { batches: 0, items_exported: 0, items_imported: 0 };
    updateRunManifest(bank.staging, result.runId, { exchange: { [result.agent]: { ...prev, items_imported: prev.items_imported + result.records.length } } });
    log.log(`imported ${result.records.length} record(s) from ${basename(o.file)}${result.stale.length ? `; ${result.stale.length} stale (item changed since export): ${result.stale.join(", ")}` : ""}`);
    return 0;
  } catch (e) {
    log.error(`error: ${e.message}`);
    return 1;
  }
}

const invokedDirectly = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) main().then((code) => { process.exitCode = code; });
