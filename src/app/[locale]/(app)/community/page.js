import { setRequestLocale } from "@/i18n/server";
import { buildMetadata } from "@/lib/seo";
import CommunityView from "@/components/community/CommunityView";

export async function generateMetadata(props) {
  const params = await props.params;
  return buildMetadata({ locale: params.locale, key: "community", path: "/community" });
}

// Static shell; the feed, suggestions and topics are client islands.
export default async function CommunityPage(props) {
  const params = await props.params;
  setRequestLocale(params.locale);
  return <CommunityView />;
}
