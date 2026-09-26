import Skeleton, { SkeletonText } from "@/components/ui/Skeleton";
import { FeedColumnSkeleton, RailSkeleton } from "@/components/community/skeletons";

// Mirrors /tags/[tag]: back link · tag header (icon, title, lead, count) · feed + rail.
export default function Loading() {
  return (
    <div aria-busy="true" className="animate-fade">
      <Skeleton className="mb-4 h-4 w-32" />
      <div className="surface flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-7">
        <Skeleton rounded="lg" className="h-14 w-14 shrink-0" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-9 w-48" />
          <SkeletonText lines={1} className="max-w-lg" />
        </div>
        <Skeleton rounded="full" className="h-10 w-32" />
      </div>
      <div className="mt-6 grid gap-6 lg:mt-8 lg:grid-cols-12 lg:gap-8">
        <div className="min-w-0 lg:col-span-8"><FeedColumnSkeleton filters={false} /></div>
        <div className="hidden lg:col-span-4 lg:block"><RailSkeleton /></div>
      </div>
    </div>
  );
}
