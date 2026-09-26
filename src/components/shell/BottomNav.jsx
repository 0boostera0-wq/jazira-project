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

// Sections that belong to a tab without living under its href, so the tab
// still shows "you are here" (stage pages → Learn, tags/profiles → Community).
const TAB_ALSO = {
  learn: ["/elementary", "/middle", "/high-school"],
  community: ["/tags", "/u", "/competitions", "/achievements"],
};

/**
 * Mobile/tablet tab bar (< lg) with a "more" sheet holding the full navigation.
 * `data-bottomnav` lets globals.css reserve scroll-padding so keyboard focus is
 * never hidden behind the bar. Tabs prefetch on intent, not on paint.
 */
export default function BottomNav() {
  const t = useT("nav");
  const tc = useT("common");
  const pathname = usePathname();
  const { isSignedIn } = useAuthUser();
  const [more, setMore] = useState(false);
  const tabActive = Object.fromEntries(
    BOTTOM_TABS.filter((tab) => tab.href).map((tab) => {
      const href = !isSignedIn && tab.guestHref ? tab.guestHref : tab.href;
      return [tab.key, isActive(pathname, href, href === "/", TAB_ALSO[tab.key])];
    })
  );
  const anyTabActive = Object.values(tabActive).some(Boolean);

  return (
    <>
      <nav
        aria-label={tc("a11y.mainNav")}
        data-bottomnav=""
        className="glass-chrome fixed inset-x-0 bottom-0 z-30 border-t border-line/10 pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="mx-auto grid h-bottomnav max-w-lg grid-cols-5">
          {BOTTOM_TABS.map((tab) => {
            const Icon = NAV_ICONS[tab.icon];
            const href = !isSignedIn && tab.guestHref ? tab.guestHref : tab.href;
            // "More" is current when the page lives only in the full navigation (settings, assistant, help…)
            const active = href ? tabActive[tab.key] : more || !anyTabActive;
            const inner = (
              <>
                <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors", active && "bg-gold-100/80")}>
                  <Icon size={20} aria-hidden="true" className={active ? "text-gold-700" : "text-ink-3"} />
                </span>
                <span className={cn("text-xs leading-none", active ? "font-medium text-ink" : "text-ink-3")}>{t(`tabs.${tab.key}`)}</span>
              </>
            );
            const cls = "flex h-full flex-col items-center justify-center gap-1";
            return (
              <li key={tab.key}>
                {href ? (
                  <Link href={href} prefetch="intent" aria-current={active ? "page" : undefined} className={cls}>{inner}</Link>
                ) : (
                  <button type="button" onClick={() => setMore(true)} aria-expanded={more} aria-current={!anyTabActive ? "true" : undefined} className={cn(cls, "w-full")}>{inner}</button>
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
