"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "./cn";
import { useT } from "@/i18n/client";

/**
 * Modal built on the native <dialog> element: focus trap, Esc to close, inert
 * background and top-layer stacking come for free — no portal, no library.
 *   <Dialog open={open} onClose={() => setOpen(false)} title="…">…</Dialog>
 * variant="sheet" renders a bottom sheet on mobile (centred panel ≥ sm).
 * bare = no header and no body padding (command palette, media viewers) —
 *   give it an accessible name with `ariaLabel` (or a string `title`).
 */
export default function Dialog({ open, onClose, title, description, children, footer, size = "md", variant = "modal", bare = false, ariaLabel, className }) {
  const ref = useRef(null);
  const titleId = `jz-dialog-title-${useId().replace(/:/g, "")}`;
  const t = useT("common");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onCancel = (e) => { e.preventDefault(); onClose?.(); };
    el.addEventListener("cancel", onCancel);
    return () => el.removeEventListener("cancel", onCancel);
  }, [onClose]);

  const width = { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" }[size];
  const sheet = variant === "sheet";

  return (
    <dialog
      ref={ref}
      className={cn("jz-dialog", sheet && "jz-sheet")}
      aria-labelledby={title && !bare ? titleId : undefined}
      aria-label={ariaLabel || (bare && typeof title === "string" ? title : undefined)}
      onClick={(e) => { if (e.target === ref.current) onClose?.(); }}
    >
      <div
        className={cn(
          "jz-dialog-panel fixed inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] w-full flex-col bg-surface shadow-lg",
          sheet ? "rounded-t-xl sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-xl" : "rounded-t-xl sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-xl",
          "sm:w-[calc(100%-2rem)]",
          width,
          className
        )}
      >
        {!bare && (title || onClose) && (
          <div className="flex items-start justify-between gap-4 border-b border-line/10 px-5 py-4 sm:px-6">
            <div className="min-w-0">
              {title && <h2 id={titleId} className="t-h4">{title}</h2>}
              {description && <p className="t-small mt-1 text-ink-3">{description}</p>}
            </div>
            {onClose && (
              <button type="button" onClick={onClose} className="-m-1.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={t("a11y.close")}>
                <X size={18} />
              </button>
            )}
          </div>
        )}
        <div className={cn("min-h-0 flex-1 overflow-y-auto", !bare && "px-5 py-5 sm:px-6")}>{open && children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line/10 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">{footer}</div>}
      </div>
    </dialog>
  );
}
