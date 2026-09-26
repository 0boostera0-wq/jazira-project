"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Ban, Check, Flag, Link2, MessageCircle, MoreHorizontal, Pencil, ShieldOff } from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import { localizeHref } from "@/i18n/navigation";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import FollowButton from "../FollowButton";
import { MenuButton } from "../MenuButton";
import { setFollowLocal } from "../followStore";
import { useSignInPrompt } from "../SignInPrompt";
import { useViewer } from "../useViewer";
import { useApi } from "../context";

export const BLOCKS_EVENT = "jz:blocks-changed";

const ConfirmDialog = dynamic(() => import("../dialogs").then((m) => m.ConfirmDialog), { ssr: false });
const ReportDialog = dynamic(() => import("../dialogs").then((m) => m.ReportDialog), { ssr: false });

/**
 * Header actions. Yourself: edit profile (→ /settings) + copy link.
 * Others: follow (with notification prefs) · message (→ /chat?to=<id>, only
 * when they accept messages) · more (copy link, report, block / unblock).
 */
export default function ProfileActions({ profile, allowMessages = true, source, viewer: viewerOverride }) {
  const t = useT("profile");
  const { locale } = useLocale();
  const api = useApi(source);
  const viewer = useViewer(viewerOverride);
  const [prompt, askSignIn] = useSignInPrompt();
  const [blocked, setBlocked] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!viewer.isSignedIn || viewer.userId === profile.id) return;
    let alive = true;
    api.getBlockedIds().then((s) => alive && setBlocked(s.has(profile.id))).catch(() => {});
    return () => { alive = false; };
  }, [api, viewer.isSignedIn, viewer.userId, profile.id]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${localizeHref(`/u/${profile.username}`, locale)}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  if (!viewer.isLoaded) {
    return (
      <div className="flex gap-2" aria-hidden="true">
        <Skeleton rounded="full" className="h-11 w-28" />
        <Skeleton rounded="full" className="h-11 w-11" />
      </div>
    );
  }

  const copiedNote = <span aria-live="polite" className="sr-only">{copied ? t("header.copied") : ""}</span>;

  if (viewer.userId === profile.id) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button href="/settings" variant="secondary" iconStart={Pencil}>{t("header.edit")}</Button>
        <Button variant="ghost" iconStart={copied ? Check : Link2} onClick={copy} aria-label={copied ? t("header.copied") : t("header.copyLink")} className="max-xs:w-11 max-xs:px-0">
          <span className="hidden xs:inline">{copied ? t("header.copied") : t("header.copyLink")}</span>
        </Button>
        {copiedNote}
      </div>
    );
  }

  const changed = (next) => {
    setBlocked(next);
    window.dispatchEvent(new CustomEvent(BLOCKS_EVENT, { detail: { userId: profile.id, blocked: next } }));
  };

  const message = () => {
    if (!viewer.isSignedIn) return askSignIn();
  };
  // Phones: icon-only message button so follow · message · more stay on one row.
  const msgLabel = <span className="hidden xs:inline">{t("header.message")}</span>;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!blocked && <FollowButton targetId={profile.id} name={profile.full_name} size="md" emphasis source={api} viewer={viewer} />}
      {!blocked && (
        allowMessages ? (
          viewer.isSignedIn ? (
            <Button href={`/chat?to=${encodeURIComponent(profile.id)}`} variant="secondary" iconStart={MessageCircle} className="max-xs:w-11 max-xs:px-0" aria-label={t("header.message")}>{msgLabel}</Button>
          ) : (
            <Button variant="secondary" iconStart={MessageCircle} className="max-xs:w-11 max-xs:px-0" onClick={message} aria-label={t("header.message")}>{msgLabel}</Button>
          )
        ) : (
          <Button variant="secondary" iconStart={MessageCircle} className="max-xs:w-11 max-xs:px-0" disabled title={t("header.messagesOff")} aria-label={t("header.message")} aria-describedby={`mo-${profile.id}`}>
            {msgLabel}
            <span id={`mo-${profile.id}`} className="sr-only">{t("header.messagesOff")}</span>
          </Button>
        )
      )}
      <MenuButton
        label={t("header.more")}
        trigger={<MoreHorizontal size={18} aria-hidden="true" />}
        triggerClassName="grid h-11 w-11 place-items-center rounded-full border border-line/20 bg-surface text-ink-2 shadow-xs transition-colors duration-fast hover:bg-surface-2 hover:text-ink"
        items={[
          { key: "copy", icon: Link2, label: t("header.copyLink"), onSelect: copy },
          { key: "report", icon: Flag, label: t("header.report"), onSelect: () => (viewer.isSignedIn ? setDialog("report") : askSignIn()) },
          blocked
            ? { key: "unblock", icon: ShieldOff, label: t("header.unblock"), onSelect: () => setDialog("unblock") }
            : { key: "block", icon: Ban, tone: "danger", label: t("header.block"), onSelect: () => (viewer.isSignedIn ? setDialog("block") : askSignIn()) },
        ]}
      />
      {copiedNote}
      {!allowMessages && !blocked && <p className="t-caption w-full">{t("header.messagesOff")}</p>}

      {dialog === "report" && <ReportDialog api={api} targetType="user" targetId={profile.id} onClose={() => setDialog(null)} />}
      {dialog === "block" && (
        <ConfirmDialog
          title={t("header.blockTitle", { name: profile.full_name || profile.username })}
          body={t("header.blockBody")}
          confirmLabel={t("header.block")}
          onConfirm={async () => { await api.blockUser(profile.id); setFollowLocal(profile.id, null); changed(true); }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "unblock" && (
        <ConfirmDialog
          tone="primary"
          title={t("header.unblockTitle", { name: profile.full_name || profile.username })}
          body={t("header.unblockBody")}
          confirmLabel={t("header.unblock")}
          onConfirm={async () => { await api.unblockUser(profile.id); changed(false); }}
          onClose={() => setDialog(null)}
        />
      )}
      {prompt}
    </div>
  );
}
