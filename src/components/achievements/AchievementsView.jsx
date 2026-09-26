import { getT } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import PageHero from "@/components/ui/PageHero";
import ProgressProvider from "./ProgressProvider";
import ProgressSummary from "./ProgressSummary";
import StreakCard from "./StreakCard";
import NextBadges from "./NextBadges";
import BadgeGallery from "./BadgeGallery";
import BadgesLead from "./BadgesLead";
import RelatedLinks from "./RelatedLinks";

/**
 * /achievements body. Static shell (titles, art, catalogue) renders on the
 * server; one client provider loads the member's progress once and feeds the
 * small islands.
 *
 * Layout: full-width hero (PageHero) with the live summary under it · badges (8) + sticky rail (4) from xl
 * (at lg the app sidebar leaves too little width for a third column).
 * md–lg: the rail's two cards sit side by side above the gallery.
 * Phone: hero → streak → badges (tabbed) → related.
 */
export default async function AchievementsView() {
  const t = await getT("achievements");

  return (
    <Messages ns={["achievements"]}>
      <ProgressProvider>
        {/* ── Hero: the hall-of-honour image with the title · live level/XP/streak summary under it ── */}
        <PageHero id="achievements-title" image="community.achievements" eyebrow={t("page.eyebrow")} title={t("page.title")} lead={t("page.lead")} className="animate-in">
          <ProgressSummary />
        </PageHero>

        {/* ── Badges (main) · streak + closest badges (rail; above the gallery below xl) ── */}
        <div className="mt-6 grid gap-6 sm:mt-8 lg:mt-10 xl:grid-cols-12 xl:gap-8">
          <aside className="grid content-start gap-5 md:grid-cols-2 xl:sticky xl:top-[calc(var(--topbar-h)+1.5rem)] xl:col-span-4 xl:col-start-9 xl:row-start-1 xl:grid-cols-1 xl:self-start">
            <StreakCard />
            <NextBadges />
          </aside>
          <section aria-labelledby="badges-title" className="min-w-0 xl:col-span-8 xl:col-start-1 xl:row-start-1">
            <div className="mb-5">
              <h2 id="badges-title" className="t-h2">{t("badges.title")}</h2>
              <BadgesLead />
            </div>
            <BadgeGallery />
            <RelatedLinks layout="grid" items={["competitions", "community"]} className="mt-10" />
          </section>
        </div>
      </ProgressProvider>
    </Messages>
  );
}
