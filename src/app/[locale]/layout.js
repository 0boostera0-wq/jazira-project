import { IBM_Plex_Sans_Arabic, IBM_Plex_Sans } from "next/font/google";
import { notFound } from "next/navigation";
import { LOCALES, isLocale, dirOf } from "@/i18n/config";
import { setRequestLocale, loadMessages, getT } from "@/i18n/server";
import { I18nProvider } from "@/i18n/client";
import Providers from "@/components/providers/Providers";
import { SITE_URL, OG_IMAGE, organizationJsonLd, jsonLd } from "@/lib/seo";

// Typography: IBM Plex Sans Arabic for Arabic (and Latin runs inside Arabic
// text) — a humanist sans with excellent long-form readability — paired with
// its designed sibling IBM Plex Sans for the English interface. Three weights
// keep the font payload small; only the Arabic face is preloaded.
const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "700"],
  variable: "--font-ar",
  display: "swap",
  preload: true,
});
const plexLatin = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-en",
  display: "swap",
  preload: false,
});

export const dynamicParams = false;
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }) {
  const t = await getT("meta", params.locale);
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t("site.title"), template: `%s · ${t("site.name")}` },
    description: t("site.description"),
    applicationName: t("site.name"),
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

// Apply the saved theme before first paint (no light→dark flash).
const themeScript = `(function(){try{var t=JSON.parse(localStorage.getItem("jazira_theme_v1"));if(t==="dark")document.documentElement.classList.add("dark")}catch(e){}})();`;

export default async function LocaleLayout({ children, params }) {
  const { locale } = params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const [messages, meta] = await Promise.all([loadMessages(locale, ["common", "nav"]), getT("meta", locale)]);

  return (
    <html lang={locale} dir={dirOf(locale)} className={`${plexArabic.variable} ${plexLatin.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
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
