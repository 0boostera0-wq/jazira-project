"use client";

import { useEffect } from "react";

/**
 * Highlights the table-of-contents entry for the section currently being read.
 * Renders nothing: it only toggles `data-active` / `aria-current` on the
 * server-rendered links marked `data-toc-link="<section id>"`. Without JS the
 * table of contents still works as plain anchor links.
 *
 * Active section = the last one whose top has passed a reading line just below
 * the sticky header (so jumping to #section highlights that section, not the
 * one before it). At the very bottom of the page the last section wins.
 * Tapping an entry in the mobile <details> also folds it away.
 */
export default function TocSpy({ ids }) {
  const key = ids.join("|");

  useEffect(() => {
    const sections = key
      .split("|")
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    if (!sections.length) return undefined;

    const links = [...document.querySelectorAll("[data-toc-link]")];
    let current = null;
    const mark = (active) => {
      if (active === current) return;
      current = active;
      for (const a of links) {
        if (a.getAttribute("data-toc-link") === active) {
          a.setAttribute("data-active", "true");
          a.setAttribute("aria-current", "location");
        } else {
          a.removeAttribute("data-active");
          a.removeAttribute("aria-current");
        }
      }
    };

    let frame = 0;
    const update = () => {
      frame = 0;
      const line = Math.max(120, window.innerHeight * 0.3);
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      let active = null;
      for (const s of sections) {
        if (s.getBoundingClientRect().top <= line) active = s.id;
        else break;
      }
      if (atBottom && sections[sections.length - 1].getBoundingClientRect().top < window.innerHeight) {
        active = sections[sections.length - 1].id;
      }
      mark(active);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    // Fold the mobile contents panel once an entry is chosen. This runs before
    // the browser follows the #hash, so the jump lands on the right spot.
    const onClick = (e) => {
      const link = e.target instanceof Element ? e.target.closest("details [data-toc-link]") : null;
      if (link) link.closest("details").open = false;
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("hashchange", schedule);
    document.addEventListener("click", onClick);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("hashchange", schedule);
      document.removeEventListener("click", onClick);
    };
  }, [key]);

  return null;
}
