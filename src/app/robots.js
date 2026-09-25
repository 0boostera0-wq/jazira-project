import { SITE_URL } from "@/lib/seo";

const PRIVATE = [
  "/dashboard", "/settings", "/profile", "/profile-setup", "/notifications", "/chat",
  "/assistant", "/checkout", "/exams/attempt", "/exams/history", "/search",
  "/auth/", "/api/",
];

export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [...PRIVATE, ...PRIVATE.filter((p) => !p.startsWith("/api") && !p.startsWith("/auth")).map((p) => `/en${p}`)],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
