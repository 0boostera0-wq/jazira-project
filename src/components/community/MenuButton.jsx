"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useDismiss } from "@/components/ui/useDismiss";
import { cn } from "@/components/ui/cn";

/**
 * Small action menu (role="menu"): Escape / outside click close it, arrow
 * keys move between items, focus returns to the trigger.
 *   <MenuButton label="…" trigger={<MoreHorizontal/>} items={[{ key, label, icon, onSelect, tone }]} />
 * `triggerClassName` replaces the default round icon-button styling.
 */
export function MenuButton({ label, trigger, items, align = "end", className, triggerClassName, children }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const btn = useRef(null);
  const menu = useRef(null);
  const id = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(wrap, open, close);

  useEffect(() => {
    if (open) menu.current?.querySelector("[role=menuitem]")?.focus();
  }, [open]);

  const onKey = (e) => {
    const els = [...(menu.current?.querySelectorAll("[role=menuitem]") || [])];
    const i = els.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); els[(i + 1) % els.length]?.focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); els[(i - 1 + els.length) % els.length]?.focus(); }
    if (e.key === "Home") { e.preventDefault(); els[0]?.focus(); }
    if (e.key === "End") { e.preventDefault(); els[els.length - 1]?.focus(); }
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); btn.current?.focus(); }
    if (e.key === "Tab") setOpen(false);
  };

  const visible = (items || []).filter(Boolean);
  if (!visible.length && !children) return null;

  return (
    <div ref={wrap} className={cn("relative", className)}>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        className={
          triggerClassName ||
          cn(
            "grid h-10 w-10 place-items-center rounded-full text-ink-3 transition-colors duration-fast hover:bg-surface-2 hover:text-ink",
            open && "bg-surface-2 text-ink"
          )
        }
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={menu}
          id={id}
          role="menu"
          aria-label={label}
          onKeyDown={onKey}
          className={cn(
            "animate-scale absolute top-full z-30 mt-1.5 min-w-[13rem] overflow-hidden rounded-md border border-line/12 bg-surface p-1.5 shadow-lg",
            align === "end" ? "end-0" : "start-0"
          )}
        >
          {children}
          {visible.map((it) =>
            it.divider ? (
              <div key={it.key} role="separator" className="my-1 h-px bg-line/10" />
            ) : (
              <button
                key={it.key}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => { setOpen(false); it.onSelect?.(); }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-sm px-3 py-2.5 text-start text-sm transition-colors duration-fast focus-visible:bg-surface-2",
                  it.tone === "danger" ? "text-danger hover:bg-danger-soft" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                  it.active && "font-medium text-ink"
                )}
              >
                {it.icon && <it.icon size={16} aria-hidden="true" className="shrink-0" />}
                <span className="min-w-0 flex-1">{it.label}</span>
                {it.end}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
