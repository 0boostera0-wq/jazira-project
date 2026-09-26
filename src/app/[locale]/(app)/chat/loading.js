import Skeleton from "@/components/ui/Skeleton";

// Mirrors /chat: list pane (title · tabs · rows) + thread pane on md+.
const PANE_H =
  "h-[calc(100dvh-var(--topbar-h)-var(--bottomnav-h)-env(safe-area-inset-bottom)-3.5rem)] " +
  "sm:h-[calc(100dvh-var(--topbar-h)-var(--bottomnav-h)-env(safe-area-inset-bottom)-4rem)] " +
  "lg:h-[calc(100dvh-var(--topbar-h)-3.5rem)]";

export default function Loading() {
  return (
    <div aria-busy="true" className={`animate-fade surface grid grid-cols-[minmax(0,1fr)] overflow-hidden lg:-mb-10 md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[340px_minmax(0,1fr)] ${PANE_H}`}>
      <div className="flex min-h-0 flex-col md:border-e md:border-line/10">
        <div className="space-y-2.5 px-4 pb-3 pt-4 sm:px-5">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-3.5 w-48" />
          <Skeleton rounded="full" className="!mt-4 h-11 w-full" />
        </div>
        <div className="border-t border-line/10">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <Skeleton rounded="full" className="h-[46px] w-[46px] shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5" style={{ width: `${55 - (i % 3) * 10}%` }} />
                <Skeleton className="h-3" style={{ width: `${80 - (i % 4) * 12}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="hidden flex-col items-center justify-center gap-4 bg-surface-2/40 md:flex">
        <Skeleton rounded="lg" className="h-40 w-52" />
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
    </div>
  );
}
