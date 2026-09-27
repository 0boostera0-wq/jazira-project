#!/usr/bin/env node
// ============================================================================
// Ingest generator output (docs/CONTENT_ENGINE.md §4.3 "Output").
//
//   node scripts/content/ingest-candidates.mjs --run run-20260927-gen-01
//        [--packet <packet.json> --file <candidates.jsonl>]   one packet
//        [--staging data/staging] [--cache dir] [--now iso]
//   Without --packet: every packets/<run>/<name>.json with an output file
//   llm/<run>/<name>.jsonl in the content cache.
//
// A generator line holds only content (CANDIDATE_FIELDS in lib/checks.mjs):
// stem, payload in the text-based generator format, explanation, source pages
// and evidence quotes, objective, origin, difficulty, style, computation.
// This script assigns everything else — id (§2.2, D001 on exact duplicates),
// revision, content_hash, curriculum and term (copied from the lesson),
// links, provenance.generator, status, validation, timestamps — and:
//   - rejects any line that sets another field (S005) or is not a valid record;
//   - mints the id from answer-free material only (§2.2: lesson/topic, type,
//     stem, SORTED option texts; never the key), so an id cannot be used to
//     test candidate answers;
//   - assigns opaque option / left / right / item ids
//     (o|l|r|s + 6 hex of HMAC-SHA256(question salt, normalized text)), never in
//     authoring order, re-salting until O009 passes;
//   - stores shufflable mcq options in an order seeded by the (answer-free) id,
//     so the authoring position of the key never survives into the record
//     (fixed-order items keep their order; the key refers to option ids);
//   - moves evidence quotes to the cache sidecar evidence/<shard>.jsonl and
//     keeps { pdf_page, quote_sha256, char_offsets, quote_kind } in the record;
//   - applies O004 (fixed_order_reason, shuffle_options);
//   - `repair_of: <id>` makes a new revision of a rejected (revision 1) or
//     repair-decided item (one repair round, §4.4).
// Rejected lines go to llm/<run>/ingest-rejected.jsonl (cache); counts to the
// run manifest. Exit: 0 ok, 1 error, 2 usage.
// ============================================================================

import { createHmac } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { searchNormalize } from "../../src/lib/content/normalize.js";
import { gradeCode, isRunId, questionIdHash, stimulusId } from "../../src/lib/content/ids.js";
import { toDecimalString, toRational } from "../../src/lib/content/expr.js";
import { sha256Hex, sortByU } from "../../src/lib/content/prng.js";
import {
  difficultyBand, ITEM_STYLES, MATCHING_SCORING, ORDERING_CRITERIA, ORIGINS, FIXED_ORDER_REASONS,
  QUESTION_TYPES, QUOTE_KINDS, REWRITE_CHANGES, SHORT_ANSWER_MATCH, TOLERANCE_KINDS,
} from "../../src/lib/content/enums.js";
import { cachePaths, cacheRoot } from "./lib/cache.mjs";
import { applyO004, createPageStore, defaultShuffle, forbiddenCandidateFields, lessonAncestor, locateQuote, MAX_QUOTE_CHARS, runCheck } from "./lib/checks.mjs";
import { validateRecord } from "./lib/schemas.mjs";
import {
  DEFAULT_STAGING, evidenceStore, isoNow, loadStaging, questionShardBase, rehash, saveQuestions, saveStimuli,
  stimulusShardBase, updateRunManifest,
} from "./check-questions.mjs";

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const cOrder = (a, b) => Buffer.compare(Buffer.from(String(a), "utf8"), Buffer.from(String(b), "utf8"));
const TF_TEXTS = { ar: ["صح", "خطأ"], en: ["True", "False"] };
export const DEFAULT_TIME = { mcq: 60, true_false: 30, matching: 90, ordering: 90, short_answer: 75, numeric: 90 };

export class CandidateError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}
const reject = (code, message) => {
  throw new CandidateError(code, message);
};

