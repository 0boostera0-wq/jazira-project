import Skeleton, { SkeletonText } from "@/components/ui/Skeleton";

// Mirrors /notifications: title + actions · filter tabs · day groups (main) · preferences + tip rail
// (side by side under the list on tablets, a stacked rail on desktop).
export default function Loading() {
  return (
    <div aria-busy="true" className="animate-fade lg:grid lg:grid-cols-12 lg:gap-8 xl:gap-10">
      <div className="min-w-0 lg:col-span-8">
        <div className="mb-6 flex flex-col gap-4 sm:mb-7 sm:flex-row sm:items-end sm:justify-between">
          <div className="w-full max-w-xl space-y-3">
            <Skeleton className="h-10 w-44" />
            <SkeletonText lines={1} className="max-w-md" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton rounded="full" className="h-9 w-40 shrink-0" />
        </div>
        <Skeleton rounded="full" className="mb-5 h-11 w-80 max-w-full" />
        <div className="space-y-6">
          {[3, 4].map((n, s) => (
            <div key={s}>
              <Skeleton className="mb-2 ms-1 h-3 w-14" />
              <div className="surface divide-y divide-line/10 overflow-hidden">
                {Array.from({ length: n }, (_, i) => (
                  <div key={i} className="flex gap-4 px-5 py-4">
                    <Skeleton rounded="full" className="h-11 w-11 shrink-0" />
                    <div className="flex-1 space-y-2 pt-0.5">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-10 grid gap-5 md:grid-cols-2 lg:col-span-4 lg:mt-0 lg:grid-cols-1">
        <Skeleton rounded="lg" className="h-[420px] w-full" />
        <Skeleton rounded="lg" className="hidden h-[360px] w-full md:block" />
      </div>
    </div>
  );
}
