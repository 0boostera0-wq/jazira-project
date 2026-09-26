import { Scale, ShieldCheck, Sigma } from "lucide-react";
import { getT } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import IconTile from "@/components/ui/IconTile";
import Illustration from "@/components/ui/Illustration";
import { ArtPreload } from "@/components/stages/HeroArt";
import LeaderboardProvider from "./LeaderboardProvider";
import StandingCard from "./StandingCard";
import LeaderboardBoard from "./LeaderboardBoard";
import ClimbCard from "./ClimbCard";
import RelatedLinks from "./RelatedLinks";

// Header art: 5/12 of the main column (8/12 of the page from xl).
const ART_SIZES = "(min-width: 1280px) 330px, (min-width: 640px) 40vw, 100vw";

const RULES = [
  { key: "xp", icon: Sigma },
  { key: "ties", icon: Scale },
  { key: "privacy", icon: ShieldCheck },
];

/**
 * /competitions body. Title, ranking rules and the XP guide render on the
 * server; one client provider loads the public XP board + the viewer's rank.
 *
 * The intro is a card with the regatta painting (full-bleed from sm).
 * xl+:   main (8) = intro · rules · board   |   rail (4) = standing · climb · related
 * md–lg: intro · [standing | rules] · board · climb · related (full width)
 * phone: intro · standing · board · rules · climb · related
 * The two column wrappers are `display: contents` below xl so their children
 * can be re-ordered in one flow; they only become real columns at xl (at lg
 * the app sidebar leaves too little width for a readable rail).
 */
export default async function CompetitionsView() {
  const t = await getT("achievements");

  return (
    <Messages ns={["achievements"]}>
      <LeaderboardProvider>
        <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:gap-x-5 md:gap-y-8 xl:grid-cols-12 xl:gap-x-10 xl:gap-y-0">
          {/* ── Main column ── */}
          <div className="contents xl:col-span-8 xl:block xl:min-w-0">
            <header className="surface animate-in order-1 grid overflow-hidden sm:grid-cols-12 md:col-span-2">
              <div className="p-5 sm:col-span-7 sm:p-7 xl:p-8">
                <p className="t-eyebrow">{t("competitions.eyebrow")}</p>
                <h1 className="t-h1 mt-2">{t("competitions.title")}</h1>
                <p className="t-lead mt-3 max-w-2xl">{t("competitions.lead")}</p>
              </div>
              {/* The regatta: full-bleed beside the intro from sm, a banner under it on phones. */}
              <div aria-hidden="true" className="relative aspect-[16/9] sm:col-span-5 sm:aspect-auto sm:min-h-[13rem]">
                <ArtPreload id="community.competitions" from="sm" sizes={ART_SIZES} />
                <Illustration id="community.competitions" fill sizes={ART_SIZES} />
              </div>
            </header>

            <ul className="order-4 grid gap-4 sm:grid-cols-3 md:order-3 md:grid-cols-1 md:gap-5 md:self-start md:py-2 xl:mt-7 xl:grid-cols-3 xl:gap-6 xl:py-0">
              {RULES.map(({ key, icon }) => (
                <li key={key} className="flex items-start gap-3 sm:flex-col md:flex-row xl:flex-col">
                  <IconTile icon={icon} tone="gold" size="sm" />
                  <div className="min-w-0">
                    <p className="text-[0.9375rem] font-medium text-ink">{t(`competitions.rules.${key}.title`)}</p>
                    <p className="t-small mt-0.5 text-ink-3">{t(`competitions.rules.${key}.body`)}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="order-3 min-w-0 md:order-4 md:col-span-2 xl:mt-12">
              <LeaderboardBoard />
            </div>
          </div>

          {/* ── Rail (not sticky: it is taller than a laptop viewport, and a
                 sticky rail that tall would hide its lower cards while the
                 50-row board scrolls) ── */}
          <div className="contents xl:col-span-4 xl:block xl:space-y-5 xl:self-start">
            <StandingCard className="animate-in order-2 md:self-start" />
            <ClimbCard className="order-5 md:col-span-2" />
            <RelatedLinks layout="rail" items={["achievements", "privacy"]} className="order-6 md:col-span-2" />
          </div>
        </div>
      </LeaderboardProvider>
    </Messages>
  );
}
