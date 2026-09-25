"use client";

import { useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { useT } from "@/i18n/client";
import { useAuthUser } from "@/context/AuthProvider";
import { BOTTOM_TABS, isActive } from "@/lib/nav";
import Dialog from "@/components/ui/Dialog";
import { NAV_ICONS } from "./icons";
import NavList from "./NavList";
import LanguageSwitch from "./LanguageSwitch";
import ThemeToggle from "./ThemeToggle";
import { cn } from "@/components/ui/cn";

/** Mobile/tablet tab bar (< lg) with a "more" sheet holding the full navigation. */
export default function BottomNav() {
  const t = useT("nav");
  const tc = useT("common");
  const pathname = usePathname();
  const { isSignedIn } = useAuthUser();
  const [more, setMore] = useState(false);

  return (
    <>
      <nav
        aria-label={tc("a11y.mainNav")}
        className="glass-chrome fixed inset-x-0 bottom-0 z-30 border-t border-line/10 pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="mx-auto grid h-bottomnav max-w-lg grid-cols-5">
          {BOTTOM_TABS.map((tab) => {
            const Icon = NAV_ICONS[tab.icon];
            const href = !isSignedIn && tab.guestHref ? tab.guestHref : tab.href;
            const active = tab.href ? isActive(pathname, href, href === "/") : more;
            const inner = (
              <>
                <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors", active && "bg-gold-100/80")}>
                  <Icon size={20} aria-hidden="true" className={active ? "text-gold-700" : "text-ink-3"} />
                </span>
                <span className={cn("text-[11px] leading-none", active ? "font-medium text-ink" : "text-ink-3")}>{t(`tabs.${tab.key}`)}</span>
              </>
            );
            const cls = "flex h-full flex-col items-center justify-center gap-1";
            return (
              <li key={tab.key}>
                {href ? (
                  <Link href={href} aria-current={active ? "page" : undefined} className={cls}>{inner}</Link>
                ) : (
                  <button type="button" onClick={() => setMore(true)} aria-expanded={more} className={cn(cls, "w-full")}>{inner}</button>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <Dialog open={more} onClose={() => setMore(false)} variant="sheet" title={t("tabs.more")}>
        <NavList dense onNavigate={() => setMore(false)} />
        <div className="mt-2 flex items-center justify-between rounded-md bg-surface-2 px-2 py-1.5">
          <LanguageSwitch variant="text" />
          <ThemeToggle />
        </div>
      </Dialog>
    </>
  );
}
