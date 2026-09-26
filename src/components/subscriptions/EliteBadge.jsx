"use client";

import { Crown } from "lucide-react";
import { useT } from "@/i18n/client";
import { cn } from "@/components/ui/cn";

const SIZES = {
  xs: { box: "h-5 gap-0.5 px-1.5 text-[0.6875rem]", icon: 11, only: "h-5 w-5" },
  sm: { box: "h-6 gap-1 px-2 text-xs", icon: 12, only: "h-6 w-6" },
  md: { box: "h-7 gap-1.5 px-2.5 text-[0.8125rem]", icon: 14, only: "h-7 w-7" },
};

/**
 * The Elite membership badge — shown next to a member's name (community,
 * leaderboard, profile, account menu). Render it ONLY for verified members
 * (profiles.is_elite, set by the payment webhook) who haven't hidden it
 * (show_elite_badge !== false).
 *
 *   <EliteBadge />                 → crown + "النخبة" / "Elite"
 *   <EliteBadge size="xs" iconOnly /> → crown only (dense lists), labelled for AT
 *
 * Strings come from the always-loaded `common` + `nav` namespaces, so it works
 * anywhere without wrapping in <Messages>.
 */
export default function EliteBadge({ size = "sm", iconOnly = false, label, className }) {
  const tc = useT("common");
  const tn = useT("nav");
  const s = SIZES[size] || SIZES.sm;
  const text = label || tc("premium.badge");
  const title = tn("account.eliteMember");

  return (
    <span
      title={title}
      aria-label={iconOnly ? title : undefined}
      role={iconOnly ? "img" : undefined}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-full font-medium",
        "border border-gold-300/60 bg-gradient-to-b from-gold-100 to-gold-200/80 text-gold-800",
        iconOnly ? s.only : s.box,
        className
      )}
    >
      <Crown size={s.icon} aria-hidden="true" className="shrink-0" />
      {!iconOnly && <span className="leading-none">{text}</span>}
    </span>
  );
}
