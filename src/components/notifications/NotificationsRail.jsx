"use client";

import { useEffect, useState } from "react";
import { ArrowRight, AtSign, ClipboardCheck, Heart, MessageCircle, MessagesSquare, Settings2, Sparkles, UserPlus } from "lucide-react";
import { useT } from "@/i18n/client";
import Button from "@/components/ui/Button";
import Illustration from "@/components/ui/Illustration";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import { useNotificationsApi, useNotificationsAuth } from "./NotificationsContext";

const ROWS = [
  { key: "likes", icon: Heart },
  { key: "comments", icon: MessageCircle },
  { key: "follows", icon: UserPlus },
  { key: "mentions", icon: AtSign },
  { key: "messages", icon: MessagesSquare },
  { key: "exam_results", icon: ClipboardCheck },
  { key: "product_updates", icon: Sparkles },
];

/**
 * Supporting rail: which notification types are on for this account (loaded
 * on its own, independent of the list) and where exam results come from.
 */
export default function NotificationsRail({ className }) {
  const t = useT("notifications");
  const auth = useNotificationsAuth();
  const api = useNotificationsApi();
  const [prefs, setPrefs] = useState({ status: "loading", data: null });

  useEffect(() => {
    if (!auth.isLoaded || !auth.isSignedIn) return;
    let alive = true;
    api.getNotificationPreferences(auth.userId)
      .then((data) => alive && setPrefs({ status: data?.available === false ? "unavailable" : "ready", data }))
      .catch(() => alive && setPrefs({ status: "error", data: null }));
    return () => { alive = false; };
  }, [api, auth.isLoaded, auth.isSignedIn, auth.userId]);

  // Signed out: nothing personal to show, only the tip.
  if (auth.isLoaded && !auth.isSignedIn) return <div className={className}><TipCard /></div>;

  // Tablets: the two cards sit side by side under the list; desktop: stacked rail.
  return (
    <div className={cn("grid items-start gap-5 md:grid-cols-2 lg:grid-cols-1", className)}>
      <section aria-labelledby="notif-rail-title" className="surface overflow-hidden">
        <div className="border-b border-line/10 px-5 py-4">
          <h2 id="notif-rail-title" className="t-h4">{t("rail.title")}</h2>
          <p className="t-small mt-0.5 text-ink-3">{t("rail.desc")}</p>
        </div>
        {prefs.status === "loading" ? (
          <div aria-hidden="true" className="space-y-3.5 px-5 py-4">
            {ROWS.map((r) => (
              <div key={r.key} className="flex items-center gap-3">
                <Skeleton rounded="full" className="h-7 w-7" />
                <Skeleton className="h-3.5 flex-1" />
                <Skeleton rounded="full" className="h-5 w-12" />
              </div>
            ))}
          </div>
        ) : prefs.status !== "ready" ? (
          <p className="t-small px-5 py-4 text-ink-3">{t(prefs.status === "error" ? "rail.error" : "rail.unavailable")}</p>
        ) : (
          <ul className="px-5 py-2">
            {ROWS.map((r) => {
              const on = Boolean(prefs.data?.[r.key]);
              return (
                <li key={r.key} className="flex items-center gap-3 py-2">
                  <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full", on ? "bg-gold-50 text-gold-600" : "bg-surface-2 text-ink-4")}>
                    <r.icon size={14} aria-hidden="true" />
                  </span>
                  <span className={cn("t-small min-w-0 flex-1", on ? "text-ink-2" : "text-ink-3")}>{t(`rail.items.${r.key}`)}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", on ? "bg-green-50 text-green-700" : "bg-surface-2 text-ink-3")}>
                    {on ? t("rail.on") : t("rail.off")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <div className="border-t border-line/10 px-5 py-3.5">
          <Button href="/settings?section=notifications" variant="link" size="sm" iconStart={Settings2}>
            {t("rail.manage")}
          </Button>
        </div>
      </section>

      <TipCard />
    </div>
  );
}

function TipCard() {
  const t = useT("notifications");
  return (
    <section aria-labelledby="notif-tip-title" className="surface overflow-hidden">
      <div className="bg-[#F7F0E3] px-6 pt-4 dark:bg-surface-2">
        <Illustration id="achievement.review" className="mx-auto w-full max-w-[230px]" />
      </div>
      <div className="p-5">
        <h2 id="notif-tip-title" className="t-h4">{t("rail.tip.title")}</h2>
        <p className="t-small mt-1 text-ink-3">{t("rail.tip.body")}</p>
        <Button href="/exams" variant="secondary" size="sm" iconEnd={ArrowRight} className="mt-4">
          {t("rail.tip.cta")}
        </Button>
      </div>
    </section>
  );
}
