// ============================================================================
// Exam templates — the source of truth (docs/CONTENT_ENGINE.md §2.12, §5.3).
//
//   TEMPLATES                       the ten v1 templates (exam-template@1)
//   getTemplate(id, version?)       → template | null (latest version by default)
//   planCount(template, tier, req)  tier clamping → { ok, n, mini, limited, min_required } | { ok:false, error }
//   planTiming(template, n, mode)   → { ok, mode, seconds } | { ok:false, error }
//   planFeedback(template, mode)    → { ok, mode } | { ok:false, error:"feedback_not_allowed" }
//   offerFor(template, tier, pool)  the pool rule for entry points (§7)
//   validateTemplate(t)             → string[] problems (empty = ok)
//
// Exported to data/staging/exams/templates.json by
// scripts/content/export-exam-templates.mjs and to the exam_templates table by
// the importer. Pure: safe on the server and in the client bundle.
// ============================================================================

const ALL_TYPES = ["mcq", "true_false", "matching", "ordering", "short_answer", "numeric"];
/** Scope kinds of the "any node" templates (practice, timed, random-practice). */
const ANY_NODE = ["stage", "grade", "track", "subject", "subject@t1", "subject@t2", "subject@year", "unit", "chapter", "lesson", "prep", "prep_section", "prep_topic"];

export const TIERS = Object.freeze(["guest", "free", "premium"]);
export const GUEST_MAX = 20;          // any template, guests (§5.8: bounded key exposure)
export const FREE_MAX = 25;           // the existing free per-attempt cap (LIMITS.freeMaxQuestions)
export const UNTIMED_SECONDS = 7 * 24 * 3600; // untimed deadline = start + 7 days (§2.13)
export const TIMED_MIN_SECONDS = 60;
export const TIMED_MAX_SECONDS = 14400;
export const DEFAULT_SECONDS_PER_QUESTION = 60;

const retry = (last) => ({ avoid_last_attempts: last, avoid_days: 90, allow_reuse: true, max_reuse_share: 30 });
const RANDOMIZATION = { question_order: "shuffle_keep_stimulus", option_shuffle: true, one_per_exclusion_group: true };
const SCORING = { unit: "percent", matching: "partial", negative_marking: false, pass_threshold: 60 };
const ELIGIBILITY = { question_status: ["published"], min_pool_factor: 1.0 };
const untimed = { mode: "untimed", seconds_per_question: null, min_seconds: null, max_seconds: null, grace_seconds: 30, user_may_change: true };
const timed = (spq, min, max, mayChange = true) => ({ mode: "timed", seconds_per_question: spq, min_seconds: min, max_seconds: max, grace_seconds: 30, user_may_change: mayChange });
const END = { default: "end", allowed: ["end"] };
const IMMEDIATE = { default: "immediate", allowed: ["immediate", "end"] };
const count = (dflt, min, max, mini = null) => ({ default: dflt, min, max, guest_max: GUEST_MAX, free_max: FREE_MAX, mini });

function template(id, kind, scopeKinds, cnt, mix, coverage, termRule, timing, feedback, retryRule, quota) {
  return {
    schema: "exam-template@1",
    id,
    version: 1,
    kind,
    scope_kinds: scopeKinds,
    count: cnt,
    difficulty_mix: { easy: mix[0], medium: mix[1], hard: mix[2] },
    coverage,
    term_rule: termRule,
    types: [...ALL_TYPES],
    timing,
    feedback,
    retry: retryRule,
    randomization: { ...RANDOMIZATION },
    scoring: { ...SCORING },
    quota,
    eligibility: { ...ELIGIBILITY, question_status: [...ELIGIBILITY.question_status] },
  };
}

const cov = (stratify_by, weight, min = 1) => ({ stratify_by, weight, min_per_stratum: min });

