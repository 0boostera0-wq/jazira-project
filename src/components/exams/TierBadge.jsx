"use client";

import { MapPin } from "lucide-react";
import { useT } from "@/i18n/client";
import Badge from "@/components/ui/Badge";
import { useTier } from "./useTier";

/** "You are here" marker on the plan column matching the viewer's tier. */
export default function TierBadge({ tier }) {
  const t = useT("exams");
  const { tier: current } = useTier();
  if (current !== tier) return null;
  return (
    <Badge tone={tier === "elite" ? "gold" : "green"} size="sm" icon={MapPin} className="animate-fade">
      {t("hub.plans.current")}
    </Badge>
  );
}
