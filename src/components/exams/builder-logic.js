// ============================================================================
// Exam builder — pure logic (deep-link parsing, tier limits, presets, the
// startExam() config). No React, no browser APIs: unit-tested in
// tests/unit/exams-ui.test.js.
//
// Deep links (other pages may link straight into a prefilled builder):
//   /exams/<exam>?section=<slug>&topic=<slug>&difficulty=1|2|3&count=<n>#builder
// Unknown / invalid values are ignored. A topic alone selects its section.
// ============================================================================
import { EXAMS, SECTIONS, DIFFICULTIES, LIMITS, PRESETS } from "@/lib/exams/catalog";

export const TIERS = ["guest", "free", "elite"];

/** Largest attempt a tier may start (the DB / local API enforce the same). */
export function maxQuestionsFor(tier) {
  if (tier === "elite") return LIMITS.maxQuestions;
  if (tier === "free") return LIMITS.freeMaxQuestions;
  return LIMITS.guestMaxQuestions;
}

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
export const clampCount = (n, tier) => clamp(Math.round(Number(n) || LIMITS.minQuestions), LIMITS.minQuestions, maxQuestionsFor(tier));
export const clampMinutes = (m) => clamp(Math.round(Number(m) || LIMITS.minMinutes), LIMITS.minMinutes, LIMITS.maxMinutes);

/** Rough duration before the questions are drawn (the server sums their real limits). */
export const estimateMinutes = (count) => Math.max(1, Math.round((count * LIMITS.defaultSecondsPerQuestion) / 60));

const get = (params, key) => {
  if (!params) return null;
  const v = typeof params.get === "function" ? params.get(key) : params[key];
  return typeof v === "string" ? v.trim() : Array.isArray(v) ? String(v[0] ?? "").trim() : null;
};

/** Sections of an exam that list a topic. */
export function sectionsWithTopic(exam, topic) {
  return (EXAMS[exam]?.sections || []).filter((s) => SECTIONS[s]?.topics.includes(topic));
}

/**
 * Parse builder deep-link params for an exam page.
 * @param {"aptitude"|"achievement"} exam
 * @param {URLSearchParams|object|null} params
 * @returns {{ section: string|null, topic: string|null, difficulty: 1|2|3|null, count: number|null }}
 */
export function parseBuilderParams(exam, params) {
  const out = { section: null, topic: null, difficulty: null, count: null };
  if (!EXAMS[exam]) return out;

  const section = get(params, "section");
  if (section && SECTIONS[section]?.exam === exam) out.section = section;

  const topic = get(params, "topic");
  if (topic) {
    if (out.section) {
      if (SECTIONS[out.section].topics.includes(topic)) out.topic = topic;
    } else {
      const owners = sectionsWithTopic(exam, topic);
      if (owners.length === 1) {
        out.section = owners[0];
        out.topic = topic;
      }
    }
  }

  const difficulty = Number(get(params, "difficulty"));
  if (DIFFICULTIES.includes(difficulty)) out.difficulty = difficulty;

  const rawCount = get(params, "count");
  const count = rawCount && /^\d{1,3}$/.test(rawCount) ? Number(rawCount) : NaN;
  if (Number.isInteger(count)) out.count = clamp(count, LIMITS.minQuestions, LIMITS.maxQuestions);

  return out;
}

/** Href of a prefilled builder (inverse of parseBuilderParams). */
export function builderHref(exam, { section = null, topic = null, difficulty = null, count = null } = {}) {
  const q = new URLSearchParams();
  if (section) q.set("section", section);
  if (topic) q.set("topic", topic);
  if (difficulty) q.set("difficulty", String(difficulty));
  if (count) q.set("count", String(count));
  const qs = q.toString();
  return `/exams/${exam}${qs ? `?${qs}` : ""}#builder`;
}

/**
 * Why a preset can't be used by a tier: null (usable), "signIn" (guests —
 * a free account allows it) or "elite" (premium only).
 */
