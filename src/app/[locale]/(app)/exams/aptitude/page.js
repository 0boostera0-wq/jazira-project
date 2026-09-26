import { setRequestLocale } from "@/i18n/server";
import { buildMetadata } from "@/lib/seo";
import ExamSectionPage from "@/components/exams/ExamSectionPage";

export async function generateMetadata(props) {
  const params = await props.params;
  return buildMetadata({ locale: params.locale, key: "aptitude", path: "/exams/aptitude" });
}

// Builder deep links: ?section=&topic=&difficulty=&count= (see components/exams/builder-logic.js)
export default async function AptitudePage(props) {
  const params = await props.params;
  setRequestLocale(params.locale);
  return <ExamSectionPage exam="aptitude" locale={params.locale} />;
}
