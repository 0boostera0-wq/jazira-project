// ============================================================================
// Exam runner — pure logic: payload → session, answer reducer, summaries,
// submit payload, keyboard mapping, timer tone, offline drafts.
// Unit-tested in tests/unit/exams-ui.test.js.
//
// Positions are 1-based; choice indexes are 0-based (docs/DATA_API.md).
// ============================================================================

import { getTemplate } from "@/lib/exams/engine/exam-templates";
import { isAnswered, isChoiceType, isTemplateItem, normalizeResponse, responseIssue, responseOf, typeOf } from "./question-logic";

const toMs = (iso) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

/**
 * Normalise a start payload (startExam) or an in-progress resume payload
 * (getAttempt) into the runner session. The deadline is computed against the
 * SERVER clock (expires_at − server_now, or seconds_remaining) and then
 * anchored to this device's clock, so a wrong device clock can't shorten or
 * extend the exam.
 */
export function toRunnerSession(payload, { now = Date.now() } = {}) {
  if (!payload || !Array.isArray(payload.questions) || payload.questions.length === 0) return null;
  const a = payload.attempt || {};
  const id = payload.attempt_id || a.id;
  if (!id) return null;
  const timeLimitSeconds = payload.time_limit_seconds ?? a.time_limit_seconds ?? null;

  let remainingMs;
  if (Number.isFinite(payload.seconds_remaining)) {
    remainingMs = payload.seconds_remaining * 1000;
  } else {
    const exp = toMs(payload.expires_at ?? a.expires_at);
    const srv = toMs(payload.server_now) ?? toMs(payload.started_at ?? a.started_at);
    remainingMs = exp !== null && srv !== null ? exp - srv : (timeLimitSeconds || 0) * 1000;
  }
  remainingMs = Math.max(0, remainingMs);

  const questions = [...payload.questions].sort((x, y) => x.position - y.position);
  const byPos = new Map(questions.map((q) => [q.position, q]));
  const answers = {};
  const spent = {};
  for (const q of questions) answers[q.position] = isTemplateItem(q) ? { selected: null, response: null, flagged: false } : { selected: null, flagged: false };
  for (const r of Array.isArray(payload.answers) ? payload.answers : []) {
    const q = byPos.get(r.position);
    if (!q) continue;
    if (isTemplateItem(q)) {
      // template sessions (§5.7): display responses; a checked item is locked
      const type = typeOf(q);
      const response = normalizeResponse(type, r.response ?? (Number.isInteger(r.selected_index) ? { option_index: r.selected_index } : null));
      const check = r.check && typeof r.check === "object" ? r.check : null;
      answers[r.position] = {
        selected: isChoiceType(type) ? response?.option_index ?? null : null,
        response: isChoiceType(type) ? null : response,
        flagged: Boolean(r.flagged),
        ...(r.locked || check ? { locked: true, check } : {}),
      };
    } else {
      answers[r.position] = {
        selected: Number.isInteger(r.selected_index) ? r.selected_index : null,
        flagged: Boolean(r.flagged),
      };
    }
    spent[r.position] = Math.max(0, Number(r.time_spent_seconds) || 0);
  }
  const firstOpen = questions.find((q) => !isAnswered(q, answers[q.position]));
  const tpl = templateRefOf(payload);
  const timingMode = payload.timing_mode ?? a.timing_mode ?? tpl?.timing_mode ?? null;

  return {
    id,
    mode: MODES.includes(payload.mode) ? payload.mode : "local",
    exam: payload.exam ?? a.exam,
    section: payload.section ?? a.section ?? null,
    topic: payload.topic ?? a.topic ?? null,
    difficulty: payload.difficulty ?? a.difficulty ?? null,
    timeLimitSeconds: timeLimitSeconds || Math.round(remainingMs / 1000),
    limited: Boolean(payload.limited),
    requested: payload.requested_count ?? null,
    // the caller's per-test cap (template sessions); `limited` alone also covers a short pool
    maxQuestions: Number.isInteger(payload.max_questions) ? payload.max_questions : null,
    // template sessions (null for the legacy aptitude / achievement builder)
    template: tpl ? { id: tpl.id, version: tpl.version, kind: tpl.kind } : null,
    scope: payload.scope ?? a.scope ?? null,
    feedbackMode: (payload.feedback_mode ?? a.feedback_mode ?? tpl?.feedback_mode) === "immediate" ? "immediate" : "end",
    timed: timingMode !== "untimed",
    mini: Boolean(payload.mini ?? a.mini),
    reused: Boolean(payload.reused),
    short: Boolean(payload.short),
    questions,
    answers,
    spent,
    current: (firstOpen || questions[0]).position,
    deadline: now + remainingMs,
  };
}

