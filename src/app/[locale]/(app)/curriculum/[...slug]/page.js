import { notFound } from "next/navigation";
import { setRequestLocale, getT } from "@/i18n/server";
import { buildMetadata, breadcrumbJsonLd, jsonLd } from "@/lib/seo";
import { YEAR, allCurriculumPaths, isAlias, isLeaf, resolveCurriculum } from "@/lib/curriculum";
import { breadcrumbs, titleOf } from "@/components/curriculum/copy";
import StageView from "@/components/curriculum/views/StageView";
import HighSchoolView from "@/components/curriculum/views/HighSchoolView";
import BranchView from "@/components/curriculum/views/BranchView";
import LeafView from "@/components/curriculum/views/LeafView";
import PendingView from "@/components/curriculum/views/PendingView";

// Every node of the catalog is prerendered in both languages; anything else is
// a 404. The catalog is static data, so nothing here reads cookies or headers.
// Alias branches (high school year 1 → the common first year) are not pages:
// ../high-school/grade-1/route.js answers them with a real 308.
export const dynamicParams = false;

export function generateStaticParams() {
  return allCurriculumPaths({ includePending: true }).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const r = resolveCurriculum(params.slug);
  if (!r?.node || isAlias(r.node)) return {};
  const t = await getT("curriculum", params.locale);
  const name = titleOf(r.node, params.locale);
  const pending = Boolean(r.trail[0]?.pending);
  return buildMetadata({
    locale: params.locale,
    key: "curriculumNode",
    vars: { name },
    description: t(pending ? "seo.pending" : "seo.node", { name, year: YEAR }),
    path: `/curriculum/${params.slug.join("/")}`,
    // Unverified programmes (no subjects yet) are not indexed.
    noindex: pending,
  });
}

export default async function CurriculumNodePage({ params }) {
  setRequestLocale(params.locale);
  const { locale } = params;
  const slug = params.slug || [];
  const r = resolveCurriculum(slug);
  if (!r?.node || isAlias(r.node)) notFound();
  const { node, trail } = r;

  const t = await getT("curriculum");
  const { ld } = breadcrumbs(t, slug, trail, locale);
  const props = { slug, node, trail, locale };
  const stage = trail[0];

  let view;
  if (stage.pending) view = <PendingView {...props} />;
  else if (isLeaf(node)) view = <LeafView {...props} />;
  else if (slug.length === 1) view = stage.id === "high-school" ? <HighSchoolView {...props} /> : <StageView {...props} />;
  else view = <BranchView {...props} />;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd(ld, locale)) }} />
      {view}
    </>
  );
}
