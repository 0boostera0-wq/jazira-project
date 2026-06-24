"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Copy, Check, Users, Gift, UserPlus, Sparkles, Lock } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useAuthUser } from "@/context/AuthProvider";
import { createClient } from "@/lib/supabase-client";

const REWARD_AT = 5;

export default function ReferralProgress() {
  const { referrals, referralRewardUnlocked, syncReferrals } = useApp();
  const { userId, isSignedIn } = useAuthUser();
  const [copied, setCopied] = useState(false);

  // Personal invite link tied to the account id (stable & unique per user).
  const code = userId || "guest";
  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/?ref=${code}`
      : `https://jazira.edu/?ref=${code}`;

  // Pull the authoritative successful-invite count from Supabase.
  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const supabase = createClient();
      const { count } = await supabase
        .from("referrals")
        .select("id", { count: "exact", head: true })
        .eq("referrer_id", userId);
      if (typeof count === "number") syncReferrals(count);
    } catch {
      // table may not exist yet — keep local value
    }
  }, [userId, syncReferrals]);

  useEffect(() => { refresh(); }, [refresh]);

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
          text: "انضم إليّ في منصة جزيرة!",
          url: link,
        });
      } catch {}
    } else {
      copy();
    }
  };

  const toReward = Math.max(0, REWARD_AT - referrals);
  const pct = Math.min(100, Math.round((referrals / REWARD_AT) * 100));

  return (
    <div className="glass-strong rounded-3xl p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-gradient text-white shadow-gold">
          <Gift size={24} />
        </span>
        <div>
          <h3 className="text-lg font-extrabold text-ink">نظام الدعوات</h3>
          <p className="text-sm text-ink-soft">ادعُ أصدقاءك بلا حدود — كل دعوة ناجحة تقرّبك من المزايا</p>
        </div>
      </div>

      {/* Unlimited success counter (no "/5") */}
      <div className="mt-5 flex items-center gap-3 rounded-2xl bg-white/60 p-4">
        <Users size={22} className="text-champagne-500" />
        <div>
          <p className="text-2xl font-extrabold gold-text ltr-nums">{referrals}</p>
          <p className="text-sm font-semibold text-ink-soft">دعوات ناجحة</p>
        </div>
      </div>

      {/* Reward state */}
      {referralRewardUnlocked ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="flex items-center gap-2 font-bold text-emerald-700">
            <Sparkles size={18} /> تم فتح مزايا الدعوات بنجاح
          </p>
          <ul className="mt-2 space-y-1 text-sm text-emerald-800">
            <li className="flex items-center gap-1.5"><Check size={14} /> 5 محاولات إضافية للمساعد الذكي</li>
            <li className="flex items-center gap-1.5"><Check size={14} /> 3 محاولات اختبار مجانية</li>
            <li className="flex items-center gap-1.5"><Check size={14} /> وصول محدود لمزايا مختارة من النخبة</li>
          </ul>
        </div>
      ) : (
        <div className="mt-4">
          <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Lock size={15} className="text-champagne-500" />
            ادعُ {REWARD_AT} أصدقاء وافتح مزايا مجانية إضافية
          </p>
          <div className="h-3 w-full overflow-hidden rounded-full bg-white/60">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.6 }}
              className="h-full rounded-full bg-gold-gradient"
            />
          </div>
          <p className="mt-1.5 text-xs text-ink-muted">
            باقٍ {toReward} {toReward === 1 ? "دعوة" : "دعوات"} لفتح المزايا الإضافية
          </p>
        </div>
      )}

      {/* Personal share link */}
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
        </div>

        {!isSignedIn && (
          <p className="mt-3 text-xs text-ink-muted">
            سجّل الدخول للحصول على رابط دعوة شخصي وتتبّع دعواتك الناجحة.
          </p>
        )}
      </div>
    </div>
  );
}
