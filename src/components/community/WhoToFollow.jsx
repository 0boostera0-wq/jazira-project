"use client";

import { useEffect, useState } from "react";
import { Sprout } from "lucide-react";
import { useT } from "@/i18n/client";
import { Link } from "@/i18n/navigation";
import Skeleton from "@/components/ui/Skeleton";
import EliteBadge from "@/components/subscriptions/EliteBadge";
import { levelFor } from "@/components/achievements/progress";
import { cn } from "@/components/ui/cn";
import AuthorAvatar from "./AuthorAvatar";
import FollowButton from "./FollowButton";
import { useViewer } from "./useViewer";
import { useApi } from "./context";
import { useMediaQuery } from "./useMediaQuery";
import { textProps } from "./text";

/**
 * "Active learners" — real members ranked by the XP they earned, excluding
 * you, people you already follow, blocked members and anyone who posts
 * anonymously. `variant="strip"` is the horizontal phone version shown
 * inside the feed. `exclude` drops one member (the profile being viewed).
 * `gate` = a media query: where CSS hides this copy (the rail below lg, the
 * strip above it) it neither mounts its list nor fetches — it keeps showing
 * its skeleton (card) or nothing (strip) until the query matches.
 */
export default function WhoToFollow({ source, viewer: viewerOverride, variant = "card", limit = 4, exclude = null, gate = null, className }) {
  const t = useT("community");
  const api = useApi(source);
  const viewer = useViewer(viewerOverride);
  const [state, setState] = useState({ status: "loading", items: [] });
  const gateMatches = useMediaQuery(gate || "all");
  const enabled = !gate || gateMatches;

  useEffect(() => {
    if (!viewer.isLoaded || !enabled) return;
    let alive = true;
    api.getSuggestedPeople({ limit: exclude ? limit + 1 : limit })
      .then((res) => alive && setState({
        status: res.available ? "ready" : "unavailable",
        items: (res.items || []).filter((p) => p.id !== exclude).slice(0, limit),
      }))
      .catch(() => alive && setState({ status: "unavailable", items: [] }));
    return () => { alive = false; };
  }, [api, limit, exclude, viewer.isLoaded, viewer.userId, enabled]);

  const strip = variant === "strip";
  if (strip && (state.status !== "ready" || !state.items.length)) return null;

  // Plural-aware (Arabic: نقطة / نقطتان / نقاط): pass the number, the translator formats it.
  const meta = (p) => `${t("rail.people.level", { level: levelFor(p.xp).level })} · ${t("rail.people.xp", { count: Number(p.xp) || 0 })}`;

  if (strip) {
    return (
      <section aria-labelledby="wtf-strip" className={cn("surface-tint py-4", className)}>
        <h2 id="wtf-strip" className="t-h4 px-4">{t("rail.people.title")}</h2>
        <p className="t-caption px-4">{t("rail.people.subtitle")}</p>
        <ul className="mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: "none" }}>
          {state.items.map((p) => (
            <li key={p.id} className="surface-flat flex w-40 shrink-0 snap-start flex-col items-center p-3.5 text-center">
              <Link href={`/u/${encodeURIComponent(p.username)}`} className="flex flex-col items-center rounded-md">
                <AuthorAvatar author={p} size={48} />
                <span className="mt-2 flex max-w-full items-center gap-1 text-sm font-medium text-ink">
                  <span {...textProps(p.name, "truncate")}>{p.name}</span>
                  {p.elite && <EliteBadge size="xs" iconOnly />}
                </span>
              </Link>
              <span className="t-caption mt-0.5 truncate">{meta(p)}</span>
              <FollowButton targetId={p.id} name={p.name} source={api} viewer={viewer} className="mt-3 w-full" />
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section aria-labelledby="wtf-title" className={cn("surface p-5", className)}>
      <h2 id="wtf-title" className="t-h4">{t("rail.people.title")}</h2>
      <p className="t-caption mt-0.5">{t("rail.people.subtitle")}</p>
      {state.status === "loading" ? (
        <ul className="mt-4 space-y-3.5" aria-hidden="true">
          {Array.from({ length: limit }, (_, i) => (
            <li key={i} className="flex items-center gap-3">
              <Skeleton rounded="full" className="h-10 w-10 shrink-0" />
              <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-28" /><Skeleton className="h-3 w-20" /></div>
              <Skeleton rounded="full" className="h-9 w-20" />
            </li>
          ))}
        </ul>
      ) : state.items.length ? (
        <ul className="mt-4 space-y-3.5">
          {state.items.map((p) => (
            <li key={p.id} className="flex items-center gap-3">
              <Link href={`/u/${encodeURIComponent(p.username)}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-md">
                <AuthorAvatar author={p} size={40} />
                <span className="min-w-0">
                  <span className="flex items-center gap-1 text-sm font-medium text-ink">
                    <span {...textProps(p.name, "truncate")}>{p.name}</span>
                    {p.elite && <EliteBadge size="xs" iconOnly />}
                  </span>
                  <span className="t-caption block truncate">{meta(p)}</span>
                </span>
              </Link>
              <FollowButton targetId={p.id} name={p.name} source={api} viewer={viewer} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 flex items-start gap-3 rounded-md bg-surface-2 p-3.5">
          <Sprout size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-green-600" />
          <p className="t-small text-ink-2">{state.status === "unavailable" ? t("rail.people.unavailable") : t("rail.people.empty")}</p>
        </div>
      )}
    </section>
  );
}
