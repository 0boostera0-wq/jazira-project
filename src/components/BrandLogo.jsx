"use client";

import { motion, useReducedMotion } from "framer-motion";
import { BRAND } from "@/lib/constants";
import Robot from "@/components/Robot";

// Two upgraded robots that orbit the palm/island mark — one chasing the other
function OrbitingRobots({ radius = 28 }) {
  // Skip the perpetual orbit animation when the user prefers reduced motion.
  if (useReducedMotion()) return null;
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      animate={{ rotate: 360 }}
      transition={{ duration: 9, repeat: Infinity, ease: "linear" }}
      aria-hidden="true"
    >
      {/* Robot A — top of orbit */}
      <motion.div
        className="absolute opacity-90"
        style={{ translateY: -radius }}
        animate={{ rotate: -360 }}
        transition={{ duration: 9, repeat: Infinity, ease: "linear" }}
      >
        <Robot size={14} />
      </motion.div>

      {/* Robot B — bottom (180° behind A — chasing effect) */}
      <motion.div
        className="absolute opacity-90"
        style={{ translateY: radius }}
        animate={{ rotate: -360 }}
        transition={{ duration: 9, repeat: Infinity, ease: "linear" }}
      >
        <Robot size={14} />
      </motion.div>
    </motion.div>
  );
}

export default function BrandLogo({ size = "lg" }) {
  const isLg = size === "lg";
  const reduce = useReducedMotion();

  return (
    <div className="flex items-center gap-3">
      {/* Brand name */}
      <span
        className={`font-extrabold bg-gradient-to-r from-gold to-champagne bg-clip-text text-transparent ${
          isLg ? "text-3xl" : "text-lg"
        }`}
      >
        {BRAND.name}
      </span>

      {/* Palm emoji + orbiting robots */}
      <div
        className="relative flex items-center justify-center"
        style={{ width: isLg ? 52 : 34, height: isLg ? 52 : 34 }}
      >
        <OrbitingRobots radius={isLg ? 24 : 16} />
        <motion.span
          className={isLg ? "text-4xl" : "text-2xl"}
          animate={reduce ? undefined : { y: [0, -5, 0] }}
          transition={reduce ? undefined : { duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
        >
          {BRAND.emoji}
        </motion.span>
      </div>
    </div>
  );
}
