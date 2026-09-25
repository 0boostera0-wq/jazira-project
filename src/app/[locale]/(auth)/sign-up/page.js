'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { validateFullName } from '@/lib/profile';
import AuthShell from '@/components/AuthShell';
import GoogleSignInButton from '@/components/GoogleSignInButton';

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

const field =
  'w-full rounded-xl border border-white/40 bg-white/60 px-4 py-2.5 text-ink placeholder-ink-muted focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20';

export default function SignUpPage() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };
  const handlePhoneChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 9);
    setFormData((prev) => ({ ...prev, phone: digits }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const nameCheck = validateFullName(formData.name);
    if (!nameCheck.ok) { setError(nameCheck.error); return; }
    if (formData.phone && formData.phone.length !== 9) { setError('رقم الجوال يجب أن يتكون من 9 أرقام'); return; }
    if (formData.password.length < 6) { setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return; }
    if (formData.password !== formData.confirmPassword) { setError('كلمتا المرور غير متطابقتين'); return; }

    setLoading(true);
    const result = await signUp(
      formData.email,
      formData.password,
      nameCheck.value,
      nameCheck.value,
      formData.phone ? `+966${formData.phone}` : null,
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
    <AuthShell
      title="إنشاء حساب جديد"
      subtitle="انضم إلى منصة جزيرة التعليمية الآن"
      footer={<>بالتسجيل أنت توافق على <Link href="/terms" className="font-semibold text-gold hover:underline">شروط الخدمة</Link> و<Link href="/privacy" className="font-semibold text-gold hover:underline">سياسة الخصوصية</Link></>}
    >
      <GoogleSignInButton />

      <div className="my-5 flex items-center gap-3">
        <span className="flex-1 border-t border-white/40" />
        <span className="text-xs text-ink-soft">أو أنشئ حساباً بالبريد الإلكتروني</span>
        <span className="flex-1 border-t border-white/40" />
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-ink">الاسم</label>
          <input type="text" name="name" value={formData.name} onChange={handleChange} required placeholder="مثال عبدالله محمد (اسمان فقط)" className={field} />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-ink">البريد الإلكتروني</label>
          <input type="email" name="email" value={formData.email} onChange={handleChange} required placeholder="example@email.com" dir="ltr" className={field} />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-ink">رقم الجوال (اختياري)</label>
          <div className="flex" dir="ltr">
            <span className="flex flex-shrink-0 select-none items-center justify-center rounded-r-xl border border-white/40 bg-white/40 px-3 py-2.5 text-sm font-semibold text-ink">+966</span>
            <input type="tel" inputMode="numeric" name="phone" value={formData.phone} onChange={handlePhoneChange} maxLength={9} placeholder="5XXXXXXXX" className="flex-1 rounded-l-xl border border-r-0 border-white/40 bg-white/60 px-4 py-2.5 text-ink placeholder-ink-muted focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20" />
          </div>
          <p className="mt-1.5 text-xs text-ink-muted">9 أرقام بدون رمز الدولة</p>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-ink">كلمة المرور</label>
          <input type="password" name="password" value={formData.password} onChange={handleChange} required placeholder="6 أحرف على الأقل" className={field} />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-ink">تأكيد كلمة المرور</label>
          <input type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} required placeholder="أعد كتابة كلمة المرور" className={field} />
        </div>
        <button type="submit" disabled={loading} className="w-full rounded-xl bg-gold-gradient px-4 py-2.5 font-semibold text-white shadow-gold transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50">
          {loading ? 'جاري إنشاء الحساب…' : 'إنشاء الحساب'}
        </button>
      </form>

      <p className="mt-6 border-t border-white/30 pt-6 text-center text-sm text-ink-soft">
        لديك حساب بالفعل؟{' '}
        <Link href="/sign-in" className="font-semibold text-gold hover:underline">تسجيل الدخول</Link>
      </p>
    </AuthShell>
  );
}
