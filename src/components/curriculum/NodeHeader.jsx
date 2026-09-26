import Breadcrumbs from "@/components/ui/Breadcrumbs";
import { cn } from "@/components/ui/cn";
import PageHero from "@/components/ui/PageHero";
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
 *   art         an image: the header becomes the full-width PageHero (the
 *               text above goes in its panel; children and facts under it)
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
  children,
  className,
}) {
  const top = Boolean(crumbs?.length || year);
  const topRow = top ? <HeaderTopRow crumbs={crumbs} crumbsLabel={crumbsLabel} year={year} /> : null;

  // Pages with an image (the hub, the stages) open on the full-width hero.
  if (art) {
    return (
      <PageHero id="node-title" image={art} eyebrow={eyebrow} title={title} lead={lead} top={topRow} className={cn("animate-in", className)}>
        {children}
        {facts?.length > 0 && <Facts items={facts} label={factsLabel} locale={locale} className={children ? "mt-7" : undefined} />}
      </PageHero>
    );
  }

  return (
    <header className={cn("relative", className)}>
      {topRow}
      <div className={cn("animate-in min-w-0", top && "mt-5 sm:mt-7")}>
        {eyebrow && <p className="t-eyebrow">{eyebrow}</p>}
        <h1 className="t-h1 mt-2 max-w-[26ch]">{title}</h1>
        {lead && <p className="t-lead mt-3 max-w-[42rem]">{lead}</p>}
        {children && <div className="mt-6">{children}</div>}
        {facts?.length > 0 && <Facts items={facts} label={factsLabel} locale={locale} className="mt-7" />}
      </div>
    </header>
  );
}
