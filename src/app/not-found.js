import { LOCALES } from "@/i18n/config";
import { getT, loadMessages } from "@/i18n/server";
import { I18nProvider } from "@/i18n/client";
import NotFoundView from "@/components/states/NotFoundView";
import LocaleDocument from "@/components/states/LocaleDocument";
import { fontVariables, THEME_SCRIPT } from "./fonts";

// The 404 for every unmatched URL — /xyz, /en/xyz, /en/file.pdf. Next renders
// it through its own not-found route, which (unlike a notFound() thrown from a
// page) is server-rendered: the response is a real 404 with a complete,
// branded, localized document before any JS runs. The locale comes from the
// request URL (LocaleDocument); both localized bodies are prepared here.
//
// Rendered per request so the server HTML matches the URL's language (a
// prerendered copy would always be Arabic and re-render on hydration).
export const dynamic = "force-dynamic";

// The <title> is rendered by LocaleDocument (it knows the URL's locale; the
// server metadata API doesn't), so metadata only carries robots.
export const metadata = { robots: { index: false, follow: false } };

export default async function GlobalNotFound() {
  const titles = Object.fromEntries(
    await Promise.all(
      LOCALES.map(async (locale) => {
        const t = await getT("meta", locale);
        return [locale, `${t("pages.notFound.title")} · ${t("site.name")}`];
      })
    )
  );
  const variants = Object.fromEntries(
    await Promise.all(
      LOCALES.map(async (locale) => [
        locale,
        <I18nProvider key={locale} locale={locale} messages={await loadMessages(locale, ["common", "nav"])}>
          <NotFoundView locale={locale} />
        </I18nProvider>,
      ])
    )
  );
  return <LocaleDocument className={fontVariables} headScript={THEME_SCRIPT} titles={titles} variants={variants} />;
}
