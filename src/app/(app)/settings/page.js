"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Settings, Bell, Moon, Volume2, Globe, ShieldCheck, Crown, Camera,
  Eye, Trash2, RefreshCw, X, Lock, LogOut, Smartphone, Bot,
  UserCog, KeyRound, Mail, Phone, Clock, BadgeCheck, UserX,
  Laptop, Tablet, MapPin, Pencil,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Avatar from "@/components/Avatar";
import { useApp } from "@/context/AppContext";
import { useAuthUser } from "@/context/AuthProvider";
import { usePreferences } from "@/context/PreferencesProvider";
import { createClient } from "@/lib/supabase-client";
import { validateFullName } from "@/lib/profile";
import SocialSettings from "@/components/social/SocialSettings";

const LOCAL_KEY = "jazira_local_prefs_v1";
const SID_KEY = "jazira_session_id_v1";
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const DAY = 24 * 60 * 60 * 1000;
const AVATAR_COOLDOWN_MS = 10 * DAY;
const PHONE_COOLDOWN_MS = 1 * DAY;

function readLocal() {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || {}; } catch { return {}; }
}
function localSid() {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(SID_KEY); } catch { return null; }
}

function Toggle({ on, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-pressed={on}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40 ${on ? "bg-gold-gradient" : "bg-champagne-200"}`}>
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "right-1" : "right-6"}`} />
    </button>
  );
}
function Section({ icon: Icon, title, sub, children }) {
  return (
    <div className="bezel mb-5">
      <div className="bezel-core glass-strong p-5 sm:p-6">
        <h3 className="flex items-center gap-2 font-extrabold text-ink"><Icon size={18} className="text-champagne-500" /> {title}</h3>
        {sub && <p className="mt-1 text-xs text-ink-muted">{sub}</p>}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
function Row({ icon: Icon, label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span className="flex items-center gap-3 text-ink">{Icon && <Icon size={18} className="text-champagne-500" />} {label}</span>
      {children}
    </div>
  );
}
function fmtRemain(ms, t) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return t(`${d} يوم، ${h} ساعة، ${m} دقيقة، ${sec} ثانية`, `${d}d ${h}h ${m}m ${sec}s`);
}
// Friendly "last active" label for an active-session row.
function relTime(ts, nowMs, t) {
  if (!ts) return "";
  const m = Math.floor((nowMs - new Date(ts).getTime()) / 60000);
  if (m < 2) return t("نشط الآن", "Active now");
  if (m < 60) return t(`نشط قبل ${m} دقيقة`, `${m}m ago`);
  const h = Math.floor(m / 60);
  if (h < 24) return t(`نشط قبل ${h} ساعة`, `${h}h ago`);
  const d = Math.floor(h / 24);
  if (d < 30) return t(`نشط قبل ${d} يوم`, `${d}d ago`);
  return new Date(ts).toLocaleDateString(t("ar-SA", "en-US"));
}

export default function SettingsPage() {
  const { isDark, toggleTheme, xp } = useApp();
  const { isSignedIn, userId, name, email, imageUrl, isElite, showEliteBadge, anonymousCommunity, refreshUser } = useAuthUser();
  const { sound, language, aiSuggestions, setSound, setLanguage, setAiSuggestions, t } = usePreferences();

  const [local, setLocal] = useState({ notif: true });
  useEffect(() => { setLocal((p) => ({ ...p, ...readLocal() })); }, []);
  const setLocalPref = (k, v) => setLocal((p) => { const n = { ...p, [k]: v }; try { localStorage.setItem(LOCAL_KEY, JSON.stringify(n)); } catch {} return n; });

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 3500); };
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  // profile meta
  const [editName, setEditName] = useState("");
  const [nameChangedAt, setNameChangedAt] = useState(null);
  const [avatarChangedAt, setAvatarChangedAt] = useState(null);
  const [phoneChangedAt, setPhoneChangedAt] = useState(null);
  const [editPhone, setEditPhone] = useState("");
  const [phoneUnlocked, setPhoneUnlocked] = useState(false);
  const [badgePref, setBadgePref] = useState(true);
  const [anonPref, setAnonPref] = useState(false);

  // password
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [canChangePassword, setCanChangePassword] = useState(true);

  // sessions
  const [sessions, setSessions] = useState([]);
  const sid = localSid();

  useEffect(() => { setEditName(name || ""); }, [name]);
  useEffect(() => { setBadgePref(showEliteBadge); }, [showEliteBadge]);
  useEffect(() => { setAnonPref(anonymousCommunity); }, [anonymousCommunity]);

  const loadSessions = useCallback(async () => {
    if (!userId) return;
    try {
      const supabase = createClient();
      const base = "session_id, device_label, browser, os, device_type, last_active_at, created_at";
      // Try with location; gracefully fall back if migration 0007 isn't applied.
      let { data, error } = await supabase.from("user_sessions")
        .select(`${base}, location`)
        .eq("user_id", userId).is("revoked_at", null).order("last_active_at", { ascending: false });
      if (error) {
        const r = await supabase.from("user_sessions")
          .select(base)
          .eq("user_id", userId).is("revoked_at", null).order("last_active_at", { ascending: false });
        data = r.data;
      }
      setSessions(data || []);
    } catch {}
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      // profile meta with fallback if new columns aren't migrated yet
      let prof = null;
      const full = await supabase.from("profiles")
        .select("phone, full_name_changed_at, avatar_changed_at, phone_changed_at, show_elite_badge, anonymous_community")
        .eq("id", userId).single();
      if (full.error) {
        const basic = await supabase.from("profiles").select("phone, full_name_changed_at").eq("id", userId).single();
        prof = basic.data;
      } else prof = full.data;
      if (!cancelled && prof) {
        if (prof.phone) setEditPhone(String(prof.phone).replace(/^\+?966/, "").replace(/\D/g, ""));
        if (prof.full_name_changed_at) setNameChangedAt(new Date(prof.full_name_changed_at).getTime());
        if (prof.avatar_changed_at) setAvatarChangedAt(new Date(prof.avatar_changed_at).getTime());
        if (prof.phone_changed_at) setPhoneChangedAt(new Date(prof.phone_changed_at).getTime());
        if (typeof prof.show_elite_badge === "boolean") setBadgePref(prof.show_elite_badge);
        if (typeof prof.anonymous_community === "boolean") setAnonPref(prof.anonymous_community);
      }
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const ids = user?.identities || [];
        const hasEmail = ids.some((i) => i.provider === "email") || user?.app_metadata?.provider === "email";
        if (!cancelled) setCanChangePassword(ids.length === 0 ? true : hasEmail);
      } catch {}
      loadSessions();
    })();
    return () => { cancelled = true; };
  }, [userId, loadSessions]);

  // ── cooldowns ──
  const nameCooldownMs = isElite ? DAY : 14 * DAY;
  const nameRemain = nameChangedAt ? Math.max(0, nameChangedAt + nameCooldownMs - now) : 0;
  const nameLocked = nameRemain > 0;

  const avatarRemain = (!isElite && avatarChangedAt) ? Math.max(0, avatarChangedAt + AVATAR_COOLDOWN_MS - now) : 0;
  const avatarLocked = avatarRemain > 0;

  const phoneRemain = phoneChangedAt ? Math.max(0, phoneChangedAt + PHONE_COOLDOWN_MS - now) : 0;
  const phoneLocked = phoneRemain > 0;

  // ── name ──
  const saveName = async () => {
    const check = validateFullName(editName);
    if (!check.ok) { flash(check.error); return; }
    if (nameLocked) { flash(t("لا يمكنك تغيير الاسم الآن", "You can't change the name yet")); return; }
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("update_full_name", { new_name: check.value });
      if (error) {
        const m = error.message || "";
        if (/name_cooldown/i.test(m)) { flash(t("انتهت مدة التغيير لم تكتمل بعد", "Name cooldown not finished")); const { data } = await supabase.from("profiles").select("full_name_changed_at").eq("id", userId).single(); if (data?.full_name_changed_at) setNameChangedAt(new Date(data.full_name_changed_at).getTime()); }
        else if (/invalid_name_format/i.test(m)) flash(t("يُسمح باسمين فقط بحروف عربية أو إنجليزية", "Two words, letters only"));
        else if (error.code === "PGRST202" || /function|schema cache|does not exist/i.test(m)) { await supabase.from("profiles").update({ full_name: check.value }).eq("id", userId); setNameChangedAt(Date.now()); await refreshUser(); flash(t("تم حفظ الاسم", "Name saved")); }
        else flash(t("تعذّر حفظ الاسم", "Couldn't save the name"));
      } else { setNameChangedAt(Date.now()); await refreshUser(); flash(t("تم حفظ الاسم", "Name saved")); }
    } catch { flash(t("تعذّر حفظ الاسم", "Couldn't save the name")); }
    setBusy(false);
  };

  // ── phone ──
  const savePhone = async () => {
    if (editPhone && editPhone.length !== 9) { flash(t("رقم الجوال يجب أن يتكون من 9 أرقام", "Phone must be 9 digits")); return; }
    if (phoneLocked) { flash(t("لا يمكن تعديل الرقم الآن", "Phone change locked")); return; }
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("update_phone", { new_phone: editPhone || "" });
      if (error) {
        const m = error.message || "";
        if (/phone_cooldown/i.test(m)) flash(t("يمكنك تعديل الرقم مرة كل 24 ساعة", "Phone changes once per 24h"));
        else if (/invalid_phone/i.test(m)) flash(t("رقم غير صالح", "Invalid phone"));
        else if (error.code === "PGRST202" || /function|schema cache|does not exist/i.test(m)) { await supabase.from("profiles").update({ phone: editPhone ? `+966${editPhone}` : null }).eq("id", userId); setPhoneChangedAt(Date.now()); setPhoneUnlocked(false); flash(t("تم حفظ رقم الجوال", "Phone saved")); }
        else flash(t("تعذّر حفظ الرقم", "Couldn't save phone"));
      } else { setPhoneChangedAt(Date.now()); setPhoneUnlocked(false); flash(t("تم حفظ رقم الجوال", "Phone saved")); }
    } catch { flash(t("تعذّر حفظ الرقم", "Couldn't save phone")); }
    setBusy(false);
  };

  // ── badge / anonymous (public profiles columns) ──
  const saveProfileFlag = async (col, value, setter) => {
    setter(value);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("profiles").update({ [col]: value }).eq("id", userId);
      if (error) { setter(!value); flash(t("تعذّر حفظ الإعداد", "Couldn't save setting")); }
      else { await refreshUser(); }
    } catch { setter(!value); flash(t("تعذّر حفظ الإعداد", "Couldn't save setting")); }
  };

  // ── password ──
  const changePassword = async () => {
    if (newPass.length < 6) { setPwMsg(t("كلمة المرور 6 أحرف على الأقل", "Min 6 characters")); return; }
    if (newPass !== confirmPass) { setPwMsg(t("كلمتا المرور غير متطابقتين", "Passwords don't match")); return; }
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) setPwMsg(t("تعذّر تغيير كلمة المرور. أعد الدخول وحاول.", "Couldn't change password."));
      else { setPwMsg(t("تم تغيير كلمة المرور بنجاح", "Password changed")); setNewPass(""); setConfirmPass(""); }
    } catch { setPwMsg(t("حدث خطأ غير متوقع", "Unexpected error")); }
    setBusy(false);
    setTimeout(() => setPwMsg(""), 4500);
  };

  // ── avatar (unique path + set_avatar RPC cooldown) ──
  const [avatarModal, setAvatarModal] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const fileRef = useRef(null);

  const cleanupOldAvatars = async (supabase, keepPath) => {
    try {
      const { data: list } = await supabase.storage.from("avatars").list(userId);
      const stale = (list || []).map((f) => `${userId}/${f.name}`).filter((p) => p !== keepPath);
      if (stale.length) await supabase.storage.from("avatars").remove(stale);
    } catch {}
  };

  const onPickAvatar = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { flash(t("يُسمح بملفات الصور فقط", "Image files only")); return; }
    if (file.size > MAX_AVATAR_BYTES) { flash(t("حجم الصورة أقل من 2 ميجابايت", "Image under 2MB")); return; }
    if (avatarLocked) { flash(t("لا يمكنك تغيير الصورة الآن", "Photo change locked")); return; }

    setBusy(true);
    try {
      const supabase = createClient();
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type });
      if (upErr) {
        flash(/policy|denied|unauthor|row-level/i.test(upErr.message || "") ? t("تعذّر الرفع: صلاحيات التخزين غير مفعّلة", "Upload blocked: storage policy missing") : t("تعذّر رفع الصورة", "Upload failed"));
        setBusy(false); return;
      }
      const url = `${supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl}?t=${Date.now()}`;
      const { error: rpcErr } = await supabase.rpc("set_avatar", { new_url: url });
      if (rpcErr) {
        const m = rpcErr.message || "";
        if (/avatar_cooldown/i.test(m)) { flash(t("يمكنك تغيير الصورة كل 10 أيام", "Photo changes every 10 days")); await supabase.storage.from("avatars").remove([path]); }
        else if (rpcErr.code === "PGRST202" || /function|schema cache|does not exist/i.test(m)) { await supabase.from("profiles").update({ avatar_url: url }).eq("id", userId); setAvatarChangedAt(Date.now()); await cleanupOldAvatars(supabase, path); await refreshUser(); flash(t("تم تحديث الصورة", "Photo updated")); setAvatarModal(false); }
        else { flash(t("تعذّر تحديث الصورة", "Couldn't update photo")); await supabase.storage.from("avatars").remove([path]); }
      } else { setAvatarChangedAt(Date.now()); await cleanupOldAvatars(supabase, path); await refreshUser(); flash(t("تم تحديث الصورة", "Photo updated")); setAvatarModal(false); }
    } catch { flash(t("تعذّر رفع الصورة", "Upload failed")); }
    setBusy(false);
  };

  const deleteAvatar = async () => {
    setBusy(true);
    try {
      const supabase = createClient();
      try { const { data: list } = await supabase.storage.from("avatars").list(userId); if (list?.length) await supabase.storage.from("avatars").remove(list.map((f) => `${userId}/${f.name}`)); } catch {}
      await supabase.from("profiles").update({ avatar_url: null }).eq("id", userId);
      await refreshUser();
      flash(t("تم حذف الصورة", "Photo removed")); setAvatarModal(false);
    } catch { flash(t("تعذّر حذف الصورة", "Couldn't remove photo")); }
    setBusy(false);
  };

  // ── sessions ──
  const revokeSession = async (s) => {
    const supabase = createClient();
    const isCurrent = s.session_id === sid;
    try {
      await supabase.from("user_sessions").update({ revoked_at: new Date().toISOString() }).eq("user_id", userId).eq("session_id", s.session_id);
      if (isCurrent) { try { localStorage.removeItem(SID_KEY); } catch {}; await supabase.auth.signOut({ scope: "local" }); window.location.href = "/"; return; }
      setSessions((prev) => prev.filter((x) => x.session_id !== s.session_id));
      flash(t("تم تسجيل الخروج من الجهاز", "Signed out that device"));
    } catch { flash(t("تعذّر تسجيل الخروج", "Couldn't sign out")); }
  };

  const signOutEverywhere = async () => { const supabase = createClient(); try { await supabase.auth.signOut({ scope: "global" }); } catch {}; window.location.href = "/"; };

  const confirmDeleteAccount = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (res.ok) { try { await createClient().auth.signOut(); } catch {}; window.location.href = "/"; return; }
      const body = await res.json().catch(() => ({}));
      flash(body?.message || t("تعذّر حذف الحساب الآن.", "Couldn't delete the account."));
    } catch { flash(t("تعذّر الاتصال بالخادم.", "Server connection failed.")); }
    setBusy(false); setShowDelete(false);
  };

  if (!isSignedIn) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title={t("الإعدادات", "Settings")} subtitle={t("مركز التحكّم بحسابك", "Your account control center")} icon={Settings} />
        <div className="bezel"><div className="bezel-core glass-strong p-8 text-center">
          <p className="text-ink-soft">{t("سجّل الدخول لإدارة حسابك.", "Sign in to manage your account.")}</p>
          <a href="/sign-in" className="cta-lux mt-4 inline-flex"><span>{t("تسجيل الدخول", "Sign in")}</span></a>
        </div></div>
      </div>
    );
  }

  const deviceIcon = (dt) => dt === "جوال" ? Smartphone : dt === "جهاز لوحي" ? Tablet : Laptop;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("الإعدادات", "Settings")} subtitle={t("مركز التحكّم بحسابك وخصوصيتك", "Control your account & privacy")} icon={Settings} />

      {msg && <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-center text-sm font-semibold text-emerald-700">{msg}</div>}

      {/* Profile */}
      <Section icon={UserCog} title={t("الملف الشخصي", "Profile")}>
        <div className="flex items-center gap-4">
          <button onClick={() => setAvatarModal(true)} className="relative" title={t("إدارة الصورة", "Manage photo")}>
            <Avatar src={imageUrl} name={name} size={72} />
            <span className="absolute bottom-0 right-0 grid h-7 w-7 place-items-center rounded-full bg-gold text-white shadow-gold"><Camera size={13} /></span>
          </button>
          <div className="flex-1">
            <p className="flex items-center gap-1.5 font-extrabold text-ink">{name || t("مستخدم جزيرة", "Jazira user")} {isElite && badgePref && <Crown size={14} className="text-gold" />}</p>
            <p className="text-xs text-ink-muted">{t("اضغط على الصورة لعرضها أو تغييرها أو حذفها", "Tap the photo to view, change or remove")}</p>
            {isElite && <span className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-gold-dark"><Crown size={12} /> {t("عضو النخبة", "Elite member")}</span>}
          </div>
        </div>
        {avatarLocked && (
          <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-champagne-100/60 px-3 py-2 text-xs font-semibold text-gold-dark ltr-nums">
            <Clock size={13} /> {t("يمكنك تغيير الصورة بعد:", "Change photo in:")} {fmtRemain(avatarRemain, t)}
          </p>
        )}

        <div className="mt-5">
          <label className="mb-1.5 block text-sm font-medium text-ink">{t("الاسم المعروض", "Display name")}</label>
          <div className="flex gap-2">
            <input value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={50} disabled={nameLocked}
              placeholder={t("مثال: عبدالله محمد", "e.g. Abdullah Mohammed")}
              className="flex-1 rounded-2xl bg-white/70 px-4 py-2.5 text-ink outline-none focus:ring-2 focus:ring-champagne-400 disabled:opacity-60" style={{ border: "1px solid rgba(201,168,106,0.3)" }} />
            <button onClick={saveName} disabled={busy || nameLocked} className="btn-gold px-4 py-2.5 text-sm disabled:opacity-50">{t("حفظ", "Save")}</button>
          </div>
          {nameLocked ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-gold-dark ltr-nums"><Clock size={13} /> {t("يمكنك التغيير بعد:", "Change in:")} {fmtRemain(nameRemain, t)}</p>
          ) : (
            <p className="mt-1 text-xs text-ink-muted">{t(`الاسم المعروض يظهر في المجتمع ولوحة التحكم. يمكنك تغييره ${isElite ? "كل 24 ساعة" : "كل 14 يوماً"}.`, isElite ? "Shown publicly. Changes every 24h." : "Shown publicly. Changes every 14 days.")}</p>
          )}
        </div>
      </Section>

      {/* Private info */}
      <Section icon={Lock} title={t("بيانات خاصة", "Private information")} sub={t("تظهر لك وحدك ولا تُشارك مع أحد", "Visible only to you — never shared")}>
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/50 px-4 py-3" style={{ border: "1px solid rgba(201,168,106,0.25)" }}>
          <span className="flex items-center gap-2 text-sm text-ink"><Mail size={16} className="text-champagne-500" /> {t("البريد الإلكتروني", "Email")}</span>
          <span className="flex items-center gap-1.5 text-sm text-ink-soft ltr-nums" dir="ltr">{email || "—"} <BadgeCheck size={14} className="text-emerald-500" /></span>
        </div>

        <div className="mt-4">
          <label className="mb-1.5 flex items-center gap-2 text-sm text-ink"><Phone size={16} className="text-champagne-500" /> {t("رقم الجوال", "Phone")}</label>
          <div className="flex gap-2" dir="ltr">
            <span className="grid place-items-center rounded-2xl bg-white/40 px-3 text-sm font-semibold text-ink" style={{ border: "1px solid rgba(201,168,106,0.3)" }}>+966</span>
            <input value={editPhone} onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, "").slice(0, 9))} inputMode="numeric" placeholder="5XXXXXXXX" disabled={!phoneUnlocked || phoneLocked}
              className="flex-1 rounded-2xl bg-white/70 px-4 py-2.5 text-ink outline-none focus:ring-2 focus:ring-champagne-400 disabled:opacity-50" style={{ border: "1px solid rgba(201,168,106,0.3)" }} />
            {phoneUnlocked ? (
              <button onClick={savePhone} disabled={busy || phoneLocked} className="btn-gold px-4 py-2.5 text-sm disabled:opacity-50">{t("حفظ", "Save")}</button>
            ) : (
              <button onClick={() => !phoneLocked && setPhoneUnlocked(true)} disabled={phoneLocked} className="cta-ghost px-4 py-2.5 text-sm disabled:opacity-50"><Pencil size={14} /> {t("تغيير", "Change")}</button>
            )}
          </div>
          {phoneLocked ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-gold-dark ltr-nums"><Clock size={13} /> {t("يمكنك التعديل بعد:", "Change in:")} {fmtRemain(phoneRemain, t)}</p>
          ) : (
            <p className="mt-1 text-xs text-ink-muted">{t("رقم الجوال يُستخدم لحماية الحساب والتنبيهات المهمة. يمكنك تعديله مرة واحدة كل 24 ساعة.", "Used to protect your account. Editable once every 24 hours.")}</p>
          )}
        </div>
      </Section>

      {/* Community privacy */}
      <Section icon={ShieldCheck} title={t("خصوصية المجتمع", "Community privacy")}>
        <div className="divide-y divide-champagne-200/60">
          <div className="py-3">
            <Row icon={BadgeCheck} label={t("إظهار شارة النخبة", "Show Elite badge")}>
              <Toggle on={isElite && badgePref} disabled={!isElite} onClick={() => saveProfileFlag("show_elite_badge", !badgePref, setBadgePref)} />
            </Row>
            <p className="text-xs text-ink-muted">{isElite ? t("تتحكم في ظهور شارة النخبة بجانب اسمك في المجتمع.", "Control whether your Elite badge appears publicly.") : t("تظهر هذه الميزة لأعضاء النخبة فقط بعد تأكيد الاشتراك.", "Available to verified Elite members only.")}</p>
          </div>
          <div className="py-3">
            <Row icon={UserX} label={t("النشر كمجهول في المجتمع", "Anonymous community mode")}>
              <Toggle on={anonPref} onClick={() => saveProfileFlag("anonymous_community", !anonPref, setAnonPref)} />
            </Row>
            <p className="text-xs text-ink-muted">{t("عند التفعيل، ستظهر مشاركاتك باسم “مجهول” مع إخفاء صورتك. إذا كنت من النخبة يمكنك إبقاء الشارة ظاهرة.", "When on, your posts show as “Anonymous” with your photo hidden. Elite members may keep the badge visible.")}</p>
          </div>
        </div>
      </Section>

      {/* Password */}
      <Section icon={KeyRound} title={t("كلمة المرور", "Password")}>
        {canChangePassword ? (
          <>
            <div className="space-y-2">
              <input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder={t("كلمة مرور جديدة (6 أحرف على الأقل)", "New password (min 6)")} className="w-full rounded-2xl bg-white/70 px-4 py-2.5 text-ink outline-none focus:ring-2 focus:ring-champagne-400" style={{ border: "1px solid rgba(201,168,106,0.3)" }} />
              <div className="flex gap-2">
                <input type="password" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} placeholder={t("تأكيد كلمة المرور", "Confirm password")} className="flex-1 rounded-2xl bg-white/70 px-4 py-2.5 text-ink outline-none focus:ring-2 focus:ring-champagne-400" style={{ border: "1px solid rgba(201,168,106,0.3)" }} />
                <button onClick={changePassword} disabled={busy} className="btn-gold px-4 py-2.5 text-sm disabled:opacity-50">{t("تغيير", "Change")}</button>
              </div>
            </div>
            {pwMsg && <p className="mt-2 text-sm text-ink-soft">{pwMsg}</p>}
          </>
        ) : (
          <p className="rounded-2xl bg-white/60 p-3 text-sm text-ink-soft" style={{ border: "1px solid rgba(201,168,106,0.3)" }}>{t("سجّلت الدخول عبر Google، لذا لا توجد كلمة مرور لتغييرها.", "You signed in with Google — no password to change.")}</p>
        )}
      </Section>

      {/* Preferences */}
      <Section icon={Settings} title={t("التفضيلات", "Preferences")}>
        <div className="divide-y divide-champagne-200/60">
          <Row icon={Moon} label={t("الوضع الليلي", "Dark mode")}><Toggle on={isDark} onClick={toggleTheme} /></Row>
          <Row icon={Bell} label={t("الإشعارات", "Notifications")}><Toggle on={local.notif} onClick={() => setLocalPref("notif", !local.notif)} /></Row>
          <Row icon={Volume2} label={t("المؤثرات الصوتية", "Sound effects")}><Toggle on={sound} onClick={() => setSound(!sound)} /></Row>
          <Row icon={Bot} label={t("اقتراحات المساعد الذكي", "AI suggestions")}><Toggle on={aiSuggestions} onClick={() => setAiSuggestions(!aiSuggestions)} /></Row>
          <Row icon={Globe} label={t("اللغة", "Language")}>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className="rounded-xl bg-white/70 px-3 py-1.5 text-sm text-ink outline-none" style={{ border: "1px solid rgba(201,168,106,0.3)" }}>
              <option value="ar">العربية</option><option value="en">English</option>
            </select>
          </Row>
        </div>
      </Section>

      {/* Privacy & social */}
      <div className="mt-5"><SocialSettings /></div>

      {/* Active devices */}
      <Section icon={Smartphone} title={t("الأجهزة النشطة", "Active devices")} sub={t("راجع الأجهزة التي سجّلت الدخول إلى حسابك، وسجّل الخروج من أي جهاز لا تستخدمه.", "Review devices signed into your account; sign out any you don't use.")}>
        <div className="space-y-2">
          {sessions.length === 0 && <p className="text-sm text-ink-muted">{t("لا توجد جلسات مسجّلة بعد.", "No sessions recorded yet.")}</p>}
          {sessions.map((s) => {
            const Icon = deviceIcon(s.device_type);
            const current = s.session_id === sid;
            const fresh = current || (s.last_active_at && now - new Date(s.last_active_at).getTime() < 5 * 60 * 1000);
            const meta = [s.device_type, s.location].filter(Boolean).join(" · ");
            return (
              <div key={s.session_id} className="flex items-center gap-3 rounded-2xl bg-white/50 px-4 py-3" style={{ border: "1px solid rgba(201,168,106,0.25)" }}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/70 text-gold"><Icon size={18} strokeWidth={1.5} /></span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-bold text-ink">
                    {s.os || t("نظام غير معروف", "Unknown OS")}{s.browser ? ` · ${s.browser}` : ""}
                    {current && <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{t("هذا الجهاز", "This device")}</span>}
                  </p>
                  {meta && <p className="flex items-center gap-1 truncate text-[11px] text-ink-muted">{s.location && <MapPin size={11} className="shrink-0 text-champagne-500" />} <span className="truncate">{meta}</span></p>}
                  <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold">
                    <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${fresh ? "bg-emerald-500" : "bg-champagne-300"}`} />
                    <span className={fresh ? "text-emerald-600" : "text-ink-muted"}>{relTime(s.last_active_at, now, t)}</span>
                  </p>
                </div>
                <button onClick={() => revokeSession(s)} className="shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 transition">{current ? t("خروج", "Sign out") : t("إنهاء", "Revoke")}</button>
              </div>
            );
          })}
        </div>
        <button onClick={signOutEverywhere} className="btn-ghost mt-3 flex w-full items-center justify-center gap-2 text-sm"><LogOut size={16} /> {t("تسجيل الخروج من جميع الأجهزة", "Sign out of all devices")}</button>
      </Section>

      {/* Danger zone */}
      <Section icon={Trash2} title={t("حذف الحساب", "Delete account")}>
        <p className="mb-3 text-sm text-ink-soft">{t("سيتم حذف حسابك وجميع بياناتك نهائياً.", "Your account and all data will be permanently deleted.")}</p>
        <button onClick={() => setShowDelete(true)} className="flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-100 transition"><Trash2 size={16} /> {t("حذف الحساب", "Delete account")}</button>
      </Section>

      <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-xs text-ink-muted"><ShieldCheck size={14} /> {t("بياناتك محمية ومشفّرة في منصة جزيرة", "Your data is encrypted & protected")} · XP: <span className="ltr-nums">{xp}</span></p>

      {/* Avatar modal */}
      {avatarModal && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-ink/50 p-4 backdrop-blur-sm" onClick={() => setAvatarModal(false)}>
          <div className="bezel w-full max-w-sm" onClick={(e) => e.stopPropagation()}><div className="bezel-core glass-strong p-6">
            <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-extrabold text-ink">{t("الصورة الشخصية", "Profile photo")}</h3><button onClick={() => setAvatarModal(false)} className="rounded-full p-1.5 hover:bg-white/50"><X size={20} /></button></div>
            <div className="mb-5 flex justify-center"><Avatar src={imageUrl} name={name} size={160} /></div>
            <input ref={fileRef} type="file" accept="image/*" onChange={onPickAvatar} hidden />
            {avatarLocked && <p className="mb-3 rounded-xl bg-champagne-100/60 px-3 py-2 text-center text-xs font-semibold text-gold-dark ltr-nums">{t("يمكنك التغيير بعد:", "Change in:")} {fmtRemain(avatarRemain, t)}</p>}
            <p className="mb-3 text-center text-xs text-ink-muted">{t("يمكنك تغيير صورتك كل 10 أيام. أعضاء النخبة في أي وقت.", "Change your photo every 10 days. Elite members anytime.")}</p>
            <div className="space-y-2">
              {imageUrl && <a href={imageUrl} target="_blank" rel="noreferrer" className="btn-ghost flex w-full items-center justify-center gap-2 text-sm"><Eye size={16} /> {t("عرض الصورة", "View photo")}</a>}
              <button onClick={() => fileRef.current?.click()} disabled={busy || avatarLocked} className="btn-gold flex w-full items-center justify-center gap-2 disabled:opacity-50"><RefreshCw size={16} /> {t("تغيير الصورة", "Change photo")}</button>
              {imageUrl && <button onClick={deleteAvatar} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-50 py-3 text-sm font-bold text-red-600 hover:bg-red-100 transition disabled:opacity-50"><Trash2 size={16} /> {t("حذف الصورة", "Remove photo")}</button>}
            </div>
          </div></div>
        </div>
      )}

      {/* Delete confirmation */}
      {showDelete && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-ink/50 p-4 backdrop-blur-sm" onClick={() => !busy && setShowDelete(false)}>
          <div className="bezel w-full max-w-sm" onClick={(e) => e.stopPropagation()}><div className="bezel-core glass-strong p-6 text-center">
            <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-red-50 text-red-600"><Trash2 size={26} /></span>
            <h3 className="text-lg font-extrabold text-ink">{t("حذف الحساب نهائياً", "Delete account permanently")}</h3>
            <p className="mt-2 text-sm text-ink-soft">{t("سيتم حذف حسابك وجميع بياناتك (الملف، الصورة، المنشورات، التعليقات، التفاعلات، الآراء، التفضيلات، ومحادثات المساعد) نهائياً. لا يمكن التراجع.", "Your account and all data will be permanently deleted. This cannot be undone.")}</p>
            <div className="mt-5 flex gap-3">
              <button onClick={confirmDeleteAccount} disabled={busy} className="flex-1 rounded-xl bg-red-600 py-2.5 font-bold text-white hover:bg-red-700 transition disabled:opacity-50">{busy ? t("جارٍ الحذف...", "Deleting...") : t("نعم، احذف", "Yes, delete")}</button>
              <button onClick={() => setShowDelete(false)} disabled={busy} className="flex-1 rounded-xl border border-champagne-300 py-2.5 font-semibold text-ink hover:bg-champagne-50 transition">{t("إلغاء", "Cancel")}</button>
            </div>
          </div></div>
        </div>
      )}
    </div>
  );
}
