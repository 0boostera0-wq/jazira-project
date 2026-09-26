"use client";

import { useCallback, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useT } from "@/i18n/client";
import { useAuthUser } from "@/context/AuthProvider";
import IslandMark from "@/components/brand/IslandMark";
import { SearchDialog, SearchField, SearchIconButton, useSearchShortcut } from "./SearchTrigger";
import NotificationBell from "./NotificationBell";
import AccountMenu from "./AccountMenu";
import LanguageSwitch from "./LanguageSwitch";
import ThemeToggle from "./ThemeToggle";

/**
 * Sticky app top bar. Desktop: search field + actions. Mobile: mark + icons.
 * Owns the command palette: one dialog + one Ctrl/⌘ K listener, opened by
 * either trigger (both stay mounted; CSS shows one per breakpoint).
 */
export default function AppTopbar() {
  const tc = useT("common");
  const { isSignedIn } = useAuthUser();
  const [searchOpen, setSearchOpen] = useState(false);
  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  useSearchShortcut(setSearchOpen);

  return (
    <header className="glass-chrome sticky top-0 z-20 border-b border-line/10">
      <div className="flex h-topbar items-center gap-3 px-[var(--gutter)]">
        <Link href={isSignedIn ? "/dashboard" : "/"} className="-ms-1.5 grid h-11 w-11 shrink-0 place-items-center rounded-md lg:hidden" aria-label={tc("brand.full")}>
          <IslandMark size={34} />
        </Link>

        <div className="hidden min-w-0 flex-1 md:block">
          <SearchField onOpen={openSearch} className="max-w-md" />
        </div>
        <div className="flex-1 md:hidden" />

        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          <SearchIconButton onOpen={openSearch} className="md:hidden" />
          <LanguageSwitch />
          <ThemeToggle className="hidden sm:grid" />
          <NotificationBell />
          <div className="ms-1.5">
            <AccountMenu compact />
          </div>
        </div>
      </div>
      <SearchDialog open={searchOpen} onClose={closeSearch} />
    </header>
  );
}
