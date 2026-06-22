"use client";

import { CreditCard } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import SubscriptionCard from "@/components/SubscriptionCard";
import ReferralProgress from "@/components/ReferralProgress";

export default function SubscriptionsPage() {
  return (
    <div>
      <PageHeader
        title="الاشتراكات"
        subtitle="افتح كل الميزات عبر باقة النخبة أو بدعوة أصدقائك"
        icon={CreditCard}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SubscriptionCard />
        <ReferralProgress />
      </div>

      <div className="mt-6 glass rounded-3xl p-5 text-center text-sm text-ink-soft">
        طريقتان لفتح الاختبارات المميّزة: <b className="text-gold-dark">الاشتراك بباقة النخبة (19 ريال)</b> أو
        <b className="text-gold-dark"> دعوة ٥ أصدقاء</b> عبر رابطك الخاص — أيهما أسرع لك.
      </div>
    </div>
  );
}
