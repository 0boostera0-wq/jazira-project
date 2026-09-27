// ============================================================================
// Exam engine — client data layer (see docs/DATA_API.md → "Exams").
//
// DB mode:    signed-in user + Supabase configured + 0010 RPCs deployed.
//             Attempts, answers, results, XP and history are stored server-side;
//             answer keys only arrive in the graded result.
// LOCAL mode: guests, Supabase not configured, RPCs missing (PGRST202/42883) or
//             the database unreachable → /api/exams/local/* (bundled questions,
//             graded on the server, NOTHING saved). Every payload carries
//             `mode: "db" | "local" | "guest"` so the UI can say "results aren't saved".
// GUEST mode: template sessions (startExam({ template, scope, … })) for guests or
//             when start_template_attempt is unavailable → /api/exams/session/*
//             (src/lib/data/exam-sessions.js; ids "g-…", nothing saved).
//
// Shapes are the same in both modes (local attempts have string ids starting
// with "local-" and question ids equal to the question key).
//
// Errors: functions throw a DataError (err.name === "DataError") whose `code`
// is one of EXAM_ERROR_CODES and `details` is a small object when the server
// sent one (e.g. daily_limit_reached → { limit, used, resets_at }).
// ============================================================================
import { getSupabase } from "@/lib/supabase-lazy";
import {
  getGuestSession, isGuestAttemptId, saveGuestResponse, startGuestSession, submitGuestSession,
} from "@/lib/data/exam-sessions";

export const EXAM_ERROR_CODES = [
  "not_authenticated", "invalid_argument", "premium_required", "daily_limit_reached", "not_enough_questions",
  "attempt_not_found", "attempt_closed", "rate_limited", "forbidden", "unavailable", "network", "unknown",
  // template engine (docs/CONTENT_ENGINE.md §5.7)
  "template_not_found", "scope_not_found", "insufficient_pool", "feedback_not_allowed", "invalid_response",
  "item_locked", "scope_too_large", "seed_not_allowed", "not_found", "key_reveal_limit", "token_invalid",
  "token_expired", "bank_changed",
];
// codes the database raises as the exception message (P0001)
const SERVER_CODES = new Set(EXAM_ERROR_CODES.filter((c) => !["unavailable", "network", "unknown"].includes(c)));
const MISSING = new Set(["PGRST202", "PGRST205", "42P01", "42883"]);
const DB_DOWN = new Set(["PGRST000", "PGRST001", "PGRST002", "PGRST003"]);
const GRACE_MS = 30_000;
const LOCAL_PREFIX = "local-";
const STORE_PREFIX = "jz:exam-local:";

// ── errors ──────────────────────────────────────────────────────────────────
function dataError(code, details = null, cause = undefined) {
  const e = new Error(code);
  e.name = "DataError";
  e.code = code;
  e.details = details;
  if (cause !== undefined) e.cause = cause;
  return e;
}
export const isDataError = (e) => e?.name === "DataError";

