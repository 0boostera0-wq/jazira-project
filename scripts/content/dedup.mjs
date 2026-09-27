#!/usr/bin/env node
// ============================================================================
// dedup — exact / near / related duplicates and exclusion components over the
// whole question bank (docs/CONTENT_ENGINE.md §4.5, §2.11).
//
//   node scripts/content/dedup.mjs [--root data/staging] [--run <run-id>]
//        [--dry-run] [--adjudications <jsonl>] [--borderline | --borderline-out <jsonl>]
//        [--now <ISO time>] [--json]
//
// Reads every question shard (questions/**, question-variants/** — not the
// templates) plus the stimuli, and:
//   1. normalizes (normalizeForDedup) and tokenizes (shingles.mjs); instruction
//      stem lines and option sets shared by ≥ 5 items are boilerplate
//      (markInstructionStems);
//   2. EXACT: sha256(type | stem | stimulus | sorted options | answer);
//   3. compares exhaustively within a lesson (prep items: their prep topic) and
//      within a resource-page group; across lessons only LSH candidates
//      (MinHash 128 × MurmurHash3, 32 bands × 3 rows), all verified with exact
//      Jaccard;
//   4. classifies pairs (THRESHOLDS, calibrated on
//      tests/fixtures/content/dedup-pairs.json);
//   5. union-find over EXACT/NEAR edges (declared rewrites excluded) → the
//      canonical member (published > validated, origin priority, validation
//      evidence, created_at, id); the others → `rejected`, `duplicate_of`;
//   6. clusters (`dedup-cluster@1`): each duplicate group plus the canonical's
//      RELATED neighbours (star around the best-ranked item);
//   7. exclusion components (lib/exclusion.mjs, cap K = 8).
// Writes the question shards (dedup fields and statuses only),
// validation/dedup-clusters.jsonl and validation/runs/<run>.json (counts,
// split components for reports/duplicates.md). Pairs in the 0.55–0.80 band can
// be exported (--borderline: cache llm/<run>/dedup-borderline.jsonl, item text
// only) for a subagent; its verdicts come back with --adjudications
// ({a, b, class} per line) and carry the `semantic_judged` signal.
// Output is byte-deterministic; a rerun without changes rewrites nothing.
// Exit 0 = ok, 1 = failure, 2 = usage error.
// ============================================================================

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { readJsonl, sha256, writeFileIfChanged, writeJson, writeShards } from "./lib/jsonl.mjs";
import { cachePaths } from "./lib/cache.mjs";
import { REPO_ROOT, ruleFor, shardBase, stringifyRecord } from "./lib/schemas.mjs";
import {
  cmpC, jaccard, maskNumbers, numbersOf, optionShingles, round4, textShingles, tokenize, LONG_STEM_TOKENS,
} from "./lib/shingles.mjs";
import { lshCandidatePairs, minhashSignature, LSH_BANDS, LSH_ROWS, MINHASH_FUNCTIONS } from "./lib/minhash.mjs";
import { buildExclusionGroups, EXCLUSION_CAP, UnionFind } from "./lib/exclusion.mjs";
import { normalizeForDedup } from "../../src/lib/content/normalize.js";
import { canonicalAnswer } from "../../src/lib/content/answers.js";
import { dedupClusterId, isRunId, runId as makeRunId } from "../../src/lib/content/ids.js";

/**
 * Class thresholds (§4.5 step 6), calibrated on the labelled pair set
 * (tests/fixtures/content/dedup-pairs.json; the test pins precision and
 * recall). Calibration changed the NEAR rule's shape: every labelled NEAR
 * pair has the same normalized answer, while pairs with identical options,
 * near-identical stems and a different answer are opposite questions
 * (ascending vs descending, absorbed vs released: RELATED). Reworded short
 * stems reach only 0.55–0.80 on 1+2-shingles + character 4-grams, so a
 * matching option set lowers the stem bar. NEAR =
 *   same answer and (stem J ≥ 0.80, or stem J ≥ 0.55 with option-set J ≥ 0.60,
 *   or whole-item J ≥ 0.85).
 */
export const THRESHOLDS = Object.freeze({
  near_stem: 0.8,
  near_stem_with_options: 0.55,
  near_option: 0.6,
  near_item: 0.85,
  related_stem: 0.55, // RELATED: stem J ≥ 0.55
  related_lesson_stem: 0.4, // or same lesson + same answer + stem J ≥ 0.40
  borderline_low: 0.55, // semantic adjudication band [0.55, 0.80)
  borderline_high: 0.8,
});
/** A normalized stem shared by this many items is an instruction stem (§4.5 step 5). */
export const INSTRUCTION_STEM_MIN = 5;

const STATUS_RANK = { published: 3, validated: 2 };
const ORIGIN_RANK = { source_derived: 4, transformed: 3, generated_practice: 2, internal_authored: 1 };
const SEP = "\u0001";

