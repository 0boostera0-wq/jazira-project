// Central, localized SEO. Every public page calls `buildMetadata()` from its
// generateMetadata so titles, descriptions, canonical URLs, hreflang alternates,
// Open Graph and Twitter cards are consistent in both languages.
//
// Set NEXT_PUBLIC_SITE_URL to the production domain; falls back to the Vercel
// production URL, then the deployment URL, then localhost.

import { getT } from "@/i18n/server";
import { localizeHref, LOCALE_META } from "@/i18n/config";

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
  (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
  "http://localhost:3000"
).replace(/\/$/, "");

export const OG_IMAGE = "/og/jazira-og.png"; // 1200×630, text-free brand artwork

/** Absolute URL for a path in a locale. */
export const absoluteUrl = (path, locale = "ar") => `${SITE_URL}${localizeHref(path, locale)}`;

/**
 * @param {object} o
 * @param {"ar"|"en"} o.locale
 * @param {string} o.key        meta namespace key, e.g. "exams" → meta.pages.exams.{title,description}
 * @param {string} o.path       unprefixed path, e.g. "/exams"
 * @param {object} [o.vars]     interpolation vars for title/description
 * @param {string} [o.title]    explicit title (overrides key)
 * @param {string} [o.description]
 * @param {boolean} [o.noindex] private / auth-gated pages
 */
export async function buildMetadata({ locale, key, path, vars, title, description, noindex = false, image }) {
  const t = await getT("meta", locale);
  const pageTitle = title ?? (key ? t(`pages.${key}.title`, vars) : t("site.title"));
  const pageDesc = description ?? (key ? t(`pages.${key}.description`, vars) : t("site.description"));
  const siteName = t("site.name");
  const og = image || OG_IMAGE;

  return {
    title: key === "home" ? { absolute: pageTitle } : pageTitle,
    description: pageDesc,
    alternates: {
      canonical: localizeHref(path, locale),
      languages: {
        ar: localizeHref(path, "ar"),
        en: localizeHref(path, "en"),
        "x-default": localizeHref(path, "ar"),
      },
    },
    openGraph: {
      type: "website",
      siteName,
      title: pageTitle,
      description: pageDesc,
      url: localizeHref(path, locale),
      locale: LOCALE_META[locale].ogLocale,
      alternateLocale: [LOCALE_META[locale === "ar" ? "en" : "ar"].ogLocale],
      images: [{ url: og, width: 1200, height: 630, alt: siteName }],
    },
    twitter: { card: "summary_large_image", title: pageTitle, description: pageDesc, images: [og] },
    robots: noindex ? { index: false, follow: false } : { index: true, follow: true },
  };
}

/** Organization + WebSite JSON-LD (rendered once by the locale layout). */
export function organizationJsonLd({ name, description, locale }) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "EducationalOrganization",
        "@id": `${SITE_URL}/#organization`,
        name,
        url: SITE_URL,
        description,
        logo: `${SITE_URL}/icon.svg`,
        areaServed: "SA",
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: absoluteUrl("/", locale),
        name,
        description,
        inLanguage: locale,
        publisher: { "@id": `${SITE_URL}/#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: `${absoluteUrl("/search", locale)}?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}

/** FAQPage JSON-LD from [{ q, a }]. */
export function faqJsonLd(items) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: (items || []).map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
}

/** BreadcrumbList JSON-LD from [{ name, path }]. */
export function breadcrumbJsonLd(items, locale) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: absoluteUrl(it.path, locale),
    })),
  };
}

/** Safe JSON-LD serialisation (prevents </script> injection from content). */
export const jsonLd = (obj) => JSON.stringify(obj).replace(/</g, "\\u003c");

// Public, indexable routes (unprefixed). The sitemap emits both locales.
export const PUBLIC_ROUTES = [
  "/", "/about", "/faq", "/contact", "/support", "/reviews",
  "/curriculum", "/elementary", "/middle", "/high-school",
  "/exams", "/exams/aptitude", "/exams/achievement",
  "/community", "/subscriptions", "/competitions",
  "/privacy", "/terms", "/refund", "/acceptable-use", "/community-guidelines",
  "/sign-in", "/sign-up",
];
