import LegalDocument from "@/components/legal/LegalDocument";
import { setRequestLocale } from "@/i18n/server";
import { buildMetadata } from "@/lib/seo";

export function generateMetadata({ params }) {
  return buildMetadata({ locale: params.locale, key: "acceptableUse", path: "/acceptable-use" });
}

export default function AcceptableUsePage({ params }) {
  setRequestLocale(params.locale);
  return <LegalDocument doc="acceptableUse" locale={params.locale} />;
}
