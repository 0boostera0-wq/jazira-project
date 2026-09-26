import { getT } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import { riyadhToday } from "@/components/achievements/progress";
import DashboardProvider from "./DashboardProvider";
import WelcomeCard from "./WelcomeCard";
import ContinueItems from "./ContinueItems";
import PerformanceBody from "./PerformanceBody";
import RecentAttempts from "./RecentAttempts";
import QuickStart from "./QuickStart";
import PlanCard from "./PlanCard";
import NotificationsList from "./NotificationsList";
import StudyTip from "./StudyTip";
import AssistantCard from "./AssistantCard";
import StickyRail from "./StickyRail";
import Panel, { PanelLink } from "./Panel";
import { tipIndex } from "./model";

/**
 * The signed-in home. Server shell (layout, headings, static tiles, art)
 * paints immediately; each card body is a small client island that shows its
 * own skeleton until ITS request resolves (see DashboardProvider).
 *
 *   xl+   main (8 cols) · sticky rail (4 cols) — from xl, because the app
 *         sidebar takes ~250px at lg and a rail beside it would be cramped
 *   md–lg main, then the rail's cards two-up (plan · tip, notifications · assistant)
 *   phone welcome → continue → performance (or first steps) → recent → quick start → rail
 *
 * Brand-new members (no attempt, no curriculum visit): the continue panel
 * steps aside and the performance slot becomes the first-steps checklist.
 */
export default async function DashboardView() {
  const t = await getT("dashboard");
  const tips = t.raw("tip.items");
  const initialTip = tipIndex(riyadhToday(), Array.isArray(tips) ? tips.length : 1);

  return (
    <Messages ns={["dashboard"]}>
      <DashboardProvider>
        <div className="grid gap-5 lg:gap-6 xl:grid-cols-12 xl:gap-8">
          <div className="min-w-0 space-y-5 lg:space-y-6 xl:col-span-8">
            <WelcomeCard />
            <ContinueItems />
            <PerformanceBody />
            <RecentAttempts title={t("recent.title")} viewAll={t("recent.viewAll")} />
            <QuickStart />
          </div>

          <StickyRail
            aria-label={t("page.rail")}
            className="grid min-w-0 content-start gap-5 md:grid-cols-2 md:items-start lg:gap-6 xl:col-span-4 xl:grid-cols-1"
          >
            <PlanCard />
            <Panel
              id="dash-notifications"
              title={t("notifications.title")}
              action={<PanelLink href="/notifications">{t("notifications.viewAll")}</PanelLink>}
              bodyClassName="mt-3"
              className="md:max-xl:order-1"
            >
              <NotificationsList />
            </Panel>
            <StudyTip initialIndex={initialTip} />
            <AssistantCard className="md:max-xl:order-1" />
          </StickyRail>
        </div>
      </DashboardProvider>
    </Messages>
  );
}
