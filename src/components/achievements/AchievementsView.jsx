import { getT } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import { cn } from "@/components/ui/cn";
import HeroArt from "@/components/stages/HeroArt";
import { PLATE } from "@/components/stages/parts";
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
 * Layout: split hero (7/5, art from lg) · badges (8) + sticky rail (4) from xl
 * (at lg the app sidebar leaves too little width for a third column).
 * md–lg: the rail's two cards sit side by side above the gallery.
 * Phone: hero → streak → badges (tabbed) → related.
 */
export default async function AchievementsView() {
  const t = await getT("achievements");

  return (
    <Messages ns={["achievements"]}>
      <ProgressProvider>
        {/* ── Hero: title + live level/XP/streak summary · summit illustration ── */}
        <section aria-labelledby="achievements-title" className="surface animate-in grid overflow-hidden lg:grid-cols-12">
          <div className="p-5 sm:p-8 lg:col-span-7 xl:p-10">
            <p className="t-eyebrow">{t("page.eyebrow")}</p>
            <h1 id="achievements-title" className="t-h1 mt-2">{t("page.title")}</h1>
            <p className="t-lead mt-3 max-w-2xl">{t("page.lead")}</p>
            <ProgressSummary className="mt-7" />
          </div>
          {/* Art from lg only, so it is preloaded for lg+ screens only (HeroArt). */}
          <div className={cn("relative hidden lg:col-span-5 lg:flex lg:items-center lg:justify-center lg:p-8", PLATE)}>
            <HeroArt id="brand.island-achievement" from="lg" className="w-full max-w-[460px]" />
          </div>
        </section>

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
