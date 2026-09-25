"use client";

import { useId, useRef } from "react";
import { cn } from "./cn";

/**
 * Accessible tabs / segmented control (arrow-key navigation, RTL-aware).
 *   <Tabs value={tab} onChange={setTab} items={[{ value: "all", label: "الكل", count: 12 }]} />
 * variant="pill" (segmented, default) | "underline"
 * Render the active panel yourself; give it id={`${idBase}-panel-${value}`} if needed.
 */
export default function Tabs({ items, value, onChange, variant = "pill", size = "md", className, label }) {
  const base = useId();
  const refs = useRef([]);

  const onKey = (e, i) => {
    const rtl = document.documentElement.dir === "rtl";
    const fwd = rtl ? "ArrowLeft" : "ArrowRight";
    const back = rtl ? "ArrowRight" : "ArrowLeft";
    let next = null;
    if (e.key === fwd) next = (i + 1) % items.length;
    if (e.key === back) next = (i - 1 + items.length) % items.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = items.length - 1;
    if (next !== null) {
      e.preventDefault();
      refs.current[next]?.focus();
      onChange(items[next].value);
    }
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "no-scrollbar flex max-w-full overflow-x-auto",
        variant === "pill" ? "gap-1 rounded-full border border-line/12 bg-surface-2/80 p-1" : "gap-5 border-b border-line/12",
        className
      )}
    >
      {items.map((it, i) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            ref={(el) => (refs.current[i] = el)}
            role="tab"
            type="button"
            id={`${base}-tab-${it.value}`}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(it.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap font-medium transition-colors duration-fast",
              size === "sm" ? "text-[0.8125rem]" : "text-sm",
              variant === "pill"
                ? cn("rounded-full px-3.5", size === "sm" ? "h-8" : "h-9", active ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink")
                : cn("-mb-px border-b-2 pb-2.5 pt-1", active ? "border-gold-500 text-ink" : "border-transparent text-ink-3 hover:text-ink")
            )}
          >
            {it.icon && <it.icon size={15} aria-hidden="true" />}
            {it.label}
            {typeof it.count === "number" && (
              <span className={cn("rounded-full px-1.5 text-xs tabular", active ? "bg-gold-100 text-gold-700" : "bg-surface-3 text-ink-3")}>{it.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
