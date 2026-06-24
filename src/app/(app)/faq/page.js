"use client";

import { useState, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { HelpCircle, Search, ChevronDown, TrendingUp, MessageCircleQuestion } from "lucide-react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { FAQ_ITEMS, FAQ_CATEGORIES } from "@/lib/faqData";

function normalize(s) {
  return (s || "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").toLowerCase().trim();
}

function FaqRow({ item, isOpen, onToggle }) {
  return (
    <div className="glass overflow-hidden rounded-2xl">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 p-4 text-right font-bold text-ink"
      >
        <span>{item.q}</span>
        <motion.span animate={{ rotate: isOpen ? 180 : 0 }} className="shrink-0">
          <ChevronDown size={20} className="text-champagne-500" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <p className="px-4 pb-4 text-sm leading-relaxed text-ink-soft">{item.a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function FaqPage() {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("الكل");
  const [openKey, setOpenKey] = useState(null);

  const q = normalize(query);

  const filtered = useMemo(() => {
    return FAQ_ITEMS.filter((item) => {
      const matchCat = cat === "الكل" || item.cat === cat;
      const matchQ = !q || normalize(item.q).includes(q) || normalize(item.a).includes(q);
      return matchCat && matchQ;
    });
  }, [q, cat]);

  // Live suggestions while typing (top 5 question matches)
  const suggestions = useMemo(() => {
    if (!q) return [];
    return FAQ_ITEMS.filter((i) => normalize(i.q).includes(q)).slice(0, 5);
  }, [q]);

  const popular = FAQ_ITEMS.filter((i) => i.popular).slice(0, 5);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="الأسئلة الشائعة" subtitle="إجابات سريعة لأكثر ما يسأل عنه الطلاب" icon={HelpCircle} />

      {/* Smart search */}
      <div className="relative mb-4">
        <Search size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-champagne-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث في الأسئلة الشائعة..."
          className="w-full rounded-2xl bg-white/70 py-3 pr-11 pl-4 text-ink outline-none placeholder:text-ink-muted focus:ring-2 focus:ring-champagne-400"
          style={{ border: "1px solid rgba(201,168,106,0.3)" }}
        />
        {/* typing suggestions */}
        {suggestions.length > 0 && (
          <div
            className="glass-strong absolute z-20 mt-2 w-full overflow-hidden rounded-2xl"
            style={{ border: "1px solid rgba(201,168,106,0.3)" }}
          >
            {suggestions.map((s) => (
              <button
                key={s.q}
                onClick={() => { setQuery(""); setCat("الكل"); setOpenKey(s.q); }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-right text-sm text-ink hover:bg-champagne-50"
              >
                <Search size={14} className="text-champagne-400 shrink-0" />
                {s.q}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Category chips */}
      <div className="mb-5 flex flex-wrap gap-2">
        {FAQ_CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
              cat === c
                ? "bg-gold-gradient text-white shadow-gold"
                : "bg-white/60 text-ink-soft hover:bg-champagne-100"
            }`}
            style={cat === c ? {} : { border: "1px solid rgba(201,168,106,0.3)" }}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Most viewed (only when not searching/filtering) */}
      {!q && cat === "الكل" && (
        <div className="mb-6">
          <h3 className="mb-3 flex items-center gap-2 font-extrabold text-ink">
            <TrendingUp size={18} className="text-champagne-500" /> الأكثر مشاهدة
          </h3>
          <div className="space-y-2">
            {popular.map((item) => (
              <FaqRow
                key={`pop-${item.q}`}
                item={item}
                isOpen={openKey === item.q}
                onToggle={() => setOpenKey(openKey === item.q ? null : item.q)}
              />
            ))}
          </div>
        </div>
      )}

      {/* All / filtered results */}
      <h3 className="mb-3 font-extrabold text-ink">
        {q || cat !== "الكل" ? `النتائج (${filtered.length})` : "كل الأسئلة"}
      </h3>
      {filtered.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-ink-soft">
          لا توجد نتائج مطابقة لبحثك.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <FaqRow
              key={item.q}
              item={item}
              isOpen={openKey === item.q}
              onToggle={() => setOpenKey(openKey === item.q ? null : item.q)}
            />
          ))}
        </div>
      )}

      {/* Contact CTA */}
      <div className="glass-strong mt-6 flex flex-col items-center gap-3 rounded-3xl p-6 text-center">
        <MessageCircleQuestion size={32} className="text-champagne-500" />
        <p className="font-bold text-ink">لم تجد إجابتك؟</p>
        <Link href="/support" className="btn-gold px-6 py-2.5 text-sm">تواصل معنا</Link>
      </div>
    </div>
  );
}
