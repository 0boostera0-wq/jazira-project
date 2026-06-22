'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-client';
import { BRAND } from '@/lib/constants';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;

export default function VerifyEmailPage() {
  const router = useRouter();
  const supabase = createClient();

  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [canResend, setCanResend] = useState(false);
  const [countdown, setCountdown] = useState(RESEND_COOLDOWN);

  // Get email from session or localStorage
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    const getEmail = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        setUserEmail(user.email);
      }
    };
    getEmail();
  }, [supabase]);

  // Countdown timer for resend
  useEffect(() => {
    if (!canResend && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
    if (countdown === 0) {
      setCanResend(true);
    }
  }, [countdown, canResend]);

  const handleOtpChange = (value, index) => {
    if (!/^\d?$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < OTP_LENGTH - 1) {
      const nextInput = document.getElementById(`otp-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleBackspace = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      const prevInput = document.getElementById(`otp-${index - 1}`);
      prevInput?.focus();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    const otpCode = otp.join('');
    if (otpCode.length !== OTP_LENGTH) {
      setError('يرجى إدخال الرمز كاملاً');
      return;
    }

    setLoading(true);

    try {
      // Verify OTP with Supabase
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: userEmail,
        token: otpCode,
        type: 'email',
      });

      if (verifyError) {
        setError('الرمز غير صحيح أو انتهت صلاحيته');
        return;
      }

      setMessage('تم التحقق بنجاح! جاري التوجيه...');
      setTimeout(() => router.push('/dashboard'), 2000);
    } catch (err) {
      setError('حدث خطأ أثناء التحقق');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setMessage('');
    setCanResend(false);
    setCountdown(RESEND_COOLDOWN);

    try {
      const { error } = await supabase.auth.resendIdentityConfirmationLink({
        email: userEmail,
        type: 'email_link',
      });

      if (error) {
        setError('حدث خطأ أثناء إعادة الإرسال');
        setCanResend(true);
        return;
      }

      setMessage('تم إعادة إرسال الرمز. تحقق من بريدك الإلكتروني');
    } catch (err) {
      setError('حدث خطأ أثناء إعادة الإرسال');
      setCanResend(true);
    }
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
        <h1 className="text-2xl font-bold text-ink mb-2">تحقق من بريدك الإلكتروني</h1>
        <p className="text-sm text-ink-soft mb-6">
          تم إرسال رمز التحقق إلى {userEmail || 'بريدك الإلكتروني'}
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-100 p-3 text-sm text-red-700 border border-red-200">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-4 rounded-lg bg-green-100 p-3 text-sm text-green-700 border border-green-200">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* OTP Input Boxes */}
          <div className="flex justify-center gap-2">
            {otp.map((digit, index) => (
              <input
                key={index}
                id={`otp-${index}`}
                type="text"
                maxLength="1"
                value={digit}
                onChange={(e) => handleOtpChange(e.target.value, index)}
                onKeyDown={(e) => handleBackspace(index, e)}
                disabled={loading}
                className="h-14 w-12 rounded-lg border-2 border-white/40 bg-white/50 text-center text-xl font-bold text-ink focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 disabled:opacity-50"
              />
            ))}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || otp.join('').length !== OTP_LENGTH}
            className="w-full rounded-lg bg-gradient-to-r from-gold to-champagne px-4 py-2.5 font-semibold text-white transition-all hover:shadow-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'جاري التحقق...' : 'تحقق من الرمز'}
          </button>
        </form>

        {/* Resend Button */}
        <div className="mt-6 border-t border-white/20 pt-6 text-center">
          <p className="text-sm text-ink-soft mb-3">لم تستقبل الرمز؟</p>
          <button
            onClick={handleResend}
            disabled={!canResend || loading}
            className="text-sm font-semibold text-gold hover:text-champagne transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {canResend ? 'إعادة الإرسال' : `إعادة الإرسال بعد ${countdown}s`}
          </button>
        </div>

        {/* Help */}
        <div className="mt-4 text-center text-xs text-ink-soft">
          <p>تحقق من مجلد البريد العشوائي إذا لم تجد الرسالة</p>
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-ink-soft">
        <Link href="/sign-in" className="text-gold hover:underline">
          العودة إلى تسجيل الدخول
        </Link>
      </p>
    </div>
  );
}
