"use client";

import { ArrowRight, Brain, ClipboardCheck, FlaskConical, Library, PlayCircle } from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import { formatPercent, formatRelative } from "@/i18n/format";
import Button from "@/components/ui/Button";
import IconTile from "@/components/ui/IconTile";
import Skeleton from "@/components/ui/Skeleton";
import { ProgressBar } from "@/components/ui/Progress";
import { useDashboard, useResource, useResumable } from "./DashboardProvider";
import CardNotice from "./CardNotice";
import Panel from "./Panel";
import { attemptTitle } from "./labels";
import {
  EXAM_CENTER_HREF, QUICK_PRACTICE_QUESTIONS, attemptHref, lastGraded, minutesFromCountdown, minutesLeft, practiceHref,
} from "./model";

function Tile({ icon, tone = "gold", eyebrow, title, titleProps, meta, action, children }) {
  return (
    <div className="flex h-full min-w-0 flex-col rounded-md border border-line/10 bg-surface-2/60 p-4">
      <div className="flex min-w-0 items-start gap-3">
        <IconTile icon={icon} tone={tone} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="t-caption">{eyebrow}</p>
          {/* titleProps (lang/dir) go on an inline isolate so the line keeps the UI's alignment. */}
          <p className="mt-0.5 font-medium leading-snug text-ink">{titleProps ? <span {...titleProps}>{title}</span> : title}</p>
          {meta && <p className="t-caption mt-1">{meta}</p>}
        </div>
      </div>
      {children}
      {action && <div className="mt-auto pt-4">{action}</div>}
    </div>
  );
}

function TileSkeleton() {
  return (
    <div aria-hidden="true" className="rounded-md border border-line/10 bg-surface-2/60 p-4">
      <div className="flex items-start gap-3">
        <Skeleton rounded="sm" className="h-9 w-9 shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton rounded="full" className="mt-4 h-9 w-32" />
    </div>
  );
}

const examIcon = (exam) => (exam === "achievement" ? FlaskConical : Brain);

function ExamTile() {
  const t = useT("dashboard");
  const tc = useT("common");
  const { locale } = useLocale();
  const { now } = useDashboard();
  const r = useResource("attempts");
  const { attempt: resumable, progress } = useResumable();

  if (r.status === "loading" || now === null) return <TileSkeleton />;
  if (r.status === "error") return <CardNotice status="error" onRetry={r.reload} />;

  // "unavailable" (history not deployed) still offers practice: the exam engine falls back to local mode.
  const items = r.status === "ready" ? r.data : [];
  if (resumable) {
    // Prefer the server countdown (get_exam_attempt); fall back to the listed deadline.
    const left = (progress ? minutesFromCountdown(progress.secondsLeft, progress.readAt, now) : null) ?? minutesLeft(resumable, now);
    const time = left === null ? null : tc("units.minutes", { count: left });
    const answered = progress && progress.total > 0 ? { answered: progress.answered, total: progress.total } : null;
    const questions = tc("units.questions", { count: Number(resumable.question_count) || 0 });
    // No deadline known → no invented countdown.
    const meta = answered
      ? t(time ? "continue.exam.resumeProgress" : "continue.exam.resumeProgressNoTime", { ...answered, time })
      : time ? t("continue.exam.resumeMeta", { questions, time }) : questions;
    return (
      <Tile
        icon={PlayCircle}
        eyebrow={t("continue.exam.resumeEyebrow")}
        title={attemptTitle(t, resumable.exam, resumable.section)}
        meta={meta}
        action={<Button href={attemptHref(resumable.id)} size="sm" variant="secondary" iconEnd={ArrowRight}>{t("continue.exam.resume")}</Button>}
      >
        {answered && (
          <ProgressBar
            value={(answered.answered / answered.total) * 100}
            size="sm"
            className="mt-3"
            label={t("continue.exam.resumeAria", { answered: answered.answered, questions: tc("units.questions", { count: answered.total }) })}
          />
        )}
      </Tile>
    );
  }
  const last = lastGraded(items);
  if (last) {
    const score = last.score_percent === null || last.score_percent === undefined ? NaN : Number(last.score_percent);
    return (
      <Tile
        icon={examIcon(last.exam)}
        tone={last.exam === "achievement" ? "green" : "gold"}
        eyebrow={t("continue.exam.lastEyebrow")}
        title={attemptTitle(t, last.exam, last.section)}
        meta={t("continue.exam.lastMeta", {
          score: Number.isFinite(score) ? formatPercent(score / 100, locale) : "—",
          when: formatRelative(last.submitted_at || last.started_at, locale, now),
        })}
        action={<Button href={practiceHref({ exam: last.exam, section: last.section })} size="sm" variant="secondary" iconEnd={ArrowRight}>{t("continue.exam.again")}</Button>}
      />
    );
  }
  return (
    <Tile
      icon={ClipboardCheck}
      eyebrow={t("continue.exam.noneEyebrow")}
      title={t("continue.exam.noneTitle")}
      meta={t("continue.exam.noneBody", { questions: tc("units.questions", { count: QUICK_PRACTICE_QUESTIONS }) })}
      action={<Button href={EXAM_CENTER_HREF} size="sm" variant="secondary" iconEnd={ArrowRight}>{t("continue.exam.start")}</Button>}
    />
  );
}

