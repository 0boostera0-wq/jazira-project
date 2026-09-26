import { Plus } from "lucide-react";
import { setRequestLocale, getT } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import { buildMetadata } from "@/lib/seo";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import Button from "@/components/ui/Button";
import HistoryView from "@/components/exams/HistoryView";

export async function generateMetadata({ params }) {
  return buildMetadata({ locale: params.locale, key: "examHistory", path: "/exams/history", noindex: true });
}

// Attempt history + analytics (signed in). The header is server-rendered; the
// stats and the attempt list load independently in one client island.
export default async function ExamHistoryPage({ params }) {
  setRequestLocale(params.locale);
  const [t, tc, tn] = await Promise.all([getT("exams"), getT("common"), getT("nav")]);
  return (
    <>
      <header className="animate-in">
        <Breadcrumbs label={tc("a11y.breadcrumb")} items={[{ label: tn("items.exams"), href: "/exams" }, { label: tn("items.examHistory") }]} />
        <div className="mt-6 flex flex-col gap-5 sm:mt-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 max-w-2xl">
            <p className="t-eyebrow">{t("history.eyebrow")}</p>
            <h1 className="t-h1 mt-2">{t("history.title")}</h1>
            <p className="t-lead mt-2.5">{t("history.lead")}</p>
          </div>
          <Button href="/exams" size="lg" iconStart={Plus} className="shrink-0 self-start sm:self-auto">{t("history.newExam")}</Button>
        </div>
      </header>
      <Messages ns={["exams"]}>
        <HistoryView />
      </Messages>
    </>
  );
}
