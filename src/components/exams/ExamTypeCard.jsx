import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import Button from "@/components/ui/Button";
import IconTile from "@/components/ui/IconTile";
import Illustration from "@/components/ui/Illustration";
import { cn } from "@/components/ui/cn";
import { PLATE } from "@/components/stages/parts";
import { EXAMS, SECTIONS } from "@/lib/exams/catalog";
import { BankNumber } from "./BankProvider";
import { examIcon, sectionColor, sectionIcon } from "./labels";

/**
 * Hub card for one exam: art plate · tag · title · body · its sections with
 * live question counts · CTA. The title is a link; the CTA is a real
 * button-link for touch users.
 *
 * Layout: stacked on phones, art beside the text on tablets and narrow
 * desktops (md → xl, where two cards side by side would squeeze the section
 * list), stacked again in the two-up grid at xl. Two-section exams list their
 * sections as full-width rows (with the skill count) so both cards keep the
 * same height in the two-up grid.
 * `eagerArt`: the first card's art is the largest image on phones (the hub
 * hero's art is desktop-only), so it loads eagerly instead of lazily.
 */
export default function ExamTypeCard({ exam, t, eagerArt = false }) {
  const def = EXAMS[exam];
  const Icon = examIcon(exam);
  const href = `/exams/${exam}`;
  const rows = def.sections.length <= 2;
  return (
    <article className="group grid h-full overflow-hidden rounded-xl border border-line/12 bg-surface shadow-sm transition-[box-shadow,border-color] duration ease-out hover:border-line/20 hover:shadow-md md:grid-cols-12 xl:flex xl:flex-col">
      <div className={cn("relative grid place-items-center px-6 pt-5 sm:px-10 md:col-span-5 md:px-6 md:py-6 xl:block xl:px-10 xl:pb-0 xl:pt-5", PLATE)}>
        <Illustration
          id={def.illustration}
          loading={eagerArt ? "eager" : "lazy"}
          className="mx-auto w-full max-w-[380px] transition-transform duration-slow ease-out group-hover:-translate-y-1"
        />
      </div>
      <div className="flex flex-1 flex-col p-5 sm:p-7 md:col-span-7">
        <div className="flex items-center gap-3">
          <IconTile icon={Icon} tone="gold" size="sm" />
          <p className="t-eyebrow">{t(`hub.cards.${exam}.tag`)}</p>
        </div>
        <h3 className="t-h3 mt-3">
          <Link href={href} className="rounded-xs outline-offset-4 hover:text-gold-700">{t(`types.${exam}`)}</Link>
        </h3>
        <p className="t-body mt-2 text-ink-3">{t(`hub.cards.${exam}.body`)}</p>

        <p className="sr-only">{t("hub.cards.sectionsLabel")}</p>
        <ul className={cn("mt-5 grid gap-2", rows ? "grid-cols-1" : "grid-cols-2")}>
          {def.sections.map((s) => {
            const SIcon = sectionIcon(s);
            return (
              <li key={s} className="flex min-w-0 items-center gap-2.5 rounded-md border border-line/10 bg-surface-2/60 px-3 py-2.5">
                <IconTile icon={SIcon} color={sectionColor(s)} size="sm" className="!h-8 !w-8" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{t(`sections.${s}`)}</p>
                  <p className="t-caption leading-tight">
                    <BankNumber exam={exam} section={s} unit="questions" skeletonClass="h-3 w-14" />
                  </p>
                </div>
                {rows && <span className="t-caption ms-auto shrink-0">{t("units.topics", { count: SECTIONS[s].topics.length })}</span>}
              </li>
            );
          })}
        </ul>

        <div className="mt-auto pt-6">
          <Button href={href} variant="secondary" size="lg" block iconEnd={ArrowRight}>
            {t(`hub.cards.${exam}.cta`)}
          </Button>
        </div>
      </div>
    </article>
  );
}
