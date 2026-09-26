"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, ChevronRight, Clock, LogIn, Plus, RotateCcw, Target, Trophy, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { useLocale, useT } from "@/i18n/client";
import { formatClock, formatDate, formatNumber, formatPercent } from "@/i18n/format";
import { getExamStats, listAttempts } from "@/lib/data/exams";
import { SECTIONS } from "@/lib/exams/catalog";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import PremiumLock from "@/components/ui/PremiumLock";
import { ProgressBar, ProgressRing } from "@/components/ui/Progress";
import Skeleton from "@/components/ui/Skeleton";
import Tabs from "@/components/ui/Tabs";
import { cn } from "@/components/ui/cn";
import { builderHref } from "./builder-logic";
import { sectionLabel, signInHref, topicLabel } from "./labels";
import { ringTone, scoreTone } from "./results-logic";
import Sparkline from "./Sparkline";
import { HistoryBodySkeleton } from "./skeletons";
import { dailySeries, hasStats, rankTopics, sortSections, topicAnalyticsLocked, windowDelta } from "./stats-logic";
import { useTier } from "./useTier";

const PAGE = 20;
const TREND_SIZE = { width: 600, height: 170, pad: 10 };
const BAR = { green: "green", gold: "gold", danger: "danger", neutral: "ink" };
const pctOrDash = (v, locale) => (v === null || v === undefined ? "—" : formatPercent(Number(v) / 100, locale, Number(v) % 1 ? 1 : 0));

