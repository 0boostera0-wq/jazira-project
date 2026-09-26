import Skeleton from "@/components/ui/Skeleton";

/** Placeholder that mirrors a learning game while its code loads. */
export default function GameSkeleton({ kind = "write", label }) {
  return (
    <div className="surface-flat p-4 sm:p-5" aria-busy="true">
      {label && <span className="sr-only" role="status">{label}</span>}
      {kind === "write" ? (
        <>
          <div className="flex items-center gap-4">
            <Skeleton rounded="md" className="h-16 w-16" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <div className="mt-4 flex gap-1.5 overflow-hidden">
            {Array.from({ length: 12 }, (_, i) => <Skeleton key={i} rounded="md" className="h-11 w-11 shrink-0" />)}
          </div>
          <Skeleton rounded="lg" className="mt-4 h-64 sm:h-80" />
          <div className="mt-4 flex justify-between gap-3">
            <Skeleton rounded="full" className="h-11 w-48" />
            <Skeleton rounded="full" className="h-11 w-40" />
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton rounded="full" className="h-9 w-24" />
          </div>
          <Skeleton rounded="lg" className="mx-auto mt-6 h-56 max-w-sm" />
          <Skeleton className="mx-auto mt-6 h-3.5 w-56" />
          <div className="mt-6 flex justify-center gap-2.5">
            <Skeleton rounded="full" className="h-11 w-32" />
            <Skeleton rounded="full" className="h-11 w-32" />
            <Skeleton rounded="full" className="h-11 w-28" />
          </div>
        </>
      )}
    </div>
  );
}