// ── item preparation ────────────────────────────────────────────────────────
/** The answer-bearing text lists of a payload (options, pairs, items, accepted). */
export function optionTexts(type, payload) {
  const p = payload ?? {};
  const texts = (list) => (Array.isArray(list) ? list.map((x) => String(x?.text ?? "")) : []);
  switch (type) {
    case "mcq":
    case "true_false":
      return texts(p.options);
    case "matching":
      return [...texts(p.left).map((t) => `l ${t}`), ...texts(p.right).map((t) => `r ${t}`)];
    case "ordering":
      return texts(p.items);
    case "short_answer":
      return Array.isArray(p.accepted) ? p.accepted.map(String) : [];
    default:
      return [];
  }
}

function safeAnswer(type, payload) {
  try {
    return normalizeForDedup(canonicalAnswer(type, payload));
  } catch {
    return "";
  }
}

/** Group key for exhaustive comparison: the lesson, or the prep topic. */
function groupKeyOf(q) {
  if (q.curriculum?.lesson) return q.curriculum.lesson;
  if (q.prep) return `prep:${q.prep.exam}/${q.prep.section}${q.prep.topic ? `/${q.prep.topic}` : ""}`;
  return null;
}

/**
 * Everything dedup needs about one question, computed once.
 * @param {object} q  question@1 record
 * @param {{stimulusText?: string|null}} [o]
 */
export function prepareItem(q, { stimulusText = null } = {}) {
  const type = q.question_type;
  const lines = String(q.stem ?? "").split(/\r?\n/).map((l) => tokenize(l)).filter((l) => l.length);
  const stemTokens = lines.flat();
  const stimTokens = stimulusText ? tokenize(stimulusText) : [];
  const opts = optionTexts(type, q.payload);
  const optionTokens = opts.map((t) => tokenize(t));
  const optionNorms = new Set(optionTokens.map((t) => t.join(" ")));
  const optionSetKey = [...optionNorms].sort(cmpC).join(SEP);
  const answerNorm = safeAnswer(type, q.payload);
  const stemNorm = stemTokens.join(" ");
  const src = q.source;
  const pages = src?.resource_id && Number.isInteger(src.pdf_page_start)
    ? { resource: src.resource_id, start: src.pdf_page_start, end: Number.isInteger(src.pdf_page_end) ? src.pdf_page_end : src.pdf_page_start }
    : null;
  const exactHash = sha256(
    [type, normalizeForDedup(q.stem ?? ""), normalizeForDedup(stimulusText ?? ""), opts.map((t) => normalizeForDedup(t)).sort(cmpC).join(SEP), answerNorm].join("|"),
  );
  const maskedTokens = [...stimTokens, "¦", ...stemTokens];
  return {
    id: q.id,
    type,
    lesson: q.curriculum?.lesson ?? null,
    group: groupKeyOf(q),
    pages,
    pageKey: pages ? `${pages.resource}:${pages.start}` : null,
    lines,
    lineNorms: lines.map((l) => l.join(" ")),
    stemTokens,
    stemNorm,
    stemWords: textShingles(stemTokens, { withChars: false }),
    stemFull: textShingles(stemTokens, { withChars: true }),
    stimKey: stimTokens.join(" "),
    stimSet: stimTokens.length ? textShingles(stimTokens, { withChars: false, ns: "s" }) : new Set(),
    optionNorms,
    optionSetKey,
    optionSet: optionShingles(optionTokens),
    answerNorm,
    exactHash,
    masked: maskNumbers(maskedTokens).join(" "),
    numbers: numbersOf(maskedTokens).join(" "),
    variant: q.variant ?? null,
    // set by markInstructionStems (bank-level frequencies)
    instruction: false,
    fixedOptions: false,
    cmpWords: null,
    cmpFull: null,
    rank: {
      status: STATUS_RANK[q.status] ?? 0,
      origin: ORIGIN_RANK[q.provenance?.origin] ?? 0,
      evidence: q.validation?.record_ids?.length ?? 0,
      created: q.created_at ?? "",
    },
  };
}

/**
 * Instruction stems (§4.5 step 5), applied per stem line: a normalized stem
 * line shared by ≥ INSTRUCTION_STEM_MIN items («اختر الكلمة المختلفة…», the
 * analogy or comparison frame) is boilerplate. Such an item is compared on
 * one marker per instruction line + the rest of its stem + its option
 * shingles, instead of the stem alone. An option set shared by
 * ≥ INSTRUCTION_STEM_MIN items (the four comparison answers, صح/خطأ) is
 * boilerplate too: it stays in the option-set Jaccard but not in the shingle
 * sets. Mutates and returns `items`.
 */
export function markInstructionStems(items, min = INSTRUCTION_STEM_MIN) {
  const lineCount = new Map();
  const optionCount = new Map();
  for (const it of items) {
    for (const l of new Set(it.lineNorms)) lineCount.set(l, (lineCount.get(l) ?? 0) + 1);
    if (it.optionSetKey) optionCount.set(it.optionSetKey, (optionCount.get(it.optionSetKey) ?? 0) + 1);
  }
  for (const it of items) {
    it.fixedOptions = Boolean(it.optionSetKey) && optionCount.get(it.optionSetKey) >= min;
    if (it.fixedOptions) it.optionSet = new Set();
    const frames = it.lineNorms.filter((l) => lineCount.get(l) >= min);
    it.instruction = frames.length > 0;
    if (!it.instruction) {
      it.cmpWords = it.stemWords;
      it.cmpFull = it.stemFull;
      continue;
    }
    const content = it.lines.filter((_, i) => lineCount.get(it.lineNorms[i]) < min).flat();
    const markers = new Set(frames.map((l) => `I:${l}`));
    it.cmpWords = union(union(markers, textShingles(content, { withChars: false })), it.optionSet);
    it.cmpFull = union(union(markers, textShingles(content, { withChars: true })), it.optionSet);
  }
  return items;
}

