"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, FileText, BookOpen, ClipboardCheck, X, Info, FolderOpen } from "lucide-react";
import { TERMS, TERM_FILTERS, termName } from "@/lib/curriculum";
import SubjectCard from "./SubjectCard";
import PdfViewerModal from "./PdfViewerModal";

const KIND = {
  textbook: { label: "كتاب الطالب", Icon: BookOpen },
  workbook: { label: "كتاب النشاط", Icon: FileText },
  exam: { label: "نماذج اختبارات", Icon: ClipboardCheck },
};

// Leaf experience:
//   • term filter: الأول / الثاني / كامل العام
//   • a specific term  → one grid of that term's subjects
//   • كامل العام        → TWO sections (term 1, term 2), each with its subjects
//   • tap a subject     → sheet of exactly its 3 resources for that term, ordered
//     كتاب الطالب → كتاب النشاط → نماذج اختبارات (no duplicates)
export default function SubjectBrowser({ subjects = [] }) {
  const [term, setTerm] = useState("all"); // all | t1 | t2
  const [selected, setSelected] = useState(null); // { subject, term }
  const [resource, setResource] = useState(null); // resource to view

  const inTerm = (tid) => subjects.filter((s) => s.terms?.includes(tid));
  const resourcesOf = (subject, tid) =>
    (subject?.resources || []).filter((r) => r.term === tid).sort((a, b) => a.order - b.order);

  const sheetResources = useMemo(
    () => (selected ? resourcesOf(selected.subject, selected.term) : []),
    [selected]
  );

  if (!subjects.length) {
    return (
      <div className="bezel">
        <div className="bezel-core glass-strong p-8 text-center text-ink-soft">
          لا توجد مواد مُضافة لهذا القسم بعد.
        </div>
      </div>
    );
  }

  const Grid = ({ list, sectionTerm }) =>
    list.length ? (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((s) => (
          <SubjectCard
            key={s.id}
            subject={s}
            count={resourcesOf(s, sectionTerm).length}
            onClick={() => setSelected({ subject: s, term: sectionTerm })}
          />
        ))}
      </div>
    ) : (
      <div className="bezel">
        <div className="bezel-core glass p-6 text-center text-sm text-ink-soft">
          لا توجد مواد في هذا الفصل.
        </div>
      </div>
    );

  return (
    <>
      {/* Term filter bar */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="ml-1 text-sm font-bold text-ink-muted">الفصل الدراسي:</span>
        {TERM_FILTERS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTerm(t.id)}
            className={`rounded-full px-4 py-2 text-sm font-bold transition-all ${
              term === t.id ? "bg-gold-gradient text-white shadow-gold" : "glass text-ink hover:bg-white/70"
            }`}
          >
            {t.short}
          </button>
        ))}
      </div>

      {/* كامل العام → split into two term sections; else a single grid */}
      {term === "all" ? (
        <div className="space-y-8">
          {TERMS.map((t) => (
            <section key={t.id}>
              <div className="mb-4 flex items-center gap-3">
                <span className="inline-block h-6 w-1.5 rounded-full bg-gold-gradient" />
                <h2 className="text-lg font-extrabold text-ink">{t.name}</h2>
              </div>
              <Grid list={inTerm(t.id)} sectionTerm={t.id} />
            </section>
          ))}
        </div>
      ) : (
        <Grid list={inTerm(term)} sectionTerm={term} />
      )}

      {/* Note: where the real approved PDFs come from */}
      <div
        className="mt-8 flex items-start gap-3 rounded-2xl bg-white/55 p-4 text-sm text-ink-soft"
        style={{ border: "1px solid rgba(201,168,106,0.25)" }}
      >
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gold-gradient text-white">
          <Info size={15} />
        </span>
        <p className="leading-relaxed">
          كل مادة تعرض ثلاثة مصادر فقط لكل فصل: <b>كتاب الطالب</b>، <b>كتاب النشاط</b>، <b>نماذج اختبارات</b>.
          تفتح الملفات داخل المنصة مباشرة. حتى تُرفع الملفات الرسمية المعتمدة، يُعرض ملف PDF مبدئي بعلامة جزيرة —
          وتُستبدل تلقائياً عند استيراد الملف الرسمي (انظر <span dir="ltr" className="font-mono text-xs">scripts/README.md</span>).
        </p>
      </div>

      {/* Resource sheet — exactly the 3 ordered types for {subject, term} */}
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
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="text-lg font-extrabold text-ink">{selected.subject.name}</h3>
                  <button
                    onClick={() => setSelected(null)}
                    className="rounded-full p-1.5 text-ink-soft transition hover:bg-white/60"
                    aria-label="إغلاق"
                  >
                    <X size={20} />
                  </button>
                </div>
                <p className="mb-4 text-xs font-bold text-ink-muted">{termName(selected.term)}</p>

                <div className="space-y-2">
                  {sheetResources.length === 0 ? (
                    <div className="grid place-items-center py-10 text-center text-ink-soft">
                      <FolderOpen size={30} className="text-champagne-400" />
                      <p className="mt-3 text-sm">لا توجد مصادر لهذا الفصل.</p>
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
                            <p className="text-[11px] text-ink-muted">{r.termName}</p>
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
