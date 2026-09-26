import { NextResponse } from "next/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE, splitLocale, localizeHref } from "@/i18n/config";

// ============================================================================
// Edge middleware — locale routing + a zero-latency auth gate.
//
// 1. Locale ("as-needed" prefix):
//      /en/...  → served as-is by app/[locale] with locale=en
//      /ar/...  → 308 to the canonical unprefixed URL
//      /...     → rewritten internally to /ar/...  (or 307 → /en/... when the
//                 visitor previously chose English via the NEXT_LOCALE cookie)
//
// 2. Protected pages: if no Supabase auth cookie is present we redirect to
//    sign-in immediately (no flash of a protected shell). This is a UX gate
//    ONLY — authorization is enforced by Postgres RLS and server-side checks,
//    and client guards still handle expired sessions. No network call is made
//    here, so navigation stays instant.
// ============================================================================

const PROTECTED = [
  "/dashboard",
  "/settings",
  "/profile",
  "/notifications",
  "/chat",
  "/checkout",
  "/exams/attempt",
  "/exams/history",
  "/profile-setup",
];

// Public exceptions under a protected prefix: guest practice runs entirely
// client-side against /api/exams/local/* and never touches account data.
const PUBLIC_EXCEPTIONS = new Set(["/exams/attempt/local"]);

const isProtected = (path) =>
  !PUBLIC_EXCEPTIONS.has(path) && PROTECTED.some((p) => path === p || path.startsWith(`${p}/`));

// Supabase SSR stores the session in `sb-<ref>-auth-token` (possibly chunked .0/.1).
const hasAuthCookie = (req) =>
  req.cookies.getAll().some(({ name, value }) => /^sb-.+-auth-token(\.\d+)?$/.test(name) && value);

export function middleware(req) {
  const { pathname, search } = req.nextUrl;
  const { locale: prefixed, path } = splitLocale(pathname);
  const hasPrefix = pathname === `/${prefixed}` || pathname.startsWith(`/${prefixed}/`);

  // /ar/... is never public — collapse to the canonical unprefixed URL.
  if (hasPrefix && prefixed === "ar") {
    const url = req.nextUrl.clone();
    url.pathname = path;
    const res = NextResponse.redirect(url, 308);
    res.cookies.set(LOCALE_COOKIE, "ar", { path: "/", maxAge: 31536000, sameSite: "lax" });
    return res;
  }

  let locale = hasPrefix ? prefixed : DEFAULT_LOCALE;

  // Unprefixed request from a visitor who chose English → send to /en/...
  if (!hasPrefix && req.cookies.get(LOCALE_COOKIE)?.value === "en") {
    const url = req.nextUrl.clone();
    url.pathname = localizeHref(path, "en");
    return NextResponse.redirect(url, 307);
  }

  if (isProtected(path) && !hasAuthCookie(req)) {
    const url = req.nextUrl.clone();
    url.pathname = localizeHref("/sign-in", locale);
    url.search = `?next=${encodeURIComponent(path + (search || ""))}`;
    return NextResponse.redirect(url, 307);
  }

  if (hasPrefix) return NextResponse.next(); // /en/... maps straight onto app/[locale]

  const url = req.nextUrl.clone();
  url.pathname = `/${locale}${path === "/" ? "" : path}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Everything except API routes, the OAuth callback, Next internals and REAL
  // static files (by extension: images, fonts, robots.txt, sitemap.xml, the
  // manifest, PDFs…). A dot elsewhere in a path is not a file: excluding any
  // path with a "." used to skip the auth gate for e.g. /en/exams/attempt/a.b.
  matcher: [
    "/((?!api|auth/callback|_next|_vercel|.*\\.(?:png|jpe?g|gif|webp|avif|svg|ico|txt|xml|json|webmanifest|pdf|js|mjs|css|map|woff2?|ttf|otf|mp4|webm|mp3)$).*)",
  ],
};
