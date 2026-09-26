import { BadgeCheck, ListOrdered, Sigma } from "lucide-react";
import { getT, setRequestLocale } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import { buildMetadata } from "@/lib/seo";
import PageHero from "@/components/ui/PageHero";
import ReviewsBoard from "@/components/support/ReviewsBoard";

export async function generateMetadata(props) {
  const params = await props.params;
  return buildMetadata({ locale: params.locale, key: "reviews", path: "/reviews" });
}

const POLICY = [
  { key: "registered", icon: BadgeCheck },
  { key: "asIs", icon: ListOrdered },
  { key: "average", icon: Sigma },
];

export default async function ReviewsPage(props) {
  const params = await props.params;
  setRequestLocale(params.locale);
  const t = await getT("support");

  return (
    <>
      <PageHero variant="site" id="reviews-title" image="landing.reviews" eyebrow={t("reviews.eyebrow")} title={t("reviews.title")} lead={t("reviews.lead")} className="animate-in pb-8 sm:pb-10">
        {/* The review policy: here on wide screens; phones and tablets read it after the list. */}
        <div className="hidden rounded-lg border border-line/15 bg-surface p-5 shadow-xs lg:block">
          <h2 className="text-sm font-medium text-ink">{t("reviews.policy.title")}</h2>
          <ul className="mt-3 grid gap-x-8 gap-y-2.5 xl:grid-cols-3">
            {POLICY.map(({ key, icon: Icon }) => (
              <li key={key} className="flex items-start gap-2.5">
                <Icon size={16} className="mt-1 shrink-0 text-green-600" aria-hidden="true" />
                <span className="t-small text-ink-2">{t(`reviews.policy.${key}`)}</span>
              </li>
            ))}
          </ul>
        </div>
      </PageHero>

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