// ── opaque ids ──────────────────────────────────────────────────────────────
/** `<prefix>` + first 6 hex of HMAC-SHA256(salt, normalized text); longer on a collision. */
export function opaqueIds(prefix, salt, texts) {
  const macs = texts.map((t) => createHmac("sha256", `jazira-opaque-ids:v1|${salt}`).update(searchNormalize(t), "utf8").digest("hex"));
  for (let len = 6; len <= 11; len++) {
    const ids = macs.map((m) => prefix + m.slice(0, len));
    if (new Set(ids).size === ids.length) return ids;
  }
  throw new CandidateError("O001", "entries are not distinct");
}

const texts = (list, what) => {
  if (!Array.isArray(list) || !list.length) reject("O001", `${what} must be a non-empty array`);
  return list.map((x) => {
    // Entries are plain text (or { text }): ids are never the generator's.
    if (isObj(x) && Object.keys(x).some((k) => k !== "text")) reject("S005", `${what}: entries may only carry text (ids are assigned at ingestion)`);
    const t = typeof x === "string" ? x : isObj(x) && typeof x.text === "string" ? x.text : null;
    if (t === null || !t.trim()) reject("O001", `${what}: every entry needs text`);
    return t.trim();
  });
};

/**
 * Canonical payload from the generator format, with opaque ids for `salt`:
 *   mcq          { options: [text…], answer: { index }, fixed_order_reason? }
 *   true_false   { answer: true | false }
 *   matching     { left: [text…], right: [text…], pairs: [[li, ri]…], scoring? }
 *   ordering     { items: [text… in the correct order], criterion? }
 *   short_answer { accepted: [text…], match?, max_chars?, answer_display? }
 *   numeric      { answer: { value, tolerance? }, unit?, input? }
 */
