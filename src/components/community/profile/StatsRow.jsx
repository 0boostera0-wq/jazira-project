"use client";

import { useRef, useState } from "react";
import { useLocale, useT } from "@/i18n/client";
import { formatNumber } from "@/i18n/format";
import { cn } from "@/components/ui/cn";
import { useFollowState } from "../followStore";
import { useViewer } from "../useViewer";
import FollowListDialog from "./FollowListDialog";
import { useApi } from "../context";

/**
 * Posts · followers · following · XP. Followers/following open the lists.
 * The follower count follows your own follow/unfollow on this page
 * optimistically (shared follow store), so it never contradicts the button.
 */
export default function StatsRow({ userId, counts, xp, level, source, viewer: viewerOverride }) {
  const t = useT("profile");
  const { locale } = useLocale();
  const api = useApi(source);
  const viewer = useViewer(viewerOverride);
  const { loaded, pref } = useFollowState(api, viewer.isSignedIn ? viewer.userId : null, userId);
  const initial = useRef(undefined);
  const [list, setList] = useState(null);

  if (loaded && initial.current === undefined) initial.current = Boolean(pref);
  const delta = loaded && initial.current !== undefined ? (pref ? 1 : 0) - (initial.current ? 1 : 0) : 0;
  const followers = counts.followers == null ? null : Math.max(0, counts.followers + delta);

  const fmt = (n) => (n == null ? "—" : formatNumber(n, locale));
  const tiles = [
    { key: "posts", value: fmt(counts.posts), label: t("stats.posts") },
    { key: "followers", value: fmt(followers), label: t("stats.followers"), onClick: counts.followers == null ? null : () => setList("followers") },
    { key: "following", value: fmt(counts.following), label: t("stats.following"), onClick: counts.following == null ? null : () => setList("following") },
    { key: "xp", value: fmt(xp), label: t("stats.xp"), hint: t("stats.level", { level }) },
  ];

  return (
    <>
      <ul className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line/10 bg-line/10 sm:grid-cols-4">
        {tiles.map((s) => {
          const body = (
            <>
              <span className="num tabular text-xl font-bold leading-tight text-ink sm:text-2xl">{s.value}</span>
              <span className="t-caption">{s.label}</span>
              {s.hint && <span className="t-caption font-medium text-gold-600">{s.hint}</span>}
            </>
          );
          return s.onClick ? (
            <li key={s.key} className="bg-surface">
              <button
                type="button"
                onClick={s.onClick}
                aria-haspopup="dialog"
                className={cn("flex h-full w-full flex-col items-start px-4 py-3.5 text-start transition-colors duration-fast hover:bg-surface-2")}
              >
                {body}
              </button>
            </li>
          ) : (
            <li key={s.key} className="flex flex-col items-start bg-surface px-4 py-3.5">{body}</li>
          );
        })}
      </ul>
      {list && (
        <FollowListDialog
          userId={userId}
          direction={list}
          title={list === "followers" ? t("follows.followersTitle") : t("follows.followingTitle")}
          source={api}
          viewer={viewer}
          onClose={() => setList(null)}
        />
      )}
    </>
  );
}
