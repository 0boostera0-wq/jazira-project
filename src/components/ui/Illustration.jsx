import Image from "next/image";
import { asset } from "@/lib/assets";
import { cn } from "./cn";

/**
 * Renders a library image (src/lib/assets.js) through next/image.
 *
 *   <Illustration id="elementary.hero" priority sizes={SIZES.heroSide} className="rounded-xl" />
 *   <Illustration id="support.empty" aspect="4/3" sizes="240px" className="w-60 rounded-lg" />
 *   <div className="relative h-48"><Illustration id="landing.hero" fill sizes="100vw" /></div>
 *
 * - Every file is a pre-rendered WebP rendition (scripts/process-illustrations.mjs);
 *   the loader (src/lib/image-loader.js) picks the width the browser needs from
 *   `sizes`, so pass a `sizes` that matches the layout (default: the manifest's).
 * - `priority` ONLY for the page's LCP hero (preloaded, eager). Everything else
 *   lazy-loads.
 * - Width/height come from the manifest (no layout shift); the frame's average
 *   colour fills the box while it loads.
 * - `aspect` ("4/3", "1/1", "16/9"…) crops the 3:2 frame around the manifest's
 *   focus point; `fill` covers a positioned parent instead.
 * - Decorative by default (alt=""). Pass a translated `alt` only when the image
 *   carries meaning the surrounding text doesn't.
 */
export default function Illustration({ id, alt = "", priority = false, sizes, aspect, fill = false, className, style, ...rest }) {
  const a = asset(id);
  const common = {
    src: a.src,
    sizes: sizes || a.sizes,
    priority,
    draggable: false,
    style: { backgroundColor: a.color, objectPosition: a.focus, ...(aspect && !fill ? { aspectRatio: aspect } : null), ...style },
  };
  if (fill) return <Image {...common} alt={alt} fill className={cn("select-none object-cover", className)} {...rest} />;
  return (
    <Image
      {...common}
      alt={alt}
      width={a.width}
      height={a.height}
      className={cn("block h-auto w-full select-none", aspect && "object-cover", className)}
      {...rest}
    />
  );
}
