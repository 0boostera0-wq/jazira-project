'use client';

import { motion } from 'framer-motion';
import { Trophy, Flame, Star, Lock } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { useAuth } from '@/hooks/useAuth';

const BADGES = [
  { icon: "🎯", name: "أول اختبار", desc: "أكمل اختبارك الأول", need: 0 },
  { icon: "🔥", name: "سلسلة الأسبوع", desc: "٧ أيام متتالية", need: 50 },
  { icon: "📚", name: "مجتهد", desc: "اجمع 100 نقطة XP", need: 100 },
  { icon: "🧠", name: "عبقري القدرات", desc: "اجمع 300 نقطة XP", need: 300 },
  { icon: "👑", name: "نخبة جزيرة", desc: "اجمع 500 نقطة XP", need: 500 },
  { icon: "🏆", name: "بطل المسابقات", desc: "اجمع 1000 نقطة XP", need: 1000 },
];

const WEEK = ["السبت", "الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];

export default function AchievementsPage() {
  const { profile } = useAuth();
  const streakDays = 0;

  return (
    <div>
      <PageHeader
        title="الإنجازات والأوسمة والسلاسل اليومية"
        subtitle="تابع تقدّمك واحصد الأوسمة الذهبية"
        icon={Trophy}
      />

      {/* XP + streak */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="glass-strong flex items-center gap-4 rounded-3xl p-5">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-gradient text-white shadow-gold">
            <Star size={28} />
          </span>
          <div>
            <p className="text-sm text-ink-soft">نقاط الخبرة</p>
          <p className="text-3xl font-extrabold gold-text ltr-nums">{profile?.xp || 0} XP</p>
          </div>
        </div>
        <div className="glass-strong flex items-center gap-4 rounded-3xl p-5">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-orange-500">
            <Flame size={28} />
          </span>
          <div>
            <p className="text-sm text-ink-soft">السلسلة اليومية</p>
            <p className="text-3xl font-extrabold text-ink ltr-nums">{streakDays} أيام</p>
          </div>
        </div>
      </div>

      {/* Weekly streak */}
      <div className="glass mb-6 rounded-3xl p-5">
        <h3 className="mb-3 font-extrabold text-ink">سلسلة هذا الأسبوع</h3>
        <div className="flex justify-between gap-2">
          {WEEK.map((d, i) => {
            const done = i < streakDays;
            return (
              <div key={d} className="flex flex-1 flex-col items-center gap-1.5">
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-2xl text-lg ${
                    done ? "bg-gold-gradient text-white shadow-gold" : "bg-white/60 text-ink-muted"
                  }`}
                >
                  {done ? "🔥" : "·"}
                </span>
                <span className="text-[11px] text-ink-soft">{d}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Badges */}
      <h3 className="mb-3 text-lg font-extrabold text-ink">الأوسمة</h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {BADGES.map((b, i) => {
          const unlocked = (profile?.xp || 0) >= b.need;
          return (
            <motion.div
              key={b.name}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.06 }}
              className={`glass rounded-3xl p-5 text-center ${unlocked ? "" : "opacity-70"}`}
            >
              <span className="relative inline-block text-5xl">
                {b.icon}
                {!unlocked && (
                  <span className="absolute -bottom-1 -left-1 flex h-7 w-7 items-center justify-center rounded-full bg-ink/70 text-white">
                    <Lock size={14} />
                  </span>
                )}
              </span>
              <p className="mt-2 font-extrabold text-ink">{b.name}</p>
              <p className="text-xs text-ink-soft">{b.desc}</p>
              {!unlocked && (
                <p className="mt-1 text-[11px] font-bold text-gold-dark ltr-nums">{b.need} XP</p>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
