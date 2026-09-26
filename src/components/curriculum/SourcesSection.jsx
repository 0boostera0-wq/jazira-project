import { BookOpenCheck, CalendarRange, CheckCircle2, CircleDashed, ScrollText } from "lucide-react";
import { getT, getLocale } from "@/i18n/server";
import { formatDate } from "@/i18n/format";
import { SectionHeader } from "@/components/ui/Layout";
import { cn } from "@/components/ui/cn";
import { OFFICIAL, PLAN_SOURCE, SOURCES_CHECKED } from "@/lib/curriculum";
import { ExternalLink } from "./parts";

/** "Where this data comes from" — the three sources, what is verified, and the check date. */
export default async function SourcesSection({ id = "sources" }) {
  const locale = getLocale();
  const t = await getT("curriculum");
  const items = [
    { key: "plan", icon: ScrollText, status: "verified", href: PLAN_SOURCE.url },
    { key: "terms", icon: CalendarRange, status: "partial", href: PLAN_SOURCE.termsUrl },
    { key: "books", icon: BookOpenCheck, status: "verified", href: OFFICIAL.madrasati.serviceUrl },
  ];

  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <SectionHeader id={`${id}-title`} eyebrow={t("hub.sources.eyebrow")} title={t("hub.sources.title")} description={t("hub.sources.lead")} />
      <ol className="mt-8 grid gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-3">
        {items.map((it, i) => {
          const verified = it.status === "verified";
          return (
            <li key={it.key} className={cn("surface-flat flex flex-col p-5 sm:p-6", i === items.length - 1 && items.length % 2 === 1 && "md:col-span-2 xl:col-span-1")}>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2.5">
                  <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-full bg-surface-2 text-[0.8125rem] font-bold text-ink-2 tabular">
                    {i + 1}
                  </span>
                  <it.icon size={18} aria-hidden="true" className="text-gold-600" />
                </span>
                <span
                  className={
                    verified
                      ? "inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-green-100 bg-green-50 px-2 text-xs font-medium text-green-700"
                      : "inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-warning/25 bg-warning-soft px-2 text-xs font-medium text-warning"
                  }
                >
                  {verified ? <CheckCircle2 size={12} aria-hidden="true" /> : <CircleDashed size={12} aria-hidden="true" />}
                  {verified ? t("hub.sources.verified") : t("hub.sources.partial")}
                </span>
              </div>
              <h3 className="t-h4 mt-4">{t(`hub.sources.${it.key}.title`)}</h3>
              <p className="t-small mt-2 text-ink-3">{t(`hub.sources.${it.key}.body`)}</p>
              <div className="mt-auto pt-4">
                <ExternalLink href={it.href} newTabLabel={t("channels.newTab")} className="min-h-11 text-sm font-medium text-gold-600 hover:text-gold-700">
                  {t(`hub.sources.${it.key}.link`)}
                </ExternalLink>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="t-caption mt-5">{t("hub.sources.checked", { date: formatDate(SOURCES_CHECKED, locale) })}</p>
    </section>
  );
}
