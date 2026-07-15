"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Star, Users } from "lucide-react";

// XP star with a warm light glowing from inside. GPU-friendly (opacity/scale),
// static under reduced-motion.
export function GlowStar({ size = 19 }) {
  const reduce = useReducedMotion();
  return (
    <span className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,214,120,0.95), rgba(201,162,39,0.28) 58%, transparent 72%)", willChange: "transform, opacity" }}
        animate={reduce ? {} : { opacity: [0.55, 1, 0.55], scale: [0.82, 1.08, 0.82] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      />
      <Star size={size} strokeWidth={1.6} fill="#FFE7A6" className="relative text-[#C9A227]" />
    </span>
  );
}

// Successful-invitations icon — two people with a living green illumination.
export function GlowInvites({ size = 19 }) {
  const reduce = useReducedMotion();
  return (
    <span className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(59,166,123,0.9), rgba(59,166,123,0.2) 58%, transparent 72%)", willChange: "transform, opacity" }}
        animate={reduce ? {} : { opacity: [0.5, 0.95, 0.5], scale: [0.86, 1.1, 0.86] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      />
      <Users size={size} strokeWidth={1.7} className="relative text-[#2E9E6B]" />
    </span>
  );
}
