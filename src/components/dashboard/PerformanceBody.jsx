"use client";

import { CheckCircle2, Minus, Target, TrendingDown, TrendingUp } from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import { formatDate, formatNumber, formatPercent } from "@/i18n/format";
import { Link } from "@/i18n/navigation";
import Skeleton from "@/components/ui/Skeleton";
import { ProgressBar } from "@/components/ui/Progress";
import { cn } from "@/components/ui/cn";
import { useResource } from "./DashboardProvider";
import CardNotice from "./CardNotice";
import OnboardingPanel, { OnboardingCount } from "./OnboardingPanel";
import Panel, { PanelLink } from "./Panel";
import Sparkline, { SPARK_SIZE } from "./Sparkline";
import { examName, sectionName, topicName } from "./labels";
import { EXAM_HISTORY_HREF, practiceHref, sparklineGeometry } from "./model";

// Sparkline scale labels, positioned with the same geometry as the chart's grid lines.
const SCALE = [100, 50, 0];
const SPARK = sparklineGeometry([], SPARK_SIZE);
const scaleTop = (v) => ((v === 100 ? SPARK.topY : v === 50 ? SPARK.midY : SPARK.baseY) / SPARK.height) * 100;

const pct = (v, locale) => (v === null || v === undefined ? "—" : formatPercent(v / 100, locale));

function Kpi({ label, value, hint }) {
  return (
    <div className="min-w-0 bg-surface p-3.5 sm:p-4">
      <dt className="t-caption">{label}</dt>
      <dd className="mt-1 text-2xl font-bold leading-tight text-ink tabular"><span className="num">{value}</span></dd>
      {hint && <dd className="t-caption mt-1">{hint}</dd>}
    </div>
  );
}

function Delta({ trend }) {
  const t = useT("dashboard");
  const { locale } = useLocale();
  if (trend.last7 === null) return <>{t("performance.delta.quiet")}</>;
  if (trend.delta === null) return <>{t("performance.delta.noPrev")}</>;
  if (trend.delta === 0) {
    return (
      <span className="inline-flex items-center gap-1">
        <Minus size={13} aria-hidden="true" className="shrink-0" />
        {t("performance.delta.same")}
      </span>
    );
  }
  const up = trend.delta > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  const value = `${up ? "+" : "−"}${formatNumber(Math.abs(trend.delta), locale, { maximumFractionDigits: 1 })}`;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1">
      <Icon size={14} aria-hidden="true" className={cn("shrink-0", up ? "text-green-600" : "text-ink-3")} />
      <span className={cn("num font-medium", up ? "text-green-700" : "text-ink-2")}>{value}</span>
      <span>{t("performance.delta.vsPrev")}</span>
    </span>
  );
}

