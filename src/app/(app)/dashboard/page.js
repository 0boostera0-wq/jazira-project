"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  GraduationCap, Users, Trophy, Sparkles, BookOpen, Flame, Star, ArrowLeft, Crown,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import GlassCard from "@/components/GlassCard";
import { useApp } from "@/context/AppContext";
import { useAuthUser } from "@/context/AuthProvider";
import { usePreferences } from "@/context/PreferencesProvider";
import { useStreak } from "@/hooks/useStreak";
import { createClient } from "@/lib/supabase-client";

export default function DashboardPage() {
  const { isElite, hasPremiumAccess } = useApp();
  const { isSignedIn, userId, name } = useAuthUser();
  const { t, isRTL } = usePreferences();
  const { streak } = useStreak(userId);

  // Real, persisted values from Supabase (no hard-coded/mock numbers).
  const [xp, setXp] = useState(0);
  const [referrals, setReferrals] = useState(0);

  useEffect(() => {
    if (!userId) { setXp(0); setReferrals(0); return; }
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      try {
        const { data } = await supabase.from("profiles").select("xp").eq("id", userId).single();
        if (!cancelled) setXp(data?.xp ?? 0);
      } catch {}
      try {
        const { count } = await supabase
          .from("referrals")
          .select("id", { count: "exact", head: true })
          .eq("referrer_id", userId);
        if (!cancelled && typeof count === "number") setReferrals(count);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const stats = [
    { label: t("نقاط الخبرة (XP)", "Experience (XP)"), value: xp, icon: Star, color: "#C9A227" },
    { label: t("السلسلة اليومية", "Daily streak"), value: t(`${streak} يوم`, `${streak} days`), icon: Flame, color: "#E0793B" },
    { label: t("الدعوات الناجحة", "Successful invites"), value: t(`${referrals} دعوات ناجحة`, `${referrals} invites`), icon: Users, color: "#7C9A6A" },
  ];

  const SHORTCUTS = [
    { href: "/high-school", icon: GraduationCap, title: t("اختبارات القدرات", "Aptitude tests"), desc: t("ابدأ اختبارًا الآن", "Start a test now") },
    { href: "/elementary", icon: BookOpen, title: t("المرحلة الابتدائية", "Elementary"), desc: t("كتابة وقراءة تفاعلية", "Interactive reading & writing") },
    { href: "/community", icon: Users, title: t("المجتمع التعليمي", "Community"), desc: t("شارك إنجازاتك", "Share your achievements") },
    { href: "/competitions", icon: Trophy, title: t("المسابقات", "Competitions"), desc: t("تصدّر القائمة", "Top the leaderboard") },
  ];

  return (
    <div>
      <PageHeader
        title={isSignedIn && name ? t(`أهلاً بك، ${name} 👋`, `Welcome, ${name} 👋`) : t("لوحة التحكم", "Dashboard")}
        subtitle={t("نظرة سريعة على تقدّمك في منصة جزيرة", "A quick look at your progress on Jazira")}
        icon={Sparkles}
      />

      {/* Premium status banner */}
      <GlassCard strong className="mb-6 flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-gradient text-white shadow-gold">
            <Crown size={24} />
          </span>
          <div>
            <p className="font-extrabold text-ink">
              {isElite
                ? t("أنت عضو في باقة النخبة ✨", "You're an Elite member ✨")
                : hasPremiumAccess
                ? t("تم فتح الوصول المميّز 🎉", "Premium access unlocked 🎉")
                : t("حسابك مجاني", "Free account")}
            </p>
            <p className="text-sm text-ink-soft">
              {hasPremiumAccess
                ? t("تتمتع بوصول كامل لجميع الاختبارات المتقدمة.", "You have full access to all advanced tests.")
                : t("اشترك أو ادعُ ٥ أصدقاء لفتح كل الاختبارات.", "Subscribe or invite 5 friends to unlock all tests.")}
            </p>
          </div>
        </div>
        {!hasPremiumAccess && (
          <Link href="/subscriptions" className="btn-gold flex items-center gap-2">
            {t("ترقية الحساب", "Upgrade")} <ArrowLeft size={16} className={isRTL ? "" : "rotate-180"} />
          </Link>
        )}
      </GlassCard>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="glass rounded-3xl p-5"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: `${s.color}22`, color: s.color }}>
                <s.icon size={22} />
              </span>
              <span className="text-2xl font-extrabold text-ink ltr-nums">{s.value}</span>
            </div>
            <p className="mt-3 text-sm font-semibold text-ink-soft">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Shortcuts */}
      <h2 className="mb-3 text-lg font-extrabold text-ink">{t("روابط سريعة", "Quick links")}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SHORTCUTS.map((s, i) => (
          <motion.div
            key={s.href}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
          >
            <Link href={s.href} className="glass block rounded-3xl p-5 transition-transform hover:-translate-y-1">
              <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gold-gradient text-white shadow-gold">
                <s.icon size={22} />
              </span>
              <h3 className="font-extrabold text-ink">{s.title}</h3>
              <p className="mt-1 text-sm text-ink-soft">{s.desc}</p>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
