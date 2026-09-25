"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpLeft, BookMarked, CornerDownLeft, FileText, Search } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { useLocale, useT } from "@/i18n/client";
import { APP_NAV } from "@/lib/nav";
import { NAV_ICONS } from "./icons";
import { cn } from "@/components/ui/cn";

// Instant, local-first command search. Pages and the curriculum tree are
// matched in-memory (zero network); "search everything" hands off to /search,
// which queries the indexed database search. Loaded lazily on first open.

const norm = (s) =>
  (s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[ً-ٰٟ]/g, "") // Arabic diacritics
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .trim();

let curriculumIndex = null;
async function loadCurriculumIndex() {
  if (curriculumIndex) return curriculumIndex;
  const { CURRICULUM } = await import("@/lib/curriculum");
  const out = [];
  const walk = (nodes, path, trail) => {
    for (const n of nodes) {
      const p = [...path, n.id];
      const href = `/curriculum/${p.join("/")}`;
      const tr = [...trail, n];
      out.push({ kind: "node", href, ar: n.name, en: n.name_en || n.name, trailAr: tr.map((x) => x.name), trailEn: tr.map((x) => x.name_en || x.name) });
      for (const s of n.subjects || []) {
        out.push({ kind: "subject", href: `${href}?subject=${s.id}`, ar: s.name, en: s.name_en || s.name, trailAr: tr.map((x) => x.name), trailEn: tr.map((x) => x.name_en || x.name) });
      }
      if (n.children) walk(n.children, p, tr);
    }
  };
  walk(CURRICULUM, [], []);
  curriculumIndex = out;
  return out;
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
      ? curr
          .filter((c) => norm(c.ar).includes(nq) || norm(c.en).includes(nq))
          .slice(0, 8)
          .map((c) => ({ kind: c.kind, href: c.href, label: locale === "en" ? c.en : c.ar, sub: (locale === "en" ? c.trailEn : c.trailAr).join(" · ") }))
      : [];
    const all = q.trim().length >= 2 ? [{ kind: "all", href: `/search?q=${encodeURIComponent(q.trim())}`, label: q.trim() }] : [];
    return [...all, ...pageHits, ...currHits];
  }, [q, pages, curr, locale]);

  useEffect(() => setActive(0), [q]);

  const go = (r) => {
    if (!r) return;
    onClose();
    router.push(r.href);
  };

  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); go(results[active]); }
  };

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
          aria-expanded="true"
          aria-controls="jz-cmdk-list"
          aria-activedescendant={results[active] ? `jz-cmdk-${active}` : undefined}
          className="h-14 w-full bg-transparent text-[1rem] text-ink placeholder:text-ink-4 focus:outline-none"
        />
        <kbd className="hidden rounded-xs border border-line/20 px-1.5 py-0.5 text-[11px] text-ink-3 sm:block">Esc</kbd>
      </div>
      <ul id="jz-cmdk-list" role="listbox" className="max-h-[60dvh] overflow-y-auto p-2">
        {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-ink-3">{tc("states.noResults")}</li>}
        {results.map((r, i) => {
          const Icon = r.kind === "all" ? Search : r.kind === "page" ? r.icon || FileText : r.kind === "subject" ? BookMarked : FileText;
          return (
            <li key={`${r.kind}-${r.href}`} id={`jz-cmdk-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(r)}
                className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-start transition-colors", i === active ? "bg-surface-2 text-ink" : "text-ink-2")}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-sm bg-surface-2 text-ink-3 ring-1 ring-inset ring-line/10">
                  <Icon size={16} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {r.kind === "all" ? <>{tc("actions.search")}: <span className="text-gold-700">“{r.label}”</span></> : r.label}
                  </span>
                  {r.sub && <span className="block truncate text-xs text-ink-3">{r.sub}</span>}
                </span>
                {i === active ? <CornerDownLeft size={15} className="shrink-0 text-ink-4 ltr:-scale-x-100" aria-hidden="true" /> : <ArrowUpLeft size={15} className="shrink-0 text-ink-4 opacity-0 ltr:-scale-x-100" aria-hidden="true" />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
