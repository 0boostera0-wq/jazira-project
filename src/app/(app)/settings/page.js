"use client";

import { useState } from "react";
import { Settings, Bell, Moon, Globe, ShieldCheck, Crown } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useApp } from "@/context/AppContext";
import { useAuthUser } from "@/context/AuthProvider";

function Toggle({ on, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`relative h-7 w-12 rounded-full transition-colors ${on ? "bg-gold-gradient" : "bg-champagne-200"}`}
      aria-pressed={on}
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "right-1" : "right-6"}`}
      />
    </button>
  );
}

export default function SettingsPage() {
  const { isElite, xp, isDark, toggleTheme } = useApp();
  const { isSignedIn, name } = useAuthUser();
  const [notif, setNotif] = useState(true);
  const [sound, setSound] = useState(true);

  const rows = [
    { icon: Bell, label: "الإشعارات", on: notif, set: () => setNotif((v) => !v) },
    { icon: Moon, label: "الوضع الليلي", on: isDark, set: toggleTheme },
    { icon: Globe, label: "المؤثرات الصوتية", on: sound, set: () => setSound((v) => !v) },
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="الإعدادات" subtitle="إدارة حسابك وتفضيلاتك" icon={Settings} />

      {/* Account */}
      <div className="glass-strong mb-6 rounded-3xl p-5">
        <h3 className="mb-3 font-extrabold text-ink">الحساب</h3>
        {isSignedIn ? (
          <div className="space-y-1 text-sm">
            <p className="text-ink"><b>الاسم:</b> {name || "—"}</p>
            <p className="flex items-center gap-1.5 text-ink">
              <b>الباقة:</b>{" "}
              {isElite ? (
                <span className="inline-flex items-center gap-1 text-gold-dark"><Crown size={14} /> النخبة</span>
              ) : (
                "مجاني"
              )}
            </p>
            <p className="text-ink ltr-nums"><b>XP:</b> {xp}</p>
          </div>
        ) : (
          <p className="text-sm text-ink-soft">أنت تتصفح كزائر. سجّل الدخول لإدارة حسابك وحفظ تقدّمك.</p>
        )}
      </div>

      {/* Preferences */}
      <div className="glass-strong rounded-3xl p-5">
        <h3 className="mb-3 font-extrabold text-ink">التفضيلات</h3>
        <div className="divide-y divide-champagne-200/60">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between py-3.5">
              <span className="flex items-center gap-3 text-ink">
                <r.icon size={20} className="text-champagne-500" /> {r.label}
              </span>
              <Toggle on={r.on} onClick={r.set} />
            </div>
          ))}
        </div>
      </div>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-ink-muted">
        <ShieldCheck size={14} /> بياناتك محمية ومشفّرة في منصة جزيرة
      </p>
    </div>
  );
}
