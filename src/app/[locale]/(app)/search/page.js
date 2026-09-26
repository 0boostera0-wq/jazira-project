import { Suspense } from "react";
import { setRequestLocale, getT } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import { buildMetadata } from "@/lib/seo";
import SearchLayout, { SearchHeader, SearchMainSkeleton } from "@/components/search/SearchLayout";
import SearchExperience from "@/components/search/SearchExperience";
import SearchRail from "@/components/search/SearchRail";
import RecentSearches from "@/components/search/RecentSearches";
import BrowseIdle from "@/components/search/BrowseIdle";
import SuggestLinks from "@/components/search/SuggestLinks";
import { practiceCatalog, scopeStats, stageSummaries } from "@/components/search/catalog.server";

export async function generateMetadata(props) {
  const params = await props.params;
  return buildMetadata({ locale: params.locale, key: "search", path: "/search", noindex: true });
}

// /search?q=&tab= — the shell (title, rail, browse blocks) renders on the
// server from the catalogs; the query, tabs and results are one client island
// that reads the URL, so the page itself stays static.
export default async function SearchPage(props) {
  const params = await props.params;
  setRequestLocale(params.locale);
  const locale = params.locale;
  const [t, practice] = await Promise.all([getT("search"), practiceCatalog()]);
  const stages = stageSummaries(locale);

  const header = <SearchHeader eyebrow={t("page.eyebrow")} title={t("page.title")} lead={t("page.lead")} />;
  const railStatic = <SearchRail stats={scopeStats()} />;
  // Until the island mounts: the same rail, with the (device-only) recent-searches card still loading, so nothing shifts.
  const railFallback = (
    <>
      <RecentSearches className="hidden lg:block" items={[]} ready={false} />
      {railStatic}
    </>
  );

  return (
    <Messages ns={["search"]}>
      <Suspense fallback={<SearchLayout header={header} main={<SearchMainSkeleton />} rail={railFallback} />}>
        <SearchExperience
          header={header}
          railStatic={railStatic}
          practice={practice}
          idle={<BrowseIdle locale={locale} stages={stages} practice={practice} />}
          suggest={<SuggestLinks locale={locale} stages={stages} practice={practice} />}
        />
      </Suspense>
    </Messages>
  );
}
