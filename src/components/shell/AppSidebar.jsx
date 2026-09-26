"use client";

import { Crown, LogIn, Sparkles } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { useT } from "@/i18n/client";
import { useAuthUser } from "@/context/AuthProvider";
import Logo from "@/components/brand/Logo";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import NavList from "./NavList";

/**
 * Persistent desktop navigation (≥ lg). Sits on the inline-start edge (right in RTL).
 * A plain <div>: the labelled <nav> inside is the landmark (a second, unlabelled
 * <aside> would collide with the pages' own complementary rails).
 *
 * Footer card, by auth state — never a guess while auth resolves:
 *   loading → skeleton · Elite → membership card · free → quiet upgrade card
 *   (soft button: the page keeps its single primary action) · guest → sign-in.
 */
export default function AppSidebar() {
  const t = useT("nav");
  const tc = useT("common");
  const { isLoaded, isSignedIn, isElite } = useAuthUser();
  const pathname = usePathname();
  const onPlanPages = pathname.startsWith("/subscriptions") || pathname.startsWith("/checkout");

  // The plan pages are the upsell themselves — no footer card there.
  let footer = null;
  if (onPlanPages) {
    // keep null
  } else if (!isLoaded) {
    footer = <Skeleton rounded="lg" className="h-[76px]" />;
  } else if (isElite) {
    footer = (
      <div className="flex items-center gap-3 rounded-lg border border-gold-200/70 bg-gold-50 p-3.5">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-b from-gold-200 to-gold-300 text-[#5C431C]">
          <Crown size={17} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{t("account.eliteMember")}</p>
          <Link href="/subscriptions" prefetch="intent" className="text-xs text-gold-700 hover:underline">{t("items.subscription")}</Link>
        </div>
      </div>
    );
  } else if (!isSignedIn) {
    footer = (
      <div className="rounded-lg border border-line/10 bg-surface p-4 shadow-xs">
        <p className="text-sm text-ink-2">{t("account.guestBody")}</p>
        <Button href="/sign-in" variant="secondary" size="sm" iconStart={LogIn} prefetch="intent" className="mt-3 w-full">
          {tc("actions.signIn")}
        </Button>
      </div>
    );
  } else {
    footer = (
      <div className="relative overflow-hidden rounded-lg border border-line/10 bg-surface p-4 shadow-xs">
        <Sparkles size={56} aria-hidden="true" className="absolute -end-3 -top-3 text-gold-100" />
        <p className="relative text-sm font-medium text-ink">{t("promo.title")}</p>
        <p className="relative mt-1 text-xs leading-relaxed text-ink-3">{t("promo.body")}</p>
        <Button href="/subscriptions" variant="soft" size="sm" iconStart={Crown} prefetch="intent" className="relative mt-3 w-full">
          {tc("premium.upgradeCta")}
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-y-0 start-0 z-30 hidden w-sidebar flex-col border-e border-line/10 bg-surface-2/60 lg:flex">
      <div className="flex h-topbar shrink-0 items-center px-5">
        <Link href={isSignedIn ? "/dashboard" : "/"} className="rounded-md">
          <Logo name={tc("brand.full")} size="sm" />
        </Link>
      </div>

      <NavList className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-2" />

      {footer && <div className="shrink-0 p-3">{footer}</div>}
    </div>
  );
}
