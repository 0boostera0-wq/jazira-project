// Namespace registry. Each namespace is one file per locale:
//   src/i18n/messages/ar/<ns>.js  and  src/i18n/messages/en/<ns>.js
// Both files MUST expose exactly the same key tree (enforced by
// tests/i18n.test.js). Only the namespaces a page needs are sent to the client.

import { mergeMessages } from "../merge";

export const NAMESPACES = [
  "common",        // brand, actions, states, validation, a11y, time, languages
  "nav",           // app sidebar, top bar, bottom nav, marketing header/footer, account menu
  "meta",          // SEO titles & descriptions (server-only, never sent to the client)
  "landing",       // public homepage
  "auth",          // sign-in / sign-up / forgot / reset / verify-email / profile-setup
  "dashboard",
  "curriculum",    // curriculum hub, stage/grade/track/subject browser, resource viewer
  "stages",        // /elementary /middle /high-school stage pages + learning games
  "exams",         // exam center, aptitude, achievement, builder, runner, results, analytics
  "community",     // feed, composer, post card, comments, tags, follow
  "profile",       // public profile /u/[username] and /profile
  "settings",
  "assistant",     // Jazira assistant (AI) page
  "chat",          // direct messages inbox
  "notifications",
  "search",
  "subscriptions", // plans, checkout, payment states, premium locks
  "support",       // about, contact, support center, faq, feedback, reviews
  "legal",         // privacy, terms, refund, acceptable use, community guidelines
  "achievements",  // achievements, streaks, badges, competitions & leaderboard
];

const loaders = {
  ar: {
    common: () => import("./ar/common.js"),
    nav: () => import("./ar/nav.js"),
    meta: () => import("./ar/meta.js"),
    landing: () => import("./ar/landing.js"),
    auth: () => import("./ar/auth.js"),
    dashboard: () => import("./ar/dashboard.js"),
    curriculum: () => import("./ar/curriculum.js"),
    stages: () => import("./ar/stages.js"),
    exams: () => import("./ar/exams.js"),
    community: () => import("./ar/community.js"),
    profile: () => import("./ar/profile.js"),
    settings: () => import("./ar/settings.js"),
    assistant: () => import("./ar/assistant.js"),
    chat: () => import("./ar/chat.js"),
    notifications: () => import("./ar/notifications.js"),
    search: () => import("./ar/search.js"),
    subscriptions: () => import("./ar/subscriptions.js"),
    support: () => import("./ar/support.js"),
    legal: () => import("./ar/legal.js"),
    achievements: () => import("./ar/achievements.js"),
  },
  en: {
    common: () => import("./en/common.js"),
    nav: () => import("./en/nav.js"),
    meta: () => import("./en/meta.js"),
    landing: () => import("./en/landing.js"),
    auth: () => import("./en/auth.js"),
    dashboard: () => import("./en/dashboard.js"),
    curriculum: () => import("./en/curriculum.js"),
    stages: () => import("./en/stages.js"),
    exams: () => import("./en/exams.js"),
    community: () => import("./en/community.js"),
    profile: () => import("./en/profile.js"),
    settings: () => import("./en/settings.js"),
    assistant: () => import("./en/assistant.js"),
    chat: () => import("./en/chat.js"),
    notifications: () => import("./en/notifications.js"),
    search: () => import("./en/search.js"),
    subscriptions: () => import("./en/subscriptions.js"),
    support: () => import("./en/support.js"),
    legal: () => import("./en/legal.js"),
    achievements: () => import("./en/achievements.js"),
  },
};

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** { a: { b: { c: 1, d: 2 } } } + "a.b.c" → { a: { b: { c: 1 } } } (undefined when missing) */
function pick(tree, path) {
  const [head, ...rest] = path;
  if (!isPlainObject(tree) || !(head in tree)) return undefined;
  if (!rest.length) return { [head]: tree[head] };
  const sub = pick(tree[head], rest);
  return sub === undefined ? undefined : { [head]: sub };
}

/**
 * Load the given namespaces for a locale → { [ns]: tree }.
 *
 * Entries may be whole namespaces ("exams") or dotted subtrees
 * ("support.faq", "exams.builder.errors"): only the picked branches are
 * returned, in the same nested shape, so `useT("support")` + `t("faq.x")`
 * keeps working while pages serialize only what their client islands read.
 */
export async function loadMessages(locale, namespaces) {
  const table = loaders[locale] || loaders.ar;
  const parts = await Promise.all(
    namespaces.map(async (entry) => {
      const [ns, ...path] = String(entry).split(".");
      const load = table[ns];
      if (!load) throw new Error(`[i18n] unknown namespace "${ns}"`);
      const tree = (await load()).default;
      if (!path.length) return { [ns]: tree };
      const picked = pick(tree, path);
      if (picked === undefined) throw new Error(`[i18n] unknown message path "${entry}"`);
      return { [ns]: picked };
    })
  );
  return parts.reduce((acc, part) => mergeMessages(acc, part), {});
}
