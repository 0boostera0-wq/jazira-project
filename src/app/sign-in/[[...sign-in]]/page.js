"use client";

import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { isClerkEnabled } from "@/lib/authConfig";
import { BRAND } from "@/lib/constants";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <Link href="/" className="mb-6 flex items-center gap-2 text-2xl font-extrabold">
        <span>{BRAND.emoji}</span>
        <span className="gold-text">{BRAND.name}</span>
      </Link>

      {isClerkEnabled ? (
        <SignIn
          afterSignInUrl="/dashboard"
          appearance={{
            elements: {
              card: "shadow-glass-lg",
              formButtonPrimary: "bg-gold-gradient hover:opacity-90",
            },
          }}
        />
      ) : (
        <DemoAuthNotice mode="دخول" />
      )}
    </div>
  );
}

function DemoAuthNotice({ mode }) {
  return (
    <div className="glass-strong w-full max-w-md rounded-3xl p-8 text-center">
      <h1 className="text-xl font-extrabold text-ink">تسجيل ال{mode}</h1>
      <p className="mt-3 text-sm text-ink-soft">
        المنصة تعمل حاليًا في <b>الوضع التجريبي</b> لأن مفاتيح Clerk غير مُعدّة بعد.
        لتفعيل تسجيل الدخول عبر Google وApple ورقم الجوال، أضِف مفاتيح Clerk في ملف
        <code className="mx-1 rounded bg-white/70 px-1.5 py-0.5 text-xs">.env.local</code>.
      </p>
      <Link href="/dashboard" className="btn-gold mt-6 inline-block">
        المتابعة كزائر إلى المنصة
      </Link>
    </div>
  );
}