const MODES = ["db", "local", "guest"];

/**
 * The template of a session / result payload: `template` is { id, version,
 * kind } (start, guest results) or the attempt carries `template_id`
 * (get_exam_attempt, submit_exam_attempt, list_exam_attempts_v2). null for
 * legacy attempts. Missing timing / feedback modes fall back to the
 * template's defaults (src/lib/exams/engine/exam-templates.js).
 */
export function templateRefOf(payload) {
  const a = payload?.attempt || {};
  const raw = payload?.template ?? a.template ?? null;
  const id = (raw && typeof raw === "object" ? raw.id : raw) ?? a.template_id ?? payload?.template_id ?? null;
  if (typeof id !== "string" || !id) return null;
  const version = (raw && typeof raw === "object" ? raw.version : null) ?? a.template_version ?? payload?.template_version ?? null;
  const def = getTemplate(id, Number.isInteger(version) ? version : null) || getTemplate(id);
  return {
    id,
    version: Number.isInteger(version) ? version : def?.version ?? null,
    kind: (raw && typeof raw === "object" ? raw.kind : null) ?? def?.kind ?? null,
    timing_mode: def?.timing?.mode ?? null,
    feedback_mode: def?.feedback?.default ?? null,
  };
}

/**
 * Answer state reducer.
 * state = { answers: { [pos]: { selected, flagged, response?, locked?, check? } }, current, positions: number[] }
 *   select  { position, index }      mcq / true_false (display index)
 *   respond { position, response }   matching / ordering / short answer / numeric (display response, null = empty)
 *   clear   { position }
 *   lock    { position, check }      immediate feedback: the item is graded and final
 * A locked item ignores select / respond / clear (flags still toggle).
 */
export function runnerReducer(state, action) {
  const { answers, positions } = state;
  switch (action.type) {
    case "select": {
      const prev = answers[action.position];
      if (!prev || prev.locked || prev.selected === action.index) return state;
      return { ...state, answers: { ...answers, [action.position]: { ...prev, selected: action.index } } };
    }
    case "respond": {
      const prev = answers[action.position];
      const response = action.response ?? null;
      if (!prev || prev.locked || JSON.stringify(prev.response ?? null) === JSON.stringify(response)) return state;
      return { ...state, answers: { ...answers, [action.position]: { ...prev, response } } };
    }
    case "clear": {
      const prev = answers[action.position];
      if (!prev || prev.locked || (prev.selected === null && (prev.response ?? null) === null)) return state;
      const next = { ...prev, selected: null };
      if ("response" in prev) next.response = null;
      return { ...state, answers: { ...answers, [action.position]: next } };
    }
    case "lock": {
      const prev = answers[action.position];
      if (!prev || (prev.locked && prev.check && !action.check)) return state;
      return { ...state, answers: { ...answers, [action.position]: { ...prev, locked: true, check: action.check ?? prev.check ?? null } } };
    }
    case "flag": {
      const prev = answers[action.position];
      if (!prev) return state;
      const flagged = typeof action.value === "boolean" ? action.value : !prev.flagged;
      if (flagged === prev.flagged) return state;
      return { ...state, answers: { ...answers, [action.position]: { ...prev, flagged } } };
    }
    case "goto":
      return positions.includes(action.position) && action.position !== state.current ? { ...state, current: action.position } : state;
    case "next": {
      const i = positions.indexOf(state.current);
      return i >= 0 && i < positions.length - 1 ? { ...state, current: positions[i + 1] } : state;
    }
    case "prev": {
      const i = positions.indexOf(state.current);
      return i > 0 ? { ...state, current: positions[i - 1] } : state;
    }
    default:
      return state;
  }
}

