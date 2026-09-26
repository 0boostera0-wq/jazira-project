import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import IconTile from "@/components/ui/IconTile";
import Illustration from "@/components/ui/Illustration";
import { SECTIONS } from "@/lib/exams/catalog";
import { BankNumber } from "./BankProvider";
import { builderHref } from "./builder-logic";
import { sectionColor, sectionIcon } from "./labels";

/**
 * One section / subject: art · name · live count · what it covers · its skills
 * (with live counts) · "practise this section" deep link into the builder.
 * `wide` lays the art beside the text (2-up grids); otherwise it sits on top.
 */
export default function SectionCard({ exam, section, t, wide = false }) {
  const def = SECTIONS[section];
  const Icon = sectionIcon(section);
  const practiceKey = exam === "achievement" ? "pages.sectionCard.practiceSubject" : "pages.sectionCard.practice";
  const titleId = `sec-${section}`;
  return (
    <article aria-labelledby={titleId} className={wide ? "surface-flat grid overflow-hidden md:grid-cols-5" : "surface-flat flex flex-col overflow-hidden"}>
      <div className={wide ? "grid place-items-center bg-[#F7F0E3] px-6 py-4 md:col-span-2" : "bg-[#F7F0E3] px-8 pt-3"}>
        <Illustration id={def.illustration} className={wide ? "w-full max-w-[260px]" : "mx-auto w-full max-w-[180px] sm:max-w-[240px]"} />
      </div>
      <div className={wide ? "flex flex-col p-5 sm:p-6 md:col-span-3" : "flex flex-1 flex-col p-5 sm:p-6"}>
        <div className="flex items-center gap-3">
          <IconTile icon={Icon} color={sectionColor(section)} size="sm" />
          <div className="min-w-0">
            <h3 id={titleId} className="t-h3 leading-tight">{t(`sections.${section}`)}</h3>
            <p className="t-caption">
              <BankNumber exam={exam} section={section} unit="questions" skeletonClass="h-3 w-16" />
            </p>
          </div>
        </div>
        <p className="t-small mt-3 text-ink-2">{t(`pages.${exam}.cards.${section}`)}</p>

        <p className="t-caption mt-4 font-medium text-ink-2">{t("pages.sectionCard.topicsLabel")}</p>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {def.topics.map((topic) => (
            <li
              key={topic}
              className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border border-line/12 bg-surface-2/70 px-3 text-[0.8125rem] text-ink-2"
            >
              <span className="truncate">{t(`topics.${topic}`)}</span>
              <BankNumber exam={exam} section={section} topic={topic} className="text-ink-4 tabular" skeletonClass="h-3 w-4" />
            </li>
          ))}
        </ul>

        <div className="mt-auto pt-5">
          <Link
            href={builderHref(exam, { section })}
            className="group/link inline-flex min-h-11 items-center gap-1.5 rounded-xs text-[0.9375rem] font-medium text-gold-600 transition-colors hover:text-gold-700"
          >
            {t(practiceKey)}
            <ArrowRight size={16} aria-hidden="true" className="flip-rtl transition-transform duration-fast ease-out group-hover/link:translate-x-0.5 rtl:group-hover/link:-translate-x-0.5" />
          </Link>
        </div>
      </div>
    </article>
  );
}
