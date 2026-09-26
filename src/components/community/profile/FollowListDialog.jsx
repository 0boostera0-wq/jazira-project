"use client";

import { useCallback, useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import { Link } from "@/i18n/navigation";
import Dialog from "@/components/ui/Dialog";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import EliteBadge from "@/components/subscriptions/EliteBadge";
import AuthorAvatar from "../AuthorAvatar";
import FollowButton from "../FollowButton";
import { useApi } from "../context";
import { textProps } from "../text";

/** Followers / following of a member (keyset pages of 20). Anonymous members are listed without a link. */
export default function FollowListDialog({ userId, direction, title, source, viewer, onClose }) {
  const t = useT("profile");
  const tc = useT("community");
  const api = useApi(source);
  const [state, setState] = useState({ status: "loading", items: [], cursor: null, more: false });

  const load = useCallback(async (cursor = null) => {
    setState((s) => ({ ...s, more: Boolean(cursor), status: cursor ? s.status : "loading" }));
    try {
      const res = await api.listFollows(userId, direction, { cursor, limit: 20 });
      setState((s) => ({
        status: res.available ? "ready" : "unavailable",
        items: cursor ? [...s.items, ...res.items] : res.items,
        cursor: res.nextCursor,
        more: false,
      }));
    } catch {
      setState((s) => ({ ...s, status: "error", more: false }));
    }
  }, [api, userId, direction]);

  useEffect(() => { load(null); }, [load]);

  return (
    <Dialog open onClose={onClose} title={title} variant="sheet" size="sm">
      {state.status === "loading" ? (
        <ul className="space-y-4" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="flex items-center gap-3">
              <Skeleton rounded="full" className="h-10 w-10" />
              <Skeleton className="h-3.5 w-32" />
            </li>
          ))}
        </ul>
      ) : state.status !== "ready" ? (
        <p className="t-small text-ink-3">{t("follows.unavailable")}</p>
      ) : state.items.length === 0 ? (
        <p className="t-small text-ink-3">{direction === "followers" ? t("follows.emptyFollowers") : t("follows.emptyFollowing")}</p>
      ) : (
        <>
          <ul className="space-y-3.5">
            {state.items.map((p) => (
              <li key={p.key} className="flex items-center gap-3">
                {p.anonymous || !p.username ? (
                  <span className="flex min-w-0 flex-1 items-center gap-3">
                    <AuthorAvatar author={p} size={40} />
                    <span className="truncate text-sm text-ink-2">{p.anonymous ? tc("post.anonymous") : p.name || tc("post.unknown")}</span>
                  </span>
                ) : (
                  <>
                    <Link href={`/u/${encodeURIComponent(p.username)}`} onClick={onClose} className="flex min-w-0 flex-1 items-center gap-3 rounded-md">
                      <AuthorAvatar author={p} size={40} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1 text-sm font-medium text-ink">
                          <span {...textProps(p.name, "truncate")}>{p.name || tc("post.unknown")}</span>
                          {p.elite && <EliteBadge size="xs" iconOnly />}
                        </span>
                        <span className="t-caption block truncate"><span dir="ltr">@{p.username}</span></span>
                      </span>
                    </Link>
                    <FollowButton targetId={p.id} name={p.name} source={api} viewer={viewer} />
                  </>
                )}
              </li>
            ))}
          </ul>
          {state.cursor && (
            <div className="mt-5 flex justify-center">
              <Button variant="secondary" size="sm" loading={state.more} onClick={() => load(state.cursor)}>{tc("feed.loadMore")}</Button>
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}
