import LegalDocument from "@/components/legal/LegalDocument";
import { setRequestLocale } from "@/i18n/server";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata(props) {
  const params = await props.params;
  return buildMetadata({ locale: params.locale, key: "communityGuidelines", path: "/community-guidelines" });
}

export default async function CommunityGuidelinesPage(props) {
  const params = await props.params;
  setRequestLocale(params.locale);
  return <LegalDocument doc="communityGuidelines" locale={params.locale} />;
}
