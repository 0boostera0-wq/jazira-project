import SearchLayout, { SearchHeader, SearchMainSkeleton, SearchRailSkeleton } from "@/components/search/SearchLayout";

// Mirrors /search: title · field + tabs · browse blocks (main) | recent, scope, shortcuts (rail).
export default function Loading() {
  return (
    <div aria-busy="true" className="animate-fade">
      <SearchLayout header={<SearchHeader />} main={<SearchMainSkeleton />} rail={<SearchRailSkeleton />} />
    </div>
  );
}
