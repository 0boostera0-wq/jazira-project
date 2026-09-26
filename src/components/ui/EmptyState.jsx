import { cn } from "./cn";
import Illustration from "./Illustration";

/**
 * Empty / zero-data state. Always tell the user WHY it's empty and WHAT to do.
 *   <EmptyState image="support.empty" title="…" description="…" action={<Button …/>} />
 * `image` is an asset-manifest id (src/lib/assets.js) or omit and pass `icon`.
 * `titleAs` sets the heading level (default "h2"; the visual size stays t-h3).
 * Pass "h1" when the empty state IS the page (e.g. a missing profile), "h3"
 * when it sits under an h2 section, "p" inside cards that already have a title.
 */
export default function EmptyState({ image, icon: Icon, title, titleAs: Title = "h2", description, action, secondary, compact = false, className }) {
  return (
    <div className={cn("flex flex-col items-center text-center", compact ? "px-4 py-8" : "px-6 py-12 sm:py-16", className)}>
      {image ? (
        <div aria-hidden="true" className={cn("art-frame w-full rounded-xl", compact ? "max-w-[180px]" : "max-w-[260px]")}>
          <Illustration id={image} aspect="4/3" sizes={compact ? "180px" : "260px"} />
        </div>
      ) : Icon ? (
        <span className="grid h-14 w-14 place-items-center rounded-lg bg-gold-50 text-gold-600">
          <Icon size={26} aria-hidden="true" />
        </span>
      ) : null}
      {title && <Title className={cn("t-h3", image || Icon ? "mt-5" : "")}>{title}</Title>}
      {description && <p className="t-body mt-2 max-w-md text-ink-3">{description}</p>}
      {(action || secondary) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          {action}
          {secondary}
        </div>
      )}
    </div>
  );
}
