import { getImageProps } from "next/image";
import { asset } from "@/lib/assets";

// Breakpoints of the `hidden sm:block / md:block / lg:block` wrappers that use it.
const MEDIA = { sm: "(min-width: 640px)", md: "(min-width: 768px)", lg: "(min-width: 1024px)" };

/**
 * Media-gated, responsive, high-priority preload for art that is only painted
 * from a breakpoint up (React hoists the <link> into <head>). Pair it with a
 * lazy <Illustration> using the same `sizes`: screens that show the art fetch
 * it early at the width the layout needs; the others never fetch it
 * (display:none images are not loaded). `priority` would preload it everywhere.
 */
export default function ArtPreload({ id, from = "md", sizes }) {
  const a = asset(id);
  const { props } = getImageProps({ src: a.src, alt: "", width: a.width, height: a.height, sizes: sizes || a.sizes });
  return <link rel="preload" as="image" imageSrcSet={props.srcSet} imageSizes={props.sizes} media={MEDIA[from]} fetchPriority="high" />;
}
