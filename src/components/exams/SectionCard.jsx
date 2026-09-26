import IconTile from "@/components/ui/IconTile";
import Illustration from "@/components/ui/Illustration";
import { SECTIONS } from "@/lib/exams/catalog";
import { cn } from "@/components/ui/cn";
import { ArrowLink } from "@/components/stages/parts";
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
      <div aria-hidden="true" className={cn("relative overflow-hidden", wide ? "aspect-[16/9] md:col-span-2 md:aspect-auto md:min-h-[12rem]" : "aspect-[16/9]")}>
        <Illustration id={def.illustration} fill sizes={wide ? "(min-width: 768px) 40vw, 100vw" : "(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"} />
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
              <BankNumber exam={exam} section={section} topic={topic} className="text-ink-3 tabular" skeletonClass="h-3 w-4" />
            </li>
          ))}
        </ul>

        <div className="mt-auto pt-5">
          <ArrowLink href={builderHref(exam, { section })}>{t(practiceKey)}</ArrowLink>
        </div>
      </div>
    </article>
  );
}
