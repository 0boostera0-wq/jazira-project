"use client";

import { useRef } from "react";
import { m, useReducedMotion, useInView } from "framer-motion";

// Cinematic easing used across the site (Linear/Vercel-grade spring feel).
export const EASE = [0.32, 0.72, 0, 1];

// Heavy fade-up as the element enters the viewport (runs once).
// Respects prefers-reduced-motion (renders statically).
//
// PERF: transform + opacity ONLY. This previously also animated
// `filter: blur(8px) -> blur(0)`. filter is NOT a cheap compositor property —
// it forces a main-thread paint, and this component wraps ~20 sections on every
// page, so each scroll kicked off a burst of blur repaints. That showed up in
// Lighthouse as non-composited animations + main-thread work. The fade + slide
// reads the same without it. (`blur` prop kept so existing callers don't break.)
export function Reveal({ children, delay = 0, y = 32, className }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <m.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.8, delay, ease: EASE }}
      className={className}
    >
      {children}
    </m.div>
  );
}

const parent = { hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } } };
const child = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};

// Stagger container — children reveal in sequence as the group scrolls in.
export function Stagger({ children, className }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <m.div
      variants={parent}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      className={className}
    >
      {children}
    </m.div>
  );
}

export function StaggerItem({ children, className }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return <m.div variants={child} className={className}>{children}</m.div>;
}

// Infinite gentle float (GPU-safe transform only). Static under reduced-motion,
// and PAUSED while off-screen so it never burns rAF/CPU on weak devices.
export function Float({ children, className, amount = 10, duration = 6, delay = 0 }) {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const inView = useInView(ref, { margin: "0px 0px -10% 0px" });
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <m.div
      ref={ref}
      animate={inView ? { y: [0, -amount, 0] } : { y: 0 }}
      transition={inView ? { duration, repeat: Infinity, ease: "easeInOut", delay } : { duration: 0.3 }}
      className={className}
    >
      {children}
    </m.div>
  );
}
