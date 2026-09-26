import Skeleton, { SkeletonText } from "@/components/ui/Skeleton";

// Mirrors /settings: split header · (desktop) section rail + open section with
// cards · (phones) account card + grouped section list.
export default function Loading() {
  return (
    <div aria-busy="true" className="animate-fade">
      <div className="mb-6 flex flex-col gap-5 sm:mb-8 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
        <div className="w-full max-w-2xl space-y-3">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-10 w-44" />
          <SkeletonText lines={1} className="max-w-lg" />
        </div>
        <Skeleton rounded="lg" className="hidden h-[84px] w-[340px] shrink-0 lg:block" />
      </div>

      {/* phones: account + section list */}
      <div className="space-y-6 lg:hidden">
        <Skeleton rounded="lg" className="h-[88px] w-full" />
        {[2, 3, 1].map((n, g) => (
          <div key={g} className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <div className="surface divide-y divide-line/10 overflow-hidden">
              {Array.from({ length: n }, (_, i) => (
                <div key={i} className="flex items-center gap-3.5 px-4 py-3.5">
                  <Skeleton rounded="sm" className="h-9 w-9 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-48 max-w-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* desktop: rail + open section */}
      <div className="hidden lg:grid lg:grid-cols-12 lg:gap-8 xl:gap-10">
        <div className="space-y-5 lg:col-span-4 xl:col-span-3">
          {[2, 3, 1].map((n, g) => (
            <div key={g} className="space-y-1.5">
              <Skeleton className="mx-3 h-3 w-16" />
              {Array.from({ length: n }, (_, i) => <Skeleton key={i} rounded="md" className="h-11 w-full" />)}
            </div>
          ))}
        </div>
        <div className="space-y-5 lg:col-span-8 xl:col-span-9">
          <div className="space-y-2.5">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          {[3, 2].map((rows, c) => (
            <div key={c} className="surface overflow-hidden">
              <div className="flex items-center gap-3.5 border-b border-line/10 px-6 py-4">
                <Skeleton rounded="sm" className="h-9 w-9" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-64" />
                </div>
              </div>
              {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="grid grid-cols-[2fr_3fr] gap-8 border-b border-line/10 px-6 py-5 last:border-0">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-52" />
                  </div>
                  <Skeleton rounded="md" className="h-11 w-full" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
