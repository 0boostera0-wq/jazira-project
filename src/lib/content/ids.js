// ============================================================================
// Stable, deterministic ids (docs/CONTENT_ENGINE.md §2.2).
//
// Hash-derived ids are minted ONCE and then frozen: edits bump `revision`,
// never the id. Question/template ids take the next 10 hex of the same
// SHA-256 only when the 10-hex prefix is taken by a record with DIFFERENT
// content; the same full hash and content is an exact duplicate (D001).
// Every id fits the DB key format ^[a-z0-9][a-z0-9-]{1,39}$ (≤ 40 chars);
// question ids are ≤ 39, template ids ≤ 37 (so their variants stay ≤ 40).
// Question ids hash ANSWER-FREE material only (questionIdMaterial: sorted
// option texts, never the key), so an id cannot be used to test candidate
// answers; content_hash is option-order independent for shufflable items.
// Server/scripts only (node:crypto via prng.js).
// ============================================================================

import { searchNormalize, normalizeTitle, NORMALIZATION_VERSION } from "./normalize.js";
import { sha256Hex } from "./prng.js";
import { GRADE_CODES, NODE_KINDS, QUESTION_TYPES, RUN_KINDS, TERMS, TERM_EVIDENCE_METHODS } from "./enums.js";

export const KEY_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const QUESTION_ID_MAX = 39;
export const VARIANT_ID_MAX = 40;
// A variant id is the template id with "t-" → "v-" plus "-nn" (3 more chars), so
// a template id longer than 37 could never materialize a variant ≤ 40 chars.
export const TEMPLATE_ID_MAX = VARIANT_ID_MAX - 3;

const SEG = "[a-z0-9]+(?:-[a-z0-9]+)*";
const GRADE = `(?:${GRADE_CODES.join("|")})`;
export const QUESTION_ID_RE = new RegExp(`^q-${GRADE}-${SEG}-[0-9a-f]{10}$`);
export const LEGACY_QUESTION_ID_RE = /^[a-z]{2}-\d{3,4}$/;
export const TEMPLATE_ID_RE = new RegExp(`^t-${GRADE}-${SEG}-[0-9a-f]{10}$`);
export const VARIANT_ID_RE = new RegExp(`^v-${GRADE}-${SEG}-[0-9a-f]{10}-(?:0[1-9]|[1-4][0-9]|50)$`);
export const OBJECTIVE_ID_RE = /^obj-[0-9a-f]{10}$/;
export const STIMULUS_ID_RE = /^st-[0-9a-f]{10}$/;
export const RUN_ID_RE = new RegExp(`^run-\\d{8}-(?:${RUN_KINDS.join("|")})-\\d{2}$`);
export const RESOURCE_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*-\d+$/;
export const TERM_EVIDENCE_ID_RE = /^te-[a-z0-9]+(?:-[a-z0-9]+)*-\d+-p\d+-(?:t1|t2|both)$/;
export const DEDUP_CLUSTER_ID_RE = /^dc-.+$/;
export const EXCLUSION_GROUP_RE = /^xg-[0-9a-f]{10}$/;
export const EXAM_TEMPLATE_REF_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*@\d+$/;
export const GUEST_SESSION_ID_RE = /^g-[A-Za-z0-9_-]{22}$/;
// Curriculum node ids: catalog slugs, `<leaf>/t1|t2`, `<leaf>/<subject>`,
// `<subject node>/n<ienId>` or `<subject node>/x<hex8>`.
const NODE_SEG = "[a-z0-9]+(?:-[a-z0-9]+)*";
export const NODE_ID_RE = new RegExp(`^${NODE_SEG}(?:/${NODE_SEG}){0,5}$`);
export const NODE_ID_MAX = 160;

export class IdError extends Error {
  constructor(code, message) {
    super(message ? `${code}: ${message}` : code);
    this.name = "IdError";
    this.code = code;
  }
}

const hex = (text) => sha256Hex(text);

// ── curriculum ──────────────────────────────────────────────────────────────
export const isNodeId = (id) => typeof id === "string" && id.length <= NODE_ID_MAX && NODE_ID_RE.test(id);

