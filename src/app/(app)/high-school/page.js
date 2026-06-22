"use client";

import { useState } from "react";
import { GraduationCap, Brain, FlaskConical } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import QuduratTest from "@/components/QuduratTest";

const MODES = [
  { key: "qudurat", label: "القدرات", icon: Brain, desc: "لفظي وكمي" },
  { key: "tahsili", label: "التحصيلي", icon: FlaskConical, desc: "علمي وأدبي" },
];

export default function HighSchoolPage() {
  const [mode, setMode] = useState("qudurat");

  return (
    <div>
      <PageHeader
        title="الثانوية — قدرات وتحصيلي"
        subtitle="محرّك اختبارات ذكي بأسئلة عشوائية ومؤقّت صارم لمنع الغش"
        icon={GraduationCap}
      />

      <div className="mb-6 flex gap-2">
        {MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-2xl px-5 py-3 font-bold transition-all sm:flex-none ${
              mode === m.key
                ? "bg-gold-gradient text-white shadow-gold"
                : "glass text-ink hover:bg-champagne-100/70"
            }`}
          >
            <m.icon size={18} />
            <span>{m.label}</span>
            <span className="hidden text-xs opacity-80 sm:inline">— {m.desc}</span>
          </button>
        ))}
      </div>

      <QuduratTest
        key={mode}
        section={mode}
        title={mode === "qudurat" ? "اختبار القدرات العامة" : "الاختبار التحصيلي"}
      />
    </div>
  );
}