function parseDetails(d) {
  if (!d || typeof d !== "string") return null;
  try {
    const v = JSON.parse(d);
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}
const isMissing = (err) => Boolean(err) && (MISSING.has(err.code) || /could not find the function|schema cache/i.test(err.message || ""));
const isNetwork = (err) => Boolean(err) && !err.code && /fetch|network|load failed/i.test(`${err.message || ""} ${err.details || ""}`);
const isDown = (err) => DB_DOWN.has(err?.code) || isNetwork(err);

/** Map a PostgREST/Postgres error to a DataError with a stable code. */
export function toExamError(err) {
  if (!err) return dataError("unknown");
  if (isDataError(err)) return err;
  if (SERVER_CODES.has(err.message)) return dataError(err.message, parseDetails(err.details), err);
  if (isMissing(err) || DB_DOWN.has(err.code)) return dataError("unavailable", null, err);
  if (err.code === "42501") return dataError("forbidden", null, err);
  if (err.code === "PGRST301" || err.code === "PGRST302") return dataError("not_authenticated", null, err);
  if (isNetwork(err)) return dataError("network", null, err);
  return dataError("unknown", null, err);
}

// ── context ─────────────────────────────────────────────────────────────────
async function dbContext() {
  let supabase = null;
  try {
    supabase = await getSupabase();
  } catch {
    supabase = null;
  }
  if (!supabase) return { supabase: null, signedIn: false };
  try {
    const { data } = await supabase.auth.getSession();
    return { supabase, signedIn: Boolean(data?.session) };
  } catch {
    return { supabase, signedIn: false };
  }
}

// ── local practice mode ─────────────────────────────────────────────────────
const memory = new Map();
export const isLocalAttemptId = (id) => typeof id === "string" && id.startsWith(LOCAL_PREFIX);

function storeLocal(att) {
  memory.set(att.id, att);
  try {
    sessionStorage.setItem(STORE_PREFIX + att.id, JSON.stringify(att));
  } catch {
    /* private mode / quota — memory copy still works for this page */
  }
}
function loadLocal(id) {
  if (memory.has(id)) return memory.get(id);
  try {
    const raw = sessionStorage.getItem(STORE_PREFIX + id);
    if (raw) {
      const att = JSON.parse(raw);
      memory.set(id, att);
      return att;
    }
  } catch {
    /* ignore */
  }
  return null;
}

// 409 from /start: the database answers again → the caller retries in DB mode.
const HTTP_CODES = { 400: "invalid_argument", 401: "not_authenticated", 403: "forbidden", 409: "unavailable", 413: "invalid_argument",
  422: "not_enough_questions", 429: "rate_limited", 503: "unavailable" };
// /grade: a set older than a day after its deadline → closed; a missing / forged set → invalid.
const BODY_CODES = { unknown_key: "invalid_argument", invalid_token: "invalid_argument", expired: "attempt_closed" };

async function postLocal(path, body) {
  let res;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (e) {
    throw dataError("network", null, e);
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok) {
    const code = BODY_CODES[json?.error] || HTTP_CODES[res.status] || "unknown";
    throw dataError(code, json && json.field ? { field: json.field } : null);
  }
  return json;
}

function newLocalId() {
  const uuid = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return LOCAL_PREFIX + uuid;
}

function localAttemptSummary(att) {
  const r = att.result?.attempt;
  return {
    id: att.id,
    exam: att.exam,
    section: att.section,
    topic: att.topic ?? null,
    difficulty: att.difficulty,
    status: att.status,
    question_count: att.questions.length,
    time_limit_seconds: att.time_limit_seconds,
    started_at: att.started_at,
    expires_at: att.expires_at,
    submitted_at: r?.submitted_at ?? null,
    correct_count: r?.correct_count ?? null,
    total: r?.total ?? null,
    score_percent: r?.score_percent ?? null,
    duration_seconds: r?.duration_seconds ?? null,
    answered_count: Object.values(att.answers).filter((a) => a.selected_index !== null).length,
    xp_awarded: 0,
  };
}

async function startLocal({ exam, section, topic, difficulty, count, timeLimitSeconds }) {
  const res = await postLocal("/api/exams/local/start", {
    exam,
    section: section ?? null,
    ...(topic !== null && topic !== undefined ? { topic } : {}),
    difficulty: difficulty ?? null,
    count,
    ...(timeLimitSeconds ? { time_limit_seconds: timeLimitSeconds } : {}),
  });
  const att = {
    id: newLocalId(),
    exam: res.exam,
    section: res.section,
    topic: res.topic ?? null,
    difficulty: res.difficulty,
    status: "in_progress",
    started_at: res.started_at,
    expires_at: res.expires_at,
    time_limit_seconds: res.time_limit_seconds,
    questions: res.questions,
    answers: {},
    result: null,
    // the signed question set: /grade only grades what /start handed out
    token: typeof res.token === "string" ? res.token : null,
    // server clock − device clock: every deadline below is judged in server
    // time (DATA_API.md: trust expires_at vs server_now, not the device clock)
    offset: clockOffset(res.started_at),
  };
  storeLocal(att);
  return {
    mode: "local",
    attempt_id: att.id,
    status: "in_progress",
    exam: res.exam,
    section: res.section,
    topic: res.topic ?? null,
    difficulty: res.difficulty,
    question_count: res.question_count,
    requested_count: res.requested_count,
    limited: Boolean(res.limited),
    max_questions: res.max_questions,
    started_at: res.started_at,
    expires_at: res.expires_at,
    time_limit_seconds: res.time_limit_seconds,
    server_now: res.started_at,
    questions: res.questions,
  };
}

function clockOffset(serverIso) {
  const t = Date.parse(serverIso);
  return Number.isFinite(t) ? t - Date.now() : 0;
}
/** "Now" for a local attempt, in the server's clock (a skewed device clock never closes or stretches it). */
export const localNow = (att) => Date.now() + (Number.isFinite(att?.offset) ? att.offset : 0);
const secondsLeft = (att) => Math.max(0, Math.ceil((new Date(att.expires_at).getTime() - localNow(att)) / 1000));
const isPastGrace = (att) => localNow(att) > new Date(att.expires_at).getTime() + GRACE_MS;

function applyLocalAnswer(att, position, sel, timeSpent, flagged, { keepSelection = false } = {}) {
  const q = att.questions.find((x) => x.position === position);
  if (!q) throw dataError("invalid_argument", { field: "position" });
  if (sel !== null && sel !== undefined && (!Number.isInteger(sel) || sel < 0 || sel >= q.choices.length)) {
    throw dataError("invalid_argument", { field: "selected" });
  }
  if (timeSpent !== null && timeSpent !== undefined && (!Number.isInteger(timeSpent) || timeSpent < 0 || timeSpent > 14400)) {
    throw dataError("invalid_argument", { field: "time_spent" });
  }
  const prev = att.answers[position] || { selected_index: null, flagged: false, time_spent_seconds: 0 };
  att.answers[position] = {
    selected_index: keepSelection ? prev.selected_index : sel ?? null,
    flagged: typeof flagged === "boolean" ? flagged : prev.flagged,
    time_spent_seconds: Math.max(prev.time_spent_seconds, Math.min(timeSpent ?? 0, att.time_limit_seconds)),
  };
  return att.answers[position];
}

async function submitLocal(att, answers) {
  if (att.result) return att.result;
  const late = isPastGrace(att);
  if (Array.isArray(answers) && !late) {
    for (const a of answers) {
      const has = Object.prototype.hasOwnProperty.call(a, "selected_index");
      applyLocalAnswer(att, a.position, has ? a.selected_index : null, a.time_spent_seconds, a.flagged, { keepSelection: !has });
    }
  }
  const graded = await postLocal("/api/exams/local/grade", {
    answers: att.questions.map((q) => ({ key: q.key, selected_index: att.answers[q.position]?.selected_index ?? null })),
    ...(att.token ? { token: att.token } : {}),
  });
  const now = new Date(localNow(att));
  const items = graded.items.map((it, i) => {
    const q = att.questions[i];
    const a = att.answers[q.position] || { flagged: false, time_spent_seconds: 0 };
    return { ...it, position: q.position, question_id: q.id, time_spent_seconds: a.time_spent_seconds, flagged: a.flagged };
  });
  const status = late ? "expired" : "submitted";
  const elapsed = Math.round((now.getTime() - new Date(att.started_at).getTime()) / 1000);
  att.status = status;
  att.result = {
    mode: "local",
    status,
    attempt: {
      ...localAttemptSummary(att),
      status,
      submitted_at: now.toISOString(),
      correct_count: graded.summary.correct,
      total: graded.summary.total,
      score_percent: graded.summary.score_percent,
      duration_seconds: late ? att.time_limit_seconds : Math.min(Math.max(elapsed, 0), att.time_limit_seconds),
      answered_count: graded.summary.answered,
      xp_awarded: 0,
    },
    items,
    by_topic: graded.by_topic,
  };
  storeLocal(att);
  return att.result;
}

// ── public API ──────────────────────────────────────────────────────────────

/**
 * Start an attempt.
 * @param {{ exam: "aptitude"|"achievement", section?: string|null, topic?: string|null,
 *           difficulty?: 1|2|3|null, count?: number, timeLimitSeconds?: number|null }} config
 *   topic: a topic slug of the section (catalog SECTIONS[section].topics). Without a
 *   section the database / local API infer the one section of the exam that has it;
 *   an unknown topic → DataError invalid_argument { field: "topic" }.
 * @returns {Promise<object>} { mode, attempt_id, status, exam, section, topic, difficulty,
 *   question_count, requested_count, started_at, expires_at, time_limit_seconds, server_now, questions[] }
 *
 * Template sessions: { template, scope, count?, timing?, feedback?, retakeOf? } (see
 * startTemplateExam) → { mode: "db" | "guest", attempt_id, template, scope, mini, reused, … }.
 */
export async function startExam(config = {}) {
  if (config?.template) return startTemplateExam(config);
  const { exam, section = null, topic = null, difficulty = null, count = 10, timeLimitSeconds = null } = config ?? {};
  const { supabase, signedIn } = await dbContext();
  if (supabase && signedIn) {
    const args = {
      p_exam: exam,
      p_section: section,
      p_difficulty: difficulty,
      p_count: count,
      p_time_limit_seconds: timeLimitSeconds,
    };
    // Sent only when set, so an unfiltered start also works against a
    // database that predates 0012 (no p_topic parameter yet).
    if (topic !== null && topic !== undefined) args.p_topic = topic;
    const { data, error } = await supabase.rpc("start_exam_attempt", args);
    if (!error) return { topic: null, ...data, mode: "db", limited: false };
    if (!isMissing(error) && !isDown(error)) throw toExamError(error);
    // RPCs not deployed / database unreachable → honest local practice
  }
  return startLocal({ exam, section, topic, difficulty, count, timeLimitSeconds });
}

/**
 * Template session (docs/CONTENT_ENGINE.md §5.7): start_template_attempt when
 * signed in with a working database; guests — or a database without 0014 /
 * unreachable — get a guest session (nothing saved). A guest retake needs a
 * guest session id; a database retake a database attempt id.
 */
async function startTemplateExam({ template, scope, count = null, timing = null, feedback = null, retakeOf = null }) {
  const { supabase, signedIn } = await dbContext();
  const guestRetake = retakeOf && isGuestAttemptId(retakeOf);
  if (supabase && signedIn && !guestRetake) {
    const { data, error } = await supabase.rpc("start_template_attempt", {
      p_template: template,
      p_scope: scope,
      p_count: count ?? null,
      p_timing: timing ?? null,
      p_feedback: feedback ?? null,
      p_retake_of: retakeOf ?? null,
    });
    if (!error) return { ...data, mode: "db" };
    if (!isMissing(error) && !isDown(error)) throw toExamError(error);
    if (retakeOf) throw dataError("unavailable"); // a saved attempt cannot be retaken without the database
  }
  return startGuestSession({ template, scope, count, timing, feedback, retakeOf: guestRetake ? retakeOf : null });
}

/**
 * Save one answer while the attempt is running.
 * @param {string} attemptId
 * @param {number} position        1-based
 * @param {number|null} selectedIndex  null clears the answer
 * @param {{ timeSpentSeconds?: number, flagged?: boolean|null }} [opts]  timeSpentSeconds is cumulative for that question
 */
export async function saveAnswer(attemptId, position, selectedIndex, { timeSpentSeconds = 0, flagged = null } = {}) {
  if (isGuestAttemptId(attemptId)) return saveGuestResponse(attemptId, position, selectedIndex, { timeSpentSeconds, flagged });
  if (isLocalAttemptId(attemptId)) {
    const att = loadLocal(attemptId);
    if (!att) throw dataError("attempt_not_found");
    if (att.status !== "in_progress" || isPastGrace(att)) throw dataError("attempt_closed", { status: att.status });
    const a = applyLocalAnswer(att, position, selectedIndex, timeSpentSeconds, flagged);
    storeLocal(att);
    return { mode: "local", attempt_id: attemptId, position, ...a, saved_at: new Date(localNow(att)).toISOString(), seconds_remaining: secondsLeft(att) };
  }
  const { supabase } = await dbContext();
  if (!supabase) throw dataError("unavailable");
  if (selectedIndex !== null && typeof selectedIndex === "object") {
    // a typed response (matching, ordering, short answer, numeric, or {option_index})
    const { data, error } = await supabase.rpc("save_exam_response", {
      p_attempt: attemptId,
      p_position: position,
      p_response: selectedIndex,
      p_time_spent: timeSpentSeconds,
      p_flagged: flagged,
    });
    if (error) throw toExamError(error);
    return { ...data, mode: "db" };
  }
  const { data, error } = await supabase.rpc("save_exam_answer", {
    p_attempt: attemptId,
    p_position: position,
    p_selected: selectedIndex,
    p_time_spent: timeSpentSeconds,
    p_flagged: flagged,
  });
  if (error) throw toExamError(error);
  return { ...data, mode: "db" };
}

/**
 * Submit (grade) an attempt. Idempotent: calling again returns the stored result.
 * @param {string} attemptId
 * @param {Array<{ position: number, selected_index?: number|null, time_spent_seconds?: number, flagged?: boolean }>|null} [answers]
 *        optional bulk save applied first (a missing selected_index keeps the saved answer)
 * @returns {Promise<object>} { mode, status, attempt, items[], by_topic[] }
 */
export async function submitExam(attemptId, answers = null) {
  if (isGuestAttemptId(attemptId)) return submitGuestSession(attemptId, answers);
  if (isLocalAttemptId(attemptId)) {
    const att = loadLocal(attemptId);
    if (!att) throw dataError("attempt_not_found");
    return submitLocal(att, answers);
  }
  const { supabase } = await dbContext();
  if (!supabase) throw dataError("unavailable");
  const { data, error } = await supabase.rpc("submit_exam_attempt", { p_attempt: attemptId, p_answers: answers });
  if (error) throw toExamError(error);
  return { ...data, mode: "db" };
}

/**
 * Resume or review an attempt.
 * in_progress → { mode, status, attempt, questions[], answers[], seconds_remaining, server_now }
 * submitted/expired → same payload as submitExam()
 */
export async function getAttempt(attemptId) {
  if (isGuestAttemptId(attemptId)) return getGuestSession(attemptId);
  if (isLocalAttemptId(attemptId)) {
    const att = loadLocal(attemptId);
    if (!att) throw dataError("attempt_not_found");
    if (att.result) return att.result;
    if (isPastGrace(att)) return submitLocal(att, null);
    return {
      mode: "local",
      status: "in_progress",
      attempt: localAttemptSummary(att),
      questions: att.questions,
      answers: att.questions.map((q) => ({
        position: q.position,
        selected_index: att.answers[q.position]?.selected_index ?? null,
        flagged: att.answers[q.position]?.flagged ?? false,
        time_spent_seconds: att.answers[q.position]?.time_spent_seconds ?? 0,
      })),
      seconds_remaining: secondsLeft(att),
      server_now: new Date(localNow(att)).toISOString(),
    };
  }
  const { supabase } = await dbContext();
  if (!supabase) throw dataError("unavailable");
  const { data, error } = await supabase.rpc("get_exam_attempt", { p_attempt: attemptId });
  if (error) throw toExamError(error);
  return { ...data, mode: "db" };
}

/**
 * Own attempt history, newest first. Pass the previous page's `nextCursor`.
 * @param {{ before?: string|null, beforeId?: string|null, limit?: number }} [opts]
 * @returns {Promise<{ mode: "db"|"local", items: object[], nextCursor: { before: string, beforeId: string }|null }>}
 *          (local mode: always empty — nothing is saved)
 */
export async function listAttempts({ before = null, beforeId = null, limit = 20 } = {}) {
  const { supabase, signedIn } = await dbContext();
  if (!supabase || !signedIn) return { mode: "local", items: [], nextCursor: null };
  const { data, error } = await supabase.rpc("list_exam_attempts", { p_limit: limit, p_before: before, p_before_id: beforeId });
  if (error) {
    if (isMissing(error)) return { mode: "local", items: [], nextCursor: null };
    throw toExamError(error);
  }
  const items = Array.isArray(data) ? data : [];
  const last = items[items.length - 1];
  return { mode: "db", items, nextCursor: items.length === limit && last ? { before: last.started_at, beforeId: last.id } : null };
}

/**
 * Own analytics (see DATA_API.md). Local mode → { mode: "local" } (no stats are kept).
 * Non-premium members get the basic block; the advanced keys (by_topic,
 * best_topics, weakest_topics) come back empty and are listed in `locked`
 * (always an array: [] for premium members and for pre-0012 databases).
 */
export async function getExamStats() {
  const { supabase, signedIn } = await dbContext();
  if (!supabase || !signedIn) return { mode: "local" };
  const { data, error } = await supabase.rpc("get_exam_stats");
  if (error) {
    if (isMissing(error)) return { mode: "local" };
    throw toExamError(error);
  }
  return { ...data, locked: Array.isArray(data?.locked) ? data.locked : [], mode: "db" };
}

/** Public question-bank counts (works signed out). Unavailable → { mode: "local", available: false }. */
export async function getBankStats() {
  const { supabase } = await dbContext();
  if (!supabase) return { mode: "local", available: false };
  const { data, error } = await supabase.rpc("get_question_bank_stats");
  if (error) {
    if (isMissing(error) || isDown(error)) return { mode: "local", available: false };
    throw toExamError(error);
  }
  return { ...data, mode: "db", available: true };
}
