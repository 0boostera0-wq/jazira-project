import Breadcrumbs from "@/components/ui/Breadcrumbs";
import { formatNumber } from "@/i18n/format";
import { cn } from "@/components/ui/cn";
import HeroArt from "@/components/stages/HeroArt";

/**
 * Split hero for the exam pages: breadcrumbs · eyebrow · h1 · lead · actions ·
 * a key-facts row (7 cols) beside the exam painting, framed (5 cols; preloaded
 * only from md up). Mobile: text and the primary action first, then the
 * painting as a lazy 16:9 banner that never competes with the phone LCP.
 *
 * facts: React nodes, each a <div> with <dt>/<dd> (use <Fact/> or <BankFact/>).
 */
export default function ExamHero({ id = "exam-title", crumbs, crumbsLabel, eyebrow, title, lead, actions, facts, factsLabel, illustration, aside }) {
  return (
    <section aria-labelledby={id} className="grid items-center gap-x-10 gap-y-8 md:grid-cols-12 xl:gap-x-14">
      <div className="animate-in min-w-0 md:col-span-7">
        {crumbs && <Breadcrumbs items={crumbs} label={crumbsLabel} className="mb-6 sm:mb-8" />}
        <p className="t-eyebrow">{eyebrow}</p>
        <h1 id={id} className="t-h1 mt-2.5 max-w-[22ch]">{title}</h1>
        <p className="t-lead mt-4 max-w-[40rem]">{lead}</p>
        {actions && <div className="mt-7 flex flex-col gap-3 xs:flex-row xs:flex-wrap">{actions}</div>}
        {facts && (
          <dl
            aria-label={factsLabel}
            className="mt-9 grid max-w-xl grid-cols-3 divide-x divide-line/12 border-t border-line/12 pt-5 rtl:divide-x-reverse [&>div:first-child]:ps-0 [&>div:last-child]:pe-0 [&>div]:min-w-0 [&>div]:px-3 sm:[&>div]:px-5"
          >
            {facts}
          </dl>
        )}
        {aside}
      </div>
      <div aria-hidden="true" className="animate-in md:col-span-5">
        <HeroArt id={illustration} from="md" sizes="(min-width: 1280px) 470px, 38vw" className="object-cover md:aspect-[1/1] xl:aspect-[5/4]" banner />
      </div>
    </section>
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
