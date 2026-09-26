import { MailCheck, RefreshCcw, Sparkles } from "lucide-react";
import { getT } from "@/i18n/server";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import IncludedCard from "./IncludedCard";
import { HelpCard } from "./TrustNotes";
import { PAYMENT_PROVIDER } from "./plan";

const NEXT = [
  { key: "nothing", icon: Sparkles },
  { key: "receipt", icon: MailCheck },
  { key: "renewal", icon: RefreshCcw },
];

/**
 * The post-payment page body: the `status` island (activation status card),
 * good-to-know notes, and the plan/help rail. Server component.
 * Must be rendered inside <Messages ns={["subscriptions"]}>.
 */
export default async function SuccessLayout({ status }) {
  const [t, tn, tc] = await Promise.all([getT("subscriptions"), getT("nav"), getT("common")]);

  return (
    <>
      <Breadcrumbs
        className="mb-5 sm:mb-6"
        label={tc("a11y.breadcrumb")}
        items={[{ label: tn("items.subscription"), href: "/subscriptions" }, { label: t("success.breadcrumb") }]}
      />

      <div className="grid gap-x-8 gap-y-5 lg:grid-cols-12 xl:gap-x-10">
        <div className="min-w-0 space-y-5 lg:col-span-7">
          {status}
          <section aria-labelledby="good-to-know" className="surface-tint p-5 sm:p-6">
            <h2 id="good-to-know" className="t-h4">{t("success.next.title")}</h2>
            <ul className="mt-4 grid gap-5 sm:grid-cols-3">
              {NEXT.map(({ key, icon: Icon }) => (
                <li key={key} className="flex items-start gap-3 sm:block">
                  <Icon size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-gold-600" />
                  <div className="min-w-0 sm:mt-2.5">
                    <p className="text-sm font-medium text-ink">{t(`success.next.${key}.title`)}</p>
                    <p className="t-caption mt-0.5">{t(`success.next.${key}.body`, { provider: PAYMENT_PROVIDER })}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="space-y-5 lg:col-span-5">
          <IncludedCard title={t("hero.includes")} art="subscriptions.analytics" />
          <HelpCard as="h2" />
        </aside>
      </div>
    </>
  );
}
