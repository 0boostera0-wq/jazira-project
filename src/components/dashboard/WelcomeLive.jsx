"use client";

import { ArrowRight, Flame, Sparkles } from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import { formatDate, formatNumber, formatPercent } from "@/i18n/format";
import Button from "@/components/ui/Button";
import IconTile from "@/components/ui/IconTile";
import Skeleton from "@/components/ui/Skeleton";
import { ProgressRing } from "@/components/ui/Progress";
import { cn } from "@/components/ui/cn";
import { useDashboard, useResource, useResumable } from "./DashboardProvider";
import CardNotice from "./CardNotice";
import { EXAM_CENTER_HREF, attemptHref, firstName, greetingPeriod, lastGraded, practiceHref, streakStatus } from "./model";

/** Date eyebrow + time-of-day greeting (h1) + one-line context. Client clock, so it renders after mount. */
export function WelcomeHeading() {
  const t = useT("dashboard");
  const { locale } = useLocale();
  const { now, user, session } = useDashboard();
  const { attempt: resumable } = useResumable();
  const stats = useResource("stats");
  const firstVisit = stats.status === "ready" && stats.data.completed === 0;
  const ready = now !== null && session === "ready";
  const name = firstName(user.name);
  const period = ready ? greetingPeriod(new Date(now).getHours()) : null;

  return (
    <div>
      <p className="t-eyebrow min-h-[1.4em]">
        {now !== null ? formatDate(now, locale, { weekday: "long", day: "numeric", month: "long" }) : t("page.eyebrow")}
      </p>
      <h1 id="dash-greeting" className="t-h2 mt-1.5">
        {ready ? (
          name ? t(`greeting.named.${period}`, { name }) : t(`greeting.plain.${period}`)
        ) : (
          <>
            <span className="sr-only">{t("page.eyebrow")}</span>
            <span aria-hidden="true" className="skeleton inline-block h-[0.9em] w-[min(18rem,80%)] rounded-sm align-middle" />
          </>
        )}
      </h1>
      {session === "redirecting" ? (
        <p role="status" className="t-body mt-2 max-w-xl text-ink-3">{t("page.redirecting")}</p>
      ) : (
        <p className="t-body mt-2 max-w-xl text-ink-3">
          {resumable ? t("welcome.leadResume") : firstVisit ? t("welcome.leadNew") : t("welcome.lead")}
        </p>
      )}
    </div>
  );
}

function ProgressSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-wrap items-center gap-x-8 gap-y-4">
      <div className="flex items-center gap-3.5">
        <Skeleton rounded="full" className="h-16 w-16 shrink-0" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-3 w-36" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Skeleton rounded="md" className="h-11 w-11" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-20" />
        </div>
      </div>
    </div>
  );
}

/** Stats strip: level ring + XP to next level · current streak (profiles.xp, record_daily_activity + streaks). */
export function WelcomeProgress({ className }) {
  const t = useT("dashboard");
  const tc = useT("common");
  const { locale } = useLocale();
  const r = useResource("progress");

  if (r.status === "loading") return <div className={className}><ProgressSkeleton /></div>;
  if (r.status !== "ready") {
    return (
      <div className={className}>
        <CardNotice status={r.status} onRetry={r.reload} message={t("welcome.unavailable")} className="bg-surface" />
      </div>
    );
  }

  const { xp, level, streak } = r.data;
  const status = streakStatus(streak);
  const toNext = level
    ? t("welcome.toNext", { points: tc("units.points", { count: level.remaining }), level: level.level + 1 })
    : "";

  return (
    // Grid (not flex-wrap) so a long streak line wraps inside its column instead of dropping the whole group to a new row.
    <div className={cn("grid items-center gap-4", level && streak && "sm:grid-cols-[auto_1px_minmax(0,1fr)] sm:gap-x-8", className)}>
      {level && (
        <div className="flex min-w-0 items-center gap-3.5">
          <ProgressRing
            value={level.pct}
            size={64}
            stroke={6}
            label={t("welcome.ringAria", { level: level.level, pct: formatPercent(level.pct / 100, locale) })}
          >
            <span className="flex flex-col items-center leading-none">
              <span className="text-xs font-medium leading-none text-ink-3">{t("welcome.level")}</span>
              <span className="mt-1 text-lg font-bold leading-none text-ink tabular">{formatNumber(level.level, locale)}</span>
            </span>
          </ProgressRing>
          <div className="min-w-0">
            <p className="t-caption">{t("welcome.xpLabel")}</p>
            <p className="text-xl font-bold leading-tight text-ink tabular">
              <span className="num">{formatNumber(xp, locale)}</span>{" "}
              <span className="text-sm font-medium text-ink-3">{t("welcome.xpUnit")}</span>
            </p>
            <p className="t-caption mt-0.5">{toNext}</p>
          </div>
        </div>
      )}
      {level && streak && <span aria-hidden="true" className="hidden h-12 w-px bg-line/15 sm:block" />}
      {streak && (
        <div className="flex min-w-0 items-center gap-3">
          <IconTile icon={Flame} tone="gold" />
          <div className="min-w-0">
            <p className="t-caption">{t("welcome.streakLabel")}</p>
            <p className="text-xl font-bold leading-tight text-ink tabular">{tc("units.days", { count: streak.current })}</p>
            <p className="t-caption mt-0.5">
              {t(`welcome.streakStatus.${status}`)}
              {streak.longest > streak.current && (
                <> · <span className="whitespace-nowrap">{t("welcome.longest", { days: tc("units.days", { count: streak.longest }) })}</span></>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** One primary action: resume the unfinished attempt, else continue the last exam, else the exam center. */
export function WelcomeActions({ className }) {
  const t = useT("dashboard");
  const attempts = useResource("attempts");
  const { attempt: resumable } = useResumable();
  const last = lastGraded(attempts.status === "ready" ? attempts.data : []);
  const href = resumable
    ? attemptHref(resumable.id)
    : last ? practiceHref({ exam: last.exam, section: last.section }) : EXAM_CENTER_HREF;

  return (
    <div className={cn("flex flex-wrap gap-2.5", className)}>
      <Button href={href} iconEnd={ArrowRight} className="grow sm:grow-0">
        {resumable ? t("welcome.cta.resume") : attempts.status === "ready" && !last ? t("welcome.cta.start") : t("welcome.cta.continue")}
      </Button>
      <Button href="/assistant" variant="secondary" iconStart={Sparkles} className="grow sm:grow-0">
        {t("welcome.cta.assistant")}
      </Button>
    </div>
  );
}
