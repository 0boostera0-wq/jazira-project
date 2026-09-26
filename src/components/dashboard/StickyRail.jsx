"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui/cn";

const GAP = 24; // px between the rail and the top bar / viewport bottom

/**
 * Rail that sticks on xl screens (where it sits beside the main column) without ever hiding its lower cards:
 * when it fits the viewport it pins under the top bar; when it's taller it
 * scrolls with the page and pins by its bottom edge (top = viewport − height).
 */
export default function StickyRail({ as: Tag = "aside", className, children, ...rest }) {
  const ref = useRef(null);
  const [top, setTop] = useState(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return undefined;
    const mq = window.matchMedia("(min-width: 1280px)");
    // Cheap reads, and setTop bails out when the value is unchanged, so no rAF
    // throttling is needed (rAF also doesn't run in background tabs).
    const update = () => {
      if (!mq.matches) return setTop(null);
      const topbar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--topbar-h")) || 64;
      const offset = topbar + GAP;
      const fits = el.offsetHeight + offset + GAP <= window.innerHeight;
      return setTop(fits ? offset : Math.round(window.innerHeight - el.offsetHeight - GAP));
    };
    update();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    window.addEventListener("resize", update);
    mq.addEventListener?.("change", update);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
      mq.removeEventListener?.("change", update);
    };
  }, []);

  return (
    <Tag
      ref={ref}
      className={cn("xl:sticky xl:top-[calc(var(--topbar-h)+1.5rem)] xl:self-start", className)}
      style={top === null ? undefined : { top }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
