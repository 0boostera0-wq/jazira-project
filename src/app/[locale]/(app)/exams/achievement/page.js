import { setRequestLocale } from "@/i18n/server";
import { buildMetadata } from "@/lib/seo";
import ExamSectionPage from "@/components/exams/ExamSectionPage";

export async function generateMetadata({ params }) {
  return buildMetadata({ locale: params.locale, key: "achievement", path: "/exams/achievement" });
}

// Builder deep links: ?section=&topic=&difficulty=&count= (see components/exams/builder-logic.js)
export default function AchievementPage({ params }) {
  setRequestLocale(params.locale);
  return <ExamSectionPage exam="achievement" locale={params.locale} />;
}
