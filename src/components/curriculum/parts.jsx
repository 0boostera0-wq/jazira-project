import { ArrowUpRight, CalendarDays, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/i18n/format";
import { cn } from "@/components/ui/cn";
import { SubjectTile } from "./SubjectIcon";

// Small server-safe building blocks shared by the curriculum pages (no hooks,
// so client islands can use them too). All copy arrives as props.

/** "School year 1447 AH" pill. */
export function YearChip({ children, className }) {
  return (
    <span className={cn("inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-line/15 bg-surface px-2.5 text-[0.8125rem] font-medium text-ink-3", className)}>
      <CalendarDays size={14} aria-hidden="true" />
      {children}
    </span>
  );
}

/** Row of headline numbers: [{ key, value, label }] (values come from the catalog). */
export function Facts({ items, label, locale, className }) {
  if (!items?.length) return null;
  return (
    <dl
      aria-label={label}
      className={cn(
        "grid max-w-2xl gap-y-4 border-t border-line/15 pt-5 xs:flex xs:flex-wrap xs:divide-x xs:divide-line/15 xs:rtl:divide-x-reverse",
        items.length % 3 === 0 ? "grid-cols-3" : "grid-cols-2",
        className
      )}
    >
      {items.map((f) => (
        <div key={f.key || f.label} className="min-w-0 pe-4 xs:px-4 xs:first:ps-0 xs:last:pe-0 sm:px-5">
          <dt className="sr-only">{f.label}</dt>
          <dd>
            <span className="block text-2xl font-bold leading-tight text-ink tabular sm:text-[1.75rem]">{formatNumber(f.value, locale)}</span>
            <span aria-hidden="true" className="t-caption mt-1 block">{f.label}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Pill navigation between sibling grades / tracks / years. items: [{ key, label, href, active }] */
export function LevelSwitcher({ label, items, className }) {
  if (!items?.length || items.length < 2) return null;
  return (
    <nav aria-label={label} className={cn("flex min-w-0 items-start gap-3", className)}>
      <span className="t-caption mt-3 w-14 shrink-0 font-medium text-ink-3 sm:mt-2">{label}</span>
      <ul className="flex min-w-0 flex-wrap gap-1.5">
        {items.map((it) => (
          <li key={it.key} className="shrink-0">
            <Link
              href={it.href}
              aria-current={it.active ? "page" : undefined}
              className={cn(
                "inline-flex h-11 items-center whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors duration-fast sm:h-9 sm:px-3.5",
                it.active
                  ? "border-transparent bg-primary text-primary-fg"
                  : "border-line/15 bg-surface text-ink-2 hover:border-line/30 hover:text-ink"
              )}
            >
              {it.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Outbound link to an official site: new tab, no referrer, visible cue. */
export function ExternalLink({ href, children, newTabLabel, className, iconClassName }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cn("group inline-flex items-center gap-1", className)}>
      {children}
      <ArrowUpRight size={15} aria-hidden="true" className={cn("shrink-0 flip-rtl", iconClassName)} />
      {newTabLabel && <span className="sr-only">({newTabLabel})</span>}
    </a>
  );
}

/** Official Arabic name, marked as Arabic content (used under English names). */
export function ArabicName({ children, className }) {
  if (!children) return null;
  return (
    <span lang="ar" dir="rtl" className={cn("font-ar", className)}>
      {children}
    </span>
  );
}

/** Round chevron affordance at the end of link cards (the one implementation; stages/parts re-exports it). */
export function Chevron({ className }) {
  return (
    <span aria-hidden="true" className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line/15 bg-surface text-ink-3 transition-colors group-hover:border-line/25 group-hover:text-ink", className)}>
      <ChevronRight size={18} className="flip-rtl" />
    </span>
  );
}

/**
 * Subject pill: colour tile + name (name in the active language, passed in;
 * `lang="ar"` marks an Arabic fallback name inside the English UI). The one
 * subject chip of the app — stages/parts wraps it for catalog nodes.
 */
export function SubjectChip({ subject, name, lang, className }) {
  return (
    <span className={cn("inline-flex h-9 max-w-full items-center gap-2 rounded-full border border-line/15 bg-surface pe-3 ps-1 text-[0.8125rem] font-medium text-ink-2", className)}>
      <SubjectTile subject={subject} size="xs" className="rounded-full" />
      <span lang={lang} dir={lang === "ar" ? "rtl" : undefined} className="truncate">{name}</span>
    </span>
  );
}

/** Localised page numbers, consecutive runs collapsed ("25–40"), joined with the locale's separator. */
export function pageList(pages, locale) {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const runs = [];
  for (const p of sorted) {
    const last = runs[runs.length - 1];
    if (last && p === last[1] + 1) last[1] = p;
    else runs.push([p, p]);
  }
  const f = (n) => formatNumber(n, locale);
  return runs.map(([a, b]) => (a === b ? f(a) : `${f(a)}–${f(b)}`)).join(locale === "ar" ? "، " : ", ");
}
