'use client';

import { motion } from 'framer-motion';
import { Crown, Medal } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useLeaderboard } from '@/hooks/useSupabase';
import GoldBadge from './GoldBadge';

const rankStyles = {
  1: { ring: 'ring-[#C9A227]', badge: 'bg-[#C9A227]' },
  2: { ring: 'ring-[#B9B9B9]', badge: 'bg-[#B9B9B9]' },
  3: { ring: 'ring-[#CD7F32]', badge: 'bg-[#CD7F32]' },
};

function EmptyState() {
  return (
    <div className="glass-strong rounded-3xl p-12 text-center">
      <span className="text-5xl">📊</span>
      <h3 className="mt-4 text-lg font-bold text-ink">
        لا توجد نتائج بعد
      </h3>
      <p className="mt-2 text-sm text-ink-soft">
        ابدأ بحل التحديات لتظهر في لوحة المتصدرين
      </p>
    </div>
  );
}

export default function Leaderboard() {
  const { profile } = useAuth();
  const { leaderboard, loading } = useLeaderboard(10);

  if (loading) {
    return (
      <div className="glass-strong rounded-3xl p-12 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gold"></div>
        <p className="mt-4 text-ink-soft">جاري التحميل...</p>
      </div>
    );
  }

  if (!leaderboard || leaderboard.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="glass-strong rounded-3xl p-5">
      <div className="space-y-3">
        {leaderboard.map((entry, index) => {
          const isMe = profile && entry.id === profile.id;
          const rank = (index + 1);
          const style = rankStyles[rank] || { ring: 'ring-gray-300', badge: 'bg-gray-300' };

          return (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`flex items-center justify-between rounded-2xl p-4 ${
                isMe ? 'bg-gold/10 ring-2 ring-gold' : 'bg-white/30'
              }`}
            >
              <div className="flex items-center gap-3 flex-1">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${style.badge} text-white font-bold`}>
                  {rank === 1 ? <Crown size={20} /> : rank === 2 ? <Medal size={20} /> : rank}
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`font-bold ${isMe ? 'text-gold' : 'text-ink'}`}>
                      {entry.full_name || 'مستخدم'}
                    </span>
                    {entry.is_elite && <GoldBadge />}
                  </div>
                  <p className="text-xs text-ink-soft">{entry.role === 'student' ? 'طالب' : entry.role}</p>
                </div>
              </div>

              <div className="text-right">
                <p className="text-lg font-extrabold gold-text ltr-nums">{entry.xp} XP</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
