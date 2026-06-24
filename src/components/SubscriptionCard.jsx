"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Crown, ShieldCheck, X, Lock } from "lucide-react";
import { ELITE } from "@/lib/constants";
import { useApp } from "@/context/AppContext";
import PaymentBadges, {
  ApplePayBadge,
  MadaBadge,
  VisaBadge,
  MastercardBadge,
  PayPalBadge,
} from "@/components/PaymentBadges";

const COMING_SOON = "سيتم ربط بوابة الدفع قريبًا";

function PayOption({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-right transition ${
        active
          ? "ring-2 ring-gold bg-gold/5"
          : "bg-white/70 hover:bg-white"
      }`}
      style={{ border: "1px solid rgba(201,168,106,0.3)" }}
    >
      {children}
    </button>
  );
}

export default function SubscriptionCard() {
  const { isElite } = useApp();
  const [showPay, setShowPay] = useState(false);
  const [method, setMethod] = useState("applepay");
  const [notice, setNotice] = useState("");

  const handleAttempt = () => {
    // No real gateway yet — never fake a successful payment / upgrade.
    setNotice(COMING_SOON);
    setTimeout(() => setNotice(""), 4000);
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
          <div className="mt-6 flex items-center justify-center gap-2 rounded-2xl bg-emerald-50 py-3 font-bold text-emerald-700">
            <ShieldCheck size={20} /> أنت مشترك في باقة النخبة
          </div>
        ) : (
          <button onClick={() => setShowPay(true)} className="btn-gold mt-6 w-full text-lg">
            اشترك الآن ✨
          </button>
        )}

        {/* Supported methods — professional brand badges */}
        <div className="mt-5">
          <p className="mb-2 text-center text-xs text-ink-muted">طرق الدفع المدعومة</p>
          <PaymentBadges />
        </div>

        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-ink-muted">
          <ShieldCheck size={13} /> دفع آمن ومشفّر — لا نخزّن بيانات بطاقتك
        </p>
      </motion.div>

      {/* Professional checkout modal */}
      <AnimatePresence>
        {showPay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
            onClick={() => setShowPay(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-strong w-full max-w-md rounded-3xl p-6"
            >
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-lg font-extrabold text-ink">إتمام الاشتراك</h3>
                <button onClick={() => setShowPay(false)} className="rounded-full p-1.5 hover:bg-white/50">
                  <X size={20} />
                </button>
              </div>
              <p className="mb-4 text-sm text-ink-soft">
                باقة النخبة — <b className="gold-text">{ELITE.priceSAR} ريال / شهريًا</b>
              </p>

              {/* Method selector */}
              <div className="space-y-2">
                <PayOption active={method === "applepay"} onClick={() => setMethod("applepay")}>
                  <span className="font-semibold text-ink">Apple Pay</span>
                  <ApplePayBadge />
                </PayOption>
                <PayOption active={method === "mada"} onClick={() => setMethod("mada")}>
                  <span className="font-semibold text-ink">مدى / بطاقة ائتمانية</span>
                  <span className="flex gap-1"><MadaBadge /><VisaBadge /><MastercardBadge /></span>
                </PayOption>
                <PayOption active={method === "paypal"} onClick={() => setMethod("paypal")}>
                  <span className="font-semibold text-ink">PayPal</span>
                  <PayPalBadge />
                </PayOption>
              </div>

              {/* Method-specific UI */}
              <div className="mt-4">
                {method === "applepay" && (
                  <button
                    onClick={handleAttempt}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-black py-3.5 font-semibold text-white"
                  >
                    <ApplePayBadge /> الدفع عبر Apple Pay
                  </button>
                )}

                {method === "mada" && (
                  <div className="space-y-3">
                    <input
                      placeholder="اسم حامل البطاقة"
                      className="w-full rounded-2xl bg-white/80 px-4 py-3 text-sm text-ink outline-none focus:ring-2 focus:ring-champagne-400"
                      style={{ border: "1px solid rgba(201,168,106,0.3)" }}
                    />
                    <input
                      placeholder="رقم البطاقة"
                      dir="ltr"
                      inputMode="numeric"
                      className="w-full rounded-2xl bg-white/80 px-4 py-3 text-sm text-ink outline-none focus:ring-2 focus:ring-champagne-400"
                      style={{ border: "1px solid rgba(201,168,106,0.3)" }}
                    />
                    <div className="flex gap-3">
                      <input
                        placeholder="تاريخ الانتهاء MM/YY"
                        dir="ltr"
                        className="w-1/2 rounded-2xl bg-white/80 px-4 py-3 text-sm text-ink outline-none focus:ring-2 focus:ring-champagne-400"
                        style={{ border: "1px solid rgba(201,168,106,0.3)" }}
                      />
                      <input
                        placeholder="CVV"
                        dir="ltr"
                        inputMode="numeric"
                        maxLength={4}
                        className="w-1/2 rounded-2xl bg-white/80 px-4 py-3 text-sm text-ink outline-none focus:ring-2 focus:ring-champagne-400"
                        style={{ border: "1px solid rgba(201,168,106,0.3)" }}
                      />
                    </div>
                    <button onClick={handleAttempt} className="btn-gold w-full">
                      ادفع {ELITE.priceSAR} ريال
                    </button>
                  </div>
                )}

                {method === "paypal" && (
                  <button
                    onClick={handleAttempt}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-extrabold italic text-white"
                    style={{ background: "#0070BA" }}
                  >
                    <span style={{ color: "#fff" }}>Pay</span>
                    <span style={{ color: "#cfe8ff" }}>Pal</span>
                  </button>
                )}
              </div>

              {notice && (
                <p className="mt-4 flex items-center justify-center gap-1.5 rounded-2xl bg-gold/10 py-3 text-center text-sm font-semibold text-gold-dark">
                  <Lock size={15} /> {notice}
                </p>
              )}

              <p className="mt-3 flex items-center justify-center gap-1 text-center text-xs text-ink-muted">
                <ShieldCheck size={13} /> دفع آمن ومشفّر
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
