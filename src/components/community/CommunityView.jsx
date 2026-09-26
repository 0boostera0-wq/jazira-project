import { HeartHandshake, HelpCircle, Trophy } from "lucide-react";
import { getT } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import Illustration from "@/components/ui/Illustration";
import { ArtPreload } from "@/components/stages/HeroArt";
import Feed from "./Feed";
import GuidelinesCard from "./GuidelinesCard";
import PopularTags from "./PopularTags";
import WhoToFollow from "./WhoToFollow";
import { LG_UP } from "./breakpoints";

const WAYS = [
  { key: "ask", icon: HelpCircle },
  { key: "share", icon: Trophy },
  { key: "help", icon: HeartHandshake },
];

// Header art: 4/12 of the content column from lg, as tall as the intro.
const ART_SIZES = "(min-width: 1280px) 400px, 32vw";

/**
 * /community — split header · feed (composer, topic filters, posts) with a
 * rail (guidelines, active learners, popular topics — the last one sticks
 * while you scroll). On phones the rail folds into the feed: a guidelines
 * line under the composer and an "active learners" strip after a few posts.
 */
export default async function CommunityView() {
  const t = await getT("community");
  return (
    <Messages ns={["community"]}>
      <header className="surface animate-in grid overflow-hidden lg:grid-cols-12">
        <div className="p-5 sm:p-7 lg:col-span-8 xl:p-9">
          <p className="t-eyebrow">{t("page.eyebrow")}</p>
          <h1 className="t-h1 mt-1.5">{t("page.title")}</h1>
          <p className="t-lead mt-2.5 max-w-2xl">{t("page.lead")}</p>
          <ul className="mt-5 hidden flex-wrap gap-x-6 gap-y-2 sm:flex">
            {WAYS.map(({ key, icon: Icon }) => (
              <li key={key} className="t-small flex items-center gap-2 text-ink-2">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-gold-50 text-gold-600 ring-1 ring-inset ring-gold-200/60">
                  <Icon size={14} aria-hidden="true" />
                </span>
                {t(`page.ways.${key}`)}
              </li>
            ))}
          </ul>
        </div>
        <div aria-hidden="true" className="relative hidden lg:col-span-4 lg:block">
          <ArtPreload id="community.hero" from="lg" sizes={ART_SIZES} />
          <Illustration id="community.hero" fill sizes={ART_SIZES} />
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:mt-8 lg:grid-cols-12 lg:gap-8">
        <section aria-label={t("feed.title")} className="min-w-0 lg:col-span-8">
          <Feed scope="all" withComposer withFilters peopleStrip guidelinesNote />
        </section>
        <aside aria-label={t("rail.label")} className="hidden lg:col-span-4 lg:block">
          {/* `gate`: the rail's islands mount and fetch only at lg+, where it is shown. */}
          <div className="space-y-5">
            <GuidelinesCard />
            <WhoToFollow gate={LG_UP} />
          </div>
          <div className="sticky top-[calc(var(--topbar-h)+1.5rem)] mt-5">
            <PopularTags limit={7} gate={LG_UP} />
          </div>
        </aside>
      </div>
    </Messages>
  );
}
