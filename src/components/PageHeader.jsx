"use client";

import { motion } from "framer-motion";

export default function PageHeader({ title, subtitle, icon: Icon }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-8"
    >
      <div className="flex items-center gap-3">
        {Icon && (
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-gradient text-white shadow-gold">
            <Icon size={24} />
          </span>
        )}
        <div>
          <h1 className="text-2xl font-extrabold text-ink sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
        </div>
      </div>
    </motion.div>
  );
}
