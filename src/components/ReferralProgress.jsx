"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Copy, Check, Users, Gift, UserPlus } from "lucide-react";
import { useApp } from "@/context/AppContext";

export default function ReferralProgress() {
  const { referrals, referralTarget, referralCode, addReferral, hasPremiumAccess } = useApp();
  const [copied, setCopied] = useState(false);

  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/?ref=${referralCode}`
      : `https://jazira.edu/?ref=${referralCode}`;

  const pct = Math.min(100, Math.round((referrals / referralTarget) * 100));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "منصة جزيرة التعليمية",
          text: "انضم إليّ في منصة جزيرة وافتح اختبارات القدرات!",
          url: link,
        });
      } catch {}
    } else {
      copy();
    }
  };

  return (
    <div className="glass-strong rounded-3xl p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-gradient text-white shadow-gold">
          <Gift size={24} />
        </span>
        <div>
          <h3 className="text-lg font-extrabold text-ink">نظام الدعوات</h3>
          <p className="text-sm text-ink-soft">ادعُ {referralTarget} أصدقاء لفتح الاختبارات مجانًا</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-5">
        <div className="mb-1.5 flex items-center justify-between text-sm font-bold text-ink">
          <span className="flex items-center gap-1">
            <Users size={16} className="text-champagne-500" /> {referrals} / {referralTarget} دعوات ناجحة
          </span>
          <span className="text-gold-dark ltr-nums">{pct}%</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-white/60">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6 }}
            className="h-full rounded-full bg-gold-gradient"
          />
        </div>
        {hasPremiumAccess && (
          <p className="mt-2 flex items-center gap-1 text-sm font-bold text-emerald-700">
            <Check size={16} /> رائع! تم فتح جميع الاختبارات المميّزة.
          </p>
        )}
      </div>

      {/* Share link */}
      <div className="mt-5">
        <p className="mb-1.5 text-sm font-semibold text-ink-soft">رابط الدعوة الخاص بك</p>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={link}
            dir="ltr"
            className="flex-1 truncate rounded-2xl bg-white/70 px-4 py-2.5 text-sm text-ink-soft outline-none"
            style={{ border: "1px solid rgba(201,168,106,0.3)" }}
          />
          <button onClick={copy} className="btn-gold flex items-center gap-1.5 px-4 py-2.5 text-sm">
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "تم النسخ" : "نسخ"}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={share} className="btn-ghost flex items-center gap-2 text-sm">
            <UserPlus size={16} /> مشاركة الرابط
          </button>
          {/* Demo helper to simulate a successful referral */}
          <button
            onClick={addReferral}
            disabled={referrals >= referralTarget}
            className="btn-ghost flex items-center gap-2 text-sm disabled:opacity-50"
            title="محاكاة دعوة ناجحة (للعرض التجريبي)"
          >
            <Users size={16} /> محاكاة دعوة ناجحة
          </button>
        </div>
      </div>
    </div>
  );
}
