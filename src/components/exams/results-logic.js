// ============================================================================
// Results — pure helpers for the score header, per-topic and per-lesson bars,
// the review filters, the "retry weak topics" deep link, and template
// sessions (retake, "practise my mistakes", names). Unit-tested.
// ============================================================================
import { EXAMS, LIMITS, SECTIONS } from "@/lib/exams/catalog";
import { verdictOf } from "./question-logic";
import { templateRefOf } from "./runner-logic";

/**
 * correct | incorrect | unanswered — plus partial (matching with partial
 * credit) and voided (the question was revised after it was served) for
 * template items (§5.7, §5.8).
 */
export const itemStatus = (item) => verdictOf(item);

export const REVIEW_FILTERS = ["all", "incorrect", "unanswered", "flagged"];

/** Filter counts; "incorrect" includes partly correct answers (anything short of full marks). */
export function reviewCounts(items = []) {
  const c = { all: items.length, correct: 0, incorrect: 0, partial: 0, unanswered: 0, voided: 0, flagged: 0 };
  for (const it of items) {
    const s = itemStatus(it);
    c[s] += 1;
    if (s === "partial") c.incorrect += 1;
    if (it.flagged) c.flagged += 1;
  }
  return c;
}

export function filterReview(items = [], filter = "all") {
  if (filter === "flagged") return items.filter((it) => it.flagged);
  if (filter === "incorrect") return items.filter((it) => ["incorrect", "partial"].includes(itemStatus(it)));
  if (filter === "unanswered") return items.filter((it) => itemStatus(it) === "unanswered");
  return items;
}

/** Score band for the headline (percent 0–100). */
export function scoreBand(percent) {
  const p = Number(percent) || 0;
  if (p >= 85) return "excellent";
  if (p >= 65) return "good";
  if (p >= 40) return "fair";
  return "low";
}

// One colour scale for every score / accuracy in the app (dashboard badges and
// topics, history rings and bars, results, the hub rail): ≥ 75 green, ≥ 50 gold,
// below that danger.
export const STRONG_PERCENT = 75;
export const PASS_PERCENT = 50;

/** "green" | "gold" | "danger" for a percentage (0–100), "neutral" when there is none. */
export function scoreTone(percent) {
  if (percent === null || percent === undefined || percent === "") return "neutral";
  const p = Number(percent);
  if (!Number.isFinite(p)) return "neutral";
  if (p >= STRONG_PERCENT) return "green";
  if (p >= PASS_PERCENT) return "gold";
  return "danger";
}

/** ProgressRing has no danger tone: a weak score keeps the neutral gold ring. */
export const ringTone = (percent) => (scoreTone(percent) === "green" ? "green" : "gold");

const pct = (correct, total) => (total > 0 ? Math.round((1000 * correct) / total) / 10 : null);

/**
 * by_topic rows with accuracy, weakest first (ties: more questions first,
 * then catalog order) — what to review next is at the top.
 */
export function sortTopics(byTopic = []) {
  const order = (r) => {
    const topics = SECTIONS[r.section]?.topics || [];
    const i = topics.indexOf(r.topic);
    return i === -1 ? 99 : i;
  };
  return byTopic
    .map((r) => ({ ...r, accuracy: pct(r.correct, r.total) }))
    .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0) || b.total - a.total || order(a) - order(b));
}

/**
 * Prefill for "retry weak topics": the section with the most missed questions
 * (ties → mixed) and, inside it, the most-missed topic. null when nothing
 * was missed.
 * @returns {{ exam, section: string|null, topic: string|null, count: number } | null}
 */
export function retryPlan(result) {
  const items = result?.items || [];
  const exam = result?.attempt?.exam;
  if (!EXAMS[exam]) return null;
  const missed = items.filter((it) => itemStatus(it) !== "correct");
  if (!missed.length) return null;

  const bySection = new Map();
  for (const it of missed) bySection.set(it.section, (bySection.get(it.section) || 0) + 1);
  const ranked = [...bySection.entries()].sort((a, b) => b[1] - a[1]);
  const tie = ranked.length > 1 && ranked[0][1] === ranked[1][1];
  const section = tie ? null : ranked[0][0];

  let topic = null;
  if (section) {
    const byTopic = new Map();
    for (const it of missed) if (it.section === section) byTopic.set(it.topic, (byTopic.get(it.topic) || 0) + 1);
    const top = [...byTopic.entries()].sort((a, b) => b[1] - a[1]);
    if (top.length && (top.length === 1 || top[0][1] > top[1][1])) topic = top[0][0];
  }
  const count = Math.min(LIMITS.freeMaxQuestions, Math.max(LIMITS.minQuestions, missed.length));
  return { exam, section, topic, count };
}

/** Seconds actually used (never above the limit). */
export function usedSeconds(attempt) {
  const d = Number(attempt?.duration_seconds);
  if (Number.isFinite(d) && d >= 0) return Math.min(d, attempt?.time_limit_seconds || d);
  return null;
}

// ── template sessions ───────────────────────────────────────────────────────

/** Is this a template-engine result / payload (as opposed to the legacy builder)? */
export const isTemplateResult = (result) => templateRefOf(result) !== null;

/** "Lesson quiz" / "Full year (mini)" — the template's display name. */
export function templateName(t, id, mini = false) {
  const name = t.has(`templates.${id}`) ? t(`templates.${id}`) : t("templates.fallback");
  return mini ? t("templates.mini", { name }) : name;
}

/** The lesson every question of a session belongs to (its title), else null. */
export function sessionLessonTitle(questions = []) {
  const ids = new Set();
  let title = null;
  for (const q of questions) {
    if (!q?.lesson?.id) return null;
    ids.add(q.lesson.id);
    title = title ?? q.lesson.title ?? null;
    if (ids.size > 1) return null;
  }
  return ids.size === 1 ? title : null;
}

