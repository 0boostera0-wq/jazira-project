"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, LogIn } from "lucide-react";
import { useT } from "@/i18n/client";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import IconTile from "@/components/ui/IconTile";
import Illustration from "@/components/ui/Illustration";
import { cn } from "@/components/ui/cn";
import { DEFAULT_SECTION, sectionFrom } from "./model";
import { SettingsIndex, SettingsRail } from "./SettingsNav";
import { SECTION_GROUPS } from "./sections";
import AccountSummary from "./AccountSummary";
import { useSettingsAuth } from "./SettingsContext";
import { PanelSkeleton } from "./ui";

// One chunk per section: only the open section's code and data load.
const PANELS = {
  profile: dynamic(() => import("./ProfileSection"), { loading: PanelSkeleton }),
  account: dynamic(() => import("./AccountSection"), { loading: PanelSkeleton }),
  preferences: dynamic(() => import("./PreferencesSection"), { loading: PanelSkeleton }),
  notifications: dynamic(() => import("./NotificationsSection"), { loading: PanelSkeleton }),
  privacy: dynamic(() => import("./PrivacySection"), { loading: PanelSkeleton }),
  subscription: dynamic(() => import("./SubscriptionSection"), { loading: PanelSkeleton }),
  danger: dynamic(() => import("./DangerSection"), { loading: PanelSkeleton }),
};
// Warm a section's chunk on hover / focus / touch so switching feels instant.
const PRELOAD = {
  profile: () => import("./ProfileSection"),
  account: () => import("./AccountSection"),
  preferences: () => import("./PreferencesSection"),
  notifications: () => import("./NotificationsSection"),
  privacy: () => import("./PrivacySection"),
  subscription: () => import("./SubscriptionSection"),
  danger: () => import("./DangerSection"),
};
const preload = (id) => { try { PRELOAD[id]?.(); } catch { /* offline */ } };

/**
 * Settings frame.
 *   desktop  split header · sticky section rail (start) · active section (end)
 *   phones   header + account + grouped section list; a section opens full
 *            width with a back link. The open section lives in ?section=…
 *            (history entries, deep links, back button).
 * `header` is the server-rendered title block.
 */
export default function SettingsLayout({ header, initialSection = null }) {
  const t = useT("settings");
  const auth = useSettingsAuth();
  const params = useSearchParams();
  const fromUrl = params ? sectionFrom(params.get("section")) : initialSection;
  const [section, setSection] = useState(fromUrl);
  const headingRef = useRef(null);
  const moved = useRef(false);

  // Back / forward and external links change the URL → follow it.
  useEffect(() => setSection(fromUrl), [fromUrl]);

  const go = useCallback((id) => {
    setSection(id);
    moved.current = true;
    try {
      const url = new URL(window.location.href);
      if (id) url.searchParams.set("section", id);
      else url.searchParams.delete("section");
      window.history.pushState(null, "", url.pathname + url.search + url.hash);
    } catch { /* history unavailable */ }
    window.scrollTo({ top: 0 });
  }, []);

  // After a user-initiated switch, move focus to the section title.
  useEffect(() => {
    if (moved.current && section) headingRef.current?.focus({ preventScroll: true });
    moved.current = false;
  }, [section]);

  const active = section || DEFAULT_SECTION;
  const Panel = PANELS[active];

  return (
    <div>
      {/* Header: title (server) · who's signed in. On phones inside a section it stays for AT only. */}
      <div className={cn("mb-6 flex flex-col gap-5 sm:mb-8 lg:flex-row lg:items-end lg:justify-between lg:gap-10", section && "max-lg:sr-only")}>
        <div className="min-w-0 max-w-2xl">{header}</div>
        <AccountSummary className="surface hidden shrink-0 px-4 py-3.5 lg:flex lg:w-[340px]" />
      </div>

      {!auth.isLoaded ? (
        <LayoutSkeleton />
      ) : !auth.isSignedIn ? (
        <GuestCard />
      ) : (
        <div className="lg:grid lg:grid-cols-12 lg:gap-8 xl:gap-10">
          {/* Section list — sticky rail on desktop, the landing list on phones */}
          <aside className={cn("lg:col-span-4 xl:col-span-3", section && "hidden lg:block")}>
            <div className="lg:sticky lg:top-[calc(var(--topbar-h)+1.5rem)]">
              <div className="lg:hidden">
                <AccountSummary className="surface mb-6 p-4" />
                <SettingsIndex onOpen={go} onIntent={preload} />
              </div>
              <div className="hidden lg:block">
                <SettingsRail active={active} onOpen={go} onIntent={preload} />
              </div>
            </div>
          </aside>

          {/* Open section */}
          <section aria-labelledby="settings-section-title" className={cn("min-w-0 lg:col-span-8 xl:col-span-9", !section && "hidden lg:block")}>
            <button
              type="button"
              onClick={() => go(null)}
              className="-ms-2 mb-3 inline-flex h-10 items-center gap-1 rounded-full pe-3 ps-2 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink lg:hidden"
            >
              <ChevronLeft size={18} aria-hidden="true" className="flip-rtl" />
              {t("nav.back")}
            </button>
            <div className="mb-5 sm:mb-6">
              <h2 id="settings-section-title" ref={headingRef} tabIndex={-1} className="t-h2 outline-none lg:text-[1.75rem]">
                {t(`sections.${active}.title`)}
              </h2>
              <p className="t-small mt-1.5 text-ink-3 sm:text-[0.9375rem]">{t(`sections.${active}.desc`)}</p>
            </div>
            <div key={active} className="animate-fade">
              <Panel />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function LayoutSkeleton() {
  return (
    <div aria-busy="true" className="lg:grid lg:grid-cols-12 lg:gap-8 xl:gap-10">
      <div className="space-y-2 lg:col-span-4 xl:col-span-3">
        {Array.from({ length: 7 }, (_, i) => <Skeleton key={i} rounded="md" className="h-11 w-full" />)}
      </div>
      <div className="mt-8 hidden space-y-5 lg:col-span-8 lg:mt-0 lg:block xl:col-span-9">
        <Skeleton className="h-8 w-48" />
        <PanelSkeleton />
      </div>
    </div>
  );
}

/** Signed out (session ended): a clear way back in, and what this page manages. */
function GuestCard() {
  const t = useT("settings");
  const sections = SECTION_GROUPS.flatMap((g) => g.sections);
  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="surface grid overflow-hidden md:grid-cols-[minmax(0,1fr)_260px] lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="p-6 sm:p-8">
          <h2 className="t-h3">{t("guest.title")}</h2>
          <p className="t-body mt-2 max-w-xl text-ink-3">{t("guest.body")}</p>
          <Button href="/sign-in?next=%2Fsettings" iconStart={LogIn} className="mt-6">{t("guest.cta")}</Button>
        </div>
        <div className="hidden items-end justify-center bg-[#F7F0E3] px-6 pt-5 dark:bg-surface-2 md:flex">
          <Illustration id="landing.privacy" className="w-full max-w-[260px]" />
        </div>
      </section>

      <section aria-labelledby="settings-guest-manage" className="surface p-5 sm:p-7">
        <h2 id="settings-guest-manage" className="t-h4">{t("guest.manageTitle")}</h2>
        <ul className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
          {sections.map((s) => (
            <li key={s.id} className="flex items-start gap-3.5">
              <IconTile icon={s.icon} size="sm" />
              <div className="min-w-0">
                <p className="text-[0.9375rem] font-medium text-ink">{t(`sections.${s.id}.title`)}</p>
                <p className="t-small mt-0.5 text-ink-3">{t(`sections.${s.id}.desc`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
