"use client";

import { motion } from "framer-motion";
import {
  Info, Sparkles, Bot, Users, GraduationCap, LayoutDashboard,
  Zap, BookOpen, Crown, ShieldCheck, Rocket, Target, Eye, Heart,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { BRAND } from "@/lib/constants";

const FEATURES = [
  { icon: Sparkles, title: "تجربة عربية مصممة للطلاب", text: "واجهة سهلة وواضحة بالعربية الكاملة (RTL) تناسب جميع المراحل." },
  { icon: Bot, title: "مساعد ذكي للمذاكرة", text: "يساعدك في الفهم والمذاكرة وتنظيم وقتك والإجابة على أسئلتك." },
  { icon: Users, title: "مجتمع تعليمي تفاعلي", text: "شارك إنجازاتك وأسئلتك وتفاعل مع زملائك الطلاب." },
  { icon: GraduationCap, title: "استعداد للاختبارات", text: "أدوات وتدريبات تجهّزك للقدرات والتحصيلي بثقة." },
  { icon: LayoutDashboard, title: "لوحة تحكم شاملة", text: "تقدّمك ونتائجك ومهامك في مكان واحد منظّم." },
  { icon: Zap, title: "سريع وخفيف", text: "تصميم خفيف يعمل بسلاسة على الجوال والكمبيوتر." },
  { icon: BookOpen, title: "محتوى منظّم", text: "وصول سريع للمعلومة بدون تشتت أو فوضى." },
  { icon: Crown, title: "اشتراكات واضحة", text: "نظام اشتراك مرن يمنح الطلاب الجادّين مزايا إضافية." },
  { icon: ShieldCheck, title: "خصوصية وأمان", text: "نحافظ على بياناتك وبريدك الإلكتروني ولا نعرضها للآخرين." },
  { icon: Rocket, title: "منصة قابلة للتطوير", text: "مسابقات وإنجازات ومجتمع ومساعد ذكي أقوى باستمرار." },
];

const PILLARS = [
  { icon: Target, title: "رسالتنا", text: "تمكين كل طالب من التميّز عبر تجربة تعليمية فاخرة وممتعة." },
  { icon: Eye, title: "رؤيتنا", text: "أن نكون المنصة التعليمية العربية الأولى للنخبة." },
  { icon: Heart, title: "قيمنا", text: "النزاهة، الإتقان، والابتكار في خدمة الطالب العربي." },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="عن جزيرة" subtitle="من نحن وما الذي يميّزنا" icon={Info} />

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-strong mb-8 overflow-hidden rounded-3xl p-8 text-center relative"
      >
        <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-gold-gradient opacity-20 blur-3xl" />
        <motion.span
          className="inline-block text-6xl"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          {BRAND.emoji}
        </motion.span>
        <h2 className="mt-2 text-3xl font-extrabold gold-text">{BRAND.name}</h2>
        <p className="mx-auto mt-3 max-w-xl leading-relaxed text-ink-soft">
          منصة جزيرة بيئة تعليمية تفاعلية فاخرة تجمع المحتوى الأكاديمي عالي الجودة،
          والذكاء الاصطناعي، والمجتمع التعليمي، في تجربة أنيقة تليق بطموحك — من
          المرحلة الابتدائية حتى اختبارات القدرات والتحصيلي.
        </p>
      </motion.div>

      {/* 10 selling points */}
      <h3 className="mb-4 text-center text-xl font-extrabold text-ink">لماذا منصة جزيرة؟</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FEATURES.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: (i % 2) * 0.05 }}
            className="glass flex items-start gap-3 rounded-3xl p-5"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gold-gradient text-white shadow-gold">
              <f.icon size={22} />
            </span>
            <div>
              <h4 className="font-extrabold text-ink">{f.title}</h4>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">{f.text}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Mission / Vision / Values */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {PILLARS.map((p) => (
          <div key={p.title} className="glass rounded-3xl p-5 text-center">
            <span className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-gradient text-white shadow-gold">
              <p.icon size={24} />
            </span>
            <h3 className="font-extrabold text-ink">{p.title}</h3>
            <p className="mt-1 text-sm text-ink-soft">{p.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