export function buildPayload(type, gp, language, salt) {
  if (!isObj(gp)) reject("S001", "payload must be an object");
  switch (type) {
    case "mcq": {
      const opts = texts(gp.options, "options");
      const index = gp.answer?.index;
      if (!Number.isInteger(index) || index < 0 || index >= opts.length) reject("O002", "answer.index must point at an option");
      if (gp.fixed_order_reason != null && !FIXED_ORDER_REASONS.includes(gp.fixed_order_reason)) reject("S001", "bad fixed_order_reason");
      const ids = opaqueIds("o", salt, opts);
      return { options: opts.map((text, i) => ({ id: ids[i], text })), answer: { option_id: ids[index] }, fixed_order_reason: gp.fixed_order_reason ?? null };
    }
    case "true_false": {
      if (typeof gp.answer !== "boolean") reject("O002", "true_false answer must be true or false");
      const [t, f] = TF_TEXTS[language] ?? TF_TEXTS.ar;
      return { options: [{ id: "t", text: t }, { id: "f", text: f }], answer: { option_id: gp.answer ? "t" : "f" } };
    }
    case "matching": {
      const left = texts(gp.left, "left");
      const right = texts(gp.right, "right");
      const pairs = gp.pairs;
      if (!Array.isArray(pairs) || !pairs.every((p) => Array.isArray(p) && p.length === 2 && Number.isInteger(p[0]) && Number.isInteger(p[1]) && left[p[0]] !== undefined && right[p[1]] !== undefined)) {
        reject("O002", "pairs must be [[leftIndex, rightIndex]…] into the columns");
      }
      if (gp.scoring != null && !MATCHING_SCORING.includes(gp.scoring)) reject("S001", "bad scoring");
      const L = opaqueIds("l", salt, left);
      const R = opaqueIds("r", salt, right);
      return {
        left: left.map((text, i) => ({ id: L[i], text })).sort((a, b) => cOrder(a.id, b.id)),
        right: right.map((text, i) => ({ id: R[i], text })).sort((a, b) => cOrder(a.id, b.id)),
        answer: { pairs: pairs.map(([l, r]) => [L[l], R[r]]).sort((a, b) => cOrder(a[0], b[0])) },
        scoring: gp.scoring ?? "partial",
      };
    }
    case "ordering": {
      const items = texts(gp.items, "items");
      if (gp.criterion != null && !ORDERING_CRITERIA.includes(gp.criterion)) reject("S001", "bad criterion");
      const S = opaqueIds("s", salt, items);
      return {
        items: items.map((text, i) => ({ id: S[i], text })).sort((a, b) => cOrder(a.id, b.id)),
        answer: { order: [...S] },
        criterion: gp.criterion ?? "other",
      };
    }
    case "short_answer": {
      const accepted = texts(gp.accepted, "accepted");
      const match = gp.match ?? "normalized_exact";
      if (!SHORT_ANSWER_MATCH.includes(match)) reject("S001", "bad match");
      const longest = Math.max(...accepted.map((a) => [...a].length));
      const max = gp.max_chars ?? Math.min(80, Math.max(20, longest + 10));
      return { accepted, match, max_chars: max, answer_display: typeof gp.answer_display === "string" && gp.answer_display.trim() ? gp.answer_display.trim() : accepted[0] };
    }
    case "numeric": {
      const a = gp.answer;
      if (!isObj(a)) reject("N001", "numeric answer must be { value, tolerance? }");
      let value;
      try {
        value = toDecimalString(toRational(typeof a.value === "number" ? a.value : String(a.value ?? "").trim()));
      } catch {
        value = null;
      }
      if (!value) reject("N001", "numeric answer value must be a terminating decimal");
      const tol = a.tolerance ?? { kind: "abs", value: "0" };
      if (!isObj(tol) || !TOLERANCE_KINDS.includes(tol.kind)) reject("N001", "tolerance must be { kind: abs|rel, value }");
      const unit = gp.unit == null ? null : isObj(gp.unit) && typeof gp.unit.text === "string"
        ? { text: gp.unit.text.trim(), required: gp.unit.required !== false, accepted: Array.isArray(gp.unit.accepted) ? gp.unit.accepted.map(String) : [] }
        : reject("N003", "unit must be { text, required?, accepted? } or null");
      const input = isObj(gp.input) ? gp.input : {};
      return {
        answer: { value, tolerance: { kind: tol.kind, value: typeof tol.value === "number" ? String(tol.value) : String(tol.value ?? "0") } },
        unit,
        input: { allow_fraction: input.allow_fraction !== false, max_decimals: Number.isInteger(input.max_decimals) ? input.max_decimals : null },
      };
    }
    default:
      return reject("S001", `unknown question_type ${type}`);
  }
}

/** Canonical payload with ids that do not reveal the answer (O009), re-salting deterministically. */
export function payloadWithOpaqueIds(type, gp, language, salt) {
  for (let k = 0; k < 64; k++) {
    const payload = buildPayload(type, gp, language, k === 0 ? salt : `${salt}#${k}`);
    if (runCheck("O009", { question_type: type, payload }).result === "pass" || type === "true_false") return payload;
  }
  return reject("O009", "could not assign ids that hide the answer");
}

/**
 * mcq options of a shufflable item in an order seeded by the question id
 * (HASH-CTR over the opaque option ids): the generator's authoring order, which
 * often puts the key first, never reaches the record. Fixed-order items
 * (fixed_order_reason, shuffle_options:false) keep their order. The key names
 * option ids, so no answer reference needs remapping.
 */
export function seededCanonicalOrder(q) {
  if (q.question_type !== "mcq" || q.payload?.fixed_order_reason || q.shuffle_options === false) return q;
  const byId = new Map(q.payload.options.map((o) => [o.id, o]));
  q.payload.options = sortByU(sha256Hex(`jz.canonical-order|${q.id}`).slice(0, 32), "options", [...byId.keys()]).map((id) => byId.get(id));
  return q;
}

