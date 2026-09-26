import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/i18n/format";
import { cn } from "@/components/ui/cn";
import { Chevron, SubjectChip } from "./parts";

/**
 * A grade as a link card into the curriculum browser.
 *   badge          number shown in the tile (the grade number in the active locale's convention)
 *   tag            small label above the name (e.g. "Common first year")
 *   meta           e.g. "10 subjects"
 *   body           optional one-line description
 *   preview        optional subject list → first `previewCount` chips + "+N"
 *   as             heading level of the grade name (default h3; h4 under a group heading)
 *   dense          the card sits three abreast from `sm`; between sm and xl the
 *                  column is ~190–230px, so the chevron is dropped there (the
 *                  whole card is the link) to leave room for the name.
 */
export default function GradeCard({ href, badge, name, tag, meta, body, preview, previewCount = 4, moreLabel, locale, tone = "green", dense = false, as: H = "h3", className }) {
  const shown = preview ? preview.slice(0, previewCount) : [];
  const rest = preview ? preview.length - shown.length : 0;

  return (
    <Link
      href={href}
      className={cn(
        "group relative flex h-full flex-col rounded-lg border border-line/12 bg-surface shadow-xs",
        "p-4 sm:p-5",
        "transition-[transform,box-shadow,border-color] duration ease-out hover:-translate-y-0.5 hover:border-line/20 hover:shadow-md",
        className
      )}
    >
      <div className={cn("flex items-center", dense ? "gap-3 xl:gap-4" : "gap-4")}>
        <span
          aria-hidden="true"
          className={cn(
            "grid shrink-0 place-items-center rounded-md font-bold ring-1 ring-inset tabular",
            "h-12 w-12 text-xl",
            tone === "gold" ? "bg-gold-50 text-gold-700 ring-gold-200/70" : "bg-green-50 text-green-700 ring-green-100"
          )}
        >
          {formatNumber(badge, locale)}
        </span>
        <div className="min-w-0 flex-1">
          {tag && <p className="t-caption font-medium text-gold-600">{tag}</p>}
          <H className="t-h4">{name}</H>
          {meta && <p className="t-caption mt-0.5">{meta}</p>}
        </div>
        <Chevron className={cn("-me-1", dense && "sm:hidden xl:grid")} />
      </div>

      {body && <p className="t-small mt-3 text-ink-3">{body}</p>}

      {shown.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line/10 pt-4">
          {shown.map((s) => (
            <SubjectChip key={s.id} subject={s} locale={locale} />
          ))}
          {rest > 0 && (
            <span dir="ltr" className="inline-flex h-8 items-center rounded-full bg-surface-2 px-3 text-[0.8125rem] font-medium text-ink-3 tabular">
              {moreLabel(rest)}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}
