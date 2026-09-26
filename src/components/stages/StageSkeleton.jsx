import Skeleton, { SkeletonText } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import { SECTION_GAP } from "./parts";

/**
 * Loading body for the stage pages — mirrors the real layout: breadcrumb row,
 * split hero (8/4 from md, 7/5 from xl), a row of grade cards, then the
 * subjects bento (side by side from xl).
 *   grades   number of grade-card placeholders
 */
export default function StageSkeleton({ grades = 3 }) {
  return (
    <div aria-busy="true" className="animate-fade">
      {/* breadcrumbs + year */}
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-3.5 w-40" />
        <Skeleton rounded="full" className="h-7 w-36" />
      </div>

      {/* hero */}
      <div className="mt-6 grid items-center gap-x-8 gap-y-8 sm:mt-8 md:grid-cols-12 xl:gap-x-14">
        <div className="md:col-span-8 xl:col-span-7">
          <Skeleton className="h-3.5 w-48" />
          <Skeleton className="mt-4 h-10 w-11/12 max-w-lg" />
          <Skeleton className="mt-3 h-10 w-2/3 max-w-sm" />
          <SkeletonText lines={3} className="mt-6 max-w-xl" />
          <div className="mt-7 flex flex-wrap gap-3">
            <Skeleton rounded="full" className="h-12 w-40" />
            <Skeleton rounded="full" className="h-12 w-48" />
          </div>
          <div className="mt-9 grid max-w-xl grid-cols-3 gap-5 border-t border-line/12 pt-5">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-7 w-10" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
        </div>
        <Skeleton rounded="lg" className="hidden aspect-[4/3] w-full md:col-span-4 md:block xl:col-span-5" />
      </div>

      {/* grades */}
      <div className={SECTION_GAP}>
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="mt-3 h-8 w-56" />
        <Skeleton className="mt-3 h-4 w-full max-w-lg" />
        <div className={grades > 3 ? "mt-8 grid gap-2.5 sm:grid-cols-3 sm:gap-3 xl:gap-4" : "mt-8 grid gap-4 xl:grid-cols-3 xl:gap-5"}>
          {Array.from({ length: grades }, (_, i) => (
            <Skeleton key={i} rounded="lg" className={grades > 3 ? "h-20 sm:h-[5.5rem]" : "h-28 xl:h-40"} />
          ))}
        </div>
      </div>

      {/* subjects bento */}
      <div className={cn(SECTION_GAP, "grid gap-4 xl:grid-cols-12 xl:gap-5")}>
        <Skeleton rounded="lg" className="h-64 xl:col-span-7 xl:h-80" />
        <Skeleton rounded="lg" className="h-64 xl:col-span-5 xl:h-80" />
      </div>
    </div>
  );
}
