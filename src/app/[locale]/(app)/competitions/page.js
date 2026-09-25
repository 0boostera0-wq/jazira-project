"use client";

import { motion } from "framer-motion";
import { Trophy } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Leaderboard from "@/components/Leaderboard";
import { PRIZES } from "@/lib/constants";

export default function CompetitionsPage() {
  // Order podium visually: 2nd, 1st, 3rd
  const podium = [PRIZES[1], PRIZES[0], PRIZES[2]];

  return (
    <div>
      <PageHeader
        title="المسابقات"
        subtitle="تنافس بنزاهة واكسب نقاط XP وتصدّر القائمة لتربح الجوائز"
        icon={Trophy}
      />

      {/* Prize podium */}
      <div className="mb-8 grid grid-cols-3 items-end gap-3">
        {podium.map((p) => {
          const isFirst = p.rank === 1;
          return (
            <motion.div
              key={p.rank}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: p.rank * 0.1 }}
              className={`glass-strong flex flex-col items-center rounded-3xl p-4 text-center ${
                isFirst ? "pb-8 pt-6" : ""
              }`}
              style={{ borderColor: `${p.color}66`, borderWidth: 2 }}
            >
              <span className="text-4xl">{p.icon}</span>
              <span
                className="mt-2 flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold text-white"
                style={{ background: p.color }}
              >
                {p.rank}
              </span>
              <p className="mt-2 text-xs font-bold text-ink-soft">{p.label}</p>
              <p className={`font-extrabold text-ink ${isFirst ? "text-lg" : "text-sm"}`}>{p.prize}</p>
            </motion.div>
          );
        })}
      </div>

      <div className="mb-6 rounded-3xl bg-champagne-100/60 p-4 text-center text-sm font-semibold text-ink-soft glass">
        🏆 تُحتسب النقاط من إكمال الاختبارات بنزاهة فقط. أي محاولة غش تُلغي النقاط.
      </div>

      <Leaderboard />
    </div>
  );
}
