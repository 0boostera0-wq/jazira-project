"use client";

import { ArrowRight, EyeOff, Gauge, Hash, LogIn, Medal, RotateCcw, TrendingUp, Trophy } from "lucide-react";
import { useT } from "@/i18n/client";
import { Link } from "@/i18n/navigation";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import LevelMeter from "./LevelMeter";
import { useLeaderboard } from "./LeaderboardProvider";

const GUEST_POINTS = [
  { key: "rank", icon: Hash },
  { key: "xp", icon: Gauge },
  { key: "gap", icon: TrendingUp },
];

function Frame({ className, children }) {
  return (
    <section aria-labelledby="standing-title" className={cn("surface p-5 sm:p-6", className)}>
      {children}
    </section>
  );
}

/** "Your standing": rank, XP/level and the gap to the next place — or a sign-in prompt. */
export default function StandingCard({ className }) {
  const t = useT("achievements");
  const b = useLeaderboard();
  const title = (
    <h2 id="standing-title" className="flex items-center gap-2 t-h4">
      <Medal size={18} aria-hidden="true" className="text-gold-600" />
      {t("competitions.standing.title")}
    </h2>
  );

  if (!b.authLoaded || (b.signedIn && b.status === "loading")) {
    return (
      <Frame className={className}>
        {title}
        <div aria-hidden="true" className="mt-5 space-y-4">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-3.5 w-48" />
          <div className="flex items-center gap-4 pt-2">
            <Skeleton rounded="full" className="h-[76px] w-[76px] shrink-0" />
            <div className="flex-1 space-y-2.5"><Skeleton className="h-7 w-28" /><Skeleton rounded="full" className="h-2 w-full" /></div>
          </div>
        </div>
      </Frame>
    );
  }

  if (!b.signedIn) {
    return (
      <Frame className={cn("border-gold-200/70 bg-gold-50/60", className)}>
        <div className="flex items-center gap-3.5 sm:items-start">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-surface text-gold-600 ring-1 ring-inset ring-gold-200/70">
            <Trophy size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="standing-title" className="t-h4">{t("competitions.standing.guestTitle")}</h2>
            <p className="t-small mt-1 hidden text-ink-3 sm:block">{t("competitions.standing.guestBody")}</p>
          </div>
        </div>
        <ul className="mt-4 hidden space-y-2.5 border-t border-gold-200/60 pt-4 sm:block">
          {GUEST_POINTS.map(({ key, icon: Icon }) => (
            <li key={key} className="flex items-center gap-2.5 text-sm text-ink-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface text-gold-600 ring-1 ring-inset ring-gold-200/70">
                <Icon size={14} aria-hidden="true" />
              </span>
              {t(`competitions.standing.guestPoints.${key}`)}
            </li>
          ))}
        </ul>
        {/* Side by side only on the full-width phone-landscape card; stacked in the md–lg half-column and the xl rail. */}
        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row md:flex-col">
          <Button href="/sign-up?next=/competitions" iconEnd={ArrowRight} block>{t("guest.signUp")}</Button>
          <Button href="/sign-in?next=/competitions" variant="secondary" iconStart={LogIn} block>{t("guest.signIn")}</Button>
        </div>
      </Frame>
    );
  }

  if (b.status === "unavailable" || !b.me) {
    return (
      <Frame className={className}>
        {title}
        <p className="t-small mt-3 text-ink-3">{t("states.unavailableBody")}</p>
        <Button size="sm" variant="secondary" iconStart={RotateCcw} onClick={b.retry} className="mt-4">{t("states.retry")}</Button>
      </Frame>
    );
  }

  const me = b.me;
  const ranked = typeof me.rank === "number";

  return (
    <Frame className={className}>
      {title}
      {ranked ? (
        <div className="mt-4">
          <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="text-[2rem] font-bold leading-tight text-ink tabular">{t("competitions.standing.rank", { rank: me.rank })}</span>
            <span className="text-sm text-ink-3">{t("competitions.standing.of", { count: b.total })}</span>
          </p>
          {(me.rank === 1 || me.nextXp != null) && (
            <p className="t-small mt-1.5 flex items-center gap-1.5 text-ink-2">
              <TrendingUp size={15} aria-hidden="true" className="shrink-0 text-green-600" />
              {me.rank === 1
                ? t("competitions.standing.top")
                : t("competitions.standing.gap", { points: t("units.pointsCount", { count: me.nextXp - me.xp }), rank: me.nextRank ?? me.rank - 1 })}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-3">
          <p className="font-medium text-ink">{t("competitions.standing.notRankedTitle")}</p>
          <p className="t-small mt-1 text-ink-3">{t("competitions.standing.notRankedBody")}</p>
        </div>
      )}

      <LevelMeter compact xp={me.xp} level={me.levelInfo} className="mt-5 border-t border-line/10 pt-5" />

      {me.anonymous && (
        <p className="t-small mt-5 flex items-start gap-2 rounded-md bg-surface-2 p-3 text-ink-2">
          <EyeOff size={16} aria-hidden="true" className="mt-1 shrink-0 text-ink-3" />
          <span>
            {t("competitions.standing.anonymousNote")}{" "}
            <Link href="/settings" className="font-medium text-gold-600 underline-offset-4 hover:underline">{t("competitions.standing.privacyLink")}</Link>
          </span>
        </p>
      )}

      <Button href="/achievements" variant="secondary" size="sm" iconEnd={ArrowRight} className="mt-5">
        {t("competitions.standing.achievementsLink")}
      </Button>
    </Frame>
  );
}
