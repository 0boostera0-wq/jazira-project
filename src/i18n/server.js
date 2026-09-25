// Server-side i18n helpers (Server Components, generateMetadata, route handlers).
//
// Next.js renders layouts and pages in parallel, so each layout AND page that
// needs the locale calls `setRequestLocale(params.locale)` first. Nested server
// components then read it with `getLocale()` — no prop drilling, no headers()
// (which would opt the route out of static rendering).

import { cache } from "react";
import { DEFAULT_LOCALE, isLocale } from "./config";
import { createTranslator } from "./translator";
import { loadMessages } from "./messages";

const store = cache(() => ({ locale: null }));

export function setRequestLocale(locale) {
  store().locale = isLocale(locale) ? locale : DEFAULT_LOCALE;
}

export function getLocale() {
  return store().locale || DEFAULT_LOCALE;
}

/** Translator for one namespace:  const t = await getT("exams");  t("start") */
export async function getT(namespace, locale = getLocale()) {
  const messages = await loadMessages(locale, [namespace]);
  return createTranslator(locale, messages, namespace);
}

export { loadMessages };
