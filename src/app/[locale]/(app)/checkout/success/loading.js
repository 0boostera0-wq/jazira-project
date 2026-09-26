import Skeleton, { SkeletonText } from "@/components/ui/Skeleton";

// Mirrors the payment-status page: status card + notes beside the plan/help rail.
export default function Loading() {
  return (
    <div aria-busy="true" className="animate-fade">
      <Skeleton className="mb-5 h-3.5 w-44 sm:mb-6" />
      <div className="grid gap-x-8 gap-y-5 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-7">
          <div className="surface p-6 sm:p-8">
            <Skeleton rounded="full" className="h-16 w-16" />
            <Skeleton className="mt-6 h-3.5 w-24" />
            <Skeleton className="mt-3 h-8 w-2/3" />
            <SkeletonText lines={2} className="mt-4" />
            <div className="mt-7 space-y-3">
              {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-7 w-56 max-w-full" />)}
            </div>
          </div>
          <Skeleton rounded="lg" className="h-44" />
        </div>
        <div className="space-y-5 lg:col-span-5">
          <Skeleton rounded="lg" className="h-[28rem]" />
          <Skeleton rounded="lg" className="h-36" />
        </div>
      </div>
    </div>
  );
}
