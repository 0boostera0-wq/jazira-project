import Skeleton, { SkeletonText } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import { SECTION_GAP } from "@/components/stages/parts";

// Loading bodies that mirror each exam route's final layout (no spinner-only
// screens). Server-safe: no hooks.

function HeroSkeleton({ crumbs = false }) {
  return (
    <div className="grid items-center gap-x-10 gap-y-8 md:grid-cols-12 xl:gap-x-14">
      <div className="md:col-span-7">
        {crumbs && <Skeleton className="mb-8 h-4 w-40" />}
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="mt-4 h-10 w-11/12 max-w-xl" />
        <Skeleton className="mt-2.5 h-10 w-2/3 max-w-md" />
        <SkeletonText lines={2} className="mt-5 max-w-[40rem]" />
        <div className="mt-7 flex gap-3">
          <Skeleton rounded="full" className="h-12 w-44" />
          <Skeleton rounded="full" className="h-12 w-40" />
        </div>
        <div className="mt-9 grid max-w-xl grid-cols-3 gap-5 border-t border-line/12 pt-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2"><Skeleton className="h-8 w-16" /><Skeleton className="h-3 w-20" /></div>
          ))}
        </div>
      </div>
      <Skeleton rounded="lg" className="hidden aspect-[4/3] w-full md:col-span-5 md:block" />
    </div>
  );
}

export function HubSkeleton() {
  return (
    <div aria-busy="true" className="animate-fade">
      <HeroSkeleton />
      <div className={SECTION_GAP}>
        <Skeleton className="h-3.5 w-36" />
        <Skeleton className="mt-3 h-8 w-64" />
        <div className="mt-7 grid gap-5 xl:grid-cols-2 xl:gap-6">
          {[0, 1].map((i) => (
            <div key={i} className="surface-flat grid overflow-hidden md:grid-cols-12 xl:block">
              <Skeleton rounded="sm" className="aspect-[16/9] w-full !rounded-none md:col-span-5 md:aspect-auto md:h-full xl:aspect-[16/9] xl:h-auto" />
              <div className="space-y-3 p-6 md:col-span-7">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-8 w-40" />
                <SkeletonText lines={2} />
                <div className="grid grid-cols-2 gap-2 pt-2"><Skeleton rounded="md" className="h-14" /><Skeleton rounded="md" className="h-14" /></div>
                <Skeleton rounded="full" className="mt-4 h-12 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className={cn(SECTION_GAP, "grid gap-8 xl:grid-cols-12 xl:gap-6")}>
        <Skeleton rounded="lg" className="h-56 xl:order-last xl:col-span-4 xl:h-72" />
        <div className="grid gap-4 sm:grid-cols-2 xl:col-span-8">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} rounded="lg" className="h-32" />)}
        </div>
      </div>
    </div>
  );
}

export function BuilderSkeleton() {
  return (
    <div aria-hidden="true" className="surface p-5 sm:p-7">
      <Skeleton className="h-3.5 w-28" />
      <Skeleton className="mt-3 h-7 w-56" />
      {[3, 4, 4].map((n, row) => (
        <div key={row} className="mt-7">
          <Skeleton className="h-4 w-24" />
          <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
            {Array.from({ length: n }, (_, i) => <Skeleton key={i} rounded="md" className={row === 1 ? "h-10" : "h-16"} />)}
          </div>
        </div>
      ))}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-line/10 pt-6">
        <Skeleton className="h-5 w-56" />
        <Skeleton rounded="full" className="h-12 w-44" />
      </div>
    </div>
  );
}

export function SectionPageSkeleton({ cards = 2 }) {
  return (
    <div aria-busy="true" className="animate-fade">
      <HeroSkeleton crumbs />
      <div className={cn(SECTION_GAP, "grid gap-6 xl:grid-cols-12")}>
        <div className="xl:col-span-8"><BuilderSkeleton /></div>
        <Skeleton rounded="lg" className="h-64 xl:col-span-4 xl:h-96" />
      </div>
      <div className={cn(SECTION_GAP, "grid gap-5 md:grid-cols-2")}>
        {Array.from({ length: cards }, (_, i) => <Skeleton key={i} rounded="lg" className="h-80" />)}
      </div>
    </div>
  );
}

export function RunnerSkeleton() {
  return (
    <div aria-busy="true" className="animate-fade">
      <div className="-mx-[var(--gutter)] -mt-6 border-b border-line/10 px-[var(--gutter)] py-3 sm:-mt-8">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Skeleton rounded="md" className="h-9 w-9" />
            <div className="space-y-1.5"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-20" /></div>
          </div>
          <Skeleton rounded="full" className="h-10 w-28" />
        </div>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_17.5rem] xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div>
          <div className="surface p-5 sm:p-7">
            <div className="flex justify-between"><Skeleton className="h-4 w-28" /><Skeleton rounded="full" className="h-6 w-20" /></div>
            <SkeletonText lines={2} className="mt-6" />
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} rounded="md" className="h-16" />)}
            </div>
          </div>
        </div>
        <div className="hidden lg:block">
          <Skeleton rounded="lg" className="h-96" />
        </div>
      </div>
    </div>
  );
}

/** Mirrors ExamResults (score header · actions · review + rail) while its chunk loads. */
export function ResultsSkeleton() {
  return (
    <div aria-busy="true" className="animate-fade">
      <div className="surface overflow-hidden">
        <div className="grid gap-6 p-5 sm:p-8 xl:grid-cols-12 xl:items-center xl:gap-8">
          <div className="flex items-center gap-5 sm:gap-7 xl:col-span-7">
            <Skeleton rounded="full" className="h-[116px] w-[116px] shrink-0" />
            <div className="flex-1 space-y-2.5"><Skeleton className="h-3.5 w-24" /><Skeleton className="h-7 w-48" /><Skeleton className="h-3 w-40" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:col-span-5 xl:grid-cols-2">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} rounded="md" className="h-[68px]" />)}
          </div>
        </div>
        <div className="flex gap-2 border-t border-line/10 px-5 py-4 sm:px-8">
          <Skeleton rounded="full" className="h-11 w-40" />
          <Skeleton rounded="full" className="h-11 w-32" />
        </div>
      </div>
      <div className="mt-8 grid gap-6 xl:grid-cols-12 xl:gap-8">
        <Skeleton rounded="lg" className="h-64 xl:order-2 xl:col-span-4" />
        <Skeleton rounded="lg" className="h-96 xl:order-1 xl:col-span-8" />
      </div>
    </div>
  );
}

export function HistorySkeleton() {
  return (
    <div aria-busy="true" className="animate-fade">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-8 h-3.5 w-24" />
      <Skeleton className="mt-3 h-10 w-72" />
      <SkeletonText lines={1} className="mt-4 max-w-xl" />
      <HistoryBodySkeleton />
    </div>
  );
}

export function HistoryBodySkeleton() {
  return (
    <div aria-hidden="true">
      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} rounded="lg" className="h-24" />)}
      </div>
      <div className="mt-6 grid items-start gap-6 xl:grid-cols-12">
        <div className="flex flex-col gap-6 xl:col-span-7">
          <Skeleton rounded="lg" className="h-80" />
          <Skeleton rounded="lg" className="h-96" />
        </div>
        <div className="flex flex-col gap-6 xl:col-span-5">
          <Skeleton rounded="lg" className="h-56" />
          <Skeleton rounded="lg" className="h-96" />
        </div>
      </div>
    </div>
  );
}
