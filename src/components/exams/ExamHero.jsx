import Breadcrumbs from "@/components/ui/Breadcrumbs";
import { formatNumber } from "@/i18n/format";
import { cn } from "@/components/ui/cn";
import PageHero from "@/components/ui/PageHero";

/**
 * Hero for the exam pages: breadcrumbs, then the exam's image as a
 * full-width band with the title panel over it (PageHero), then the actions
 * and the key-facts row under the band.
 *
 * facts: React nodes, each a <div> with <dt>/<dd> (use <Fact/> or <BankFact/>).
 */
export default function ExamHero({ id = "exam-title", crumbs, crumbsLabel, eyebrow, title, lead, actions, facts, factsLabel, illustration, aside }) {
  return (
    <PageHero
      id={id}
      image={illustration}
      eyebrow={eyebrow}
      title={title}
      lead={lead}
      className="animate-in"
      top={crumbs ? <Breadcrumbs items={crumbs} label={crumbsLabel} /> : null}
    >
      <div className="flex flex-col gap-7 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {actions && <div className="flex flex-col gap-3 xs:flex-row xs:flex-wrap">{actions}</div>}
          {aside}
        </div>
        {facts && (
          <dl
            aria-label={factsLabel}
            className="grid grid-cols-3 divide-x divide-line/12 rounded-lg border border-line/12 bg-surface py-4 shadow-xs rtl:divide-x-reverse lg:min-w-[26rem] [&>div]:min-w-0 [&>div]:px-4 sm:[&>div]:px-6"
          >
            {facts}
          </dl>
        )}
      </div>
    </PageHero>
  );
}

/** A static fact: big number + caption (inside ExamHero's <dl>). */
export function Fact({ value, caption, locale, className }) {
  return (
    <div className={cn(className)}>
      <dt className="sr-only">{caption}</dt>
      <dd>
        <span className="block text-2xl font-bold leading-tight text-ink tabular sm:text-[1.75rem]">{formatNumber(value, locale)}</span>
        <span aria-hidden="true" className="t-caption mt-1 block">{caption}</span>
      </dd>
    </div>
  );
}
