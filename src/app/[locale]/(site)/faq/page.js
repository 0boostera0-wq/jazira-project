import { getT, setRequestLocale } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import { buildMetadata } from "@/lib/seo";
import SupportHero from "@/components/support/SupportHero";
import FaqExplorer from "@/components/support/FaqExplorer";

export async function generateMetadata(props) {
  const params = await props.params;
  return buildMetadata({ locale: params.locale, key: "faq", path: "/faq" });
}

export default async function FaqPage(props) {
  const params = await props.params;
  setRequestLocale(params.locale);
  const t = await getT("support");

  return (
    <>
      <SupportHero compact eyebrow={t("faq.eyebrow")} title={t("faq.title")} lead={t("faq.lead")} art="support.faq" />
      <section className="pb-16 pt-2 sm:pb-20 lg:pb-24">
        <Messages ns={["support"]}>
          <FaqExplorer />
        </Messages>
      </section>
    </>
  );
}
