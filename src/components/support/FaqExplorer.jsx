"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, LayoutGrid, MessageCircle, Search, SearchX, X } from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import { supportWhatsAppUrl } from "@/lib/constants";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import IconTile from "@/components/ui/IconTile";
import { cn } from "@/components/ui/cn";
import FaqList from "./FaqList";
import { FAQ_TOPICS, TOPIC_IDS, normalizeText, resolveFaq } from "./faqCatalog";
import { TOPIC_ICONS } from "./topicIcons";

const ALL = "all";

/** Contact card shown next to (desktop) or after (mobile) the answers. */
function HelpCard({ t, className }) {
  return (
    <Card tone="tint" className={className}>
      <h2 className="t-h4">{t("faq.help.title")}</h2>
      <p className="t-small mt-1 text-ink-3">{t("faq.help.body")}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button href="/contact" size="sm" iconEnd={ArrowRight}>{t("faq.help.contact")}</Button>
        <Button href={supportWhatsAppUrl()} external size="sm" variant="secondary" iconStart={MessageCircle}>
          {t("faq.help.whatsapp")}
          <span className="sr-only">({t("shared.external")})</span>
        </Button>
      </div>
    </Card>
  );
}

/**
 * Bilingual FAQ browser: topic filter (rail on desktop, chips on mobile) and an
 * instant, Arabic-aware text filter. Deep links: /faq#<topic>, /faq#q-<id>,
 * /faq?q=<text> (from the support-center search). All answers are rendered on
 * the server too, so the page is complete without JavaScript.
 */