const LIST = [
  template("chapter-quiz", "chapter", ["unit", "chapter"], count(15, 5, 40), [30, 50, 20], cov("lesson", "equal"),
    "inherit", timed(75, 300, 3600), END, retry(5), "exam"),
  template("full-year", "full_year", ["subject@year"], count(60, 30, 100, 25), [30, 45, 25], cov("unit", "lesson_count"),
    "both_terms", timed(90, 1800, 10800), END, retry(5), "exam"),
  template("lesson-quiz", "lesson", ["lesson"], count(10, 3, 20), [40, 40, 20], cov("objective", "equal"),
    "inherit", untimed, IMMEDIATE, retry(5), "practice"),
  template("mock", "mock", ["subject", "prep", "prep_section"], count(50, 20, 100), [25, 50, 25], cov("unit", "lesson_count"),
    "inherit", timed(60, 1200, 6000), END, retry(5), "exam"),
  template("practice", "practice", ANY_NODE, count(10, 5, 30), [40, 40, 20], cov("lesson", "pool_size"),
    "inherit", untimed, { default: "immediate", allowed: ["immediate", "end"] }, retry(10), "practice"),
  template("random-practice", "random", ANY_NODE, count(10, 5, 50), [34, 33, 33], cov("none", "equal", 0),
    "inherit", untimed, IMMEDIATE, retry(10), "practice"),
  template("subject-quiz", "subject", ["subject", "subject@t1", "subject@t2"], count(25, 10, 60), [30, 45, 25], cov("unit", "lesson_count"),
    "inherit", timed(75, 600, 4500), END, retry(5), "exam"),
  template("term-exam", "term", ["subject@t1", "subject@t2"], count(40, 20, 80), [30, 45, 25], cov("unit", "lesson_count"),
    "single_term", timed(90, 1200, 7200), END, retry(5), "exam"),
  template("timed", "timed", ANY_NODE, count(20, 5, 100), [30, 45, 25], cov("lesson", "lesson_count"),
    "inherit", timed(60, 300, 6000, false), END, retry(5), "exam"),
  template("weakness-review", "weakness", ["weak"], count(15, 5, 30), [40, 40, 20], cov("lesson", "error_rate"),
    "inherit", untimed, IMMEDIATE, retry(5), "practice"),
];

