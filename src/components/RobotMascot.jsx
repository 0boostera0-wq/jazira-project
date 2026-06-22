"use client";

import { motion } from "framer-motion";

/**
 * Premium animated robot mascot for the AI Assistant header.
 * - Idle state: gentle floating + blinking.
 * - Thinking state (isThinking): a thought bubble with 3 pulsing dots.
 */
export default function RobotMascot({ isThinking = false, size = 60 }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Thought bubble (thinking state) */}
      {isThinking && (
        <motion.div
          initial={{ opacity: 0, y: 6, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0 }}
          className="absolute -top-5 -left-3 z-10 flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 shadow-glass"
          style={{ border: "1px solid rgba(201,168,106,0.4)" }}
        >
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="block h-1.5 w-1.5 rounded-full"
              style={{ background: "#C9A227" }}
              animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
            />
          ))}
        </motion.div>
      )}

      <motion.svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        animate={
          isThinking
            ? { y: [0, -2, 0], rotate: [0, -3, 3, 0] }
            : { y: [0, -5, 0] }
        }
        transition={{
          duration: isThinking ? 1.2 : 3,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <defs>
          <linearGradient id="robotGold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F1E4C8" />
            <stop offset="50%" stopColor="#E6C77E" />
            <stop offset="100%" stopColor="#C9A86A" />
          </linearGradient>
          <linearGradient id="robotFace" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFDF9" />
            <stop offset="100%" stopColor="#F5EBD9" />
          </linearGradient>
        </defs>

        {/* Antenna */}
        <line x1="50" y1="14" x2="50" y2="26" stroke="#B8923F" strokeWidth="2.5" />
        <motion.circle
          cx="50"
          cy="11"
          r="4"
          fill="#C9A227"
          animate={{ scale: isThinking ? [1, 1.4, 1] : [1, 1.15, 1] }}
          transition={{ duration: isThinking ? 0.7 : 1.6, repeat: Infinity }}
        />

        {/* Head */}
        <rect x="22" y="26" width="56" height="46" rx="16" fill="url(#robotGold)" stroke="#B8923F" strokeWidth="2" />

        {/* Ears */}
        <rect x="14" y="40" width="8" height="18" rx="4" fill="#C9A86A" />
        <rect x="78" y="40" width="8" height="18" rx="4" fill="#C9A86A" />

        {/* Face screen */}
        <rect x="30" y="34" width="40" height="30" rx="11" fill="url(#robotFace)" stroke="#D4B984" strokeWidth="1.5" />

        {/* Eyes (blink on idle) */}
        <motion.g
          animate={isThinking ? {} : { scaleY: [1, 0.1, 1] }}
          transition={{ duration: 0.25, repeat: Infinity, repeatDelay: 2.6 }}
          style={{ transformOrigin: "50px 47px" }}
        >
          <circle cx="41" cy="47" r="4.2" fill="#4A3F2F" />
          <circle cx="59" cy="47" r="4.2" fill="#4A3F2F" />
          <circle cx="42.4" cy="45.6" r="1.3" fill="#fff" />
          <circle cx="60.4" cy="45.6" r="1.3" fill="#fff" />
        </motion.g>

        {/* Mouth */}
        {isThinking ? (
          <circle cx="50" cy="57" r="2.6" fill="#C9A227" />
        ) : (
          <path d="M42 56 Q50 62 58 56" stroke="#C9A227" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        )}

        {/* Cheeks */}
        <circle cx="34" cy="55" r="2.4" fill="#E6C77E" opacity="0.7" />
        <circle cx="66" cy="55" r="2.4" fill="#E6C77E" opacity="0.7" />
      </motion.svg>
    </div>
  );
}
