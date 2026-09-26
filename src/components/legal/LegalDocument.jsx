import { notFound } from "next/navigation";
import { ArrowRight, ArrowUp, CalendarDays, ChevronDown, ChevronRight, Clock, Link2, ListOrdered, MessageCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getT } from "@/i18n/server";
import { formatDate } from "@/i18n/format";
import { breadcrumbJsonLd, jsonLd } from "@/lib/seo";
import { supportWhatsAppUrl } from "@/lib/constants";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import Button from "@/components/ui/Button";
import IconTile from "@/components/ui/IconTile";
import Illustration from "@/components/ui/Illustration";
import { cn } from "@/components/ui/cn";
import LegalBlocks, { Inline, blocksText } from "./LegalBlocks";
import TocSpy from "./TocSpy";
import { LEGAL_DOCS, LEGAL_UPDATED, legalDoc } from "./docs";

const WPM = { ar: 170, en: 220 };
// The revision date is a calendar date, not an instant: format it in UTC so it never shifts a day.
const DATE_OPTS = { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" };

/**
 * Shared reading layout for every legal document (server component).
 *
 *   hero:    breadcrumbs · title · lead · meta (updated / reading time / sections) | "in short" card
 *   body:    sticky table of contents (lg+, <details> on mobile) · numbered sections · help card
 *   rail:    legal-document switcher (xl+; a "other documents" list replaces it below xl)
 *
 * All copy comes from the `legal` namespace: legal.<doc>.{title,intro,summary,sections}.
 */
export default async function LegalDocument({ doc, locale, art = "legal.hero" }) {
  const meta = legalDoc(doc);
  const t = await getT("legal", locale);
  const content = t.raw(doc);
  if (!meta || !content?.sections) notFound();

  const sections = Object.entries(content.sections).map(([id, s], i) => ({ id, n: i + 1, title: s.title, body: s.body }));
  const words = [content.intro, ...content.summary, ...sections.flatMap((s) => [s.title, blocksText(s.body)])]
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / (WPM[locale] || WPM.en)));
  const others = LEGAL_DOCS.filter((d) => d.key !== doc);
  const DocIcon = meta.icon;

  const crumbs = breadcrumbJsonLd(
    [
      { name: t("ui.home"), path: "/" },
      { name: content.title, path: meta.href },
    ],
    locale
  );

  const tocLinks = (compact) =>
    sections.map((s) => (
      <li key={s.id}>
        <a
          href={`#${s.id}`}
          data-toc-link={s.id}
          className={cn(
            "flex gap-3 text-ink-3 transition-colors hover:text-ink data-[active=true]:text-ink",
            compact
              ? "min-h-11 items-center rounded-sm px-3 py-2 text-[0.9375rem] hover:bg-surface-2"
              : "-ms-px border-s-2 border-transparent py-1.5 ps-4 text-sm leading-snug data-[active=true]:border-gold-500 data-[active=true]:font-medium"
          )}
        >
          <span className="num tabular w-5 shrink-0 text-[0.8125rem] text-ink-3">{s.n}</span>
          <span>{s.title}</span>
        </a>
      </li>
    ));

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(crumbs) }} />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <header id="legal-top" className="border-b border-line/10 bg-surface-2/50">
        <div className="container-wide pb-10 pt-6 sm:pb-12 sm:pt-8 lg:pb-14">
          <Breadcrumbs label={t("ui.breadcrumb")} items={[{ label: t("ui.home"), href: "/" }, { label: content.title }]} />

          <div className="mt-6 grid gap-8 lg:mt-10 lg:grid-cols-12 lg:items-start lg:gap-12">
            <div className="animate-in lg:col-span-7">
              <p className="t-eyebrow flex items-center gap-2">
                <DocIcon size={16} aria-hidden="true" />
                {t("ui.eyebrow")}
              </p>
              <h1 className="t-h1 mt-3">{content.title}</h1>
              <p className="t-lead mt-4 max-w-2xl">{content.intro}</p>

              <ul className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-3">
                <li className="flex items-center gap-2">
                  <CalendarDays size={16} aria-hidden="true" className="text-ink-4" />
                  <time dateTime={LEGAL_UPDATED}>{t("ui.updated", { date: formatDate(LEGAL_UPDATED, locale, DATE_OPTS) })}</time>
                </li>
                <li className="flex items-center gap-2">
                  <Clock size={16} aria-hidden="true" className="text-ink-4" />
                  {t("ui.readingTime", { count: minutes })}
                </li>
                <li className="hidden items-center gap-2 sm:flex">
                  <ListOrdered size={16} aria-hidden="true" className="text-ink-4" />
                  {t("ui.sections", { count: sections.length })}
                </li>
              </ul>
            </div>

            <section
              aria-labelledby="legal-summary"
              className="relative rounded-xl border border-line/[.12] bg-surface p-6 shadow-sm sm:p-7 lg:col-span-5"
            >
              {/* The document's painting as a full-bleed strip across the top of the card. */}
              <div aria-hidden="true" className="relative -mx-6 -mt-6 mb-6 aspect-[16/7] overflow-hidden rounded-t-xl sm:-mx-7 sm:-mt-7">
                <Illustration id={art} fill sizes="(min-width: 1024px) 40vw, 100vw" />
              </div>
              <h2 id="legal-summary" className="t-h4">{t("ui.summaryTitle")}</h2>
              <ul className="mt-4 space-y-3">
                {content.summary.map((line, i) => (
                  <li key={i} className="flex gap-3 text-[0.9375rem] text-ink-2">
                    {/* Neutral marker: a summary line can be a rule or a limit, not only a benefit. */}
                    <span aria-hidden="true" className="mt-[0.75em] h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <p className="t-caption mt-5 border-t border-line/10 pt-4">{t("ui.summaryNote")}</p>
            </section>
          </div>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="container-wide pb-16 pt-8 sm:pb-20 lg:pt-14">
        <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12 xl:grid-cols-[240px_minmax(0,1fr)_272px] xl:gap-14">
          {/* Table of contents — desktop rail */}
          <nav aria-labelledby="legal-toc" className="hidden lg:block">
            <div className="sticky top-[92px] max-h-[calc(100dvh-112px)] overflow-y-auto pb-4">
              <p id="legal-toc" className="text-sm font-medium text-ink">{t("ui.tocTitle")}</p>
              <ol className="mt-3 space-y-0.5 border-s border-line/[.12]">{tocLinks(false)}</ol>
              <a href="#legal-top" className="mt-6 inline-flex min-h-9 items-center gap-1.5 text-sm text-ink-3 transition-colors hover:text-ink">
                <ArrowUp size={15} aria-hidden="true" />
                {t("ui.backToTop")}
              </a>
            </div>
          </nav>

          <article className="min-w-0">
            {/* Table of contents — mobile / tablet */}
            <details className="group mb-8 rounded-lg border border-line/[.12] bg-surface shadow-xs lg:hidden">
              <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 px-4 [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2.5 font-medium text-ink">
                  <ListOrdered size={18} aria-hidden="true" className="text-gold-600" />
                  {t("ui.tocToggle")}
                </span>
                <span className="flex items-center gap-2 text-sm text-ink-3">
                  {t("ui.sections", { count: sections.length })}
                  <ChevronDown size={18} aria-hidden="true" className="transition-transform duration group-open:rotate-180" />
                </span>
              </summary>
              <ol className="border-t border-line/10 p-2">{tocLinks(true)}</ol>
            </details>

            <div className="divide-y divide-line/10">
              {sections.map((s) => (
                <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="group/section scroll-mt-4 py-9 first:pt-0 sm:py-10">
                  <div className="flex items-start gap-3.5">
                    <span className="num tabular mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-sm bg-gold-50 text-sm font-medium text-gold-700 ring-1 ring-inset ring-gold-200/60">
                      {s.n}
                    </span>
                    <h2 id={`${s.id}-title`} className="t-h3 min-w-0 flex-1 pt-px">{s.title}</h2>
                    <a
                      href={`#${s.id}`}
                      aria-label={t("ui.anchor", { title: s.title })}
                      className="hidden h-8 w-8 shrink-0 place-items-center rounded-sm text-ink-3 opacity-0 transition-opacity hover:text-gold-600 focus-visible:opacity-100 group-hover/section:opacity-100 sm:grid"
                    >
                      <Link2 size={16} aria-hidden="true" />
                    </a>
                  </div>
                  <div className="prose-jz mt-4 sm:ps-[2.875rem]">
                    <LegalBlocks blocks={s.body} />
                  </div>
                </section>
              ))}
            </div>

            {/* Help / contact */}
            <section aria-labelledby="legal-help" className="mt-6 overflow-hidden rounded-xl border border-line/[.12] bg-surface-2/70">
              <div className="grid items-center gap-6 p-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:p-8">
                <div>
                  <h2 id="legal-help" className="t-h3">{t("ui.help.title")}</h2>
                  <p className="mt-2 max-w-md text-ink-3">{t("ui.help.body")}</p>
                  <div className="mt-5 flex flex-wrap gap-2.5">
                    <Button href="/contact" iconEnd={ArrowRight} className="w-full sm:w-auto">{t("ui.help.contact")}</Button>
                    <Button href={supportWhatsAppUrl()} external variant="secondary" iconStart={MessageCircle} className="w-full sm:w-auto">
                      {t("ui.help.whatsapp")}
                    </Button>
                  </div>
                  <p className="t-small mt-4 text-ink-3 [&_a:hover]:text-ink [&_a]:font-medium [&_a]:text-ink-2 [&_a]:underline [&_a]:underline-offset-4">
                    <Inline text={t("ui.help.more")} />
                  </p>
                </div>
                <div aria-hidden="true" className="art-frame hidden w-44 rounded-lg sm:block lg:w-56">
                  <Illustration id="support.hero" aspect="4/3" sizes="224px" />
                </div>
              </div>
            </section>

            {/* Other documents — below xl (the rail shows them on xl+) */}
            <nav aria-labelledby="legal-related" className="mt-12 xl:hidden">
              <h2 id="legal-related" className="t-h4">{t("ui.relatedTitle")}</h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {others.map((d) => (
                  <li key={d.key}>
                    <Link
                      href={d.href}
                      className="group flex h-full items-center gap-3.5 rounded-lg border border-line/[.12] bg-surface p-4 transition-[border-color,box-shadow] duration hover:border-line/20 hover:shadow-sm"
                    >
                      <IconTile icon={d.icon} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-ink">{t(`docs.${d.key}.label`)}</span>
                        <span className="t-small block text-ink-3">{t(`docs.${d.key}.blurb`)}</span>
                      </span>
                      <ChevronRight size={18} aria-hidden="true" className="flip-rtl shrink-0 text-ink-4 transition-colors group-hover:text-ink-2" />
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </article>

          {/* Document switcher — xl rail */}
          <aside className="hidden xl:block">
            <nav aria-labelledby="legal-docs" className="sticky top-[92px] rounded-lg border border-line/[.12] bg-surface p-2 shadow-xs">
              <p id="legal-docs" className="px-3 pb-1.5 pt-2 text-sm font-medium text-ink">{t("ui.docsTitle")}</p>
              <ul className="space-y-0.5">
                {LEGAL_DOCS.map((d) => {
                  const current = d.key === doc;
                  const Icon = d.icon;
                  return (
                    <li key={d.key}>
                      <Link
                        href={d.href}
                        aria-current={current ? "page" : undefined}
                        className={cn(
                          "flex min-h-11 items-center gap-3 rounded-md px-3 text-[0.9375rem] transition-colors",
                          current ? "bg-surface-2 font-medium text-ink" : "text-ink-3 hover:bg-surface-2/60 hover:text-ink"
                        )}
                      >
                        <Icon size={17} aria-hidden="true" className={current ? "text-gold-600" : "text-ink-4"} />
                        {t(`docs.${d.key}.label`)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </aside>
        </div>
      </div>

      <TocSpy ids={sections.map((s) => s.id)} />
    </>
  );
}