/** Canonical ranking: best first (published > validated, origin, evidence, created_at, id). */
export function compareRank(a, b) {
  return (
    b.rank.status - a.rank.status ||
    b.rank.origin - a.rank.origin ||
    b.rank.evidence - a.rank.evidence ||
    cmpC(a.rank.created || "~", b.rank.created || "~") ||
    cmpC(a.id, b.id)
  );
}

// ── pair similarity and classification ─────────────────────────────────────
function union(a, b) {
  const out = new Set(a);
  for (const x of b) out.add(x);
  return out;
}

/**
 * Stem shingle sets for a pair: word 1+2-shingles when both stems have ≥ 10
 * tokens, else word shingles plus character 4-grams on both sides
 * (instruction stems: see markInstructionStems).
 *
 * The stimulus is part of the question when the two items do not share it:
 * «ما المنوال للبيانات السابقة؟» over two different data sets, or «ما عنوان
 * مناسب للنص؟» over two different passages, are different questions even
 * with equal stems and equal answers, so each side's stimulus shingles join
 * its stem set. Items on the same stimulus are compared on their stems alone.
 */
function stemSetsFor(a, b) {
  const long = a.stemTokens.length >= LONG_STEM_TOKENS && b.stemTokens.length >= LONG_STEM_TOKENS;
  const pick = (x) => (long ? x.cmpWords ?? x.stemWords : x.cmpFull ?? x.stemFull);
  if (a.stimKey === b.stimKey) return [pick(a), pick(b)];
  return [union(pick(a), a.stimSet), union(pick(b), b.stimSet)];
}

/** The set an item is MinHashed on (its own length rule). */
export const lshSetOf = (it) => (it.stemTokens.length >= LONG_STEM_TOKENS ? it.cmpWords ?? it.stemWords : it.cmpFull ?? it.stemFull);

const answerSet = (x) => (x.answerNorm ? new Set([`A:${x.answerNorm}`]) : new Set());

/** Stem, whole-item and option-set Jaccard of two prepared items. */
export function pairScores(a, b) {
  const [sa, sb] = stemSetsFor(a, b);
  const stemJ = jaccard(sa, sb, a.stemNorm === b.stemNorm && a.stimKey === b.stimKey ? 1 : 0);
  // A shared stimulus is context, not the item: items on one passage are compared without it.
  const shared = a.stimKey !== "" && a.stimKey === b.stimKey;
  const ia = union(union(union(sa, shared ? [] : a.stimSet), a.optionSet), answerSet(a));
  const ib = union(union(union(sb, shared ? [] : b.stimSet), b.optionSet), answerSet(b));
  const itemJ = jaccard(ia, ib, 1);
  const optionJ = a.optionNorms.size === 0 && b.optionNorms.size === 0 ? null : jaccard(a.optionNorms, b.optionNorms);
  return { stem_jaccard: round4(stemJ), item_jaccard: round4(itemJ), option_jaccard: round4(optionJ) };
}

const overlaps = (p, q) => Boolean(p && q && p.resource === q.resource && p.start <= q.end && q.start <= p.end);
const isRewritePair = (a, b) =>
  (a.variant?.kind === "rewrite" && a.variant.of === b.id) || (b.variant?.kind === "rewrite" && b.variant.of === a.id);
const sameTemplate = (a, b) =>
  a.variant?.kind === "template" && b.variant?.kind === "template" && a.variant.template_id === b.variant.template_id;

/**
 * Classify one pair (§4.5 step 6).
 * @returns {{ class, score, signals, dup: boolean, edge: boolean, numericOnly: boolean }}
 *   dup: EXACT/NEAR union-find edge; edge: exclusion conflict edge (RELATED
 *   except numeric_variant alone; declared rewrites).
 */
