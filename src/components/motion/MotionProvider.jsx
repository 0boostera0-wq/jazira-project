"use client";

import { LazyMotion, domAnimation } from "framer-motion";

// PERF: critical-path components use the lightweight `m` primitive instead of
// `motion`. `motion.*` statically pulls EVERY feature (layout projection, drag,
// gestures, animation). `m` + domAnimation ships only what this app uses.
//
// Verified against framer-motion 11.18.2 source before adopting:
//   const gestureAnimations = { inView, tap, focus, hover }
//   const domAnimation      = { renderer, ...animations, ...gestureAnimations }
//   const domMax            = { ...domAnimation, ...drag, ...layout }
// -> whileInView/whileHover/whileTap/exit/variants are all in domAnimation, and
//    the codebase uses no layout/drag/layoutId props, so domMax is unnecessary.
//
// Not `strict` — routes still using `motion.*` directly keep working.
export default function MotionProvider({ children }) {
  return <LazyMotion features={domAnimation}>{children}</LazyMotion>;
}
