"use client";

import { ArrowUpRight } from "lucide-react";
import { useT } from "@/i18n/client";
import { Link } from "@/i18n/navigation";
import Avatar from "@/components/Avatar";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import EliteBadge from "@/components/subscriptions/EliteBadge";
import { cn } from "@/components/ui/cn";
import { useSettingsAuth } from "./SettingsContext";

/** Who is signed in: photo, name, email, plan — and a link to the public profile. */
export default function AccountSummary({ className }) {
  const t = useT("settings");
  const { isLoaded, isSignedIn, name, email, imageUrl, isElite, username } = useSettingsAuth();

  if (!isLoaded) {
    return (
      <div aria-hidden="true" className={cn("flex items-center gap-3.5", className)}>
        <Skeleton rounded="full" className="h-14 w-14 shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-44" />
        </div>
      </div>
    );
  }
  if (!isSignedIn) return null;

  return (
    <div className={cn("flex items-center gap-3.5", className)}>
      <Avatar src={imageUrl} name={name} size={56} alt="" ring />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate font-medium text-ink">{name || t("summary.noName")}</p>
          {isElite ? <EliteBadge size="xs" /> : <Badge size="sm" tone="outline">{t("summary.free")}</Badge>}
        </div>
        {email && <p className="t-caption truncate"><span className="ltr">{email}</span></p>}
        {username && (
          <Link href={`/u/${encodeURIComponent(username)}`} className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-gold-600 underline-offset-4 hover:underline">
            {t("profile.viewPublic")}
            <ArrowUpRight size={14} aria-hidden="true" className="flip-rtl" />
          </Link>
        )}
      </div>
    </div>
  );
}
