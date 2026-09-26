"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { BookMarked, CornerDownLeft, FileText, Search } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { useLocale, useT } from "@/i18n/client";
import { APP_NAV } from "@/lib/nav";
import { NAV_ICONS } from "./icons";
import { cn } from "@/components/ui/cn";
import { loadCurriculumIndex, normalizeText, searchCurriculum } from "@/lib/search/curriculum-index";

// Instant, local-first command search. Pages and the curriculum tree are
// matched in-memory (zero network); "search everything" hands off to /search,
// which queries the indexed database search. Loaded lazily on first open.
//
// ARIA: combobox (the input keeps focus) + listbox of role="option" items.
// Options are not buttons — nothing interactive is nested inside an option;
// Arrow keys / Enter are handled on the input, pointer clicks on the option.

// Shared Arabic-aware curriculum index (diacritics/alef/ta-marbuta folding),
// loaded as its own chunk on first open — same index as the /search page.
const norm = (text) => normalizeText(text);

// Split a message around its {q} placeholder so the query can be styled and
// bidi-isolated (<bdi>) while punctuation/quotes stay localized.
const MARK = "\u0000";
function splitAround(message) {
  const i = message.indexOf(MARK);
  return i === -1 ? [message, ""] : [message.slice(0, i), message.slice(i + 1)];
}

export default function CommandPalette({ onClose }) {
  const t = useT("nav");
  const tc = useT("common");
  const { locale } = useLocale();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [curr, setCurr] = useState([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const uid = useId().replace(/:/g, "");
  const listId = `jz-cmdk-list-${uid}`;
  const optId = (i) => `jz-cmdk-${uid}-${i}`;

  useEffect(() => {
    inputRef.current?.focus();
    loadCurriculumIndex().then(setCurr).catch(() => {});
  }, []);

  const pages = useMemo(
    () => APP_NAV.flatMap((s) => s.items.map((it) => ({ kind: "page", href: it.href, label: t(`items.${it.key}`), icon: NAV_ICONS[it.icon] }))),
    [t]
  );

  const results = useMemo(() => {
    const nq = norm(q);
    const pageHits = (nq ? pages.filter((p) => norm(p.label).includes(nq)) : pages.slice(0, 6)).slice(0, 6);
    const currHits = nq.length >= 2
      ? searchCurriculum(curr, q, { limit: 8 })
          .map((c) => ({ kind: c.kind, href: c.href, label: locale === "en" ? c.en : c.ar, sub: (locale === "en" ? c.trailEn : c.trailAr).join(" · ") }))
      : [];
    const all = q.trim().length >= 2 ? [{ kind: "all", href: `/search?q=${encodeURIComponent(q.trim())}`, label: q.trim() }] : [];
    return [...all, ...pageHits, ...currHits];
  }, [q, pages, curr, locale]);

  useEffect(() => setActive(0), [q]);

  // Keep the keyboard-selected option visible in the scrolling list.
  useEffect(() => {
    document.getElementById(optId(active))?.scrollIntoView({ block: "nearest" });
    // optId is derived from a stable id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const go = (r) => {
    if (!r) return;
    onClose();
    router.push(r.href);
  };

  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Home" && results.length) { e.preventDefault(); setActive(0); }
    else if (e.key === "End" && results.length) { e.preventDefault(); setActive(results.length - 1); }
    else if (e.key === "Enter") { e.preventDefault(); go(results[active]); }
  };

  const [searchBefore, searchAfter] = splitAround(tc("actions.searchFor", { q: MARK }));
  const hasResults = results.length > 0;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 border-b border-line/10 px-4">
        <Search size={18} className="shrink-0 text-ink-3" aria-hidden="true" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder={t("topbar.searchPlaceholder")}
          aria-label={tc("a11y.search")}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={hasResults}
          aria-controls={hasResults ? listId : undefined}
          aria-activedescendant={hasResults && results[active] ? optId(active) : undefined}
          // the caret is the focus indicator: the input is the modal palette's only control
          className="h-14 w-full bg-transparent text-[1rem] text-ink outline-none placeholder:text-ink-4 focus-visible:shadow-none"
        />
        <kbd className="hidden rounded-xs border border-line/20 px-1.5 py-0.5 font-sans text-xs text-ink-3 sm:block" dir="ltr">{tc("keys.esc")}</kbd>
      </div>

      {/* Polite count announcement (the listbox itself is not a live region). */}
      <p role="status" aria-live="polite" className={hasResults ? "sr-only" : "px-3 py-8 text-center text-sm text-ink-3"}>
        {hasResults ? tc("a11y.resultsCount", { count: results.length }) : tc("states.noResults")}
      </p>

      {hasResults && (
        <ul id={listId} role="listbox" aria-label={tc("a11y.searchResults")} className="max-h-[60dvh] overflow-y-auto p-2">
          {results.map((r, i) => {
            const Icon = r.kind === "all" ? Search : r.kind === "page" ? r.icon || FileText : r.kind === "subject" ? BookMarked : FileText;
            const selected = i === active;
            return (
              <li
                key={`${r.kind}-${r.href}`}
                id={optId(i)}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(i)}
                // keep focus (and the caret) in the input while clicking an option
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(r)}
                className={cn("flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-start transition-colors", selected ? "bg-surface-2 text-ink" : "text-ink-2")}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-sm bg-surface-2 text-ink-3 ring-1 ring-inset ring-line/10">
                  <Icon size={16} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {r.kind === "all" ? (
                      <>{searchBefore}<bdi className="text-gold-700">{r.label}</bdi>{searchAfter}</>
                    ) : r.label}
                  </span>
                  {r.sub && <span className="block truncate text-xs text-ink-3">{r.sub}</span>}
                </span>
                {/* ↵ hint for the keyboard-selected option (same glyph in both directions) */}
                <CornerDownLeft size={15} className={cn("shrink-0 text-ink-3", !selected && "invisible")} aria-hidden="true" />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
