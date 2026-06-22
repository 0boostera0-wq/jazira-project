"use client";

import { useState } from "react";
import { BookOpen, PencilLine, Mic } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import DrawingCanvas from "@/components/DrawingCanvas";
import ReadingChallenge from "@/components/ReadingChallenge";

const TABS = [
  { key: "write", label: "تدريب الكتابة", icon: PencilLine },
  { key: "read", label: "تحدّي القراءة الصوتي", icon: Mic },
];

export default function ElementaryPage() {
  const [tab, setTab] = useState("write");

  return (
    <div>
      <PageHeader
        title="المرحلة الابتدائية"
        subtitle="أنشطة تفاعلية لتعليم الكتابة والقراءة بأسلوب ممتع"
        icon={BookOpen}
      />

      <div className="mb-6 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 rounded-2xl px-5 py-3 font-bold transition-all ${
              tab === t.key
                ? "bg-gold-gradient text-white shadow-gold"
                : "glass text-ink hover:bg-champagne-100/70"
            }`}
          >
            <t.icon size={18} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "write" ? <DrawingCanvas /> : <ReadingChallenge />}
    </div>
  );
}
