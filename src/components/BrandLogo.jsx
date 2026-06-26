"use client";

import { motion, useReducedMotion } from "framer-motion";
import { BRAND } from "@/lib/constants";

// Simple SVG humanoid robot — recognizable at small sizes
function RobotSvg({ size = 16 }) {
  return (
    <svg
      width={size}
      height={Math.round(size * 1.5)}
      viewBox="-9 -23 18 23"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Antenna */}
      <line x1="0" y1="-18" x2="0" y2="-22" stroke="#B8923F" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="0" cy="-23" r="1.2" fill="#E6C77E" />
      {/* Head */}
      <rect x="-5" y="-18" width="10" height="7" rx="2" fill="#D4B984" />
      {/* Eyes */}
      <rect x="-3.5" y="-16" width="2.5" height="2" rx="0.5" fill="#4A3F2F" />
      <rect x="1" y="-16" width="2.5" height="2" rx="0.5" fill="#4A3F2F" />
      {/* Body */}
      <rect x="-6" y="-11" width="12" height="9" rx="2" fill="#C9A86A" />
      {/* Chest detail */}
      <rect x="-2" y="-9" width="4" height="2.5" rx="1" fill="#B8923F" opacity="0.6" />
      {/* Left arm */}
      <rect x="-9" y="-10" width="3" height="6" rx="1.5" fill="#B8923F" />
      {/* Right arm */}
      <rect x="6" y="-10" width="3" height="6" rx="1.5" fill="#B8923F" />
      {/* Left leg */}
      <rect x="-5" y="-2" width="3.5" height="5" rx="1.5" fill="#C9A86A" />
      {/* Right leg */}
      <rect x="1.5" y="-2" width="3.5" height="5" rx="1.5" fill="#C9A86A" />
    </svg>
  );
}

// Two SVG robots that orbit the palm emoji — one chasing the other
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
        <RobotSvg size={14} />
      </motion.div>

      {/* Robot B — bottom (180° behind A — chasing effect) */}
      <motion.div
        className="absolute opacity-90"
        style={{ translateY: radius }}
        animate={{ rotate: -360 }}
        transition={{ duration: 9, repeat: Infinity, ease: "linear" }}
      >
        <RobotSvg size={14} />
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
