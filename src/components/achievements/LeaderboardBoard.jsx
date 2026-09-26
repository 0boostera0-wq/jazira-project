"use client";

import { ArrowRight, RotateCcw, UserRound } from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/i18n/format";
import Avatar from "@/components/Avatar";
import EliteBadge from "@/components/subscriptions/EliteBadge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import { BOARD_LIMIT } from "./data";
import { useLeaderboard } from "./LeaderboardProvider";

// Medal chips for the top three (gold · silver-sand · bronze-champagne).
const MEDAL = {
  1: "bg-gradient-to-b from-gold-200 to-gold-300 text-gold-800 ring-gold-400/50",
  2: "bg-surface-3 text-ink-2 ring-line/20",
  3: "bg-gold-100 text-gold-700 ring-gold-200",
};

// User names can be Arabic inside the English UI: give them the Arabic face.
const ARABIC = /[؀-ۿ]/;
const scriptProps = (text) => (ARABIC.test(text || "") ? { lang: "ar", className: "font-ar" } : { className: "" });

function useDisplayName() {
  const t = useT("achievements");
  return (e) => (e.anonymous ? t("competitions.board.anonymous") : e.name || t("competitions.board.unnamed"));
}

function Face({ entry, size }) {
  if (entry.anonymous) {
    return (
      <span style={{ width: size, height: size }} className="grid shrink-0 place-items-center rounded-full bg-surface-2 text-ink-4 ring-1 ring-inset ring-line/15">
        <UserRound size={Math.round(size * 0.5)} aria-hidden="true" />
      </span>
    );
  }
  return <Avatar src={entry.avatar} name={entry.name || ""} size={size} alt="" className={scriptProps(entry.name).className} />;
}

/** Name → profile link when the member is public and has a handle. */
function NameLink({ entry, className, children }) {
  const script = scriptProps(entry.anonymous ? "" : entry.name);
  if (entry.anonymous || !entry.username) return <span className={cn(className, script.className)} lang={script.lang} dir="auto">{children}</span>;
  return (
    <Link href={`/u/${encodeURIComponent(entry.username)}`} className={cn("underline-offset-4 hover:underline", className, script.className)} lang={script.lang} dir="auto">
      {children}
    </Link>
  );
}

