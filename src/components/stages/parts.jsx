import { ArrowRight, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import IconTile from "@/components/ui/IconTile";
import { cn } from "@/components/ui/cn";
import { subjectIcon } from "./icons";
import { catalogLabel } from "./names";

// Small server-safe building blocks shared by the stage pages (no hooks, so
// the client islands can use them too).

/** Catalog name, marked lang="ar" when English mode falls back to Arabic. */
export function CatalogName({ node, locale, className }) {
  const { text, lang } = catalogLabel(node, locale);
  return (
    <span className={className} lang={lang || undefined} dir={lang ? "rtl" : undefined}>
      {text}
    </span>
  );
}

/** Subject pill: icon + catalog name. */
export function SubjectChip({ subject, locale, className }) {
  const Icon = subjectIcon(subject.icon);
  return (
    <span
      className={cn(
        "inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border border-line/12 bg-surface px-3 text-[0.8125rem] font-medium text-ink-2",
        className
      )}
    >
      <Icon size={14} aria-hidden="true" className="shrink-0 text-ink-3" />
      <CatalogName node={subject} locale={locale} className="truncate" />
    </span>
  );
}

/** Text link with an arrow that points in the reading direction (44px tall). */
export function ArrowLink({ href, children, className }) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex min-h-11 items-center gap-1.5 rounded-xs text-[0.9375rem] font-medium text-gold-600 transition-colors hover:text-gold-700",
        className
      )}
    >
      {children}
      <ArrowRight
        size={16}
        aria-hidden="true"
        className="flip-rtl transition-transform duration-fast ease-out group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5"
      />
    </Link>
  );
}

/** Round chevron affordance used at the end of link cards. */
export function Chevron({ className }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line/15 bg-surface text-ink-3 transition-colors group-hover:border-line/25 group-hover:text-ink",
        className
      )}
    >
      <ChevronRight size={18} className="flip-rtl" />
    </span>
  );
}

/**
 * Link card: icon tile · title · body · chevron. Used for tools and exam links.
 * One card per row (below md): a row — icon, text, chevron. From `md` the cards
 * sit two or three abreast in a content column that is often narrow (the
 * sidebar takes 272px from `lg`), so the text drops below the icon row and
 * gets the card's full width instead of being squeezed between icon and chevron.
 */
export function LinkCard({ href, icon, tone = "gold", title, body, badge, className }) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative grid h-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-4 rounded-lg border border-line/12 bg-surface p-5 shadow-xs",
        "[grid-template-areas:'icon_text_chev'] md:grid-rows-[auto_1fr] md:gap-y-4 md:[grid-template-areas:'icon_._chev'_'text_text_text']",
        "transition-[transform,box-shadow,border-color] duration ease-out hover:-translate-y-0.5 hover:border-line/20 hover:shadow-md",
        className
      )}
    >
      <IconTile icon={icon} tone={tone} size="md" className="[grid-area:icon]" />
      <div className="flex h-full min-w-0 flex-col [grid-area:text]">
        <h3 className="t-h4">{title}</h3>
        <p className="t-small mt-1 text-ink-3">{body}</p>
        {badge && <p className="t-caption mt-auto pt-2.5 font-medium">{badge}</p>}
      </div>
      <Chevron className="-me-1 mt-0.5 [grid-area:chev]" />
    </Link>
  );
}

/** Cream "plate" behind library illustrations; a quiet surface in dark mode. */
export const PLATE = "bg-[#F7F0E3] dark:bg-surface-2";

/**
 * Numbered tips list on a tinted card. A narrow rail at xl; below xl the card
 * spans the content width, so the tips flow into two columns from `md`.
 */
export function TipsCard({ title, items, className }) {
  return (
    <section className={cn("surface-tint p-5 sm:p-6", className)} aria-label={title}>
      <h3 className="t-h4">{title}</h3>
      <ol className="mt-4 grid gap-4 md:grid-cols-2 md:gap-x-8 xl:grid-cols-1">
        {items.map((tip, i) => (
          <li key={i} className="flex gap-3">
            <span
              className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface text-[0.8125rem] font-bold text-gold-700 ring-1 ring-inset ring-gold-200/70 tabular"
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <p className="t-small text-ink-2">{tip}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
