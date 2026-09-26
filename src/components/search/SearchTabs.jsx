"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui/cn";

const FADE = 28; // px of edge fade where more tabs are scrolled out of view

/**
 * Result-type tabs with live counts ("20+" when a group hit the RPC cap).
 * Same look as the ui/Tabs pill control; its own component because counts can
 * be strings and can be "pending" (a soft dot while the database answers).
 * On narrow screens the row scrolls: the edge that hides tabs fades out, and
 * the active tab is always scrolled into view (e.g. after "View all").
 *   items: [{ value, label, count?: string|null, pending?: boolean }]
 */
export default function SearchTabs({ items, value, onChange, label, idBase }) {
  const refs = useRef([]);
  const listRef = useRef(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const max = list.scrollWidth - list.clientWidth;
    const pos = Math.abs(list.scrollLeft); // RTL scrollLeft runs 0 → negative
    const next = { start: max > 1 && pos > 1, end: max > 1 && pos < max - 1 };
    setEdges((e) => (e.start === next.start && e.end === next.end ? e : next));
  }, []);

  // Counts appearing change the scroll width without resizing the row: re-measure after every render.
  useEffect(measure);
  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => ro.disconnect();
  }, [measure]);

  const activeIndex = items.findIndex((it) => it.value === value);
  useEffect(() => {
    const list = listRef.current;
    const el = refs.current[activeIndex];
    if (!list || !el || list.scrollWidth <= list.clientWidth) return;
    const l = list.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const pad = FADE + 4;
    if (r.left < l.left + pad) list.scrollBy({ left: r.left - l.left - pad, behavior: "smooth" });
    else if (r.right > l.right - pad) list.scrollBy({ left: r.right - l.right + pad, behavior: "smooth" });
  }, [activeIndex]);

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

  // Fade only the edge(s) hiding tabs. Logical: "start" is the right edge in RTL.
  const rtl = typeof document !== "undefined" && document.documentElement.dir === "rtl";
  const leftFade = rtl ? edges.end : edges.start;
  const rightFade = rtl ? edges.start : edges.end;
  const mask =
    leftFade || rightFade
      ? `linear-gradient(to right, ${leftFade ? "transparent" : "#000"} 0, #000 ${leftFade ? FADE : 0}px, #000 calc(100% - ${rightFade ? FADE : 0}px), ${rightFade ? "transparent" : "#000"} 100%)`
      : undefined;

  return (
    <div className="max-w-full rounded-full border border-line/12 bg-surface-2/80">
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        onScroll={measure}
        style={mask ? { WebkitMaskImage: mask, maskImage: mask } : undefined}
        className="no-scrollbar flex gap-1 overflow-x-auto rounded-full p-1"
      >
        {items.map((it, i) => {
          const active = it.value === value;
          return (
            <button
              key={it.value}
              ref={(el) => (refs.current[i] = el)}
              role="tab"
              type="button"
              id={`${idBase}-tab-${it.value}`}
              aria-selected={active}
              aria-controls={`${idBase}-panel`}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(it.value)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                "inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm font-medium transition-colors duration-fast sm:h-9",
                active ? "bg-surface text-ink shadow-sm focus-visible:[box-shadow:var(--ring)]" : "text-ink-3 hover:text-ink"
              )}
            >
              {it.label}
              {it.count != null ? (
                <span className={cn("rounded-full px-1.5 text-xs leading-5 tabular", active ? "bg-gold-100 text-gold-700" : "bg-surface-3 text-ink-3")}>
                  {it.count}
                </span>
              ) : it.pending ? (
                <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-4/70" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
