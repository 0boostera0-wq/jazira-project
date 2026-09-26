import { getLocale, getT } from "@/i18n/server";
import Illustration from "@/components/ui/Illustration";
import Badge from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import PerkList from "./PerkList";
import PlanActions from "./PlanActions";
import PriceTag from "./PriceTag";
import { PLAN, elitePerks } from "./plan";

/**
 * The Elite plan card: art, price, the (auth-aware) action right under the
 * price, then what's included. Server component; only <PlanActions> hydrates.
 * Must be rendered inside <Messages ns={["subscriptions"]}>.
 *
 * Phone and desktop rail: one stacked column. Tablet (md → lg), where the card
 * spans the full content width: the art sits beside the purchase block and the
 * perks run in two columns, instead of a stretched banner and a long list.
 */
export default async function PlanCard({ className, priority = false }) {
  const locale = getLocale();
  const [t, tc] = await Promise.all([getT("subscriptions"), getT("common")]);
  const perks = elitePerks(t, tc);

  return (
    <section aria-label={t("hero.cardLabel")} className={cn("surface overflow-hidden", className)}>
      <div className="md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:block">
        <div className="flex justify-center bg-[#F7F0E3] dark:bg-surface-2 px-6 pt-4 sm:pt-5 md:items-center md:py-6 lg:block lg:py-0 lg:pt-5">
          <Illustration
            id="subscriptions.premium"
            priority={priority}
            className="mx-auto w-full max-w-[150px] sm:max-w-[250px] md:max-w-[230px] lg:max-w-[250px]"
          />
        </div>

        <div className="p-5 sm:p-7 md:pb-6 lg:pb-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="t-h3">{t("plan.eliteName")}</h2>
            <Badge tone="gold" size="sm">{t("plan.monthly")}</Badge>
          </div>
          <PriceTag amount={PLAN.priceSAR} locale={locale} per={t("plan.perMonth")} className="mt-3" />
          <p className="t-caption mt-2.5">{t("plan.renewNote")}</p>

          <PlanActions className="mt-5" />
        </div>
      </div>

      <div className="px-5 pb-5 sm:px-7 sm:pb-7 md:border-t md:border-line/10 md:pt-6 lg:border-t-0 lg:pt-0">
        <div className="divider mb-5 md:hidden lg:mt-5 lg:block" />
        <p className="text-sm font-medium text-ink">{t("hero.includes")}</p>
        <PerkList perks={perks} className="mt-3 md:grid md:grid-cols-2 md:gap-x-6 md:gap-y-2.5 md:space-y-0 lg:block lg:space-y-2.5" />
      </div>
    </section>
  );
}
