import { BadgeCheck, ListOrdered, Sigma } from "lucide-react";
import { getT, setRequestLocale } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import { buildMetadata } from "@/lib/seo";
import ReviewsBoard from "@/components/support/ReviewsBoard";

export async function generateMetadata({ params }) {
  return buildMetadata({ locale: params.locale, key: "reviews", path: "/reviews" });
}

const POLICY = [
  { key: "registered", icon: BadgeCheck },
  { key: "asIs", icon: ListOrdered },
  { key: "average", icon: Sigma },
];

export default async function ReviewsPage({ params }) {
  setRequestLocale(params.locale);
  const t = await getT("support");

  return (
    <>
      <section className="bg-aura">
        <div className="container-jz grid gap-8 pb-8 pt-8 sm:pb-10 sm:pt-12 lg:grid-cols-12 lg:items-end lg:gap-12 lg:pt-14">
          <div className="animate-in lg:col-span-7">
            <p className="t-eyebrow mb-3">{t("reviews.eyebrow")}</p>
            <h1 className="t-h1">{t("reviews.title")}</h1>
            <p className="t-lead mt-4 max-w-[56ch]">{t("reviews.lead")}</p>
          </div>
          <div className="hidden rounded-lg border border-line/15 bg-surface/80 p-5 lg:col-span-5 lg:block">
            <h2 className="text-sm font-medium text-ink">{t("reviews.policy.title")}</h2>
            <ul className="mt-3 space-y-2.5">
              {POLICY.map(({ key, icon: Icon }) => (
                <li key={key} className="flex items-start gap-2.5">
                  <Icon size={16} className="mt-1 shrink-0 text-green-600" aria-hidden="true" />
                  <span className="t-small text-ink-2">{t(`reviews.policy.${key}`)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="pb-16 pt-4 sm:pb-20 lg:pb-24">
        <div className="container-jz">
          <Messages ns={["support"]}>
            <ReviewsBoard />
          </Messages>

          {/* Phones/tablets: the review policy moves below the list. */}
          <div className="mt-10 rounded-lg border border-line/15 bg-surface-2/60 p-5 lg:hidden">
            <h2 className="text-sm font-medium text-ink">{t("reviews.policy.title")}</h2>
            <ul className="mt-3 space-y-2.5">
              {POLICY.map(({ key, icon: Icon }) => (
                <li key={key} className="flex items-start gap-2.5">
                  <Icon size={16} className="mt-1 shrink-0 text-green-600" aria-hidden="true" />
                  <span className="t-small text-ink-2">{t(`reviews.policy.${key}`)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
