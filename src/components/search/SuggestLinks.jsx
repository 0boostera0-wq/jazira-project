import { ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getT } from "@/i18n/server";
import { builderHref } from "@/components/exams/builder-logic";
import SectionTile from "./SectionTile";

const chip =
  "inline-flex h-10 items-center gap-2 rounded-full border border-line/15 bg-surface ps-2 pe-3.5 text-sm font-medium text-ink-2 transition-colors duration-fast hover:border-line/25 hover:bg-surface-2 hover:text-ink";

/**
 * Real destinations offered when a search finds nothing: the curriculum
 * stages and the practice sections. Server-rendered, passed to the island.
 */
export default async function SuggestLinks({ locale, stages, practice }) {
  const t = await getT("search");
  return (
    <div className="grid gap-6 text-start sm:grid-cols-2">
      <div>
        <h3 className="t-caption mb-2.5 font-medium">{t("suggest.stagesTitle")}</h3>
        <ul className="space-y-1">
          {stages.map((s) => (
            <li key={s.id}>
              <Link href={s.href} data-result className="group flex min-h-11 items-center justify-between gap-3 rounded-md px-2.5 text-[0.9375rem] font-medium text-ink transition-colors hover:bg-surface-2">
                <span className="truncate">{s.name}</span>
                <ChevronRight size={16} aria-hidden="true" className="flip-rtl shrink-0 text-ink-4 group-hover:text-ink-2" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="t-caption mb-2.5 font-medium">{t("suggest.sectionsTitle")}</h3>
        <ul className="flex flex-wrap gap-2">
          {practice.sections.map((s) => (
            <li key={s.id}>
              <Link href={builderHref(s.exam, { section: s.id })} data-result className={chip}>
                <SectionTile section={s.id} />
                {locale === "en" ? s.en : s.ar}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
