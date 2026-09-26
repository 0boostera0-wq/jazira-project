"use client";

// Locale-aware navigation. ALWAYS import Link / useRouter / usePathname from
// here instead of "next/link" / "next/navigation" (enforced by ESLint).
//
//   <Link href="/exams">           → "/exams" in Arabic, "/en/exams" in English
//   router.push("/dashboard")      → same rule
//   usePathname()                  → path WITHOUT the /en prefix (for active states)
//   <Link href="/x" prefetch="intent">  → no viewport prefetch; prefetch on
//                                          hover / touch / keyboard focus instead

import NextLink from "next/link";
import {
  useRouter as useNextRouter,
  usePathname as useNextPathname,
} from "next/navigation";
import { forwardRef, useMemo } from "react";
import { useLocale } from "./client";
import { localizeHref, splitLocale, LOCALE_COOKIE } from "./config";

export const Link = forwardRef(function Link({ href, locale: forced, prefetch, onMouseEnter, onTouchStart, onFocus, ...rest }, ref) {
  const { locale } = useLocale();
  const router = useNextRouter();
  const target = localizeHref(href, forced || locale);
  if (prefetch !== "intent") {
    return <NextLink ref={ref} href={target} prefetch={prefetch} onMouseEnter={onMouseEnter} onTouchStart={onTouchStart} onFocus={onFocus} {...rest} />;
  }
  // Viewport prefetch of every always-visible nav link (sidebar, bottom tabs)
  // costs 100–200KB per cold page view on static routes. Warm the route only
  // when the user shows intent; the router dedupes repeat prefetches.
  const warm = () => {
    if (typeof target === "string") {
      try { router.prefetch(target, { kind: "auto" }); } catch {}
    }
  };
  return (
    <NextLink
      ref={ref}
      href={target}
      prefetch={false}
      onMouseEnter={(e) => { warm(); onMouseEnter?.(e); }}
      onTouchStart={(e) => { warm(); onTouchStart?.(e); }}
      onFocus={(e) => { warm(); onFocus?.(e); }}
      {...rest}
    />
  );
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

/**
 * Locale from the URL itself ("/en/…" → "en", anything else → "ar"). For
 * documents rendered outside app/[locale] (the root not-found), where no
 * I18nProvider exists yet. Works during SSR: the router knows the request URL.
 */
export function useUrlLocale() {
  return splitLocale(useNextPathname() || "/").locale;
}

/** Persist the chosen locale (1 year) so unprefixed visits honour it. */
export function rememberLocale(locale) {
  try {
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  } catch {}
}

export { localizeHref };
