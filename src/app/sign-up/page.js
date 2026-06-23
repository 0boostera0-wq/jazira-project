'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import BrandLogo from '@/components/BrandLogo';
import GoogleSignInButton from '@/components/GoogleSignInButton';

// Map Supabase/network errors to friendly Arabic messages
function arabicError(msg) {
  if (!msg) return 'حدث خطأ أثناء إنشاء الحساب';
  const m = msg.toLowerCase();
  if (m.includes('already registered') || m.includes('already exists') || m.includes('unique'))
    return 'البريد الإلكتروني مسجل مسبقاً. يرجى تسجيل الدخول.';
  if (m.includes('invalid email')) return 'البريد الإلكتروني غير صالح';
  if (m.includes('password') && m.includes('short')) return 'كلمة المرور قصيرة جداً';
  if (m.includes('network') || m.includes('fetch')) return 'تحقق من اتصالك بالإنترنت';
  return 'حدث خطأ أثناء إنشاء الحساب. حاول مجدداً.';
}

export default function SignUpPage() {
  const router = useRouter();
  const { signUp } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',      // 9 digits only (without +966)
    password: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Strip non-digits and cap at 9 characters
  const handlePhoneChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 9);
    setFormData((prev) => ({ ...prev, phone: digits }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate الاسم
    if (!formData.name.trim()) {
      setError('الاسم مطلوب');
      return;
    }
    if (formData.name.trim().length < 2) {
      setError('الاسم يجب أن يكون حرفين على الأقل');
      return;
    }

    // Validate phone — exactly 9 digits
    if (formData.phone.length < 9) {
      setError('رقم الجوال يجب أن يتكون من 9 أرقام');
      return;
    }
    if (formData.phone.length > 9) {
      setError('رقم الجوال يجب أن يتكون من 9 أرقام فقط');
      return;
    }

    // Validate password
    if (formData.password.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('كلمتا المرور غير متطابقتين');
      return;
    }

    setLoading(true);

    // Use name as both username and full_name; store full phone with country code
    const result = await signUp(
      formData.email,
      formData.password,
      formData.name.trim(),       // username
      formData.name.trim(),       // full_name
      `+966${formData.phone}`,    // phone with country code
    );

    if (result.success) {
      sessionStorage.setItem('otp_email', formData.email);
      router.push('/auth/verify-email');
    } else {
      setError(arabicError(result.error));
    }

    setLoading(false);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12 bg-gradient-to-br from-cream to-white">
      <Link href="/" className="mb-8">
        <BrandLogo size="lg" />
      </Link>

      <div className="glass-strong w-full max-w-md rounded-3xl border border-white/20 p-8 shadow-lg">
        <h1 className="text-2xl font-bold text-ink mb-2">إنشاء حساب جديد</h1>
        <p className="text-sm text-ink-soft mb-6">انضم إلى منصة جزيرة التعليمية الآن</p>

        {/* Google OAuth — fastest path */}
        <GoogleSignInButton />

        {/* Divider */}
        <div className="my-5 flex items-center gap-3">
          <span className="flex-1 border-t border-white/30" />
          <span className="text-xs text-ink-soft">أو أنشئ حساباً بالبريد الإلكتروني</span>
          <span className="flex-1 border-t border-white/30" />
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* الاسم */}
          <div>
            <label className="block text-sm font-medium text-ink mb-2">الاسم</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              placeholder="اسمك الكامل"
              className="w-full rounded-xl border border-white/30 bg-white/50 px-4 py-2.5 text-ink placeholder-ink-soft focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
            />
          </div>

          {/* البريد الإلكتروني */}
          <div>
            <label className="block text-sm font-medium text-ink mb-2">البريد الإلكتروني</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              placeholder="example@email.com"
              dir="ltr"
              className="w-full rounded-xl border border-white/30 bg-white/50 px-4 py-2.5 text-ink placeholder-ink-soft focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
            />
          </div>

          {/* رقم الجوال — Saudi format */}
          <div>
            <label className="block text-sm font-medium text-ink mb-2">رقم الجوال</label>
            <div className="flex" dir="ltr">
              {/* Fixed country code */}
              <span className="flex items-center justify-center rounded-r-xl border border-white/30 bg-white/30 px-3 py-2.5 text-sm font-semibold text-ink select-none flex-shrink-0">
                +966
              </span>
              {/* 9-digit local number */}
              <input
                type="tel"
                inputMode="numeric"
                name="phone"
                value={formData.phone}
                onChange={handlePhoneChange}
                maxLength={9}
                placeholder="5XXXXXXXX"
                className="flex-1 rounded-l-xl border border-white/30 border-r-0 bg-white/50 px-4 py-2.5 text-ink placeholder-ink-soft focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
              />
            </div>
            <p className="mt-1.5 text-xs text-ink-muted">9 أرقام بدون رمز الدولة</p>
          </div>

          {/* كلمة المرور */}
          <div>
            <label className="block text-sm font-medium text-ink mb-2">كلمة المرور</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              placeholder="6 أحرف على الأقل"
              className="w-full rounded-xl border border-white/30 bg-white/50 px-4 py-2.5 text-ink placeholder-ink-soft focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
            />
          </div>

          {/* تأكيد كلمة المرور */}
          <div>
            <label className="block text-sm font-medium text-ink mb-2">تأكيد كلمة المرور</label>
            <input
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              placeholder="أعد كتابة كلمة المرور"
              className="w-full rounded-xl border border-white/30 bg-white/50 px-4 py-2.5 text-ink placeholder-ink-soft focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-gradient-to-r from-gold to-champagne px-4 py-2.5 font-semibold text-white transition-all hover:shadow-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'جاري إنشاء الحساب...' : 'إنشاء الحساب'}
          </button>
        </form>

        <div className="mt-6 border-t border-white/20 pt-6">
          <p className="text-center text-sm text-ink-soft">
            لديك حساب بالفعل؟{' '}
            <Link href="/sign-in" className="font-semibold text-gold hover:text-champagne transition">
              تسجيل الدخول
            </Link>
          </p>
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-ink-soft">
        بالتسجيل، أنت توافق على{' '}
        <Link href="/terms" className="text-gold hover:underline">شروط الخدمة</Link>
      </p>
    </div>
  );
}
