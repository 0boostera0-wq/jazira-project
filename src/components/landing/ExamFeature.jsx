import { ArrowRight, Brain, ChevronLeft, ChevronRight, ListChecks, SlidersHorizontal, Timer } from "lucide-react";
import { getT } from "@/i18n/server";
import { formatClock } from "@/i18n/format";
import Button from "@/components/ui/Button";
import IconTile from "@/components/ui/IconTile";
import Illustration from "@/components/ui/Illustration";
import { Container, Section } from "@/components/ui/Layout";
import { ProgressBar } from "@/components/ui/Progress";
import { cn } from "@/components/ui/cn";
import { LIMITS } from "@/lib/exams/catalog";
import { Intro, MockTag, Point } from "./parts";

// Static, clearly-labelled mock of the exam runner. No real data.
const MOCK = { total: 10, current: 4, answered: [1, 2, 3], selected: "b", secondsLeft: 1104 };
const CHOICES = ["a", "b", "c", "d"];

/** Exam practice — full-bleed tint band; interface mock at the start, copy at the end. */
export default async function ExamFeature() {
  const t = await getT("landing");
  return (
    <Section id="exams" tone="tint" aria-labelledby="exams-title">
      {/* [&>*]:min-w-0 — grid items may shrink below their min-content, so the page reflows at 320px */}
      <Container className="grid items-center gap-12 lg:grid-cols-12 lg:gap-14 [&>*]:min-w-0">
        <div className="lg:order-2 lg:col-span-5">
          <Intro id="exams-title" eyebrow={t("exams.eyebrow")} title={t("exams.title")} lead={t("exams.lead")} />
          <ul className="mt-8 space-y-5">
            <Point icon={Timer} title={t("exams.points.timed.title")} body={t("exams.points.timed.body")} />
            <Point icon={SlidersHorizontal} title={t("exams.points.sections.title")} body={t("exams.points.sections.body")} />
            <Point icon={ListChecks} title={t("exams.points.review.title")} body={t("exams.points.review.body")} />
          </ul>
          {/* try-it module: the exam art sits inside the card, next to the action it illustrates.
              Below 360px there's no room beside the art for the button, so it takes its own full-width row. */}
          <div className="mt-9 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 rounded-lg border border-line/12 bg-surface p-3 pe-4 shadow-xs sm:gap-x-5 sm:pe-6 max-[359px]:gap-x-3 max-[359px]:pe-3">
            <div aria-hidden="true" className="row-span-2 grid w-24 place-items-center rounded-md bg-gold-50/70 ring-1 ring-inset ring-gold-200/50 sm:w-32 max-[359px]:row-span-1 max-[359px]:w-20">
              <Illustration id="landing.exams" />
            </div>
            <div className="min-w-0 pt-1.5">
              <p className="font-medium leading-snug text-ink">{t("exams.try")}</p>
              <p className="t-small mt-1 text-ink-3">
                {t("exams.guest", { questions: t("units.questions", { count: LIMITS.guestMaxQuestions }) })}
              </p>
            </div>
            <div className="min-w-0 pb-1.5 max-[359px]:col-span-2 max-[359px]:pb-0">
              <Button href="/exams" variant="secondary" iconEnd={ArrowRight} className="mt-3.5 max-[359px]:w-full">{t("exams.cta")}</Button>
            </div>
          </div>
        </div>

        <div className="lg:order-1 lg:col-span-7">
          <ExamMock t={t} />
        </div>
      </Container>
    </Section>
  );
}

