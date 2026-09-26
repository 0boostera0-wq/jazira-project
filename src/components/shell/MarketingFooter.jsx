import { MessageCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getT } from "@/i18n/server";
import { FOOTER_NAV } from "@/lib/nav";
import { supportWhatsAppUrl } from "@/lib/constants";
import Logo from "@/components/brand/Logo";

/** Public-site footer (server component — zero JS). */
export default async function MarketingFooter() {
  const [t, tc] = await Promise.all([getT("nav"), getT("common")]);
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-line/10 bg-surface-2/50">
      <div className="container-wide grid gap-10 py-12 sm:py-14 lg:grid-cols-[1.3fr_2fr] lg:gap-16">
        <div className="max-w-sm">
          <Logo name={tc("brand.full")} />
          <p className="t-small mt-4 text-ink-3">{t("footer.about")}</p>
          <a
            href={supportWhatsAppUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-2 rounded-full border border-line/15 bg-surface px-4 py-2 text-sm font-medium text-ink-2 transition-colors hover:border-line/30 hover:text-ink"
          >
            <MessageCircle size={16} className="text-green-600" aria-hidden="true" />
            {t("footer.whatsapp")}
          </a>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {FOOTER_NAV.map((col) => (
            <div key={col.group}>
              <p className="text-sm font-medium text-ink">{t(`footer.groups.${col.group}`)}</p>
              {/* 44px-tall targets on phones (design system §4); compact rhythm from sm up */}
              <ul className="mt-1.5 sm:mt-3 sm:space-y-2.5">
                {col.links.map(([key, href]) => (
                  <li key={href}>
                    <Link href={href} className="inline-flex min-h-11 items-center text-sm text-ink-3 transition-colors hover:text-ink sm:min-h-0">{t(key)}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-line/10">
        <div className="container-wide flex flex-col items-center justify-between gap-2 py-5 text-xs text-ink-3 sm:flex-row">
          <p>{t("footer.rights", { year: String(year) })}</p>
          <p>{t("footer.madeIn")}</p>
        </div>
      </div>
    </footer>
  );
}