/** The id of the attempt a result belongs to (database uuid or guest "g-…"). */
export const resultAttemptId = (result) => result?.attempt?.id ?? result?.session_id ?? result?.attempt_id ?? null;

/**
 * «إعادة الاختبار» (§7): a new session with the same template, scope, count,
 * timing and feedback (the difficulty mix is the template's; a retake reuses
 * the stored allocation), `retake_of` = this attempt — startExam() config.
 * null for legacy results.
 */
export function retakeConfig(result) {
  const ref = templateRefOf(result);
  const a = result?.attempt || {};
  const scope = a.scope ?? result?.scope ?? null;
  const id = resultAttemptId(result);
  if (!ref || !scope || !id) return null;
  const served = Array.isArray(result?.items) ? result.items.length : 0;
  const count = served || Number(a.question_count) || Number(result?.question_count) || null;
  const timing = a.timing_mode ?? result?.timing_mode ?? null;
  const feedback = a.feedback_mode ?? result?.feedback_mode ?? null;
  return {
    template: ref.id,
    scope,
    count,
    timing: timing === "timed" || timing === "untimed" ? timing : null,
    feedback: feedback === "end" || feedback === "immediate" ? feedback : null,
    retakeOf: id,
  };
}

const nodeOfScope = (scope) => (typeof scope === "string" && scope && !scope.includes(":") ? scope.split("@")[0] : null);

/**
 * "Practise my mistakes": a weakness-review session over this attempt's
 * lessons — the one lesson all missed items share, else the attempt's scope
 * node (`weak:<node>`). Saved (database) attempts only: guests have no
 * history to review, and prep scopes have no curriculum node. null when
 * nothing was missed.
 */
export function mistakesConfig(result) {
  if (result?.mode !== "db" || !isTemplateResult(result)) return null;
  const missed = (result.items || []).filter((it) => ["incorrect", "partial", "unanswered"].includes(itemStatus(it)));
  if (!missed.length) return null;
  const lessons = new Set(missed.map((it) => it.lesson?.id).filter((id) => typeof id === "string" && !id.startsWith("prep:")));
  const node = lessons.size === 1 ? [...lessons][0] : nodeOfScope(result.attempt?.scope ?? result.scope);
  if (!node) return null;
  return { template: "weakness-review", scope: `weak:${node}`, count: null, timing: null, feedback: null, retakeOf: null };
}

const pct1 = (num, den) => (den > 0 ? Math.round((1000 * num) / den) / 10 : null);

/**
 * by_lesson rows (§5.7) with accuracy from the score sum (partial credit
 * counts), weakest first; ties keep more questions first, then the id.
 */
export function lessonRows(byLesson = []) {
  return (Array.isArray(byLesson) ? byLesson : [])
    .filter((r) => r && r.id)
    .map((r) => {
      const total = Number(r.total) || 0;
      const sum = Number.isFinite(Number(r.score_sum)) ? Number(r.score_sum) : Number(r.correct) || 0;
      return { ...r, total, accuracy: pct1(sum, total) };
    })
    .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0) || b.total - a.total || String(a.id).localeCompare(String(b.id)));
}

/** by_term rows (full-year) in term order: t1, t2, then anything else. */
export function termRows(byTerm = []) {
  const rank = (term) => ({ t1: 0, t2: 1, both: 2 })[term] ?? 3;
  return (Array.isArray(byTerm) ? byTerm : [])
    .filter((r) => r && r.term)
    .map((r) => ({ ...r, total: Number(r.total) || 0, accuracy: pct1(Number(r.score_sum ?? r.correct) || 0, Number(r.total) || 0) }))
    .sort((a, b) => rank(a.term) - rank(b.term));
}

/** Score summary of a template result (database or guest shape). */
export function templateSummary(result) {
  const a = result?.attempt || {};
  const items = result?.items || [];
  const voided = Number(result?.voided_count ?? a.voided_count) || items.filter((it) => it.voided).length;
  // scored questions: every served item except voided ones (the attempt row may count all of them)
  const total = items.length ? items.length - voided : Number(result?.question_count ?? a.question_count) || 0;
  return {
    total,
    voided,
    correct: Number(a.correct_count ?? result?.correct_count) || 0,
    answered: Number(result?.answered_count ?? a.answered_count) || items.filter((it) => !["unanswered", "voided"].includes(itemStatus(it))).length,
    percent: Math.max(0, Math.min(100, Number(a.score_percent ?? result?.score_percent) || 0)),
  };
}

/**
 * A user-facing message for a DataError code (src/lib/data/exams.js):
 * errors.<code> with the details the server sent, else errors.unknown.
 * `tc` (the common namespace) spells question counts ("25 questions").
 */
export function errorMessage(t, code, details = null, tc = null) {
  const key = `errors.${code}`;
  if (!code || !t.has(key)) return t("errors.unknown");
  const d = details && typeof details === "object" ? details : {};
  const questions = (n) => (tc ? tc("units.questions", { count: n }) : String(n));
  if (code === "insufficient_pool") {
    // counts only when the server sent them — never an invented "0 available, 0 needed"
    const count = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
    const available = count(d.available);
    const required = count(d.required);
    return available !== null && required !== null ? t(key, { available, required }) : t("errors.insufficient_pool_plain");
  }
  if (code === "premium_required") return t(key, { questions: questions(Number(d.max_questions) || LIMITS.freeMaxQuestions) });
  if (code === "daily_limit_reached") {
    return t(key, { attempts: t("units.attempts", { count: Number(d.limit) || LIMITS.freeDailyAttempts || 0 }), when: t("errors.daily_limit_soon") });
  }
  return t(key);
}
