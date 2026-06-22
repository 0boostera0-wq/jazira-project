"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Crown, ShieldCheck, X } from "lucide-react";
import { ELITE } from "@/lib/constants";
import { useApp } from "@/context/AppContext";

// Mada / Apple Pay marks (inline so no external assets are needed).
function PayMark({ label, bg, color }) {
  return (
    <span
      className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold"
      style={{ background: bg, color }}
    >
      {label}
    </span>
  );
}

export default function SubscriptionCard() {
  const { isElite, subscribeElite, cancelElite } = useApp();
  const [showPay, setShowPay] = useState(false);
  const [processing, setProcessing] = useState(false);

  const pay = () => {
    setProcessing(true);
    // Simulated Stripe/Tap payment confirmation.
    setTimeout(() => {
      subscribeElite();
      setProcessing(false);
      setShowPay(false);
    }, 1400);
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-strong relative overflow-hidden rounded-3xl p-7"
      >
        <div className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-gold-gradient opacity-20 blur-2xl" />

        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-gradient text-white shadow-gold">
            <Crown size={26} />
          </span>
          <div>
            <h3 className="text-xl font-extrabold text-ink">{ELITE.name}</h3>
            <p className="text-sm text-ink-soft">وصول كامل لكل ميزات منصة جزيرة</p>
          </div>
        </div>

        <div className="mt-5 flex items-end gap-1">
          <span className="text-5xl font-extrabold gold-text ltr-nums">{ELITE.priceSAR}</span>
          <span className="mb-1 text-lg font-bold text-ink-soft">ريال / شهريًا</span>
        </div>

        <ul className="mt-5 space-y-2.5">
          {ELITE.perks.map((perk) => (
            <li key={perk} className="flex items-start gap-2 text-ink">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                <Check size={13} />
              </span>
              <span className="text-sm">{perk}</span>
            </li>
          ))}
        </ul>

        {isElite ? (
          <div className="mt-6">
            <div className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-50 py-3 font-bold text-emerald-700">
              <ShieldCheck size={20} /> أنت مشترك في باقة النخبة
            </div>
            <button onClick={cancelElite} className="mt-2 w-full text-center text-xs text-ink-muted underline">
              إلغاء الاشتراك (للعرض التجريبي)
            </button>
          </div>
        ) : (
          <button onClick={() => setShowPay(true)} className="btn-gold mt-6 w-full text-lg">
            اشترك الآن ✨
          </button>
        )}

        {/* Payment methods */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <span className="text-xs text-ink-muted">طرق الدفع المدعومة:</span>
          <PayMark label="Apple Pay" bg="#000" color="#fff" />
          <PayMark label="mada" bg="#1A1A6E" color="#84D8F0" />
          <PayMark label="Visa" bg="#1A1F71" color="#fff" />
          <PayMark label="Mastercard" bg="#EB001B" color="#fff" />
        </div>
      </motion.div>

      {/* Payment modal (Stripe/Tap UI) */}
      {showPay && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="glass-strong w-full max-w-md rounded-3xl p-6"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-ink">إتمام الدفع الآمن</h3>
              <button onClick={() => setShowPay(false)} className="rounded-full p-1.5 hover:bg-white/50">
                <X size={20} />
              </button>
            </div>

            <button onClick={pay} disabled={processing} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-black py-3.5 font-bold text-white disabled:opacity-60">
               Apple Pay
            </button>

            <div className="my-3 flex items-center gap-3 text-xs text-ink-muted">
              <span className="h-px flex-1 bg-champagne-200" /> أو ببطاقة مدى / ائتمانية <span className="h-px flex-1 bg-champagne-200" />
            </div>

            <div className="space-y-3">
              <input placeholder="رقم البطاقة" dir="ltr" className="w-full rounded-2xl bg-white/80 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-champagne-400" style={{ border: "1px solid rgba(201,168,106,0.3)" }} />
              <div className="flex gap-3">
                <input placeholder="MM / YY" dir="ltr" className="w-1/2 rounded-2xl bg-white/80 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-champagne-400" style={{ border: "1px solid rgba(201,168,106,0.3)" }} />
                <input placeholder="CVC" dir="ltr" className="w-1/2 rounded-2xl bg-white/80 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-champagne-400" style={{ border: "1px solid rgba(201,168,106,0.3)" }} />
              </div>
            </div>

            <button onClick={pay} disabled={processing} className="btn-gold mt-4 w-full">
              {processing ? "جارٍ المعالجة..." : `ادفع ${ELITE.priceSAR} ريال`}
            </button>
            <p className="mt-2 flex items-center justify-center gap-1 text-center text-xs text-ink-muted">
              <ShieldCheck size={13} /> دفع آمن ومشفّر عبر Stripe / Tap
            </p>
          </motion.div>
        </div>
      )}
    </>
  );
}