export function classifyPair(a, b, { thresholds = THRESHOLDS, viaLsh = false, adjudicated = null } = {}) {
  const score = pairScores(a, b);
  const sameAnswer = a.answerNorm !== "" && a.answerNorm === b.answerNorm;
  const samePages = overlaps(a.pages, b.pages);
  const signals = new Set();
  if (viaLsh) signals.add("minhash");
  if (sameAnswer) signals.add("same_answer");
  if (sameTemplate(a, b)) signals.add("template_variant");
  const out = (cls, extra = {}) => ({ class: cls, score, signals: [...signals].sort(cmpC), dup: false, edge: false, numericOnly: false, ...extra });

  if (a.exactHash === b.exactHash) {
    signals.add("exact_hash");
    if (samePages) signals.add("same_pages");
    return out("EXACT_DUPLICATE", { dup: true, edge: true });
  }
  const rewrite = isRewritePair(a, b);
  const s = score.stem_jaccard;
  let cls = "UNIQUE";
  let numericOnly = false;
  if (a.masked === b.masked && a.numbers !== "" && a.numbers !== b.numbers) {
    // Same text, different numbers: a different problem, never a duplicate.
    signals.add("numeric_variant");
    cls = "RELATED";
    numericOnly = !sameAnswer;
  } else if (
    !rewrite &&
    sameAnswer &&
    (s >= thresholds.near_stem ||
      (s >= thresholds.near_stem_with_options && (score.option_jaccard ?? 0) >= thresholds.near_option) ||
      score.item_jaccard >= thresholds.near_item)
  ) {
    cls = "NEAR_DUPLICATE";
  } else if (s >= thresholds.related_stem || (a.lesson && a.lesson === b.lesson && sameAnswer && s >= thresholds.related_lesson_stem) || (samePages && sameAnswer)) {
    cls = "RELATED";
  }
  if (samePages && (cls !== "UNIQUE" || sameAnswer) && !numericOnly) signals.add("same_pages");
  if (rewrite && cls === "UNIQUE") cls = "RELATED"; // a declared rewrite always joins its parent's component
  if (adjudicated) {
    // A subagent's semantic judgement of a borderline pair overrides the class
    // (never an exact-hash match, which returned above).
    if (!["NEAR_DUPLICATE", "RELATED", "UNIQUE"].includes(adjudicated)) throw new Error(`bad adjudicated class ${adjudicated}`);
    signals.add("semantic_judged");
    if (adjudicated !== cls) {
      cls = adjudicated;
      numericOnly = false;
    }
  }
  if (cls === "UNIQUE") return out(cls);
  const dup = cls === "NEAR_DUPLICATE" && !rewrite;
  return out(cls, { dup, edge: cls !== "UNIQUE" && !numericOnly, numericOnly });
}

export const isBorderline = (score, thresholds = THRESHOLDS) =>
  score.stem_jaccard >= thresholds.borderline_low && score.stem_jaccard < thresholds.borderline_high;

// ── candidate pairs ─────────────────────────────────────────────────────────
const pk = (a, b) => (cmpC(a, b) <= 0 ? `${a}\u0000${b}` : `${b}\u0000${a}`);

/**
 * Prep topics (aptitude / achievement items have no lesson) larger than this
 * are not compared exhaustively: their pairs come from LSH, like cross-lesson
 * pairs. The lesson-scoped RELATED rule never applies to prep items, so only
 * the stem-J rules (≥ 0.55, LSH recall ≈ 0.997) are affected, and the pair
 * count of one topic stays bounded (≈ 2M pairs at 2,000 items) instead of
 * growing quadratically with the bank. Lessons are always exhaustive.
 */
export const EXHAUSTIVE_PREP_GROUP_MAX = 2000;

/**
 * Candidate pairs: exhaustive inside each lesson / prep topic (≤
 * EXHAUSTIVE_PREP_GROUP_MAX) and each resource-page group; equal exact hashes
 * and equal stems anywhere (not for instruction stems, whose equal stems are
 * boilerplate — a bucket of thousands of «اختر الكلمة المختلفة» items would
 * be quadratic; they are found through LSH on stem content + options); LSH
 * candidates across groups. Returns Map pairKey → { a, b, viaLsh }.
 */
export function candidatePairs(items, { lsh = true, prepGroupMax = EXHAUSTIVE_PREP_GROUP_MAX } = {}) {
  const byId = new Map(items.map((it) => [it.id, it]));
  const pairs = new Map();
  const add = (x, y, viaLsh = false) => {
    if (x === y) return;
    const key = pk(x, y);
    if (!pairs.has(key)) {
      const [a, b] = cmpC(x, y) <= 0 ? [x, y] : [y, x];
      pairs.set(key, { a, b, viaLsh });
    }
  };
  const bucket = (keyOf, skip = null) => {
    const m = new Map();
    for (const it of items) {
      const k = keyOf(it);
      if (k === null || k === undefined || k === "") continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(it.id);
    }
    for (const [k, ids] of m) {
      if (skip && skip(k, ids)) continue;
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) add(ids[i], ids[j]);
    }
    return m;
  };
  const lshOnlyGroups = new Set();
  bucket(
    (it) => it.group,
    (k, ids) => {
      if (!k.startsWith("prep:") || ids.length <= prepGroupMax) return false;
      lshOnlyGroups.add(k);
      return true;
    },
  );
  bucket((it) => it.pageKey);
  bucket((it) => it.exactHash);
  bucket((it) => (it.instruction ? null : it.stemNorm));
  if (lsh) {
    const entries = items.map((it) => ({ id: it.id, sig: minhashSignature(lshSetOf(it)) }));
    for (const [a, b] of lshCandidatePairs(entries)) {
      const x = byId.get(a);
      const y = byId.get(b);
      if (x.group && x.group === y.group && !lshOnlyGroups.has(x.group)) continue; // compared exhaustively
      add(a, b, true);
    }
  }
  return pairs;
}

