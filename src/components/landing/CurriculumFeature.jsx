import { ArrowRight, BookOpen, ChevronRight, ClipboardList, Layers, NotebookPen, Route, Users } from "lucide-react";
import { getT } from "@/i18n/server";
import Button from "@/components/ui/Button";
import IconTile from "@/components/ui/IconTile";
import Illustration from "@/components/ui/Illustration";
import { Container, Section } from "@/components/ui/Layout";
import { ACADEMIC_YEAR } from "@/lib/curriculum";
import { Intro, MockTag, Point } from "./parts";

const PATH = ["stage", "grade", "subject", "term"];
const RESOURCES = [
  { key: "student", icon: BookOpen },
  { key: "activity", icon: NotebookPen },
  { key: "exams", icon: ClipboardList },
];

/** Curriculum feature — text at the start, the library image + resource card at the end. */
export default async function CurriculumFeature() {
  const t = await getT("landing");
  const year = ACADEMIC_YEAR.replace(/\D/g, "");

  return (
    <Section id="curriculum" aria-labelledby="curriculum-title" className="!pt-12 sm:!pt-16">
      <Container className="grid items-center gap-12 lg:grid-cols-12 lg:gap-14">
        <div className="lg:col-span-5">
          <Intro
            id="curriculum-title"
            eyebrow={t("curriculum.eyebrow")}
            title={t("curriculum.title")}
            lead={t("curriculum.lead", { year })}
          />

          {/* phones: a 4-step stepper; sm+: a breadcrumb of chips */}
          <ol aria-label={t("curriculum.path.label")} className="mt-7 grid grid-cols-4 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-x-1.5 sm:gap-y-2">
            {PATH.map((k, i) => (
              <li key={k} className="flex items-center gap-1.5">
                <span className="flex w-full flex-col items-center gap-1.5 rounded-md border border-line/15 bg-surface px-1 py-2 text-[0.8125rem] font-medium text-ink-2 shadow-xs sm:h-8 sm:w-auto sm:flex-row sm:gap-2 sm:rounded-full sm:py-0 sm:pe-3 sm:ps-1 sm:text-sm">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-gold-50 text-xs font-bold text-gold-700 tabular" aria-hidden="true">
                    {i + 1}
                  </span>
                  {t(`curriculum.path.${k}`)}
                </span>
                {i < PATH.length - 1 && <ChevronRight size={14} className="flip-rtl hidden text-ink-4 sm:block" aria-hidden="true" />}
              </li>
            ))}
          </ol>

          <ul className="mt-8 space-y-5">
            <Point icon={Layers} title={t("curriculum.points.types.title")} body={t("curriculum.points.types.body")} />
            <Point icon={Route} title={t("curriculum.points.tracks.title")} body={t("curriculum.points.tracks.body")} />
            <Point icon={Users} title={t("curriculum.points.more.title")} body={t("curriculum.points.more.body")} />
          </ul>

          <div className="mt-9">
            <Button href="/curriculum" variant="secondary" iconEnd={ArrowRight}>{t("curriculum.cta")}</Button>
          </div>
        </div>

        <div className="relative lg:col-span-7">
          <div className="art-frame rounded-xl shadow-sm">
            <Illustration id="landing.curriculum" sizes="(min-width: 1280px) 700px, (min-width: 1024px) 56vw, 100vw" className="aspect-[4/3] object-cover sm:aspect-[16/11]" />
          </div>

          {/* resource card — mirrors the real resource structure of every subject */}
          <figure className="relative mx-3 -mt-12 sm:absolute sm:inset-x-8 sm:-bottom-8 sm:mx-0 sm:mt-0">
            <figcaption className="sr-only">
              {t("curriculum.mock.subject")} — {t("curriculum.mock.context")}
            </figcaption>
            <div aria-hidden="true" className="rounded-lg border border-line/15 bg-surface p-4 shadow-lg sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium leading-snug text-ink">{t("curriculum.mock.subject")}</p>
                  <p className="t-caption mt-0.5">{t("curriculum.mock.context")}</p>
                </div>
                <MockTag>{t("curriculum.mock.label")}</MockTag>
              </div>
              <ul className="mt-4 grid gap-2 sm:grid-cols-3">
                {RESOURCES.map((r) => (
                  <li key={r.key} className="flex items-center gap-2.5 rounded-md border border-line/10 bg-canvas/60 p-2.5">
                    <IconTile icon={r.icon} tone="neutral" size="sm" />
                    <span className="min-w-0 flex-1 text-sm font-medium leading-tight text-ink-2">{t(`curriculum.mock.${r.key}`)}</span>
                    <ChevronRight size={16} className="flip-rtl shrink-0 text-ink-4" />
                  </li>
                ))}
              </ul>
            </div>
          </figure>
        </div>
      </Container>
    </Section>
  );
}
