"use client";

import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { isClerkEnabled } from "@/lib/authConfig";
import { BRAND } from "@/lib/constants";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <Link href="/" className="mb-6 flex items-center gap-2 text-2xl font-extrabold">
        <span>{BRAND.emoji}</span>
        <span className="gold-text">{BRAND.name}</span>
      </Link>

      {isClerkEnabled ? (
        <SignUp
          afterSignUpUrl="/dashboard"
          appearance={{
            elements: {
              card: "shadow-glass-lg",
              formButtonPrimary: "bg-gold-gradient hover:opacity-90",
            },
          }}
        />
      ) : (
        <div className="glass-strong w-full max-w-md rounded-3xl p-8 text-center">
          <h1 className="text-xl font-extrabold text-ink">إنشاء حساب جديد</h1>
          <p className="mt-3 text-sm text-ink-soft">
            المنصة في <b>الوضع التجريبي</b>. أضِف مفاتيح Clerk في
            <code className="mx-1 rounded bg-white/70 px-1.5 py-0.5 text-xs">.env.local</code>
            لتفعيل التسجيل عبر Google وApple ورقم الجوال.
          </p>
          <Link href="/dashboard" className="btn-gold mt-6 inline-block">
            المتابعة كزائر إلى المنصة
          </Link>
        </div>
      )}
    </div>
  );
}
