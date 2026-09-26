import { ChevronDown } from "lucide-react";
import { getLocale, getT } from "@/i18n/server";
import { formatPrice } from "@/i18n/format";
import { SectionHeader } from "@/components/ui/Layout";
import { cn } from "@/components/ui/cn";
import { faqJsonLd, jsonLd } from "@/lib/seo";
import { PLAN, PAYMENT_PROVIDER, planVars } from "./plan";

export const FAQ_KEYS = ["price", "methods", "activation", "cancel", "refund", "card", "referral"];

/** Resolved billing FAQ items ({ key, q, a }) — shared by the page and its JSON-LD. */
export async function billingFaqItems() {
  const locale = getLocale();
  const [t, tc] = await Promise.all([getT("subscriptions"), getT("common")]);
  const v = planVars(t, tc);
  const vars = {
    price: formatPrice(PLAN.priceSAR, locale),
    provider: PAYMENT_PROVIDER,
    invites: v.referralInvites,
    total: v.referralTotal,
    hours: v.windowHours,
    free: v.freeMessages,
  };
  return FAQ_KEYS.map((key) => ({ key, q: t(`faq.items.${key}.q`, vars), a: t(`faq.items.${key}.a`, vars) }));
}

/**
 * Billing questions as native <details> disclosures (no JS) + FAQPage JSON-LD.
 * `aside` renders a rail beside the questions on desktop (below on mobile).
 */
export default async function BillingFaq({ className, aside }) {
  const t = await getT("subscriptions");
  const items = await billingFaqItems();

  return (
    <section aria-labelledby="billing-faq" className={className}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqJsonLd(items)) }} />
      <SectionHeader id="billing-faq" eyebrow={t("faq.eyebrow")} title={t("faq.title")} />

      <div className="mt-6 grid gap-x-8 gap-y-5 lg:grid-cols-12 xl:gap-x-10">
        <div className="min-w-0 lg:col-span-8">
          <div className="surface divide-y divide-line/10 overflow-hidden">
            {items.map((it, i) => (
              <details key={it.key} className="group" open={i === 0}>
                <summary
                  className={cn(
                    "flex min-h-[3.5rem] cursor-pointer list-none items-center justify-between gap-4 px-5 py-3.5 sm:px-6",
                    "text-[0.9375rem] font-medium text-ink transition-colors hover:bg-surface-2/50 [&::-webkit-details-marker]:hidden"
                  )}
                >
                  {it.q}
                  <ChevronDown size={18} aria-hidden="true" className="shrink-0 text-ink-3 transition-transform duration group-open:rotate-180" />
                </summary>
                <p className="t-small max-w-prose px-5 pb-5 text-ink-2 sm:px-6">{it.a}</p>
              </details>
            ))}
          </div>
        </div>
        {aside && <div className="space-y-5 lg:col-span-4">{aside}</div>}
      </div>
    </section>
  );
}
