"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, FileText, BookOpen, ClipboardCheck, X, Info, FolderOpen } from "lucide-react";
import { TERM_FILTERS } from "@/lib/curriculum";
import SubjectCard from "./SubjectCard";
import PdfViewerModal from "./PdfViewerModal";

const KIND = {
  textbook: { label: "كتاب الطالب", Icon: BookOpen },
  workbook: { label: "كتاب النشاط", Icon: FileText },
  exam: { label: "نماذج اختبارات", Icon: ClipboardCheck },
};

// Leaf experience: a term filter bar → grid of animated subject cards → tap a
// subject → a resource sheet of file cards (filtered by the chosen term) → tap a
// file → the in-app PDF viewer opens.
export default function SubjectBrowser({ subjects = [] }) {
  const [term, setTerm] = useState("all"); // all | t1 | t2 | t3
  const [selected, setSelected] = useState(null); // subject
  const [resource, setResource] = useState(null); // resource to view

  // Resources for the current subject filtered by the selected term.
  const sheetResources = useMemo(() => {
    if (!selected) return [];
    const all = selected.resources || [];
    return term === "all" ? all : all.filter((r) => r.term === term);
  }, [selected, term]);

  const countFor = (s) => {
    const all = s.resources || [];
    return term === "all" ? all.length : all.filter((r) => r.term === term).length;
  };

  if (!subjects.length) {
    return (
      <div className="bezel">
        <div className="bezel-core glass-strong p-8 text-center text-ink-soft">
          لا توجد مواد مُضافة لهذا القسم بعد.
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Term filter bar */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="ml-1 text-sm font-bold text-ink-muted">الفصل الدراسي:</span>
        {TERM_FILTERS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTerm(t.id)}
            className={`rounded-full px-4 py-2 text-sm font-bold transition-all ${
              term === t.id
                ? "bg-gold-gradient text-white shadow-gold"
                : "glass text-ink hover:bg-white/70"
            }`}
          >
            {t.short}
          </button>
        ))}
      </div>

      {/* Subjects grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {subjects.map((s) => (
          <SubjectCard key={s.id} subject={s} count={countFor(s)} onClick={() => setSelected(s)} />
        ))}
      </div>

      {/* Placeholder note — tells the admin where approved PDFs get added later */}
      <div
        className="mt-6 flex items-start gap-3 rounded-2xl bg-white/55 p-4 text-sm text-ink-soft"
        style={{ border: "1px solid rgba(201,168,106,0.25)" }}
      >
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gold-gradient text-white">
          <Info size={15} />
        </span>
        <p className="leading-relaxed">
          المصادر معروضة كبطاقات لكل مادة وفصل دراسي. تُعرض حالياً كنماذج مبدئية — ستظهر ملفات
          الكتب والاختبارات المعتمدة (PDF) فور رفعها إلى مخزن المحتوى الخاص بالمنصة
          <span className="mx-1 rounded bg-champagne-100 px-1.5 py-0.5 font-mono text-xs text-ink" dir="ltr">CONTENT_BASE_URL</span>
          دون أي تعديل على الواجهة.
        </p>
      </div>

      {/* Resource sheet */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] grid place-items-end bg-ink/50 backdrop-blur-sm sm:place-items-center sm:p-4"
            onClick={() => setSelected(null)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="bezel max-h-[85vh] w-full overflow-hidden sm:max-w-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bezel-core glass-strong flex max-h-[85vh] flex-col p-6">
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="text-lg font-extrabold text-ink">{selected.name}</h3>
                  <button
                    onClick={() => setSelected(null)}
                    className="rounded-full p-1.5 text-ink-soft transition hover:bg-white/60"
                    aria-label="إغلاق"
                  >
                    <X size={20} />
                  </button>
                </div>
                <p className="mb-4 text-xs font-bold text-ink-muted">
                  {TERM_FILTERS.find((t) => t.id === term)?.name} · {sheetResources.length} مصادر
                </p>

                <div className="-mx-1 flex-1 space-y-2 overflow-y-auto px-1">
                  {sheetResources.length === 0 ? (
                    <div className="grid place-items-center py-10 text-center text-ink-soft">
                      <FolderOpen size={30} className="text-champagne-400" />
                      <p className="mt-3 text-sm">لا توجد مصادر لهذا الفصل بعد.</p>
                      <p className="mt-1 text-xs text-ink-muted">ستظهر هنا فور رفع الملفات المعتمدة.</p>
                    </div>
                  ) : (
                    sheetResources.map((r) => {
                      const k = KIND[r.kind] || KIND.textbook;
                      return (
                        <button
                          key={r.id}
                          onClick={() => setResource(r)}
                          className="flex w-full items-center gap-3 rounded-2xl bg-white/60 p-3 text-right transition hover:bg-white/85"
                          style={{ border: "1px solid rgba(201,168,106,0.25)" }}
                        >
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold-gradient text-white">
                            <k.Icon size={18} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-ink">{r.title}</p>
                            <p className="text-[11px] text-ink-muted">
                              {k.label}
                              {term === "all" && r.termName ? ` · ${r.termName}` : ""}
                            </p>
                          </div>
                          <ChevronLeft className="shrink-0 text-gold" size={18} />
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom in-app PDF viewer */}
      <PdfViewerModal open={!!resource} resource={resource} onClose={() => setResource(null)} />
    </>
  );
}
