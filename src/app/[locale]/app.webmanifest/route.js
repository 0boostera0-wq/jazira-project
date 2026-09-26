import { isLocale } from "@/i18n/config";
import { localizedManifest } from "@/i18n/manifest";

// Localized web app manifest: /ar/app.webmanifest and /en/app.webmanifest,
// linked by app/[locale]/layout.js for the page's locale. (Deliberately not the
// app/manifest.* file convention: Next links that one from every page and it
// overrides the per-locale link.) The middleware skips paths with a dot, so
// /ar/… is served here rather than redirected. Static per locale.
// Next 15 no longer caches GET route handlers by default — this one is static.
export const dynamic = "force-static";
export const dynamicParams = false;
export function generateStaticParams() {
  return [{ locale: "ar" }, { locale: "en" }];
}

export async function GET(_req, props) {
  const params = await props.params;
  const locale = isLocale(params?.locale) ? params.locale : "ar";
  return new Response(JSON.stringify(await localizedManifest(locale)), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