export default function HistoryView() {
  const t = useT("exams");
  const path = usePathname();
  const { isLoaded, isSignedIn, tier } = useTier();
  const [stats, setStats] = useState({ status: "loading" });
  const [list, setList] = useState({ status: "loading", items: [], nextCursor: null, more: "idle" });
  const [nonce, setNonce] = useState(0);
  const [tab, setTab] = useState("analytics");

  // Stats and the first page load independently: neither waits for the other.
  useEffect(() => {
    if (!isSignedIn) return;
    let alive = true;
    setStats({ status: "loading" });
    getExamStats()
      .then((s) => alive && setStats(s.mode === "db" ? { status: "ready", data: s } : { status: "unavailable" }))
      .catch(() => alive && setStats({ status: "error" }));
    return () => {
      alive = false;
    };
  }, [isSignedIn, nonce]);

  useEffect(() => {
    if (!isSignedIn) return;
    let alive = true;
    setList({ status: "loading", items: [], nextCursor: null, more: "idle" });
    listAttempts({ limit: PAGE })
      .then((r) => alive && setList({ status: r.mode === "db" ? "ready" : "unavailable", items: r.items, nextCursor: r.nextCursor, more: "idle" }))
      .catch(() => alive && setList({ status: "error", items: [], nextCursor: null, more: "idle" }));
    return () => {
      alive = false;
    };
  }, [isSignedIn, nonce]);

  const loadMore = useCallback(async () => {
    if (!list.nextCursor || list.more === "loading") return;
    setList((l) => ({ ...l, more: "loading" }));
    try {
      const r = await listAttempts({ limit: PAGE, ...list.nextCursor });
      setList((l) => ({ ...l, items: [...l.items, ...r.items.filter((it) => !l.items.some((x) => x.id === it.id))], nextCursor: r.nextCursor, more: "idle" }));
    } catch {
      setList((l) => ({ ...l, more: "error" }));
    }
  }, [list.nextCursor, list.more]);

  if (!isLoaded) return <HistoryBodySkeleton />;
  if (!isSignedIn) {
    return (
      <div className="surface-flat mt-8">
        <EmptyState
          image="achievement.performance"
          title={t("history.guest.title")}
          description={t("history.guest.body")}
          action={<Button href={signInHref(path)} iconStart={LogIn}>{t("history.guest.cta")}</Button>}
        />
      </div>
    );
  }

  const retry = () => setNonce((n) => n + 1);
  const unavailable = (stats.status === "unavailable" || stats.status === "error") && (list.status === "unavailable" || list.status === "error");
  if (unavailable) {
    // Nothing could be loaded: a request failure (danger + retry); history not deployed yet: info.
    const failed = stats.status === "error" || list.status === "error";
    return (
      <Alert
        tone={failed ? "danger" : "info"}
        title={<AlertText title={t("history.unavailable.title")} body={t("history.unavailable.body")} />}
        className="mt-8"
        action={failed ? <Button size="sm" variant="secondary" onClick={retry} iconStart={RotateCcw}>{t("history.unavailable.retry")}</Button> : null}
      />
    );
  }

  const empty = stats.status === "ready" && !hasStats(stats.data) && list.status === "ready" && list.items.length === 0;
  if (empty) {
    return (
      <div className="surface-flat mt-8">
        <EmptyState
          image="achievement.performance"
          title={t("history.empty.title")}
          description={t("history.empty.body")}
          action={<Button href="/exams" iconStart={Plus}>{t("history.empty.cta")}</Button>}
        />
      </div>
    );
  }

  // Everyone signed in gets the KPIs, the trend and per-section accuracy; skill
  // accuracy and strengths / weak spots are Elite analytics (see topicAnalyticsLocked).
  const locked = topicAnalyticsLocked(stats.status === "ready" ? stats.data : null, tier === "elite");

  return (
    <div className="mt-8">
      <Kpis t={t} stats={stats} />

      <Tabs
        className="mt-6 lg:hidden"
        value={tab}
        onChange={setTab}
        items={[
          { value: "analytics", label: t("history.tabs.analytics") },
          // a count only once every attempt is loaded (a page size would read as a total)
          { value: "attempts", label: t("history.tabs.attempts"), count: list.status === "ready" && !list.nextCursor ? list.items.length : undefined },
        ]}
      />

      {/* Wide screens: main column (trend, then every attempt) + an analytics rail
          (sections, strengths, skills), each column at its natural height.
          Phones: one tab at a time. */}
      <div className="mt-6 grid items-start gap-6 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-6 xl:col-span-7">
          <div className={cn(tab === "attempts" && "max-lg:hidden")}><Trend t={t} stats={stats} /></div>
          <div className={cn(tab === "analytics" && "max-lg:hidden")}>
            <AttemptsList t={t} list={list} onMore={loadMore} onRetry={retry} />
          </div>
        </div>
        <div className={cn("flex min-w-0 flex-col gap-6 xl:col-span-5", tab === "attempts" && "max-lg:hidden")}>
          <SectionAccuracy t={t} stats={stats} />
          {locked ? (
            <PremiumLock
              title={t("history.advanced.title")}
              body={t("history.advanced.body")}
              cta={t("history.advanced.cta")}
              preview={<LockedPreview />}
            />
          ) : (
            <>
              <Strengths t={t} stats={stats} />
              <TopicAccuracy t={t} stats={stats} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Title + body in the Alert's full-opacity title line (ui/Alert dims children below AA for danger). */
function AlertText({ title, body }) {
  return (
    <>
      <span className="block">{title}</span>
      <span className="mt-0.5 block font-normal">{body}</span>
    </>
  );
}

function Card({ id, title, action, children, className }) {
  return (
    <section aria-labelledby={id} className={cn("surface p-5 sm:p-6", className)}>
      <div className="flex items-start justify-between gap-3">
        <h2 id={id} className="t-h4">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Kpis({ t, stats }) {
  const { locale } = useLocale();
  const tc = useT("common");
  if (stats.status === "loading") {
    return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} rounded="lg" className="h-[104px]" />)}</div>;
  }
  if (stats.status !== "ready") return null;
  const s = stats.data;
  const tt = s.totals || {};
  const items = [
    { key: "completed", icon: BarChart3, tone: "gold", value: formatNumber(s.completed_attempts || 0, locale), hint: t("history.kpis.xpHint", { xp: t("units.xp", { count: Number(tt.xp_earned) || 0 }) }) },
    { key: "accuracy", icon: Target, tone: "green", value: pctOrDash(tt.accuracy, locale), hint: t("history.kpis.questionsHint", { questions: tc("units.questions", { count: Number(tt.answered) || 0 }) }) },
    { key: "best", icon: Trophy, tone: "gold", value: pctOrDash(tt.best_score, locale), hint: tt.average_score === null || tt.average_score === undefined ? null : t("history.kpis.bestHint", { avg: pctOrDash(tt.average_score, locale) }) },
    { key: "avgTime", icon: Clock, tone: "neutral", value: tt.avg_seconds_per_question ? formatClock(Math.round(tt.avg_seconds_per_question)) : "—", ltr: true },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      {items.map(({ key, icon: Icon, tone, value, hint, ltr }) => (
        <div key={key} className="surface-flat p-4 sm:p-5">
          <dt className="t-caption flex items-center gap-1.5">
            <Icon size={15} aria-hidden="true" className={tone === "green" ? "text-green-600" : tone === "gold" ? "text-gold-600" : "text-ink-3"} />
            {t(`history.kpis.${key}`)}
          </dt>
          <dd className={cn("mt-1.5 text-2xl font-bold leading-tight text-ink tabular", ltr && "num")}>{value}</dd>
          {hint && <dd className="t-caption mt-1 truncate">{hint}</dd>}
        </div>
      ))}
    </dl>
  );
}

function Trend({ t, stats }) {
  const { locale } = useLocale();
  const tc = useT("common");
  const [days, setDays] = useState(30);
  const daysText = tc("units.days", { count: days });
  if (stats.status === "loading") return <Skeleton rounded="lg" className="h-72" />;
  if (stats.status !== "ready") return null;
  const tr = stats.data.trend || {};
  const w = tr.windows || {};
  const cur = days === 7 ? w.last_7 : w.last_30;
  const prev = days === 7 ? w.prev_7 : w.prev_30;
  const delta = windowDelta(cur, prev);
  const series = dailySeries(tr.daily || [], days);
  const hasData = series.some((d) => d.accuracy !== null);
  const DeltaIcon = delta?.direction === "up" ? TrendingUp : delta?.direction === "down" ? TrendingDown : Minus;
  return (
    <Card
      id="trend-title"
      title={t("history.trend.title")}
      action={
        <Tabs
          size="sm"
          label={t("history.trend.periodsLabel")}
          value={String(days)}
          onChange={(v) => setDays(Number(v))}
          items={[{ value: "7", label: t("history.trend.last7") }, { value: "30", label: t("history.trend.last30") }]}
        />
      }
    >
      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <p className="text-3xl font-bold leading-none text-ink tabular">{pctOrDash(cur?.accuracy, locale)}</p>
          <p className="t-caption mt-1.5">
            {t("history.trend.windowAccuracy")} · {t("history.trend.attempts", { attempts: t("units.attempts", { count: Number(cur?.attempts) || 0 }) })}
          </p>
        </div>
        <p className={cn("flex items-center gap-1 text-[0.8125rem] font-medium", delta?.direction === "up" ? "text-green-700" : delta?.direction === "down" ? "text-danger" : "text-ink-3")}>
          <DeltaIcon size={15} aria-hidden="true" />
          {delta ? t(`history.trend.delta.${delta.direction}`, { value: formatNumber(Math.abs(delta.value), locale, { maximumFractionDigits: 1 }) }) : t("history.trend.delta.none")}
        </p>
      </div>
      {hasData ? (
        <figure className="mt-5">
          <Sparkline values={series.map((d) => d.accuracy)} label={t("history.trend.chart", { days: daysText })} size={TREND_SIZE} connectGaps />
          <figcaption className="t-caption mt-1.5 flex justify-between">
            <span>{t("history.trend.axisStart", { days: daysText })}</span>
            <span>{t("history.trend.axisEnd")}</span>
          </figcaption>
        </figure>
      ) : (
        <p className="t-small mt-5 rounded-md bg-surface-2/70 px-4 py-6 text-center text-ink-3">{t("history.trend.noData")}</p>
      )}
    </Card>
  );
}

function Bars({ rows, label, value, locale }) {
  return (
    <ul className="mt-4 space-y-3.5">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium text-ink">{label(r)}</span>
            <span className="shrink-0 tabular">
              <span className="font-bold text-ink">{pctOrDash(r.accuracy, locale)}</span>
              <span className="t-caption"> · {value(r)}</span>
            </span>
          </div>
          <ProgressBar value={r.accuracy ?? 0} tone={BAR[scoreTone(r.accuracy)]} size="sm" className="mt-1.5" label={`${label(r)} ${pctOrDash(r.accuracy, locale)}`} />
        </li>
      ))}
    </ul>
  );
}

