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
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}

/** Public URL of the manifest for a locale (linked from the locale layout's metadata). */
export const manifestHref = (locale) => `/${locale === "en" ? "en" : "ar"}/app.webmanifest`;
