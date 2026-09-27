#!/usr/bin/env node
// ============================================================================
// Validation resolution (docs/CONTENT_ENGINE.md §4.4 "Resolution", §2.15).
//
//   add-records --run run-20260928-val-01 --file <records.jsonl | dir of *.record.json>
//               [--evidence <evidence-extractor.jsonl>]
//       imports Claude primary-validator records (validate.v1). The blind
//       answer arrives in display form ({option_index} …, as the blind packet
//       showed the item) and is stored canonically. For high-risk,
//       source-based items the independent evidence extractor's spans must
//       overlap the generator's evidence; the outcome is kept on the record as
//       the issue `evidence_extractor` (span "overlap" | "no_overlap"), and
//       no overlap downgrades `support` to `unsupported`.
//   resolve     --run run-20260928-val-02 [--xval run-20260928-xval-01] [--ids a,b]
//       applies review decisions and the resolution matrix to every current
//       revision, writes statuses, human records and the review queue.
//   Common: [--staging data/staging] [--cache dir] [--now iso]
//
// Matrix (never auto-picks an answer): deterministic fail → rejected; any
// disagreement between key, primary blind answer and resolver answer →
// review_required; unsupported / not-checked support for source_derived and
// transformed → review_required; ambiguous → review_required; language
// reviewer fail → review_required (warn is recorded); P006, V001 and
// not_checked pages → review_required; all required validators pass →
// validated. Required: the primary validator always; the ChatGPT blind solve
// for high-risk, aptitude and legacy items and the run's seeded sample
// (pilot: all); the Gemini review for L* warnings, `en` items and its sample;
// the evidence extractor for high-risk source-based items. Missing required
// records keep the item pending (validation.status auto_pass once the primary
// passed). Exit: 0 ok, 1 error, 2 usage.
// ============================================================================

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gradeResponse } from "../../src/lib/content/answers.js";
import { canonicalJson, isRunId, validationRecordId } from "../../src/lib/content/ids.js";
import { cacheRoot } from "./lib/cache.mjs";
import { createPageStore, isHighRisk, locateQuote, matchForm, REVIEW_CODES } from "./lib/checks.mjs";
import { validateRecord } from "./lib/schemas.mjs";
import {
  attachRecord, bumpRevision, DEFAULT_STAGING, enqueueReview, evidenceRows, evidenceStore, isoNow, latestRecord, loadStaging, recordsFor,
  saveQuestions, saveRecords, saveReviewQueue, updateRunManifest,
} from "./check-questions.mjs";
import { displaySeed, displayView, languageNeed, resolverNeed, toCanonical } from "./exchange.mjs";

const cOrder = (a, b) => Buffer.compare(Buffer.from(String(a), "utf8"), Buffer.from(String(b), "utf8"));
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const latest = (list) => [...list].sort((a, b) => cOrder(a.checked_at, b.checked_at) || cOrder(a.id, b.id)).at(-1) ?? null;
const SOURCE_BASED = new Set(["source_derived", "transformed"]);

export class ResolveError extends Error {}
const bad = (msg) => {
  throw new ResolveError(msg);
};

// ── primary records and the evidence extractor ─────────────────────────────
const RESPONSE_KEYS = ["option_index", "pairs", "order", "text", "value", "unit"];

/**
 * Validate and normalize one primary-validator record against the bank:
 * current revision and content hash, role primary, agent claude_subagent,
 * blind answer converted from display form to canonical ids.
 */
