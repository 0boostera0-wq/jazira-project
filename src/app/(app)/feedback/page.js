"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Star, Send, CheckCircle2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";

export default function FeedbackPage() {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="تقييم الآراء" icon={Star} />
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-strong rounded-3xl p-10 text-center">
          <CheckCircle2 size={56} className="mx-auto text-emerald-500" />
          <h3 className="mt-3 text-xl font-extrabold text-ink">شكرًا لتقييمك! 🌟</h3>
          <p className="mt-1 text-ink-soft">رأيك يساعدنا على تطوير منصة جزيرة لتكون أفضل.</p>
          <button onClick={() => { setSent(false); setRating(0); setText(""); }} className="btn-ghost mt-5">
            إرسال تقييم آخر
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="تقييم الآراء" subtitle="شاركنا رأيك لنرتقي بتجربتك" icon={Star} />

      <div className="glass-strong rounded-3xl p-7">
        <p className="text-center font-bold text-ink">ما مدى رضاك عن المنصة؟</p>
        <div className="mt-3 flex justify-center gap-2" dir="ltr">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              className="transition-transform hover:scale-110"
            >
              <Star
                size={40}
                className={(hover || rating) >= n ? "fill-[#C9A227] text-[#C9A227]" : "text-champagne-200"}
              />
            </button>
          ))}
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="اكتب ملاحظاتك واقتراحاتك هنا..."
          className="mt-5 w-full resize-none rounded-2xl bg-white/70 px-4 py-3 text-ink outline-none placeholder:text-ink-muted focus:ring-2 focus:ring-champagne-400"
          style={{ border: "1px solid rgba(201,168,106,0.3)" }}
        />

        <button
          onClick={() => setSent(true)}
          disabled={!rating}
          className="btn-gold mt-4 flex w-full items-center justify-center gap-2 disabled:opacity-50"
        >
          <Send size={18} className="-scale-x-100" /> إرسال التقييم
        </button>
      </div>
    </div>
  );
}
