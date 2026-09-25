// ============================================================================
// Local practice bank — SERVER-ONLY (it holds the answer keys).
//
// Powers LOCAL PRACTICE MODE (/api/exams/local/start + /grade) for guests and
// for when the database is unavailable: questions come from the bundled JSON
// files in src/content/questions (the same files the DB seed is built from,
// see scripts/build-question-seed.mjs), results are graded here and nothing
// is saved.
//
// Never import this from a client component: the module refuses to load in a
// browser, and only the two route handlers import it. (The `server-only`
// package is not installed in this repo, hence the runtime guard.)
//
// File registry — why a template-literal dynamic import:
//   import(`../../content/questions/${name}.json`) makes webpack bundle every JSON
//   file that exists in that folder AT BUILD TIME into a lazy context. A file
//   in QUESTION_FILES that is missing (not written yet) is simply absent from
//   the context: its import rejects, the registry records it under `missing`
//   and serves the others. A literal static import of a missing file would
//   break the build instead. Malformed questions are skipped, never served.
// ============================================================================
import { EXAMS, SECTIONS, DIFFICULTIES, LIMITS, QUESTION_FILES } from "@/lib/exams/catalog";

if (typeof window !== "undefined") {
  throw new Error("src/lib/exams/local-bank.js is server-only (it contains answer keys)");
}

const KEY_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
export const LOCAL_MAX_ANSWERS = LIMITS.maxQuestions; // 100
const MIN_TIME = LIMITS.minMinutes * 60;               // 60 s
const MAX_TIME = LIMITS.maxMinutes * 60;               // 14 400 s

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isInt = (v) => typeof v === "number" && Number.isInteger(v);
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// ── registry ────────────────────────────────────────────────────────────────

async function importQuestionFile(name) {
  // relative (not "@/…") so both webpack and Vite build a static context for it
  const mod = await import(`../../content/questions/${name}.json`);
  return mod?.default ?? mod;
}

/** Normalise one question from a file, or null when it is malformed. */
function normalizeQuestion(file, q) {
  if (!isPlainObject(q)) return null;
  const sec = SECTIONS[file.section];
  const choices = Array.isArray(q.choices) ? q.choices : null;
  const ok = typeof q.key === "string" && KEY_RE.test(q.key)
    && sec && sec.exam === file.exam && sec.topics.includes(q.topic)
    && DIFFICULTIES.includes(q.difficulty)
    && typeof q.stem === "string" && q.stem.trim()
    && choices && choices.length >= 2 && choices.length <= 6
    && choices.every((c) => typeof c === "string" && c.trim())
    && isInt(q.answer) && q.answer >= 0 && q.answer < choices.length
    && typeof q.explanation === "string" && q.explanation.trim();
  if (!ok) return null;
  const time = isInt(q.time_limit_seconds) && q.time_limit_seconds >= 10 && q.time_limit_seconds <= 600
    ? q.time_limit_seconds : LIMITS.defaultSecondsPerQuestion;
  return {
    key: q.key,
    exam: file.exam,
    section: file.section,
    topic: q.topic,
    difficulty: q.difficulty,
    stem: q.stem.trim(),
    passage: typeof q.passage === "string" && q.passage.trim() ? q.passage.trim() : null,
    choices: choices.map((c) => c.trim()),
    answer: q.answer,
    explanation: q.explanation.trim(),
    time_limit_seconds: time,
    premium: q.premium === true,
  };
}

/**
 * Build a bank from parsed question files.
 * @param {object[]} files  parsed JSON files ({ exam, section, questions: [...] })
 * @returns {{ list: object[], byKey: Map<string, object>, loaded: string[], missing: string[], skipped: number }}
 */
export function createBank(files, { names = [], missing = [] } = {}) {
  const list = [];
  const byKey = new Map();
  const loaded = [];
  let skipped = 0;
  files.forEach((file, i) => {
    if (!isPlainObject(file) || !EXAMS[file.exam] || !SECTIONS[file.section] || !Array.isArray(file.questions)) {
      skipped += 1;
      return;
    }
    loaded.push(names[i] || `${file.exam}-${file.section}`);
    for (const raw of file.questions) {
      const q = normalizeQuestion(file, raw);
      if (!q || byKey.has(q.key)) { skipped += 1; continue; }
      byKey.set(q.key, q);
      list.push(q);
    }
  });
  return { list, byKey, loaded, missing: [...missing], skipped };
}

