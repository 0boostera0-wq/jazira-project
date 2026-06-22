"use client";

import { motion } from "framer-motion";
import { BRAND } from "@/lib/constants";

// Two tiny robots that orbit the palm emoji.
function OrbitingRobots({ radius = 28 }) {
  return (
    // Outer ring rotates; each robot counter-rotates so it stays upright.
    <motion.div
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      animate={{ rotate: 360 }}
      transition={{ duration: 9, repeat: Infinity, ease: "linear" }}
      aria-hidden="true"
    >
      {/* Robot A — top of orbit */}
      <motion.div
        className="absolute text-[11px] opacity-70"
        style={{ translateY: -radius }}
        animate={{ rotate: -360 }}
        transition={{ duration: 9, repeat: Infinity, ease: "linear" }}
      >
        🤖
      </motion.div>

      {/* Robot B — bottom of orbit (180° offset) */}
      <motion.div
        className="absolute text-[11px] opacity-70"
        style={{ translateY: radius }}
        animate={{ rotate: -360 }}
        transition={{ duration: 9, repeat: Infinity, ease: "linear" }}
      >
        🤖
      </motion.div>
    </motion.div>
  );
}

export default function BrandLogo({ size = "lg" }) {
  const isLg = size === "lg";

  return (
    <div className="flex items-center gap-3">
      {/* Brand name — RTL text renders right-to-left, emoji at the visual end */}
      <span
        className={`font-extrabold bg-gradient-to-r from-gold to-champagne bg-clip-text text-transparent ${
          isLg ? "text-3xl" : "text-lg"
        }`}
      >
        {BRAND.name}
      </span>

      {/* Emoji + orbiting robots */}
      <div className="relative flex items-center justify-center" style={{ width: isLg ? 52 : 34, height: isLg ? 52 : 34 }}>
        <OrbitingRobots radius={isLg ? 24 : 16} />
        <motion.span
          className={isLg ? "text-4xl" : "text-2xl"}
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
        >
          {BRAND.emoji}
        </motion.span>
      </div>
    </div>
  );
}
