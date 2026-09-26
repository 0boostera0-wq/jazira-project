import { Info } from "lucide-react";
import { getT, setRequestLocale } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import { buildMetadata } from "@/lib/seo";
import Illustration from "@/components/ui/Illustration";
import ContactForm from "@/components/support/ContactForm";
import ContactChannels from "@/components/support/ContactChannels";

export async function generateMetadata({ params }) {
  return buildMetadata({ locale: params.locale, key: "contact", path: "/contact" });
}

export default async function ContactPage({ params }) {
  setRequestLocale(params.locale);
  const t = await getT("support");

  return (
    <section className="bg-aura">
      <div className="container-jz grid gap-10 pb-16 pt-8 sm:pb-20 sm:pt-12 lg:grid-cols-12 lg:gap-12 lg:pb-24 lg:pt-14">
        <div className="min-w-0 lg:col-span-7">
          <div className="animate-in">
            <p className="t-eyebrow mb-3">{t("contact.eyebrow")}</p>
            <h1 className="t-h1">{t("contact.title")}</h1>
            <p className="t-lead mt-4 max-w-[58ch]">{t("contact.lead")}</p>
          </div>
          <div className="mt-8">
            <Messages ns={["support"]}>
              <ContactForm />
            </Messages>
          </div>
        </div>

        <aside className="lg:col-span-5">
          <div className="space-y-5 lg:sticky lg:top-24">
            <Illustration id="support.contact" priority plate className="hidden shadow-sm lg:block" />
            <div>
              <h2 className="t-h4">{t("contact.side.title")}</h2>
              <ContactChannels only={["whatsapp", "center", "faq"]} className="mt-3" />
            </div>
            <div className="flex gap-3 rounded-lg border border-line/10 bg-surface-2/80 p-4">
              <Info size={18} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-ink">{t("shared.response.title")}</p>
                <p className="t-small mt-0.5 text-ink-3">{t("shared.response.body")}</p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