/** `<leaf>/t1` | `<leaf>/t2` */
export function termNodeId(leaf, term) {
  if (term !== "t1" && term !== "t2") throw new IdError("bad_term", term);
  return `${leaf}/${term}`;
}

/** `<leaf>/<subject id>`; source-only iEN subjects use `ien-<ienId>`. */
export function subjectNodeId(leaf, subjectId) {
  if (!SLUG_RE.test(String(subjectId))) throw new IdError("bad_subject", subjectId);
  return `${leaf}/${subjectId}`;
}
export const sourceOnlySubjectId = (ienId) => `ien-${Number(ienId)}`;

/** iEN-backed unit / chapter / lesson: `<subject node>/n<ienId>` (flat). */
export function ienNodeId(subjectNode, ienId) {
  if (!Number.isInteger(Number(ienId)) || Number(ienId) < 0) throw new IdError("bad_ien_id", ienId);
  return `${subjectNode}/n${Number(ienId)}`;
}

/**
 * TOC-only unit / chapter / lesson: `<subject node>/x<hex8>` of
 * sha256(subjectNode | kind | normalizeTitle(title)). Mint through the id
 * registry (scripts/content/lib/id-registry.mjs) so typo fixes keep the id.
 */
export function xNodeId(subjectNode, kind, title) {
  if (!NODE_KINDS.includes(kind)) throw new IdError("bad_kind", kind);
  return `${subjectNode}/x${hex(`${subjectNode}|${kind}|${normalizeTitle(title)}`).slice(0, 8)}`;
}

/** Grade code from a leaf / grade node id: middle/grade-1 → m1; prep → apt/ach. */
export function gradeCode(nodeOrExam) {
  const s = String(nodeOrExam ?? "");
  if (s === "aptitude") return "apt";
  if (s === "achievement") return "ach";
  const m = /^(elementary|middle|high-school)\/grade-(\d)(?:\/|$)/.exec(s);
  if (!m) throw new IdError("bad_grade", s);
  const code = { elementary: "e", middle: "m", "high-school": "h" }[m[1]] + m[2];
  if (!GRADE_CODES.includes(code)) throw new IdError("bad_grade", s);
  return code;
}

// ── objectives, stimuli, evidence ──────────────────────────────────────────
/** `obj-<hex10>` = sha256(lesson | normalize(text)); frozen via the id registry. */
export const objectiveId = (lessonNodeId, text) => `obj-${hex(`${lessonNodeId}|${searchNormalize(text)}`).slice(0, 10)}`;
/** `st-<hex10>` = sha256(normalize(text)). */
export const stimulusId = (text) => `st-${hex(searchNormalize(text)).slice(0, 10)}`;
/**
 * `te-<resource>-p<pdfPage>-<term>`. pdfPage 0 marks evidence that is not
 * read from a page (listing title, plan guide, course code, owner decision).
 */
export function termEvidenceId(resourceId, pdfPage, term) {
  if (!RESOURCE_ID_RE.test(resourceId)) throw new IdError("bad_resource", resourceId);
  if (!Number.isInteger(pdfPage) || pdfPage < 0) throw new IdError("bad_page", pdfPage);
  if (!TERMS.includes(term)) throw new IdError("bad_term", term);
  return `te-${resourceId}-p${pdfPage}-${term}`;
}
/** `<source>-<provider id>`: ien-120607, external bank ien-bank-90. */
export function resourceId(sourceId, providerId, { bank = false } = {}) {
  if (!SLUG_RE.test(sourceId) || !/^\d+$/.test(String(providerId))) throw new IdError("bad_resource", `${sourceId}-${providerId}`);
  return bank ? `${sourceId}-bank-${providerId}` : `${sourceId}-${providerId}`;
}
export const isTermEvidenceMethod = (m) => TERM_EVIDENCE_METHODS.includes(m);

// ── canonical serialization and content hash ───────────────────────────────
/** JSON with recursively sorted keys and no whitespace (hash input). */
export function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
}

