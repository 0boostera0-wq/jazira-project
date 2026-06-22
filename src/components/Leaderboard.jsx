"use client";

import { motion } from "framer-motion";
import { Crown, Medal } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useAuthUser } from "@/context/AuthProvider";
import GoldBadge from "./GoldBadge";

// Simulated competitors. The current user is injected with their real XP.
const SEED = [
  { name: "نورة العتيبي", xp: 980, elite: true },
  { name: "عبدالله القحطاني", xp: 910, elite: true },
  { name: "سارة الدوسري", xp: 870, elite: false },
  { name: "محمد الشهري", xp: 760, elite: false },
  { name: "ريم الغامدي", xp: 690, elite: true },
  { name: "فيصل المطيري", xp: 540, elite: false },
  { name: "لمى الحربي", xp: 430, elite: false },
];

const rankStyles = {
  1: { ring: "ring-[#C9A227]", badge: "bg-[#C9A227]" },
  2: { ring: "ring-[#B9B9B9]", badge: "bg-[#B9B9B9]" },
  3: { ring: "ring-[#CD7F32]", badge: "bg-[#CD7F32]" },
};

export default function Leaderboard() {
  const { xp, isElite } = useApp();
  const { name, isSignedIn } = useAuthUser();

  const me = {
    name: isSignedIn && name ? name : "أنت",
    xp,
    elite: isElite,
    isMe: true,
  };

  const rows = [...SEED, me].sort((a, b) => b.xp - a.xp);

  return (
    <div className="glass-strong rounded-3xl p-5">
      <h3 className="mb-4 flex items-center gap-2 text-lg font-extrabold text-ink">
        <Crown className="text-gold" size={22} /> لوحة المتصدرين
      </h3>
      <div className="space-y-2">
        {rows.map((r, i) => {
          const rank = i + 1;
          const rs = rankStyles[rank];
          return (
            <motion.div
              key={r.name + i}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`flex items-center gap-3 rounded-2xl p-3 ${
                r.isMe ? "bg-champagne-100 ring-2 ring-champagne-400" : "bg-white/50"
              }`}
              style={{ border: "1px solid rgba(201,168,106,0.25)" }}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white ${
                  rs ? rs.badge : "bg-champagne-400"
                }`}
              >
                {rank <= 3 ? <Medal size={16} /> : rank}
              </span>
              <div className="flex flex-1 items-center gap-2">
                <span className={`font-bold ${r.isMe ? "text-gold-dark" : "text-ink"}`}>
                  {r.name}
                </span>
                {r.elite && <GoldBadge />}
                {r.isMe && <span className="text-xs text-ink-muted">(أنت)</span>}
              </div>
              <span className="ltr-nums font-extrabold text-ink">{r.xp} XP</span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
