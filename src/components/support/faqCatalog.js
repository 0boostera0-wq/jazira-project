// FAQ structure — which questions belong to which help topic, and where an
// answer can link to. The copy itself lives in the `support` namespace
// (support.faq.items.<id>.{q,a,link}) so both languages stay in lock-step.
// Pure data + helpers: safe to import from server and client components.

import { AI_FREE_LIMIT, AI_WINDOW_MS, ELITE } from "@/lib/constants";
import { LIMITS } from "@/lib/exams/catalog";
import { formatPrice } from "@/i18n/format";

/** Help topics, in display order. `items` are FAQ ids; `href` is an optional in-app link. */
export const FAQ_TOPICS = [
  {
    id: "account",
    items: [
      { id: "createAccount", href: "/sign-up" },
      { id: "guest" },
      { id: "forgotPassword", href: "/forgot-password" },
      { id: "profile", href: "/settings" },
      { id: "privacy", href: "/privacy" },
      { id: "deleteAccount", href: "/settings" },
    ],
  },
  {
    id: "exams",
    items: [
      { id: "whichExams", href: "/exams" },
      { id: "questionSource" },
      { id: "timing" },
      { id: "freeExams", href: "/subscriptions" },
    ],
  },
  {
    id: "curriculum",
    items: [
      { id: "curriculumContent", href: "/curriculum" },
      { id: "curriculumOfficial" },
      { id: "curriculumFree" },
    ],
  },
  {
    id: "subscription",
    items: [
      { id: "elite", href: "/subscriptions" },
      { id: "price" },
      { id: "payment" },
      { id: "cancel", href: "/refund" },
      { id: "notActivated", href: "/contact?topic=billing" },
    ],
  },
  {
    id: "assistant",
    items: [
      { id: "assistantAbilities", href: "/assistant" },
      { id: "assistantLimit" },
      { id: "assistantAccuracy" },
      { id: "assistantHistory" },
    ],
  },
  {
    id: "community",
    items: [
      { id: "communityWhat", href: "/community" },
      { id: "communityAnonymous" },
      { id: "communityRules", href: "/community-guidelines" },
    ],
  },
  {
    id: "technical",
    items: [
      { id: "devices" },
      { id: "troubleshooting", href: "/contact?topic=technical" },
      { id: "languageTheme" },
    ],
  },
];

export const TOPIC_IDS = FAQ_TOPICS.map((t) => t.id);

/** Short, practical answers surfaced on the support center. */
export const QUICK_FAQ = ["forgotPassword", "price", "payment", "cancel", "notActivated", "assistantLimit", "questionSource", "deleteAccount"];

/**
 * Interpolation values for answers — always derived from the code that
 * enforces them (constants.js, exams/catalog.js), never typed into copy.
 * Counted values go through the plural units in support.faq.units.
 */
export function faqVars(t, locale) {
  const u = (unit, count) => t(`faq.units.${unit}`, { count });
  return {
    price: formatPrice(ELITE.priceSAR, locale),
    messages: u("messages", AI_FREE_LIMIT),
    hours: u("hours", Math.round(AI_WINDOW_MS / 3_600_000)),
    guestQuestions: u("questions", LIMITS.guestMaxQuestions),
    freeQuestions: u("questions", LIMITS.freeMaxQuestions),
    eliteQuestions: u("questions", LIMITS.maxQuestions),
    freeDaily: u("attempts", LIMITS.freeDailyAttempts),
  };
}

/**
 * Resolve every FAQ entry for a translator bound to the `support` namespace.
 * → [{ id, topic, q, a, href?, link? }]
 */
export function resolveFaq(t, locale) {
  const vars = faqVars(t, locale);
  return FAQ_TOPICS.flatMap((topic) =>
    topic.items.map(({ id, href }) => ({
      id,
      topic: topic.id,
      q: t(`faq.items.${id}.q`),
      a: t(`faq.items.${id}.a`, vars),
      href,
      link: href ? t(`faq.items.${id}.link`) : undefined,
    }))
  );
}

/** Arabic-aware normalisation for instant filtering (diacritics, hamza forms, taa marbuta). */
export function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[“”«»"'’؟?!.,،:;()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
