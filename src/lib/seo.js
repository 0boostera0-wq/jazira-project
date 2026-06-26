// Central SEO config. Set NEXT_PUBLIC_SITE_URL to your production domain so
// canonical URLs, sitemap, robots, and Open Graph point at the real site.
// Falls back to the Vercel deployment URL, then localhost (dev).
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const SITE_NAME = "منصة جزيرة";
export const SITE_DESC =
  "منصة جزيرة التعليمية التفاعلية — اختبارات القدرات والتحصيلي، مسارات دراسية لكل المراحل، مساعد ذكي، ومجتمع تعليمي فاخر.";
export const OG_IMAGE = "/illustrations/hero-main.png";

// Public, crawlable routes (auth-gated app pages are intentionally excluded).
export const PUBLIC_ROUTES = [
  "/", "/sign-in", "/sign-up", "/about", "/faq", "/support",
  "/reviews", "/subscriptions", "/community",
  "/elementary", "/middle", "/high-school", "/competitions", "/achievements",
];

// Organization + WebSite JSON-LD graph (rendered once in the root layout).
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "EducationalOrganization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        description: SITE_DESC,
        logo: `${SITE_URL}${OG_IMAGE}`,
        inLanguage: "ar",
        areaServed: "SA",
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        description: SITE_DESC,
        inLanguage: "ar",
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
    ],
  };
}

// FAQPage JSON-LD from {q, a} pairs (rich-snippet eligible).
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
