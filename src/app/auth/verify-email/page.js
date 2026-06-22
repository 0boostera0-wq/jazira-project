'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase-client';
import BrandLogo from '@/components/BrandLogo';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;

export default function VerifyEmailPage() {
  const router = useRouter();
  const supabase = createClient();
  const inputRefs = useRef([]);

  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [countdown, setCountdown] = useState(RESEND_COOLDOWN);
  const [userEmail, setUserEmail] = useState('');

  // Read email saved by sign-up page; fall back to active session
  useEffect(() => {
    const stored = sessionStorage.getItem('otp_email');
    if (stored) {
      setUserEmail(stored);
      return;
    }
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setUserEmail(user.email);
    });
  }, [supabase]);

  // Auto-focus first box on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Countdown for resend button
  useEffect(() => {
    if (countdown <= 0) return;
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  const updateDigits = (newDigits) => {
    setDigits(newDigits);
    setError('');
  };

  const handleChange = (index, e) => {
    // Strip non-digits; on mobile keyboards sometimes multiple chars arrive
    const val = e.target.value.replace(/\D/g, '');
    if (!val) {
      const next = [...digits];
      next[index] = '';
      updateDigits(next);
      return;
    }
    const char = val.slice(-1);
    const next = [...digits];
    next[index] = char;
    updateDigits(next);
    if (index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        const next = [...digits];
        next[index] = '';
        updateDigits(next);
      } else if (index > 0) {
        const next = [...digits];
        next[index - 1] = '';
        updateDigits(next);
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft') {
      if (index < OTP_LENGTH - 1) inputRefs.current[index + 1]?.focus();
    } else if (e.key === 'ArrowRight') {
      if (index > 0) inputRefs.current[index - 1]?.focus();
    }
  };

  // Paste: distribute digits across all boxes
  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;
    const next = Array(OTP_LENGTH).fill('');
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    updateDigits(next);
    const focusIdx = Math.min(pasted.length, OTP_LENGTH - 1);
    inputRefs.current[focusIdx]?.focus();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const code = digits.join('');
    if (code.length !== OTP_LENGTH) {
      setError('يرجى إدخال الرمز المكوّن من 6 أرقام كاملاً');
      return;
    }
    if (!userEmail) {
      setError('البريد الإلكتروني غير موجود، يرجى التسجيل مجدداً');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: userEmail,
        token: code,
        type: 'email',
      });

      if (verifyError) {
        setError('الرمز غير صحيح أو انتهت صلاحيته. يرجى طلب رمز جديد.');
        setDigits(Array(OTP_LENGTH).fill(''));
        setTimeout(() => inputRefs.current[0]?.focus(), 50);
        return;
      }

      sessionStorage.removeItem('otp_email');
      setSuccess('تم التحقق بنجاح! جاري التوجيه إلى لوحة التحكم...');
      setTimeout(() => router.push('/dashboard'), 1500);
    } catch {
      setError('حدث خطأ غير متوقع، يرجى المحاولة مجدداً');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0 || !userEmail) return;
    setError('');
    setSuccess('');

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: userEmail,
      });

      if (resendError) {
        setError('تعذّر إعادة الإرسال: ' + resendError.message);
        return;
      }

      setSuccess('تم إرسال رمز جديد، تحقق من بريدك الإلكتروني');
      setCountdown(RESEND_COOLDOWN);
      setDigits(Array(OTP_LENGTH).fill(''));
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    } catch {
      setError('حدث خطأ أثناء إعادة الإرسال');
    }
  };

  const isFull = digits.join('').length === OTP_LENGTH;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12 bg-gradient-to-br from-cream to-white">
      <Link href="/" className="mb-8">
        <BrandLogo size="lg" />
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="glass-strong w-full max-w-md rounded-3xl border border-white/20 p-8 shadow-lg"
      >
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-gold to-champagne text-3xl">
            📧
          </div>
          <h1 className="text-2xl font-bold text-ink mb-2">تحقق من بريدك الإلكتروني</h1>
          <p className="text-sm text-ink-soft">
            أرسلنا رمز التحقق المكوّن من 6 أرقام إلى
          </p>
          {userEmail && (
            <p className="mt-1 font-semibold text-gold ltr-nums break-all text-sm">
              {userEmail}
            </p>
          )}
        </div>

        {/* Alerts */}
        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              key="error"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 overflow-hidden rounded-xl bg-red-50 p-3 text-sm text-red-700 border border-red-200"
            >
              {error}
            </motion.div>
          )}
          {success && (
            <motion.div
              key="success"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 overflow-hidden rounded-xl bg-green-50 p-3 text-sm text-green-700 border border-green-200"
            >
              {success}
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* OTP boxes — always LTR so box 0 is leftmost */}
          <div dir="ltr" className="flex justify-center gap-2">
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(el) => (inputRefs.current[index] = el)}
                id={`otp-${index}`}
                type="text"
                inputMode="numeric"
                pattern="\d*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(index, e)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={handlePaste}
                disabled={loading}
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                className={[
                  'h-14 w-12 rounded-xl border-2 bg-white/70 text-center text-2xl font-bold text-ink',
                  'transition-all duration-150 focus:outline-none disabled:opacity-50',
                  digit
                    ? 'border-gold shadow-[0_0_0_3px_rgba(201,162,39,0.15)]'
                    : 'border-white/40',
                  'focus:border-gold focus:shadow-[0_0_0_3px_rgba(201,162,39,0.2)]',
                ].join(' ')}
              />
            ))}
          </div>

          <button
            type="submit"
            disabled={loading || !isFull}
            className="w-full rounded-xl bg-gradient-to-r from-gold to-champagne px-4 py-3 font-semibold text-white transition-all hover:shadow-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                جاري التحقق...
              </span>
            ) : (
              'تحقق من الرمز'
            )}
          </button>
        </form>

        {/* Resend */}
        <div className="mt-6 border-t border-white/20 pt-6 text-center">
          <p className="text-sm text-ink-soft mb-3">لم تستقبل الرمز؟</p>
          <button
            type="button"
            onClick={handleResend}
            disabled={countdown > 0 || loading}
            className="text-sm font-semibold text-gold hover:text-champagne transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {countdown > 0
              ? `إعادة الإرسال بعد ${countdown} ثانية`
              : 'إعادة إرسال الرمز'}
          </button>
          <p className="mt-3 text-xs text-ink-soft">
            تحقق من مجلد البريد العشوائي إذا لم تجد الرسالة
          </p>
        </div>
      </motion.div>

      <p className="mt-8 text-center text-xs text-ink-soft">
        <Link href="/sign-in" className="text-gold hover:underline">
          العودة إلى تسجيل الدخول
        </Link>
      </p>
    </div>
  );
}
