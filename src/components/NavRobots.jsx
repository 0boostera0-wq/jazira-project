"use client";

import { m, useReducedMotion } from "framer-motion";
import Robot from "./Robot";

// Robot mascots that roam BEHIND the navigation (z below the nav pill),
// non-interactive (pointer-events-none), around the fixed island brand mark.
// The robots' LEGS actually walk (CSS gait in Robot); this file choreographs the
// locomotion on one designed ~24s loop with five clear beats:
//   1) walk together   2) stop & react/turn   3) chase & close the gap
//   4) playful bump (dust puff)   5) regroup & walk back → settle
// Plus a far-side idler that stands and looks around. Transform/opacity only.
// Hidden on mobile and fully static (null) under prefers-reduced-motion.
const DUR = 24;
const T = [0, 0.3, 0.4, 0.47, 0.52, 0.58, 0.64, 0.92, 1];
const loop = { duration: DUR, times: T, repeat: Infinity, ease: "easeInOut" };
const TOP = "38px";

export default function NavRobots() {
  const reduce = useReducedMotion();
  if (reduce) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-30 hidden h-20 overflow-hidden sm:block">
      <div className="relative mx-auto h-full max-w-5xl">
        {/* leader */}
        <m.div
          className="absolute opacity-80"
          style={{ left: "20%", top: TOP, willChange: "transform" }}
          animate={{
            x: [10, 96, 96, 80, 92, 92, 92, 10, 10],
            scaleX: [1, 1, -1, -1, -1, -1, -1, -1, 1],
          }}
          transition={loop}
        >
          <Robot size={22} gait={0.8} />
        </m.div>

        {/* follower — trails, then rushes in for the bump */}
        <m.div
          className="absolute opacity-70"
          style={{ left: "20%", top: TOP, willChange: "transform" }}
          animate={{
            x: [-26, 58, 58, 74, 60, 60, 60, -26, -26],
            scaleX: [1, 1, 1, 1, 1, 1, -1, -1, 1],
          }}
          transition={loop}
        >
          <Robot size={19} gait={0.7} />
        </m.div>

        {/* dust puff — fires only at the playful bump */}
        <m.span
          className="absolute h-3 w-3 rounded-full"
          style={{ left: "20%", top: "42px", marginLeft: "76px", background: "radial-gradient(circle, rgba(180,146,63,0.75), transparent 70%)", willChange: "transform, opacity" }}
          animate={{ opacity: [0, 0, 0, 0.9, 0.35, 0, 0, 0, 0], scale: [0.3, 0.3, 0.5, 1.7, 0.9, 0.3, 0.3, 0.3, 0.3] }}
          transition={loop}
        />

        {/* idler — stands on the far side, bobs, looks around, occasional spark */}
        <m.div
          className="absolute opacity-70"
          style={{ right: "17%", top: TOP, willChange: "transform" }}
          animate={{ y: [0, -2.5, 0, 0, -1.5, 0] }}
          transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut" }}
        >
          <Robot size={18} gait={1.15} walk={false} />
          <m.span
            className="absolute -left-1 top-1 h-1.5 w-1.5 rounded-full"
            style={{ background: "radial-gradient(circle, #FFE7A6, transparent 70%)" }}
            animate={{ opacity: [0, 1, 0], scale: [0.4, 1.5, 0.4] }}
            transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 4.5, ease: "easeInOut" }}
          />
        </m.div>
      </div>
    </div>
  );
}
