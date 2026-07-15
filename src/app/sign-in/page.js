'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import AuthShell from '@/components/AuthShell';
import GoogleSignInButton from '@/components/GoogleSignInButton';

const SID_KEY = 'jazira_session_id_v1';
const field =
  'w-full rounded-xl border border-white/40 bg-white/60 px-4 py-2.5 text-ink placeholder-ink-muted focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20';

export default function SignInPage() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [next, setNext] = useState('/dashboard');
  const [revoked, setRevoked] = useState(false);

  // Read ?next= / ?reason= without useSearchParams (no Suspense dep).
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const n = p.get('next');
      if (n && n.startsWith('/')) setNext(n);
      if (p.get('reason') === 'revoked') setRevoked(true);
    } catch {}
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await signIn(email, password);
    if (result.success) {
      try { localStorage.removeItem(SID_KEY); } catch {}
      router.refresh();
      router.push(next);
    } else {
      setError(result.error || 'حدث خطأ أثناء تسجيل الدخول');
    }
    setLoading(false);
  };

  return (
    <AuthShell
      title="تسجيل الدخول"
      subtitle="استخدم بيانات حسابك للدخول إلى منصة جزيرة"
      footer={<>بالدخول أنت توافق على <Link href="/terms" className="font-semibold text-gold hover:underline">شروط الخدمة</Link> و<Link href="/privacy" className="font-semibold text-gold hover:underline">سياسة الخصوصية</Link></>}
    >
      {revoked && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          تم تسجيل خروجك من هذا الجهاز. سجّل الدخول مرة أخرى للمتابعة.
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-ink">البريد الإلكتروني</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="example@email.com" dir="ltr" className={field} />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-ink">كلمة المرور</label>
            <Link href="/forgot-password" className="text-xs font-semibold text-gold hover:underline">نسيت كلمة المرور؟</Link>
          </div>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" className={field} />
        </div>
        <button type="submit" disabled={loading} className="w-full rounded-xl bg-gold-gradient px-4 py-2.5 font-semibold text-white shadow-gold transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50">
          {loading ? 'جاري تسجيل الدخول…' : 'تسجيل الدخول'}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <span className="flex-1 border-t border-white/40" />
        <span className="text-xs text-ink-soft">أو</span>
        <span className="flex-1 border-t border-white/40" />
      </div>

      <GoogleSignInButton redirectTo={next} />

      <p className="mt-6 border-t border-white/30 pt-6 text-center text-sm text-ink-soft">
        ليس لديك حساب؟{' '}
        <Link href="/sign-up" className="font-semibold text-gold hover:underline">إنشاء حساب جديد</Link>
      </p>
    </AuthShell>
  );
}
