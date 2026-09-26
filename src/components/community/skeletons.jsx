import Skeleton, { SkeletonText } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";

// Server-safe placeholders shared by loading.js files and client islands, so
// the route skeleton and the in-page skeleton are the same shapes.

export function PostSkeleton({ media = false, className }) {
  return (
    <div className={cn("surface p-4 sm:p-5", className)} aria-hidden="true">
      <div className="flex items-center gap-3">
        <Skeleton rounded="full" className="h-[42px] w-[42px] shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <SkeletonText lines={3} className="mt-4" />
      {media && <Skeleton rounded="md" className="mt-4 aspect-[16/10] w-full" />}
      <div className="mt-4 flex gap-2">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} rounded="full" className="h-9 w-14" />)}
      </div>
    </div>
  );
}

export function FeedColumnSkeleton({ composer = true, filters = true }) {
  return (
    <div className="space-y-4" aria-hidden="true">
      {composer && (
        <div className="surface p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <Skeleton rounded="full" className="h-[42px] w-[42px] shrink-0" />
            <Skeleton rounded="full" className="h-12 flex-1" />
          </div>
          <div className="mt-3.5 grid grid-cols-2 gap-2 sm:flex">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} rounded="full" className="h-11 sm:h-9 sm:w-32" />)}
          </div>
        </div>
      )}
      {filters && (
        <div className="space-y-2.5">
          <div className="flex gap-2 overflow-hidden">
            {[52, 96, 88, 76, 92, 72].map((w, i) => <Skeleton key={i} rounded="full" className="h-9 shrink-0" style={{ width: w }} />)}
          </div>
          <div className="flex gap-1.5 overflow-hidden">
            {[72, 64, 68, 70, 74, 62, 70, 76].map((w, i) => <Skeleton key={i} rounded="full" className="h-8 shrink-0" style={{ width: w }} />)}
          </div>
        </div>
      )}
      <PostSkeleton />
      <PostSkeleton media />
      <PostSkeleton />
    </div>
  );
}

export function RailSkeleton() {
  return (
    <div className="space-y-5" aria-hidden="true">
      <Skeleton rounded="lg" className="h-56" />
      <Skeleton rounded="lg" className="h-72" />
      <Skeleton rounded="lg" className="h-64" />
    </div>
  );
}
