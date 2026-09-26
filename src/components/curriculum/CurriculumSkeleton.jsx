import Skeleton, { SkeletonText } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import { SECTION_GAP } from "@/components/stages/parts";

// Loading shells that mirror the curriculum layouts (header · content · rail).

function HeaderSkeleton({ art = true, controls = false }) {
  return (
    <div aria-hidden="true">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-7 w-36" rounded="full" />
      </div>
      <div className="mt-7 grid items-center gap-8 md:grid-cols-12 xl:gap-12">
        <div className={art ? "md:col-span-8 xl:col-span-7" : "md:col-span-12"}>
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="mt-3 h-10 w-4/5 max-w-lg" />
          <SkeletonText lines={2} className="mt-4 max-w-xl" />
          {controls && (
            <div className="mt-6 space-y-2.5">
              <Skeleton className="h-10 w-full max-w-md" rounded="full" />
              <Skeleton className="h-10 w-3/4 max-w-sm" rounded="full" />
            </div>
          )}
          <div className="mt-7 flex gap-8 border-t border-line/10 pt-5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-7 w-12" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
        </div>
        {art && <Skeleton className="hidden aspect-[4/3] w-full md:col-span-4 md:block xl:col-span-5" rounded="lg" />}
      </div>
    </div>
  );
}

/** /curriculum */
export function HubSkeleton() {
  return (
    <div aria-busy="true" className="animate-fade">
      <HeaderSkeleton controls />
      <div className={cn(SECTION_GAP, "space-y-3")}>
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-8 w-72" />
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:gap-5" aria-hidden="true">
        {[0, 1].map((i) => (
          <div key={i} className="surface-flat overflow-hidden">
            <Skeleton className="h-44 w-full" rounded="sm" />
            <div className="space-y-3 p-6">
              <Skeleton className="h-5 w-40" />
              <SkeletonText lines={2} />
              <div className="flex gap-1.5 pt-2">
                {[0, 1, 2, 3, 4, 5].map((j) => (
                  <Skeleton key={j} className="h-9 w-12" rounded="full" />
                ))}
              </div>
            </div>
          </div>
        ))}
        <Skeleton className="h-72 md:col-span-2" rounded="lg" />
      </div>
    </div>
  );
}

/** /curriculum/<stage>[/<grade>[/<track>]] — header, grid of cards, rail. */
export function NodeSkeleton() {
  return (
    <div aria-busy="true" className="animate-fade">
      <HeaderSkeleton art={false} controls />
      <div className="mt-10 grid gap-8 xl:grid-cols-12" aria-hidden="true">
        <div className="xl:col-span-8">
          <div className="flex items-end justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-11 w-64" rounded="full" />
          </div>
          <Skeleton className="mt-3 h-10 w-full" rounded="md" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="surface-flat flex items-center gap-3.5 p-4">
                <Skeleton className="h-11 w-11" rounded="md" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="grid content-start gap-4 md:grid-cols-2 xl:col-span-4 xl:grid-cols-1">
          <Skeleton className="h-64" rounded="lg" />
          <Skeleton className="h-56" rounded="lg" />
        </div>
      </div>
    </div>
  );
}
