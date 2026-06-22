"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Headphones, Mail, MessageSquare, Phone, ChevronDown } from "lucide-react";
import PageHeader from "@/components/PageHeader";

const FAQ = [
  { q: "كيف أبدأ اختبار القدرات؟", a: "اذهب إلى قسم «الثانوية — قدرات وتحصيلي» من القائمة، اختر نوع الاختبار، ثم اضغط «ابدأ الاختبار»." },
  { q: "ما الفرق بين الحساب المجاني وباقة النخبة؟", a: "الحساب المجاني يتيح اختبارًا تجريبيًا واحدًا و٣ رسائل للمساعد الذكي كل ٨ ساعات. باقة النخبة تمنحك وصولًا غير محدود لكل شيء." },
  { q: "كيف أفتح الاختبارات مجانًا؟", a: "ادعُ ٥ أصدقاء عبر رابط الدعوة الخاص بك من صفحة «الاشتراكات»، وستُفتح لك جميع الاختبارات المميّزة." },
  { q: "هل يمكنني الدفع عبر مدى أو Apple Pay؟", a: "نعم، ندعم مدى وApple Pay والبطاقات الائتمانية عبر بوابة دفع آمنة ومشفّرة." },
];

const CHANNELS = [
  { icon: Mail, label: "البريد الإلكتروني", value: "support@jazira.edu" },
  { icon: Phone, label: "الهاتف", value: "+966 5XX XXX XXX" },
  { icon: MessageSquare, label: "الدردشة المباشرة", value: "متاح ٢٤/٧ للنخبة" },
];

export default function SupportPage() {
  const [open, setOpen] = useState(0);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="الدعم الفني" subtitle="نحن هنا لمساعدتك في أي وقت" icon={Headphones} />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {CHANNELS.map((c) => (
          <div key={c.label} className="glass rounded-3xl p-4 text-center">
            <span className="mx-auto mb-2 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gold-gradient text-white shadow-gold">
              <c.icon size={20} />
            </span>
            <p className="text-sm font-bold text-ink">{c.label}</p>
            <p className="text-xs text-ink-soft" dir="ltr">{c.value}</p>
          </div>
        ))}
      </div>

      <h3 className="mb-3 text-lg font-extrabold text-ink">الأسئلة الشائعة</h3>
      <div className="space-y-3">
        {FAQ.map((item, i) => (
          <div key={i} className="glass overflow-hidden rounded-3xl">
            <button
              onClick={() => setOpen(open === i ? -1 : i)}
              className="flex w-full items-center justify-between gap-3 p-4 text-right font-bold text-ink"
            >
              <span>{item.q}</span>
              <motion.span animate={{ rotate: open === i ? 180 : 0 }}>
                <ChevronDown size={20} className="text-champagne-500" />
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {open === i && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <p className="px-4 pb-4 text-sm leading-relaxed text-ink-soft">{item.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
}
