import { ArrowDown } from "lucide-react";
import { getLocale, getT } from "@/i18n/server";
import { cn } from "@/components/ui/cn";
import PriceTag from "./PriceTag";
import { planVars } from "./plan";

/**
 * "Start free" — the Free plan's real limits at a glance, beside the Elite
 * card, with a jump to the full comparison. Server component.
 */
export default async function FreePlanCard({ className }) {
  const locale = getLocale();
  const [t, tc] = await Promise.all([getT("subscriptions"), getT("common")]);
  const v = planVars(t, tc);
  const facts = [
    { key: "questions", value: v.freeQuestions, label: t("hero.free.questions") },
    { key: "daily", value: v.freeDaily, label: t("hero.free.daily") },
    { key: "assistant", value: v.freeMessages, label: t("hero.free.assistant", { hours: v.windowHours }) },
  ];

  return (
    <section aria-labelledby="free-plan" className={cn("surface-tint p-5 sm:p-6", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="free-plan" className="t-h4">{t("hero.free.title")}</h2>
          <p className="t-small mt-1 text-ink-3">{t("hero.free.body")}</p>
        </div>
        <PriceTag amount={0} locale={locale} size="sm" className="shrink-0" />
      </div>

      {/* Mobile: one fact per row (value · label). sm+: three tiles. */}
      <dl className="mt-5 divide-y divide-line/10 rounded-md bg-surface ring-1 ring-inset ring-line/10 sm:grid sm:grid-cols-3 sm:gap-3 sm:divide-y-0 sm:bg-transparent sm:ring-0">
        {facts.map((f) => (
          <div
            key={f.key}
            className="flex items-baseline gap-2 px-4 py-3 sm:flex-col sm:items-start sm:gap-1 sm:rounded-md sm:bg-surface sm:ring-1 sm:ring-inset sm:ring-line/10"
          >
            <dt className="t-caption order-last leading-snug">{f.label}</dt>
            <dd className="shrink-0 font-medium leading-tight text-ink">{f.value}</dd>
          </div>
        ))}
      </dl>

      <a
        href="#compare"
        className="mt-4 inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-gold-600 underline-offset-4 hover:underline"
      >
        {t("hero.compare")}
        <ArrowDown size={16} aria-hidden="true" />
      </a>
    </section>
  );
}
