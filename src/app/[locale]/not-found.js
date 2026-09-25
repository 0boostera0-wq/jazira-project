import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <span className="text-7xl">🏝️</span>
      <h1 className="mt-4 text-3xl font-extrabold gold-text">٤٠٤</h1>
      <p className="mt-2 text-ink-soft">عذراً الصفحة التي تبحث عنها غير موجودة.</p>
      <Link href="/dashboard" className="btn-gold mt-6">
        العودة إلى لوحة التحكم
      </Link>
    </div>
  );
}
