import { cn } from "./cn";

/** Shimmering placeholder. Size it with className (h-4 w-32, aspect-video…). */
export default function Skeleton({ className, rounded = "sm", ...rest }) {
  const r = { sm: "rounded-sm", md: "rounded-md", lg: "rounded-lg", full: "rounded-full" }[rounded];
  return <div aria-hidden="true" className={cn("skeleton", r, className)} {...rest} />;
}

export function SkeletonText({ lines = 3, className }) {
  return (
    <div className={cn("space-y-2.5", className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton h-3.5 rounded-sm" style={{ width: i === lines - 1 ? "62%" : "100%" }} />
      ))}
    </div>
  );
}

export function SkeletonCard({ className, media = false }) {
  return (
    <div className={cn("surface-flat p-5", className)} aria-hidden="true">
      {media && <div className="skeleton mb-4 aspect-[16/10] rounded-md" />}
      <div className="flex items-center gap-3">
        <div className="skeleton h-10 w-10 rounded-md" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-3.5 w-2/3 rounded-sm" />
          <div className="skeleton h-3 w-1/3 rounded-sm" />
        </div>
      </div>
      <SkeletonText lines={2} className="mt-4" />
    </div>
  );
}

/** Grid of card skeletons — the default body for list-page loading.js files. */
export function SkeletonGrid({ count = 6, className, media }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {Array.from({ length: count }, (_, i) => <SkeletonCard key={i} media={media} />)}
    </div>
  );
}
