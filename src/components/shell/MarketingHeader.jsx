"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Menu } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { useT } from "@/i18n/client";
import { useAuthUser } from "@/context/AuthProvider";
import { MARKETING_NAV } from "@/lib/nav";
import Logo from "@/components/brand/Logo";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import LanguageSwitch from "./LanguageSwitch";
import ThemeToggle from "./ThemeToggle";
import { cn } from "@/components/ui/cn";

/** Public-site header: transparent over the hero, frosted once scrolled. */
export default function MarketingHeader() {
  const t = useT("nav");
  const tc = useT("common");
  const pathname = usePathname();
  const { isLoaded, isSignedIn } = useAuthUser();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={cn("sticky top-0 z-40 transition-[background-color,border-color,box-shadow] duration", scrolled ? "glass-chrome border-b border-line/10" : "border-b border-transparent")}>
      <div className="container-wide flex h-[68px] items-center justify-between gap-4">
        <Link href="/" className="shrink-0 rounded-md">
          <Logo name={tc("brand.full")} size="sm" />
        </Link>

        <nav aria-label={tc("a11y.mainNav")} className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {MARKETING_NAV.map((l) => {
              const active = l.href !== "/" && !l.href.includes("#") && pathname.startsWith(l.href);
              return (
                <li key={l.key}>
                  <Link
                    href={l.href}
                    aria-current={active ? "page" : undefined}
                    className={cn("rounded-full px-3.5 py-2 text-[0.9375rem] transition-colors", active ? "font-medium text-ink" : "text-ink-2 hover:text-ink")}
                  >
                    {t(`marketing.${l.key}`)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex items-center gap-1">
          <LanguageSwitch className="hidden sm:inline-flex" />
          <ThemeToggle className="hidden sm:grid" />
          {isLoaded && isSignedIn ? (
            <Button href="/dashboard" size="sm" iconEnd={ArrowRight} className="ms-1">
              {t("marketing.openApp")}
            </Button>
          ) : (
            <>
              <Button href="/sign-in" variant="ghost" size="sm" className="hidden sm:inline-flex">{t("marketing.signIn")}</Button>
              <Button href="/sign-up" size="sm" className="ms-1">{t("marketing.getStarted")}</Button>
            </>
          )}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={tc("a11y.openMenu")}
            className="ms-1 grid h-10 w-10 place-items-center rounded-full text-ink-2 hover:bg-surface-2 lg:hidden"
          >
            <Menu size={20} aria-hidden="true" />
          </button>
        </div>
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} variant="sheet" title={tc("brand.full")}>
        <ul className="space-y-1">
          {MARKETING_NAV.map((l) => (
            <li key={l.key}>
              <Link href={l.href} onClick={() => setOpen(false)} className="flex h-12 items-center rounded-md px-3 text-base font-medium text-ink hover:bg-surface-2">
                {t(`marketing.${l.key}`)}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button href="/sign-in" variant="secondary" onClick={() => setOpen(false)}>{t("marketing.signIn")}</Button>
          <Button href="/sign-up" onClick={() => setOpen(false)}>{t("marketing.getStarted")}</Button>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-md bg-surface-2 px-2 py-1.5">
          <LanguageSwitch variant="text" />
          <ThemeToggle />
        </div>
      </Dialog>
    </header>
  );
}
