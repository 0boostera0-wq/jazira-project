import Skeleton, { SkeletonText } from "@/components/ui/Skeleton";

// Mirrors /assistant: conversation pane (header · welcome · composer) + rail
// (balance · past chats) on desktop.
const PANE_H =
  "h-[calc(100dvh-var(--topbar-h)-var(--bottomnav-h)-env(safe-area-inset-bottom)-3.5rem)] " +
  "sm:h-[calc(100dvh-var(--topbar-h)-var(--bottomnav-h)-env(safe-area-inset-bottom)-4rem)] " +
  "lg:h-[calc(100dvh-var(--topbar-h)-3.5rem)]";

export default function Loading() {
  return (
    <div aria-busy="true" className="animate-fade grid grid-cols-[minmax(0,1fr)] gap-5 lg:-mb-10 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className={`surface flex min-h-[440px] flex-col overflow-hidden ${PANE_H}`}>
        <div className="flex items-center gap-3 border-b border-line/10 px-4 py-3 sm:px-5">
          <Skeleton rounded="full" className="h-10 w-10 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton rounded="full" className="h-10 w-10 lg:hidden" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col justify-center overflow-hidden px-4 sm:px-6">
          <div className="mx-auto w-full max-w-3xl">
            <div className="grid items-center gap-5 md:grid-cols-[minmax(0,1fr)_200px] lg:grid-cols-[minmax(0,1fr)_220px]">
              <div className="space-y-3">
                <Skeleton className="h-8 w-4/5" />
                <SkeletonText lines={2} className="max-w-xl" />
              </div>
              <Skeleton rounded="lg" className="hidden aspect-[4/3] md:block" />
            </div>
            <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} rounded="md" className="h-[76px] sm:h-[190px]" />)}
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {[180, 150, 200, 170].map((w, i) => <Skeleton key={i} rounded="full" className="h-9" style={{ width: w }} />)}
            </div>
          </div>
        </div>
        <div className="border-t border-line/10 px-3 py-3 sm:px-5">
          <Skeleton rounded="lg" className="mx-auto h-[58px] max-w-3xl" />
          <Skeleton className="mx-auto mt-2.5 h-3 max-w-3xl" />
        </div>
      </div>
      <div className={`hidden min-h-0 flex-col gap-4 lg:flex ${PANE_H}`}>
        <Skeleton rounded="lg" className="h-[190px] shrink-0" />
        <Skeleton rounded="lg" className="flex-1" />
      </div>
    </div>
  );
}
