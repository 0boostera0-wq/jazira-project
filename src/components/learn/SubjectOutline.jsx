import { ChevronDown, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/i18n/format";
import Badge from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import ContentText, { ALIGN_UI } from "./ContentText";
import { TermBadge } from "./ResourceState";

// Server-safe (no hooks): the /learn subject and unit pages render it on the
// server; the curriculum subject drawer (client) renders it with its own `t`.
// outline = compactOutline() → { units: [{ id, title, term, pool, lessons[] }], lessons }.
// Titles are educational content from the official listing: each is marked with
// the language of its own text (ContentText), so English course titles stay LTR.

const learnHref = (id) => `/learn/${id}`;

/** "Pages 12–15" / "Page 12" / null. */
export function pagesLabel(t, locale, pages) {
  if (!pages) return null;
  const start = formatNumber(pages.start, locale);
  return pages.end > pages.start ? t("lesson.printed.range", { start, end: formatNumber(pages.end, locale) }) : t("lesson.printed.one", { start });
}

export function LessonRow({ lesson, t, locale, index }) {
  const pages = pagesLabel(t, locale, lesson.pages);
  return (
    <li>
      <Link
        href={learnHref(lesson.id)}
        className="group flex min-h-12 items-center gap-3 rounded-md px-2.5 py-2 transition-colors duration-fast hover:bg-surface-2 focus-visible:bg-surface-2"
      >
        <span aria-hidden="true" className="w-6 shrink-0 text-center text-xs font-medium text-ink-4 tabular">
          {formatNumber(index + 1, locale)}
        </span>
        <span className="min-w-0 flex-1">
          <ContentText text={lesson.title} textEn={lesson.title_en} locale={locale} className={cn("block break-words text-[0.9375rem] leading-snug text-ink", ALIGN_UI)} />
          <span className="t-caption mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {lesson.chapter && (
              <ContentText text={lesson.chapter} locale={locale} className="truncate" />
            )}
            <span className="tabular">{pages || t("lesson.unmapped")}</span>
            {lesson.pool > 0 && <span className="tabular text-green-700">· {t("count.questions", { count: lesson.pool })}</span>}
          </span>
        </span>
        {lesson.opener ? (
          <Badge size="sm" tone="outline" className="shrink-0">{t("lesson.opener")}</Badge>
        ) : lesson.review ? (
          <Badge size="sm" tone="warning" className="shrink-0">{t("lesson.review")}</Badge>
        ) : null}
        <ChevronRight size={16} aria-hidden="true" className="flip-rtl shrink-0 text-ink-4 transition-colors group-hover:text-ink-2" />
      </Link>
    </li>
  );
}

/**
 * Units (collapsible, native <details>: no JavaScript) with their term badge,
 * lesson count and pool size; lessons link to their learn page.
 *   openFirst: how many units start open (all when the subject has ≤ 3 units)
 */
export default function SubjectOutline({ outline, t, locale, openFirst = 1, className }) {
  const units = outline?.units || [];
  if (!units.length) {
    return <p className={cn("t-small rounded-md border border-dashed border-line/20 px-3.5 py-3 text-ink-3", className)}>{t("subject.empty")}</p>;
  }
  const openAll = units.length <= 3;
  return (
    <ol className={cn("space-y-2", className)}>
      {units.map((u, i) => (
        <li key={u.id ?? "loose"}>
          <details open={openAll || i < openFirst} className="group/unit surface-flat overflow-hidden rounded-md border border-line/12">
            <summary className="flex min-h-14 cursor-pointer list-none items-start gap-3 px-3.5 py-3 marker:hidden hover:bg-surface-2/60 [&::-webkit-details-marker]:hidden">
              <ChevronDown size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-3 transition-transform duration-fast group-open/unit:rotate-180" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium leading-snug text-ink">
                  {u.id ? (
                    <ContentText text={u.title} textEn={u.title_en} locale={locale} className="break-words" />
                  ) : (
                    t("subject.loose")
                  )}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-1.5">
                  {u.term && <TermBadge badge={u.term} t={t} />}
                  <span className="t-caption tabular">{t("count.lessons", { count: u.lessons.length })}</span>
                  {u.pool > 0 && <span className="t-caption tabular">· {t("count.questions", { count: u.pool })}</span>}
                </span>
              </span>
            </summary>
            {u.id && (
              <div className="border-t border-line/10 px-3.5 py-2">
                <Link href={learnHref(u.id)} className="t-caption inline-flex min-h-8 items-center gap-0.5 font-medium text-gold-600 hover:underline">
                  {t("unit.open")}
                  <ChevronRight size={13} aria-hidden="true" className="flip-rtl" />
                </Link>
              </div>
            )}
            {u.lessons.length ? (
              <ol className="border-t border-line/10 p-1.5">
                {u.lessons.map((l, j) => (
                  <LessonRow key={l.id} lesson={l} t={t} locale={locale} index={j} />
                ))}
              </ol>
            ) : (
              <p className="t-caption border-t border-line/10 px-3.5 py-3">{t("unit.empty")}</p>
            )}
          </details>
        </li>
      ))}
    </ol>
  );
}
