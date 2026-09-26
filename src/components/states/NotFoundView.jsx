import { Home, Search } from "lucide-react";
import { getT } from "@/i18n/server";
import { Link } from "@/i18n/navigation";
import Logo from "@/components/brand/Logo";
import Button from "@/components/ui/Button";
import Illustration from "@/components/ui/Illustration";
import SkipLink from "@/components/shell/SkipLink";

/**
 * Branded, localized 404 body (server component). Rendered by
 * app/[locale]/not-found.js (a page called notFound()) and, for unmatched
 * URLs, by app/not-found.js — which server-renders a full document, so the
 * 404 has content, a language and a 404 status before any JS runs.
 * Must sit inside an <I18nProvider> for `locale` (links are locale-aware).
 */
export default async function NotFoundView({ locale }) {
  const [t, tn] = await Promise.all([getT("common", locale), getT("nav", locale)]);
  const other = locale === "en" ? "ar" : "en";
  return (
    <div className="bg-aura flex min-h-dvh flex-col">
      <SkipLink />
      <header className="container-jz flex h-[68px] items-center justify-between gap-4">
        <Link href="/" className="rounded-md"><Logo name={t("brand.full")} size="sm" /></Link>
        <Link
          href="/"
          locale={other}
          lang={other}
          hrefLang={other}
          className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          {t(`languages.home.${other}`)}
        </Link>
      </header>
      <main id="main" tabIndex={-1} className="container-jz grid flex-1 items-center gap-10 py-10 outline-none lg:grid-cols-2">
        <div className="order-2 text-center lg:order-1 lg:text-start">
          <p className="t-eyebrow">404</p>
          <h1 className="t-h1 mt-2">{t("errors.notFoundTitle")}</h1>
          <p className="t-lead mx-auto mt-3 max-w-lg lg:mx-0">{t("errors.notFoundBody")}</p>
          <div className="mt-7 flex flex-wrap justify-center gap-2.5 lg:justify-start">
            <Button href="/" iconStart={Home}>{t("actions.goHome")}</Button>
            <Button href="/search" variant="secondary" iconStart={Search}>{tn("items.search")}</Button>
          </div>
        </div>
        <div aria-hidden="true" className="art-frame order-1 mx-auto w-full max-w-md rounded-2xl shadow-md lg:order-2 lg:max-w-lg">
          <Illustration id="support.not-found" priority sizes="(min-width: 1024px) 512px, (min-width: 480px) 448px, 100vw" aspect="4/3" />
        </div>
      </main>
    </div>
  );
}
