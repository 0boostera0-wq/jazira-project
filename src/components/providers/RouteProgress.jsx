"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// Instant navigation feedback: a thin gold bar appears the moment an internal
// link is clicked (or router.push fires `jz:navstart`) and completes when the
// new pathname commits. Pure CSS animation — no JS per frame.
export default function RouteProgress() {
  const pathname = usePathname();
  const [state, setState] = useState("idle"); // idle | loading | done
  const failsafe = useRef();

  useEffect(() => {
    const start = () => {
      setState("loading");
      clearTimeout(failsafe.current);
      failsafe.current = setTimeout(() => setState("idle"), 10000);
    };
    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest?.("a[href]");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return; // same page / hash / query
      start();
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("jz:navstart", start);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("jz:navstart", start);
      clearTimeout(failsafe.current);
    };
  }, []);

  useEffect(() => {
    setState((s) => (s === "loading" ? "done" : s));
    const t = setTimeout(() => setState((s) => (s === "done" ? "idle" : s)), 320);
    return () => clearTimeout(t);
  }, [pathname]);

  if (state === "idle") return null;
  return (
    <div
      aria-hidden="true"
      className="route-progress"
      style={
        state === "loading"
          ? { animation: "jz-progress 2.4s var(--ease-out) forwards" }
          : { transform: "scaleX(1)", opacity: 0, transition: "opacity 300ms ease, transform 200ms ease" }
      }
    />
  );
}