export function normalizePrimaryRecord(bank, raw, runId) {
  if (!isObj(raw)) bad("record is not an object");
  const q = bank.questions.get(raw.question_id) ?? bad(`question ${raw.question_id} does not exist`);
  if (raw.revision !== q.revision || raw.content_hash !== q.content_hash) bad(`${q.id}: record is for revision ${raw.revision}, the item is at ${q.revision}`);
  if (raw.role !== "primary" || raw.agent !== "claude_subagent") bad(`${q.id}: add-records takes primary records by claude_subagent`);
  if (raw.run_id !== runId) bad(`${q.id}: record run ${raw.run_id} ≠ --run ${runId}`);
  let blind = null;
  if (raw.blind_answer != null) {
    if (!isObj(raw.blind_answer) || !Object.keys(raw.blind_answer).every((k) => RESPONSE_KEYS.includes(k))) bad(`${q.id}: blind_answer must be in display form`);
    const view = displayView(q, displaySeed(runId));
    try {
      blind = toCanonical(q.question_type, view.map, raw.blind_answer);
    } catch (e) {
      bad(`${q.id}: blind_answer ${e.message}`);
    }
  }
  const record = {
    schema: "validation-record@1", id: validationRecordId(runId, q.id, "primary"), question_id: q.id, revision: q.revision,
    content_hash: q.content_hash, role: "primary", agent: "claude_subagent", run_id: runId, prompt_version: raw.prompt_version ?? "validate.v1",
    checked_at: raw.checked_at, verdict: raw.verdict, checks: raw.checks ?? [], blind_answer: blind,
    support: raw.support ?? null, ambiguity: raw.ambiguity ?? null, difficulty_estimate: raw.difficulty_estimate ?? null,
    issues: raw.issues ?? [], notes: raw.notes ?? null,
  };
  const v = validateRecord("validation-record", record);
  if (!v.ok) bad(`${q.id}: ${v.errors.join("; ")}`);
  return { q, record };
}

/**
 * Does an evidence-extractor span overlap the generator's evidence? Same page
 * and intersecting char offsets on the page text, or (when the page has no
 * trustworthy text) a shared run of ≥ 20 matching-form chars.
 */
export function evidenceOverlaps(q, spans, { pages, evidence }) {
  const quotes = evidenceRows(evidence, q);
  for (const e of q.source?.evidence ?? []) {
    const gen = quotes.find((r) => r.pdf_page === e.pdf_page && r.quote_sha256 === e.quote_sha256);
    for (const s of spans.filter((x) => x.pdf_page === e.pdf_page && typeof x.quote === "string")) {
      const page = pages ? pages.get(q.source.resource_id, e.pdf_page) : null;
      if (page?.readable) {
        const at = locateQuote(page.text, s.quote);
        const [a, b] = e.char_offsets;
        if (at && b > a && at[0] < b && a < at[1]) return true;
      }
      if (gen) {
        const g = matchForm(gen.quote);
        const t = matchForm(s.quote);
        for (let i = 0; i + 20 <= t.length; i++) if (g.includes(t.slice(i, i + 20))) return true;
        if (t.length < 20 && t.length >= 8 && g.includes(t)) return true;
        // Symmetric: a short generator quote («مح = 2 ل + 2 ض») inside the extractor's longer span.
        if (g.length < 20 && g.length >= 8 && t.includes(g)) return true;
      }
    }
  }
  return false;
}

/** Record the evidence-extractor outcome on a primary record (high-risk, source-based items). */
export function applyEvidenceResult(q, record, spans, ctx) {
  const overlap = evidenceOverlaps(q, spans, ctx);
  record.issues = [...record.issues.filter((i) => i.code !== "evidence_extractor"), {
    code: "evidence_extractor", span: overlap ? "overlap" : "no_overlap",
    suggestion: overlap ? null : "the independent evidence extractor's span does not overlap the cited evidence",
  }];
  if (!overlap) {
    record.support = "unsupported";
    record.notes = `${record.notes ? `${record.notes} ` : ""}[support downgraded: evidence extractor span does not overlap]`.slice(0, 1000);
  }
  return overlap;
}

function readRecordInputs(path) {
  if (statSync(path).isDirectory()) {
    return readdirSync(path).filter((f) => f.endsWith(".record.json")).sort().map((f) => JSON.parse(readFileSync(join(path, f), "utf8")));
  }
  return readFileSync(path, "utf8").split(/\r?\n/).filter((l) => l.trim()).map((l, i) => {
    try {
      return JSON.parse(l);
    } catch {
      return bad(`line ${i + 1}: not JSON`);
    }
  });
}

/** add-records: all-or-nothing import of primary records (+ evidence spans). */
export function addPrimaryRecords(bank, raws, { runId, spans = [], pages = null, evidence = null }) {
  const out = raws.map((raw) => normalizePrimaryRecord(bank, raw, runId));
  const byQuestion = new Map(spans.map((s) => [`${s.question_id}#${s.revision}`, s.spans ?? []]));
  for (const { q, record } of out) {
    const needsExtractor = isHighRisk(q, latestRecord(bank, q, "deterministic")?.checks ?? []) && SOURCE_BASED.has(q.provenance.origin) && q.source?.resource_id;
    const s = byQuestion.get(`${q.id}#${q.revision}`);
    if (needsExtractor && s) applyEvidenceResult(q, record, s, { pages, evidence });
    attachRecord(bank, q, record);
  }
  return out.map((x) => x.record);
}

