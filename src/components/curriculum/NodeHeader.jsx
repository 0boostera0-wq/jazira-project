import Breadcrumbs from "@/components/ui/Breadcrumbs";
import Illustration from "@/components/ui/Illustration";
import { cn } from "@/components/ui/cn";
import HeroArt from "@/components/stages/HeroArt";
import { Facts, YearChip } from "./parts";

// The art column is 4/12 from md and 5/12 from xl; a taller crop keeps it level with the copy.
const ART_SIZES = "(min-width: 1280px) 460px, 30vw";
const ART_CROP = "object-cover md:aspect-[4/5] lg:aspect-[1/1] xl:aspect-[5/4]";

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
 *   art         optional stage painting, framed from md (with artPriority it is
 *               preloaded there only and phones get a lazy 16:9 banner, see HeroArt)
 * The content column is ~690px at 1024 (the app sidebar), so the split is
 * 8/4 from md and 7/5 from xl.
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
          <div aria-hidden="true" className={cn("animate-in md:col-span-4 xl:col-span-5", !artPriority && "hidden md:block")}>
            {artPriority ? (
              <HeroArt id={art} from="md" sizes={ART_SIZES} className={ART_CROP} banner />
            ) : (
              <div className="art-frame rounded-xl">
                <Illustration id={art} sizes={ART_SIZES} className={ART_CROP} />
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
