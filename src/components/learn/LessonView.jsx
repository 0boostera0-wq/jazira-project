import { ArrowUpRight, ChevronLeft, ChevronRight, Info, Target } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/i18n/format";
import { cn } from "@/components/ui/cn";
import ContentText, { ALIGN_UI, contentProps } from "./ContentText";
import { TermBadge } from "./ResourceState";
import { pagesLabel } from "./SubjectOutline";

// Server component: the body of a lesson page (§7). Everything comes from
// learnPageModel(); copy through `t` ("learn"). Content titles take their
// language and direction from their own text (ContentText).

const BAND_TONE = { 1: "bg-green-50 text-green-700 ring-green-100", 2: "bg-gold-50 text-gold-700 ring-gold-200/60", 3: "bg-danger-soft text-danger ring-danger/20" };

export default function LessonView({ model, t, locale }) {
  const l = model.lesson;
  const printed = l.pages.find((p) => p.printed)?.printed ?? null;
  const pool = l.pool;

  return (
    <div className="space-y-8">
      {/* ── facts ── */}
      <dl className="grid gap-x-6 gap-y-4 rounded-lg border border-line/12 bg-surface p-4 sm:grid-cols-3 sm:p-5">
        <div className="min-w-0">
          <dt className="t-caption">{t("lesson.unit")}</dt>
          <dd className="mt-1 text-[0.9375rem] font-medium text-ink">
            {l.unit ? (
              <Link href={`/learn/${l.unit.id}`} className="break-words hover:underline">
                <ContentText text={l.unit.title} textEn={l.unit.title_en} locale={locale} />
              </Link>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="t-caption">{t("lesson.term")}</dt>
          <dd className="mt-1">
            <TermBadge badge={model.term} t={t} size="md" />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="t-caption">{t("lesson.pages")}</dt>
          <dd className="mt-1 text-[0.9375rem] font-medium text-ink tabular">{pagesLabel(t, locale, printed) || t("lesson.unmapped")}</dd>
        </div>
      </dl>

      {(l.review || l.opener) && (
        <p className="t-small flex items-start gap-2.5 rounded-md bg-surface-2/70 px-3.5 py-3 text-ink-2">
          <Info size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-3" />
          <span>{t("lesson.reviewNote")}</span>
        </p>
      )}

      {/* ── objectives ── */}
      <section aria-labelledby="lesson-objectives">
        <h2 id="lesson-objectives" className="t-h4">{t("lesson.objectives")}</h2>
        {l.objectives.length ? (
          <ul className="mt-3 space-y-2">
            {l.objectives.map((o, i) => (
              <li key={o.id || i} className="flex items-start gap-2.5">
                <Target size={16} aria-hidden="true" className="mt-1 shrink-0 text-gold-600" />
                <ContentText text={o.text} textEn={o.text_en} locale={locale} className="t-body text-ink-2" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="t-small mt-2 text-ink-3">{t("lesson.objectivesEmpty")}</p>
        )}
      </section>

      {/* ── book pages (link-outs at #page=, nothing embedded) ── */}
      <section aria-labelledby="lesson-pages">
        <h2 id="lesson-pages" className="t-h4">{t("lesson.pagesTitle")}</h2>
        {l.pages.length ? (
          <ul className="mt-2 divide-y divide-line/10">
            {l.pages.map((p) => (
              <li key={`${p.resource_id}:${p.pdf.start}`} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  {p.title && (
                    <p {...contentProps(p.title, cn("break-words font-medium text-ink", ALIGN_UI))}>{p.title}</p>
                  )}
                  <p className="t-caption mt-0.5 tabular">
                    {[p.part ? t("resources.part", { part: formatNumber(p.part, locale) }) : null, pagesLabel(t, locale, p.printed) || t("lesson.pdfOnly", { page: formatNumber(p.pdf.start, locale) })]
                      .filter(Boolean)
                      .join(" · ")}
                    {p.status !== "verified" && <span className="text-warning"> · {t("lesson.review")}</span>}
                  </p>
                </div>
                {p.href && (
                  <a
                    href={p.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 shrink-0 items-center gap-1 self-start rounded-full px-3 text-sm font-medium text-gold-600 hover:bg-gold-50 sm:self-auto"
                  >
                    {t("lesson.openPage", { page: formatNumber(p.pdf.start, locale) })}
                    <ArrowUpRight size={15} aria-hidden="true" className="flip-rtl" />
                    <span className="sr-only">({t("resources.newTab")})</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="t-small mt-2 text-ink-3">{t("lesson.pagesEmpty")}</p>
        )}
      </section>

      {/* ── pool per band ── */}
      <section aria-labelledby="lesson-pool">
        <h2 id="lesson-pool" className="t-h4">{t("lesson.poolTitle")}</h2>
        {pool.total > 0 ? (
          <>
            <p className="t-caption mt-0.5">{t("lesson.poolLead")}</p>
            <dl className="mt-3 grid grid-cols-3 gap-2.5">
              {[1, 2, 3].map((b) => (
                <div key={b} className={cn("rounded-md px-3 py-2.5 ring-1 ring-inset", BAND_TONE[b])}>
                  <dt className="text-xs font-medium">{t(`lesson.bands.${b}`)}</dt>
                  <dd className="mt-0.5 text-lg font-bold tabular">{formatNumber(pool.counts[b], locale)}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <p className="t-small mt-2 text-ink-3">{t("lesson.poolEmpty")}</p>
        )}
      </section>

      {/* ── previous / next lesson ── */}
      {(l.prev || l.next) && (
        <nav aria-label={t("kinds.lesson")} className="grid gap-2.5 sm:grid-cols-2">
          {l.prev ? <SiblingLink item={l.prev} label={t("lesson.prev")} dir="prev" locale={locale} /> : <span className="hidden sm:block" />}
          {l.next && <SiblingLink item={l.next} label={t("lesson.next")} dir="next" locale={locale} />}
        </nav>
      )}
    </div>
  );
}

function SiblingLink({ item, label, dir, locale }) {
  const Icon = dir === "prev" ? ChevronRight : ChevronLeft; // reading direction: RTL first (icons flip in LTR)
  return (
    <Link
      href={`/learn/${item.id}`}
      className={cn(
        "group flex min-h-14 items-center gap-3 rounded-md border border-line/15 bg-surface px-3.5 py-2.5 transition-colors hover:border-line/25 hover:bg-surface-2/60",
        dir === "next" && "sm:flex-row-reverse sm:text-end"
      )}
    >
      <Icon size={18} aria-hidden="true" className="shrink-0 text-ink-3 ltr:rotate-180" />
      <span className="min-w-0 flex-1">
        <span className="t-caption block">{label}</span>
        <ContentText text={item.title} textEn={item.title_en} locale={locale} className="block truncate text-sm font-medium text-ink" />
      </span>
    </Link>
  );
}
