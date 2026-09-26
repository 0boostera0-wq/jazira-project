import { CalendarDays } from "lucide-react";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import PageHero from "@/components/ui/PageHero";
import { formatNumber } from "@/i18n/format";

/**
 * Hero for a school stage: breadcrumbs · curriculum-year chip, then the
 * stage's image as a full-width band with the title panel over it
 * (PageHero), then the actions and the key facts under the band.
 *
 * facts: [{ value: number, label: string }] — values come from the catalog.
 */
export default function StageHero({ crumbs, crumbsLabel, year, eyebrow, title, lead, actions, facts, factsLabel, illustration, locale }) {
  return (
    <PageHero
      id="stage-title"
      image={illustration}
      eyebrow={eyebrow}
      title={title}
      lead={lead}
      className="animate-in"
      top={
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <Breadcrumbs items={crumbs} label={crumbsLabel} />
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line/12 bg-surface px-2.5 text-[0.8125rem] font-medium text-ink-3">
            <CalendarDays size={14} aria-hidden="true" />
            {year}
          </span>
        </div>
      }
    >
      <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 xs:flex-row xs:flex-wrap">{actions}</div>
        {facts?.length > 0 && (
          <dl aria-label={factsLabel} className="grid grid-cols-3 divide-x divide-line/12 rounded-lg border border-line/12 bg-surface py-4 shadow-xs rtl:divide-x-reverse lg:min-w-[26rem]">
            {facts.map((f) => (
              <div key={f.label} className="min-w-0 px-4 sm:px-6">
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
    </PageHero>
  );
}
