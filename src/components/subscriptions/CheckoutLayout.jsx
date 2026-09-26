import { Crown } from "lucide-react";
import { getLocale, getT } from "@/i18n/server";
import { PageHeader } from "@/components/ui/Layout";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import IconTile from "@/components/ui/IconTile";
import PriceTag from "./PriceTag";
import IncludedCard from "./IncludedCard";
import { TrustNotes } from "./TrustNotes";
import { PLAN, PAYMENT_PROVIDER } from "./plan";

const STEPS = ["pay", "back", "active"];

/**
 * The checkout page body: order summary (with the `pay` island inside it),
 * what happens next, and the included/trust rail. Server component.
 * Must be rendered inside <Messages ns={["subscriptions"]}>.
 */
export default async function CheckoutLayout({ pay }) {
  const locale = getLocale();
  const [t, tn, tc] = await Promise.all([getT("subscriptions"), getT("nav"), getT("common")]);

  return (
    <>
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            label={tc("a11y.breadcrumb")}
            items={[{ label: tn("items.subscription"), href: "/subscriptions" }, { label: t("checkout.breadcrumb") }]}
          />
        }
        title={t("checkout.title")}
        description={t("checkout.lead")}
      />

      <div className="grid gap-x-8 gap-y-5 lg:grid-cols-12 xl:gap-x-10">
        <div className="min-w-0 space-y-5 lg:col-span-7">
          {/* Order summary + pay */}
          <section aria-labelledby="order-summary" className="surface p-5 sm:p-7">
            <h2 id="order-summary" className="t-h4">{t("checkout.summary.title")}</h2>

            <div className="mt-5 flex items-start gap-3.5">
              <IconTile icon={Crown} tone="gold" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">{t("checkout.summary.plan")}</p>
                <p className="t-caption mt-0.5">{t("checkout.summary.period")}</p>
              </div>
              <PriceTag amount={PLAN.priceSAR} locale={locale} size="sm" className="shrink-0 justify-end" />
            </div>

            <div className="divider my-5" />

            <div className="flex items-end justify-between gap-4">
              <p className="font-medium text-ink">{t("checkout.summary.total")}</p>
              <PriceTag amount={PLAN.priceSAR} locale={locale} size="md" per={t("plan.perMonth")} className="justify-end" />
            </div>
            <p className="t-caption mt-2">{t("checkout.summary.taxNote")}</p>

            <div className="mt-6">{pay}</div>
          </section>

          {/* What happens next */}
          <section aria-labelledby="checkout-steps" className="surface-flat p-5 sm:p-7">
            <h2 id="checkout-steps" className="t-h4">{t("checkout.steps.title")}</h2>
            <ol className="mt-5 grid gap-5 sm:grid-cols-3 sm:gap-6">
              {STEPS.map((key, i) => (
                <li key={key} className="flex gap-3 sm:block">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gold-50 text-sm font-bold text-gold-700 ring-1 ring-inset ring-gold-200/70 tabular">
                    {i + 1}
                  </span>
                  <div className="min-w-0 sm:mt-3">
                    <p className="text-sm font-medium text-ink">{t(`checkout.steps.${key}.title`)}</p>
                    <p className="t-caption mt-1">{t(`checkout.steps.${key}.body`, { provider: PAYMENT_PROVIDER })}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-5 lg:col-span-5">
          <IncludedCard title={t("checkout.included.title")} />
          <TrustNotes as="h2" support only={["provider", "cancel"]} />
        </aside>
      </div>
    </>
  );
}
