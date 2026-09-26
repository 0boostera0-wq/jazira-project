import Illustration from "@/components/ui/Illustration";
import { asset } from "@/lib/assets";

// Breakpoints of the `hidden sm:block / md:block / lg:block` wrappers heroes use.
const MEDIA = { sm: "(min-width: 640px)", md: "(min-width: 768px)", lg: "(min-width: 1024px)" };

/**
 * Hero illustration that only exists from a breakpoint up (its wrapper is
 * `hidden <from>:block`). `priority` on an Illustration would preload it at
 * high priority on phones too, where it is never painted, and compete with the
 * real mobile LCP. Instead:
 *   • a media-gated high-priority preload (React hoists the <link> into <head>),
 *     so only screens that show the art fetch it — early;
 *   • a lazy <img>: phones never download it (display:none), wider screens
 *     paint it from the already-preloaded response.
 * (Server-safe. Candidate for ui/Illustration as a `priorityMedia` prop.)
 */
export default function HeroArt({ id, from = "md", className, ...rest }) {
  const { src } = asset(id);
  return (
    <>
      <link rel="preload" as="image" href={src} media={MEDIA[from] || MEDIA.md} fetchPriority="high" />
      <Illustration id={id} className={className} {...rest} />
    </>
  );
}
