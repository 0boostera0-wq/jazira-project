"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Loader2, Check, PenLine } from "lucide-react";
import { useAuthUser } from "@/context/AuthProvider";
import { createClient } from "@/lib/supabase-client";
import { getSocialSettings, updateSocialSettings, DEFAULT_SOCIAL_SETTINGS } from "@/lib/social";
import { setSoundEnabled, playNotificationSound, primeAudio } from "@/lib/notificationSound";

// The eight new social/privacy toggles backed by user_social_settings.
// (إظهار شارة النخبة / النشر كمجهول already live on profiles and stay in their
// existing settings section.)
const ROWS = [
  { key: "allow_messages", label: "السماح للآخرين بمراسلتي", hint: "إيقافه يمنع وصول أي رسائل جديدة." },
  { key: "allow_message_requests", label: "السماح بطلبات الرسائل", hint: "استقبال طلبات من غير المتابَعين." },
  { key: "hide_message_requests", label: "إخفاء طلبات الرسائل", hint: "عدم إظهار شارة الطلبات." },
  { key: "notif_sound", label: "تشغيل صوت الإشعارات", hint: "نغمة لطيفة عند وصول إشعار جديد." },
  { key: "show_likes_on_profile", label: "إظهار الإعجابات في الملف الشخصي", hint: "السماح للآخرين برؤية إعجاباتك." },
  { key: "show_reposts_on_profile", label: "إظهار إعادة النشر في الملف الشخصي", hint: "إظهار تبويب إعادة النشر." },
  { key: "notify_followers", label: "إشعارات المتابَعين", hint: "تلقّي إشعار عند متابعة شخص لك." },
  { key: "notify_mentions", label: "إشعارات المنشن", hint: "تلقّي إشعار عند الإشارة إليك @." },
];

function Toggle({ on, onClick }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-gold-gradient" : "bg-champagne-200"}`}
    >
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "left-0.5" : "left-[1.375rem]"}`} />
    </button>
  );
}

export default function SocialSettings() {
  const { isSignedIn, userId } = useAuthUser();
  const supabase = createClient();
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);
  const [bio, setBio] = useState("");
  const [bioLoaded, setBioLoaded] = useState(false);
  const [bioSaved, setBioSaved] = useState(false);
  const [bioSaving, setBioSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;
    getSocialSettings(userId).then(setS);
    (async () => {
      try {
        const { data } = await supabase.from("profiles").select("bio").eq("id", userId).maybeSingle();
        setBio(data?.bio || "");
      } catch {}
      setBioLoaded(true);
    })();
  }, [userId, supabase]);

  if (!isSignedIn) return null;

  const saveBio = async () => {
    setBioSaving(true);
    try { await supabase.rpc("update_bio", { new_bio: bio }); setBioSaved(true); setTimeout(() => setBioSaved(false), 1800); } catch {}
    setBioSaving(false);
  };

  const toggle = async (key) => {
    const next = { ...(s || DEFAULT_SOCIAL_SETTINGS), [key]: !(s?.[key]) };
    setS(next); // optimistic
    if (key === "notif_sound") {
      setSoundEnabled(next.notif_sound);
      if (next.notif_sound) { primeAudio(); playNotificationSound(); }
    }
    setSaving(true);
    await updateSocialSettings({ [key]: next[key] });
    setSaving(false);
  };

  return (
    <section className="bezel">
      <div className="bezel-core glass-strong p-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gold-gradient text-white shadow-gold"><ShieldCheck size={20} /></span>
          <div>
            <h2 className="text-lg font-extrabold text-ink">الخصوصية والتفاعل الاجتماعي</h2>
            <p className="text-xs text-ink-muted">تتحكّم في الرسائل والإشعارات وظهور تفاعلاتك.</p>
          </div>
          {saving && <Loader2 size={16} className="mr-auto animate-spin text-gold" />}
        </div>

        {/* Bio editor */}
        <div className="mb-5 rounded-2xl bg-white/50 p-4">
          <label className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink"><PenLine size={14} className="text-gold" /> النبذة التعريفية</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 300))}
            disabled={!bioLoaded}
            rows={3}
            placeholder="عرّف بنفسك في سطور… تظهر في ملفك الشخصي."
            className="w-full resize-none rounded-xl bg-white/80 px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-ink-muted"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-ink-muted ltr-nums">{bio.length}/300</span>
            <button onClick={saveBio} disabled={bioSaving || !bioLoaded}
              className="inline-flex items-center gap-1.5 rounded-full bg-gold-gradient px-4 py-1.5 text-xs font-bold text-white shadow-gold disabled:opacity-60">
              {bioSaving ? <Loader2 size={13} className="animate-spin" /> : bioSaved ? <Check size={13} /> : null}
              {bioSaved ? "حُفظت" : "حفظ النبذة"}
            </button>
          </div>
        </div>

        <div className="space-y-1">
          {ROWS.map((r) => (
            <div key={r.key} className="flex items-center gap-4 rounded-2xl p-3 transition hover:bg-white/50">
              <div className="min-w-0 flex-1">
                <p className="font-bold text-ink">{r.label}</p>
                <p className="text-xs text-ink-muted">{r.hint}</p>
              </div>
              <Toggle on={s ? !!s[r.key] : false} onClick={() => toggle(r.key)} />
            </div>
          ))}
        </div>

        <p className="mt-4 text-[11px] text-ink-muted">
          تُحفظ هذه الإعدادات في حسابك وتُطبَّق على كل أجهزتك.
        </p>
      </div>
    </section>
  );
}
