import { setRequestLocale } from "@/i18n/server";
import { buildMetadata } from "@/lib/seo";
import CompetitionsView from "@/components/achievements/CompetitionsView";

export async function generateMetadata({ params }) {
  return buildMetadata({ locale: params.locale, key: "competitions", path: "/competitions" });
}

export default function CompetitionsPage({ params }) {
  setRequestLocale(params.locale);
  return <CompetitionsView />;
}