const TEXT_KEYS = new Set(["text", "answer_display"]);
function normalizePayloadTexts(value, key) {
  if (Array.isArray(value)) {
    return key === "accepted" ? value.map((v) => searchNormalize(v)) : value.map((v) => normalizePayloadTexts(v));
  }
  if (value === null || typeof value !== "object") return TEXT_KEYS.has(key) && typeof value === "string" ? searchNormalize(value) : value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (k === "accepted_norm") continue; // derived from `accepted`
    out[k] = normalizePayloadTexts(v, k);
  }
  return out;
}

const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/** Entries sorted by normalized text (then id): an order that owes nothing to authoring or display. */
const byText = (list) => (Array.isArray(list)
  ? [...list].sort((a, b) => cmpStr(searchNormalize(a?.text ?? ""), searchNormalize(b?.text ?? "")) || cmpStr(String(a?.id ?? ""), String(b?.id ?? "")))
  : list);

/**
 * Is the stored order of the item's option lists meaningless (§5.4)? mcq
 * without a fixed_order_reason and not marked shuffle_options:false; matching
 * columns and ordering items are always shown in a seeded order. true_false
 * and fixed-order mcq keep their stored order (it is what the learner sees).
 */
export function isOrderFree(question) {
  switch (question?.question_type) {
    case "mcq":
      return !question.payload?.fixed_order_reason && question.shuffle_options !== false;
    case "matching":
    case "ordering":
      return true;
    default:
      return false;
  }
}

/** The payload with its shufflable lists sorted by normalized text (content_hash input). */
function orderFreePayload(question) {
  const p = question.payload ?? {};
  if (!isOrderFree(question)) return p;
  if (question.question_type === "mcq") return { ...p, options: byText(p.options) };
  if (question.question_type === "ordering") return { ...p, items: byText(p.items) };
  const pairs = Array.isArray(p.answer?.pairs) ? p.answer.pairs.map((x) => (Array.isArray(x) ? [...x] : x)).sort((a, b) => cmpStr(String(a), String(b))) : p.answer?.pairs;
  return { ...p, left: byText(p.left), right: byText(p.right), ...(p.answer ? { answer: { ...p.answer, pairs } } : {}) };
}

/**
 * `content_hash` = "n2:sha256:" + hex of the canonical serialization of
 * {question_type, language, normalize_v2(stem), stimulus text, payload with
 * normalized texts (incl. the answer)}. Shufflable lists (mcq options without
 * a fixed order, matching columns, ordering items) are sorted by normalized
 * text first, so the hash does not depend on authoring order; fixed-order items
 * keep theirs. Server-only: it depends on the answer.
 */
export function contentHash(question, { stimulusText = null } = {}) {
  const body = {
    question_type: question.question_type,
    language: question.language,
    stem: searchNormalize(question.stem),
    stimulus: stimulusText == null ? null : searchNormalize(stimulusText),
    payload: normalizePayloadTexts(orderFreePayload(question)),
  };
  return `${NORMALIZATION_VERSION}:sha256:${sha256Hex(canonicalJson(body))}`;
}

// ── questions, templates, variants ─────────────────────────────────────────
/**
 * Answer-free id material of a question (§2.2): the canonical JSON of what a
 * learner is shown anyway, in an order that owes nothing to the answer —
 *   mcq / true_false  sorted normalized option texts
 *   matching          sorted normalized left texts and right texts (never the pairing)
 *   ordering          sorted normalized item texts (never the order)
 *   short_answer      nothing (accepted answers and max_chars derive from the answer)
 *   numeric           the normalized unit text (never the value)
 * Nothing here depends on which option is correct, so an id cannot be used to
 * test candidate answers offline.
 */
export function questionIdMaterial(type, payload) {
  const p = payload ?? {};
  const sortedTexts = (list) => (Array.isArray(list) ? list.map((x) => searchNormalize(typeof x === "string" ? x : x?.text ?? "")).sort(cmpStr) : []);
  switch (type) {
    case "mcq":
    case "true_false":
      return canonicalJson({ options: sortedTexts(p.options) });
    case "matching":
      return canonicalJson({ left: sortedTexts(p.left), right: sortedTexts(p.right) });
    case "ordering":
      return canonicalJson({ items: sortedTexts(p.items) });
    case "short_answer":
      return canonicalJson({});
    case "numeric":
      return canonicalJson({ unit: p.unit?.text ? searchNormalize(p.unit.text) : null });
    default:
      throw new IdError("bad_type", type);
  }
}

