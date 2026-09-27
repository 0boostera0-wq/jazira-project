import { SITE_URL, PUBLIC_ROUTES } from "@/lib/seo";
import { localizeHref } from "@/i18n/config";
import { allCurriculumPaths } from "@/lib/curriculum";
import { OUTLINE_LEAVES, loadOutline } from "@/lib/curriculum-outline";

/**
 * /learn/<subject> pages of every leaf with a generated outline: catalog-
 * backed subjects only (source-only iEN subjects are not pages). Lessons are
 * reachable from them and are not listed (10k+ URLs of thin pages).
 */
async function learnSubjectPaths() {
  const trees = await Promise.all(OUTLINE_LEAVES.map((leaf) => loadOutline(leaf).catch(() => null)));
  const out = [];
  for (const tree of trees) {
    if (!tree) continue;
    for (const n of tree.nodes()) {
      if (n.kind === "subject" && n.status === "verified" && tree.lessonsUnder(n.id).length > 0) out.push(`/learn/${n.id}`);
    }
  }
  return out.sort();
}

// Both locales for every public route, with hreflang alternates.
export default async function sitemap() {
  const now = new Date();
  const curriculum = allCurriculumPaths().map((segs) => `/curriculum/${segs.join("/")}`);
  const learn = await learnSubjectPaths();
  return [...PUBLIC_ROUTES, ...curriculum, ...learn].flatMap((path) =>
    ["ar", "en"].map((locale) => ({
      url: `${SITE_URL}${localizeHref(path, locale)}`,
      lastModified: now,
      changeFrequency: path === "/" ? "daily" : "weekly",
      priority: path === "/" ? 1 : path.startsWith("/curriculum/") || path.startsWith("/learn/") ? 0.5 : 0.7,
      alternates: {
        languages: {
          ar: `${SITE_URL}${localizeHref(path, "ar")}`,
          en: `${SITE_URL}${localizeHref(path, "en")}`,
        },
      },
    }))
  );
}
