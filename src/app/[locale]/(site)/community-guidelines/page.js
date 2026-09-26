import LegalDocument from "@/components/legal/LegalDocument";
import { setRequestLocale } from "@/i18n/server";
import { buildMetadata } from "@/lib/seo";

export function generateMetadata({ params }) {
  return buildMetadata({ locale: params.locale, key: "communityGuidelines", path: "/community-guidelines" });
}

export default function CommunityGuidelinesPage({ params }) {
  setRequestLocale(params.locale);
  return <LegalDocument doc="communityGuidelines" locale={params.locale} />;
}
