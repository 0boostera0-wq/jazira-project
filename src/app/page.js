"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { GraduationCap, Sparkles, Users, Trophy, ArrowLeft } from "lucide-react";
import { BRAND } from "@/lib/constants";

const FEATURES = [
  { icon: GraduationCap, title: "اختبارات القدرات والتحصيلي", desc: "محرّك اختبارات ذكي بأسئلة عشوائية ومؤقّت صارم." },
  { icon: Sparkles, title: "مساعد ذكي فاخر", desc: "مرشدك التعليمي على مدار الساعة بتقنية Gemini." },
  { icon: Users, title: "مجتمع تعليمي راقٍ", desc: "شارك إنجازاتك وتنافس مع نخبة الطلاب." },
  { icon: Trophy, title: "مسابقات وجوائز", desc: "تصدّر لوحة المتصدرين واربح جوائز قيّمة." },
];

export default function Landing() {
  return (
    <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 py-16 text-center">
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 18 }}
        className="text-7xl"
      >
        {BRAND.emoji}
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mt-4 text-4xl font-extrabold sm:text-6xl"
      >
        <span className="gold-text">{BRAND.name}</span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mt-4 max-w-xl text-lg text-ink-soft"
      >
        بيئة تعليمية فاخرة للنخبة — مسارات دراسية متكاملة، اختبارات قدرات وتحصيلي،
        ومجتمع تنافسي راقٍ يليق بطموحك.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-8 flex flex-wrap items-center justify-center gap-3"
      >
        <Link href="/dashboard" className="btn-gold flex items-center gap-2">
          ابدأ الآن <ArrowLeft size={18} />
        </Link>
        <Link href="/sign-in" className="btn-ghost">
          تسجيل الدخول
        </Link>
      </motion.div>

      <div className="mt-16 grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 + i * 0.1 }}
            className="glass rounded-3xl p-5 text-right"
          >
            <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gold-gradient text-white shadow-gold">
              <f.icon size={22} />
            </span>
            <h3 className="font-extrabold text-ink">{f.title}</h3>
            <p className="mt-1 text-sm text-ink-soft">{f.desc}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