// ── one candidate ───────────────────────────────────────────────────────────
function packetPages(packet) {
  return new Map((packet.pages ?? []).map((p) => [`${p.resource_id}#${p.pdf_page}`, p]));
}

function buildSource(c, packet, bank, pages) {
  if (!packet.lesson) {
    if (c.source != null) reject("S005", "prep packets have no textbook source");
    return { source: null, sidecar: [] };
  }
  const known = packetPages(packet);
  const resources = [...new Set((packet.pages ?? []).map((p) => p.resource_id))];
  if (c.source != null && !isObj(c.source)) reject("S004", "source must be an object");
  const s = c.source ?? {};
  // Source-based items must cite their supporting pages themselves: ingestion
  // never invents a page reference for them (§4.3 "page refs point to the
  // supporting pages"). Generated practice without pages cites the lesson's
  // whole range in the packet (what it practises), never a single guessed page.
  const sourceBased = c.provenance?.origin === "source_derived" || c.provenance?.origin === "transformed";
  if (sourceBased && !Number.isInteger(s.pdf_page_start)) reject("S004", `a ${c.provenance.origin} item must cite source.pdf_page_start (the supporting page)`);
  const resourceId = s.resource_id ?? resources[0] ?? null;
  if (!resourceId) return { source: null, sidecar: [] };
  if (!resources.includes(resourceId)) reject("S004", `resource ${resourceId} is not in the packet`);
  const resource = bank.resources.get(resourceId);
  if (!resource) reject("S004", `resource ${resourceId} does not resolve`);
  const inPacket = (p) => known.has(`${resourceId}#${p}`);
  const listed = (packet.pages ?? []).filter((p) => p.resource_id === resourceId).map((p) => p.pdf_page);
  const whole = s.pdf_page_start === undefined && s.pdf_page_end === undefined;
  const start = whole ? Math.min(...listed) : s.pdf_page_start;
  const end = whole ? Math.max(...listed) : s.pdf_page_end ?? start;
  if (!Number.isInteger(start) || !Number.isInteger(end) || end < start || !inPacket(start) || !inPacket(end)) {
    reject("S004", `source pages ${start}–${end} are not packet pages`);
  }
  const printed = (p) => bank.pageMaps.get(resourceId)?.get(p)?.printed_page ?? known.get(`${resourceId}#${p}`)?.printed_page ?? null;
  const sidecar = [];
  const evidence = [];
  const list = s.evidence == null ? [] : s.evidence;
  if (!Array.isArray(list)) reject("E001", "evidence must be an array");
  for (const e of list) {
    if (!isObj(e) || !Number.isInteger(e.pdf_page) || !inPacket(e.pdf_page)) reject("E001", "evidence pdf_page must be a packet page");
    const quote = typeof e.quote === "string" ? e.quote.normalize("NFC").trim() : "";
    if (!quote || [...quote].length > MAX_QUOTE_CHARS) reject("E001", `evidence quote must be 1–${MAX_QUOTE_CHARS} chars`);
    const kind = e.quote_kind ?? "fact";
    if (!QUOTE_KINDS.includes(kind)) reject("E001", `bad quote_kind ${kind}`);
    const page = pages ? pages.get(resourceId, e.pdf_page) : null;
    const at = page?.text ? locateQuote(page.text, quote) : null;
    const quoteSha = sha256Hex(quote);
    evidence.push({ pdf_page: e.pdf_page, quote_sha256: quoteSha, char_offsets: at ?? [0, 0], quote_kind: kind });
    sidecar.push({ pdf_page: e.pdf_page, quote_sha256: quoteSha, quote_kind: kind, quote });
  }
  if (evidence.length > 10) reject("E001", "at most 10 evidence quotes");
  return {
    source: {
      source_id: resource.source_id, resource_id: resourceId, pdf_page_start: start, pdf_page_end: end,
      printed_page_start: printed(start), printed_page_end: printed(end), evidence,
    },
    sidecar,
  };
}

