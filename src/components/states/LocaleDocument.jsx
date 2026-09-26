"use client";

import { dirOf } from "@/i18n/config";
import { useUrlLocale } from "@/i18n/navigation";

/**
 * <html>/<body> for documents rendered OUTSIDE app/[locale] (the root
 * not-found). The server prepares one localized body per locale; this picks
 * the one matching the request URL ("/en/…" → English), so the server HTML
 * already carries the right lang/dir and copy.
 *   <LocaleDocument className={fontVariables} headScript={…} titles={{ ar, en }} variants={{ ar: <…/>, en: <…/> }} />
 */
export default function LocaleDocument({ className, headScript, titles, variants }) {
  const locale = useUrlLocale();
  return (
    <html lang={locale} dir={dirOf(locale)} className={className} suppressHydrationWarning>
      {/* App Router document head (next/head is a Pages Router API) */}
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <head>
        {titles?.[locale] && <title>{titles[locale]}</title>}
        {headScript && <script dangerouslySetInnerHTML={{ __html: headScript }} />}
      </head>
      <body>{variants[locale] ?? variants.ar}</body>
    </html>
  );
}
