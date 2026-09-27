"use client";

import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, History, PlayCircle, RotateCcw, Sparkles } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useLocale, useT } from "@/i18n/client";
import { formatNumber, formatPercent, formatRelative } from "@/i18n/format";
import { useAuthUser } from "@/context/AuthProvider";
import { getExamStats, listAttempts } from "@/lib/data/exams";
import { getSupabase } from "@/lib/supabase-lazy";
import { LIMITS } from "@/lib/exams/catalog";
import { textProps } from "@/components/community/text";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import IconTile from "@/components/ui/IconTile";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import { builderHref } from "./builder-logic";
import { examIcon, sectionLabel, signInHref } from "./labels";
import { scoreTone, templateName } from "./results-logic";
import { isOpenAttempt } from "./stats-logic";

const TONE_TEXT = { green: "text-green-700", gold: "text-gold-700", danger: "text-danger", neutral: "text-ink-3" };
const MISSING = new Set(["PGRST202", "PGRST205", "42P01", "42883"]);

/**
 * The latest attempts with their template and scope (list_exam_attempts_v2,
 * 0014); a database without it falls back to list_exam_attempts (legacy rows).
 */
async function listRecent(limit) {
  const supabase = await getSupabase().catch(() => null);
  if (supabase) {
    const { data, error } = await supabase.rpc("list_exam_attempts_v2", { p_limit: limit, p_before: null, p_before_id: null });
    if (!error) return { mode: "db", items: Array.isArray(data) ? data : [] };
    if (!MISSING.has(error.code) && !/could not find the function|schema cache/i.test(error.message || "")) throw error;
  }
  return listAttempts({ limit });
}

/**
 * Row title of an attempt: template attempts name the template and the scope
 * they covered (lesson / unit / subject title — educational content, marked
 * with the language its own text is in); legacy attempts name exam + section.
 */
function AttemptTitle({ it, t }) {
  if (!it.template_id) return <>{t(`types.${it.exam}`)} · {sectionLabel(t, it.exam, it.section)}</>;
  const scope = typeof it.scope_title === "string" && it.scope_title.trim() ? it.scope_title : null;
  return (
    <>
      {templateName(t, it.template_id)}
      {scope && (
        <>
          {" · "}
          <bdi {...textProps(scope)}>{scope}</bdi>
        </>
      )}
    </>
  );
}

/** School (curriculum) attempts get a book; aptitude / achievement keep their exam glyph. */
const attemptIcon = (it) => (it.exam === "school" ? BookOpen : examIcon(it.exam));