function curriculumOf(packet, bank) {
  const lesson = bank.nodes.get(packet.lesson.id);
  if (!lesson || lesson.kind !== "lesson") reject("S003", `packet lesson ${packet.lesson.id} does not resolve to a lesson`);
  return {
    lesson,
    curriculum: {
      stage: lesson.stage, grade: lesson.grade, track: lesson.track ?? null, term: lesson.term ?? null, term_status: lesson.term_status,
      subject: lesson.subject, unit: lessonAncestor(lesson, "unit", bank.nodes), chapter: lessonAncestor(lesson, "chapter", bank.nodes), lesson: lesson.id,
    },
  };
}

/** Aligned prep links of a lesson (verified prep-alignment rows for the lesson or an ancestor). */
function prepLinks(bank, lesson) {
  const chain = new Set();
  for (let n = lesson; n; n = n.parent_id ? bank.nodes.get(n.parent_id) : null) chain.add(n.id);
  const topics = bank.prepAlignment
    .filter((r) => r.status === "verified" && chain.has(r.node_id))
    .map((r) => (String(r.prep_topic).startsWith("prep:") ? r.prep_topic : `prep:${r.prep_topic}`));
  return [...new Set(topics)].sort(cOrder).map((node_id) => ({ node_id, role: "aligned" }));
}

function checkRepair(c, bank) {
  if (c.repair_of === undefined) return null;
  const old = bank.questions.get(c.repair_of);
  if (!old) reject("S002", `repair_of ${c.repair_of} does not exist`);
  const decided = bank.reviewDecisions.some((d) => d.question_id === old.id && d.revision === old.revision && d.decision === "repair");
  const oneRound = old.status === "rejected" && old.revision === 1;
  if (!decided && !oneRound) reject("S002", `${old.id} is not open for repair (one round after a rejection, or a review decision)`);
  return old;
}

function checkVariant(c, packet, bank) {
  if (c.variant == null) return null;
  if (!REWRITE_CHANGES.includes(c.variant.change) || typeof c.variant.of !== "string") reject("V001", "variant must be { kind: rewrite, of, change: context|representation }");
  if (!bank.questions.has(c.variant.of)) reject("V001", `rewrite parent ${c.variant.of} does not exist`);
  if (Array.isArray(packet.rewrite_of) && !packet.rewrite_of.includes(c.variant.of)) reject("V001", `${c.variant.of} is not a rewrite target of this packet`);
  return { kind: "rewrite", of: c.variant.of, change: c.variant.change };
}

function buildStimulus(c, language, origin, bank) {
  if (c.stimulus == null) return null;
  const text = typeof c.stimulus.text === "string" ? c.stimulus.text.trim() : "";
  if (!text || text.length > 8000) reject("L008", "stimulus text must be 1–8000 chars");
  const stimulus = { schema: "stimulus@1", id: stimulusId(text), language, text, origin, source: null };
  const existing = bank.stimuli.get(stimulus.id);
  if (existing && existing.text !== text) reject("D001", `stimulus id ${stimulus.id} collides with a different text`);
  return stimulus;
}

function validateBasics(c, packet) {
  if (!isObj(c)) reject("S001", "line is not a JSON object");
  const bad = forbiddenCandidateFields(c);
  if (bad.length) reject("S005", `generator set forbidden fields: ${bad.join(", ")}`);
  if (packet.lesson && c.lesson !== undefined && c.lesson !== packet.lesson.id) reject("S003", `lesson ${c.lesson} is not the packet's lesson`);
  if (!QUESTION_TYPES.includes(c.question_type)) reject("S001", `bad question_type ${c.question_type}`);
  if (!ITEM_STYLES.includes(c.item_style)) reject("S001", `bad item_style ${c.item_style}`);
  if (!Number.isInteger(c.difficulty) || c.difficulty < 1 || c.difficulty > 5) reject("S001", "difficulty must be 1..5");
  if (typeof c.stem !== "string" || !c.stem.trim()) reject("S001", "stem is required");
  const origin = c.provenance?.origin;
  if (!ORIGINS.includes(origin) || origin === "internal_authored") reject("P001", `origin ${origin} is not allowed for generated items`);
  const tags = c.tags ?? [];
  if (!Array.isArray(tags) || tags.length > 12 || !tags.every((t) => typeof t === "string" && t.trim() && t.trim().length <= 60)) reject("S001", "tags: ≤ 12 strings of ≤ 60 chars");
  if (c.explanation != null && !isObj(c.explanation)) reject("P006", "explanation must be an object");
  if (packet.lesson && c.objective_id != null && !(packet.objectives ?? []).some((o) => o.id === c.objective_id)) reject("S003", `objective ${c.objective_id} is not in the packet`);
  return { origin, tags: tags.map((t) => t.trim()) };
}

