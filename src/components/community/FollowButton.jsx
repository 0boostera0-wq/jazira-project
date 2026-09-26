"use client";

import { useState } from "react";
import { Bell, BellOff, BellRing, Check, ChevronDown, UserMinus, UserPlus } from "lucide-react";
import { useT } from "@/i18n/client";
import Button, { buttonClasses } from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import { MenuButton } from "./MenuButton";
import { useFollowState, setFollowLocal } from "./followStore";
import { useSignInPrompt } from "./SignInPrompt";
import { useViewer } from "./useViewer";
import { useApi } from "./context";

const PREFS = [
  { id: "all", icon: BellRing },
  { id: "posts", icon: Bell },
  { id: "off", icon: BellOff },
];

/**
 * Follow → becomes "Following ▾" with the notification preference menu
 * (all activity / posts only / off) and unfollow. Hidden for yourself.
 * Guests get the sign-in sheet. `onChange(+1 | -1)` lets a follower counter
 * update optimistically.
 */
export default function FollowButton({ targetId, name, size = "sm", emphasis = false, source, viewer: viewerOverride, onChange, className }) {
  const t = useT("community");
  const api = useApi(source);
  const viewer = useViewer(viewerOverride);
  const [prompt, askSignIn] = useSignInPrompt();
  const { loaded, pref } = useFollowState(api, viewer.isSignedIn ? viewer.userId : null, targetId);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!targetId || (viewer.userId && viewer.userId === targetId)) return null;
  if (!viewer.isLoaded || (viewer.isSignedIn && !loaded)) {
    return <Skeleton rounded="full" className={cn(size === "sm" ? "h-9 w-[5.5rem]" : "h-11 w-28", className)} />;
  }

  const follow = async () => {
    if (!viewer.isSignedIn) return askSignIn();
    setBusy(true);
    setFailed(false);
    setFollowLocal(targetId, "all");
    onChange?.(1);
    const res = await api.followUser(targetId);
    setBusy(false);
    if (!res?.ok) {
      setFollowLocal(targetId, null);
      onChange?.(-1);
      setFailed(true);
    }
  };

  const choose = async (next) => {
    const prev = pref;
    if (next === "unfollow") {
      setFollowLocal(targetId, null);
      onChange?.(-1);
      const res = await api.unfollowUser(targetId);
      if (!res?.ok) { setFollowLocal(targetId, prev); onChange?.(1); setFailed(true); }
      return;
    }
    if (next === prev) return;
    setFollowLocal(targetId, next);
    const res = await api.setFollowPref(targetId, next);
    if (!res?.ok) { setFollowLocal(targetId, prev); setFailed(true); }
  };

  const sz = size === "sm" ? "sm" : "md";
  // A rolled-back follow is explained: visibly where there is room (profile
  // header), to screen readers everywhere.
  const errorNote = failed ? (
    <span role="alert" className={sz === "sm" ? "sr-only" : "t-caption w-full text-danger"}>{t("follow.failed")}</span>
  ) : null;

  if (!pref) {
    return (
      <>
        <Button
          size={sz}
          variant={emphasis ? "primary" : "secondary"}
          iconStart={UserPlus}
          loading={busy}
          aria-pressed="false"
          aria-label={name ? t("follow.followName", { name }) : undefined}
          onClick={follow}
          className={className}
        >
          {t("follow.follow")}
        </Button>
        {errorNote}
        {prompt}
      </>
    );
  }

  const Active = PREFS.find((p) => p.id === pref)?.icon || Bell;
  return (
    <>
      <MenuButton
        label={name ? t("follow.menuName", { name }) : t("follow.menu")}
        className={className}
        triggerClassName={cn(buttonClasses({ variant: "soft", size: sz }), "ps-3.5 pe-3")}
        trigger={
          <>
            <Active size={sz === "sm" ? 15 : 17} aria-hidden="true" />
            <span>{t("follow.following")}</span>
            <ChevronDown size={14} aria-hidden="true" className="opacity-70" />
          </>
        }
        items={[
          ...PREFS.map((p) => ({
            key: p.id,
            icon: p.icon,
            label: t(`follow.prefs.${p.id}`),
            active: pref === p.id,
            end: pref === p.id ? <Check size={15} aria-hidden="true" className="text-green-600" /> : null,
            onSelect: () => choose(p.id),
          })),
          { key: "div", divider: true },
          { key: "unfollow", icon: UserMinus, label: t("follow.unfollow"), tone: "danger", onSelect: () => choose("unfollow") },
        ]}
      >
        <p role="none" className="px-3 pb-1.5 pt-1 text-xs font-medium text-ink-3">{t("follow.prefsTitle")}</p>
      </MenuButton>
      {errorNote}
    </>
  );
}
