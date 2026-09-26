"use client";

import { useT } from "@/i18n/client";
import Skeleton from "@/components/ui/Skeleton";
import { useProgress } from "./ProgressProvider";

/** One-line status under the Badges heading (unlocked count, or the guest pitch). */
export default function BadgesLead() {
  const t = useT("achievements");
  const p = useProgress();
  const { unlocked, total } = p.badges;

  if (p.status === "loading") return <Skeleton className="mt-3 h-4 w-72 max-w-full" />;
  if (p.status === "unavailable") return null; // the hero already explains the failure
  const text =
    p.status === "ready"
      ? t("badges.lead", { unlocked, total })
      : t("badges.leadGuest", { count: total });
  return <p className="t-body mt-2 text-ink-3">{text}</p>;
}
