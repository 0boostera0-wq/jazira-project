import Skeleton, { SkeletonText } from "@/components/ui/Skeleton";

function PanelSkeleton({ children, className = "" }) {
  return (
    <div className={`surface p-5 sm:p-6 ${className}`}>
      <Skeleton className="h-5 w-40" />
      <div className="mt-4">{children}</div>
    </div>
  );
}

/** Route-level skeleton (loading.js): mirrors DashboardView's main + rail composition. */
export default function DashboardSkeleton() {
  return (
    <div aria-busy="true" className="animate-fade grid gap-5 lg:gap-6 xl:grid-cols-12 xl:gap-8">
      <div className="min-w-0 space-y-5 lg:space-y-6 xl:col-span-8">
        <div className="surface overflow-hidden">
          <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,13.5rem)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
            <div className="p-5 sm:p-7 sm:pb-6">
              <Skeleton className="h-3.5 w-36" />
              <Skeleton className="mt-3 h-9 w-3/4 max-w-sm" />
              <SkeletonText lines={1} className="mt-4 max-w-md" />
              <div className="mt-5 flex gap-2.5">
                <Skeleton rounded="full" className="h-11 w-40" />
                <Skeleton rounded="full" className="h-11 w-36" />
              </div>
            </div>
            <div className="hidden bg-[#F7F0E3] sm:block dark:bg-surface-2" />
          </div>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-line/10 bg-surface-2/40 px-5 py-4 sm:px-7">
            <div className="flex items-center gap-3.5">
              <Skeleton rounded="full" className="h-16 w-16 shrink-0" />
              <div className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-3 w-36" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Skeleton rounded="md" className="h-11 w-11" />
              <div className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-20" />
              </div>
            </div>
          </div>
        </div>

        <PanelSkeleton>
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton rounded="md" className="h-[132px]" />
            <Skeleton rounded="md" className="h-[132px]" />
          </div>
        </PanelSkeleton>

        <PanelSkeleton>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} rounded="md" className="h-[92px]" />)}
          </div>
          <Skeleton rounded="md" className="mt-6 h-[120px]" />
        </PanelSkeleton>
      </div>

      <div className="grid min-w-0 content-start gap-5 md:grid-cols-2 md:items-start lg:gap-6 xl:col-span-4 xl:grid-cols-1">
        <div className="surface p-5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-2 h-5 w-32" />
          <Skeleton rounded="md" className="mt-4 h-[86px]" />
          <Skeleton rounded="full" className="mt-4 h-9 w-full" />
        </div>
        <PanelSkeleton className="sm:p-5">
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton rounded="sm" className="h-9 w-9 shrink-0" />
                <div className="flex-1 space-y-2 pt-0.5">
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </PanelSkeleton>
        <Skeleton rounded="lg" className="h-40" />
      </div>
    </div>
  );
}
