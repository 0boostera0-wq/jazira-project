import Skeleton, { SkeletonText } from "@/components/ui/Skeleton";

// Mirrors /competitions: main (intro · rules · podium + list) | rail (standing · climb card).
// Below xl: intro · standing · board (the page reorders rules/rail after it).
export default function Loading() {
  return (
    <div aria-busy="true" className="animate-fade flex flex-col gap-6 xl:grid xl:grid-cols-12 xl:gap-x-10">
      <div className="contents xl:col-span-8 xl:block">
        <div className="order-1 space-y-3 xl:pt-2">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-10 w-48" />
          <SkeletonText lines={2} className="max-w-xl" />
        </div>
        <div className="hidden gap-6 xl:mt-7 xl:grid xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-9 w-9" />
              <Skeleton className="h-4 w-24" />
              <SkeletonText lines={2} />
            </div>
          ))}
        </div>
        <div className="order-3 xl:mt-12">
          <Skeleton className="mb-5 h-8 w-44" />
          <div className="grid grid-cols-3 items-end gap-2.5 sm:gap-4">
            {[168, 196, 168].map((h, i) => <Skeleton key={i} rounded="lg" style={{ height: h }} />)}
          </div>
          <div className="surface-flat mt-5 divide-y divide-line/10">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3">
                <Skeleton className="h-4 w-6" />
                <Skeleton rounded="full" className="h-9 w-9" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="contents xl:col-span-4 xl:block xl:space-y-5">
        <Skeleton rounded="lg" className="order-2 h-56 sm:h-72 md:w-1/2 xl:w-auto" />
        <Skeleton rounded="lg" className="hidden h-[520px] xl:block" />
      </div>
    </div>
  );
}
