import { HeartHandshake, HelpCircle, Trophy } from "lucide-react";
import { getT } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import PageHero from "@/components/ui/PageHero";
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

/**
 * /community — full-width hero · feed (composer, topic filters, posts) with a
 * rail (guidelines, active learners, popular topics — the last one sticks
 * while you scroll). On phones the rail folds into the feed: a guidelines
 * line under the composer and an "active learners" strip after a few posts.
 */
export default async function CommunityView() {
  const t = await getT("community");
  return (
    <Messages ns={["community"]}>
      <PageHero id="community-title" image="community.hero" eyebrow={t("page.eyebrow")} title={t("page.title")} lead={t("page.lead")} className="animate-in">
        <ul className="hidden flex-wrap gap-x-6 gap-y-2 sm:flex">
          {WAYS.map(({ key, icon: Icon }) => (
            <li key={key} className="t-small flex items-center gap-2 text-ink-2">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-gold-50 text-gold-600 ring-1 ring-inset ring-gold-200/60">
                <Icon size={14} aria-hidden="true" />
              </span>
              {t(`page.ways.${key}`)}
            </li>
          ))}
        </ul>
      </PageHero>

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