// ── the resolution matrix ───────────────────────────────────────────────────
const correct = (q, resp) => Boolean(resp) && gradeResponse(q.question_type, q.payload, resp).score === 1;
function sameAnswer(q, a, b) {
  if (!a || !b) return false;
  if (q.question_type === "matching") return canonicalJson([...(a.pairs ?? [])].sort()) === canonicalJson([...(b.pairs ?? [])].sort());
  if (["mcq", "true_false", "ordering"].includes(q.question_type)) return canonicalJson(a) === canonicalJson(b);
  return correct(q, a) === correct(q, b);
}

const outcome = (status, validation, reason, extra = {}) => ({ status, validation, reason, ...extra });

/**
 * Resolve one question revision from its records (§4.4 matrix).
 * @param {object} q          the question (current revision)
 * @param {object[]} records  validation records of this revision
 * @param {object} o          { manifest (xval run manifest, for sampling), decision (review decision for this revision) }
 * @returns {{ status, validation, reason, pending?: boolean, action?: "set_key" }}
 */
export function resolveQuestion(q, records, { manifest = null, decision = null } = {}) {
  if (decision) {
    switch (decision.decision) {
      case "accept_key": {
        // P006: a validated item needs its explanation; accepting the key
        // cannot replace a missing one (the reviewer asks for a repair).
        const det = latest(records.filter((r) => r.role === "deterministic"));
        const blocking = (det?.checks ?? []).filter((c) => c.result === "fail" && (c.code === "P006" || !REVIEW_CODES.has(c.code)));
        if (blocking.length) return outcome("review_required", "review_required", `human: accept_key cannot validate while ${blocking.map((c) => c.code).join(", ")} fails (decide repair or reject)`);
        return outcome("validated", "validated", "human: accept_key");
      }
      case "reject":
        return outcome("rejected", "failed", "human: reject");
      case "set_key":
        return outcome("candidate", "pending", "human: set_key", { action: "set_key" });
      case "repair":
        return outcome("review_required", "review_required", "human: repair requested");
      default:
        return bad(`unknown decision ${decision.decision}`);
    }
  }
  const det = latest(records.filter((r) => r.role === "deterministic"));
  const primary = latest(records.filter((r) => r.role === "primary"));
  const resolver = latest(records.filter((r) => r.role === "resolver"));
  const language = latest(records.filter((r) => r.role === "language"));
  const review = (reason) => outcome("review_required", "review_required", reason);
  const pending = (validation, reason) => outcome(q.status === "review_required" ? "candidate" : q.status, validation, reason, { pending: true });

  if (!det) return pending("pending", "stage 1 not run");
  const hard = det.checks.filter((c) => c.result === "fail" && !REVIEW_CODES.has(c.code));
  if (hard.length) return outcome("rejected", "failed", `deterministic fail: ${hard.map((c) => c.code).join(", ")}`);
  const soft = det.checks.filter((c) => (c.result === "fail" && REVIEW_CODES.has(c.code)) || String(c.detail ?? "").startsWith("not_checked"));
  if (soft.length) return review(`deterministic: ${soft.map((c) => c.code).join(", ")}`);
  if (!primary) return pending("structural_pass", "awaiting the primary validator");
  if (primary.verdict !== "pass" && primary.verdict !== "warn") return review(`primary validator: ${primary.verdict}`);
  if (!primary.blind_answer) return review("primary blind solve missing");
  if (!correct(q, primary.blind_answer)) return review("primary blind answer ≠ key");
  if (primary.ambiguity === "ambiguous") return review("ambiguous");
  const sourceBased = SOURCE_BASED.has(q.provenance?.origin);
  if (sourceBased && primary.support === "unsupported") return review("unsupported by the cited pages");
  if (sourceBased && (primary.support === "not_checked" || primary.support == null)) return review("support not checked");
  const highRisk = isHighRisk(q, det.checks);
  if (highRisk && sourceBased && q.source?.resource_id) {
    const ex = primary.issues.find((i) => i.code === "evidence_extractor");
    if (!ex) return pending("auto_pass", "awaiting the evidence extractor");
    if (ex.span !== "overlap") return review("evidence extractor span does not overlap the cited evidence");
  }
  // A resolver answer that exists is always compared, sampled or not: a
  // disagreement is never resolved silently (§1.7).
  if (resolver) {
    if (!correct(q, resolver.blind_answer)) return review("resolver answer ≠ key");
    if (!sameAnswer(q, resolver.blind_answer, primary.blind_answer)) return review("resolver ≠ primary");
  } else if (resolverNeed(q, manifest, det)) {
    return pending("auto_pass", "awaiting the ChatGPT blind solve");
  }
  if (languageNeed(q, manifest, det)) {
    if (!language) return pending("auto_pass", "awaiting the Gemini language review");
    if (language.verdict === "fail") return review("language reviewer: fail");
  } else if (language?.verdict === "fail") return review("language reviewer: fail");
  return outcome("validated", "validated", language?.verdict === "warn" ? "validated (language warn recorded)" : "validated");
}