function deepFreeze(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

/** The v1 templates, sorted by (id, version). */
export const TEMPLATES = deepFreeze(LIST);
export const TEMPLATE_IDS = Object.freeze(TEMPLATES.map((t) => t.id));

/** Latest version of a template, or the given version. null when unknown. */
export function getTemplate(id, version = null) {
  if (typeof id !== "string") return null;
  const matches = TEMPLATES.filter((t) => t.id === id && (version === null || t.version === version));
  if (!matches.length) return null;
  return matches.reduce((a, b) => (b.version > a.version ? b : a));
}

/** Tier cap of a template (guest / free / premium). */
export function tierMax(t, tier) {
  if (tier === "guest") return Math.min(t.count.max, t.count.guest_max ?? t.count.max);
  if (tier === "free") return Math.min(t.count.max, t.count.free_max ?? t.count.max);
  return t.count.max;
}

/**
 * Tier clamping (§5.3): n = min(requested, template max, tier max). When the
 * tier max is below the template's min, the template runs as its "mini"
 * version (count.mini, capped by the tier) — or is premium-only without one.
 * @returns {{ ok:true, n, mini:boolean, limited:boolean, requested:number, min_required:number }
 *          | { ok:false, error:"invalid_argument"|"premium_required", field? }}
 */
export function planCount(t, tier, requested = null) {
  if (!TIERS.includes(tier)) return { ok: false, error: "invalid_argument", field: "tier" };
  const cap = tierMax(t, tier);
  if (requested !== null && requested !== undefined) {
    if (!Number.isInteger(requested) || requested < 1 || requested > t.count.max) return { ok: false, error: "invalid_argument", field: "count" };
  }
  if (cap < t.count.min) {
    if (!t.count.mini) return { ok: false, error: "premium_required" };
    const n = Math.min(t.count.mini, cap);
    return { ok: true, n, mini: true, limited: true, requested: requested ?? t.count.default, min_required: n };
  }
  const want = requested ?? t.count.default;
  if (want < t.count.min) return { ok: false, error: "invalid_argument", field: "count" };
  const n = Math.min(want, cap);
  return { ok: true, n, mini: false, limited: n < want, requested: want, min_required: Math.min(t.count.min, n) };
}

/**
 * Session timing. Timed: n × seconds_per_question clamped to the template's
 * [min_seconds, max_seconds] and to the DB bounds [60, 14400]. Untimed: 7 days.
 * A template with `user_may_change: false` refuses another mode.
 */
export function planTiming(t, n, requestedMode = null) {
  const mode = requestedMode ?? t.timing.mode;
  if (mode !== "timed" && mode !== "untimed") return { ok: false, error: "invalid_argument", field: "timing" };
  if (mode !== t.timing.mode && !t.timing.user_may_change) return { ok: false, error: "invalid_argument", field: "timing" };
  if (mode === "untimed") return { ok: true, mode, seconds: UNTIMED_SECONDS, grace_seconds: t.timing.grace_seconds ?? 30 };
  const spq = t.timing.seconds_per_question ?? DEFAULT_SECONDS_PER_QUESTION;
  let seconds = n * spq;
  if (t.timing.min_seconds !== null && t.timing.min_seconds !== undefined) seconds = Math.max(seconds, t.timing.min_seconds);
  if (t.timing.max_seconds !== null && t.timing.max_seconds !== undefined) seconds = Math.min(seconds, t.timing.max_seconds);
  seconds = Math.min(Math.max(seconds, TIMED_MIN_SECONDS), TIMED_MAX_SECONDS);
  return { ok: true, mode, seconds, grace_seconds: t.timing.grace_seconds ?? 30 };
}

/** Feedback mode: the template default, or an allowed requested one. */
export function planFeedback(t, requested = null) {
  const mode = requested ?? t.feedback.default;
  if (!t.feedback.allowed.includes(mode)) return { ok: false, error: "feedback_not_allowed" };
  return { ok: true, mode };
}

/**
 * Entry-point rule (§7, §9 WP9): a template is offered for a scope when the
 * pool has at least ceil(min × min_pool_factor) exclusion components (the
 * mini count for a mini version). Premium-only templates are reported so.
 * @param {object} t template
 * @param {"guest"|"free"|"premium"} tier
 * @param {number} groups  exclusion components in the scope's eligible pool
 */
export function offerFor(t, tier, groups) {
  const plan = planCount(t, tier, null);
  if (!plan.ok) return { offered: false, mini: false, reason: plan.error, required: t.count.min, available: groups };
  const minCount = plan.mini ? plan.n : t.count.min;
  const required = Math.ceil(minCount * (t.eligibility.min_pool_factor ?? 1));
  const offered = Number.isInteger(groups) && groups >= required;
  return { offered, mini: plan.mini, reason: offered ? null : "insufficient_pool", required, available: groups };
}

/** Structural checks the schema cannot express. */
export function validateTemplate(t) {
  const out = [];
  const m = t.difficulty_mix;
  if (m.easy + m.medium + m.hard !== 100) out.push(`${t.id}: difficulty_mix must sum to 100`);
  if (!(t.count.min <= t.count.default && t.count.default <= t.count.max)) out.push(`${t.id}: count min ≤ default ≤ max`);
  if (t.count.mini !== null && t.count.mini !== undefined && t.count.mini > t.count.min) out.push(`${t.id}: mini must be ≤ min`);
  if (!t.feedback.allowed.includes(t.feedback.default)) out.push(`${t.id}: feedback default not allowed`);
  if (t.timing.mode === "timed" && !t.timing.seconds_per_question) out.push(`${t.id}: timed needs seconds_per_question`);
  if (t.retry.max_reuse_share < 0 || t.retry.max_reuse_share > 100) out.push(`${t.id}: max_reuse_share 0..100`);
  if (!t.types.length) out.push(`${t.id}: no question types`);
  if (t.term_rule === "single_term" && !t.scope_kinds.every((k) => k === "subject@t1" || k === "subject@t2")) out.push(`${t.id}: single_term needs term scopes`);
  return out;
}

/** Stable reference "<id>@<version>". */
export const templateRef = (t) => `${t.id}@${t.version}`;
