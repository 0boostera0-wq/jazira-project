import Skeleton from "@/components/ui/Skeleton";

/** /learn/… — breadcrumbs, title, outline rows, and the rail (quizzes, books). */
export default function Loading() {
  return (
    <div aria-busy="true" className="animate-fade pb-6">
      <div aria-hidden="true">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="mt-5 space-y-3 sm:mt-7">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-9 w-3/4 max-w-lg" />
          <Skeleton className="h-4 w-2/3 max-w-xl" />
        </div>
        <div className="mt-8 grid gap-8 sm:mt-10 xl:grid-cols-12">
          <div className="space-y-2 xl:col-span-8">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-3 w-56" />
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="surface-flat flex items-center gap-3 p-3.5">
                <Skeleton className="h-5 w-5" rounded="full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className={i % 2 ? "h-4 w-1/2" : "h-4 w-2/3"} />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
          <div className="grid content-start gap-4 md:grid-cols-2 xl:col-span-4 xl:grid-cols-1">
            <Skeleton className="h-72" rounded="lg" />
            <Skeleton className="h-56" rounded="lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