function Podium({ top, meId }) {
  const t = useT("achievements");
  const { locale } = useLocale();
  const nameOf = useDisplayName();
  // DOM order 1 · 2 · 3 for assistive tech; visual order 2 · 1 · 3 via CSS order.
  return (
    <ol aria-label={t("competitions.board.podiumLabel")} className="grid grid-cols-3 items-end gap-2.5 sm:gap-4">
      {top.map((e, i) => {
        const first = i === 0;
        const mine = e.id === meId;
        return (
          <li
            key={e.id}
            className={cn(
              "relative flex min-w-0 flex-col items-center rounded-lg border px-2 text-center sm:px-4",
              first ? "border-gold-200/80 bg-gold-50/70 pb-5 pt-7 shadow-sm sm:pb-6 sm:pt-9" : "border-line/15 bg-surface pb-4 pt-5",
              mine && "ring-2 ring-gold-400/60",
              i === 0 ? "order-2" : i === 1 ? "order-1" : "order-3"
            )}
          >
            <span className="relative">
              <Face entry={e} size={first ? 64 : 52} />
              <span
                aria-hidden="true"
                className={cn("absolute inset-x-0 -bottom-1.5 mx-auto grid h-6 w-fit min-w-6 place-items-center rounded-full px-1.5 text-xs font-bold ring-1 ring-inset tabular", MEDAL[e.rank] || MEDAL[3])}
              >
                {formatNumber(e.rank, locale)}
              </span>
            </span>
            <span className="sr-only">{t("competitions.board.rankAria", { rank: e.rank })}</span>
            <NameLink entry={e} className={cn("mt-4 line-clamp-2 w-full break-words font-medium leading-snug", e.anonymous ? "text-ink-3" : "text-ink", first ? "text-[0.9375rem]" : "text-sm")}>
              {nameOf(e)}
            </NameLink>
            <span className="mt-1 flex flex-wrap items-center justify-center gap-1">
              {mine && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-fg">{t("competitions.board.you")}</span>}
              {e.elite && <EliteBadge size="xs" iconOnly />}
            </span>
            <span className={cn("mt-1.5 font-bold text-ink tabular", first ? "text-lg" : "text-base")}>
              <span className="num">{formatNumber(e.xp, locale)}</span> <span className="text-xs font-medium text-ink-3">{t("units.points", { count: e.xp })}</span>
            </span>
            <span className="t-caption">{t("level.short", { level: e.level })}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Row({ entry, mine, rankLabel }) {
  const t = useT("achievements");
  const { locale } = useLocale();
  const nameOf = useDisplayName();
  return (
    <li className={cn("flex min-h-[60px] items-center gap-3 px-3 py-2.5 sm:gap-4 sm:px-5", mine && "bg-gold-50/80")}>
      <span className="w-9 shrink-0 text-center text-sm font-bold text-ink-2 tabular">
        <span className="sr-only">{t("competitions.board.columns.rank")} </span>
        {rankLabel}
      </span>
      <Face entry={entry} size={36} />
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <NameLink entry={entry} className={cn("truncate font-medium", entry.anonymous ? "text-ink-3" : "text-ink")}>{nameOf(entry)}</NameLink>
        {entry.elite && <EliteBadge size="xs" iconOnly />}
        {mine && <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-fg">{t("competitions.board.you")}</span>}
      </span>
      <span className="hidden shrink-0 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-ink-3 sm:inline">{t("level.short", { level: entry.level })}</span>
      {/* The column header names the unit, so rows show the bare figure (keeps the column aligned). */}
      <span className="w-16 shrink-0 text-end font-bold text-ink tabular sm:w-20">
        <span className="num">{formatNumber(entry.xp, locale)}</span>
        <span className="sr-only"> {t("units.points", { count: entry.xp })}</span>
      </span>
    </li>
  );
}

function BoardSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="grid grid-cols-3 items-end gap-2.5 sm:gap-4">
        {[168, 196, 168].map((h, i) => <Skeleton key={i} rounded="lg" style={{ height: h }} />)}
      </div>
      <div className="surface-flat mt-5 divide-y divide-line/10">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3">
            <Skeleton className="h-4 w-6" />
            <Skeleton rounded="full" className="h-9 w-9" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The all-time XP ranking: meta line, top-three podium and the ranked list. */
export default function LeaderboardBoard() {
  const t = useT("achievements");
  const { locale } = useLocale();
  const b = useLeaderboard();

  let body;
  if (b.status === "loading" || !b.authLoaded) {
    body = <BoardSkeleton />;
  } else if (b.status === "unavailable") {
    body = (
      <div className="surface-flat">
        <EmptyState
          compact
          image="system.offline"
          title={t("competitions.board.errorTitle")}
          description={t("competitions.board.errorBody")}
          action={<Button variant="secondary" iconStart={RotateCcw} onClick={b.retry}>{t("states.retry")}</Button>}
        />
      </div>
    );
  } else if (b.entries.length === 0) {
    body = (
      <div className="surface-flat">
        <EmptyState
          compact
          image="support.empty"
          title={t("competitions.board.emptyTitle")}
          description={t("competitions.board.emptyBody")}
          action={<Button href="/exams" variant="secondary" iconEnd={ArrowRight}>{t("competitions.climb.cta")}</Button>}
        />
      </div>
    );
  } else {
    const meId = b.me?.id;
    const podium = b.entries.length >= 3 ? b.entries.slice(0, 3) : null;
    const rest = podium ? b.entries.slice(3) : b.entries;
    const meOutside = b.me && !b.me.inList;
    body = (
      <>
        {podium && <Podium top={podium} meId={meId} />}
        {(rest.length > 0 || meOutside) && (
          <div className={cn("surface-flat overflow-hidden", podium && "mt-5")}>
            <div aria-hidden="true" className="flex items-center gap-3 border-b border-line/10 bg-surface-2/60 px-3 py-2 text-xs font-medium text-ink-3 sm:gap-4 sm:px-5">
              <span className="w-9 text-center">{t("competitions.board.columns.rank")}</span>
              <span className="flex-1 ps-12">{t("competitions.board.columns.student")}</span>
              <span className="w-16 text-end sm:w-20">{t("competitions.board.columns.xp")}</span>
            </div>
            {rest.length > 0 && (
              <ol aria-label={t("competitions.board.listLabel")} className="divide-y divide-line/10">
                {rest.map((e) => <Row key={e.id} entry={e} mine={e.id === meId} rankLabel={formatNumber(e.rank, locale)} />)}
              </ol>
            )}
            {meOutside && (
              <div aria-label={t("competitions.board.yourPlace")} role="group" className="border-t border-dashed border-line/20">
                <ul>
                  <Row
                    mine
                    entry={b.me}
                    rankLabel={typeof b.me.rank === "number" ? formatNumber(b.me.rank, locale) : "–"}
                  />
                </ul>
              </div>
            )}
          </div>
        )}
        {b.entries.length >= BOARD_LIMIT && (
          <p className="t-caption mt-3">{t("competitions.board.limitNote", { count: BOARD_LIMIT })}</p>
        )}
      </>
    );
  }

  return (
    <section aria-labelledby="board-title">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <h2 id="board-title" className="t-h2">{t("competitions.board.title")}</h2>
        {b.status === "ready" && b.entries.length > 0 && (
          <p className="text-sm text-ink-3">
            {t("competitions.board.allTime")}
            <span aria-hidden="true" className="mx-1.5 text-ink-4">·</span>
            {t("competitions.board.ranked", { count: b.total })}
          </p>
        )}
      </div>
      {body}
    </section>
  );
}
