import Breadcrumbs from "@/components/ui/Breadcrumbs";
import Illustration from "@/components/ui/Illustration";
import { cn } from "@/components/ui/cn";
import HeroArt from "@/components/stages/HeroArt";
import { PLATE, PLATE_RING } from "@/components/stages/parts";
import { Facts, YearChip } from "./parts";

/** Breadcrumbs · school-year chip (full width). */
export function HeaderTopRow({ crumbs, crumbsLabel, year, className }) {
  return (
    <div className={cn("animate-in flex flex-wrap items-center justify-between gap-x-4 gap-y-2", className)}>
      {crumbs?.length ? <Breadcrumbs items={crumbs} label={crumbsLabel} /> : <span />}
      {year && <YearChip>{year}</YearChip>}
    </div>
  );
}

/**
 * Header for every curriculum page (server-safe; all copy arrives as props).
 *   top row     breadcrumbs · school-year chip
 *   text        eyebrow · h1 · lead · children (search, switchers) · facts
 *   art         optional stage illustration on a cream plate (md+ only; with
 *               artPriority it is preloaded for md+ screens only, see HeroArt)
 * The content column is ~690px at 1024 (the app sidebar), so the split is
 * 8/4 from md and 7/5 from xl. Phones get the text and controls only.
 */
export default function NodeHeader({
  crumbs,
  crumbsLabel,
  year,
  eyebrow,
  title,
  lead,
  facts,
  factsLabel,
  locale,
  art,
  artPriority = true,
  children,
  className,
}) {
  const top = Boolean(crumbs?.length || year);
  return (
    <header className={cn("relative", className)}>
      {top && <HeaderTopRow crumbs={crumbs} crumbsLabel={crumbsLabel} year={year} />}

      <div className={cn("grid items-center gap-x-8 gap-y-6", top && "mt-5 sm:mt-7", art && "md:grid-cols-12 xl:gap-x-12")}>
        <div className={cn("animate-in min-w-0", art && "md:col-span-8 xl:col-span-7")}>
          {eyebrow && <p className="t-eyebrow">{eyebrow}</p>}
          <h1 className="t-h1 mt-2 max-w-[26ch]">{title}</h1>
          {lead && <p className="t-lead mt-3 max-w-[42rem]">{lead}</p>}
          {children && <div className="mt-6">{children}</div>}
          {facts?.length > 0 && <Facts items={facts} label={factsLabel} locale={locale} className="mt-7" />}
        </div>

        {art && (
          <div aria-hidden="true" className="animate-in hidden md:col-span-4 md:block xl:col-span-5">
            <div className={cn("overflow-hidden rounded-xl", PLATE, PLATE_RING)}>
              {artPriority ? <HeroArt id={art} from="md" /> : <Illustration id={art} />}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
