'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import BrandLogo from '@/components/BrandLogo';
import GoogleSignInButton from '@/components/GoogleSignInButton';

const SID_KEY = 'jazira_session_id_v1';

export default function SignInPage() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [next, setNext] = useState('/dashboard');
  const [revoked, setRevoked] = useState(false);

  // Read ?next= / ?reason= from the URL without useSearchParams (no Suspense dep).
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
      // Rotate the local session id so a previously-revoked device gets a clean one.
      try { localStorage.removeItem(SID_KEY); } catch {}
      // Refresh so server components & auth-aware UI pick up the new session
      router.refresh();
      router.push(next);
    } else {
      setError(result.error || 'حدث خطأ أثناء تسجيل الدخول');
    }

    setLoading(false);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12 bg-gradient-to-br from-cream to-white">
      <Link href="/" className="mb-8">
        <BrandLogo size="lg" />
      </Link>

      <div className="glass-strong w-full max-w-md rounded-3xl border border-white/20 p-8 shadow-lg">
        <h1 className="text-2xl font-bold text-ink mb-2">تسجيل الدخول</h1>
        <p className="text-sm text-ink-soft mb-6">
          استخدم بيانات حسابك للدخول إلى منصة جزيرة
        </p>

        {revoked && (
          <div className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 border border-amber-200">
            تم تسجيل خروجك من هذا الجهاز. سجّل الدخول مرة أخرى للمتابعة.
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              البريد الإلكتروني
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="example@email.com"
              dir="ltr"
              className="w-full rounded-xl border border-white/30 bg-white/50 px-4 py-2.5 text-ink placeholder-ink-soft focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              كلمة المرور
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full rounded-xl border border-white/30 bg-white/50 px-4 py-2.5 text-ink placeholder-ink-soft focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-gradient-to-r from-gold to-champagne px-4 py-2.5 font-semibold text-white transition-all hover:shadow-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}
          </button>
        </form>

        {/* Divider */}
        <div className="my-6 flex items-center gap-3">
          <span className="flex-1 border-t border-white/30" />
          <span className="text-xs text-ink-soft">أو</span>
          <span className="flex-1 border-t border-white/30" />
        </div>

        {/* Google OAuth */}
        <GoogleSignInButton redirectTo={next} />

        <div className="mt-6 border-t border-white/20 pt-6 space-y-3">
          <p className="text-center text-sm text-ink-soft">
            ليس لديك حساب؟{' '}
            <Link
              href="/sign-up"
              className="font-semibold text-gold hover:text-champagne transition"
            >
              إنشاء حساب جديد
            </Link>
          </p>
          <p className="text-center">
            <button
              type="button"
              className="text-sm text-ink-soft hover:text-ink transition"
            >
              هل نسيت كلمة المرور؟
            </button>
          </p>
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-ink-soft">
        بالدخول، أنت توافق على{' '}
        <Link href="/terms" className="text-gold hover:underline">
          شروط الخدمة
        </Link>
      </p>
    </div>
  );
}
