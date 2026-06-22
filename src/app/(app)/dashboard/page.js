"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  GraduationCap,
  Users,
  Trophy,
  Sparkles,
  BookOpen,
  Flame,
  Star,
  ArrowLeft,
  Crown,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import GlassCard from "@/components/GlassCard";
import { useApp } from "@/context/AppContext";
import { useAuthUser } from "@/context/AuthProvider";

const SHORTCUTS = [
  { href: "/high-school", icon: GraduationCap, title: "اختبارات القدرات", desc: "ابدأ اختبارًا الآن" },
  { href: "/elementary", icon: BookOpen, title: "المرحلة الابتدائية", desc: "كتابة وقراءة تفاعلية" },
  { href: "/community", icon: Users, title: "المجتمع التعليمي", desc: "شارك إنجازاتك" },
  { href: "/competitions", icon: Trophy, title: "المسابقات", desc: "تصدّر القائمة" },
];

export default function DashboardPage() {
  const { xp, isElite, hasPremiumAccess, referrals, referralTarget } = useApp();
  const { isSignedIn, name } = useAuthUser();

  const stats = [
    { label: "نقاط الخبرة (XP)", value: xp, icon: Star, color: "#C9A227" },
    { label: "السلسلة اليومية", value: "3 أيام", icon: Flame, color: "#E0793B" },
    { label: "الدعوات الناجحة", value: `${referrals}/${referralTarget}`, icon: Users, color: "#7C9A6A" },
  ];

  return (
    <div>
      <PageHeader
        title={isSignedIn && name ? `أهلاً بك، ${name} 👋` : "لوحة التحكم"}
        subtitle="نظرة سريعة على تقدّمك في منصة جزيرة"
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
              {isElite ? "أنت عضو في باقة النخبة ✨" : hasPremiumAccess ? "تم فتح الوصول المميّز 🎉" : "حسابك مجاني"}
            </p>
            <p className="text-sm text-ink-soft">
              {hasPremiumAccess
                ? "تتمتع بوصول كامل لجميع الاختبارات المتقدمة."
                : "اشترك أو ادعُ ٥ أصدقاء لفتح كل الاختبارات."}
            </p>
          </div>
        </div>
        {!hasPremiumAccess && (
          <Link href="/subscriptions" className="btn-gold flex items-center gap-2">
            ترقية الحساب <ArrowLeft size={16} />
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
      <h2 className="mb-3 text-lg font-extrabold text-ink">روابط سريعة</h2>
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