function SectionAccuracy({ t, stats }) {
  const { locale } = useLocale();
  if (stats.status === "loading") return <Skeleton rounded="lg" className="h-56" />;
  if (stats.status !== "ready") return null;
  const rows = sortSections(stats.data.by_section || []).map((r) => ({ ...r, key: `${r.exam}-${r.section}` }));
  if (!rows.length) return null;
  return (
    <Card id="sections-acc-title" title={t("history.sections.title")}>
      <Bars
        rows={rows}
        locale={locale}
        label={(r) => `${t(`types.${r.exam}`)} · ${t(`sections.${r.section}`)}`}
        value={(r) => t("history.sections.value", { correct: r.correct, total: r.total })}
      />
    </Card>
  );
}

function TopicAccuracy({ t, stats }) {
  const { locale } = useLocale();
  const [all, setAll] = useState(false);
  if (stats.status !== "ready") return null;
  const rows = rankTopics(stats.data.by_topic || []).map((r) => ({ ...r, key: `${r.section}-${r.topic}` }));
  if (!rows.length) return null;
  const shown = all ? rows : rows.slice(0, 8);
  return (
    <Card id="topics-acc-title" title={t("history.topics.title")}>
      <Bars
        rows={shown}
        locale={locale}
        label={(r) => topicLabel(t, r.topic)}
        value={(r) => t("history.sections.value", { correct: r.correct, total: r.total })}
      />
      {rows.length > 8 && (
        <Button variant="link" size="sm" className="mt-4" onClick={() => setAll((v) => !v)}>
          {all ? t("history.topics.showLess") : t("history.topics.showAll", { count: rows.length })}
        </Button>
      )}
    </Card>
  );
}

