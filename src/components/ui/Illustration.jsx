/* eslint-disable @next/next/no-img-element */
import { asset } from "@/lib/assets";
import { cn } from "./cn";

/**
 * Renders a library illustration (vector SVG, text-free).
 *
 *   <Illustration id="aptitude.timed" className="w-full max-w-md" />
 *   <Illustration id="brand.island-hero" priority sizes="(min-width:1024px) 50vw, 100vw" />
 *
 * - Width/height attributes come from the manifest → zero layout shift.
 * - Below-the-fold images lazy-load; pass `priority` ONLY for the LCP hero.
 * - Decorative by default (alt=""). Pass a translated `alt` when the image
 *   carries meaning that the surrounding text doesn't.
 * - Plain <img>: SVGs need no resizing/format negotiation, and this ships no JS.
 */
export default function Illustration({ id, alt = "", priority = false, className, plate = false, ...rest }) {
  const a = asset(id);
  const img = (
    <img
      src={a.src}
      width={a.width}
      height={a.height}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding={priority ? "sync" : "async"}
      fetchPriority={priority ? "high" : "auto"}
      draggable={false}
      className={cn("block h-auto w-full select-none", !plate && className)}
      {...rest}
    />
  );
  if (!plate) return img;
  // `plate` = the illustration sits on a soft cream card (keeps art warm in dark mode)
  return (
    <div className={cn("overflow-hidden rounded-xl bg-[#F7F0E3] ring-1 ring-inset ring-[#7A623A]/10", className)}>{img}</div>
  );
}
