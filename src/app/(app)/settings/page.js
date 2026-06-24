"use client";

import { useState, useRef, useEffect } from "react";
import {
  Settings, Bell, Moon, Volume2, Globe, ShieldCheck, Crown, Camera,
  Eye, Trash2, RefreshCw, X, Lock, LogOut, Smartphone, Bot, Users,
  UserCog, KeyRound, Mail, Phone,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Avatar from "@/components/Avatar";
import { useApp } from "@/context/AppContext";
import { useAuthUser } from "@/context/AuthProvider";
import { createClient } from "@/lib/supabase-client";

const PREFS_KEY = "jazira_prefs_v1";

function readPrefs() {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; }
}

function Toggle({ on, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-gold-gradient" : "bg-champagne-200"}`}
      aria-pressed={on}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "right-1" : "right-6"}`} />
    </button>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="glass-strong mb-5 rounded-3xl p-5">
      <h3 className="mb-3 flex items-center gap-2 font-extrabold text-ink">
        <Icon size={18} className="text-champagne-500" /> {title}
      </h3>
      {children}
    </div>
  );
}

function Row({ icon: Icon, label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span className="flex items-center gap-3 text-ink">
        {Icon && <Icon size={18} className="text-champagne-500" />} {label}
      </span>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const { isElite, xp, isDark, toggleTheme } = useApp();
  const { isSignedIn, userId, name, email, imageUrl, refreshUser } = useAuthUser();

  // Local-only preferences
  const [prefs, setPrefs] = useState({
    notif: true, sound: true, lang: "ar",
    aiSuggestions: true, communityBadge: true, privateProfile: true,
  });
  useEffect(() => { setPrefs((p) => ({ ...p, ...readPrefs() })); }, []);
  const setPref = (k, v) => {
    setPrefs((p) => {
      const next = { ...p, [k]: v };
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // Avatar modal
  const [avatarModal, setAvatarModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const fileRef = useRef(null);

  // Editable display name
  const [editName, setEditName] = useState("");
  useEffect(() => { setEditName(name || ""); }, [name]);
  const [editPhone, setEditPhone] = useState("");
  useEffect(() => {
    // Best-effort phone fetch — the column may not exist in the schema yet.
    let cancelled = false;
    (async () => {
      if (!userId) return;
      try {
        const supabase = createClient();
        const { data } = await supabase.from("profiles").select("phone").eq("id", userId).single();
        if (!cancelled && data?.phone) {
          setEditPhone(String(data.phone).replace(/^\+?966/, "").replace(/\D/g, ""));
        }
      } catch { /* column missing — leave empty */ }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // Password
  const [newPass, setNewPass] = useState("");
  const [pwMsg, setPwMsg] = useState("");

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  const saveName = async () => {
    const v = editName.trim();
    if (v.length < 2) { flash("الاسم يجب أن يكون حرفين على الأقل"); return; }
    setBusy(true);
    try {
      const supabase = createClient();
      await supabase.from("profiles").update({ full_name: v }).eq("id", userId);
      await refreshUser();
      flash("تم حفظ الاسم");
    } catch { flash("تعذّر حفظ الاسم"); }
    setBusy(false);
  };

  const savePhone = async () => {
    if (editPhone && editPhone.length !== 9) { flash("رقم الجوال يجب أن يتكون من 9 أرقام"); return; }
    setBusy(true);
    try {
      const supabase = createClient();
      const value = editPhone ? `+966${editPhone}` : null;
      let { error } = await supabase.from("profiles").update({ phone: value }).eq("id", userId);
      if (error && /column|phone/i.test(error.message || "")) {
        flash("عمود رقم الجوال غير موجود في قاعدة البيانات");
      } else {
        await refreshUser();
        flash("تم حفظ رقم الجوال");
      }
    } catch { flash("تعذّر حفظ رقم الجوال"); }
    setBusy(false);
  };

  const changePassword = async () => {
    if (newPass.length < 6) { setPwMsg("كلمة المرور يجب أن تكون 6 أحرف على الأقل"); return; }
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) setPwMsg("تعذّر تغيير كلمة المرور. قد تحتاج لإعادة تسجيل الدخول.");
      else { setPwMsg("تم تغيير كلمة المرور بنجاح"); setNewPass(""); }
    } catch { setPwMsg("حدث خطأ غير متوقع"); }
    setBusy(false);
    setTimeout(() => setPwMsg(""), 4000);
  };

  const onPickAvatar = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${userId}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      await supabase.from("profiles").update({ avatar_url: `${publicUrl}?t=${Date.now()}` }).eq("id", userId);
      await refreshUser();
      flash("تم تحديث الصورة");
      setAvatarModal(false);
    } catch { flash("تعذّر رفع الصورة"); }
    setBusy(false);
  };

  const deleteAvatar = async () => {
    setBusy(true);
    try {
      const supabase = createClient();
      // best-effort remove of stored objects
      try {
        const { data: list } = await supabase.storage.from("avatars").list(userId);
        if (list?.length) {
          await supabase.storage.from("avatars").remove(list.map((f) => `${userId}/${f.name}`));
        }
      } catch {}
      await supabase.from("profiles").update({ avatar_url: null }).eq("id", userId);
      await refreshUser();
      flash("تم حذف الصورة");
      setAvatarModal(false);
    } catch { flash("تعذّر حذف الصورة"); }
    setBusy(false);
  };

  const signOutEverywhere = async () => {
    const supabase = createClient();
    try { await supabase.auth.signOut({ scope: "global" }); } catch {}
    window.location.href = "/";
  };

  const deleteAccount = async () => {
    if (!confirm("هل أنت متأكد من رغبتك في حذف الحساب؟ سيتم تسجيل خروجك ومراجعة الطلب.")) return;
    const supabase = createClient();
    try { await supabase.from("profiles").update({ full_name: "حساب محذوف", avatar_url: null }).eq("id", userId); } catch {}
    try { await supabase.auth.signOut(); } catch {}
    window.location.href = "/";
  };

  if (!isSignedIn) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="الإعدادات" subtitle="إدارة حسابك وتفضيلاتك" icon={Settings} />
        <div className="glass-strong rounded-3xl p-8 text-center">
          <p className="text-ink-soft">سجّل الدخول لإدارة حسابك وتفضيلاتك.</p>
          <a href="/sign-in" className="btn-gold mt-4 inline-block px-6 py-2.5 text-sm">تسجيل الدخول</a>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="الإعدادات" subtitle="إدارة حسابك وتفضيلاتك" icon={Settings} />

      {msg && (
        <div className="mb-4 rounded-2xl bg-emerald-50 px-4 py-2.5 text-center text-sm font-semibold text-emerald-700 border border-emerald-200">
          {msg}
        </div>
      )}

      {/* Profile */}
      <Section icon={UserCog} title="الملف الشخصي">
        <div className="flex items-center gap-4">
          <button onClick={() => setAvatarModal(true)} className="relative" title="إدارة الصورة">
            <Avatar src={imageUrl} name={name} size={72} />
            <span className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-gold text-white shadow-gold">
              <Camera size={13} />
            </span>
          </button>
          <div className="flex-1">
            <p className="font-extrabold text-ink">{name || "مستخدم جزيرة"}</p>
            <p className="text-xs text-ink-muted">اضغط على الصورة لعرضها أو تغييرها أو حذفها</p>
            {isElite && (
              <span className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-gold-dark">
                <Crown size={12} /> عضو النخبة
              </span>
            )}
          </div>
        </div>

        {/* Display name */}
        <div className="mt-4">
          <label className="mb-1.5 block text-sm font-medium text-ink">الاسم المعروض</label>
          <div className="flex gap-2">
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              maxLength={50}
              className="flex-1 rounded-2xl bg-white/70 px-4 py-2.5 text-ink outline-none focus:ring-2 focus:ring-champagne-400"
              style={{ border: "1px solid rgba(201,168,106,0.3)" }}
            />
            <button onClick={saveName} disabled={busy} className="btn-gold px-4 py-2.5 text-sm disabled:opacity-50">حفظ</button>
          </div>
          <p className="mt-1 text-xs text-ink-muted">يمكن لأكثر من مستخدم اختيار نفس الاسم.</p>
        </div>
      </Section>

      {/* Private account info — owner only */}
      <Section icon={Lock} title="بيانات خاصة (تظهر لك وحدك)">
        <Row icon={Mail} label="البريد الإلكتروني">
          <span className="text-sm text-ink-soft ltr-nums" dir="ltr">{email || "—"}</span>
        </Row>
        <div className="border-t border-champagne-200/60" />
        <div className="py-3">
          <label className="mb-1.5 flex items-center gap-2 text-sm text-ink"><Phone size={16} className="text-champagne-500" /> رقم الجوال</label>
          <div className="flex gap-2" dir="ltr">
            <span className="flex items-center rounded-2xl bg-white/40 px-3 text-sm font-semibold text-ink" style={{ border: "1px solid rgba(201,168,106,0.3)" }}>+966</span>
            <input
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, "").slice(0, 9))}
              inputMode="numeric"
              placeholder="5XXXXXXXX"
              className="flex-1 rounded-2xl bg-white/70 px-4 py-2.5 text-ink outline-none focus:ring-2 focus:ring-champagne-400"
              style={{ border: "1px solid rgba(201,168,106,0.3)" }}
            />
            <button onClick={savePhone} disabled={busy} className="btn-gold px-4 py-2.5 text-sm disabled:opacity-50">حفظ</button>
          </div>
        </div>
      </Section>

      {/* Password */}
      <Section icon={KeyRound} title="كلمة المرور">
        <div className="flex gap-2">
          <input
            type="password"
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
            placeholder="كلمة مرور جديدة (6 أحرف على الأقل)"
            className="flex-1 rounded-2xl bg-white/70 px-4 py-2.5 text-ink outline-none focus:ring-2 focus:ring-champagne-400"
            style={{ border: "1px solid rgba(201,168,106,0.3)" }}
          />
          <button onClick={changePassword} disabled={busy} className="btn-gold px-4 py-2.5 text-sm disabled:opacity-50">تغيير</button>
        </div>
        {pwMsg && <p className="mt-2 text-sm text-ink-soft">{pwMsg}</p>}
      </Section>

      {/* Preferences */}
      <Section icon={Settings} title="التفضيلات">
        <div className="divide-y divide-champagne-200/60">
          <Row icon={Moon} label="الوضع الليلي"><Toggle on={isDark} onClick={toggleTheme} /></Row>
          <Row icon={Bell} label="الإشعارات"><Toggle on={prefs.notif} onClick={() => setPref("notif", !prefs.notif)} /></Row>
          <Row icon={Volume2} label="المؤثرات الصوتية"><Toggle on={prefs.sound} onClick={() => setPref("sound", !prefs.sound)} /></Row>
          <Row icon={Globe} label="اللغة">
            <select
              value={prefs.lang}
              onChange={(e) => setPref("lang", e.target.value)}
              className="rounded-xl bg-white/70 px-3 py-1.5 text-sm text-ink outline-none"
              style={{ border: "1px solid rgba(201,168,106,0.3)" }}
            >
              <option value="ar">العربية</option>
              <option value="en">English (قريبًا)</option>
            </select>
          </Row>
        </div>
      </Section>

      {/* AI & community */}
      <Section icon={Bot} title="تفضيلات المساعد الذكي والمجتمع">
        <div className="divide-y divide-champagne-200/60">
          <Row icon={Bot} label="اقتراحات المساعد الذكي"><Toggle on={prefs.aiSuggestions} onClick={() => setPref("aiSuggestions", !prefs.aiSuggestions)} /></Row>
          <Row icon={Users} label="إظهار شارة النخبة في المجتمع"><Toggle on={prefs.communityBadge} onClick={() => setPref("communityBadge", !prefs.communityBadge)} /></Row>
        </div>
      </Section>

      {/* Privacy & security */}
      <Section icon={ShieldCheck} title="الخصوصية والأمان">
        <Row icon={ShieldCheck} label="إبقاء بياناتي الخاصة مخفية">
          <Toggle on={prefs.privateProfile} onClick={() => setPref("privateProfile", !prefs.privateProfile)} />
        </Row>
        <p className="text-xs text-ink-muted">بريدك ورقم جوالك مخفيان دائماً عن باقي المستخدمين.</p>
      </Section>

      {/* Sessions */}
      <Section icon={Smartphone} title="الأجهزة النشطة / الجلسات">
        <Row icon={Smartphone} label="الجلسة الحالية">
          <span className="text-xs font-semibold text-emerald-600">نشطة الآن</span>
        </Row>
        <button onClick={signOutEverywhere} className="btn-ghost mt-2 flex w-full items-center justify-center gap-2 text-sm">
          <LogOut size={16} /> تسجيل الخروج من جميع الأجهزة
        </button>
      </Section>

      {/* Danger zone */}
      <Section icon={Trash2} title="تعطيل أو حذف الحساب">
        <p className="mb-3 text-sm text-ink-soft">يمكنك تسجيل الخروج مؤقتاً أو طلب حذف حسابك نهائياً.</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={signOutEverywhere} className="btn-ghost flex items-center gap-2 text-sm">
            <LogOut size={16} /> تسجيل الخروج
          </button>
          <button onClick={deleteAccount} className="flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-100 transition">
            <Trash2 size={16} /> حذف الحساب
          </button>
        </div>
      </Section>

      <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-xs text-ink-muted">
        <ShieldCheck size={14} /> بياناتك محمية ومشفّرة في منصة جزيرة · XP: <span className="ltr-nums">{xp}</span>
      </p>

      {/* Avatar modal */}
      {avatarModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm" onClick={() => setAvatarModal(false)}>
          <div className="glass-strong w-full max-w-sm rounded-3xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-ink">الصورة الشخصية</h3>
              <button onClick={() => setAvatarModal(false)} className="rounded-full p-1.5 hover:bg-white/50"><X size={20} /></button>
            </div>

            {/* Large preview */}
            <div className="mb-5 flex justify-center">
              <Avatar src={imageUrl} name={name} size={160} />
            </div>

            <input ref={fileRef} type="file" accept="image/*" onChange={onPickAvatar} hidden />

            <div className="space-y-2">
              {imageUrl && (
                <a
                  href={imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-ghost flex w-full items-center justify-center gap-2 text-sm"
                >
                  <Eye size={16} /> عرض الصورة
                </a>
              )}
              <button onClick={() => fileRef.current?.click()} disabled={busy} className="btn-gold flex w-full items-center justify-center gap-2 disabled:opacity-50">
                <RefreshCw size={16} /> تغيير الصورة
              </button>
              {imageUrl && (
                <button onClick={deleteAvatar} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-50 py-3 text-sm font-bold text-red-600 hover:bg-red-100 transition disabled:opacity-50">
                  <Trash2 size={16} /> حذف الصورة
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
