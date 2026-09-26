import { Award, BarChart3, Check, Flame, Medal, Star } from "lucide-react";
import { getT } from "@/i18n/server";
import IconTile from "@/components/ui/IconTile";
import Illustration from "@/components/ui/Illustration";
import { Container, Section } from "@/components/ui/Layout";
import { ProgressBar } from "@/components/ui/Progress";
import { cn } from "@/components/ui/cn";
import { ArrowLink, Intro, MockTag } from "./parts";

// Illustrative values for the mock only — shapes, never presented as real stats.
const SUBJECTS = [
  ["math", 78, "gold"],
  ["physics", 61, "gold"],
  ["chemistry", 70, "green"],
  ["biology", 84, "green"],
];
const TREND = [38, 46, 44, 55, 61, 58, 69, 76];
const WEEK = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DONE = 4; // days completed in the illustrative week; the next one is "today"

/** Progress & analytics bento: one tall analytics card + streak + achievements. */
export default async function ProgressBento() {
  const t = await getT("landing");
  return (
    <Section id="progress" aria-labelledby="progress-title" className="!pt-8 sm:!pt-12">
      <Container>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
          <Intro id="progress-title" eyebrow={t("progress.eyebrow")} title={t("progress.title")} lead={t("progress.lead")} />
          <ArrowLink href="/sign-up" className="shrink-0">{t("progress.cta")}</ArrowLink>
        </div>

        <div className="mt-10 grid gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-12">
          {/* A — results by section */}
          <figure className="surface flex flex-col p-5 sm:p-7 md:col-span-2 lg:col-span-7 lg:row-span-2">
            <figcaption className="sr-only">{t("progress.sections.caption")}</figcaption>
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-3.5">
                <IconTile icon={BarChart3} tone="gold" />
                <div>
                  <h3 className="t-h4">{t("progress.sections.title")}</h3>
                  <p className="t-small mt-1 max-w-md text-ink-3">{t("progress.sections.body")}</p>
                </div>
              </div>
              <MockTag className="hidden sm:inline-flex">{t("progress.label")}</MockTag>
            </div>

            <div aria-hidden="true" className="mt-7 grid flex-1 gap-6 sm:grid-cols-[1fr_1fr] sm:gap-8">
              <ul className="space-y-4">
                {SUBJECTS.map(([k, v, tone]) => (
                  <li key={k}>
                    <p className="t-small mb-1.5 font-medium text-ink-2">{t(`progress.sections.${k}`)}</p>
                    <ProgressBar value={v} tone={tone} />
                  </li>
                ))}
              </ul>
              <div className="flex flex-col rounded-md bg-surface-2/70 p-4">
                <p className="t-caption font-medium text-ink-2">{t("progress.sections.trend")}</p>
                {/* bars fill whatever height the bento row gives them; faint guides keep it chart-like */}
                <div className="relative mt-4 flex min-h-[7rem] flex-1 items-end gap-2 border-b border-line/15 sm:min-h-[9rem]">
                  <span className="pointer-events-none absolute inset-x-0 top-1/4 border-t border-dashed border-line/10" />
                  <span className="pointer-events-none absolute inset-x-0 top-2/4 border-t border-dashed border-line/10" />
                  <span className="pointer-events-none absolute inset-x-0 top-3/4 border-t border-dashed border-line/10" />
                  {TREND.map((h, i) => (
                    <span
                      key={i}
                      className={cn("relative flex-1 rounded-t-[5px]", i === TREND.length - 1 ? "bg-gold-500" : "bg-gold-200")}
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <MockTag className="mt-5 self-start sm:hidden">{t("progress.label")}</MockTag>
          </figure>

          {/* B — streak */}
          <div className="surface p-5 sm:p-7 lg:col-span-5">
            <div className="flex gap-3.5">
              <IconTile icon={Flame} tone="gold" />
              <div>
                <h3 className="t-h4">{t("progress.streak.title")}</h3>
                <p className="t-small mt-1 text-ink-3">{t("progress.streak.body")}</p>
              </div>
            </div>
            <ol aria-hidden="true" className="mt-6 grid grid-cols-7 gap-1.5 sm:gap-2">
              {WEEK.map((d, i) => (
                <li key={d} className="flex flex-col items-center gap-1.5">
                  <span
                    className={cn(
                      "grid aspect-square w-full max-w-[2.75rem] place-items-center rounded-full",
                      i < DONE && "bg-green-50 text-green-600 ring-1 ring-inset ring-green-200",
                      i === DONE && "bg-surface text-gold-600 ring-2 ring-inset ring-gold-400",
                      i > DONE && "bg-surface-2 text-ink-4"
                    )}
                  >
                    {i < DONE ? <Check size={16} strokeWidth={2.5} /> : i === DONE ? <Flame size={16} /> : null}
                  </span>
                  <span className="t-caption">{t(`progress.streak.days.${d}`)}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* C — achievements */}
          <div className="surface flex items-center gap-4 overflow-hidden p-5 sm:p-7 lg:col-span-5">
            <div className="min-w-0 flex-1">
              <h3 className="t-h4">{t("progress.achievements.title")}</h3>
              <p className="t-small mt-1 text-ink-3">{t("progress.achievements.body")}</p>
              <div aria-hidden="true" className="mt-5 flex gap-2">
                <IconTile icon={Award} tone="gold" size="sm" />
                <IconTile icon={Medal} tone="green" size="sm" />
                <IconTile icon={Star} tone="gold" size="sm" />
              </div>
            </div>
            {/* width lives on the wrapper: the <img> itself is always w-full */}
            <div className="-my-2 w-24 shrink-0 sm:w-40 lg:w-32 xl:w-40">
              <Illustration id="landing.progress" />
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}
