"use client";

import { useLocale, useT } from "@/i18n/client";
import { formatNumber, formatPercent } from "@/i18n/format";
import { ProgressBar, ProgressRing } from "@/components/ui/Progress";
import { cn } from "@/components/ui/cn";

/** Level ring + XP meter. Shared by /achievements (hero) and /competitions (standing). */
export default function LevelMeter({ xp, level, compact = false, className }) {
  const t = useT("achievements");
  const { locale } = useLocale();
  const ringSize = compact ? 76 : 104;
  const toNext = t("level.toNext", { count: level.remaining, level: level.level + 1 });
  return (
    <div className={cn("flex items-center gap-4 sm:gap-6", className)}>
      <ProgressRing
        value={level.pct}
        size={ringSize}
        stroke={compact ? 6 : 8}
        label={t("level.ringAria", { level: level.level, pct: formatPercent(level.pct / 100, locale) })}
      >
        <span className="flex flex-col items-center leading-none">
          <span className="text-xs font-medium text-ink-3">{t("level.word")}</span>
          <span className={cn("mt-1 font-bold text-ink tabular", compact ? "text-xl" : "text-[1.75rem]")}>{formatNumber(level.level, locale)}</span>
        </span>
      </ProgressRing>
      <div className="min-w-0 flex-1">
        <p className="t-caption">{t("summary.totalXp")}</p>
        <p className={cn("mt-0.5 flex items-baseline gap-1.5 font-bold leading-tight text-ink", compact ? "text-2xl" : "text-[2rem] sm:text-4xl")}>
          <span className="num tabular">{formatNumber(xp, locale)}</span>
          <span className="text-[0.5em] font-medium text-ink-3">{t("units.points", { count: xp })}</span>
        </p>
        <ProgressBar value={level.pct} className="mt-3 max-w-sm" label={toNext} />
        <p className="t-caption mt-2" aria-hidden="true">{toNext}</p>
      </div>
    </div>
  );
}
