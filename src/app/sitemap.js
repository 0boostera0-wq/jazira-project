import { SITE_URL, PUBLIC_ROUTES } from "@/lib/seo";

export default function sitemap() {
  const now = new Date();
  return PUBLIC_ROUTES.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: path === "/" ? "daily" : "weekly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
