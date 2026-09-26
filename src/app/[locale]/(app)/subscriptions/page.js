import { BadgeCheck, RefreshCcw, ShieldCheck } from "lucide-react";
import { setRequestLocale, getT } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import { buildMetadata } from "@/lib/seo";
import IconTile from "@/components/ui/IconTile";
import PlanCard from "@/components/subscriptions/PlanCard";
import FreePlanCard from "@/components/subscriptions/FreePlanCard";
import FeatureBento from "@/components/subscriptions/FeatureBento";
import PlanComparison from "@/components/subscriptions/PlanComparison";
import BillingFaq from "@/components/subscriptions/BillingFaq";
import ReferralPanel from "@/components/subscriptions/ReferralPanel";
import { PolicyCard, HelpCard } from "@/components/subscriptions/TrustNotes";
import { PAYMENT_PROVIDER } from "@/components/subscriptions/plan";

export async function generateMetadata(props) {
  const params = await props.params;
  return buildMetadata({ locale: params.locale, key: "subscriptions", path: "/subscriptions" });
}

const POINTS = [
  { key: "monthly", icon: RefreshCcw },
  { key: "secure", icon: ShieldCheck },
  { key: "verified", icon: BadgeCheck },
];

// Public pricing page. Static server render; the only client islands are the
// plan card's action (auth-aware) and the invite panel.
export default async function SubscriptionsPage(props) {
  const params = await props.params;
  setRequestLocale(params.locale);
  const t = await getT("subscriptions");

  return (
    <Messages ns={["subscriptions"]}>
      {/* ── Hero: intro + reassurance + Free plan beside the Elite card (card spans both rows on desktop) ── */}
      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-12 lg:grid-rows-[auto_1fr] xl:gap-x-14">
        <header className="animate-in lg:col-span-7 lg:row-start-1 lg:pt-6">
          <p className="t-eyebrow">{t("hero.eyebrow")}</p>
          <h1 className="t-h1 mt-2.5 max-w-[22ch] lg:max-w-none">{t("hero.title")}</h1>
          <p className="t-lead mt-4 max-w-2xl">{t("hero.lead")}</p>
        </header>

        <PlanCard priority className="animate-in lg:col-span-5 lg:col-start-8 lg:row-span-2 lg:row-start-1 lg:self-start" />

        <div className="space-y-8 lg:col-span-7 lg:row-start-2">
          <ul className="grid gap-5 sm:grid-cols-3 lg:max-w-xl lg:grid-cols-1">
            {POINTS.map(({ key, icon }) => (
              <li key={key} className="flex items-start gap-3.5">
                <IconTile icon={icon} tone="gold" size="sm" />
                <div className="min-w-0">
                  <p className="font-medium text-ink">{t(`hero.points.${key}.title`)}</p>
                  <p className="t-small mt-0.5 text-ink-3">{t(`hero.points.${key}.body`, { provider: PAYMENT_PROVIDER })}</p>
                </div>
              </li>
            ))}
          </ul>
          <FreePlanCard />
        </div>
      </div>

      <FeatureBento className="mt-16 sm:mt-20" />

      {/* ── Details: each section carries its own rail (top-aligned with its content) ── */}
      <PlanComparison className="mt-16 sm:mt-20" aside={<ReferralPanel />} />
      <BillingFaq
        className="mt-16 sm:mt-20"
        aside={
          <>
            <PolicyCard />
            <HelpCard />
          </>
        }
      />
    </Messages>
  );
}
