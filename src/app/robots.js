import { SITE_URL } from "@/lib/seo";

export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Don't waste crawl budget on auth-gated / API / callback routes.
        disallow: ["/dashboard", "/settings", "/profile-setup", "/api/", "/auth/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