export default function FaqExplorer() {
  const t = useT("support");
  const { locale } = useLocale();
  const [topic, setTopic] = useState(ALL);
  const [query, setQuery] = useState("");
  const [scrollTo, setScrollTo] = useState(null);
  const inputRef = useRef(null);

  const all = useMemo(() => resolveFaq(t, locale).map((f) => ({ ...f, hay: normalizeText(`${f.q} ${f.a}`) })), [t, locale]);

  // Deep links (hash / ?q=) — read once on mount so the page stays static.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const q = (params.get("q") || "").slice(0, 80);
      if (q) setQuery(q);
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (TOPIC_IDS.includes(hash)) {
        setTopic(hash);
        setScrollTo(hash);
      }
      if (hash.startsWith("q-")) {
        const el = document.getElementById(hash);
        if (el) {
          el.open = true;
          setScrollTo(hash);
        }
      }
    } catch {}
  }, []);

  // Filtering shortens the page, so re-anchor after the filtered list renders.
  useEffect(() => {
    if (!scrollTo) return;
    const id = requestAnimationFrame(() => {
      document.getElementById(scrollTo)?.scrollIntoView({ block: "start" });
      setScrollTo(null);
    });
    return () => cancelAnimationFrame(id);
  }, [scrollTo]);

  const terms = useMemo(() => normalizeText(query).split(" ").filter(Boolean), [query]);
  const rawTerms = useMemo(() => query.trim().split(/\s+/).filter(Boolean), [query]);

  const groups = useMemo(() => {
    return FAQ_TOPICS.filter((tp) => topic === ALL || tp.id === topic)
      .map((tp) => ({
        id: tp.id,
        items: all.filter((f) => f.topic === tp.id && terms.every((w) => f.hay.includes(w))),
      }))
      .filter((g) => g.items.length);
  }, [all, topic, terms]);

  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const searching = terms.length > 0;

  const pickTopic = (id) => {
    setTopic(id);
    try {
      const url = new URL(window.location.href);
      url.hash = id === ALL ? "" : id;
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {}
  };

  const onQuery = (value) => {
    // A new search looks across every topic.
    if (!query.trim() && value.trim() && topic !== ALL) setTopic(ALL);
    setQuery(value);
  };

  const clear = () => {
    setQuery("");
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("q");
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {}
    inputRef.current?.focus();
  };

  const counts = useMemo(
    () => Object.fromEntries(FAQ_TOPICS.map((tp) => [tp.id, tp.items.length])),
    []
  );
  const topicList = [{ id: ALL, count: all.length }, ...FAQ_TOPICS.map((tp) => ({ id: tp.id, count: counts[tp.id] }))];
  const topicLabel = (id) => (id === ALL ? t("faq.all") : t(`topics.${id}.title`));

  return (
    <div className="container-jz grid gap-8 lg:grid-cols-12 lg:gap-10">
      {/* ── Desktop rail ─────────────────────────────────────────────────── */}
      <aside className="hidden lg:col-span-3 lg:block">
        <div className="sticky top-24 space-y-5">
          <nav aria-label={t("faq.categoriesLabel")}>
            <p className="t-caption mb-2 px-3 font-medium">{t("faq.categoriesLabel")}</p>
            <ul className="space-y-0.5">
              {topicList.map(({ id, count }) => {
                const Icon = id === ALL ? LayoutGrid : TOPIC_ICONS[id];
                const active = topic === id;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => pickTopic(id)}
                      aria-pressed={active}
                      className={cn(
                        "flex min-h-[2.75rem] w-full items-center gap-3 rounded-md px-3 text-start text-[0.9375rem] transition-colors",
                        active ? "bg-surface font-medium text-ink shadow-sm ring-1 ring-inset ring-line/15" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
                      )}
                    >
                      <Icon size={17} aria-hidden="true" className={active ? "text-gold-600" : "text-ink-4"} />
                      <span className="min-w-0 flex-1">{topicLabel(id)}</span>
                      <span className={cn("num rounded-full px-2 text-xs tabular", active ? "bg-gold-100 text-gold-700" : "text-ink-3")}>{count}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
          <HelpCard t={t} />
        </div>
      </aside>

      {/* ── Answers ──────────────────────────────────────────────────────── */}
      <div className="min-w-0 lg:col-span-9">
        <div role="search" className="relative">
          <label htmlFor="faq-filter" className="sr-only">{t("faq.searchLabel")}</label>
          <Search size={20} aria-hidden="true" className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-ink-4" />
          <input
            ref={inputRef}
            id="faq-filter"
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape" && query) { e.preventDefault(); clear(); } }}
            placeholder={t("faq.searchPlaceholder")}
            maxLength={80}
            autoComplete="off"
            enterKeyHint="search"
            aria-describedby="faq-status"
            className="block h-14 w-full rounded-lg border border-line/20 bg-surface pe-14 ps-12 text-[1rem] text-ink shadow-sm transition-[border-color,box-shadow] duration-fast placeholder:text-ink-4 hover:border-line/30 focus:border-gold-400 focus:shadow-[0_0_0_3px_rgb(var(--c-gold-400)/0.18)] focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={clear}
              aria-label={t("faq.clear")}
              className="absolute end-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Mobile topic chips */}
        <div className="-mx-[var(--gutter)] mt-4 lg:hidden">
          <ul
            aria-label={t("faq.categoriesLabel")}
            className="flex gap-2 overflow-x-auto px-[var(--gutter)] pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {topicList.map(({ id }) => {
              const active = topic === id;
              return (
                <li key={id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => pickTopic(id)}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex h-10 items-center whitespace-nowrap rounded-full border px-4 text-sm transition-colors",
                      active ? "border-transparent bg-primary font-medium text-primary-fg" : "border-line/15 bg-surface text-ink-2 hover:text-ink"
                    )}
                  >
                    {topicLabel(id)}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <p id="faq-status" aria-live="polite" className="t-caption mt-4 min-h-[1.25rem]">
          {searching || topic !== ALL ? (
            <>
              {t("faq.results", { count: total })}
              {topic !== ALL && <> · {topicLabel(topic)}</>}
            </>
          ) : null}
        </p>

        {total === 0 ? (
          <Card tone="flat" className="mt-3 flex flex-col items-center px-6 py-12 text-center">
            <IconTile icon={SearchX} tone="neutral" size="lg" />
            <h2 className="t-h3 mt-5">{t("faq.empty.title", { query: query.trim() })}</h2>
            <p className="t-body mt-2 max-w-md text-ink-3">{t("faq.empty.body")}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2.5">
              <Button variant="secondary" onClick={clear}>{t("faq.empty.clear")}</Button>
              <Button href="/contact" iconEnd={ArrowRight}>{t("faq.empty.contact")}</Button>
            </div>
          </Card>
        ) : (
          <div className="mt-3 space-y-8">
            {groups.map((g) => {
              const Icon = TOPIC_ICONS[g.id];
              return (
                <section key={g.id} id={g.id} aria-labelledby={`faq-h-${g.id}`} className="scroll-mt-24">
                  <div className="mb-3 flex items-center gap-3">
                    <IconTile icon={Icon} size="sm" />
                    <h2 id={`faq-h-${g.id}`} className="t-h3">{topicLabel(g.id)}</h2>
                    <span className="num rounded-full bg-surface-2 px-2 py-0.5 text-xs tabular text-ink-3 ring-1 ring-inset ring-line/10">{g.items.length}</span>
                  </div>
                  <Card pad="none" className="px-5 sm:px-6">
                    <FaqList items={g.items} terms={searching ? rawTerms : undefined} openAll={searching && total <= 4} />
                  </Card>
                </section>
              );
            })}
          </div>
        )}

        {/* The empty state already offers the same actions. */}
        {total > 0 && <HelpCard t={t} className="mt-10 lg:hidden" />}
      </div>
    </div>
  );
}
