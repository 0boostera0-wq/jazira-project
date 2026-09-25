import Image from "next/image";
import { cn } from "./cn";
import { asset } from "@/lib/assets";

/**
 * Empty / zero-data state. Always tell the user WHY it's empty and WHAT to do.
 *   <EmptyState image="support.empty" title="…" description="…" action={<Button …/>} />
 * `image` is an asset-manifest id (src/lib/assets.js) or omit and pass `icon`.
 */
export default function EmptyState({ image, icon: Icon, title, description, action, secondary, compact = false, className }) {
  const img = image ? asset(image) : null;
  return (
    <div className={cn("flex flex-col items-center text-center", compact ? "px-4 py-8" : "px-6 py-12 sm:py-16", className)}>
      {img ? (
        <Image
          src={img.src}
          alt=""
          width={img.width}
          height={img.height}
          className={cn("h-auto w-full", compact ? "max-w-[160px]" : "max-w-[240px]")}
          loading="lazy"
        />
      ) : Icon ? (
        <span className="grid h-14 w-14 place-items-center rounded-lg bg-gold-50 text-gold-600">
          <Icon size={26} aria-hidden="true" />
        </span>
      ) : null}
      {title && <h3 className={cn("t-h3", img || Icon ? "mt-5" : "")}>{title}</h3>}
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
