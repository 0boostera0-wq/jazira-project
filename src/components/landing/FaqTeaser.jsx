import { Plus } from "lucide-react";
import { getLocale, getT } from "@/i18n/server";
import { formatPrice } from "@/i18n/format";
import { Container, Section } from "@/components/ui/Layout";
import { AI_FREE_LIMIT, AI_WINDOW_MS, ELITE } from "@/lib/constants";
import { ArrowLink, Intro } from "./parts";

const ITEMS = ["free", "who", "assistant", "elite"];

/** FAQ teaser — intro + links at the start, native <details> accordion (zero JS) at the end. */
export default async function FaqTeaser() {
  const [t, locale] = [await getT("landing"), getLocale()];
  const vars = {
    messages: t("units.messages", { count: AI_FREE_LIMIT }),
    hours: t("units.hours", { count: Math.round(AI_WINDOW_MS / 3_600_000) }),
    price: formatPrice(ELITE.priceSAR, locale).replace(/[‎‏]/g, ""),
  };

  return (
    <Section id="faq" aria-labelledby="faq-title" className="!pt-4 sm:!pt-8">
      {/* phones: intro → questions → links; lg: intro + links in the start column, questions at the end */}
      <Container className="grid gap-y-6 sm:gap-y-8 lg:grid-cols-12 lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:gap-y-5">
        <div className="lg:col-span-4 lg:col-start-1 lg:row-start-1">
          <Intro id="faq-title" eyebrow={t("faq.eyebrow")} title={t("faq.title")} lead={t("faq.lead")} />
        </div>

        <div className="lg:col-span-8 lg:col-start-5 lg:row-span-2 lg:row-start-1">
          <div className="divide-y divide-line/10 rounded-lg border border-line/15 bg-surface shadow-xs">
            {ITEMS.map((k, i) => (
              <details key={k} className="group" open={i === 0}>
                <summary className="flex min-h-[3.75rem] cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-start font-medium text-ink transition-colors hover:text-gold-700 sm:px-6 [&::-webkit-details-marker]:hidden">
                  <span>{t(`faq.items.${k}.q`)}</span>
                  <span
                    aria-hidden="true"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-3 transition-transform duration ease-out group-open:rotate-45"
                  >
                    <Plus size={16} />
                  </span>
                </summary>
                <p className="t-body -mt-1 max-w-[62ch] px-5 pb-5 pe-14 text-ink-3 sm:px-6 sm:pe-16">{t(`faq.items.${k}.a`, vars)}</p>
              </details>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-start lg:col-span-4 lg:col-start-1 lg:row-start-2">
          <ArrowLink href="/faq">{t("faq.all")}</ArrowLink>
          <ArrowLink href="/contact" tone="ink">{t("faq.contact")}</ArrowLink>
        </div>
      </Container>
    </Section>
  );
}
