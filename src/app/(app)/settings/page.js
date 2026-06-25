"use client";

import { useState, useRef, useEffect } from "react";
import {
  Settings, Bell, Moon, Volume2, Globe, ShieldCheck, Crown, Camera,
  Eye, Trash2, RefreshCw, X, Lock, LogOut, Smartphone, Bot, Users,
  UserCog, KeyRound, Mail, Phone, Clock,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Avatar from "@/components/Avatar";
import { useApp } from "@/context/AppContext";
import { useAuthUser } from "@/context/AuthProvider";
import { usePreferences } from "@/context/PreferencesProvider";
import { createClient } from "@/lib/supabase-client";
import { validateFullName } from "@/lib/profile";

const LOCAL_KEY = "jazira_local_prefs_v1";
const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB
const NAME_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function readLocal() {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || {}; } catch { return {}; }
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
  const { sound, language, aiSuggestions, setSound, setLanguage, setAiSuggestions, t } = usePreferences();

  // Local-only prefs (notifications + privacy display)
  const [local, setLocal] = useState({ notif: true, communityBadge: true, privateProfile: true });
  useEffect(() => { setLocal((p) => ({ ...p, ...readLocal() })); }, []);
  const setLocalPref = (k, v) => setLocal((p) => {
    const next = { ...p, [k]: v };
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(next)); } catch {}
    return next;
  });

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 3500); };

  // ── Name + cooldown ──────────────────────────────────────────────
  const [editName, setEditName] = useState("");
  const [nameChangedAt, setNameChangedAt] = useState(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { setEditName(name || ""); }, [name]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Phone + password provider ────────────────────────────────────
  const [editPhone, setEditPhone] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [canChangePassword, setCanChangePassword] = useState(true);

  // Load profile extras + auth provider on mount
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      try {
        const { data } = await supabase
          .from("profiles")
          .select("phone, full_name_changed_at")
          .eq("id", userId)
          .single();
        if (!cancelled && data) {
          if (data.phone) setEditPhone(String(data.phone).replace(/^\+?966/, "").replace(/\D/g, ""));
          if (data.full_name_changed_at) setNameChangedAt(new Date(data.full_name_changed_at).getTime());
        }
      } catch { /* columns may not exist yet */ }
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const ids = user?.identities || [];
        const hasEmail = ids.some((i) => i.provider === "email") || user?.app_metadata?.provider === "email";
        if (!cancelled) setCanChangePassword(ids.length === 0 ? true : hasEmail);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const cooldownTarget = nameChangedAt ? nameChangedAt + NAME_COOLDOWN_MS : 0;
  const cooldownRemaining = Math.max(0, cooldownTarget - now);
  const nameLocked = cooldownRemaining > 0;

  const fmtCooldown = (ms) => {
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60), sec = s % 60;
    return t(
      `${d} أيام، ${h} ساعة، ${m} دقيقة، ${sec} ثانية`,
      `${d}d ${h}h ${m}m ${sec}s`
    );
  };

  const saveName = async () => {
    const check = validateFullName(editName);
    if (!check.ok) { flash(check.error); return; }
    if (nameLocked) { flash(t("لا يمكن تغيير الاسم الآن", "You can't change the name yet")); return; }
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("update_full_name", { new_name: check.value });
      if (error) {
        const m = error.message || "";
        if (/name_cooldown/i.test(m)) {
          flash(t("لا يمكنك تغيير الاسم إلا مرة كل 7 أيام", "Name can change only once every 7 days"));
          // refresh the timestamp to show the countdown
          const { data } = await supabase.from("profiles").select("full_name_changed_at").eq("id", userId).single();
          if (data?.full_name_changed_at) setNameChangedAt(new Date(data.full_name_changed_at).getTime());
        } else if (/invalid_name_format/i.test(m)) {
          flash(t("يُسمح باسمين فقط بحروف عربية أو إنجليزية", "Two words, Arabic or English letters only"));
        } else if (error.code === "PGRST202" || /function|schema cache|does not exist/i.test(m)) {
          // migration not applied — fall back to direct update
          await supabase.from("profiles").update({ full_name: check.value }).eq("id", userId);
          setNameChangedAt(Date.now());
          await refreshUser();
          flash(t("تم حفظ الاسم", "Name saved"));
        } else {
          flash(t("تعذّر حفظ الاسم", "Couldn't save the name"));
        }
      } else {
        setNameChangedAt(Date.now());
        await refreshUser();
        flash(t("تم حفظ الاسم", "Name saved"));
      }
    } catch {
      flash(t("تعذّر حفظ الاسم", "Couldn't save the name"));
    }
    setBusy(false);
  };

  const savePhone = async () => {
    if (editPhone && editPhone.length !== 9) {
      flash(t("رقم الجوال يجب أن يتكون من 9 أرقام", "Phone must be exactly 9 digits"));
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const value = editPhone ? `+966${editPhone}` : null;
      const { error } = await supabase.from("profiles").update({ phone: value }).eq("id", userId);
      if (error && /column|phone/i.test(error.message || "")) {
        flash(t("عمود رقم الجوال غير موجود بعد", "Phone column not added yet"));
      } else {
        flash(t("تم حفظ رقم الجوال", "Phone saved"));
      }
    } catch { flash(t("تعذّر حفظ رقم الجوال", "Couldn't save phone")); }
    setBusy(false);
  };

  const changePassword = async () => {
    if (newPass.length < 6) { setPwMsg(t("كلمة المرور يجب أن تكون 6 أحرف على الأقل", "Min 6 characters")); return; }
    if (newPass !== confirmPass) { setPwMsg(t("كلمتا المرور غير متطابقتين", "Passwords don't match")); return; }
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) setPwMsg(t("تعذّر تغيير كلمة المرور. أعد تسجيل الدخول وحاول مجدداً.", "Couldn't change password. Re-login and retry."));
      else { setPwMsg(t("تم تغيير كلمة المرور بنجاح", "Password changed")); setNewPass(""); setConfirmPass(""); }
    } catch { setPwMsg(t("حدث خطأ غير متوقع", "Unexpected error")); }
    setBusy(false);
    setTimeout(() => setPwMsg(""), 4500);
  };

  // ── Avatar ───────────────────────────────────────────────────────
  const [avatarModal, setAvatarModal] = useState(false);
  const fileRef = useRef(null);

  const onPickAvatar = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { flash(t("يُسمح بملفات الصور فقط", "Image files only")); return; }
    if (file.size > MAX_AVATAR_BYTES) { flash(t("حجم الصورة يجب أن يكون أقل من 2 ميجابايت", "Image must be under 2MB")); return; }

    setBusy(true);
    try {
      const supabase = createClient();
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${userId}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) {
        if (/policy|denied|unauthor|row-level/i.test(upErr.message || "")) {
          flash(t("تعذّر الرفع: صلاحيات التخزين غير مفعّلة", "Upload blocked: storage policy missing"));
        } else {
          flash(t("تعذّر رفع الصورة، حاول مجدداً", "Upload failed, try again"));
        }
        setBusy(false);
        return;
      }
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      await supabase.from("profiles").update({ avatar_url: `${publicUrl}?t=${Date.now()}` }).eq("id", userId);
      await refreshUser();
      flash(t("تم تحديث الصورة", "Photo updated"));
      setAvatarModal(false);
    } catch { flash(t("تعذّر رفع الصورة", "Upload failed")); }
    setBusy(false);
  };

  const deleteAvatar = async () => {
    setBusy(true);
    try {
      const supabase = createClient();
      try {
        const { data: list } = await supabase.storage.from("avatars").list(userId);
        if (list?.length) await supabase.storage.from("avatars").remove(list.map((f) => `${userId}/${f.name}`));
      } catch {}
      await supabase.from("profiles").update({ avatar_url: null }).eq("id", userId);
      await refreshUser();
      flash(t("تم حذف الصورة", "Photo removed"));
      setAvatarModal(false);
    } catch { flash(t("تعذّر حذف الصورة", "Couldn't remove photo")); }
    setBusy(false);
  };

  const signOutEverywhere = async () => {
    const supabase = createClient();
    try { await supabase.auth.signOut({ scope: "global" }); } catch {}
    window.location.href = "/";
  };

  const deleteAccount = async () => {
    if (!confirm(t("هل أنت متأكد من حذف الحساب؟ سيتم تسجيل خروجك.", "Delete account? You'll be signed out."))) return;
    const supabase = createClient();
    try { await supabase.from("profiles").update({ avatar_url: null }).eq("id", userId); } catch {}
    try { await supabase.auth.signOut(); } catch {}
    window.location.href = "/";
  };

  if (!isSignedIn) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title={t("الإعدادات", "Settings")} subtitle={t("إدارة حسابك وتفضيلاتك", "Manage your account")} icon={Settings} />
        <div className="glass-strong rounded-3xl p-8 text-center">
          <p className="text-ink-soft">{t("سجّل الدخول لإدارة حسابك.", "Sign in to manage your account.")}</p>
          <a href="/sign-in" className="btn-gold mt-4 inline-block px-6 py-2.5 text-sm">{t("تسجيل الدخول", "Sign in")}</a>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("الإعدادات", "Settings")} subtitle={t("إدارة حسابك وتفضيلاتك", "Manage your account")} icon={Settings} />

      {msg && (
        <div className="mb-4 rounded-2xl bg-emerald-50 px-4 py-2.5 text-center text-sm font-semibold text-emerald-700 border border-emerald-200">
          {msg}
        </div>
      )}

      {/* Profile */}
      <Section icon={UserCog} title={t("الملف الشخصي", "Profile")}>
        <div className="flex items-center gap-4">
          <button onClick={() => setAvatarModal(true)} className="relative" title={t("إدارة الصورة", "Manage photo")}>
            <Avatar src={imageUrl} name={name} size={72} />
            <span className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-gold text-white shadow-gold">
              <Camera size={13} />
            </span>
          </button>
          <div className="flex-1">
            <p className="font-extrabold text-ink">{name || t("مستخدم جزيرة", "Jazira user")}</p>
            <p className="text-xs text-ink-muted">{t("اضغط على الصورة لعرضها أو تغييرها أو حذفها", "Tap the photo to view, change or remove")}</p>
            {isElite && <span className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-gold-dark"><Crown size={12} /> {t("عضو النخبة", "Elite member")}</span>}
          </div>
        </div>

        {/* Display name + cooldown */}
        <div className="mt-4">
          <label className="mb-1.5 block text-sm font-medium text-ink">{t("الاسم المعروض", "Display name")}</label>
          <div className="flex gap-2">
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              maxLength={50}
              disabled={nameLocked}
              placeholder={t("مثال: عبدالله محمد", "e.g. Abdullah Mohammed")}
              className="flex-1 rounded-2xl bg-white/70 px-4 py-2.5 text-ink outline-none focus:ring-2 focus:ring-champagne-400 disabled:opacity-60"
              style={{ border: "1px solid rgba(201,168,106,0.3)" }}
            />
            <button onClick={saveName} disabled={busy || nameLocked} className="btn-gold px-4 py-2.5 text-sm disabled:opacity-50">{t("حفظ", "Save")}</button>
          </div>
          {nameLocked ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-gold-dark ltr-nums">
              <Clock size={13} /> {t("يمكنك تغيير الاسم بعد:", "You can change the name in:")} {fmtCooldown(cooldownRemaining)}
            </p>
          ) : (
            <p className="mt-1 text-xs text-ink-muted">{t("اسمان فقط. يمكن لأكثر من مستخدم اختيار نفس الاسم. يتغيّر مرة كل 7 أيام.", "Two words. Duplicates allowed. Changes once every 7 days.")}</p>
          )}
        </div>
      </Section>

      {/* Private info */}
      <Section icon={Lock} title={t("بيانات خاصة (تظهر لك وحدك)", "Private (only you see this)")}>
        <Row icon={Mail} label={t("البريد الإلكتروني", "Email")}>
          <span className="text-sm text-ink-soft ltr-nums" dir="ltr">{email || "—"}</span>
        </Row>
        <div className="border-t border-champagne-200/60" />
        <div className="py-3">
          <label className="mb-1.5 flex items-center gap-2 text-sm text-ink"><Phone size={16} className="text-champagne-500" /> {t("رقم الجوال (اختياري)", "Phone (optional)")}</label>
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
            <button onClick={savePhone} disabled={busy} className="btn-gold px-4 py-2.5 text-sm disabled:opacity-50">{t("حفظ", "Save")}</button>
          </div>
        </div>
      </Section>

      {/* Password */}
      <Section icon={KeyRound} title={t("كلمة المرور", "Password")}>
        {canChangePassword ? (
          <>
            <div className="space-y-2">
              <input
                type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)}
                placeholder={t("كلمة مرور جديدة (6 أحرف على الأقل)", "New password (min 6)")}
                className="w-full rounded-2xl bg-white/70 px-4 py-2.5 text-ink outline-none focus:ring-2 focus:ring-champagne-400"
                style={{ border: "1px solid rgba(201,168,106,0.3)" }}
              />
              <div className="flex gap-2">
                <input
                  type="password" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)}
                  placeholder={t("تأكيد كلمة المرور", "Confirm password")}
                  className="flex-1 rounded-2xl bg-white/70 px-4 py-2.5 text-ink outline-none focus:ring-2 focus:ring-champagne-400"
                  style={{ border: "1px solid rgba(201,168,106,0.3)" }}
                />
                <button onClick={changePassword} disabled={busy} className="btn-gold px-4 py-2.5 text-sm disabled:opacity-50">{t("تغيير", "Change")}</button>
              </div>
            </div>
            {pwMsg && <p className="mt-2 text-sm text-ink-soft">{pwMsg}</p>}
          </>
        ) : (
          <p className="rounded-2xl bg-white/60 p-3 text-sm text-ink-soft" style={{ border: "1px solid rgba(201,168,106,0.3)" }}>
            {t(
              "لقد سجّلت الدخول عبر Google، لذلك لا توجد كلمة مرور لتغييرها. تُدار هويتك بأمان عبر حساب Google الخاص بك.",
              "You signed in with Google, so there's no password to change. Your identity is managed securely by Google."
            )}
          </p>
        )}
      </Section>

      {/* Preferences (persisted in Supabase) */}
      <Section icon={Settings} title={t("التفضيلات", "Preferences")}>
        <div className="divide-y divide-champagne-200/60">
          <Row icon={Moon} label={t("الوضع الليلي", "Dark mode")}><Toggle on={isDark} onClick={toggleTheme} /></Row>
          <Row icon={Bell} label={t("الإشعارات", "Notifications")}><Toggle on={local.notif} onClick={() => setLocalPref("notif", !local.notif)} /></Row>
          <Row icon={Volume2} label={t("المؤثرات الصوتية", "Sound effects")}><Toggle on={sound} onClick={() => setSound(!sound)} /></Row>
          <Row icon={Globe} label={t("اللغة", "Language")}>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="rounded-xl bg-white/70 px-3 py-1.5 text-sm text-ink outline-none"
              style={{ border: "1px solid rgba(201,168,106,0.3)" }}
            >
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </Row>
        </div>
      </Section>

      {/* AI & community */}
      <Section icon={Bot} title={t("تفضيلات المساعد الذكي والمجتمع", "AI & community")}>
        <div className="divide-y divide-champagne-200/60">
          <Row icon={Bot} label={t("اقتراحات المساعد الذكي", "AI suggestions")}><Toggle on={aiSuggestions} onClick={() => setAiSuggestions(!aiSuggestions)} /></Row>
          <Row icon={Users} label={t("إظهار شارة النخبة في المجتمع", "Show Elite badge in community")}><Toggle on={local.communityBadge} onClick={() => setLocalPref("communityBadge", !local.communityBadge)} /></Row>
        </div>
      </Section>

      {/* Privacy & security */}
      <Section icon={ShieldCheck} title={t("الخصوصية والأمان", "Privacy & security")}>
        <Row icon={ShieldCheck} label={t("إبقاء بياناتي الخاصة مخفية", "Keep my private data hidden")}>
          <Toggle on={local.privateProfile} onClick={() => setLocalPref("privateProfile", !local.privateProfile)} />
        </Row>
        <p className="text-xs text-ink-muted">{t("بريدك ورقم جوالك مخفيان دائماً عن باقي المستخدمين.", "Your email and phone are always hidden from others.")}</p>
      </Section>

      {/* Sessions */}
      <Section icon={Smartphone} title={t("الأجهزة النشطة / الجلسات", "Active devices / sessions")}>
        <Row icon={Smartphone} label={t("الجلسة الحالية", "Current session")}>
          <span className="text-xs font-semibold text-emerald-600">{t("نشطة الآن", "Active now")}</span>
        </Row>
        <button onClick={signOutEverywhere} className="btn-ghost mt-2 flex w-full items-center justify-center gap-2 text-sm">
          <LogOut size={16} /> {t("تسجيل الخروج من جميع الأجهزة", "Sign out of all devices")}
        </button>
      </Section>

      {/* Danger zone */}
      <Section icon={Trash2} title={t("تعطيل أو حذف الحساب", "Disable or delete account")}>
        <p className="mb-3 text-sm text-ink-soft">{t("يمكنك تسجيل الخروج أو طلب حذف حسابك.", "Sign out or request account deletion.")}</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={signOutEverywhere} className="btn-ghost flex items-center gap-2 text-sm">
            <LogOut size={16} /> {t("تسجيل الخروج", "Sign out")}
          </button>
          <button onClick={deleteAccount} className="flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-100 transition">
            <Trash2 size={16} /> {t("حذف الحساب", "Delete account")}
          </button>
        </div>
      </Section>

      <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-xs text-ink-muted">
        <ShieldCheck size={14} /> {t("بياناتك محمية ومشفّرة في منصة جزيرة", "Your data is encrypted and protected")} · XP: <span className="ltr-nums">{xp}</span>
      </p>

      {/* Avatar modal */}
      {avatarModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm" onClick={() => setAvatarModal(false)}>
          <div className="glass-strong w-full max-w-sm rounded-3xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-ink">{t("الصورة الشخصية", "Profile photo")}</h3>
              <button onClick={() => setAvatarModal(false)} className="rounded-full p-1.5 hover:bg-white/50"><X size={20} /></button>
            </div>

            <div className="mb-5 flex justify-center">
              <Avatar src={imageUrl} name={name} size={160} />
            </div>

            <input ref={fileRef} type="file" accept="image/*" onChange={onPickAvatar} hidden />

            <div className="space-y-2">
              {imageUrl && (
                <a href={imageUrl} target="_blank" rel="noreferrer" className="btn-ghost flex w-full items-center justify-center gap-2 text-sm">
                  <Eye size={16} /> {t("عرض الصورة", "View photo")}
                </a>
              )}
              <button onClick={() => fileRef.current?.click()} disabled={busy} className="btn-gold flex w-full items-center justify-center gap-2 disabled:opacity-50">
                <RefreshCw size={16} /> {t("تغيير الصورة", "Change photo")}
              </button>
              {imageUrl && (
                <button onClick={deleteAvatar} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-50 py-3 text-sm font-bold text-red-600 hover:bg-red-100 transition disabled:opacity-50">
                  <Trash2 size={16} /> {t("حذف الصورة", "Remove photo")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
