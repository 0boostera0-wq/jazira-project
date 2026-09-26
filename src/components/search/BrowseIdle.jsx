import { Backpack, BookOpen, ChevronRight, GraduationCap } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getT } from "@/i18n/server";
import Illustration from "@/components/ui/Illustration";
import { builderHref } from "@/components/exams/builder-logic";
import SectionTile from "./SectionTile";
import { STAGE_ART } from "./catalog.server";

const STAGE_ICONS = { elementary: Backpack, middle: BookOpen, "high-school": GraduationCap };

/**
 * What the page shows before a query: the curriculum stages and the practice
 * sections — real destinations, straight from the catalogs. Server-rendered.
 */
export default async function BrowseIdle({ locale, stages, practice }) {
  const [t, tc] = await Promise.all([getT("search"), getT("common")]);
  return (
    <div className="space-y-9">
      <section aria-labelledby="jz-browse-stages">
        <div className="mb-4">
          <h2 id="jz-browse-stages" className="t-h3">{t("idle.stagesTitle")}</h2>
          <p className="t-small mt-1 text-ink-3">{t("idle.stagesLead")}</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-3 sm:gap-4">
          {stages.map((s) => {
            const Icon = STAGE_ICONS[s.id] || GraduationCap;
            return (
              <li key={s.id}>
                <Link
                  href={s.href}
                  data-result
                  className="group flex h-full items-center gap-3.5 overflow-hidden rounded-lg border border-line/12 bg-surface p-3 shadow-sm transition-[box-shadow,border-color] duration ease-out hover:border-line/20 hover:shadow-md focus-visible:[box-shadow:var(--ring)] sm:flex-col sm:items-stretch sm:gap-0 sm:p-0"
                >
                  <span aria-hidden="true" className="relative hidden h-28 overflow-hidden sm:block xl:h-32">
                    <Illustration id={STAGE_ART[s.id]} fill sizes="(min-width: 640px) 33vw, 0px" className="transition-transform duration-slow ease-out group-hover:scale-[1.04]" />
                  </span>
                  <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-gold-50 text-gold-600 ring-1 ring-inset ring-gold-200/60 sm:hidden">
                    <Icon size={20} />
                  </span>
                  <span className="min-w-0 flex-1 sm:p-4">
                    <span className="flex items-center justify-between gap-2">
                      <span className="t-h4 truncate">{s.name}</span>
                      <ChevronRight size={16} aria-hidden="true" className="flip-rtl shrink-0 text-ink-4 transition-colors group-hover:text-ink-2" />
                    </span>
                    <span className="t-caption mt-0.5 block">
                      {tc("units.grades", { count: s.grades })} · {tc("units.subjects", { count: s.subjects })}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="jz-browse-sections">
        <div className="mb-4">
          <h2 id="jz-browse-sections" className="t-h3">{t("idle.sectionsTitle")}</h2>
          <p className="t-small mt-1 text-ink-3">{t("idle.sectionsLead")}</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {practice.sections.map((s) => (
            <li key={s.id}>
              <Link
                href={builderHref(s.exam, { section: s.id })}
                data-result
                className="group flex h-full min-h-[4.25rem] items-center gap-3 rounded-lg border border-line/12 bg-surface px-3.5 py-3 transition-[box-shadow,border-color,background-color] duration ease-out hover:border-line/20 hover:shadow-sm"
              >
                <SectionTile section={s.id} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{locale === "en" ? s.en : s.ar}</span>
                  <span className="t-caption block truncate">
                    {locale === "en" ? practice.types[s.exam].en : practice.types[s.exam].ar} · {t("results.topics", { count: s.topics })}
                  </span>
                </span>
                <ChevronRight size={16} aria-hidden="true" className="flip-rtl shrink-0 text-ink-4 transition-colors group-hover:text-ink-2" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
