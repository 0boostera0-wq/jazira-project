// ============================================================================
// Plan facts — the single place the subscriptions UI reads numbers from.
//
// Every value is derived from the code that actually enforces it, so the
// marketing copy can never promise something the product doesn't do:
//   • price               → ELITE.priceSAR            (src/lib/constants.js)
//   • exam limits          → LIMITS / PRESETS          (src/lib/exams/catalog.js)
//   • assistant quota      → AI_FREE_LIMIT / AI_WINDOW_MS (src/lib/constants.js)
//   • profile cooldowns    → update_full_name / set_avatar RPCs
//                             (supabase/migrations/0006_settings_privacy_sessions.sql)
//   • referral bonus       → REFERRAL_TARGET / REFERRAL_REWARD.bonusAiMessages
//                             (src/lib/constants.js; enforced by the ai_quota() RPC,
//                             migration 0010: +bonus messages per window at target).
//                             REFERRAL_REWARD.bonusQuizAttempts is NOT enforced by the
//                             exam engine (start_exam_attempt), so it is not advertised.
// Pure data + pure helpers: safe to import from server and client components.
// ============================================================================

import { ELITE, AI_FREE_LIMIT, AI_WINDOW_MS, REFERRAL_TARGET, REFERRAL_REWARD } from "@/lib/constants";
import { LIMITS, PRESETS } from "@/lib/exams/catalog";
import { intlLocale } from "@/i18n/config";

/**
 * Brand name of the payment provider (the checkout route and webhook integrate
 * Lemon Squeezy). Joined with a no-break space so the name never splits across
 * two lines — a split LTR brand inside Arabic text reads out of order.
 */
export const PAYMENT_PROVIDER = "Lemon\u00A0Squeezy";
export const CURRENCY = "SAR";

const FULL_SIMULATION = PRESETS.find((p) => p.id === "full") || { count: 50, minutes: 55 };

export const PLAN = {
  priceSAR: ELITE.priceSAR,
  exams: {
    freeMaxQuestions: LIMITS.freeMaxQuestions,
    eliteMaxQuestions: LIMITS.maxQuestions,
    freeDailyAttempts: LIMITS.freeDailyAttempts,
    simulation: { questions: FULL_SIMULATION.count, minutes: FULL_SIMULATION.minutes },
  },
  assistant: {
    freeMessages: AI_FREE_LIMIT,
    windowHours: Math.round(AI_WINDOW_MS / 3600000),
  },
  // Mirrors the server-side cooldowns in migration 0006 (Elite: 24 h name
  // cooldown instead of 14 days; no avatar cooldown instead of 10 days).
  profile: {
    freeNameDays: 14,
    eliteNameHours: 24,
    freeAvatarDays: 10,
  },
  referral: {
    target: REFERRAL_TARGET,
    bonusMessages: REFERRAL_REWARD.bonusAiMessages,
  },
};

/**
 * Locale-aware price split into Intl parts so the number can be styled
 * separately from the currency while keeping each locale's order
 * ("19 ر.س." in Arabic, "SAR 19" in English).
 */
export function priceParts(amount, locale) {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: CURRENCY,
    maximumFractionDigits: 0,
  }).formatToParts(amount);
}

/**
 * Interpolation values shared by the plan copy (perks, comparison, FAQ).
 * `t` is a subscriptions translator, `tc` a common translator.
 */
export function planVars(t, tc) {
  const { exams, assistant, profile } = PLAN;
  return {
    eliteQuestions: tc("units.questions", { count: exams.eliteMaxQuestions }),
    freeQuestions: tc("units.questions", { count: exams.freeMaxQuestions }),
    freeDaily: t("units.exams", { count: exams.freeDailyAttempts }),
    simQuestions: tc("units.questions", { count: exams.simulation.questions }),
    simMinutes: tc("units.minutes", { count: exams.simulation.minutes }),
    freeMessages: t("units.messages", { count: assistant.freeMessages }),
    windowHours: t("units.hours", { count: assistant.windowHours }),
    freeNamePeriod: tc("units.days", { count: profile.freeNameDays }),
    eliteNamePeriod: t("units.hours", { count: profile.eliteNameHours }),
    freeAvatarPeriod: tc("units.days", { count: profile.freeAvatarDays }),
    referralInvites: t("units.invites", { count: PLAN.referral.target }),
    referralBonus: t("units.messages", { count: PLAN.referral.bonusMessages }),
    referralTotal: t("units.messages", { count: assistant.freeMessages + PLAN.referral.bonusMessages }),
  };
}

/** The short Elite perk list (plan card, checkout, success, upgrade dialog). */
export function elitePerks(t, tc) {
  const v = planVars(t, tc);
  return [
    { key: "questions", label: t("perks.questions", { questions: v.eliteQuestions }) },
    { key: "daily", label: t("perks.daily") },
    { key: "simulation", label: t("perks.simulation", { questions: v.simQuestions, minutes: v.simMinutes }) },
    { key: "assistant", label: t("perks.assistant") },
    { key: "analytics", label: t("perks.analytics") },
    { key: "badge", label: t("perks.badge") },
  ];
}
