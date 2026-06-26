"use client";

import { useRef } from "react";
import { motion, useReducedMotion, useInView } from "framer-motion";

// Cinematic easing used across the site (Linear/Vercel-grade spring feel).
export const EASE = [0.32, 0.72, 0, 1];

// Heavy fade-up + de-blur as the element enters the viewport (runs once).
// Respects prefers-reduced-motion (renders statically).
export function Reveal({ children, delay = 0, y = 32, className, blur = true }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      initial={{ opacity: 0, y, filter: blur ? "blur(8px)" : "blur(0px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.8, delay, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const parent = { hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } } };
const child = {
  hidden: { opacity: 0, y: 24, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.7, ease: EASE } },
};

// Stagger container — children reveal in sequence as the group scrolls in.
export function Stagger({ children, className }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      variants={parent}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return <motion.div variants={child} className={className}>{children}</motion.div>;
}

// Infinite gentle float (GPU-safe transform only). Static under reduced-motion,
// and PAUSED while off-screen so it never burns rAF/CPU on weak devices.
export function Float({ children, className, amount = 10, duration = 6, delay = 0 }) {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const inView = useInView(ref, { margin: "0px 0px -10% 0px" });
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      ref={ref}
      animate={inView ? { y: [0, -amount, 0] } : { y: 0 }}
      transition={inView ? { duration, repeat: Infinity, ease: "easeInOut", delay } : { duration: 0.3 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
