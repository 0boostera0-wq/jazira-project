import { setRequestLocale } from "@/i18n/server";
import { buildMetadata } from "@/lib/seo";
import CompetitionsView from "@/components/achievements/CompetitionsView";

export async function generateMetadata(props) {
  const params = await props.params;
  return buildMetadata({ locale: params.locale, key: "competitions", path: "/competitions" });
}

export default async function CompetitionsPage(props) {
  const params = await props.params;
  setRequestLocale(params.locale);
  return <CompetitionsView />;
}
