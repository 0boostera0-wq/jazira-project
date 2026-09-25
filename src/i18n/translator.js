// Pure, dependency-free translator shared by server and client.
//
// Messages are nested objects grouped by namespace:
//   { common: { actions: { save: "حفظ" } }, exams: { start: "ابدأ" } }
//
// Features
//   • dot-path lookup:            t("actions.save")
//   • interpolation:              "{count} سؤال"  +  { count: 5 }
//   • CLDR plurals (Arabic has zero/one/two/few/many/other):
//        { one: "سؤال واحد", two: "سؤالان", few: "{count} أسئلة", other: "{count} سؤالًا" }
//     selected with Intl.PluralRules on `vars.count`.
//   • arrays / objects are returned as-is via t.raw(key) (lists of perks, FAQs…)
//
// A missing key never throws. In development it warns and returns the key so
// the gap is obvious; in production it returns "" so no raw key leaks to users.

import { intlLocale } from "./config";

const isDev = process.env.NODE_ENV !== "production";
const PLURAL_KEYS = ["zero", "one", "two", "few", "many", "other"];
const pluralCache = new Map();

function pluralRules(locale) {
  if (!pluralCache.has(locale)) pluralCache.set(locale, new Intl.PluralRules(intlLocale(locale)));
  return pluralCache.get(locale);
}

function lookup(messages, path) {
  let node = messages;
  for (const part of path.split(".")) {
    if (node == null || typeof node !== "object") return undefined;
    node = node[part];
  }
  return node;
}

function isPluralObject(v) {
  return v && typeof v === "object" && !Array.isArray(v) && "other" in v &&
    Object.keys(v).every((k) => PLURAL_KEYS.includes(k));
}

function formatValue(value, locale, vars) {
  if (vars && typeof vars.count === "number" && isPluralObject(value)) {
    const n = vars.count;
    // Explicit zero wins for every locale (e.g. "لا توجد أسئلة").
    const cat = n === 0 && value.zero ? "zero" : pluralRules(locale).select(n);
    value = value[cat] ?? value.other;
  }
  if (typeof value !== "string") return value;
  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (m, name) => {
    const v = vars[name];
    if (v == null) return m;
    if (typeof v === "number") return new Intl.NumberFormat(intlLocale(locale)).format(v);
    return String(v);
  });
}

/**
 * Build a translator bound to a locale, a message tree and an optional namespace.
 * @returns {(key: string, vars?: object) => string} with `.raw(key)` and `.has(key)`
 */
export function createTranslator(locale, messages, namespace) {
  const resolve = (key) => lookup(messages, namespace ? `${namespace}.${key}` : key);

  function t(key, vars) {
    const value = resolve(key);
    if (value === undefined || (typeof value === "object" && !isPluralObject(value))) {
      if (isDev) {
        // eslint-disable-next-line no-console
        console.warn(`[i18n] missing ${locale}:${namespace ? namespace + "." : ""}${key}`);
        return key;
      }
      return "";
    }
    return formatValue(value, locale, vars);
  }

  t.raw = (key) => resolve(key);
  t.has = (key) => resolve(key) !== undefined;
  t.locale = locale;
  return t;
}
