import Skeleton, { SkeletonGrid, SkeletonText } from "@/components/ui/Skeleton";

/**
 * Generic in-app loading body: header block + stat row + card grid. Routes
 * with a distinctive layout should ship their own loading.js mirroring it.
 */
export default function PageSkeleton({ stats = true, cards = 6, rail = false }) {
  return (
    <div aria-busy="true" className="animate-fade">
      <div className="mb-8 space-y-3">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-9 w-2/3 max-w-md" />
        <SkeletonText lines={1} className="max-w-xl" />
      </div>
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} rounded="lg" className="h-24" />)}
        </div>
      )}
      <div className={rail ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]" : ""}>
        <SkeletonGrid count={cards} />
        {rail && <div className="hidden space-y-4 lg:block"><Skeleton rounded="lg" className="h-48" /><Skeleton rounded="lg" className="h-64" /></div>}
      </div>
    </div>
  );
}
