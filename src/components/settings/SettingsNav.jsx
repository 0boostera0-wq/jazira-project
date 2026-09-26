"use client";

import { ChevronRight } from "lucide-react";
import { useT } from "@/i18n/client";
import { cn } from "@/components/ui/cn";
import { SECTION_GROUPS, DANGER_SECTION } from "./sections";

// Section links are real hrefs (?section=…) so they work before hydration,
// open in a new tab, and are shareable; a plain click switches in place.
const plainClick = (e) => !(e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);

/** Desktop: compact sticky list with the active section highlighted. */
export function SettingsRail({ active, onOpen, onIntent }) {
  const t = useT("settings");
  const item = (s, danger = false) => {
    const on = s.id === active;
    return (
      <li key={s.id}>
        <a
          href={`?section=${s.id}`}
          aria-current={on ? "page" : undefined}
          onClick={(e) => { if (plainClick(e)) { e.preventDefault(); onOpen(s.id); } }}
          onPointerEnter={() => onIntent?.(s.id)}
          onFocus={() => onIntent?.(s.id)}
          className={cn(
            "group flex h-11 items-center gap-3 rounded-md px-3 text-[0.9375rem] transition-colors duration-fast",
            on ? "bg-surface font-medium text-ink shadow-sm ring-1 ring-line/10" : "text-ink-2 hover:bg-surface-2/80 hover:text-ink",
            danger && !on && "text-danger hover:text-danger"
          )}
        >
          <s.icon size={18} aria-hidden="true" className={cn("shrink-0", on ? (danger ? "text-danger" : "text-gold-600") : danger ? "text-danger/80" : "text-ink-3 group-hover:text-ink-2")} />
          <span className="truncate">{t(`sections.${s.id}.title`)}</span>
        </a>
      </li>
    );
  };
  return (
    <nav aria-label={t("nav.label")} className="space-y-5">
      {SECTION_GROUPS.map((g) => (
        <div key={g.id}>
          <p className="t-caption mb-1.5 px-3 font-medium">{t(`nav.groups.${g.id}`)}</p>
          <ul className="space-y-0.5">{g.sections.map((s) => item(s))}</ul>
        </div>
      ))}
      <div className="border-t border-line/10 pt-3">
        <ul>{item(DANGER_SECTION, true)}</ul>
      </div>
    </nav>
  );
}

/** Phones: grouped list of sections (each row opens the section). */
export function SettingsIndex({ onOpen, onIntent }) {
  const t = useT("settings");
  const row = (s, danger = false) => (
    <li key={s.id}>
      <a
        href={`?section=${s.id}`}
        onClick={(e) => { if (plainClick(e)) { e.preventDefault(); onOpen(s.id); } }}
        onPointerDown={() => onIntent?.(s.id)}
        className="flex min-h-[64px] items-center gap-3.5 px-4 py-3 transition-colors active:bg-surface-2 sm:px-5"
      >
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-sm ring-1 ring-inset", danger ? "bg-danger-soft text-danger ring-danger/15" : "bg-gold-50 text-gold-600 ring-gold-200/60")}>
          <s.icon size={18} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block text-[0.9375rem] font-medium", danger ? "text-danger" : "text-ink")}>{t(`sections.${s.id}.title`)}</span>
          <span className="t-caption block truncate">{t(`sections.${s.id}.desc`)}</span>
        </span>
        <ChevronRight size={18} aria-hidden="true" className="flip-rtl shrink-0 text-ink-4" />
      </a>
    </li>
  );
  return (
    <nav aria-label={t("nav.label")} className="space-y-6">
      {SECTION_GROUPS.map((g) => (
        <div key={g.id}>
          <p className="t-caption mb-2 px-1 font-medium">{t(`nav.groups.${g.id}`)}</p>
          <ul className="surface divide-y divide-line/10 overflow-hidden">{g.sections.map((s) => row(s))}</ul>
        </div>
      ))}
      <ul className="surface overflow-hidden">{row(DANGER_SECTION, true)}</ul>
    </nav>
  );
}
