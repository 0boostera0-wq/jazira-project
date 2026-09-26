import { ArrowRight, EyeOff, LifeBuoy, MessageSquareQuote } from "lucide-react";
import { getT, setRequestLocale } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import { buildMetadata } from "@/lib/seo";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import IconTile from "@/components/ui/IconTile";
import { PageHeader } from "@/components/ui/Layout";
import FeedbackForm from "@/components/support/FeedbackForm";

export async function generateMetadata({ params }) {
  return buildMetadata({ locale: params.locale, key: "feedback", path: "/feedback", noindex: true });
}

export default async function FeedbackPage({ params }) {
  setRequestLocale(params.locale);
  const t = await getT("support");

  return (
    <>
      <PageHeader eyebrow={t("feedback.eyebrow")} title={t("feedback.title")} description={t("feedback.lead")} />
      <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="min-w-0 lg:col-span-8">
          <Messages ns={["support"]}>
            <FeedbackForm />
          </Messages>
        </div>

        <aside className="lg:col-span-4">
          <div className="space-y-4 lg:sticky lg:top-[calc(var(--topbar-h)+1.5rem)]">
            <h2 className="t-h4 px-1">{t("feedback.rail.title")}</h2>
            <Card tone="flat" className="flex gap-3.5">
              <IconTile icon={EyeOff} tone="neutral" size="sm" />
              <div>
                <h3 className="text-[0.9375rem] font-medium text-ink">{t("feedback.rail.private.title")}</h3>
                <p className="t-small mt-0.5 text-ink-3">{t("feedback.rail.private.body")}</p>
              </div>
            </Card>
            <Card tone="flat" className="flex gap-3.5">
              <IconTile icon={MessageSquareQuote} size="sm" />
              <div>
                <h3 className="text-[0.9375rem] font-medium text-ink">{t("feedback.rail.public.title")}</h3>
                <p className="t-small mt-0.5 text-ink-3">{t("feedback.rail.public.body")}</p>
                <Button href="/reviews" variant="link" size="sm" iconEnd={ArrowRight} className="mt-2">{t("feedback.rail.public.cta")}</Button>
              </div>
            </Card>
            <Card tone="flat" className="flex gap-3.5">
              <IconTile icon={LifeBuoy} tone="green" size="sm" />
              <div>
                <h3 className="text-[0.9375rem] font-medium text-ink">{t("feedback.rail.urgent.title")}</h3>
                <p className="t-small mt-0.5 text-ink-3">{t("feedback.rail.urgent.body")}</p>
                <Button href="/support" variant="link" size="sm" iconEnd={ArrowRight} className="mt-2">{t("feedback.rail.urgent.cta")}</Button>
              </div>
            </Card>
          </div>
        </aside>
      </div>
    </>
  );
}
