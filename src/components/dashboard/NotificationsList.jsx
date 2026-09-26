"use client";

import {
  AtSign, Award, Bell, BellOff, ClipboardCheck, Heart, Mail, Megaphone, MessageSquare, Repeat2, UserPlus,
} from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import { formatPercent, formatRelative } from "@/i18n/format";
import { Link } from "@/i18n/navigation";
import { markNotificationsRead } from "@/lib/data/notifications";
import IconTile from "@/components/ui/IconTile";
import Skeleton from "@/components/ui/Skeleton";
import { useDashboard, useResource } from "./DashboardProvider";
import CardNotice from "./CardNotice";
import { attemptTitle } from "./labels";
import { EXAMS, isolate, notificationHref } from "./model";

const ICONS = {
  like: [Heart, "danger"],
  repost: [Repeat2, "green"],
  comment: [MessageSquare, "info"],
  follow: [UserPlus, "green"],
  mention: [AtSign, "info"],
  message: [Mail, "neutral"],
  message_request: [Mail, "neutral"],
  request_accepted: [Mail, "green"],
  exam_result: [ClipboardCheck, "gold"],
  achievement: [Award, "gold"],
  system: [Megaphone, "neutral"],
};

function useNotificationText() {
  const t = useT("dashboard");
  const { locale } = useLocale();
  return (n) => {
    if (n.type === "exam_result") {
      const d = n.data || {};
      const score = Number(d.score_percent);
      return EXAMS.includes(d.exam) && Number.isFinite(score)
        ? t("notifications.types.exam_result", { exam: attemptTitle(t, d.exam, d.section), score: formatPercent(score / 100, locale) })
        : t("notifications.types.exam_result_plain");
    }
    if (n.type === "achievement" || n.type === "system") return t(`notifications.types.${n.type}`);
    if (!t.has(`notifications.types.${n.type}`)) return t("notifications.types.fallback");
    // A member's name is user content in either script: isolate it so it can't reorder the sentence.
    const name = n.actor && !n.actor.anonymous && n.actor.full_name ? isolate(n.actor.full_name) : t("notifications.someone");
    return t(`notifications.types.${n.type}`, { name });
  };
}

/**
 * The five newest notifications. Opening an unread one marks it read, as on
 * /notifications (the data layer's "jz:notifications-read" event refreshes the bell).
 */
// Fire-and-forget: navigation proceeds either way; a failure only leaves the dot until next load.
const markRead = (id) => {
  markNotificationsRead([id]).catch(() => {});
};

export default function NotificationsList() {
  const t = useT("dashboard");
  const { locale } = useLocale();
  const { now } = useDashboard();
  const r = useResource("notifications");
  const text = useNotificationText();

  if (r.status === "loading") {
    return (
      <ul aria-hidden="true" className="space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <li key={i} className="flex items-start gap-3">
            <Skeleton rounded="sm" className="h-9 w-9 shrink-0" />
            <div className="flex-1 space-y-2 pt-0.5">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </li>
        ))}
      </ul>
    );
  }
  if (r.status !== "ready") return <CardNotice status={r.status} onRetry={r.reload} message={t("notifications.unavailable")} />;

  if (!r.data.length) {
    return (
      <div className="flex items-start gap-3 rounded-md bg-surface-2 p-3.5">
        <IconTile icon={BellOff} tone="neutral" size="sm" />
        <div className="min-w-0">
          <p className="font-medium text-ink">{t("notifications.emptyTitle")}</p>
          <p className="t-caption mt-0.5">{t("notifications.emptyBody")}</p>
        </div>
      </div>
    );
  }

  return (
    <ul className="-my-1">
      {r.data.map((n) => {
        const [Icon, tone] = ICONS[n.type] || [Bell, "neutral"];
        return (
          <li key={n.id}>
            <Link
              href={notificationHref(n)}
              onClick={n.read ? undefined : () => markRead(n.id)}
              className="group -mx-2 flex items-start gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-surface-2/70"
            >
              <span className="relative shrink-0">
                <IconTile icon={Icon} tone={tone} size="sm" />
                {!n.read && (
                  <span aria-hidden="true" className="absolute -end-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-gold-500 ring-2 ring-surface" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className={n.read ? "t-small line-clamp-2 block text-ink-2" : "t-small line-clamp-2 block font-medium text-ink"}>
                  {!n.read && <span className="sr-only">{t("notifications.unread")}: </span>}
                  {text(n)}
                </span>
                {n.created_at && now !== null && (
                  <span className="t-caption mt-0.5 block">{formatRelative(n.created_at, locale, now)}</span>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
