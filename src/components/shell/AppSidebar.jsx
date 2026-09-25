"use client";

import { Crown, Sparkles } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useT } from "@/i18n/client";
import { useAuthUser } from "@/context/AuthProvider";
import Logo from "@/components/brand/Logo";
import Button from "@/components/ui/Button";
import NavList from "./NavList";

/** Persistent desktop navigation (≥ lg). Sits on the inline-start edge (right in RTL). */
export default function AppSidebar() {
  const t = useT("nav");
  const tc = useT("common");
  const { isLoaded, isSignedIn, isElite } = useAuthUser();

  return (
    <aside className="fixed inset-y-0 start-0 z-30 hidden w-sidebar flex-col border-e border-line/10 bg-surface-2/60 lg:flex">
      <div className="flex h-topbar shrink-0 items-center px-5">
        <Link href={isSignedIn ? "/dashboard" : "/"} className="rounded-md">
          <Logo name={tc("brand.full")} size="sm" />
        </Link>
      </div>

      <NavList className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-2" />

      <div className="shrink-0 p-3">
        {isLoaded && isElite ? (
          <div className="flex items-center gap-3 rounded-lg border border-gold-200/70 bg-gold-50 p-3.5">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-b from-gold-200 to-gold-300 text-[#5C431C]">
              <Crown size={17} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{t("account.eliteMember")}</p>
              <Link href="/subscriptions" className="text-xs text-gold-700 hover:underline">{t("items.subscription")}</Link>
            </div>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-lg border border-line/10 bg-surface p-4 shadow-xs">
            <Sparkles size={56} aria-hidden="true" className="absolute -end-3 -top-3 text-gold-100" />
            <p className="relative text-sm font-medium text-ink">{tc("premium.lockedTitle")}</p>
            <p className="relative mt-1 text-xs leading-relaxed text-ink-3">{tc("premium.lockedBody")}</p>
            <Button href="/subscriptions" variant="gold" size="sm" iconStart={Crown} className="relative mt-3 w-full">
              {tc("premium.upgradeCta")}
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
}
