import { Suspense } from "react";
import { ArrowDown, History } from "lucide-react";
import { getT } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import Button from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/Layout";
import { EXAMS } from "@/lib/exams/catalog";
import { cn } from "@/components/ui/cn";
import { SECTION_GAP } from "@/components/stages/parts";
import { BankFact, BankProvider } from "./BankProvider";
import { localBankSummary } from "./bank.server";
import ExamBuilder from "./ExamBuilder";
import ExamHero, { Fact } from "./ExamHero";
import SectionCard from "./SectionCard";
import StrategyTips from "./StrategyTips";
import { BuilderSkeleton } from "./skeletons";
import { topicCount } from "./labels";

const TIPS_ART = { aptitude: "aptitude.timed", achievement: "achievement.review" };

/**
 * /exams/aptitude and /exams/achievement: split hero → builder (client island)
 * beside a sticky strategy rail → what each section covers. Everything but the
 * builder and the live counts is server-rendered.
 */
export default async function ExamSectionPage({ exam, locale }) {
  const [t, tc, tn, local] = await Promise.all([getT("exams"), getT("common"), getT("nav"), localBankSummary()]);
  const def = EXAMS[exam];
  const sections = def.sections.length;
  const topics = topicCount(exam);

  return (
    <Messages ns={["exams", "subscriptions"]}>
      <BankProvider local={local}>
        <ExamHero
          crumbs={[{ label: tn("items.exams"), href: "/exams" }, { label: tn(`items.${exam}`) }]}
          crumbsLabel={tc("a11y.breadcrumb")}
          eyebrow={t(`pages.${exam}.eyebrow`)}
          title={t(`pages.${exam}.title`)}
          lead={t(`pages.${exam}.lead`)}
          illustration={def.illustration}
          factsLabel={t("pages.factsLabel")}
          facts={
            <>
              <Fact value={sections} caption={t(exam === "achievement" ? "factLabels.subjects" : "factLabels.sections", { count: sections })} locale={locale} />
              <BankFact exam={exam} captionKey="factLabels.questions" />
              <Fact value={topics} caption={t("factLabels.topics", { count: topics })} locale={locale} />
            </>
          }
          actions={
            <>
              {/* In-page jump: secondary, so the builder's "Start" is the page's one primary action. */}
              <Button href="#builder" variant="secondary" size="lg" iconEnd={ArrowDown}>{t("pages.build")}</Button>
              <Button href="/exams/history" variant="ghost" size="lg" iconStart={History}>{t("pages.history")}</Button>
            </>
          }
        />

        <div id="builder" className={cn(SECTION_GAP, "grid scroll-mt-24 gap-6 xl:grid-cols-12")}>
          <div className="min-w-0 xl:col-span-8">
            <Suspense fallback={<BuilderSkeleton />}>
              <ExamBuilder exam={exam} />
            </Suspense>
          </div>
          <aside className="xl:col-span-4">
            <div className="xl:sticky xl:top-[calc(var(--topbar-h)+1.5rem)]">
              <StrategyTips title={t(`pages.${exam}.tips.title`)} items={t.raw(`pages.${exam}.tips.items`) || []} illustration={TIPS_ART[exam]} />
            </div>
          </aside>
        </div>

        <section aria-labelledby="sections-title" className={SECTION_GAP}>
          <SectionHeader
            id="sections-title"
            eyebrow={t(`pages.${exam}.sections.eyebrow`)}
            title={t(`pages.${exam}.sections.title`)}
            description={t(`pages.${exam}.sections.lead`)}
          />
          <div className="mt-7 grid gap-5 md:grid-cols-2 lg:gap-6">
            {def.sections.map((s) => (
              <SectionCard key={s} exam={exam} section={s} t={t} />
            ))}
          </div>
        </section>
      </BankProvider>
    </Messages>
  );
}
