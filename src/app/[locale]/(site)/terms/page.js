import LegalDocument from "@/components/legal/LegalDocument";
import { setRequestLocale } from "@/i18n/server";
import { buildMetadata } from "@/lib/seo";

export function generateMetadata({ params }) {
  return buildMetadata({ locale: params.locale, key: "terms", path: "/terms" });
}

export default function TermsPage({ params }) {
  setRequestLocale(params.locale);
  return <LegalDocument doc="terms" locale={params.locale} />;
}
