// ============================================================================
// Template exam sessions — client data layer for guest sessions
// (docs/CONTENT_ENGINE.md §5.7, §5.8) and the immediate check.
//
// GUEST mode: /api/exams/session/{start,check,submit}. The server hands out a
// signed token (no answers inside); drafts, check receipts and the token are
// kept in this browser — sessionStorage, plus a localStorage draft keyed by
// the session id so the same browser can resume until the deadline. Results
// are graded on the server and never saved (the UI says so).
// src/lib/data/exams.js dispatches here for ids `g-…` (mode "guest").
//
//   startGuestSession({ template, scope, count?, timing?, feedback?, retakeOf? })
//   getGuestSession(id) · saveGuestResponse(id, position, response, opts)
//   checkGuestItem(id, position) · submitGuestSession(id, answers?)
//   checkItem(attemptId, position)     guest → /check; DB → check_exam_item
//   seenBlob()                         this browser's sealed seen list (opaque, server-issued)
//
// The browser never holds a canonical question key: questions carry a
// per-session opaque handle in `key`, the token seals the keys, and the seen
// history is a sealed blob that /start issues and this layer echoes back.
//
// Responses are display indexes: mcq/true_false {option_index} (a bare number
// is accepted), matching {pairs:[[l,r]…]}, ordering {order:[i…]},
// short_answer {text}, numeric {value, unit?}.
// Errors: DataError (err.name === "DataError") with a code from EXAM_ERROR_CODES.
// ============================================================================
import { getSupabase } from "@/lib/supabase-lazy";

const SID_RE = /^g-[A-Za-z0-9_-]{22}$/;
const STORE_PREFIX = "jz:exam-guest:";
const SEEN_KEY = "jz:exam-seen-v2";
const LEGACY_SEEN_KEY = "jz:exam-seen"; // a plain key list from before the sealed format: dropped
const SEEN_MAX_BYTES = 12 * 1024;
const GRACE_MS = 30_000;
const KEEP_MS = 24 * 3600 * 1000;

export const isGuestAttemptId = (id) => typeof id === "string" && SID_RE.test(id);

function dataError(code, details = null, cause = undefined) {
  const e = new Error(code);
  e.name = "DataError";
  e.code = code;
  e.details = details;
  if (cause !== undefined) e.cause = cause;
  return e;
}