// ── review decisions ────────────────────────────────────────────────────────
/** Latest review decision for a question revision. */
export function decisionFor(bank, q) {
  return latest(bank.reviewDecisions.filter((d) => d.question_id === q.id && d.revision === q.revision).map((d) => ({ ...d, checked_at: d.decided_at, id: d.question_id })));
}

/** A `human` validation record for a decision. */
export function humanRecord(q, decision, runId) {
  const initials = String(decision.reviewer).replace(/[^A-Za-z]/g, "").slice(0, 8) || "owner";
  return {
    schema: "validation-record@1", id: validationRecordId(runId, q.id, "human"), question_id: q.id, revision: q.revision, content_hash: q.content_hash,
    role: "human", agent: `human:${initials}`, run_id: runId, prompt_version: null, checked_at: decision.decided_at,
    verdict: decision.decision === "accept_key" ? "pass" : decision.decision === "set_key" ? "disagree" : "fail",
    checks: [], blind_answer: decision.answer ?? null, support: null, ambiguity: null, difficulty_estimate: null, issues: [],
    notes: `${decision.decision}${decision.note ? `: ${decision.note}` : ""}`.slice(0, 1000),
  };
}

/** Apply a set_key decision's answer to the payload (canonical ids / values). */
export function setKey(q, answer) {
  if (!isObj(answer)) bad(`${q.id}: set_key needs an answer`);
  const p = q.payload;
  switch (q.question_type) {
    case "mcq":
    case "true_false":
      if (!p.options.some((o) => o.id === answer.option_id)) bad(`${q.id}: set_key option ${answer.option_id} does not exist`);
      p.answer = { option_id: answer.option_id };
      break;
    case "matching":
      p.answer = { pairs: answer.pairs };
      break;
    case "ordering":
      p.answer = { order: answer.order };
      break;
    case "short_answer":
      if (!Array.isArray(answer.accepted) || !answer.accepted.length) bad(`${q.id}: set_key needs accepted answers`);
      p.accepted = answer.accepted;
      p.answer_display = answer.answer_display ?? answer.accepted[0];
      break;
    case "numeric":
      p.answer = { value: String(answer.value), tolerance: answer.tolerance ?? p.answer.tolerance };
      break;
    default:
      bad(`unknown type ${q.question_type}`);
  }
}

/**
 * Resolve every current revision of a bank (mutates; the caller saves).
 * @returns {{ counts, results: [{id, revision, status, reason}] }}
 */
