"use client";

import { motion, useReducedMotion } from "framer-motion";
import Robot from "./Robot";

// A small robot troupe that lives BEHIND the navigation (z below the nav pill),
// non-interactive (pointer-events-none), and lightweight — 3 small SVGs + a puff,
// all transform/opacity only. One choreographed loop rotates through several
// gentle states so it never looks like a cheap single repeat:
//   walk together → pause & turn (greet) → playful bump (tiny dust puff) →
//   regroup → walk back → settle · plus a far-side idler that looks around.
// Hidden on mobile and disabled under prefers-reduced-motion.
const DUR = 26;
const T = [0, 0.22, 0.3, 0.34, 0.4, 0.48, 0.55, 0.8, 1];
const loop = { duration: DUR, times: T, repeat: Infinity, ease: "easeInOut" };

export default function NavRobots() {
  const reduce = useReducedMotion();
  if (reduce) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-30 hidden h-20 overflow-hidden sm:block">
      <div className="relative mx-auto h-full max-w-4xl">
        {/* leader */}
        <motion.div
          className="absolute top-9 opacity-70"
          style={{ left: "16%", willChange: "transform" }}
          animate={{ x: [0, 66, 66, 82, 66, 66, 66, 0, 0], y: [0, -2, 0, -5, 0, -2, 0, -2, 0], scaleX: [1, 1, -1, -1, -1, -1, 1, 1, 1] }}
          transition={loop}
        >
          <Robot size={20} />
        </motion.div>

        {/* follower — trails, then meets the leader for the bump */}
        <motion.div
          className="absolute top-9 opacity-55"
          style={{ left: "24%", willChange: "transform" }}
          animate={{ x: [-16, 44, 44, 28, 44, 44, 44, -16, -16], y: [0, -2, 0, -5, 0, -2, 0, -2, 0], scaleX: [1, 1, 1, 1, 1, 1, -1, -1, 1] }}
          transition={loop}
        >
          <Robot size={18} />
        </motion.div>

        {/* dust puff — fires only at the playful bump moment */}
        <motion.span
          className="absolute top-11 h-2.5 w-2.5 rounded-full"
          style={{ left: "22%", background: "radial-gradient(circle, rgba(180,146,63,0.7), transparent 70%)", willChange: "transform, opacity" }}
          animate={{ opacity: [0, 0, 0, 0.9, 0, 0, 0, 0, 0], scale: [0.3, 0.3, 0.5, 1.6, 0.6, 0.3, 0.3, 0.3, 0.3] }}
          transition={loop}
        />

        {/* idler — sits on the far side · gentle bob + occasional look-around */}
        <motion.div
          className="absolute top-10 opacity-55"
          style={{ right: "16%", willChange: "transform" }}
          animate={{ y: [0, -3, 0, 0, -2, 0], rotate: [0, 0, 6, -6, 0, 0] }}
          transition={{ duration: 7.5, repeat: Infinity, ease: "easeInOut" }}
        >
          <Robot size={17} />
          <motion.span
            className="absolute -left-1 -top-1 h-1.5 w-1.5 rounded-full"
            style={{ background: "radial-gradient(circle, #FFE7A6, transparent 70%)" }}
            animate={{ opacity: [0, 1, 0], scale: [0.4, 1.5, 0.4] }}
            transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 4, ease: "easeInOut" }}
          />
        </motion.div>
      </div>
    </div>
  );
}
