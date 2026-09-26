"use client";

import { ArrowRight, CalendarCheck, ClipboardCheck, Flame, LogIn, Medal, RotateCcw, Sparkles, Trophy } from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import { formatNumber } from "@/i18n/format";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import { useProgress } from "./ProgressProvider";
import LevelMeter from "./LevelMeter";

function StatTile({ icon: Icon, label, value, muted = false }) {
  return (
    <div className="flex flex-col justify-between gap-1.5 rounded-md border border-line/10 bg-surface-2/70 px-3.5 py-3">
      <dt className="flex items-start gap-1.5 text-[0.8125rem] leading-snug text-ink-3">
        <Icon size={14} aria-hidden="true" className="mt-[3px] shrink-0 text-gold-600" />
        <span>{label}</span>
      </dt>
      <dd className={cn("font-bold leading-tight tabular", muted ? "text-sm font-medium text-ink-3" : "text-lg text-ink")}>{value}</dd>
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div aria-hidden="true">
      <div className="flex items-center gap-6">
        <Skeleton rounded="full" className="h-[104px] w-[104px] shrink-0" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-9 w-40" />
          <Skeleton rounded="full" className="h-2 w-full max-w-sm" />
        </div>
      </div>
      <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} rounded="md" className="h-[72px]" />)}
      </div>
    </div>
  );
}

/** Hero body for /achievements: guest prompt, loading, unavailable, or the real numbers. */
export default function ProgressSummary({ className }) {
  const t = useT("achievements");
  const { locale } = useLocale();
  const p = useProgress();

  if (p.status === "loading") return <div className={className}><SummarySkeleton /></div>;

  if (p.status === "guest") {
    return (
      <div className={cn("rounded-lg border border-gold-200/60 bg-gold-50/70 p-4 sm:p-6", className)}>
        <div className="flex items-start gap-3.5">
          <span className="hidden h-10 w-10 shrink-0 place-items-center rounded-md bg-surface text-gold-600 ring-1 ring-inset ring-gold-200/70 sm:grid">
            <Trophy size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="t-h4">{t("guest.title")}</h2>
            <p className="t-small mt-1 text-ink-3">{t("guest.body")}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
          <Button href="/sign-up?next=/achievements" iconEnd={ArrowRight}>{t("guest.signUp")}</Button>
          <Button href="/sign-in?next=/achievements" variant="secondary" iconStart={LogIn}>{t("guest.signIn")}</Button>
        </div>
      </div>
    );
  }

  if (p.status === "unavailable") {
    return (
      <Alert
        tone="danger"
        title={
          <>
            <span className="block">{t("states.unavailableTitle")}</span>
            <span className="mt-0.5 block font-normal">{t("states.unavailableBody")}</span>
          </>
        }
        className={className}
        action={<Button size="sm" variant="secondary" iconStart={RotateCcw} onClick={p.retry}>{t("states.retry")}</Button>}
      />
    );
  }

  const { xp, level, streak, exams, badges } = p;
  const days = (n) => t("units.days", { count: n });
  const fresh = xp === 0 && badges.unlocked === 0;

  return (
    <div className={className}>
      <LevelMeter xp={xp} level={level} />
      <dl className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={Flame} label={t("summary.currentStreak")} value={streak ? days(streak.current) : t("summary.notTracked")} muted={!streak} />
        <StatTile icon={CalendarCheck} label={t("summary.longestStreak")} value={streak ? days(streak.longest) : t("summary.notTracked")} muted={!streak} />
        <StatTile icon={Medal} label={t("summary.badges")} value={t("summary.badgesValue", { unlocked: badges.unlocked, total: badges.total })} />
        <StatTile
          icon={ClipboardCheck}
          label={t("summary.exams")}
          value={typeof exams === "number" ? formatNumber(exams, locale) : t("summary.notTracked")}
          muted={typeof exams !== "number"}
        />
      </dl>
      {fresh && (
        <div className="mt-5 flex flex-col gap-3 rounded-md border border-line/15 bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Sparkles size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-gold-600" />
            <div className="min-w-0">
              <p className="font-medium text-ink">{t("summary.startTitle")}</p>
              <p className="t-small text-ink-3">{t("summary.startBody")}</p>
            </div>
          </div>
          <Button href="/exams" size="sm" variant="secondary" iconEnd={ArrowRight} className="shrink-0 self-start sm:self-auto">
            {t("summary.startCta")}
          </Button>
        </div>
      )}
    </div>
  );
}
