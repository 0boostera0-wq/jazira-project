"use client";

import { Check } from "lucide-react";
import { useT } from "@/i18n/client";
import { Link } from "@/i18n/navigation";
import Illustration from "@/components/ui/Illustration";
import { ProgressBar } from "@/components/ui/Progress";
import { cn } from "@/components/ui/cn";
import { PLATE } from "@/components/stages/parts";
import { useDashboard, useResource } from "./DashboardProvider";
import { QUICK_PRACTICE_QUESTIONS, onboardingSteps } from "./model";

/**
 * Checklist state from real signals only: a curriculum visit on this device,
 * a completed attempt, an assistant message, community activity (post,
 * comment or follow). Unmeasurable signals (null) never tick a step.
 */
export function useOnboarding() {
  const { lastVisit } = useDashboard();
  const signals = useResource("onboarding");
  const pending = signals.status === "loading" || lastVisit === undefined;
  const { steps, done, total } = onboardingSteps({
    stage: lastVisit ? true : lastVisit === null ? false : null,
    practice: false,
    assistant: signals.data?.assistant ?? null,
    community: signals.data?.community ?? null,
  });
  return { steps, done, total, pending };
}

/** "1 of 4" chip for the panel header. */
export function OnboardingCount() {
  const t = useT("dashboard");
  const { done, total } = useOnboarding();
  return (
    <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-[0.8125rem] font-medium text-ink-2 tabular">
      {t("onboarding.progress", { done, total })}
    </span>
  );
}

/**
 * First steps for a member with no completed attempt, next to the honest
 * "your analytics will appear here" state (the panel header carries the title).
 */
export default function OnboardingPanel() {
  const t = useT("dashboard");
  const tc = useT("common");
  const { steps, done, total, pending } = useOnboarding();
  const vars = { questions: tc("units.questions", { count: QUICK_PRACTICE_QUESTIONS }) };

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] md:gap-6">
      <div className="min-w-0">
        <p className="t-small text-ink-3">{t("onboarding.lead")}</p>
        <ProgressBar value={(done / total) * 100} tone="green" size="sm" className="mt-3" label={t("onboarding.progressAria", { done, total })} />
        <ol className="mt-4 space-y-2">
          {steps.map((s, i) => (
            <li key={s.key}>
              <Link
                href={s.href}
                className={cn(
                  "group flex items-center gap-3 rounded-md border px-3.5 py-3 transition-colors",
                  s.done ? "border-green-100 bg-green-50/60" : "border-line/12 bg-surface hover:border-line/25 hover:bg-surface-2/60"
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid h-7 w-7 shrink-0 place-items-center rounded-full text-[0.8125rem] font-bold tabular",
                    s.done ? "bg-green-500 text-white" : "border border-line/25 text-ink-3",
                    !s.done && pending && s.key !== "practice" && "animate-pulse"
                  )}
                >
                  {s.done ? <Check size={15} strokeWidth={2.5} /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block font-medium leading-snug", s.done ? "text-ink-2" : "text-ink")}>
                    {t(`onboarding.steps.${s.key}.title`, vars)}
                  </span>
                  <span className="t-caption mt-0.5 block">{t(`onboarding.steps.${s.key}.body`)}</span>
                </span>
                <span className={cn("shrink-0 text-[0.8125rem] font-medium", s.done ? "text-green-700" : "text-gold-600 group-hover:underline")}>
                  {s.done ? t("onboarding.done") : t(`onboarding.steps.${s.key}.cta`)}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
      {/* Phones: a compact row (art beside the text); md+: a centred column beside the checklist. */}
      <div className={cn("flex items-center gap-4 rounded-md p-4 md:flex-col md:justify-center md:gap-0 md:px-5 md:py-6 md:text-center", PLATE)}>
        <div className="w-28 shrink-0 xs:w-32 md:w-full md:max-w-[15rem]">
          <Illustration id="landing.progress" />
        </div>
        <div className="min-w-0 md:mt-4">
          <p className="font-medium text-ink">{t("onboarding.analyticsTitle")}</p>
          <p className="mt-1 max-w-xs text-sm leading-relaxed text-ink-3 md:mx-auto">{t("onboarding.analyticsBody")}</p>
        </div>
      </div>
    </div>
  );
}
