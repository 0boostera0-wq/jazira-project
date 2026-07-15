'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, Check, Loader2, ShieldAlert } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';
import AuthShell from '@/components/AuthShell';

const field =
  'w-full rounded-xl border border-white/40 bg-white/60 px-4 py-2.5 text-ink placeholder-ink-muted focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20';

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [ready, setReady] = useState(false);   // recovery session detected
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // The email link carries a recovery token; the client exchanges it for a
  // session automatically (detectSessionInUrl). Listen for it, and also check
  // any existing session so a returning recovery session works.
  useEffect(() => {
    let alive = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) { setReady(true); setChecking(false); }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      if (data?.session) setReady(true);
      setChecking(false);
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, [supabase]);

  const submit = async (e) => {
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
      setError('تعذّر تحديث كلمة المرور. قد يكون الرابط منتهي الصلاحية.');
    }
    setLoading(false);
  };

  return (
    <AuthShell
      title="تعيين كلمة مرور جديدة"
      subtitle="اختر كلمة مرور قوية لحماية حسابك"
      footer={<Link href="/sign-in" className="font-semibold text-gold hover:underline">العودة لتسجيل الدخول</Link>}
    >
      {checking ? (
        <div className="grid place-items-center py-10 text-ink-soft"><Loader2 size={26} className="animate-spin text-gold" /><p className="mt-3 text-sm">جارٍ التحقّق من الرابط…</p></div>
      ) : done ? (
        <div className="py-6 text-center">
          <span className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-emerald-500 text-white"><Check size={30} /></span>
          <p className="text-lg font-extrabold text-ink">تم تحديث كلمة المرور</p>
          <p className="mt-1 text-sm text-ink-soft">سيتم تحويلك لتسجيل الدخول الآن.</p>
        </div>
      ) : !ready ? (
        <div className="py-4 text-center">
          <span className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-amber-100 text-amber-600"><ShieldAlert size={30} /></span>
          <p className="font-extrabold text-ink">الرابط غير صالح أو منتهي</p>
          <p className="mt-1 text-sm text-ink-soft">اطلب رابطاً جديداً لإعادة تعيين كلمة المرور.</p>
          <Link href="/forgot-password" className="mt-5 inline-flex rounded-xl bg-gold-gradient px-5 py-2.5 text-sm font-bold text-white shadow-gold">طلب رابط جديد</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
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
    </AuthShell>
  );
}
