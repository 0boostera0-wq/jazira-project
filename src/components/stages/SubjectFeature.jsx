import Illustration from "@/components/ui/Illustration";
import { cn } from "@/components/ui/cn";

/**
 * Subject highlight with its library painting as a full-bleed panel.
 *   layout="row"    painting panel at the start, text at the end
 *   layout="stack"  painting on top, text below (from `sm`)
 * Phones always get the compact row (a cropped panel beside the text) so the
 * paintings don't turn into full-width banners.
 *   grow="text"  (default) extra height goes to the text block, so titles line up across a row
 *   grow="art"   extra height goes to the painting (cards stretched beside a taller neighbour)
 */
export default function SubjectFeature({ illustration, title, body, tag, action, layout = "stack", compact = false, grow = "text", as: H = "h3", className }) {
  const artGrows = grow === "art";
  const row = layout === "row";
  return (
    <article
      className={cn(
        "flex h-full overflow-hidden rounded-lg border border-line/12 bg-surface shadow-xs",
        row ? "flex-row" : "flex-row sm:flex-col",
        className
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "relative min-h-[7.5rem] w-[36%] shrink-0 overflow-hidden",
          row
            ? cn("sm:w-[44%]", compact ? "sm:min-h-[9rem]" : "sm:min-h-[11rem]")
            : cn("sm:w-auto", artGrows ? "sm:min-h-[12rem] sm:flex-1" : "sm:aspect-[16/10] sm:min-h-0")
        )}
      >
        <Illustration id={illustration} fill sizes={row ? "(min-width: 1280px) 280px, (min-width: 640px) 44vw, 36vw" : "(min-width: 1280px) 360px, (min-width: 640px) 50vw, 36vw"} />
      </div>
      <div className={cn("flex min-w-0 flex-1 flex-col justify-center p-4", compact ? "sm:p-5" : "sm:p-6", !row && (artGrows ? "sm:flex-none sm:justify-start" : "sm:justify-start"))}>
        {tag && <p className="t-caption mb-1 font-medium text-green-700">{tag}</p>}
        <H className="t-h4">{title}</H>
        <p className="t-small mt-1.5 text-ink-3">{body}</p>
        {action && <div className="mt-auto pt-3">{action}</div>}
      </div>
    </article>
  );
}