function Strengths({ t, stats }) {
  const { locale } = useLocale();
  if (stats.status !== "ready") return null;
  const best = stats.data.best_topics || [];
  const weak = stats.data.weakest_topics || [];
  const examOf = (section) => SECTIONS[section]?.exam || "aptitude";
  const group = (key, rows, tone) => (
    <div>
      <h3 className={cn("text-[0.8125rem] font-medium", tone === "green" ? "text-green-700" : "text-danger")}>{t(`history.strengths.${key}`)}</h3>
      <ul className="mt-2 space-y-2">
        {rows.map((r) => (
          <li key={`${r.section}-${r.topic}`} className="flex items-center justify-between gap-3 rounded-md bg-surface-2/70 px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{topicLabel(t, r.topic)}</p>
              <p className="t-caption truncate">{t(`sections.${r.section}`)} · {pctOrDash(r.accuracy, locale)}</p>
            </div>
            {key === "weakest" && (
              <Button href={builderHref(examOf(r.section), { section: r.section, topic: r.topic })} size="sm" variant="secondary" className="shrink-0">
                {t("history.strengths.practice")}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <Card id="strengths-title" title={t("history.strengths.title")}>
      {best.length || weak.length ? (
        <div className="mt-4 space-y-5">
          {weak.length > 0 && group("weakest", weak, "danger")}
          {best.length > 0 && group("best", best, "green")}
          <p className="t-caption">{t("history.strengths.minNote")}</p>
        </div>
      ) : (
        <p className="t-small mt-3 text-ink-3">{t("history.strengths.empty")}</p>
      )}
    </Card>
  );
}

/** Teaser behind the Elite lock — generic shapes only, never the member's data. */
function LockedPreview() {
  return (
    <div className="space-y-4">
      <div className="h-4 w-40 rounded-sm bg-surface-3" />
      {[82, 64, 47, 71, 38].map((w, i) => (
        <div key={i} className="space-y-1.5">
          <div className="flex justify-between"><div className="h-3 w-24 rounded-sm bg-surface-3" /><div className="h-3 w-10 rounded-sm bg-surface-3" /></div>
          <div className="h-2 rounded-full bg-surface-3/70"><div className="h-2 rounded-full bg-gold-300" style={{ width: `${w}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

function AttemptsList({ t, list, onMore, onRetry }) {
  const { locale } = useLocale();
  const tc = useT("common");
  if (list.status === "loading") {
    return (
      <div className="surface p-5 sm:p-6" aria-hidden="true">
        <Skeleton className="h-5 w-32" />
        <div className="mt-5 space-y-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3"><Skeleton rounded="full" className="h-12 w-12" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3 w-1/3" /></div></div>
          ))}
        </div>
      </div>
    );
  }
  if (list.status !== "ready") {
    const failed = list.status === "error";
    return (
      <Card id="attempts-title" title={t("history.list.title")}>
        <Alert
          tone={failed ? "danger" : "info"}
          className="mt-3"
          title={<span className="font-normal">{t("history.unavailable.body")}</span>}
          action={failed ? <Button size="sm" variant="secondary" iconStart={RotateCcw} onClick={onRetry}>{t("history.unavailable.retry")}</Button> : null}
        />
      </Card>
    );
  }
  const now = Date.now();
  return (
    <Card id="attempts-title" title={t("history.list.title")}>
      <ul className="-mx-2 mt-3 divide-y divide-line/10">
        {list.items.map((it) => {
          const pct = it.score_percent === null || it.score_percent === undefined ? null : Number(it.score_percent);
          const open = it.status === "in_progress" && Date.parse(it.expires_at) > now;
          return (
            <li key={it.id} style={{ contentVisibility: "auto", containIntrinsicSize: "auto 76px" }}>
              <Link href={`/exams/attempt/${it.id}`} className="group flex items-center gap-3.5 rounded-md px-2 py-3 transition-colors hover:bg-surface-2">
                {pct === null ? (
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-3">
                    <Clock size={18} aria-hidden="true" />
                  </span>
                ) : (
                  <ProgressRing value={pct} size={48} stroke={4} tone={ringTone(pct)} className="shrink-0">
                    <span className="text-[0.75rem] font-bold text-ink tabular">{Math.round(pct)}</span>
                  </ProgressRing>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.9375rem] font-medium text-ink">
                    {t(`types.${it.exam}`)} · {sectionLabel(t, it.exam, it.section)}
                  </p>
                  <p className="t-caption mt-0.5 flex flex-wrap items-center gap-x-2">
                    <span>{formatDate(it.started_at, locale, { day: "numeric", month: "short", year: "numeric" })}</span>
                    <span aria-hidden="true">·</span>
                    <span>{tc("units.questions", { count: it.question_count })}</span>
                    {it.duration_seconds ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="num">{formatClock(it.duration_seconds)}</span>
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {open ? (
                    <Badge tone="gold" size="sm">{t("history.list.resume")}</Badge>
                  ) : it.status === "expired" || it.status === "abandoned" ? (
                    <Badge tone="neutral" size="sm" className="hidden xs:inline-flex">{t(`history.list.status.${it.status}`)}</Badge>
                  ) : null}
                  <ChevronRight size={18} aria-hidden="true" className="flip-rtl text-ink-4 transition-colors group-hover:text-ink-2" />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-col items-center gap-2">
        {list.nextCursor ? (
          <Button variant="secondary" onClick={onMore} loading={list.more === "loading"}>
            {list.more === "loading" ? t("history.list.loading") : t("history.list.loadMore")}
          </Button>
        ) : (
          <p className="t-caption">{t("history.list.end")}</p>
        )}
        {list.more === "error" && <p role="alert" className="text-[0.8125rem] text-danger">{t("history.list.failed")}</p>}
      </div>
    </Card>
  );
}

