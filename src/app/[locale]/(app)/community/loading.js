import Skeleton, { SkeletonText } from "@/components/ui/Skeleton";
import { FeedColumnSkeleton, RailSkeleton } from "@/components/community/skeletons";

// Mirrors /community: split header · feed column (composer, chips, posts) + rail.
export default function Loading() {
  return (
    <div aria-busy="true" className="animate-fade">
      <div className="surface grid overflow-hidden lg:grid-cols-12">
        <div className="space-y-3 p-5 sm:p-7 lg:col-span-8 xl:p-9">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-10 w-64 max-w-full" />
          <SkeletonText lines={2} className="max-w-xl" />
          <div className="hidden gap-6 pt-3 sm:flex">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-7 w-36" rounded="full" />)}
          </div>
        </div>
        <div className="hidden bg-surface-2 lg:col-span-4 lg:block" />
      </div>
      <div className="mt-6 grid gap-6 lg:mt-8 lg:grid-cols-12 lg:gap-8">
        <div className="min-w-0 lg:col-span-8"><FeedColumnSkeleton /></div>
        <div className="hidden lg:col-span-4 lg:block"><RailSkeleton /></div>
      </div>
    </div>
  );
}
