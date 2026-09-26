import Skeleton, { SkeletonText } from "@/components/ui/Skeleton";

// Mirrors checkout: header, then order summary + steps beside the included/trust rail.
export default function Loading() {
  return (
    <div aria-busy="true" className="animate-fade">
      <div className="mb-6 space-y-3 sm:mb-8">
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="h-10 w-64 max-w-full" />
        <SkeletonText lines={2} className="max-w-2xl" />
      </div>
      <div className="grid gap-x-8 gap-y-5 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-7">
          <div className="surface space-y-5 p-5 sm:p-7">
            <Skeleton className="h-5 w-32" />
            <div className="flex items-center gap-3.5">
              <Skeleton rounded="md" className="h-11 w-11 shrink-0" />
              <SkeletonText lines={2} className="flex-1" />
            </div>
            <Skeleton className="h-8 w-full" />
            <Skeleton rounded="full" className="h-12 w-full" />
            <Skeleton className="mx-auto h-3.5 w-2/3" />
          </div>
          <Skeleton rounded="lg" className="h-48" />
        </div>
        <div className="space-y-5 lg:col-span-5">
          <Skeleton rounded="lg" className="h-96" />
          <Skeleton rounded="lg" className="h-56" />
        </div>
      </div>
    </div>
  );
}
