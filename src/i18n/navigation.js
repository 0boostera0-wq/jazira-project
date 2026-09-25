"use client";

// Locale-aware navigation. ALWAYS import Link / useRouter / usePathname from
// here instead of "next/link" / "next/navigation" (enforced by ESLint).
//
//   <Link href="/exams">           → "/exams" in Arabic, "/en/exams" in English
//   router.push("/dashboard")      → same rule
//   usePathname()                  → path WITHOUT the /en prefix (for active states)

import NextLink from "next/link";
import {
  useRouter as useNextRouter,
  usePathname as useNextPathname,
} from "next/navigation";
import { forwardRef, useMemo } from "react";
import { useLocale } from "./client";
import { localizeHref, splitLocale, LOCALE_COOKIE } from "./config";

export const Link = forwardRef(function Link({ href, locale: forced, ...rest }, ref) {
  const { locale } = useLocale();
  return <NextLink ref={ref} href={localizeHref(href, forced || locale)} {...rest} />;
});

// Lets <RouteProgress> show feedback for programmatic navigation too.
const navStart = () => { try { window.dispatchEvent(new Event("jz:navstart")); } catch {} };

export function useRouter() {
  const router = useNextRouter();
  const { locale } = useLocale();
  return useMemo(
    () => ({
      ...router,
      push: (href, opts) => { navStart(); router.push(localizeHref(href, locale), opts); },
      replace: (href, opts) => { navStart(); router.replace(localizeHref(href, locale), opts); },
      prefetch: (href, opts) => router.prefetch(localizeHref(href, locale), opts),
    }),
    [router, locale]
  );
}

/** Current pathname without the locale prefix. */
export function usePathname() {
  return splitLocale(useNextPathname() || "/").path;
}

/** Persist the chosen locale (1 year) so unprefixed visits honour it. */
export function rememberLocale(locale) {
  try {
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  } catch {}
}

export { localizeHref };
