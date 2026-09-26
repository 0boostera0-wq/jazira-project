"use client";

import { useEffect, useState } from "react";
import { ArrowRight, History, PlayCircle, RotateCcw, Sparkles } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useLocale, useT } from "@/i18n/client";
import { formatNumber, formatPercent, formatRelative } from "@/i18n/format";
import { useAuthUser } from "@/context/AuthProvider";
import { getExamStats, listAttempts } from "@/lib/data/exams";
import { LIMITS } from "@/lib/exams/catalog";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import IconTile from "@/components/ui/IconTile";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import { builderHref } from "./builder-logic";
import { examIcon, sectionLabel, signInHref } from "./labels";
import { accuracyTone } from "./results-logic";

const TONE_TEXT = { green: "text-green-700", gold: "text-gold-700", danger: "text-danger", neutral: "text-ink-3" };

/**
 * Hub rail: the viewer's exam activity (guest pitch / empty / stats + recent).
 * `preview` ({ stats, items }) is for visual QA of signed-in states only.
 */
export default function ExamActivity({ preview = null }) {
  const t = useT("exams");
  const tc = useT("common");
  const { locale } = useLocale();
  const auth = useAuthUser();
  const { isLoaded, isSignedIn } = preview ? { isLoaded: true, isSignedIn: true } : auth;
  const [state, setState] = useState(() => (preview ? { status: "ready", ...preview } : { status: "loading" }));
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || preview) return;
    let alive = true;
    setState({ status: "loading" });
    Promise.allSettled([getExamStats(), listAttempts({ limit: 4 })]).then(([s, l]) => {
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
  }, [isLoaded, isSignedIn, nonce, preview]);

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
          <Button href={signInHref("/exams", "/sign-up")} size="sm">{t("hub.activity.guest.cta")}</Button>
          <Button href={signInHref("/exams")} size="sm" variant="ghost">{t("hub.activity.guest.signIn")}</Button>
        </div>
      </div>
    );
  } else if (state.status === "local") {
    body = <Alert tone="info" className="mt-4">{t("hub.activity.practiceOnly")}</Alert>;
  } else if (state.status === "error") {
    body = (
      <div className="mt-4">
        <p className="t-small text-ink-3">{t("hub.activity.unavailable")}</p>
        <Button size="sm" variant="secondary" iconStart={RotateCcw} className="mt-3" onClick={() => setNonce((n) => n + 1)}>
          {tc("actions.retry")}
        </Button>
      </div>
    );
  } else {
    const { stats, items } = state;
    const totals = stats?.totals || {};
    const completed = Number(stats?.completed_attempts) || 0;
    const now = Date.now();
    const open = items.find((it) => it.status === "in_progress" && Date.parse(it.expires_at) > now);
    const recent = items.filter((it) => it !== open).slice(0, 3);

    if (!completed && !items.length) {
      body = (
        <div className="mt-4">
          <p className="font-medium text-ink">{t("hub.activity.empty.title")}</p>
          <p className="t-small mt-1 text-ink-3">{t("hub.activity.empty.body")}</p>
          <Button href={builderHref("aptitude")} size="sm" className="mt-4" iconEnd={ArrowRight}>{t("hub.activity.empty.cta")}</Button>
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
                <p className="t-caption truncate">{t(`types.${open.exam}`)} · {sectionLabel(t, open.exam, open.section)}</p>
              </div>
              <Button href={`/exams/attempt/${open.id}`} size="sm">{t("hub.activity.resume.cta")}</Button>
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
                  const Icon = examIcon(it.exam);
                  const pct = it.score_percent === null || it.score_percent === undefined ? null : Number(it.score_percent);
                  return (
                    <li key={it.id}>
                      <Link href={`/exams/attempt/${it.id}`} className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-surface-2">
                        <IconTile icon={Icon} tone="neutral" size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">
                            {t(`types.${it.exam}`)} · {sectionLabel(t, it.exam, it.section)}
                          </p>
                          <p className="t-caption">{formatRelative(it.started_at, locale)}</p>
                        </div>
                        {pct === null ? (
                          <span className="t-caption">{t(`history.list.status.${it.status}`)}</span>
                        ) : (
                          <span className={cn("text-sm font-bold tabular", TONE_TEXT[accuracyTone(pct)])}>{formatPercent(pct / 100, locale)}</span>
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
