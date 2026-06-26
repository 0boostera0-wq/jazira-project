"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, FileText, BookOpen, ClipboardCheck, X } from "lucide-react";
import SubjectCard from "./SubjectCard";
import PdfViewerModal from "./PdfViewerModal";

const KIND = {
  textbook: { label: "كتاب الطالب", Icon: BookOpen },
  workbook: { label: "كتاب النشاط", Icon: FileText },
  exam: { label: "نماذج اختبارات", Icon: ClipboardCheck },
};

// Leaf experience: grid of animated subject cards → tap a subject → a resource
// sheet slides up → tap a resource → the in-app PDF viewer opens.
export default function SubjectBrowser({ subjects = [] }) {
  const [selected, setSelected] = useState(null); // subject
  const [resource, setResource] = useState(null); // resource to view

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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {subjects.map((s) => (
          <SubjectCard key={s.id} subject={s} count={s.resources?.length || 0} onClick={() => setSelected(s)} />
        ))}
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
              className="bezel w-full sm:max-w-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bezel-core glass-strong p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-extrabold text-ink">{selected.name}</h3>
                  <button
                    onClick={() => setSelected(null)}
                    className="rounded-full p-1.5 text-ink-soft transition hover:bg-white/60"
                    aria-label="إغلاق"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="space-y-2">
                  {(selected.resources || []).map((r) => {
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
                          <p className="text-[11px] text-ink-muted">{k.label}</p>
                        </div>
                        <ChevronLeft className="shrink-0 text-gold" size={18} />
                      </button>
                    );
                  })}
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