function CurriculumTile() {
  const t = useT("dashboard");
  const { locale } = useLocale();
  const { lastVisit, now } = useDashboard();

  if (lastVisit === undefined) return <TileSkeleton />;
  if (lastVisit) {
    // Title + stage name are curriculum catalog content, stored in the language
    // the page was opened in; when that differs from the UI, mark it (lang + dir).
    const foreign = lastVisit.lang && lastVisit.lang !== locale ? { lang: lastVisit.lang, dir: lastVisit.lang === "ar" ? "rtl" : "ltr" } : null;
    const when = lastVisit.at && now !== null ? formatRelative(lastVisit.at, locale, now) : null;
    const meta = lastVisit.context || when ? (
      <>
        {lastVisit.context && <span {...(foreign || { dir: "auto" })}>{lastVisit.context}</span>}
        {lastVisit.context && when && " · "}
        {when}
      </>
    ) : null;
    return (
      <Tile
        icon={Library}
        tone="green"
        eyebrow={t("continue.curriculum.lastEyebrow")}
        title={lastVisit.title || t("continue.curriculum.noneEyebrow")}
        titleProps={lastVisit.title ? foreign || { dir: "auto" } : undefined}
        meta={meta}
        action={<Button href={lastVisit.path} size="sm" variant="secondary" iconEnd={ArrowRight}>{t("continue.curriculum.open")}</Button>}
      />
    );
  }
  return (
    <Tile
      icon={Library}
      tone="green"
      eyebrow={t("continue.curriculum.noneEyebrow")}
      title={t("continue.curriculum.noneTitle")}
      meta={t("continue.curriculum.noneBody")}
      action={<Button href="/curriculum" size="sm" variant="secondary" iconEnd={ArrowRight}>{t("continue.curriculum.browse")}</Button>}
    />
  );
}

/**
 * "Pick up where you left off": the attempt to resume / repeat and the last
 * curriculum page on this device. A brand-new member (nothing to resume, no
 * attempt, no curriculum visit) gets the first-steps checklist instead, so
 * this panel steps aside rather than repeating the same two suggestions.
 */
export default function ContinueItems() {
  const t = useT("dashboard");
  const { lastVisit } = useDashboard();
  const attempts = useResource("attempts");
  const stats = useResource("stats");
  const { attempt: resumable } = useResumable();
  const brandNew =
    stats.status === "ready" && stats.data.completed === 0 &&
    attempts.status === "ready" && !resumable && !lastGraded(attempts.data) &&
    lastVisit === null;
  if (brandNew) return null;

  return (
    <Panel id="dash-continue" title={t("continue.title")}>
      <div className="grid gap-3 sm:grid-cols-2">
        <ExamTile />
        <CurriculumTile />
      </div>
    </Panel>
  );
}