/**
 * Counts for the header, navigator and the submit dialog. With `questions`
 * (keyed by position) it also counts typed answers the server cannot read
 * (question-logic.responseIssue) — they are submitted as unanswered.
 */
export function summarize(answers, positions, questions = null) {
  let answered = 0;
  let flagged = 0;
  let invalid = 0;
  let firstUnanswered = null;
  let firstFlagged = null;
  let firstInvalid = null;
  for (const p of positions) {
    const a = answers[p];
    if ((a?.selected !== null && a?.selected !== undefined) || (a?.response !== null && a?.response !== undefined)) answered += 1;
    else if (firstUnanswered === null) firstUnanswered = p;
    if (a?.flagged) {
      flagged += 1;
      if (firstFlagged === null) firstFlagged = p;
    }
    const q = questions?.[p];
    if (q && !a?.locked && isTemplateItem(q) && responseIssue(q, responseOf(q, a))) {
      invalid += 1;
      if (firstInvalid === null) firstInvalid = p;
    }
  }
  return { total: positions.length, answered, unanswered: positions.length - answered, flagged, firstUnanswered, firstFlagged, invalid, firstInvalid };
}

/**
 * Bulk answers for submitExam(): every position, so nothing unsaved is lost.
 * Template sessions (pass `questions`, keyed by position) send display
 * responses (`response`); legacy sessions keep `selected_index`.
 * A typed answer the server cannot read (e.g. the number "0,125") is sent as
 * no answer: the database refuses the WHOLE submit on one invalid response
 * (invalid_response), which would block a manual submit and the auto-submit
 * at 0:00 until the grace period ends.
 */
export function answersPayload(positions, answers, spent = {}, questions = null) {
  return positions.map((p) => {
    const q = questions?.[p];
    const base = { position: p };
    if (q && isTemplateItem(q)) {
      const response = responseOf(q, answers[p]);
      base.response = response && responseIssue(q, response) ? null : response;
    } else base.selected_index = answers[p]?.selected ?? null;
    return { ...base, time_spent_seconds: Math.max(0, Math.round(spent[p] || 0)), flagged: Boolean(answers[p]?.flagged) };
  });
}

/**
 * Keyboard shortcut → action. Uses `code` so Arabic keyboard layouts work
 * (the F key types "ب" there; the digit row may type Arabic-Indic digits).
 *   1–6 choose · ←/→ previous/next in reading direction · F flag
 */
export function keyAction({ key, code, altKey, ctrlKey, metaKey, shiftKey } = {}, { rtl = false, choices = 4 } = {}) {
  if (altKey || ctrlKey || metaKey) return null;
  const digit = /^(?:Digit|Numpad)([1-9])$/.exec(code || "")?.[1] ?? (/^[1-9]$/.test(key || "") ? key : null);
  if (digit && !shiftKey) {
    const index = Number(digit) - 1;
    return index < choices ? { type: "choose", index } : null;
  }
  if (code === "KeyF" || key === "f" || key === "F") return { type: "flag" };
  if (key === "ArrowLeft") return { type: rtl ? "next" : "prev" };
  if (key === "ArrowRight") return { type: rtl ? "prev" : "next" };
  return null;
}

/**
 * Countdown colour: amber in the last stretch (20% of the limit, at least 2
 * minutes, at most 10), red in the final minute.
 */
export function timerTone(remainingSeconds, limitSeconds) {
  if (remainingSeconds <= 60) return "danger";
  const warnAt = Math.min(600, Math.max(120, Math.round((limitSeconds || 0) * 0.2)));
  return remainingSeconds <= warnAt ? "warning" : "normal";
}

/** Announcement thresholds for screen readers (seconds remaining). */
export const TIMER_ANNOUNCEMENTS = [600, 300, 60];

/**
 * Apply offline drafts (unsaved answers kept on the device) on top of the
 * server answers. Returns { answers, spent, dirty: positions to re-save }.
 */