/**
 * Full id hash: sha256(anchor | type | normalize(stem) | questionIdMaterial(type, payload)).
 * `anchor` is the lesson node id (curriculum) or the prep topic scope
 * (`prep:<exam>/<section>/<topic>`) for aptitude/achievement items. It never
 * includes the answer: passing `answer` is refused (answer_in_id).
 */
export function questionIdHash({ anchor, type, stem, payload, answer }) {
  if (!QUESTION_TYPES.includes(type)) throw new IdError("bad_type", type);
  if (answer !== undefined) throw new IdError("answer_in_id", "question ids are derived from answer-free material (pass payload)");
  if (payload === null || typeof payload !== "object") throw new IdError("payload_required", "pass the payload (only its answer-free part is hashed)");
  return sha256Hex(`${anchor}|${type}|${searchNormalize(stem)}|${questionIdMaterial(type, payload)}`);
}

/** Template id hash: sha256(anchor | type | normalize(stem template) | answer expression). */
function templateIdHash({ anchor, type, stem, answerExpr }) {
  if (!QUESTION_TYPES.includes(type)) throw new IdError("bad_type", type);
  return sha256Hex(`${anchor}|${type}|${searchNormalize(stem)}|${answerExpr}`);
}

function mintHashed(prefix, fullHash, { lookup, contentHash: newContent, maxLength }) {
  if (!SLUG_RE.test(prefix.slice(0, -1)) || prefix.length + 10 > maxLength) throw new IdError("id_too_long", `${prefix}…`);
  // Without the new content hash an exact duplicate could not be recognised and
  // would silently get the next 10 hex (a second id for the same item).
  if (lookup && typeof newContent !== "string") throw new IdError("content_hash_required", "pass contentHash with lookup (D001)");
  for (let w = 0; w + 10 <= 60; w += 10) {
    const id = prefix + fullHash.slice(w, w + 10);
    const existing = lookup ? lookup(id) : null;
    if (!existing) return { id, id_hash: fullHash };
    const sameHash = existing.id_hash === undefined || existing.id_hash === fullHash;
    if (sameHash && newContent !== undefined && existing.content_hash === newContent) {
      return { id: null, duplicate_of: id, code: "D001" };
    }
    // Same 10-hex prefix, different content: take the next 10 hex.
  }
  throw new IdError("id_space_exhausted", prefix);
}

/**
 * Mint a question id `q-<grade code>-<subject>-<hex10>` (§2.2).
 * @param {object} p  { grade: "m1"|…|"apt"|"ach", subject, anchor, type, stem, payload }
 * @param {object} o  { lookup(id) → {content_hash, id_hash?} | null, contentHash }
 * @returns {{id, id_hash} | {id:null, duplicate_of, code:"D001"}}
 */
export function mintQuestionId(p, { lookup = null, contentHash: newContent } = {}) {
  if (!GRADE_CODES.includes(p.grade)) throw new IdError("bad_grade", p.grade);
  if (!SLUG_RE.test(p.subject)) throw new IdError("bad_subject", p.subject);
  if (p.answer !== undefined) throw new IdError("answer_in_id", "question ids are derived from answer-free material (pass payload)");
  const full = questionIdHash({ anchor: p.anchor, type: p.type, stem: p.stem, payload: p.payload });
  return mintHashed(`q-${p.grade}-${p.subject}-`, full, { lookup, contentHash: newContent, maxLength: QUESTION_ID_MAX });
}

/**
 * Mint a template id `t-<grade code>-<subject>-<hex10>`: the same rule over
 * sha256(lesson | type | normalize(stem template) | answer expression).
 */