/**
 * Turn one generator line into a canonical question (not yet added to the bank).
 * @returns {{ question, stimulus|null, sidecar: [] }}  throws CandidateError
 */
export function ingestCandidate(c, packet, bank, { runId, now, pages = null, taken = new Map() }) {
  const { origin, tags } = validateBasics(c, packet);
  const type = c.question_type;
  const language = c.language ?? packet.lesson?.language ?? packet.language ?? "ar";
  const repairOf = checkRepair(c, bank);
  const cur = packet.lesson ? curriculumOf(packet, bank) : null;
  const prep = packet.prep ?? null;
  if (!cur && !prep) reject("S003", "packet has neither lesson nor prep");
  if (cur && repairOf && repairOf.curriculum?.lesson !== cur.curriculum.lesson) reject("S003", "a repair keeps the lesson");
  const variant = checkVariant(c, packet, bank);
  const stimulus = buildStimulus(c, language, origin, bank);
  const { source, sidecar } = buildSource(c, packet, bank, pages);
  if (stimulus && source) stimulus.source = { resource_id: source.resource_id, pdf_page_start: source.pdf_page_start, pdf_page_end: source.pdf_page_end };
  const resource = source ? bank.resources.get(source.resource_id) : null;
  const license = resource?.license_status ?? (source ? bank.sources.get(source.source_id)?.license_status : null) ?? "internal";
  const ex = c.explanation;
  const q = {
    schema: "question@1", id: null, revision: 1, content_hash: null,
    scope: cur ? "curriculum" : prep.exam,
    curriculum: cur ? cur.curriculum : null,
    links: cur ? [{ node_id: cur.curriculum.lesson, role: "primary" }, ...prepLinks(bank, cur.lesson)] : [{ node_id: `prep:${prep.exam}/${prep.section}/${prep.topic}`, role: "aligned" }],
    prep: cur ? null : { exam: prep.exam, section: prep.section, topic: prep.topic ?? null },
    objective_id: c.objective_id ?? null,
    question_type: type, item_style: c.item_style, difficulty: c.difficulty, difficulty_band: difficultyBand(c.difficulty),
    difficulty_source: "generator_estimate", language, stimulus_id: stimulus?.id ?? null, stem: c.stem.trim(),
    payload: null,
    explanation: ex ? { text: String(ex.text ?? "").trim(), steps: (ex.steps ?? []).map((s) => String(s).trim()).filter(Boolean), method: ex.method ? String(ex.method).trim() : null } : null,
    shuffle_options: false,
    time_limit_seconds: c.time_limit_seconds ?? DEFAULT_TIME[type] + (c.difficulty >= 4 ? 30 : 0),
    tags,
    computation: c.computation ? { expr: String(c.computation.expr ?? ""), vars: isObj(c.computation.vars) ? c.computation.vars : {} } : null,
    source,
    provenance: {
      origin, official: false, license_status: license,
      generator: { kind: "llm_subagent", run_id: runId, prompt_version: packet.rules_version ?? null },
      derived_from: variant ? [variant.of] : [], template_id: null,
    },
    status: "candidate",
    validation: { status: "pending", record_ids: [], checked_revision: null },
    dedup: { class: null, cluster_id: null, exclusion_group: null },
    variant, is_premium: false, created_at: now, updated_at: now,
  };
  const stimuli = new Map(stimulus ? [[stimulus.id, stimulus]] : []);
  for (const [id, st] of bank.stimuli) if (!stimuli.has(id)) stimuli.set(id, st);
  const withIds = (salt) => {
    q.payload = payloadWithOpaqueIds(type, c.payload, language, salt);
    q.shuffle_options = defaultShuffle(q);
    applyO004(q);
    seededCanonicalOrder(q);
    rehash({ stimuli }, q);
  };
  if (repairOf) {
    Object.assign(q, { id: repairOf.id, revision: repairOf.revision + 1, created_at: repairOf.created_at, dedup: { ...repairOf.dedup } });
    withIds(q.id);
  } else {
    const grade = cur ? gradeCode(cur.curriculum.grade) : gradeCode(prep.exam);
    const subject = cur ? String(cur.curriculum.subject).split("/").pop() : prep.section;
    const anchor = cur ? cur.curriculum.lesson : `prep:${prep.exam}/${prep.section}/${prep.topic}`;
    // answer-free: only the option texts (sorted) of the provisional payload are hashed
    const provisional = buildPayload(type, c.payload, language, "provisional");
    const full = questionIdHash({ anchor, type, stem: q.stem, payload: provisional });
    for (let w = 0; ; w += 10) {
      if (w + 10 > 60) reject("S002", "id space exhausted");
      q.id = `q-${grade}-${subject}-${full.slice(w, w + 10)}`;
      if (q.id.length > 39) reject("S002", `id ${q.id} longer than 39 chars`);
      withIds(q.id);
      const existing = taken.get(q.id) ?? bank.questions.get(q.id);
      if (!existing) break;
      if (existing.content_hash === q.content_hash) reject("D001", `exact duplicate of ${q.id}`);
    }
  }
  const valid = validateRecord("question", q);
  if (!valid.ok) reject("S001", valid.errors.join("; "));
  return { question: q, stimulus, sidecar };
}

