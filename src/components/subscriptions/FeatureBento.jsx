import { Clock3, MessagesSquare, UserRound } from "lucide-react";
import { getLocale, getT } from "@/i18n/server";
import { formatNumber } from "@/i18n/format";
import { SectionHeader } from "@/components/ui/Layout";
import Illustration from "@/components/ui/Illustration";
import IconTile from "@/components/ui/IconTile";
import { cn } from "@/components/ui/cn";
import EliteBadge from "./EliteBadge";
import { PLAN, planVars } from "./plan";

function Tile({ className, children }) {
  return <article className={cn("surface-flat flex flex-col p-5 sm:p-6", className)}>{children}</article>;
}

/** "What Elite adds" — a bento of the real Elite benefits. Server component. */
export default async function FeatureBento({ className }) {
  const locale = getLocale();
  const [t, tc] = await Promise.all([getT("subscriptions"), getT("common")]);
  const v = planVars(t, tc);

  return (
    <section aria-labelledby="elite-features" className={className}>
      <SectionHeader
        id="elite-features"
        eyebrow={t("features.eyebrow")}
        title={t("features.title")}
        description={t("features.description")}
      />

      <div className="mt-7 grid gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-12">
        {/* Analytics — the wide editorial tile with its image full-bleed beside the copy */}
        <Tile className="overflow-hidden !p-0 md:col-span-2 lg:col-span-7">
          <div className="grid h-full sm:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
            <div className="flex flex-col justify-center p-5 sm:p-7">
              <h3 className="t-h3">{t("features.analytics.title")}</h3>
              <p className="t-body mt-2.5 text-ink-2">{t("features.analytics.body")}</p>
            </div>
            <div aria-hidden="true" className="relative aspect-[16/9] sm:aspect-auto sm:min-h-[15rem]">
              <Illustration id="subscriptions.features" fill sizes="(min-width: 1024px) 28vw, (min-width: 640px) 45vw, 100vw" />
            </div>
          </div>
        </Tile>

        {/* Exams — typographic tile: the real per-exam question ceiling */}
        <Tile className="lg:col-span-5">
          <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="num text-5xl font-bold leading-none tracking-tight text-gold-600 tabular">
              {formatNumber(PLAN.exams.eliteMaxQuestions, locale)}
            </span>
            <span className="text-sm font-medium text-ink-3">{t("features.exams.unit", { count: PLAN.exams.eliteMaxQuestions })}</span>
          </p>
          <h3 className="t-h4 mt-4">{t("features.exams.title")}</h3>
          <p className="t-small mt-1.5 text-ink-3">{t("features.exams.body", { questions: v.eliteQuestions })}</p>
          <p className="mt-auto pt-5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line/15 bg-surface-2 px-3 py-1.5 text-[0.8125rem] font-medium text-ink-2">
              <Clock3 size={14} aria-hidden="true" className="text-gold-600" />
              {t("features.exams.simulation", { questions: v.simQuestions, minutes: v.simMinutes })}
            </span>
          </p>
        </Tile>

        <Tile className="lg:col-span-4">
          <IconTile icon={MessagesSquare} tone="green" />
          <h3 className="t-h4 mt-4">{t("features.assistant.title")}</h3>
          <p className="t-small mt-1.5 text-ink-3">
            {t("features.assistant.body", { messages: v.freeMessages, hours: v.windowHours })}
          </p>
        </Tile>

        <Tile className="lg:col-span-4">
          <div className="flex h-11 items-center">
            <EliteBadge size="md" />
          </div>
          <h3 className="t-h4 mt-4">{t("features.badge.title")}</h3>
          <p className="t-small mt-1.5 text-ink-3">{t("features.badge.body")}</p>
        </Tile>

        <Tile className="lg:col-span-4">
          <IconTile icon={UserRound} tone="neutral" />
          <h3 className="t-h4 mt-4">{t("features.profile.title")}</h3>
          <p className="t-small mt-1.5 text-ink-3">
            {t("features.profile.body", { elitePeriod: v.eliteNamePeriod, freePeriod: v.freeNamePeriod })}
          </p>
        </Tile>
      </div>
    </section>
  );
}
