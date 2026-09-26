// Server-side glue shared by the curriculum pages: localized catalog names,
// breadcrumbs and the copy objects the presentational components expect.
// Pure (takes a translator), no React.

import { OFFICIAL, PLAN_SOURCE } from "@/lib/curriculum";
import { crumbsFor } from "./model";

export const OFFICIAL_LINKS = { madrasati: OFFICIAL.madrasati.url, service: OFFICIAL.madrasati.serviceUrl, ien: OFFICIAL.ien.url };
export const PLAN_URL = PLAN_SOURCE.url;

/** Catalog name / title in the active language. */
export const nameOf = (node, locale) => (locale === "en" ? node?.name_en || node?.name : node?.name) || "";
export const titleOf = (node, locale) => (locale === "en" ? node?.title_en || node?.name_en : node?.title || node?.name) || nameOf(node, locale);

/** Breadcrumbs (root included) → { items: [{ label, href? }], ld: [{ name, path }] } */
export function breadcrumbs(t, slug, trail, locale) {
  const trailCrumbs = crumbsFor(slug, trail);
  const items = [{ label: t("root"), href: "/curriculum" }, ...trailCrumbs.map((c) => ({ label: nameOf(c, locale), href: c.href || undefined }))];
  const ld = [
    { name: t("root"), path: "/curriculum" },
    ...trailCrumbs
      .map((c, i) => ({ name: nameOf(c, locale), path: `/curriculum/${slug.slice(0, i + 1).join("/")}`, keep: Boolean(c.href) || i === trailCrumbs.length - 1 }))
      .filter((c) => c.keep)
      .map(({ name, path }) => ({ name, path })),
  ];
  return { items, ld };
}

/** Copy for <OfficialChannels>. */
export function channelsCopy(t, { steps = true } = {}) {
  return {
    title: t("channels.title"),
    body: t("channels.body"),
    steps: steps ? t.raw("channels.steps") || [] : [],
    open: t("channels.madrasati"),
    about: t("channels.maqarrarati"),
    ien: t("channels.ien"),
    account: t("channels.account"),
    noDeepLinks: t("channels.noDeepLinks"),
    newTab: t("channels.newTab"),
  };
}