export function resolveBank(bank, { runId, manifest = null, ids = null, now = isoNow() }) {
  const counts = { validated: 0, review_required: 0, rejected: 0, pending: 0, set_key: 0, unchanged: 0 };
  const results = [];
  const targets = [...bank.questions.values()]
    .filter((q) => (!ids || ids.includes(q.id)) && ["candidate", "review_required", "validated"].includes(q.status))
    .sort((a, b) => cOrder(a.id, b.id));
  for (const q of targets) {
    const decision = decisionFor(bank, q);
    if (q.status === "validated" && !decision) {
      counts.unchanged++;
      continue;
    }
    const r = resolveQuestion(q, recordsFor(bank, q), { manifest, decision });
    if (decision) attachRecord(bank, q, humanRecord(q, decision, runId));
    if (r.action === "set_key") {
      setKey(q, decision.answer);
      bumpRevision(bank, q, now);
      const v = validateRecord("question", q);
      if (!v.ok) bad(`${q.id}: set_key made the item invalid: ${v.errors.join("; ")}`);
      counts.set_key++;
      results.push({ id: q.id, revision: q.revision, status: q.status, reason: r.reason });
      continue;
    }
    q.status = r.status;
    q.validation.status = r.validation;
    q.validation.checked_revision = q.revision;
    const current = new Set(recordsFor(bank, q).map((x) => x.id));
    q.validation.record_ids = q.validation.record_ids.filter((id) => current.has(id));
    if (r.status === "review_required") enqueueReview(bank, q, r.reason, q.validation.record_ids, now);
    counts[r.pending ? "pending" : r.status] = (counts[r.pending ? "pending" : r.status] ?? 0) + 1;
    results.push({ id: q.id, revision: q.revision, status: q.status, reason: r.reason });
  }
  // The queue lists open reviews only.
  bank.reviewQueue = bank.reviewQueue.filter((row) => {
    const q = bank.questions.get(row.question_id);
    return q && q.revision === row.revision && q.status === "review_required";
  });
  return { counts, results };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
export class UsageError extends Error {}

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (command === undefined || command === "--help" || command === "-h") return { help: true };
  const o = { command, staging: DEFAULT_STAGING, run: null, xval: null, ids: null, file: null, evidence: null, cache: null, now: null };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const next = () => {
      const v = rest[++i];
      if (v === undefined) throw new UsageError(`${a} needs a value`);
      return v;
    };
    if (a === "--staging") o.staging = resolve(next());
    else if (a === "--run") o.run = next();
    else if (a === "--xval") o.xval = next();
    else if (a === "--ids") o.ids = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--file") o.file = resolve(next());
    else if (a === "--evidence") o.evidence = resolve(next());
    else if (a === "--cache") o.cache = resolve(next());
    else if (a === "--now") o.now = next();
    else throw new UsageError(`unknown option ${a}`);
  }
  if (!["add-records", "resolve"].includes(command)) throw new UsageError(`unknown command ${command} (add-records | resolve)`);
  if (!o.run || !isRunId(o.run) || !o.run.includes("-val-")) throw new UsageError("--run <run-yyyymmdd-val-nn> is required");
  if (o.xval && (!isRunId(o.xval) || !o.xval.includes("-xval-"))) throw new UsageError("--xval must be an xval run id");
  if (command === "add-records" && !o.file) throw new UsageError("--file is required");
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
    log.log("usage: node scripts/content/resolve-validation.mjs add-records|resolve --run <val run> [--file f] [--evidence f] [--xval <xval run>] [--ids a,b] [--staging dir]");
    return 0;
  }
  try {
    const now = o.now ?? isoNow();
    const bank = loadStaging(o.staging);
    if (o.command === "add-records") {
      const root = o.cache ?? cacheRoot();
      if (!existsSync(o.file)) bad(`${o.file} does not exist`);
      const spans = o.evidence ? readFileSync(o.evidence, "utf8").split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l)) : [];
      const records = addPrimaryRecords(bank, readRecordInputs(o.file), {
        runId: o.run, spans, pages: createPageStore({ root, resources: bank.resources }), evidence: evidenceStore(root),
      });
      saveRecords(bank);
      saveQuestions(bank);
      updateRunManifest(bank.staging, o.run, { kind: "val", counts: { primary_records: records.length } });
      log.log(`added ${records.length} primary record(s)`);
      return 0;
    }
    let manifest = null;
    if (o.xval) {
      const p = join(bank.staging, "validation/runs", `${o.xval}.json`);
      if (!existsSync(p)) bad(`no run manifest for ${o.xval}`);
      manifest = JSON.parse(readFileSync(p, "utf8"));
    }
    const { counts, results } = resolveBank(bank, { runId: o.run, manifest, ids: o.ids, now });
    saveQuestions(bank);
    saveRecords(bank);
    saveReviewQueue(bank);
    updateRunManifest(bank.staging, o.run, { kind: "val", resolved_at: now, xval_run: o.xval, counts: { resolution: counts } });
    log.log(`validated ${counts.validated}, review_required ${counts.review_required}, rejected ${counts.rejected}, pending ${counts.pending}, set_key ${counts.set_key}`);
    for (const r of results.filter((x) => x.status !== "validated")) log.log(`  ${r.id} r${r.revision}: ${r.status} — ${r.reason}`);
    return 0;
  } catch (e) {
    log.error(`error: ${e.message}`);
    return 1;
  }
}

const invokedDirectly = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) main().then((code) => { process.exitCode = code; });
