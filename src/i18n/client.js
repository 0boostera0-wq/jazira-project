"use client";

// Client-side i18n: context provider + hooks.
//
// The root layout provides `common` + `nav`. Pages add the namespaces their
// client components need with the server component <Messages ns={[...]}> from
// "@/i18n/WithMessages", which nests a <MessagesProvider> that MERGES into the
// parent context — so each route only ships the strings it actually uses.

import { createContext, useContext, useMemo } from "react";
import { createTranslator } from "./translator";
import { dirOf, intlLocale } from "./config";

const I18nContext = createContext(null);

export function I18nProvider({ locale, messages, children }) {
  const value = useMemo(() => ({ locale, messages }), [locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Nested provider — merges extra namespaces into the parent tree. */
export function MessagesProvider({ messages, children }) {
  const parent = useContext(I18nContext);
  const value = useMemo(
    () => ({ locale: parent.locale, messages: { ...parent.messages, ...messages } }),
    [parent, messages]
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT/useLocale must be used inside <I18nProvider>");
  return ctx;
}

/** const t = useT("exams"); t("start")   |   const t = useT(); t("common.actions.save") */
export function useT(namespace) {
  const { locale, messages } = useI18n();
  return useMemo(() => createTranslator(locale, messages, namespace), [locale, messages, namespace]);
}

/** { locale, dir, isRTL, intl } */
export function useLocale() {
  const { locale } = useI18n();
  return useMemo(() => {
    const dir = dirOf(locale);
    return { locale, dir, isRTL: dir === "rtl", intl: intlLocale(locale) };
  }, [locale]);
}