// ── a packet's output ───────────────────────────────────────────────────────
/**
 * Ingest the candidate lines of one packet into a loaded bank.
 * @returns {{ accepted: string[], rejected: {line, ref, code, reason}[] }}
 */
export function ingestLines(lines, packet, bank, { runId, now, pages = null, evidence = null }) {
  const accepted = [];
  const rejected = [];
  const taken = new Map();
  lines.forEach((raw, i) => {
    if (!raw.trim()) return;
    let c;
    try {
      c = JSON.parse(raw);
    } catch (e) {
      rejected.push({ line: i + 1, ref: null, code: "S001", reason: `invalid JSON: ${e.message}` });
      return;
    }
    try {
      const { question, stimulus, sidecar } = ingestCandidate(c, packet, bank, { runId, now, pages, taken });
      taken.set(question.id, question);
      const base = questionShardBase(question);
      bank.questions.set(question.id, question);
      bank.where.set(question.id, bank.where.get(question.id) ?? base);
      if (stimulus && !bank.stimuli.has(stimulus.id)) {
        bank.stimuli.set(stimulus.id, stimulus);
        bank.stimulusWhere.set(stimulus.id, stimulusShardBase(base));
      }
      if (evidence) evidence.put(question.id, question.revision, sidecar);
      accepted.push(question.id);
    } catch (e) {
      if (!(e instanceof CandidateError)) throw e;
      rejected.push({ line: i + 1, ref: isObj(c) ? c.ref ?? null : null, code: e.code, reason: e.message.slice(0, 500) });
    }
  });
  return { accepted, rejected };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
export class UsageError extends Error {}

export function parseArgs(argv) {
  const o = { run: null, packet: null, file: null, staging: DEFAULT_STAGING, cache: null, now: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new UsageError(`${a} needs a value`);
      return v;
    };
    if (a === "--run") o.run = next();
    else if (a === "--packet") o.packet = resolve(next());
    else if (a === "--file") o.file = resolve(next());
    else if (a === "--staging") o.staging = resolve(next());
    else if (a === "--cache") o.cache = resolve(next());
    else if (a === "--now") o.now = next();
    else if (a === "--help" || a === "-h") o.help = true;
    else throw new UsageError(`unknown option ${a}`);
  }
  if (o.help) return o;
  if (!o.run || !isRunId(o.run) || !o.run.includes("-gen-")) throw new UsageError("--run <run-yyyymmdd-gen-nn> is required");
  if (Boolean(o.packet) !== Boolean(o.file)) throw new UsageError("--packet and --file go together");
  return o;
}

