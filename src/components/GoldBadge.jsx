"use client";

import { Crown } from "lucide-react";
import { motion } from "framer-motion";

// Gold badge shown next to users with the Elite Package (باقة النخبة).
export default function GoldBadge({ label = "النخبة", size = "sm" }) {
  const sizes = {
    sm: "text-[11px] px-2 py-0.5 gap-1",
    md: "text-xs px-2.5 py-1 gap-1.5",
  };
  const icon = { sm: 12, md: 14 };

  return (
    <motion.span
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`inline-flex items-center rounded-full font-bold text-white shadow-gold ${sizes[size]}`}
      style={{
        background: "linear-gradient(135deg, #E6C77E 0%, #C9A86A 50%, #B8923F 100%)",
      }}
      title="مشترك في باقة النخبة"
    >
      <Crown size={icon[size]} className="drop-shadow" />
      {label}
    </motion.span>
  );
}
