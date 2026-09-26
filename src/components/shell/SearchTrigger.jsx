"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { Search } from "lucide-react";
import Dialog from "@/components/ui/Dialog";
import { useT } from "@/i18n/client";
import { cn } from "@/components/ui/cn";

const CommandPalette = dynamic(() => import("./CommandPalette"), {
  ssr: false,
  loading: () => <div className="h-14 animate-fade" />,
});

// The command palette has exactly ONE dialog and ONE Ctrl/⌘ K listener per
// page. The top bar owns the open state and renders two presentational
// triggers (a field on md+, an icon below md) — both stay mounted at every
// width, so neither may own a dialog or a shortcut of its own.

/** Toggle `setOpen` on Ctrl/⌘ K anywhere on the page. Mount once. */
export function useSearchShortcut(setOpen) {
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);
}

/** Desktop search field look-alike (a button that opens the palette). */
export function SearchField({ onOpen, className }) {
  const t = useT("nav");
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-keyshortcuts="Control+K Meta+K"
      className={cn(
        "group flex h-10 w-full items-center gap-2.5 rounded-full border border-line/15 bg-surface/80 px-4 text-start text-sm text-ink-3 shadow-xs transition-colors hover:border-line/25 hover:text-ink-2",
        className
      )}
    >
      <Search size={17} aria-hidden="true" />
      <span className="flex-1 truncate">{t("topbar.searchPlaceholder")}</span>
      <kbd className="rounded-xs border border-line/15 bg-surface-2 px-1.5 py-0.5 font-sans text-xs text-ink-3" dir="ltr">{t("topbar.shortcut")}</kbd>
    </button>
  );
}

/** Mobile search icon button. */
export function SearchIconButton({ onOpen, className }) {
  const tc = useT("common");
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={tc("a11y.search")}
      aria-haspopup="dialog"
      className={cn("grid h-11 w-11 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink", className)}
    >
      <Search size={19} aria-hidden="true" />
    </button>
  );
}

/** The single command-palette dialog (lazy: the palette chunk loads on first open). */
export function SearchDialog({ open, onClose }) {
  const tc = useT("common");
  return (
    <Dialog open={open} onClose={onClose} size="lg" bare ariaLabel={tc("a11y.search")} className="sm:!top-[12vh] sm:!translate-y-0">
      <CommandPalette onClose={onClose} />
    </Dialog>
  );
}
