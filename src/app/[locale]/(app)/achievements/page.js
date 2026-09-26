import { setRequestLocale } from "@/i18n/server";
import { buildMetadata } from "@/lib/seo";
import AchievementsView from "@/components/achievements/AchievementsView";

export async function generateMetadata({ params }) {
  return buildMetadata({ locale: params.locale, key: "achievements", path: "/achievements" });
}

export default function AchievementsPage({ params }) {
  setRequestLocale(params.locale);
  return <AchievementsView />;
}