// ── the bank ────────────────────────────────────────────────────────────────
/** Items dedup considers: everything except retired items and items rejected for other reasons. */
export const participates = (q) => q.status !== "retired" && !(q.status === "rejected" && !q.dedup?.duplicate_of);

/** Status of an item that is no longer a duplicate (it was rejected by an earlier dedup run). */
function restoredStatus(q) {
  if (q.status !== "rejected") return q.status;
  const v = q.validation?.status;
  return v === "validated" ? "validated" : v === "review_required" ? "review_required" : "candidate";
}

/**
 * Classify every candidate pair of a prepared bank.
 * @returns {{ classified: Map, borderline: object[], candidates: number, lshPairs: number }}
 */
function classifyAll(items, byId, { thresholds, adjudications, lsh }) {
  const candidates = candidatePairs(items, { lsh });
  const classified = new Map();
  const borderline = [];
  let lshPairs = 0;
  for (const [key, { a, b, viaLsh }] of candidates) {
    if (viaLsh) lshPairs++;
    const r = classifyPair(byId.get(a), byId.get(b), { thresholds, viaLsh, adjudicated: adjudications.get(key) ?? null });
    if (r.class !== "UNIQUE") classified.set(key, { a, b, ...r });
    if (isBorderline(r.score, thresholds) && r.class !== "EXACT_DUPLICATE" && !r.signals.includes("semantic_judged")) {
      borderline.push({ a, b, class: r.class, score: r.score });
    }
  }
  return { classified, borderline, candidates: candidates.size, lshPairs };
}

/** Union-find over EXACT/NEAR edges → canonical id per item and the other members per canonical. */
function duplicateGroups(items, classified) {
  const uf = new UnionFind();
  for (const it of items) uf.find(it.id);
  for (const p of classified.values()) if (p.dup) uf.union(p.a, p.b);
  const groups = new Map();
  for (const it of items) {
    const r = uf.find(it.id);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(it);
  }
  const canonicalOf = new Map();
  const groupMembers = new Map();
  for (const members of groups.values()) {
    const sorted = [...members].sort(compareRank);
    const canon = sorted[0].id;
    groupMembers.set(canon, sorted.slice(1).map((m) => m.id).sort(cmpC));
    for (const m of members) canonicalOf.set(m.id, canon);
  }
  return { canonicalOf, groupMembers };
}

/** Conflict edges between surviving items: pair endpoints mapped to their canonical. */
function survivorConflictEdges(classified, canonicalOf, byId) {
  const edges = new Map();
  for (const p of classified.values()) {
    if (!p.edge || p.dup) continue;
    const a = canonicalOf.get(p.a);
    const b = canonicalOf.get(p.b);
    if (a === b) continue;
    const key = pk(a, b);
    const samePage = overlaps(byId.get(p.a).pages, byId.get(p.b).pages);
    const prev = edges.get(key);
    if (!prev) {
      const [x, y] = cmpC(a, b) <= 0 ? [a, b] : [b, a];
      edges.set(key, { a: x, b: y, weight: p.score.stem_jaccard, samePage, signals: new Set(p.signals) });
    } else {
      prev.weight = Math.max(prev.weight, p.score.stem_jaccard);
      prev.samePage ||= samePage;
      for (const s of p.signals) prev.signals.add(s);
    }
  }
  return edges;
}

/**
 * Clusters (§2.11): per surviving item, best-ranked first, its duplicate
 * group (EXACT/NEAR) plus its unassigned RELATED neighbours. A neighbour
 * that has duplicates of its own, or ranks above the head, heads its own
 * cluster instead (so `duplicate_of` always names the cluster canonical).
 */
function buildClusters({ survivors, groupMembers, survivorEdges, classified, byId, runId }) {
  const neighbours = new Map();
  for (const e of survivorEdges.values()) {
    for (const [x, y] of [[e.a, e.b], [e.b, e.a]]) {
      if (!neighbours.has(x)) neighbours.set(x, []);
      neighbours.get(x).push({ id: y, edge: e });
    }
  }
  const memberEntry = (head, id, cls, edgeSignals = []) => {
    const direct = classified.get(pk(head, id)) ?? null;
    const signals = new Set([...(direct?.signals ?? []), ...edgeSignals]);
    if (cls === "EXACT_DUPLICATE") signals.add("exact_hash");
    return { id, class: cls, score: direct?.score ?? pairScores(byId.get(head), byId.get(id)), signals: [...signals].sort(cmpC) };
  };
  const clusterOf = new Map();
  const classOf = new Map();
  const clusters = [];
  const assigned = new Set();
  for (const head of survivors) {
    if (assigned.has(head.id)) continue;
    assigned.add(head.id);
    const members = [];
    for (const id of groupMembers.get(head.id)) {
      const cls = byId.get(id).exactHash === head.exactHash ? "EXACT_DUPLICATE" : "NEAR_DUPLICATE";
      members.push(memberEntry(head.id, id, cls));
    }
    const near = [...(neighbours.get(head.id) ?? [])].sort((x, y) => cmpC(x.id, y.id));
    for (const { id, edge } of near) {
      if (assigned.has(id) || groupMembers.get(id).length > 0) continue;
      members.push(memberEntry(head.id, id, "RELATED", [...edge.signals]));
      assigned.add(id);
    }
    if (!members.length) continue;
    const cid = dedupClusterId(head.id);
    clusterOf.set(head.id, cid);
    for (const m of members) {
      clusterOf.set(m.id, cid);
      classOf.set(m.id, m.class);
    }
    members.sort((x, y) => cmpC(x.id, y.id));
    clusters.push({ schema: "dedup-cluster@1", id: cid, canonical_id: head.id, members, exclusion_group: null, run_id: runId });
  }
  return { clusters, clusterOf, classOf };
}

