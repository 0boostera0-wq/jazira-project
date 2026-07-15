"use client";

import { motion, useReducedMotion } from "framer-motion";
import Robot from "./Robot";

// A small robot troupe that lives BEHIND the navigation (z below the nav pill),
// non-interactive, and lightweight (3 small SVGs, transform-only loops). Cycles
// through gentle states — a leader wandering across, a follower trailing it, and
// an idler bobbing with an occasional spark. Hidden on mobile and under
// prefers-reduced-motion so it never costs weak devices anything.
export default function NavRobots() {
  const reduce = useReducedMotion();
  if (reduce) return null;

  const walk = { times: [0, 0.4, 0.5, 0.9, 1], repeat: Infinity, ease: "easeInOut" };

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-30 hidden h-20 overflow-hidden sm:block">
      <div className="relative mx-auto h-full max-w-4xl">
        {/* leader — walks across · pauses · turns · returns */}
        <motion.div
          className="absolute top-9 opacity-70"
          style={{ left: "13%", willChange: "transform" }}
          animate={{ x: [0, 118, 118, 0, 0], y: [0, -2, 0, -2, 0], scaleX: [1, 1, -1, -1, 1] }}
          transition={{ duration: 21, delay: 0, ...walk }}
        >
          <Robot size={20} />
        </motion.div>

        {/* follower — trails the leader */}
        <motion.div
          className="absolute top-9 opacity-55"
          style={{ left: "13%", willChange: "transform" }}
          animate={{ x: [-24, 92, 92, -24, -24], y: [0, -2, 0, -2, 0], scaleX: [1, 1, -1, -1, 1] }}
          transition={{ duration: 21, delay: 1.2, ...walk }}
        >
          <Robot size={18} />
        </motion.div>

        {/* idler — bobs on the far side, with an occasional spark */}
        <motion.div
          className="absolute top-10 opacity-55"
          style={{ right: "15%", willChange: "transform" }}
          animate={{ y: [0, -3, 0], rotate: [0, 2.5, -2.5, 0] }}
          transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
        >
          <Robot size={17} />
          <motion.span
            className="absolute -left-1 -top-1 h-1.5 w-1.5 rounded-full"
            style={{ background: "radial-gradient(circle, #FFE7A6, transparent 70%)" }}
            animate={{ opacity: [0, 1, 0], scale: [0.4, 1.5, 0.4] }}
            transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 3.2, ease: "easeInOut" }}
          />
        </motion.div>
      </div>
    </div>
  );
}
