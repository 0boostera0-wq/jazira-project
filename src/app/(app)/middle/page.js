"use client";

import { BookOpen, Atom, Calculator, Globe2, Languages } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import QuduratTest from "@/components/QuduratTest";

const SUBJECTS = [
  { icon: Calculator, name: "الرياضيات", desc: "الجبر، الهندسة، والإحصاء", color: "#C9A227" },
  { icon: Atom, name: "العلوم", desc: "أحياء، فيزياء، وكيمياء", color: "#3B7A57" },
  { icon: Languages, name: "اللغة العربية", desc: "النحو، الإملاء، والنصوص", color: "#B23A48" },
  { icon: Globe2, name: "الدراسات الاجتماعية", desc: "التاريخ والجغرافيا", color: "#3A6EA5" },
];

export default function MiddlePage() {
  return (
    <div>
      <PageHeader
        title="المرحلة المتوسطة"
        subtitle="مسارات دراسية متكاملة واختبارات تحصيلية تفاعلية"
        icon={BookOpen}
      />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SUBJECTS.map((s) => (
          <div key={s.name} className="glass rounded-3xl p-5 transition-transform hover:-translate-y-1">
            <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: `${s.color}22`, color: s.color }}>
              <s.icon size={22} />
            </span>
            <h3 className="font-extrabold text-ink">{s.name}</h3>
            <p className="mt-1 text-sm text-ink-soft">{s.desc}</p>
          </div>
        ))}
      </div>

      <h2 className="mb-3 text-lg font-extrabold text-ink">اختبار تحصيلي تجريبي</h2>
      <QuduratTest section="all" title="اختبار المرحلة المتوسطة" />
    </div>
  );
}