function ExamMock({ t }) {
  const { total, current, answered, selected, secondsLeft } = MOCK;
  return (
    <figure className="relative">
      <figcaption className="sr-only">{t("exams.mock.caption")}</figcaption>
      <div aria-hidden="true" className="overflow-hidden rounded-xl border border-line/15 bg-surface shadow-lg">
        {/* top bar */}
        <div className="flex items-center justify-between gap-3 border-b border-line/10 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <IconTile icon={Brain} tone="gold" size="sm" />
            <p className="truncate text-sm font-medium text-ink">{t("exams.mock.exam")}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <MockTag className="hidden sm:inline-flex">{t("exams.mock.label")}</MockTag>
            <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-sm font-medium text-ink">
              <Timer size={15} className="shrink-0 text-gold-600" />
              <span className="num tabular">{formatClock(secondsLeft)}</span>
            </span>
          </div>
        </div>

        <div className="grid sm:grid-cols-[1fr_auto]">
          {/* question */}
          <div className="p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="t-caption font-medium">{t("exams.mock.progress", { current, total })}</p>
              <MockTag className="sm:hidden">{t("exams.mock.label")}</MockTag>
            </div>
            <ProgressBar value={(current / total) * 100} size="sm" className="mt-2.5" />
            <p className="mt-5 text-lg font-medium text-ink sm:mt-6 sm:text-xl">{t("exams.mock.question")}</p>
            {/* short numeric choices: a 2×2 grid at every width keeps the phone mock compact */}
            <ul className="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:gap-2.5">
              {CHOICES.map((c) => {
                const on = c === selected;
                return (
                  <li
                    key={c}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md border px-3 py-2.5 sm:gap-3 sm:px-3.5 sm:py-3",
                      on ? "border-gold-400 bg-gold-50 ring-1 ring-gold-300/60" : "border-line/15 bg-surface"
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-medium",
                        on ? "bg-primary text-primary-fg" : "bg-surface-2 text-ink-3"
                      )}
                    >
                      {t(`exams.mock.letters.${c}`)}
                    </span>
                    <span className="num tabular text-base font-medium text-ink">{t(`exams.mock.choices.${c}`)}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* navigator */}
          <div className="border-t border-line/10 bg-surface-2/40 p-4 sm:w-[13.5rem] sm:border-s sm:border-t-0 sm:p-6">
            <p className="t-caption font-medium text-ink-2">{t("exams.mock.navigator")}</p>
            <ol className="mt-3 grid grid-cols-10 gap-1.5 sm:grid-cols-5">
              {Array.from({ length: total }, (_, i) => {
                const n = i + 1;
                const state = n === current ? "current" : answered.includes(n) ? "answered" : "pending";
                return (
                  <li
                    key={n}
                    className={cn(
                      "grid aspect-square place-items-center rounded-xs text-[0.75rem] font-medium tabular",
                      state === "current" && "bg-primary text-primary-fg",
                      state === "answered" && "bg-green-50 text-green-700 ring-1 ring-inset ring-green-200",
                      state === "pending" && "bg-surface text-ink-3 ring-1 ring-inset ring-line/15"
                    )}
                  >
                    {n}
                  </li>
                );
              })}
            </ol>
            <ul className="mt-4 hidden space-y-2 sm:block">
              {[
                ["answered", "bg-green-50 ring-green-200"],
                ["current", "bg-primary ring-transparent"],
                ["pending", "bg-surface ring-line/20"],
              ].map(([k, cls]) => (
                <li key={k} className="t-caption flex items-center gap-2">
                  <span className={cn("h-3 w-3 rounded-[3px] ring-1 ring-inset", cls)} />
                  {t(`exams.mock.legend.${k}`)}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* footer */}
        <div className="flex items-center justify-between gap-3 border-t border-line/10 px-4 py-3 sm:px-6">
          <span className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm font-medium text-ink-3">
            <ChevronLeft size={16} className="flip-rtl" />
            {t("exams.mock.previous")}
          </span>
          <span className="inline-flex h-9 items-center gap-1 rounded-full bg-primary pe-3 ps-4 text-sm font-medium text-primary-fg">
            {t("exams.mock.next")}
            <ChevronRight size={16} className="flip-rtl" />
          </span>
        </div>
      </div>
    </figure>
  );
}
