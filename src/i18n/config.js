// ============================================================================
// Jazira i18n configuration — the single source of truth for locales.
//
// URL strategy ("as-needed" prefix):
//   • Arabic (default) lives at the unprefixed path:  /exams/aptitude
//   • English lives under /en:                        /en/exams/aptitude
// Internally every page is rendered from app/[locale]/…; the middleware
// rewrites unprefixed requests to /ar/… so both locales are statically
// renderable and cacheable. /ar/… is never a public URL (it redirects).
// ============================================================================

export const LOCALES = ["ar", "en"];
export const DEFAULT_LOCALE = "ar";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export const LOCALE_META = {
  ar: {
    dir: "rtl",
    label: "العربية",
    short: "ع",
    ogLocale: "ar_SA",
    // Western digits everywhere (clearer for math & scores, standard in modern
    // Saudi product UIs). `nu-latn` keeps Arabic month names/words intact.
    intl: "ar-SA-u-nu-latn",
  },
  en: {
    dir: "ltr",
    label: "English",
    short: "EN",
    ogLocale: "en_US",
    intl: "en-US",
  },
};

export const isLocale = (value) => LOCALES.includes(value);
export const dirOf = (locale) => LOCALE_META[locale]?.dir || "rtl";
export const intlLocale = (locale) => LOCALE_META[locale]?.intl || LOCALE_META.ar.intl;

// Paths that are never localized (API, OAuth callback, framework assets).
const UNLOCALIZED = /^\/(api|auth\/callback|_next|_vercel)(\/|$)/;

/**
 * Split a public pathname into { locale, path } where `path` has no prefix.
 * "/en/exams" → { locale: "en", path: "/exams" };  "/exams" → { locale: "ar", path: "/exams" }
 */
export function splitLocale(pathname = "/") {
  if (pathname === "/en" || pathname.startsWith("/en/")) {
    return { locale: "en", path: pathname.slice(3) || "/" };
  }
  if (pathname === "/ar" || pathname.startsWith("/ar/")) {
    return { locale: "ar", path: pathname.slice(3) || "/" };
  }
  return { locale: DEFAULT_LOCALE, path: pathname || "/" };
}

/**
 * Localize an internal href for a target locale. External URLs, protocol-
 * relative URLs, mailto/tel, hash-only links and unlocalized paths pass through.
 * Accepts a string or a Next.js UrlObject ({ pathname, query, hash }).
 */
export function localizeHref(href, locale) {
  if (href == null) return href;
  if (typeof href === "object") {
    if (!href.pathname) return href;
    return { ...href, pathname: localizePathname(href.pathname, locale) };
  }
  if (typeof href !== "string") return href;
  if (!href.startsWith("/") || href.startsWith("//")) return href;

  // Separate path from ?query / #hash so the prefix goes in the right place.
  const cut = href.search(/[?#]/);
  const pathname = cut === -1 ? href : href.slice(0, cut);
  const suffix = cut === -1 ? "" : href.slice(cut);
  return localizePathname(pathname, locale) + suffix;
}

function localizePathname(pathname, locale) {
  if (UNLOCALIZED.test(pathname)) return pathname;
  const { path } = splitLocale(pathname); // normalise any existing prefix
  if (locale === "en") return path === "/" ? "/en" : `/en${path}`;
  return path;
}

/** Only allow same-site relative redirect targets (prevents open redirects). */
export function safeNextPath(next, fallback = "/dashboard") {
  if (typeof next !== "string") return fallback;
  // Must be a single-slash absolute path: "//host" and "/\host" are treated as
  // protocol-relative by browsers, and a value without a leading "/" (e.g.
  // "@evil.com") would turn `${origin}${next}` into a userinfo URL.
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  return next;
}