export function presetLock(preset, tier) {
  if (preset.premium && tier !== "elite") return "elite";
  if (preset.count > maxQuestionsFor(tier)) return tier === "guest" && preset.count <= LIMITS.freeMaxQuestions ? "signIn" : "elite";
  return null;
}

/** Same, for a custom count. */
export function countLock(count, tier) {
  if (count <= maxQuestionsFor(tier)) return null;
  return tier === "guest" && count <= LIMITS.freeMaxQuestions ? "signIn" : "elite";
}

/**
 * Initial builder state from deep-link params. Pass the viewer tier when it is
 * known; while auth is loading use "elite" (no clamp) and dispatch { type: "tier" }
 * once it resolves.
 */
export function initialBuilderState(exam, params, tier = "elite") {
  const p = parseBuilderParams(exam, params);
  const quick = PRESETS[0];
  const base = {
    exam,
    section: p.section,
    topic: p.topic,
    difficulty: p.difficulty,
    preset: quick.id,
    count: quick.count,
    timeMode: "preset",
    minutes: quick.minutes,
  };
  if (p.count) {
    const match = PRESETS.find((x) => x.count === p.count && !presetLock(x, tier));
    if (match) return { ...base, preset: match.id, count: match.count, minutes: match.minutes };
    return { ...base, preset: "custom", count: clampCount(p.count, tier), timeMode: "auto", minutes: estimateMinutes(p.count) };
  }
  return base;
}

/**
 * Builder state reducer.
 * actions: section | topic | difficulty | preset | count | timeMode | minutes | tier | params
 */
export function builderReducer(state, action) {
  switch (action.type) {
    case "section":
      return { ...state, section: action.value, topic: action.value === state.section ? state.topic : null };
    case "topic":
      // a topic of the chosen section, or null for the whole section
      return { ...state, topic: action.value && SECTIONS[state.section]?.topics.includes(action.value) ? action.value : null };
    case "difficulty":
      return { ...state, difficulty: action.value };
    case "preset": {
      const p = PRESETS.find((x) => x.id === action.value);
      if (!p) return { ...state, preset: "custom", timeMode: state.timeMode === "preset" ? "auto" : state.timeMode };
      return { ...state, preset: p.id, count: p.count, timeMode: "preset", minutes: p.minutes };
    }
    case "count": {
      const count = clampCount(action.value, action.tier || "elite");
      return { ...state, preset: "custom", count, timeMode: state.timeMode === "preset" ? "auto" : state.timeMode };
    }
    case "timeMode":
      return { ...state, timeMode: action.value, minutes: action.value === "custom" && state.timeMode !== "custom" ? state.minutes || estimateMinutes(state.count) : state.minutes };
    case "minutes":
      return { ...state, timeMode: "custom", minutes: clampMinutes(action.value) };
    case "tier": {
      // Signed out / downgraded: pull the configuration back inside the tier.
      const max = maxQuestionsFor(action.value);
      const preset = PRESETS.find((p) => p.id === state.preset);
      if (preset && presetLock(preset, action.value)) {
        const quick = PRESETS[0];
        return { ...state, preset: quick.id, count: quick.count, timeMode: "preset", minutes: quick.minutes };
      }
      if (state.count <= max) return state;
      return { ...state, preset: "custom", count: max, timeMode: state.timeMode === "preset" ? "auto" : state.timeMode };
    }
    case "params":
      return initialBuilderState(state.exam, action.value, action.tier);
    default:
      return state;
  }
}

/** Minutes the attempt will get (null = server default: sum of per-question limits). */
export function effectiveMinutes(state) {
  if (state.timeMode === "auto") return null;
  return clampMinutes(state.minutes);
}

/** Arguments for startExam() (`topic` narrows the draw to one skill of the section — 0012). */
export function toStartConfig(state) {
  const minutes = effectiveMinutes(state);
  return {
    exam: state.exam,
    section: state.section || null,
    topic: state.topic || null,
    difficulty: state.difficulty || null,
    count: state.count,
    timeLimitSeconds: minutes ? minutes * 60 : null,
  };
}
