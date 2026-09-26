"use client";

import { ArrowRight, Crown, ShieldCheck } from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import { formatDate } from "@/i18n/format";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { ProgressBar } from "@/components/ui/Progress";
import EliteBadge from "@/components/subscriptions/EliteBadge";
import { PLAN } from "@/components/subscriptions/plan";
import { attemptsToday } from "@/components/exams/stats-logic";
import { useDashboard, useResource } from "./DashboardProvider";
import { PanelLink } from "./Panel";
import { FREE_DAILY_ATTEMPTS } from "./model";

function AttemptsMeter() {
  const t = useT("dashboard");
  const { now } = useDashboard();
  const r = useResource("attempts");
  if (r.status === "loading" || now === null) {
    return (
      <div aria-hidden="true" className="mt-4 space-y-2.5 rounded-md bg-surface-2 p-3.5">
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton rounded="full" className="h-1.5 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    );
  }
  if (r.status !== "ready") return null; // history unavailable → no invented count
  // The dashboard clock, so the meter rolls over at Saudi midnight while the page stays open.
  const used = Math.min(FREE_DAILY_ATTEMPTS, attemptsToday(r.data, now));
  const vars = { used, limit: FREE_DAILY_ATTEMPTS };
  return (
    <div className="mt-4 rounded-md bg-surface-2 p-3.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-ink-2">{t("plan.attemptsToday")}</span>
        <span className="font-medium text-ink tabular">{t("plan.attemptsValue", vars)}</span>
      </div>
      <ProgressBar value={(used / FREE_DAILY_ATTEMPTS) * 100} size="sm" className="mt-2" label={t("plan.attemptsAria", vars)} />
      <p className="t-caption mt-2">{used >= FREE_DAILY_ATTEMPTS ? t("plan.limitReached") : t("plan.resets")}</p>
    </div>
  );
}

function RenewalLine() {
  const t = useT("dashboard");
  const { locale } = useLocale();
  const r = useResource("subscription");
  if (r.status === "loading") return <Skeleton aria-hidden="true" className="mt-1.5 h-3 w-32" />;
  const end = r.status === "ready" ? r.data?.periodEnd : null;
  return end ? <p className="t-caption mt-1">{t("plan.renews", { date: formatDate(end, locale) })}</p> : null;
}

/** The member's real assistant allowance (ai_quota() includes the referral bonus), else the plan default. */
function useAssistantAllowance() {
  const r = useResource("quota");
  const q = r.status === "ready" && r.data && !r.data.unlimited ? r.data : null;
  const limit = Number(q?.limit);
  const hours = Number(q?.window_hours);
  return {
    messages: Number.isFinite(limit) && limit > 0 ? limit : PLAN.assistant.freeMessages,
    hours: Number.isFinite(hours) && hours > 0 ? hours : PLAN.assistant.windowHours,
  };
}

/** Elite status (with renewal date) or the free plan's real limits + today's attempt meter + upgrade. */
export default function PlanCard() {
  const t = useT("dashboard");
  const tc = useT("common");
  const { user, session } = useDashboard();
  const allowance = useAssistantAllowance();

  if (session !== "ready") {
    return (
      <section aria-hidden="true" className="surface p-5">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="mt-2 h-5 w-32" />
        <Skeleton rounded="md" className="mt-4 h-[86px]" />
        <Skeleton rounded="full" className="mt-4 h-9 w-full" />
      </section>
    );
  }

  if (user.isElite) {
    return (
      <section aria-labelledby="dash-plan" className="surface p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="t-eyebrow">{t("plan.eyebrow")}</p>
          <EliteBadge size="sm" />
        </div>
        <h2 id="dash-plan" className="t-h4 mt-1">{t("plan.eliteTitle")}</h2>
        <p className="mt-2 flex items-center gap-2 text-sm font-medium text-green-700">
          <ShieldCheck size={16} aria-hidden="true" className="shrink-0" />
          {t("plan.eliteStatus")}
        </p>
        <RenewalLine />
        <p className="t-small mt-3 text-ink-3">
          {t("plan.elitePerks", { questions: tc("units.questions", { count: PLAN.exams.eliteMaxQuestions }) })}
        </p>
        <div className="mt-3">
          <PanelLink href="/subscriptions">{t("plan.manage")}</PanelLink>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="dash-plan" className="surface p-5">
      <p className="t-eyebrow">{t("plan.eyebrow")}</p>
      <h2 id="dash-plan" className="t-h4 mt-1">{t("plan.freeTitle")}</h2>
      <AttemptsMeter />
      <p className="t-caption mt-3">
        {t("plan.freeLimits", {
          questions: tc("units.questions", { count: PLAN.exams.freeMaxQuestions }),
          messages: t("units.messages", { count: allowance.messages }),
          hours: t("units.hours", { count: allowance.hours }),
        })}
      </p>
      <Button href="/subscriptions" variant="soft" size="sm" block iconStart={Crown} iconEnd={ArrowRight} className="mt-4">
        {t("plan.upgrade")}
      </Button>
    </section>
  );
}
