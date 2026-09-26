import { Check, Crown, Minus } from "lucide-react";
import { getLocale, getT } from "@/i18n/server";
import { SectionHeader } from "@/components/ui/Layout";
import { cn } from "@/components/ui/cn";
import PriceTag from "./PriceTag";
import { PLAN, planVars } from "./plan";

/**
 * Free vs Elite — a real <table> (row/column headers for screen readers).
 * `aside` renders a rail beside the table on desktop (below it on mobile),
 * top-aligned with the table rather than with the section heading.
 */
export default async function PlanComparison({ className, aside }) {
  const locale = getLocale();
  const [t, tc] = await Promise.all([getT("subscriptions"), getT("common")]);
  const v = planVars(t, tc);
  const val = (key, vars) => t(`compare.values.${key}`, vars);

  const groups = [
    {
      key: "exams",
      rows: [
        ["questions", val("upTo", { questions: v.freeQuestions }), val("upTo", { questions: v.eliteQuestions })],
        ["daily", val("perDay", { exams: v.freeDaily }), val("noDailyLimit")],
        ["simulation", false, true, { questions: v.simQuestions, minutes: v.simMinutes }],
      ],
    },
    {
      key: "assistant",
      rows: [["messages", val("perWindow", { messages: v.freeMessages, hours: v.windowHours }), val("noLimit")]],
    },
    { key: "analytics", rows: [["analytics", false, true]] },
    {
      key: "profile",
      rows: [
        ["badge", false, true],
        ["name", val("every", { period: v.freeNamePeriod }), val("every", { period: v.eliteNamePeriod })],
        ["avatar", val("every", { period: v.freeAvatarPeriod }), val("anytime")],
      ],
    },
  ];

  const cell = (value) => {
    if (value === true) {
      return (
        <span className="inline-grid h-6 w-6 place-items-center rounded-full bg-green-50 text-green-600 ring-1 ring-inset ring-green-100">
          <Check size={14} strokeWidth={2.5} aria-hidden="true" />
          <span className="sr-only">{val("included")}</span>
        </span>
      );
    }
    if (value === false) {
      return (
        <span className="inline-grid h-6 w-6 place-items-center text-ink-4">
          <Minus size={16} aria-hidden="true" />
          <span className="sr-only">{val("notIncluded")}</span>
        </span>
      );
    }
    return value;
  };

  const eliteCol = "bg-gold-50/70";

  return (
    <section id="compare" aria-labelledby="compare-title" className={cn("scroll-mt-24", className)}>
      <SectionHeader id="compare-title" eyebrow={t("compare.eyebrow")} title={t("compare.title")} description={t("compare.description")} />

      <div className="mt-6 grid gap-x-8 gap-y-5 lg:grid-cols-12 xl:gap-x-10">
        <div className="surface min-w-0 overflow-hidden lg:col-span-8">
          <table className="w-full table-fixed border-collapse text-start">
            <caption className="sr-only">{t("compare.caption")}</caption>
            <colgroup>
              <col />
              <col className="w-[5.75rem] sm:w-36 xl:w-40" />
              <col className="w-[5.75rem] sm:w-36 xl:w-40" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className="px-4 pb-4 pt-5 text-start align-bottom text-[0.8125rem] font-medium text-ink-3 sm:px-6">
                  {t("compare.feature")}
                </th>
                <th scope="col" className="px-2 pb-4 pt-5 text-center align-bottom">
                  <span className="block text-sm font-medium text-ink-2">{t("plan.free")}</span>
                  <PriceTag amount={0} locale={locale} size="sm" className="mt-1 justify-center" />
                </th>
                <th scope="col" className={cn("rounded-t-md px-2 pb-4 pt-5 text-center align-bottom", eliteCol)}>
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-gold-700">
                    <Crown size={14} aria-hidden="true" />
                    {t("plan.elite")}
                  </span>
                  <PriceTag amount={PLAN.priceSAR} locale={locale} size="sm" className="mt-1 justify-center" />
                </th>
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.key}>
                <tr>
                  <th colSpan={2} scope="colgroup" className="border-t border-line/10 bg-surface-2/70 px-4 py-2.5 text-start text-[0.8125rem] font-medium text-ink-3 sm:px-6">
                    {t(`compare.groups.${g.key}`)}
                  </th>
                  <td className={cn("border-t border-line/10", eliteCol)} />
                </tr>
                {g.rows.map(([key, free, elite, vars]) => (
                  <tr key={key} className="border-t border-line/10">
                    <th scope="row" className="px-4 py-3.5 text-start text-sm font-normal leading-relaxed text-ink-2 sm:px-6 sm:text-[0.9375rem]">
                      {t(`compare.rows.${key}`, vars)}
                    </th>
                    <td className="px-2 py-3.5 text-center text-[0.8125rem] leading-snug text-ink-3 sm:text-sm">{cell(free)}</td>
                    <td className={cn("px-2 py-3.5 text-center text-[0.8125rem] font-medium leading-snug text-ink sm:text-sm", eliteCol)}>{cell(elite)}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
          <p className="t-small flex items-start gap-2.5 border-t border-line/10 bg-surface px-4 py-4 text-ink-2 sm:px-6">
            <Check size={16} aria-hidden="true" className="mt-1 shrink-0 text-green-600" />
            {t("compare.both")}
          </p>
        </div>
        {aside && <div className="space-y-5 lg:col-span-4">{aside}</div>}
      </div>
    </section>
  );
}
