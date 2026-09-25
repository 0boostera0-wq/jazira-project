"use client";

import { useEffect, useState } from "react";
import { Crown, Check, X, ShieldCheck } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import SubscriptionCard from "@/components/SubscriptionCard";
import ReferralProgress from "@/components/ReferralProgress";
import { useAuthUser } from "@/context/AuthProvider";
import { createClient } from "@/lib/supabase-client";

const COMPARE = [
  { label: "اختبارات القدرات والتحصيلي", free: "محدود", elite: "غير محدود" },
  { label: "محادثة المساعد الذكي", free: "5 كل 8 ساعات", elite: "غير محدودة" },
  { label: "وسام النخبة الذهبي", free: false, elite: true },
  { label: "تحليل الأداء المتقدم", free: false, elite: true },
  { label: "أولوية الدعم الفني", free: false, elite: true },
];

function Cell({ value }) {
  if (value === true) return <Check size={18} className="mx-auto text-emerald-500" />;
  if (value === false) return <X size={18} className="mx-auto text-ink-muted" />;
  return <span className="text-sm text-ink-soft">{value}</span>;
}

export default function SubscriptionsPage() {
  const { isElite, userId } = useAuthUser();
  const [periodEnd, setPeriodEnd] = useState(null);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("subscriptions")
          .select("current_period_end, status")
          .eq("user_id", userId)
          .single();
        if (data?.current_period_end) setPeriodEnd(data.current_period_end);
      } catch { /* table may be empty */ }
    })();
  }, [userId]);

  return (
    <div>
      <PageHeader title="اشتراك النخبة" subtitle="افتح كل الميزات عبر باقة النخبة أو بدعوة أصدقائك" icon={Crown} />

      {/* Current status */}
      <div className={`mb-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl p-5 ${isElite ? "bg-emerald-50 border border-emerald-200" : "glass"}`}>
        <div className="flex items-center gap-3">
          <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${isElite ? "bg-emerald-500" : "bg-gold-gradient"} text-white shadow-gold`}>
            {isElite ? <ShieldCheck size={22} /> : <Crown size={22} />}
          </span>
          <div>
            <p className="font-extrabold text-ink">
              {isElite ? "باقتك الحالية: النخبة ✨" : "باقتك الحالية: مجانية"}
            </p>
            <p className="text-sm text-ink-soft">
              {isElite
                ? (periodEnd ? `تتجدد في ${new Date(periodEnd).toLocaleDateString("ar-SA")}` : "اشتراك نشط")
                : "يمكنك الترقية في أي وقت"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SubscriptionCard />
        <ReferralProgress />
      </div>

      {/* Free vs Elite comparison */}
      <div className="mt-6 glass-strong overflow-hidden rounded-3xl">
        <div className="grid grid-cols-3 bg-white/40 px-5 py-3 text-sm font-extrabold text-ink">
          <span>الميزة</span>
          <span className="text-center">مجاني</span>
          <span className="text-center gold-text">النخبة</span>
        </div>
        {COMPARE.map((row, i) => (
          <div key={row.label} className={`grid grid-cols-3 items-center px-5 py-3 ${i % 2 ? "bg-white/20" : ""}`}>
            <span className="text-sm font-semibold text-ink">{row.label}</span>
            <span className="text-center"><Cell value={row.free} /></span>
            <span className="text-center"><Cell value={row.elite} /></span>
          </div>
        ))}
      </div>

      <div className="mt-6 glass rounded-3xl p-5 text-center text-sm text-ink-soft">
        طريقتان لفتح الميزات: <b className="text-gold-dark">الاشتراك بباقة النخبة (19 ريال)</b> أو
        <b className="text-gold-dark"> دعوة 5 أصدقاء</b> لمكافأة محدودة — والنخبة تتطلب دفعاً مؤكداً.
      </div>
    </div>
  );
}