/** [{ packet, file }] for a run: packets/<run>/<name>.json with llm/<run>/<name>.jsonl. */
export function packetOutputs(root, runId) {
  const paths = cachePaths(root);
  const dir = paths.packetsDir(runId);
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir).filter((f) => /^[A-Za-z0-9._-]+\.json$/.test(f) && !/\.(?:blind|keyed|evidence)\.json$/.test(f)).sort()) {
    const file = join(paths.llmDir(runId), name.replace(/\.json$/, ".jsonl"));
    if (existsSync(file)) out.push({ packet: join(dir, name), file });
  }
  return out;
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
    log.log("usage: node scripts/content/ingest-candidates.mjs --run <gen run id> [--packet p.json --file out.jsonl] [--staging dir] [--cache dir] [--now iso]");
    return 0;
  }
  try {
    const now = o.now ?? isoNow();
    const root = o.cache ?? cacheRoot();
    const bank = loadStaging(o.staging);
    const pages = createPageStore({ root, resources: bank.resources });
    const evidence = evidenceStore(root);
    const jobs = o.packet ? [{ packet: o.packet, file: o.file }] : packetOutputs(root, o.run);
    if (!jobs.length) {
      log.error(`no packet outputs for ${o.run} (expected llm/${o.run}/<packet>.jsonl in the cache)`);
      return 1;
    }
    const allRejected = [];
    const counts = { packets: jobs.length, lines: 0, accepted: 0, rejected: 0, rejected_by_code: {} };
    for (const job of jobs) {
      const packet = JSON.parse(readFileSync(job.packet, "utf8"));
      const lines = readFileSync(job.file, "utf8").split(/\r?\n/);
      const { accepted, rejected } = ingestLines(lines, packet, bank, { runId: o.run, now, pages, evidence });
      counts.lines += lines.filter((l) => l.trim()).length;
      counts.accepted += accepted.length;
      counts.rejected += rejected.length;
      for (const r of rejected) {
        counts.rejected_by_code[r.code] = (counts.rejected_by_code[r.code] ?? 0) + 1;
        allRejected.push({ packet: basename(job.packet), ...r });
      }
      log.log(`${basename(job.packet)}: ${accepted.length} accepted, ${rejected.length} rejected`);
    }
    saveQuestions(bank);
    saveStimuli(bank);
    evidence.save();
    const rejectedFile = join(cachePaths(root).llmDir(o.run), "ingest-rejected.jsonl");
    mkdirSync(dirname(rejectedFile), { recursive: true });
    writeFileSync(rejectedFile, allRejected.map((r) => JSON.stringify(r)).join("\n") + (allRejected.length ? "\n" : ""));
    updateRunManifest(bank.staging, o.run, { kind: "gen", tool: "ingest-candidates@1", ingested_at: now, counts: { ingest: counts } });
    for (const r of allRejected) log.log(`  rejected ${r.packet}:${r.line}${r.ref ? ` (${r.ref})` : ""} ${r.reason}`);
    return 0;
  } catch (e) {
    log.error(`error: ${e.message}`);
    return 1;
  }
}

const invokedDirectly = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) main().then((code) => { process.exitCode = code; });
