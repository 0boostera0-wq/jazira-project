import { getImageProps } from "next/image";
import Illustration from "@/components/ui/Illustration";
import { cn } from "@/components/ui/cn";
import { asset } from "@/lib/assets";

// Breakpoints of the wrappers below (and of the hero grids that use them).
const MEDIA = { sm: "(min-width: 640px)", md: "(min-width: 768px)", lg: "(min-width: 1024px)" };
const SHOW = { sm: "hidden sm:block", md: "hidden md:block", lg: "hidden lg:block" };
const HIDE = { sm: "sm:hidden", md: "md:hidden", lg: "lg:hidden" };

/**
 * Media-gated, responsive, high-priority preload for art that is only painted
 * from a breakpoint up (React hoists the <link> into <head>). Pair it with a
 * lazy <Illustration> using the same `sizes`: screens that show the art fetch
 * it early at the width the layout needs; the others never fetch it
 * (display:none images are not loaded). `priority` would preload it everywhere.
 */
export function ArtPreload({ id, from = "md", sizes }) {
  const a = asset(id);
  const { props } = getImageProps({ src: a.src, alt: "", width: a.width, height: a.height, sizes: sizes || a.sizes });
  return <link rel="preload" as="image" imageSrcSet={props.srcSet} imageSizes={props.sizes} media={MEDIA[from]} fetchPriority="high" />;
}

/**
 * Page-hero art that sits beside the copy from a breakpoint up: framed and
 * preloaded there (ArtPreload). With `banner`, smaller screens get the same art
 * as a lazy 16:9 banner under the copy, so phones keep the page's visual
 * identity without it competing with the real mobile LCP.
 *
 *   <HeroArt id="elementary.hero" sizes="(min-width: 1280px) 460px, 30vw" className="aspect-[4/3] object-cover" banner />
 */
export default function HeroArt({ id, from = "md", sizes, className, frameClassName, banner = false, bannerClassName }) {
  return (
    <>
      <ArtPreload id={id} from={from} sizes={sizes} />
      <div className={cn("art-frame rounded-xl", SHOW[from], frameClassName)}>
        <Illustration id={id} sizes={sizes} className={className} />
      </div>
      {banner && (
        <div className={cn("art-frame rounded-lg", HIDE[from], bannerClassName)}>
          <Illustration id={id} sizes="100vw" className="aspect-[16/9] object-cover" />
        </div>
      )}
    </>
  );
}
