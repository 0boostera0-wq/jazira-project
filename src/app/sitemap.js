import { SITE_URL, PUBLIC_ROUTES } from "@/lib/seo";
import { localizeHref } from "@/i18n/config";
import { allCurriculumPaths } from "@/lib/curriculum";

// Both locales for every public route, with hreflang alternates.
export default function sitemap() {
  const now = new Date();
  const curriculum = allCurriculumPaths().map((segs) => `/curriculum/${segs.join("/")}`);
  return [...PUBLIC_ROUTES, ...curriculum].flatMap((path) =>
    ["ar", "en"].map((locale) => ({
      url: `${SITE_URL}${localizeHref(path, locale)}`,
      lastModified: now,
      changeFrequency: path === "/" ? "daily" : "weekly",
      priority: path === "/" ? 1 : path.startsWith("/curriculum/") ? 0.5 : 0.7,
      alternates: {
        languages: {
          ar: `${SITE_URL}${localizeHref(path, "ar")}`,
          en: `${SITE_URL}${localizeHref(path, "en")}`,
        },
      },
    }))
  );
}