/** Load every available QUESTION_FILES entry (tolerates missing/broken files). */
export async function buildRegistry(loader = importQuestionFile) {
  const files = [];
  const names = [];
  const missing = [];
  for (const name of QUESTION_FILES) {
    try {
      files.push(await loader(name));
      names.push(name);
    } catch {
      missing.push(name);
    }
  }
  return createBank(files, { names, missing });
}

let registry = null;
/** Cached bank for the life of the server instance. */
export function loadLocalBank() {
  if (!registry) {
    registry = buildRegistry().catch((err) => {
      registry = null;
      throw err;
    });
  }
  return registry;
}

// ── validation ──────────────────────────────────────────────────────────────

const fail = (error, field, extra = {}) => ({ ok: false, error, field, ...extra });

/**
 * Validate POST /api/exams/local/start.
 * body: { exam, section?, difficulty?, count, time_limit_seconds? }
 * `count` must be LIMITS.minQuestions..LIMITS.maxQuestions; it is then capped
 * at `maxQuestions` (guests: LIMITS.guestMaxQuestions) and `limited` says so.
 */
export function parseStartBody(body, { maxQuestions = LIMITS.guestMaxQuestions } = {}) {
  if (!isPlainObject(body)) return fail("invalid_argument", "body");
  const allowed = new Set(["exam", "section", "difficulty", "count", "time_limit_seconds"]);
  for (const k of Object.keys(body)) if (!allowed.has(k)) return fail("invalid_argument", k);
  const { exam } = body;
  if (typeof exam !== "string" || !hasOwn(EXAMS, exam)) return fail("invalid_argument", "exam");
  const section = body.section ?? null;
  if (section !== null && (typeof section !== "string" || !hasOwn(SECTIONS, section) || SECTIONS[section].exam !== exam)) {
    return fail("invalid_argument", "section");
  }
  const difficulty = body.difficulty ?? null;
  if (difficulty !== null && !DIFFICULTIES.includes(difficulty)) return fail("invalid_argument", "difficulty");
  const count = body.count ?? 10;
  if (!isInt(count) || count < LIMITS.minQuestions || count > LIMITS.maxQuestions) return fail("invalid_argument", "count");
  const time = body.time_limit_seconds ?? null;
  if (time !== null && (!isInt(time) || time < MIN_TIME || time > MAX_TIME)) return fail("invalid_argument", "time_limit_seconds");
  const capped = Math.min(count, maxQuestions);
  return {
    ok: true,
    value: { exam, section, difficulty, count: capped, requested: count, time_limit_seconds: time, limited: capped < count },
  };
}

/**
 * Validate POST /api/exams/local/grade.
 * body: { answers: [{ key, selected_index }] } — 1..100 unique keys that exist
 * in the bank (never premium); selected_index null (unanswered) or a valid
 * choice index.
 */
export function parseGradeBody(body, bank) {
  if (!isPlainObject(body)) return fail("invalid_argument", "body");
  for (const k of Object.keys(body)) if (k !== "answers") return fail("invalid_argument", k);
  const { answers } = body;
  if (!Array.isArray(answers) || answers.length === 0 || answers.length > LOCAL_MAX_ANSWERS) {
    return fail("invalid_argument", "answers");
  }
  const seen = new Set();
  const out = [];
  for (let i = 0; i < answers.length; i++) {
    const a = answers[i];
    if (!isPlainObject(a)) return fail("invalid_argument", `answers[${i}]`);
    for (const k of Object.keys(a)) if (k !== "key" && k !== "selected_index") return fail("invalid_argument", `answers[${i}].${k}`);
    if (typeof a.key !== "string" || !KEY_RE.test(a.key)) return fail("invalid_argument", `answers[${i}].key`);
    if (seen.has(a.key)) return fail("invalid_argument", `answers[${i}].key`, { reason: "duplicate" });
    seen.add(a.key);
    const q = bank.byKey.get(a.key);
    if (!q || q.premium) return fail("unknown_key", `answers[${i}].key`);
    const sel = a.selected_index ?? null;
    if (sel !== null && (!isInt(sel) || sel < 0 || sel >= q.choices.length)) return fail("invalid_argument", `answers[${i}].selected_index`);
    out.push({ key: a.key, selected_index: sel });
  }
  return { ok: true, value: out };
}

// ── practice ────────────────────────────────────────────────────────────────

/** A question as the runner sees it — never the answer or explanation. */
export function publicQuestion(q, position) {
  return {
    position,
    id: q.key,
    key: q.key,
    stem: q.stem,
    passage: q.passage,
    choices: [...q.choices],
    section: q.section,
    topic: q.topic,
    difficulty: q.difficulty,
    time_limit_seconds: q.time_limit_seconds,
  };
}