export function mergeDrafts(answers, spent, draft) {
  const out = { ...answers };
  const outSpent = { ...spent };
  const dirty = [];
  if (!draft || typeof draft !== "object") return { answers: out, spent: outSpent, dirty };
  for (const [k, v] of Object.entries(draft)) {
    const p = Number(k);
    if (!out[p] || !v || typeof v !== "object") continue;
    if (out[p].locked) {
      // checked on the server: the answer is final, only the flag may differ
      if (typeof v.flagged === "boolean" && v.flagged !== out[p].flagged) {
        out[p] = { ...out[p], flagged: v.flagged };
        dirty.push(p);
      }
      continue;
    }
    const next = {
      selected: Number.isInteger(v.selected) ? v.selected : v.selected === null ? null : out[p].selected,
      flagged: typeof v.flagged === "boolean" ? v.flagged : out[p].flagged,
    };
    if ("response" in out[p]) next.response = v.response !== undefined && (v.response === null || typeof v.response === "object") ? v.response : out[p].response;
    out[p] = next;
    if (Number.isFinite(v.spent)) outSpent[p] = Math.max(outSpent[p] || 0, v.spent);
    dirty.push(p);
  }
  return { answers: out, spent: outSpent, dirty };
}

/** Should the choices sit in two columns? (short options only) */
export const twoColumnChoices = (choices) => Array.isArray(choices) && choices.length % 2 === 0 && choices.every((c) => String(c).length <= 26);

// Letters of any script (Latin, Greek, Hebrew/Arabic blocks incl. Arabic
// punctuation) and an "a : b" ratio.
const STRONG_TEXT = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0590-\u08FF\uFB50-\uFDFF\uFE70-\uFEFC]/;
const RATIO = /\d\s*:\s*\d/;

/**
 * Base direction for one answer option inside the (RTL) Arabic choice list.
 * Options made only of digits and math symbols ("−1", "−4/5", "{5, −2}",
 * "√2/2", "30°") have no strong character, so `dir="auto"` would fall back to
 * RTL and print "1−" / "5/4−". They read as left-to-right math. Ratios
 * ("2 : 5") stay with the text direction so they match how the Arabic stem
 * shows them; anything with letters keeps "auto".
 */
export function choiceDir(choice) {
  const s = String(choice ?? "");
  return STRONG_TEXT.test(s) || RATIO.test(s) ? "auto" : "ltr";
}

// Math that only reads correctly left-to-right: sets, roots, degrees and
// negative numbers ("{5, −2}", "√3", "30°", "−7").
const LTR_MATH = /[{}√°]|(?:^|[\s({[,=])[−-]\d/;

/**
 * Split Arabic question text into segments, marking embedded math as `ltr`:
 * Latin-script runs (variables, formulas: "|2x − 3| = 7", "2n = 24",
 * "(i² = −1)", "H₂O") and the notation in LTR_MATH. Rendered inside an RTL
 * paragraph without isolation, the bidi algorithm moves their neutral
 * characters ("|", "(", "−") to the wrong side. Plain digit arithmetic and
 * ratios ("23 − 6 = 17", "48 ÷ 4", "2 : 3") read correctly right-to-left and
 * are left as authored. Surrounding spaces, a leading "=" and sentence
 * punctuation stay outside the LTR run.
 * @returns {{ text: string, ltr: boolean }[]}
 */
export function ltrRuns(text) {
  const s = String(text ?? "");
  const out = [];
  const push = (t, ltr) => {
    if (!t) return;
    const last = out[out.length - 1];
    if (last && last.ltr === ltr && !ltr) last.text += t;
    else out.push({ text: t, ltr });
  };
  // maximal runs without Arabic-block characters or line breaks
  const re = /[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFC\n]+/g;
  let at = 0;
  for (const m of s.matchAll(re)) {
    push(s.slice(at, m.index), false);
    const run = m[0];
    const core = /^([\s.,;:!?=]*)(.*?)([\s.,;:!?]*)$/s.exec(run);
    const body = core ? core[2] : "";
    const isMath = /[A-Za-z]/.test(body) || (/\d/.test(body) && LTR_MATH.test(body) && !RATIO.test(body));
    if (isMath) {
      push(core[1], false);
      push(core[2], true);
      push(core[3], false);
    } else {
      push(run, false);
    }
    at = m.index + run.length;
  }
  push(s.slice(at), false);
  return out;
}
