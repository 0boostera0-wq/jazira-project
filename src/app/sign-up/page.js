'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { BRAND } from '@/lib/constants';

export default function SignUpPage() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [formData, setFormData] = useState({
    fullName: '',
    age: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    username: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!formData.fullName.trim()) {
      setError('الاسم الكامل مطلوب');
      return;
    }

    if (!formData.age || formData.age < 10 || formData.age > 100) {
      setError('العمر يجب أن يكون بين 10 و 100');
      return;
    }

    if (!formData.phone.trim() || formData.phone.length < 9) {
      setError('رقم الهاتف غير صحيح');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('كلمات المرور غير متطابقة');
      return;
    }

    if (formData.password.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }

    if (!formData.username || formData.username.length < 3) {
      setError('اسم المستخدم يجب أن يكون 3 أحرف على الأقل');
      return;
    }

    setLoading(true);

    const result = await signUp(
      formData.email,
      formData.password,
      formData.username,
      formData.fullName
    );

    if (result.success) {
      router.push('/auth/verify-email');
    } else {
      setError(result.error || 'حدث خطأ أثناء إنشاء الحساب');
    }

    setLoading(false);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12 bg-gradient-to-br from-cream to-white">
      <Link href="/" className="mb-8 flex items-center gap-3">
        <span className="text-4xl">{BRAND.emoji}</span>
        <span className="text-3xl font-bold bg-gradient-to-r from-gold to-champagne bg-clip-text text-transparent">
          {BRAND.name}
        </span>
      </Link>

      <div className="glass-strong w-full max-w-md rounded-3xl border border-white/20 p-8 shadow-lg">
        <h1 className="text-2xl font-bold text-ink mb-2">إنشاء حساب جديد</h1>
        <p className="text-sm text-ink-soft mb-6">
          انضم إلى منصة جزيرة التعليمية الآن
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-100 p-3 text-sm text-red-700 border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Full Name */}
          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              الاسم الكامل
            </label>
            <input
              type="text"
              name="fullName"
              value={formData.fullName}
              onChange={handleChange}
              required
              placeholder="الاسم الكامل"
              className="w-full rounded-lg border border-white/30 bg-white/50 px-4 py-2.5 text-ink placeholder-ink-soft focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
            />
          </div>

          {/* Age */}
          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              العمر
            </label>
            <input
              type="number"
              name="age"
              value={formData.age}
              onChange={handleChange}
              required
              min="10"
              max="100"
              placeholder="العمر"
              className="w-full rounded-lg border border-white/30 bg-white/50 px-4 py-2.5 text-ink placeholder-ink-soft focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              البريد الإلكتروني
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              placeholder="البريد الإلكتروني"
              className="w-full rounded-lg border border-white/30 bg-white/50 px-4 py-2.5 text-ink placeholder-ink-soft focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              رقم الهاتف
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              required
              placeholder="رقم الهاتف"
              className="w-full rounded-lg border border-white/30 bg-white/50 px-4 py-2.5 text-ink placeholder-ink-soft focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
            />
          </div>

          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              اسم المستخدم
            </label>
            <input
              type="text"
              name="username"
              value={formData.username}
              onChange={handleChange}
              required
              placeholder="اسم المستخدم"
              className="w-full rounded-lg border border-white/30 bg-white/50 px-4 py-2.5 text-ink placeholder-ink-soft focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              كلمة المرور
            </label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              placeholder="كلمة المرور"
              className="w-full rounded-lg border border-white/30 bg-white/50 px-4 py-2.5 text-ink placeholder-ink-soft focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
            />
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              تأكيد كلمة المرور
            </label>
            <input
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              placeholder="تأكيد كلمة المرور"
              className="w-full rounded-lg border border-white/30 bg-white/50 px-4 py-2.5 text-ink placeholder-ink-soft focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-gradient-to-r from-gold to-champagne px-4 py-2.5 font-semibold text-white transition-all hover:shadow-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'جاري إنشاء الحساب...' : 'إنشاء الحساب'}
          </button>
        </form>

        {/* Social Login Section */}
        <div className="mt-6 border-t border-white/20 pt-6">
          <p className="text-center text-xs text-ink-soft mb-4">أو سجّل عبر:</p>
          <div className="space-y-3">
            <button
              disabled
              title="سيتم تفعيل هذه الطريقة قريباً"
              className="w-full rounded-lg border border-white/30 bg-white/30 px-4 py-2.5 font-medium text-ink transition hover:bg-white/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <span>📱</span>
              التسجيل عبر Google
            </button>
            <button
              disabled
              title="سيتم تفعيل هذه الطريقة قريباً"
              className="w-full rounded-lg border border-white/30 bg-white/30 px-4 py-2.5 font-medium text-ink transition hover:bg-white/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <span>🍎</span>
              التسجيل عبر Apple
            </button>
          </div>
          <p className="text-center text-xs text-ink-soft mt-4">
            سيتم تفعيل هذه الطرق قريباً
          </p>
        </div>

        {/* Sign In Link */}
        <div className="mt-6 border-t border-white/20 pt-6">
          <p className="text-center text-sm text-ink-soft">
            لديك حساب بالفعل؟{' '}
            <Link
              href="/sign-in"
              className="font-semibold text-gold hover:text-champagne transition"
            >
              تسجيل الدخول
            </Link>
          </p>
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-ink-soft">
        بالتسجيل، أنت توافق على{' '}
        <Link href="/terms" className="text-gold hover:underline">
          شروط الخدمة
        </Link>
      </p>
    </div>
  );
}
