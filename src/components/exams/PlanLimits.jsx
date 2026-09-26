import { Check, Crown, UserRound, UserRoundCheck } from "lucide-react";
import Button from "@/components/ui/Button";
import IconTile from "@/components/ui/IconTile";
import { SectionHeader } from "@/components/ui/Layout";
import { cn } from "@/components/ui/cn";
import { LIMITS, PRESETS } from "@/lib/exams/catalog";
import TierBadge from "./TierBadge";

const FULL = PRESETS.find((p) => p.premium) || PRESETS[PRESETS.length - 1];

/**
 * The three access levels side by side, with numbers taken from the catalog
 * (the same limits start_exam_attempt / the local API enforce).
 */
export default function PlanLimits({ t, tc, id = "plans-title" }) {
  const plans = [
    {
      key: "guest",
      icon: UserRound,
      tone: "neutral",
      points: [
        t("hub.plans.guest.points.questions", { questions: tc("units.questions", { count: LIMITS.guestMaxQuestions }) }),
        t("hub.plans.guest.points.saved"),
        t("hub.plans.guest.points.review"),
      ],
    },
    {
      key: "free",
      icon: UserRoundCheck,
      tone: "green",
      points: [
        t("hub.plans.free.points.questions", { questions: tc("units.questions", { count: LIMITS.freeMaxQuestions }) }),
        t("hub.plans.free.points.daily", { attempts: t("units.attempts", { count: LIMITS.freeDailyAttempts }) }),
        t("hub.plans.free.points.saved"),
      ],
    },
    {
      key: "elite",
      icon: Crown,
      tone: "gold",
      points: [
        t("hub.plans.elite.points.questions", { questions: tc("units.questions", { count: LIMITS.maxQuestions }) }),
        t("hub.plans.elite.points.daily"),
        t("hub.plans.elite.points.simulation", {
          questions: tc("units.questions", { count: FULL.count }),
          minutes: tc("units.minutes", { count: FULL.minutes }),
        }),
        t("hub.plans.elite.points.analytics"),
      ],
    },
  ];

  return (
    <section aria-labelledby={id}>
      <SectionHeader
        id={id}
        size="h3"
        eyebrow={t("hub.plans.eyebrow")}
        title={t("hub.plans.title")}
        description={t("hub.plans.lead")}
        actions={
          <Button href="/subscriptions" variant="secondary" iconStart={Crown}>
            {t("hub.plans.upgrade")}
          </Button>
        }
      />
      <ul className="mt-6 grid gap-3 md:grid-cols-3 md:gap-4">
        {plans.map((p) => (
          <li
            key={p.key}
            className={cn(
              "flex flex-col rounded-lg border p-5",
              p.key === "elite" ? "border-gold-200/70 bg-gold-50/70" : "border-line/12 bg-surface"
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <IconTile icon={p.icon} tone={p.tone} size="sm" />
                <h3 className="t-h4">{t(`hub.plans.${p.key}.title`)}</h3>
              </div>
              <TierBadge tier={p.key} />
            </div>
            <ul className="mt-4 space-y-2.5">
              {p.points.map((line) => (
                <li key={line} className="flex gap-2.5 text-[0.9375rem] leading-relaxed text-ink-2">
                  <Check size={16} aria-hidden="true" className={cn("mt-1 shrink-0", p.key === "elite" ? "text-gold-600" : "text-green-600")} />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
