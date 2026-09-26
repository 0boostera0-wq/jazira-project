"use client";

import { MessageCircle } from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import { formatNumber, formatRelative } from "@/i18n/format";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import { useDashboard, useResource } from "./DashboardProvider";

/** ai_quota() → "Messages available: 3 of 5 · resets in 2 hours". Silent when the quota isn't known. */
export default function AssistantQuota({ className }) {
  const t = useT("dashboard");
  const { locale } = useLocale();
  const { now } = useDashboard();
  const r = useResource("quota");

  if (r.status === "loading") return <Skeleton aria-hidden="true" className={cn("h-8 w-full rounded-md", className)} />;
  const q = r.status === "ready" ? r.data : null;
  if (!q) return null;

  let text;
  if (q.unlimited) {
    text = t("assistant.quotaUnlimited");
  } else {
    const limit = Number(q.limit);
    const left = Number(q.remaining);
    if (!Number.isFinite(limit) || !Number.isFinite(left)) return null;
    text = t("assistant.quota", { left: formatNumber(Math.max(0, left), locale), limit: formatNumber(limit, locale) });
    if (q.resets_at && now !== null && left < limit) {
      text += ` · ${t("assistant.quotaReset", { when: formatRelative(q.resets_at, locale, now) })}`;
    }
  }
  return (
    <p className={cn("flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2 text-[0.8125rem] text-ink-2", className)}>
      <MessageCircle size={15} aria-hidden="true" className="shrink-0 text-gold-600" />
      <span>{text}</span>
    </p>
  );
}
