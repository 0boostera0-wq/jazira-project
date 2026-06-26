"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import SubjectIcon from "./SubjectIcon";

// Branch / stage card used for the index + every intermediate level (grades,
// tracks, special-ed sections). Wrap in a <Link>.
export default function StageCard({ node }) {
  const reduce = useReducedMotion();
  const count = node.children?.length ?? (node.subjects?.length || 0);
  const label = node.children ? `${count} أقسام` : `${count} مواد`;

  return (
    <motion.div
      whileHover={reduce ? {} : { y: -6 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className="bezel h-full"
    >
      <div className="bezel-core glass relative flex h-full items-center gap-4 overflow-hidden p-5">
        <span
          className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white shadow-gold"
          style={{ background: `linear-gradient(135deg, ${node.color}, ${node.color}cc)` }}
        >
          <SubjectIcon icon={node.icon} size={26} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-extrabold text-ink">{node.name}</h3>
          <p className="truncate text-xs text-ink-muted">{node.sub || label}</p>
        </div>
        <ChevronLeft className="shrink-0 text-gold" size={20} />
      </div>
    </motion.div>
  );
}
