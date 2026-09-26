import { notFound } from "next/navigation";
import { LOCALES, isLocale, dirOf } from "@/i18n/config";
import { setRequestLocale, loadMessages, getT } from "@/i18n/server";
import { I18nProvider } from "@/i18n/client";
import { manifestHref } from "@/i18n/manifest";
import Providers from "@/components/providers/Providers";
import { SITE_URL, OG_IMAGE, organizationJsonLd, jsonLd } from "@/lib/seo";
import { fontVariables, THEME_SCRIPT } from "../fonts";

// Fonts (IBM Plex Sans Arabic + IBM Plex Sans, no preload, Arabic-metric
// fallback) are configured in app/fonts.js, shared with app/not-found.js.

export const dynamicParams = false;
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata(props) {
  const params = await props.params;
  const t = await getT("meta", params.locale);
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t("site.title"), template: `%s · ${t("site.name")}` },
    description: t("site.description"),
    applicationName: t("site.name"),
    // per-locale manifest: English installs get an English name and start at /en
    manifest: manifestHref(params.locale),
    openGraph: { images: [{ url: OG_IMAGE, width: 1200, height: 630 }] },
    formatDetection: { telephone: false },
  };
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAF7F0" },
    { media: "(prefers-color-scheme: dark)", color: "#14110C" },
  ],
};

export default async function LocaleLayout(props) {
  const params = await props.params;

  const {
    children
  } = props;

  const { locale } = params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const [messages, meta] = await Promise.all([loadMessages(locale, ["common", "nav"]), getT("meta", locale)]);

  return (
    <html lang={locale} dir={dirOf(locale)} className={fontVariables} suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before first paint (no light→dark flash). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLd(organizationJsonLd({ name: meta("site.name"), description: meta("site.description"), locale })),
          }}
        />
      </head>
      <body>
        <I18nProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </I18nProvider>
      </body>
    </html>
  );
}
