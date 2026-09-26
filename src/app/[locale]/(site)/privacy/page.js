import LegalDocument from "@/components/legal/LegalDocument";
import { setRequestLocale } from "@/i18n/server";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata(props) {
  const params = await props.params;
  return buildMetadata({ locale: params.locale, key: "privacy", path: "/privacy" });
}

export default async function PrivacyPage(props) {
  const params = await props.params;
  setRequestLocale(params.locale);
  return <LegalDocument doc="privacy" locale={params.locale} art="landing.privacy" />;
}