function sameClusterContent(a, b) {
  const strip = (c) => stringifyRecord("dedup-cluster", { ...c, run_id: "run-00000000-dedup-01" });
  return strip(a) === strip(b);
}

/**
 * Deduplicate a bank of question@1 records.
 * @param {object[]} questions
 * @param {object} o
 * @param {string} o.runId
 * @param {Map<string,string>} [o.stimuli]  stimulus id → text
 * @param {Map<string,string>} [o.adjudications]  pairKey(a, b) → class (semantic_judged)
 * @param {Map<string,object>} [o.previousClusters]  cluster id → earlier record (keeps its run_id when unchanged)
 * @returns {{ questions, clusters, exclusion, pairs, borderline, stats }}
 */
export function dedupBank(questions, o = {}) {
  const { runId, stimuli = new Map(), adjudications = new Map(), previousClusters = new Map(), thresholds = THRESHOLDS, cap = EXCLUSION_CAP, lsh = true } = o;
  if (!isRunId(runId)) throw new Error(`bad run id ${runId}`);
  const seen = new Set();
  for (const q of questions) {
    if (seen.has(q.id)) throw new Error(`duplicate question id ${q.id}`);
    seen.add(q.id);
  }
  const items = markInstructionStems(
    questions.filter(participates).map((q) => prepareItem(q, { stimulusText: q.stimulus_id ? stimuli.get(q.stimulus_id) ?? null : null })),
  );
  const byId = new Map(items.map((it) => [it.id, it]));

  const { classified, borderline, candidates, lshPairs } = classifyAll(items, byId, { thresholds, adjudications, lsh });
  const { canonicalOf, groupMembers } = duplicateGroups(items, classified);
  const survivors = items.filter((it) => canonicalOf.get(it.id) === it.id).sort(compareRank);
  const survivorEdges = survivorConflictEdges(classified, canonicalOf, byId);
  const { clusters, clusterOf, classOf } = buildClusters({ survivors, groupMembers, survivorEdges, classified, byId, runId });

  // exclusion components over survivors (+ virtual template nodes)
  const nodes = survivors.map((it) => ({ id: it.id, question: true, pageKey: it.pageKey }));
  const edges = [...survivorEdges.values()].map((e) => ({ a: e.a, b: e.b, kind: "related", weight: e.weight, samePage: e.samePage }));
  const templateIds = new Set();
  for (const it of survivors) {
    if (it.variant?.kind === "template") {
      templateIds.add(it.variant.template_id);
      edges.push({ a: it.id, b: it.variant.template_id, kind: "member_of" });
    } else if (it.variant?.kind === "rewrite" && canonicalOf.has(it.variant.of) && canonicalOf.get(it.variant.of) !== it.id) {
      edges.push({ a: it.id, b: canonicalOf.get(it.variant.of), kind: "member_of" });
    }
  }
  for (const t of [...templateIds].sort(cmpC)) if (!byId.has(t)) nodes.push({ id: t, question: false });
  const exclusion = buildExclusionGroups({ nodes, edges, cap });

  for (const c of clusters) {
    c.exclusion_group = exclusion.groupOf.get(c.canonical_id) ?? null;
    const prev = previousClusters.get(c.id);
    if (prev && sameClusterContent(prev, c)) c.run_id = prev.run_id;
  }
  clusters.sort((x, y) => cmpC(x.id, y.id));

  const out = questions.map((q) => {
    if (!byId.has(q.id)) return q;
    const canon = canonicalOf.get(q.id);
    if (canon !== q.id) {
      return { ...q, status: "rejected", dedup: { class: classOf.get(q.id), cluster_id: clusterOf.get(q.id), exclusion_group: null, duplicate_of: canon } };
    }
    const dedup = { class: classOf.get(q.id) ?? "UNIQUE", cluster_id: clusterOf.get(q.id) ?? null, exclusion_group: exclusion.groupOf.get(q.id) ?? null };
    return { ...q, status: restoredStatus(q), dedup };
  });

  const all = [...classified.values()];
  const count = (pred) => all.filter(pred).length;
  const stats = {
    items: questions.length,
    participants: items.length,
    instruction_stem_items: items.filter((it) => it.instruction).length,
    pairs_compared: candidates,
    lsh_candidate_pairs: lshPairs,
    exact_pairs: count((p) => p.class === "EXACT_DUPLICATE"),
    near_pairs: count((p) => p.class === "NEAR_DUPLICATE"),
    related_pairs: count((p) => p.class === "RELATED"),
    numeric_variant_only_pairs: count((p) => p.numericOnly),
    semantic_judged_pairs: count((p) => p.signals.includes("semantic_judged")),
    rejected_duplicates: items.length - survivors.length,
    clusters: clusters.length,
    exclusion_groups: exclusion.components.length,
    largest_group: exclusion.components.reduce((m, c) => (c.exempt ? m : Math.max(m, c.size)), 0),
    exempt_template_groups: exclusion.components.filter((c) => c.exempt).length,
    split_components: exclusion.splits.length,
    borderline_pairs: borderline.length,
  };
  const pairs = all.map(({ a, b, class: cls, score, signals }) => ({ a, b, class: cls, score, signals })).sort((x, y) => cmpC(x.a, y.a) || cmpC(x.b, y.b));
  borderline.sort((x, y) => cmpC(x.a, y.a) || cmpC(x.b, y.b));
  return { questions: out, clusters, exclusion, pairs, borderline, stats };
}

