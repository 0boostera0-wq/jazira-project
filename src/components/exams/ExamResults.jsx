"use client";

import { useEffect } from "react";
import { CheckCircle2, Clock, History, Info, ListChecks, LogIn, Plus, RotateCcw, Sparkles, UserPlus } from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import { formatClock, formatDate, formatNumber, formatPercent } from "@/i18n/format";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Illustration from "@/components/ui/Illustration";
import { ProgressBar, ProgressRing } from "@/components/ui/Progress";
import { cn } from "@/components/ui/cn";
import { builderHref } from "./builder-logic";
import { sectionLabel, signInHref, topicLabel } from "./labels";
import ReviewList from "./ReviewList";
import { reviewCounts, retryPlan, ringTone, scoreBand, scoreTone, sortTopics, usedSeconds } from "./results-logic";

const BAR_TONE = { green: "green", gold: "gold", danger: "danger", neutral: "ink" };

/**
 * Results (same route as the runner once submitted): score ring and key
 * numbers, next actions, per-skill breakdown, and the answer review.
 * Local practice results say plainly that nothing was saved.
 */
export default function ExamResults({ result, isSignedIn, path }) {
  const t = useT("exams");
  const { locale } = useLocale();
  const a = result.attempt || {};
  const items = result.items || [];
  const pct = Math.max(0, Math.min(100, Number(a.score_percent) || 0));
  const band = scoreBand(pct);
  const isLocal = result.mode === "local";
  const plan = retryPlan(result);
  const topics = sortTopics(result.by_topic || []);
  const used = usedSeconds(a);
  const counts = reviewCounts(items);
  const multiSection = new Set(topics.map((r) => r.section)).size > 1;

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  const stats = [
    { key: "correct", Icon: CheckCircle2, value: t("results.stats.correctValue", { correct: a.correct_count ?? counts.correct, total: a.total ?? items.length }) },
    { key: "time", Icon: Clock, value: used === null ? "—" : formatClock(used), hint: a.time_limit_seconds ? t("results.stats.timeOf", { limit: formatClock(a.time_limit_seconds) }) : null, ltr: true },
    { key: "answered", Icon: ListChecks, value: formatNumber(a.answered_count ?? items.length - counts.unanswered, locale) },
    {
      key: "xp",
      Icon: Sparkles,
      value: isLocal ? "—" : `+${formatNumber(a.xp_awarded || 0, locale)}`,
      hint: isLocal ? t("results.stats.xpNone") : null,
      ltr: true,
    },
  ];

  return (
    <div className="animate-in">
      {/* ── score header ── */}
      <header className="surface overflow-hidden">
        {/* A finished paper and a well-earned pause — an image strip above the score. */}
        <div aria-hidden="true" className="relative h-24 sm:h-32 lg:h-36">
          <Illustration id="exams.results" fill sizes="(min-width: 1280px) 960px, 100vw" />
        </div>
        <div className="grid gap-6 p-5 sm:p-8 xl:grid-cols-12 xl:items-center xl:gap-8">
          <div className="flex items-center gap-5 sm:gap-7 xl:col-span-7">
            <ProgressRing value={pct} size={116} stroke={9} tone={ringTone(pct)} label={t("results.scoreLabel", { percent: formatPercent(pct / 100, locale, 1) })} className="shrink-0">
              <span className="text-[1.625rem] font-bold leading-none text-ink tabular sm:text-3xl">{formatPercent(pct / 100, locale, pct % 1 ? 1 : 0)}</span>
            </ProgressRing>
            <div className="min-w-0">
              <p className="t-eyebrow">{t("results.eyebrow")}</p>
              <h1 className="t-h3 mt-1 sm:t-h2">{t(`results.bands.${band}.title`)}</h1>
              <p className="t-caption mt-1">
                {t("results.meta", {
                  exam: t(`types.${a.exam}`),
                  // a single-skill test (0012) names its skill too
                  section: a.topic ? `${sectionLabel(t, a.exam, a.section)} · ${topicLabel(t, a.topic)}` : sectionLabel(t, a.exam, a.section),
                  date: formatDate(a.submitted_at || a.started_at || Date.now(), locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }),
                })}
              </p>
              <p className="t-small mt-2 hidden max-w-md text-ink-3 sm:block">{t(`results.bands.${band}.body`)}</p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:col-span-5 xl:grid-cols-2">
            {stats.map(({ key, Icon, value, hint, ltr }) => (
              <div key={key} className="rounded-md bg-surface-2/70 px-3.5 py-3">
                <dt className="t-caption flex items-center gap-1.5">
                  <Icon size={14} aria-hidden="true" />
                  {t(`results.stats.${key}`)}
                </dt>
                <dd className={cn("mt-1 text-lg font-bold leading-tight text-ink tabular", ltr && "num")}>{value}</dd>
                {hint && <dd className="t-caption mt-0.5 leading-snug">{hint}</dd>}
              </div>
            ))}
          </dl>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-line/10 bg-surface-2/40 px-5 py-4 sm:px-8">
          {plan && (
            <Button href={builderHref(plan.exam, plan)} iconStart={RotateCcw}>{t("results.actions.retry")}</Button>
          )}
          <Button href={builderHref(a.exam, {})} variant={plan ? "secondary" : "primary"} iconStart={Plus}>{t("results.actions.newExam")}</Button>
          {!isLocal && <Button href="/exams/history" variant="ghost" iconStart={History}>{t("results.actions.history")}</Button>}
          <Button href="/exams" variant="ghost">{t("results.actions.hub")}</Button>
        </div>
      </header>

      {(a.status === "expired" || result.status === "expired") && <Alert tone="warning" className="mt-4">{t("results.expired")}</Alert>}
      {isLocal && (
        <section role="status" className="mt-4 flex flex-col gap-4 rounded-lg border border-info/20 bg-info-soft p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex min-w-0 gap-3 text-info">
            <Info size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium">{isSignedIn ? t("results.local.dbTitle") : t("results.local.guestTitle")}</p>
              <p className="t-small mt-0.5 opacity-90">{isSignedIn ? t("results.local.dbBody") : t("results.local.guestBody")}</p>
            </div>
          </div>
          {!isSignedIn && (
            <div className="flex shrink-0 flex-wrap gap-2 ps-7 sm:ps-0">
              {/* The header's next step stays the one primary action. */}
              <Button href={signInHref(path, "/sign-up")} size="sm" variant="secondary" iconStart={UserPlus}>{t("results.local.signUp")}</Button>
              <Button href={signInHref(path)} size="sm" variant="ghost" iconStart={LogIn}>{t("results.local.signIn")}</Button>
            </div>
          )}
        </section>
      )}

      <div className="mt-8 grid gap-6 xl:grid-cols-12 xl:gap-8">
        {/* rail first in the DOM: on phones the skill summary comes before the long review */}
        <aside className="space-y-4 xl:order-2 xl:col-span-4">
          <div className="grid gap-4 md:grid-cols-2 xl:sticky xl:top-[calc(var(--topbar-h)+1.5rem)] xl:grid-cols-1">
            {topics.length > 0 && (
              <section aria-labelledby="topics-title" className="surface p-5 sm:p-6">
                <h2 id="topics-title" className="t-h4">{t("results.topics.title")}</h2>
                <p className="t-caption mt-0.5">{t("results.topics.lead")}</p>
                <ul className="mt-4 space-y-3.5">
                  {topics.map((r) => (
                    <li key={`${r.section}-${r.topic}`}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate font-medium text-ink">
                          {topicLabel(t, r.topic)}
                          {multiSection && <span className="t-caption font-normal"> · {t(`sections.${r.section}`)}</span>}
                        </span>
                        <span className="t-caption shrink-0 tabular">{t("results.topics.value", { correct: r.correct, total: r.total })}</span>
                      </div>
                      <ProgressBar value={r.accuracy ?? 0} tone={BAR_TONE[scoreTone(r.accuracy)]} size="sm" className="mt-1.5" label={`${topicLabel(t, r.topic)} ${formatPercent((r.accuracy ?? 0) / 100, locale)}`} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section aria-labelledby="next-title" className="surface-tint overflow-hidden">
              {/* decorative: dropped on phones so the answer review comes sooner */}
              <div aria-hidden="true" className="relative hidden aspect-[16/9] sm:block">
                <Illustration id="assistant.summarize" fill sizes="(min-width: 1280px) 380px, (min-width: 1024px) 34vw, 90vw" />
              </div>
              <div className="p-5 sm:p-6">
                <h2 id="next-title" className="t-h4">{t("results.next.title")}</h2>
                <p className="t-small mt-1.5 text-ink-2">{plan ? t("results.next.body") : t("results.next.perfect")}</p>
                {plan && (
                  <p className="t-caption mt-3">
                    {plan.section ? t("results.actions.retryHint", { section: sectionLabel(t, plan.exam, plan.section) }) : t("results.actions.retryMixed")}
                  </p>
                )}
              </div>
            </section>
          </div>
        </aside>

        <div className="min-w-0 xl:order-1 xl:col-span-8">
          <ReviewList t={t} items={items} />
        </div>
      </div>
    </div>
  );
}
