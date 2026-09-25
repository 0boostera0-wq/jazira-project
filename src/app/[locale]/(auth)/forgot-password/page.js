'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, KeyRound, Lock, Check, Loader2, ArrowRight, MailCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';
import AuthShell from '@/components/AuthShell';

const field =
  'w-full rounded-xl border border-white/40 bg-white/60 px-4 py-2.5 text-ink placeholder-ink-muted focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20';

const STEPS = [
  { id: 1, label: 'البريد', Icon: Mail },
  { id: 2, label: 'الرمز', Icon: KeyRound },
  { id: 3, label: 'كلمة المرور', Icon: Lock },
];

export default function ForgotPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const sendCode = async (e) => {
    e?.preventDefault();
    setError('');
    if (!email) return;
    setLoading(true);
    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (error) throw error;
      setStep(2);
    } catch {
      // Do not reveal whether an email exists — always advance elegantly.
      setStep(2);
    }
    setLoading(false);
  };

  const verifyCode = async (e) => {
    e.preventDefault();
    setError('');
    if (code.trim().length < 6) { setError('أدخل الرمز المكوّن من 6 أرقام'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'recovery' });
      if (error) throw error;
      setStep(3);
    } catch {
      setError('الرمز غير صحيح أو منتهي الصلاحية. يمكنك إعادة الإرسال أو استخدام الرابط في بريدك.');
    }
    setLoading(false);
  };

  const resetPassword = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return; }
    if (password !== confirm) { setError('كلمتا المرور غير متطابقتين'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setTimeout(() => router.push('/sign-in'), 2200);
    } catch {
      setError('تعذّر تحديث كلمة المرور. تأكد من صلاحية الجلسة أو أعد المحاولة.');
    }
    setLoading(false);
  };

  return (
    <AuthShell
      title="استعادة كلمة المرور"
      subtitle="سنساعدك على استعادة الوصول إلى حسابك بأمان"
      footer={<>تذكّرت كلمة المرور؟ <Link href="/sign-in" className="font-semibold text-gold hover:underline">تسجيل الدخول</Link></>}
    >
      {/* step indicator */}
      <div className="mb-6 flex items-center justify-between">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex flex-1 items-center">
            <div className={`flex items-center gap-2 ${step >= s.id ? 'text-gold' : 'text-ink-muted'}`}>
              <span className={`grid h-8 w-8 place-items-center rounded-full text-white transition ${step > s.id ? 'bg-emerald-500' : step === s.id ? 'bg-gold-gradient shadow-gold' : 'bg-champagne-200'}`}>
                {step > s.id ? <Check size={15} /> : <s.Icon size={15} />}
              </span>
              <span className="hidden text-xs font-bold sm:inline">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && <span className={`mx-2 h-0.5 flex-1 rounded ${step > s.id ? 'bg-emerald-400' : 'bg-champagne-200'}`} />}
          </div>
        ))}
      </div>

      {done ? (
        <div className="py-6 text-center">
          <span className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-emerald-500 text-white"><Check size={30} /></span>
          <p className="text-lg font-extrabold text-ink">تم تحديث كلمة المرور</p>
          <p className="mt-1 text-sm text-ink-soft">سيتم تحويلك لتسجيل الدخول الآن.</p>
        </div>
      ) : (
        <>
          {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          {step === 1 && (
            <form onSubmit={sendCode} className="space-y-4">
              <p className="text-sm text-ink-soft">أدخل بريدك الإلكتروني وسنرسل لك رمز تحقّق ورابطاً لإعادة التعيين.</p>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">البريد الإلكتروني</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="example@email.com" dir="ltr" className={field} />
              </div>
              <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gold-gradient px-4 py-2.5 font-semibold text-white shadow-gold transition hover:brightness-105 disabled:opacity-50">
                {loading ? <Loader2 size={17} className="animate-spin" /> : <ArrowRight size={16} />} إرسال الرمز
              </button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={verifyCode} className="space-y-4">
              <div className="flex items-start gap-2.5 rounded-xl bg-champagne-100/60 p-3 text-sm text-ink-soft">
                <MailCheck size={18} className="mt-0.5 shrink-0 text-gold" />
                <span>أرسلنا رمزاً إلى <b dir="ltr" className="text-ink">{email}</b>. أدخل الرمز أدناه أو افتح الرابط في بريدك مباشرة.</span>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">رمز التحقّق</label>
                <input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} required placeholder="______" dir="ltr" className={`${field} text-center text-2xl font-extrabold tracking-[0.5em]`} />
              </div>
              <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gold-gradient px-4 py-2.5 font-semibold text-white shadow-gold transition hover:brightness-105 disabled:opacity-50">
                {loading ? <Loader2 size={17} className="animate-spin" /> : <KeyRound size={16} />} تحقّق من الرمز
              </button>
              <button type="button" onClick={sendCode} className="w-full text-center text-xs font-semibold text-gold hover:underline">لم يصلك الرمز؟ إعادة الإرسال</button>
            </form>
          )}

          {step === 3 && (
            <form onSubmit={resetPassword} className="space-y-4">
              <p className="text-sm text-ink-soft">اختر كلمة مرور جديدة لحسابك.</p>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">كلمة المرور الجديدة</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="6 أحرف على الأقل" className={field} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">تأكيد كلمة المرور</label>
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required placeholder="أعد كتابة كلمة المرور" className={field} />
              </div>
              <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gold-gradient px-4 py-2.5 font-semibold text-white shadow-gold transition hover:brightness-105 disabled:opacity-50">
                {loading ? <Loader2 size={17} className="animate-spin" /> : <Lock size={16} />} حفظ كلمة المرور
              </button>
            </form>
          )}
        </>
      )}
    </AuthShell>
  );
}
