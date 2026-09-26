// ============================================================================
// Exam runner — pure logic: payload → session, answer reducer, summaries,
// submit payload, keyboard mapping, timer tone, offline drafts.
// Unit-tested in tests/unit/exams-ui.test.js.
//
// Positions are 1-based; choice indexes are 0-based (docs/DATA_API.md).
// ============================================================================

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
  const answers = {};
  const spent = {};
  for (const q of questions) answers[q.position] = { selected: null, flagged: false };
  for (const r of Array.isArray(payload.answers) ? payload.answers : []) {
    if (!answers[r.position]) continue;
    answers[r.position] = {
      selected: Number.isInteger(r.selected_index) ? r.selected_index : null,
      flagged: Boolean(r.flagged),
    };
    spent[r.position] = Math.max(0, Number(r.time_spent_seconds) || 0);
  }
  const firstOpen = questions.find((q) => answers[q.position].selected === null);

  return {
    id,
    mode: payload.mode === "db" ? "db" : "local",
    exam: payload.exam ?? a.exam,
    section: payload.section ?? a.section ?? null,
    difficulty: payload.difficulty ?? a.difficulty ?? null,
    timeLimitSeconds: timeLimitSeconds || Math.round(remainingMs / 1000),
    limited: Boolean(payload.limited),
    requested: payload.requested_count ?? null,
    questions,
    answers,
    spent,
    current: (firstOpen || questions[0]).position,
    deadline: now + remainingMs,
  };
}

/**
 * Answer state reducer. state = { answers: { [pos]: { selected, flagged } }, current, positions: number[] }
 */
export function runnerReducer(state, action) {
  const { answers, positions } = state;
  switch (action.type) {
    case "select": {
      const prev = answers[action.position];
      if (!prev || prev.selected === action.index) return state;
      return { ...state, answers: { ...answers, [action.position]: { ...prev, selected: action.index } } };
    }
    case "clear": {
      const prev = answers[action.position];
      if (!prev || prev.selected === null) return state;
      return { ...state, answers: { ...answers, [action.position]: { ...prev, selected: null } } };
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

/** Counts for the header, navigator and the submit dialog. */
export function summarize(answers, positions) {
  let answered = 0;
  let flagged = 0;
  let firstUnanswered = null;
  let firstFlagged = null;
  for (const p of positions) {
    const a = answers[p];
    if (a?.selected !== null && a?.selected !== undefined) answered += 1;
    else if (firstUnanswered === null) firstUnanswered = p;
    if (a?.flagged) {
      flagged += 1;
      if (firstFlagged === null) firstFlagged = p;
    }
  }
  return { total: positions.length, answered, unanswered: positions.length - answered, flagged, firstUnanswered, firstFlagged };
}

/** Bulk answers for submitExam(): every position, so nothing unsaved is lost. */
export function answersPayload(positions, answers, spent = {}) {
  return positions.map((p) => ({
    position: p,
    selected_index: answers[p]?.selected ?? null,
    time_spent_seconds: Math.max(0, Math.round(spent[p] || 0)),
    flagged: Boolean(answers[p]?.flagged),
  }));
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
    out[p] = {
      selected: Number.isInteger(v.selected) ? v.selected : v.selected === null ? null : out[p].selected,
      flagged: typeof v.flagged === "boolean" ? v.flagged : out[p].flagged,
    };
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