// ── storage ─────────────────────────────────────────────────────────────────
const memory = new Map();
function storage(kind) {
  try {
    return kind === "local" ? globalThis.localStorage ?? null : globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}
function store(att) {
  memory.set(att.id, att);
  const text = JSON.stringify(att);
  for (const s of [storage("session"), storage("local")]) {
    try {
      s?.setItem(STORE_PREFIX + att.id, text);
    } catch {
      /* quota / private mode — the memory copy still works for this page */
    }
  }
}
function load(id) {
  if (memory.has(id)) return memory.get(id);
  for (const s of [storage("session"), storage("local")]) {
    try {
      const raw = s?.getItem(STORE_PREFIX + id);
      if (raw) {
        const att = JSON.parse(raw);
        memory.set(id, att);
        return att;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}
/** Drop local drafts more than a day past their deadline. */
function prune(now = Date.now()) {
  const s = storage("local");
  if (!s) return;
  try {
    for (let i = s.length - 1; i >= 0; i--) {
      const k = s.key(i);
      if (!k || !k.startsWith(STORE_PREFIX)) continue;
      try {
        const att = JSON.parse(s.getItem(k));
        if (!att?.expires_at || Date.parse(att.expires_at) + KEEP_MS < now) s.removeItem(k);
      } catch {
        s.removeItem(k);
      }
    }
  } catch {
    /* ignore */
  }
}

/** This browser's sealed seen list (sent back as `seen`), or null. Opaque: only the server can open it. */
export function seenBlob() {
  try {
    const s = storage("local");
    s?.removeItem(LEGACY_SEEN_KEY);
    const blob = s?.getItem(SEEN_KEY) ?? null;
    return typeof blob === "string" && blob.startsWith("s1.") && blob.length <= SEEN_MAX_BYTES ? blob : null;
  } catch {
    return null;
  }
}
function keepSeen(blob) {
  if (typeof blob !== "string" || !blob.startsWith("s1.") || blob.length > SEEN_MAX_BYTES) return;
  try {
    storage("local")?.setItem(SEEN_KEY, blob);
  } catch {
    /* ignore */
  }
}

// ── transport ───────────────────────────────────────────────────────────────
const HTTP_CODES = { 400: "invalid_argument", 401: "not_authenticated", 403: "forbidden", 404: "scope_not_found", 409: "unavailable",
  410: "token_expired", 413: "invalid_argument", 422: "insufficient_pool", 429: "rate_limited", 503: "unavailable" };
const BODY_CODES = new Set(["template_not_found", "scope_not_found", "insufficient_pool", "feedback_not_allowed", "invalid_response", "item_locked",
  "scope_too_large", "seed_not_allowed", "not_found", "key_reveal_limit", "token_invalid", "token_expired", "bank_changed", "premium_required",
  "invalid_argument", "rate_limited", "forbidden", "unavailable", "use_database"]);

async function post(path, body) {
  let res;
  try {
    res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
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
    const raw = json?.error;
    const code = raw === "use_database" ? "unavailable" : BODY_CODES.has(raw) ? raw : HTTP_CODES[res.status] || "unknown";
    const details = Object.fromEntries(Object.entries(json ?? {}).filter(([k]) => k !== "error"));
    throw dataError(code, Object.keys(details).length ? details : null);
  }
  return json;
}

const clockOffset = (iso) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t - Date.now() : 0;
};
const nowOf = (att) => Date.now() + (Number.isFinite(att?.offset) ? att.offset : 0);
const secondsLeft = (att) => Math.max(0, Math.ceil((Date.parse(att.expires_at) - nowOf(att)) / 1000));
const pastGrace = (att) => nowOf(att) > Date.parse(att.expires_at) + GRACE_MS;

// ── sessions ────────────────────────────────────────────────────────────────
function summaryOf(att) {
  return {
    id: att.id,
    template: att.template,
    scope: att.scope,
    status: att.status,
    question_count: att.questions.length,
    time_limit_seconds: att.time_limit_seconds,
    timing_mode: att.timing_mode,
    feedback_mode: att.feedback_mode,
    started_at: att.started_at,
    expires_at: att.expires_at,
    mini: att.mini,
    limited: Boolean(att.limited),
    reused: Boolean(att.reused),
    short: Boolean(att.short),
    answered_count: Object.values(att.answers).filter((a) => a.response !== null).length,
    xp_awarded: 0,
  };
}

/**
 * Start a guest session.
 * @param {{ template: string, scope: string, count?: number|null, timing?: "timed"|"untimed"|null,
 *           feedback?: "end"|"immediate"|null, retakeOf?: string|null }} config
 *   retakeOf: the id of an earlier guest session in this browser (same template and scope).
 */
export async function startGuestSession({ template, scope, count = null, timing = null, feedback = null, retakeOf = null } = {}) {
  prune();
  let retakeToken = null;
  if (retakeOf) {
    const prev = isGuestAttemptId(retakeOf) ? load(retakeOf) : null;
    if (!prev?.token) throw dataError("not_found");
    retakeToken = prev.token;
  }
  const seen = seenBlob();
  const res = await post("/api/exams/session/start", {
    template,
    scope,
    ...(count !== null && count !== undefined ? { count } : {}),
    ...(timing ? { timing } : {}),
    ...(feedback ? { feedback } : {}),
    ...(seen ? { seen } : {}),
    ...(retakeToken ? { retake_of: retakeToken } : {}),
  });
  const att = {
    id: res.session_id,
    token: res.token,
    template: res.template,
    scope: res.scope,
    term_scope: res.term_scope ?? null,
    status: "in_progress",
    mini: Boolean(res.mini),
    // start notices, kept so a resumed session shows them again
    limited: Boolean(res.limited),
    reused: Boolean(res.reused),
    short: Boolean(res.short),
    timing_mode: res.timing_mode,
    feedback_mode: res.feedback_mode,
    started_at: res.started_at,
    expires_at: res.expires_at,
    time_limit_seconds: res.time_limit_seconds,
    retake_of: retakeOf,
    questions: res.questions,
    answers: {},
    checks: {},
    receipts: {},
    result: null,
    offset: clockOffset(res.server_now ?? res.started_at),
  };
  store(att);
  keepSeen(res.seen);
  return {
    mode: "guest",
    attempt_id: att.id,
    status: "in_progress",
    template: res.template,
    scope: res.scope,
    term_scope: att.term_scope,
    quota: res.quota,
    mini: att.mini,
    limited: att.limited,
    reused: att.reused,
    short: att.short,
    requested_count: res.requested_count,
    max_questions: res.max_questions,
    question_count: res.question_count,
    timing_mode: res.timing_mode,
    feedback_mode: res.feedback_mode,
    started_at: res.started_at,
    expires_at: res.expires_at,
    server_now: res.server_now ?? res.started_at,
    time_limit_seconds: res.time_limit_seconds,
    questions: res.questions,
  };
}

const toResponse = (value) => (typeof value === "number" ? { option_index: value } : value ?? null);
const sameResponse = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Save one response locally (a checked item is locked: item_locked). */
export function saveGuestResponse(id, position, response, { timeSpentSeconds = 0, flagged = null } = {}) {
  const att = load(id);
  if (!att) throw dataError("attempt_not_found");
  if (att.status !== "in_progress" || pastGrace(att)) throw dataError("attempt_closed", { status: att.status });
  if (!att.questions.some((q) => q.position === position)) throw dataError("invalid_argument", { field: "position" });
  if (!Number.isInteger(timeSpentSeconds) || timeSpentSeconds < 0) throw dataError("invalid_argument", { field: "time_spent" });
  const prev = att.answers[position] ?? { response: null, flagged: false, time_spent_seconds: 0 };
  const next = toResponse(response);
  if (att.receipts[position] && !sameResponse(next, prev.response)) throw dataError("item_locked", { position });
  att.answers[position] = {
    response: next,
    flagged: typeof flagged === "boolean" ? flagged : prev.flagged,
    time_spent_seconds: Math.max(prev.time_spent_seconds, Math.min(timeSpentSeconds, att.time_limit_seconds)),
  };
  store(att);
  return { mode: "guest", attempt_id: id, position, ...att.answers[position], saved_at: new Date(nowOf(att)).toISOString(), seconds_remaining: secondsLeft(att) };
}

/** Immediate check (templates with feedback "immediate"): grades and locks the item. */
export async function checkGuestItem(id, position) {
  const att = load(id);
  if (!att) throw dataError("attempt_not_found");
  if (att.status !== "in_progress" || pastGrace(att)) throw dataError("attempt_closed", { status: att.status });
  if (att.checks[position]) return att.checks[position];
  const response = att.answers[position]?.response ?? null;
  if (response === null) throw dataError("invalid_response", { position, reason: "empty" });
  const res = await post("/api/exams/session/check", { token: att.token, position, response });
  att.receipts[position] = res.receipt;
  const check = Object.fromEntries(Object.entries(res).filter(([k]) => k !== "receipt"));
  att.checks[position] = check;
  store(att);
  return check;
}

/** Submit (idempotent: the stored result comes back on a second call). */
export async function submitGuestSession(id, answers = null) {
  const att = load(id);
  if (!att) throw dataError("attempt_not_found");
  if (att.result) return att.result;
  if (Array.isArray(answers) && !pastGrace(att)) {
    for (const a of answers) {
      if (att.receipts[a.position]) continue; // locked by a check
      const own = (k) => Object.prototype.hasOwnProperty.call(a, k);
      const value = own("response") ? a.response : own("selected_index") ? a.selected_index : att.answers[a.position]?.response ?? null;
      saveGuestResponse(id, a.position, value, { timeSpentSeconds: a.time_spent_seconds ?? 0, flagged: a.flagged ?? null });
    }
  }
  if (att.feedback_mode === "immediate" && !pastGrace(att)) {
    // immediate sessions count a position only with its check receipt: check what is still unchecked
    for (const q of att.questions) {
      if (att.receipts[q.position] || (att.answers[q.position]?.response ?? null) === null) continue;
      try {
        await checkGuestItem(id, q.position);
      } catch {
        /* an invalid or late answer stays unchecked (graded unanswered) */
      }
    }
  }
  const result = await post("/api/exams/session/submit", {
    token: att.token,
    answers: att.questions.map((q) => {
      const a = att.answers[q.position] ?? { response: null, time_spent_seconds: 0, flagged: false };
      return { position: q.position, response: a.response, time_spent_seconds: a.time_spent_seconds, flagged: a.flagged };
    }),
    receipts: Object.values(att.receipts),
  });
  att.status = result.status;
  att.result = {
    ...result,
    attempt: {
      ...summaryOf(att),
      status: result.status,
      submitted_at: result.submitted_at,
      correct_count: result.correct_count,
      total: result.question_count,
      score_percent: result.score_percent,
      duration_seconds: result.duration_seconds,
    },
    items: result.items.map((it) => ({ ...it, time_spent_seconds: att.answers[it.position]?.time_spent_seconds ?? 0, flagged: att.answers[it.position]?.flagged ?? false })),
  };
  store(att);
  return att.result;
}

/** Resume or review: the in-progress payload, or the result (an overdue session is submitted first). */
export async function getGuestSession(id) {
  const att = load(id);
  if (!att) throw dataError("attempt_not_found");
  if (att.result) return att.result;
  if (pastGrace(att)) return submitGuestSession(id, null);
  return {
    mode: "guest",
    status: "in_progress",
    limited: Boolean(att.limited),
    reused: Boolean(att.reused),
    short: Boolean(att.short),
    attempt: summaryOf(att),
    questions: att.questions,
    answers: att.questions.map((q) => {
      const a = att.answers[q.position];
      return {
        position: q.position,
        response: a?.response ?? null,
        selected_index: a?.response?.option_index ?? null,
        flagged: a?.flagged ?? false,
        time_spent_seconds: a?.time_spent_seconds ?? 0,
        check: att.checks[q.position] ?? null,
      };
    }),
    seconds_remaining: secondsLeft(att),
    server_now: new Date(nowOf(att)).toISOString(),
  };
}

/**
 * Immediate check for any template attempt: guest ids → /check; database
 * attempts → check_exam_item (grades and locks one item).
 */
export async function checkItem(attemptId, position) {
  if (isGuestAttemptId(attemptId)) return checkGuestItem(attemptId, position);
  let supabase = null;
  try {
    supabase = await getSupabase();
  } catch {
    supabase = null;
  }
  if (!supabase) throw dataError("unavailable");
  const { data, error } = await supabase.rpc("check_exam_item", { p_attempt: attemptId, p_position: position });
  if (error) {
    let details = null;
    try {
      details = error.details ? JSON.parse(error.details) : null;
    } catch {
      details = null;
    }
    const missing = error.code === "PGRST202" || error.code === "42883";
    throw dataError(BODY_CODES.has(error.message) ? error.message : missing ? "unavailable" : "unknown", details, error);
  }
  return { ...data, mode: "db" };
}
