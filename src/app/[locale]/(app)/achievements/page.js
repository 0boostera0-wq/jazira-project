import { setRequestLocale } from "@/i18n/server";
import { buildMetadata } from "@/lib/seo";
import AchievementsView from "@/components/achievements/AchievementsView";

export async function generateMetadata(props) {
  const params = await props.params;
  return buildMetadata({ locale: params.locale, key: "achievements", path: "/achievements" });
}

export default async function AchievementsPage(props) {
  const params = await props.params;
  setRequestLocale(params.locale);
  return <AchievementsView />;
}
