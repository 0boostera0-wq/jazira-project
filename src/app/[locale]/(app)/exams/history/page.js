import { Plus } from "lucide-react";
import { setRequestLocale, getT } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import { buildMetadata } from "@/lib/seo";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import Button from "@/components/ui/Button";
import Illustration from "@/components/ui/Illustration";
import { ArtPreload } from "@/components/stages/HeroArt";
import HistoryView from "@/components/exams/HistoryView";

const ART_SIZES = "(min-width: 1280px) 440px, 38vw";

export async function generateMetadata(props) {
  const params = await props.params;
  return buildMetadata({ locale: params.locale, key: "examHistory", path: "/exams/history", noindex: true });
}

// Attempt history + analytics (signed in). The header is server-rendered; the
// stats and the attempt list load independently in one client island.
export default async function ExamHistoryPage(props) {
  const params = await props.params;
  setRequestLocale(params.locale);
  const [t, tc, tn] = await Promise.all([getT("exams"), getT("common"), getT("nav")]);
  return (
    <>
      <header className="animate-in">
        <Breadcrumbs label={tc("a11y.breadcrumb")} items={[{ label: tn("items.exams"), href: "/exams" }, { label: tn("items.examHistory") }]} />
        <div className="surface mt-6 grid overflow-hidden sm:mt-8 md:grid-cols-12">
          <div className="min-w-0 p-5 sm:p-7 md:col-span-7 xl:p-8">
            <p className="t-eyebrow">{t("history.eyebrow")}</p>
            <h1 className="t-h1 mt-2">{t("history.title")}</h1>
            <p className="t-lead mt-2.5 max-w-2xl">{t("history.lead")}</p>
            <Button href="/exams" size="lg" iconStart={Plus} className="mt-6">{t("history.newExam")}</Button>
          </div>
          {/* The observatory painting, full-bleed from md (preloaded there only); phones go straight to the stats. */}
          <div aria-hidden="true" className="relative hidden md:col-span-5 md:block md:min-h-[15rem]">
            <ArtPreload id="exams.history" from="md" sizes={ART_SIZES} />
            <Illustration id="exams.history" fill sizes={ART_SIZES} />
          </div>
        </div>
      </header>
      <Messages ns={["exams"]}>
        <HistoryView />
      </Messages>
    </>
  );
}
