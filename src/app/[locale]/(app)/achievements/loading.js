import Skeleton, { SkeletonText } from "@/components/ui/Skeleton";

// Mirrors /achievements: hero (text + summary | art) · badges (main) + streak rail
// (rail above the gallery below xl, its two cards side by side from md).
export default function Loading() {
  return (
    <div aria-busy="true" className="animate-fade">
      <div className="surface grid overflow-hidden lg:grid-cols-12">
        <div className="space-y-3 p-5 sm:p-8 lg:col-span-7 xl:p-10">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-10 w-56" />
          <SkeletonText lines={2} className="max-w-xl" />
          <div className="flex items-center gap-6 pt-6">
            <Skeleton rounded="full" className="h-[104px] w-[104px] shrink-0" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-9 w-40" />
              <Skeleton rounded="full" className="h-2 w-full max-w-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-4 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} rounded="md" className="h-[72px]" />)}
          </div>
        </div>
        <div className="hidden bg-surface-2 lg:col-span-5 lg:block" />
      </div>
      <div className="mt-6 grid gap-6 sm:mt-8 lg:mt-10 xl:grid-cols-12 xl:gap-8">
        <div className="grid content-start gap-5 md:grid-cols-2 xl:col-span-4 xl:col-start-9 xl:row-start-1 xl:grid-cols-1">
          <Skeleton rounded="lg" className="h-[440px]" />
          <Skeleton rounded="lg" className="hidden h-64 md:block" />
        </div>
        <div className="xl:col-span-8 xl:col-start-1 xl:row-start-1">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="mt-3 h-4 w-80 max-w-full" />
          <Skeleton rounded="full" className="mt-6 h-11 w-full md:hidden" />
          <Skeleton className="mt-6 hidden h-5 w-28 md:block" />
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} rounded="lg" className={i > 2 ? "hidden h-[172px] sm:block" : "h-[92px] sm:h-[172px]"} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