function cryptoRandom() {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
}

/**
 * Random practice set (without answers). Premium items are never served.
 * @returns {{ exam, section, difficulty, question_count, time_limit_seconds, questions }}
 */
export function pickLocalQuestions(bank, { exam, section = null, difficulty = null, count, time_limit_seconds = null }, rng = cryptoRandom) {
  const pool = bank.list.filter((q) => !q.premium && q.exam === exam
    && (section === null || q.section === section)
    && (difficulty === null || q.difficulty === difficulty));
  // partial Fisher–Yates: only the first `count` slots are shuffled
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = pool.slice(0, n);
  const sum = picked.reduce((s, q) => s + q.time_limit_seconds, 0);
  return {
    exam,
    section,
    difficulty,
    question_count: picked.length,
    time_limit_seconds: time_limit_seconds ?? Math.min(Math.max(sum, MIN_TIME), MAX_TIME),
    questions: picked.map((q, i) => publicQuestion(q, i + 1)),
  };
}

/**
 * Grade validated answers (output of parseGradeBody) — same item/topic shape
 * as submit_exam_attempt so the results UI renders both modes.
 */
export function gradeLocalAnswers(bank, answers) {
  const items = answers.map((a, i) => {
    const q = bank.byKey.get(a.key);
    const isCorrect = a.selected_index !== null && a.selected_index === q.answer;
    return {
      position: i + 1,
      question_id: q.key,
      key: q.key,
      stem: q.stem,
      passage: q.passage,
      choices: [...q.choices],
      selected_index: a.selected_index,
      correct_index: q.answer,
      is_correct: isCorrect,
      explanation: q.explanation,
      section: q.section,
      topic: q.topic,
      difficulty: q.difficulty,
    };
  });
  const topics = new Map();
  for (const it of items) {
    const k = `${it.section}\u0000${it.topic}`;
    const t = topics.get(k) || { section: it.section, topic: it.topic, correct: 0, total: 0 };
    t.total += 1;
    if (it.is_correct) t.correct += 1;
    topics.set(k, t);
  }
  const correct = items.filter((i) => i.is_correct).length;
  const total = items.length;
  return {
    items,
    by_topic: [...topics.values()].sort((a, b) => (a.section + a.topic).localeCompare(b.section + b.topic)),
    summary: {
      correct,
      total,
      answered: items.filter((i) => i.selected_index !== null).length,
      score_percent: total ? Math.round((10000 * correct) / total) / 100 : 0,
    },
  };
}

/** Counts only (for an honest "N questions available" in local mode). */
export function localBankCounts(bank) {
  const out = {};
  for (const q of bank.list) {
    if (q.premium) continue;
    out[q.exam] ??= { total: 0, sections: {} };
    out[q.exam].total += 1;
    out[q.exam].sections[q.section] = (out[q.exam].sections[q.section] || 0) + 1;
  }
  return out;
}

// ── shared route helpers ────────────────────────────────────────────────────

/** Mutating route guard: same-origin browser requests only. */
export function isSameOrigin(req) {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = req.headers.get("origin");
  if (!origin) return true; // same-origin requests may omit Origin
  try {
    const host = new URL(origin).host;
    return host === req.headers.get("host") || host === new URL(req.url).host;
  } catch {
    return false;
  }
}

/** Read a JSON body with a size cap. → { ok, value } | { ok: false, status, error } */
export async function readJsonBody(req, maxBytes = 32 * 1024) {
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > maxBytes) return { ok: false, status: 413, error: "payload_too_large" };
  let text;
  try {
    text = await req.text();
  } catch {
    return { ok: false, status: 400, error: "invalid_json" };
  }
  if (text.length > maxBytes) return { ok: false, status: 413, error: "payload_too_large" };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, error: "invalid_json" };
  }
}

/**
 * Best-effort per-instance limiter (serverless instances don't share it —
 * it only blunts bursts). Returns true when the caller is over the limit.
 */
export function createRateLimiter({ windowMs = 5 * 60_000, max = 60 } = {}) {
  const hits = new Map();
  return function limited(id) {
    const now = Date.now();
    const recent = (hits.get(id) || []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(id, recent);
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > windowMs) hits.delete(k);
    }
    return recent.length > max;
  };
}

export function clientId(req) {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd && fwd.split(",")[0].trim()) || req.headers.get("x-real-ip") || "unknown";
}
