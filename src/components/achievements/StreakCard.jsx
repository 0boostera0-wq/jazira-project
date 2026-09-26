"use client";

import { Flame } from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import { formatDate } from "@/i18n/format";
import Illustration from "@/components/ui/Illustration";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import { CALENDAR_WEEKS } from "./progress";
import { useProgress } from "./ProgressProvider";

// Weekday initials, Sunday first (the Saudi week), from Intl in the UI locale.
function weekdayLabels(locale) {
  const base = Date.UTC(2024, 0, 7); // a Sunday
  return Array.from({ length: 7 }, (_, i) =>
    formatDate(new Date(base + i * 86400000), locale, { weekday: "narrow", timeZone: "UTC" })
  );
}

function LegendSwatch({ className, children }) {
  return <span aria-hidden="true" className={cn("grid h-3 w-3 shrink-0 place-items-center rounded-[3px]", className)}>{children}</span>;
}

/**
 * The last 4 weeks. Gold = the current run of consecutive active days (known
 * from the streak row; the DB counts a run's first day as streak 0, so a streak
 * of N lights N + 1 days); green dot = a day with a graded exam
 * (get_exam_stats daily trend).
 * The picture is summarised for assistive tech in one sentence.
 */
function Calendar({ weeks }) {
  const t = useT("achievements");
  const { locale } = useLocale();
  const labels = weekdayLabels(locale);
  const days = (n) => t("units.days", { count: n });
  const cells = weeks.flat();
  const examsKnown = cells.some((c) => c.exams !== null);
  const inRun = cells.filter((c) => c.active).length;
  const examDays = cells.filter((c) => c.exams > 0).length;
  const summary = [
    t("streak.calendar.summary", { days: days(inRun) }),
    examsKnown ? t("streak.calendar.summaryExams", { days: days(examDays) }) : null,
  ].filter(Boolean).join(" ");

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
        <p className="text-sm font-medium text-ink">{t("streak.calendar.title")}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3" aria-hidden="true">
          <span className="inline-flex items-center gap-1.5"><LegendSwatch className="bg-gold-400" />{t("streak.calendar.legendStreak")}</span>
          {examsKnown && (
            <span className="inline-flex items-center gap-1.5">
              <LegendSwatch className="bg-surface-3/70"><span className="h-1.5 w-1.5 rounded-full bg-green-600" /></LegendSwatch>
              {t("streak.calendar.legendExam")}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5"><LegendSwatch className="ring-[1.5px] ring-inset ring-ink/70" />{t("streak.calendar.legendToday")}</span>
        </div>
      </div>
      <div role="img" aria-label={summary} className="mt-3 grid grid-cols-7 gap-1.5">
        {labels.map((d, i) => (
          <span key={`h${i}`} aria-hidden="true" className="pb-0.5 text-center text-xs leading-none text-ink-3">{d}</span>
        ))}
        {cells.map((c) => {
          const date = formatDate(`${c.iso}T12:00:00Z`, locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
          const title = c.exams > 0 ? `${date} · ${t("streak.calendar.examsOn", { count: c.exams })}` : date;
          return (
            <span
              key={c.iso}
              aria-hidden="true"
              title={title}
              className={cn(
                "grid h-8 place-items-center rounded-[6px]",
                c.active ? "bg-gold-400" : c.future ? "bg-transparent ring-1 ring-inset ring-line/10" : "bg-surface-3/70",
                c.today && "ring-[1.5px] ring-inset ring-ink/70"
              )}
            >
              {c.exams > 0 && (
                <span className={cn("h-1.5 w-1.5 rounded-full", c.active ? "bg-green-700 ring-2 ring-gold-100/70" : "bg-green-600")} />
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Rail card: current streak, longest streak and the last 4 weeks of activity. */
export default function StreakCard({ className }) {
  const t = useT("achievements");
  const p = useProgress();
  const days = (n) => t("units.days", { count: n });

  let head;
  let body = null;
  if (p.status === "loading") {
    head = (
      <div aria-hidden="true" className="mt-4 space-y-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-3.5 w-32" />
      </div>
    );
    body = (
      <div aria-hidden="true" className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: CALENDAR_WEEKS * 7 }, (_, i) => <Skeleton key={i} className="h-8 !rounded-[6px]" />)}
      </div>
    );
  } else if (p.status === "guest") {
    head = (
      <div className="mt-3">
        <p className="font-medium leading-snug text-ink">{t("streak.guestTitle")}</p>
        <p className="t-small mt-1 text-ink-3">{t("streak.guestBody")}</p>
      </div>
    );
  } else if (p.status !== "ready" || !p.streak) {
    head = <p className="t-small mt-3 text-ink-3">{t("streak.unavailable")}</p>;
  } else {
    const s = p.streak;
    const status = !s.lastActive
      ? "none"
      : s.activeToday
        ? s.current > 0 ? "keepGoing" : "startTomorrow"
        : s.alive ? "visitToday" : "none";
    head = (
      <>
        <p className="t-caption mt-4">{t("streak.current")}</p>
        <p className="mt-0.5 text-[2rem] font-bold leading-tight text-ink tabular">{days(s.current)}</p>
        <p className="t-caption mt-1">{t("streak.longest", { days: days(s.longest) })}</p>
      </>
    );
    body = (
      <>
        <p className="t-small mb-4 text-ink-2">{t(`streak.status.${status}`)}</p>
        <Calendar weeks={p.calendar} />
      </>
    );
  }

  return (
    <section aria-labelledby="streak-title" className={cn("surface p-5 sm:p-6", className)}>
      {/* Floated so long copy (guest / empty states) wraps under the art instead of squeezing beside it. */}
      <Illustration id="community.motivation" className="float-end -mt-1 mb-2 ms-3 w-[104px] sm:w-[120px] xl:w-[96px] 2xl:w-[120px]" />
      <h2 id="streak-title" className="flex items-center gap-2 t-h4">
        <Flame size={18} aria-hidden="true" className="text-gold-600" />
        {t("streak.title")}
      </h2>
      {head}
      <div className="clear-both" />
      {body && <div className="mt-4 border-t border-line/10 pt-4">{body}</div>}
      <p className="t-caption mt-4">{t("streak.rule")}</p>
    </section>
  );
}
