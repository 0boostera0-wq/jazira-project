import { History, ListChecks } from "lucide-react";
import { setRequestLocale, getT } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import { buildMetadata } from "@/lib/seo";
import Button from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/Layout";
import { BankFact, BankPremiumNote, BankProvider } from "@/components/exams/BankProvider";
import { localBankSummary } from "@/components/exams/bank.server";
import ExamActivity from "@/components/exams/ExamActivity";
import ExamHero, { Fact } from "@/components/exams/ExamHero";
import ExamTypeCard from "@/components/exams/ExamTypeCard";
import HowItWorks from "@/components/exams/HowItWorks";
import PlanLimits from "@/components/exams/PlanLimits";
import { allSectionCount, allTopicCount } from "@/components/exams/labels";
import { cn } from "@/components/ui/cn";
import { SECTION_GAP } from "@/components/stages/parts";

export async function generateMetadata(props) {
  const params = await props.params;
  return buildMetadata({ locale: params.locale, key: "exams", path: "/exams" });
}

// Exam center hub. Server-rendered; client islands: bank counts (one request,
// cached) and the viewer's activity rail.
export default async function ExamsHubPage(props) {
  const params = await props.params;
  setRequestLocale(params.locale);
  const { locale } = params;
  const [t, tc, local] = await Promise.all([getT("exams"), getT("common"), localBankSummary()]);
  const sections = allSectionCount();
  const topics = allTopicCount();

  return (
    <Messages ns={["exams"]}>
      <BankProvider local={local}>
        <ExamHero
          id="hub-title"
          eyebrow={t("hub.eyebrow")}
          title={t("hub.title")}
          lead={t("hub.lead")}
          illustration="landing.exams"
          factsLabel={t("hub.factsLabel")}
          facts={
            <>
              <BankFact captionKey="factLabels.questions" />
              <Fact value={sections} caption={t("factLabels.sections", { count: sections })} locale={locale} />
              <Fact value={topics} caption={t("factLabels.topics", { count: topics })} locale={locale} />
            </>
          }
          aside={<BankPremiumNote className="t-caption mt-3" />}
          actions={
            <>
              <Button href="#choose" size="lg" iconStart={ListChecks}>{t("hub.primary")}</Button>
              <Button href="/exams/history" variant="secondary" size="lg" iconStart={History}>{t("hub.secondary")}</Button>
            </>
          }
        />

        <section id="choose" aria-labelledby="choose-title" className={cn(SECTION_GAP, "scroll-mt-24")}>
          <SectionHeader id="choose-title" eyebrow={t("hub.choose.eyebrow")} title={t("hub.choose.title")} />
          <div className="mt-7 grid gap-5 xl:grid-cols-2 xl:gap-6">
            {/* One primary per view (the hero's): the cards' CTAs are secondary.
                The first card's art is the phone LCP, so it loads eagerly. */}
            <ExamTypeCard exam="aptitude" t={t} eagerArt />
            <ExamTypeCard exam="achievement" t={t} />
          </div>
        </section>

        {/* The viewer's activity (resume · recent results) comes first on phones and tablets; on wide screens it is the rail beside "how it works". */}
        <div className={cn(SECTION_GAP, "grid gap-8 xl:grid-cols-12 xl:gap-6")}>
          <div className="xl:order-last xl:col-span-4">
            <ExamActivity />
          </div>
          <div className="xl:col-span-8">
            <HowItWorks t={t} />
          </div>
        </div>

        <div className={SECTION_GAP}>
          <PlanLimits t={t} tc={tc} />
        </div>
      </BankProvider>
    </Messages>
  );
}