/** Hub rail: the viewer's exam activity (guest pitch / empty / stats + recent). */
export default function ExamActivity() {
  const t = useT("exams");
  const tc = useT("common");
  const { locale } = useLocale();
  const { isLoaded, isSignedIn } = useAuthUser();
  const [state, setState] = useState({ status: "loading" });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let alive = true;
    setState({ status: "loading" });
    Promise.allSettled([getExamStats(), listRecent(4)]).then(([s, l]) => {
      if (!alive) return;
      const stats = s.status === "fulfilled" ? s.value : null;
      const list = l.status === "fulfilled" ? l.value : null;
      if (!stats && !list) return setState({ status: "error" });
      if ((!stats || stats.mode === "local") && (!list || list.mode === "local")) return setState({ status: "local" });
      setState({ status: "ready", stats: stats?.mode === "db" ? stats : null, items: list?.items || [] });
    });
    return () => {
      alive = false;
    };
  }, [isLoaded, isSignedIn, nonce]);

  const header = <h2 id="activity-title" className="t-h4">{t("hub.activity.title")}</h2>;

  let body;
  if (!isLoaded || (isSignedIn && state.status === "loading")) {
    body = (
      <div aria-hidden="true" className="mt-5 space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} rounded="md" className="h-16" />)}
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton rounded="md" className="h-9 w-9" />
            <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-2/3" /><Skeleton className="h-3 w-1/3" /></div>
          </div>
        ))}
      </div>
    );
  } else if (!isSignedIn) {
    body = (
      <div className="mt-4">
        <div className="flex items-start gap-3">
          <IconTile icon={Sparkles} tone="gold" size="md" />
          <div className="min-w-0">
            <p className="font-medium text-ink">{t("hub.activity.guest.title")}</p>
            <p className="t-small mt-1 text-ink-3">
              {t("hub.activity.guest.body", { questions: tc("units.questions", { count: LIMITS.guestMaxQuestions }) })}
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button href={signInHref("/exams", "/sign-up")} size="sm" variant="secondary">{t("hub.activity.guest.cta")}</Button>
          <Button href={signInHref("/exams")} size="sm" variant="ghost">{t("hub.activity.guest.signIn")}</Button>
        </div>
      </div>
    );
  } else if (state.status === "local") {
    body = <Alert tone="info" className="mt-4">{t("hub.activity.practiceOnly")}</Alert>;
  } else if (state.status === "error") {
    // A failed request: the app-wide danger alert with a retry.
    body = (
      <Alert
        tone="danger"
        className="mt-4"
        title={t("hub.activity.unavailable")}
        action={
          <Button size="sm" variant="secondary" iconStart={RotateCcw} onClick={() => setNonce((n) => n + 1)}>
            {tc("actions.retry")}
          </Button>
        }
      />
    );
  } else {
    const { stats, items } = state;
    const totals = stats?.totals || {};
    const completed = Number(stats?.completed_attempts) || 0;
    const now = Date.now();
    const open = items.find((it) => isOpenAttempt(it, now));
    const recent = items.filter((it) => it !== open).slice(0, 3);

    if (!completed && !items.length) {
      body = (
        <div className="mt-4">
          <p className="font-medium text-ink">{t("hub.activity.empty.title")}</p>
          <p className="t-small mt-1 text-ink-3">{t("hub.activity.empty.body")}</p>
          <Button href={builderHref("aptitude")} size="sm" variant="secondary" className="mt-4" iconEnd={ArrowRight}>{t("hub.activity.empty.cta")}</Button>
        </div>
      );
    } else {
      const kpis = [
        ["completed", formatNumber(completed, locale)],
        ["accuracy", totals.accuracy === null || totals.accuracy === undefined ? "—" : formatPercent(totals.accuracy / 100, locale)],
        ["best", totals.best_score === null || totals.best_score === undefined ? "—" : formatPercent(totals.best_score / 100, locale)],
      ];
      body = (
        <div className="mt-4">
          {open && (
            <div className="mb-4 flex items-center gap-3 rounded-md border border-gold-200/70 bg-gold-50 p-3">
              <PlayCircle size={20} aria-hidden="true" className="shrink-0 text-gold-600" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{t("hub.activity.resume.title")}</p>
                <p className="t-caption truncate">
                  <AttemptTitle it={open} t={t} />
                </p>
              </div>
              <Button href={`/exams/attempt/${open.id}`} size="sm" variant="secondary">{t("hub.activity.resume.cta")}</Button>
            </div>
          )}
          <dl className="grid grid-cols-3 gap-2">
            {kpis.map(([k, v]) => (
              <div key={k} className="rounded-md bg-surface-2/70 px-3 py-2.5">
                <dt className="t-caption">{t(`hub.activity.stats.${k}`)}</dt>
                <dd className="mt-0.5 text-lg font-bold leading-tight text-ink tabular">{v}</dd>
              </div>
            ))}
          </dl>
          {recent.length > 0 && (
            <>
              <h3 className="t-caption mt-5 font-medium text-ink-2">{t("hub.activity.recent")}</h3>
              <ul className="mt-2 divide-y divide-line/10">
                {recent.map((it) => {
                  const Icon = attemptIcon(it);
                  const pct = it.score_percent === null || it.score_percent === undefined ? null : Number(it.score_percent);
                  return (
                    <li key={it.id}>
                      <Link href={`/exams/attempt/${it.id}`} className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-surface-2">
                        <IconTile icon={Icon} tone="neutral" size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">
                            <AttemptTitle it={it} t={t} />
                          </p>
                          <p className="t-caption">{formatRelative(it.started_at, locale)}</p>
                        </div>
                        {pct === null ? (
                          <span className="t-caption">{t(`history.list.status.${it.status}`)}</span>
                        ) : (
                          <span className={cn("text-sm font-bold tabular", TONE_TEXT[scoreTone(pct)])}>{formatPercent(pct / 100, locale)}</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <Button href="/exams/history" variant="secondary" size="sm" block iconStart={History} className="mt-4">
            {t("hub.activity.viewAll")}
          </Button>
        </div>
      );
    }
  }

  return (
    <section aria-labelledby="activity-title" className="surface p-5 sm:p-6">
      {header}
      {body}
    </section>
  );
}
