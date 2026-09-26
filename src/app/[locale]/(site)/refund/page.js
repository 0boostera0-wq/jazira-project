import LegalDocument from "@/components/legal/LegalDocument";
import { setRequestLocale } from "@/i18n/server";
import { buildMetadata } from "@/lib/seo";

export function generateMetadata({ params }) {
  return buildMetadata({ locale: params.locale, key: "refund", path: "/refund" });
}

export default function RefundPage({ params }) {
  setRequestLocale(params.locale);
  return <LegalDocument doc="refund" locale={params.locale} />;
}