/** Key of an unordered pair (adjudication maps). */
export const pairKey = pk;

// ── staging I/O ─────────────────────────────────────────────────────────────
function walk(dir, base = dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort(cmpC)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, base, out);
    else out.push(relative(base, p).split(sep).join("/"));
  }
  return out;
}

/**
 * Load the bank from a staging tree: question shards (questions/**,
 * question-variants/** except templates), stimuli and the previous clusters.
 * @returns {{ files: Map<base, {rel:string[], ids:string[]}>, questions: object[], stimuli: Map, previousClusters: Map, inputs: object[] }}
 */
export function loadBank(root) {
  const files = new Map();
  const questions = [];
  const stimuli = new Map();
  const previousClusters = new Map();
  const inputs = [];
  for (const rel of walk(root)) {
    const rule = ruleFor(rel);
    if (!rule) continue;
    if (rule.id === "questions" || rule.id === "variants") {
      const base = shardBase(rel);
      if (!files.has(base)) files.set(base, { rel: [], ids: [] });
      const records = readJsonl(join(root, rel));
      files.get(base).rel.push(rel);
      for (const r of records) {
        files.get(base).ids.push(r.id);
        questions.push(r);
      }
      inputs.push({ path: rel, sha256: sha256(readFileSync(join(root, rel))), records: records.length });
    } else if (rule.id === "stimuli") {
      for (const s of readJsonl(join(root, rel))) stimuli.set(s.id, s.text);
      inputs.push({ path: rel, sha256: sha256(readFileSync(join(root, rel))) });
    } else if (rule.id === "dedup-clusters") {
      for (const c of readJsonl(join(root, rel))) previousClusters.set(c.id, c);
    }
  }
  return { files, questions, stimuli, previousClusters, inputs };
}

/** Next free run id `run-<yyyymmdd>-dedup-NN` under validation/runs. */
export function nextRunId(root, date = new Date()) {
  const ymd = date.toISOString().slice(0, 10).replace(/-/g, "");
  const dir = join(root, "validation", "runs");
  const taken = new Set(existsSync(dir) ? readdirSync(dir) : []);
  for (let n = 1; n <= 99; n++) {
    const id = makeRunId(ymd, "dedup", n);
    if (!taken.has(`${id}.json`)) return id;
  }
  throw new Error("no free dedup run number today");
}

/** Adjudications JSONL: {a, b, class} per line → Map pairKey → class. */
export function readAdjudications(path) {
  const map = new Map();
  for (const r of readJsonl(path)) {
    if (typeof r.a !== "string" || typeof r.b !== "string" || !["NEAR_DUPLICATE", "RELATED", "UNIQUE"].includes(r.class)) {
      throw new Error(`bad adjudication line ${JSON.stringify(r).slice(0, 120)}`);
    }
    map.set(pk(r.a, r.b), r.class);
  }
  return map;
}

/**
 * Run dedup over a staging tree and write the results.
 * @returns {{ runId, stats, written: string[], removed: string[], manifest: object }}
 */