export function mintTemplateId(p, { lookup = null, contentHash: newContent } = {}) {
  if (!GRADE_CODES.includes(p.grade)) throw new IdError("bad_grade", p.grade);
  if (!SLUG_RE.test(p.subject)) throw new IdError("bad_subject", p.subject);
  const full = templateIdHash({ anchor: p.anchor, type: p.type, stem: p.stem, answerExpr: String(p.answerExpr ?? "") });
  return mintHashed(`t-${p.grade}-${p.subject}-`, full, { lookup, contentHash: newContent, maxLength: TEMPLATE_ID_MAX });
}

/** `v-<grade>-<subject>-<hex10 of template>-<nn>`, nn = 01..50. */
export function variantId(templateId, variantNo) {
  if (!TEMPLATE_ID_RE.test(templateId)) throw new IdError("bad_template", templateId);
  if (!Number.isInteger(variantNo) || variantNo < 1 || variantNo > 50) throw new IdError("bad_variant_no", variantNo);
  const id = `v-${templateId.slice(2)}-${String(variantNo).padStart(2, "0")}`;
  if (id.length > VARIANT_ID_MAX) throw new IdError("id_too_long", id);
  return id;
}

export const isQuestionId = (id) =>
  typeof id === "string" && ((id.length <= QUESTION_ID_MAX && QUESTION_ID_RE.test(id)) || LEGACY_QUESTION_ID_RE.test(id));
export const isTemplateId = (id) => typeof id === "string" && id.length <= TEMPLATE_ID_MAX && TEMPLATE_ID_RE.test(id);
export const isVariantId = (id) => typeof id === "string" && id.length <= VARIANT_ID_MAX && VARIANT_ID_RE.test(id);
/** Any key stored in `questions.key`: canonical, legacy or variant. */
export const isQuestionKey = (id) => (isQuestionId(id) || isVariantId(id)) && KEY_RE.test(id);

// ── runs, validation, dedup, templates, sessions ───────────────────────────
/** `run-<yyyymmdd>-<kind>-<nn>` */
export function runId(date, kind, n) {
  const ymd = date instanceof Date ? date.toISOString().slice(0, 10).replace(/-/g, "") : String(date);
  if (!/^\d{8}$/.test(ymd)) throw new IdError("bad_date", ymd);
  if (!RUN_KINDS.includes(kind)) throw new IdError("bad_run_kind", kind);
  if (!Number.isInteger(n) || n < 1 || n > 99) throw new IdError("bad_run_no", n);
  return `run-${ymd}-${kind}-${String(n).padStart(2, "0")}`;
}
export const isRunId = (id) => typeof id === "string" && RUN_ID_RE.test(id);

/** `<run_id>:<question id>:<role>` */
export const validationRecordId = (run, questionId, role) => `${run}:${questionId}:${role}`;
export const VALIDATION_RECORD_ID_RE = new RegExp(
  `^${RUN_ID_RE.source.slice(1, -1)}:(?:${QUESTION_ID_RE.source.slice(1, -1)}|${TEMPLATE_ID_RE.source.slice(1, -1)}|${VARIANT_ID_RE.source.slice(1, -1)}|[a-z]{2}-\\d{3,4}):(?:deterministic|primary|resolver|language|human)$`,
);

/** `dc-<canonical question id>` */
export const dedupClusterId = (canonicalId) => `dc-${canonicalId}`;

/** `xg-<hex10>` of the component's member ids sorted in C order. */
export function exclusionGroupId(memberIds) {
  const sorted = [...new Set(memberIds)].sort((a, b) => Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8")));
  return `xg-${sha256Hex(sorted.join("|")).slice(0, 10)}`;
}

/** `<id>@<version>` */
export function examTemplateRef(id, version) {
  if (!SLUG_RE.test(id) || !Number.isInteger(version) || version < 1) throw new IdError("bad_template_ref", `${id}@${version}`);
  return `${id}@${version}`;
}

/** Guest session id `g-<22 base64url>` from 16 random bytes (pass bytes to make it deterministic in tests). */
export function guestSessionId(bytes) {
  const buf = bytes ?? globalThis.crypto.getRandomValues(new Uint8Array(16));
  if (buf.length !== 16) throw new IdError("bad_bytes", buf.length);
  return `g-${Buffer.from(buf).toString("base64url")}`;
}
