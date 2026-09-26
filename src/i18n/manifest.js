// Localized web app manifest, served per locale by
// app/[locale]/app.webmanifest/route.js and linked by the locale layout, so an
// English visitor who installs the app gets an English name and launches /en
// (and an Arabic one gets the Arabic name, RTL, and launches /).

import { dirOf, localizeHref } from "./config";
import { getT } from "./server";

export async function localizedManifest(locale) {
  const t = await getT("meta", locale);
  const start = localizeHref("/", locale);
  return {
    id: start,
    name: t("site.name"),
    short_name: t("site.shortName"),
    description: t("site.description"),
    lang: locale,
    dir: dirOf(locale),
    start_url: start,
    // Arabic owns the unprefixed URL space; English is scoped to /en
    scope: locale === "en" ? "/en" : "/",
    display: "standalone",
    background_color: "#FAF7F0",
    theme_color: "#FAF7F0",
    categories: ["education"],
    // The Jazira app icon (docs/BRAND.md): SVG for modern browsers, PNGs for
    // install surfaces, and a maskable variant with the mark inside the safe zone.
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/images/brand/jazira-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/images/brand/jazira-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/images/brand/jazira-icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}

/** Public URL of the manifest for a locale (linked from the locale layout's metadata). */
export const manifestHref = (locale) => `/${locale === "en" ? "en" : "ar"}/app.webmanifest`;