export function runDedup({ root, runId, dryRun = false, adjudications = new Map(), borderlineOut = null, now = new Date() }) {
  const bank = loadBank(root);
  const id = runId ?? nextRunId(root, now);
  const result = dedupBank(bank.questions, { runId: id, stimuli: bank.stimuli, adjudications, previousClusters: bank.previousClusters });
  const byId = new Map(result.questions.map((q) => [q.id, q]));
  const written = [];
  const removed = [];
  const note = (r) => {
    for (const f of r.files) if (f.changed) written.push(relative(root, f.path).split(sep).join("/"));
    removed.push(...r.removed.map((p) => relative(root, p).split(sep).join("/")));
  };
  for (const [base, { ids }] of [...bank.files].sort((x, y) => cmpC(x[0], y[0]))) {
    note(writeShards(join(root, base), ids.map((i) => byId.get(i)), { serialize: (r) => stringifyRecord("question", r), dryRun }));
  }
  const clusterBase = join(root, "validation", "dedup-clusters");
  if (result.clusters.length || bank.previousClusters.size) {
    note(writeShards(clusterBase, result.clusters, { serialize: (r) => stringifyRecord("dedup-cluster", r), dryRun }));
  }
  const manifest = {
    schema: "run-manifest@1",
    run_id: id,
    kind: "dedup",
    generated_at: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
    params: {
      thresholds: THRESHOLDS,
      instruction_stem_min: INSTRUCTION_STEM_MIN,
      long_stem_tokens: LONG_STEM_TOKENS,
      minhash: { functions: MINHASH_FUNCTIONS, hash: "murmur3_x86_32", seeds: `1..${MINHASH_FUNCTIONS}`, lsh_bands: LSH_BANDS, lsh_rows: LSH_ROWS },
      exclusion_cap: EXCLUSION_CAP,
      adjudications: adjudications.size,
    },
    inputs: bank.inputs,
    counts: result.stats,
    split_components: result.exclusion.splits,
    exempt_groups: result.exclusion.components.filter((c) => c.exempt).map((c) => ({ exclusion_group: c.id, size: c.size })),
    errors: [],
  };
  if (!dryRun) {
    if (writeJson(join(root, "validation", "runs", `${id}.json`), manifest)) written.push(`validation/runs/${id}.json`);
    if (borderlineOut) writeBorderline(borderlineOut, result.borderline, bank.questions);
  }
  return { runId: id, stats: result.stats, written, removed, manifest };
}

/** Borderline pairs for semantic adjudication (Jazira-authored item text only; cache side). */
function writeBorderline(path, borderline, questions) {
  const q = new Map(questions.map((x) => [x.id, x]));
  const view = (x) => ({ id: x.id, language: x.language, question_type: x.question_type, stem: x.stem, options: optionTexts(x.question_type, x.payload) });
  const lines = borderline.map((p) => JSON.stringify({ a: view(q.get(p.a)), b: view(q.get(p.b)), class: p.class, score: p.score }));
  writeFileIfChanged(path, lines.length ? lines.join("\n") + "\n" : "");
}

export function parseArgs(argv) {
  const o = { root: join(REPO_ROOT, "data", "staging"), runId: null, dryRun: false, adjudications: null, borderline: false, borderlineOut: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--root") o.root = resolve(val());
    else if (a === "--run") o.runId = val();
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--adjudications") o.adjudications = resolve(val());
    else if (a === "--borderline") o.borderline = true;
    else if (a === "--borderline-out") o.borderlineOut = resolve(val());
    else if (a === "--now") o.now = val();
    else if (a === "--json") o.json = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (o.runId && !/^run-\d{8}-dedup-\d{2}$/.test(o.runId)) throw new Error("--run must be run-<yyyymmdd>-dedup-<nn>");
  if (o.now && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(o.now)) throw new Error("--now must be an ISO time like 2026-09-28T08:00:00Z");
  return o;
}

export async function main(argv = process.argv.slice(2), out = console) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    out.error(`dedup: ${e.message}`);
    out.error("usage: dedup.mjs [--root <staging>] [--run run-<yyyymmdd>-dedup-<nn>] [--dry-run] [--adjudications <jsonl>] [--borderline | --borderline-out <jsonl>] [--now <ISO>] [--json]");
    return 2;
  }
  try {
    const adjudications = args.adjudications ? readAdjudications(args.adjudications) : new Map();
    const now = args.now ? new Date(args.now) : new Date();
    const runId = args.runId ?? nextRunId(args.root, now);
    const borderlineOut = args.borderlineOut ?? (args.borderline ? join(cachePaths().llmDir(runId), "dedup-borderline.jsonl") : null);
    const r = runDedup({ root: args.root, runId, dryRun: args.dryRun, adjudications, borderlineOut, now });
    if (args.json) out.log(JSON.stringify({ run_id: r.runId, counts: r.stats, written: r.written, removed: r.removed }, null, 2));
    else {
      out.log(`dedup ${r.runId}${args.dryRun ? " (dry run)" : ""}: ${r.stats.participants} items, ${r.stats.pairs_compared} pairs compared (${r.stats.lsh_candidate_pairs} via LSH)`);
      out.log(`  exact ${r.stats.exact_pairs} · near ${r.stats.near_pairs} · related ${r.stats.related_pairs} (numeric-variant only ${r.stats.numeric_variant_only_pairs}) · rejected ${r.stats.rejected_duplicates}`);
      out.log(`  clusters ${r.stats.clusters} · exclusion groups ${r.stats.exclusion_groups} (largest ${r.stats.largest_group}, split ${r.stats.split_components})`);
      out.log(`  ${r.written.length} file(s) ${args.dryRun ? "would change" : "written"}${r.removed.length ? `, ${r.removed.length} removed` : ""}`);
      if (borderlineOut) out.log(`  ${r.stats.borderline_pairs} borderline pair(s) → ${borderlineOut}`);
    }
    return 0;
  } catch (e) {
    out.error(`dedup: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then((code) => {
    process.exitCode = code;
  });
}
