import Skeleton, { SkeletonText } from "@/components/ui/Skeleton";

// Mirrors the pricing page: split hero (intro + Free plan beside the Elite
// card), benefits bento, then comparison and billing FAQ, each with its rail.
export default function Loading() {
  return (
    <div aria-busy="true" className="animate-fade">
      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-12 xl:gap-x-14">
        <div className="space-y-4 lg:col-span-7 lg:pt-6">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-10 w-4/5 max-w-lg" />
          <Skeleton className="h-10 w-3/5 max-w-md" />
          <SkeletonText lines={3} className="max-w-2xl pt-2" />
          <div className="grid gap-5 pt-6 sm:grid-cols-3 lg:max-w-xl lg:grid-cols-1">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex gap-3.5">
                <Skeleton rounded="sm" className="h-9 w-9 shrink-0" />
                <SkeletonText lines={2} className="flex-1" />
              </div>
            ))}
          </div>
          <div className="!mt-8 space-y-4 rounded-lg bg-surface-2 p-5 sm:p-6">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3.5 w-3/4" />
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} rounded="md" className="h-16" />)}
            </div>
          </div>
        </div>
        <div className="surface overflow-hidden lg:col-span-5">
          <Skeleton rounded="sm" className="h-40 w-full !rounded-none sm:h-52" />
          <div className="space-y-4 p-5 sm:p-7">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-11 w-28" />
            <Skeleton rounded="full" className="h-12 w-full" />
            <Skeleton className="mx-auto h-3.5 w-40" />
            <SkeletonText lines={5} className="pt-4" />
          </div>
        </div>
      </div>

      <div className="mt-16 space-y-3 sm:mt-20">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-8 w-72 max-w-full" />
      </div>
      <div className="mt-7 grid gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-12">
        <Skeleton rounded="lg" className="h-64 md:col-span-2 lg:col-span-7" />
        <Skeleton rounded="lg" className="h-64 lg:col-span-5" />
        {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} rounded="lg" className="h-44 lg:col-span-4" />)}
      </div>

      {[["h-[34rem]", "h-[30rem]"], ["h-[28rem]", "h-[22rem]"]].map(([main, rail], i) => (
        <div key={i} className="mt-16 sm:mt-20">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="mt-3 h-8 w-64 max-w-full" />
          <div className="mt-6 grid gap-x-8 gap-y-5 lg:grid-cols-12">
            <Skeleton rounded="lg" className={`${main} lg:col-span-8`} />
            <Skeleton rounded="lg" className={`${rail} lg:col-span-4`} />
          </div>
        </div>
      ))}
    </div>
  );
}