function TopicList({ title, icon: Icon, tone, items, practise, className }) {
  const t = useT("dashboard");
  const { locale } = useLocale();
  if (!items.length) return null;
  return (
    <div className={cn("min-w-0", className)}>
      <h3 className="flex items-center gap-2 text-sm font-medium text-ink">
        <Icon size={16} aria-hidden="true" className={tone === "green" ? "text-green-600" : "text-gold-600"} />
        {title}
      </h3>
      <ul className="mt-2 space-y-0.5">
        {items.map((x) => {
          const name = topicName(t, x.topic) || sectionName(t, x.section);
          return (
            <li key={`${x.section}:${x.topic}`} className="flex min-h-[44px] items-center gap-3 py-1">
              {/* No truncation: in a narrow column the meta wraps rather than hiding the counts. */}
              <div className="min-w-0 flex-1">
                <p className="text-[0.9375rem] leading-snug text-ink">{name}</p>
                <p className="t-caption mt-0.5">
                  {/* Break between the parts, never inside one ("4 of / 11 correct"). */}
                  <span className="whitespace-nowrap">{sectionName(t, x.section)} ·</span>{" "}
                  <span className="whitespace-nowrap">{t("performance.topics.meta", { correct: x.correct, total: x.total })}</span>
                </p>
              </div>
              <span className={cn("num shrink-0 text-sm font-medium tabular", tone === "green" ? "text-green-700" : "text-ink-2")}>
                {pct(x.accuracy, locale)}
              </span>
              {practise && (
                <Link
                  href={practiceHref({ section: x.section, topic: x.topic })}
                  aria-label={t("performance.topics.practiseAria", { topic: name })}
                  className="relative inline-flex h-8 shrink-0 items-center rounded-full border border-line/20 bg-surface px-3 text-[0.8125rem] font-medium text-ink transition-colors before:absolute before:inset-x-0 before:-inset-y-1.5 hover:border-line/30 hover:bg-surface-2"
                >
                  {t("performance.topics.practise")}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Analytics({ stats }) {
  const t = useT("dashboard");
  const { locale } = useLocale();
  const { totals, trend, sections, strongest, focus, daily } = stats;
  const practiceDays = daily.filter((d) => d.accuracy !== null);
  const lastDay = practiceDays[practiceDays.length - 1];
  const chartLabel = t("performance.trend.aria", {
    days: practiceDays.length,
    last: lastDay ? pct(lastDay.accuracy, locale) : "—",
  });
  const pointLabel = (p) =>
    t("performance.trend.dot", {
      date: formatDate(`${p.day}T12:00:00Z`, locale, { day: "numeric", month: "short", timeZone: "UTC" }),
      value: pct(p.accuracy, locale),
    });

  return (
    <div>
      <p className="t-caption -mt-2">{t("performance.lead", { count: stats.completed })}</p>

      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line/10 bg-line/10 sm:grid-cols-4">
        <Kpi label={t("performance.kpi.accuracy")} value={pct(totals.accuracy, locale)} hint={<Delta trend={trend} />} />
        <Kpi label={t("performance.kpi.average")} value={pct(totals.averageScore, locale)} hint={t("performance.kpi.averageHint")} />
        <Kpi label={t("performance.kpi.best")} value={pct(totals.bestScore, locale)} hint={t("performance.kpi.bestHint")} />
        <Kpi
          label={t("performance.kpi.answered")}
          value={formatNumber(totals.answered, locale)}
          hint={t("performance.kpi.answeredOf", { questions: formatNumber(totals.questions, locale) })}
        />
      </dl>

      <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:gap-8">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-ink">{t("performance.trend.title")}</h3>
          {practiceDays.length ? (
            <>
              {/* Scale on the start edge (100 / 50 / 0 %), time along the reading direction. */}
              <div className="mt-3 flex gap-2">
                <div aria-hidden="true" className="relative w-9 shrink-0 text-[0.75rem] leading-none text-ink-3 tabular">
                  {SCALE.map((v) => (
                    <span key={v} className="num absolute end-0 -translate-y-1/2" style={{ top: `${scaleTop(v)}%` }}>
                      {formatPercent(v / 100, locale)}
                    </span>
                  ))}
                </div>
                <Sparkline series={daily} label={chartLabel} pointLabel={pointLabel} className="min-w-0 flex-1" />
              </div>
              <div aria-hidden="true" className="mt-1.5 flex justify-between ps-11 t-caption">
                <span>{t("performance.trend.start")}</span>
                <span>{t("performance.trend.end")}</span>
              </div>
            </>
          ) : (
            <p className="mt-3 rounded-md border border-dashed border-line/20 px-4 py-8 text-center text-sm text-ink-3">
              {t("performance.trend.empty")}
            </p>
          )}
        </div>
        {sections.length > 0 && (
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-ink">{t("performance.sections.title")}</h3>
            <ul className="mt-3 space-y-3.5">
              {sections.map((s) => (
                <li key={s.section}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-sm text-ink-2">
                      {sectionName(t, s.section)}
                      <span className="text-ink-3"> · {examName(t, s.exam)}</span>
                    </p>
                    <span className="num shrink-0 text-sm font-medium text-ink tabular">{pct(s.accuracy, locale)}</span>
                  </div>
                  <ProgressBar
                    value={s.accuracy ?? 0}
                    tone="green"
                    size="sm"
                    className="mt-1.5"
                    label={`${sectionName(t, s.section)} ${pct(s.accuracy, locale)}`}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-6 border-t border-line/10 pt-5">
        {strongest.length || focus.length ? (
          <div className="grid gap-6 sm:grid-cols-2 sm:gap-8">
            <TopicList title={t("performance.topics.strongest")} icon={CheckCircle2} tone="green" items={strongest} />
            {/* Phones: the actionable list first. */}
            <TopicList title={t("performance.topics.focus")} icon={Target} tone="gold" items={focus} practise className="max-sm:order-first" />
          </div>
        ) : (
          <p className="t-small text-ink-3">{t("performance.topics.needMore")}</p>
        )}
      </div>
    </div>
  );
}

function PerformanceSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton className="-mt-1 h-3 w-40" />
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} rounded="md" className="h-[92px]" />)}
      </div>
      <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:gap-8">
        <Skeleton rounded="md" className="h-[120px]" />
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton rounded="full" className="h-1.5 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * get_exam_stats() → KPIs, 30-day sparkline, per-section bars, topics.
 * With no completed attempt yet the same slot becomes the first-steps
 * checklist (its own title, no history link — there is no history yet).
 */
export default function PerformanceBody() {
  const t = useT("dashboard");
  const r = useResource("stats");

  if (r.status === "ready" && r.data.completed === 0) {
    return (
      <Panel id="dash-performance" eyebrow={t("onboarding.eyebrow")} title={t("onboarding.title")} action={<OnboardingCount />}>
        <OnboardingPanel />
      </Panel>
    );
  }
  return (
    <Panel
      id="dash-performance"
      title={t("performance.title")}
      action={<PanelLink href={EXAM_HISTORY_HREF}>{t("performance.history")}</PanelLink>}
    >
      {r.status === "loading" ? (
        <PerformanceSkeleton />
      ) : r.status !== "ready" ? (
        <CardNotice status={r.status} onRetry={r.reload} message={t("performance.unavailable")} />
      ) : (
        <Analytics stats={r.data} />
      )}
    </Panel>
  );
}
