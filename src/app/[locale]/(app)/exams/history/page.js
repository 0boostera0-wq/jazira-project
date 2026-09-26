import { Plus } from "lucide-react";
import { setRequestLocale, getT } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import { buildMetadata } from "@/lib/seo";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import Button from "@/components/ui/Button";
import PageHero from "@/components/ui/PageHero";
import HistoryView from "@/components/exams/HistoryView";

export async function generateMetadata(props) {
  const params = await props.params;
  return buildMetadata({ locale: params.locale, key: "examHistory", path: "/exams/history", noindex: true });
}

// Attempt history + analytics (signed in). The hero is server-rendered; the
// stats and the attempt list load independently in one client island.
export default async function ExamHistoryPage(props) {
  const params = await props.params;
  setRequestLocale(params.locale);
  const [t, tc, tn] = await Promise.all([getT("exams"), getT("common"), getT("nav")]);
  return (
    <>
      <PageHero
        id="history-title"
        image="exams.history"
        eyebrow={t("history.eyebrow")}
        title={t("history.title")}
        lead={t("history.lead")}
        className="animate-in"
        top={<Breadcrumbs label={tc("a11y.breadcrumb")} items={[{ label: tn("items.exams"), href: "/exams" }, { label: tn("items.examHistory") }]} />}
      >
        <Button href="/exams" size="lg" iconStart={Plus}>{t("history.newExam")}</Button>
      </PageHero>
      <Messages ns={["exams"]}>
        <HistoryView />
      </Messages>
    </>
  );
}
