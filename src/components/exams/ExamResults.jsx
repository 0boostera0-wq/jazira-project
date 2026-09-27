"use client";

import { useEffect, useState } from "react";
import { BookOpen, CheckCircle2, Clock, History, Info, ListChecks, LogIn, Plus, RotateCcw, Sparkles, Target, UserPlus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { startExam } from "@/lib/data/exams";
import { useLocale, useT } from "@/i18n/client";
import { formatClock, formatDate, formatNumber, formatPercent } from "@/i18n/format";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Illustration from "@/components/ui/Illustration";
import { ProgressBar, ProgressRing } from "@/components/ui/Progress";
import { cn } from "@/components/ui/cn";
import { builderHref } from "./builder-logic";
import { sectionLabel, signInHref, topicLabel } from "./labels";
import { prepTopicOf, safeAppPath } from "./question-logic";
import ReviewList from "./ReviewList";
import {
  errorMessage, isTemplateResult, lessonRows, mistakesConfig, retakeConfig, retryPlan, reviewCounts, ringTone, scoreBand, scoreTone, sessionLessonTitle,
  sortTopics, templateName, templateSummary, termRows, usedSeconds,
} from "./results-logic";

const BAR_TONE = { green: "green", gold: "gold", danger: "danger", neutral: "ink" };

/**
 * Results (same route as the runner once submitted), without a reload.
 * Template sessions (lesson / chapter / subject / term / full-year quizzes,
 * practice…) get TemplateResults: per-lesson bars, «إعادة الاختبار» and
 * «شرح السبب». Legacy builder attempts keep the per-skill results below.
 * `onStart(payload)` opens a freshly started session (retake / practise my mistakes).
 */
export default function ExamResults({ result, isSignedIn, path, onStart }) {
  if (isTemplateResult(result)) return <TemplateResults result={result} isSignedIn={isSignedIn} path={path} onStart={onStart} />;
  return <LegacyResults result={result} isSignedIn={isSignedIn} path={path} />;
}

/**
 * Legacy results: score ring and key numbers, next actions, per-skill
 * breakdown, and the answer review. Local practice results say plainly that
 * nothing was saved.
 */
function LegacyResults({ result, isSignedIn, path }) {
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

/**
 * Template session results (§7): score ring and key numbers, «إعادة الاختبار»
 * (same template, scope, count, timing; retake_of = this attempt), "practise
 * my mistakes" (weakness review, saved attempts), per-lesson bars with lesson
 * links, per-term bars for a full year, and the answer review with
 * صح / خطأ, «شرح السبب», the objective, the lesson and the book reference.
 */
function TemplateResults({ result, isSignedIn, path, onStart }) {
  const t = useT("exams");
  const tc = useT("common");
  const { locale } = useLocale();
  const a = result.attempt || {};
  const items = result.items || [];
  const sum = templateSummary(result);
  const band = scoreBand(sum.percent);
  const saved = result.mode === "db";
  const retake = retakeConfig(result);
  const mistakes = mistakesConfig(result);
  // lesson links only to in-app paths; prep topics (mock / prep scopes) are named by their topic label
  const lessons = lessonRows(result.by_lesson).map((r) => {
    const topic = r.title ? null : prepTopicOf(r.id);
    return { ...r, href: safeAppPath(r.href), label: r.title || (topic ? topicLabel(t, topic) : r.id), content: Boolean(r.title) };
  });
  const terms = termRows(result.by_term);
  const used = usedSeconds(a);
  const tpl = a.template_id ?? result.template?.id ?? a.template?.id;
  const scopeTitle = a.scope_title ?? sessionLessonTitle(items);
  const [starting, setStarting] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  async function start(kind, config) {
    if (starting || !config) return;
    setStarting(kind);
    setError(null);
    try {
      const payload = await startExam(config);
      onStart?.(payload); // the runner takes over (in place, or on the new attempt's route)
    } catch (e) {
      setStarting(null);
      setError(errorMessage(t, e?.code || "unknown", e?.details, tc));
    }
  }

  const stats = [
    { key: "correct", Icon: CheckCircle2, value: t("results.stats.correctValue", { correct: sum.correct, total: sum.total }) },
    { key: "time", Icon: Clock, value: used === null ? "—" : formatClock(used), ltr: true },
    { key: "answered", Icon: ListChecks, value: formatNumber(sum.answered, locale) },
    { key: "xp", Icon: Sparkles, value: saved ? `+${formatNumber(a.xp_awarded || 0, locale)}` : "—", hint: saved ? null : t("results.stats.xpNone"), ltr: true },
  ];

  return (
    <div className="animate-in">
      <header className="surface overflow-hidden">
        <div aria-hidden="true" className="relative h-24 sm:h-32 lg:h-36">
          <Illustration id="exams.results" fill sizes="(min-width: 1280px) 960px, 100vw" />
        </div>
        <div className="grid gap-6 p-5 sm:p-8 xl:grid-cols-12 xl:items-center xl:gap-8">
          <div className="flex items-center gap-5 sm:gap-7 xl:col-span-7">
            <ProgressRing value={sum.percent} size={116} stroke={9} tone={ringTone(sum.percent)} label={t("results.scoreLabel", { percent: formatPercent(sum.percent / 100, locale, 1) })} className="shrink-0">
              <span className="text-[1.625rem] font-bold leading-none text-ink tabular sm:text-3xl">{formatPercent(sum.percent / 100, locale, sum.percent % 1 ? 1 : 0)}</span>
            </ProgressRing>
            <div className="min-w-0">
              <p className="t-eyebrow">{templateName(t, tpl, Boolean(a.mini ?? result.mini))}</p>
              <h1 className="t-h3 mt-1 sm:t-h2">{t(`results.bands.${band}.title`)}</h1>
              <p className="t-caption mt-1">
                {scopeTitle ? <><bdi lang="ar" dir="rtl">{scopeTitle}</bdi> · </> : null}
                {formatDate(a.submitted_at || result.submitted_at || a.started_at || Date.now(), locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
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
          {retake && (
            <Button onClick={() => start("retake", retake)} loading={starting === "retake"} disabled={Boolean(starting)} iconStart={RotateCcw}>
              {t("results.actions.retake")}
            </Button>
          )}
          {mistakes && (
            <Button variant="secondary" onClick={() => start("mistakes", mistakes)} loading={starting === "mistakes"} disabled={Boolean(starting)} iconStart={Target}>
              {t("results.actions.mistakes")}
            </Button>
          )}
          {saved && <Button href="/exams/history" variant="ghost" iconStart={History}>{t("results.actions.history")}</Button>}
          <Button href="/exams" variant="ghost">{t("results.actions.hub")}</Button>
        </div>
      </header>

      {error && <Alert tone="danger" className="mt-4">{error}</Alert>}
      {(a.status === "expired" || result.status === "expired") && <Alert tone="warning" className="mt-4">{t("results.expired")}</Alert>}
      {sum.voided > 0 && <Alert tone="info" className="mt-4">{t("results.voided", { count: sum.voided })}</Alert>}
      {result.key_reveal_limit && <Alert tone="info" className="mt-4">{t("results.keyLimit")}</Alert>}
      {!saved && <NotSaved t={t} isSignedIn={isSignedIn} path={path} />}

      <div className="mt-8 grid gap-6 xl:grid-cols-12 xl:gap-8">
        <aside className="space-y-4 xl:order-2 xl:col-span-4">
          <div className="grid gap-4 md:grid-cols-2 xl:sticky xl:top-[calc(var(--topbar-h)+1.5rem)] xl:grid-cols-1">
            {lessons.length > 0 && (
              <section aria-labelledby="lessons-title" className="surface p-5 sm:p-6">
                <h2 id="lessons-title" className="t-h4">{t("results.lessons.title")}</h2>
                <p className="t-caption mt-0.5">{t("results.lessons.lead")}</p>
                <ul className="mt-4 space-y-3.5">
                  {lessons.map((r) => (
                    <li key={r.id}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        {r.href ? (
                          <Link href={r.href} className="min-w-0 truncate font-medium text-ink hover:text-gold-700 hover:underline">
                            <bdi lang={r.content ? "ar" : undefined} dir={r.content ? "rtl" : undefined}>{r.label}</bdi>
                          </Link>
                        ) : (
                          <span className="min-w-0 truncate font-medium text-ink"><bdi lang={r.content ? "ar" : undefined} dir={r.content ? "rtl" : undefined}>{r.label}</bdi></span>
                        )}
                        <span className="t-caption shrink-0 tabular">{t("results.topics.value", { correct: r.correct, total: r.total })}</span>
                      </div>
                      <ProgressBar value={r.accuracy ?? 0} tone={BAR_TONE[scoreTone(r.accuracy)]} size="sm" className="mt-1.5" label={`${r.label} ${formatPercent((r.accuracy ?? 0) / 100, locale)}`} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {terms.length > 0 && (
              <section aria-labelledby="terms-title" className="surface p-5 sm:p-6">
                <h2 id="terms-title" className="t-h4">{t("results.terms.title")}</h2>
                <ul className="mt-4 space-y-3.5">
                  {terms.map((r) => (
                    <li key={r.term}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-medium text-ink">{t.has(`results.terms.${r.term}`) ? t(`results.terms.${r.term}`) : t("results.terms.none")}</span>
                        <span className="t-caption shrink-0 tabular">{t("results.topics.value", { correct: r.correct, total: r.total })}</span>
                      </div>
                      <ProgressBar value={r.accuracy ?? 0} tone={BAR_TONE[scoreTone(r.accuracy)]} size="sm" className="mt-1.5" label={formatPercent((r.accuracy ?? 0) / 100, locale)} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section aria-labelledby="next-title" className="surface-tint p-5 sm:p-6">
              <h2 id="next-title" className="t-h4">{t("results.next.title")}</h2>
              <p className="t-small mt-1.5 text-ink-2">{sum.correct < sum.total ? t("results.next.templateBody") : t("results.next.perfect")}</p>
              {lessons[0]?.href && sum.correct < sum.total ? (
                <Button href={lessons[0].href} variant="link" size="sm" className="mt-3" iconStart={BookOpen}>{t("results.next.openLesson")}</Button>
              ) : null}
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

/** "This result won't be saved" (guests and the no-database fallback). */
function NotSaved({ t, isSignedIn, path }) {
  return (
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
          <Button href={signInHref(path, "/sign-up")} size="sm" variant="secondary" iconStart={UserPlus}>{t("results.local.signUp")}</Button>
          <Button href={signInHref(path)} size="sm" variant="ghost" iconStart={LogIn}>{t("results.local.signIn")}</Button>
        </div>
      )}
    </section>
  );
}
