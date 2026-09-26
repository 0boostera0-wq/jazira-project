// ============================================================================
// Results — pure helpers for the score header, per-topic bars, the review
// filters and the "retry weak topics" deep link. Unit-tested.
// ============================================================================
import { EXAMS, LIMITS, SECTIONS } from "@/lib/exams/catalog";

/** correct | incorrect | unanswered */
export function itemStatus(item) {
  if (item?.selected_index === null || item?.selected_index === undefined) return "unanswered";
  return item.is_correct ? "correct" : "incorrect";
}

export const REVIEW_FILTERS = ["all", "incorrect", "unanswered", "flagged"];

export function reviewCounts(items = []) {
  const c = { all: items.length, correct: 0, incorrect: 0, unanswered: 0, flagged: 0 };
  for (const it of items) {
    c[itemStatus(it)] += 1;
    if (it.flagged) c.flagged += 1;
  }
  return c;
}

export function filterReview(items = [], filter = "all") {
  if (filter === "flagged") return items.filter((it) => it.flagged);
  if (filter === "incorrect" || filter === "unanswered") return items.filter((it) => itemStatus(it) === filter);
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
