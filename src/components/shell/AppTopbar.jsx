"use client";

import { Link } from "@/i18n/navigation";
import { useT } from "@/i18n/client";
import { useAuthUser } from "@/context/AuthProvider";
import IslandMark from "@/components/brand/IslandMark";
import SearchTrigger from "./SearchTrigger";
import NotificationBell from "./NotificationBell";
import AccountMenu from "./AccountMenu";
import LanguageSwitch from "./LanguageSwitch";
import ThemeToggle from "./ThemeToggle";

/** Sticky app top bar. Desktop: search field + actions. Mobile: mark + icons. */
export default function AppTopbar() {
  const tc = useT("common");
  const { isSignedIn } = useAuthUser();
  return (
    <header className="glass-chrome sticky top-0 z-20 border-b border-line/10">
      <div className="flex h-topbar items-center gap-3 px-[var(--gutter)]">
        <Link href={isSignedIn ? "/dashboard" : "/"} className="shrink-0 rounded-md lg:hidden" aria-label={tc("brand.full")}>
          <IslandMark size={34} />
        </Link>

        <div className="hidden min-w-0 flex-1 md:block">
          <SearchTrigger variant="field" className="max-w-md" />
        </div>
        <div className="flex-1 md:hidden" />

        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          <SearchTrigger variant="icon" className="md:hidden" />
          <LanguageSwitch />
          <ThemeToggle className="hidden sm:grid" />
          <NotificationBell />
          <div className="ms-1.5">
            <AccountMenu compact />
          </div>
        </div>
      </div>
    </header>
  );
}
