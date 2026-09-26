import { Suspense } from "react";
import { CalendarDays, Sparkles } from "lucide-react";
import { getT } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import { formatDate } from "@/i18n/format";
import { ProgressBar } from "@/components/ui/Progress";
import Skeleton from "@/components/ui/Skeleton";
import EliteBadge from "@/components/subscriptions/EliteBadge";
import { levelFor } from "@/components/achievements/progress";
import AuthorAvatar from "../AuthorAvatar";
import WhoToFollow from "../WhoToFollow";
import { LG_UP } from "../breakpoints";
import { publicIdentity } from "../model";
import { textProps } from "../text";
import ProfileActions from "./ProfileActions";
import ProfileTabs from "./ProfileTabs";
import StatsRow from "./StatsRow";
import { getProfileCounts } from "./queries";

/**
 * /u/[username] for a member with a public profile.
 * Shell (cover band, identity, actions) renders at once; counts stream in
 * their own Suspense boundary; tabs are a client island with keyset pages.
 * `counts` can be passed in (visual QA fixtures); otherwise they are fetched.
 */
export default async function ProfileView({ profile, settings, locale, counts = null }) {
  const t = await getT("profile");
  const me = publicIdentity(profile);
  const lv = levelFor(profile.xp || 0);

  return (
    <Messages ns={["community", "profile"]}>
      <section aria-labelledby="profile-name" className="surface animate-in overflow-hidden">
        <div aria-hidden="true" className="relative h-24 bg-aura bg-surface-2 sm:h-32">
          <div className="bg-dots absolute inset-0 opacity-70" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-line/10" />
        </div>
        <div className="px-5 pb-5 sm:px-7 sm:pb-7">
          <div className="relative z-10 -mt-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <AuthorAvatar author={me} size={104} className="ring-4 ring-surface" />
            <ProfileActions profile={profile} allowMessages={settings?.allow_messages !== false} />
          </div>

          <div className="mt-4 min-w-0">
            <h1 id="profile-name" className="t-h2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span {...textProps(me.name, "break-words")}>{me.name || profile.username}</span>
              {me.elite && <EliteBadge size="sm" />}
            </h1>
            {profile.username && <p className="t-small text-ink-3"><span dir="ltr">@{profile.username}</span></p>}
            {profile.bio ? (
              // The paragraph keeps the page direction (so it aligns with the name
              // above); the bio itself is isolated with its own direction.
              <p {...textProps(profile.bio, "t-body mt-3 max-w-2xl whitespace-pre-line break-words text-ink-2")} dir={undefined}>
                <bdi>{profile.bio}</bdi>
              </p>
            ) : null}
            <p className="t-caption mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
              {profile.created_at && (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays size={14} aria-hidden="true" />
                  {t("header.memberSince", { date: formatDate(profile.created_at, locale, { month: "long", year: "numeric" }) })}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 text-gold-700">
                <Sparkles size={14} aria-hidden="true" />
                {t("stats.level", { level: lv.level })}
              </span>
            </p>
          </div>

          <Suspense fallback={<StatsSkeleton />}>
            <ProfileStats userId={profile.id} xp={lv.xp} level={lv.level} counts={counts} />
          </Suspense>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:mt-8 lg:grid-cols-12 lg:gap-8">
        <section aria-label={t("tabs.label")} className="min-w-0 lg:col-span-8">
          <ProfileTabs profile={{ id: profile.id, username: profile.username }} settings={settings} />
        </section>
        <aside aria-label={t("rail.label")} className="hidden lg:col-span-4 lg:block">
          <div className="sticky top-[calc(var(--topbar-h)+1.5rem)] space-y-5">
            <section aria-labelledby="lv-title" className="surface p-5">
              <h2 id="lv-title" className="t-h4">{t("level.title")}</h2>
              <div className="mt-3 flex items-baseline justify-between gap-3">
                <p className="text-2xl font-bold text-ink">{t("stats.level", { level: lv.level })}</p>
                <p className="tabular text-sm text-ink-3">{t("level.xp", { count: Number(lv.xp) || 0 })}</p>
              </div>
              <ProgressBar value={lv.pct} className="mt-3" label={t("level.progressLabel", { level: lv.level + 1 })} />
              <p className="t-caption mt-2">{t("level.toNext", { count: Math.max(0, Number(lv.remaining) || 0), level: lv.level + 1 })}</p>
              <p className="t-small mt-4 border-t border-line/10 pt-4 text-ink-3">{t("level.how")}</p>
            </section>
            <WhoToFollow exclude={profile.id} gate={LG_UP} />
          </div>
        </aside>
      </div>
    </Messages>
  );
}

async function ProfileStats({ userId, xp, level, counts }) {
  const c = counts || (await getProfileCounts(userId));
  return <StatsRow userId={userId} counts={c} xp={xp} level={level} />;
}

export function StatsSkeleton() {
  return (
    <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line/10 bg-line/10 sm:grid-cols-4" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="space-y-2 bg-surface px-4 py-3.5">
          <Skeleton className="h-6 w-12" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}
