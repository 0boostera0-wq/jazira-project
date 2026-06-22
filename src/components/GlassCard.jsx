"use client";

import { motion } from "framer-motion";

export default function GlassCard({
  children,
  className = "",
  strong = false,
  hover = false,
  ...props
}) {
  return (
    <motion.div
      className={`${strong ? "glass-strong" : "glass"} rounded-3xl ${
        hover ? "transition-transform duration-300 hover:-translate-y-1" : ""
      } ${className}`}
      {...props}
    >
      {children}
    </motion.div>
  );
}
