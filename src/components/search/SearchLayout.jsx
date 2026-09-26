import Skeleton, { SkeletonText } from "@/components/ui/Skeleton";

/**
 * Page frame shared by the live page, its loading.js and the Suspense
 * fallback, so nothing shifts when data arrives:
 *   main (8 cols: title · sticky field + tabs · results) | rail (4 cols, sticky)
 * On phones the rail follows the results.
 */
export default function SearchLayout({ header, main, rail }) {
  return (
    <div className="lg:grid lg:grid-cols-12 lg:gap-8 xl:gap-10">
      <div className="min-w-0 lg:col-span-8">
        {header}
        {main}
      </div>
      <aside className="mt-12 lg:col-span-4 lg:mt-0">
        <div className="space-y-5 lg:sticky lg:top-[calc(var(--topbar-h)+1.5rem)]">{rail}</div>
      </aside>
    </div>
  );
}

/** Title block (server-rendered text is passed in; skeleton otherwise). */
export function SearchHeader({ eyebrow, title, lead }) {
  if (!title) {
    return (
      <div className="mb-5 space-y-3 sm:mb-6" aria-hidden="true">
        <Skeleton className="h-3.5 w-16" />
        <Skeleton className="h-10 w-56" />
        <SkeletonText lines={1} className="max-w-lg" />
      </div>
    );
  }
  return (
    <header className="mb-5 sm:mb-6">
      <p className="t-eyebrow mb-2">{eyebrow}</p>
      <h1 className="t-h1">{title}</h1>
      <p className="t-lead mt-2 max-w-2xl">{lead}</p>
    </header>
  );
}

/** Field + tabs + idle browse placeholders. */
export function SearchMainSkeleton() {
  return (
    <div aria-hidden="true" className="animate-fade">
      <div className="pb-3 pt-1">
        <Skeleton rounded="full" className="h-14 w-full sm:h-[3.75rem]" />
        <Skeleton rounded="full" className="mt-3 h-11 w-full max-w-xl" />
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        {[24, 20, 28, 22].map((w, i) => (
          <Skeleton key={i} rounded="full" className="h-10" style={{ width: `${w * 4}px` }} />
        ))}
      </div>
      <div className="mt-9 space-y-2">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3 sm:gap-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} rounded="lg" className="h-[4.25rem] sm:h-48 xl:h-52" />
        ))}
      </div>
      <div className="mt-9 space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} rounded="lg" className="h-[4.25rem]" />
        ))}
      </div>
    </div>
  );
}

export function SearchRailSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-5">
      <Skeleton rounded="lg" className="hidden h-48 w-full lg:block" />
      <Skeleton rounded="lg" className="h-72 w-full" />
      <Skeleton rounded="lg" className="hidden h-44 w-full lg:block" />
    </div>
  );
}
