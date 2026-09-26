import Illustration from "@/components/ui/Illustration";
import { cn } from "@/components/ui/cn";
import { PLATE } from "./parts";

/**
 * Subject highlight with its library illustration as a layout element.
 *   layout="row"    illustration panel at the start, text at the end
 *   layout="stack"  illustration on top, text below (from `sm`)
 * Phones always get the compact row (small art beside the text) so the
 * illustrations don't turn into full-width banners.
 * The art sits on a plate (cream; a quiet surface in dark mode).
 *   grow="text"  (default) extra height goes to the text block, so titles line up across a row
 *   grow="art"   extra height goes to the art panel (cards stretched beside a taller neighbour)
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
        className={cn(
          "grid w-[36%] shrink-0 place-items-center px-2 py-3",
          PLATE,
          row ? "sm:w-[44%] sm:px-4" : cn("sm:w-auto sm:py-0 sm:pt-3", artGrows && "sm:flex-1", compact ? "sm:px-6" : "sm:px-5")
        )}
      >
        <Illustration id={illustration} className={cn("w-full", compact ? "sm:max-w-[220px]" : "sm:max-w-[300px]")} />
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
