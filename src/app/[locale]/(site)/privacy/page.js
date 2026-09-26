import LegalDocument from "@/components/legal/LegalDocument";
import { setRequestLocale } from "@/i18n/server";
import { buildMetadata } from "@/lib/seo";

export function generateMetadata({ params }) {
  return buildMetadata({ locale: params.locale, key: "privacy", path: "/privacy" });
}

export default function PrivacyPage({ params }) {
  setRequestLocale(params.locale);
  return <LegalDocument doc="privacy" locale={params.locale} art="landing.privacy" />;
}
