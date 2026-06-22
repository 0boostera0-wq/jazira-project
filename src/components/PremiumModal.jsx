'use client';

import { motion } from 'framer-motion';
import { X, Crown, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function PremiumModal({ isOpen, onClose, featureName }) {
  const router = useRouter();

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 flex items-center justify-center px-6 z-50 bg-black/50"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-strong rounded-3xl border border-white/20 p-8 max-w-md w-full"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-ink-soft hover:text-ink transition"
        >
          <X size={24} />
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="flex justify-center mb-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-gold to-champagne">
              <Crown size={32} className="text-white" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-ink mb-2">
            ميزة حصرية للنخبة
          </h2>
          <p className="text-sm text-ink-soft">
            {featureName || 'هذه الميزة'} متاحة لمشتركي باقة النخبة فقط
          </p>
        </div>

        {/* Benefits */}
        <div className="space-y-3 mb-6">
          <div className="flex items-center gap-3">
            <Zap size={20} className="text-gold flex-shrink-0" />
            <span className="text-sm text-ink">مساعد ذكي بلا حدود</span>
          </div>
          <div className="flex items-center gap-3">
            <Zap size={20} className="text-gold flex-shrink-0" />
            <span className="text-sm text-ink">اختبارات متقدمة وتحليلات ذكية</span>
          </div>
          <div className="flex items-center gap-3">
            <Zap size={20} className="text-gold flex-shrink-0" />
            <span className="text-sm text-ink">محتوى تعليمي حصري</span>
          </div>
          <div className="flex items-center gap-3">
            <Zap size={20} className="text-gold flex-shrink-0" />
            <span className="text-sm text-ink">وسام ذهبي في المجتمع</span>
          </div>
        </div>

        {/* Price */}
        <div className="text-center mb-6 p-4 bg-gold/10 rounded-2xl">
          <p className="text-xs text-ink-soft mb-1">السعر الشهري</p>
          <p className="text-3xl font-bold text-ink">
            <span className="gold-text">19</span> ريال
          </p>
        </div>

        {/* CTA */}
        <button
          onClick={() => {
            onClose();
            router.push('/subscriptions');
          }}
          className="w-full rounded-lg bg-gradient-to-r from-gold to-champagne px-4 py-3 font-semibold text-white transition-all hover:shadow-lg hover:opacity-90"
        >
          اشترك الآن
        </button>

        {/* Cancel */}
        <button
          onClick={onClose}
          className="w-full mt-3 rounded-lg border border-white/30 bg-white/20 px-4 py-3 font-medium text-ink transition-all hover:bg-white/30"
        >
          لاحقاً
        </button>
      </motion.div>
    </motion.div>
  );
}

export function RequirePremium({ children, isElite, onUnlock }) {
  if (isElite) {
    return children;
  }

  return (
    <div className="glass-strong rounded-3xl p-8 text-center opacity-50">
      <p className="text-ink-soft mb-4">هذه الميزة متاحة لمشتركي باقة النخبة فقط</p>
      <button
        onClick={onUnlock}
        className="btn-gold"
      >
        اشترك الآن
      </button>
    </div>
  );
}
