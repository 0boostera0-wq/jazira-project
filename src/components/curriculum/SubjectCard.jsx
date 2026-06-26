"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import SubjectIcon from "./SubjectIcon";

// Premium interactive subject button — double-bezel glass card with an animated
// gradient icon medallion (NOT plain text). Opens the resource sheet on click.
export default function SubjectCard({ subject, count = 0, onClick }) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={reduce ? {} : { y: -6 }}
      whileTap={reduce ? {} : { scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className="group bezel w-full text-right"
      aria-label={`فتح مصادر ${subject.name}`}
    >
      <div className="bezel-core glass relative h-full overflow-hidden p-5">
        <span
          className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-gold"
          style={{ background: `linear-gradient(135deg, ${subject.color}, ${subject.color}cc)` }}
        >
          <SubjectIcon icon={subject.icon} size={26} />
        </span>
        <h3 className="text-base font-extrabold text-ink">{subject.name}</h3>
        <p className="mt-1 text-xs text-ink-muted">
          {count} {count === 1 ? "مصدر" : "مصادر"}
        </p>
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-gold opacity-0 transition-opacity group-hover:opacity-100">
          عرض المصادر <ChevronLeft size={14} />
        </span>
        <div
          className="pointer-events-none absolute -left-6 -top-6 h-20 w-20 rounded-full opacity-20 blur-2xl"
          style={{ background: subject.color }}
        />
      </div>
    </motion.button>
  );
}
