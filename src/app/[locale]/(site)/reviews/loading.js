import Skeleton, { SkeletonText } from "@/components/ui/Skeleton";

// Mirrors /reviews: header · rail (summary + composer) · two-column list.
export default function ReviewsLoading() {
  return (
    <div aria-busy="true" className="animate-fade">
      <div className="container-jz grid gap-8 pb-8 pt-8 sm:pt-12 lg:grid-cols-12 lg:items-end lg:gap-12 lg:pt-14">
        <div className="space-y-4 lg:col-span-7">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-10 w-3/4 max-w-md" />
          <SkeletonText lines={2} className="max-w-xl" />
        </div>
        <Skeleton rounded="lg" className="hidden h-32 lg:col-span-5 lg:block" />
      </div>
      <div className="container-jz grid gap-8 pb-16 pt-4 lg:grid-cols-12 lg:gap-10">
        <div className="space-y-4 lg:col-span-4">
          <Skeleton rounded="lg" className="h-72" />
          <Skeleton rounded="lg" className="h-40" />
        </div>
        <div className="lg:col-span-8">
          <Skeleton className="mb-4 h-6 w-40" />
          <div className="grid gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} rounded="lg" className="h-44" />)}
          </div>
        </div>
      </div>
    </div>
  );
}
