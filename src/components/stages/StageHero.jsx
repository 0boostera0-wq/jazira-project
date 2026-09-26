import { CalendarDays } from "lucide-react";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import { cn } from "@/components/ui/cn";
import { formatNumber } from "@/i18n/format";
import HeroArt from "./HeroArt";
import { PLATE, PLATE_RING } from "./parts";

/**
 * Split hero for a school stage.
 *   top row      breadcrumbs · curriculum-year chip (full width, chip at the far end)
 *   text column  eyebrow · h1 · lead · actions · key facts
 *   art column   the stage illustration on a plate
 * Column split: 8/4 from `md` (the content column is only ~690–720px wide
 * between md and xl because of the sidebar), 7/5 from `xl`.
 * Phones: text and the primary action first; the illustration is dropped
 * (and only preloaded from md up — see HeroArt).
 *
 * facts: [{ value: number, label: string }] — values come from the catalog.
 */
export default function StageHero({ crumbs, crumbsLabel, year, eyebrow, title, lead, actions, facts, factsLabel, illustration, locale }) {
  return (
    <section aria-labelledby="stage-title">
      <div className="animate-in flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Breadcrumbs items={crumbs} label={crumbsLabel} />
        <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line/12 bg-surface px-2.5 text-[0.8125rem] font-medium text-ink-3">
          <CalendarDays size={14} aria-hidden="true" />
          {year}
        </span>
      </div>

      <div className="mt-6 grid items-center gap-x-8 gap-y-8 sm:mt-8 md:grid-cols-12 xl:gap-x-14">
        <div className="animate-in min-w-0 md:col-span-8 xl:col-span-7">
          <p className="t-eyebrow">{eyebrow}</p>
          <h1 id="stage-title" className="t-h1 mt-2.5 max-w-[24ch]">{title}</h1>
          <p className="t-lead mt-4 max-w-[40rem]">{lead}</p>

          <div className="mt-7 flex flex-col gap-3 xs:flex-row xs:flex-wrap">{actions}</div>

          {facts?.length > 0 && (
            <dl aria-label={factsLabel} className="mt-9 grid max-w-xl grid-cols-3 divide-x divide-line/12 border-t border-line/12 pt-5 rtl:divide-x-reverse">
              {facts.map((f) => (
                <div key={f.label} className="min-w-0 px-3 first:ps-0 last:pe-0 sm:px-5">
                  <dt className="sr-only">{f.label}</dt>
                  <dd>
                    <span className="block text-2xl font-bold leading-tight text-ink tabular sm:text-[1.75rem]">{formatNumber(f.value, locale)}</span>
                    <span aria-hidden="true" className="t-caption mt-1 block">{f.label}</span>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <div className="animate-in hidden md:col-span-4 md:block xl:col-span-5">
          <div className={cn("overflow-hidden rounded-xl", PLATE, PLATE_RING)}>
            <HeroArt id={illustration} from="md" />
          </div>
        </div>
      </div>
    </section>
  );
}
