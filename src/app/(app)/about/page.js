"use client";

import { Info, Target, Eye, Heart } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { BRAND } from "@/lib/constants";

const CARDS = [
  { icon: Target, title: "رسالتنا", text: "تمكين كل طالب من تحقيق التميّز الأكاديمي عبر تجربة تعليمية فاخرة وممتعة." },
  { icon: Eye, title: "رؤيتنا", text: "أن نكون المنصة التعليمية العربية الأولى للنخبة في القدرات والتحصيلي." },
  { icon: Heart, title: "قيمنا", text: "النزاهة، الإتقان، والابتكار في خدمة الطالب العربي." },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="عن جزيرة" subtitle="من نحن وما الذي يميّزنا" icon={Info} />

      <div className="glass-strong mb-6 rounded-3xl p-7 text-center">
        <span className="text-6xl">{BRAND.emoji}</span>
        <h2 className="mt-2 text-2xl font-extrabold gold-text">{BRAND.name}</h2>
        <p className="mx-auto mt-3 max-w-xl leading-relaxed text-ink-soft">
          منصة جزيرة بيئة تعليمية تفاعلية فاخرة صُمّمت لتكون واحتك المعرفية. نجمع بين
          المحتوى الأكاديمي عالي الجودة، والذكاء الاصطناعي، والتنافس الشريف، في تجربة
          أنيقة تليق بطموحك من المرحلة الابتدائية حتى اختبارات القدرات والتحصيلي.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {CARDS.map((c) => (
          <div key={c.title} className="glass rounded-3xl p-5 text-center">
            <span className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-gradient text-white shadow-gold">
              <c.icon size={24} />
            </span>
            <h3 className="font-extrabold text-ink">{c.title}</h3>
            <p className="mt-1 text-sm text-ink-soft">{c.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
