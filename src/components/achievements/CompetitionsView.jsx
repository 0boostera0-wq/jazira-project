import { Scale, ShieldCheck, Sigma } from "lucide-react";
import { getT } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import IconTile from "@/components/ui/IconTile";
import LeaderboardProvider from "./LeaderboardProvider";
import StandingCard from "./StandingCard";
import LeaderboardBoard from "./LeaderboardBoard";
import ClimbCard from "./ClimbCard";
import RelatedLinks from "./RelatedLinks";

const RULES = [
  { key: "xp", icon: Sigma },
  { key: "ties", icon: Scale },
  { key: "privacy", icon: ShieldCheck },
];

/**
 * /competitions body. Title, ranking rules and the XP guide render on the
 * server; one client provider loads the public XP board + the viewer's rank.
 * `preview` is only for visual QA of signed-in / populated states.
 *
 * xl+:   main (8) = intro · rules · board   |   rail (4) = standing · climb · related
 * md–lg: intro · [standing | rules] · board · climb · related (full width)
 * phone: intro · standing · board · rules · climb · related
 * The two column wrappers are `display: contents` below xl so their children
 * can be re-ordered in one flow; they only become real columns at xl (at lg
 * the app sidebar leaves too little width for a readable rail).
 */
export default async function CompetitionsView({ preview = null }) {
  const t = await getT("achievements");

  return (
    <Messages ns={["achievements"]}>
      <LeaderboardProvider preview={preview}>
        <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:gap-x-5 md:gap-y-8 xl:grid-cols-12 xl:gap-x-10 xl:gap-y-0">
          {/* ── Main column ── */}
          <div className="contents xl:col-span-8 xl:block xl:min-w-0">
            <header className="animate-in order-1 md:col-span-2 xl:pt-2">
              <p className="t-eyebrow">{t("competitions.eyebrow")}</p>
              <h1 className="t-h1 mt-2">{t("competitions.title")}</h1>
              <p className="t-lead mt-3 max-w-2xl">{t("competitions.lead")}</p>
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
