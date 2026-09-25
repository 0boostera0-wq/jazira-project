"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Search } from "lucide-react";
import Dialog from "@/components/ui/Dialog";
import { useT } from "@/i18n/client";
import { cn } from "@/components/ui/cn";

const CommandPalette = dynamic(() => import("./CommandPalette"), {
  ssr: false,
  loading: () => <div className="h-14 animate-fade" />,
});

/** Search field (desktop) / icon (mobile) that opens the command palette. Ctrl/⌘ K anywhere. */
export default function SearchTrigger({ variant = "field", className }) {
  const t = useT("nav");
  const tc = useT("common");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {variant === "field" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "group flex h-10 w-full items-center gap-2.5 rounded-full border border-line/15 bg-surface/80 px-4 text-start text-sm text-ink-4 shadow-xs transition-colors hover:border-line/25 hover:text-ink-3",
            className
          )}
        >
          <Search size={17} aria-hidden="true" />
          <span className="flex-1 truncate">{t("topbar.searchPlaceholder")}</span>
          <kbd className="rounded-xs border border-line/15 bg-surface-2 px-1.5 py-0.5 font-sans text-[11px] text-ink-3" dir="ltr">{t("topbar.shortcut")}</kbd>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={tc("a11y.search")}
          className={cn("grid h-10 w-10 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink", className)}
        >
          <Search size={19} aria-hidden="true" />
        </button>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} size="lg" bare className="sm:!top-[12vh] sm:!translate-y-0">
        <CommandPalette onClose={() => setOpen(false)} />
      </Dialog>
    </>
  );
}
