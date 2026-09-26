"use client";

import { useEffect, useMemo, useState } from "react";
import { EyeOff, ShieldOff } from "lucide-react";
import { useT } from "@/i18n/client";
import Tabs from "@/components/ui/Tabs";
import EmptyState from "@/components/ui/EmptyState";
import Feed from "../Feed";
import { useViewer } from "../useViewer";
import { BLOCKS_EVENT } from "./ProfileActions";
import { useApi } from "../context";

/**
 * Posts · reposts · likes. Reposts/likes follow the owner's public social
 * settings (show_reposts_on_profile / show_likes_on_profile); the owner always
 * sees all three, with a note on the tabs others can't see.
 */
export default function ProfileTabs({ profile, settings, source, viewer: viewerOverride }) {
  const t = useT("profile");
  const api = useApi(source);
  const viewer = useViewer(viewerOverride);
  const [tab, setTab] = useState("posts");
  const [blocked, setBlocked] = useState(false);
  const isSelf = viewer.isLoaded && viewer.userId === profile.id;

  useEffect(() => {
    if (!viewer.isSignedIn || isSelf) return;
    let alive = true;
    api.getBlockedIds().then((s) => alive && setBlocked(s.has(profile.id))).catch(() => {});
    const on = (e) => { if (e.detail?.userId === profile.id) setBlocked(Boolean(e.detail.blocked)); };
    window.addEventListener(BLOCKS_EVENT, on);
    return () => { alive = false; window.removeEventListener(BLOCKS_EVENT, on); };
  }, [api, viewer.isSignedIn, isSelf, profile.id]);

  const items = useMemo(() => {
    const hiddenReposts = settings?.show_reposts_on_profile === false;
    const hiddenLikes = settings?.show_likes_on_profile === false;
    return [
      { value: "posts", label: t("tabs.posts") },
      (!hiddenReposts || isSelf) && { value: "reposted", label: t("tabs.reposts"), icon: hiddenReposts ? EyeOff : undefined, onlyYou: hiddenReposts },
      (!hiddenLikes || isSelf) && { value: "liked", label: t("tabs.likes"), icon: hiddenLikes ? EyeOff : undefined, onlyYou: hiddenLikes },
    ].filter(Boolean);
  }, [settings, isSelf, t]);

  const current = items.find((i) => i.value === tab) || items[0];

  if (blocked) {
    return (
      <div className="surface">
        <EmptyState icon={ShieldOff} compact title={t("blocked.title")} description={t("blocked.body")} />
      </div>
    );
  }

  return (
    <div>
      <Tabs items={items} value={current.value} onChange={setTab} variant="underline" label={t("tabs.label")} className="mb-4" />
      {current.onlyYou && (
        <p className="t-caption -mt-1 mb-4 flex items-center gap-1.5">
          <EyeOff size={14} aria-hidden="true" />
          {t("tabs.onlyYou")}
        </p>
      )}
      <div role="tabpanel" aria-label={current.label}>
        <Feed
          key={current.value}
          scope={current.value === "posts" ? "author" : current.value}
          userId={profile.id}
          isSelf={isSelf}
          pageSize={10}
          source={source}
          viewer={viewerOverride}
        />
      </div>
    </div>
  );
}
